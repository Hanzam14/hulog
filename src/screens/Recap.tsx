import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { t } from "../i18n";
import { money, shortDate } from "../helpers";
import { name } from "../components/shared";
import type { ViewProps } from "../components/shared";
import {
  barPercent,
  buildRecap,
  buildYearRecap,
  clampMonth,
  clampYear,
  monthLabel,
  movedCentavos,
  recapMonths,
  recapYears,
  shiftMonth,
  shortMonthLabel,
  visibleMonths,
  type Recap as RecapData,
  type YearRecap,
} from "../recap";
import { shareRecap } from "../recapCard";

const signed = (centavos: number) =>
  `${centavos > 0 ? "+" : ""}${money(centavos)}`;

function Block({
  title,
  total,
  pending,
  empty,
  quiet,
  note,
  children,
}: {
  title: string;
  total: string;
  pending: number;
  empty: boolean;
  quiet: string;
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
      {empty ? <p className="meta">{quiet}</p> : children}
      {pending > 0 && (
        <p className="meta">{t("{count} pa pending", { count: pending })}</p>
      )}
    </section>
  );
}

/** Hand-rolled bars: one row per month, scaled to the busiest month. */
function MonthBars({
  months,
  best,
}: {
  months: YearRecap["months"];
  best: YearRecap["best"];
}) {
  const max = Math.max(0, ...months.map((m) => m.movedCentavos));
  return (
    <>
      {best && (
        <p className="meta">
          {t("Recap best month", {
            month: monthLabel(best.month),
            amount: money(best.movedCentavos),
          })}
        </p>
      )}
      <ul className="recap-bars">
        {months.map((m) => (
          <li key={m.month}>
            <span className="recap-bar-month">{shortMonthLabel(m.month)}</span>
            <span className="recap-bar" aria-hidden="true">
              <span
                className={best?.month === m.month ? "best" : undefined}
                style={{ width: `${barPercent(m.movedCentavos, max)}%` }}
              />
            </span>
            <b>{money(m.movedCentavos)}</b>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Recap({ data, user }: ViewProps) {
  const [mode, setMode] = useState<"month" | "year">("month");
  const [picked, setPicked] = useState(data.today.slice(0, 7));
  const [pickedYear, setPickedYear] = useState(data.today.slice(0, 4));
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const isYear = mode === "year";
  const month = clampMonth(data, picked);
  const year = clampYear(data, pickedYear);
  const months = recapMonths(data);
  const years = recapYears(data);
  const yearView = isYear ? buildYearRecap(data, user, year) : null;
  const recap: RecapData = yearView?.recap ?? buildRecap(data, user, month);
  const { paluwagan, abono, ipon, personal } = recap;
  const quiet = isYear ? t("Recap quiet year") : t("Recap quiet month");
  const shownMonths = yearView
    ? visibleMonths(data, year).flatMap((key) => {
        const found = yearView.months.find((m) => m.month === key);
        return found ? [found] : [];
      })
    : [];

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
        <h1>{isYear ? t("Yearly recap") : t("Monthly recap")}</h1>
      </div>
      <div
        className="segmented recap-period"
        role="group"
        aria-label={t("Recap period")}
      >
        <button
          type="button"
          aria-pressed={!isYear}
          onClick={() => setMode("month")}
        >
          {t("Recap by month")}
        </button>
        <button
          type="button"
          aria-pressed={isYear}
          onClick={() => {
            setPickedYear(month.slice(0, 4));
            setMode("year");
          }}
        >
          {t("Recap by year")}
        </button>
      </div>
      <div
        className="recap-month"
        role="group"
        aria-label={isYear ? t("Yearly recap") : t("Monthly recap")}
      >
        <button
          type="button"
          className="round back"
          aria-label={isYear ? t("Previous year") : t("Previous month")}
          disabled={isYear ? year <= years.earliest : month <= months.earliest}
          onClick={() =>
            isYear
              ? setPickedYear(String(Number(year) - 1))
              : setPicked(shiftMonth(month, -1))
          }
        >
          <IconChevronLeft aria-hidden="true" />
        </button>
        <strong aria-live="polite">{isYear ? year : monthLabel(month)}</strong>
        <button
          type="button"
          className="round back"
          aria-label={isYear ? t("Next year") : t("Next month")}
          disabled={isYear ? year >= years.current : month >= months.current}
          onClick={() =>
            isYear
              ? setPickedYear(String(Number(year) + 1))
              : setPicked(shiftMonth(month, 1))
          }
        >
          <IconChevronRight aria-hidden="true" />
        </button>
      </div>

      {yearView && (
        <Block
          title={t("Recap each month")}
          total={money(movedCentavos(recap))}
          pending={0}
          empty={yearView.best === null}
          quiet={quiet}
        >
          <MonthBars months={shownMonths} best={yearView.best} />
        </Block>
      )}

      <Block
        title={t("Paluwagan")}
        total={money(paluwagan.paidCentavos)}
        pending={paluwagan.pendingCount}
        empty={paluwagan.paidCentavos === 0 && paluwagan.payouts.length === 0}
        quiet={quiet}
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
        quiet={quiet}
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
        quiet={quiet}
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
        quiet={quiet}
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
