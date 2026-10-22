import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconWallet } from "@tabler/icons-react";
import type { SavingsGoal, Snapshot } from "../data";
import {
  cadenceDisplay,
  cleanGoalTitle,
  isSoloGoal,
  iponGoalProgress,
  money,
  phaseDisplay,
  shortDate,
} from "../helpers";
import { t } from "../i18n";
import Avatar from "./Avatar";
import { celebratePayout } from "./confetti";
import Tally from "./Tally";
import { heldByText, name, tone } from "./shared";

/** An Ipon goal card: title, mode badge, progress ring + bar, pace badge, custody, and member tallies. */
export default function IponCard({
  g,
  data,
  user,
  action,
}: {
  g: SavingsGoal;
  data: Snapshot;
  user?: string;
  action?: ReactNode;
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

  const soloBadge = isSoloGoal(g);
  const activeMembers = data.memberships.filter((m) => m.status === "active");

  const partner = activeMembers.find((m) => m.user_id !== user);
  const partnerName = partner
    ? name(data, partner.user_id).trim().split(/\s+/)[0]
    : "";
  const ownerName = name(data, g.proposed_by).trim().split(/\s+/)[0];
  const isOwnGoal = !g.proposed_by || g.proposed_by === user;
  const statusChip = soloBadge
    ? t("Own goal")
    : g.status === "accepted" && !g.withdrawn_at
      ? paceLabel
      : "";
  const cadenceLine =
    g.goal_mode === "matched"
      ? cadenceDisplay(g.cadence_days)
      : t("Flexible anytime");
  const visibilityLine =
    soloBadge && activeMembers.length > 1
      ? isOwnGoal
        ? partnerName
          ? t("Visible to {name}", { name: partnerName })
          : ""
        : t("{name}'s goal, view only", { name: ownerName })
      : "";

  const card = (
    <Link to={`/ipon/${g.id}`} className="pot ipon-card">
      <div className="pot-top">
        <div className="ipon-ring" aria-hidden="true">
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
              stroke="var(--leaf-deep)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 22 22)"
            />
          </svg>
          <span>{progress}%</span>
        </div>
        <div className="ipon-head">
          <div className="ipon-title-row">
            <span className="ipon-title">{cleanGoalTitle(g.title)}</span>
            {statusChip && <span className="chip">{statusChip}</span>}
          </div>
          <div className="ipon-amounts">
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
      <div className="ipon-meta">
        <p>
          <IconWallet size={16} aria-hidden="true" />
          <span>{heldByText(data, g.holder_id, g.wallet_label, user)}</span>
        </p>
        <p>{cadenceLine}</p>
        {visibilityLine && <p>{visibilityLine}</p>}
      </div>
      {((g.goal_mode === "matched" && g.status === "accepted" && g.num_steps) ||
        (isSoloGoal(g) &&
          g.status === "accepted" &&
          activeMembers.length > 1)) && (
        <div className="members" style={{ padding: "4px 0 0" }}>
          {memberItems.map((p) => {
            const isSolo = isSoloGoal(g);
            const isSaver = !isSolo || p.member_id === g.proposed_by;
            const isObserving = isSolo && !isSaver;
            const memberSavedCentavos = (data.savingsContributions ?? [])
              .filter(
                (sc) =>
                  sc.goal_id === g.id &&
                  sc.member_id === p.member_id &&
                  !sc.deleted_at &&
                  sc.status === "confirmed",
              )
              .reduce((sum, sc) => sum + sc.amount_centavos, 0);

            return (
              <div className="member" key={p.member_id}>
                <div className="member-who">
                  <Avatar data={data} id={p.member_id} size="sm" />
                  <span>{name(data, p.member_id).trim().split(/\s+/)[0]}</span>
                </div>
                {isObserving ? (
                  <span className="meta">{t("₱0 · Observing")}</span>
                ) : g.goal_mode === "matched" && g.num_steps ? (
                  <Tally
                    label={name(data, p.member_id)}
                    paid={p.confirmed_steps}
                    pending={p.pending_steps}
                    total={g.num_steps!}
                    tone={tone(data, p.member_id)}
                  />
                ) : (
                  <strong className="ipon-member-amount">
                    {money(memberSavedCentavos)}
                  </strong>
                )}
              </div>
            );
          })}
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
  return (
    <div className="ipon-item">
      {card}
      {action}
    </div>
  );
}
