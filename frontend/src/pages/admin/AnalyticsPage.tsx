import { useState, useEffect, useCallback } from 'react';
import { useAdmin } from '../../hooks/useAdmin';
import { api } from '../../services/api';
import { ArrowLeft, BarChart3, Loader2, RefreshCw, TrendingUp, FileText, AlertTriangle, IndianRupee, File, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface AnalyticsData {
  summary: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    totalRevenue: number;
    totalPages: number;
    avgJobPrice: number;
  };
  daily: Array<{ date: string; jobs: number; revenue: number; pages: number }>;
  hourly: Array<{ hour: number; jobs: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  paymentTypeBreakdown: Array<{ type: string; count: number; amount: number }>;
}

export default function AnalyticsPage() {
  const { token } = useAdmin();
  const navigate = useNavigate();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.adminGetAnalytics(token!);
      setData(result);
    } catch {
      setError('Failed to load analytics');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-16">
        <p className="text-red-500 mb-4">{error || 'No data available'}</p>
        <button onClick={fetchAnalytics} className="text-primary-600 hover:text-primary-800 text-sm">
          Try Again
        </button>
      </div>
    );
  }

  const { summary, daily, hourly, statusBreakdown, paymentTypeBreakdown } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin')}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 size={24} className="text-primary-600" />
              Analytics
            </h1>
            <p className="text-sm text-gray-500">Platform metrics and trends</p>
          </div>
        </div>
        <button
          onClick={fetchAnalytics}
          className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard icon={<FileText size={18} />} label="Total Jobs" value={summary.totalJobs} />
        <SummaryCard icon={<TrendingUp size={18} />} label="Completed" value={summary.completedJobs} color="text-green-600" />
        <SummaryCard icon={<AlertTriangle size={18} />} label="Failed" value={summary.failedJobs} color="text-red-600" />
        <SummaryCard icon={<IndianRupee size={18} />} label="Revenue" value={`₹${(summary.totalRevenue / 100).toFixed(2)}`} color="text-emerald-600" />
        <SummaryCard icon={<File size={18} />} label="Total Pages" value={summary.totalPages} />
        <SummaryCard icon={<IndianRupee size={18} />} label="Avg Price" value={`₹${(summary.avgJobPrice / 100).toFixed(2)}`} />
      </div>

      {/* Daily Jobs Chart */}
      {daily.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Daily Jobs (Last 30 Days)</h3>
          <div className="flex items-end gap-1 h-40">
            {(() => {
              const maxJobs = Math.max(...daily.map(d => d.jobs), 1);
              return daily.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                    {d.date}: {d.jobs} jobs, ₹{(d.revenue / 100).toFixed(0)}, {d.pages} pages
                  </div>
                  <div
                    className="w-full bg-primary-500 rounded-t hover:bg-primary-600 transition-colors min-h-[2px]"
                    style={{ height: `${(d.jobs / maxJobs) * 100}%` }}
                  />
                </div>
              ));
            })()}
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-400">
            <span>{daily[0]?.date}</span>
            <span>{daily[daily.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Peak Hours Chart */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-4">
          <Clock size={16} /> Peak Hours
        </h3>
        <div className="space-y-1">
          {(() => {
            const maxJobs = Math.max(...hourly.map(h => h.jobs), 1);
            return hourly.map((h) => (
              <div key={h.hour} className="flex items-center gap-2 text-xs">
                <span className="w-8 text-right text-gray-500 font-mono">
                  {String(h.hour).padStart(2, '0')}:00
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${(h.jobs / maxJobs) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-gray-600 font-medium">{h.jobs}</span>
              </div>
            ));
          })()}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status Breakdown */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Status Breakdown</h3>
          {statusBreakdown.length === 0 ? (
            <p className="text-sm text-gray-400">No data</p>
          ) : (
            <div className="space-y-2">
              {(() => {
                const total = statusBreakdown.reduce((s, r) => s + r.count, 0) || 1;
                const colors: Record<string, string> = {
                  uploaded: 'bg-blue-500',
                  paid: 'bg-yellow-500',
                  printing: 'bg-purple-500',
                  completed: 'bg-green-500',
                  failed: 'bg-red-400',
                  failed_permanent: 'bg-red-600',
                };
                return statusBreakdown.map((s) => (
                  <div key={s.status}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 capitalize">{s.status.replace('_', ' ')}</span>
                      <span className="text-gray-500 font-medium">{s.count} ({Math.round((s.count / total) * 100)}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div
                        className={`h-full rounded-full ${colors[s.status] || 'bg-gray-400'}`}
                        style={{ width: `${(s.count / total) * 100}%` }}
                      />
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

        {/* Payment Type Breakdown */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Payment Methods</h3>
          {paymentTypeBreakdown.length === 0 ? (
            <p className="text-sm text-gray-400">No payment data</p>
          ) : (
            <div className="space-y-3">
              {paymentTypeBreakdown.map((p) => (
                <div key={p.type} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm text-gray-700 capitalize">{p.type || 'Unknown'}</span>
                    <span className="text-xs text-gray-400">{p.count} payments</span>
                  </div>
                  <p className="text-lg font-semibold text-gray-900">₹{(p.amount / 100).toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className={`mb-1 ${color || 'text-gray-400'}`}>{icon}</div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color || 'text-gray-800'}`}>{value}</p>
    </div>
  );
}
