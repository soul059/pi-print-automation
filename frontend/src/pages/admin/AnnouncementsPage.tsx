import { useState, useEffect, useCallback } from 'react';
import { useAdmin } from '../../hooks/useAdmin';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Megaphone,
  AlertTriangle,
} from 'lucide-react';

function formatTime(raw: string | undefined): string {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return raw;
  }
}

export default function AnnouncementsPage() {
  const { token } = useAdmin();
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ message: '', type: 'info' });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminGetAnnouncements(token!);
      setAnnouncements(data.announcements || []);
    } catch {
      toast.error('Failed to load announcements');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.message.trim()) {
      setFormError('Message is required');
      return;
    }
    setSubmitting(true);
    try {
      const data = await api.adminCreateAnnouncement(form.message, form.type, token!);
      if (data.error) {
        setFormError(data.error);
        return;
      }
      toast.success('Announcement created');
      setShowForm(false);
      setForm({ message: '', type: 'info' });
      fetchAnnouncements();
    } catch {
      toast.error('Failed to create announcement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id: number, currentActive: boolean) => {
    try {
      await api.adminUpdateAnnouncement(id, { active: !currentActive }, token!);
      toast.success(`Announcement ${currentActive ? 'deactivated' : 'activated'}`);
      fetchAnnouncements();
    } catch {
      toast.error('Failed to update announcement');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      await api.adminDeleteAnnouncement(id, token!);
      toast.success('Announcement deleted');
      fetchAnnouncements();
    } catch {
      toast.error('Failed to delete announcement');
    }
  };

  const typeColors: Record<string, string> = {
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    critical: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/admin')}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold flex items-center gap-2 dark:text-white">
            <Megaphone size={22} className="text-primary-600" />
            Announcements
          </h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition"
        >
          <Plus size={14} /> New
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Message</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none resize-y"
              rows={3}
              placeholder="Maintenance scheduled for tonight 10 PM..."
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Type</label>
            <div className="flex gap-2">
              {(['info', 'warning', 'critical'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, type: t })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition capitalize ${
                    form.type === t
                      ? typeColors[t]
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {formError && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 px-2 py-1.5 rounded flex items-center gap-1.5">
              <AlertTriangle size={12} /> {formError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition flex items-center gap-1.5"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? 'Creating...' : 'Create'}
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
        <div className="flex justify-center py-12">
          <Loader2 size={28} className="animate-spin text-primary-500" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-12">
          <Megaphone size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-400 dark:text-gray-500">No announcements yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Create one to notify users about important updates</p>
        </div>
      ) : (
        <div className="space-y-2">
          {announcements.map((a: any) => (
            <div key={a.id} className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 flex items-start justify-between gap-3 transition hover:border-gray-300 dark:hover:border-gray-600">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColors[a.type] || typeColors.info}`}>
                    {a.type}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    a.active
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {a.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-sm text-gray-800 dark:text-gray-200">{a.message}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{formatTime(a.created_at)}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => handleToggle(a.id, !!a.active)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  title={a.active ? 'Deactivate' : 'Activate'}
                >
                  {a.active ? <ToggleRight size={20} className="text-green-600 dark:text-green-400" /> : <ToggleLeft size={20} className="text-gray-400" />}
                </button>
                <button
                  onClick={() => handleDelete(a.id)}
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
