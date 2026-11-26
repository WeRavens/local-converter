import { encodeCanvasToAvifBlob } from './avifEncoder';
import { computeCenterCropRect } from './formatUtils';
import { optimizeImageToTargetSize } from './imageTargetSize';
import {
  ConversionCanceledError,
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

export interface ImageWorkerConvertRequest {
  type: 'convert';
  jobId: string;
  blob: Blob;
  options: ImageConversionOptions;
  targetFormat: RasterFormat;
}

export interface ImageWorkerCancelRequest {
  type: 'cancel';
  jobId: string;
}

export type ImageWorkerRequest = ImageWorkerConvertRequest | ImageWorkerCancelRequest;

export type ImageWorkerResponse =
  | { type: 'progress'; jobId: string; progress: number }
  | {
      type: 'result';
      jobId: string;
      blob: Blob;
      width: number;
      height: number;
      targetMet?: boolean;
    }
  | { type: 'error'; jobId: string; message: string; canceled: boolean };

const activeJobs = new Map<string, AbortController>();

function rotateBitmapOffscreen(
  source: ImageBitmap,
  rotationDeg: RotationDegrees,
): { canvas: OffscreenCanvas; width: number; height: number } {
  const swap = rotationDeg === 90 || rotationDeg === 270;
  const outW = swap ? source.height : source.width;
  const outH = swap ? source.width : source.height;

  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize 2D OffscreenCanvas rotation context.');
  }

  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2, source.width, source.height);
  return { canvas, width: outW, height: outH };
}

async function renderOffscreenToBlob(
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
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(targetWidth)),
    Math.max(1, Math.round(targetHeight)),
  );
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize 2D OffscreenCanvas context.');
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

  const mimeType = MIME_MAP[format];
  if (format === 'png') {
    return canvas.convertToBlob({ type: mimeType });
  }
  return canvas.convertToBlob({ type: mimeType, quality });
}

self.onmessage = async (event: MessageEvent<ImageWorkerRequest>) => {
  const msg = event.data;

  if (msg.type === 'cancel') {
    activeJobs.get(msg.jobId)?.abort();
    return;
  }

  const controller = new AbortController();
  activeJobs.set(msg.jobId, controller);

  let bitmap: ImageBitmap | null = null;
  try {
    throwIfAborted(controller.signal);
    bitmap = await createImageBitmap(msg.blob);
    throwIfAborted(controller.signal);

    let drawSource: CanvasImageSource = bitmap;
    let drawWidth = bitmap.width;
    let drawHeight = bitmap.height;

    if (msg.options.rotationDeg !== 0) {
      const rotated = rotateBitmapOffscreen(bitmap, msg.options.rotationDeg);
      drawSource = rotated.canvas;
      drawWidth = rotated.width;
      drawHeight = rotated.height;
    }

    const crop = computeCenterCropRect(
      drawWidth,
      drawHeight,
      msg.options.cropRatio,
      msg.options.cropAnchor,
    );
    let baseWidth = crop.sw;
    let baseHeight = crop.sh;

    if (msg.options.maxWidth && baseWidth > msg.options.maxWidth) {
      const ratio = msg.options.maxWidth / baseWidth;
      baseWidth = msg.options.maxWidth;
      baseHeight = Math.max(1, Math.round(baseHeight * ratio));
    }

    const encodeAt = async (quality: number, scale: number) => {
      throwIfAborted(controller.signal);
      const w = Math.max(1, Math.round(baseWidth * scale));
      const h = Math.max(1, Math.round(baseHeight * scale));
      const blob = await renderOffscreenToBlob(
        drawSource,
        crop.sx,
        crop.sy,
        crop.sw,
        crop.sh,
        w,
        h,
        msg.targetFormat,
        quality,
      );
      return { blob, width: w, height: h, quality };
    };

    if (msg.options.targetSizeBytes && msg.options.targetSizeBytes > 0) {
      const res = await optimizeImageToTargetSize(
        encodeAt,
        msg.options.targetSizeBytes,
        msg.options.quality / 100,
        msg.targetFormat === 'png',
        (progress) => {
          self.postMessage({ type: 'progress', jobId: msg.jobId, progress } satisfies ImageWorkerResponse);
        },
        controller.signal,
      );
      self.postMessage({
        type: 'result',
        jobId: msg.jobId,
        blob: res.blob,
        width: res.width,
        height: res.height,
        targetMet: res.targetMet,
      } satisfies ImageWorkerResponse);
    } else {
      self.postMessage({ type: 'progress', jobId: msg.jobId, progress: 45 } satisfies ImageWorkerResponse);
      const encoded = await encodeAt(msg.options.quality / 100, 1);
      throwIfAborted(controller.signal);
      self.postMessage({
        type: 'result',
        jobId: msg.jobId,
        blob: encoded.blob,
        width: encoded.width,
        height: encoded.height,
        targetMet: undefined,
      } satisfies ImageWorkerResponse);
    }
  } catch (err) {
    const canceled = err instanceof ConversionCanceledError || controller.signal.aborted;
    self.postMessage({
      type: 'error',
      jobId: msg.jobId,
      message: err instanceof Error ? err.message : String(err),
      canceled,
    } satisfies ImageWorkerResponse);
  } finally {
    bitmap?.close();
    activeJobs.delete(msg.jobId);
  }
};
