import { createContext, useContext, useCallback, useState, type ReactNode } from 'react';

/**
 * Zweisprachigkeit, minimal gehalten.
 *
 * Zwei getrennte Sprachen, weil sie zwei getrennte Zielgruppen bedienen:
 *  - Die VERWALTUNG wählt ihre Sprache selbst (`bitely.lang` im localStorage,
 *    wie das Hell/Dunkel der Verwaltung). Betrifft nur das eigene Gerät.
 *  - Die GASTANSICHT bekommt ihre Sprache vom Betrieb vorgegeben
 *    (`brand.guestLang`, in den Design-Einstellungen). Der Gast am Tisch
 *    stellt nichts um.
 *
 * Kein Schlüssel-System: bei zwei Sprachen steht die Übersetzung direkt am
 * Aufrufort — `t('Speichern', 'Save')`. Das deutsche Wort bleibt lesbar im
 * Code, und es gibt keine verwaisten Schlüssel.
 */
export type Lang = 'de' | 'en';

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
];

/** Übersetzung ohne Kontext — für die Gastansicht, die `brand.guestLang` nimmt. */
export const pick = (lang: Lang, de: string, en: string): string => (lang === 'en' ? en : de);

const LANG_KEY = 'bitely.lang';

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LangContext = createContext<LangCtx>({ lang: 'de', setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'de'; } catch { return 'de'; }
  });
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* Privatmodus */ }
  }, []);
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export const useLang = (): LangCtx => useContext(LangContext);

/** In der Verwaltung: `const t = useT(); t('Speichern', 'Save')`. */
export function useT() {
  const { lang } = useLang();
  return useCallback((de: string, en: string) => pick(lang, de, en), [lang]);
}
