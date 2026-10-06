import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { FormEvent } from "react";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCalendar,
  IconCoin,
} from "@tabler/icons-react";
import type { ViewProps } from "../components/shared";
import { byNewest, name } from "../components/shared";
import { rpc } from "../data";
import { addDays, money, parsePesos } from "../helpers";
import Avatar from "../components/Avatar";

const AMOUNTS = ["20", "50", "100"];
const DAYS = ["7", "15", "30"];

/** Start a new round: tap a daily amount, a length, and who gets the pot. */
export default function Propose({ data, run, busy }: ViewProps) {
  const navigate = useNavigate();
  const accepted = data.cycles
    .filter((c) => c.status === "accepted")
    .sort(byNewest)[0];
  const members = data.memberships.filter((m) => m.status === "active");
  const [amount, setAmount] = useState("50");
  const [days, setDays] = useState("15");
  const [receiver, setReceiver] = useState(
    (accepted
      ? members.find((m) => m.user_id !== accepted.receiver_id)?.user_id
      : data.groups[0].owner_id) ?? members[0]?.user_id,
  );
  let total: string;
  try {
    total = money(parsePesos(amount) * Number(days) * members.length);
  } catch {
    total = "";
  }
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      await rpc("propose_cycle", {
        p_daily_amount_centavos: parsePesos(amount),
        p_num_days: Number(days),
        p_start_date: f.get("start"),
        p_receiver_id: receiver,
      });
      navigate("/");
    });
  };
  return (
    <form className="propose" onSubmit={submit}>
      <Link to="/" className="back" aria-label="Back">
        <IconArrowLeft />
      </Link>
      <h1 className="sr-only">New round</h1>
      <fieldset>
        <legend>
          <IconCoin aria-hidden="true" /> ₱ a day
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
            aria-label="Other daily amount in pesos"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </fieldset>
      <fieldset>
        <legend>
          <IconCalendar aria-hidden="true" /> days
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
            aria-label="Other number of days"
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
          <IconArrowRight aria-hidden="true" /> pot goes to
        </legend>
        <div className="chips">
          {members.map((m) => (
            <button
              type="button"
              key={m.user_id}
              className={`who ${receiver === m.user_id ? "on" : ""}`}
              aria-pressed={receiver === m.user_id}
              aria-label={name(data, m.user_id)}
              onClick={() => setReceiver(m.user_id)}
            >
              <Avatar data={data} id={m.user_id} size="lg" />
            </button>
          ))}
        </div>
      </fieldset>
      <label className="start">
        starts
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
          <IconArrowRight aria-label="goes to" />
          <Avatar data={data} id={receiver} />
        </div>
      )}
      <button className="big" disabled={busy}>
        propose
      </button>
    </form>
  );
}
