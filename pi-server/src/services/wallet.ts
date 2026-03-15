import { getDb } from '../db/connection';

export interface WalletTransaction {
  id: number;
  user_email: string;
  type: 'topup' | 'debit' | 'refund';
  amount: number;
  balance_after: number;
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

export function getOrCreateWallet(email: string): { balance: number } {
  const db = getDb();
  const wallet = db.prepare('SELECT balance FROM wallets WHERE user_email = ?').get(email) as { balance: number } | undefined;
  if (wallet) return { balance: wallet.balance };

  db.prepare('INSERT INTO wallets (user_email, balance) VALUES (?, 0)').run(email);
  return { balance: 0 };
}

export function getBalance(email: string): number {
  return getOrCreateWallet(email).balance;
}

export function creditWallet(
  email: string,
  amount: number,
  referenceId: string,
  description: string
): { balance: number } {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Amount must be a positive integer');
  }
  const db = getDb();
  getOrCreateWallet(email);

  // Idempotency guard: skip if transaction with same reference already exists
  const existing = db.prepare(
    'SELECT id FROM wallet_transactions WHERE reference_id = ? AND user_email = ?'
  ).get(referenceId, email);
  if (existing) {
    const wallet = db.prepare('SELECT balance FROM wallets WHERE user_email = ?').get(email) as { balance: number };
    return { balance: wallet.balance };
  }

  db.prepare(
    "UPDATE wallets SET balance = balance + ?, updated_at = datetime('now') WHERE user_email = ?"
  ).run(amount, email);

  const wallet = db.prepare('SELECT balance FROM wallets WHERE user_email = ?').get(email) as { balance: number };

  db.prepare(
    'INSERT INTO wallet_transactions (user_email, type, amount, balance_after, reference_id, description) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(email, amount > 0 && description.toLowerCase().includes('refund') ? 'refund' : 'topup', amount, wallet.balance, referenceId, description);

  return { balance: wallet.balance };
}

export function debitWallet(
  email: string,
  amount: number,
  referenceId: string,
  description: string
): { success: boolean; balance: number } {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { success: false, balance: getBalance(email) };
  }
  const db = getDb();
  const currentBalance = getBalance(email);

  if (currentBalance < amount) {
    return { success: false, balance: currentBalance };
  }

  const result = db.prepare(
    "UPDATE wallets SET balance = balance - ?, updated_at = datetime('now') WHERE user_email = ? AND balance >= ?"
  ).run(amount, email, amount);

  // Check if the UPDATE actually modified a row (race condition guard)
  if ((result as any).changes === 0) {
    const actualBalance = getBalance(email);
    return { success: false, balance: actualBalance };
  }

  const wallet = db.prepare('SELECT balance FROM wallets WHERE user_email = ?').get(email) as { balance: number };

  db.prepare(
    'INSERT INTO wallet_transactions (user_email, type, amount, balance_after, reference_id, description) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(email, 'debit', amount, wallet.balance, referenceId, description);

  return { success: true, balance: wallet.balance };
}

export function refundToWallet(
  email: string,
  amount: number,
  referenceId: string,
  description: string
): { balance: number } {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Refund amount must be a positive integer');
  }
  const db = getDb();
  getOrCreateWallet(email);

  // Idempotency guard: skip if refund with same reference already exists
  const existing = db.prepare(
    "SELECT id FROM wallet_transactions WHERE reference_id = ? AND user_email = ? AND type = 'refund'"
  ).get(referenceId, email);
  if (existing) {
    const wallet = db.prepare('SELECT balance FROM wallets WHERE user_email = ?').get(email) as { balance: number };
    return { balance: wallet.balance };
  }

  db.prepare(
    "UPDATE wallets SET balance = balance + ?, updated_at = datetime('now') WHERE user_email = ?"
  ).run(amount, email);

  const wallet = db.prepare('SELECT balance FROM wallets WHERE user_email = ?').get(email) as { balance: number };

  db.prepare(
    'INSERT INTO wallet_transactions (user_email, type, amount, balance_after, reference_id, description) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(email, 'refund', amount, wallet.balance, referenceId, description);

  return { balance: wallet.balance };
}

export function getTransactions(email: string, limit: number = 20): WalletTransaction[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM wallet_transactions WHERE user_email = ? ORDER BY created_at DESC LIMIT ?'
  ).all(email, limit) as WalletTransaction[];
}
