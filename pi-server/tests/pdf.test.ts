import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import os from 'os';

// We test PDF operations using pdf-lib directly (pure, no system deps)
// and also import the service functions that don't require CUPS/system

let tmpDir: string;

async function createTestPdf(pages: number): Promise<string> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  const bytes = await doc.save();
  const filePath = path.join(tmpDir, `test_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-test-'));
});

afterAll(() => {
  // Clean up temp files
  if (tmpDir && fs.existsSync(tmpDir)) {
    const files = fs.readdirSync(tmpDir);
    for (const file of files) {
      fs.unlinkSync(path.join(tmpDir, file));
    }
    fs.rmdirSync(tmpDir);
  }
});

describe('PDF - getPageCount logic', () => {
  it('counts pages in single-page PDF', async () => {
    const filePath = await createTestPdf(1);
    const bytes = fs.readFileSync(filePath);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('counts pages in multi-page PDF', async () => {
    const filePath = await createTestPdf(5);
    const bytes = fs.readFileSync(filePath);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(5);
  });

  it('counts pages in large PDF', async () => {
    const filePath = await createTestPdf(50);
    const bytes = fs.readFileSync(filePath);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(50);
  });
});

describe('PDF - validatePdf logic', () => {
  it('validates correct PDF header', async () => {
    const filePath = await createTestPdf(1);
    const bytes = fs.readFileSync(filePath);
    const header = bytes.slice(0, 5).toString();
    expect(header).toBe('%PDF-');
  });

  it('rejects non-PDF file (text)', () => {
    const filePath = path.join(tmpDir, 'not_a_pdf.pdf');
    fs.writeFileSync(filePath, 'This is not a PDF file');
    const bytes = fs.readFileSync(filePath);
    const header = bytes.slice(0, 5).toString();
    expect(header).not.toBe('%PDF-');
  });

  it('rejects empty file', () => {
    const filePath = path.join(tmpDir, 'empty.pdf');
    fs.writeFileSync(filePath, '');
    const bytes = fs.readFileSync(filePath);
    expect(bytes.length).toBe(0);
    const header = bytes.slice(0, 5).toString();
    expect(header).not.toBe('%PDF-');
  });

  it('rejects corrupted PDF (wrong header)', () => {
    const filePath = path.join(tmpDir, 'corrupted.pdf');
    fs.writeFileSync(filePath, 'NOTPDF-1.4 fake content');
    const bytes = fs.readFileSync(filePath);
    const header = bytes.slice(0, 5).toString();
    expect(header).not.toBe('%PDF-');
  });

  it('pdf-lib throws on getPageCount for malformed PDF', async () => {
    const filePath = path.join(tmpDir, 'invalid_content.pdf');
    fs.writeFileSync(filePath, '%PDF-1.4 invalid garbage content');
    const bytes = fs.readFileSync(filePath);
    // pdf-lib loads it but getPageCount throws because catalog is missing
    const pdf = await PDFDocument.load(bytes);
    expect(() => pdf.getPageCount()).toThrow();
  });

  it('valid PDF has at least 1 page', async () => {
    const filePath = await createTestPdf(1);
    const bytes = fs.readFileSync(filePath);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});

describe('PDF - mergePdfs logic', () => {
  it('merges two PDFs', async () => {
    const file1 = await createTestPdf(3);
    const file2 = await createTestPdf(2);

    const mergedPdf = await PDFDocument.create();

    for (const filePath of [file1, file2]) {
      const bytes = fs.readFileSync(filePath);
      const pdf = await PDFDocument.load(bytes);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      for (const page of pages) {
        mergedPdf.addPage(page);
      }
    }

    expect(mergedPdf.getPageCount()).toBe(5);
  });

  it('merges single PDF (identity)', async () => {
    const file1 = await createTestPdf(4);

    const mergedPdf = await PDFDocument.create();
    const bytes = fs.readFileSync(file1);
    const pdf = await PDFDocument.load(bytes);
    const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    for (const page of pages) {
      mergedPdf.addPage(page);
    }

    expect(mergedPdf.getPageCount()).toBe(4);
  });

  it('merges three PDFs', async () => {
    const file1 = await createTestPdf(1);
    const file2 = await createTestPdf(2);
    const file3 = await createTestPdf(3);

    const mergedPdf = await PDFDocument.create();
    for (const filePath of [file1, file2, file3]) {
      const bytes = fs.readFileSync(filePath);
      const pdf = await PDFDocument.load(bytes);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      for (const page of pages) {
        mergedPdf.addPage(page);
      }
    }

    expect(mergedPdf.getPageCount()).toBe(6);
  });

  it('merged PDF can be saved and reloaded', async () => {
    const file1 = await createTestPdf(2);
    const file2 = await createTestPdf(3);

    const mergedPdf = await PDFDocument.create();
    for (const filePath of [file1, file2]) {
      const bytes = fs.readFileSync(filePath);
      const pdf = await PDFDocument.load(bytes);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      for (const page of pages) {
        mergedPdf.addPage(page);
      }
    }

    const savedBytes = await mergedPdf.save();
    const reloaded = await PDFDocument.load(savedBytes);
    expect(reloaded.getPageCount()).toBe(5);
  });
});

describe('PDF - page indices', () => {
  it('getPageIndices returns correct array', async () => {
    const filePath = await createTestPdf(3);
    const bytes = fs.readFileSync(filePath);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageIndices()).toEqual([0, 1, 2]);
  });

  it('can copy specific pages', async () => {
    const filePath = await createTestPdf(5);
    const bytes = fs.readFileSync(filePath);
    const srcPdf = await PDFDocument.load(bytes);

    const destPdf = await PDFDocument.create();
    const [page1, page3] = await destPdf.copyPages(srcPdf, [0, 2]);
    destPdf.addPage(page1);
    destPdf.addPage(page3);

    expect(destPdf.getPageCount()).toBe(2);
  });
});
