import { useState, useEffect, useCallback } from 'react';
import { useAdmin } from '../../hooks/useAdmin';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
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
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Info,
  Upload,
  Clock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type Tab = 'overview' | 'jobs' | 'policies' | 'limits' | 'quickprint';

function formatTime(raw: string | undefined): string {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return raw;
  }
}

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
          <h1 className="text-2xl font-bold flex items-center gap-2 dark:text-white">
            <Shield size={24} className="text-primary-600" />
            Admin Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Logged in as {displayName}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 px-3 py-1.5 border dark:border-gray-600 rounded-lg transition"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg overflow-x-auto">
        {([
          { id: 'overview', label: 'Overview', icon: Activity },
          { id: 'jobs', label: 'Jobs', icon: FileText },
          { id: 'policies', label: 'Email Policies', icon: Shield },
          { id: 'limits', label: 'Print Limits', icon: Gauge },
          { id: 'quickprint', label: 'Quick Print', icon: Upload },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${
              tab === id
                ? 'bg-white dark:bg-gray-700 shadow text-primary-700 dark:text-primary-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <Icon size={16} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
        <button
          onClick={() => navigate('/admin/analytics')}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap"
        >
          <BarChart3 size={16} />
          <span className="hidden sm:inline">Analytics</span>
        </button>
        <button
          onClick={() => navigate('/admin/announcements')}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap"
        >
          <Megaphone size={16} />
          <span className="hidden sm:inline">Announcements</span>
        </button>
      </div>

      {tab === 'overview' && <OverviewTab token={token!} />}
      {tab === 'jobs' && <JobsTab token={token!} />}
      {tab === 'policies' && <PoliciesTab token={token!} />}
      {tab === 'limits' && <LimitsTab token={token!} />}
      {tab === 'quickprint' && <QuickPrintTab token={token!} />}
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
    } catch {
      toast.error('Failed to load health data');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  if (loading) return <LoadingSpinner />;
  if (!health) return (
    <div className="text-center py-12">
      <AlertTriangle size={32} className="mx-auto text-amber-500 mb-3" />
      <p className="text-gray-500 dark:text-gray-400">Failed to load health data</p>
      <button onClick={fetchHealth} className="mt-3 text-sm text-primary-600 hover:text-primary-800">Try Again</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={fetchHealth} className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 transition">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Printer Status */}
      <Card title="Printer" icon={<Printer size={18} />}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <Stat label="Status" value={
            <span className={`inline-flex items-center gap-1.5 font-semibold ${health.printer?.online ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${health.printer?.online ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              {health.printer?.online ? 'Online' : 'Offline'}
            </span>
          } />
          <Stat label="Name" value={health.printer?.printerName || 'N/A'} />
          <Stat label="State" value={health.printer?.status || 'unknown'} />
        </div>
      </Card>

      {/* Queue Stats */}
      <Card title="Job Queue" icon={<FileText size={18} />}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <Stat label="Memory" value={health.system?.memoryUsage} />
          <Stat label="Free RAM" value={health.system?.freeMemory} />
          <Stat label="Uptime" value={health.system?.uptime} />
          <Stat label="Uploads Size" value={health.system?.uploadDirSize} />
          <Stat label="Platform" value={health.system?.platform} />
          <Stat label="Last Print" value={formatTime(health.lastSuccessfulPrint) || 'Never'} />
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
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [bulkRefunding, setBulkRefunding] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminGetJobs(token, {
        status: filter || undefined,
        limit: 100,
      });
      setJobs(data.jobs || []);
    } catch {
      toast.error('Failed to load jobs');
    }
    setLoading(false);
  }, [token, filter]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleRetry = async (jobId: string) => {
    setActionLoading(jobId);
    try {
      await api.adminRetryJob(jobId, token);
      toast.success('Job queued for retry');
      fetchJobs();
    } catch {
      toast.error('Retry failed');
    }
    setActionLoading(null);
  };

  const handleCancel = async (jobId: string) => {
    if (!confirm('Cancel this job?')) return;
    setActionLoading(jobId);
    try {
      await api.adminCancelJob(jobId, token);
      toast.success('Job cancelled');
      fetchJobs();
    } catch {
      toast.error('Cancel failed');
    }
    setActionLoading(null);
  };

  const handleRefund = async (jobId: string) => {
    if (!confirm('Process refund for this job?')) return;
    setActionLoading(jobId);
    try {
      const result = await api.adminRefundJob(jobId, token);
      if (result.error) {
        toast.error(`Refund failed: ${result.error}`);
      } else {
        toast.success('Refund processed successfully');
      }
    } catch {
      toast.error('Refund request failed');
    }
    setActionLoading(null);
    fetchJobs();
  };

  const handleBulkRefund = async () => {
    if (selectedJobs.size === 0) return;
    setBulkRefunding(true);
    try {
      const result = await api.adminBulkRefund(Array.from(selectedJobs), token);
      if (result.summary) {
        toast.success(`Refunded ${result.summary.succeeded}/${result.summary.total} jobs`);
        if (result.summary.failed > 0) {
          const errors = result.results.filter((r: any) => !r.success);
          toast.error(`${result.summary.failed} failed: ${errors.map((e: any) => e.error).join(', ')}`);
        }
      }
      setSelectedJobs(new Set());
      fetchJobs();
    } catch {
      toast.error('Bulk refund failed');
    }
    setBulkRefunding(false);
  };

  const statuses = ['', 'uploaded', 'paid', 'printing', 'completed', 'failed', 'failed_permanent'];

  const filteredJobs = searchQuery
    ? jobs.filter(j =>
        j.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        j.file_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        j.id?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : jobs;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex gap-1 flex-wrap">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                filter === s
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 border dark:border-gray-600 rounded-lg text-sm w-full sm:w-48 bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <button onClick={fetchJobs} className="flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 shrink-0">
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => api.downloadCSV('/api/admin/jobs/export', token, `print-history-${new Date().toISOString().split('T')[0]}.csv`)}
            className="flex items-center gap-1 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition shrink-0"
          >
            <Download size={14} /> CSV
          </button>
          {selectedJobs.size > 0 && (
            <button
              onClick={handleBulkRefund}
              disabled={bulkRefunding}
              className="flex items-center gap-1 text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50 transition shrink-0"
            >
              <DollarSign size={14} /> Refund {selectedJobs.size} selected
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : filteredJobs.length === 0 ? (
        <div className="text-center py-12">
          <FileText size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-400 dark:text-gray-500">{searchQuery ? 'No matching jobs' : 'No jobs found'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 dark:text-gray-500">{filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''}</p>
          {filteredJobs.map((job: any) => (
            <div
              key={job.id}
              className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden transition hover:border-gray-300 dark:hover:border-gray-600"
            >
              <div className="p-4 flex items-start justify-between gap-3">
                {job.status === 'failed_permanent' && (
                  <input
                    type="checkbox"
                    checked={selectedJobs.has(job.id)}
                    onChange={(e) => {
                      const next = new Set(selectedJobs);
                      if (e.target.checked) next.add(job.id);
                      else next.delete(job.id);
                      setSelectedJobs(next);
                    }}
                    className="mt-1 rounded shrink-0"
                  />
                )}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={job.status} />
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">{job.id.slice(0, 12)}…</span>
                    {expandedJob === job.id ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  </div>
                  <p className="text-sm font-medium dark:text-white truncate" title={job.file_name}>{job.file_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{job.user_email} · {job.total_pages} pg · {job.copies} copies</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {(job.status === 'failed' || job.status === 'failed_permanent') && (
                    <ActionButton
                      onClick={() => handleRetry(job.id)}
                      loading={actionLoading === job.id}
                      icon={<RotateCcw size={14} />}
                      color="green"
                      title="Retry"
                    />
                  )}
                  {job.status === 'failed_permanent' && (
                    <ActionButton
                      onClick={() => handleRefund(job.id)}
                      loading={actionLoading === job.id}
                      icon={<DollarSign size={14} />}
                      color="amber"
                      title="Refund"
                    />
                  )}
                  {!['completed', 'failed_permanent'].includes(job.status) && (
                    <ActionButton
                      onClick={() => handleCancel(job.id)}
                      loading={actionLoading === job.id}
                      icon={<XCircle size={14} />}
                      color="red"
                      title="Cancel"
                    />
                  )}
                </div>
              </div>
              {/* Expanded Details */}
              {expandedJob === job.id && (
                <div className="border-t dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-900 text-xs space-y-1">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Detail label="Price" value={`₹${(job.price / 100).toFixed(2)}`} />
                    <Detail label="Color" value={job.color} />
                    <Detail label="Duplex" value={job.duplex ? 'Yes' : 'No'} />
                    <Detail label="Mode" value={job.print_mode} />
                    <Detail label="Paper" value={job.paper_size} />
                    <Detail label="Payment" value={job.payment_type || '—'} />
                    <Detail label="Printer" value={job.printer_name || '—'} />
                    <Detail label="Created" value={formatTime(job.created_at)} />
                  </div>
                  {job.error_message && (
                    <p className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 px-2 py-1 rounded mt-2 flex items-start gap-1.5">
                      <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                      {job.error_message}
                    </p>
                  )}
                  <p className="text-gray-400 dark:text-gray-500 font-mono pt-1">ID: {job.id}</p>
                </div>
              )}
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
  const [saving, setSaving] = useState(false);

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminGetPolicies(token);
      setPolicies(data.policies || []);
    } catch {
      toast.error('Failed to load policies');
    }
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
    setSaving(true);
    try {
      const data = await api.adminCreatePolicy(
        { ...form, active: true },
        token
      );
      if (data.error) {
        setFormError(data.error);
        return;
      }
      toast.success('Policy created');
      setShowForm(false);
      setForm({ name: '', domain: '', pattern: '', departmentKey: '' });
      fetchPolicies();
    } catch {
      toast.error('Failed to create policy');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: number, currentActive: boolean) => {
    try {
      await api.adminUpdatePolicy(id, { active: !currentActive }, token);
      toast.success(`Policy ${currentActive ? 'deactivated' : 'activated'}`);
      fetchPolicies();
    } catch {
      toast.error('Failed to update policy');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this policy? Users matching this pattern will no longer be able to access the print service.')) return;
    try {
      await api.adminDeletePolicy(id, token);
      toast.success('Policy deleted');
      fetchPolicies();
    } catch {
      toast.error('Failed to delete policy');
    }
  };

  // Regex test helper
  const [testEmail, setTestEmail] = useState('');
  const testResult = testEmail ? (() => {
    const atIdx = testEmail.indexOf('@');
    if (atIdx === -1) return null;
    const local = testEmail.slice(0, atIdx).toLowerCase();
    const domain = testEmail.slice(atIdx + 1).toLowerCase();
    for (const p of policies) {
      if (p.domain === domain && p.active) {
        try {
          if (new RegExp(p.pattern).test(local)) return { match: true, policy: p.name };
        } catch { /* ignore */ }
      }
    }
    return { match: false, policy: null };
  })() : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Email policies control which users can access the print service
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition shrink-0"
        >
          <Plus size={14} /> Add Policy
        </button>
      </div>

      {/* Email Test Tool */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-3">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Test Email Against Policies</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
              placeholder="e.g. 23itubs017@ddu.ac.in"
            />
          </div>
        </div>
        {testResult && (
          <p className={`text-xs mt-2 flex items-center gap-1.5 ${testResult.match ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {testResult.match
              ? <><CheckCircle2 size={14} /> Matches policy: {testResult.policy}</>
              : <><XCircle size={14} /> No matching policy found</>
            }
          </p>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              label="Name"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              placeholder="IT Department"
              hint="Display name for this policy"
              required
            />
            <FormField
              label="Domain"
              value={form.domain}
              onChange={(v) => setForm({ ...form, domain: v })}
              placeholder="ddu.ac.in"
              hint="Email domain after @"
              required
            />
            <FormField
              label="Pattern (regex)"
              value={form.pattern}
              onChange={(v) => setForm({ ...form, pattern: v })}
              placeholder="^[0-9]{2}it[a-z]+[0-9]{3}$"
              hint="Regex matched against the part before @"
              mono
              required
            />
            <FormField
              label="Department Key"
              value={form.departmentKey}
              onChange={(v) => setForm({ ...form, departmentKey: v })}
              placeholder="it"
              hint="Short key for identification"
              required
            />
          </div>
          {formError && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 px-2 py-1.5 rounded flex items-center gap-1.5">
              <AlertTriangle size={12} /> {formError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition flex items-center gap-1.5"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormError(''); }}
              className="px-4 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : policies.length === 0 ? (
        <div className="text-center py-12">
          <Shield size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-400 dark:text-gray-500">No policies configured</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Add a policy to allow users from a specific domain</p>
        </div>
      ) : (
        <div className="space-y-2">
          {policies.map((p: any) => (
            <div key={p.id} className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 flex items-center justify-between gap-3 transition hover:border-gray-300 dark:hover:border-gray-600">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm dark:text-white">{p.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    p.active
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {p.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">{p.pattern}</code>
                  <span className="text-gray-400 dark:text-gray-500">@{p.domain}</span>
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Key: {p.department_key}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => handleToggle(p.id, !!p.active)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  title={p.active ? 'Deactivate' : 'Activate'}
                >
                  {p.active ? <ToggleRight size={20} className="text-green-600 dark:text-green-400" /> : <ToggleLeft size={20} className="text-gray-400" />}
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition"
                  title="Delete"
                >
                  <Trash2 size={16} />
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
  const [opHours, setOpHours] = useState<{ enabled: boolean; startHour: number; endHour: number; days: number[] }>({ enabled: false, startHour: 8, endHour: 20, days: [1,2,3,4,5,6] });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [limitData, exemptionData, hoursData] = await Promise.all([
        api.adminGetDailyLimit(token),
        api.adminGetExemptions(token),
        api.adminGetOperatingHours(token),
      ]);
      if (limitData.limit) {
        setDailyLimit(limitData.limit);
        setNewLimit(String(limitData.limit));
      }
      setExemptions(exemptionData.exemptions || []);
      if (hoursData.startHour !== undefined) setOpHours(hoursData);
    } catch {
      toast.error('Failed to load limits data');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUpdateLimit = async () => {
    const parsed = parseInt(newLimit, 10);
    if (isNaN(parsed) || parsed < 1) {
      toast.error('Please enter a valid limit (minimum 1)');
      return;
    }
    setSaving(true);
    try {
      await api.adminSetDailyLimit(parsed, token);
      setDailyLimit(parsed);
      toast.success(`Daily limit updated to ${parsed} pages`);
    } catch {
      toast.error('Failed to update limit');
    }
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
    setSaving(true);
    try {
      const result = await api.adminGrantExemption(form.email, extraPages, form.reason, token);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      toast.success(`Exemption granted: +${extraPages} pages for ${form.email}`);
      setForm({ email: '', extraPages: '', reason: '' });
      setShowForm(false);
      fetchData();
    } catch {
      toast.error('Failed to grant exemption');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm('Revoke this exemption?')) return;
    try {
      await api.adminRevokeExemption(id, token);
      toast.success('Exemption revoked');
      fetchData();
    } catch {
      toast.error('Failed to revoke exemption');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Daily Limit Setting */}
      <Card title="Daily Page Limit" icon={<Gauge size={18} />}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              className="w-28 px-3 py-2 border dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">pages/user/day</span>
          </div>
          <button
            onClick={handleUpdateLimit}
            disabled={saving || parseInt(newLimit, 10) === dailyLimit}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition flex items-center gap-1.5"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Saving...' : 'Update'}
          </button>
        </div>
      </Card>

      {/* Operating Hours */}
      <Card title="Operating Hours" icon={<Clock size={18} />}>
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={opHours.enabled}
              onChange={async (e) => {
                const updated = { ...opHours, enabled: e.target.checked };
                setOpHours(updated);
                try { await api.adminSetOperatingHours(updated, token); toast.success(e.target.checked ? 'Operating hours enabled' : 'Operating hours disabled'); } catch { toast.error('Failed to update'); }
              }}
              className="rounded"
            />
            <span className="text-sm dark:text-gray-300">Restrict uploads to operating hours</span>
          </label>
          {opHours.enabled && (
            <>
              <div className="flex items-center gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Open</label>
                  <select value={opHours.startHour} onChange={async (e) => { const updated = { ...opHours, startHour: parseInt(e.target.value) }; setOpHours(updated); try { await api.adminSetOperatingHours(updated, token); toast.success('Updated'); } catch { toast.error('Failed'); } }} className="border dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm dark:bg-gray-700 dark:text-white">
                    {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{`${i % 12 || 12}:00 ${i < 12 ? 'AM' : 'PM'}`}</option>)}
                  </select>
                </div>
                <span className="text-gray-400 mt-5">–</span>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Close</label>
                  <select value={opHours.endHour} onChange={async (e) => { const updated = { ...opHours, endHour: parseInt(e.target.value) }; setOpHours(updated); try { await api.adminSetOperatingHours(updated, token); toast.success('Updated'); } catch { toast.error('Failed'); } }} className="border dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm dark:bg-gray-700 dark:text-white">
                    {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{`${i % 12 || 12}:00 ${i < 12 ? 'AM' : 'PM'}`}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">Open Days</label>
                <div className="flex gap-1">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={async () => {
                        const days = opHours.days.includes(i) ? opHours.days.filter(d => d !== i) : [...opHours.days, i].sort();
                        const updated = { ...opHours, days };
                        setOpHours(updated);
                        try { await api.adminSetOperatingHours(updated, token); } catch { toast.error('Failed'); }
                      }}
                      className={`w-8 h-8 rounded-full text-xs font-medium transition ${
                        opHours.days.includes(i)
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Exemptions */}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Active Exemptions</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition"
        >
          <Plus size={14} /> Grant Exemption
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleGrantExemption} className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField
              label="User Email"
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
              placeholder="23itubs017@ddu.ac.in"
              hint="Email of the user to exempt"
              required
            />
            <FormField
              label="Extra Pages"
              value={form.extraPages}
              onChange={(v) => setForm({ ...form, extraPages: v })}
              placeholder="50"
              hint="Additional pages beyond daily limit"
              type="number"
              required
            />
            <FormField
              label="Reason"
              value={form.reason}
              onChange={(v) => setForm({ ...form, reason: v })}
              placeholder="Exam preparation"
              hint="Optional: why this exemption is granted"
            />
          </div>
          {formError && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 px-2 py-1.5 rounded flex items-center gap-1.5">
              <AlertTriangle size={12} /> {formError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition flex items-center gap-1.5"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Granting...' : 'Grant'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormError(''); }}
              className="px-4 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {exemptions.length === 0 ? (
        <div className="text-center py-8">
          <Info size={24} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-gray-400 dark:text-gray-500 text-sm">No active exemptions</p>
        </div>
      ) : (
        <div className="space-y-2">
          {exemptions.map((ex: any) => (
            <div key={ex.id} className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium dark:text-white">{ex.user_email}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="text-primary-600 dark:text-primary-400 font-semibold">+{ex.extra_pages} pages</span>
                  {' · '}Granted by {ex.granted_by}
                  {ex.reason && ` · ${ex.reason}`}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Expires: {formatTime(ex.expires_at)}</p>
              </div>
              <button
                onClick={() => handleRevoke(ex.id)}
                className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition"
                title="Revoke"
              >
                <Trash2 size={16} />
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
    <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-3">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
      <div className={`font-medium ${highlight ? 'text-primary-600 dark:text-primary-400 text-lg' : 'text-gray-800 dark:text-gray-200'}`}>
        {value ?? '—'}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    uploaded: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    paid: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    printing: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    failed_permanent: 'bg-red-200 text-red-800 dark:bg-red-950 dark:text-red-300',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function ActionButton({ onClick, loading, icon, color, title }: {
  onClick: () => void;
  loading: boolean;
  icon: React.ReactNode;
  color: 'green' | 'amber' | 'red';
  title: string;
}) {
  const colorMap = {
    green: 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950',
    amber: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950',
    red: 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950',
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`p-2 rounded-lg transition disabled:opacity-50 ${colorMap[color]}`}
      title={title}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
    </button>
  );
}

function FormField({ label, value, onChange, placeholder, hint, required, mono, type }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint?: string;
  required?: boolean;
  mono?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      <input
        type={type || 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-2.5 py-1.5 border dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none ${mono ? 'font-mono' : ''}`}
        placeholder={placeholder}
        required={required}
        min={type === 'number' ? 1 : undefined}
      />
      {hint && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{hint}</p>}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-400 dark:text-gray-500">{label}: </span>
      <span className="text-gray-700 dark:text-gray-200 font-medium">{value}</span>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 size={28} className="animate-spin text-primary-500" />
    </div>
  );
}

function QuickPrintTab({ token }: { token: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [paperSize, setPaperSize] = useState('A4');
  const [copies, setCopies] = useState(1);
  const [duplex, setDuplex] = useState(false);
  const [color, setColor] = useState('grayscale');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { toast.error('Select a PDF file'); return; }
    setLoading(true);
    setResult(null);
    try {
      const data = await api.adminDirectPrint(file, { paperSize, copies, duplex, color }, token);
      if (data.error) { toast.error(data.error); }
      else { toast.success('Job queued!'); setResult(data); setFile(null); }
    } catch { toast.error('Failed to submit'); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold dark:text-white mb-4 flex items-center gap-2">
        <Printer size={20} /> Admin Quick Print
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Upload and print directly — no payment required. Jobs are queued immediately.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label className="block text-sm font-medium dark:text-gray-200 mb-1">PDF File</label>
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 dark:file:bg-primary-900 file:text-primary-700 dark:file:text-primary-300 hover:file:bg-primary-100"
          />
          {file && <p className="mt-1 text-xs text-gray-400">{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium dark:text-gray-200 mb-1">Paper Size</label>
            <select value={paperSize} onChange={(e) => setPaperSize(e.target.value)} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white">
              <option value="A4">A4</option>
              <option value="A3">A3</option>
              <option value="Letter">Letter</option>
              <option value="Legal">Legal</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium dark:text-gray-200 mb-1">Copies</label>
            <input type="number" min={1} max={100} value={copies} onChange={(e) => setCopies(parseInt(e.target.value) || 1)} className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white" />
          </div>
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm dark:text-gray-200">
            <input type="checkbox" checked={duplex} onChange={(e) => setDuplex(e.target.checked)} className="rounded" />
            Duplex (2-sided)
          </label>
          <label className="flex items-center gap-2 text-sm dark:text-gray-200">
            <input type="checkbox" checked={color === 'color'} onChange={(e) => setColor(e.target.checked ? 'color' : 'grayscale')} className="rounded" />
            Color
          </label>
        </div>

        <button
          type="submit"
          disabled={loading || !file}
          className="flex items-center gap-2 bg-primary-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
          {loading ? 'Submitting...' : 'Print Now'}
        </button>
      </form>

      {result && (
        <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm">
          <p className="font-medium text-green-800 dark:text-green-300">✓ {result.message}</p>
          <p className="text-green-600 dark:text-green-400 mt-1">Job ID: <span className="font-mono">{result.jobId}</span></p>
        </div>
      )}
    </div>
  );
}
