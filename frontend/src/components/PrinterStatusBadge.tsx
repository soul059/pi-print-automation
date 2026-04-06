import { usePrinterStatus } from '../hooks/usePrinterStatus';
import { Wifi, WifiOff, Loader2, AlertTriangle, FileWarning, AlertOctagon, PauseCircle } from 'lucide-react';

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

  // Queue paused state
  if (status?.queuePaused) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
        <PauseCircle size={16} className="text-orange-500 dark:text-orange-400" />
        <div>
          <p className="text-sm font-medium text-orange-700 dark:text-orange-300">Queue Paused</p>
          <p className="text-xs text-orange-500 dark:text-orange-400">
            {status.queuePauseReason || 'Waiting for admin action'}
          </p>
        </div>
      </div>
    );
  }

  // Paper empty state
  if (status?.paperStatus === 'empty' || status?.errorType === 'paper_empty') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <FileWarning size={16} className="text-red-500 dark:text-red-400" />
        <div>
          <p className="text-sm font-medium text-red-700 dark:text-red-300">Out of Paper</p>
          <p className="text-xs text-red-500 dark:text-red-400">
            Printer needs paper. Jobs will resume when refilled.
          </p>
        </div>
      </div>
    );
  }

  // Paper jam state
  if (status?.paperStatus === 'jam' || status?.errorType === 'paper_jam') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <AlertOctagon size={16} className="text-red-500 dark:text-red-400" />
        <div>
          <p className="text-sm font-medium text-red-700 dark:text-red-300">Paper Jam</p>
          <p className="text-xs text-red-500 dark:text-red-400">
            Please wait while staff clears the jam.
          </p>
        </div>
      </div>
    );
  }

  // Cover open state
  if (status?.errorType === 'cover_open') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <AlertOctagon size={16} className="text-red-500 dark:text-red-400" />
        <div>
          <p className="text-sm font-medium text-red-700 dark:text-red-300">Cover Open</p>
          <p className="text-xs text-red-500 dark:text-red-400">
            Printer cover is open. Please wait.
          </p>
        </div>
      </div>
    );
  }

  // Offline state
  if (!status || !status.online) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <WifiOff size={16} className="text-red-500 dark:text-red-400" />
        <div>
          <p className="text-sm font-medium text-red-700 dark:text-red-300">Printer Offline</p>
          <p className="text-xs text-red-500 dark:text-red-400">
            {status?.errorMessage || 'Cannot accept print jobs right now'}
          </p>
        </div>
      </div>
    );
  }

  // Paper low warning (but still operational)
  if (status?.paperStatus === 'low' || status?.errorType === 'paper_low') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
        <AlertTriangle size={16} className="text-yellow-500 dark:text-yellow-400" />
        <div>
          <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Paper Low</p>
          <p className="text-xs text-yellow-500 dark:text-yellow-400">
            {status.queueDepth > 0
              ? `${status.queueDepth} job(s) in queue · ~${status.estimatedWait}`
              : 'Printer ready but paper is running low'}
          </p>
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
