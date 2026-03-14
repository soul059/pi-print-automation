import { Server as SocketServer } from 'socket.io';
import { getPrinterStatus } from './cups';
import { getQueueDepth, getEstimatedWaitMinutes } from './queue';
import { env } from '../config/env';
import { logger } from '../config/logger';

let lastStatus: any = null;
let consecutiveErrors = 0;
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let subscriberCount = 0;

async function pollAndBroadcast(io: SocketServer): Promise<void> {
  try {
    const status = await getPrinterStatus();
    consecutiveErrors = 0;
    const enriched = {
      ...status,
      queueDepth: getQueueDepth(),
      estimatedWait: `${getEstimatedWaitMinutes()} minutes`,
    };

    const statusKey = JSON.stringify(enriched);
    if (statusKey !== lastStatus) {
      lastStatus = statusKey;
      io.to('printer-status').emit('printer:status', enriched);
    }
  } catch (err: any) {
    consecutiveErrors++;
    if (consecutiveErrors === 1 || consecutiveErrors % 60 === 0) {
      logger.warn({ err: err.message, consecutiveErrors }, 'Printer status check failed (CUPS likely not available)');
    }
  }
}

function startPolling(io: SocketServer): void {
  if (pollingInterval) return;
  logger.debug('Starting printer status polling (clients subscribed)');
  pollAndBroadcast(io);
  pollingInterval = setInterval(() => pollAndBroadcast(io), env.PRINTER_STATUS_INTERVAL);
}

function stopPolling(): void {
  if (!pollingInterval) return;
  logger.debug('Stopping printer status polling (no subscribers)');
  clearInterval(pollingInterval);
  pollingInterval = null;
  lastStatus = null;
}

export function setupPrinterStatusBroadcast(io: SocketServer): void {
  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'Client connected');

    socket.on('subscribe:printer-status', () => {
      socket.join('printer-status');
      subscriberCount++;
      logger.debug({ socketId: socket.id, subscriberCount }, 'Client subscribed to printer status');
      startPolling(io);
    });

    socket.on('unsubscribe:printer-status', () => {
      socket.leave('printer-status');
      subscriberCount = Math.max(0, subscriberCount - 1);
      logger.debug({ socketId: socket.id, subscriberCount }, 'Client unsubscribed from printer status');
      if (subscriberCount === 0) stopPolling();
    });

    socket.on('disconnect', () => {
      // Check if this socket was in the printer-status room
      if (socket.rooms.has('printer-status')) {
        subscriberCount = Math.max(0, subscriberCount - 1);
      }
      logger.debug({ socketId: socket.id, subscriberCount }, 'Client disconnected');
      if (subscriberCount === 0) stopPolling();
    });
  });

  process.on('SIGTERM', stopPolling);
  process.on('SIGINT', stopPolling);
}
