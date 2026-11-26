import { Language, translations } from '../i18n/translations';
import {
  AudioConversionOptions,
  ConversionPreset,
  ImageConversionOptions,
  PdfConversionOptions,
  VideoConversionOptions,
} from './types';

const CUSTOM_PRESETS_KEY = 'lokalconvert:custom-presets-v2';
const STATS_SAVED_BYTES_KEY = 'lokalconvert:saved-bytes';

export const DEFAULT_IMAGE_OPTIONS: ImageConversionOptions = {
  format: 'webp',
  quality: 82,
  maxWidth: null,
  cropRatio: 'original',
  cropAnchor: 'center',
  rotationDeg: 0,
  targetSizeBytes: null,
  combineIntoSinglePdf: false,
};

export const DEFAULT_AUDIO_OPTIONS: AudioConversionOptions = {
  format: 'mp3',
  audioBitrateKbps: 192,
  targetSizeBytes: null,
  trimStartSec: null,
  trimEndSec: null,
};

export const DEFAULT_VIDEO_OPTIONS: VideoConversionOptions = {
  format: 'mp4',
  audioBitrateKbps: 128,
  resolution: '720p',
  targetSizeBytes: null,
  gifFps: 12,
  gifWidth: 480,
  trimStartSec: null,
  trimEndSec: null,
};

export const DEFAULT_PDF_OPTIONS: PdfConversionOptions = {
  operation: 'compress',
  imageFormat: 'jpg',
  targetSizeBytes: null,
  pageRange: '',
};

export function getBuiltInPresets(lang: Language): ConversionPreset[] {
  const dict = translations[lang];
  return [
    {
      id: 'builtin-web-webp',
      name: dict.presetWebName,
      description: dict.presetWebDesc,
      isBuiltIn: true,
      appliesTo: 'image',
      imageOptions: {
        format: 'webp',
        quality: 82,
        maxWidth: 1600,
        cropRatio: 'original',
        targetSizeBytes: null,
        combineIntoSinglePdf: false,
      },
    },
    {
      id: 'builtin-loker-500kb',
      name: dict.presetLokerName,
      description: dict.presetLokerDesc,
      isBuiltIn: true,
      appliesTo: 'image',
      imageOptions: {
        format: 'jpg',
        quality: 85,
        maxWidth: 1800,
        cropRatio: 'original',
        targetSizeBytes: 500 * 1024,
        combineIntoSinglePdf: false,
      },
    },
    {
      id: 'builtin-square-shop',
      name: dict.presetSquareName,
      description: dict.presetSquareDesc,
      isBuiltIn: true,
      appliesTo: 'image',
      imageOptions: {
        format: 'webp',
        quality: 84,
        maxWidth: 1200,
        cropRatio: '1:1',
        targetSizeBytes: null,
        combineIntoSinglePdf: false,
      },
    },
    {
      id: 'builtin-image-pdf',
      name: dict.presetImgToPdfName,
      description: dict.presetImgToPdfDesc,
      isBuiltIn: true,
      appliesTo: 'image',
      imageOptions: {
        format: 'pdf',
        quality: 85,
        maxWidth: 1800,
        cropRatio: 'original',
        targetSizeBytes: 2 * 1024 * 1024,
        combineIntoSinglePdf: true,
      },
    },
    {
      id: 'builtin-audio-mp3',
      name: dict.presetAudioMp3Name,
      description: dict.presetAudioMp3Desc,
      isBuiltIn: true,
      appliesTo: 'audio',
      audioOptions: {
        format: 'mp3',
        audioBitrateKbps: 192,
        targetSizeBytes: null,
      },
    },
    {
      id: 'builtin-audio-compact',
      name: dict.presetAudioCompactName,
      description: dict.presetAudioCompactDesc,
      isBuiltIn: true,
      appliesTo: 'audio',
      audioOptions: {
        format: 'mp3',
        audioBitrateKbps: 128,
        targetSizeBytes: 2 * 1024 * 1024,
      },
    },
    {
      id: 'builtin-wa-video',
      name: dict.presetWaVideoName,
      description: dict.presetWaVideoDesc,
      isBuiltIn: true,
      appliesTo: 'video',
      videoOptions: {
        format: 'mp4',
        resolution: '720p',
        audioBitrateKbps: 128,
        targetSizeBytes: 15 * 1024 * 1024,
      },
    },
    {
      id: 'builtin-extract-mp3',
      name: dict.presetExtractMp3Name,
      description: dict.presetExtractMp3Desc,
      isBuiltIn: true,
      appliesTo: 'video',
      videoOptions: {
        format: 'mp3',
        audioBitrateKbps: 192,
        targetSizeBytes: null,
      },
    },
    {
      id: 'builtin-chat-gif',
      name: dict.presetGifName,
      description: dict.presetGifDesc,
      isBuiltIn: true,
      appliesTo: 'video',
      videoOptions: {
        format: 'gif',
        gifFps: 12,
        gifWidth: 480,
        targetSizeBytes: 3 * 1024 * 1024,
      },
    },
    {
      id: 'builtin-pdf-compress',
      name: dict.presetPdfCompressName,
      description: dict.presetPdfCompressDesc,
      isBuiltIn: true,
      appliesTo: 'pdf',
      pdfOptions: {
        operation: 'compress',
        targetSizeBytes: 1024 * 1024,
      },
    },
    {
      id: 'builtin-pdf-merge',
      name: dict.presetPdfMergeName,
      description: dict.presetPdfMergeDesc,
      isBuiltIn: true,
      appliesTo: 'pdf',
      pdfOptions: {
        operation: 'merge',
        targetSizeBytes: null,
      },
    },
    {
      id: 'builtin-pdf-images',
      name: dict.presetPdfToImgName,
      description: dict.presetPdfToImgDesc,
      isBuiltIn: true,
      appliesTo: 'pdf',
      pdfOptions: {
        operation: 'to-images',
        imageFormat: 'jpg',
      },
    },
  ];
}

export function loadCustomPresets(): ConversionPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomPreset(
  preset: Omit<ConversionPreset, 'id' | 'isBuiltIn'>,
): ConversionPreset[] {
  const existing = loadCustomPresets();
  const next: ConversionPreset[] = [
    ...existing,
    {
      ...preset,
      id: `custom-${Date.now()}`,
      isBuiltIn: false,
    },
  ];
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota errors
  }
  return next;
}

export function deleteCustomPreset(id: string): ConversionPreset[] {
  const next = loadCustomPresets().filter((p) => p.id !== id);
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota errors
  }
  return next;
}

export function loadTotalBytesProcessedLocally(): number {
  try {
    const raw = localStorage.getItem(STATS_SAVED_BYTES_KEY);
    const val = raw ? Number(raw) : 0;
    return Number.isFinite(val) && val > 0 ? val : 0;
  } catch {
    return 0;
  }
}

export function addLocalProcessedBytes(bytes: number): number {
  const current = loadTotalBytesProcessedLocally();
  const next = current + Math.max(0, bytes);
  try {
    localStorage.setItem(STATS_SAVED_BYTES_KEY, String(next));
  } catch {
    // Ignore quota errors
  }
  return next;
}

export function resetLocalProcessedBytes(): number {
  try {
    localStorage.setItem(STATS_SAVED_BYTES_KEY, '0');
  } catch {
    // Ignore quota errors
  }
  return 0;
}
