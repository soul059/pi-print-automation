import { getDb } from '../db/connection';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { transitionJob, getJob } from '../models/job';
import * as cups from './cups';
import * as pdf from './pdf';
import { processRefund } from './refund';
import { notifyJobCompleted, notifyJobFailed } from './notification';
import { broadcastQueueUpdate } from './printerStatus';
import { telegram } from './telegram';
import { hasEnoughPaper, decrementPaper } from './paperTracking';

const MAX_RETRIES = env.QUEUE_MAX_RETRIES;
const RETRY_DELAY_MS = env.QUEUE_RETRY_DELAY_MS;
const STUCK_JOB_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const CUPS_POLL_INTERVAL_MS = 3000; // Check CUPS job status every 3s
const CUPS_POLL_TIMEOUT_MS = env.CUPS_POLL_TIMEOUT_MS;

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
  cups_job_id: string | null;
}

// Queue state
let processing = false;
const queue: string[] = []; // job IDs
let queuePaused = false;
let pauseReason: string | null = null;
let lastPrinterError: cups.PrinterErrorType = 'none';

// Track printer errors that require physical intervention
const PHYSICAL_INTERVENTION_ERRORS: cups.PrinterErrorType[] = ['paper_empty', 'paper_jam', 'cover_open'];

// Helper to persist queue state to database
function persistQueueState(): void {
  try {
    const db = getDb();
    db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'queue_paused'")
      .run(queuePaused ? 'true' : 'false');
    db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'queue_pause_reason'")
      .run(pauseReason || '');
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to persist queue state');
  }
}

// Restore queue state from database on startup
export function restoreQueueState(): void {
  try {
    const db = getDb();
    const pausedRow = db.prepare("SELECT value FROM settings WHERE key = 'queue_paused'").get() as { value: string } | undefined;
    const reasonRow = db.prepare("SELECT value FROM settings WHERE key = 'queue_pause_reason'").get() as { value: string } | undefined;
    
    if (pausedRow?.value === 'true') {
      queuePaused = true;
      pauseReason = reasonRow?.value || 'Unknown reason';
      logger.warn({ pauseReason }, 'Queue was paused before restart, keeping paused');
    }
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to restore queue state');
  }
}

export function enqueueJob(jobId: string): void {
  // Prevent duplicate enqueue
  if (queue.includes(jobId)) {
    logger.warn({ jobId }, 'Job already in queue, skipping duplicate enqueue');
    return;
  }
  
  queue.push(jobId);
  logger.info({ jobId, queueDepth: queue.length }, 'Job enqueued');
  broadcastQueueUpdate();
  processNext();
}

export function isQueuePaused(): boolean {
  return queuePaused;
}

export function getPauseReason(): string | null {
  return pauseReason;
}

export function pauseQueue(reason: string): void {
  if (!queuePaused) {
    queuePaused = true;
    pauseReason = reason;
    logger.warn({ reason }, 'Queue paused');
    persistQueueState();
    telegram.queuePaused(reason).catch(() => {});
    broadcastQueueUpdate();
  }
}

export function resumeQueue(): void {
  if (queuePaused) {
    queuePaused = false;
    pauseReason = null;
    lastPrinterError = 'none';
    logger.info('Queue resumed');
    persistQueueState();
    telegram.queueResumed().catch(() => {});
    broadcastQueueUpdate();
    processNext();
  }
}

async function processNext(): Promise<void> {
  if (processing || queue.length === 0) return;

  // Check if queue is paused
  if (queuePaused) {
    logger.info({ pauseReason }, 'Queue is paused, not processing');
    return;
  }

  // Pre-check printer status before processing
  const printerStatus = await cups.getPrinterStatus();
  
  // Handle errors that require physical intervention
  if (PHYSICAL_INTERVENTION_ERRORS.includes(printerStatus.errorType)) {
    // Only pause/alert if this is a NEW error (not repeated)
    if (lastPrinterError !== printerStatus.errorType) {
      lastPrinterError = printerStatus.errorType;
      
      // Send appropriate Telegram alert
      const printerName = printerStatus.printerName || 'default';
      switch (printerStatus.errorType) {
        case 'paper_empty':
          telegram.paperEmpty(printerName).catch(() => {});
          break;
        case 'paper_jam':
          telegram.paperJam(printerName).catch(() => {});
          break;
        case 'cover_open':
          telegram.coverOpen(printerName).catch(() => {});
          break;
      }
      
      pauseQueue(printerStatus.errorMessage || 'Printer error');
    }
    return;
  }
  
  // Clear error state if printer is okay now
  if (lastPrinterError !== 'none' && printerStatus.errorType === 'none') {
    lastPrinterError = 'none';
  }

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

/**
 * Wait for CUPS job to complete with polling
 * Returns true if completed successfully, false if failed/timed out
 */
async function waitForCupsJobCompletion(cupsJobId: string, jobId: string): Promise<{
  completed: boolean;
  error: string | null;
}> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < CUPS_POLL_TIMEOUT_MS) {
    const result = await cups.verifyCupsJobCompletion(cupsJobId);
    
    if (result.completed) {
      return { completed: true, error: null };
    }
    
    if (result.status === 'failed') {
      return { completed: false, error: result.errorReason || 'CUPS job failed' };
    }
    
    // Check for printer errors while waiting
    const printerStatus = await cups.getPrinterStatus();
    if (PHYSICAL_INTERVENTION_ERRORS.includes(printerStatus.errorType)) {
      // Pause queue but don't fail the job yet - it's in CUPS
      if (lastPrinterError !== printerStatus.errorType) {
        lastPrinterError = printerStatus.errorType;
        const printerName = printerStatus.printerName || 'default';
        switch (printerStatus.errorType) {
          case 'paper_empty':
            telegram.paperEmpty(printerName).catch(() => {});
            break;
          case 'paper_jam':
            telegram.paperJam(printerName).catch(() => {});
            break;
          case 'cover_open':
            telegram.coverOpen(printerName).catch(() => {});
            break;
        }
        pauseQueue(printerStatus.errorMessage || 'Printer error');
      }
      // Continue polling - CUPS job might complete once error is fixed
    }
    
    // Check for stuck job
    const elapsed = Date.now() - startTime;
    if (elapsed > STUCK_JOB_THRESHOLD_MS) {
      telegram.jobStuck(jobId, '', Math.floor(elapsed / 60000)).catch(() => {});
    }
    
    await new Promise(resolve => setTimeout(resolve, CUPS_POLL_INTERVAL_MS));
  }
  
  return { completed: false, error: 'CUPS job timed out waiting for completion' };
}

async function processJob(jobId: string): Promise<void> {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as QueuedJob | undefined;

  if (!job) {
    logger.warn({ jobId }, 'Job not found in database');
    return;
  }

  // Check if job already has a CUPS job ID from a previous attempt
  // This prevents duplicate prints after power cut recovery
  if (job.cups_job_id) {
    const cupsResult = await cups.verifyCupsJobCompletion(job.cups_job_id);
    if (cupsResult.completed) {
      logger.info({ jobId, cupsJobId: job.cups_job_id }, 'Job already completed in CUPS, marking as completed');
      transitionJob(jobId, 'completed');
      notifyJobCompleted(job.user_email, {
        jobId,
        fileName: job.file_name,
        printMode: job.print_mode,
        pages: job.total_pages,
        copies: job.copies,
        price: job.price,
      }).catch(err2 => logger.error({ jobId, err: err2.message }, 'Completion notification failed'));
      return;
    }
    
    if (cupsResult.status === 'processing' || cupsResult.status === 'pending') {
      logger.info({ jobId, cupsJobId: job.cups_job_id }, 'Job still in CUPS queue, waiting for completion');
      const waitResult = await waitForCupsJobCompletion(job.cups_job_id, jobId);
      if (waitResult.completed) {
        transitionJob(jobId, 'completed');
        notifyJobCompleted(job.user_email, {
          jobId,
          fileName: job.file_name,
          printMode: job.print_mode,
          pages: job.total_pages,
          copies: job.copies,
          price: job.price,
        }).catch(err2 => logger.error({ jobId, err: err2.message }, 'Completion notification failed'));
        return;
      }
      // If wait timed out but CUPS job was processing/pending, check again
      const recheckResult = await cups.verifyCupsJobCompletion(job.cups_job_id);
      if (recheckResult.status === 'processing' || recheckResult.status === 'pending') {
        logger.warn({ jobId, cupsJobId: job.cups_job_id }, 'CUPS job still running after timeout, leaving in queue');
        queue.unshift(jobId); // Put back at front of queue
        return;
      }
    }
  }

  // Use state machine to transition — prevents duplicate processing
  const transitioned = transitionJob(jobId, 'printing');
  if (!transitioned) {
    logger.warn({ jobId, status: job.status }, 'Job cannot transition to printing, skipping');
    return;
  }

  try {
    // Determine identity page strategy:
    // Only add printed identity if user explicitly requested it (print_receipt toggle ON)
    // Otherwise, user receives email receipt only (no footer or extra page)
    let printFilePath = job.file_path;
    
    if (job.print_receipt === 1) {
      // User explicitly requested full receipt page (toggle ON, charged extra)
      const identityData: pdf.IdentityPageData = {
        userName: job.user_name,
        userEmail: job.user_email,
        jobId: job.id,
        printMode: job.print_mode as 'now' | 'later',
      };
      printFilePath = await pdf.appendIdentityPage(job.file_path, identityData);
      logger.info({ jobId: job.id }, 'Full identity page appended (user requested)');
    } else {
      // User did NOT request printed receipt (toggle OFF) — email receipt only
      // No footer, no extra page added to their document
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

    // Calculate total pages to print (including copies)
    const totalPagesToUse = job.total_pages * job.copies;

    // Pre-check: Do we have enough paper?
    const paperCheck = hasEnoughPaper(printerName, totalPagesToUse);
    if (!paperCheck.enough) {
      logger.warn({ 
        jobId, 
        printerName, 
        needed: totalPagesToUse, 
        available: paperCheck.currentCount 
      }, 'Not enough paper for job');
      
      // Don't count as retry - put job back and pause queue
      transitionJob(jobId, 'paid'); // Reset to paid state
      queue.unshift(jobId); // Put back at front
      
      const reason = `Not enough paper: need ${totalPagesToUse}, have ${paperCheck.currentCount}`;
      pauseQueue(reason);
      telegram.notEnoughPaper(printerName, totalPagesToUse, paperCheck.currentCount, jobId).catch(() => {});
      return;
    }

    // Final printer status check before submitting
    const finalStatus = await cups.getPrinterStatus(printerName);
    if (!finalStatus.canRetry && PHYSICAL_INTERVENTION_ERRORS.includes(finalStatus.errorType)) {
      // Don't count this as a retry - put job back and pause queue
      transitionJob(jobId, 'paid'); // Reset to paid state
      queue.unshift(jobId); // Put back at front
      pauseQueue(finalStatus.errorMessage || 'Printer error');
      return;
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

    // Store CUPS job ID immediately (before waiting for completion)
    // This is critical for power cut recovery - we can check if it completed
    db.prepare(
      "UPDATE jobs SET cups_job_id = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(cupsJobId, jobId);

    logger.info({ jobId, cupsJobId }, 'Job submitted to CUPS, waiting for completion');

    // Wait for CUPS to actually complete the job
    const waitResult = await waitForCupsJobCompletion(cupsJobId, jobId);
    
    if (waitResult.completed) {
      const completed = transitionJob(jobId, 'completed');
      if (completed) {
        logger.info({ jobId, cupsJobId }, 'Job printed successfully');
        
        // Decrement paper count after successful print
        decrementPaper(printerName, totalPagesToUse);
        
        notifyJobCompleted(job.user_email, {
          jobId,
          fileName: job.file_name,
          printMode: job.print_mode,
          pages: job.total_pages,
          copies: job.copies,
          price: job.price,
        }).catch(err2 => logger.error({ jobId, err: err2.message }, 'Completion notification failed'));
      }
    } else {
      throw new Error(waitResult.error || 'CUPS job did not complete');
    }
  } catch (err: any) {
    // Check if error is due to paper/jam - don't count as retry
    const printerStatus = await cups.getPrinterStatus();
    if (PHYSICAL_INTERVENTION_ERRORS.includes(printerStatus.errorType)) {
      // Reset job to paid and put back in queue - don't increment retry
      logger.warn({ jobId, error: printerStatus.errorType }, 'Job failed due to printer error requiring intervention, not counting as retry');
      transitionJob(jobId, 'failed', printerStatus.errorMessage || 'Printer error');
      transitionJob(jobId, 'paid'); // Reset to paid for retry
      queue.unshift(jobId); // Put back at front
      pauseQueue(printerStatus.errorMessage || 'Printer error');
      return;
    }

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

export function startJobRecovery(): number {
  const db = getDb();
  let recoveredCount = 0;

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
        recoveredCount++;
      }
    }
  }

  // 2. Recover paid/printing jobs that were interrupted (e.g., server restart)
  // Exclude scheduled jobs that are still in the future (the scheduler handles those)
  const stuckJobs = db
    .prepare("SELECT id, status, scheduled_at, cups_job_id FROM jobs WHERE status IN ('paid', 'printing') ORDER BY created_at ASC")
    .all() as Array<{ id: string; status: string; scheduled_at: string | null; cups_job_id: string | null }>;

  if (stuckJobs.length > 0) {
    logger.info({ count: stuckJobs.length }, 'Recovering interrupted jobs');
    for (const job of stuckJobs) {
      // Skip scheduled jobs still in the future — the scheduler will handle them
      if (job.scheduled_at && new Date(job.scheduled_at) > new Date()) {
        continue;
      }

      // If job has a CUPS job ID, check if it already completed (prevents duplicate prints)
      if (job.cups_job_id) {
        // We'll check CUPS status when the job is processed
        // Just transition to paid and enqueue
        if (job.status === 'printing') {
          // Don't mark as failed - let processJob check CUPS status
          transitionJob(job.id, 'paid');
        }
        enqueueJob(job.id);
        recoveredCount++;
        continue;
      }

      // Reset printing → failed → paid so the state machine can transition paid → printing again
      if (job.status === 'printing') {
        const failOk = transitionJob(job.id, 'failed', 'Server restarted during printing');
        if (!failOk) continue;
        const paidOk = transitionJob(job.id, 'paid');
        if (!paidOk) continue;
      }
      
      enqueueJob(job.id);
      recoveredCount++;
    }
  }

  return recoveredCount;
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

export function getQueueStatus(): {
  depth: number;
  paused: boolean;
  pauseReason: string | null;
  processing: boolean;
  estimatedWaitMinutes: number;
} {
  return {
    depth: getQueueDepth(),
    paused: queuePaused,
    pauseReason,
    processing,
    estimatedWaitMinutes: getEstimatedWaitMinutes(),
  };
}
