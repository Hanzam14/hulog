import type { Cycle } from "../data";
import { rpc } from "../data";
import type { Run } from "./shared";

export default function Proposal({
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
  return (
    <div className="actions">
      {c.proposed_by === user ? (
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            run(() => rpc("respond_cycle", { p_id: c.id, p_action: "cancel" }))
          }
        >
          Cancel proposal
        </button>
      ) : (
        <>
          <button
            disabled={busy}
            onClick={() =>
              run(() =>
                rpc("respond_cycle", { p_id: c.id, p_action: "accept" }),
              )
            }
          >
            Accept terms
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              run(() =>
                rpc("respond_cycle", { p_id: c.id, p_action: "decline" }),
              )
            }
          >
            Decline
          </button>
        </>
      )}
    </div>
  );
}
