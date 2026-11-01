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
import {
  NO_SPLIT,
  owedFieldText,
  parsePercent,
  shareLabel,
  type SplitState,
} from "../split";
import {
  dismissSuggestion,
  readDismissed,
  recurringSuggestions,
  type RecurringSuggestion,
} from "../recurring";
import { buildSettlementPayload, money, parsePesos } from "../helpers";

function computeSplitPreview(
  totalText: string,
  owedText: string,
  payerName: string,
  otherName: string,
  payerIsMe: boolean,
): { total: number; payerShare: number; owed: number; line1: string; line2: string } | null {
  try {
    if (!totalText.trim() || !owedText.trim()) return null;
    const total = parsePesos(totalText);
    const owed = parsePesos(owedText, true);
    if (owed > total) return null;
    const payerShare = total - owed;
    const line1 = payerIsMe
      ? `${t("Total tracked")}: ${money(total)} · ${t("Your share {share}", {
          share: money(payerShare),
        })}`
      : t("Total {total} · {payer} share {payerShare}", {
          total: money(total),
          payer: payerName,
          payerShare: money(payerShare),
        });
    const line2 =
      owed === 0
        ? t("Nothing owed")
        : payerIsMe
          ? t("{debtor} owes {creditor}: {amount}", {
              debtor: otherName,
              creditor: payerName,
              amount: money(owed),
            })
          : t("{debtor} owes {creditor}: {amount}", {
              debtor: payerName,
              creditor: otherName,
              amount: money(owed),
            });
    return { total, payerShare, owed, line1, line2 };
  } catch {
    return null;
  }
}

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
  const [detailsOpen, setDetailsOpen] = useState(
    Boolean(entry.note || entry.proof_ref || entry.entry_date !== data.today),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const preview = isExpense
    ? computeSplitPreview(
        total,
        owedText,
        name(data, fromMember),
        name(data, fromMember === user ? partnerId : user),
        fromMember === user,
      )
    : null;

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    let ref: string | null | undefined;
    try {
      ref = canEditRef ? cleanProofRef(proofRef) : undefined;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDetailsOpen(true);
      setFormError(label(msg));
      return;
    }
    if (entryDate > data.today) {
      setDetailsOpen(true);
      setFormError(t("Entry date cannot be in the future"));
      return;
    }
    if (note.trim().length > 140) {
      setDetailsOpen(true);
      setFormError(t("Note must be at most 140 characters"));
      return;
    }
    if (isExpense && split.choice === "custom" && parsePercent(split.percent) === null) {
      setFormError(t("Enter a positive amount."));
      return;
    }
    setFormError(null);
    void run(async () => {
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
          {preview && (
            <div className="split-preview" role="status">
              <small>{preview.line1}</small>
              <strong>{preview.line2}</strong>
            </div>
          )}
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
      <details
        className="form-optional"
        open={detailsOpen}
        onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
      >
        <summary>{t("Date, note & payment ref (optional)")}</summary>
        <div className="form-optional-body">
          <label>
            {t("Date")}
            <input
              type="date"
              required
              max={data.today}
              value={entryDate}
              onChange={(e) => {
                setEntryDate(e.target.value);
                if (formError) setFormError(null);
              }}
            />
          </label>
          <label>
            {t("Note (optional)")}
            <input
              type="text"
              maxLength={140}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                if (formError) setFormError(null);
              }}
            />
          </label>
          {canEditRef && (
            <ProofRefField
              value={proofRef}
              onChange={(val) => {
                setProofRef(val);
                if (formError) setFormError(null);
              }}
            />
          )}
        </div>
      </details>
      {formError && (
        <p className="field-error" role="alert">
          {formError}
        </p>
      )}
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
  // IMPORTANT: Keep indices 0..14 in exact order for batch1Ux.test.ts compatibility!
  const [showSettle, setShowSettle] = useState(false); // 0
  const [settleAmount, setSettleAmount] = useState(""); // 1
  const [settleNote, setSettleNote] = useState(""); // 2
  const [settleRef, setSettleRef] = useState(""); // 3

  const remaining = activeDebt
    ? Math.max(
        0,
        activeDebt.owed_centavos - activeDebt.pending_settlement_centavos,
      )
    : 0;

  // Add Expense form state
  const [showAdd, setShowAdd] = useState(false); // 4
  const [description, setDescription] = useState(""); // 5
  const [fromMember, setFromMember] = useState(user); // 6
  const [total, setTotal] = useState(""); // 7
  const [owed, setOwed] = useState(""); // 8
  const [split, setSplit] = useState<SplitState>({ choice: "half", percent: "" }); // 9
  const owedText = owedFieldText(total, split, fromMember === user, owed);
  const [entryDate, setEntryDate] = useState(data.today); // 10
  const [note, setNote] = useState(""); // 11
  const [proofRef, setProofRef] = useState(""); // 12

  // Edit entry state
  const [editingId, setEditingId] = useState<string | null>(null); // 13

  // Bills that keep coming back. "Huwag na" hides one until next month.
  const month = data.today.slice(0, 7);
  const [dismissed, setDismissed] = useState(() => ({
    month,
    keys: readDismissed(user, month),
  })); // 14

  // Additional UI disclosure & validation state appended AFTER index 14:
  const [addDetailsOpen, setAddDetailsOpen] = useState(false); // 15
  const [addFormError, setAddFormError] = useState<string | null>(null); // 16
  const [settleDetailsOpen, setSettleDetailsOpen] = useState(false); // 17
  const [settleFormError, setSettleFormError] = useState<string | null>(null); // 18

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
    setSettleFormError(null);
    setShowSettle(!showSettle);
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    let ref: string | null = null;
    try {
      ref = cleanProofRef(proofRef);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAddDetailsOpen(true);
      setAddFormError(label(msg));
      return;
    }
    if ((entryDate || data.today) > data.today) {
      setAddDetailsOpen(true);
      setAddFormError(t("Entry date cannot be in the future"));
      return;
    }
    if (note.trim().length > 140) {
      setAddDetailsOpen(true);
      setAddFormError(t("Note must be at most 140 characters"));
      return;
    }
    if (split.choice === "custom" && parsePercent(split.percent) === null) {
      setAddFormError(t("Enter a positive amount."));
      return;
    }
    let totalCentavos: number;
    let owedCentavos: number;
    try {
      totalCentavos = parsePesos(total);
      owedCentavos = parsePesos(owedText, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAddFormError(label(msg));
      return;
    }
    setAddFormError(null);
    const toMember = fromMember === user ? partnerId : user;
    void run(async () => {
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
      setSplit({ choice: "half", percent: "" });
      setNote("");
      setProofRef("");
      setEntryDate(data.today);
      setAddDetailsOpen(false);
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
    setAddFormError(null);
    setShowAdd(true);
  };

  const expensePreview = computeSplitPreview(
    total,
    owedText,
    name(data, fromMember),
    name(data, partnerId),
    fromMember === user,
  );

  let settlePreviewCentavos: number | null = null;
  try {
    if (settleAmount.trim()) settlePreviewCentavos = parsePesos(settleAmount);
  } catch {
    settlePreviewCentavos = null;
  }

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
                  try {
                    cleanProofRef(settleRef);
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    setSettleDetailsOpen(true);
                    setSettleFormError(label(msg));
                    return;
                  }
                  if (settleNote.trim().length > 140) {
                    setSettleDetailsOpen(true);
                    setSettleFormError(t("Note must be at most 140 characters"));
                    return;
                  }
                  let amt: number;
                  try {
                    amt = parsePesos(settleAmount);
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    setSettleFormError(label(msg));
                    return;
                  }
                  setSettleFormError(null);
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
                    setSettleDetailsOpen(false);
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
                    onChange={(e) => {
                      setSettleAmount(e.target.value);
                      if (settleFormError) setSettleFormError(null);
                    }}
                  />
                </label>
                {settlePreviewCentavos !== null && (
                  <strong className="amount-preview">
                    {money(settlePreviewCentavos)}
                  </strong>
                )}
                <details
                  className="form-optional"
                  open={settleDetailsOpen}
                  onToggle={(e) => setSettleDetailsOpen(e.currentTarget.open)}
                >
                  <summary>{t("Note & payment ref (optional)")}</summary>
                  <div className="form-optional-body">
                    <label>
                      {t("Note (optional)")}
                      <input
                        type="text"
                        maxLength={140}
                        value={settleNote}
                        onChange={(e) => {
                          setSettleNote(e.target.value);
                          if (settleFormError) setSettleFormError(null);
                        }}
                      />
                    </label>
                    <ProofRefField
                      value={settleRef}
                      onChange={(val) => {
                        setSettleRef(val);
                        if (settleFormError) setSettleFormError(null);
                      }}
                    />
                  </div>
                </details>
                {settleFormError && (
                  <p className="field-error" role="alert">
                    {settleFormError}
                  </p>
                )}
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
                  onChange={(e) => {
                    setTotal(e.target.value);
                    if (addFormError) setAddFormError(null);
                  }}
                />
              </label>

              <SplitPicker
                split={split}
                onChange={(next) => {
                  setSplit(next);
                  if (addFormError) setAddFormError(null);
                }}
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
                    if (addFormError) setAddFormError(null);
                  }}
                />
              </label>

              {expensePreview && (
                <div className="split-preview" role="status" aria-label={t("Split summary")}>
                  <small>{expensePreview.line1}</small>
                  <strong>{expensePreview.line2}</strong>
                </div>
              )}

              <details
                className="form-optional"
                open={addDetailsOpen}
                onToggle={(e) => setAddDetailsOpen(e.currentTarget.open)}
              >
                <summary>{t("Date, note & payment ref (optional)")}</summary>
                <div className="form-optional-body">
                  <label>
                    {t("Date")}
                    <input
                      type="date"
                      required
                      max={data.today}
                      value={entryDate}
                      onChange={(e) => {
                        setEntryDate(e.target.value);
                        if (addFormError) setAddFormError(null);
                      }}
                    />
                  </label>

                  <label>
                    {t("Note (optional)")}
                    <input
                      type="text"
                      maxLength={140}
                      value={note}
                      onChange={(e) => {
                        setNote(e.target.value);
                        if (addFormError) setAddFormError(null);
                      }}
                    />
                  </label>
                  <ProofRefField
                    value={proofRef}
                    onChange={(val) => {
                      setProofRef(val);
                      if (addFormError) setAddFormError(null);
                    }}
                  />
                </div>
              </details>

              {addFormError && (
                <p className="field-error" role="alert">
                  {addFormError}
                </p>
              )}

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
