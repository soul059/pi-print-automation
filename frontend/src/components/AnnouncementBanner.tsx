import { useState, useEffect } from 'react';
import { X, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

const DISMISSED_KEY = 'announcement_dismissed_id';

export default function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<{ id: number; message: string; type: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api.getActiveAnnouncement().then((data) => {
      if (data.announcement) {
        const dismissedId = sessionStorage.getItem(DISMISSED_KEY);
        if (dismissedId === String(data.announcement.id)) {
          setDismissed(true);
        }
        setAnnouncement(data.announcement);
      }
    }).catch(() => {});
  }, []);

  if (!announcement || dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, String(announcement.id));
    setDismissed(true);
  };

  const styles: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    info: {
      bg: 'bg-blue-50 border-blue-200',
      text: 'text-blue-800',
      icon: <Info size={18} className="text-blue-500 shrink-0" />,
    },
    warning: {
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-800',
      icon: <AlertTriangle size={18} className="text-amber-500 shrink-0" />,
    },
    critical: {
      bg: 'bg-red-50 border-red-200',
      text: 'text-red-800',
      icon: <AlertCircle size={18} className="text-red-500 shrink-0" />,
    },
  };

  const style = styles[announcement.type] || styles.info;

  return (
    <div className={`border rounded-lg px-4 py-3 flex items-start gap-3 ${style.bg}`}>
      {style.icon}
      <p className={`flex-1 text-sm ${style.text}`}>{announcement.message}</p>
      <button
        onClick={handleDismiss}
        className={`shrink-0 ${style.text} hover:opacity-70`}
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
