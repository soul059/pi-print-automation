import { useAuth } from '../hooks/useAuth';
import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Wallet, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function WalletBadge() {
  const { token } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  console.log('[WalletBadge] Rendering, token:', token ? 'present' : 'missing');

  useEffect(() => {
    if (!token) {
      console.log('[WalletBadge] No token, skipping fetch');
      setLoading(false);
      return;
    }
    console.log('[WalletBadge] Fetching wallet...');
    setLoading(true);
    api.getWallet(token).then((data) => {
      console.log('[WalletBadge] API response:', data);
      if (typeof data.balance === 'number') setBalance(data.balance);
    }).catch((err) => {
      console.error('[WalletBadge] API error:', err);
    }).finally(() => {
      setLoading(false);
    });
  }, [token]);

  console.log('[WalletBadge] State - loading:', loading, 'balance:', balance);

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
