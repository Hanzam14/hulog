import { beforeEach, describe, expect, it } from "vitest";
import type { Snapshot } from "./data";
import { setLang } from "./i18n";
import {
  barPercent,
  buildRecap,
  buildYearRecap,
  clampMonth,
  clampYear,
  manilaMonthKey,
  manilaYear,
  movedCentavos,
  periodLabel,
  recapMonths,
  recapYears,
  shareLines,
  shiftMonth,
  visibleMonths,
} from "./recap";

const me = "me";
const partner = "partner";

const payment = (over: Record<string, unknown>) => ({
  id: crypto.randomUUID(),
  cycle_id: "c1",
  member_id: me,
  days: 1,
  amount_centavos: 10000,
  status: "confirmed",
  created_at: "2026-10-05T02:00:00Z",
  confirmed_at: "2026-10-05T03:00:00Z",
  deleted_at: null,
  ...over,
});

function snapshot(over: Partial<Record<keyof Snapshot, unknown>> = {}) {
  return {
    profiles: [],
    groups: [{ id: "g", name: "Kami" }],
    memberships: [],
    cycles: [],
    payments: [],
    repayments: [],
    progress: [],
    changes: [],
    invites: [],
    today: "2026-10-22",
    abonoEntries: [],
    savingsGoals: [],
    savingsContributions: [],
    personalGoals: [],
    personalEntries: [],
    ...over,
  } as unknown as Snapshot;
}

beforeEach(() => setLang("en"));

describe("Manila months", () => {
  it("dates a timestamp by its Manila calendar day", () => {
    expect(manilaMonthKey("2026-09-30T16:30:00Z")).toBe("2026-10");
    expect(manilaMonthKey("2026-09-30T15:59:00Z")).toBe("2026-09");
  });

  it("shifts across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("never offers a month after the current Manila month", () => {
    const data = snapshot({
      payments: [payment({ confirmed_at: "2026-08-10T03:00:00Z" })],
    });
    expect(recapMonths(data)).toEqual({
      earliest: "2026-08",
      current: "2026-10",
    });
    expect(clampMonth(data, "2026-11")).toBe("2026-10");
    expect(clampMonth(data, "2026-01")).toBe("2026-08");
    expect(clampMonth(data, "garbage")).toBe("2026-10");
  });
});

describe("buildRecap", () => {
  it("counts confirmed payments by Manila confirm date and excludes pending and deleted", () => {
    const data = snapshot({
      payments: [
        payment({ amount_centavos: 10000 }),
        payment({ member_id: partner, amount_centavos: 25000 }),
        // Confirmed just after midnight Manila on Oct 1: October.
        payment({ amount_centavos: 700, confirmed_at: "2026-09-30T16:30:00Z" }),
        // Confirmed late Sept 30 Manila: September, not counted.
        payment({ amount_centavos: 900, confirmed_at: "2026-09-30T15:59:00Z" }),
        payment({ status: "pending", confirmed_at: null }),
        payment({ deleted_at: "2026-10-06T00:00:00Z" }),
      ],
    });
    const recap = buildRecap(data, me, "2026-10");
    expect(recap.paluwagan.paidCentavos).toBe(35700);
    expect(recap.paluwagan.byMember).toEqual([
      { memberId: partner, centavos: 25000 },
      { memberId: me, centavos: 10700 },
    ]);
    expect(recap.paluwagan.pendingCount).toBe(1);
  });

  it("values payouts by pot on the Manila received date", () => {
    const data = snapshot({
      cycles: [
        {
          id: "c1",
          receiver_id: partner,
          pot_centavos: 300000,
          received_at: "2026-10-10T05:00:00Z",
        },
        {
          id: "c0",
          receiver_id: me,
          pot_centavos: 200000,
          received_at: "2026-09-30T15:00:00Z",
        },
        { id: "c2", receiver_id: me, pot_centavos: 1, received_at: null },
      ],
    });
    const recap = buildRecap(data, me, "2026-10");
    expect(recap.paluwagan.payoutCentavos).toBe(300000);
    expect(recap.paluwagan.payouts).toEqual([
      {
        cycleId: "c1",
        receiverId: partner,
        centavos: 300000,
        receivedOn: "2026-10-10",
      },
    ]);
  });

  it("splits abono into spent by payer and settled", () => {
    const entry = (over: Record<string, unknown>) => ({
      id: crypto.randomUUID(),
      kind: "expense",
      from_member: me,
      to_member: partner,
      total_amount_centavos: 5000,
      owed_amount_centavos: 2500,
      entry_date: "2026-10-03",
      status: "confirmed",
      deleted_at: null,
      ...over,
    });
    const data = snapshot({
      abonoEntries: [
        entry({}),
        entry({ from_member: partner, total_amount_centavos: 8000 }),
        entry({ kind: "settlement", total_amount_centavos: 1500 }),
        entry({ status: "pending" }),
        entry({ entry_date: "2026-09-30" }),
        entry({ deleted_at: "2026-10-04T00:00:00Z" }),
      ],
    });
    const { abono } = buildRecap(data, me, "2026-10");
    expect(abono.spentCentavos).toBe(13000);
    expect(abono.byPayer).toEqual([
      { memberId: partner, centavos: 8000 },
      { memberId: me, centavos: 5000 },
    ]);
    expect(abono.settledCentavos).toBe(1500);
    expect(abono.pendingCount).toBe(1);
  });

  it("totals confirmed shared ipon per goal", () => {
    const data = snapshot({
      savingsGoals: [{ id: "trip", title: "Baguio" }],
      savingsContributions: [
        payment({ goal_id: "trip", amount_centavos: 4000 }),
        payment({ goal_id: "trip", amount_centavos: 6000 }),
        payment({ goal_id: "trip", status: "pending", confirmed_at: null }),
      ],
    });
    const { ipon } = buildRecap(data, me, "2026-10");
    expect(ipon.savedCentavos).toBe(10000);
    expect(ipon.byGoal).toEqual([
      { goalId: "trip", title: "Baguio", centavos: 10000 },
    ]);
    expect(ipon.pendingCount).toBe(1);
  });

  it("shows own and shared partner goals but never a partner's private goal", () => {
    const goal = (id: string, owner_id: string, visibility: string) => ({
      id,
      owner_id,
      visibility,
      title: id,
      deleted_at: null,
    });
    const entry = (goal_id: string, kind: string, amount_centavos: number) => ({
      id: crypto.randomUUID(),
      goal_id,
      kind,
      amount_centavos,
      entry_date: "2026-10-09",
      deleted_at: null,
    });
    const data = snapshot({
      personalGoals: [
        goal("mine", me, "private"),
        goal("theirs-shared", partner, "shared"),
        goal("theirs-private", partner, "private"),
      ],
      personalEntries: [
        entry("mine", "deposit", 5000),
        entry("mine", "withdrawal", 1000),
        entry("theirs-shared", "deposit", 2000),
        entry("theirs-private", "deposit", 999999),
      ],
    });
    const { personal } = buildRecap(data, me, "2026-10");
    expect(personal.goals.map((g) => g.goalId).sort()).toEqual([
      "mine",
      "theirs-shared",
    ]);
    expect(personal.netCentavos).toBe(6000);
  });

  it("keeps personal savings off the share card", () => {
    const data = snapshot({
      payments: [payment({ amount_centavos: 12300 })],
      personalGoals: [
        {
          id: "mine",
          owner_id: me,
          visibility: "private",
          title: "Secret",
          deleted_at: null,
        },
      ],
      personalEntries: [
        {
          id: "e",
          goal_id: "mine",
          kind: "deposit",
          amount_centavos: 4567800,
          entry_date: "2026-10-09",
          deleted_at: null,
        },
      ],
    });
    const recap = buildRecap(data, me, "2026-10");
    expect(recap.personal.netCentavos).toBe(4567800);
    const text = JSON.stringify(shareLines(recap));
    expect(text).toContain("123");
    expect(text).not.toContain("45,678");
    expect(text).not.toContain("Secret");
  });
});

describe("year in review", () => {
  const entry = (over: Record<string, unknown>) => ({
    id: crypto.randomUUID(),
    kind: "expense",
    from_member: me,
    to_member: partner,
    total_amount_centavos: 5000,
    owed_amount_centavos: 2500,
    entry_date: "2026-03-03",
    status: "confirmed",
    deleted_at: null,
    ...over,
  });

  it("puts the Manila New Year at 16:00Z on December 31", () => {
    expect(manilaYear("2026-12-31T15:59:00Z")).toBe("2026");
    expect(manilaYear("2026-12-31T16:30:00Z")).toBe("2027");
    const data = snapshot({
      today: "2027-02-10",
      payments: [
        payment({
          amount_centavos: 1000,
          confirmed_at: "2026-12-31T15:59:00Z",
        }),
        payment({
          amount_centavos: 2000,
          confirmed_at: "2026-12-31T16:30:00Z",
        }),
      ],
      cycles: [
        {
          id: "late",
          receiver_id: me,
          pot_centavos: 700,
          received_at: "2026-12-31T16:30:00Z",
        },
      ],
    });
    const y2026 = buildYearRecap(data, me, "2026");
    const y2027 = buildYearRecap(data, me, "2027");
    expect(y2026.recap.paluwagan.paidCentavos).toBe(1000);
    expect(y2027.recap.paluwagan.paidCentavos).toBe(2000);
    expect(y2027.recap.paluwagan.payoutCentavos).toBe(700);
    expect(y2026.recap.paluwagan.payoutCentavos).toBe(0);
    expect(y2027.months[0]).toEqual({ month: "2027-01", movedCentavos: 2000 });
    expect(y2026.months[11]).toEqual({ month: "2026-12", movedCentavos: 1000 });
  });

  it("adds up the twelve month recaps and nothing else", () => {
    const data = snapshot({
      payments: [
        payment({
          amount_centavos: 10000,
          confirmed_at: "2026-01-05T03:00:00Z",
        }),
        payment({
          member_id: partner,
          amount_centavos: 4000,
          confirmed_at: "2026-02-05T03:00:00Z",
        }),
        payment({
          amount_centavos: 6000,
          confirmed_at: "2026-02-06T03:00:00Z",
        }),
        payment({
          status: "pending",
          confirmed_at: null,
          created_at: "2026-04-02T02:00:00Z",
        }),
        payment({ deleted_at: "2026-02-07T00:00:00Z" }),
        payment({
          amount_centavos: 99900,
          confirmed_at: "2025-12-31T03:00:00Z",
        }),
      ],
      abonoEntries: [
        entry({}),
        entry({
          from_member: partner,
          total_amount_centavos: 8000,
          entry_date: "2026-07-01",
        }),
        entry({
          kind: "settlement",
          total_amount_centavos: 1500,
          entry_date: "2026-08-09",
        }),
        entry({ status: "pending", entry_date: "2026-09-09" }),
        entry({ entry_date: "2025-12-31" }),
      ],
      savingsGoals: [{ id: "trip", title: "Baguio" }],
      savingsContributions: [
        payment({
          goal_id: "trip",
          amount_centavos: 4000,
          confirmed_at: "2026-05-05T03:00:00Z",
        }),
        payment({
          goal_id: "trip",
          amount_centavos: 6000,
          confirmed_at: "2026-06-05T03:00:00Z",
        }),
        payment({
          goal_id: "trip",
          status: "pending",
          confirmed_at: null,
          created_at: "2026-06-06T02:00:00Z",
        }),
      ],
      cycles: [
        {
          id: "a",
          receiver_id: partner,
          pot_centavos: 300000,
          received_at: "2026-02-10T05:00:00Z",
        },
        {
          id: "b",
          receiver_id: me,
          pot_centavos: 200000,
          received_at: "2026-09-10T05:00:00Z",
        },
      ],
    });
    const { recap } = buildYearRecap(data, me, "2026");
    expect(recap.month).toBe("2026");
    expect(recap.paluwagan.paidCentavos).toBe(20000);
    expect(recap.paluwagan.byMember).toEqual([
      { memberId: me, centavos: 16000 },
      { memberId: partner, centavos: 4000 },
    ]);
    expect(recap.paluwagan.pendingCount).toBe(1);
    expect(recap.paluwagan.payouts.map((p) => p.cycleId)).toEqual(["a", "b"]);
    expect(recap.paluwagan.payoutCentavos).toBe(500000);
    expect(recap.abono.spentCentavos).toBe(13000);
    expect(recap.abono.byPayer).toEqual([
      { memberId: partner, centavos: 8000 },
      { memberId: me, centavos: 5000 },
    ]);
    expect(recap.abono.settledCentavos).toBe(1500);
    expect(recap.abono.pendingCount).toBe(1);
    expect(recap.ipon.savedCentavos).toBe(10000);
    expect(recap.ipon.byGoal).toEqual([
      { goalId: "trip", title: "Baguio", centavos: 10000 },
    ]);
    expect(recap.ipon.pendingCount).toBe(1);

    // Same answer as adding the month recaps by hand.
    let total = 0;
    for (let m = 1; m <= 12; m += 1)
      total += buildRecap(data, me, `2026-${String(m).padStart(2, "0")}`)
        .paluwagan.paidCentavos;
    expect(total).toBe(recap.paluwagan.paidCentavos);
  });

  it("finds the best month, the earliest on a tie, and none when quiet", () => {
    const data = snapshot({
      payments: [
        payment({
          amount_centavos: 5000,
          confirmed_at: "2026-03-05T03:00:00Z",
        }),
        payment({
          amount_centavos: 9000,
          confirmed_at: "2026-06-05T03:00:00Z",
        }),
        payment({
          amount_centavos: 9000,
          confirmed_at: "2026-09-05T03:00:00Z",
        }),
      ],
      abonoEntries: [
        entry({ entry_date: "2026-03-20", total_amount_centavos: 4000 }),
      ],
    });
    const year = buildYearRecap(data, me, "2026");
    expect(year.months.map((m) => m.movedCentavos)).toEqual([
      0, 0, 9000, 0, 0, 9000, 0, 0, 9000, 0, 0, 0,
    ]);
    expect(year.best).toEqual({ month: "2026-03", movedCentavos: 9000 });
    expect(movedCentavos(year.recap)).toBe(27000);
    // Settlements and payouts are not "new" money, so they never move a bar.
    const withSettlement = snapshot({
      abonoEntries: [
        entry({
          kind: "settlement",
          entry_date: "2026-04-04",
          total_amount_centavos: 70000,
        }),
      ],
      cycles: [
        {
          id: "p",
          receiver_id: me,
          pot_centavos: 80000,
          received_at: "2026-04-05T05:00:00Z",
        },
      ],
    });
    const quiet = buildYearRecap(withSettlement, me, "2026");
    expect(quiet.recap.abono.settledCentavos).toBe(70000);
    expect(quiet.recap.paluwagan.payoutCentavos).toBe(80000);
    expect(quiet.best).toBeNull();
    expect(buildYearRecap(data, me, "2024").best).toBeNull();
  });

  it("keeps personal savings to the viewer's own and shared goals, and off the share lines", () => {
    const goal = (id: string, owner_id: string, visibility: string) => ({
      id,
      owner_id,
      visibility,
      title: id,
      deleted_at: null,
    });
    const move = (
      goal_id: string,
      kind: string,
      amount_centavos: number,
      entry_date: string,
    ) => ({
      id: crypto.randomUUID(),
      goal_id,
      kind,
      amount_centavos,
      entry_date,
      deleted_at: null,
    });
    const data = snapshot({
      payments: [payment({ amount_centavos: 12300 })],
      personalGoals: [
        goal("mine", me, "private"),
        goal("theirs-shared", partner, "shared"),
        goal("theirs-private", partner, "private"),
      ],
      personalEntries: [
        move("mine", "deposit", 4567800, "2026-02-09"),
        move("mine", "withdrawal", 100, "2026-10-09"),
        move("theirs-shared", "deposit", 2000, "2026-05-09"),
        move("theirs-private", "deposit", 999999, "2026-05-09"),
      ],
    });
    const { recap } = buildYearRecap(data, me, "2026");
    expect(recap.personal.goals.map((g) => g.goalId).sort()).toEqual([
      "mine",
      "theirs-shared",
    ]);
    expect(recap.personal.netCentavos).toBe(4567800 - 100 + 2000);
    // The partner sees the mirror image: their own private goal, and the shared ones.
    const theirs = buildYearRecap(data, partner, "2026").recap;
    expect(theirs.personal.goals.map((g) => g.goalId).sort()).toEqual([
      "theirs-private",
      "theirs-shared",
    ]);
    const text = JSON.stringify(shareLines(recap));
    expect(text).toContain("123");
    expect(text).not.toContain("45,678");
    expect(text).not.toContain("45,679");
    expect(text).not.toContain("9,999");
    expect(text).not.toMatch(/mine|theirs|personal/i);
  });

  it("limits the picker to years with records and the rows to months up to now", () => {
    const data = snapshot({
      today: "2027-03-02",
      payments: [payment({ confirmed_at: "2025-11-10T03:00:00Z" })],
    });
    expect(recapYears(data)).toEqual({ earliest: "2025", current: "2027" });
    expect(clampYear(data, "2030")).toBe("2027");
    expect(clampYear(data, "2020")).toBe("2025");
    expect(clampYear(data, "garbage")).toBe("2027");
    expect(visibleMonths(data, "2025")).toEqual(["2025-11", "2025-12"]);
    expect(visibleMonths(data, "2027")).toEqual([
      "2027-01",
      "2027-02",
      "2027-03",
    ]);
  });

  it("labels a year plainly and scales bars", () => {
    setLang("en");
    expect(periodLabel("2026")).toBe("2026");
    expect(periodLabel("2026-10")).toBe("October 2026");
    expect(barPercent(0, 100)).toBe(0);
    expect(barPercent(100, 0)).toBe(0);
    expect(barPercent(50, 100)).toBe(50);
    expect(barPercent(1, 100000)).toBe(3);
    expect(barPercent(100, 100)).toBe(100);
  });
});
