import { Link } from "react-router-dom";
import type { ViewProps } from "../components/shared";
import { byNewest, closed, name, tone } from "../components/shared";
import { rpc } from "../data";
import { money } from "../helpers";
import CycleCard from "../components/CycleCard";
import Proposal from "../components/Proposal";
import Payout from "../components/Payout";
import Tally from "../components/Tally";

export default function Home(props: ViewProps) {
  const { data, user, run, busy } = props;
  const group = data.groups[0];
  const cycles = [...data.cycles].sort(byNewest);
  const live = cycles.find(
    (c) => c.status === "proposed" || (c.status === "accepted" && !closed(c)),
  );
  const c = live ?? cycles.find((c) => c.status === "accepted");
  return (
    <>
      <h1>{group.name}</h1>
      <p className="meta">{data.today} · Manila time</p>
      {!live && (
        <Link className="button" to="/propose">
          Propose next cycle
        </Link>
      )}
      {!c ? (
        <section>
          <h2>A fresh start.</h2>
          <p>Invite your partner from Group, then agree on your first cycle.</p>
        </section>
      ) : (
        <>
          <section>
            <CycleCard c={c} data={data} />
            {c.status === "proposed" ? (
              <Proposal c={c} user={user} run={run} busy={busy} />
            ) : (
              <>
                <div className="members">
                  {data.progress
                    .filter((p) => p.cycle_id === c.id)
                    .map((p) => (
                      <div key={p.member_id}>
                        <div className="row">
                          <strong>
                            {name(data, p.member_id)}
                            {p.member_id === user && " (you)"}
                          </strong>
                          <span className="meta">
                            {p.confirmed_days}/{c.num_days}
                            {p.pending_days > 0 &&
                              ` · ${p.pending_days} waiting`}
                          </span>
                        </div>
                        <Tally
                          label={name(data, p.member_id)}
                          paid={p.confirmed_days}
                          pending={p.pending_days}
                          total={c.num_days}
                          tone={tone(data, p.member_id)}
                        />
                      </div>
                    ))}
                </div>
                {!closed(c) && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void run(() =>
                        rpc("record_payment", {
                          p_cycle_id: c.id,
                          p_days: Number(f.get("days")),
                        }),
                      );
                    }}
                  >
                    <label>
                      How many days?
                      <input
                        name="days"
                        type="number"
                        min="1"
                        max={c.num_days}
                        defaultValue="1"
                        required
                      />
                    </label>
                    <button disabled={busy}>Hulog · record payment</button>
                  </form>
                )}
              </>
            )}
          </section>
          <Payout c={c} user={user} run={run} busy={busy} />
        </>
      )}
      {group.owner_id === user && (
        <section>
          <h2>To confirm</h2>
          {data.payments.filter((p) => p.status === "pending" && !p.deleted_at)
            .length === 0 && <p>All caught up. Salamat!</p>}
          {data.payments
            .filter((p) => p.status === "pending" && !p.deleted_at)
            .map((p) => {
              const cycle = data.cycles.find(
                (cycle) => cycle.id === p.cycle_id,
              )!;
              const allowed = cycle.phase !== "ended" || p.was_confirmed;
              return (
                <div className="list-row" key={p.id}>
                  <div>
                    <strong>
                      {name(data, p.member_id)} · {money(p.amount_centavos)}
                    </strong>
                    <p>
                      {p.days} days · {cycle.start_date}
                      <br />
                      {!allowed
                        ? "Unconfirmed — not counted"
                        : "Waiting for confirmation"}
                    </p>
                  </div>
                  {allowed && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(() => rpc("confirm_payment", { p_id: p.id }))
                      }
                    >
                      Confirm
                    </button>
                  )}
                </div>
              );
            })}
        </section>
      )}
      <p className="muted">
        Pot held at: {group.pot_location || "Ask your holder"}
      </p>
    </>
  );
}
