import { getDb } from '../db/connection.js';
import { enqueueJob, getQueuedJobIds } from './queue.js';
import { logger } from '../config/logger.js';

let schedulerInterval: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  schedulerInterval = setInterval(checkScheduledJobs, 30000);
  checkScheduledJobs();
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

function checkScheduledJobs(): void {
  try {
    const db = getDb();
    const readyJobs = db.prepare(
      "SELECT id FROM jobs WHERE status = 'paid' AND scheduled_at IS NOT NULL AND scheduled_at <= datetime('now')"
    ).all() as Array<{ id: string }>;

    for (const job of readyJobs) {
      // Prevent duplicate enqueue if job is already in the queue
      const queued = getQueuedJobIds();
      if (queued.includes(job.id)) continue;

      logger.info({ jobId: job.id }, 'Scheduled job ready, enqueuing');
      enqueueJob(job.id);
    }
  } catch (err: any) {
    logger.error({ err: err.message }, 'Scheduler check failed');
  }
}
