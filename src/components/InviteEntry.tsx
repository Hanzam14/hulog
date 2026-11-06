import { Link, useLocation } from "react-router-dom";
import { t } from "../i18n";
import { isSoloMode } from "../solo";

export function WelcomeActions({
  busy,
  onSignIn,
  onSolo,
}: {
  busy: boolean;
  onSignIn: () => void;
  onSolo: () => void;
}) {
  const invite = useLocation().pathname.startsWith("/join/");
  return (
    <>
      <button disabled={busy} onClick={onSignIn}>
        {t("Continue with Google")}
      </button>
      {invite ? (
        <p>{t("Your invite will be here after sign-in.")}</p>
      ) : (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={onSolo}
        >
          {t("Go solo on this device")}
        </button>
      )}
    </>
  );
}

export function ActiveInvite({
  busy,
  onExitSolo,
}: {
  busy: boolean;
  onExitSolo: () => void;
}) {
  return isSoloMode() ? (
    <>
      <p>
        {t(
          "You're in solo mode on this device. To use this invite, leave solo and sign in.",
        )}
      </p>
      <button disabled={busy} onClick={onExitSolo}>
        {t("Exit solo mode")}
      </button>
    </>
  ) : (
    <p>
      {t("You already have a group.")} <Link to="/">{t("Go home")}</Link>
    </p>
  );
}
