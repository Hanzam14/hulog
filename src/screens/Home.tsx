import { t } from "../i18n";
import { Link } from "react-router-dom";
import { IconCheck, IconPlus, IconSparkles, IconX } from "@tabler/icons-react";
import type { ViewProps } from "../components/shared";
import { byNewest, closed, name, tone } from "../components/shared";
import PendingPaymentActions from "../components/PendingPaymentActions";
import { money, shortDate } from "../helpers";
import { rpc } from "../data";
import CycleCard from "../components/CycleCard";
import Proposal from "../components/Proposal";
import Payout from "../components/Payout";
import Tally from "../components/Tally";
import Avatar from "../components/Avatar";
import IponCard from "../components/IponCard";
import PersonalSavings from "../components/PersonalSavings";
import { isSoloMode } from "../solo";
import { isSoloCycle } from "../helpers";

export default function Home(props: ViewProps) {
  const { data, user, run, busy } = props;
  const group = data.groups[0];
  const cycles = [...data.cycles].sort(byNewest);
  const live = cycles.find(
    (c) => c.status === "proposed" || (c.status === "accepted" && !closed(c)),
  );
  const c = live ?? cycles.find((c) => c.status === "accepted");
  const waiting = data.payments.filter(
    (p) => p.status === "pending" && !p.deleted_at && p.member_id !== user,
  );

  const pendingContributions = (data.savingsContributions ?? []).filter(
    (sc) =>
      !sc.deleted_at &&
      sc.status === "pending" &&
      (sc.last_edited_by ?? sc.created_by) !== user,
  );
  const deleteProposedContributions = (data.savingsContributions ?? []).filter(
    (sc) =>
      !sc.deleted_at &&
      sc.delete_proposed_by &&
      sc.delete_proposed_by !== user,
  );
  const pendingAbono = (data.abonoEntries ?? []).filter(
    (ae) =>
      !ae.deleted_at &&
      ae.status === "pending" &&
      (ae.last_edited_by ?? ae.created_by) !== user,
  );
  const deleteProposedAbono = (data.abonoEntries ?? []).filter(
    (ae) =>
      !ae.deleted_at &&
      ae.delete_proposed_by &&
      ae.delete_proposed_by !== user,
  );
  const pendingRepayments = (data.repayments ?? []).filter(
    (r) => !r.deleted_at && r.status === "pending" && r.creditor_id === user,
  );

  const activeGoals = (data.savingsGoals ?? [])
    .filter(
      (g) =>
        (g.status === "proposed" && g.phase !== "expired") ||
        (g.status === "accepted" && !g.withdrawn_at),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const hasPersonal = (data.personalGoals ?? []).some(
    (g) => !g.deleted_at && (g.owner_id === user || g.visibility === "shared"),
  );
  const partner = data.memberships.find(
    (m) => m.status === "active" && m.user_id !== user,
  );
  return (
    <>
      <h1 className="sr-only">{group.name}</h1>
      {(waiting.length > 0 ||
        pendingContributions.length > 0 ||
        deleteProposedContributions.length > 0 ||
        pendingAbono.length > 0 ||
        deleteProposedAbono.length > 0 ||
        pendingRepayments.length > 0) && (
        <section className="home-waiting">
          <h2 className="section-label">{t("Waiting for your check")}</h2>
          <div className="confirm-list">
            {waiting.map((p) => {
              const cycle = data.cycles.find(
                (cycle) => cycle.id === p.cycle_id,
              );
              if (!cycle) return null;
              const allowed = cycle.phase !== "ended" || p.was_confirmed;
              return (
                <div className="sticker confirm" key={p.id}>
                  <Avatar data={data} id={p.member_id} />
                  <div>
                    <strong>{money(p.amount_centavos)}</strong>
                    <div
                      className={`tally ${tone(data, p.member_id)} mini`}
                      role="img"
                      aria-label={t("{days} days", { days: p.days })}
                    >
                      {Array.from({ length: p.days }, (_, i) => (
                        <span key={i} className="pending" />
                      ))}
                    </div>
                    <Link to={`/cycles/${cycle.id}`} className="muted">
                      {t("round")} {shortDate(cycle.start_date)} →{" "}
                      {shortDate(cycle.end_date)}
                    </Link>
                    {!allowed && <small>{t("not counted")}</small>}
                  </div>
                  <PendingPaymentActions
                    id={p.id}
                    memberName={name(data, p.member_id)}
                    amount={p.amount_centavos}
                    allowed={allowed}
                    busy={busy}
                    run={run}
                  />
                </div>
              );
            })}

            {pendingContributions.map((sc) => {
              const goal = (data.savingsGoals ?? []).find(
                (g) => g.id === sc.goal_id,
              );
              return (
                <div className="sticker confirm" key={sc.id}>
                  <Avatar data={data} id={sc.member_id} />
                  <div>
                    <strong>{money(sc.amount_centavos)}</strong>
                    {sc.steps ? (
                      <div
                        className={`tally ${tone(data, sc.member_id)} mini`}
                        role="img"
                        aria-label={t("{days} days", { days: sc.steps })}
                      >
                        {Array.from({ length: sc.steps }, (_, i) => (
                          <span key={i} className="pending" />
                        ))}
                      </div>
                    ) : null}
                    <Link to={`/ipon/${sc.goal_id}`} className="muted">
                      {goal?.title ?? t("Ipon detail")}
                    </Link>
                    {sc.note && <small>{sc.note}</small>}
                  </div>
                  <button
                    className="round no"
                    aria-label={t("Decline {name}'s {amount}", {
                      name: name(data, sc.member_id),
                      amount: money(sc.amount_centavos),
                    })}
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          t(
                            "Delete this contribution record? The change stays in history.",
                          ),
                        )
                      )
                        void run(() =>
                          rpc("edit_savings_contribution", {
                            p_id: sc.id,
                            p_delete: true,
                          }),
                        );
                    }}
                  >
                    <IconX />
                  </button>
                  <button
                    className="round ok"
                    aria-label={t("Confirm {name}'s {amount}", {
                      name: name(data, sc.member_id),
                      amount: money(sc.amount_centavos),
                    })}
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        rpc("confirm_savings_contribution", { p_id: sc.id }),
                      )
                    }
                  >
                    <IconCheck />
                  </button>
                </div>
              );
            })}

            {deleteProposedContributions.map((sc) => {
              const goal = (data.savingsGoals ?? []).find(
                (g) => g.id === sc.goal_id,
              );
              return (
                <div className="sticker confirm" key={sc.id}>
                  <Avatar data={data} id={sc.delete_proposed_by!} />
                  <div>
                    <strong>{money(sc.amount_centavos)}</strong>
                    <Link to={`/ipon/${sc.goal_id}`} className="muted">
                      {goal?.title ?? t("Ipon detail")}
                    </Link>
                    <small>{t("Deletion requested")}</small>
                  </div>
                  <button
                    className="round no"
                    aria-label={t("Cancel delete")}
                    title={t("Cancel delete")}
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        rpc("respond_delete_savings_contribution", {
                          p_id: sc.id,
                          p_action: "decline",
                        }),
                      )
                    }
                  >
                    <IconX />
                  </button>
                  <button
                    className="round ok"
                    aria-label={t("Confirm delete")}
                    title={t("Confirm delete")}
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        rpc("respond_delete_savings_contribution", {
                          p_id: sc.id,
                          p_action: "accept",
                        }),
                      )
                    }
                  >
                    <IconCheck />
                  </button>
                </div>
              );
            })}

            {pendingAbono.map((ae) => (
              <div className="sticker confirm" key={ae.id}>
                <Avatar data={data} id={ae.from_member} />
                <div>
                  <strong>{money(ae.owed_amount_centavos)}</strong>
                  <Link to="/tracker" className="muted">
                    {ae.description} ({t("Tracker")})
                  </Link>
                  {ae.note && <small>{ae.note}</small>}
                </div>
                <button
                  className="round no"
                  aria-label={t("Decline {name}'s {amount}", {
                    name: name(data, ae.from_member),
                    amount: money(ae.owed_amount_centavos),
                  })}
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        t(
                          "Delete this expense record? The change stays in history.",
                        ),
                      )
                    )
                      void run(() =>
                        rpc("edit_abono_entry", {
                          p_id: ae.id,
                          p_delete: true,
                        }),
                      );
                  }}
                >
                  <IconX />
                </button>
                <button
                  className="round ok"
                  aria-label={t("Confirm {name}'s {amount}", {
                    name: name(data, ae.from_member),
                    amount: money(ae.owed_amount_centavos),
                  })}
                  disabled={busy}
                  onClick={() =>
                    void run(() => rpc("confirm_abono_entry", { p_id: ae.id }))
                  }
                >
                  <IconCheck />
                </button>
              </div>
            ))}

            {deleteProposedAbono.map((ae) => (
              <div className="sticker confirm" key={ae.id}>
                <Avatar data={data} id={ae.delete_proposed_by!} />
                <div>
                  <strong>{money(ae.owed_amount_centavos)}</strong>
                  <Link to="/tracker" className="muted">
                    {ae.description} ({t("Tracker")})
                  </Link>
                  <small>{t("Deletion requested")}</small>
                </div>
                <button
                  className="round no"
                  aria-label={t("Cancel delete")}
                  title={t("Cancel delete")}
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      rpc("respond_delete_abono_entry", {
                        p_id: ae.id,
                        p_action: "decline",
                      }),
                    )
                  }
                >
                  <IconX />
                </button>
                <button
                  className="round ok"
                  aria-label={t("Confirm delete")}
                  title={t("Confirm delete")}
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      rpc("respond_delete_abono_entry", {
                        p_id: ae.id,
                        p_action: "accept",
                      }),
                    )
                  }
                >
                  <IconCheck />
                </button>
              </div>
            ))}

            {pendingRepayments.map((r) => (
              <div className="sticker confirm" key={r.id}>
                <Avatar data={data} id={r.debtor_id} />
                <div>
                  <strong>{money(r.amount_centavos)}</strong>
                  <Link to="/history" className="muted">
                    {t("Debt repayment")} ({name(data, r.debtor_id)})
                  </Link>
                  <small>{name(data, r.debtor_id)}</small>
                </div>
                <button
                  className="round no"
                  aria-label={t("Decline {name}'s {amount}", {
                    name: name(data, r.debtor_id),
                    amount: money(r.amount_centavos),
                  })}
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(t("Delete this repayment record?"))
                    )
                      void run(() =>
                        rpc("edit_repayment", {
                          p_id: r.id,
                          p_delete: true,
                        }),
                      );
                  }}
                >
                  <IconX />
                </button>
                <button
                  className="round ok"
                  aria-label={t("Confirm {name}'s {amount}", {
                    name: name(data, r.debtor_id),
                    amount: money(r.amount_centavos),
                  })}
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      rpc("confirm_repayment", { p_id: r.id }),
                    )
                  }
                >
                  <IconCheck />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {!c ? (
        <div className="empty">
          <IconSparkles size={48} aria-hidden="true" />
          <p>
            {isSoloMode()
              ? t("Start a round to begin tracking your savings.")
              : t(
                  "Invite your partner from the group tab, then start a round.",
                )}
          </p>
        </div>
      ) : (
        <>
          <CycleCard c={c} data={data} user={user} />
          {c.status === "proposed" ? (
            <Proposal c={c} user={user} run={run} busy={busy} />
          ) : (
            <div className="members tally-sheet">
              {data.progress
                .filter((p) => p.cycle_id === c.id)
                .map((p) => {
                  const isSolo = isSoloCycle(c);
                  const isSaver = p.member_id === c.receiver_id;
                  const isObserving = isSolo && !isSaver;
                  return (
                    <div className="member" key={p.member_id}>
                      <div className="member-who">
                        <Avatar data={data} id={p.member_id} size="sm" />
                        <strong>{name(data, p.member_id)}</strong>
                      </div>
                      {isObserving ? (
                        <span className="meta">{t("₱0 · Observing")}</span>
                      ) : (
                        <Tally
                          label={name(data, p.member_id)}
                          paid={p.confirmed_days}
                          pending={p.pending_days}
                          total={c.num_days}
                          tone={tone(data, p.member_id)}
                        />
                      )}
                    </div>
                  );
                })}
            </div>
          )}
          {c.status === "accepted" && !closed(c) && (
            <Link className="button big" to="/hulog">
              <IconPlus aria-hidden="true" /> {t("hulog!")}
            </Link>
          )}
          <Payout c={c} data={data} user={user} run={run} busy={busy} />
        </>
      )}
      {!live && (
        <Link className={`button big${c ? " secondary" : ""}`} to="/propose">
          <IconSparkles aria-hidden="true" /> {t("new round")}
        </Link>
      )}

      <section className="ipon-home-section">
        <h2 className="section-label">{t("Ipon")}</h2>
        {activeGoals.length > 0 && hasPersonal && (
          <h3 className="sub-label">{t("Ipon goals")}</h3>
        )}
        {activeGoals.length === 0 && (
          <p className="meta" style={{ textAlign: "center", margin: "8px 0" }}>
            {t("No ipon goals yet. Save together for a trip or goal.")}
          </p>
        )}
        {activeGoals.map((g) => (
          <div key={g.id} className="ipon-home-item">
            <IponCard
              g={g}
              data={data}
              user={user}
              action={
                g.status === "accepted" &&
                !g.withdrawn_at &&
                !g.withdraw_proposed_by ? (
                  <Link
                    className="button ipon-quick-btn"
                    to={`/ipon/${g.id}/record`}
                  >
                    <IconPlus size={18} aria-hidden="true" /> {t("Mag-ipon")}
                  </Link>
                ) : undefined
              }
            />
          </div>
        ))}
        <PersonalSavings
          {...props}
          siblingGoals={activeGoals.length > 0}
          trailing={
            activeGoals.length < 3 ? (
              <Link className="button quiet" to="/ipon/new">
                <IconSparkles size={18} aria-hidden="true" />{" "}
                {partner
                  ? t("With {name}", {
                      name: name(data, partner.user_id).trim().split(/\s+/)[0],
                    })
                  : t("With partner")}
              </Link>
            ) : undefined
          }
        />
      </section>
    </>
  );
}
