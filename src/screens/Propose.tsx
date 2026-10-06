import { useNavigate } from "react-router-dom";
import type { FormEvent } from "react";
import type { ViewProps } from "../components/shared";
import { byNewest, name } from "../components/shared";
import { rpc } from "../data";
import { addDays, parsePesos } from "../helpers";

export default function Propose({ data, run, busy }: ViewProps) {
  const navigate = useNavigate();
  const accepted = data.cycles
    .filter((c) => c.status === "accepted")
    .sort(byNewest)[0];
  const defaultReceiver = accepted
    ? data.memberships.find(
        (m) => m.status === "active" && m.user_id !== accepted.receiver_id,
      )?.user_id
    : data.groups[0].owner_id;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      await rpc("propose_cycle", {
        p_daily_amount_centavos: parsePesos(String(f.get("amount"))),
        p_num_days: Number(f.get("days")),
        p_start_date: f.get("start"),
        p_receiver_id: f.get("receiver"),
      });
      navigate("/");
    });
  };
  return (
    <>
      <h1>Agree on the next pot.</h1>
      <section>
        <form onSubmit={submit}>
          <label>
            Daily amount (₱)
            <input
              name="amount"
              inputMode="decimal"
              defaultValue="50"
              required
            />
          </label>
          <label>
            Number of days
            <input
              name="days"
              type="number"
              min="1"
              max="366"
              defaultValue="15"
              required
            />
          </label>
          <label>
            Start date
            <input
              name="start"
              type="date"
              min={data.today}
              defaultValue={addDays(data.today, 1)}
              required
            />
          </label>
          <label>
            Receiver
            <select name="receiver" defaultValue={defaultReceiver}>
              {data.memberships
                .filter((m) => m.status === "active")
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {name(data, m.user_id)}
                  </option>
                ))}
            </select>
          </label>
          <p>Your partner accepts before this cycle begins.</p>
          <button disabled={busy}>Propose cycle</button>
        </form>
      </section>
    </>
  );
}
