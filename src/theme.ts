export type Theme = "system" | "light" | "dark";
export function readTheme(): Theme {
  try {
    const value = localStorage.getItem("hulog-theme");
    if (value === "light" || value === "dark") return value;
  } catch {
    /* Device storage can be disabled. */
  }
  return "system";
}
export function applyTheme(preference = readTheme()) {
  const dark =
    preference === "dark" ||
    (preference === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#17130f" : "#fff6d8");
}
export function setTheme(theme: Theme) {
  try {
    localStorage.setItem("hulog-theme", theme);
  } catch {
    /* Still apply this session. */
  }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent("hulog-theme", { detail: theme }));
}
export function initializeTheme() {
  let preference = readTheme();
  applyTheme(preference);
  window.addEventListener("hulog-theme", (event) => {
    preference = (event as CustomEvent<Theme>).detail;
  });
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => applyTheme(preference));
  window.addEventListener("storage", (event) => {
    if (event.key === "hulog-theme" || event.key === null) {
      preference = readTheme();
      applyTheme(preference);
      window.dispatchEvent(
        new CustomEvent("hulog-theme", { detail: preference }),
      );
    }
  });
}
