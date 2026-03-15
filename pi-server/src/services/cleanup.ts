import fs from 'fs';
import path from 'path';
import { getDb } from '../db/connection';
import { env } from '../config/env';
import { logger } from '../config/logger';

let cleanupInterval: NodeJS.Timeout | null = null;

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function startCleanup(): void {
  cleanupInterval = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  // Run first cleanup after 5 minutes (let server stabilize)
  setTimeout(runCleanup, 5 * 60 * 1000);
}

export function stopCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

function runCleanup(): void {
  try {
    const db = getDb();
    const retentionHours = env.FILE_RETENTION_HOURS;
    const cutoff = `-${retentionHours} hours`;

    // Only clean files for jobs in terminal states
    const expiredJobs = db.prepare(
      `SELECT id, file_path FROM jobs
       WHERE status IN ('completed', 'failed_permanent')
         AND updated_at < datetime('now', ?)
         AND file_path IS NOT NULL`
    ).all(cutoff) as Array<{ id: string; file_path: string }>;

    let cleaned = 0;
    for (const job of expiredJobs) {
      try {
        // Remove the uploaded file
        if (fs.existsSync(job.file_path)) {
          fs.unlinkSync(job.file_path);
          cleaned++;
        }
        // Remove the _print variant (identity page appended)
        const printPath = job.file_path.replace('.pdf', '_print.pdf');
        if (fs.existsSync(printPath)) {
          fs.unlinkSync(printPath);
        }
        // Clear file_path in DB so we don't retry
        db.prepare(
          "UPDATE jobs SET file_path = NULL, updated_at = datetime('now') WHERE id = ?"
        ).run(job.id);
      } catch (err: any) {
        logger.warn({ jobId: job.id, err: err.message }, 'Failed to clean up file');
      }
    }

    if (cleaned > 0) {
      logger.info({ cleaned, total: expiredJobs.length }, 'File cleanup completed');
    }
  } catch (err: any) {
    logger.error({ err: err.message }, 'File cleanup failed');
  }
}
