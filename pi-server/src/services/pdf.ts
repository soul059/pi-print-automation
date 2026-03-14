import fs from 'fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import { logger } from '../config/logger';

export async function getPageCount(filePath: string): Promise<number> {
  const bytes = fs.readFileSync(filePath);
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return pdf.getPageCount();
}

export async function validatePdf(filePath: string): Promise<{ valid: boolean; error?: string; pages?: number }> {
  try {
    const bytes = fs.readFileSync(filePath);
    // Check magic bytes
    const header = bytes.slice(0, 5).toString();
    if (header !== '%PDF-') {
      return { valid: false, error: 'File is not a valid PDF' };
    }

    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = pdf.getPageCount();
    if (pages === 0) {
      return { valid: false, error: 'PDF has no pages' };
    }

    return { valid: true, pages };
  } catch (err: any) {
    logger.error({ err: err.message }, 'PDF validation failed');
    return { valid: false, error: 'Failed to parse PDF file' };
  }
}

export interface IdentityPageData {
  userName: string;
  userEmail: string;
  jobId: string;
  printMode: 'now' | 'later';
  maskEmail?: boolean;
}

function maskEmailAddress(email: string): string {
  const [local, domain] = email.split('@');
  if (local.length <= 3) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 3)}***@${domain}`;
}

export async function appendIdentityPage(
  filePath: string,
  data: IdentityPageData
): Promise<string> {
  const bytes = fs.readFileSync(filePath);
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Generate QR code as PNG
  const qrDataUrl = await QRCode.toDataURL(data.jobId, {
    width: 150,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  const qrImageBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64');
  const qrImage = await pdf.embedPng(qrImageBytes);

  // A4 page dimensions
  const page = pdf.addPage([595.28, 841.89]);
  const { height } = page.getSize();

  const displayEmail = data.maskEmail ? maskEmailAddress(data.userEmail) : data.userEmail;
  const modeLabel = data.printMode === 'later' ? 'COLLECT LATER' : 'INSTANT PRINT';
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // Header bar
  page.drawRectangle({
    x: 0, y: height - 80, width: 595.28, height: 80,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText('PRINT JOB RECEIPT', {
    x: 50, y: height - 55, size: 28, font: boldFont, color: rgb(1, 1, 1),
  });

  // Divider
  let y = height - 120;

  const drawField = (label: string, value: string) => {
    page.drawText(label, { x: 50, y, size: 12, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(value, { x: 200, y, size: 14, font, color: rgb(0, 0, 0) });
    y -= 35;
  };

  drawField('Job ID:', data.jobId);
  drawField('Name:', data.userName);
  drawField('Email:', displayEmail);
  drawField('Mode:', modeLabel);
  drawField('Printed At:', timestamp);

  // QR code
  y -= 20;
  page.drawText('Scan to verify:', { x: 50, y, size: 12, font, color: rgb(0.3, 0.3, 0.3) });
  y -= 160;
  page.drawImage(qrImage, { x: 50, y, width: 150, height: 150 });

  // Footer
  page.drawText('This page was automatically appended by the Print Service.', {
    x: 50, y: 50, size: 9, font, color: rgb(0.5, 0.5, 0.5),
  });

  const outputPath = filePath.replace(/\.pdf$/i, '_print.pdf');
  const modifiedBytes = await pdf.save();
  fs.writeFileSync(outputPath, modifiedBytes);

  logger.info({ jobId: data.jobId, outputPath }, 'Identity page appended');
  return outputPath;
}
