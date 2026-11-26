import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Language } from '../i18n/translations';
import { getExtension, getOutputFilename } from './formatUtils';
import {
  buildFfmpegArgs,
  computeEffectiveDuration,
  estimateInitialGifSettings,
  hasInvalidTrimRange,
} from './mediaMath';
import {
  AudioConversionOptions,
  ConversionCanceledError,
  ConversionResult,
  VideoConversionOptions,
  throwIfAborted,
} from './types';

export { ConversionCanceledError };

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadingPromise: Promise<FFmpeg> | null = null;
let cancelTokenCounter = 0;

const MEDIA_MIME_MAP: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  gif: 'image/gif',
};

export function formatFriendlyMediaError(err: unknown, lang: Language): string {
  if (err instanceof ConversionCanceledError) {
    return lang === 'id' ? 'Konversi dibatalkan.' : 'Conversion canceled.';
  }

  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (lower.includes('invalid trim range')) {
    return lang === 'id'
      ? 'Waktu potong selesai harus lebih besar dari waktu mulai.'
      : 'Trim end time must be greater than trim start time.';
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed') ||
    lower.includes('err_internet_disconnected') ||
    (typeof navigator !== 'undefined' && navigator.onLine === false && lower.includes('fetch'))
  ) {
    return lang === 'id'
      ? 'Engine FFmpeg (~32 MB) belum tersimpan untuk mode offline. Sambungkan internet sekali (atau klik "Unduh Engine Offline Penuh" di menu Cara Kerja & Privasi) agar konversi audio/video bisa berjalan tanpa internet.'
      : 'The FFmpeg engine (~32 MB) is not cached for offline use yet. Connect to the internet once (or click "Download Full Offline Engines" in Privacy & How It Works) to enable offline audio/video conversion.';
  }

  if (lower.includes('memory') || lower.includes('oom') || lower.includes('out of bounds')) {
    return lang === 'id'
      ? 'Memori browser tidak mencukupi untuk file ini. Coba turunkan resolusi ke 480p atau gunakan klip yang lebih pendek.'
      : 'Browser ran out of memory for this file. Try lowering resolution to 480p or using a shorter clip.';
  }

  if (lower.includes('terminated')) {
    return lang === 'id' ? 'Konversi dibatalkan.' : 'Conversion canceled.';
  }

  if (lower.includes('exited with status')) {
    return lang === 'id'
      ? 'Codec atau format file ini tidak didukung untuk konversi yang dipilih. Coba format tujuan lain (misal MP4 atau MP3).'
      : 'This file codec or format could not be converted to the selected output. Try another output format (e.g. MP4 or MP3).';
  }

  return raw;
}

export async function preloadMediaEngine(): Promise<void> {
  await getFFmpeg();
}

export function cancelActiveMediaConversion(): void {
  cancelTokenCounter += 1;
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate();
    } catch {
      // Ignore termination cleanup errors
    }
    ffmpegInstance = null;
  }
  ffmpegLoadingPromise = null;
}

async function getFFmpeg(onStageChange?: (stage: 'loading' | 'ready') => void): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    onStageChange?.('ready');
    return ffmpegInstance;
  }

  onStageChange?.('loading');

  if (!ffmpegLoadingPromise) {
    ffmpegLoadingPromise = (async () => {
      const instance = new FFmpeg();
      const base = `${window.location.origin}/ffmpeg`;
      const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm');
      await instance.load({ coreURL, wasmURL });
      ffmpegInstance = instance;
      return instance;
    })().catch((err) => {
      ffmpegLoadingPromise = null;
      throw err;
    });
  }

  const loaded = await ffmpegLoadingPromise;
  onStageChange?.('ready');
  return loaded;
}

export async function probeMediaDuration(file: File): Promise<number | null> {
  if (typeof document === 'undefined') return null;

  const isAudio = file.type.startsWith('audio/');
  const el = document.createElement(isAudio ? 'audio' : 'video');
  const url = URL.createObjectURL(file);

  return new Promise((resolve) => {
    const cleanup = () => {
      el.removeAttribute('src');
      el.load();
      URL.revokeObjectURL(url);
    };

    const timer = window.setTimeout(() => {
      cleanup();
      resolve(null);
    }, 5000);

    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      window.clearTimeout(timer);
      const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
      cleanup();
      resolve(duration);
    };
    el.onerror = () => {
      window.clearTimeout(timer);
      cleanup();
      resolve(null);
    };
    el.src = url;
  });
}

async function execSinglePass(
  ffmpeg: FFmpeg,
  outputPath: string,
  args: string[],
  tokenAtStart: number,
  onProgress?: (pct: number) => void,
): Promise<Uint8Array> {
  const progressHandler = ({ progress }: { progress: number }) => {
    if (cancelTokenCounter !== tokenAtStart) return;
    if (Number.isFinite(progress)) {
      const pct = Math.max(1, Math.min(99, Math.round(progress * 100)));
      onProgress?.(pct);
    }
  };

  ffmpeg.on('progress', progressHandler);
  try {
    const exitCode = await ffmpeg.exec(args);
    if (cancelTokenCounter !== tokenAtStart) {
      throw new ConversionCanceledError();
    }
    if (exitCode !== 0) {
      throw new Error(`FFmpeg exited with status ${exitCode}.`);
    }

    const fileData = await ffmpeg.readFile(outputPath);
    const bytes = fileData instanceof Uint8Array ? fileData : new TextEncoder().encode(String(fileData));
    const bufferCopy = new Uint8Array(bytes.byteLength);
    bufferCopy.set(bytes);
    return bufferCopy;
  } finally {
    ffmpeg.off('progress', progressHandler);
    await ffmpeg.deleteFile(outputPath).catch(() => {});
  }
}

export async function convertMediaFile(
  file: File,
  options: AudioConversionOptions | VideoConversionOptions,
  callbacks?: {
    onStage?: (stage: 'loading-engine' | 'processing') => void;
    onProgress?: (progress: number) => void;
  },
  overrideFilename?: string,
  signal?: AbortSignal,
): Promise<ConversionResult> {
  throwIfAborted(signal);
  if (hasInvalidTrimRange(options.trimStartSec, options.trimEndSec)) {
    throw new Error('Invalid trim range: end time must be greater than start time.');
  }

  const tokenAtStart = cancelTokenCounter;
  const onAbort = () => {
    cancelActiveMediaConversion();
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const ffmpeg = await getFFmpeg((stage) => {
      if (stage === 'loading') callbacks?.onStage?.('loading-engine');
      if (stage === 'ready') callbacks?.onStage?.('processing');
    });

    if (cancelTokenCounter !== tokenAtStart || signal?.aborted) {
      throw new ConversionCanceledError();
    }

    const durationSeconds = await probeMediaDuration(file);
    if (cancelTokenCounter !== tokenAtStart || signal?.aborted) {
      throw new ConversionCanceledError();
    }

    const uniqueToken = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const inputExt = getExtension(file.name) || 'bin';
    const inputPath = `in_${uniqueToken}.${inputExt}`;
    const outputPath = `out_${uniqueToken}.${options.format}`;

    try {
      await ffmpeg.writeFile(inputPath, await fetchFile(file));

      let effectiveOptions: AudioConversionOptions | VideoConversionOptions = options;
      if (options.format === 'gif' && 'gifFps' in options) {
        const effDur = computeEffectiveDuration(
          durationSeconds,
          options.trimStartSec ?? null,
          options.trimEndSec ?? null,
        );
        const initial = estimateInitialGifSettings(
          options.targetSizeBytes,
          effDur,
          options.gifFps,
          options.gifWidth,
        );
        effectiveOptions = {
          ...options,
          gifFps: initial.fps,
          gifWidth: initial.width,
        };
      }

      let args = buildFfmpegArgs(inputPath, outputPath, effectiveOptions, durationSeconds);
      let bestBytes = await execSinglePass(
        ffmpeg,
        outputPath,
        args,
        tokenAtStart,
        callbacks?.onProgress,
      );

      // Adaptive second pass for GIF target size if first pass still exceeded budget
      if (
        effectiveOptions.format === 'gif' &&
        'gifFps' in effectiveOptions &&
        effectiveOptions.targetSizeBytes &&
        bestBytes.byteLength > effectiveOptions.targetSizeBytes
      ) {
        const retryOpts: VideoConversionOptions = {
          ...effectiveOptions,
          gifFps: Math.max(6, Math.round(effectiveOptions.gifFps * 0.7)),
          gifWidth: Math.max(220, Math.round(effectiveOptions.gifWidth * 0.7)),
        };
        args = buildFfmpegArgs(inputPath, outputPath, retryOpts, durationSeconds);
        const smallerBytes = await execSinglePass(
          ffmpeg,
          outputPath,
          args,
          tokenAtStart,
          callbacks?.onProgress,
        );
        if (smallerBytes.byteLength < bestBytes.byteLength) {
          bestBytes = smallerBytes;
        }
      } else if (
        (effectiveOptions.format === 'mp4' || effectiveOptions.format === 'webm') &&
        'resolution' in effectiveOptions &&
        effectiveOptions.targetSizeBytes &&
        durationSeconds &&
        bestBytes.byteLength > effectiveOptions.targetSizeBytes
      ) {
        // Adaptive second pass for MP4/WebM when first pass overshoots target size
        const overshootRatio = effectiveOptions.targetSizeBytes / bestBytes.byteLength;
        const tightenedTarget = Math.max(
          16 * 1024,
          Math.floor(effectiveOptions.targetSizeBytes * overshootRatio * 0.9),
        );
        const retryOpts: VideoConversionOptions = {
          ...effectiveOptions,
          resolution: '480p',
          targetSizeBytes: tightenedTarget,
        };
        args = buildFfmpegArgs(inputPath, outputPath, retryOpts, durationSeconds);
        const smallerBytes = await execSinglePass(
          ffmpeg,
          outputPath,
          args,
          tokenAtStart,
          callbacks?.onProgress,
        );
        if (smallerBytes.byteLength < bestBytes.byteLength) {
          bestBytes = smallerBytes;
        }
      }

      const blob = new Blob([bestBytes.buffer as ArrayBuffer], {
        type: MEDIA_MIME_MAP[options.format] || 'application/octet-stream',
      });
      const filename = overrideFilename || getOutputFilename(file.name, options.format);
      callbacks?.onProgress?.(100);

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
    } catch (err) {
      if (cancelTokenCounter !== tokenAtStart || signal?.aborted) {
        throw new ConversionCanceledError();
      }
      throw err;
    } finally {
      await ffmpeg.deleteFile(inputPath).catch(() => {});
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
