import { useAuth } from '../hooks/useAuth';
import { Printer, LogOut, History } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import WalletBadge from './WalletBadge';
import ThemeToggle from './ThemeToggle';
import LanguageSelector from './LanguageSelector';
import { useTranslation } from '../i18n/I18nContext';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, email, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-primary-600 font-bold text-lg">
            <Printer size={24} />
            <span>{t('app.title')}</span>
          </Link>

          <div className="flex items-center gap-4">
            <LanguageSelector />
            <ThemeToggle />
            {isAuthenticated && (
              <>
                <WalletBadge />
                <Link
                  to="/jobs"
                  className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300 hover:text-primary-600"
                >
                  <History size={16} />
                  {t('nav.jobs')}
                </Link>
                <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:inline">{email}</span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-red-600"
                >
                  <LogOut size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">{children}</main>

      <footer className="text-center text-xs text-gray-400 py-4 border-t dark:border-gray-700">
        {t('app.title')} — Powered by Pi Zero 2W
      </footer>
    </div>
  );
}
