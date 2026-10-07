import type { Key } from "./i18n";
import { registerSW } from "virtual:pwa-register";

export interface UpdateState {
  needRefresh: boolean;
  checking: boolean;
  applying: boolean;
  dismissed: boolean;
  message: Key | "";
}
let state: UpdateState = {
  needRefresh: false,
  checking: false,
  applying: false,
  dismissed: false,
  message: "",
};
const listeners = new Set<() => void>();
export const updateSnapshot = () => state;
export const subscribeUpdate = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}
export const dismissUpdate = () => set({ dismissed: true });
let registration: ServiceWorkerRegistration | undefined;
let registrationError: unknown;
let registrationReady: Promise<void>;
let updateSW: (reload?: boolean) => Promise<void>;
let lastCheck = 0;
let initialized = false;
let reloading = false;
let messageTimer: ReturnType<typeof setTimeout> | undefined;
function clearMessage() {
  clearTimeout(messageTimer);
  messageTimer = undefined;
  set({ message: "" });
}
function showMessage(message: Key) {
  clearMessage();
  set({ message });
  messageTimer = setTimeout(() => set({ message: "" }), 4000);
}
function reloadOnce() {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

export function initializeUpdates() {
  if (initialized) return;
  initialized = true;
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;
  // Workbox's isUpdate is captured at registration. A first-visit tab may
  // receive an update later in the same visit; reload on its explicit apply too.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (state.applying) reloadOnce();
  });
  registrationReady = new Promise<void>((resolve) => {
    updateSW = registerSW({
      immediate: true,
      onNeedReload: reloadOnce,
      onNeedRefresh: () =>
        set({ needRefresh: true, dismissed: false, message: "" }),
      onRegisteredSW: (_url, value) => {
        registration = value;
        resolve();
      },
      onRegisterError: (error) => {
        registrationError = error;
        resolve();
      },
    });
  });
  void checkForUpdate(true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkForUpdate(true);
  });
}

/** Wait for installation to finish before reporting that the app is current. */
async function finishInstalling(worker: ServiceWorker) {
  if (worker.state === "redundant")
    throw new Error("Update installation failed");
  if (["installed", "activated"].includes(worker.state)) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Update timed out"));
    }, 30000);
    const cleanup = () => {
      clearTimeout(timeout);
      worker.removeEventListener("statechange", changed);
    };
    const changed = () => {
      if (worker.state === "redundant") {
        cleanup();
        reject(new Error("Update installation failed"));
      } else if (["installed", "activated"].includes(worker.state)) {
        cleanup();
        resolve();
      }
    };
    worker.addEventListener("statechange", changed);
    changed();
  });
}

export async function checkForUpdate(automatic = false) {
  if (
    state.checking ||
    state.applying ||
    (automatic && Date.now() - lastCheck < 30 * 60 * 1000)
  )
    return;
  clearMessage();
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) {
    if (!automatic)
      showMessage("Updates ay para sa installed o built app lang.");
    return;
  }
  set({ checking: true, message: "" });
  lastCheck = Date.now();
  try {
    await registrationReady;
    if (registrationError || !registration)
      throw registrationError ?? new Error("No service worker");
    await registration.update();
    if (registration.installing)
      await finishInstalling(registration.installing);
    if (registration.waiting) set({ needRefresh: true });
    if (!automatic && !state.needRefresh) showMessage("Updated ka na ✓");
  } catch {
    if (!automatic)
      showMessage("Hindi ma-check ang update. Subukan ulit kapag online.");
  } finally {
    set({ checking: false });
  }
}

export async function applyUpdate() {
  if (!state.needRefresh || state.applying) return;
  clearMessage();
  set({ applying: true, message: "" });
  try {
    await updateSW(true);
  } catch {
    set({ applying: false });
    showMessage("Hindi ma-update. Subukan ulit.");
  }
}
