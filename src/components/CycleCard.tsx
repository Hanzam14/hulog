import { t } from "../i18n";
import { Link } from "react-router-dom";
import { IconPigMoney } from "@tabler/icons-react";
import type { Cycle, Snapshot } from "../data";
import {
  getSoloCycleBadgeText,
  money,
  phaseDisplay,
  shortDate,
} from "../helpers";
import Avatar from "./Avatar";
import { heldByText, name } from "./shared";

/** The pot sticker: how much is in, the target, and who gets it. */
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
    >
      <div className="pot-top">
        <IconPigMoney className="pig" size={44} aria-hidden="true" />
        <div
          className="pot-amount"
          style={{ display: "flex", flexDirection: "column" }}
        >
          {soloBadge && (
            <span
              className="chip"
              style={{
                fontSize: "13px",
                padding: "4px 8px",
                fontWeight: 600,
                background: "var(--brand-soft)",
                color: "var(--brand)",
                border: "1px solid currentColor",
                marginBottom: "4px",
                alignSelf: "flex-start",
              }}
            >
              {soloBadge}
            </span>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <strong>{money(c.pot_centavos)}</strong>
            <span className="pot-target">
              {t("of {amount}", { amount: money(c.target_centavos) })}
            </span>
          </div>
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
      <div className="pot-receiver">
        <span>{t("goes to")}</span>
        <Avatar data={data} id={c.receiver_id} size="sm" />
        <b>{name(data, c.receiver_id).trim().split(/\s+/)[0]}</b>
      </div>
      {c.holder_id && c.wallet_label && (
        <div className="pot-custody">
          <small>{heldByText(data, c.holder_id, c.wallet_label, user)}</small>
        </div>
      )}
      <div className="pot-bottom">
        <small>{phaseDisplay(c.phase, c.days_left)}</small>
        <small>
          {money(c.daily_amount_centavos)} × {c.num_days}
          <br />
          {shortDate(c.start_date)} → {shortDate(c.end_date)}
        </small>
      </div>
    </Link>
  );
}
