import { t } from "../i18n";
import { Link } from "react-router-dom";
import {
  IconCheck,
  IconMapPin,
  IconPlus,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
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
import CustodyCard from "../components/CustodyCard";
import IponCard from "../components/IponCard";

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
  const pendingAbono = (data.abonoEntries ?? []).filter(
    (ae) =>
      !ae.deleted_at &&
      ae.status === "pending" &&
      (ae.last_edited_by ?? ae.created_by) !== user,
  );

  const activeGoals = (data.savingsGoals ?? [])
    .filter(
      (g) =>
        (g.status === "proposed" && g.phase !== "expired") ||
        (g.status === "accepted" && !g.withdrawn_at),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <>
      <h1 className="sr-only">{group.name}</h1>
      <CustodyCard data={data} />
      {!c ? (
        <div className="empty">
          <IconSparkles size={48} aria-hidden="true" />
          <p>
            {t("Invite your partner from the group tab, then start a round.")}
          </p>
        </div>
      ) : (
        <>
          <CycleCard c={c} data={data} />
          {c.status === "proposed" ? (
            <Proposal c={c} user={user} run={run} busy={busy} />
          ) : (
            <div className="members">
              {data.progress
                .filter((p) => p.cycle_id === c.id)
                .map((p) => (
                  <div className="member" key={p.member_id}>
                    <Avatar data={data} id={p.member_id} />
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
          )}
          {c.status === "accepted" && !closed(c) && (
            <Link className="button big" to="/hulog">
              <IconPlus aria-hidden="true" /> {t("hulog")}
            </Link>
          )}
          <Payout c={c} data={data} user={user} run={run} busy={busy} />
        </>
      )}
      {!live && (
        <Link className="button big secondary" to="/propose">
          <IconSparkles aria-hidden="true" /> {t("new round")}
        </Link>
      )}

      <div className="ipon-home-section">
        <div className="row">
          <h2>{t("Ipon goals")}</h2>
        </div>
        {activeGoals.map((g) => (
          <div key={g.id} className="ipon-home-item">
            <IponCard g={g} data={data} />
            {g.status === "accepted" &&
              !g.withdrawn_at &&
              !g.withdraw_proposed_by && (
                <Link
                  className="button secondary ipon-quick-btn"
                  to={`/ipon/${g.id}/record`}
                >
                  <IconPlus size={18} aria-hidden="true" /> {t("Mag-ipon")}
                </Link>
              )}
          </div>
        ))}
        {activeGoals.length < 3 && (
          <Link className="button big secondary" to="/ipon/new">
            <IconSparkles aria-hidden="true" /> {t("New ipon goal")}
          </Link>
        )}
      </div>

      {(waiting.length > 0 ||
        pendingContributions.length > 0 ||
        pendingAbono.length > 0) && (
        <div className="confirm-list" aria-label={t("Waiting for your check")}>
          {waiting.map((p) => {
            const cycle = data.cycles.find((cycle) => cycle.id === p.cycle_id);
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
                          "Delete this payment record? The change stays in history.",
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
                        "Delete this payment record? The change stays in history.",
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
                  void run(() =>
                    rpc("confirm_abono_entry", { p_id: ae.id }),
                  )
                }
              >
                <IconCheck />
              </button>
            </div>
          ))}
        </div>
      )}
      {group.pot_location && (
        <p className="place">
          <IconMapPin size={16} aria-label={t("Pot held at")} />{" "}
          {group.pot_location}
        </p>
      )}
    </>
  );
}
