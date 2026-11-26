import { getBaseFilename, parsePageRange } from './formatUtils';
import { ConversionResult, PdfConversionOptions, throwIfAborted } from './types';

let pdfWorkerConfigured = false;

async function getPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfWorkerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf/pdf.worker.min.mjs`;
    pdfWorkerConfigured = true;
  }
  return pdfjs;
}

export async function mergePdfFiles(
  files: File[],
  onProgress?: (progress: number) => void,
  outputName = 'merged-document.pdf',
  signal?: AbortSignal,
): Promise<ConversionResult> {
  throwIfAborted(signal);
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();

  for (let i = 0; i < files.length; i += 1) {
    throwIfAborted(signal);
    const bytes = await files[i].arrayBuffer();
    throwIfAborted(signal);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const copied = await merged.copyPages(doc, doc.getPageIndices());
    copied.forEach((p) => merged.addPage(p));
    onProgress?.(Math.min(90, Math.round(((i + 1) / files.length) * 85)));
  }

  throwIfAborted(signal);
  const pdfBytes = await merged.save({ useObjectStreams: true });
  const copy = new Uint8Array(pdfBytes.byteLength);
  copy.set(pdfBytes);
  const blob = new Blob([copy.buffer], { type: 'application/pdf' });
  onProgress?.(100);

  return {
    blob,
    url: URL.createObjectURL(blob),
    filename: outputName,
    size: blob.size,
  };
}

export async function extractPdfPages(
  file: File,
  pageRange: string,
  onProgress?: (progress: number) => void,
  overrideFilename?: string,
  signal?: AbortSignal,
): Promise<ConversionResult> {
  throwIfAborted(signal);
  const { PDFDocument } = await import('pdf-lib');
  onProgress?.(15);
  const bytes = await file.arrayBuffer();
  throwIfAborted(signal);
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const indices = parsePageRange(pageRange, srcDoc.getPageCount());
  if (indices.length === 0) {
    throw new Error('No valid pages matched the specified page range.');
  }

  const outDoc = await PDFDocument.create();
  const copied = await outDoc.copyPages(srcDoc, indices);
  copied.forEach((p) => outDoc.addPage(p));
  onProgress?.(80);

  throwIfAborted(signal);
  const pdfBytes = await outDoc.save({ useObjectStreams: true });
  const copy = new Uint8Array(pdfBytes.byteLength);
  copy.set(pdfBytes);
  const blob = new Blob([copy.buffer], { type: 'application/pdf' });
  onProgress?.(100);

  return {
    blob,
    url: URL.createObjectURL(blob),
    filename: overrideFilename || `${getBaseFilename(file.name)}-pages.pdf`,
    size: blob.size,
  };
}

async function renderPdfPagesToJpegBlobs(
  file: File,
  scale: number,
  quality: number,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<{ blob: Blob; width: number; height: number; pageWidth: number; pageHeight: number }[]> {
  throwIfAborted(signal);
  const pdfjs = await getPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  throwIfAborted(signal);
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  const pages: {
    blob: Blob;
    width: number;
    height: number;
    pageWidth: number;
    pageHeight: number;
  }[] = [];

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      throwIfAborted(signal);
      const page = await pdf.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not initialize canvas for PDF rendering.');
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      throwIfAborted(signal);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
      );
      if (!blob) {
        throw new Error(`Failed to render PDF page ${pageNum}.`);
      }
      pages.push({
        blob,
        width: canvas.width,
        height: canvas.height,
        pageWidth: baseViewport.width,
        pageHeight: baseViewport.height,
      });
      onProgress?.(Math.min(85, Math.round((pageNum / pdf.numPages) * 80)));
    }
  } finally {
    await loadingTask.destroy().catch(() => {});
  }

  return pages;
}

export async function compressPdfFile(
  file: File,
  targetSizeBytes: number | null,
  onProgress?: (progress: number) => void,
  overrideFilename?: string,
  signal?: AbortSignal,
): Promise<ConversionResult> {
  throwIfAborted(signal);
  const { PDFDocument } = await import('pdf-lib');
  onProgress?.(5);
  const outName = overrideFilename || `${getBaseFilename(file.name)}-compressed.pdf`;

  let losslessBlob: Blob | null = null;
  try {
    const rawBytes = await file.arrayBuffer();
    throwIfAborted(signal);
    const doc = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
    const saved = await doc.save({ useObjectStreams: true });
    const copy = new Uint8Array(saved.byteLength);
    copy.set(saved);
    const candidate = new Blob([copy.buffer], { type: 'application/pdf' });
    losslessBlob = candidate.size <= file.size ? candidate : file;
  } catch (err) {
    if (err instanceof Error && err.name === 'ConversionCanceledError') {
      throw err;
    }
    losslessBlob = null;
  }

  if (losslessBlob && targetSizeBytes && losslessBlob.size <= targetSizeBytes) {
    onProgress?.(100);
    return {
      blob: losslessBlob,
      url: URL.createObjectURL(losslessBlob),
      filename: outName,
      size: losslessBlob.size,
      targetMet: true,
    };
  }

  const attempts = targetSizeBytes
    ? [
        { scale: 1.4, quality: 0.78 },
        { scale: 1.2, quality: 0.56 },
        { scale: 1.0, quality: 0.38 },
        { scale: 0.8, quality: 0.28 },
      ]
    : [{ scale: 1.35, quality: 0.72 }];

  let bestBlob: Blob | null = null;

  for (let idx = 0; idx < attempts.length; idx += 1) {
    throwIfAborted(signal);
    const attempt = attempts[idx];
    const rendered = await renderPdfPagesToJpegBlobs(
      file,
      attempt.scale,
      attempt.quality,
      (p) => onProgress?.(Math.min(90, Math.round((idx / attempts.length) * 50 + p * 0.4))),
      signal,
    );

    const outDoc = await PDFDocument.create();
    for (const p of rendered) {
      throwIfAborted(signal);
      const jpgBytes = new Uint8Array(await p.blob.arrayBuffer());
      const embedded = await outDoc.embedJpg(jpgBytes);
      const page = outDoc.addPage([p.pageWidth, p.pageHeight]);
      page.drawImage(embedded, {
        x: 0,
        y: 0,
        width: p.pageWidth,
        height: p.pageHeight,
      });
    }

    throwIfAborted(signal);
    const pdfBytes = await outDoc.save({ useObjectStreams: true });
    const copy = new Uint8Array(pdfBytes.byteLength);
    copy.set(pdfBytes);
    const candidate = new Blob([copy.buffer], { type: 'application/pdf' });

    if (!bestBlob || candidate.size < bestBlob.size) {
      bestBlob = candidate;
    }

    if (!targetSizeBytes || candidate.size <= targetSizeBytes) {
      bestBlob = candidate;
      break;
    }
  }

  if (!bestBlob) {
    throw new Error('Could not compress PDF.');
  }

  if (losslessBlob && losslessBlob.size <= bestBlob.size) {
    bestBlob = losslessBlob;
  }

  onProgress?.(100);
  return {
    blob: bestBlob,
    url: URL.createObjectURL(bestBlob),
    filename: outName,
    size: bestBlob.size,
    targetMet:
      targetSizeBytes && targetSizeBytes > 0 ? bestBlob.size <= targetSizeBytes : undefined,
  };
}

export async function convertPdfToImages(
  file: File,
  imageFormat: 'jpg' | 'png' | 'webp',
  onProgress?: (progress: number) => void,
  overrideBaseName?: string,
  signal?: AbortSignal,
): Promise<ConversionResult> {
  throwIfAborted(signal);
  const pdfjs = await getPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  throwIfAborted(signal);
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  const mimeMap = {
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  } as const;

  const baseName = overrideBaseName
    ? getBaseFilename(overrideBaseName)
    : getBaseFilename(file.name);

  const pageBlobs: { name: string; blob: Blob; width: number; height: number }[] = [];

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      throwIfAborted(signal);
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.75 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not initialize canvas context.');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      throwIfAborted(signal);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), mimeMap[imageFormat], 0.9),
      );
      if (!blob) throw new Error(`Failed to export page ${pageNum}.`);

      pageBlobs.push({
        name: `${baseName}-page-${String(pageNum).padStart(2, '0')}.${imageFormat}`,
        blob,
        width: canvas.width,
        height: canvas.height,
      });

      onProgress?.(Math.min(92, Math.round((pageNum / pdf.numPages) * 90)));
    }
  } finally {
    await loadingTask.destroy().catch(() => {});
  }

  throwIfAborted(signal);

  if (pageBlobs.length === 1) {
    onProgress?.(100);
    return {
      blob: pageBlobs[0].blob,
      url: URL.createObjectURL(pageBlobs[0].blob),
      filename: pageBlobs[0].name,
      size: pageBlobs[0].blob.size,
      width: pageBlobs[0].width,
      height: pageBlobs[0].height,
    };
  }

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const page of pageBlobs) {
    zip.file(page.name, page.blob);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  onProgress?.(100);

  return {
    blob: zipBlob,
    url: URL.createObjectURL(zipBlob),
    filename: `${baseName}-pages.zip`,
    size: zipBlob.size,
  };
}

export async function processPdfFile(
  file: File,
  options: PdfConversionOptions,
  onProgress?: (progress: number) => void,
  overrideFilename?: string,
  signal?: AbortSignal,
): Promise<ConversionResult> {
  switch (options.operation) {
    case 'to-images':
      return convertPdfToImages(file, options.imageFormat, onProgress, overrideFilename, signal);
    case 'extract-pages':
      return extractPdfPages(file, options.pageRange, onProgress, overrideFilename, signal);
    case 'merge':
      throw new Error('At least 2 PDF files are required to merge.');
    case 'compress':
    default:
      return compressPdfFile(file, options.targetSizeBytes, onProgress, overrideFilename, signal);
  }
}
