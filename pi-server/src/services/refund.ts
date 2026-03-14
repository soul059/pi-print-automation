import Razorpay from 'razorpay';
import { env } from '../config/env';
import { getDb } from '../db/connection';
import { logger } from '../config/logger';

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

  // Check if already refunded
  if (payment.refund_status === 'refunded') {
    return { success: true, refundId: payment.refund_id };
  }

  try {
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
