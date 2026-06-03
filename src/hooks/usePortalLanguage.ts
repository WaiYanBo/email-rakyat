import { useState, useEffect } from 'react';
import type { Language } from '../lib/portalI18n';

const LANG_KEY = 'portal-language';
const LANG_CHANGE_EVENT = 'portal-language-change';

/**
 * usePortalLanguage
 *
 * A lightweight hook that reads/writes the portal language preference from
 * localStorage and syncs changes across all independently-mounted React
 * components via a custom DOM event.
 *
 * Default language: 'en' (English)
 */
export function usePortalLanguage() {
  const [lang, setLangState] = useState<Language>('en');

  useEffect(() => {
    // Load saved preference on mount
    try {
      const saved = localStorage.getItem(LANG_KEY) as Language | null;
      if (saved === 'en' || saved === 'bm') {
        setLangState(saved);
      }
    } catch {
      // localStorage unavailable — stick to default
    }

    // Listen for language changes dispatched by other components
    const handler = (e: CustomEvent<Language>) => {
      setLangState(e.detail);
    };
    window.addEventListener(LANG_CHANGE_EVENT, handler as EventListener);
    return () => window.removeEventListener(LANG_CHANGE_EVENT, handler as EventListener);
  }, []);

  /**
   * Set the language, persist it, and broadcast to all other portal components.
   */
  const setLang = (newLang: Language) => {
    setLangState(newLang);
    try {
      localStorage.setItem(LANG_KEY, newLang);
    } catch {
      // Ignore if storage is unavailable
    }
    window.dispatchEvent(
      new CustomEvent<Language>(LANG_CHANGE_EVENT, { detail: newLang })
    );
  };

  return { lang, setLang };
}
