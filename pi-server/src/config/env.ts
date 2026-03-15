import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  // Server
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Database
  DB_PATH: process.env.DB_PATH || path.resolve(__dirname, '../../data/print.db'),

  // Upload
  UPLOAD_DIR: process.env.UPLOAD_DIR || path.resolve(__dirname, '../../uploads'),
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB

  // Razorpay
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_SECRET: process.env.RAZORPAY_SECRET || '',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',

  // Email (SMTP)
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'noreply@printservice.local',

  // Admin
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || 'change-me-in-production',

  // Printer
  DEFAULT_PRINTER: process.env.DEFAULT_PRINTER || '',
  PRINTER_STATUS_INTERVAL: parseInt(process.env.PRINTER_STATUS_INTERVAL || '5000', 10),

  // Pricing (in paise per page)
  PRICE_BW_PER_PAGE: parseInt(process.env.PRICE_BW_PER_PAGE || '200', 10),
  PRICE_COLOR_PER_PAGE: parseInt(process.env.PRICE_COLOR_PER_PAGE || '500', 10),
  DUPLEX_DISCOUNT: parseFloat(process.env.DUPLEX_DISCOUNT || '0.8'),

  // Security
  OTP_EXPIRY_MINUTES: parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10),
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  JWT_EXPIRY: process.env.JWT_EXPIRY || '30d',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Cleanup
  FILE_RETENTION_HOURS: parseInt(process.env.FILE_RETENTION_HOURS || '24', 10),

  // Google OAuth
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',

  // Telegram Bot (admin alerts)
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
} as const;
