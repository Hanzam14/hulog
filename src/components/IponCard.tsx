import { useEffect } from "react";
import { Link } from "react-router-dom";
import { IconWallet } from "@tabler/icons-react";
import type { SavingsGoal, Snapshot } from "../data";
import {
  cadenceDisplay,
  iponGoalProgress,
  money,
  phaseDisplay,
  shortDate,
} from "../helpers";
import { t } from "../i18n";
import Avatar from "./Avatar";
import { celebratePayout } from "./confetti";
import Tally from "./Tally";
import { name, tone } from "./shared";

/** An Ipon goal card: title, mode badge, progress ring + bar, pace badge, custody, and member tallies. */
export default function IponCard({
  g,
  data,
}: {
  g: SavingsGoal;
  data: Snapshot;
}) {
  const { percent: progress, paceLabel, reachedTarget } = iponGoalProgress(g);
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  useEffect(() => {
    if (reachedTarget && g.status === "accepted") {
      celebratePayout(`ipon-${g.id}`, data);
    }
  }, [reachedTarget, g.id, g.status, data]);

  const progressItems = (data.savingsProgress ?? []).filter(
    (p) => p.goal_id === g.id,
  );
  const memberItems =
    progressItems.length > 0
      ? progressItems
      : data.memberships
          .filter((m) => m.status === "active")
          .map((m) => ({
            member_id: m.user_id,
            confirmed_steps: 0,
            pending_steps: 0,
          }));

  return (
    <Link
      to={`/ipon/${g.id}`}
      className="pot ipon-card"
      aria-label={g.title}
    >
      <div className="pot-top" style={{ alignItems: "flex-start" }}>
        <div
          className="ipon-ring"
          style={{
            position: "relative",
            width: "44px",
            height: "44px",
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
          }}
          aria-hidden="true"
        >
          <svg width="44" height="44" viewBox="0 0 44 44">
            <circle
              cx="22"
              cy="22"
              r={radius}
              fill="none"
              stroke="var(--dots)"
              strokeWidth="4"
            />
            <circle
              cx="22"
              cy="22"
              r={radius}
              fill="none"
              stroke="var(--green-deep)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 22 22)"
            />
          </svg>
          <span
            style={{
              position: "absolute",
              fontSize: "10px",
              fontWeight: 800,
              color: "var(--ink)",
            }}
          >
            {progress}%
          </span>
        </div>
        <div className="pot-amount" style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              width: "100%",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: "var(--display)",
                fontSize: "18px",
                fontWeight: 700,
                color: "var(--ink)",
                wordBreak: "break-word",
              }}
            >
              {g.title}
            </span>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {g.status === "accepted" && !g.withdrawn_at && (
                <span
                  className="chip"
                  style={{ fontSize: "11px", padding: "1px 8px" }}
                >
                  {paceLabel}
                </span>
              )}
              <span
                className="chip"
                style={{ fontSize: "11px", padding: "1px 8px" }}
              >
                {g.goal_mode === "matched"
                  ? cadenceDisplay(g.cadence_days)
                  : t("Flexible anytime")}
              </span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <strong>{money(g.saved_centavos)}</strong>
            <span className="pot-target">
              {t("of {amount}", { amount: money(g.target_amount_centavos) })}
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
        <IconWallet
          size={16}
          aria-hidden="true"
          style={{ color: "var(--soft)", flexShrink: 0 }}
        />
        <span>
          {t("Held by {name} · {wallet}", {
            name: name(data, g.holder_id).trim().split(/\s+/)[0],
            wallet: g.wallet_label,
          })}
        </span>
      </div>
      {g.goal_mode === "matched" && g.status === "accepted" && g.num_steps && (
        <div className="members" style={{ padding: "4px 0 0" }}>
          {memberItems.map((p) => (
            <div className="member" key={p.member_id}>
              <Avatar data={data} id={p.member_id} size="sm" />
              <Tally
                label={name(data, p.member_id)}
                paid={p.confirmed_steps}
                pending={p.pending_steps}
                total={g.num_steps!}
                tone={tone(data, p.member_id)}
              />
            </div>
          ))}
        </div>
      )}
      <div className="pot-bottom">
        <small>{phaseDisplay(g.phase, g.days_left)}</small>
        <small>
          {shortDate(g.start_date)} → {shortDate(g.end_date)}
        </small>
      </div>
    </Link>
  );
}
