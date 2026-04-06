import { env } from '../config/env';
import { logger } from '../config/logger';

const TELEGRAM_API = 'https://api.telegram.org';

function isConfigured(): boolean {
  return !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}

async function sendMessage(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
  if (!isConfigured()) return false;

  try {
    const url = `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.warn({ status: res.status, body }, 'Telegram send failed');
      return false;
    }
    return true;
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Telegram send error');
    return false;
  }
}

// Debounce repeated alerts (e.g., printer offline polling)
const alertCooldowns = new Map<string, number>();
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const URGENT_COOLDOWN_MS = 1 * 60 * 1000; // 1 minute for urgent alerts

function shouldAlert(key: string, urgentCooldown = false): boolean {
  const now = Date.now();
  const last = alertCooldowns.get(key);
  const cooldown = urgentCooldown ? URGENT_COOLDOWN_MS : COOLDOWN_MS;
  if (last && now - last < cooldown) return false;
  alertCooldowns.set(key, now);
  return true;
}

// Clear cooldown (e.g., when issue is resolved)
function clearCooldown(key: string): void {
  alertCooldowns.delete(key);
}

export const telegram = {
  isConfigured,
  clearCooldown,

  async printerOffline(printerName: string) {
    if (!shouldAlert(`offline:${printerName}`)) return;
    await sendMessage(
      `🔴 <b>Printer Offline</b>\n` +
      `Printer <code>${printerName}</code> is not responding.\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  async printerOnline(printerName: string) {
    clearCooldown(`offline:${printerName}`);
    clearCooldown(`paper_empty:${printerName}`);
    clearCooldown(`paper_jam:${printerName}`);
    if (!shouldAlert(`online:${printerName}`)) return;
    await sendMessage(
      `🟢 <b>Printer Online</b>\n` +
      `Printer <code>${printerName}</code> is back online.\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  // NEW: Paper empty alert
  async paperEmpty(printerName: string) {
    if (!shouldAlert(`paper_empty:${printerName}`, true)) return;
    await sendMessage(
      `📄 <b>PAPER EMPTY</b> 🚨\n` +
      `Printer <code>${printerName}</code> is out of paper!\n` +
      `⏸️ Print queue is paused.\n` +
      `Please load paper immediately.\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  // NEW: Paper jam alert
  async paperJam(printerName: string) {
    if (!shouldAlert(`paper_jam:${printerName}`, true)) return;
    await sendMessage(
      `🔧 <b>PAPER JAM</b> 🚨\n` +
      `Printer <code>${printerName}</code> has a paper jam!\n` +
      `⏸️ Print queue is paused.\n` +
      `Please clear the jam immediately.\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  // NEW: Paper low warning (with remaining count)
  async paperLow(printerName: string, remaining?: number) {
    if (!shouldAlert(`paper_low:${printerName}`)) return;
    const countInfo = remaining !== undefined ? `\nRemaining: <b>${remaining} sheets</b>` : '';
    await sendMessage(
      `📄 <b>Paper Low</b>\n` +
      `Printer <code>${printerName}</code> is running low on paper.${countInfo}\n` +
      `Please refill soon.\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  // NEW: Not enough paper for job
  async notEnoughPaper(printerName: string, needed: number, available: number, jobId?: string) {
    if (!shouldAlert(`not_enough:${printerName}`, true)) return;
    const jobInfo = jobId ? `\nJob: <code>${jobId}</code>` : '';
    await sendMessage(
      `📄 <b>NOT ENOUGH PAPER</b> 🚨\n` +
      `Printer <code>${printerName}</code>` +
      `\nNeeded: <b>${needed} pages</b>` +
      `\nAvailable: <b>${available} sheets</b>` +
      `\nShortfall: <b>${needed - available} sheets</b>${jobInfo}` +
      `\n\n⏸️ Print queue is paused.\n` +
      `Please load paper and add count in Peon Portal.\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  // NEW: Cover open alert
  async coverOpen(printerName: string) {
    if (!shouldAlert(`cover_open:${printerName}`, true)) return;
    await sendMessage(
      `🚪 <b>Cover Open</b> 🚨\n` +
      `Printer <code>${printerName}</code> has its cover open!\n` +
      `⏸️ Print queue is paused.\n` +
      `Please close the cover.\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  // NEW: Job stuck alert
  async jobStuck(jobId: string, printerName: string, stuckMinutes: number) {
    if (!shouldAlert(`stuck:${jobId}`)) return;
    await sendMessage(
      `⏰ <b>Job Stuck</b>\n` +
      `Job <code>${jobId}</code> has been stuck for ${stuckMinutes} minutes!\n` +
      `Printer: <code>${printerName}</code>\n` +
      `May need manual intervention.\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  // NEW: Queue paused alert
  async queuePaused(reason: string) {
    await sendMessage(
      `⏸️ <b>Queue Paused</b>\n` +
      `Reason: ${reason}\n` +
      `No new jobs will print until resolved.\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  // NEW: Queue resumed alert
  async queueResumed() {
    await sendMessage(
      `▶️ <b>Queue Resumed</b>\n` +
      `Print queue is now active.\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  async jobFailed(jobId: string, email: string, reason: string) {
    await sendMessage(
      `❌ <b>Print Job Failed</b>\n` +
      `Job: <code>${jobId}</code>\n` +
      `User: ${email}\n` +
      `Reason: ${reason}\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  // NEW: High value refund alert
  async highValueRefund(jobId: string, email: string, amount: number) {
    await sendMessage(
      `💰 <b>Refund Processed</b>\n` +
      `Job: <code>${jobId}</code>\n` +
      `User: ${email}\n` +
      `Amount: ₹${(amount / 100).toFixed(2)}\n` +
      `Refunded to wallet.\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  async lowSupply(printerName: string, supply: string, level: number) {
    if (!shouldAlert(`supply:${printerName}:${supply}`)) return;
    const emoji = level <= 5 ? '🚨' : '⚠️';
    await sendMessage(
      `${emoji} <b>Low Supply</b>\n` +
      `Printer: <code>${printerName}</code>\n` +
      `${supply}: ${level}%\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  // NEW: Critical supply alert (< 5%)
  async criticalSupply(printerName: string, supply: string, level: number) {
    if (!shouldAlert(`critical_supply:${printerName}:${supply}`, true)) return;
    await sendMessage(
      `🚨 <b>CRITICAL: Supply Almost Empty</b>\n` +
      `Printer: <code>${printerName}</code>\n` +
      `${supply}: ${level}%\n` +
      `Replace immediately!\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  async serverStarted() {
    await sendMessage(
      `🚀 <b>Print Server Started</b>\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  // NEW: Server crash recovery notification
  async serverRecovered(recoveredJobs: number, pendingRefunds: number) {
    if (recoveredJobs === 0 && pendingRefunds === 0) return;
    await sendMessage(
      `🔄 <b>Server Recovery</b>\n` +
      `Recovered ${recoveredJobs} interrupted job(s)\n` +
      `Pending refunds: ${pendingRefunds}\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  // NEW: Daily summary
  async dailySummary(stats: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    revenue: number;
    refunds: number;
    uniqueUsers: number;
  }) {
    await sendMessage(
      `📊 <b>Daily Summary</b>\n\n` +
      `📄 Total Jobs: ${stats.totalJobs}\n` +
      `✅ Completed: ${stats.completedJobs}\n` +
      `❌ Failed: ${stats.failedJobs}\n` +
      `👥 Users: ${stats.uniqueUsers}\n` +
      `💰 Revenue: ₹${(stats.revenue / 100).toFixed(2)}\n` +
      `↩️ Refunds: ₹${(stats.refunds / 100).toFixed(2)}\n` +
      `\nTime: ${new Date().toLocaleString()}`
    );
  },

  async customAlert(title: string, message: string): Promise<boolean> {
    return sendMessage(`📢 <b>${title}</b>\n${message}`);
  },
};
