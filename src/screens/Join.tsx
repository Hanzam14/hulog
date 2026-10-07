import { t } from "../i18n";
import { useParams } from "react-router-dom";
import { rpc } from "../data";
import type { Run } from "../components/shared";

export default function Join({ run, busy }: { run: Run; busy: boolean }) {
  const { token } = useParams();
  return (
    <section>
      <h1>{t("You’re invited.")}</h1>
      <p>
        {t("Request to join this paluwagan. The holder approves your request.")}
      </p>
      <button
        disabled={busy}
        onClick={() => run(() => rpc("claim_invite", { p_token: token }))}
      >
        {t("Join this group")}
      </button>
    </section>
  );
}
