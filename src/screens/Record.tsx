import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IconArrowLeft, IconMinus, IconPlus } from "@tabler/icons-react";
import type { ViewProps } from "../components/shared";
import { byNewest, closed, heldByText, name, tone } from "../components/shared";
import { rpc } from "../data";
import { money } from "../helpers";
import Avatar from "../components/Avatar";
import Tally from "../components/Tally";
import { t } from "../i18n";

/** Log today's hulog: pick how many days, see the stickers, send. */
export default function Record({ data, user, run, busy }: ViewProps) {
  const navigate = useNavigate();
  const [days, setDays] = useState(1);
  const [note, setNote] = useState("");

  const c = [...data.cycles]
    .sort(byNewest)
    .find((cycle) => cycle.status === "accepted" && !closed(cycle));

  if (!c)
    return (
      <p>
        {t("No open round.")} <Link to="/">{t("Go home")}</Link>
      </p>
    );

  const mine = data.progress.find(
    (p) => p.cycle_id === c.id && p.member_id === user,
  );
  const remaining =
    c.num_days - (mine ? mine.confirmed_days + mine.pending_days : 0);
  const isFullyPaid = remaining <= 0;
  const left = Math.max(0, remaining);
  const effectiveDays = isFullyPaid ? 0 : days;

  const set = (n: number) => {
    if (isFullyPaid) return;
    setDays(Math.min(left, Math.max(1, n)));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isFullyPaid || busy || days < 1) return;
    void run(async () => {
      const payload: {
        p_cycle_id: string;
        p_days: number;
        p_note?: string;
      } = {
        p_cycle_id: c.id,
        p_days: days,
      };
      const trimmed = note.trim();
      if (trimmed) {
        payload.p_note = trimmed;
      }
      await rpc("record_payment", payload);
      navigate("/");
    });
  };

  return (
    <form className="record" onSubmit={handleSubmit}>
      <Link to="/" className="back" aria-label={t("Back")}>
        <IconArrowLeft />
      </Link>
      <h1 className="sr-only">{t("Record payment")}</h1>
      <div className="member-who">
        <Avatar data={data} id={user} size="sm" />
        <strong>{name(data, user)}</strong>
      </div>
      <div className="stepper">
        <button
          type="button"
          className="round secondary"
          aria-label={t("One day less")}
          onClick={() => set(days - 1)}
          disabled={isFullyPaid || days <= 1}
        >
          <IconMinus />
        </button>
        <output
          aria-live="polite"
          aria-label={`${t("{days} days", { days: effectiveDays })}, ${money(effectiveDays * c.daily_amount_centavos)}`}
        >
          {effectiveDays}{" "}
          <span className="sr-only">
            ({money(effectiveDays * c.daily_amount_centavos)})
          </span>
        </output>
        <button
          type="button"
          className="round secondary"
          aria-label={t("One day more")}
          onClick={() => set(days + 1)}
          disabled={isFullyPaid || days >= left}
        >
          <IconPlus />
        </button>
      </div>
      <Tally
        label={name(data, user)}
        paid={effectiveDays}
        pending={0}
        total={Math.max(1, effectiveDays)}
        tone={tone(data, user)}
        className="preview"
        decorative
      />
      <strong className="amount">
        {money(effectiveDays * c.daily_amount_centavos)}
      </strong>
      {isFullyPaid && (
        <p
          className="meta"
          style={{ textAlign: "center", margin: "4px 0", fontWeight: 600 }}
        >
          {t("You're all paid up for this round!")}
        </p>
      )}
      {c.holder_id && c.wallet_label && (
        <p className="meta" style={{ textAlign: "center", margin: "4px 0" }}>
          {heldByText(data, c.holder_id, c.wallet_label, user)}
        </p>
      )}
      <input
        type="text"
        maxLength={140}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("e.g. GCash ref #1234")}
        aria-label={t("Note or ref # (optional)")}
        style={{ textAlign: "center", maxWidth: "320px", margin: "8px auto" }}
        disabled={isFullyPaid}
      />
      <button
        type="submit"
        className="big"
        disabled={busy || isFullyPaid}
      >
        {t("hulog!")}
      </button>
    </form>
  );
}
