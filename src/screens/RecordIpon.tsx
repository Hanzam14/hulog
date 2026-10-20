import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { IconArrowLeft, IconMinus, IconPlus } from "@tabler/icons-react";
import Avatar from "../components/Avatar";
import type { ViewProps } from "../components/shared";
import { tone } from "../components/shared";
import { rpc } from "../data";
import {
  cleanGoalTitle,
  getSoloBadgeText,
  isSoloGoal,
  money,
  parsePesos,
} from "../helpers";
import { t } from "../i18n";

/** Route /ipon/:id/record: Log a contribution towards a matched or flexible savings goal. */
export default function RecordIpon({ data, user, run, busy }: ViewProps) {
  const navigate = useNavigate();
  const { id } = useParams();
  const g = (data.savingsGoals ?? []).find((goal) => goal.id === id);

  const userContributions = (data.savingsContributions ?? []).filter(
    (c) => c.goal_id === id && c.member_id === user && !c.deleted_at,
  );
  const usedSteps = userContributions.reduce(
    (sum, c) => sum + (c.steps ?? 0),
    0,
  );
  const remainingSteps = g ? Math.max(0, (g.num_steps ?? 0) - usedSteps) : 0;

  const totalContributed = (data.savingsContributions ?? [])
    .filter((c) => c.goal_id === id && !c.deleted_at)
    .reduce((sum, c) => sum + c.amount_centavos, 0);
  const remainingCentavos = g
    ? Math.max(0, g.target_amount_centavos - totalContributed)
    : 0;

  const [steps, setSteps] = useState(1);
  const [amount, setAmount] = useState(
    remainingCentavos > 0
      ? (Math.min(remainingCentavos, 50000) / 100).toString()
      : "0",
  );
  const [note, setNote] = useState("");

  if (!g) {
    return (
      <p>
        {t("Goal unavailable.")} <Link to="/">{t("Go home")}</Link>
      </p>
    );
  }

  if (g.status !== "accepted" || g.withdrawn_at || g.withdraw_proposed_by) {
    return (
      <div className="record">
        <Link to={`/ipon/${g.id}`} className="back" aria-label={t("Back")}>
          <IconArrowLeft />
        </Link>
        <p>{t("Waiting to withdraw")}</p>
        <Link to={`/ipon/${g.id}`}>{t("Ipon detail")}</Link>
      </div>
    );
  }

  const set = (n: number) =>
    setSteps(Math.min(remainingSteps, Math.max(1, n)));
  const stepAmount = g.step_amount_centavos ?? 0;

  const submitMatched = () => {
    void run(async () => {
      await rpc("record_savings_contribution", {
        p_goal_id: g.id,
        p_steps: steps,
        p_note: note.trim(),
      });
      navigate(`/ipon/${g.id}`);
    });
  };

  const submitFlexible = () => {
    void run(async () => {
      await rpc("record_savings_contribution", {
        p_goal_id: g.id,
        p_amount_centavos: parsePesos(amount),
        p_note: note.trim(),
      });
      navigate(`/ipon/${g.id}`);
    });
  };

  return (
    <div className="record">
      <Link to={`/ipon/${g.id}`} className="back" aria-label={t("Back")}>
        <IconArrowLeft />
      </Link>
      <Avatar data={data} id={user} size="lg" />
      <h1
        style={{
          fontFamily: "var(--display)",
          fontSize: "20px",
          margin: "0 0 4px",
          textAlign: "center",
        }}
      >
        {cleanGoalTitle(g.title)}
      </h1>
      {isSoloGoal(g) && (
        <div style={{ textAlign: "center", marginBottom: "8px" }}>
          <span
            className="chip"
            style={{
              fontSize: "11px",
              padding: "1px 8px",
              fontWeight: 600,
              background: "var(--brand-soft, #fdf2f8)",
              color: "var(--brand, #db2777)",
              border: "1px solid currentColor",
            }}
          >
            {getSoloBadgeText(g, data, user)}
          </span>
        </div>
      )}

      {g.goal_mode === "matched" ? (
        <>
          {remainingSteps <= 0 ? (
            <p style={{ color: "var(--soft)", fontWeight: 600 }}>
              {t("Goal reached ✓")}
            </p>
          ) : (
            <>
              <div className="stepper">
                <button
                  type="button"
                  className="round secondary"
                  aria-label={t("One hulog less")}
                  onClick={() => set(steps - 1)}
                  disabled={steps <= 1}
                >
                  <IconMinus />
                </button>
                <output aria-live="polite" aria-label={t("steps")}>
                  {steps}
                </output>
                <button
                  type="button"
                  className="round secondary"
                  aria-label={t("One hulog more")}
                  onClick={() => set(steps + 1)}
                  disabled={steps >= remainingSteps}
                >
                  <IconPlus />
                </button>
              </div>

              <div
                className={`tally ${tone(data, user)} preview`}
                aria-hidden="true"
              >
                {Array.from({ length: steps }, (_, i) => (
                  <span key={i} className="paid" />
                ))}
              </div>

              <strong className="amount">{money(steps * stepAmount)}</strong>
            </>
          )}

          <label
            style={{
              width: "100%",
              maxWidth: "320px",
              display: "grid",
              gap: "6px",
            }}
          >
            <span
              style={{
                color: "var(--soft)",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              {t("Note or ref # (optional)")}
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("e.g. GCash ref #1234")}
              maxLength={140}
            />
          </label>

          <button
            className="big"
            disabled={busy || remainingSteps <= 0 || steps > remainingSteps}
            onClick={submitMatched}
          >
            {t("Record ipon")}
          </button>
        </>
      ) : (
        <>
          {remainingCentavos <= 0 ? (
            <p style={{ color: "var(--soft)", fontWeight: 600 }}>
              {t("Goal reached ✓")}
            </p>
          ) : (
            <label
              style={{
                width: "100%",
                maxWidth: "320px",
                display: "grid",
                gap: "6px",
              }}
            >
              <span
                style={{
                  color: "var(--soft)",
                  fontSize: "14px",
                  fontWeight: 500,
                }}
              >
                {t("Amount to save (₱)")}
              </span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
              <small style={{ color: "var(--soft)" }}>
                {t("of {amount}", { amount: money(remainingCentavos) })}
              </small>
            </label>
          )}

          <label
            style={{
              width: "100%",
              maxWidth: "320px",
              display: "grid",
              gap: "6px",
            }}
          >
            <span
              style={{
                color: "var(--soft)",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              {t("Note or ref # (optional)")}
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("e.g. GCash ref #1234")}
              maxLength={140}
            />
          </label>

          <button
            className="big"
            disabled={busy || remainingCentavos <= 0}
            onClick={submitFlexible}
          >
            {t("Record ipon")}
          </button>
        </>
      )}
    </div>
  );
}
