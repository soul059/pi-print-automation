import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import PrinterStatusBadge from '../components/PrinterStatusBadge';
import PdfPreview from '../components/PdfPreview';
import { CreditCard, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

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
  const [error, setError] = useState('');

  const fetchJob = useCallback(async () => {
    if (!jobId || !token) return;
    try {
      const data = await api.getJob(jobId, token);
      setJob(data);
    } catch {
      setError('Failed to load job details');
    } finally {
      setLoading(false);
    }
  }, [jobId, token]);

  useEffect(() => {
    fetchJob();
    // Load Razorpay script
    if (!document.querySelector('script[src*="razorpay"]')) {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      document.head.appendChild(script);
    }
  }, [fetchJob]);

  const handlePayment = async () => {
    if (!jobId || !token) return;
    setPaying(true);
    setError('');

    try {
      const orderData = await api.createPayment(jobId, token);

      if (orderData.error) {
        setError(orderData.message || orderData.error);
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
          } catch {
            setError('Payment verification failed');
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
    } catch {
      setError('Failed to initiate payment');
      setPaying(false);
    }
  };

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
        <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
        <p className="text-lg text-gray-700">Job not found</p>
      </div>
    );
  }

  const priceRupees = (job.price / 100).toFixed(2);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Payment</h1>

      <PrinterStatusBadge enabled />

      {/* Job Summary */}
      <div className="bg-white rounded-xl border p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CreditCard size={20} />
          Order Summary
        </h2>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">File</span>
            <span className="font-medium">{job.fileName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Pages</span>
            <span>{job.printPages} of {job.totalPages}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Paper</span>
            <span>{job.paperSize}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Copies</span>
            <span>{job.copies}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Color</span>
            <span>{job.color === 'color' ? 'Color' : 'Black & White'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Sides</span>
            <span>{job.duplex ? 'Double-sided' : 'Single-sided'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Mode</span>
            <span className="flex items-center gap-1">
              {job.printMode === 'later' ? '📦 Collect Later' : '⚡ Print Now'}
            </span>
          </div>

          <hr className="my-3" />

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
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </p>
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
