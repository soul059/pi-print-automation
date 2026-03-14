import { useAuth } from '../hooks/useAuth';
import { Printer, LogOut, History } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, email, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-primary-600 font-bold text-lg">
            <Printer size={24} />
            <span>Print Service</span>
          </Link>

          {isAuthenticated && (
            <div className="flex items-center gap-4">
              <Link
                to="/jobs"
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-primary-600"
              >
                <History size={16} />
                My Jobs
              </Link>
              <span className="text-sm text-gray-500 hidden sm:inline">{email}</span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">{children}</main>

      <footer className="text-center text-xs text-gray-400 py-4 border-t">
        Campus Print Service — Powered by Pi Zero 2W
      </footer>
    </div>
  );
}
