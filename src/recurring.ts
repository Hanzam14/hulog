import type { AbonoEntry } from "./data";
import { shiftMonth } from "./recap";

/**
 * Recurring bill suggestions (SPEC 10.13): confirmed shared expenses that keep
 * coming back, offered as a one-tap pre-fill. Nothing here records anything.
 */
export const MAX_SUGGESTIONS = 3;
/** How many whole Manila months before the current one are looked at. */
export const LOOKBACK_MONTHS = 3;
/** A bill must show up in at least this many of those months. */
export const MIN_MONTHS_SEEN = 2;

/** Trim, case-fold and collapse runs of whitespace ("  KURYENTE  bill " → "kuryente bill"). */
export const normalizeDescription = (text: string): string =>
  text.trim().replace(/\s+/g, " ").toLowerCase();

export interface RecurringSuggestion {
  /** `payer|normalized description`: the identity used to dismiss it. */
  key: string;
  /** The most recent spelling, so the pre-filled text looks like the user's own. */
  description: string;
  payerId: string;
  /** Median of the past totals, in centavos. */
  totalCentavos: number;
  /** The partner's share for that total, in the same proportion as the latest past entry. */
  owedCentavos: number;
  /** How many of the last three months had it. */
  monthsSeen: number;
}

/** Median in whole centavos; an even count averages the middle two, half up. */
export function medianCentavos(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.floor((sorted[mid - 1] + sorted[mid] + 1) / 2);
}

/** `total × owed ÷ pastTotal`, rounded half up to the centavo, kept within 1..total. */
export function scaleShare(
  total: number,
  pastOwed: number,
  pastTotal: number,
): number {
  if (pastTotal <= 0) return total;
  const numerator = BigInt(total) * BigInt(pastOwed);
  const denominator = BigInt(pastTotal);
  const scaled = Number((numerator * 2n + denominator) / (denominator * 2n));
  return Math.min(total, Math.max(1, scaled));
}

const keyOf = (payerId: string, description: string) =>
  `${payerId}|${normalizeDescription(description)}`;

/**
 * Bills that recur: same payer and same normalized description on a confirmed,
 * non-deleted expense in at least two of the three Manila months before the
 * current one, with nothing recorded under that description and payer in the
 * current month yet. `today` is the Manila date (`data.today`).
 */
export function recurringSuggestions(
  entries: AbonoEntry[],
  today: string,
  dismissed: ReadonlySet<string> = new Set(),
  /** When given, only bills paid by these members are offered (filtered before the cut to three). */
  payers?: ReadonlySet<string>,
): RecurringSuggestion[] {
  const current = today.slice(0, 7);
  const window = new Set(
    Array.from({ length: LOOKBACK_MONTHS }, (_, i) =>
      shiftMonth(current, -(i + 1)),
    ),
  );

  // A pending entry this month already counts as recorded; a deleted one does not.
  const recordedNow = new Set<string>();
  for (const e of entries)
    if (
      e.kind === "expense" &&
      !e.deleted_at &&
      e.entry_date.slice(0, 7) === current
    )
      recordedNow.add(keyOf(e.from_member, e.description));

  const groups = new Map<string, AbonoEntry[]>();
  for (const e of entries) {
    if (e.kind !== "expense" || e.status !== "confirmed" || e.deleted_at)
      continue;
    if (!window.has(e.entry_date.slice(0, 7))) continue;
    const key = keyOf(e.from_member, e.description);
    if (!normalizeDescription(e.description)) continue;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  const found: (RecurringSuggestion & { latest: string })[] = [];
  for (const [key, list] of groups) {
    const months = new Set(list.map((e) => e.entry_date.slice(0, 7)));
    if (months.size < MIN_MONTHS_SEEN) continue;
    if (recordedNow.has(key) || dismissed.has(key)) continue;
    if (payers && !payers.has(list[0].from_member)) continue;
    // Newest first; the id breaks ties so the choice is stable.
    const newest = [...list].sort(
      (a, b) =>
        b.entry_date.localeCompare(a.entry_date) ||
        b.created_at.localeCompare(a.created_at) ||
        b.id.localeCompare(a.id),
    )[0];
    const total = medianCentavos(list.map((e) => e.total_amount_centavos));
    found.push({
      key,
      description: newest.description.trim().replace(/\s+/g, " "),
      payerId: newest.from_member,
      totalCentavos: total,
      owedCentavos: scaleShare(
        total,
        newest.owed_amount_centavos,
        newest.total_amount_centavos,
      ),
      monthsSeen: months.size,
      latest: newest.entry_date,
    });
  }
  return found
    .sort(
      (a, b) =>
        b.monthsSeen - a.monthsSeen ||
        b.latest.localeCompare(a.latest) ||
        a.key.localeCompare(b.key),
    )
    .slice(0, MAX_SUGGESTIONS)
    .map((s) => ({
      key: s.key,
      description: s.description,
      payerId: s.payerId,
      totalCentavos: s.totalCentavos,
      owedCentavos: s.owedCentavos,
      monthsSeen: s.monthsSeen,
    }));
}

// "Huwag na": hidden for the rest of the month, remembered on this device only.
const DISMISS_PREFIX = "hulog-recurring-dismissed:";
interface DismissedState {
  month: string;
  keys: string[];
}

export function readDismissed(userId: string, month: string): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_PREFIX + userId);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as Partial<DismissedState> | null;
    if (
      !parsed ||
      parsed.month !== month ||
      !Array.isArray(parsed.keys) ||
      !parsed.keys.every((k) => typeof k === "string")
    )
      return new Set();
    return new Set(parsed.keys);
  } catch {
    return new Set();
  }
}

/** Returns the new dismissed set even when storage is unavailable (so this session still hides it). */
export function dismissSuggestion(
  userId: string,
  month: string,
  key: string,
): Set<string> {
  const next = readDismissed(userId, month);
  next.add(key);
  try {
    localStorage.setItem(
      DISMISS_PREFIX + userId,
      JSON.stringify({ month, keys: [...next] } satisfies DismissedState),
    );
  } catch {
    /* Storage is best effort. */
  }
  return next;
}
