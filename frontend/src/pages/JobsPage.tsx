import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { FileText, Plus, Download, BarChart3, ChevronDown, ChevronUp, Bell, Trophy } from 'lucide-react';
import { ListSkeleton, ErrorDisplay, EmptyState } from '../components/UIHelpers';
import toast from 'react-hot-toast';

const STATUS_COLORS: Record<string, string> = {
  uploaded: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  payment_pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  paid: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  printing: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  completed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  failed_permanent: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

export default function JobsPage() {
  const { token } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [showStats, setShowStats] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<{ emailOnCompleted: boolean; emailOnFailed: boolean } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [leaderboard, setLeaderboard] = useState<any>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const loadJobs = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getJobs(token);
      setJobs(data.jobs || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load jobs'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    if (token) {
      api.getJobStats(token).then((data) => {
        if (data.stats) setStats(data);
      }).catch(() => {});
      api.getNotificationPrefs(token).then(setNotifPrefs).catch(() => {});
      api.getLeaderboard().then((data) => { if (data.leaderboard) setLeaderboard(data); }).catch(() => {});
    }
  }, [token]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-10 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
        <ListSkeleton count={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold dark:text-white">My Print Jobs</h1>
        <ErrorDisplay error={error} onRetry={loadJobs} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-white">My Print Jobs</h1>
        <div className="flex items-center gap-2">
          {jobs.length > 0 && (
            <button
              onClick={() => api.downloadCSV('/api/jobs/export', token!, `print-history-${new Date().toISOString().split('T')[0]}.csv`)}
              className="flex items-center gap-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
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
            className="w-full flex items-center justify-between p-4 text-sm font-medium dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition"
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
        <EmptyState
          icon={<FileText size={48} />}
          title="No print jobs yet"
          description="Upload your first document to get started"
          action={{ label: 'Upload Document', onClick: () => window.location.href = '/' }}
        />
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

      {/* Department Leaderboard */}
      {leaderboard && leaderboard.leaderboard.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
          <button onClick={() => setShowLeaderboard(!showLeaderboard)} className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
            <span className="flex items-center gap-2"><Trophy size={16} className="text-yellow-500" /> Department Leaderboard</span>
            {showLeaderboard ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showLeaderboard && (
            <div className="px-4 pb-4 space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Total: {leaderboard.global.totalJobs} jobs, {leaderboard.global.totalPages.toLocaleString()} pages
              </p>
              {leaderboard.leaderboard.map((dept: any, i: number) => {
                const maxPages = leaderboard.leaderboard[0]?.pages || 1;
                return (
                  <div key={dept.name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`} {dept.name}</span>
                      <span className="text-gray-500 dark:text-gray-400">{dept.pages.toLocaleString()} pages · {dept.users} users</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className="bg-yellow-500 h-2 rounded-full transition-all" style={{ width: `${(dept.pages / maxPages) * 100}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Notification Settings */}
      {notifPrefs && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full flex items-center justify-between p-4 text-sm font-medium dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition"
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
