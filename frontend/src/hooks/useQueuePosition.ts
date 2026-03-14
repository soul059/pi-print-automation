import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || window.location.origin;

interface QueueUpdate {
  queue: string[];
  depth: number;
  estimatedWait: number;
}

export function useQueuePosition(jobId: string | undefined, enabled: boolean) {
  const [position, setPosition] = useState<number | null>(null);
  const [estimatedWait, setEstimatedWait] = useState<string>('');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled || !jobId) {
      setPosition(null);
      setEstimatedWait('');
      return;
    }

    const socket: Socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('subscribe:queue-status');
    });

    socket.on('queue:update', (data: QueueUpdate) => {
      const idx = data.queue.indexOf(jobId);
      setPosition(idx >= 0 ? idx + 1 : null);
      setEstimatedWait(data.estimatedWait > 0 ? `~${data.estimatedWait} min wait` : 'Starting soon');
    });

    return () => {
      socket.emit('unsubscribe:queue-status');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [jobId, enabled]);

  return { position, estimatedWait };
}
