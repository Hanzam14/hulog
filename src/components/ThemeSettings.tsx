import { t } from "../i18n";
import { useEffect, useState } from "react";
import { readTheme, setTheme } from "../theme";
import type { Theme } from "../theme";

export default function ThemeSettings() {
  const [theme, update] = useState(readTheme);
  useEffect(() => {
    const changed = (event: Event) =>
      update((event as CustomEvent<Theme>).detail);
    window.addEventListener("hulog-theme", changed);
    return () => window.removeEventListener("hulog-theme", changed);
  }, []);
  return (
    <section className="appearance">
      <h2>{t("Itsura")}</h2>
      <div className="segmented" role="group" aria-label={t("Itsura")}>
        {(["system", "light", "dark"] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={theme === value}
            onClick={() => setTheme(value)}
          >
            {value === "system"
              ? t("Auto")
              : value === "light"
                ? t("Light")
                : t("Dark")}
          </button>
        ))}
      </div>
    </section>
  );
}
