import { useState, useEffect } from 'react';
import type { Language } from '../lib/portalI18n';

const LANG_KEY = 'portal-language';
const LANG_CHANGE_EVENT = 'portal-language-change';

export function usePortalLanguage() {
  const [lang, setLangState] = useState<Language>('en');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY) as Language | null;
      if (saved === 'en' || saved === 'bm') {
        setLangState(saved);
      }
    } catch {
    }

    const handler = (e: CustomEvent<Language>) => {
      setLangState(e.detail);
    };
    window.addEventListener(LANG_CHANGE_EVENT, handler as EventListener);
    return () => window.removeEventListener(LANG_CHANGE_EVENT, handler as EventListener);
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    try {
      localStorage.setItem(LANG_KEY, newLang);
    } catch {
    }
    window.dispatchEvent(
      new CustomEvent<Language>(LANG_CHANGE_EVENT, { detail: newLang })
    );
  };

  return { lang, setLang };
}
