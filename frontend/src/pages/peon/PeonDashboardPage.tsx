import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { 
  Printer, 
  LogOut, 
  RefreshCw, 
  Plus, 
  FileText, 
  Package, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Sun,
  Moon
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

interface PrinterStatus {
  name: string;
  online: boolean;
  status: string;
  paperCount: number;
  lowThreshold: number;
  isLow: boolean;
  lastLoadedAt: string | null;
  lastLoadedBy: string | null;
}

interface RecentJob {
  id: string;
  fileName: string;
  pages: number;
  userName: string;
  printerName: string;
  completedAt: string;
}

interface RecentReload {
  printerName: string;
  addedCount: number;
  newCount: number;
  loadedBy: string;
  createdAt: string;
}

export default function PeonDashboardPage() {
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();
  const [user, setUser] = useState<{ displayName: string } | null>(null);
  const [printers, setPrinters] = useState<PrinterStatus[]>([]);
  const [queueDepth, setQueueDepth] = useState(0);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [recentReloads, setRecentReloads] = useState<RecentReload[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  
  // Add paper modal
  const [addPaperPrinter, setAddPaperPrinter] = useState<string | null>(null);
  const [addPaperCount, setAddPaperCount] = useState('');
  const [addPaperLoading, setAddPaperLoading] = useState(false);

  const token = localStorage.getItem('peonToken');

  const loadData = useCallback(async (showRefresh = false) => {
    if (!token) {
      navigate('/peon');
      return;
    }

    if (showRefresh) setRefreshing(true);

    try {
      const [statusRes, activityRes] = await Promise.all([
        api.peonGetStatus(token),
        api.peonGetActivity(token, 10),
      ]);

      if (statusRes.error) throw new Error(statusRes.error);
      if (activityRes.error) throw new Error(activityRes.error);

      setPrinters(statusRes.printers || []);
      setQueueDepth(statusRes.queueDepth || 0);
      setRecentJobs(activityRes.recentJobs || []);
      setRecentReloads(activityRes.recentReloads || []);
      setError('');
    } catch (err: any) {
      if (err.message?.includes('401') || err.message?.includes('Invalid')) {
        localStorage.removeItem('peonToken');
        localStorage.removeItem('peonUser');
        navigate('/peon');
        return;
      }
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, navigate]);

  useEffect(() => {
    const storedUser = localStorage.getItem('peonUser');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    loadData();
    
    // Refresh every 30 seconds
    const interval = setInterval(() => loadData(), 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleLogout = () => {
    localStorage.removeItem('peonToken');
    localStorage.removeItem('peonUser');
    navigate('/peon');
  };

  const handleAddPaper = async () => {
    if (!addPaperPrinter || !addPaperCount || !token) return;
    
    const count = parseInt(addPaperCount);
    if (isNaN(count) || count <= 0) {
      setError('Please enter a valid number');
      return;
    }

    setAddPaperLoading(true);
    try {
      const result = await api.peonAddPaper(addPaperPrinter, count, token);
      if (result.error) {
        setError(result.error);
      } else {
        setAddPaperPrinter(null);
        setAddPaperCount('');
        loadData(true); // Refresh data
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add paper');
    } finally {
      setAddPaperLoading(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const getPaperBarColor = (count: number, threshold: number) => {
    if (count === 0) return 'bg-red-500';
    if (count <= threshold) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getPaperPercentage = (count: number) => {
    // Assume 500 as "full" for display purposes
    return Math.min(100, (count / 500) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <Loader2 className="animate-spin" size={20} />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Printer size={24} className="text-primary-600" />
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Peon Portal</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Welcome, {user?.displayName || 'Staff'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 transition"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertTriangle size={16} />
              {error}
            </span>
            <button onClick={() => setError('')} className="text-red-500 hover:text-red-700">×</button>
          </div>
        )}

        {/* Queue Status */}
        <div className="bg-primary-50 dark:bg-primary-950 border border-primary-200 dark:border-primary-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-primary-800 dark:text-primary-200 font-medium">Queue Status</span>
            <p className="text-primary-600 dark:text-primary-400 text-sm">
              {queueDepth === 0 ? 'No jobs waiting' : `${queueDepth} job(s) waiting`}
            </p>
          </div>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:text-primary-700 text-sm disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Printers */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Printer size={20} />
            Printers
          </h2>
          
          {printers.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6 text-center text-gray-500 dark:text-gray-400">
              No printers found
            </div>
          ) : (
            printers.map((printer) => (
              <div key={printer.name} className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">{printer.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      {printer.online ? (
                        <CheckCircle size={14} className="text-green-500" />
                      ) : (
                        <XCircle size={14} className="text-red-500" />
                      )}
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {printer.online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setAddPaperPrinter(printer.name)}
                    className="flex items-center gap-1 bg-primary-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition"
                  >
                    <Plus size={16} />
                    Add Paper
                  </button>
                </div>

                {/* Paper Level Bar */}
                <div className="mb-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span className={`flex items-center gap-1 ${printer.isLow ? 'text-yellow-600 dark:text-yellow-400 font-medium' : 'text-gray-600 dark:text-gray-300'}`}>
                      {printer.isLow && <AlertTriangle size={14} />}
                      {printer.paperCount} sheets
                    </span>
                    <span className="text-gray-400 dark:text-gray-500 text-xs">
                      Low threshold: {printer.lowThreshold}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${getPaperBarColor(printer.paperCount, printer.lowThreshold)}`}
                      style={{ width: `${getPaperPercentage(printer.paperCount)}%` }}
                    />
                  </div>
                </div>

                {printer.lastLoadedAt && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Last loaded: {new Date(printer.lastLoadedAt).toLocaleString()} by {printer.lastLoadedBy}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Recent Activity */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText size={20} />
            Recent Activity
          </h2>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 divide-y dark:divide-gray-700 shadow-sm">
            {[...recentJobs.map(j => ({ type: 'job' as const, ...j, time: j.completedAt })),
              ...recentReloads.map(r => ({ type: 'reload' as const, ...r, time: r.createdAt }))]
              .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
              .slice(0, 10)
              .map((item, i) => (
                <div key={i} className="p-3 flex items-center gap-3">
                  <span className="text-gray-400 dark:text-gray-500">
                    {item.type === 'job' ? <FileText size={18} /> : <Package size={18} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    {item.type === 'job' ? (
                      <>
                        <p className="text-sm text-gray-900 dark:text-white truncate">
                          Printed {(item as RecentJob & { type: 'job' }).pages} pages
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {(item as RecentJob & { type: 'job' }).fileName}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-gray-900 dark:text-white">
                          Added {(item as RecentReload & { type: 'reload' }).addedCount} sheets
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          by {(item as RecentReload & { type: 'reload' }).loadedBy} • 
                          New total: {(item as RecentReload & { type: 'reload' }).newCount}
                        </p>
                      </>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    {formatTime(item.time)}
                  </span>
                </div>
              ))}
            
            {recentJobs.length === 0 && recentReloads.length === 0 && (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                No recent activity
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Add Paper Modal */}
      {addPaperPrinter && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-sm w-full p-6 border dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Plus size={20} className="text-primary-600" />
              Add Paper
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Printer: <strong className="text-gray-900 dark:text-white">{addPaperPrinter}</strong>
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Number of sheets to add
              </label>
              <input
                type="number"
                value={addPaperCount}
                onChange={(e) => setAddPaperCount(e.target.value)}
                className="w-full px-4 py-3 border dark:border-gray-600 rounded-lg text-lg text-center bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="500"
                min="1"
                max="10000"
                autoFocus
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                This will be added to the current count
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setAddPaperPrinter(null); setAddPaperCount(''); }}
                className="flex-1 py-2.5 border dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                disabled={addPaperLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleAddPaper}
                disabled={addPaperLoading || !addPaperCount}
                className="flex-1 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {addPaperLoading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Plus size={18} />
                )}
                {addPaperLoading ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
