import { Link } from "react-router-dom";
import { IconArrowRight, IconPigMoney } from "@tabler/icons-react";
import type { Cycle, Snapshot } from "../data";
import { money, phaseDisplay, shortDate } from "../helpers";
import Avatar from "./Avatar";

/** The pot sticker: how much is in, the target, and who gets it. */
export default function CycleCard({ c, data }: { c: Cycle; data: Snapshot }) {
  return (
    <Link to={`/cycles/${c.id}`} className="pot" aria-label="Round details">
      <IconPigMoney className="pig" size={40} aria-hidden="true" />
      <div>
        <strong>{money(c.pot_centavos)}</strong>
        <span className="pot-line">
          / {money(c.target_centavos)}
          <IconArrowRight size={14} aria-label="goes to" />
          <Avatar data={data} id={c.receiver_id} size="sm" />
        </span>
      </div>
      <small>
        {phaseDisplay(c.phase, c.days_left)} · {money(c.daily_amount_centavos)}{" "}
        × {c.num_days} · {shortDate(c.start_date)} → {shortDate(c.end_date)}
      </small>
    </Link>
  );
}
