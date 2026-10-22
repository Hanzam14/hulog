import type { Cycle, Payment, Progress, Snapshot } from "./data";
import { addDays } from "./helpers";

/**
 * Spec 10.9. Payments count a number of days, not specific dates, so days are
 * filled in order from start_date: paid, then pending, then missed (before
 * today) or upcoming. Pure and read-only; "today" is always passed in.
 */

export type DayState = "paid" | "pending" | "missed" | "upcoming";
export interface RoundDay {
  date: string;
  state: DayState;
}
export type DayCounts = Record<DayState, number>;
/** Calendar weeks start on Sunday; a null cell is padding outside the round. */
export type WeekRow = (RoundDay | null)[];

type CalendarSource = Pick<Snapshot, "progress" | "payments">;

const wholeDays = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

/** Whole days between two YYYY-MM-DD dates (later minus earlier). */
const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );

/**
 * Days shown: start_date through the stored end_date. An early close moves
 * end_date earlier (spec 4 rule 8a), which truncates the calendar.
 */
export function roundLength(cycle: Cycle): number {
  return Math.min(
    wholeDays(cycle.num_days),
    Math.max(0, daysBetween(cycle.start_date, cycle.end_date) + 1),
  );
}

/** Confirmed and pending day counts: derived progress first, else non-deleted payments. */
export function memberDayCounts(
  cycle: Cycle,
  data: CalendarSource,
  memberId: string,
): { confirmed: number; pending: number } {
  const row: Progress | undefined = data.progress.find(
    (p) => p.cycle_id === cycle.id && p.member_id === memberId,
  );
  if (row)
    return {
      confirmed: wholeDays(row.confirmed_days),
      pending: wholeDays(row.pending_days),
    };
  const sum = (status: Payment["status"]) =>
    data.payments
      .filter(
        (p) =>
          p.cycle_id === cycle.id &&
          p.member_id === memberId &&
          !p.deleted_at &&
          p.status === status,
      )
      .reduce((total, p) => total + wholeDays(p.days), 0);
  return { confirmed: sum("confirmed"), pending: sum("pending") };
}

/** Every day of the round for one member, filled in order (not per date paid). */
export function roundDays(
  cycle: Cycle,
  data: CalendarSource,
  memberId: string,
  today: string,
): RoundDay[] {
  const length = roundLength(cycle);
  const { confirmed, pending } = memberDayCounts(cycle, data, memberId);
  const paid = Math.min(confirmed, length);
  const waiting = Math.min(pending, length - paid);
  return Array.from({ length }, (_, i) => {
    const date = addDays(cycle.start_date, i);
    const state: DayState =
      i < paid
        ? "paid"
        : i < paid + waiting
          ? "pending"
          : // Today is still payable (rule 5), so only earlier days are missed.
            date < today
            ? "missed"
            : "upcoming";
    return { date, state };
  });
}

export function dayCounts(days: RoundDay[]): DayCounts {
  const counts: DayCounts = { paid: 0, pending: 0, missed: 0, upcoming: 0 };
  for (const day of days) counts[day.state] += 1;
  return counts;
}

/** Sunday-first rows of 7, padded with null before the first and after the last day. */
export function calendarWeeks(days: RoundDay[]): WeekRow[] {
  if (days.length === 0) return [];
  const lead = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  const cells: WeekRow = [...Array<null>(lead).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: WeekRow[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * Members who owe days in this round: both active members (the receiver pays
 * in too), but only the saver in a solo round. Empty unless the round is
 * accepted and open, settling or ended.
 */
export function calendarMembers(cycle: Cycle, data: CalendarSource): string[] {
  if (cycle.status !== "accepted") return [];
  if (!["open", "settling", "ended"].includes(cycle.phase)) return [];
  const members = data.progress
    .filter((p) => p.cycle_id === cycle.id)
    .map((p) => p.member_id);
  return cycle.is_solo
    ? members.filter((id) => id === cycle.receiver_id)
    : members;
}
