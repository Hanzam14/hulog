export interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
export function isIosSafariOutsideHomeScreen() {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return (
    ios &&
    !isStandalone() &&
    /Safari/.test(navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent)
  );
}
let state: { prompt: InstallPrompt | null; standalone: boolean } = {
  prompt: null,
  standalone: false,
};
const listeners = new Set<() => void>();
export const installSnapshot = () => state;
export const subscribeInstall = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function update(prompt: InstallPrompt | null, standalone = isStandalone()) {
  state = { prompt: standalone ? null : prompt, standalone };
  listeners.forEach((listener) => listener());
}
export function clearInstallPrompt() {
  update(null);
}
/** Capture before Settings opens; browsers often fire this only once per visit. */
export function initializeInstall() {
  update(null);
  window.addEventListener("beforeinstallprompt", (event) => {
    if (!/Android/.test(navigator.userAgent) || isStandalone()) return;
    event.preventDefault();
    update(event as InstallPrompt);
  });
  window.addEventListener("appinstalled", () => update(null, true));
  window
    .matchMedia("(display-mode: standalone)")
    .addEventListener("change", () => update(state.prompt));
}
