import { useState } from "react";
import { IconCheck, IconClock, IconX } from "@tabler/icons-react";
import {
  calendarMembers,
  calendarWeeks,
  dayCounts,
  roundDays,
  type DayState,
} from "../calendar";
import type { Cycle, Snapshot } from "../data";
import { shortDate } from "../helpers";
import { t } from "../i18n";
import { name, tone } from "./shared";

const weekdayNames = [0, 1, 2, 3, 4, 5, 6].map((i) =>
  new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 9, 18 + i))),
);
const monthName = (date: string) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

const stateLabel = (state: DayState) =>
  ({
    paid: t("Paid"),
    pending: t("Pending"),
    missed: t("Missed"),
    upcoming: t("Upcoming"),
  })[state];
const legendLabel = (state: DayState, count: number) =>
  ({
    paid: t("Paid {count}", { count }),
    pending: t("Pending {count}", { count }),
    missed: t("Missed {count}", { count }),
    upcoming: t("Upcoming {count}", { count }),
  })[state];

/** An icon as well as colour, so the state never rests on colour alone. */
function Mark({ state }: { state: DayState }) {
  if (state === "paid") return <IconCheck size={14} aria-hidden="true" />;
  if (state === "pending") return <IconClock size={14} aria-hidden="true" />;
  if (state === "missed") return <IconX size={14} aria-hidden="true" />;
  return (
    <span className="cal-dot" aria-hidden="true">
      •
    </span>
  );
}

/**
 * Spec 10.9: read-only month grid of the round's days for one member. Days are
 * filled in order from the start date, because payments count days, not dates.
 */
export default function RoundCalendar({
  c,
  data,
  user,
}: {
  c: Cycle;
  data: Snapshot;
  user: string;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const members = calendarMembers(c, data);
  const memberId =
    picked && members.includes(picked)
      ? picked
      : members.includes(user)
        ? user
        : members[0];
  if (!memberId) return null;
  const days = roundDays(c, data, memberId, data.today);
  if (days.length === 0) return null;
  const counts = dayCounts(days);
  const first = (id: string) => name(data, id).trim().split(/\s+/)[0];
  const states: DayState[] = ["paid", "pending", "missed", "upcoming"];

  return (
    <section className={`round-cal ${tone(data, memberId)}`}>
      <details open={c.phase !== "ended"}>
        <summary>{t("Round calendar")}</summary>
        {members.length > 1 && (
          <div
            className="segmented cal-toggle"
            role="group"
            aria-label={t("Whose days")}
          >
            {members.map((id) => (
              <button
                type="button"
                key={id}
                aria-pressed={id === memberId}
                onClick={() => setPicked(id)}
              >
                {first(id)}
              </button>
            ))}
          </div>
        )}
        <div className="cal-grid">
          <div className="cal-head" aria-hidden="true">
            {weekdayNames.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="cal-days" role="list">
            {calendarWeeks(days)
              .flat()
              .map((day, i) => {
                if (!day)
                  return (
                    <span key={`pad-${i}`} className="cal-pad" aria-hidden />
                  );
                const isToday = day.date === data.today;
                const month =
                  day.date === days[0].date || day.date.endsWith("-01")
                    ? monthName(day.date)
                    : null;
                return (
                  <div
                    key={day.date}
                    role="listitem"
                    className={`cal-day ${day.state}${isToday ? " today" : ""}`}
                    aria-label={`${shortDate(day.date)}${
                      isToday ? ` (${t("Today").toLowerCase()})` : ""
                    }: ${stateLabel(day.state)}`}
                  >
                    <small aria-hidden="true">{month ?? " "}</small>
                    <b aria-hidden="true">{Number(day.date.slice(8))}</b>
                    <Mark state={day.state} />
                  </div>
                );
              })}
          </div>
        </div>
        <ul className="cal-legend">
          {states.map((state) => (
            <li key={state}>
              <span className={`cal-key ${state}`}>
                <Mark state={state} />
              </span>
              {legendLabel(state, counts[state])}
            </li>
          ))}
        </ul>
        <p className="cal-note">
          {t("Days fill in order from the start date, not by the date paid.")}
        </p>
      </details>
    </section>
  );
}
