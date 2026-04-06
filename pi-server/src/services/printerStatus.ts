import { Server as SocketServer } from 'socket.io';
import { getPrinterStatus, getSupplyLevels, getActiveJobsWithAge, PrinterErrorType } from './cups';
import { getQueueDepth, getEstimatedWaitMinutes, getQueuedJobIds, isQueuePaused, getPauseReason, getQueueStatus } from './queue';
import { telegram } from './telegram';
import { env } from '../config/env';
import { logger } from '../config/logger';

let ioInstance: SocketServer | null = null;
let lastStatus: any = null;
let lastOnlineState: boolean | null = null;
let lastErrorType: PrinterErrorType = 'none';
let consecutiveErrors = 0;
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let supplyCheckInterval: ReturnType<typeof setInterval> | null = null;
let stuckJobCheckInterval: ReturnType<typeof setInterval> | null = null;
let subscriberCount = 0;

// Thresholds
const LOW_SUPPLY_THRESHOLD = 15;
const CRITICAL_SUPPLY_THRESHOLD = 5;
const STUCK_JOB_ALERT_THRESHOLD_SECONDS = 5 * 60; // 5 minutes

async function pollAndBroadcast(io: SocketServer): Promise<void> {
  try {
    const status = await getPrinterStatus();
    consecutiveErrors = 0;
    
    const queueStatus = getQueueStatus();
    
    const enriched = {
      ...status,
      queueDepth: queueStatus.depth,
      estimatedWait: `${queueStatus.estimatedWaitMinutes} minutes`,
      queuePaused: queueStatus.paused,
      queuePauseReason: queueStatus.pauseReason,
    };

    const statusKey = JSON.stringify(enriched);
    if (statusKey !== lastStatus) {
      lastStatus = statusKey;
      io.to('printer-status').emit('printer:status', enriched);

      const printerName = status.printerName || 'default';

      // Telegram alerts for error type changes
      if (lastErrorType !== status.errorType) {
        switch (status.errorType) {
          case 'paper_empty':
            telegram.paperEmpty(printerName).catch(() => {});
            break;
          case 'paper_jam':
            telegram.paperJam(printerName).catch(() => {});
            break;
          case 'paper_low':
            telegram.paperLow(printerName).catch(() => {});
            break;
          case 'cover_open':
            telegram.coverOpen(printerName).catch(() => {});
            break;
          case 'offline':
            telegram.printerOffline(printerName).catch(() => {});
            break;
          case 'none':
            // If recovering from an error, send online notification
            if (lastErrorType !== 'none' && lastErrorType !== 'paper_low') {
              telegram.printerOnline(printerName).catch(() => {});
            }
            break;
        }
        lastErrorType = status.errorType;
      }

      // Legacy online/offline transitions (for backward compatibility)
      if (lastOnlineState !== null && lastOnlineState !== status.online) {
        if (status.online) {
          telegram.printerOnline(printerName).catch(() => {});
        } else if (status.errorType === 'offline' || status.errorType === 'none') {
          telegram.printerOffline(printerName).catch(() => {});
        }
      }
      lastOnlineState = status.online;
    }
  } catch (err: any) {
    consecutiveErrors++;
    if (consecutiveErrors === 1 || consecutiveErrors % 60 === 0) {
      logger.warn({ err: err.message, consecutiveErrors }, 'Printer status check failed (CUPS likely not available)');
    }
  }
}

async function checkSupplyLevels(): Promise<void> {
  try {
    const supplies = await getSupplyLevels();
    const printerName = (await getPrinterStatus()).printerName || 'default';

    for (const supply of supplies) {
      if (supply.level >= 0) {
        if (supply.level <= CRITICAL_SUPPLY_THRESHOLD) {
          telegram.criticalSupply(printerName, supply.name, supply.level).catch(() => {});
        } else if (supply.level <= LOW_SUPPLY_THRESHOLD) {
          telegram.lowSupply(printerName, supply.name, supply.level).catch(() => {});
        }
      }
    }
  } catch (err: any) {
    logger.debug({ err: err.message }, 'Supply level check failed');
  }
}

async function checkStuckJobs(): Promise<void> {
  try {
    const activeJobs = await getActiveJobsWithAge();
    
    for (const job of activeJobs) {
      if (job.ageSeconds >= STUCK_JOB_ALERT_THRESHOLD_SECONDS) {
        const stuckMinutes = Math.floor(job.ageSeconds / 60);
        telegram.jobStuck(job.jobId, job.printerName, stuckMinutes).catch(() => {});
        logger.warn({ 
          cupsJobId: job.jobId, 
          printerName: job.printerName, 
          stuckMinutes 
        }, 'CUPS job appears stuck');
      }
    }
  } catch (err: any) {
    logger.debug({ err: err.message }, 'Stuck job check failed');
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

// Start background monitoring (supply levels, stuck jobs)
export function startBackgroundMonitoring(): void {
  // Check supply levels every 10 minutes
  if (!supplyCheckInterval) {
    checkSupplyLevels();
    supplyCheckInterval = setInterval(checkSupplyLevels, 10 * 60 * 1000);
    logger.info('Supply level monitoring started');
  }
  
  // Check for stuck jobs every 2 minutes
  if (!stuckJobCheckInterval) {
    stuckJobCheckInterval = setInterval(checkStuckJobs, 2 * 60 * 1000);
    logger.info('Stuck job monitoring started');
  }
}

export function stopBackgroundMonitoring(): void {
  if (supplyCheckInterval) {
    clearInterval(supplyCheckInterval);
    supplyCheckInterval = null;
  }
  if (stuckJobCheckInterval) {
    clearInterval(stuckJobCheckInterval);
    stuckJobCheckInterval = null;
  }
}

export function broadcastQueueUpdate(): void {
  if (!ioInstance) return;
  const queuedJobs = getQueuedJobIds();
  const queueStatus = getQueueStatus();
  
  ioInstance.to('queue-status').emit('queue:update', {
    queue: queuedJobs,
    depth: queueStatus.depth,
    estimatedWait: queueStatus.estimatedWaitMinutes,
    paused: queueStatus.paused,
    pauseReason: queueStatus.pauseReason,
  });
  
  // Also update printer-status subscribers with queue info
  ioInstance.to('printer-status').emit('queue:update', {
    depth: queueStatus.depth,
    estimatedWait: queueStatus.estimatedWaitMinutes,
    paused: queueStatus.paused,
    pauseReason: queueStatus.pauseReason,
  });
}

// Force broadcast current status (e.g., after admin action)
export async function forceStatusBroadcast(): Promise<void> {
  if (!ioInstance) return;
  lastStatus = null; // Reset to force broadcast
  await pollAndBroadcast(ioInstance);
}

export function setupPrinterStatusBroadcast(io: SocketServer): void {
  ioInstance = io;
  
  // Start background monitoring regardless of subscribers
  startBackgroundMonitoring();
  
  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'Client connected');

    socket.on('subscribe:printer-status', async () => {
      socket.join('printer-status');
      subscriberCount++;
      logger.debug({ socketId: socket.id, subscriberCount }, 'Client subscribed to printer status');
      startPolling(io);
      
      // Send immediate status to new subscriber
      try {
        const status = await getPrinterStatus();
        const queueStatus = getQueueStatus();
        socket.emit('printer:status', {
          ...status,
          queueDepth: queueStatus.depth,
          estimatedWait: `${queueStatus.estimatedWaitMinutes} minutes`,
          queuePaused: queueStatus.paused,
          queuePauseReason: queueStatus.pauseReason,
        });
      } catch (err) {
        logger.debug('Failed to send initial status to subscriber');
      }
    });

    socket.on('unsubscribe:printer-status', () => {
      socket.leave('printer-status');
      subscriberCount = Math.max(0, subscriberCount - 1);
      logger.debug({ socketId: socket.id, subscriberCount }, 'Client unsubscribed from printer status');
      if (subscriberCount === 0) stopPolling();
    });

    socket.on('subscribe:queue-status', () => {
      socket.join('queue-status');
      logger.debug({ socketId: socket.id }, 'Client subscribed to queue status');
      
      // Send immediate queue status
      const queueStatus = getQueueStatus();
      socket.emit('queue:update', {
        queue: getQueuedJobIds(),
        depth: queueStatus.depth,
        estimatedWait: queueStatus.estimatedWaitMinutes,
        paused: queueStatus.paused,
        pauseReason: queueStatus.pauseReason,
      });
    });

    socket.on('unsubscribe:queue-status', () => {
      socket.leave('queue-status');
      logger.debug({ socketId: socket.id }, 'Client unsubscribed from queue status');
    });

    socket.on('disconnecting', () => {
      // 'disconnecting' fires before rooms are cleared (unlike 'disconnect')
      if (socket.rooms.has('printer-status')) {
        subscriberCount = Math.max(0, subscriberCount - 1);
      }
      logger.debug({ socketId: socket.id, subscriberCount }, 'Client disconnecting');
      if (subscriberCount === 0) stopPolling();
    });
  });

  process.on('SIGTERM', () => {
    stopPolling();
    stopBackgroundMonitoring();
  });
  process.on('SIGINT', () => {
    stopPolling();
    stopBackgroundMonitoring();
  });
}
