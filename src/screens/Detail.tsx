import { t, label } from "../i18n";
import PendingPaymentActions from "../components/PendingPaymentActions";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ViewProps } from "../components/shared";
import { name } from "../components/shared";
import { rpc } from "../data";
import { money } from "../helpers";
import CycleCard from "../components/CycleCard";
import Proposal from "../components/Proposal";
import Payout from "../components/Payout";

export default function Detail({ data, user, run, busy }: ViewProps) {
  const { id } = useParams();
  const c = data.cycles.find((cycle) => cycle.id === id);
  const [editing, setEditing] = useState<string | null>(null);
  if (!c)
    return (
      <p>
        {t("Cycle unavailable.")} <Link to="/">{t("Go home")}</Link>
      </p>
    );
  return (
    <>
      <h1>{t("Cycle detail")}</h1>
      <section>
        <CycleCard c={c} data={data} />
        {c.status === "proposed" && (
          <Proposal c={c} user={user} run={run} busy={busy} />
        )}
      </section>
      <section>
        <h2>{t("Payments")}</h2>
        {data.payments
          .filter((p) => p.cycle_id === id)
          .map((p) => (
            <article className="entry" key={p.id}>
              <div className="row">
                <strong>
                  {name(data, p.member_id)} · {p.days} {t("days")}
                </strong>
                <span className="chip">
                  {p.deleted_at
                    ? t("Deleted")
                    : p.status === "pending" &&
                        c.phase === "ended" &&
                        !p.was_confirmed
                      ? t("Unconfirmed — not counted")
                      : label(p.status)}
                </span>
              </div>
              <p>
                {money(p.amount_centavos)} · {p.created_at.slice(0, 10)}
              </p>
              {!p.deleted_at && (
                <>
                  <div className="actions">
                    <button
                      className="quiet"
                      disabled={busy}
                      onClick={() => setEditing(editing === p.id ? null : p.id)}
                    >
                      {t("Edit days")}
                    </button>
                    <button
                      className="quiet danger"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            t(
                              "Delete this payment record? The change stays in history.",
                            ),
                          )
                        )
                          void run(() =>
                            rpc("edit_payment", { p_id: p.id, p_delete: true }),
                          );
                      }}
                    >
                      {t("Delete")}
                    </button>
                    {data.groups[0].owner_id === user &&
                      p.status === "pending" && (
                        <PendingPaymentActions
                          id={p.id}
                          memberName={name(data, p.member_id)}
                          amount={p.amount_centavos}
                          allowed={c.phase !== "ended" || p.was_confirmed}
                          busy={busy}
                          run={run}
                        />
                      )}
                  </div>
                  {editing === p.id && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void run(async () => {
                          await rpc("edit_payment", {
                            p_id: p.id,
                            p_days: Number(f.get("days")),
                          });
                          setEditing(null);
                        });
                      }}
                    >
                      <label>
                        {t("Correct number of days")}
                        <input
                          name="days"
                          type="number"
                          min="1"
                          max={c.num_days}
                          defaultValue={p.days}
                          required
                        />
                      </label>
                      <button disabled={busy}>{t("Save correction")}</button>
                    </form>
                  )}
                </>
              )}
            </article>
          ))}
      </section>
      <Payout c={c} data={data} user={user} run={run} busy={busy} />
    </>
  );
}
