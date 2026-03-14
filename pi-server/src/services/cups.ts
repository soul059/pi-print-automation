import { execFile } from 'child_process';
import { logger } from '../config/logger';
import { env } from '../config/env';

export interface PrinterStatus {
  online: boolean;
  status: string; // idle, printing, stopped, unknown
  accepting: boolean;
  printerName: string;
}

export interface PrintOptions {
  pageRange?: string;
  paperSize?: string;
  copies?: number;
  duplex?: boolean;
  color?: 'grayscale' | 'color';
}

function execFileAsync(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 10000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Strict validation for CUPS option values to prevent command injection
function sanitizePageRange(value: string): string {
  if (!/^[\d,\- ]+$/.test(value)) {
    throw new Error('Invalid page range format');
  }
  return value.replace(/\s/g, '');
}

function sanitizePaperSize(value: string): string {
  if (!/^[A-Za-z0-9]+$/.test(value)) {
    throw new Error('Invalid paper size format');
  }
  return value;
}

function sanitizePrinterName(value: string): string {
  if (!/^[A-Za-z0-9_\-]+$/.test(value)) {
    throw new Error('Invalid printer name format');
  }
  return value;
}

export async function getDefaultPrinter(): Promise<string> {
  if (env.DEFAULT_PRINTER) return env.DEFAULT_PRINTER;

  try {
    const output = await execFileAsync('lpstat', ['-d']);
    const match = output.match(/system default destination:\s*(.+)/);
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

export async function listPrinters(): Promise<string[]> {
  try {
    const output = await execFileAsync('lpstat', ['-p']);
    const printers = output
      .split('\n')
      .filter((l) => l.startsWith('printer'))
      .map((l) => l.split(/\s+/)[1]);
    return printers;
  } catch {
    return [];
  }
}

export async function getPrinterStatus(printerName?: string): Promise<PrinterStatus> {
  const name = printerName || (await getDefaultPrinter());
  if (!name) {
    return { online: false, status: 'unknown', accepting: false, printerName: '' };
  }

  const safeName = sanitizePrinterName(name);

  try {
    const output = await execFileAsync('lpstat', ['-p', safeName]);
    const isIdle = output.includes('idle');
    const isPrinting = output.includes('printing');
    const isStopped = output.includes('stopped') || output.includes('disabled');

    let accepting = false;
    try {
      const acceptOutput = await execFileAsync('lpstat', ['-a', safeName]);
      accepting = acceptOutput.includes('accepting');
    } catch {
      accepting = !isStopped;
    }

    return {
      online: !isStopped,
      status: isStopped ? 'stopped' : isPrinting ? 'printing' : isIdle ? 'idle' : 'unknown',
      accepting,
      printerName: safeName,
    };
  } catch {
    return { online: false, status: 'unknown', accepting: false, printerName: safeName };
  }
}

export async function printFile(
  filePath: string,
  printerName: string,
  options: PrintOptions
): Promise<string> {
  const safePrinter = sanitizePrinterName(printerName);
  const args: string[] = ['-d', safePrinter];

  if (options.pageRange) {
    args.push('-o', `page-ranges=${sanitizePageRange(options.pageRange)}`);
  }
  if (options.paperSize) {
    args.push('-o', `media=${sanitizePaperSize(options.paperSize)}`);
  }
  if (options.copies && options.copies > 1) {
    args.push('-n', String(Math.floor(options.copies)));
  }
  if (options.duplex) {
    args.push('-o', 'sides=two-sided-long-edge');
  } else {
    args.push('-o', 'sides=one-sided');
  }
  if (options.color === 'color') {
    args.push('-o', 'ColorModel=Color');
  } else {
    args.push('-o', 'ColorModel=Gray');
  }

  args.push('--', filePath);

  logger.info({ cmd: 'lp', args }, 'Sending print job to CUPS');

  const output = await execFileAsync('lp', args);
  // lp returns something like "request id is myprinter-123 (1 file(s))"
  const match = output.match(/request id is (\S+)/);
  return match ? match[1] : output;
}

function sanitizeCupsJobId(value: string): string {
  // CUPS job IDs are like "PrinterName-123"
  if (!/^[A-Za-z0-9_\-]+$/.test(value)) {
    throw new Error('Invalid CUPS job ID format');
  }
  return value;
}

export async function cancelJob(cupsJobId: string): Promise<void> {
  await execFileAsync('cancel', [sanitizeCupsJobId(cupsJobId)]);
}

export async function getJobStatus(cupsJobId: string): Promise<string> {
  try {
    const output = await execFileAsync('lpstat', ['-o']);
    if (output.includes(sanitizeCupsJobId(cupsJobId))) return 'printing';
    return 'completed';
  } catch {
    return 'unknown';
  }
}

export async function getPrinterCapabilities(printerName: string): Promise<Record<string, string>> {
  try {
    const output = await execFileAsync('lpoptions', ['-p', sanitizePrinterName(printerName), '-l']);
    const caps: Record<string, string> = {};
    for (const line of output.split('\n')) {
      const match = line.match(/^(\S+?)\/(.+?):\s*(.+)$/);
      if (match) caps[match[1]] = match[3];
    }
    return caps;
  } catch {
    return {};
  }
}
