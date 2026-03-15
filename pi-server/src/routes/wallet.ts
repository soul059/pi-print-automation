import { Router, Response } from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getBalance, creditWallet, getTransactions, getOrCreateWallet } from '../services/wallet';
import { nanoid } from 'nanoid';
import { getDb } from '../db/connection';

export const walletRouter = Router();

let razorpay: Razorpay;
function getRazorpay(): Razorpay {
  if (!razorpay) {
    razorpay = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_SECRET });
  }
  return razorpay;
}

const MIN_TOPUP = 1000;  // ₹10 in paise
const MAX_TOPUP = 50000; // ₹500 in paise

// Get wallet balance + recent transactions
walletRouter.get('/', requireAuth, (req: AuthRequest, res: Response) => {
  try {
    const email = req.userEmail!;
    const wallet = getOrCreateWallet(email);
    const transactions = getTransactions(email, 20);
    res.json({ balance: wallet.balance, transactions });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to get wallet');
    res.status(500).json({ error: 'Failed to get wallet' });
  }
});

// Create Razorpay order for wallet top-up
walletRouter.post('/topup', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { amount } = req.body;
    const email = req.userEmail!;

    if (!amount || typeof amount !== 'number' || !Number.isInteger(amount)) {
      res.status(400).json({ error: 'amount is required and must be an integer (in paise)' });
      return;
    }

    if (amount < MIN_TOPUP) {
      res.status(400).json({ error: `Minimum top-up is ₹${MIN_TOPUP / 100}` });
      return;
    }

    if (amount > MAX_TOPUP) {
      res.status(400).json({ error: `Maximum top-up is ₹${MAX_TOPUP / 100}` });
      return;
    }

    const rz = getRazorpay();
    const receiptId = `wt_${nanoid(12)}`;
    const order = await rz.orders.create({
      amount,
      currency: 'INR',
      receipt: receiptId,
      notes: {
        type: 'wallet_topup',
        email,
      },
    });

    // Store a payment record for tracking
    const db = getDb();
    const paymentId = `pay_${nanoid(12)}`;
    db.prepare(
      `INSERT INTO payments (id, job_id, razorpay_order_id, amount, currency, status, payment_type)
       VALUES (?, ?, ?, ?, ?, 'created', 'wallet_topup')`
    ).run(paymentId, receiptId, order.id, amount, 'INR');

    res.json({
      orderId: order.id,
      amount,
      currency: 'INR',
      keyId: env.RAZORPAY_KEY_ID,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Wallet top-up creation failed');
    res.status(500).json({ error: 'Failed to create top-up order' });
  }
});

// Verify Razorpay payment for wallet top-up
walletRouter.post('/topup/verify', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const email = req.userEmail!;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400).json({ error: 'Missing payment verification fields' });
      return;
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (!/^[0-9a-f]+$/i.test(razorpay_signature) ||
        expectedSignature.length !== razorpay_signature.length ||
        !crypto.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(razorpay_signature, 'hex'))) {
      res.status(400).json({ error: 'Payment verification failed - invalid signature' });
      return;
    }

    // Find payment record
    const db = getDb();
    const payment = db
      .prepare("SELECT * FROM payments WHERE razorpay_order_id = ? AND payment_type = 'wallet_topup'")
      .get(razorpay_order_id) as any;

    if (!payment) {
      res.status(404).json({ error: 'Top-up payment record not found' });
      return;
    }

    // Verify order ownership: the Razorpay order was created with notes.email
    // Fetch order from Razorpay to confirm the authenticated user matches
    const rz = getRazorpay();
    const order = await rz.orders.fetch(razorpay_order_id);
    if (order.notes?.email && order.notes.email !== email) {
      res.status(403).json({ error: 'Order does not belong to this user' });
      return;
    }

    // Idempotent: if already captured, return current balance
    if (payment.status === 'captured') {
      const balance = getBalance(email);
      res.json({ success: true, balance });
      return;
    }

    // Atomic: only update if still 'created' — prevents double-credit race condition
    const updateResult = db.prepare(
      `UPDATE payments SET razorpay_payment_id = ?, razorpay_signature = ?, status = 'captured', updated_at = datetime('now')
       WHERE razorpay_order_id = ? AND status = 'created'`
    ).run(razorpay_payment_id, razorpay_signature, razorpay_order_id);

    if ((updateResult as any).changes === 0) {
      // Another concurrent request already processed this payment
      const balance = getBalance(email);
      res.json({ success: true, balance });
      return;
    }

    // Credit wallet — only reached if we won the race
    const result = creditWallet(email, payment.amount, razorpay_payment_id, `Wallet top-up of ₹${(payment.amount / 100).toFixed(2)}`);

    logger.info({ email, amount: payment.amount, balance: result.balance }, 'Wallet top-up successful');
    res.json({ success: true, balance: result.balance });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Wallet top-up verification failed');
    res.status(500).json({ error: 'Top-up verification failed' });
  }
});
