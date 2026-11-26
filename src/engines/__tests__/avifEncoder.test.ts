import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeAvifFromImageData, encodeCanvasToAvifBlob } from '../avifEncoder';

describe('avifEncoder', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses native canvas AVIF encoding directly when the browser returns image/avif', async () => {
    const fakeNativeBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/avif' });
    const mockCanvas = {
      width: 4,
      height: 4,
      convertToBlob: vi.fn(async () => fakeNativeBlob),
    } as unknown as OffscreenCanvas;
    const mockCtx = {
      getImageData: vi.fn(),
    } as unknown as OffscreenCanvasRenderingContext2D;

    const result = await encodeCanvasToAvifBlob(mockCanvas, mockCtx, 0.8);
    expect(result).toBe(fakeNativeBlob);
    expect(mockCtx.getImageData).not.toHaveBeenCalled();
  });

  it('encodes RGBA ImageData to a valid ISO-BMFF AVIF bitstream via local WASM fallback', async () => {
    const fsSpec = ['node', 'fs'].join(':');
    const pathSpec = ['node', 'path'].join(':');
    const fs = (await import(/* @vite-ignore */ fsSpec)) as {
      readFileSync: (p: string) => Uint8Array;
    };
    const path = (await import(/* @vite-ignore */ pathSpec)) as {
      resolve: (...parts: string[]) => string;
    };
    const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd();
    const wasmPath = path.resolve(cwd, 'public/avif/avif_enc.wasm');
    const wasmBytes = fs.readFileSync(wasmPath);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength),
      })),
    );

    const width = 4;
    const height = 4;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 255;
      rgba[i + 1] = 84;
      rgba[i + 2] = 22;
      rgba[i + 3] = 255;
    }

    const imageData = {
      data: rgba,
      width,
      height,
      colorSpace: 'srgb',
    } as ImageData;

    const blob = await encodeAvifFromImageData(imageData, 0.75);
    expect(blob.type).toBe('image/avif');
    expect(blob.size).toBeGreaterThan(16);

    const headerBytes = new Uint8Array(await blob.arrayBuffer());
    const ftyp = String.fromCharCode(...headerBytes.slice(4, 8));
    const brand = String.fromCharCode(...headerBytes.slice(8, 12));
    expect(ftyp).toBe('ftyp');
    expect(brand).toBe('avif');
  });
});
