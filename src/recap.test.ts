import { beforeEach, describe, expect, it } from "vitest";
import type { Snapshot } from "./data";
import { setLang } from "./i18n";
import {
  buildRecap,
  clampMonth,
  manilaMonthKey,
  recapMonths,
  shareLines,
  shiftMonth,
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
