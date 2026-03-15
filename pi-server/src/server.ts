import { httpServer } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { runMigrations } from './db/migrations';
import { initDb, closeDb } from './db/connection';
import { startJobRecovery } from './services/queue';
import { startScheduler, stopScheduler } from './services/scheduler';
import { startCleanup, stopCleanup } from './services/cleanup';
import { telegram } from './services/telegram';
import fs from 'fs';
import path from 'path';

async function main() {
  // Security: block startup with default secrets in production
  if (env.NODE_ENV === 'production') {
    const fatal: string[] = [];
    if (env.JWT_SECRET === 'dev-secret-change-in-production') fatal.push('JWT_SECRET');
    if (env.ADMIN_TOKEN === 'change-me-in-production') fatal.push('ADMIN_TOKEN');
    if (!env.RAZORPAY_WEBHOOK_SECRET) fatal.push('RAZORPAY_WEBHOOK_SECRET');
    if (fatal.length > 0) {
      logger.fatal({ missing: fatal }, 'REFUSING TO START: insecure default secrets detected. Set these env vars before running in production.');
      process.exit(1);
    }
  }

  // Ensure upload directory exists
  if (!fs.existsSync(env.UPLOAD_DIR)) {
    fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
  }

  // Ensure data directory exists
  const dataDir = path.dirname(env.DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Initialize database (async for sql.js WASM loading)
  await initDb();

  // Run database migrations
  runMigrations();

  // Recover any paid jobs that were interrupted
  startJobRecovery();

  // Start scheduler for scheduled print jobs
  startScheduler();

  // Start file cleanup service
  startCleanup();

  // Start server
  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Print server started');
    telegram.serverStarted().catch(() => {});
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down...');
    stopScheduler();
    stopCleanup();
    httpServer.close(() => {
      closeDb();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err: err.message }, 'Failed to start server');
  process.exit(1);
});
