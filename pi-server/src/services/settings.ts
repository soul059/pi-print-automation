import { getDb } from '../db/connection';

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  ).run(key, value);
}

export interface OperatingHours {
  enabled: boolean;
  startHour: number; // 0-23
  endHour: number;   // 0-23
  days: number[];    // 0=Sun, 1=Mon, ..., 6=Sat
}

export function getOperatingHours(): OperatingHours {
  const raw = getSetting('operating_hours');
  if (!raw) return { enabled: false, startHour: 8, endHour: 20, days: [1, 2, 3, 4, 5, 6] };
  try { return JSON.parse(raw); } catch { return { enabled: false, startHour: 8, endHour: 20, days: [1, 2, 3, 4, 5, 6] }; }
}

export function setOperatingHours(hours: OperatingHours): void {
  setSetting('operating_hours', JSON.stringify(hours));
}

export function isWithinOperatingHours(): { allowed: boolean; message?: string } {
  const config = getOperatingHours();
  if (!config.enabled) return { allowed: true };

  const now = new Date();
  const currentDay = now.getDay(); // 0=Sun
  const currentHour = now.getHours();

  if (!config.days.includes(currentDay)) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const openDays = config.days.map(d => dayNames[d]).join(', ');
    return { allowed: false, message: `Service is closed today. Open days: ${openDays}` };
  }

  if (currentHour < config.startHour || currentHour >= config.endHour) {
    const fmt = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
    return { allowed: false, message: `Service hours: ${fmt(config.startHour)} – ${fmt(config.endHour)}` };
  }

  return { allowed: true };
}
