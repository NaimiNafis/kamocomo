import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'ja', label: 'JA' },
] as const;

/** §5.3 top-bar EN/JA toggle. Labels are language names, so they're not translated. */
export function LanguageToggle() {
  const { i18n } = useTranslation();
  const current = i18n.language.startsWith('ja') ? 'ja' : 'en';

  return (
    <div className="flex overflow-hidden rounded-full border border-kamo-ink/15 bg-kamo-stone/90 font-ui text-xs font-medium shadow-sm backdrop-blur">
      {LANGUAGES.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => void i18n.changeLanguage(code)}
          className={`px-3 py-1.5 transition-colors ${
            current === code ? 'bg-kamo-indigo text-kamo-stone' : 'text-kamo-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
