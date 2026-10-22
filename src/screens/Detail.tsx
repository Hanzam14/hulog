import { t, label } from "../i18n";
import PendingPaymentActions from "../components/PendingPaymentActions";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { IconArrowLeft } from "@tabler/icons-react";
import type { ViewProps } from "../components/shared";
import { name } from "../components/shared";
import { rpc } from "../data";
import { money, shortDate } from "../helpers";
import CycleCard from "../components/CycleCard";
import Proposal from "../components/Proposal";
import Payout from "../components/Payout";
import GivePayout from "../components/GivePayout";
import CloseEarly from "../components/CloseEarly";

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

  const allActiveWallets = (data.wallets ?? []).filter((w) => !w.archived_at);
  const canMoveWallet =
    c.status === "accepted" &&
    c.payout_state !== "Received" &&
    allActiveWallets.length > 1;
  const isAfterEndDate = c.phase === "settling" || c.phase === "ended";
  const candidateWallets = allActiveWallets.filter((w) => {
    if (w.id === c.wallet_id) return false;
    if (isAfterEndDate) {
      return user === c.holder_id && w.holder_id === c.holder_id;
    }
    return true;
  });
  const pendingWallet = (data.wallets ?? []).find(
    (w) => w.id === c.pending_wallet_id,
  );

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "8px",
        }}
      >
        <Link to="/" className="back" aria-label={t("Back")}>
          <IconArrowLeft />
        </Link>
        <h1 style={{ margin: 0, fontSize: "20px" }}>{t("Cycle detail")}</h1>
      </div>
      <section>
        <CycleCard c={c} data={data} user={user} />
        <GivePayout c={c} data={data} user={user} run={run} busy={busy} />
        <CloseEarly c={c} data={data} user={user} run={run} busy={busy} />
        {c.status === "proposed" && (
          <Proposal c={c} user={user} run={run} busy={busy} />
        )}
        {canMoveWallet && (
          <div className="cycle-wallet-control" style={{ marginTop: "12px" }}>
            {c.pending_wallet_id ? (
              <div className="notice" role="alert">
                <p style={{ margin: "0 0 8px" }}>
                  {t("Wallet change proposed: {wallet}", {
                    wallet: pendingWallet?.label ?? "",
                  })}
                </p>
                <div className="actions" style={{ margin: 0 }}>
                  {c.wallet_proposed_by === user ? (
                    <button
                      type="button"
                      className="quiet danger"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          rpc("respond_cycle_wallet", {
                            p_cycle_id: c.id,
                            p_action: "cancel",
                          }),
                        )
                      }
                    >
                      {t("Cancel wallet move")}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            rpc("respond_cycle_wallet", {
                              p_cycle_id: c.id,
                              p_action: "accept",
                            }),
                          )
                        }
                      >
                        {t("Accept wallet move")}
                      </button>
                      <button
                        type="button"
                        className="quiet danger"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            rpc("respond_cycle_wallet", {
                              p_cycle_id: c.id,
                              p_action: "decline",
                            }),
                          )
                        }
                      >
                        {t("Decline wallet move")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              candidateWallets.length > 0 && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const targetId = String(f.get("wallet_id"));
                    if (!targetId) return;
                    void run(() =>
                      rpc("propose_cycle_wallet", {
                        p_cycle_id: c.id,
                        p_wallet_id: targetId,
                      }),
                    );
                  }}
                  style={{ display: "grid", gap: "8px" }}
                >
                  <label
                    style={{
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "var(--soft)",
                    }}
                  >
                    {t("Move pot to another wallet")}
                    <select name="wallet_id" defaultValue="" required>
                      <option value="" disabled>
                        -- {t("Move pot to another wallet")} --
                      </option>
                      {candidateWallets.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.label} ({name(data, w.holder_id)})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="secondary"
                    disabled={busy}
                    style={{ justifySelf: "start" }}
                  >
                    {t("Move pot to another wallet")}
                  </button>
                </form>
              )
            )}
          </div>
        )}
      </section>
      <section>
        <h2>{t("Payments")}</h2>
        {data.payments.filter((p) => p.cycle_id === id).length === 0 ? (
          <p className="muted">{t("No payments yet.")}</p>
        ) : (
          data.payments
            .filter((p) => p.cycle_id === id)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((p) => (
            <article className="entry pay-row" key={p.id}>
              <div className="row">
                <span>
                  <b>{name(data, p.member_id)}</b> · {p.days}{" "}
                  {t(p.days === 1 ? "day" : "days")}
                </span>
                <b>{money(p.amount_centavos)}</b>
              </div>
              <p>
                {shortDate(
                  new Date(p.created_at).toLocaleDateString("en-CA", {
                    timeZone: "Asia/Manila",
                  }),
                )}
                {p.status !== "confirmed" || p.deleted_at ? (
                  <>
                    {" · "}
                    <span className="chip">
                      {p.deleted_at
                        ? t("Deleted")
                        : p.status === "pending" &&
                            c.phase === "ended" &&
                            !p.was_confirmed
                          ? t("Unconfirmed — not counted")
                          : label(p.status)}
                    </span>
                  </>
                ) : null}
                {p.note && <i> · {p.note}</i>}
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
                    {p.member_id !== user && p.status === "pending" && (
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
                        const newDays = Number(f.get("days"));
                        const noteVal = f.get("note")
                          ? String(f.get("note")).trim()
                          : "";
                        void run(async () => {
                          const payload: Record<string, unknown> = {
                            p_id: p.id,
                            p_days: newDays,
                            p_note: noteVal,
                          };
                          await rpc("edit_payment", payload);
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
                      <label>
                        {t("Note or ref # (optional)")}
                        <input
                          name="note"
                          type="text"
                          maxLength={140}
                          defaultValue={p.note ?? ""}
                          placeholder={t("e.g. GCash ref #1234")}
                        />
                      </label>
                      <button disabled={busy}>{t("Save correction")}</button>
                      <button
                        type="button"
                        className="quiet"
                        disabled={busy}
                        onClick={() => setEditing(null)}
                      >
                        {t("Cancel")}
                      </button>
                    </form>
                  )}
                </>
              )}
            </article>
          )))}
      </section>
      <Payout c={c} data={data} user={user} run={run} busy={busy} />
    </>
  );
}
