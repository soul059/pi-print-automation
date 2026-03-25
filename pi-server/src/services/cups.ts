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
    // Use -l for detailed status including connection issues
    const output = await execFileAsync('lpstat', ['-l', '-p', safeName]);
    const isIdle = output.includes('idle');
    const isPrinting = output.includes('printing');
    const isStopped = output.includes('stopped') || output.includes('disabled');
    // Check for connection issues - "not connected", "Unplugged or turned off", etc.
    const isDisconnected = /not connected|unplugged|turned off|offline|unreachable/i.test(output);

    let accepting = false;
    try {
      const acceptOutput = await execFileAsync('lpstat', ['-a', safeName]);
      accepting = acceptOutput.includes('accepting');
    } catch {
      accepting = !isStopped;
    }

    // Printer is only truly online if enabled AND connected
    const online = !isStopped && !isDisconnected;
    
    let status: string;
    if (isDisconnected) {
      status = 'disconnected';
    } else if (isStopped) {
      status = 'stopped';
    } else if (isPrinting) {
      status = 'printing';
    } else if (isIdle) {
      status = 'idle';
    } else {
      status = 'unknown';
    }

    return {
      online,
      status,
      accepting: accepting && online, // Don't accept if disconnected
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

export async function getAllPrinterStatuses(): Promise<PrinterStatus[]> {
  const printers = await listPrinters();
  const statuses = await Promise.all(printers.map((name) => getPrinterStatus(name)));
  return statuses;
}

export async function enablePrinter(printerName: string): Promise<void> {
  const safeName = sanitizePrinterName(printerName);
  await execFileAsync('cupsenable', [safeName]);
  await execFileAsync('cupsaccept', [safeName]);
}

export async function disablePrinter(printerName: string): Promise<void> {
  const safeName = sanitizePrinterName(printerName);
  await execFileAsync('cupsdisable', [safeName]);
  await execFileAsync('cupsreject', [safeName]);
}

export async function getLeastBusyPrinter(): Promise<string | null> {
  const statuses = await getAllPrinterStatuses();
  const available = statuses.filter((s) => s.online && s.accepting);
  if (available.length === 0) return null;

  // Count queued jobs per printer via lpstat -o
  const jobCounts = new Map<string, number>();
  for (const s of available) {
    jobCounts.set(s.printerName, 0);
  }

  try {
    const output = await execFileAsync('lpstat', ['-o']);
    for (const line of output.split('\n')) {
      const match = line.match(/^(\S+?)-\d+/);
      if (match && jobCounts.has(match[1])) {
        jobCounts.set(match[1], (jobCounts.get(match[1]) || 0) + 1);
      }
    }
  } catch {
    // If lpstat -o fails, just pick the first available
  }

  let leastBusy = available[0].printerName;
  let minJobs = jobCounts.get(leastBusy) ?? 0;
  for (const [name, count] of jobCounts) {
    if (count < minJobs) {
      leastBusy = name;
      minJobs = count;
    }
  }

  return leastBusy;
}

export interface SupplyLevel {
  name: string;
  level: number; // 0-100, -1 = unknown
  type: 'toner' | 'ink' | 'paper' | 'other';
}

export async function getSupplyLevels(printerName?: string): Promise<SupplyLevel[]> {
  const name = printerName || (await getDefaultPrinter());
  if (!name) return [];
  const safeName = sanitizePrinterName(name);

  try {
    // CUPS reports supply levels via lpstat -l -p or IPP attributes
    const output = await execFileAsync('lpstat', ['-l', '-p', safeName]);
    const supplies: SupplyLevel[] = [];

    // Parse marker-names / marker-levels from verbose output
    // Format varies, but common patterns:
    // "marker-names: Black,Cyan,Magenta,Yellow"
    // "marker-levels: 75,50,25,100"
    const namesMatch = output.match(/marker-names[=:]\s*(.+)/i);
    const levelsMatch = output.match(/marker-levels[=:]\s*(.+)/i);
    const typesMatch = output.match(/marker-types[=:]\s*(.+)/i);

    if (namesMatch && levelsMatch) {
      const names = namesMatch[1].split(',').map(s => s.trim());
      const levels = levelsMatch[1].split(',').map(s => parseInt(s.trim(), 10));
      const types = typesMatch ? typesMatch[1].split(',').map(s => s.trim().toLowerCase()) : [];

      for (let i = 0; i < names.length; i++) {
        const supplyType = types[i]?.includes('toner') ? 'toner'
          : types[i]?.includes('ink') ? 'ink'
          : types[i]?.includes('paper') ? 'paper'
          : 'other';
        supplies.push({
          name: names[i],
          level: isNaN(levels[i]) ? -1 : Math.max(0, Math.min(100, levels[i])),
          type: supplyType,
        });
      }
    }

    return supplies;
  } catch {
    return [];
  }
}
