import { useState, useEffect, useCallback } from 'react';
import { useAdmin } from '../../hooks/useAdmin';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import {
  ArrowLeft,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Megaphone,
} from 'lucide-react';

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
    } catch {}
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
    const data = await api.adminCreateAnnouncement(form.message, form.type, token!);
    setSubmitting(false);
    if (data.error) {
      setFormError(data.error);
      return;
    }
    setShowForm(false);
    setForm({ message: '', type: 'info' });
    fetchAnnouncements();
  };

  const handleToggle = async (id: number, currentActive: boolean) => {
    await api.adminUpdateAnnouncement(id, { active: !currentActive }, token!);
    fetchAnnouncements();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this announcement?')) return;
    await api.adminDeleteAnnouncement(id, token!);
    fetchAnnouncements();
  };

  const typeColors: Record<string, string> = {
    info: 'bg-blue-100 text-blue-700',
    warning: 'bg-amber-100 text-amber-700',
    critical: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/admin')} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Megaphone size={22} className="text-primary-600" />
            Announcements
          </h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
        >
          <Plus size={14} /> New Announcement
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-lg border p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full px-2.5 py-1.5 border rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              rows={3}
              placeholder="Maintenance scheduled for tonight 10 PM..."
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full px-2.5 py-1.5 border rounded text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          {formError && <p className="text-xs text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 bg-primary-600 text-white rounded text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create'}
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
        <div className="flex justify-center py-8">
          <Loader2 size={24} className="animate-spin text-primary-500" />
        </div>
      ) : announcements.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No announcements yet</p>
      ) : (
        <div className="space-y-2">
          {announcements.map((a: any) => (
            <div key={a.id} className="bg-white rounded-lg border p-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColors[a.type] || typeColors.info}`}>
                    {a.type}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    a.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {a.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-sm text-gray-800">{a.message}</p>
                <p className="text-xs text-gray-400 mt-1">Created: {a.created_at}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => handleToggle(a.id, !!a.active)}
                  className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-50 rounded"
                  title={a.active ? 'Deactivate' : 'Activate'}
                >
                  {a.active ? <ToggleRight size={18} className="text-green-600" /> : <ToggleLeft size={18} />}
                </button>
                <button
                  onClick={() => handleDelete(a.id)}
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
