import { useAuth } from '../hooks/useAuth';
import { useAdmin } from '../hooks/useAdmin';
import { Printer, LogOut, History, Calculator } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import WalletBadge from './WalletBadge';
import ThemeToggle from './ThemeToggle';
import LanguageSelector from './LanguageSelector';
import { ConnectionIndicator } from './ConnectionStatus';
import { useTranslation } from '../i18n/I18nContext';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, email, logout } = useAuth();
  useAdmin(); // Keep provider active
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const isPeonRoute = location.pathname.startsWith('/peon');
  const isAdminRoute = location.pathname.startsWith('/admin');

  // Peon routes have their own layout - render children only
  if (isPeonRoute) {
    return <>{children}</>;
  }

  // Admin routes get admin navbar
  if (isAdminRoute) {
    // Admin login page - minimal layout
    if (location.pathname === '/admin/login') {
      return (
        <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
          <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">{children}</main>
        </div>
      );
    }

    // Admin dashboard - minimal header (sidebar handles navigation)
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
          <div className="px-4 py-3 flex items-center justify-between">
            <Link to="/admin" className="flex items-center gap-2 text-primary-600 font-bold text-lg">
              <Printer size={24} />
              <span>{t('app.title')} — Admin</span>
            </Link>

            <div className="flex items-center gap-4">
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    );
  }

  // User routes - default navbar
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-primary-600 font-bold text-lg">
            <Printer size={24} />
            <span>{t('app.title')}</span>
          </Link>

          <div className="flex items-center gap-4">
            <ConnectionIndicator />
            <LanguageSelector />
            <ThemeToggle />
            <Link
              to="/estimate"
              className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300 hover:text-primary-600"
              title="Cost Estimator"
            >
              <Calculator size={16} />
              <span className="hidden sm:inline">Estimate</span>
            </Link>
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
                  aria-label="Log out"
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
