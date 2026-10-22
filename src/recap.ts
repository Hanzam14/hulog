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
