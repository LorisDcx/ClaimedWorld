'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Globe2 } from 'lucide-react';
import { LOCALE_COOKIE, type Locale, isLocale } from './locales';
import { translate } from './translate';

interface LanguageContextValue {
  locale: Locale;
  changeLanguage: (locale: Locale) => void;
}
const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = 'claimed-language';

export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    try { window.localStorage.setItem(STORAGE_KEY, locale); } catch { /* optional */ }
  }, [locale]);

  const changeLanguage = useCallback((next: Locale) => setLocale(next), []);
  return (
    <LanguageContext.Provider value={{ locale, changeLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLocale(): Locale {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('Missing LocaleProvider');
  return context.locale;
}

export function useT() {
  const locale = useLocale();
  return useCallback((source: string | number | null | undefined, values?: readonly unknown[]) => translate(locale, source, values), [locale]);
}

const labels: Record<Locale, string> = { fr: 'Français', en: 'English', es: 'Español' };

export function LanguageSwitcher() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('Missing LocaleProvider');
  const { locale, changeLanguage } = context;
  return (
    <label className="language-switcher" title={translate(locale, 'Langue du site')}>
      <Globe2 size={16} aria-hidden="true" />
      <select
        aria-label={translate(locale, 'Langue du site')}
        value={locale}
        onChange={(event) => {
          const next = event.target.value;
          if (isLocale(next)) changeLanguage(next);
        }}
      >
        {(['fr', 'en', 'es'] as const).map((value) => (
          <option key={value} value={value}>{value.toUpperCase()} · {labels[value]}</option>
        ))}
      </select>
    </label>
  );
}
