import { t } from "../i18n";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IconArrowLeft, IconMinus, IconPlus } from "@tabler/icons-react";
import type { ViewProps } from "../components/shared";
import { byNewest, closed, tone } from "../components/shared";
import { rpc } from "../data";
import { money } from "../helpers";
import Avatar from "../components/Avatar";

/** Log today's hulog: pick how many days, see the stickers, send. */
export default function Record({ data, user, run, busy }: ViewProps) {
  const navigate = useNavigate();
  const [days, setDays] = useState(1);
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
      <div className={`tally ${tone(data, user)} preview`} aria-hidden="true">
        {Array.from({ length: days }, (_, i) => (
          <span key={i} className="paid" />
        ))}
      </div>
      <strong className="amount">
        {money(days * c.daily_amount_centavos)}
      </strong>
      <button
        className="big"
        disabled={busy}
        onClick={() =>
          run(async () => {
            await rpc("record_payment", { p_cycle_id: c.id, p_days: days });
            navigate("/");
          })
        }
      >
        {t("hulog!")}
      </button>
    </div>
  );
}
