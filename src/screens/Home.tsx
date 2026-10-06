import { Link } from "react-router-dom";
import {
  IconCheck,
  IconMapPin,
  IconPlus,
  IconSparkles,
} from "@tabler/icons-react";
import type { ViewProps } from "../components/shared";
import { byNewest, closed, name, tone } from "../components/shared";
import { rpc } from "../data";
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
    (p) => p.status === "pending" && !p.deleted_at,
  );
  return (
    <>
      <h1 className="sr-only">{group.name}</h1>
      {!c ? (
        <div className="empty">
          <IconSparkles size={48} aria-hidden="true" />
          <p>Invite your partner from the group tab, then start a round.</p>
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
              <IconPlus aria-hidden="true" /> hulog
            </Link>
          )}
          <Payout c={c} data={data} user={user} run={run} busy={busy} />
        </>
      )}
      {!live && (
        <Link className="button big secondary" to="/propose">
          <IconSparkles aria-hidden="true" /> new round
        </Link>
      )}
      {group.owner_id === user && waiting.length > 0 && (
        <div className="confirm-list" aria-label="Waiting for your check">
          {waiting.map((p) => {
            const cycle = data.cycles.find((cycle) => cycle.id === p.cycle_id)!;
            const allowed = cycle.phase !== "ended" || p.was_confirmed;
            return (
              <div className="sticker confirm" key={p.id}>
                <Avatar data={data} id={p.member_id} />
                <div>
                  <strong>{money(p.amount_centavos)}</strong>
                  <div
                    className={`tally ${tone(data, p.member_id)} mini`}
                    role="img"
                    aria-label={`${p.days} days`}
                  >
                    {Array.from({ length: p.days }, (_, i) => (
                      <span key={i} className="pending" />
                    ))}
                  </div>
                  <Link to={`/cycles/${cycle.id}`} className="muted">
                    round {shortDate(cycle.start_date)} →{" "}
                    {shortDate(cycle.end_date)}
                  </Link>
                  {!allowed && <small>not counted</small>}
                </div>
                {allowed && (
                  <button
                    className="round ok"
                    aria-label={`Confirm ${name(data, p.member_id)}'s ${money(p.amount_centavos)}`}
                    disabled={busy}
                    onClick={() =>
                      run(() => rpc("confirm_payment", { p_id: p.id }))
                    }
                  >
                    <IconCheck />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {group.pot_location && (
        <p className="place">
          <IconMapPin size={16} aria-label="Pot held at" /> {group.pot_location}
        </p>
      )}
    </>
  );
}
