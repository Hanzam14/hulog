import { t } from "../i18n";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IconArrowLeft, IconMinus, IconPlus } from "@tabler/icons-react";
import type { ViewProps } from "../components/shared";
import { byNewest, closed, heldByText, name, tone } from "../components/shared";
import { rpc } from "../data";
import { money } from "../helpers";
import Avatar from "../components/Avatar";
import Tally from "../components/Tally";

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
  const left = Math.max(
    1,
    c.num_days - (mine ? mine.confirmed_days + mine.pending_days : 0),
  );
  const set = (n: number) => setDays(Math.min(left, Math.max(1, n)));
  return (
    <div className="record">
      <Link to="/" className="back" aria-label={t("Back")}>
        <IconArrowLeft />
      </Link>
      <Avatar data={data} id={user} size="lg" />
      <div className="stepper">
        <button
          type="button"
          className="round secondary"
          aria-label={t("One day less")}
          onClick={() => set(days - 1)}
        >
          <IconMinus />
        </button>
        <output aria-live="polite" aria-label={t("Days")}>
          {days}
        </output>
        <button
          type="button"
          className="round secondary"
          aria-label={t("One day more")}
          onClick={() => set(days + 1)}
        >
          <IconPlus />
        </button>
      </div>
      <Tally
        label={name(data, user)}
        paid={days}
        pending={0}
        total={days}
        tone={tone(data, user)}
        className="preview"
        decorative
      />
      <strong className="amount">
        {money(days * c.daily_amount_centavos)}
      </strong>
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
      />
      <button
        className="big"
        disabled={busy}
        onClick={() =>
          run(async () => {
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
          })
        }
      >
        {t("hulog!")}
      </button>
    </div>
  );
}
