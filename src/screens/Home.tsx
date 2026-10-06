import { Link } from "react-router-dom";
import type { ViewProps } from "../components/shared";
import { byNewest, closed, name } from "../components/shared";
import { rpc } from "../data";
import { money } from "../helpers";
import CycleCard from "../components/CycleCard";
import Proposal from "../components/Proposal";
import Payout from "../components/Payout";

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
      <span className="eyebrow">
        {group.name} · {data.today} Manila
      </span>
      <h1>Hulog today.</h1>
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
                        <strong>
                          {name(data, p.member_id)}
                          {p.member_id === user && " (you)"}
                        </strong>
                        <p>
                          {p.confirmed_days} / {c.num_days} days paid
                          <br />
                          {p.pending_count} pending ({p.pending_days} days)
                        </p>
                        <progress
                          aria-label={`${name(data, p.member_id)} days paid`}
                          value={p.confirmed_days}
                          max={c.num_days}
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
