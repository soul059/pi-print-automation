import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useQueuePosition } from '../hooks/useQueuePosition';
import { api } from '../services/api';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Printer,
  Clock,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string; description: string }> = {
  uploaded: {
    icon: <Clock size={48} />,
    color: 'text-gray-500',
    label: 'Uploaded',
    description: 'Waiting for payment',
  },
  payment_pending: {
    icon: <Clock size={48} />,
    color: 'text-yellow-500',
    label: 'Payment Pending',
    description: 'Complete your payment to proceed',
  },
  paid: {
    icon: <Clock size={48} />,
    color: 'text-blue-500',
    label: 'Paid',
    description: 'Your job is queued for printing',
  },
  printing: {
    icon: <Printer size={48} className="animate-pulse" />,
    color: 'text-blue-600',
    label: 'Printing',
    description: 'Your document is being printed right now',
  },
  completed: {
    icon: <CheckCircle size={48} />,
    color: 'text-green-500',
    label: 'Completed',
    description: 'Your document has been printed successfully',
  },
  failed: {
    icon: <XCircle size={48} />,
    color: 'text-red-500',
    label: 'Failed',
    description: 'Print job failed. It will be retried automatically.',
  },
  failed_permanent: {
    icon: <XCircle size={48} />,
    color: 'text-red-600',
    label: 'Permanently Failed',
    description: 'This job could not be printed after multiple attempts.',
  },
};

export default function StatusPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { token } = useAuth();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const isQueued = job?.status === 'paid' || job?.status === 'printing';
  const { position, estimatedWait } = useQueuePosition(jobId, isQueued);

  const fetchJob = useCallback(async () => {
    if (!jobId || !token) return;
    try {
      const data = await api.getJob(jobId, token);
      setJob(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [jobId, token]);

  useEffect(() => {
    fetchJob();
    // Poll for status updates
    const interval = setInterval(fetchJob, 3000);
    return () => clearInterval(interval);
  }, [fetchJob]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <XCircle size={48} className="mx-auto text-red-500 mb-4" />
        <p className="text-lg">Job not found</p>
      </div>
    );
  }

  const statusInfo = STATUS_CONFIG[job.status] || STATUS_CONFIG.uploaded;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <Link to="/jobs" className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600">
        <ArrowLeft size={16} /> Back to jobs
      </Link>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-8 text-center space-y-4">
        <div className={statusInfo.color}>{statusInfo.icon}</div>
        <h1 className="text-2xl font-bold">{statusInfo.label}</h1>
        <p className="text-gray-500 dark:text-gray-400">{statusInfo.description}</p>

        {isQueued && position !== null && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
            <p className="text-sm font-medium text-blue-800">
              🕐 You are #{position} in queue · {estimatedWait}
            </p>
            <div className="mt-2 w-full bg-blue-200 rounded-full h-1.5">
              <div className="bg-blue-600 h-1.5 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}

        {job.refundStatus === 'refunded' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
            <p className="text-sm font-medium text-green-800">💰 Payment Refunded</p>
            <p className="text-xs text-green-600 mt-1">
              Payment refunded. Amount will be credited to your account.
            </p>
          </div>
        )}

        {job.refundStatus === 'failed' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
            <p className="text-sm font-medium text-yellow-800">⚠️ Refund Failed</p>
            <p className="text-xs text-yellow-600 mt-1">
              Automatic refund could not be processed. Please contact support.
            </p>
          </div>
        )}

        {job.printMode === 'later' && job.status === 'completed' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
            <p className="text-sm font-medium text-yellow-800">📦 Collect Later Mode</p>
            <p className="text-xs text-yellow-600 mt-1">
              Your printout is ready for collection. Show your job ID to the staff.
            </p>
          </div>
        )}

        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-sm space-y-2 text-left mt-4">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Job ID</span>
            <span className="font-mono text-xs">{job.jobId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">File</span>
            <span>{job.fileName}</span>
          </div>
          {job.printerName && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Printer</span>
              <span>{job.printerName}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Price</span>
            <span>₹{(job.price / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Created</span>
            <span>{new Date(job.createdAt).toLocaleString('en-IN')}</span>
          </div>
          {job.errorMessage && (
            <div className="mt-2 p-2 bg-red-50 rounded text-red-600 text-xs">
              {job.errorMessage}
            </div>
          )}
        </div>

        <button
          onClick={fetchJob}
          className="flex items-center gap-2 mx-auto text-sm text-primary-600 hover:text-primary-700"
        >
          <RefreshCw size={14} /> Refresh Status
        </button>
      </div>

      <Link
        to="/"
        className="block text-center bg-primary-600 text-white py-3 rounded-xl font-medium hover:bg-primary-700 transition"
      >
        Print Another Document
      </Link>
    </div>
  );
}
