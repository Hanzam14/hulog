import { Link } from "react-router-dom";
import type { Cycle, Snapshot } from "../data";
import { money, phaseDisplay } from "../helpers";
import { name } from "./shared";

export default function CycleCard({ c, data }: { c: Cycle; data: Snapshot }) {
  return (
    <>
      <div className="row">
        <span className="eyebrow">{phaseDisplay(c.phase, c.days_left)}</span>
        <Link to={`/cycles/${c.id}`}>Details →</Link>
      </div>
      <h2>
        {money(c.daily_amount_centavos)} / day · {c.num_days} days
      </h2>
      <p>
        {c.start_date} → {c.end_date}
        <br />
        Receiver: <strong>{name(data, c.receiver_id)}</strong>
      </p>
      <div className="pot">
        <span>Our pot</span>
        <strong>{money(c.pot_centavos)}</strong>
        <span>of {money(c.target_centavos)} target</span>
        <progress
          aria-label="Pot progress"
          value={c.pot_centavos}
          max={c.target_centavos}
        />
      </div>
    </>
  );
}
