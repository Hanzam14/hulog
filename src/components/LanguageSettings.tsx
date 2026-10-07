import { setLang, t, useLanguage } from "../i18n";

export default function LanguageSettings() {
  const language = useLanguage();
  return (
    <section className="appearance">
      <h2>{t("Language")}</h2>
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
    </section>
  );
}
