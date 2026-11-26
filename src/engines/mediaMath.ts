import { AudioConversionOptions, VideoConversionOptions, VideoResolution } from './types';

export interface TargetBitrates {
  audioBitrateKbps: number;
  videoBitrateKbps: number;
}

const AUDIO_ONLY_FORMATS = new Set(['mp3', 'm4a', 'wav', 'ogg']);

export function isAudioOutputFormat(format: string): boolean {
  return AUDIO_ONLY_FORMATS.has(format);
}

export function hasInvalidTrimRange(
  trimStartSec?: number | null,
  trimEndSec?: number | null,
): boolean {
  return Boolean(
    trimStartSec != null &&
      trimEndSec != null &&
      Number.isFinite(trimStartSec) &&
      Number.isFinite(trimEndSec) &&
      trimEndSec <= trimStartSec,
  );
}

export function computeEffectiveDuration(
  fullDurationSeconds: number | null,
  trimStartSec: number | null,
  trimEndSec: number | null,
): number | null {
  const start = trimStartSec !== null && trimStartSec >= 0 ? trimStartSec : 0;
  if (trimEndSec !== null && trimEndSec > start) {
    const cappedEnd =
      fullDurationSeconds && fullDurationSeconds > 0
        ? Math.min(trimEndSec, fullDurationSeconds)
        : trimEndSec;
    return Math.max(0.5, cappedEnd - start);
  }
  if (fullDurationSeconds && fullDurationSeconds > 0) {
    return Math.max(0.5, fullDurationSeconds - start);
  }
  return null;
}

/**
 * Calculates target audio/video bitrates in kbps to fit within targetSizeBytes.
 * Uses an 8% safety margin for container/muxing overhead.
 */
export function calculateTargetBitrates(
  targetSizeBytes: number,
  durationSeconds: number,
  isAudioOnly: boolean,
  preferredAudioKbps = 128,
): TargetBitrates {
  const safeDuration = Math.max(0.5, durationSeconds);
  const safeBytes = Math.max(16 * 1024, targetSizeBytes);

  const totalBps = (safeBytes * 8 * 0.92) / safeDuration;
  const totalKbps = totalBps / 1000;

  if (isAudioOnly) {
    const audioKbps = Math.max(16, Math.min(320, Math.floor(totalKbps)));
    return { audioBitrateKbps: audioKbps, videoBitrateKbps: 0 };
  }

  if (totalKbps < 96) {
    const audioKbps = Math.max(24, Math.floor(totalKbps * 0.3));
    const videoKbps = Math.max(32, Math.floor(totalKbps - audioKbps));
    return { audioBitrateKbps: audioKbps, videoBitrateKbps: videoKbps };
  }

  if (totalKbps < 200) {
    const audioKbps = 48;
    const videoKbps = Math.max(45, Math.floor(totalKbps - audioKbps));
    return { audioBitrateKbps: audioKbps, videoBitrateKbps: videoKbps };
  }

  const audioKbps = totalKbps < 400 ? 64 : Math.min(128, preferredAudioKbps);
  const videoKbps = Math.max(80, Math.floor(totalKbps - audioKbps));

  return {
    audioBitrateKbps: audioKbps,
    videoBitrateKbps: videoKbps,
  };
}

export function estimateInitialGifSettings(
  targetSizeBytes: number | null,
  durationSeconds: number | null,
  requestedFps: number,
  requestedWidth: number,
): { fps: number; width: number } {
  if (!targetSizeBytes || targetSizeBytes <= 0) {
    return {
      fps: Math.max(5, Math.min(30, requestedFps)),
      width: Math.max(160, Math.min(1280, requestedWidth)),
    };
  }

  const dur = Math.max(1, durationSeconds ?? 5);
  const bytesPerSecBudget = targetSizeBytes / dur;

  let fps = requestedFps;
  let width = requestedWidth;

  if (bytesPerSecBudget < 120 * 1024) {
    fps = Math.min(fps, 8);
    width = Math.min(width, 320);
  } else if (bytesPerSecBudget < 300 * 1024) {
    fps = Math.min(fps, 10);
    width = Math.min(width, 400);
  } else if (bytesPerSecBudget < 600 * 1024) {
    fps = Math.min(fps, 12);
    width = Math.min(width, 480);
  }

  return {
    fps: Math.max(6, Math.min(24, fps)),
    width: Math.max(200, Math.min(1280, width)),
  };
}

function getScaleFilter(resolution: VideoResolution): string | null {
  switch (resolution) {
    case '1080p':
      return "scale='min(1920,iw)':-2";
    case '720p':
      return "scale='min(1280,iw)':-2";
    case '480p':
      return "scale='min(854,iw)':-2";
    default:
      return null;
  }
}

export function buildFfmpegArgs(
  inputName: string,
  outputName: string,
  options: AudioConversionOptions | VideoConversionOptions,
  durationSeconds: number | null,
): string[] {
  const format = options.format;
  const trimStart =
    'trimStartSec' in options && options.trimStartSec != null && options.trimStartSec > 0
      ? options.trimStartSec
      : null;
  const trimEnd =
    'trimEndSec' in options &&
    options.trimEndSec != null &&
    options.trimEndSec > (trimStart ?? 0)
      ? options.trimEndSec
      : null;

  const inputPrefix: string[] = [];
  if (trimStart !== null) {
    inputPrefix.push('-ss', String(trimStart));
  }
  inputPrefix.push('-i', inputName);
  if (trimEnd !== null) {
    const clipDuration = trimEnd - (trimStart ?? 0);
    inputPrefix.push('-t', String(clipDuration));
  }

  const effectiveDuration =
    'trimStartSec' in options
      ? computeEffectiveDuration(durationSeconds, options.trimStartSec ?? null, options.trimEndSec ?? null)
      : durationSeconds;

  // 1. GIF animation export
  if (format === 'gif' && 'gifFps' in options) {
    const fps = Math.max(5, Math.min(30, options.gifFps));
    const width = Math.max(160, Math.min(1280, options.gifWidth));
    return [
      ...inputPrefix,
      '-vf',
      `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      '-loop',
      '0',
      outputName,
    ];
  }

  // 2. Audio extraction / conversion
  if (isAudioOutputFormat(format)) {
    let bitrateKbps = options.audioBitrateKbps;
    if (options.targetSizeBytes && effectiveDuration && format !== 'wav') {
      bitrateKbps = calculateTargetBitrates(
        options.targetSizeBytes,
        effectiveDuration,
        true,
        options.audioBitrateKbps,
      ).audioBitrateKbps;
    }

    const base = [...inputPrefix, '-vn'];

    switch (format) {
      case 'mp3':
        return [...base, '-c:a', 'libmp3lame', '-b:a', `${bitrateKbps}k`, outputName];
      case 'm4a':
        return [...base, '-c:a', 'aac', '-b:a', `${bitrateKbps}k`, '-movflags', '+faststart', outputName];
      case 'ogg':
        return [...base, '-c:a', 'libvorbis', '-b:a', `${bitrateKbps}k`, outputName];
      case 'wav':
        return [...base, '-c:a', 'pcm_s16le', outputName];
    }
  }

  // 3. Video compression / transcoding (MP4 or WebM)
  const videoOpts = options as VideoConversionOptions;
  const args = [...inputPrefix];
  const useTargetBitrate = Boolean(videoOpts.targetSizeBytes && effectiveDuration);
  const targetBitrates =
    useTargetBitrate && videoOpts.targetSizeBytes && effectiveDuration
      ? calculateTargetBitrates(
          videoOpts.targetSizeBytes,
          effectiveDuration,
          false,
          videoOpts.audioBitrateKbps,
        )
      : null;

  let scaleFilter = getScaleFilter(videoOpts.resolution);
  if (targetBitrates) {
    if (targetBitrates.videoBitrateKbps < 140) {
      scaleFilter = "scale='min(640,iw)':-2";
    } else if (targetBitrates.videoBitrateKbps < 250 && (videoOpts.resolution === 'original' || videoOpts.resolution === '1080p' || videoOpts.resolution === '720p')) {
      scaleFilter = "scale='min(854,iw)':-2";
    }
  }
  if (scaleFilter) {
    args.push('-vf', scaleFilter);
  }

  if (format === 'mp4') {
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p');
    if (targetBitrates) {
      args.push(
        '-b:v',
        `${targetBitrates.videoBitrateKbps}k`,
        '-maxrate',
        `${Math.round(targetBitrates.videoBitrateKbps * 1.15)}k`,
        '-bufsize',
        `${Math.round(targetBitrates.videoBitrateKbps * 2)}k`,
        '-c:a',
        'aac',
        '-b:a',
        `${targetBitrates.audioBitrateKbps}k`,
      );
    } else {
      args.push('-crf', '24', '-c:a', 'aac', '-b:a', `${videoOpts.audioBitrateKbps}k`);
    }
    args.push('-movflags', '+faststart', outputName);
    return args;
  }

  // WebM
  args.push('-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '4');
  if (targetBitrates) {
    args.push(
      '-b:v',
      `${targetBitrates.videoBitrateKbps}k`,
      '-c:a',
      'libvorbis',
      '-b:a',
      `${targetBitrates.audioBitrateKbps}k`,
    );
  } else {
    args.push('-crf', '30', '-b:v', '1200k', '-c:a', 'libvorbis', '-b:a', `${videoOpts.audioBitrateKbps}k`);
  }
  args.push(outputName);
  return args;
}
