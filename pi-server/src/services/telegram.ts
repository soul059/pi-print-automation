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

function shouldAlert(key: string): boolean {
  const now = Date.now();
  const last = alertCooldowns.get(key);
  if (last && now - last < COOLDOWN_MS) return false;
  alertCooldowns.set(key, now);
  return true;
}

export const telegram = {
  isConfigured,

  async printerOffline(printerName: string) {
    if (!shouldAlert(`offline:${printerName}`)) return;
    await sendMessage(
      `🔴 <b>Printer Offline</b>\n` +
      `Printer <code>${printerName}</code> is not responding.\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  async printerOnline(printerName: string) {
    if (!shouldAlert(`online:${printerName}`)) return;
    await sendMessage(
      `🟢 <b>Printer Online</b>\n` +
      `Printer <code>${printerName}</code> is back online.\n` +
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

  async lowSupply(printerName: string, supply: string, level: number) {
    if (!shouldAlert(`supply:${printerName}:${supply}`)) return;
    await sendMessage(
      `⚠️ <b>Low Supply</b>\n` +
      `Printer: <code>${printerName}</code>\n` +
      `${supply}: ${level}%\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  async serverStarted() {
    await sendMessage(
      `🚀 <b>Print Server Started</b>\n` +
      `Time: ${new Date().toLocaleString()}`
    );
  },

  async customAlert(title: string, message: string): Promise<boolean> {
    return sendMessage(`📢 <b>${title}</b>\n${message}`);
  },
};
