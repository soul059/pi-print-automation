import { exec } from 'child_process';
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

function execAsync(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

export async function getDefaultPrinter(): Promise<string> {
  if (env.DEFAULT_PRINTER) return env.DEFAULT_PRINTER;

  try {
    const output = await execAsync('lpstat -d');
    const match = output.match(/system default destination:\s*(.+)/);
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

export async function listPrinters(): Promise<string[]> {
  try {
    const output = await execAsync('lpstat -p');
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

  try {
    const output = await execAsync(`lpstat -p ${name}`);
    const isIdle = output.includes('idle');
    const isPrinting = output.includes('printing');
    const isStopped = output.includes('stopped') || output.includes('disabled');

    let accepting = false;
    try {
      const acceptOutput = await execAsync(`lpstat -a ${name}`);
      accepting = acceptOutput.includes('accepting');
    } catch {
      accepting = !isStopped;
    }

    return {
      online: !isStopped,
      status: isStopped ? 'stopped' : isPrinting ? 'printing' : isIdle ? 'idle' : 'unknown',
      accepting,
      printerName: name,
    };
  } catch {
    return { online: false, status: 'unknown', accepting: false, printerName: name };
  }
}

export async function printFile(
  filePath: string,
  printerName: string,
  options: PrintOptions
): Promise<string> {
  const cupsOptions: string[] = [];

  if (options.pageRange) cupsOptions.push(`-o page-ranges=${options.pageRange}`);
  if (options.paperSize) cupsOptions.push(`-o media=${options.paperSize}`);
  if (options.copies && options.copies > 1) cupsOptions.push(`-n ${options.copies}`);
  if (options.duplex) {
    cupsOptions.push('-o sides=two-sided-long-edge');
  } else {
    cupsOptions.push('-o sides=one-sided');
  }
  if (options.color === 'color') {
    cupsOptions.push('-o ColorModel=Color');
  } else {
    cupsOptions.push('-o ColorModel=Gray');
  }

  const cmd = `lp -d ${printerName} ${cupsOptions.join(' ')} "${filePath}"`;
  logger.info({ cmd }, 'Sending print job to CUPS');

  const output = await execAsync(cmd);
  // lp returns something like "request id is myprinter-123 (1 file(s))"
  const match = output.match(/request id is (\S+)/);
  return match ? match[1] : output;
}

export async function cancelJob(cupsJobId: string): Promise<void> {
  await execAsync(`cancel ${cupsJobId}`);
}

export async function getJobStatus(cupsJobId: string): Promise<string> {
  try {
    const output = await execAsync(`lpstat -o`);
    if (output.includes(cupsJobId)) return 'printing';
    return 'completed';
  } catch {
    return 'unknown';
  }
}

export async function getPrinterCapabilities(printerName: string): Promise<Record<string, string>> {
  try {
    const output = await execAsync(`lpoptions -p ${printerName} -l`);
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
