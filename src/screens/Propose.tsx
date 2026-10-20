import { t } from "../i18n";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { FormEvent } from "react";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCalendar,
  IconCoin,
  IconWallet,
} from "@tabler/icons-react";
import type { ViewProps } from "../components/shared";
import { byNewest, name } from "../components/shared";
import { rpc } from "../data";
import { addDays, money, parsePesos } from "../helpers";
import Avatar from "../components/Avatar";
import { isSoloMode } from "../solo";

const AMOUNTS = ["20", "50", "100"];
const DAYS = ["7", "15", "30"];

/** Start a new round: tap a daily amount, a length, and who gets the pot. */
export default function Propose({ data, user, run, busy }: ViewProps) {
  const navigate = useNavigate();
  const accepted = data.cycles
    .filter((c) => c.status === "accepted")
    .sort(byNewest)[0];
  const active = data.memberships.filter((m) => m.status === "active");
  const local = isSoloMode();
  const isSoloRound = local && active.length === 1;
  const members = active;
  const [amount, setAmount] = useState("50");
  const [days, setDays] = useState("15");
  const [receiver, setReceiver] = useState(
    (accepted
      ? members.find((m) => m.user_id !== accepted.receiver_id)?.user_id
      : data.groups[0].owner_id) ?? members[0]?.user_id,
  );
  const activeWallets = (data.wallets ?? []).filter((w) => !w.archived_at);
  const defaultWallet =
    activeWallets.find((w) => w.holder_id === user)?.id ?? activeWallets[0]?.id;
  const [walletId, setWalletId] = useState<string | undefined>(defaultWallet);
  let total: string;
  try {
    // A round always has two people paying, even before the partner joins.
    const multiplier = isSoloRound ? 1 : 2;
    total = money(parsePesos(amount) * Number(days) * multiplier);
  } catch {
    total = "";
  }
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      const payload: Record<string, unknown> = {
        p_daily_amount_centavos: parsePesos(amount),
        p_num_days: Number(days),
        p_start_date: f.get("start"),
        p_receiver_id: isSoloRound ? user : receiver,
        ...(local ? { p_is_solo: isSoloRound } : {}),
      };
      if (walletId) {
        payload.p_wallet_id = walletId;
      }
      await rpc("propose_cycle", payload);
      navigate("/");
    });
  };
  return (
    <form className="propose" onSubmit={submit}>
      <Link to="/" className="back" aria-label={t("Back")}>
        <IconArrowLeft />
      </Link>
      <h1 className="sr-only">{t("New round")}</h1>
      <fieldset>
        <legend>
          <IconCoin aria-hidden="true" /> {t("₱ a day")}
        </legend>
        <div className="chips">
          {AMOUNTS.map((a) => (
            <button
              type="button"
              key={a}
              className={`pick ${amount === a ? "on" : ""}`}
              aria-pressed={amount === a}
              onClick={() => setAmount(a)}
            >
              ₱{a}
            </button>
          ))}
          <input
            aria-label={t("Other daily amount in pesos")}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </fieldset>
      <fieldset>
        <legend>
          <IconCalendar aria-hidden="true" /> {t("days")}
        </legend>
        <div className="chips">
          {DAYS.map((d) => (
            <button
              type="button"
              key={d}
              className={`pick ${days === d ? "on" : ""}`}
              aria-pressed={days === d}
              onClick={() => setDays(d)}
            >
              {d}
            </button>
          ))}
          <input
            aria-label={t("Other number of days")}
            type="number"
            min="1"
            max="366"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            required
          />
        </div>
      </fieldset>
      <fieldset>
        <legend>
          <IconArrowRight aria-hidden="true" /> {t("pot goes to")}
        </legend>
        <div className="chips">
          {members.map((m) => (
            <button
              type="button"
              key={m.user_id}
              className={`who ${receiver === m.user_id ? "on" : ""}`}
              aria-pressed={receiver === m.user_id}
              onClick={() => setReceiver(m.user_id)}
            >
              <Avatar data={data} id={m.user_id} size="lg" />
              <span>{name(data, m.user_id).split(" ")[0]}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {activeWallets.length > 0 && (
        <fieldset>
          <legend>
            <IconWallet aria-hidden="true" /> {t("Wallet is held by")}
          </legend>
          <div className="chips">
            {activeWallets.map((w) => (
              <button
                type="button"
                key={w.id}
                className={`pick ${walletId === w.id ? "on" : ""}`}
                aria-pressed={walletId === w.id}
                onClick={() => setWalletId(w.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                }}
              >
                <Avatar data={data} id={w.holder_id} size="sm" />
                <span>
                  {w.label} ({name(data, w.holder_id).trim().split(/\s+/)[0]})
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <label className="start">
        {t("starts")}
        <input
          name="start"
          type="date"
          min={data.today}
          defaultValue={addDays(data.today, 1)}
          required
        />
      </label>
      {total && receiver && (
        <div className="preview-pot" aria-live="polite">
          <strong>{total}</strong>
          <IconArrowRight aria-label={t("goes to")} />
          <Avatar data={data} id={receiver} />
          <span>{name(data, receiver).split(" ")[0]}</span>
        </div>
      )}
      <button className="big" disabled={busy}>
        {t("propose")}
      </button>
    </form>
  );
}
