import { useLang } from '../i18n/LanguageContext';
import { LANG_LABELS } from '../i18n/translations';

export default function LanguageSwitch() {
  const { lang, setLang, t } = useLang();
  const label = lang === 'uk' ? t('lang.toEnglish') : t('lang.toUkrainian');
  return (
    <button
      type="button"
      className="language-switch"
      aria-label={label}
      title={label}
      aria-pressed={lang === 'en'}
      onClick={() => setLang(lang === 'uk' ? 'en' : 'uk')}
    >
      <span className="language-option">{LANG_LABELS.uk}</span>
      <span className="language-option">{LANG_LABELS.en}</span>
      <span className={'language-indicator ' + lang} aria-hidden="true" />
    </button>
  );
}
