import { getDb } from '../db/connection';
import { logger } from '../config/logger';
import { transitionJob, getJob } from '../models/job';
import * as cups from './cups';
import * as pdf from './pdf';
import { processRefund } from './refund';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

interface QueuedJob {
  id: string;
  status: string;
  file_path: string;
  user_name: string;
  user_email: string;
  print_mode: string;
  print_pages: string;
  paper_size: string;
  copies: number;
  duplex: number;
  color: string;
  retry_count: number;
}

let processing = false;
const queue: string[] = []; // job IDs

export function enqueueJob(jobId: string): void {
  queue.push(jobId);
  logger.info({ jobId, queueDepth: queue.length }, 'Job enqueued');
  processNext();
}

async function processNext(): Promise<void> {
  if (processing || queue.length === 0) return;

  processing = true;
  const jobId = queue.shift()!;

  try {
    await processJob(jobId);
  } catch (err: any) {
    logger.error({ jobId, err: err.message }, 'Job processing failed');
  } finally {
    processing = false;
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
    // Append identity page
    const printFilePath = await pdf.appendIdentityPage(job.file_path, {
      userName: job.user_name,
      userEmail: job.user_email,
      jobId: job.id,
      printMode: job.print_mode as 'now' | 'later',
    });

    // Get default printer
    const printerName = await cups.getDefaultPrinter();
    if (!printerName) {
      throw new Error('No default printer configured');
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
    db.prepare(
      "UPDATE jobs SET status = 'completed', cups_job_id = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(cupsJobId, jobId);

    logger.info({ jobId, cupsJobId }, 'Job printed successfully');
  } catch (err: any) {
    const newRetryCount = (job.retry_count || 0) + 1;

    if (newRetryCount >= MAX_RETRIES) {
      db.prepare(
        "UPDATE jobs SET status = 'failed_permanent', retry_count = ?, error_message = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newRetryCount, err.message, jobId);
      logger.error({ jobId, retries: newRetryCount }, 'Job permanently failed');
      // Auto-refund paid jobs that permanently failed
      processRefund(jobId).catch(refundErr =>
        logger.error({ jobId, err: refundErr.message }, 'Auto-refund failed')
      );
    } else {
      db.prepare(
        "UPDATE jobs SET status = 'failed', retry_count = ?, error_message = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newRetryCount, err.message, jobId);
      logger.warn({ jobId, retries: newRetryCount }, 'Job failed, will retry');

      // Schedule retry
      setTimeout(() => enqueueJob(jobId), RETRY_DELAY_MS * newRetryCount);
    }
  }
}

export function startJobRecovery(): void {
  const db = getDb();
  // Recover paid jobs that were interrupted (e.g., server restart)
  const stuckJobs = db
    .prepare("SELECT id, status FROM jobs WHERE status IN ('paid', 'printing') ORDER BY created_at ASC")
    .all() as Array<{ id: string; status: string }>;

  if (stuckJobs.length > 0) {
    logger.info({ count: stuckJobs.length }, 'Recovering interrupted jobs');
    for (const job of stuckJobs) {
      // Reset printing → failed so the state machine can transition paid → printing again
      if (job.status === 'printing') {
        transitionJob(job.id, 'failed', 'Server restarted during printing');
        transitionJob(job.id, 'paid');
      }
      enqueueJob(job.id);
    }
  }
}

export function getQueueDepth(): number {
  return queue.length + (processing ? 1 : 0);
}

export function getEstimatedWaitMinutes(): number {
  const avgJobSeconds = 30; // rough estimate
  return Math.ceil((getQueueDepth() * avgJobSeconds) / 60);
}
