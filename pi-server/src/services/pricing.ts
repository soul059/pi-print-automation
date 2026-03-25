import { env } from '../config/env';

export interface PriceCalculation {
  totalPages: number;
  printPages: number;
  pricePerPage: number;
  copies: number;
  duplexDiscount: number;
  subtotal: number;
  receiptPageCost: number; // cost for printed receipt page (0 if not requested)
  total: number; // in paise
}

export function parsePageRange(range: string | undefined, totalPages: number): number {
  if (!range || range.trim() === '') return totalPages;

  const pages = new Set<number>();
  const parts = range.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = Math.min(parseInt(endStr, 10), totalPages);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = start; i <= end; i++) pages.add(i);
      }
    } else {
      const page = parseInt(trimmed, 10);
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        pages.add(page);
      }
    }
  }

  return pages.size || totalPages;
}

export function calculatePrice(
  totalPages: number,
  pageRange: string | undefined,
  color: 'grayscale' | 'color',
  copies: number,
  duplex: boolean,
  printReceipt: boolean = false // if true, adds 1 extra page for printed receipt
): PriceCalculation {
  const printPages = parsePageRange(pageRange, totalPages);
  const pricePerPage = color === 'color' ? env.PRICE_COLOR_PER_PAGE : env.PRICE_BW_PER_PAGE;
  const duplexDiscount = duplex ? env.DUPLEX_DISCOUNT : 1;

  const subtotal = printPages * pricePerPage * copies;
  // Receipt page is always B/W, charged at B/W rate if requested
  const receiptPageCost = printReceipt ? env.PRICE_BW_PER_PAGE : 0;
  const total = Math.ceil(subtotal * duplexDiscount) + receiptPageCost;

  return {
    totalPages,
    printPages,
    pricePerPage,
    copies,
    duplexDiscount,
    subtotal,
    receiptPageCost,
    total,
  };
}

export function formatPriceINR(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}
