import { usePrinterStatus } from '../hooks/usePrinterStatus';
import { Wifi, WifiOff, Loader2, AlertTriangle } from 'lucide-react';

export default function PrinterStatusBadge() {
  const { status, loading } = usePrinterStatus();

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <Loader2 size={16} className="animate-spin" />
        Checking printer...
      </div>
    );
  }

  if (!status || !status.online) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
        <WifiOff size={16} className="text-red-500" />
        <div>
          <p className="text-sm font-medium text-red-700">Printer Offline</p>
          <p className="text-xs text-red-500">Cannot accept print jobs right now</p>
        </div>
      </div>
    );
  }

  const isWarning = status.status === 'printing' || (status.queueDepth > 0);

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
        isWarning
          ? 'bg-yellow-50 border-yellow-200'
          : 'bg-green-50 border-green-200'
      }`}
    >
      {isWarning ? (
        <AlertTriangle size={16} className="text-yellow-500" />
      ) : (
        <Wifi size={16} className="text-green-500" />
      )}
      <div>
        <p className={`text-sm font-medium ${isWarning ? 'text-yellow-700' : 'text-green-700'}`}>
          Printer {status.status === 'idle' ? 'Ready' : status.status}
        </p>
        <p className={`text-xs ${isWarning ? 'text-yellow-500' : 'text-green-500'}`}>
          {status.queueDepth > 0
            ? `${status.queueDepth} job(s) in queue · ~${status.estimatedWait}`
            : 'No jobs in queue'}
        </p>
      </div>
    </div>
  );
}
