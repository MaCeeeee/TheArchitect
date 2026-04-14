import { useCallback, useEffect, useState } from 'react';
import { TEXT } from '../components/landing/landing.text';

export type Lang = 'de' | 'en';

const STORAGE_KEY = 'thearchitect-lang';

function detectInitialLang(): Lang {
  if (typeof window === 'undefined') return 'en';

  const params = new URLSearchParams(window.location.search);
  const urlLang = params.get('lang');
  if (urlLang === 'de' || urlLang === 'en') return urlLang;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'de' || stored === 'en') return stored;

  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function useLang() {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    const url = new URL(window.location.href);
    url.searchParams.set('lang', next);
    window.history.replaceState({}, '', url.toString());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback((key: string): string => {
    const entry = TEXT[key];
    if (!entry) return key;
    return entry[lang] ?? entry.en ?? key;
  }, [lang]);

  return { lang, setLang, t };
}
