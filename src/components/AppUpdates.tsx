import { t } from "../i18n";
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
      <p className="muted app-version">
        {t("Version")} {__APP_VERSION__}
      </p>
      <button
        className={state.needRefresh ? "" : "secondary"}
        disabled={state.checking || state.applying}
        onClick={() =>
          void (state.needRefresh ? applyUpdate() : checkForUpdate())
        }
      >
        {state.applying
          ? t("Ina-update…")
          : state.checking
            ? t("Tinitingnan…")
            : state.needRefresh
              ? t("I-update ngayon")
              : t("Tingnan kung may update")}
      </button>
      {state.message && (
        <p role="status" className="update-result">
          {t(state.message)}
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
      <span>{t("May bagong version ng Hulog.")}</span>
      <button disabled={state.applying} onClick={() => void applyUpdate()}>
        {state.applying ? t("Ina-update…") : t("I-update")}
      </button>
      <button
        className="quiet round"
        aria-label={t("Isara ang update notice")}
        onClick={dismissUpdate}
      >
        <IconX size={18} />
      </button>
      {state.message && <span>{t(state.message)}</span>}
    </div>
  );
}
