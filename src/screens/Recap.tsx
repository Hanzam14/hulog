import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { t } from "../i18n";
import { money, shortDate } from "../helpers";
import { name } from "../components/shared";
import type { ViewProps } from "../components/shared";
import {
  buildRecap,
  clampMonth,
  monthLabel,
  recapMonths,
  shiftMonth,
} from "../recap";
import { shareRecap } from "../recapCard";

const signed = (centavos: number) =>
  `${centavos > 0 ? "+" : ""}${money(centavos)}`;

function Block({
  title,
  total,
  pending,
  empty,
  note,
  children,
}: {
  title: string;
  total: string;
  pending: number;
  empty: boolean;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="recap-block">
      <div className="row">
        <h2>{title}</h2>
        {!empty && <strong className="recap-total">{total}</strong>}
      </div>
      {note && <p className="meta">{note}</p>}
      {empty ? <p className="meta">{t("Recap quiet month")}</p> : children}
      {pending > 0 && (
        <p className="meta">{t("{count} pa pending", { count: pending })}</p>
      )}
    </section>
  );
}

export default function Recap({ data, user }: ViewProps) {
  const [picked, setPicked] = useState(data.today.slice(0, 7));
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const month = clampMonth(data, picked);
  const { earliest, current } = recapMonths(data);
  const recap = buildRecap(data, user, month);
  const { paluwagan, abono, ipon, personal } = recap;

  async function share() {
    setSharing(true);
    setMessage("");
    setFailed(false);
    try {
      const result = await shareRecap(recap);
      if (result === "downloaded") setMessage(t("Recap downloaded"));
    } catch {
      setFailed(true);
      setMessage(t("Could not share the recap"));
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <div className="row">
        <Link to="/history" className="back" aria-label={t("Back")}>
          <IconChevronLeft aria-hidden="true" />
        </Link>
        <h1>{t("Monthly recap")}</h1>
      </div>
      <div className="recap-month" role="group" aria-label={t("Monthly recap")}>
        <button
          type="button"
          className="round back"
          aria-label={t("Previous month")}
          disabled={month <= earliest}
          onClick={() => setPicked(shiftMonth(month, -1))}
        >
          <IconChevronLeft aria-hidden="true" />
        </button>
        <strong aria-live="polite">{monthLabel(month)}</strong>
        <button
          type="button"
          className="round back"
          aria-label={t("Next month")}
          disabled={month >= current}
          onClick={() => setPicked(shiftMonth(month, 1))}
        >
          <IconChevronRight aria-hidden="true" />
        </button>
      </div>

      <Block
        title={t("Paluwagan")}
        total={money(paluwagan.paidCentavos)}
        pending={paluwagan.pendingCount}
        empty={paluwagan.paidCentavos === 0 && paluwagan.payouts.length === 0}
      >
        <p className="meta">{t("Recap paid in")}</p>
        {paluwagan.byMember.map((m) => (
          <div className="list-row" key={m.memberId}>
            <span>{name(data, m.memberId)}</span>
            <b>{money(m.centavos)}</b>
          </div>
        ))}
        {paluwagan.payouts.length > 0 && (
          <>
            <p className="meta">{t("Recap payouts")}</p>
            {paluwagan.payouts.map((p) => (
              <div className="list-row" key={p.cycleId}>
                <span>
                  {name(data, p.receiverId)} · {shortDate(p.receivedOn)}
                </span>
                <b>{money(p.centavos)}</b>
              </div>
            ))}
          </>
        )}
      </Block>

      <Block
        title={t("Abono")}
        total={money(abono.spentCentavos)}
        pending={abono.pendingCount}
        empty={abono.spentCentavos === 0 && abono.settledCentavos === 0}
      >
        <p className="meta">{t("Recap spent")}</p>
        {abono.byPayer.map((m) => (
          <div className="list-row" key={m.memberId}>
            <span>{name(data, m.memberId)}</span>
            <b>{money(m.centavos)}</b>
          </div>
        ))}
        <div className="list-row">
          <span>{t("Recap settled")}</span>
          <b>{money(abono.settledCentavos)}</b>
        </div>
      </Block>

      <Block
        title={t("Ipon")}
        total={money(ipon.savedCentavos)}
        pending={ipon.pendingCount}
        empty={ipon.savedCentavos === 0}
      >
        {ipon.byGoal.map((g) => (
          <div className="list-row" key={g.goalId}>
            <span>{g.title}</span>
            <b>{money(g.centavos)}</b>
          </div>
        ))}
      </Block>

      <Block
        title={t("Recap personal title")}
        total={signed(personal.netCentavos)}
        pending={0}
        empty={personal.goals.length === 0}
        note={t("Recap personal note")}
      >
        {personal.goals.map((g) => (
          <div className="list-row" key={g.goalId}>
            <span>
              {g.title}
              {g.ownerId !== user && ` · ${name(data, g.ownerId)}`}
            </span>
            <b>{signed(g.netCentavos)}</b>
          </div>
        ))}
      </Block>

      <button
        type="button"
        className="big"
        disabled={sharing}
        onClick={() => void share()}
      >
        {sharing ? t("Making the recap image…") : t("Share recap")}
      </button>
      {message && (
        <p
          className={failed ? "error" : "meta"}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </>
  );
}
