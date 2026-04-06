import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '../services/api';

interface PrinterStatus {
  online: boolean;
  status: string;
  accepting: boolean;
  printerName: string;
  queueDepth: number;
  estimatedWait: string;
  // Enhanced status fields
  paperStatus?: 'ok' | 'low' | 'empty' | 'jam' | 'unknown';
  errorType?: 'none' | 'paper_empty' | 'paper_jam' | 'paper_low' | 'cover_open' | 'offline' | 'other';
  errorMessage?: string | null;
  canRetry?: boolean;
  // Queue status
  queuePaused?: boolean;
  queuePauseReason?: string | null;
  // Other
  operatingHours?: { allowed: boolean; message?: string };
  capabilities?: {
    color: boolean;
    duplex: boolean;
    paperSizes: string[];
  };
}

const SOCKET_URL = import.meta.env.VITE_API_URL || window.location.origin;

export function usePrinterStatus(enabled = false) {
  const [status, setStatus] = useState<PrinterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[usePrinterStatus] Fetching status via REST...');
      const data = await api.getPrinterStatus();
      console.log('[usePrinterStatus] REST response:', data);
      setStatus(data);
      setError(null);
    } catch (err: any) {
      console.error('[usePrinterStatus] REST error:', err);
      setError(err.message || 'Failed to get printer status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Disconnect socket and stop polling when disabled
      if (socketRef.current) {
        socketRef.current.emit('unsubscribe:printer-status');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setStatus(null);
      setLoading(true);
      return;
    }

    // Fetch initial status via REST
    fetchStatus();

    // Connect socket and subscribe to printer status room
    const socket: Socket = io(SOCKET_URL, { 
      transports: ['websocket', 'polling'],
      // Skip ngrok browser warning (required for ngrok free tier)
      extraHeaders: {
        'ngrok-skip-browser-warning': 'true',
      },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[usePrinterStatus] Socket connected');
      socket.emit('subscribe:printer-status');
    });

    socket.on('printer:status', (data: PrinterStatus) => {
      console.log('[usePrinterStatus] Socket update:', data);
      setStatus(data);
      setLoading(false);
    });

    // Handle queue updates (includes pause status)
    socket.on('queue:update', (data: any) => {
      console.log('[usePrinterStatus] Queue update:', data);
      setStatus(prev => prev ? {
        ...prev,
        queueDepth: data.depth,
        estimatedWait: `${data.estimatedWait} minutes`,
        queuePaused: data.paused,
        queuePauseReason: data.pauseReason,
      } : null);
    });

    socket.on('connect_error', (err) => {
      console.error('[usePrinterStatus] Socket error:', err);
      // Fallback to polling if WebSocket fails
      if (!pollingRef.current) {
        pollingRef.current = setInterval(fetchStatus, 10000);
      }
    });

    return () => {
      socket.emit('unsubscribe:printer-status');
      socket.disconnect();
      socketRef.current = null;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [enabled, fetchStatus]);

  return { status, loading, error, refresh: fetchStatus };
}
