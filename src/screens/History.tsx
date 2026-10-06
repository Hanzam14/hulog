import { useState } from "react";
import type { ViewProps } from "../components/shared";
import { byNewest, closed, name } from "../components/shared";
import { rpc } from "../data";
import { money, parsePesos } from "../helpers";
import CycleCard from "../components/CycleCard";

export default function History({ data, user, run, busy }: ViewProps) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <>
      <h1>Past pots & debts</h1>
      {data.cycles
        .filter(
          (c) =>
            closed(c) || c.status === "declined" || c.status === "cancelled",
        )
        .sort(byNewest)
        .map((c) => (
          <section key={c.id}>
            <CycleCard c={c} data={data} />
            <p>
              <strong>{c.payout_state ?? c.status}</strong>
            </p>
            {data.progress
              .filter(
                (p) => p.cycle_id === c.id && p.member_id !== c.receiver_id,
              )
              .map((p) => (
                <div key={p.member_id}>
                  <h3>
                    {name(data, p.member_id)} · Owes {money(p.debt_centavos)}
                  </h3>
                  {p.debt_centavos > 0 && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void run(() =>
                          rpc("record_repayment", {
                            p_cycle_id: c.id,
                            p_debtor_id: p.member_id,
                            p_amount_centavos: parsePesos(
                              String(f.get("amount")),
                            ),
                          }),
                        );
                      }}
                    >
                      <label>
                        Repayment amount (₱)
                        <input
                          name="amount"
                          inputMode="decimal"
                          required
                          defaultValue={(p.debt_centavos / 100).toFixed(2)}
                        />
                      </label>
                      <button disabled={busy}>Record repayment</button>
                    </form>
                  )}
                </div>
              ))}
            {data.repayments
              .filter((r) => r.cycle_id === c.id)
              .map((r) => (
                <article className="entry" key={r.id}>
                  <strong>
                    {name(data, r.debtor_id)} → {name(data, r.creditor_id)}
                  </strong>
                  <p>
                    {money(r.amount_centavos)} ·{" "}
                    {r.deleted_at ? "Deleted" : r.status}
                  </p>
                  {!r.deleted_at && (
                    <>
                      <div className="actions">
                        {r.status === "pending" && r.creditor_id === user && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              run(() =>
                                rpc("confirm_repayment", { p_id: r.id }),
                              )
                            }
                          >
                            Confirm repayment
                          </button>
                        )}
                        <button
                          className="quiet"
                          disabled={busy}
                          onClick={() =>
                            setEditing(editing === r.id ? null : r.id)
                          }
                        >
                          Edit amount
                        </button>
                        <button
                          className="quiet danger"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm("Delete this repayment record?"))
                              void run(() =>
                                rpc("edit_repayment", {
                                  p_id: r.id,
                                  p_delete: true,
                                }),
                              );
                          }}
                        >
                          Delete
                        </button>
                      </div>
                      {editing === r.id && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void run(async () => {
                              await rpc("edit_repayment", {
                                p_id: r.id,
                                p_amount_centavos: parsePesos(
                                  String(f.get("amount")),
                                ),
                              });
                              setEditing(null);
                            });
                          }}
                        >
                          <label>
                            Correct amount (₱)
                            <input
                              name="amount"
                              inputMode="decimal"
                              defaultValue={(r.amount_centavos / 100).toFixed(
                                2,
                              )}
                              required
                            />
                          </label>
                          <button disabled={busy}>Save correction</button>
                        </form>
                      )}
                    </>
                  )}
                </article>
              ))}
          </section>
        ))}
      {!data.cycles.some(
        (c) => closed(c) || ["declined", "cancelled"].includes(c.status),
      ) && <p>Past cycles will appear here.</p>}
    </>
  );
}
