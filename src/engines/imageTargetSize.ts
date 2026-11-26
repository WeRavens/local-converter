import { throwIfAborted } from './types';

export interface EncodedCandidate {
  blob: Blob;
  width: number;
  height: number;
  quality: number;
}

export interface TargetSizeOptimizationResult extends EncodedCandidate {
  targetMet: boolean;
  iterations: number;
}

export type EncodeCandidateFn = (
  quality: number,
  scale: number,
) => Promise<EncodedCandidate>;

/**
 * Finds the highest-quality encoded image that stays <= targetBytes.
 * Uses binary search on quality first, then progressively scales dimensions down
 * if the minimum quality still exceeds targetBytes (or for lossless formats like PNG).
 */
export async function optimizeImageToTargetSize(
  encode: EncodeCandidateFn,
  targetBytes: number,
  initialQuality: number,
  isLossless: boolean,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<TargetSizeOptimizationResult> {
  throwIfAborted(signal);
  const safeTarget = Math.max(1024, targetBytes);
  let iterations = 0;

  // Step 1: Try full scale with requested quality first
  const startQuality = isLossless ? 1 : Math.min(0.95, Math.max(0.08, initialQuality));
  let bestCandidate = await encode(startQuality, 1);
  throwIfAborted(signal);
  iterations += 1;
  onProgress?.(25);

  if (bestCandidate.blob.size <= safeTarget) {
    return { ...bestCandidate, targetMet: true, iterations };
  }

  // Step 2: Binary search on quality at scale = 1 for lossy formats
  let bestFitting: EncodedCandidate | null = null;
  let smallestSeen = bestCandidate;

  if (!isLossless) {
    let low = 0.08;
    let high = startQuality;

    for (let step = 0; step < 7; step += 1) {
      throwIfAborted(signal);
      const mid = Number(((low + high) / 2).toFixed(3));
      const candidate = await encode(mid, 1);
      throwIfAborted(signal);
      iterations += 1;
      onProgress?.(Math.min(75, 25 + (step + 1) * 7));

      if (candidate.blob.size < smallestSeen.blob.size) {
        smallestSeen = candidate;
      }

      if (candidate.blob.size <= safeTarget) {
        bestFitting = candidate;
        low = mid;
      } else {
        high = mid;
      }

      if (high - low < 0.025) {
        break;
      }
    }
  }

  if (bestFitting) {
    return { ...bestFitting, targetMet: true, iterations };
  }

  // Step 3: Progressive dimension downscale fallback (for PNG or extreme target sizes)
  let scale = 0.85;
  const fallbackQuality = isLossless ? 1 : 0.65;

  for (let attempt = 0; attempt < 8 && scale >= 0.15; attempt += 1) {
    throwIfAborted(signal);
    const candidate = await encode(fallbackQuality, scale);
    throwIfAborted(signal);
    iterations += 1;
    onProgress?.(Math.min(95, 75 + (attempt + 1) * 3));

    if (candidate.blob.size < smallestSeen.blob.size) {
      smallestSeen = candidate;
    }

    if (candidate.blob.size <= safeTarget) {
      // One quick bump upward on quality if lossy to keep crispness
      if (!isLossless) {
        throwIfAborted(signal);
        const sharper = await encode(0.78, scale);
        throwIfAborted(signal);
        iterations += 1;
        if (sharper.blob.size <= safeTarget) {
          return { ...sharper, targetMet: true, iterations };
        }
      }
      return { ...candidate, targetMet: true, iterations };
    }

    scale *= 0.82;
  }

  return { ...smallestSeen, targetMet: false, iterations };
}
