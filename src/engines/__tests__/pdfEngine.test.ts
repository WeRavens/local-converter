import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractPdfPages, mergePdfFiles, processPdfFile } from '../pdfEngine';
import { ConversionCanceledError } from '../types';

async function makeTestPdfFile(name: string, pageCount: number): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    doc.addPage([595, 842]);
  }
  const bytes = await doc.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy.buffer], name, { type: 'application/pdf' });
}

describe('pdfEngine', () => {
  beforeEach(() => {
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn(() => 'blob:mock-pdf');
    } else {
      vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock-pdf');
    }
  });

  it('rejects single-file merge instead of falling back to raster compression', async () => {
    const single = await makeTestPdfFile('one.pdf', 2);
    await expect(
      processPdfFile(single, {
        operation: 'merge',
        imageFormat: 'jpg',
        targetSizeBytes: null,
        pageRange: '',
      }),
    ).rejects.toThrow(/at least 2 pdf/i);
  });

  it('merges multiple PDFs into a combined PDF preserving total pages', async () => {
    const pdfA = await makeTestPdfFile('a.pdf', 2);
    const pdfB = await makeTestPdfFile('b.pdf', 3);

    const res = await mergePdfFiles([pdfA, pdfB], undefined, 'combined.pdf');
    expect(res.filename).toBe('combined.pdf');

    const mergedDoc = await PDFDocument.load(await res.blob.arrayBuffer());
    expect(mergedDoc.getPageCount()).toBe(5);
  });

  it('extracts specified page ranges cleanly', async () => {
    const pdf = await makeTestPdfFile('book.pdf', 5);
    const res = await extractPdfPages(pdf, '2, 4-5');
    const outDoc = await PDFDocument.load(await res.blob.arrayBuffer());
    expect(outDoc.getPageCount()).toBe(3);
  });

  it('aborts cleanly with ConversionCanceledError when AbortSignal is aborted', async () => {
    const pdf = await makeTestPdfFile('cancel.pdf', 2);
    const controller = new AbortController();
    controller.abort();

    await expect(
      extractPdfPages(pdf, '1', undefined, undefined, controller.signal),
    ).rejects.toBeInstanceOf(ConversionCanceledError);
  });
});
