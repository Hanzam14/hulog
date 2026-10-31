import { useRef, useState } from "react";
import { IconCircleCheck, IconPlus } from "@tabler/icons-react";
import { t, label } from "../i18n";
import type { ViewProps } from "../components/shared";
import { name } from "../components/shared";
import Avatar from "../components/Avatar";
import { rpc, type AbonoEntry } from "../data";
import { newRequestId, submitRecord, useQueueingOffline } from "../outbox";
import { ProofRefField, ProofRefLine } from "../components/ProofRef";
import { cleanProofRef, editAbonoArgs } from "../proofRef";
import SplitPicker from "../components/SplitPicker";
import { NO_SPLIT, owedFieldText, shareLabel, type SplitState } from "../split";
import {
  dismissSuggestion,
  readDismissed,
  recurringSuggestions,
  type RecurringSuggestion,
} from "../recurring";
import { buildSettlementPayload, money, parsePesos } from "../helpers";

function AbonoEditRow({
  entry,
  data,
  user,
  partnerId,
  run,
  busy,
  onDone,
}: {
  entry: AbonoEntry;
  data: ViewProps["data"];
  user: string;
  partnerId: string;
  run: ViewProps["run"];
  busy: boolean;
  onDone: () => void;
}) {
  const isExpense = entry.kind === "expense";
  const [desc, setDesc] = useState(entry.description);
  const [fromMember, setFromMember] = useState(entry.from_member);
  const [total, setTotal] = useState(
    (entry.total_amount_centavos / 100).toFixed(2),
  );
  const [owed, setOwed] = useState(
    (entry.owed_amount_centavos / 100).toFixed(2),
  );
  const [entryDate, setEntryDate] = useState(entry.entry_date);
  const [note, setNote] = useState(entry.note ?? "");
  const [split, setSplit] = useState<SplitState>(NO_SPLIT);
  const owedText = owedFieldText(total, split, fromMember === user, owed);
  // Only the creator can change the reference, and only while it is pending.
  const canEditRef = entry.created_by === user && entry.status === "pending";
  const [proofRef, setProofRef] = useState(entry.proof_ref ?? "");

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    void run(async () => {
      const ref = canEditRef ? cleanProofRef(proofRef) : undefined;
      if (isExpense) {
        const totalCents = parsePesos(total);
        const owedCents = parsePesos(owedText, true);
        const toMember = fromMember === user ? partnerId : user;
        await rpc(
          "edit_abono_entry",
          editAbonoArgs(
            {
              p_id: entry.id,
              p_from_member: fromMember,
              p_to_member: toMember,
              p_description: desc.trim(),
              p_total_amount_centavos: totalCents,
              p_owed_amount_centavos: owedCents,
              p_entry_date: entryDate,
              p_note: note.trim(),
            },
            ref,
          ),
        );
      } else {
        const amt = parsePesos(owed);
        await rpc(
          "edit_abono_entry",
          editAbonoArgs(
            {
              p_id: entry.id,
              p_total_amount_centavos: amt,
              p_owed_amount_centavos: amt,
              p_entry_date: entryDate,
              p_note: note.trim(),
            },
            ref,
          ),
        );
      }
      onDone();
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: "12px" }}>
      {isExpense ? (
        <>
          <label>
            {t("What was it for?")}
            <input
              type="text"
              required
              maxLength={80}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </label>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend
              style={{
                fontWeight: 800,
                fontSize: "13px",
                marginBottom: "4px",
              }}
            >
              {t("Who paid?")}
            </legend>
            <div className="chips">
              <button
                type="button"
                className={`pick ${fromMember === user ? "on" : ""}`}
                onClick={() => setFromMember(user)}
              >
                {t("I paid")}
              </button>
              <button
                type="button"
                className={`pick ${fromMember === partnerId ? "on" : ""}`}
                onClick={() => setFromMember(partnerId)}
              >
                {t("{name} paid", { name: name(data, partnerId) })}
              </button>
            </div>
          </fieldset>
          <label>
            {t("Total receipt (₱)")}
            <input
              type="text"
              inputMode="decimal"
              required
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </label>
          <SplitPicker
            split={split}
            onChange={setSplit}
            otherName={name(data, partnerId)}
            otherIsMe={fromMember !== user}
          />
          <label>
            {shareLabel(
              fromMember !== user,
              name(data, partnerId),
              "₱",
            )}
            <input
              type="text"
              inputMode="decimal"
              required
              value={owedText}
              onChange={(e) => {
                setSplit(NO_SPLIT);
                setOwed(e.target.value);
              }}
            />
          </label>
        </>
      ) : (
        <label>
          {t("Settlement amount (₱)")}
          <input
            type="text"
            inputMode="decimal"
            required
            value={owed}
            onChange={(e) => setOwed(e.target.value)}
          />
        </label>
      )}
      <label>
        {t("Date")}
        <input
          type="date"
          required
          max={data.today}
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
        />
      </label>
      <label>
        {t("Note (optional)")}
        <input
          type="text"
          maxLength={140}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {canEditRef && <ProofRefField value={proofRef} onChange={setProofRef} />}
      <div className="actions">
        <button disabled={busy} type="submit">
          {t("Save correction")}
        </button>
        <button
          type="button"
          className="quiet"
          disabled={busy}
          onClick={onDone}
        >
          {t("Dismiss")}
        </button>
      </div>
    </form>
  );
}

export default function Tracker({ data, user, run, busy }: ViewProps) {
  const partnerId =
    data.memberships.find((m) => m.status === "active" && m.user_id !== user)
      ?.user_id ?? user;

  const abonoSummary = data.abonoSummary ?? [];
  const activeDebt = abonoSummary.find((row) => row.owed_centavos > 0);

  const offline = useQueueingOffline();
  // One key per form attempt, so a double tap or a retry dedupes on the server.
  const addRequestId = useRef(newRequestId());
  const settleRequestId = useRef(newRequestId());
  const [showSettle, setShowSettle] = useState(false);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleNote, setSettleNote] = useState("");
  const [settleRef, setSettleRef] = useState("");

  const remaining = activeDebt
    ? Math.max(
        0,
        activeDebt.owed_centavos - activeDebt.pending_settlement_centavos,
      )
    : 0;

  // Add Expense form state
  const [showAdd, setShowAdd] = useState(false);
  const [description, setDescription] = useState("");
  const [fromMember, setFromMember] = useState(user);
  const [total, setTotal] = useState("");
  const [owed, setOwed] = useState("");
  const [split, setSplit] = useState<SplitState>(NO_SPLIT);
  const owedText = owedFieldText(total, split, fromMember === user, owed);
  const [entryDate, setEntryDate] = useState(data.today);
  const [note, setNote] = useState("");
  const [proofRef, setProofRef] = useState("");

  // Edit entry state
  const [editingId, setEditingId] = useState<string | null>(null);

  // Bills that keep coming back. "Huwag na" hides one until next month.
  const month = data.today.slice(0, 7);
  const [dismissed, setDismissed] = useState(() => ({
    month,
    keys: readDismissed(user, month),
  }));
  // A month rollover while the app stays open starts from a clean slate.
  const shownDismissed =
    dismissed.month === month ? dismissed.keys : readDismissed(user, month);
  const suggestions = recurringSuggestions(
    data.abonoEntries ?? [],
    data.today,
    shownDismissed,
    new Set([user, partnerId]),
  );

  const entries = [...(data.abonoEntries ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  const handleToggleSettle = () => {
    if (!showSettle && remaining > 0) {
      setSettleAmount((remaining / 100).toFixed(2));
    }
    setShowSettle(!showSettle);
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const totalCentavos = parsePesos(total);
    const owedCentavos = parsePesos(owedText, true);
    const toMember = fromMember === user ? partnerId : user;
    void run(async () => {
      const ref = cleanProofRef(proofRef);
      const result = await submitRecord(user, {
        kind: "abono",
        args: {
          p_kind: "expense",
          p_from_member: fromMember,
          p_to_member: toMember,
          p_description: description.trim(),
          p_total_amount_centavos: totalCentavos,
          p_owed_amount_centavos: owedCentavos,
          p_entry_date: entryDate || data.today,
          p_note: note.trim(),
          ...(ref ? { p_proof_ref: ref } : {}),
        },
        id: addRequestId.current,
      });
      addRequestId.current = newRequestId();
      setDescription("");
      setTotal("");
      setOwed("");
      setSplit(NO_SPLIT);
      setNote("");
      setProofRef("");
      setEntryDate(data.today);
      setShowAdd(false);
      return result;
    });
  };

  // Pre-fill only: nothing is recorded until the user submits the form.
  const applySuggestion = (s: RecurringSuggestion) => {
    // A different expense is a new attempt, so it gets its own request key.
    addRequestId.current = newRequestId();
    setDescription(s.description);
    setFromMember(s.payerId);
    setTotal((s.totalCentavos / 100).toFixed(2));
    setOwed((s.owedCentavos / 100).toFixed(2));
    setSplit(NO_SPLIT);
    setEntryDate(data.today);
    setNote("");
    setProofRef("");
    setShowAdd(true);
  };

  return (
    <>
      <h1>{t("Split expenses")}</h1>

      {/* Hero Net Abono Balance Card */}
      <section className="abono-hero abono-sheet">
        {activeDebt ? (
          <div>
            <div className="duo" style={{ margin: "8px 0" }}>
              <figure>
                <Avatar data={data} id={activeDebt.debtor_id} size="md" />
                <figcaption>{name(data, activeDebt.debtor_id)}</figcaption>
              </figure>
              <span
                style={{
                  fontSize: "26px",
                  alignSelf: "center",
                  color: "var(--soft)",
                }}
                aria-hidden="true"
              >
                →
              </span>
              <figure>
                <Avatar data={data} id={activeDebt.creditor_id} size="md" />
                <figcaption>{name(data, activeDebt.creditor_id)}</figcaption>
              </figure>
            </div>

            <div
              style={{
                textAlign: "center",
                margin: "12px 0 8px",
                overflowWrap: "anywhere",
              }}
            >
              <strong
                style={{
                  fontSize: "20px",
                  display: "block",
                  overflowWrap: "anywhere",
                }}
              >
                {t("{debtor} owes {creditor} {amount}", {
                  debtor: name(data, activeDebt.debtor_id),
                  creditor: name(data, activeDebt.creditor_id),
                  amount: money(activeDebt.owed_centavos),
                })}
              </strong>
              {activeDebt.pending_settlement_centavos > 0 &&
                (() => {
                  const pendingSettlements = entries.filter(
                    (e) =>
                      e.kind === "settlement" &&
                      e.status === "pending" &&
                      !e.deleted_at &&
                      e.from_member === activeDebt.debtor_id &&
                      e.to_member === activeDebt.creditor_id,
                  );
                  const confirmers = new Set(
                    pendingSettlements.map((e) => {
                      const actor = e.last_edited_by ?? e.created_by;
                      return actor === activeDebt.debtor_id
                        ? activeDebt.creditor_id
                        : activeDebt.debtor_id;
                    }),
                  );
                  const singleConfirmer =
                    confirmers.size === 1 ? [...confirmers][0] : null;
                  return (
                    <p
                      className="meta"
                      style={{ marginTop: "6px", overflowWrap: "anywhere" }}
                    >
                      {singleConfirmer
                        ? t(
                            "{amount} settlement waiting for {name}'s confirmation",
                            {
                              amount: money(
                                activeDebt.pending_settlement_centavos,
                              ),
                              name: name(data, singleConfirmer),
                            },
                          )
                        : t("{amount} settlement waiting for confirmation", {
                            amount: money(
                              activeDebt.pending_settlement_centavos,
                            ),
                          })}
                    </p>
                  );
                })()}
            </div>

            {remaining > 0 && (
              <div style={{ textAlign: "center", marginTop: "12px" }}>
                <button
                  disabled={busy}
                  onClick={handleToggleSettle}
                  className={showSettle ? "secondary" : ""}
                >
                  {user === activeDebt.debtor_id
                    ? t("Bayaran (Settle)")
                    : t("Natanggap ko (Record settlement)")}
                </button>
              </div>
            )}

            {showSettle && remaining > 0 && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const amt = parsePesos(settleAmount);
                  void run(async () => {
                    const result = await submitRecord(user, {
                      kind: "abono",
                      args: buildSettlementPayload({
                        debtorId: activeDebt.debtor_id,
                        creditorId: activeDebt.creditor_id,
                        amountCentavos: amt,
                        entryDate: data.today,
                        note: settleNote,
                        proofRef: settleRef,
                      }),
                      id: settleRequestId.current,
                    });
                    settleRequestId.current = newRequestId();
                    setShowSettle(false);
                    setSettleNote("");
                    setSettleRef("");
                    return result;
                  });
                }}
              >
                <label>
                  {t("Settlement amount (₱)")}
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                  />
                </label>
                <label>
                  {t("Note (optional)")}
                  <input
                    type="text"
                    maxLength={140}
                    value={settleNote}
                    onChange={(e) => setSettleNote(e.target.value)}
                  />
                </label>
                <ProofRefField value={settleRef} onChange={setSettleRef} />
                <div className="actions">
                  <button disabled={busy} type="submit">
                    {offline
                      ? t("Save for now (offline)")
                      : t("Record settlement")}
                  </button>
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy}
                    onClick={() => setShowSettle(false)}
                  >
                    {t("Dismiss")}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <IconCircleCheck
              size={34}
              aria-hidden="true"
              className="settled-icon"
            />
            <strong>{t("All settled up")}</strong>
          </div>
        )}
        <div className="abono-add">
          {!showAdd && suggestions.length > 0 && (
            <ul className="recurring-list" aria-label={t("Recurring bills")}>
              {suggestions.map((s) => (
                <li key={s.key} className="recurring-row">
                  <button
                    type="button"
                    className="secondary recurring-use"
                    onClick={() => applySuggestion(s)}
                  >
                    {t("Recurring suggestion", {
                      what:
                        s.payerId === user
                          ? s.description
                          : `${s.description} · ${name(data, s.payerId)}`,
                      amount: money(s.totalCentavos),
                    })}
                  </button>
                  <button
                    type="button"
                    className="quiet recurring-skip"
                    aria-label={t("Skip {name} this month", {
                      name: s.description,
                    })}
                    onClick={() =>
                      setDismissed({
                        month,
                        keys: dismissSuggestion(user, month, s.key),
                      })
                    }
                  >
                    {t("Huwag na")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!showAdd ? (
            <button
              type="button"
              className="secondary"
              style={{ width: "100%" }}
              onClick={() => setShowAdd(true)}
            >
              <IconPlus size={18} aria-hidden="true" />{" "}
              {t("Add shared expense")}
            </button>
          ) : (
            <form onSubmit={handleAddExpense}>
              <div className="row">
                <h3>{t("Add shared expense")}</h3>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => setShowAdd(false)}
                >
                  {t("Dismiss")}
                </button>
              </div>

              <label>
                {t("What was it for?")}
                <input
                  type="text"
                  required
                  maxLength={80}
                  placeholder={t("e.g. Meralco, Groceries, Dinner")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>

              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend
                  style={{
                    fontWeight: 800,
                    fontSize: "13px",
                    marginBottom: "4px",
                  }}
                >
                  {t("Who paid?")}
                </legend>
                <div className="chips">
                  <button
                    type="button"
                    className={`pick ${fromMember === user ? "on" : ""}`}
                    onClick={() => setFromMember(user)}
                  >
                    {t("I paid")}
                  </button>
                  <button
                    type="button"
                    className={`pick ${fromMember === partnerId ? "on" : ""}`}
                    onClick={() => setFromMember(partnerId)}
                  >
                    {t("{name} paid", { name: name(data, partnerId) })}
                  </button>
                </div>
              </fieldset>

              <label>
                {t("Total receipt (₱)")}
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="0.00"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                />
              </label>

              <SplitPicker
                split={split}
                onChange={setSplit}
                otherName={name(data, partnerId)}
                otherIsMe={fromMember !== user}
              />

              <label>
                {shareLabel(
                  fromMember !== user,
                  name(data, partnerId),
                  "₱",
                )}
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="0.00"
                  value={owedText}
                  onChange={(e) => {
                    setSplit(NO_SPLIT);
                    setOwed(e.target.value);
                  }}
                />
              </label>

              <label>
                {t("Date")}
                <input
                  type="date"
                  required
                  max={data.today}
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                />
              </label>

              <label>
                {t("Note (optional)")}
                <input
                  type="text"
                  maxLength={140}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <ProofRefField value={proofRef} onChange={setProofRef} />

              <button disabled={busy} type="submit">
                {offline ? t("Save for now (offline)") : t("Record expense")}
              </button>
              {offline && (
                <p className="offline-hint" role="status">
                  {t(
                    "You're offline. This will be saved on this phone and sent when you're back online.",
                  )}
                </p>
              )}
            </form>
          )}
        </div>
        {entries.length === 0 && (
          <p className="abono-empty">
            {t("No shared expenses yet. Log a bill or abono above.")}
          </p>
        )}
      </section>

      {/* Chronological Abono Entries List */}
      {entries.length > 0 && (
        <section className="abono-entries">
          {entries.map((e) => (
            <article className="entry abono-entry" key={e.id}>
              <div className="row">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <Avatar data={data} id={e.from_member} size="sm" />
                  <div>
                    <strong>
                      {e.description === "Settlement"
                        ? t("Settlement")
                        : e.description}
                    </strong>
                    <p>
                      {e.kind === "expense"
                        ? `${name(data, e.to_member)}, ${
                            e.owed_amount_centavos === 0
                              ? t("Owes nothing of {total}", {
                                  total: money(e.total_amount_centavos),
                                })
                              : t("Owes {amount} of {total}", {
                                  amount: money(e.owed_amount_centavos),
                                  total: money(e.total_amount_centavos),
                                })
                          }`
                        : `${name(data, e.from_member)} → ${name(
                            data,
                            e.to_member,
                          )}, ${t("Paid {amount} settlement", {
                            amount: money(e.owed_amount_centavos),
                          })}`}
                    </p>
                    <p className="meta">
                      {e.entry_date}
                      {e.note ? `, ${e.note}` : ""}
                    </p>
                    <ProofRefLine value={e.proof_ref} />
                  </div>
                </div>
                <span className="chip">
                  {e.deleted_at
                    ? t("Deleted")
                    : e.delete_proposed_by
                      ? t("Deletion requested")
                      : label(e.status)}
                </span>
              </div>

              {!e.deleted_at && (
                <>
                  <div className="actions">
                    {e.status === "pending" &&
                      (e.last_edited_by ?? e.created_by) !== user && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              rpc("confirm_abono_entry", { p_id: e.id }),
                            )
                          }
                        >
                          {t("Confirm")}
                        </button>
                      )}

                    {!e.delete_proposed_by && (
                      <button
                        className="quiet"
                        disabled={busy}
                        onClick={() =>
                          setEditingId(editingId === e.id ? null : e.id)
                        }
                      >
                        {t("Edit entry")}
                      </button>
                    )}

                    {e.status === "pending" && (
                      <button
                        className="quiet danger"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            rpc("edit_abono_entry", {
                              p_id: e.id,
                              p_delete: true,
                            }),
                          )
                        }
                      >
                        {t("Delete")}
                      </button>
                    )}

                    {e.status === "confirmed" && !e.delete_proposed_by && (
                      <button
                        className="quiet danger"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            rpc("edit_abono_entry", {
                              p_id: e.id,
                              p_delete: true,
                            }),
                          )
                        }
                      >
                        {t("Propose delete")}
                      </button>
                    )}

                    {e.delete_proposed_by && e.delete_proposed_by !== user && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              rpc("respond_delete_abono_entry", {
                                p_id: e.id,
                                p_action: "accept",
                              }),
                            )
                          }
                        >
                          {t("Confirm delete")}
                        </button>
                        <button
                          className="quiet"
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              rpc("respond_delete_abono_entry", {
                                p_id: e.id,
                                p_action: "decline",
                              }),
                            )
                          }
                        >
                          {t("Cancel delete")}
                        </button>
                      </>
                    )}

                    {e.delete_proposed_by && e.delete_proposed_by === user && (
                      <button
                        className="quiet"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            rpc("respond_delete_abono_entry", {
                              p_id: e.id,
                              p_action: "cancel",
                            }),
                          )
                        }
                      >
                        {t("Cancel delete")}
                      </button>
                    )}
                  </div>

                  {editingId === e.id && (
                    <AbonoEditRow
                      entry={e}
                      data={data}
                      user={user}
                      partnerId={partnerId}
                      run={run}
                      busy={busy}
                      onDone={() => setEditingId(null)}
                    />
                  )}
                </>
              )}
            </article>
          ))}
        </section>
      )}
    </>
  );
}
