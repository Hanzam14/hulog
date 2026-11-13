import { t } from "../i18n";
import { Link } from "react-router-dom";
import type { Cycle, Snapshot } from "../data";
import {
  getSoloCycleBadgeText,
  money,
  phaseDisplay,
  shortDate,
} from "../helpers";
import Avatar from "./Avatar";
import { heldByText, name } from "./shared";

/** The pot card: how much is in, the target, and who gets it. */
export default function CycleCard({
  c,
  data,
  user,
}: {
  c: Cycle;
  data: Snapshot;
  user?: string;
}) {
  const progress =
    c.target_centavos > 0
      ? Math.min(100, Math.max(0, (c.pot_centavos / c.target_centavos) * 100))
      : 0;

  const soloBadge = getSoloCycleBadgeText(c, data, user);

  return (
    <Link
      to={`/cycles/${c.id}`}
      className="pot"
      aria-label={t("Round details")}
    >
      <div className="pot-top">
        <div className="pot-amount">
          {soloBadge && <span className="chip pot-solo-chip">{soloBadge}</span>}
          <div className="pot-figure">
            <strong>{money(c.pot_centavos)}</strong>
            <span className="pot-target">
              {t("of {amount}", { amount: money(c.target_centavos) })}
            </span>
          </div>
        </div>
        <div className="pot-receiver">
          <span>{t("goes to")}</span>
          <Avatar data={data} id={c.receiver_id} size="sm" />
          <b>{name(data, c.receiver_id).trim().split(/\s+/)[0]}</b>
        </div>
      </div>
      <div
        className="pot-progress"
        role="progressbar"
        aria-label={t("Pot progress")}
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="pot-bottom">
        <small>{phaseDisplay(c.phase, c.days_left)}</small>
        <small className="pot-terms">
          {t("{amount}/day", { amount: money(c.daily_amount_centavos) })} ·{" "}
          {shortDate(c.start_date)} → {shortDate(c.end_date)}
        </small>
      </div>
      {c.payout_state === "Received" ? (
        <div className="pot-custody">
          <small>{t("No amount remains held")}</small>
        </div>
      ) : c.holder_id && c.wallet_label ? (
        <div className="pot-custody">
          <small>
            {heldByText(data, c.holder_id, c.wallet_label, user)}
            {c.phase === "settling" || c.phase === "ended"
              ? ` · ${t("Still held")}: ${money(c.held_centavos ?? c.pot_centavos)}`
              : ""}
          </small>
        </div>
      ) : null}
    </Link>
  );
}
