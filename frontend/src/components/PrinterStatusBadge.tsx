import { usePrinterStatus } from '../hooks/usePrinterStatus';
import { Wifi, WifiOff, Loader2, AlertTriangle } from 'lucide-react';

interface Props {
  enabled?: boolean;
}

export default function PrinterStatusBadge({ enabled = false }: Props) {
  const { status, loading } = usePrinterStatus(enabled);

  if (!enabled) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
        <Loader2 size={16} className="animate-spin" />
        Checking printer...
      </div>
    );
  }

  if (!status || !status.online) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <WifiOff size={16} className="text-red-500 dark:text-red-400" />
        <div>
          <p className="text-sm font-medium text-red-700 dark:text-red-300">Printer Offline</p>
          <p className="text-xs text-red-500 dark:text-red-400">Cannot accept print jobs right now</p>
        </div>
      </div>
    );
  }

  const isWarning = status.status === 'printing' || (status.queueDepth > 0);

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
        isWarning
          ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
          : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
      }`}
    >
      {isWarning ? (
        <AlertTriangle size={16} className="text-yellow-500 dark:text-yellow-400" />
      ) : (
        <Wifi size={16} className="text-green-500 dark:text-green-400" />
      )}
      <div>
        <p className={`text-sm font-medium ${isWarning ? 'text-yellow-700 dark:text-yellow-300' : 'text-green-700 dark:text-green-300'}`}>
          Printer {status.status === 'idle' ? 'Ready' : status.status}
        </p>
        <p className={`text-xs ${isWarning ? 'text-yellow-500 dark:text-yellow-400' : 'text-green-500 dark:text-green-400'}`}>
          {status.queueDepth > 0
            ? `${status.queueDepth} job(s) in queue · ~${status.estimatedWait}`
            : 'No jobs in queue'}
        </p>
      </div>
    </div>
  );
}
