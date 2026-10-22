import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calendarMembers,
  calendarWeeks,
  dayCounts,
  memberDayCounts,
  roundDays,
  roundLength,
  type DayState,
} from "./calendar";
import type { Cycle, Payment, Progress } from "./data";

const me = "member-me";
const partner = "member-partner";

const cycle = (patch: Partial<Cycle> = {}): Cycle => ({
  id: "c1",
  group_id: "g",
  daily_amount_centavos: 10000,
  num_days: 10,
  start_date: "2026-10-10",
  end_date: "2026-10-19",
  receiver_id: partner,
  proposed_by: me,
  status: "accepted",
  phase: "open",
  pot_centavos: 0,
  target_centavos: 200000,
  payout_state: null,
  received_at: null,
  days_left: 4,
  created_at: "2026-10-09",
  ...patch,
});
const progress = (
  confirmed: number,
  pending: number,
  member = me,
  cycleId = "c1",
): Progress => ({
  cycle_id: cycleId,
  member_id: member,
  expected_centavos: 100000,
  confirmed_days: confirmed,
  pending_days: pending,
  pending_count: pending > 0 ? 1 : 0,
  debt_centavos: 0,
});
let nextPayment = 0;
const payment = (patch: Partial<Payment>): Payment => ({
  id: `p${nextPayment++}`,
  cycle_id: "c1",
  member_id: me,
  days: 1,
  amount_centavos: 10000,
  status: "confirmed",
  was_confirmed: false,
  created_at: "2026-10-10T01:00:00Z",
  deleted_at: null,
  ...patch,
});
const states = (days: { state: DayState }[]) => days.map((d) => d.state);
const none = { progress: [], payments: [] };
const withProgress = (...rows: Progress[]) => ({
  progress: rows,
  payments: [],
});

afterEach(() => vi.useRealTimers());

describe("roundDays fill order", () => {
  it("fills paid, then pending, then missed before today, then upcoming", () => {
    const days = roundDays(
      cycle(),
      withProgress(progress(3, 2)),
      me,
      "2026-10-17",
    );
    expect(days.map((d) => d.date)).toEqual([
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
      "2026-10-19",
    ]);
    expect(states(days)).toEqual([
      "paid",
      "paid",
      "paid",
      "pending",
      "pending",
      "missed",
      "missed",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
    expect(dayCounts(days)).toEqual({
      paid: 3,
      pending: 2,
      missed: 2,
      upcoming: 3,
    });
  });

  it("marks later days paid when the member pays ahead", () => {
    const days = roundDays(
      cycle(),
      withProgress(progress(6, 0)),
      me,
      "2026-10-10",
    );
    expect(states(days)).toEqual([
      ...Array<DayState>(6).fill("paid"),
      ...Array<DayState>(4).fill("upcoming"),
    ]);
  });

  it("fills the earliest missed days first when a late payment arrives", () => {
    const days = roundDays(
      cycle(),
      withProgress(progress(0, 1)),
      me,
      "2026-10-14",
    );
    expect(states(days).slice(0, 5)).toEqual([
      "pending",
      "missed",
      "missed",
      "missed",
      "upcoming",
    ]);
  });

  it("clamps counts to the days shown and ignores junk values", () => {
    const days = roundDays(
      cycle(),
      withProgress(progress(8, 9)),
      me,
      "2026-10-10",
    );
    expect(dayCounts(days)).toMatchObject({ paid: 8, pending: 2 });
    const junk = roundDays(
      cycle(),
      withProgress(progress(-3, Number.NaN)),
      me,
      "2026-10-10",
    );
    expect(dayCounts(junk).upcoming).toBe(10);
  });
});

describe("today boundary", () => {
  it("treats an unpaid today as upcoming, not missed", () => {
    const days = roundDays(cycle(), none, me, "2026-10-10");
    expect(states(days)).toEqual(Array<DayState>(10).fill("upcoming"));
  });
  it("misses only days strictly before today", () => {
    const days = roundDays(cycle(), none, me, "2026-10-11");
    expect(states(days).slice(0, 3)).toEqual([
      "missed",
      "upcoming",
      "upcoming",
    ]);
  });
  it("misses every unpaid day once the round is past its end date", () => {
    const days = roundDays(
      cycle({ phase: "settling" }),
      withProgress(progress(7, 1)),
      me,
      "2026-10-20",
    );
    expect(dayCounts(days)).toEqual({
      paid: 7,
      pending: 1,
      missed: 2,
      upcoming: 0,
    });
  });
  it("does not read the clock: the passed-in today decides", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-01-01T00:00:00Z"));
    const lateClock = roundDays(cycle(), none, me, "2026-10-12");
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    const earlyClock = roundDays(cycle(), none, me, "2026-10-12");
    expect(dayCounts(lateClock)).toEqual({
      paid: 0,
      pending: 0,
      missed: 2,
      upcoming: 8,
    });
    expect(earlyClock).toEqual(lateClock);
  });
});

describe("payments fallback", () => {
  it("sums non-deleted payments by status for this member and cycle only", () => {
    const payments = [
      payment({ days: 2 }),
      payment({ days: 5, deleted_at: "2026-10-12T00:00:00Z" }),
      payment({ days: 1, status: "pending" }),
      payment({
        days: 3,
        status: "pending",
        deleted_at: "2026-10-12T00:00:00Z",
      }),
      payment({ days: 4, member_id: partner }),
      payment({ days: 6, cycle_id: "other" }),
    ];
    expect(memberDayCounts(cycle(), { progress: [], payments }, me)).toEqual({
      confirmed: 2,
      pending: 1,
    });
    const days = roundDays(
      cycle(),
      { progress: [], payments },
      me,
      "2026-10-15",
    );
    expect(states(days).slice(0, 5)).toEqual([
      "paid",
      "paid",
      "pending",
      "missed",
      "missed",
    ]);
  });
  it("prefers the derived progress row when there is one", () => {
    const payments = [payment({ days: 9 })];
    expect(
      memberDayCounts(cycle(), { progress: [progress(1, 0)], payments }, me),
    ).toEqual({ confirmed: 1, pending: 0 });
  });
  it("shows a member with zero days as all missed or upcoming", () => {
    const days = roundDays(cycle(), none, partner, "2026-10-15");
    expect(dayCounts(days)).toEqual({
      paid: 0,
      pending: 0,
      missed: 5,
      upcoming: 5,
    });
  });
});

describe("early close", () => {
  it("stops at the shortened end date and counts only days shown", () => {
    const closed = cycle({ end_date: "2026-10-14", phase: "settling" });
    expect(roundLength(closed)).toBe(5);
    const days = roundDays(
      closed,
      withProgress(progress(10, 0)),
      me,
      "2026-10-15",
    );
    expect(days.map((d) => d.date)).toEqual([
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
    ]);
    expect(dayCounts(days)).toEqual({
      paid: 5,
      pending: 0,
      missed: 0,
      upcoming: 0,
    });
  });
  it("shows nothing when the round closed before its first day", () => {
    const closed = cycle({ end_date: "2026-10-09" });
    expect(roundLength(closed)).toBe(0);
    expect(roundDays(closed, none, me, "2026-10-10")).toEqual([]);
  });
  it("never shows more days than num_days", () => {
    expect(roundLength(cycle({ end_date: "2026-12-31" }))).toBe(10);
  });
});

describe("calendarWeeks", () => {
  it("pads a mid-week start that spans two months", () => {
    // 2026-10-28 is a Wednesday, so three empty Sunday-Tuesday cells lead.
    const days = roundDays(
      cycle({ start_date: "2026-10-28", end_date: "2026-11-06" }),
      none,
      me,
      "2026-10-30",
    );
    const weeks = calendarWeeks(days);
    expect(weeks).toHaveLength(2);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0][3]?.date).toBe("2026-10-28");
    expect(weeks[0][6]?.date).toBe("2026-10-31");
    expect(weeks[1][0]?.date).toBe("2026-11-01");
    expect(weeks[1][5]?.date).toBe("2026-11-06");
    expect(weeks[1][6]).toBeNull();
    expect(weeks.flat().filter((cell) => cell !== null)).toEqual(days);
  });
  it("needs no padding for whole weeks that start on a Sunday", () => {
    // 2026-10-18 is a Sunday.
    const days = roundDays(
      cycle({ num_days: 14, start_date: "2026-10-18", end_date: "2026-10-31" }),
      none,
      me,
      "2026-10-18",
    );
    const weeks = calendarWeeks(days);
    expect(weeks).toHaveLength(2);
    expect(weeks.flat().every((cell) => cell !== null)).toBe(true);
    expect(weeks[0][0]?.date).toBe("2026-10-18");
  });
  it("pads a single Saturday with six leading cells", () => {
    const days = roundDays(
      cycle({ num_days: 1, start_date: "2026-10-17", end_date: "2026-10-17" }),
      none,
      me,
      "2026-10-17",
    );
    const weeks = calendarWeeks(days);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].slice(0, 6)).toEqual(Array(6).fill(null));
    expect(weeks[0][6]?.date).toBe("2026-10-17");
  });
  it("returns no rows for no days", () => {
    expect(calendarWeeks([])).toEqual([]);
  });
});

describe("calendarMembers", () => {
  const both = withProgress(progress(0, 0, me), progress(0, 0, partner));
  it("lists both members, including the receiver", () => {
    expect(calendarMembers(cycle(), both)).toEqual([me, partner]);
  });
  it("lists only the saver in a solo round", () => {
    expect(
      calendarMembers(cycle({ is_solo: true, receiver_id: me }), both),
    ).toEqual([me]);
  });
  it("ignores other cycles and rounds that are not open, settling or ended", () => {
    const data = withProgress(
      progress(0, 0, me),
      progress(0, 0, partner),
      progress(0, 0, me, "x"),
    );
    expect(calendarMembers(cycle({ phase: "upcoming" }), data)).toEqual([]);
    expect(calendarMembers(cycle({ status: "proposed" }), data)).toEqual([]);
    expect(calendarMembers(cycle({ phase: "settling" }), data)).toEqual([
      me,
      partner,
    ]);
    expect(calendarMembers(cycle({ phase: "ended" }), data)).toEqual([
      me,
      partner,
    ]);
  });
});
