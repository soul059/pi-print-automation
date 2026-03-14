import { useAuth } from '../hooks/useAuth';
import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function WalletBadge() {
  const { token } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getWallet(token).then((data) => {
      if (typeof data.balance === 'number') setBalance(data.balance);
    }).catch(() => {});
  }, [token]);

  if (balance === null) return null;

  return (
    <Link
      to="/wallet"
      className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300 hover:text-primary-600"
    >
      <Wallet size={16} />
      <span>₹{(balance / 100).toFixed(2)}</span>
    </Link>
  );
}
