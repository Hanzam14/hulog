import { t, label } from "../i18n";
import { useState } from "react";
import { Link } from "react-router-dom";
import { IconCheck, IconChevronRight, IconSparkles } from "@tabler/icons-react";
import type { ViewProps } from "../components/shared";
import { byNewest, closed, name } from "../components/shared";
import { rpc } from "../data";
import {
  cleanGoalTitle,
  filterHistory,
  historyMonths,
  money,
  parsePesos,
  phaseDisplay,
  shortDate,
} from "../helpers";
import Avatar from "../components/Avatar";

export default function History({ data, user, run, busy }: ViewProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState("all");
  const [memberFilter, setMemberFilter] = useState("all");

  const allPastCycles = data.cycles
    .filter(
      (c) => closed(c) || c.status === "declined" || c.status === "cancelled",
    )
    .sort(byNewest);

  const allPastGoals = (data.savingsGoals ?? []).filter(
    (g) =>
      g.withdrawn_at != null ||
      g.phase === "completed" ||
      g.phase === "expired" ||
      g.status === "declined" ||
      g.status === "cancelled",
  );

  const months = historyMonths(allPastCycles, allPastGoals);
  const activeMembers = data.memberships.filter((m) => m.status === "active");
  const {
    cycles: filteredCycles,
    goals: pastGoals,
    totalPotCentavos,
    totalSavedCentavos,
    totalDebtCentavos,
  } = filterHistory({
    cycles: allPastCycles,
    goals: allPastGoals,
    progress: data.progress,
    month: monthFilter,
    memberId: memberFilter,
  });

  const hasHistory = allPastCycles.length > 0 || allPastGoals.length > 0;
  const firstName = (id: string) => name(data, id).trim().split(/\s+/)[0];

  return (
    <>
      <h1>{t("Past pots & debts")}</h1>
      <Link to="/recap" className="recap-link no-print">
        {t("Monthly recap")}
        <IconChevronRight size={20} aria-hidden="true" />
      </Link>
      {hasHistory && (
        <>
          <div className="history-filters no-print">
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              aria-label={t("Month")}
            >
              <option value="all">{t("All months")}</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
              aria-label={t("Member")}
            >
              <option value="all">{t("All members")}</option>
              {activeMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {name(data, m.user_id)}
                </option>
              ))}
            </select>
          </div>
          <section className="history-summary">
            <div className="history-metrics">
              <div className="history-metric">
                <span>{t("Total pots")}</span>
                <strong>{money(totalPotCentavos)}</strong>
              </div>
              <div className="history-metric">
                <span>{t("Total saved")}</span>
                <strong>{money(totalSavedCentavos)}</strong>
              </div>
              <div className="history-metric">
                <span>{t("Outstanding debt")}</span>
                <strong>{money(totalDebtCentavos)}</strong>
              </div>
            </div>
          </section>
        </>
      )}
      {filteredCycles.map((c) => (
        <section key={c.id} className="past-pot-section">
          <Link to={`/cycles/${c.id}`} className="past-row">
            <Avatar data={data} id={c.receiver_id} size="sm" />
            <span className="past-row-text">
              <strong>{money(c.pot_centavos)}</strong>
              <span className="meta">
                {t("goes to")} {firstName(c.receiver_id)}
              </span>
              <span className="meta">
                {shortDate(c.start_date)} → {shortDate(c.end_date)}
              </span>
            </span>
            <span className="chip">{phaseDisplay(c.phase, c.days_left)}</span>
            <IconChevronRight size={18} aria-hidden="true" />
          </Link>
          {c.status === "accepted" &&
            data.progress
              .filter(
                (p) => p.cycle_id === c.id && p.member_id !== c.receiver_id,
              )
              .map((p) => (
                <div key={p.member_id} className="history-member">
                  <div className="history-member-summary">
                    <h3>{name(data, p.member_id)}</h3>
                    {p.debt_centavos > 0 ? (
                      <span className="history-member-status">
                        {t("Owes {amount}", { amount: money(p.debt_centavos) })}
                      </span>
                    ) : (
                      <span className="history-member-status paid">
                        <IconCheck size={16} aria-hidden="true" />
                        {t("Paid up")}
                      </span>
                    )}
                  </div>
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
                        {t("Repayment amount (₱)")}
                        <input
                          name="amount"
                          inputMode="decimal"
                          required
                          defaultValue={(p.debt_centavos / 100).toFixed(2)}
                        />
                      </label>
                      <button disabled={busy}>{t("Record repayment")}</button>
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
                  {money(r.amount_centavos)}
                  <br />
                  {r.deleted_at ? t("Deleted") : label(r.status)}
                </p>
                {!r.deleted_at && (
                  <>
                    <div className="actions">
                      {r.status === "pending" && r.creditor_id === user && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(() => rpc("confirm_repayment", { p_id: r.id }))
                          }
                        >
                          {t("Confirm repayment")}
                        </button>
                      )}
                      <button
                        className="quiet"
                        disabled={busy}
                        onClick={() =>
                          setEditing(editing === r.id ? null : r.id)
                        }
                      >
                        {t("Edit amount")}
                      </button>
                      <button
                        className="quiet danger"
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
                        {t("Delete")}
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
                          {t("Correct amount (₱)")}
                          <input
                            name="amount"
                            inputMode="decimal"
                            defaultValue={(r.amount_centavos / 100).toFixed(2)}
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
      ))}
      {!hasHistory && (
        <div className="empty">
          <IconSparkles size={40} aria-hidden="true" />
          <p>{t("Past cycles will appear here.")}</p>
        </div>
      )}
      {hasHistory && filteredCycles.length === 0 && (
        <p>{t("Past cycles will appear here.")}</p>
      )}
      {pastGoals.length > 0 && (
        <section>
          <h2>{t("Completed & withdrawn ipon")}</h2>
          {pastGoals.map((g) => (
            <Link key={g.id} to={`/ipon/${g.id}`} className="past-row">
              <span className="past-row-text">
                <strong>{cleanGoalTitle(g.title)}</strong>
                <span className="meta">
                  {t("{saved} of {price}", {
                    saved: money(g.saved_centavos),
                    price: money(g.target_amount_centavos),
                  })}{" "}
                  · {shortDate(g.end_date)}
                </span>
              </span>
              <span className="chip">{phaseDisplay(g.phase, g.days_left)}</span>
              <IconChevronRight size={18} aria-hidden="true" />
            </Link>
          ))}
        </section>
      )}
      {hasHistory && (
        <button
          type="button"
          className="secondary no-print"
          onClick={() => window.print()}
        >
          {t("Print summary")}
        </button>
      )}
    </>
  );
}
