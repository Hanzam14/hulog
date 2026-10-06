import {
  IconCheck,
  IconHeartFilled,
  IconStarFilled,
} from "@tabler/icons-react";
import type { Cycle, Snapshot } from "../data";
import { rpc } from "../data";
import { money } from "../helpers";
import { closed, name, type Run } from "./shared";
import { celebratePayout } from "./confetti";
import Avatar from "./Avatar";

/** When a round ends: a celebration sticker for whoever gets the pot. */
export default function Payout({
  c,
  data,
  user,
  run,
  busy,
}: {
  c: Cycle;
  data: Snapshot;
  user: string;
  run: Run;
  busy: boolean;
}) {
  if (!closed(c)) return null;
  const done = c.payout_state === "Received";
  return (
    <div className={`celebrate ${done ? "done" : ""}`}>
      <IconStarFilled className="spark s1" aria-hidden="true" />
      <IconHeartFilled className="spark s2" aria-hidden="true" />
      <IconStarFilled className="spark s3" aria-hidden="true" />
      <Avatar data={data} id={c.receiver_id} size="lg" />
      <strong>{money(c.pot_centavos)}</strong>
      <span className="meta">{c.payout_state}</span>
      {done && (
        <p className="payout-congrats">
          Congrats, {name(data, c.receiver_id)}! Nasa'yo na ang hulog.
        </p>
      )}
      {!done && c.receiver_id === user && (
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              await rpc("receive_payout", { p_id: c.id });
              celebratePayout(c.id, data);
            })
          }
        >
          got it <IconCheck size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
