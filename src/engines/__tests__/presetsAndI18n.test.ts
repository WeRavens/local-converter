import { describe, expect, it } from 'vitest';
import { translations } from '../../i18n/translations';
import {
  applyBatchRenamePattern,
  computeCenterCropRect,
  computeReductionPercent,
  detectFileCategory,
  formatBytes,
  getOutputFilename,
  isHeicFile,
  parsePageRange,
  parseSvgDimensions,
} from '../formatUtils';
import { getBuiltInPresets } from '../presets';
import { matchToolRoute } from '../routes';

describe('formatUtils', () => {
  it('detects image, HEIC, pdf, audio, and video categories by mime or extension', () => {
    expect(detectFileCategory({ name: 'photo.jpg', type: 'image/jpeg' })).toBe('image');
    expect(detectFileCategory({ name: 'IMG_001.HEIC', type: '' })).toBe('image');
    expect(isHeicFile({ name: 'IMG_001.heif', type: '' })).toBe(true);
    expect(detectFileCategory({ name: 'vector.SVG', type: '' })).toBe('image');
    expect(detectFileCategory({ name: 'resume.pdf', type: 'application/pdf' })).toBe('pdf');
    expect(detectFileCategory({ name: 'movie.mkv', type: '' })).toBe('video');
    expect(detectFileCategory({ name: 'song.m4a', type: 'audio/mp4' })).toBe('audio');
    expect(detectFileCategory({ name: 'notes.txt', type: 'text/plain' })).toBeNull();
  });

  it('formats bytes and computes reductions cleanly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024 * 500)).toBe('500 KB');
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
    expect(computeReductionPercent(1000, 250)).toBe(75);
    expect(getOutputFilename('vacation.photo.png', 'webp')).toBe('vacation.photo.webp');
  });

  it('applies batch rename patterns with {nn}, {n}, {name} and plain prefixes', () => {
    expect(applyBatchRenamePattern('IMG_123.jpg', 'produk-{nn}', 0, 'webp')).toBe('produk-01.webp');
    expect(applyBatchRenamePattern('IMG_123.jpg', '{name}-min', 2, 'jpg')).toBe('IMG_123-min.jpg');
    expect(applyBatchRenamePattern('IMG_123.jpg', 'berkas', 1, 'pdf')).toBe('berkas-02.pdf');
    expect(applyBatchRenamePattern('IMG_123.jpg', '', 0, 'webp')).toBe('IMG_123.webp');
  });

  it('computes centered crop rects for aspect ratios', () => {
    expect(computeCenterCropRect(1600, 900, 'original')).toEqual({
      sx: 0,
      sy: 0,
      sw: 1600,
      sh: 900,
    });
    expect(computeCenterCropRect(1600, 900, '1:1')).toEqual({
      sx: 350,
      sy: 0,
      sw: 900,
      sh: 900,
    });
    expect(computeCenterCropRect(1000, 2000, '1:1')).toEqual({
      sx: 0,
      sy: 500,
      sw: 1000,
      sh: 1000,
    });
  });

  it('parses PDF 1-based page ranges into sorted 0-based indices', () => {
    expect(parsePageRange('', 4)).toEqual([0, 1, 2, 3]);
    expect(parsePageRange('1-3, 5, 99', 6)).toEqual([0, 1, 2, 4]);
    expect(parsePageRange('4-2', 5)).toEqual([1, 2, 3]);
  });
});

describe('i18n, presets, and deep-link routes', () => {
  it('keeps identical translation keys between Indonesian and English', () => {
    const idKeys = Object.keys(translations.id).sort();
    const enKeys = Object.keys(translations.en).sort();
    expect(idKeys).toEqual(enKeys);
  });

  it('provides localized built-in presets across image, audio, video, and pdf', () => {
    const presetsId = getBuiltInPresets('id');
    const presetsEn = getBuiltInPresets('en');
    expect(presetsId.some((p) => p.appliesTo === 'image')).toBe(true);
    expect(presetsId.some((p) => p.appliesTo === 'audio')).toBe(true);
    expect(presetsId.some((p) => p.appliesTo === 'video')).toBe(true);
    expect(presetsId.some((p) => p.appliesTo === 'pdf')).toBe(true);
    expect(presetsId[0].name).not.toBe(presetsEn[0].name);
  });

  it('matches tool deep-link routes cleanly', () => {
    expect(matchToolRoute('/jpg-to-webp')?.imageOptions?.format).toBe('webp');
    expect(matchToolRoute('/heic-to-jpg/')?.imageOptions?.format).toBe('jpg');
    expect(matchToolRoute('/kompres-pdf')?.pdfOptions?.operation).toBe('compress');
    expect(matchToolRoute('/mp4-to-mp3')?.videoOptions?.format).toBe('mp3');
    expect(matchToolRoute('/mp4-to-mp3')?.audioOptions?.format).toBe('mp3');
    expect(matchToolRoute('/unknown-path')).toBeNull();
  });

  it('parses SVG explicit and viewBox dimensions preserving aspect ratio', () => {
    expect(
      parseSvgDimensions('<svg width="400" height="200" viewBox="0 0 400 200"></svg>'),
    ).toEqual({ width: 1024, height: 512 });
    expect(
      parseSvgDimensions('<svg width="100%" viewBox="0 0 1600 900"></svg>'),
    ).toEqual({ width: 1600, height: 900 });
    expect(
      parseSvgDimensions('<svg viewBox="0, 0, 24, 12"></svg>'),
    ).toEqual({ width: 1024, height: 512 });
    expect(parseSvgDimensions('<div>not svg</div>')).toBeNull();
  });
});
