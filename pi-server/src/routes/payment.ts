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

    // Pre-payment printer status gate
    const printerStatus = await getPrinterStatus();
    if (!printerStatus.online) {
      res.status(503).json({
        error: 'Printer is offline',
        printerStatus,
        message: 'Cannot process payment while printer is offline. Please try again later.',
      });
      return;
    }

    if (!printerStatus.accepting) {
      res.status(503).json({
        error: 'Printer is not accepting jobs',
        printerStatus,
        message: 'Printer queue is not accepting jobs. Please try again later.',
      });
      return;
    }

    // Create Razorpay order
    const rz = getRazorpay();
    const order = await rz.orders.create({
      amount: job.price,
      currency: 'INR',
      receipt: job.id,
      notes: {
        jobId: job.id,
        email: job.user_email,
      },
    });

    // Store payment record
    const db = getDb();
    const paymentId = `pay_${nanoid(12)}`;
    db.prepare(
      `INSERT INTO payments (id, job_id, razorpay_order_id, amount, currency, status)
       VALUES (?, ?, ?, ?, ?, 'created')`
    ).run(paymentId, job.id, order.id, job.price, 'INR');

    // Transition job to payment_pending
    transitionJob(job.id, 'payment_pending');

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

    if (expectedSignature !== razorpay_signature) {
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
      enqueueJob(payment.job_id);
    }

    res.json({ success: true, jobId: payment.job_id, status: 'paid' });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Payment verification failed');
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// Razorpay webhook (primary verification path)
paymentRouter.post('/webhook', async (req: Request, res: Response) => {
  try {
    const webhookBody = JSON.stringify(req.body);
    const receivedSignature = req.headers['x-razorpay-signature'] as string;

    if (!receivedSignature) {
      res.status(400).json({ error: 'Missing webhook signature' });
      return;
    }

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
      .update(webhookBody)
      .digest('hex');

    if (expectedSignature !== receivedSignature) {
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
        transitionJob(payment.job_id, 'paid');
        enqueueJob(payment.job_id);
        logger.info({ jobId: payment.job_id }, 'Webhook: payment verified, job enqueued');
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
