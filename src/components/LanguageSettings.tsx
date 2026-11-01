import { setLang, t, useLanguage } from "../i18n";

export default function LanguageSettings() {
  const language = useLanguage();
  return (
    <div className="appearance">
      <h3>{t("Language")}</h3>
      <div className="segmented" role="group" aria-label={t("Language")}>
        {(["en", "tl", "taglish"] as const).map((value, index) => (
          <button
            type="button"
            key={value}
            aria-pressed={language === value}
            onClick={() => setLang(value)}
          >
            {t((["English", "Tagalog", "Taglish"] as const)[index])}
          </button>
        ))}
      </div>
    </div>
  );
}
