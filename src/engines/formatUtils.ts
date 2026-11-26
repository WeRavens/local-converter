import { CropAnchor, CropAspectRatio, FileCategory, OutputFormat } from './types';

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'avif',
  'gif',
  'bmp',
  'svg',
  'ico',
  'jfif',
  'heic',
  'heif',
]);

const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'webm',
  'mkv',
  'avi',
  'm4v',
  'flv',
  '3gp',
]);

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'm4a',
  'ogg',
  'aac',
  'flac',
  'opus',
  'wma',
]);

export function getExtension(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function isHeicFile(file: Pick<File, 'name' | 'type'>): boolean {
  const ext = getExtension(file.name);
  const mime = (file.type || '').toLowerCase();
  return ext === 'heic' || ext === 'heif' || mime.includes('heic') || mime.includes('heif');
}

export function detectFileCategory(file: Pick<File, 'name' | 'type'>): FileCategory | null {
  const mime = (file.type || '').toLowerCase();
  const ext = getExtension(file.name);

  if (mime === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }
  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) {
    return 'image';
  }
  if (mime.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) {
    return 'video';
  }
  if (mime.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) {
    return 'audio';
  }
  return null;
}

export function isSupportedInputFile(file: Pick<File, 'name' | 'type'>): boolean {
  return detectFileCategory(file) !== null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exp);
  return `${value >= 100 || exp === 0 ? Math.round(value) : value.toFixed(1)} ${units[exp]}`;
}

export function computeReductionPercent(originalBytes: number, convertedBytes: number): number {
  if (originalBytes <= 0) return 0;
  return Math.round(((originalBytes - convertedBytes) / originalBytes) * 100);
}

export function getBaseFilename(originalName: string): string {
  const dotIdx = originalName.lastIndexOf('.');
  return dotIdx > 0 ? originalName.slice(0, dotIdx) : originalName;
}

export function getOutputFilename(originalName: string, targetFormat: OutputFormat): string {
  const baseName = getBaseFilename(originalName);
  return `${baseName}.${targetFormat}`;
}

export function applyBatchRenamePattern(
  originalName: string,
  pattern: string,
  indexZeroBased: number,
  targetFormat: OutputFormat,
): string {
  const trimmed = pattern.trim();
  const base = getBaseFilename(originalName);
  if (!trimmed) {
    return `${base}.${targetFormat}`;
  }

  const num = indexZeroBased + 1;
  const padded = String(num).padStart(2, '0');
  let replaced = trimmed
    .replaceAll('{name}', base)
    .replaceAll('{nn}', padded)
    .replaceAll('{n}', String(num));

  if (!trimmed.includes('{name}') && !trimmed.includes('{n}') && !trimmed.includes('{nn}')) {
    replaced = `${replaced}-${padded}`;
  }

  replaced = replaced.replace(/[\\/:*?"<>|]/g, '-');
  return `${replaced}.${targetFormat}`;
}

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export function computeCenterCropRect(
  srcWidth: number,
  srcHeight: number,
  aspectRatio: CropAspectRatio,
  anchor: CropAnchor = 'center',
): CropRect {
  if (aspectRatio === 'original' || srcWidth <= 0 || srcHeight <= 0) {
    return { sx: 0, sy: 0, sw: srcWidth, sh: srcHeight };
  }

  const [rw, rh] = aspectRatio.split(':').map(Number);
  const targetRatio = rw / rh;
  const currentRatio = srcWidth / srcHeight;

  if (Math.abs(currentRatio - targetRatio) < 0.005) {
    return { sx: 0, sy: 0, sw: srcWidth, sh: srcHeight };
  }

  if (currentRatio > targetRatio) {
    const sw = Math.max(1, Math.round(srcHeight * targetRatio));
    const maxOffset = Math.max(0, srcWidth - sw);
    const sx = anchor === 'top' ? 0 : anchor === 'bottom' ? maxOffset : Math.floor(maxOffset / 2);
    return { sx, sy: 0, sw, sh: srcHeight };
  }

  const sh = Math.max(1, Math.round(srcWidth / targetRatio));
  const maxOffset = Math.max(0, srcHeight - sh);
  const sy = anchor === 'top' ? 0 : anchor === 'bottom' ? maxOffset : Math.floor(maxOffset / 2);
  return { sx: 0, sy, sw: srcWidth, sh };
}

/**
 * Parses 1-based page ranges like "1-3, 5, 7-8" into 0-based sorted unique indices.
 */
export function parsePageRange(rangeStr: string, totalPages: number): number[] {
  if (totalPages <= 0) return [];
  const trimmed = rangeStr.trim();
  if (!trimmed) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  const selected = new Set<number>();
  const tokens = trimmed.split(',').map((t) => t.trim()).filter(Boolean);

  for (const token of tokens) {
    if (token.includes('-')) {
      const [startRaw, endRaw] = token.split('-').map((v) => Number(v.trim()));
      if (Number.isInteger(startRaw) && Number.isInteger(endRaw)) {
        const start = Math.max(1, Math.min(startRaw, endRaw));
        const end = Math.min(totalPages, Math.max(startRaw, endRaw));
        for (let p = start; p <= end; p += 1) {
          selected.add(p - 1);
        }
      }
    } else {
      const page = Number(token);
      if (Number.isInteger(page) && page >= 1 && page <= totalPages) {
        selected.add(page - 1);
      }
    }
  }

  return Array.from(selected).sort((a, b) => a - b);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function parseSvgLengthAttr(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.endsWith('%')) return null;
  const match = trimmed.match(/^([+-]?\d*\.?\d+)\s*(px|pt)?$/);
  if (!match) return null;
  const val = Number(match[1]);
  if (!Number.isFinite(val) || val <= 0) return null;
  return match[2] === 'pt' ? val * (96 / 72) : val;
}

/**
 * Extracts explicit width/height or viewBox dimensions from an SVG string,
 * preserving exact aspect ratio while upscaling small icons to >= 1024 px on the long edge.
 */
export function parseSvgDimensions(svgText: string): { width: number; height: number } | null {
  const svgTagMatch = svgText.match(/<svg\b([^>]*)>/i);
  if (!svgTagMatch) return null;
  const attrs = svgTagMatch[1];

  const widthAttr = attrs.match(/\bwidth\s*=\s*["']([^"']+)["']/i)?.[1];
  const heightAttr = attrs.match(/\bheight\s*=\s*["']([^"']+)["']/i)?.[1];
  let w = parseSvgLengthAttr(widthAttr);
  let h = parseSvgLengthAttr(heightAttr);

  if (w === null || h === null) {
    const viewBoxAttr = attrs.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
    if (viewBoxAttr) {
      const parts = viewBoxAttr
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        const vbW = parts[2];
        const vbH = parts[3];
        if (vbW > 0 && vbH > 0) {
          if (w !== null && h === null) {
            h = (w * vbH) / vbW;
          } else if (h !== null && w === null) {
            w = (h * vbW) / vbH;
          } else {
            w = vbW;
            h = vbH;
          }
        }
      }
    }
  }

  if (w === null || h === null || w <= 0 || h <= 0) {
    return null;
  }

  const maxSide = Math.max(w, h);
  if (maxSide < 1024) {
    const scale = 1024 / maxSide;
    w *= scale;
    h *= scale;
  }

  return {
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
  };
}
