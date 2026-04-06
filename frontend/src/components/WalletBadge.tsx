import { useAuth } from '../hooks/useAuth';
import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Wallet, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function WalletBadge() {
  const { token } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api.getWallet(token).then((data) => {
      if (typeof data.balance === 'number') setBalance(data.balance);
    }).catch(() => {
      // Silently fail - wallet badge is non-critical
    }).finally(() => {
      setLoading(false);
    });
  }, [token]);

  // Always show wallet link (with balance if available)
  return (
    <Link
      to="/wallet"
      className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300 hover:text-primary-600"
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <Wallet size={16} />
      )}
      <span>
        {balance !== null ? `₹${(balance / 100).toFixed(2)}` : 'Wallet'}
      </span>
    </Link>
  );
}
