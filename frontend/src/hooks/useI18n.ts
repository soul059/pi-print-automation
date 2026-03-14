import { useState, useCallback } from 'react';
import { Locale, getTranslation } from '../i18n';

export function useI18n() {
  const [locale, setLocale] = useState<Locale>(() => {
    return (localStorage.getItem('locale') as Locale) || 'en';
  });

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    return getTranslation(locale, key, params);
  }, [locale]);

  const changeLocale = useCallback((newLocale: Locale) => {
    setLocale(newLocale);
    localStorage.setItem('locale', newLocale);
  }, []);

  return { locale, t, changeLocale };
}
