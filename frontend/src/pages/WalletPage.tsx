import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { Wallet, Loader2, AlertCircle, ArrowUpCircle, ArrowDownCircle, RefreshCw } from 'lucide-react';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface WalletTransaction {
  id: number;
  type: 'topup' | 'debit' | 'refund';
  amount: number;
  balance_after: number;
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

const PRESET_AMOUNTS = [1000, 2000, 5000, 10000, 20000, 50000]; // in paise

export default function WalletPage() {
  const { token, email, name: userName } = useAuth();
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [topupAmount, setTopupAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchWallet = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getWallet(token);
      setBalance(data.balance);
      setTransactions(data.transactions || []);
    } catch {
      setError('Failed to load wallet');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchWallet();
    if (!document.querySelector('script[src*="razorpay"]')) {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      document.head.appendChild(script);
    }
  }, [fetchWallet]);

  const getSelectedAmount = (): number | null => {
    if (topupAmount) return topupAmount;
    const parsed = Math.round(parseFloat(customAmount) * 100);
    if (!isNaN(parsed) && parsed >= 1000 && parsed <= 50000) return parsed;
    return null;
  };

  const handleTopup = async () => {
    const amount = getSelectedAmount();
    if (!amount || !token) return;

    setPaying(true);
    setError('');
    setSuccess('');

    try {
      const orderData = await api.walletTopup(amount, token);
      if (orderData.error) {
        setError(orderData.error);
        setPaying(false);
        return;
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Print Service',
        description: `Wallet Top-up: ₹${(amount / 100).toFixed(2)}`,
        order_id: orderData.orderId,
        prefill: { email, name: userName },
        theme: { color: '#2563eb' },
        handler: async (response: any) => {
          try {
            const verification = await api.walletTopupVerify(
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
              token
            );
            if (verification.success) {
              setBalance(verification.balance);
              setSuccess(`₹${(amount / 100).toFixed(2)} added to wallet!`);
              setTopupAmount(null);
              setCustomAmount('');
              fetchWallet();
            } else {
              setError('Top-up verification failed');
            }
          } catch {
            setError('Top-up verification failed');
          }
          setPaying(false);
        },
        modal: {
          ondismiss: () => setPaying(false),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch {
      setError('Failed to initiate top-up');
      setPaying(false);
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'topup': return <ArrowUpCircle size={16} className="text-green-500" />;
      case 'debit': return <ArrowDownCircle size={16} className="text-red-500" />;
      case 'refund': return <RefreshCw size={16} className="text-blue-500" />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Wallet size={24} />
        My Wallet
      </h1>

      {/* Balance */}
      <div className="bg-gradient-to-r from-primary-500 to-primary-700 text-white rounded-xl p-6 text-center">
        <p className="text-sm opacity-80">Current Balance</p>
        <p className="text-4xl font-bold mt-1">₹{(balance / 100).toFixed(2)}</p>
      </div>

      {/* Top-up */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Add Money</h2>

        <div className="grid grid-cols-3 gap-2">
          {PRESET_AMOUNTS.map((amt) => (
            <button
              key={amt}
              onClick={() => { setTopupAmount(amt); setCustomAmount(''); }}
              className={`py-2 rounded-lg border text-sm font-medium transition ${
                topupAmount === amt
                  ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-500 text-primary-700 dark:text-primary-300'
                  : 'border-gray-200 dark:border-gray-600 hover:border-primary-300'
              }`}
            >
              ₹{amt / 100}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-sm">or</span>
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
            <input
              type="number"
              min="10"
              max="500"
              placeholder="Custom (10-500)"
              value={customAmount}
              onChange={(e) => { setCustomAmount(e.target.value); setTopupAmount(null); }}
              className="w-full pl-7 pr-3 py-2 border dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg flex items-center gap-2">
            <AlertCircle size={16} /> {error}
          </p>
        )}

        {success && (
          <p className="text-sm text-green-600 bg-green-50 dark:bg-green-900/30 px-3 py-2 rounded-lg">
            {success}
          </p>
        )}

        <button
          onClick={handleTopup}
          disabled={paying || !getSelectedAmount()}
          className="w-full bg-primary-600 text-white py-3 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
        >
          {paying ? <Loader2 size={18} className="animate-spin" /> : null}
          {paying ? 'Processing...' : `Add ₹${((getSelectedAmount() || 0) / 100).toFixed(2)}`}
        </button>
      </div>

      {/* Transaction History */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Transaction History</h2>

        {transactions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No transactions yet</p>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b dark:border-gray-700 last:border-0">
                <div className="flex items-center gap-2">
                  {typeIcon(tx.type)}
                  <div>
                    <p className="text-sm font-medium">
                      {tx.type === 'topup' ? 'Top-up' : tx.type === 'debit' ? 'Payment' : 'Refund'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {tx.description || tx.reference_id || ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-medium ${tx.type === 'debit' ? 'text-red-600' : 'text-green-600'}`}>
                    {tx.type === 'debit' ? '-' : '+'}₹{(tx.amount / 100).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(tx.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
