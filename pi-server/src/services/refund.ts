import Razorpay from 'razorpay';
import { env } from '../config/env';
import { getDb } from '../db/connection';
import { logger } from '../config/logger';
import { refundToWallet } from './wallet';

let razorpay: Razorpay;
function getRazorpay(): Razorpay {
  if (!razorpay) {
    razorpay = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_SECRET });
  }
  return razorpay;
}

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

  // Wallet-paid jobs: refund back to wallet
  if (payment.payment_type === 'wallet') {
    try {
      const job = db.prepare('SELECT user_email, file_name FROM jobs WHERE id = ?').get(jobId) as any;
      if (!job) {
        return { success: false, error: 'Job not found for wallet refund' };
      }

      // Mark as pending BEFORE crediting wallet — prevents double-credit on crash/race
      const markPending = db.prepare(
        `UPDATE payments SET refund_status = 'pending', updated_at = datetime('now') WHERE id = ? AND refund_status IS NULL`
      ).run(payment.id);
      if ((markPending as any).changes === 0) {
        return { success: true, refundId: payment.refund_id };
      }

      refundToWallet(job.user_email, payment.amount, `refund_${jobId}`, `Refund for failed print: ${job.file_name}`);

      db.prepare(
        `UPDATE payments SET refund_status = 'refunded', refund_id = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(`wallet_refund_${jobId}`, payment.id);

      logger.info({ jobId, amount: payment.amount }, 'Wallet refund processed');
      return { success: true, refundId: `wallet_refund_${jobId}` };
    } catch (err: any) {
      logger.error({ jobId, err: err.message }, 'Wallet refund failed');
      db.prepare(
        `UPDATE payments SET refund_status = 'failed', updated_at = datetime('now') WHERE id = ?`
      ).run(payment.id);
      return { success: false, error: err.message };
    }
  }

  // Razorpay-paid jobs: refund via Razorpay
  try {
    // Mark as pending BEFORE calling Razorpay API — prevents concurrent refund calls
    const markPending = db.prepare(
      `UPDATE payments SET refund_status = 'pending', updated_at = datetime('now') WHERE id = ? AND refund_status IS NULL`
    ).run(payment.id);
    if ((markPending as any).changes === 0) {
      return { success: true, refundId: payment.refund_id };
    }

    const rz = getRazorpay();
    const refund = await (rz.payments as any).refund(payment.razorpay_payment_id, {
      amount: payment.amount,
      notes: { jobId, reason: 'Print job permanently failed' },
    });

    // Update payment record
    db.prepare(
      `UPDATE payments SET refund_status = 'refunded', refund_id = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(refund.id, payment.id);

    logger.info({ jobId, refundId: refund.id, amount: payment.amount }, 'Refund processed');
    return { success: true, refundId: refund.id };
  } catch (err: any) {
    logger.error({ jobId, err: err.message }, 'Refund failed');
    // Mark as failed but don't block
    db.prepare(
      `UPDATE payments SET refund_status = 'failed', updated_at = datetime('now') WHERE id = ?`
    ).run(payment.id);
    return { success: false, error: err.message };
  }
}
