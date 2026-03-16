import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
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
  CalendarClock,
  Receipt,
  RotateCcw,
  PackageCheck,
  Eye,
  EyeOff,
} from 'lucide-react';
import PdfPreview from '../components/PdfPreview';

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
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [collectingJob, setCollectingJob] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

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

  const handleCollect = async () => {
    if (!token || !jobId || collectingJob) return;
    setCollectingJob(true);
    try {
      const data = await api.collectJob(jobId, token);
      if (data.success) {
        await fetchJob();
      }
    } catch {
      // ignore
    } finally {
      setCollectingJob(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <Link to="/jobs" className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-600">
        <ArrowLeft size={16} /> Back to jobs
      </Link>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-8 text-center space-y-4">
        <div className={statusInfo.color}>{statusInfo.icon}</div>
        <h1 className="text-2xl font-bold dark:text-white">{statusInfo.label}</h1>
        <p className="text-gray-500 dark:text-gray-400">{statusInfo.description}</p>

        {isQueued && position !== null && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mt-4">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
              🕐 You are #{position} in queue · {estimatedWait}
            </p>
            <div className="mt-2 w-full bg-blue-200 dark:bg-blue-900 rounded-full h-1.5">
              <div className="bg-blue-600 h-1.5 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}

        {job.scheduledAt && job.status === 'paid' && new Date(job.scheduledAt) > new Date() && (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4 mt-4">
            <div className="flex items-center justify-center gap-2 mb-1">
              <CalendarClock size={18} className="text-indigo-600 dark:text-indigo-400" />
              <p className="text-sm font-medium text-indigo-800 dark:text-indigo-300">Scheduled Print</p>
            </div>
            <p className="text-sm text-indigo-700 dark:text-indigo-300">
              Printing at: {new Date(job.scheduledAt).toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
              {(() => {
                const diff = new Date(job.scheduledAt).getTime() - Date.now();
                if (diff <= 0) return 'Starting soon…';
                const hours = Math.floor(diff / 3600000);
                const minutes = Math.floor((diff % 3600000) / 60000);
                if (hours > 0) return `Printing in ${hours}h ${minutes}m`;
                return `Printing in ${minutes}m`;
              })()}
            </p>
          </div>
        )}

        {job.refundStatus === 'refunded' && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mt-4">
            <p className="text-sm font-medium text-green-800 dark:text-green-300">💰 Payment Refunded</p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              Payment refunded. Amount will be credited to your account.
            </p>
          </div>
        )}

        {job.refundStatus === 'failed' && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mt-4">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">⚠️ Refund Failed</p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
              Automatic refund could not be processed. Please contact support.
            </p>
          </div>
        )}

        {job.printMode === 'later' && job.status === 'completed' && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mt-4">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">📦 Collect Later Mode</p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
              Your printout is ready for collection. Show your job ID to the staff.
            </p>
          </div>
        )}

        {job.status === 'completed' && job.collectedAt && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mt-4">
            <div className="flex items-center gap-2 mb-1">
              <PackageCheck size={18} className="text-green-600 dark:text-green-400" />
              <p className="text-sm font-medium text-green-800 dark:text-green-300">Collected</p>
            </div>
            <p className="text-xs text-green-600 dark:text-green-400">
              Picked up at {new Date(job.collectedAt).toLocaleString('en-IN')}
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
          {job.scheduledAt && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Scheduled</span>
              <span>{new Date(job.scheduledAt).toLocaleString('en-IN')}</span>
            </div>
          )}
          {job.errorMessage && (
            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-red-600 dark:text-red-400 text-xs">
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

        {(job.status === 'completed' || job.status === 'failed_permanent') && (
          <button
            onClick={async () => {
              if (!token || !jobId) return;
              try {
                const data = await api.getReceipt(jobId, token);
                if (data.error) return;
                const r = data.receipt;
                const html = `<!DOCTYPE html>
<html><head><title>Print Receipt - ${r.jobId}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:40px auto;padding:20px;color:#1a1a1a}
h1{font-size:18px;text-align:center;margin-bottom:4px}
.subtitle{text-align:center;color:#666;font-size:12px;margin-bottom:24px}
.divider{border-top:1px dashed #ccc;margin:16px 0}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:6px 0;vertical-align:top}
td:first-child{color:#666;width:40%}
td:last-child{text-align:right;font-weight:500}
.total{font-size:18px;font-weight:700;color:#059669}
.status{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600}
.completed{background:#dcfce7;color:#166534}
.failed_permanent{background:#fee2e2;color:#991b1b}
.refunded{background:#dbeafe;color:#1e40af}
.footer{text-align:center;color:#999;font-size:10px;margin-top:24px}
@media print{body{margin:0;padding:10px}}
</style></head><body>
<h1>🖨️ Print Receipt</h1>
<p class="subtitle">Campus Print Service</p>
<div class="divider"></div>
<table>
<tr><td>Job ID</td><td style="font-family:monospace;font-size:11px">${r.jobId}</td></tr>
<tr><td>Status</td><td><span class="status ${r.status}">${r.status === 'completed' ? '✓ Completed' : '✗ Failed'}</span>${r.refundStatus === 'refunded' ? ' <span class="status refunded">Refunded</span>' : ''}</td></tr>
<tr><td>Name</td><td>${r.userName}</td></tr>
<tr><td>Email</td><td>${r.userEmail}</td></tr>
</table>
<div class="divider"></div>
<table>
<tr><td>File</td><td>${r.fileName}</td></tr>
<tr><td>Pages</td><td>${r.totalPages} (${r.printPages})</td></tr>
<tr><td>Copies</td><td>${r.copies}</td></tr>
<tr><td>Paper</td><td>${r.paperSize}</td></tr>
<tr><td>Color</td><td>${r.color === 'color' ? 'Color' : 'B&W'}</td></tr>
<tr><td>Duplex</td><td>${r.duplex ? 'Yes' : 'No'}</td></tr>
<tr><td>Mode</td><td>${r.printMode === 'later' ? 'Collect Later' : 'Print Now'}</td></tr>
<tr><td>Printer</td><td>${r.printerName}</td></tr>
</table>
<div class="divider"></div>
<table>
<tr><td>Payment</td><td>${r.paymentType === 'wallet' ? 'Wallet' : 'Razorpay'}${r.paymentId ? ' (' + r.paymentId + ')' : ''}</td></tr>
<tr><td>Date</td><td>${new Date(r.createdAt).toLocaleString('en-IN')}</td></tr>
<tr><td style="font-size:14px">Amount</td><td class="total">₹${(r.price / 100).toFixed(2)}</td></tr>
</table>
<div class="divider"></div>
<p class="footer">Generated on ${new Date().toLocaleString('en-IN')}<br>This is a computer-generated receipt.</p>
</body></html>`;
                const w = window.open('', '_blank');
                if (w) { w.document.write(html); w.document.close(); }
              } catch { /* ignore */ }
            }}
            className="flex items-center gap-2 mx-auto text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition"
          >
            <Receipt size={14} /> Download Receipt
          </button>
        )}
      </div>

      {/* PDF Preview */}
      {jobId && token && job.totalPages > 0 && (
        <div>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="w-full flex items-center justify-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl py-3 transition"
          >
            {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
            {showPreview ? 'Hide Preview' : 'View Document'}
          </button>
          {showPreview && (
            <div className="mt-3">
              <PdfPreview jobId={jobId} token={token} totalPages={job.totalPages} />
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        {job.status === 'completed' && !job.collectedAt && (
          <button
            onClick={handleCollect}
            disabled={collectingJob}
            className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-3 rounded-xl font-medium hover:bg-green-700 transition disabled:opacity-50"
          >
            {collectingJob ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />}
            Mark as Collected
          </button>
        )}
        {job.status === 'completed' && (
          <button
            onClick={async () => {
              if (!token || !jobId) return;
              try {
                const data = await api.reprintJob(jobId, {}, token);
                if (data.error) return;
                navigate(`/payment/${data.jobId}`);
              } catch { /* ignore */ }
            }}
            className="flex-1 flex items-center justify-center gap-2 border border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 py-3 rounded-xl font-medium hover:bg-primary-50 dark:hover:bg-primary-900/30 transition"
          >
            <RotateCcw size={16} /> Re-print
          </button>
        )}
        <Link
          to="/"
          className="flex-1 block text-center bg-primary-600 text-white py-3 rounded-xl font-medium hover:bg-primary-700 transition"
        >
          Print Another Document
        </Link>
      </div>
    </div>
  );
}
