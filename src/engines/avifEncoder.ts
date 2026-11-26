import type { AVIFModule } from '@jsquash/avif/codec/enc/avif_enc.js';
import { defaultOptions } from '@jsquash/avif/meta.js';
import { initEmscriptenModule } from '@jsquash/avif/utils.js';

let avifModulePromise: Promise<AVIFModule> | null = null;
let nativeAvifSupportCache: boolean | null = null;

function getOrigin(): string {
  if (typeof self !== 'undefined' && self.location?.origin && self.location.origin !== 'null') {
    return self.location.origin;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

export async function isNativeAvifCanvasSupported(): Promise<boolean> {
  if (nativeAvifSupportCache !== null) return nativeAvifSupportCache;
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const oc = new OffscreenCanvas(4, 4);
      oc.getContext('2d');
      const blob = await oc.convertToBlob({ type: 'image/avif', quality: 0.8 });
      nativeAvifSupportCache = Boolean(blob && blob.type === 'image/avif');
      return nativeAvifSupportCache;
    }
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 4;
      canvas.height = 4;
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/avif', 0.8),
      );
      nativeAvifSupportCache = Boolean(blob && blob.type === 'image/avif');
      return nativeAvifSupportCache;
    }
  } catch {
    nativeAvifSupportCache = false;
  }
  nativeAvifSupportCache = false;
  return false;
}

export async function isAvifSupportedInEnvironment(): Promise<boolean> {
  if (typeof WebAssembly === 'object') return true;
  return isNativeAvifCanvasSupported();
}

export async function ensureAvifEncoderModule(): Promise<AVIFModule> {
  if (!avifModulePromise) {
    avifModulePromise = (async () => {
      const [{ default: avifEncFactory }, wasmResp] = await Promise.all([
        import('@jsquash/avif/codec/enc/avif_enc.js'),
        fetch(`${getOrigin()}/avif/avif_enc.wasm`),
      ]);
      if (!wasmResp.ok) {
        throw new Error(`Failed to fetch AVIF encoder WASM (${wasmResp.status}).`);
      }
      const wasmBytes = await wasmResp.arrayBuffer();
      const wasmModule = await WebAssembly.compile(wasmBytes);
      return initEmscriptenModule(avifEncFactory, wasmModule);
    })().catch((err) => {
      avifModulePromise = null;
      throw err;
    });
  }
  return avifModulePromise;
}

export async function encodeAvifFromImageData(
  imageData: ImageData,
  qualityZeroToOne: number,
): Promise<Blob> {
  const mod = await ensureAvifEncoderModule();
  const quality = Math.max(1, Math.min(100, Math.round(qualityZeroToOne * 100)));
  const pixels = new Uint8Array(
    imageData.data.buffer,
    imageData.data.byteOffset,
    imageData.data.byteLength,
  );
  const encoded = mod.encode(pixels, imageData.width, imageData.height, {
    ...defaultOptions,
    quality,
    speed: 7,
  });
  if (!encoded) {
    throw new Error('AVIF WebAssembly encoder failed to encode image.');
  }
  const copy = new Uint8Array(encoded.byteLength);
  copy.set(encoded);
  return new Blob([copy.buffer], { type: 'image/avif' });
}

export async function encodeCanvasToAvifBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  qualityZeroToOne: number,
): Promise<Blob> {
  const tryNative = nativeAvifSupportCache !== false;
  if (tryNative) {
    try {
      let nativeBlob: Blob | null = null;
      if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
        nativeBlob = await canvas.convertToBlob({ type: 'image/avif', quality: qualityZeroToOne });
      } else if ('toBlob' in canvas && typeof canvas.toBlob === 'function') {
        nativeBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/avif', qualityZeroToOne),
        );
      }
      if (nativeBlob && nativeBlob.type === 'image/avif') {
        nativeAvifSupportCache = true;
        return nativeBlob;
      }
      nativeAvifSupportCache = false;
    } catch {
      nativeAvifSupportCache = false;
    }
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return encodeAvifFromImageData(imageData, qualityZeroToOne);
}
