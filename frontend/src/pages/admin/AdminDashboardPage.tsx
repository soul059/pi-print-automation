import { useState, useEffect, useCallback } from 'react';
import { useAdmin } from '../../hooks/useAdmin';
import { api } from '../../services/api';
import {
  Activity,
  FileText,
  Shield,
  Printer,
  RefreshCw,
  Loader2,
  LogOut,
  RotateCcw,
  XCircle,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  DollarSign,
  BarChart3,
  Megaphone,
  Gauge,
  Download,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type Tab = 'overview' | 'jobs' | 'policies' | 'limits';

export default function AdminDashboardPage() {
  const { token, displayName, logout } = useAdmin();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield size={24} className="text-primary-600" />
            Admin Dashboard
          </h1>
          <p className="text-sm text-gray-500">Logged in as {displayName}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 px-3 py-1.5 border rounded-lg"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
        {([
          { id: 'overview', label: 'Overview', icon: Activity },
          { id: 'jobs', label: 'Jobs', icon: FileText },
          { id: 'policies', label: 'Email Policies', icon: Shield },
          { id: 'limits', label: 'Print Limits', icon: Gauge },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition ${
              tab === id ? 'bg-white shadow text-primary-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
        <button
          onClick={() => navigate('/admin/analytics')}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition text-gray-500 hover:text-gray-700"
        >
          <BarChart3 size={16} />
          Analytics
        </button>
        <button
          onClick={() => navigate('/admin/announcements')}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition text-gray-500 hover:text-gray-700"
        >
          <Megaphone size={16} />
          Announcements
        </button>
      </div>

      {tab === 'overview' && <OverviewTab token={token!} />}
      {tab === 'jobs' && <JobsTab token={token!} />}
      {tab === 'policies' && <PoliciesTab token={token!} />}
      {tab === 'limits' && <LimitsTab token={token!} />}
    </div>
  );
}

// --- Overview Tab ---
function OverviewTab({ token }: { token: string }) {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminGetHealth(token);
      setHealth(data);
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  if (loading) return <LoadingSpinner />;
  if (!health) return <p className="text-gray-500">Failed to load health data</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={fetchHealth} className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Printer Status */}
      <Card title="Printer" icon={<Printer size={18} />}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <Stat label="Status" value={health.printer?.online ? '🟢 Online' : '🔴 Offline'} />
          <Stat label="Name" value={health.printer?.printerName || 'N/A'} />
          <Stat label="State" value={health.printer?.status || 'unknown'} />
        </div>
      </Card>

      {/* Queue Stats */}
      <Card title="Job Queue" icon={<FileText size={18} />}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="In Queue" value={health.queue?.depth ?? 0} highlight />
          <Stat label="Uploaded" value={health.queue?.uploaded ?? 0} />
          <Stat label="Paid" value={health.queue?.paid ?? 0} />
          <Stat label="Printing" value={health.queue?.printing ?? 0} />
          <Stat label="Completed" value={health.queue?.completed ?? 0} />
          <Stat label="Failed" value={health.queue?.failed ?? 0} />
          <Stat label="Perm. Failed" value={health.queue?.failed_permanent ?? 0} />
        </div>
      </Card>

      {/* System */}
      <Card title="System" icon={<Activity size={18} />}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <Stat label="Memory" value={health.system?.memoryUsage} />
          <Stat label="Free RAM" value={health.system?.freeMemory} />
          <Stat label="Uptime" value={health.system?.uptime} />
          <Stat label="Uploads Size" value={health.system?.uploadDirSize} />
          <Stat label="Platform" value={health.system?.platform} />
          <Stat label="Last Print" value={health.lastSuccessfulPrint || 'Never'} />
        </div>
      </Card>
    </div>
  );
}

// --- Jobs Tab ---
function JobsTab({ token }: { token: string }) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminGetJobs(token, {
        status: filter || undefined,
        limit: 100,
      });
      setJobs(data.jobs || []);
    } catch {}
    setLoading(false);
  }, [token, filter]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleRetry = async (jobId: string) => {
    setActionLoading(jobId);
    await api.adminRetryJob(jobId, token);
    setActionLoading(null);
    fetchJobs();
  };

  const handleCancel = async (jobId: string) => {
    setActionLoading(jobId);
    await api.adminCancelJob(jobId, token);
    setActionLoading(null);
    fetchJobs();
  };

  const handleRefund = async (jobId: string) => {
    setActionLoading(jobId);
    try {
      const result = await api.adminRefundJob(jobId, token);
      if (result.error) {
        alert(`Refund failed: ${result.error}`);
      }
    } catch {
      alert('Refund request failed');
    }
    setActionLoading(null);
    fetchJobs();
  };

  const statuses = ['', 'uploaded', 'paid', 'printing', 'completed', 'failed', 'failed_permanent'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                filter === s
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchJobs} className="flex items-center gap-1 text-sm text-primary-600">
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => api.downloadCSV('/api/admin/jobs/export', token, `all-print-history-${new Date().toISOString().split('T')[0]}.csv`)}
            className="flex items-center gap-1 text-sm border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : jobs.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No jobs found</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job: any) => (
            <div key={job.id} className="bg-white rounded-lg border p-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <StatusBadge status={job.status} />
                  <span className="text-xs text-gray-400 font-mono truncate">{job.id}</span>
                </div>
                <p className="text-sm font-medium truncate">{job.file_name}</p>
                <p className="text-xs text-gray-500">{job.user_email} · {job.total_pages} pages · {job.copies} copies</p>
                <p className="text-xs text-gray-400">
                  ₹{(job.price / 100).toFixed(2)} · {job.color} · {job.duplex ? 'duplex' : 'simplex'} · {job.print_mode}
                  {job.printer_name && ` · 🖨 ${job.printer_name}`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{job.created_at}</p>
                {job.error_message && (
                  <p className="text-xs text-red-500 mt-1">Error: {job.error_message}</p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                {(job.status === 'failed' || job.status === 'failed_permanent') && (
                  <button
                    onClick={() => handleRetry(job.id)}
                    disabled={actionLoading === job.id}
                    className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                    title="Retry"
                  >
                    {actionLoading === job.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  </button>
                )}
                {job.status === 'failed_permanent' && (
                  <button
                    onClick={() => handleRefund(job.id)}
                    disabled={actionLoading === job.id}
                    className="p-1.5 text-amber-600 hover:bg-amber-50 rounded"
                    title="Refund"
                  >
                    {actionLoading === job.id ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
                  </button>
                )}
                {!['completed', 'failed_permanent'].includes(job.status) && (
                  <button
                    onClick={() => handleCancel(job.id)}
                    disabled={actionLoading === job.id}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                    title="Cancel"
                  >
                    <XCircle size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Policies Tab ---
function PoliciesTab({ token }: { token: string }) {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', domain: '', pattern: '', departmentKey: '' });
  const [formError, setFormError] = useState('');

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminGetPolicies(token);
      setPolicies(data.policies || []);
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      new RegExp(form.pattern);
    } catch {
      setFormError('Invalid regex pattern');
      return;
    }
    const data = await api.adminCreatePolicy(
      { ...form, active: true },
      token
    );
    if (data.error) {
      setFormError(data.error);
      return;
    }
    setShowForm(false);
    setForm({ name: '', domain: '', pattern: '', departmentKey: '' });
    fetchPolicies();
  };

  const handleToggle = async (id: number, currentActive: boolean) => {
    await api.adminUpdatePolicy(id, { active: !currentActive }, token);
    fetchPolicies();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this policy?')) return;
    await api.adminDeletePolicy(id, token);
    fetchPolicies();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          Email policies control which users can access the print service
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
        >
          <Plus size={14} /> Add Policy
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-lg border p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-2.5 py-1.5 border rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="IT Undergraduate B"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Domain</label>
              <input
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
                className="w-full px-2.5 py-1.5 border rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="ddu.ac.in"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Pattern (regex)</label>
              <input
                value={form.pattern}
                onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                className="w-full px-2.5 py-1.5 border rounded text-sm font-mono focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="^[0-9]{2}itub[0-9]{3}$"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Department Key</label>
              <input
                value={form.departmentKey}
                onChange={(e) => setForm({ ...form, departmentKey: e.target.value })}
                className="w-full px-2.5 py-1.5 border rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="itub"
                required
              />
            </div>
          </div>
          {formError && <p className="text-xs text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-1.5 bg-primary-600 text-white rounded text-sm font-medium hover:bg-primary-700"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : policies.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No policies configured</p>
      ) : (
        <div className="space-y-2">
          {policies.map((p: any) => (
            <div key={p.id} className="bg-white rounded-lg border p-4 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm">{p.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {p.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  <span className="font-mono">{p.pattern}</span>@{p.domain}
                </p>
                <p className="text-xs text-gray-400">Key: {p.department_key}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => handleToggle(p.id, !!p.active)}
                  className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-50 rounded"
                  title={p.active ? 'Deactivate' : 'Activate'}
                >
                  {p.active ? <ToggleRight size={18} className="text-green-600" /> : <ToggleLeft size={18} />}
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Limits Tab ---
function LimitsTab({ token }: { token: string }) {
  const [dailyLimit, setDailyLimit] = useState<number>(100);
  const [newLimit, setNewLimit] = useState<string>('');
  const [exemptions, setExemptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', extraPages: '', reason: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [limitData, exemptionData] = await Promise.all([
        api.adminGetDailyLimit(token),
        api.adminGetExemptions(token),
      ]);
      if (limitData.limit) {
        setDailyLimit(limitData.limit);
        setNewLimit(String(limitData.limit));
      }
      setExemptions(exemptionData.exemptions || []);
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUpdateLimit = async () => {
    const parsed = parseInt(newLimit, 10);
    if (isNaN(parsed) || parsed < 1) return;
    setSaving(true);
    await api.adminSetDailyLimit(parsed, token);
    setDailyLimit(parsed);
    setSaving(false);
  };

  const handleGrantExemption = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const extraPages = parseInt(form.extraPages, 10);
    if (!form.email || isNaN(extraPages) || extraPages < 1) {
      setFormError('Valid email and page count required');
      return;
    }
    const result = await api.adminGrantExemption(form.email, extraPages, form.reason, token);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    setForm({ email: '', extraPages: '', reason: '' });
    setShowForm(false);
    fetchData();
  };

  const handleRevoke = async (id: number) => {
    if (!confirm('Revoke this exemption?')) return;
    await api.adminRevokeExemption(id, token);
    fetchData();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Daily Limit Setting */}
      <Card title="Daily Page Limit" icon={<Gauge size={18} />}>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            value={newLimit}
            onChange={(e) => setNewLimit(e.target.value)}
            className="w-32 px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
          <span className="text-sm text-gray-500">pages per user per day</span>
          <button
            onClick={handleUpdateLimit}
            disabled={saving || parseInt(newLimit, 10) === dailyLimit}
            className="px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Update'}
          </button>
        </div>
      </Card>

      {/* Exemptions */}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-700">Active Exemptions</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
        >
          <Plus size={14} /> Grant Exemption
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleGrantExemption} className="bg-white rounded-lg border p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">User Email</label>
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-2.5 py-1.5 border rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="user@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Extra Pages</label>
              <input
                type="number"
                min={1}
                value={form.extraPages}
                onChange={(e) => setForm({ ...form, extraPages: e.target.value })}
                className="w-full px-2.5 py-1.5 border rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="50"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
              <input
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full px-2.5 py-1.5 border rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="Exam preparation"
              />
            </div>
          </div>
          {formError && <p className="text-xs text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-1.5 bg-primary-600 text-white rounded text-sm font-medium hover:bg-primary-700"
            >
              Grant
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {exemptions.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No active exemptions</p>
      ) : (
        <div className="space-y-2">
          {exemptions.map((ex: any) => (
            <div key={ex.id} className="bg-white rounded-lg border p-4 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{ex.user_email}</p>
                <p className="text-xs text-gray-500">
                  +{ex.extra_pages} pages · Granted by {ex.granted_by}
                  {ex.reason && ` · ${ex.reason}`}
                </p>
                <p className="text-xs text-gray-400">Expires: {ex.expires_at}</p>
              </div>
              <button
                onClick={() => handleRevoke(ex.id)}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                title="Revoke"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Shared Components ---
function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border p-5">
      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-3">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`font-medium ${highlight ? 'text-primary-600 text-lg' : 'text-gray-800'}`}>
        {value ?? '—'}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    uploaded: 'bg-blue-100 text-blue-700',
    paid: 'bg-yellow-100 text-yellow-700',
    printing: 'bg-purple-100 text-purple-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    failed_permanent: 'bg-red-200 text-red-800',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-8">
      <Loader2 size={24} className="animate-spin text-primary-500" />
    </div>
  );
}
