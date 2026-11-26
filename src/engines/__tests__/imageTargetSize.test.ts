import { describe, expect, it } from 'vitest';
import { optimizeImageToTargetSize } from '../imageTargetSize';

describe('optimizeImageToTargetSize', () => {
  it('returns immediately when initial quality already meets target size', async () => {
    const encode = async (quality: number, scale: number) => ({
      blob: new Blob([new Uint8Array(Math.round(40_000 * quality * scale))]),
      width: Math.round(1000 * scale),
      height: Math.round(800 * scale),
      quality,
    });

    const res = await optimizeImageToTargetSize(encode, 50_000, 0.85, false);
    expect(res.targetMet).toBe(true);
    expect(res.iterations).toBe(1);
    expect(res.blob.size).toBeLessThanOrEqual(50_000);
  });

  it('binary-searches quality to fit under target size without unnecessary scaling', async () => {
    // Simulated monotonic size curve: size = 1000 KB * quality * scale^2
    const encode = async (quality: number, scale: number) => {
      const size = Math.round(1_000_000 * quality * scale * scale);
      return {
        blob: new Blob([new Uint8Array(size)]),
        width: Math.round(1600 * scale),
        height: Math.round(1200 * scale),
        quality,
      };
    };

    const target = 300_000;
    const res = await optimizeImageToTargetSize(encode, target, 0.9, false);

    expect(res.targetMet).toBe(true);
    expect(res.blob.size).toBeLessThanOrEqual(target);
    // Should still keep good quality (~0.28 - 0.30) and full width
    expect(res.width).toBe(1600);
    expect(res.quality).toBeGreaterThanOrEqual(0.25);
  });

  it('falls back to dimension scaling when lossless or minimum quality still exceeds target', async () => {
    // Simulated lossless PNG where quality doesn't reduce size, only scale does
    const encode = async (quality: number, scale: number) => {
      const size = Math.round(800_000 * scale * scale);
      return {
        blob: new Blob([new Uint8Array(size)]),
        width: Math.round(2000 * scale),
        height: Math.round(2000 * scale),
        quality,
      };
    };

    const target = 200_000;
    const res = await optimizeImageToTargetSize(encode, target, 1, true);

    expect(res.targetMet).toBe(true);
    expect(res.blob.size).toBeLessThanOrEqual(target);
    expect(res.width).toBeLessThan(2000);
  });

  it('reports targetMet=false and returns smallest candidate if target is impossible', async () => {
    // Minimum possible size is always 50 KB regardless of scale/quality
    const encode = async (quality: number, scale: number) => ({
      blob: new Blob([new Uint8Array(50_000 + Math.round(10_000 * scale))]),
      width: Math.round(100 * scale),
      height: Math.round(100 * scale),
      quality,
    });

    const res = await optimizeImageToTargetSize(encode, 5_000, 0.8, false);
    expect(res.targetMet).toBe(false);
    expect(res.blob.size).toBeLessThanOrEqual(60_000);
  });
});
