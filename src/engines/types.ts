export type FileCategory = 'image' | 'audio' | 'video' | 'pdf';

export type ImageOutputFormat = 'webp' | 'jpg' | 'png' | 'avif' | 'pdf';
export type AudioOutputFormat = 'mp3' | 'm4a' | 'wav' | 'ogg';
export type VideoOutputFormat = 'mp4' | 'webm' | 'gif' | AudioOutputFormat;
export type OutputFormat = ImageOutputFormat | VideoOutputFormat | 'zip';

export type CropAspectRatio = 'original' | '1:1' | '4:5' | '16:9' | '3:4';
export type CropAnchor = 'center' | 'top' | 'bottom';
export type RotationDegrees = 0 | 90 | 180 | 270;
export type VideoResolution = 'original' | '1080p' | '720p' | '480p';
export type PdfOperation = 'compress' | 'merge' | 'to-images' | 'extract-pages';

export type QueueStatus =
  | 'pending'
  | 'loading-engine'
  | 'processing'
  | 'done'
  | 'error'
  | 'canceled';

export interface ImageConversionOptions {
  format: ImageOutputFormat;
  quality: number; // 10 - 100
  maxWidth: number | null; // null = original
  cropRatio: CropAspectRatio;
  cropAnchor: CropAnchor;
  rotationDeg: RotationDegrees;
  targetSizeBytes: number | null;
  combineIntoSinglePdf: boolean;
}

export class ConversionCanceledError extends Error {
  constructor() {
    super('Conversion canceled by user.');
    this.name = 'ConversionCanceledError';
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ConversionCanceledError();
  }
}

export interface AudioConversionOptions {
  format: AudioOutputFormat;
  audioBitrateKbps: number;
  targetSizeBytes: number | null;
  trimStartSec?: number | null;
  trimEndSec?: number | null;
}

export interface VideoConversionOptions {
  format: VideoOutputFormat;
  audioBitrateKbps: number;
  resolution: VideoResolution;
  targetSizeBytes: number | null;
  gifFps: number;
  gifWidth: number;
  trimStartSec?: number | null;
  trimEndSec?: number | null;
}

export interface PdfConversionOptions {
  operation: PdfOperation;
  imageFormat: 'jpg' | 'png' | 'webp';
  targetSizeBytes: number | null;
  pageRange: string;
}

export interface ConversionResult {
  blob: Blob;
  url: string;
  filename: string;
  size: number;
  width?: number;
  height?: number;
  targetMet?: boolean;
  sourceCategory?: FileCategory;
  appliedOptionsKey?: string;
}

export interface QueueItem {
  id: string;
  file: File;
  category: FileCategory;
  previewUrl?: string;
  rotationOverrideDeg?: RotationDegrees;
  status: QueueStatus;
  progress: number; // 0 - 100
  errorMessage?: string;
  result?: ConversionResult;
  appliedOptionsKey?: string;
}

export interface ConversionPreset {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  appliesTo: 'image' | 'audio' | 'video' | 'pdf';
  imageOptions?: Partial<ImageConversionOptions>;
  audioOptions?: Partial<AudioConversionOptions>;
  videoOptions?: Partial<VideoConversionOptions>;
  pdfOptions?: Partial<PdfConversionOptions>;
}
