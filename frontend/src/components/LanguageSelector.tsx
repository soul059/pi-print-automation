import { Globe } from 'lucide-react';
import { useTranslation } from '../i18n/I18nContext';
import { LOCALES } from '../i18n';

export default function LanguageSelector() {
  const { locale, changeLocale } = useTranslation();

  return (
    <div className="relative inline-flex items-center">
      <Globe size={16} className="absolute left-2 text-gray-400 pointer-events-none" />
      <select
        value={locale}
        onChange={(e) => changeLocale(e.target.value as typeof locale)}
        className="pl-7 pr-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary-500 outline-none appearance-none cursor-pointer"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    </div>
  );
}
