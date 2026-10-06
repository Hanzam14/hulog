import type { Cycle } from "../data";
import { rpc } from "../data";
import { closed, type Run } from "./shared";

export default function Payout({
  c,
  user,
  run,
  busy,
}: {
  c: Cycle;
  user: string;
  run: Run;
  busy: boolean;
}) {
  if (!closed(c)) return null;
  return (
    <section>
      <span className="eyebrow">Payout</span>
      <h2>{c.payout_state}</h2>
      {c.payout_state !== "Received" && c.receiver_id === user && (
        <button
          disabled={busy}
          onClick={() => run(() => rpc("receive_payout", { p_id: c.id }))}
        >
          Got it
        </button>
      )}
    </section>
  );
}
