import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { FileText, Loader2, Plus, Download, BarChart3, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_COLORS: Record<string, string> = {
  uploaded: 'bg-gray-100 text-gray-700',
  payment_pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-blue-100 text-blue-700',
  printing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  failed_permanent: 'bg-red-100 text-red-700',
};

export default function JobsPage() {
  const { token } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [showStats, setShowStats] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<{ emailOnCompleted: boolean; emailOnFailed: boolean } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.getJobs(token)
      .then((data) => {
        setJobs(data.jobs || []);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load jobs');
      })
      .finally(() => {
        setLoading(false);
      });
    api.getJobStats(token).then((data) => {
      if (data.stats) setStats(data);
    }).catch(() => {});
    api.getNotificationPrefs(token).then(setNotifPrefs).catch(() => {});
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 font-medium mb-2">Failed to load jobs</p>
        <p className="text-gray-500 text-sm">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 text-primary-600 text-sm hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Print Jobs</h1>
        <div className="flex items-center gap-2">
          {jobs.length > 0 && (
            <button
              onClick={() => api.downloadCSV('/api/jobs/export', token!, `print-history-${new Date().toISOString().split('T')[0]}.csv`)}
              className="flex items-center gap-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              <Download size={16} /> Export CSV
            </button>
          )}
          <Link
            to="/"
            className="flex items-center gap-1 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition"
          >
            <Plus size={16} /> New Print
          </Link>
        </div>
      </div>

      {stats && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
          <button
            onClick={() => setShowStats(!showStats)}
            className="w-full flex items-center justify-between p-4 text-sm font-medium dark:text-white hover:bg-gray-50 dark:hover:bg-gray-750 transition"
          >
            <span className="flex items-center gap-2"><BarChart3 size={16} className="text-primary-500" /> My Print Stats</span>
            {showStats ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showStats && (
            <div className="border-t dark:border-gray-700 p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-primary-600">{stats.stats.completedJobs}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Completed</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.stats.totalPages}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Pages Printed</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">₹{(stats.stats.totalSpent / 100).toFixed(0)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total Spent</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-600 dark:text-gray-300">₹{(stats.stats.avgJobPrice / 100).toFixed(0)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Avg per Job</p>
                </div>
              </div>
              {stats.monthly?.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Monthly Trend</p>
                  <div className="flex items-end gap-1 h-16">
                    {stats.monthly.map((m: any, i: number) => {
                      const maxSpent = Math.max(...stats.monthly.map((x: any) => x.spent), 1);
                      const height = Math.max(4, (m.spent / maxSpent) * 100);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full bg-primary-400 dark:bg-primary-600 rounded-t" style={{ height: `${height}%` }} title={`₹${(m.spent / 100).toFixed(0)} · ${m.jobs} jobs`} />
                          <span className="text-[9px] text-gray-400">{m.month.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="text-center py-12">
          <FileText size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 dark:text-gray-400">No print jobs yet</p>
          <Link to="/" className="text-primary-600 text-sm hover:underline mt-2 inline-block">
            Upload your first document →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Link
              key={job.jobId}
              to={
                job.status === 'uploaded'
                  ? `/payment/${job.jobId}`
                  : `/status/${job.jobId}`
              }
              className="block bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText size={20} className="text-gray-400" />
                  <div>
                    <p className="font-medium text-sm">{job.fileName}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(job.createdAt).toLocaleString('en-IN')} ·{' '}
                      {job.pages} pages · {job.copies} copy(ies)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">
                    ₹{(job.price / 100).toFixed(2)}
                  </span>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      STATUS_COLORS[job.status] || 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {job.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Notification Settings */}
      {notifPrefs && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full flex items-center justify-between p-4 text-sm font-medium dark:text-white hover:bg-gray-50 dark:hover:bg-gray-750 transition"
          >
            <span className="flex items-center gap-2"><Bell size={16} className="text-primary-500" /> Notification Settings</span>
            {showSettings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showSettings && (
            <div className="border-t dark:border-gray-700 p-4 space-y-3">
              <label className="flex items-center justify-between">
                <span className="text-sm dark:text-gray-300">Email when print completes</span>
                <input
                  type="checkbox"
                  checked={notifPrefs.emailOnCompleted}
                  onChange={async (e) => {
                    const updated = { ...notifPrefs, emailOnCompleted: e.target.checked };
                    setNotifPrefs(updated);
                    try { await api.updateNotificationPrefs(updated, token!); toast.success('Saved'); } catch { toast.error('Failed to save'); }
                  }}
                  className="rounded"
                />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-sm dark:text-gray-300">Email when print fails</span>
                <input
                  type="checkbox"
                  checked={notifPrefs.emailOnFailed}
                  onChange={async (e) => {
                    const updated = { ...notifPrefs, emailOnFailed: e.target.checked };
                    setNotifPrefs(updated);
                    try { await api.updateNotificationPrefs(updated, token!); toast.success('Saved'); } catch { toast.error('Failed to save'); }
                  }}
                  className="rounded"
                />
              </label>
              <p className="text-xs text-gray-400 dark:text-gray-500">Email notifications are sent to your login email.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
