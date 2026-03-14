import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '../services/api';

interface PrinterStatus {
  online: boolean;
  status: string;
  accepting: boolean;
  printerName: string;
  queueDepth: number;
  estimatedWait: string;
  capabilities?: {
    color: boolean;
    duplex: boolean;
    paperSizes: string[];
  };
}

const SOCKET_URL = import.meta.env.VITE_API_URL || window.location.origin;

export function usePrinterStatus() {
  const [status, setStatus] = useState<PrinterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial fetch
  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getPrinterStatus();
      setStatus(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to get printer status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // WebSocket for real-time updates
    const socket: Socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

    socket.on('printer:status', (data: PrinterStatus) => {
      setStatus(data);
      setLoading(false);
    });

    socket.on('connect_error', () => {
      // Fallback to polling if WebSocket fails
      const interval = setInterval(fetchStatus, 10000);
      return () => clearInterval(interval);
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchStatus]);

  return { status, loading, error, refresh: fetchStatus };
}
