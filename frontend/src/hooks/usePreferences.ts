interface PrintPreferences {
  paperSize: string;
  copies: number;
  duplex: boolean;
  color: 'grayscale' | 'color';
  printMode: 'now' | 'later';
}

const STORAGE_KEY = 'print-preferences';

export function usePreferences() {
  const load = (): Partial<PrintPreferences> => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  };

  const save = (prefs: PrintPreferences) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  };

  return { load, save };
}
