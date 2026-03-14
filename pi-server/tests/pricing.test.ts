import { describe, it, expect } from 'vitest';
import { calculatePrice, parsePageRange, formatPriceINR } from '../src/services/pricing';

describe('parsePageRange', () => {
  it('returns total pages when no range specified', () => {
    expect(parsePageRange(undefined, 10)).toBe(10);
    expect(parsePageRange('', 10)).toBe(10);
  });

  it('parses single page', () => {
    expect(parsePageRange('3', 10)).toBe(1);
  });

  it('parses page range', () => {
    expect(parsePageRange('1-5', 10)).toBe(5);
  });

  it('parses multiple ranges', () => {
    expect(parsePageRange('1-3,5-7', 10)).toBe(6);
  });

  it('clamps to total pages', () => {
    expect(parsePageRange('1-20', 10)).toBe(10);
  });

  it('handles mixed pages and ranges', () => {
    expect(parsePageRange('1,3-5,8', 10)).toBe(5);
  });
});

describe('calculatePrice', () => {
  it('calculates B&W single page', () => {
    const result = calculatePrice(1, undefined, 'grayscale', 1, false);
    expect(result.total).toBe(200); // 200 paise = ₹2
  });

  it('calculates color pages', () => {
    const result = calculatePrice(5, undefined, 'color', 1, false);
    expect(result.total).toBe(2500); // 5 × 500 paise
  });

  it('applies duplex discount', () => {
    const result = calculatePrice(10, undefined, 'grayscale', 1, true);
    expect(result.total).toBe(1600); // 10 × 200 × 0.8
  });

  it('multiplies by copies', () => {
    const result = calculatePrice(5, undefined, 'grayscale', 3, false);
    expect(result.total).toBe(3000); // 5 × 200 × 3
  });

  it('respects page range', () => {
    const result = calculatePrice(10, '1-3', 'grayscale', 1, false);
    expect(result.total).toBe(600); // 3 × 200
  });
});

describe('formatPriceINR', () => {
  it('formats paise to rupees', () => {
    expect(formatPriceINR(200)).toBe('₹2.00');
    expect(formatPriceINR(1050)).toBe('₹10.50');
  });
});
