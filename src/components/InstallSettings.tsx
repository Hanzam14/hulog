import { t, label } from "../i18n";
import { useState, useSyncExternalStore } from "react";
import { IconShare2, IconX } from "@tabler/icons-react";
import {
  clearInstallPrompt,
  installSnapshot,
  isIosOutsideHomeScreen,
  subscribeInstall,
} from "../install";

const DISMISSED = "hulog-install-dismissed";
function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED) === "1";
  } catch {
    return false;
  }
}

/** First-screen install card; iPhones get steps since iOS has no install prompt. */
export function InstallBanner() {
  const { prompt, standalone } = useSyncExternalStore(
    subscribeInstall,
    installSnapshot,
    installSnapshot,
  );
  const [dismissed, setDismissed] = useState(readDismissed);
  const ios = isIosOutsideHomeScreen();
  if (standalone || dismissed || (!ios && !prompt)) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Hiding for this visit is enough when storage is blocked.
    }
    setDismissed(true);
  };
  return (
    <div className="notice install-banner" role="status">
      <strong>{t("I-download ang Hulog")}</strong>
      <button
        className="quiet round"
        aria-label={t("Dismiss")}
        onClick={dismiss}
      >
        <IconX size={18} />
      </button>
      {ios ? (
        <ol>
          <li>
            <IconShare2 size={18} aria-hidden="true" />{" "}
            {t("I-tap ang Share (kung wala, i-tap muna ang ⋯).")}
          </li>
          <li>{t("Piliin ang “Add to Home Screen.”")}</li>
          <li>{t("I-tap ang Add. Buksan ang Hulog mula sa bagong icon.")}</li>
        </ol>
      ) : (
        <button
          onClick={async () => {
            try {
              await prompt!.prompt();
              await prompt!.userChoice;
            } finally {
              clearInstallPrompt();
            }
          }}
        >
          {t("I-install ang Hulog")}
        </button>
      )}
    </div>
  );
}

export default function InstallSettings() {
  const { prompt, standalone } = useSyncExternalStore(
    subscribeInstall,
    installSnapshot,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (standalone) return null;
  if (isIosOutsideHomeScreen())
    return <p className="install-hint">{t("Share → Add to Home Screen")}</p>;
  if (!prompt && !message) return null;
  return (
    <div className="install-hint">
      {prompt && (
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await prompt.prompt();
              await prompt.userChoice;
            } catch {
              setMessage(
                "Hindi ma-install ngayon. Subukan ulit sa browser menu.",
              );
            } finally {
              clearInstallPrompt();
              setBusy(false);
            }
          }}
        >
          {t("I-install ang Hulog")}
        </button>
      )}
      {message && <p role="status">{label(message)}</p>}
    </div>
  );
}
