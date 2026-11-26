import { describe, expect, it } from 'vitest';
import { ConversionCanceledError, formatFriendlyMediaError } from '../mediaEngine';
import {
  buildFfmpegArgs,
  calculateTargetBitrates,
  estimateInitialGifSettings,
  hasInvalidTrimRange,
} from '../mediaMath';

describe('calculateTargetBitrates', () => {
  it('computes bounded audio bitrate for audio-only targets', () => {
    const res = calculateTargetBitrates(1.5 * 1024 * 1024, 60, true);
    expect(res.videoBitrateKbps).toBe(0);
    expect(res.audioBitrateKbps).toBeGreaterThanOrEqual(160);
    expect(res.audioBitrateKbps).toBeLessThanOrEqual(200);
  });

  it('caps audio bitrate at 320 kbps even for huge target sizes', () => {
    const res = calculateTargetBitrates(50 * 1024 * 1024, 10, true);
    expect(res.audioBitrateKbps).toBe(320);
  });

  it('splits video and audio bitrates with safe minimums for video targets', () => {
    const res = calculateTargetBitrates(15 * 1024 * 1024, 60, false, 128);
    expect(res.audioBitrateKbps).toBe(128);
    expect(res.videoBitrateKbps).toBeGreaterThan(1600);
    expect(res.videoBitrateKbps).toBeLessThan(2000);
  });
});

describe('estimateInitialGifSettings', () => {
  it('scales down FPS and width when GIF target size budget is tight', () => {
    const tight = estimateInitialGifSettings(500 * 1024, 10, 18, 640);
    expect(tight.fps).toBeLessThanOrEqual(8);
    expect(tight.width).toBeLessThanOrEqual(320);

    const relaxed = estimateInitialGifSettings(null, 10, 15, 640);
    expect(relaxed).toEqual({ fps: 15, width: 640 });
  });
});

describe('buildFfmpegArgs', () => {
  it('builds MP3 extraction arguments with -vn and libmp3lame', () => {
    const args = buildFfmpegArgs(
      'in.mp4',
      'out.mp3',
      {
        format: 'mp3',
        audioBitrateKbps: 192,
        resolution: '720p',
        targetSizeBytes: null,
        gifFps: 12,
        gifWidth: 480,
      },
      30,
    );

    expect(args).toContain('-vn');
    expect(args).toContain('libmp3lame');
    expect(args).toContain('192k');
    expect(args[args.length - 1]).toBe('out.mp3');
  });

  it('builds MP4 target size bitrate flags and 720p scale filter', () => {
    const args = buildFfmpegArgs(
      'in.mov',
      'out.mp4',
      {
        format: 'mp4',
        audioBitrateKbps: 128,
        resolution: '720p',
        targetSizeBytes: 10 * 1024 * 1024,
        gifFps: 12,
        gifWidth: 480,
      },
      60,
    );

    expect(args).toContain('-vf');
    expect(args).toContain("scale='min(1280,iw)':-2");
    expect(args).toContain('-b:v');
    expect(args).toContain('-maxrate');
    expect(args).toContain('+faststart');
  });

  it('builds palette-based GIF filter args', () => {
    const args = buildFfmpegArgs(
      'clip.mp4',
      'clip.gif',
      {
        format: 'gif',
        audioBitrateKbps: 128,
        resolution: 'original',
        targetSizeBytes: null,
        gifFps: 15,
        gifWidth: 640,
      },
      10,
    );

    const vfIdx = args.indexOf('-vf');
    expect(vfIdx).toBeGreaterThan(-1);
    expect(args[vfIdx + 1]).toContain('fps=15,scale=640:-1');
    expect(args[vfIdx + 1]).toContain('palettegen');
  });
});

describe('formatFriendlyMediaError', () => {
  it('translates memory errors and cancellation into localized friendly messages', () => {
    const oomId = formatFriendlyMediaError(new Error('RuntimeError: out of bounds memory access'), 'id');
    expect(oomId).toContain('480p');

    const canceledEn = formatFriendlyMediaError(new ConversionCanceledError(), 'en');
    expect(canceledEn).toContain('canceled');

    const offlineId = formatFriendlyMediaError(new Error('Failed to fetch'), 'id');
    expect(offlineId).toContain('offline');

    const trimEn = formatFriendlyMediaError(
      new Error('Invalid trim range: end time must be greater than start time.'),
      'en',
    );
    expect(trimEn).toContain('greater than trim start');
  });
});

describe('extreme target size bitrates, audio trim, and trim validation', () => {
  it('scales down video bitrates below 80 kbps and auto-caps resolution for tight targets', () => {
    const extreme = calculateTargetBitrates(1024 * 1024, 240, false, 128);
    expect(extreme.audioBitrateKbps).toBeLessThanOrEqual(48);
    expect(extreme.videoBitrateKbps).toBeLessThan(80);
    expect(extreme.videoBitrateKbps).toBeGreaterThanOrEqual(32);

    const args = buildFfmpegArgs(
      'long.mp4',
      'tiny.mp4',
      {
        format: 'mp4',
        audioBitrateKbps: 128,
        resolution: '1080p',
        targetSizeBytes: 1024 * 1024,
        gifFps: 12,
        gifWidth: 480,
      },
      240,
    );
    const vfIdx = args.indexOf('-vf');
    expect(vfIdx).toBeGreaterThan(-1);
    expect(args[vfIdx + 1]).toBe("scale='min(640,iw)':-2");
  });

  it('includes -ss and -t trim flags for audio conversions', () => {
    const args = buildFfmpegArgs(
      'voice.wav',
      'clip.mp3',
      {
        format: 'mp3',
        audioBitrateKbps: 192,
        targetSizeBytes: null,
        trimStartSec: 5,
        trimEndSec: 20,
      },
      60,
    );
    expect(args.slice(0, 6)).toEqual(['-ss', '5', '-i', 'voice.wav', '-t', '15']);
  });

  it('validates invalid trim ranges', () => {
    expect(hasInvalidTrimRange(15, 5)).toBe(true);
    expect(hasInvalidTrimRange(10, 10)).toBe(true);
    expect(hasInvalidTrimRange(5, 15)).toBe(false);
    expect(hasInvalidTrimRange(5, null)).toBe(false);
  });
});
