import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getJob, transitionJob } from '../models/job';
import { getDb } from '../db/connection';
import { getPrinterStatus } from '../services/cups';
import { enqueueJob } from '../services/queue';
import { debitWallet } from '../services/wallet';
import { nanoid } from 'nanoid';

export const paymentRouter = Router();

let razorpay: Razorpay;

function getRazorpay(): Razorpay {
  if (!razorpay) {
    razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_SECRET,
    });
  }
  return razorpay;
}

// Create payment order
paymentRouter.post('/create', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { jobId } = req.body;
    if (!jobId) {
      res.status(400).json({ error: 'jobId is required' });
      return;
    }

    const job = getJob(jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.user_email !== req.userEmail) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    if (job.status !== 'uploaded') {
      res.status(400).json({ error: `Job is in '${job.status}' state, cannot create payment` });
      return;
    }

    // Lock the job by transitioning FIRST — prevents concurrent payment creation race
    const toPending = transitionJob(job.id, 'payment_pending');
    if (!toPending) {
      res.status(409).json({ error: 'Payment is already being processed for this job' });
      return;
    }

    // Pre-payment printer status gate
    const printerStatus = await getPrinterStatus();
    if (!printerStatus.online) {
      // Rollback: transition back so user can try again
      const db0 = getDb();
      db0.prepare("UPDATE jobs SET status = 'uploaded', updated_at = datetime('now') WHERE id = ? AND status = 'payment_pending'").run(job.id);
      res.status(503).json({
        error: 'Printer is offline',
        printerStatus,
        message: 'Cannot process payment while printer is offline. Please try again later.',
      });
      return;
    }

    if (!printerStatus.accepting) {
      const db0 = getDb();
      db0.prepare("UPDATE jobs SET status = 'uploaded', updated_at = datetime('now') WHERE id = ? AND status = 'payment_pending'").run(job.id);
      res.status(503).json({
        error: 'Printer is not accepting jobs',
        printerStatus,
        message: 'Printer queue is not accepting jobs. Please try again later.',
      });
      return;
    }

    // Create Razorpay order
    const rz = getRazorpay();
    let order;
    try {
      order = await rz.orders.create({
        amount: job.price,
        currency: 'INR',
        receipt: job.id,
        notes: {
          jobId: job.id,
          email: job.user_email,
        },
      });
    } catch (rzErr: any) {
      // Rollback on Razorpay failure
      const db0 = getDb();
      db0.prepare("UPDATE jobs SET status = 'uploaded', updated_at = datetime('now') WHERE id = ? AND status = 'payment_pending'").run(job.id);
      throw rzErr;
    }

    // Store payment record
    const db = getDb();
    const paymentId = `pay_${nanoid(12)}`;
    db.prepare(
      `INSERT INTO payments (id, job_id, razorpay_order_id, amount, currency, status)
       VALUES (?, ?, ?, ?, ?, 'created')`
    ).run(paymentId, job.id, order.id, job.price, 'INR');

    res.json({
      orderId: order.id,
      amount: job.price,
      currency: 'INR',
      jobId: job.id,
      keyId: env.RAZORPAY_KEY_ID,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Payment creation failed');
    res.status(500).json({ error: 'Payment creation failed' });
  }
});

// Client-side verification (fallback)
paymentRouter.post('/verify', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400).json({ error: 'Missing payment verification fields' });
      return;
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature.length !== razorpay_signature.length ||
        !crypto.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(razorpay_signature, 'hex'))) {
      res.status(400).json({ error: 'Payment verification failed - invalid signature' });
      return;
    }

    // Find payment and job
    const db = getDb();
    const payment = db
      .prepare('SELECT * FROM payments WHERE razorpay_order_id = ?')
      .get(razorpay_order_id) as any;

    if (!payment) {
      res.status(404).json({ error: 'Payment record not found' });
      return;
    }

    // If webhook already processed, just return success
    if (payment.webhook_verified) {
      res.json({ success: true, jobId: payment.job_id, status: 'paid' });
      return;
    }

    // Update payment
    db.prepare(
      `UPDATE payments SET razorpay_payment_id = ?, razorpay_signature = ?, status = 'captured', updated_at = datetime('now')
       WHERE razorpay_order_id = ?`
    ).run(razorpay_payment_id, razorpay_signature, razorpay_order_id);

    // Transition job and enqueue for printing
    const transitioned = transitionJob(payment.job_id, 'paid');
    if (transitioned) {
      const job = getJob(payment.job_id);
      const isScheduledForLater = job?.scheduled_at && new Date(job.scheduled_at) > new Date();
      if (!isScheduledForLater) {
        enqueueJob(payment.job_id);
      }
    }

    res.json({ success: true, jobId: payment.job_id, status: 'paid' });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Payment verification failed');
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// Pay for a job using wallet balance
paymentRouter.post('/wallet', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { jobId } = req.body;
    if (!jobId) {
      res.status(400).json({ error: 'jobId is required' });
      return;
    }

    const job = getJob(jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.user_email !== req.userEmail) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    if (job.status !== 'uploaded') {
      res.status(400).json({ error: `Job is in '${job.status}' state, cannot pay` });
      return;
    }

    // Pre-payment printer status gate
    const printerStatus = await getPrinterStatus();
    if (!printerStatus.online) {
      res.status(503).json({ error: 'Printer is offline', printerStatus });
      return;
    }
    if (!printerStatus.accepting) {
      res.status(503).json({ error: 'Printer is not accepting jobs', printerStatus });
      return;
    }

    // Transition job FIRST to prevent double-payment race condition
    const toPending = transitionJob(job.id, 'payment_pending');
    if (!toPending) {
      res.status(409).json({ error: 'Job is already being processed for payment' });
      return;
    }

    // Debit wallet (job is now in payment_pending — safe from concurrent payment)
    const debitResult = debitWallet(req.userEmail!, job.price, jobId, `Print job: ${job.file_name}`);
    if (!debitResult.success) {
      // Rollback: transition back to uploaded
      transitionJob(job.id, 'failed', 'Insufficient wallet balance');
      // Also reset back to uploaded for retry with different payment method
      const db2 = getDb();
      db2.prepare("UPDATE jobs SET status = 'uploaded', updated_at = datetime('now') WHERE id = ? AND status = 'payment_pending'").run(job.id);
      res.status(400).json({ error: 'Insufficient wallet balance', balance: debitResult.balance });
      return;
    }

    // Create payment record with wallet type
    const db = getDb();
    const paymentId = `pay_${nanoid(12)}`;
    db.prepare(
      `INSERT INTO payments (id, job_id, amount, currency, status, payment_type)
       VALUES (?, ?, ?, ?, 'captured', 'wallet')`
    ).run(paymentId, job.id, job.price, 'INR');

    // Transition to paid
    const transitioned = transitionJob(job.id, 'paid');
    if (transitioned) {
      const isScheduledForLater = job.scheduled_at && new Date(job.scheduled_at) > new Date();
      if (!isScheduledForLater) {
        enqueueJob(job.id);
      }
    }

    res.json({ success: true, jobId: job.id, status: 'paid', balance: debitResult.balance });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Wallet payment failed');
    res.status(500).json({ error: 'Wallet payment failed' });
  }
});

// Razorpay webhook (primary verification path)
paymentRouter.post('/webhook', async (req: Request, res: Response) => {
  try {
    const rawBody = (req as any).rawBody as Buffer;
    if (!rawBody) {
      res.status(400).json({ error: 'Missing raw body for signature verification' });
      return;
    }
    const receivedSignature = req.headers['x-razorpay-signature'] as string;

    if (!receivedSignature) {
      res.status(400).json({ error: 'Missing webhook signature' });
      return;
    }

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature.length !== receivedSignature.length ||
        !crypto.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(receivedSignature, 'hex'))) {
      logger.warn('Webhook signature mismatch');
      res.status(400).json({ error: 'Invalid webhook signature' });
      return;
    }

    const event = req.body;

    if (event.event === 'payment.captured') {
      const paymentEntity = event.payload.payment.entity;
      const orderId = paymentEntity.order_id;

      const db = getDb();
      const payment = db
        .prepare('SELECT * FROM payments WHERE razorpay_order_id = ?')
        .get(orderId) as any;

      if (!payment) {
        logger.warn({ orderId }, 'Webhook: payment record not found');
        res.json({ status: 'ok' }); // Still return 200 to not retry
        return;
      }

      // Idempotent: skip if already processed
      if (payment.status === 'captured' && payment.webhook_verified) {
        res.json({ status: 'ok', message: 'Already processed' });
        return;
      }

      // Update payment
      db.prepare(
        `UPDATE payments SET 
          razorpay_payment_id = ?,
          status = 'captured',
          webhook_verified = 1,
          updated_at = datetime('now')
        WHERE razorpay_order_id = ?`
      ).run(paymentEntity.id, orderId);

      // Transition job and enqueue
      const job = getJob(payment.job_id);
      if (job && (job.status === 'payment_pending' || job.status === 'uploaded')) {
        const transitioned = transitionJob(payment.job_id, 'paid');
        if (transitioned) {
          const isScheduledForLater = job.scheduled_at && new Date(job.scheduled_at) > new Date();
          if (!isScheduledForLater) {
            enqueueJob(payment.job_id);
          }
          logger.info({ jobId: payment.job_id, scheduled: !!isScheduledForLater }, 'Webhook: payment verified, job processed');
        }
      }
    }

    if (event.event === 'payment.failed') {
      const paymentEntity = event.payload.payment.entity;
      const orderId = paymentEntity.order_id;

      const db = getDb();
      db.prepare(
        "UPDATE payments SET status = 'failed', updated_at = datetime('now') WHERE razorpay_order_id = ?"
      ).run(orderId);

      const payment = db
        .prepare('SELECT * FROM payments WHERE razorpay_order_id = ?')
        .get(orderId) as any;
      if (payment) {
        transitionJob(payment.job_id, 'failed', 'Payment failed');
      }
    }

    res.json({ status: 'ok' });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Webhook processing error');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});
