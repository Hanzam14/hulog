import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  IconArrowLeft,
  IconCheck,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import Avatar from "../components/Avatar";
import IponCard from "../components/IponCard";
import Tally from "../components/Tally";
import type { ViewProps } from "../components/shared";
import { name, tone } from "../components/shared";
import { rpc } from "../data";
import { money, parsePesos, shortDate } from "../helpers";
import { label, t } from "../i18n";

/** Route /ipon/:id: Goal detail, custody, actions, and contribution history. */
export default function IponDetail({ data, user, run, busy }: ViewProps) {
  const { id } = useParams();
  const g = (data.savingsGoals ?? []).find((goal) => goal.id === id);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSteps, setEditSteps] = useState("1");
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [movingWallet, setMovingWallet] = useState(false);

  if (!g) {
    return (
      <p>
        {t("Goal unavailable.")} <Link to="/">{t("Go home")}</Link>
      </p>
    );
  }

  const activeMemberIds = new Set(
    data.memberships
      .filter((m) => m.status === "active")
      .map((m) => m.user_id),
  );
  const activeWallets = (data.wallets ?? []).filter(
    (w) => !w.archived_at && activeMemberIds.has(w.holder_id),
  );

  const contributions = (data.savingsContributions ?? [])
    .filter((c) => c.goal_id === g.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const hasPendingOrDelete = contributions.some(
    (c) => !c.deleted_at && (c.status === "pending" || Boolean(c.delete_proposed_by)),
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
        <h1 style={{ margin: 0, fontSize: "22px" }}>{t("Ipon detail")}</h1>
      </div>

      <section>
        <IponCard g={g} data={data} />

        {/* Proposed state: Accept / Decline / Cancel */}
        {g.status === "proposed" && (
          <div className="answer">
            {g.proposed_by === user ? (
              <>
                <span className="waiting">{t("waiting…")}</span>
                <button
                  className="round secondary"
                  aria-label={t("Cancel proposal")}
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      rpc("respond_savings_goal", {
                        p_id: g.id,
                        p_action: "cancel",
                      }),
                    )
                  }
                >
                  <IconX />
                </button>
              </>
            ) : data.today <= g.start_date ? (
              <>
                <button
                  className="round no"
                  aria-label={t("Decline")}
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      rpc("respond_savings_goal", {
                        p_id: g.id,
                        p_action: "decline",
                      }),
                    )
                  }
                >
                  <IconX />
                </button>
                <button
                  className="round ok"
                  aria-label={t("Accept")}
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      rpc("respond_savings_goal", {
                        p_id: g.id,
                        p_action: "accept",
                      }),
                    )
                  }
                >
                  <IconCheck />
                </button>
              </>
            ) : (
              <>
                <small className="muted">{t("Proposal expired")}</small>
                <button
                  className="round no"
                  aria-label={t("Decline")}
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      rpc("respond_savings_goal", {
                        p_id: g.id,
                        p_action: "decline",
                      }),
                    )
                  }
                >
                  <IconX />
                </button>
              </>
            )}
          </div>
        )}

        {/* Accepted state */}
        {g.status === "accepted" && !g.withdrawn_at && (
          <>
            {!g.withdraw_proposed_by && (
              <Link
                className="button big"
                to={`/ipon/${g.id}/record`}
                style={{ marginTop: "12px" }}
              >
                <IconPlus aria-hidden="true" /> {t("Mag-ipon")}
              </Link>
            )}

            {/* Per-member sticker tallies for matched goals */}
            {g.goal_mode === "matched" && (
              <div className="members">
                {(data.savingsProgress ?? [])
                  .filter((p) => p.goal_id === g.id)
                  .map((p) => (
                    <div className="member" key={p.member_id}>
                      <Avatar data={data} id={p.member_id} />
                      <div>
                        <strong>{name(data, p.member_id)}</strong>
                        <Tally
                          label={name(data, p.member_id)}
                          paid={p.confirmed_steps}
                          pending={p.pending_steps}
                          total={g.num_steps ?? 1}
                          tone={tone(data, p.member_id)}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Wallet move proposal UI */}
            {activeWallets.length > 1 && (
              <div style={{ margin: "14px 0" }}>
                {g.pending_wallet_id ? (
                  <div
                    className="sticker confirm"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <strong>
                        {t("Wallet change proposed: {wallet}", {
                          wallet:
                            activeWallets.find(
                              (w) => w.id === g.pending_wallet_id,
                            )?.label ?? g.pending_wallet_id,
                        })}
                      </strong>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {g.wallet_proposed_by === user ? (
                        <button
                          className="quiet"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              rpc("respond_goal_wallet", {
                                p_goal_id: g.id,
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
                            className="round no"
                            aria-label={t("Decline wallet move")}
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                rpc("respond_goal_wallet", {
                                  p_goal_id: g.id,
                                  p_action: "decline",
                                }),
                              )
                            }
                          >
                            <IconX />
                          </button>
                          <button
                            className="round ok"
                            aria-label={t("Accept wallet move")}
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                rpc("respond_goal_wallet", {
                                  p_goal_id: g.id,
                                  p_action: "accept",
                                }),
                              )
                            }
                          >
                            <IconCheck />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    {movingWallet ? (
                      <form
                        className="row"
                        style={{ gap: "8px" }}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          const targetId = String(f.get("wallet_id"));
                          if (targetId && targetId !== g.wallet_id) {
                            void run(async () => {
                              await rpc("propose_goal_wallet", {
                                p_goal_id: g.id,
                                p_wallet_id: targetId,
                              });
                              setMovingWallet(false);
                            });
                          }
                        }}
                      >
                        <select
                          name="wallet_id"
                          defaultValue={
                            activeWallets.find((w) => w.id !== g.wallet_id)?.id
                          }
                        >
                          {activeWallets.map((w) => (
                            <option
                              key={w.id}
                              value={w.id}
                              disabled={w.id === g.wallet_id}
                            >
                              {w.label} ({name(data, w.holder_id)})
                            </option>
                          ))}
                        </select>
                        <button disabled={busy}>{t("Save")}</button>
                        <button
                          type="button"
                          className="quiet"
                          onClick={() => setMovingWallet(false)}
                        >
                          {t("Dismiss")}
                        </button>
                      </form>
                    ) : (
                      <button
                        className="quiet"
                        disabled={busy}
                        onClick={() => setMovingWallet(true)}
                      >
                        {t("Move pot to another wallet")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Two-step withdrawal / close goal UI */}
            <div style={{ margin: "14px 0" }}>
              {g.withdraw_proposed_by ? (
                <div
                  className="sticker confirm"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    padding: "12px",
                  }}
                >
                  <div>
                    <strong>{t("Waiting to withdraw")}</strong>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {g.withdraw_proposed_by === user ? (
                      <button
                        className="quiet"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            rpc("respond_withdraw_goal", {
                              p_goal_id: g.id,
                              p_action: "cancel",
                            }),
                          )
                        }
                      >
                        {t("Cancel withdrawal")}
                      </button>
                    ) : (
                      <>
                        <button
                          className="quiet"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              rpc("respond_withdraw_goal", {
                                p_goal_id: g.id,
                                p_action: "decline",
                              }),
                            )
                          }
                        >
                          {t("Decline withdrawal")}
                        </button>
                        <button
                          className="button danger"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              rpc("respond_withdraw_goal", {
                                p_goal_id: g.id,
                                p_action: "confirm",
                              }),
                            )
                          }
                        >
                          {t("Confirm withdrawal")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                !hasPendingOrDelete && (
                  <button
                    className="quiet secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        rpc("propose_withdraw_goal", { p_goal_id: g.id }),
                      )
                    }
                  >
                    {t("Propose withdrawal / close goal")}
                  </button>
                )
              )}
            </div>
          </>
        )}
      </section>

      {/* Contributions list */}
      <section>
        <h2>{t("Contributions")}</h2>
        {contributions.length === 0 ? (
          <div className="empty" style={{ paddingTop: "16px" }}>
            <p>{t("No contributions yet. Start saving toward this goal.")}</p>
            {g.status === "accepted" &&
              !g.withdrawn_at &&
              !g.withdraw_proposed_by && (
                <Link className="button secondary" to={`/ipon/${g.id}/record`}>
                  <IconPlus size={18} aria-hidden="true" /> {t("Mag-ipon")}
                </Link>
              )}
          </div>
        ) : (
          contributions.map((c) => {
            const isOwner = (c.last_edited_by ?? c.created_by) === user;
            const canConfirm =
              c.status === "pending" && !c.deleted_at && !isOwner && !g.withdrawn_at;
            return (
              <article className="entry" key={c.id}>
                <div className="row">
                  <strong>
                    {name(data, c.member_id)}
                    {c.steps
                      ? ` · ${t("{steps} hulogs", { steps: c.steps })}`
                      : ""}
                  </strong>
                  <span className="chip">
                    {c.deleted_at
                      ? t("Deleted")
                      : c.delete_proposed_by
                        ? t("Deletion requested")
                        : label(c.status)}
                  </span>
                </div>
                <p>
                  {money(c.amount_centavos)} ·{" "}
                  {shortDate(c.created_at.slice(0, 10))}
                  {c.note ? ` · ${c.note}` : ""}
                </p>

                {!c.deleted_at && !g.withdrawn_at && (
                  <>
                    <div className="actions">
                      {canConfirm && (
                        <>
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
                                  rpc("edit_savings_contribution", {
                                    p_id: c.id,
                                    p_delete: true,
                                  }),
                                );
                            }}
                          >
                            {t("Delete")}
                          </button>
                          <button
                            className="button ok"
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                rpc("confirm_savings_contribution", {
                                  p_id: c.id,
                                }),
                              )
                            }
                          >
                            {t("Confirm")}
                          </button>
                        </>
                      )}

                      {!c.delete_proposed_by && !g.withdraw_proposed_by && (
                        <button
                          className="quiet"
                          disabled={busy}
                          onClick={() => {
                            if (editingId === c.id) {
                              setEditingId(null);
                            } else {
                              setEditingId(c.id);
                              setEditSteps(String(c.steps ?? 1));
                              setEditAmount(String(c.amount_centavos / 100));
                              setEditNote(c.note ?? "");
                            }
                          }}
                        >
                          {t("Edit contribution")}
                        </button>
                      )}

                      {c.status === "pending" && !canConfirm && (
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
                                rpc("edit_savings_contribution", {
                                  p_id: c.id,
                                  p_delete: true,
                                }),
                              );
                          }}
                        >
                          {t("Delete")}
                        </button>
                      )}

                      {c.status === "confirmed" &&
                        !c.delete_proposed_by &&
                        !g.withdraw_proposed_by && (
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
                                  rpc("edit_savings_contribution", {
                                    p_id: c.id,
                                    p_delete: true,
                                  }),
                                );
                            }}
                          >
                            {t("Propose delete")}
                          </button>
                        )}

                      {c.delete_proposed_by && (
                        <>
                          {c.delete_proposed_by !== user ? (
                            <>
                              <button
                                className="quiet"
                                disabled={busy}
                                onClick={() =>
                                  void run(() =>
                                    rpc(
                                      "respond_delete_savings_contribution",
                                      {
                                        p_id: c.id,
                                        p_action: "decline",
                                      },
                                    ),
                                  )
                                }
                              >
                                {t("Cancel delete")}
                              </button>
                              <button
                                className="quiet danger"
                                disabled={busy}
                                onClick={() =>
                                  void run(() =>
                                    rpc(
                                      "respond_delete_savings_contribution",
                                      {
                                        p_id: c.id,
                                        p_action: "accept",
                                      },
                                    ),
                                  )
                                }
                              >
                                {t("Confirm delete")}
                              </button>
                            </>
                          ) : (
                            <button
                              className="quiet"
                              disabled={busy}
                              onClick={() =>
                                void run(() =>
                                  rpc(
                                    "respond_delete_savings_contribution",
                                    {
                                      p_id: c.id,
                                      p_action: "cancel",
                                    },
                                  ),
                                )
                              }
                            >
                              {t("Cancel delete")}
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {editingId === c.id && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(async () => {
                            if (g.goal_mode === "matched") {
                              await rpc("edit_savings_contribution", {
                                p_id: c.id,
                                p_steps: Number(editSteps),
                                p_note: editNote.trim(),
                              });
                            } else {
                              await rpc("edit_savings_contribution", {
                                p_id: c.id,
                                p_amount_centavos: parsePesos(editAmount),
                                p_note: editNote.trim(),
                              });
                            }
                            setEditingId(null);
                          });
                        }}
                        style={{ display: "grid", gap: "8px", margin: "8px 0" }}
                      >
                        {g.goal_mode === "matched" ? (
                          <label>
                            <span>{t("Number of hulogs")}</span>
                            <input
                              type="number"
                              min="1"
                              max={g.num_steps ?? 366}
                              value={editSteps}
                              onChange={(e) => setEditSteps(e.target.value)}
                              required
                            />
                          </label>
                        ) : (
                          <label>
                            <span>{t("Amount to save (₱)")}</span>
                            <input
                              inputMode="decimal"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              required
                            />
                          </label>
                        )}
                        <label>
                          <span>{t("Note or ref # (optional)")}</span>
                          <input
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            placeholder={t("e.g. GCash ref #1234")}
                            maxLength={140}
                          />
                        </label>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button disabled={busy}>
                            {t("Save correction")}
                          </button>
                          <button
                            type="button"
                            className="quiet"
                            onClick={() => setEditingId(null)}
                          >
                            {t("Dismiss")}
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                )}
              </article>
            );
          })
        )}
      </section>
    </>
  );
}
