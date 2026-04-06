import { execFile } from 'child_process';
import { logger } from '../config/logger';
import { env } from '../config/env';

export type PaperStatus = 'ok' | 'low' | 'empty' | 'jam' | 'unknown';
export type PrinterErrorType = 'none' | 'paper_empty' | 'paper_jam' | 'paper_low' | 'cover_open' | 'offline' | 'other';

export interface PrinterStatus {
  online: boolean;
  status: string; // idle, printing, stopped, disconnected, error, unknown
  accepting: boolean;
  printerName: string;
  // Enhanced status fields
  paperStatus: PaperStatus;
  errorType: PrinterErrorType;
  errorMessage: string | null;
  canRetry: boolean; // false if error requires physical intervention (paper jam, empty)
}

export interface CupsJobInfo {
  jobId: string;
  printerName: string;
  status: 'pending' | 'processing' | 'completed' | 'canceled' | 'aborted' | 'unknown';
  createdAt: Date | null;
  completedAt: Date | null;
  errorReason: string | null;
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
    return { 
      online: false, 
      status: 'unknown', 
      accepting: false, 
      printerName: '',
      paperStatus: 'unknown',
      errorType: 'none',
      errorMessage: null,
      canRetry: true,
    };
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

    // Enhanced paper status detection
    const isPaperEmpty = /media-empty|out of paper|load paper|no paper|paper out|tray.*empty|media needed/i.test(output);
    const isPaperJam = /media-jam|paper jam|jam|media.*stuck|clear.*jam/i.test(output);
    const isPaperLow = /media-low|paper low|low paper/i.test(output);
    const isCoverOpen = /cover.*open|door.*open|lid.*open|access.*open/i.test(output);

    // Determine paper status
    let paperStatus: PaperStatus = 'ok';
    if (isPaperEmpty) paperStatus = 'empty';
    else if (isPaperJam) paperStatus = 'jam';
    else if (isPaperLow) paperStatus = 'low';

    // Determine error type and message
    let errorType: PrinterErrorType = 'none';
    let errorMessage: string | null = null;
    let canRetry = true;

    if (isPaperEmpty) {
      errorType = 'paper_empty';
      errorMessage = 'Printer is out of paper. Please load paper.';
      canRetry = false; // Requires physical intervention
    } else if (isPaperJam) {
      errorType = 'paper_jam';
      errorMessage = 'Paper jam detected. Please clear the jam.';
      canRetry = false; // Requires physical intervention
    } else if (isPaperLow) {
      errorType = 'paper_low';
      errorMessage = 'Paper is running low.';
      canRetry = true; // Can still print
    } else if (isCoverOpen) {
      errorType = 'cover_open';
      errorMessage = 'Printer cover is open. Please close it.';
      canRetry = false; // Requires physical intervention
    } else if (isDisconnected) {
      errorType = 'offline';
      errorMessage = 'Printer is disconnected or turned off.';
      canRetry = false;
    }

    let accepting = false;
    try {
      const acceptOutput = await execFileAsync('lpstat', ['-a', safeName]);
      accepting = acceptOutput.includes('accepting');
    } catch {
      accepting = !isStopped;
    }

    // Printer is only truly online if enabled AND connected AND no critical errors
    const online = !isStopped && !isDisconnected && !isPaperEmpty && !isPaperJam && !isCoverOpen;
    
    let status: string;
    if (isPaperEmpty) {
      status = 'paper_empty';
    } else if (isPaperJam) {
      status = 'paper_jam';
    } else if (isCoverOpen) {
      status = 'cover_open';
    } else if (isDisconnected) {
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
      accepting: accepting && online, // Don't accept if disconnected or has errors
      printerName: safeName,
      paperStatus,
      errorType,
      errorMessage,
      canRetry,
    };
  } catch {
    return { 
      online: false, 
      status: 'unknown', 
      accepting: false, 
      printerName: safeName,
      paperStatus: 'unknown',
      errorType: 'none',
      errorMessage: null,
      canRetry: true,
    };
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

/**
 * Get detailed CUPS job information including completion status
 * Used for duplicate print prevention and job verification
 */
export async function getCupsJobInfo(cupsJobId: string): Promise<CupsJobInfo> {
  const safeJobId = sanitizeCupsJobId(cupsJobId);
  const result: CupsJobInfo = {
    jobId: safeJobId,
    printerName: '',
    status: 'unknown',
    createdAt: null,
    completedAt: null,
    errorReason: null,
  };

  try {
    // Extract printer name from job ID (format: PrinterName-123)
    const printerMatch = safeJobId.match(/^(.+?)-\d+$/);
    if (printerMatch) {
      result.printerName = printerMatch[1];
    }

    // Check if job is still in queue
    const queueOutput = await execFileAsync('lpstat', ['-o']);
    if (queueOutput.includes(safeJobId)) {
      // Job is still in queue - check if it's processing or pending
      const isProcessing = queueOutput.includes(`${safeJobId} `) && 
        (queueOutput.includes('processing') || queueOutput.includes('printing'));
      result.status = isProcessing ? 'processing' : 'pending';
      return result;
    }

    // Job not in active queue - check completed jobs history
    // CUPS keeps completed job history in /var/log/cups/page_log or via lpstat -W completed
    try {
      const completedOutput = await execFileAsync('lpstat', ['-W', 'completed', '-o']);
      if (completedOutput.includes(safeJobId)) {
        result.status = 'completed';
        result.completedAt = new Date(); // Approximate
        return result;
      }
    } catch {
      // lpstat -W may not be available on all systems
    }

    // If job was in our system but not in CUPS queue or completed list,
    // it was likely completed and aged out of CUPS history
    result.status = 'completed';
    return result;
  } catch (err: any) {
    logger.warn({ cupsJobId, err: err.message }, 'Failed to get CUPS job info');
    return result;
  }
}

/**
 * Check if a CUPS job has completed successfully
 * Returns: 'completed' | 'printing' | 'processing' | 'pending' | 'failed' | 'unknown'
 */
export async function verifyCupsJobCompletion(cupsJobId: string): Promise<{
  completed: boolean;
  status: 'completed' | 'printing' | 'processing' | 'pending' | 'failed' | 'unknown';
  errorReason: string | null;
}> {
  try {
    const jobInfo = await getCupsJobInfo(cupsJobId);
    
    if (jobInfo.status === 'completed') {
      return { completed: true, status: 'completed', errorReason: null };
    }
    
    if (jobInfo.status === 'processing') {
      return { completed: false, status: 'processing', errorReason: null };
    }
    
    if (jobInfo.status === 'pending') {
      return { completed: false, status: 'pending', errorReason: null };
    }

    if (jobInfo.status === 'aborted' || jobInfo.status === 'canceled') {
      return { completed: false, status: 'failed', errorReason: `Job ${jobInfo.status}` };
    }

    return { completed: false, status: 'unknown', errorReason: null };
  } catch (err: any) {
    return { completed: false, status: 'unknown', errorReason: err.message };
  }
}

/**
 * Get all active CUPS jobs with their ages (for stuck job detection)
 */
export async function getActiveJobsWithAge(): Promise<Array<{
  jobId: string;
  printerName: string;
  ageSeconds: number;
  status: string;
}>> {
  const jobs: Array<{ jobId: string; printerName: string; ageSeconds: number; status: string }> = [];
  
  try {
    // lpstat -o shows active jobs with timestamps
    const output = await execFileAsync('lpstat', ['-o', '-l']);
    const lines = output.split('\n');
    
    let currentJob: any = null;
    
    for (const line of lines) {
      // Job line format: "PrinterName-123 user 1024 Mon Mar 31 10:30:00 2026"
      const jobMatch = line.match(/^(\S+-\d+)\s+\S+\s+\d+\s+(.+)$/);
      if (jobMatch) {
        if (currentJob) jobs.push(currentJob);
        
        const jobId = jobMatch[1];
        const dateStr = jobMatch[2];
        const printerMatch = jobId.match(/^(.+?)-\d+$/);
        
        let ageSeconds = 0;
        try {
          const jobDate = new Date(dateStr);
          ageSeconds = Math.floor((Date.now() - jobDate.getTime()) / 1000);
        } catch {
          ageSeconds = 0;
        }
        
        currentJob = {
          jobId,
          printerName: printerMatch ? printerMatch[1] : '',
          ageSeconds,
          status: 'pending',
        };
      }
      
      // Check for status in detail lines
      if (currentJob && line.includes('Status:')) {
        if (line.includes('processing') || line.includes('printing')) {
          currentJob.status = 'processing';
        }
      }
    }
    
    if (currentJob) jobs.push(currentJob);
    
    return jobs;
  } catch {
    return [];
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
