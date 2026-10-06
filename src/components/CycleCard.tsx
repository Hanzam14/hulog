import { Link } from "react-router-dom";
import type { Cycle, Snapshot } from "../data";
import { money, phaseDisplay } from "../helpers";
import { name } from "./shared";

export default function CycleCard({ c, data }: { c: Cycle; data: Snapshot }) {
  return (
    <>
      <div className="row meta">
        <span>
          {phaseDisplay(c.phase, c.days_left)} · {c.start_date} → {c.end_date}
        </span>
        <Link to={`/cycles/${c.id}`}>Details</Link>
      </div>
      <div className="pot">
        <div>
          <strong>{money(c.pot_centavos)}</strong>
          <span>in the pot</span>
        </div>
        <div>
          <b>of {money(c.target_centavos)}</b>
          <span>
            → {name(data, c.receiver_id)} receives ·{" "}
            {money(c.daily_amount_centavos)}
            /day × {c.num_days}
          </span>
        </div>
      </div>
    </>
  );
}
