import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { getDb } from '../db/connection';
import { env } from '../config/env';
import { logger } from '../config/logger';

let transporter: nodemailer.Transporter;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    if (env.SMTP_HOST) {
      transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
    } else {
      // Dev fallback: log OTP to console
      transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
    }
  }
  return transporter;
}

export function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function sendOtp(email: string, otp: string): Promise<void> {
  const db = getDb();

  // Clean up expired OTPs for this email
  db.prepare("DELETE FROM otps WHERE email = ? AND expires_at < datetime('now')").run(email);

  // Store OTP
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
  db.prepare('INSERT INTO otps (email, otp, expires_at) VALUES (?, ?, ?)').run(email, otp, expiresAt);

  // Send email
  const transport = getTransporter();
  const info = await transport.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: 'Print Service - Verification Code',
    text: `Your verification code is: ${otp}\n\nThis code expires in ${env.OTP_EXPIRY_MINUTES} minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">Print Service Verification</h2>
        <p>Your verification code is:</p>
        <div style="background: #f5f5f5; padding: 15px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; border-radius: 8px;">
          ${otp}
        </div>
        <p style="color: #666; font-size: 14px; margin-top: 15px;">
          This code expires in ${env.OTP_EXPIRY_MINUTES} minutes.
        </p>
      </div>
    `,
  });

  if (!env.SMTP_HOST) {
    // Dev mode: log the OTP
    logger.info({ email, otp }, 'OTP generated (dev mode - no SMTP configured)');
  } else {
    logger.info({ email, messageId: info.messageId }, 'OTP email sent');
  }
}

export function getMailTransporter(): nodemailer.Transporter {
  return getTransporter();
}

export function verifyOtp(email: string, otp: string): boolean {
  const db = getDb();

  const record = db
    .prepare(
      "SELECT * FROM otps WHERE email = ? AND otp = ? AND verified = 0 AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1"
    )
    .get(email, otp) as any;

  if (!record) return false;

  // Mark as verified
  db.prepare('UPDATE otps SET verified = 1 WHERE id = ?').run(record.id);
  return true;
}
