import { IconCheck, IconX } from "@tabler/icons-react";
import type { Cycle } from "../data";
import { rpc } from "../data";
import type { Run } from "./shared";

/** Yes/no stickers for a proposed round; the proposer can only take it back. */
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
  const respond = (p_action: "accept" | "decline" | "cancel") =>
    run(() => rpc("respond_cycle", { p_id: c.id, p_action }));
  return (
    <div className="answer">
      {c.proposed_by === user ? (
        <>
          <span className="waiting">waiting…</span>
          <button
            className="round secondary"
            aria-label="Cancel proposal"
            disabled={busy}
            onClick={() => respond("cancel")}
          >
            <IconX />
          </button>
        </>
      ) : (
        <>
          <button
            className="round no"
            aria-label="Decline"
            disabled={busy}
            onClick={() => respond("decline")}
          >
            <IconX />
          </button>
          <button
            className="round ok"
            aria-label="Accept"
            disabled={busy}
            onClick={() => respond("accept")}
          >
            <IconCheck />
          </button>
        </>
      )}
    </div>
  );
}
