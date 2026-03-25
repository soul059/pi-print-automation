import { getDb } from '../db/connection';
import { logger } from '../config/logger';
import { refundToWallet } from './wallet';

/**
 * Process refund for a job - ALWAYS refunds to user's wallet balance.
 * This provides instant refunds regardless of original payment method (Razorpay or wallet).
 * Benefits: instant, no fees, keeps money in the system.
 */
export async function processRefund(jobId: string): Promise<{ success: boolean; refundId?: string; error?: string }> {
  const db = getDb();
  const payment = db.prepare(
    "SELECT * FROM payments WHERE job_id = ? AND status = 'captured'"
  ).get(jobId) as any;

  if (!payment) {
    return { success: false, error: 'No captured payment found for this job' };
  }

  // Check if already refunded (pending refunds are retried, not skipped)
  if (payment.refund_status === 'refunded') {
    return { success: true, refundId: payment.refund_id };
  }

  // All refunds go to wallet (instant, no fees, regardless of original payment method)
  try {
    const job = db.prepare('SELECT user_email, file_name FROM jobs WHERE id = ?').get(jobId) as any;
    if (!job) {
      return { success: false, error: 'Job not found for refund' };
    }

    // Mark as pending BEFORE crediting wallet — prevents double-credit on crash/race
    // Allow retrying 'pending' refunds (e.g., after crash recovery)
    const markPending = db.prepare(
      `UPDATE payments SET refund_status = 'pending', updated_at = datetime('now') WHERE id = ? AND (refund_status IS NULL OR refund_status = 'pending')`
    ).run(payment.id);
    if ((markPending as any).changes === 0) {
      // Only skip if already refunded or failed (not pending)
      return { success: true, refundId: payment.refund_id };
    }

    // Credit to wallet (has built-in idempotency via reference_id)
    refundToWallet(job.user_email, payment.amount, `refund_${jobId}`, `Refund for failed print: ${job.file_name}`);

    db.prepare(
      `UPDATE payments SET refund_status = 'refunded', refund_id = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(`wallet_refund_${jobId}`, payment.id);

    logger.info({ jobId, amount: payment.amount, paymentType: payment.payment_type }, 'Refund credited to wallet');
    return { success: true, refundId: `wallet_refund_${jobId}` };
  } catch (err: any) {
    logger.error({ jobId, err: err.message }, 'Wallet refund failed');
    db.prepare(
      `UPDATE payments SET refund_status = 'failed', updated_at = datetime('now') WHERE id = ?`
    ).run(payment.id);
    return { success: false, error: err.message };
  }
}
