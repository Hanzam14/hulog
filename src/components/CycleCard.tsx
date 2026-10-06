import { Link } from "react-router-dom";
import type { Cycle, Snapshot } from "../data";
import { money, phaseDisplay } from "../helpers";
import { name } from "./shared";

export default function CycleCard({ c, data }: { c: Cycle; data: Snapshot }) {
  return (
    <>
      <div className="pot">
        <div className="row meta">
          <span>{phaseDisplay(c.phase, c.days_left)}</span>
          <Link to={`/cycles/${c.id}`}>Details</Link>
        </div>
        <strong>{money(c.pot_centavos)}</strong>
        <span>
          of {money(c.target_centavos)} · {c.start_date} → {c.end_date}
        </span>
        <span>
          → {name(data, c.receiver_id)} receives ·{" "}
          {money(c.daily_amount_centavos)}
          /day × {c.num_days}
        </span>
      </div>
    </>
  );
}
