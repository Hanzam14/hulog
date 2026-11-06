import { useNavigate } from "react-router-dom";
import { t } from "../i18n";
import type { Run } from "../components/shared";
import { setSoloMode } from "../solo";

export default function Waiting({
  status,
  run,
  busy,
  user,
  onSignOut,
}: {
  status: string;
  run: Run;
  busy: boolean;
  user: string;
  onSignOut: () => void;
}) {
  const navigate = useNavigate();
  const pending = status === "pending";
  return (
    <>
      <h1>
        {pending
          ? t("Konting hintay.")
          : status === "denied"
            ? t("Request denied")
            : t("You're no longer in this group")}
      </h1>
      {pending ? (
        <>
          <ol>
            <li>{t("Request sent ✓")}</li>
            <li>{t("Your partner approves you")}</li>
            <li>{t("Then you're in!")}</li>
          </ol>
          <p className="meta">{t("This screen updates automatically.")}</p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => run(async () => {}, { showSuccess: false })}
          >
            {t("Refresh status")}
          </button>
        </>
      ) : (
        <>
          {status === "denied" && (
            <p>
              {t("The owner did not approve your request. Ask them directly.")}
            </p>
          )}
          <p>
            {t(
              "Want to join another group? Ask the owner to remove your membership first.",
            )}
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              setSoloMode(true, user);
              void run(async () => {});
              navigate("/");
            }}
          >
            {t("Go solo on this device")}
          </button>
          <p className="meta">{t("Solo data stays on this device.")}</p>
          <button className="quiet" disabled={busy} onClick={onSignOut}>
            {t("Sign out")}
          </button>
        </>
      )}
    </>
  );
}
