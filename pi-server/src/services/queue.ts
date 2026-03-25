import { getDb } from '../db/connection';
import { logger } from '../config/logger';
import { transitionJob, getJob } from '../models/job';
import * as cups from './cups';
import * as pdf from './pdf';
import { processRefund } from './refund';
import { notifyJobCompleted, notifyJobFailed } from './notification';
import { broadcastQueueUpdate } from './printerStatus';
import { telegram } from './telegram';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

interface QueuedJob {
  id: string;
  status: string;
  file_name: string;
  file_path: string;
  user_name: string;
  user_email: string;
  print_mode: string;
  print_receipt: number; // 0 = no printed receipt, 1 = full receipt page
  print_pages: string;
  paper_size: string;
  copies: number;
  duplex: number;
  color: string;
  retry_count: number;
  printer_name: string | null;
  total_pages: number;
  price: number;
}

let processing = false;
const queue: string[] = []; // job IDs

export function enqueueJob(jobId: string): void {
  queue.push(jobId);
  logger.info({ jobId, queueDepth: queue.length }, 'Job enqueued');
  broadcastQueueUpdate();
  processNext();
}

async function processNext(): Promise<void> {
  if (processing || queue.length === 0) return;

  processing = true;
  const jobId = queue.shift()!;
  broadcastQueueUpdate();

  try {
    await processJob(jobId);
  } catch (err: any) {
    logger.error({ jobId, err: err.message }, 'Job processing failed');
  } finally {
    processing = false;
    broadcastQueueUpdate();
    if (queue.length > 0) {
      processNext();
    }
  }
}

async function processJob(jobId: string): Promise<void> {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as QueuedJob | undefined;

  if (!job) {
    logger.warn({ jobId }, 'Job not found in database');
    return;
  }

  // Use state machine to transition — prevents duplicate processing
  const transitioned = transitionJob(jobId, 'printing');
  if (!transitioned) {
    logger.warn({ jobId, status: job.status }, 'Job cannot transition to printing, skipping');
    return;
  }

  try {
    // Determine identity page strategy:
    // 1. If printReceipt=true → Full identity page (user paid for it)
    // 2. If collect-later OR multi-copy → Footer on last page (helps staff identify)
    // 3. Otherwise (single-copy print-now) → No printed identity (email receipt only)
    let printFilePath = job.file_path;
    
    const identityData: pdf.IdentityPageData = {
      userName: job.user_name,
      userEmail: job.user_email,
      jobId: job.id,
      printMode: job.print_mode as 'now' | 'later',
    };

    if (job.print_receipt === 1) {
      // User explicitly requested full receipt page (charged)
      printFilePath = await pdf.appendIdentityPage(job.file_path, identityData);
      logger.info({ jobId: job.id }, 'Full identity page appended (user requested)');
    } else if (job.print_mode === 'later' || job.copies > 1) {
      // Collect-later or multi-copy: add footer to last page for identification
      printFilePath = await pdf.appendIdentityFooter(job.file_path, identityData);
      logger.info({ jobId: job.id, printMode: job.print_mode, copies: job.copies }, 'Identity footer appended');
    } else {
      // Single-copy print-now: no printed identity (email receipt only)
      logger.info({ jobId: job.id }, 'No printed identity (email receipt only)');
    }

    // Determine target printer
    let printerName: string | null = null;
    if (job.printer_name) {
      printerName = job.printer_name;
    } else {
      printerName = await cups.getLeastBusyPrinter();
    }
    if (!printerName) {
      // Fall back to default printer
      printerName = await cups.getDefaultPrinter();
    }
    if (!printerName) {
      throw new Error('No printer available');
    }

    // Store resolved printer name on the job
    if (!job.printer_name) {
      db.prepare(
        "UPDATE jobs SET printer_name = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(printerName, jobId);
    }

    // Submit to CUPS
    const cupsJobId = await cups.printFile(printFilePath, printerName, {
      pageRange: job.print_pages || undefined,
      paperSize: job.paper_size,
      copies: job.copies,
      duplex: job.duplex === 1,
      color: job.color as 'grayscale' | 'color',
    });

    // Update job with CUPS job ID
    const completed = transitionJob(jobId, 'completed');
    if (completed) {
      db.prepare(
        "UPDATE jobs SET cups_job_id = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(cupsJobId, jobId);
    }

    logger.info({ jobId, cupsJobId }, 'Job printed successfully');

    notifyJobCompleted(job.user_email, {
      jobId,
      fileName: job.file_name,
      printMode: job.print_mode,
      pages: job.total_pages,
      copies: job.copies,
      price: job.price,
    }).catch(err2 => logger.error({ jobId, err: err2.message }, 'Completion notification failed'));
  } catch (err: any) {
    const newRetryCount = (job.retry_count || 0) + 1;

    if (newRetryCount >= MAX_RETRIES) {
      // Transition printing → failed → failed_permanent
      const failedOk = transitionJob(jobId, 'failed', err.message);
      if (failedOk) {
        transitionJob(jobId, 'failed_permanent');
      }
      db.prepare(
        "UPDATE jobs SET retry_count = ?, error_message = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newRetryCount, err.message, jobId);
      logger.error({ jobId, retries: newRetryCount }, 'Job permanently failed');
      // Telegram alert for permanent failure
      telegram.jobFailed(jobId, job.user_email, err.message).catch(() => {});
      // Auto-refund paid jobs that permanently failed
      processRefund(jobId).catch(refundErr =>
        logger.error({ jobId, err: refundErr.message }, 'Auto-refund failed')
      );

      notifyJobFailed(job.user_email, {
        jobId,
        fileName: job.file_name,
        error: err.message,
        refunded: true,
      }).catch(err2 => logger.error({ jobId, err: err2.message }, 'Failure notification failed'));
    } else {
      transitionJob(jobId, 'failed', err.message);
      db.prepare(
        "UPDATE jobs SET retry_count = ?, error_message = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newRetryCount, err.message, jobId);
      logger.warn({ jobId, retries: newRetryCount }, 'Job failed, will retry');

      // Schedule retry
      setTimeout(() => enqueueJob(jobId), RETRY_DELAY_MS * newRetryCount);
    }
  }
}

export function startJobRecovery(): void {
  const db = getDb();

  // 1. Recover payment_pending jobs with captured payments (power cut between capture and enqueue)
  const orphanedPayments = db
    .prepare(`SELECT j.id FROM jobs j
      JOIN payments p ON p.job_id = j.id
      WHERE j.status = 'payment_pending' AND p.status = 'captured'
      ORDER BY j.created_at ASC`)
    .all() as Array<{ id: string }>;

  if (orphanedPayments.length > 0) {
    logger.info({ count: orphanedPayments.length }, 'Recovering payment_pending jobs with captured payments');
    for (const job of orphanedPayments) {
      const transitioned = transitionJob(job.id, 'paid');
      if (transitioned) {
        enqueueJob(job.id);
        logger.info({ jobId: job.id }, 'Recovered orphaned paid job');
      }
    }
  }

  // 2. Recover paid/printing jobs that were interrupted (e.g., server restart)
  // Exclude scheduled jobs that are still in the future (the scheduler handles those)
  const stuckJobs = db
    .prepare("SELECT id, status, scheduled_at FROM jobs WHERE status IN ('paid', 'printing') ORDER BY created_at ASC")
    .all() as Array<{ id: string; status: string; scheduled_at: string | null }>;

  if (stuckJobs.length > 0) {
    logger.info({ count: stuckJobs.length }, 'Recovering interrupted jobs');
    for (const job of stuckJobs) {
      // Reset printing → failed → paid so the state machine can transition paid → printing again
      if (job.status === 'printing') {
        const failOk = transitionJob(job.id, 'failed', 'Server restarted during printing');
        if (!failOk) continue;
        const paidOk = transitionJob(job.id, 'paid');
        if (!paidOk) continue;
      }
      // Skip scheduled jobs still in the future — the scheduler will handle them
      if (job.scheduled_at && new Date(job.scheduled_at) > new Date()) {
        continue;
      }
      enqueueJob(job.id);
    }
  }
}

export function getQueueDepth(): number {
  return queue.length + (processing ? 1 : 0);
}

export function getAvgJobDurationSeconds(): number {
  try {
    const db = getDb();
    // Avg time from paid → completed for last 50 completed jobs
    const row = db.prepare(
      `SELECT AVG(
         (julianday(updated_at) - julianday(created_at)) * 86400
       ) as avg_seconds
       FROM (
         SELECT updated_at, created_at FROM jobs
         WHERE status = 'completed'
         ORDER BY updated_at DESC LIMIT 50
       )`
    ).get() as any;
    const avg = row?.avg_seconds;
    if (avg && avg > 0 && avg < 3600) return Math.round(avg);
  } catch { /* fallback */ }
  return 30; // default 30s
}

export function getEstimatedWaitMinutes(): number {
  const avgJobSeconds = getAvgJobDurationSeconds();
  return Math.ceil((getQueueDepth() * avgJobSeconds) / 60);
}

export function getQueuePosition(jobId: string): number | null {
  const idx = queue.indexOf(jobId);
  if (idx >= 0) return idx + 1;
  return null;
}

export function getQueuedJobIds(): string[] {
  return [...queue];
}
