import { encodeCanvasToAvifBlob, isAvifSupportedInEnvironment } from './avifEncoder';
import {
  computeCenterCropRect,
  getOutputFilename,
  isHeicFile,
  parseSvgDimensions,
} from './formatUtils';
import { optimizeImageToTargetSize } from './imageTargetSize';
import type { ImageWorkerRequest, ImageWorkerResponse } from './imageWorker';
import {
  ConversionCanceledError,
  ConversionResult,
  ImageConversionOptions,
  ImageOutputFormat,
  RotationDegrees,
  throwIfAborted,
} from './types';

type RasterFormat = Exclude<ImageOutputFormat, 'pdf'>;

const MIME_MAP: Record<RasterFormat, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  png: 'image/png',
  avif: 'image/avif',
};

let avifSupportCache: boolean | null = null;
let sharedImageWorker: Worker | null = null;

function getImageWorker(): Worker | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    return null;
  }
  if (!sharedImageWorker) {
    try {
      sharedImageWorker = new Worker(new URL('./imageWorker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      return null;
    }
  }
  return sharedImageWorker;
}

async function runImageWorker(
  blob: Blob,
  options: ImageConversionOptions,
  targetFormat: RasterFormat,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<{ blob: Blob; width: number; height: number; targetMet?: boolean }> {
  throwIfAborted(signal);
  const worker = getImageWorker();
  if (!worker) {
    throw new Error('OffscreenCanvas worker unavailable.');
  }

  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      worker.postMessage({ type: 'cancel', jobId } satisfies ImageWorkerRequest);
      cleanup();
      reject(new ConversionCanceledError());
    };

    const onMessage = (event: MessageEvent<ImageWorkerResponse>) => {
      const data = event.data;
      if (!data || data.jobId !== jobId) return;
      if (data.type === 'progress') {
        onProgress?.(data.progress);
      } else if (data.type === 'result') {
        cleanup();
        resolve({
          blob: data.blob,
          width: data.width,
          height: data.height,
          targetMet: data.targetMet,
        });
      } else if (data.type === 'error') {
        cleanup();
        if (data.canceled) {
          reject(new ConversionCanceledError());
        } else {
          reject(new Error(data.message));
        }
      }
    };

    const onError = (err: ErrorEvent) => {
      cleanup();
      sharedImageWorker = null;
      reject(new Error(err.message || 'Image worker error.'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({
      type: 'convert',
      jobId,
      blob,
      options,
      targetFormat,
    } satisfies ImageWorkerRequest);
  });
}

export async function isAvifEncodingSupported(): Promise<boolean> {
  if (avifSupportCache !== null) return avifSupportCache;
  avifSupportCache = await isAvifSupportedInEnvironment();
  return avifSupportCache;
}

export async function decodeInputImageBlob(file: File): Promise<Blob> {
  if (!isHeicFile(file)) {
    return file;
  }

  const { default: heic2any } = await import('heic2any');
  const converted = await heic2any({
    blob: file,
    toType: 'image/png',
    quality: 0.95,
  });

  if (Array.isArray(converted)) {
    return converted[0];
  }
  return converted;
}

async function loadDrawableImage(
  file: File,
  signal?: AbortSignal,
): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  throwIfAborted(signal);
  const sourceBlob = await decodeInputImageBlob(file);
  throwIfAborted(signal);
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');

  if (!isSvg && typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(sourceBlob);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  }

  let svgDims: { width: number; height: number } | null = null;
  if (isSvg) {
    try {
      svgDims = parseSvgDimensions(await file.text());
    } catch {
      svgDims = null;
    }
    throwIfAborted(signal);
  }

  const url = URL.createObjectURL(sourceBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode image file.'));
      el.src = url;
    });
    const width = svgDims?.width || img.naturalWidth || img.width || 1024;
    const height = svgDims?.height || img.naturalHeight || img.height || 1024;
    return {
      source: img,
      width,
      height,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function rotateSourceToCanvas(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  rotationDeg: RotationDegrees,
): { canvas: HTMLCanvasElement; width: number; height: number } {
  const swap = rotationDeg === 90 || rotationDeg === 270;
  const outW = swap ? srcHeight : srcWidth;
  const outH = swap ? srcWidth : srcHeight;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize 2D rotation context.');
  }

  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.drawImage(source, -srcWidth / 2, -srcHeight / 2, srcWidth, srcHeight);
  return { canvas, width: outW, height: outH };
}

async function renderToBlob(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  targetWidth: number,
  targetHeight: number,
  format: RasterFormat,
  quality: number,
): Promise<Blob> {
  const mimeType = MIME_MAP[format];
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(targetWidth));
  canvas.height = Math.max(1, Math.round(targetHeight));

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize 2D canvas context.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (format === 'jpg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  if (format === 'avif') {
    return encodeCanvasToAvifBlob(canvas, ctx, quality);
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    if (format === 'png') {
      canvas.toBlob((b) => resolve(b), mimeType);
    } else {
      canvas.toBlob((b) => resolve(b), mimeType, quality);
    }
  });

  if (!blob) {
    throw new Error(`Browser failed to encode ${format.toUpperCase()}.`);
  }

  return blob;
}

async function renderImageToCanvasOutput(
  file: File,
  options: ImageConversionOptions,
  targetFormat: RasterFormat,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');

  if (!isSvg && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    try {
      const decodedBlob = await decodeInputImageBlob(file);
      throwIfAborted(signal);
      return await runImageWorker(decodedBlob, options, targetFormat, onProgress, signal);
    } catch (err) {
      if (err instanceof ConversionCanceledError || signal?.aborted) {
        throw new ConversionCanceledError();
      }
      // Fallback to main-thread canvas rendering if Worker/OffscreenCanvas fails
    }
  }

  const loaded = await loadDrawableImage(file, signal);
  try {
    throwIfAborted(signal);
    let drawSource: CanvasImageSource = loaded.source;
    let drawWidth = loaded.width;
    let drawHeight = loaded.height;

    if (options.rotationDeg !== 0) {
      const rotated = rotateSourceToCanvas(
        loaded.source,
        loaded.width,
        loaded.height,
        options.rotationDeg,
      );
      drawSource = rotated.canvas;
      drawWidth = rotated.width;
      drawHeight = rotated.height;
    }

    const crop = computeCenterCropRect(
      drawWidth,
      drawHeight,
      options.cropRatio,
      options.cropAnchor,
    );
    let baseWidth = crop.sw;
    let baseHeight = crop.sh;

    if (options.maxWidth && baseWidth > options.maxWidth) {
      const ratio = options.maxWidth / baseWidth;
      baseWidth = options.maxWidth;
      baseHeight = Math.max(1, Math.round(baseHeight * ratio));
    }

    const encodeAt = async (quality: number, scale: number) => {
      throwIfAborted(signal);
      const w = Math.max(1, Math.round(baseWidth * scale));
      const h = Math.max(1, Math.round(baseHeight * scale));
      const blob = await renderToBlob(
        drawSource,
        crop.sx,
        crop.sy,
        crop.sw,
        crop.sh,
        w,
        h,
        targetFormat,
        quality,
      );
      return { blob, width: w, height: h, quality };
    };

    if (options.targetSizeBytes && options.targetSizeBytes > 0) {
      return await optimizeImageToTargetSize(
        encodeAt,
        options.targetSizeBytes,
        options.quality / 100,
        targetFormat === 'png',
        onProgress,
        signal,
      );
    }

    onProgress?.(45);
    const encoded = await encodeAt(options.quality / 100, 1);
    throwIfAborted(signal);
    return { ...encoded, targetMet: undefined };
  } finally {
    loaded.cleanup();
  }
}

export async function convertImageFile(
  file: File,
  options: ImageConversionOptions,
  onProgress?: (progress: number) => void,
  overrideFilename?: string,
  signal?: AbortSignal,
): Promise<ConversionResult> {
  throwIfAborted(signal);
  onProgress?.(5);

  if (options.format === 'avif') {
    const supported = await isAvifEncodingSupported();
    if (!supported) {
      throw new Error('AVIF encoding is not supported in this browser. Please select WebP or JPG.');
    }
  }

  if (options.format === 'pdf') {
    return convertImagesToSinglePdf(
      [file],
      options,
      onProgress,
      overrideFilename || getOutputFilename(file.name, 'pdf'),
      signal,
    );
  }

  const out = await renderImageToCanvasOutput(file, options, options.format, onProgress, signal);
  throwIfAborted(signal);
  const filename = overrideFilename || getOutputFilename(file.name, options.format);
  onProgress?.(100);

  return {
    blob: out.blob,
    url: URL.createObjectURL(out.blob),
    filename,
    size: out.blob.size,
    width: out.width,
    height: out.height,
    targetMet: out.targetMet,
  };
}

export async function convertImagesToSinglePdf(
  files: File[],
  options: ImageConversionOptions,
  onProgress?: (progress: number) => void,
  filename = 'images-combined.pdf',
  signal?: AbortSignal,
  perFileRotations?: RotationDegrees[],
): Promise<ConversionResult> {
  throwIfAborted(signal);
  const { PDFDocument } = await import('pdf-lib');
  throwIfAborted(signal);
  const pdfDoc = await PDFDocument.create();
  const perImageBudget =
    options.targetSizeBytes && files.length > 0
      ? Math.max(15 * 1024, Math.floor((options.targetSizeBytes * 0.9) / files.length))
      : null;

  const A4_LONG_PT = 841.89;

  for (let i = 0; i < files.length; i += 1) {
    throwIfAborted(signal);
    const file = files[i];
    const effectiveRot = perFileRotations?.[i] ?? options.rotationDeg;
    const perImageOpts: ImageConversionOptions = {
      ...options,
      rotationDeg: effectiveRot,
      targetSizeBytes: perImageBudget,
    };
    const encoded = await renderImageToCanvasOutput(file, perImageOpts, 'jpg', undefined, signal);
    throwIfAborted(signal);
    const jpgBytes = new Uint8Array(await encoded.blob.arrayBuffer());
    const embedded = await pdfDoc.embedJpg(jpgBytes);
    const maxDim = Math.max(embedded.width, embedded.height, 1);
    const ptScale = maxDim > A4_LONG_PT ? A4_LONG_PT / maxDim : 1;
    const pageW = Math.max(72, Math.round(embedded.width * ptScale * 100) / 100);
    const pageH = Math.max(72, Math.round(embedded.height * ptScale * 100) / 100);
    const page = pdfDoc.addPage([pageW, pageH]);
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: pageW,
      height: pageH,
    });
    onProgress?.(Math.min(95, Math.round(((i + 1) / files.length) * 90)));
  }

  throwIfAborted(signal);
  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  const copy = new Uint8Array(pdfBytes.byteLength);
  copy.set(pdfBytes);
  const blob = new Blob([copy.buffer], { type: 'application/pdf' });
  onProgress?.(100);

  return {
    blob,
    url: URL.createObjectURL(blob),
    filename,
    size: blob.size,
    targetMet:
      options.targetSizeBytes && options.targetSizeBytes > 0
        ? blob.size <= options.targetSizeBytes
        : undefined,
  };
}
