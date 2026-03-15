import { describe, it, expect, vi } from 'vitest';

// Mock env before importing pricing
vi.mock('../src/config/env', () => ({
  env: {
    PRICE_BW_PER_PAGE: 200,
    PRICE_COLOR_PER_PAGE: 500,
    DUPLEX_DISCOUNT: 0.8,
  },
}));

import { calculatePrice, parsePageRange, formatPriceINR } from '../src/services/pricing';

describe('parsePageRange - extended', () => {
  it('returns totalPages for undefined range', () => {
    expect(parsePageRange(undefined, 10)).toBe(10);
  });

  it('returns totalPages for empty string', () => {
    expect(parsePageRange('', 10)).toBe(10);
  });

  it('returns totalPages for whitespace-only', () => {
    expect(parsePageRange('   ', 10)).toBe(10);
  });

  it('parses single page "1"', () => {
    expect(parsePageRange('1', 10)).toBe(1);
  });

  it('parses single page range "1-1"', () => {
    expect(parsePageRange('1-1', 10)).toBe(1);
  });

  it('deduplicates overlapping ranges "1-5,3-7"', () => {
    expect(parsePageRange('1-5,3-7', 10)).toBe(7);
  });

  it('handles reverse range "5-1" (start > end, no pages)', () => {
    // When start > end the loop doesn't execute, falls back to totalPages
    const result = parsePageRange('5-1', 10);
    expect(result).toBe(10); // falls back because pages set is empty
  });

  it('clamps range end to totalPages', () => {
    expect(parsePageRange('1-20', 10)).toBe(10);
  });

  it('rejects page 0 (below range)', () => {
    expect(parsePageRange('0', 10)).toBe(10); // 0 < 1, not added, falls back
  });

  it('rejects negative page', () => {
    expect(parsePageRange('-1', 10)).toBe(10);
  });

  it('handles page beyond total (single)', () => {
    expect(parsePageRange('15', 10)).toBe(10); // 15 > 10, not added, falls back
  });

  it('handles all pages in range "1-10"', () => {
    expect(parsePageRange('1-10', 10)).toBe(10);
  });

  it('handles duplicate single pages "1,1,1"', () => {
    expect(parsePageRange('1,1,1', 10)).toBe(1);
  });

  it('handles spaces in range "1 - 5"', () => {
    // The split on '-' will produce ' 1 ' and ' 5', parseInt handles whitespace
    expect(parsePageRange('1 - 5', 10)).toBe(5);
  });

  it('handles invalid format (letters)', () => {
    expect(parsePageRange('abc', 10)).toBe(10); // NaN, falls back
  });

  it('handles mixed valid and invalid parts', () => {
    expect(parsePageRange('1-3,abc,5', 10)).toBe(4); // pages 1,2,3,5
  });

  it('handles very large page count', () => {
    expect(parsePageRange('1-10000', 10000)).toBe(10000);
  });
});

describe('calculatePrice - extended', () => {
  it('calculates zero pages (edge case)', () => {
    // parsePageRange returns totalPages=0 for empty range
    const result = calculatePrice(0, undefined, 'grayscale', 1, false);
    expect(result.total).toBe(0);
    expect(result.printPages).toBe(0);
  });

  it('calculates single B&W page', () => {
    const result = calculatePrice(1, undefined, 'grayscale', 1, false);
    expect(result.total).toBe(200);
  });

  it('calculates single color page', () => {
    const result = calculatePrice(1, undefined, 'color', 1, false);
    expect(result.total).toBe(500);
  });

  it('color price is higher than grayscale', () => {
    const bw = calculatePrice(5, undefined, 'grayscale', 1, false);
    const color = calculatePrice(5, undefined, 'color', 1, false);
    expect(color.total).toBeGreaterThan(bw.total);
  });

  it('duplex discount is exactly 0.8x', () => {
    const noDuplex = calculatePrice(10, undefined, 'grayscale', 1, false);
    const duplex = calculatePrice(10, undefined, 'grayscale', 1, true);
    expect(duplex.total).toBe(Math.ceil(noDuplex.total * 0.8));
  });

  it('duplex + color', () => {
    const result = calculatePrice(10, undefined, 'color', 1, true);
    expect(result.total).toBe(Math.ceil(10 * 500 * 0.8)); // 4000
  });

  it('multiple copies', () => {
    const result = calculatePrice(5, undefined, 'grayscale', 3, false);
    expect(result.total).toBe(5 * 200 * 3); // 3000
  });

  it('multiple copies with duplex', () => {
    const result = calculatePrice(5, undefined, 'grayscale', 3, true);
    expect(result.total).toBe(Math.ceil(5 * 200 * 3 * 0.8)); // 2400
  });

  it('page range with copies', () => {
    const result = calculatePrice(10, '1-3', 'grayscale', 2, false);
    expect(result.total).toBe(3 * 200 * 2); // 1200
  });

  it('very large page count', () => {
    const result = calculatePrice(10000, undefined, 'grayscale', 1, false);
    expect(result.total).toBe(10000 * 200);
    expect(result.total).toBeGreaterThan(0);
  });

  it('price is always a non-negative integer', () => {
    const cases = [
      { pages: 1, color: 'grayscale' as const, duplex: false },
      { pages: 3, color: 'color' as const, duplex: true },
      { pages: 7, color: 'grayscale' as const, duplex: true },
      { pages: 0, color: 'color' as const, duplex: false },
    ];
    for (const c of cases) {
      const result = calculatePrice(c.pages, undefined, c.color, 1, c.duplex);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(result.total)).toBe(true);
    }
  });

  it('returns correct breakdown fields', () => {
    const result = calculatePrice(10, '1-5', 'color', 2, true);
    expect(result.totalPages).toBe(10);
    expect(result.printPages).toBe(5);
    expect(result.pricePerPage).toBe(500);
    expect(result.copies).toBe(2);
    expect(result.duplexDiscount).toBe(0.8);
    expect(result.subtotal).toBe(5 * 500 * 2);
    expect(result.total).toBe(Math.ceil(5 * 500 * 2 * 0.8));
  });

  it('all combinations of color and duplex', () => {
    const combos: Array<{ color: 'grayscale' | 'color'; duplex: boolean }> = [
      { color: 'grayscale', duplex: false },
      { color: 'grayscale', duplex: true },
      { color: 'color', duplex: false },
      { color: 'color', duplex: true },
    ];
    for (const combo of combos) {
      const result = calculatePrice(5, undefined, combo.color, 1, combo.duplex);
      expect(result.total).toBeGreaterThan(0);
    }
  });
});

describe('formatPriceINR - extended', () => {
  it('formats 0 paise', () => {
    expect(formatPriceINR(0)).toBe('₹0.00');
  });

  it('formats 1 paisa', () => {
    expect(formatPriceINR(1)).toBe('₹0.01');
  });

  it('formats 100 paise (₹1)', () => {
    expect(formatPriceINR(100)).toBe('₹1.00');
  });

  it('formats 1050 paise', () => {
    expect(formatPriceINR(1050)).toBe('₹10.50');
  });

  it('formats large amount', () => {
    expect(formatPriceINR(1000000)).toBe('₹10000.00');
  });

  it('formats odd paise', () => {
    expect(formatPriceINR(199)).toBe('₹1.99');
  });
});
