import { useParams } from "react-router-dom";
import { rpc } from "../data";
import type { Run } from "../components/shared";

export default function Join({ run, busy }: { run: Run; busy: boolean }) {
  const { token } = useParams();
  return (
    <section>
      <h1>You’re invited.</h1>
      <p>Request to join this paluwagan. The holder approves your request.</p>
      <button
        disabled={busy}
        onClick={() => run(() => rpc("claim_invite", { p_token: token }))}
      >
        Join this group
      </button>
    </section>
  );
}
