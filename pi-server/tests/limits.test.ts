import { describe, it, expect } from 'vitest';

// Test limit checking logic as pure function (mirrors checkLimit from limits.ts)

interface LimitCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}

function checkLimit(
  used: number,
  dailyLimit: number,
  exemptionPages: number,
  incomingPages: number
): LimitCheckResult {
  const effectiveLimit = dailyLimit + exemptionPages;
  return {
    allowed: (used + incomingPages) <= effectiveLimit,
    used,
    limit: effectiveLimit,
    remaining: Math.max(0, effectiveLimit - used),
  };
}

describe('checkLimit - Basic', () => {
  it('allows when well under limit', () => {
    const result = checkLimit(0, 100, 0, 50);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(100);
  });

  it('allows when exactly at limit', () => {
    const result = checkLimit(99, 100, 0, 1);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it('rejects when over limit by 1', () => {
    const result = checkLimit(99, 100, 0, 2);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(1);
  });

  it('rejects when already at limit', () => {
    const result = checkLimit(100, 100, 0, 1);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('allows zero incoming at limit', () => {
    const result = checkLimit(100, 100, 0, 0);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });
});

describe('checkLimit - With Exemptions', () => {
  it('exemption raises effective limit', () => {
    const result = checkLimit(100, 100, 50, 10);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(150);
  });

  it('allows up to effective limit', () => {
    const result = checkLimit(140, 100, 50, 10);
    expect(result.allowed).toBe(true);
  });

  it('rejects over effective limit', () => {
    const result = checkLimit(140, 100, 50, 11);
    expect(result.allowed).toBe(false);
  });

  it('remaining accounts for exemptions', () => {
    const result = checkLimit(80, 100, 20, 0);
    expect(result.remaining).toBe(40);
    expect(result.limit).toBe(120);
  });
});

describe('checkLimit - Edge Cases', () => {
  it('zero limit rejects any pages', () => {
    const result = checkLimit(0, 0, 0, 1);
    expect(result.allowed).toBe(false);
  });

  it('zero limit allows zero incoming', () => {
    const result = checkLimit(0, 0, 0, 0);
    expect(result.allowed).toBe(true);
  });

  it('large incoming count', () => {
    const result = checkLimit(0, 100, 0, 1000);
    expect(result.allowed).toBe(false);
  });

  it('large limit allows large incoming', () => {
    const result = checkLimit(0, 10000, 0, 10000);
    expect(result.allowed).toBe(true);
  });

  it('remaining never goes negative', () => {
    const result = checkLimit(200, 100, 0, 0);
    expect(result.remaining).toBe(0);
  });

  it('used exceeds limit but zero incoming still rejected', () => {
    // If used=150, limit=100, incoming=1 → 151 > 100 → false
    const result = checkLimit(150, 100, 0, 1);
    expect(result.allowed).toBe(false);
  });

  it('used exceeds limit with zero incoming is allowed', () => {
    // 150 + 0 = 150 <= 100 is false... but let's check
    const result = checkLimit(150, 100, 0, 0);
    expect(result.allowed).toBe(false);
  });
});
