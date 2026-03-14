import { getDb } from '../db/connection';

export function getDailyPageLimit(): number {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'daily_page_limit'").get() as any;
  return row ? parseInt(row.value, 10) : 100;
}

export function setDailyPageLimit(limit: number): void {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('daily_page_limit', ?, datetime('now'))"
  ).run(String(limit));
}

export function getTodayPageCount(email: string): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT COALESCE(SUM(total_pages), 0) as total FROM jobs WHERE user_email = ? AND DATE(created_at) = DATE('now') AND status NOT IN ('failed', 'failed_permanent')"
  ).get(email) as any;
  return row?.total ?? 0;
}

export function getExemptionPages(email: string): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT COALESCE(SUM(extra_pages), 0) as total FROM print_exemptions WHERE user_email = ? AND expires_at > datetime('now')"
  ).get(email) as any;
  return row?.total ?? 0;
}

export interface LimitCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}

export function checkLimit(email: string, incomingPages: number = 0): LimitCheckResult {
  const limit = getDailyPageLimit();
  const used = getTodayPageCount(email);
  const exemptions = getExemptionPages(email);
  const effectiveLimit = limit + exemptions;
  return {
    allowed: (used + incomingPages) <= effectiveLimit,
    used,
    limit: effectiveLimit,
    remaining: Math.max(0, effectiveLimit - used),
  };
}
