import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api, ApiError } from '../services/api';
import PrinterStatusBadge from '../components/PrinterStatusBadge';
import PdfPreview from '../components/PdfPreview';
import { CardSkeleton, ErrorDisplay } from '../components/UIHelpers';
import { CreditCard, Loader2, CheckCircle, Wallet } from 'lucide-react';

// Razorpay types
declare global {
  interface Window {
    Razorpay: any;
  }
}

interface JobDetails {
  jobId: string;
  fileName: string;
  totalPages: number;
  printPages: number;
  price: number;
  status: string;
  printMode: string;
  paperSize: string;
  copies: number;
  duplex: boolean;
  color: string;
}

export default function PaymentPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { token, email, name: userName } = useAuth();
  const navigate = useNavigate();

  const [job, setJob] = useState<JobDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [walletPaying, setWalletPaying] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [error, setError] = useState<Error | string | null>(null);

  const fetchJob = useCallback(async () => {
    if (!jobId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getJob(jobId, token);
      if (data.error) {
        setError(data.error);
      } else {
        setJob(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load job details'));
    } finally {
      setLoading(false);
    }
  }, [jobId, token]);

  useEffect(() => {
    fetchJob();
    // Fetch wallet balance
    if (token) {
      api.getWallet(token).then((data) => {
        if (typeof data.balance === 'number') setWalletBalance(data.balance);
      }).catch(() => {});
    }
    // Load Razorpay script
    if (!document.querySelector('script[src*="razorpay"]')) {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      document.head.appendChild(script);
    }
  }, [fetchJob]);

  const handleWalletPayment = async () => {
    if (!jobId || !token) return;
    setWalletPaying(true);
    setError(null);

    try {
      const result = await api.payWithWallet(jobId, token);
      if (result.success) {
        navigate(`/status/${jobId}`);
      } else {
        setError(result.error || 'Wallet payment failed');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Wallet payment failed');
    } finally {
      setWalletPaying(false);
    }
  };

  const handlePayment = async () => {
    if (!jobId || !token) return;
    setPaying(true);
    setError(null);

    try {
      const orderData = await api.createPayment(jobId, token);

      if (orderData.error) {
        setError(orderData.message || orderData.error);
        setPaying(false);
        return;
      }

      // Check if Razorpay script is loaded
      if (!window.Razorpay) {
        setError('Payment gateway not loaded. Please refresh the page.');
        setPaying(false);
        return;
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Print Service',
        description: `Print Job: ${job?.fileName}`,
        order_id: orderData.orderId,
        prefill: {
          email: email,
          name: userName,
        },
        theme: {
          color: '#2563eb',
        },
        handler: async (response: any) => {
          try {
            const verification = await api.verifyPayment(
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
              token
            );

            if (verification.success) {
              navigate(`/status/${jobId}`);
            } else {
              setError('Payment verification failed');
            }
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Payment verification failed');
          }
          setPaying(false);
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to initiate payment');
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <CardSkeleton />
        <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
        <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <h1 className="text-2xl font-bold dark:text-white">Payment</h1>
        <ErrorDisplay 
          error={error || 'Job not found'} 
          onRetry={fetchJob}
        />
      </div>
    );
  }

  const priceRupees = (job.price / 100).toFixed(2);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold dark:text-white">Payment</h1>

      <PrinterStatusBadge enabled />

      {/* Job Summary */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CreditCard size={20} />
          Order Summary
        </h2>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">File</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Pages</span>
            <span>{job.printPages} of {job.totalPages}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Paper</span>
            <span>{job.paperSize}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Copies</span>
            <span>{job.copies}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Color</span>
            <span>{job.color === 'color' ? 'Color' : 'Black & White'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Sides</span>
            <span>{job.duplex ? 'Double-sided' : 'Single-sided'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Mode</span>
            <span className="flex items-center gap-1">
              {job.printMode === 'later' ? '📦 Collect Later' : '⚡ Print Now'}
            </span>
          </div>

          <hr className="my-3 dark:border-gray-700" />

          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span className="text-primary-600">₹{priceRupees}</span>
          </div>
        </div>
      </div>

      {/* PDF Preview */}
      {jobId && token && job.totalPages > 0 && (
        <PdfPreview jobId={jobId} token={token} totalPages={job.totalPages} />
      )}

      {error && (
        <ErrorDisplay error={error} compact />
      )}

      {/* Wallet Payment Option */}
      {walletBalance !== null && (
        <button
          onClick={handleWalletPayment}
          disabled={walletPaying || paying || walletBalance < job.price}
          title={walletBalance < job.price ? 'Insufficient wallet balance' : undefined}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-lg transition ${
            walletBalance >= job.price
              ? 'bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
          }`}
        >
          {walletPaying ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <Wallet size={20} />
          )}
          {walletPaying
            ? 'Processing...'
            : walletBalance >= job.price
              ? `Pay with Wallet (₹${(walletBalance / 100).toFixed(2)} balance)`
              : `Insufficient balance (₹${(walletBalance / 100).toFixed(2)})`}
        </button>
      )}

      <button
        onClick={handlePayment}
        disabled={paying}
        className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-3 rounded-xl font-medium text-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {paying ? (
          <Loader2 size={20} className="animate-spin" />
        ) : (
          <CheckCircle size={20} />
        )}
        {paying ? 'Processing...' : `Pay ₹${priceRupees}`}
      </button>
    </div>
  );
}
