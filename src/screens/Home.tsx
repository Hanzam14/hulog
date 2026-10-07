import { t } from "../i18n";
import { Link } from "react-router-dom";
import { IconMapPin, IconPlus, IconSparkles } from "@tabler/icons-react";
import type { ViewProps } from "../components/shared";
import { byNewest, closed, name, tone } from "../components/shared";
import PendingPaymentActions from "../components/PendingPaymentActions";
import { money, shortDate } from "../helpers";
import CycleCard from "../components/CycleCard";
import Proposal from "../components/Proposal";
import Payout from "../components/Payout";
import Tally from "../components/Tally";
import Avatar from "../components/Avatar";

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
  return (
    <>
      <h1 className="sr-only">{group.name}</h1>
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
      {waiting.length > 0 && (
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
