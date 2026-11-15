import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANGS, translations } from './translations';

const LanguageContext = createContext(null);
const STORAGE_KEY = 'lang';

function initialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return 'uk';
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);

  const setLang = useCallback(next => {
    if (!LANGS.includes(next)) return;
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = translations[lang].title;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = translations[lang]['meta.description'];
  }, [lang]);

  const value = useMemo(() => {
    const t = (key, vars) => {
      let s = translations[lang][key] ?? key;
      if (vars) Object.entries(vars).forEach(([k, v]) => (s = s.replace(`{${k}}`, v)));
      return s;
    };
    const tr = value => {
      if (lang === 'uk' || typeof value !== 'string') return value;
      const textureProgress = value.match(/^Текстури (\d+) \/ (\d+)$/);
      if (textureProgress) return `Textures ${textureProgress[1]} / ${textureProgress[2]}`;
      return translations.en[value] ?? value;
    };
    return { lang, setLang, t, tr };
  }, [lang, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  return useContext(LanguageContext);
}
