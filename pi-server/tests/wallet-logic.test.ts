import { describe, it, expect } from 'vitest';

// Test wallet business logic as pure functions (without DB)

interface WalletState {
  balance: number;
}

function canDebit(wallet: WalletState, amount: number): boolean {
  return wallet.balance >= amount;
}

function applyCredit(wallet: WalletState, amount: number): WalletState {
  return { balance: wallet.balance + amount };
}

function applyDebit(wallet: WalletState, amount: number): { success: boolean; wallet: WalletState } {
  if (wallet.balance < amount) {
    return { success: false, wallet };
  }
  return { success: true, wallet: { balance: wallet.balance - amount } };
}

function applyRefund(wallet: WalletState, amount: number): WalletState {
  // Refund is just a credit
  return applyCredit(wallet, amount);
}

describe('Wallet - Balance Check', () => {
  it('allows debit when balance equals amount', () => {
    expect(canDebit({ balance: 100 }, 100)).toBe(true);
  });

  it('allows debit when balance exceeds amount', () => {
    expect(canDebit({ balance: 200 }, 100)).toBe(true);
  });

  it('rejects debit when balance is less than amount', () => {
    expect(canDebit({ balance: 50 }, 100)).toBe(false);
  });

  it('rejects debit on zero balance', () => {
    expect(canDebit({ balance: 0 }, 1)).toBe(false);
  });

  it('allows debit of zero amount', () => {
    expect(canDebit({ balance: 0 }, 0)).toBe(true);
  });
});

describe('Wallet - Credit', () => {
  it('increases balance', () => {
    const result = applyCredit({ balance: 100 }, 50);
    expect(result.balance).toBe(150);
  });

  it('credits from zero', () => {
    const result = applyCredit({ balance: 0 }, 500);
    expect(result.balance).toBe(500);
  });

  it('credits zero amount (no-op)', () => {
    const result = applyCredit({ balance: 100 }, 0);
    expect(result.balance).toBe(100);
  });

  it('handles very large credit', () => {
    const result = applyCredit({ balance: 0 }, Number.MAX_SAFE_INTEGER);
    expect(result.balance).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('multiple credits accumulate', () => {
    let wallet: WalletState = { balance: 0 };
    wallet = applyCredit(wallet, 100);
    wallet = applyCredit(wallet, 200);
    wallet = applyCredit(wallet, 300);
    expect(wallet.balance).toBe(600);
  });
});

describe('Wallet - Debit', () => {
  it('decreases balance', () => {
    const result = applyDebit({ balance: 100 }, 40);
    expect(result.success).toBe(true);
    expect(result.wallet.balance).toBe(60);
  });

  it('debits exact balance to zero', () => {
    const result = applyDebit({ balance: 100 }, 100);
    expect(result.success).toBe(true);
    expect(result.wallet.balance).toBe(0);
  });

  it('fails when insufficient balance', () => {
    const result = applyDebit({ balance: 50 }, 100);
    expect(result.success).toBe(false);
    expect(result.wallet.balance).toBe(50); // unchanged
  });

  it('debits zero amount', () => {
    const result = applyDebit({ balance: 100 }, 0);
    expect(result.success).toBe(true);
    expect(result.wallet.balance).toBe(100);
  });

  it('fails debit on zero balance', () => {
    const result = applyDebit({ balance: 0 }, 1);
    expect(result.success).toBe(false);
  });
});

describe('Wallet - Refund', () => {
  it('refund increases balance (same as credit)', () => {
    const result = applyRefund({ balance: 100 }, 50);
    expect(result.balance).toBe(150);
  });

  it('refund after full debit restores balance', () => {
    let wallet: WalletState = { balance: 200 };
    const debitResult = applyDebit(wallet, 200);
    expect(debitResult.success).toBe(true);
    wallet = debitResult.wallet;
    expect(wallet.balance).toBe(0);
    wallet = applyRefund(wallet, 200);
    expect(wallet.balance).toBe(200);
  });

  it('partial refund', () => {
    const result = applyRefund({ balance: 0 }, 50);
    expect(result.balance).toBe(50);
  });
});

describe('Wallet - Negative Amount Protection', () => {
  it('negative credit would decrease balance (should be validated upstream)', () => {
    // This tests the raw logic; upstream should prevent negative amounts
    const result = applyCredit({ balance: 100 }, -50);
    expect(result.balance).toBe(50); // raw behavior
  });

  it('negative debit would increase balance (should be validated upstream)', () => {
    const result = applyDebit({ balance: 100 }, -50);
    expect(result.success).toBe(true); // 100 >= -50
    expect(result.wallet.balance).toBe(150); // raw behavior
  });
});

describe('Wallet - Overflow', () => {
  it('very large balance stays precise', () => {
    const wallet = applyCredit({ balance: Number.MAX_SAFE_INTEGER - 1 }, 1);
    expect(wallet.balance).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('credit + debit cycle preserves balance', () => {
    let wallet: WalletState = { balance: 0 };
    wallet = applyCredit(wallet, 999999);
    const result = applyDebit(wallet, 999999);
    expect(result.success).toBe(true);
    expect(result.wallet.balance).toBe(0);
  });
});
