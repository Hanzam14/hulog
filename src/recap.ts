import type { Snapshot } from "./data";
import { cleanGoalTitle, money } from "./helpers";
import { type Lang, languageSnapshot, t } from "./i18n";

/** Same Manila-day convention as the history feed ("en-CA" gives YYYY-MM-DD). */
export const manilaDate = (at: string | Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    new Date(at),
  );
/** "2026-10-07" or an ISO timestamp in Manila → "2026-10". */
export const manilaMonthKey = (at: string | Date): string =>
  manilaDate(at).slice(0, 7);

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isMonthKey = (value: string) => MONTH_KEY.test(value);

/** Move a YYYY-MM key by whole months (negative goes back). */
export function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split("-").map(Number);
  const index = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(index / 12);
  return `${String(nextYear).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** "2026-10" → "October 2026" (Filipino month names in Tagalog). */
export function monthLabel(key: string, lang: Lang = languageSnapshot()) {
  return new Intl.DateTimeFormat(lang === "tl" ? "fil-PH" : "en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${key}-01T00:00:00Z`));
}

const YEAR_KEY = /^\d{4}$/;
export const isYearKey = (value: string) => YEAR_KEY.test(value);
/** A Manila date or timestamp → its Manila calendar year ("2027"). */
export const manilaYear = (at: string | Date): string =>
  manilaDate(at).slice(0, 4);

/** A month key reads as "October 2026"; a year key stays "2026". */
export const periodLabel = (key: string, lang: Lang = languageSnapshot()) =>
  isYearKey(key) ? key : monthLabel(key, lang);

/** "2026-10" → "Oct" for the narrow per-month rows. */
export function shortMonthLabel(key: string, lang: Lang = languageSnapshot()) {
  return new Intl.DateTimeFormat(lang === "tl" ? "fil-PH" : "en-PH", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${key}-01T00:00:00Z`));
}

/** Date a confirmed money record by when it was confirmed (created if unknown). */
const confirmedOn = (r: { confirmed_at?: string | null; created_at: string }) =>
  manilaDate(r.confirmed_at ?? r.created_at);

export interface MemberAmount {
  memberId: string;
  centavos: number;
}
export interface Recap {
  month: string;
  groupName: string;
  paluwagan: {
    paidCentavos: number;
    byMember: MemberAmount[];
    payouts: {
      cycleId: string;
      receiverId: string;
      centavos: number;
      receivedOn: string;
    }[];
    payoutCentavos: number;
    pendingCount: number;
  };
  abono: {
    spentCentavos: number;
    byPayer: MemberAmount[];
    settledCentavos: number;
    pendingCount: number;
  };
  ipon: {
    savedCentavos: number;
    byGoal: { goalId: string; title: string; centavos: number }[];
    pendingCount: number;
  };
  personal: {
    netCentavos: number;
    goals: {
      goalId: string;
      title: string;
      ownerId: string;
      netCentavos: number;
    }[];
  };
}

/** Earliest month with any record, and the current Manila month. */
export function recapMonths(data: Snapshot): {
  earliest: string;
  current: string;
} {
  const current = data.today.slice(0, 7);
  const dates: string[] = [];
  for (const p of data.payments) if (!p.deleted_at) dates.push(confirmedOn(p));
  for (const c of data.cycles)
    if (c.received_at) dates.push(manilaDate(c.received_at));
  for (const e of data.abonoEntries ?? [])
    if (!e.deleted_at) dates.push(e.entry_date);
  for (const c of data.savingsContributions ?? [])
    if (!c.deleted_at) dates.push(confirmedOn(c));
  for (const e of data.personalEntries ?? [])
    if (!e.deleted_at) dates.push(e.entry_date);
  const months = dates.map((d) => d.slice(0, 7)).filter((m) => m <= current);
  const earliest = months.length
    ? months.reduce((a, b) => (a < b ? a : b))
    : current;
  return { earliest, current };
}

/** Keep a requested month inside what the picker allows. */
export function clampMonth(data: Snapshot, key: string): string {
  const { earliest, current } = recapMonths(data);
  if (!isMonthKey(key)) return current;
  return key > current ? current : key < earliest ? earliest : key;
}

function addTo(map: Map<string, number>, key: string, centavos: number) {
  map.set(key, (map.get(key) ?? 0) + centavos);
}
const sortedAmounts = (map: Map<string, number>): MemberAmount[] =>
  [...map]
    .map(([memberId, centavos]) => ({ memberId, centavos }))
    .sort(
      (a, b) => b.centavos - a.centavos || a.memberId.localeCompare(b.memberId),
    );

export function buildRecap(
  data: Snapshot,
  viewerId: string,
  month: string,
): Recap {
  const inMonth = (date: string) => date.slice(0, 7) === month;
  const live = <T extends { deleted_at: string | null }>(r: T) => !r.deleted_at;

  const paidBy = new Map<string, number>();
  let paluwaganPending = 0;
  for (const p of data.payments.filter(live)) {
    if (p.status === "confirmed") {
      if (inMonth(confirmedOn(p)))
        addTo(paidBy, p.member_id, p.amount_centavos);
    } else if (p.status === "pending" && inMonth(manilaDate(p.created_at))) {
      paluwaganPending += 1;
    }
  }
  const payouts = data.cycles
    .filter((c) => c.received_at && inMonth(manilaDate(c.received_at)))
    .map((c) => ({
      cycleId: c.id,
      receiverId: c.receiver_id,
      centavos: c.pot_centavos,
      receivedOn: manilaDate(c.received_at as string),
    }))
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn));

  const spentBy = new Map<string, number>();
  let settled = 0;
  let abonoPending = 0;
  for (const e of (data.abonoEntries ?? []).filter(live)) {
    if (!inMonth(e.entry_date)) continue;
    if (e.status === "pending") abonoPending += 1;
    else if (e.status === "confirmed") {
      if (e.kind === "expense")
        addTo(spentBy, e.from_member, e.total_amount_centavos);
      else settled += e.total_amount_centavos;
    }
  }

  const goalTitles = new Map(
    (data.savingsGoals ?? []).map((g) => [g.id, cleanGoalTitle(g.title)]),
  );
  const perGoal = new Map<string, number>();
  let iponPending = 0;
  for (const c of (data.savingsContributions ?? []).filter(live)) {
    if (c.status === "confirmed") {
      if (inMonth(confirmedOn(c))) addTo(perGoal, c.goal_id, c.amount_centavos);
    } else if (c.status === "pending" && inMonth(manilaDate(c.created_at))) {
      iponPending += 1;
    }
  }

  // Own goals, plus a partner's goals only while they are shared. Everything
  // else is dropped here even though RLS should never send it.
  const personalGoals = (data.personalGoals ?? []).filter(
    (g) =>
      !g.deleted_at && (g.owner_id === viewerId || g.visibility === "shared"),
  );
  const personal: Recap["personal"]["goals"] = [];
  for (const g of personalGoals) {
    const moves = (data.personalEntries ?? []).filter(
      (e) => e.goal_id === g.id && !e.deleted_at && inMonth(e.entry_date),
    );
    if (!moves.length) continue;
    personal.push({
      goalId: g.id,
      title: cleanGoalTitle(g.title),
      ownerId: g.owner_id,
      netCentavos: moves.reduce(
        (total, e) =>
          total +
          (e.kind === "deposit" ? e.amount_centavos : -e.amount_centavos),
        0,
      ),
    });
  }

  const sum = (values: Iterable<number>) =>
    [...values].reduce((a, b) => a + b, 0);
  return {
    month,
    groupName: data.groups[0]?.name ?? "",
    paluwagan: {
      paidCentavos: sum(paidBy.values()),
      byMember: sortedAmounts(paidBy),
      payouts,
      payoutCentavos: sum(payouts.map((p) => p.centavos)),
      pendingCount: paluwaganPending,
    },
    abono: {
      spentCentavos: sum(spentBy.values()),
      byPayer: sortedAmounts(spentBy),
      settledCentavos: settled,
      pendingCount: abonoPending,
    },
    ipon: {
      savedCentavos: sum(perGoal.values()),
      byGoal: [...perGoal]
        .map(([goalId, centavos]) => ({
          goalId,
          title: goalTitles.get(goalId) ?? t("Ipon goal"),
          centavos,
        }))
        .sort(
          (a, b) => b.centavos - a.centavos || a.goalId.localeCompare(b.goalId),
        ),
      pendingCount: iponPending,
    },
    personal: {
      netCentavos: sum(personal.map((g) => g.netCentavos)),
      goals: personal,
    },
  };
}

/** Earliest and current Manila year, from the same dates the month picker uses. */
export function recapYears(data: Snapshot): {
  earliest: string;
  current: string;
} {
  const { earliest, current } = recapMonths(data);
  return { earliest: earliest.slice(0, 4), current: current.slice(0, 4) };
}

/** Keep a requested year inside what the picker allows. */
export function clampYear(data: Snapshot, key: string): string {
  const { earliest, current } = recapYears(data);
  if (!isYearKey(key)) return current;
  return key > current ? current : key < earliest ? earliest : key;
}

/**
 * Money the group moved in a period: paluwagan paid in, abono spent and
 * shared ipon saved. Payouts and settlements are left out on purpose: a payout
 * hands back money already counted as paid in, and a settlement pays back an
 * expense already counted as spent.
 */
export const movedCentavos = (recap: Recap): number =>
  recap.paluwagan.paidCentavos +
  recap.abono.spentCentavos +
  recap.ipon.savedCentavos;

/** Bar width in whole percent: 0 for nothing, otherwise at least 3 so a small month stays visible. */
export function barPercent(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(100, Math.max(3, Math.round((value / max) * 100)));
}

export interface YearRecap {
  /** Same shape as a month recap; `month` holds the year ("2026"). */
  recap: Recap;
  /** January to December, each with the group total moved in that month. */
  months: { month: string; movedCentavos: number }[];
  /** Highest total moved; the earliest month wins a tie; null when nothing moved. */
  best: { month: string; movedCentavos: number } | null;
}

function mergeAmounts(lists: MemberAmount[][]): MemberAmount[] {
  const map = new Map<string, number>();
  for (const list of lists)
    for (const item of list) addTo(map, item.memberId, item.centavos);
  return sortedAmounts(map);
}

/** The months of a year the picker could show: no earlier than the first record, none in the future. */
export function visibleMonths(data: Snapshot, year: string): string[] {
  const { earliest, current } = recapMonths(data);
  return Array.from(
    { length: 12 },
    (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`,
  ).filter((m) => m >= earliest && m <= current);
}

/**
 * A Manila calendar year, built by adding up the twelve month recaps so the
 * month rules (confirmed only, Manila dates, personal visibility) live in one
 * place.
 */
export function buildYearRecap(
  data: Snapshot,
  viewerId: string,
  year: string,
): YearRecap {
  const monthly = Array.from({ length: 12 }, (_, i) =>
    buildRecap(data, viewerId, `${year}-${String(i + 1).padStart(2, "0")}`),
  );
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

  const goalTotals = new Map<string, { title: string; centavos: number }>();
  for (const m of monthly)
    for (const g of m.ipon.byGoal) {
      const known = goalTotals.get(g.goalId);
      if (known) known.centavos += g.centavos;
      else goalTotals.set(g.goalId, { title: g.title, centavos: g.centavos });
    }
  const personalTotals = new Map<string, Recap["personal"]["goals"][number]>();
  for (const m of monthly)
    for (const g of m.personal.goals) {
      const known = personalTotals.get(g.goalId);
      if (known) known.netCentavos += g.netCentavos;
      else personalTotals.set(g.goalId, { ...g });
    }
  const personalGoals = [...personalTotals.values()];
  const payouts = monthly
    .flatMap((m) => m.paluwagan.payouts)
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn));

  const recap: Recap = {
    month: year,
    groupName: data.groups[0]?.name ?? "",
    paluwagan: {
      paidCentavos: sum(monthly.map((m) => m.paluwagan.paidCentavos)),
      byMember: mergeAmounts(monthly.map((m) => m.paluwagan.byMember)),
      payouts,
      payoutCentavos: sum(payouts.map((p) => p.centavos)),
      pendingCount: sum(monthly.map((m) => m.paluwagan.pendingCount)),
    },
    abono: {
      spentCentavos: sum(monthly.map((m) => m.abono.spentCentavos)),
      byPayer: mergeAmounts(monthly.map((m) => m.abono.byPayer)),
      settledCentavos: sum(monthly.map((m) => m.abono.settledCentavos)),
      pendingCount: sum(monthly.map((m) => m.abono.pendingCount)),
    },
    ipon: {
      savedCentavos: sum(monthly.map((m) => m.ipon.savedCentavos)),
      byGoal: [...goalTotals]
        .map(([goalId, g]) => ({ goalId, ...g }))
        .sort(
          (a, b) => b.centavos - a.centavos || a.goalId.localeCompare(b.goalId),
        ),
      pendingCount: sum(monthly.map((m) => m.ipon.pendingCount)),
    },
    personal: {
      netCentavos: sum(personalGoals.map((g) => g.netCentavos)),
      goals: personalGoals,
    },
  };

  const months = monthly.map((m) => ({
    month: m.month,
    movedCentavos: movedCentavos(m),
  }));
  let best: YearRecap["best"] = null;
  for (const m of months)
    if (m.movedCentavos > (best?.movedCentavos ?? 0)) best = m;
  return { recap, months, best };
}

export interface ShareLine {
  label: string;
  value: string;
  tone: "pink" | "blue" | "leaf";
}
/** Rows for the share card: group figures only, never personal savings. */
export function shareLines(recap: Recap): ShareLine[] {
  const rows: ShareLine[] = [];
  const { paluwagan: p, abono: a, ipon: i } = recap;
  if (p.paidCentavos > 0 || p.payoutCentavos > 0) {
    rows.push({
      label: t("Paluwagan paid"),
      value: money(p.paidCentavos),
      tone: "pink",
    });
    rows.push({
      label: t("Paluwagan payouts"),
      value: money(p.payoutCentavos),
      tone: "pink",
    });
  }
  if (a.spentCentavos > 0 || a.settledCentavos > 0) {
    rows.push({
      label: t("Abono spent"),
      value: money(a.spentCentavos),
      tone: "blue",
    });
    rows.push({
      label: t("Abono settled"),
      value: money(a.settledCentavos),
      tone: "blue",
    });
  }
  if (i.savedCentavos > 0)
    rows.push({
      label: t("Shared ipon saved"),
      value: money(i.savedCentavos),
      tone: "leaf",
    });
  return rows;
}
