import { useSyncExternalStore } from "react";
import { IconX } from "@tabler/icons-react";
import {
  applyUpdate,
  checkForUpdate,
  dismissUpdate,
  subscribeUpdate,
  updateSnapshot,
} from "../update";

export default function AppUpdates() {
  const state = useSyncExternalStore(subscribeUpdate, updateSnapshot);
  return (
    <section className="app-updates">
      <h2>App</h2>
      <p className="muted app-version">Version {__APP_VERSION__}</p>
      <button
        className={state.needRefresh ? "" : "secondary"}
        disabled={state.checking || state.applying}
        onClick={() =>
          void (state.needRefresh ? applyUpdate() : checkForUpdate())
        }
      >
        {state.applying
          ? "Ina-update…"
          : state.checking
            ? "Tinitingnan…"
            : state.needRefresh
              ? "I-update ngayon"
              : "Tingnan kung may update"}
      </button>
      {state.message && (
        <p role="status" className="update-result">
          {state.message}
        </p>
      )}
    </section>
  );
}

export function UpdateBanner() {
  const state = useSyncExternalStore(subscribeUpdate, updateSnapshot);
  if (!state.needRefresh || state.dismissed) return null;
  return (
    <div className="notice update-banner" role="status">
      <span>May bagong version ng Hulog.</span>
      <button disabled={state.applying} onClick={() => void applyUpdate()}>
        {state.applying ? "Ina-update…" : "I-update"}
      </button>
      <button
        className="quiet round"
        aria-label="Isara ang update notice"
        onClick={dismissUpdate}
      >
        <IconX size={18} />
      </button>
      {state.message && <span>{state.message}</span>}
    </div>
  );
}
