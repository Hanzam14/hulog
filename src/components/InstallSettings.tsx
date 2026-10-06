import { useState, useSyncExternalStore } from "react";
import {
  clearInstallPrompt,
  installSnapshot,
  isIosSafariOutsideHomeScreen,
  subscribeInstall,
} from "../install";

export default function InstallSettings() {
  const { prompt, standalone } = useSyncExternalStore(
    subscribeInstall,
    installSnapshot,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (standalone) return null;
  if (isIosSafariOutsideHomeScreen())
    return <p className="install-hint">Share → Add to Home Screen</p>;
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
          I-install ang Hulog
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
