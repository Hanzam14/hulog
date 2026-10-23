import { useRef, useState, type FormEvent } from "react";
import {
  IconCheck,
  IconHeartFilled,
  IconStarFilled,
} from "@tabler/icons-react";
import type { Cycle, Snapshot } from "../data";
import { rpc } from "../data";
import { money, parsePesos, shortDate } from "../helpers";
import { t, label } from "../i18n";
import { closed, name, type Run } from "./shared";
import { celebratePayout } from "./confetti";
import Avatar from "./Avatar";

/** Closed-cycle receipt and append-only record of cash already withdrawn. */
export default function Payout({
  c,
  data,
  user,
  run,
  busy,
}: {
  c: Cycle;
  data: Snapshot;
  user: string;
  run: Run;
  busy: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  if (!closed(c)) return null;

  const withdrawals = (data.payoutWithdrawals ?? [])
    .filter((entry) => entry.cycle_id === c.id)
    .sort(
      (a, b) =>
        b.withdrawal_date.localeCompare(a.withdrawal_date) ||
        b.created_at.localeCompare(a.created_at),
    );
  const activeWithdrawn = withdrawals
    .filter((entry) => !entry.voided_at)
    .reduce((sum, entry) => sum + entry.amount_centavos, 0);
  const held = c.held_centavos ?? Math.max(0, c.pot_centavos - activeWithdrawn);
  const holder =
    c.holder_id ?? data.wallets?.find((w) => w.id === c.wallet_id)?.holder_id;
  const done = c.payout_state === "Received";
  const fullLedgerWithdrawal =
    c.pot_centavos > 0 &&
    (c.withdrawn_centavos ?? activeWithdrawn) >= c.pot_centavos;
  const canAcknowledgeFullWithdrawal =
    c.status === "accepted" &&
    done &&
    fullLedgerWithdrawal &&
    !c.received_at &&
    holder != null &&
    holder !== c.receiver_id &&
    c.receiver_id === user;
  const canRecord =
    c.status === "accepted" &&
    !c.received_at &&
    holder != null &&
    holder !== c.receiver_id &&
    (user === holder || user === c.receiver_id) &&
    held > 0;
  const acknowledged = done ? c.pot_centavos : activeWithdrawn;

  const submitWithdrawal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    void run(async () => {
      try {
        await rpc("record_payout_withdrawal", {
          p_cycle_id: c.id,
          p_amount_centavos: parsePesos(String(form.get("amount"))),
          p_note: form.get("note"),
          p_withdrawal_date: form.get("date") || data.today,
        });
        setShowForm(false);
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    });
  };

  return (
    <div
      className={`celebrate ${done ? "done" : ""} ${withdrawals.length > 0 || showForm ? "has-payout-details" : ""}`}
    >
      <IconStarFilled className="spark s1" aria-hidden="true" />
      <IconHeartFilled className="spark s2" aria-hidden="true" />
      <IconStarFilled className="spark s3" aria-hidden="true" />
      <Avatar data={data} id={c.receiver_id} size="lg" />
      <strong>{money(c.pot_centavos)}</strong>
      <span className="meta">{t("Original pot")}</span>
      <div className="payout-balances" aria-label={t("Payout balance")}>
        <span>
          {t("Received or withdrawn")}: <strong>{money(acknowledged)}</strong>
        </span>
        {holder && held > 0 ? (
          <span>
            {t(user === holder ? "Still held by you" : "Still held by {name}", {
              name: name(data, holder),
            })}
            : <strong>{money(held)}</strong>
          </span>
        ) : (
          <span>{t("No amount remains held")}</span>
        )}
      </div>
      {c.withdrawn_centavos != null &&
        c.withdrawn_centavos > c.pot_centavos && (
          <p className="notice" role="alert">
            {t("Withdrawals exceed the corrected pot by {amount}", {
              amount: money(c.withdrawn_centavos - c.pot_centavos),
            })}
          </p>
        )}
      <span className="meta">{label(c.payout_state ?? "")}</span>
      {done && (
        <p className="payout-congrats">
          {t("Congrats, {name}! Nasa'yo na ang hulog.", {
            name: name(data, c.receiver_id),
          })}
        </p>
      )}
      {!done && c.receiver_id === user && (
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              await rpc("receive_payout", { p_id: c.id });
              celebratePayout(c.id, data);
            })
          }
        >
          {held > 0
            ? t("got it — receive remaining {amount}", {
                amount: money(held),
              })
            : t("got it")}{" "}
          <IconCheck size={18} aria-hidden="true" />
        </button>
      )}
      {canAcknowledgeFullWithdrawal && (
        <button
          type="button"
          className="quiet"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await rpc("receive_payout", { p_id: c.id });
              celebratePayout(c.id, data);
            })
          }
        >
          {t("Confirm fully received")}{" "}
          <IconCheck size={18} aria-hidden="true" />
        </button>
      )}
      {canRecord && !showForm && (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => setShowForm(true)}
        >
          {t("Record pot withdrawal")}
        </button>
      )}
      {canRecord && showForm && (
        <form onSubmit={submitWithdrawal} className="payout-withdrawal-form">
          <label>
            {t("Amount (₱)")}
            <input
              name="amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max={(held / 100).toFixed(2)}
              required
              autoFocus
            />
          </label>
          <details>
            <summary>{t("Details (optional)")}</summary>
            <label>
              {t("Date")}
              <input
                name="date"
                type="date"
                min={c.start_date}
                max={data.today}
                defaultValue={data.today}
              />
            </label>
            <label>
              {t("Note (optional)")}
              <input name="note" maxLength={140} />
            </label>
          </details>
          <button type="submit" disabled={busy || submitting}>
            {t("Save withdrawal")}
          </button>
          <button
            type="button"
            className="quiet"
            disabled={busy || submitting}
            onClick={() => setShowForm(false)}
          >
            {t("Cancel")}
          </button>
        </form>
      )}
      {withdrawals.length > 0 && (
        <div className="payout-withdrawal-history">
          <h3>{t("Withdrawal history")}</h3>
          {withdrawals.map((entry) => (
            <article
              className={`entry${entry.voided_at ? " payout-withdrawal-voided" : ""}`}
              key={entry.id}
            >
              <div className="row">
                <strong>{money(entry.amount_centavos)}</strong>
                <span>{shortDate(entry.withdrawal_date)}</span>
              </div>
              <p>
                {t("Recorded by {name}", {
                  name: name(data, entry.created_by),
                })}
                {entry.note ? ` · ${entry.note}` : ""}
              </p>
              {entry.voided_at && (
                <span
                  className="payout-withdrawal-voided-label"
                  aria-label={t("Voided")}
                >
                  {t("Voided")}
                </span>
              )}
              {!entry.voided_at &&
                !c.received_at &&
                (user === holder || user === c.receiver_id) && (
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        rpc("void_payout_withdrawal", { p_id: entry.id }),
                      )
                    }
                  >
                    {t("Undo withdrawal")}
                  </button>
                )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
