import { Server as SocketServer } from 'socket.io';
import { getPrinterStatus } from './cups';
import { getQueueDepth, getEstimatedWaitMinutes } from './queue';
import { env } from '../config/env';
import { logger } from '../config/logger';

let lastStatus: any = null;
let consecutiveErrors = 0;

export function setupPrinterStatusBroadcast(io: SocketServer): void {
  const interval = setInterval(async () => {
    try {
      const status = await getPrinterStatus();
      consecutiveErrors = 0;
      const enriched = {
        ...status,
        queueDepth: getQueueDepth(),
        estimatedWait: `${getEstimatedWaitMinutes()} minutes`,
      };

      // Only emit if status changed
      const statusKey = JSON.stringify(enriched);
      if (statusKey !== lastStatus) {
        lastStatus = statusKey;
        io.emit('printer:status', enriched);
      }
    } catch (err: any) {
      consecutiveErrors++;
      // Log only the first error and then every 60th to avoid spam
      if (consecutiveErrors === 1 || consecutiveErrors % 60 === 0) {
        logger.warn({ err: err.message, consecutiveErrors }, 'Printer status check failed (CUPS likely not available)');
      }
    }
  }, env.PRINTER_STATUS_INTERVAL);

  // Clean up on process exit
  process.on('SIGTERM', () => clearInterval(interval));
  process.on('SIGINT', () => clearInterval(interval));
}
