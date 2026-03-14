import { createContext, useContext } from 'react';
import { useI18n } from '../hooks/useI18n';

const I18nContext = createContext<ReturnType<typeof useI18n> | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const i18n = useI18n();
  return <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used within I18nProvider');
  return ctx;
}
