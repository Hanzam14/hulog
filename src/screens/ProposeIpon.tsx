import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCalendar,
  IconCoin,
  IconTarget,
} from "@tabler/icons-react";
import type { ViewProps } from "../components/shared";
import { name } from "../components/shared";
import { rpc } from "../data";
import {
  addDays,
  cleanGoalTitle,
  money,
  parsePesos,
  shortDate,
} from "../helpers";
import { t } from "../i18n";
import PersonalSavings from "../components/PersonalSavings";

const AMOUNTS = ["50", "100", "300"];
const STEPS = ["10", "15", "30"];

/** Route /ipon/new: Propose a new matched cadence or flexible shared pot goal. */
export default function ProposeIpon({ data, user, run, busy }: ViewProps) {
  const navigate = useNavigate();

  const activeMemberIds = new Set(
    data.memberships.filter((m) => m.status === "active").map((m) => m.user_id),
  );
  const [mode, setMode] = useState<"matched" | "flexible">("matched");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(addDays(data.today, 1));

  // Matched fields
  const [stepAmount, setStepAmount] = useState("100");
  const [cadenceDays, setCadenceDays] = useState("1");
  const [numSteps, setNumSteps] = useState("15");

  // Flexible fields
  const [targetAmount, setTargetAmount] = useState("10000");
  const [endDate, setEndDate] = useState(addDays(data.today, 30));

  // Active wallets of active members
  const activeWallets = (data.wallets ?? []).filter(
    (w) => !w.archived_at && activeMemberIds.has(w.holder_id),
  );
  const defaultWallet =
    activeWallets.find((w) => w.holder_id === user) ?? activeWallets[0];
  const [walletId, setWalletId] = useState(defaultWallet?.id ?? "");

  const CADENCES = [
    { days: "1", label: t("Daily") },
    { days: "3", label: t("Every 3 days") },
    { days: "7", label: t("Weekly") },
  ];

  let totalTarget = "";
  let computedEndDate = "";
  if (mode === "matched") {
    try {
      const stepCentavos = parsePesos(stepAmount);
      const steps = Number(numSteps);
      const cadence = Number(cadenceDays);
      if (steps > 0 && cadence > 0) {
        const multiplier = 2;
        totalTarget = money(stepCentavos * steps * multiplier);
        computedEndDate = addDays(startDate, (steps - 1) * cadence);
      }
    } catch {
      totalTarget = "";
    }
  }

  let flexibleTarget = "";
  if (mode === "flexible") {
    try {
      flexibleTarget = money(parsePesos(targetAmount));
    } catch {
      flexibleTarget = "";
    }
  }

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !walletId) return;
    const finalTitle = cleanGoalTitle(trimmedTitle);

    void run(async () => {
      if (mode === "matched") {
        await rpc("propose_savings_goal", {
          p_title: finalTitle,
          p_goal_mode: "matched",
          p_wallet_id: walletId,
          p_start_date: startDate,
          p_step_amount_centavos: parsePesos(stepAmount),
          p_cadence_days: Number(cadenceDays),
          p_num_steps: Number(numSteps),
        });
      } else {
        await rpc("propose_savings_goal", {
          p_title: finalTitle,
          p_goal_mode: "flexible",
          p_wallet_id: walletId,
          p_start_date: startDate,
          p_target_amount_centavos: parsePesos(targetAmount),
          p_end_date: endDate,
        });
      }
      navigate("/");
    });
  };

  if (activeMemberIds.size < 2)
    return (
      <PersonalSavings
        data={data}
        user={user}
        run={run}
        busy={busy}
        header={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "8px",
            }}
          >
            <Link to="/" className="back" aria-label={t("Back")}>
              <IconArrowLeft />
            </Link>
            <h1 style={{ margin: 0, fontSize: "20px" }}>
              {t("Personal savings")}
            </h1>
          </div>
        }
      />
    );

  return (
    <form className="propose" onSubmit={submit}>
      <Link to="/" className="back" aria-label={t("Back")}>
        <IconArrowLeft />
      </Link>
      <h1 className="sr-only">{t("New ipon goal")}</h1>

      <Link to="/#personal-savings">
        {t("Use Personal savings on Home for your own goals.")}
      </Link>

      <div className="segmented" role="radiogroup" aria-label={t("Goal mode")}>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "matched"}
          aria-pressed={mode === "matched"}
          onClick={() => setMode("matched")}
        >
          {t("Matched cadence")}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "flexible"}
          aria-pressed={mode === "flexible"}
          onClick={() => setMode("flexible")}
        >
          {t("Flexible shared pot")}
        </button>
      </div>

      <label style={{ display: "grid", gap: "6px" }}>
        <span
          style={{
            color: "var(--soft)",
            fontFamily: "var(--display)",
            fontWeight: 500,
          }}
        >
          {t("Goal title")}
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("e.g. Japan trip, Emergency fund")}
          maxLength={60}
          required
        />
      </label>

      {mode === "matched" ? (
        <>
          <fieldset>
            <legend>
              <IconCoin aria-hidden="true" /> {t("Amount per hulog (₱)")}
            </legend>
            <div className="chips">
              {AMOUNTS.map((a) => (
                <button
                  type="button"
                  key={a}
                  className={`pick ${stepAmount === a ? "on" : ""}`}
                  aria-pressed={stepAmount === a}
                  onClick={() => setStepAmount(a)}
                >
                  ₱{a}
                </button>
              ))}
              <input
                aria-label={t("Amount per hulog (₱)")}
                inputMode="decimal"
                value={stepAmount}
                onChange={(e) => setStepAmount(e.target.value)}
                required
              />
            </div>
          </fieldset>

          <fieldset>
            <legend>
              <IconCalendar aria-hidden="true" /> {t("Every how many days?")}
            </legend>
            <div className="chips">
              {CADENCES.map((c) => (
                <button
                  type="button"
                  key={c.days}
                  className={`pick ${cadenceDays === c.days ? "on" : ""}`}
                  aria-pressed={cadenceDays === c.days}
                  onClick={() => setCadenceDays(c.days)}
                >
                  {c.label}
                </button>
              ))}
              <input
                aria-label={t("Every how many days?")}
                type="number"
                min="1"
                max="90"
                value={cadenceDays}
                onChange={(e) => setCadenceDays(e.target.value)}
                required
              />
            </div>
          </fieldset>

          <fieldset>
            <legend>
              <IconTarget aria-hidden="true" /> {t("Number of hulogs")}
            </legend>
            <div className="chips">
              {STEPS.map((s) => (
                <button
                  type="button"
                  key={s}
                  className={`pick ${numSteps === s ? "on" : ""}`}
                  aria-pressed={numSteps === s}
                  onClick={() => setNumSteps(s)}
                >
                  {s}
                </button>
              ))}
              <input
                aria-label={t("Number of hulogs")}
                type="number"
                min="1"
                max="366"
                value={numSteps}
                onChange={(e) => setNumSteps(e.target.value)}
                required
              />
            </div>
          </fieldset>
        </>
      ) : (
        <>
          <label style={{ display: "grid", gap: "8px" }}>
            <span
              style={{
                color: "var(--soft)",
                fontFamily: "var(--display)",
                fontWeight: 500,
              }}
            >
              {t("Target amount (₱)")}
            </span>
            <input
              aria-label={t("Target amount (₱)")}
              inputMode="decimal"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="10000"
              required
            />
          </label>

          <label className="start">
            {t("Target date")}
            <input
              type="date"
              min={startDate}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </label>
        </>
      )}

      {activeWallets.length > 0 && (
        <label style={{ display: "grid", gap: "8px" }}>
          <span
            style={{
              color: "var(--soft)",
              fontFamily: "var(--display)",
              fontWeight: 500,
            }}
          >
            {t("Wallet is held by")}
          </span>
          <select
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            required
          >
            {activeWallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label} ({name(data, w.holder_id).trim().split(/\s+/)[0]})
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="start">
        {t("starts")}
        <input
          name="start"
          type="date"
          min={data.today}
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            if (endDate < e.target.value) {
              setEndDate(e.target.value);
            }
          }}
          required
        />
      </label>

      {mode === "matched" && totalTarget && computedEndDate && (
        <div className="preview-pot" aria-live="polite">
          <strong>{totalTarget}</strong>
          <IconArrowRight aria-hidden="true" />
          <span>
            {shortDate(startDate)} → {shortDate(computedEndDate)}
          </span>
        </div>
      )}

      {mode === "flexible" && flexibleTarget && endDate && (
        <div className="preview-pot" aria-live="polite">
          <strong>{flexibleTarget}</strong>
          <IconArrowRight aria-hidden="true" />
          <span>
            {shortDate(startDate)} → {shortDate(endDate)}
          </span>
        </div>
      )}

      <button className="big" disabled={busy || !walletId}>
        {t("Propose ipon goal")}
      </button>
    </form>
  );
}
