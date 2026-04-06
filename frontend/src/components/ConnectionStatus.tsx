import { useState, useEffect, createContext, useContext, useCallback, ReactNode } from 'react';
import { WifiOff, RefreshCw, ServerOff, AlertTriangle, CheckCircle2 } from 'lucide-react';

type ConnectionState = 'online' | 'offline' | 'error' | 'reconnecting';

interface ConnectionContextType {
  state: ConnectionState;
  lastError: string | null;
  checkConnection: () => Promise<boolean>;
  isServerReachable: boolean;
}

const ConnectionContext = createContext<ConnectionContextType>({
  state: 'online',
  lastError: null,
  checkConnection: async () => true,
  isServerReachable: true,
});

export function useConnection() {
  return useContext(ConnectionContext);
}

const API_BASE = import.meta.env.VITE_API_URL || '';

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectionState>('online');
  const [lastError, setLastError] = useState<string | null>(null);
  const [isServerReachable, setIsServerReachable] = useState(true);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    // Check browser online status
    if (!navigator.onLine) {
      setState('offline');
      setLastError('No internet connection');
      setIsServerReachable(false);
      return false;
    }

    // Check server reachability
    try {
      setState('reconnecting');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${API_BASE}/api/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        setState('online');
        setLastError(null);
        setIsServerReachable(true);
        return true;
      } else {
        setState('error');
        setLastError(`Server error: ${res.status}`);
        setIsServerReachable(false);
        return false;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setState('error');
        setLastError('Server not responding (timeout)');
      } else {
        setState('error');
        setLastError('Cannot reach server');
      }
      setIsServerReachable(false);
      return false;
    }
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      checkConnection();
    };

    const handleOffline = () => {
      setState('offline');
      setLastError('No internet connection');
      setIsServerReachable(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    checkConnection();

    // Periodic health check every 30 seconds
    const interval = setInterval(checkConnection, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [checkConnection]);

  return (
    <ConnectionContext.Provider value={{ state, lastError, checkConnection, isServerReachable }}>
      {children}
    </ConnectionContext.Provider>
  );
}

// Banner that shows when connection is lost
export function ConnectionBanner() {
  const { state, lastError, checkConnection } = useConnection();
  const [retrying, setRetrying] = useState(false);

  if (state === 'online') return null;

  const handleRetry = async () => {
    setRetrying(true);
    await checkConnection();
    setRetrying(false);
  };

  const getIcon = () => {
    switch (state) {
      case 'offline':
        return <WifiOff size={18} />;
      case 'error':
        return <ServerOff size={18} />;
      case 'reconnecting':
        return <RefreshCw size={18} className="animate-spin" />;
      default:
        return <AlertTriangle size={18} />;
    }
  };

  const getMessage = () => {
    switch (state) {
      case 'offline':
        return 'You are offline. Please check your internet connection.';
      case 'error':
        return lastError || 'Cannot connect to server. Please try again.';
      case 'reconnecting':
        return 'Reconnecting to server...';
      default:
        return 'Connection issue detected';
    }
  };

  const bgColor = state === 'offline' 
    ? 'bg-gray-800 dark:bg-gray-900' 
    : 'bg-red-600 dark:bg-red-800';

  return (
    <div className={`${bgColor} text-white px-4 py-3 flex items-center justify-between gap-4 shadow-lg`}>
      <div className="flex items-center gap-3">
        {getIcon()}
        <span className="text-sm font-medium">{getMessage()}</span>
      </div>
      {state !== 'reconnecting' && (
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition disabled:opacity-50"
        >
          <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} />
          Retry
        </button>
      )}
    </div>
  );
}

// Small indicator for header
export function ConnectionIndicator() {
  const { state, isServerReachable } = useConnection();

  if (state === 'online' && isServerReachable) {
    return (
      <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400" title="Connected">
        <CheckCircle2 size={14} />
      </div>
    );
  }

  if (state === 'reconnecting') {
    return (
      <div className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400" title="Reconnecting...">
        <RefreshCw size={14} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400" title={state === 'offline' ? 'Offline' : 'Server unreachable'}>
      {state === 'offline' ? <WifiOff size={14} /> : <ServerOff size={14} />}
    </div>
  );
}
