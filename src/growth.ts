import type { Snapshot } from "./data";
import { manilaDate } from "./recap";

/** One cumulative balance point: the balance at the end of `date` (YYYY-MM-DD). */
export interface GrowthPoint {
  date: string;
  centavos: number;
}

/** Collapse dated deltas into one cumulative point per day, oldest first. */
function cumulative(deltas: { date: string; centavos: number }[]) {
  const byDay = new Map<string, number>();
  for (const d of deltas)
    byDay.set(d.date, (byDay.get(d.date) ?? 0) + d.centavos);
  let total = 0;
  return [...byDay.keys()].sort().map((date) => {
    total += byDay.get(date)!;
    return { date, centavos: total };
  });
}

/**
 * Cumulative confirmed shared-ipon savings, dated by the Manila day of
 * confirmation (created if unknown). Starts at zero on the goal's start date.
 */
export function iponSeries(data: Snapshot, goalId: string): GrowthPoint[] {
  const goal = (data.savingsGoals ?? []).find((g) => g.id === goalId);
  if (!goal) return [];
  const series = cumulative(
    (data.savingsContributions ?? [])
      .filter(
        (c) =>
          c.goal_id === goalId && c.status === "confirmed" && !c.deleted_at,
      )
      .map((c) => ({
        date: manilaDate(c.confirmed_at ?? c.created_at),
        centavos: c.amount_centavos,
      })),
  );
  if (series.length === 0) return [];
  return series[0].date > goal.start_date
    ? [{ date: goal.start_date, centavos: 0 }, ...series]
    : series;
}

/**
 * Cumulative deposits minus withdrawals by entry date, for a goal the viewer
 * may see: their own, or a partner's only while shared. The balance is not
 * floored, so a bad record shows as it was recorded.
 */
export function personalSeries(
  data: Snapshot,
  viewerId: string,
  goalId: string,
): GrowthPoint[] {
  const goal = (data.personalGoals ?? []).find((g) => g.id === goalId);
  if (!goal || goal.deleted_at) return [];
  if (goal.owner_id !== viewerId && goal.visibility !== "shared") return [];
  return cumulative(
    (data.personalEntries ?? [])
      .filter((e) => e.goal_id === goalId && !e.deleted_at)
      .map((e) => ({
        date: e.entry_date,
        centavos: e.kind === "deposit" ? e.amount_centavos : -e.amount_centavos,
      })),
  );
}

export interface ScaledChart {
  /** SVG step path: each balance holds until the next recorded day. */
  path: string;
  points: { x: number; y: number }[];
  /** y of the target line, when a target was given. */
  targetY: number | null;
  /** y of the zero line (the bottom edge unless the balance went negative). */
  zeroY: number;
  min: number;
  max: number;
}

const DAY = 86_400_000;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY;
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Map a series onto a width x height box (x by real days, y from
 * min(0, lowest) to max(target, peak)); y grows downward as in SVG.
 */
export function scalePoints(
  series: GrowthPoint[],
  width: number,
  height: number,
  targetCentavos?: number,
  pad = { top: 8, right: 8, bottom: 8, left: 8 },
): ScaledChart {
  const values = series.map((p) => p.centavos);
  const min = Math.min(0, ...values);
  const max = Math.max(targetCentavos ?? 0, ...values, min + 1);
  const first = series.length ? dayNumber(series[0].date) : 0;
  const span = series.length
    ? Math.max(dayNumber(series[series.length - 1].date) - first, 1)
    : 1;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (date: string) =>
    round(pad.left + ((dayNumber(date) - first) / span) * innerW);
  const y = (centavos: number) =>
    round(pad.top + (1 - (centavos - min) / (max - min)) * innerH);
  const points = series.map((p) => ({ x: x(p.date), y: y(p.centavos) }));
  const path = points
    .map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `H${p.x}V${p.y}`))
    .join("");
  return {
    path,
    points,
    targetY: targetCentavos === undefined ? null : y(targetCentavos),
    zeroY: y(0),
    min,
    max,
  };
}
