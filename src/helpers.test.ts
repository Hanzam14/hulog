import { afterEach, describe, expect, it } from "vitest";
import {
  addDays,
  cadenceDisplay,
  cleanGoalTitle,
  getSoloBadgeText,
  getSoloCycleBadgeText,
  isSoloCycle,
  isSoloGoal,
  csv,
  filterHistory,
  historyMonths,
  iponGoalProgress,
  money,
  parsePesos,
  payoutCountdown,
  phaseDisplay,
  shortDate,
  splitHalfCentavos,
} from "./helpers";
import { setLang } from "./i18n";

afterEach(() => {
  setLang("taglish");
});

describe("shortDate", () => {
  it("shows a cycle date as month and day", () => {
    expect(shortDate("2026-10-07")).toBe("Oct 7");
    expect(shortDate("2026-12-31")).toBe("Dec 31");
  });
});

describe("integer centavo helpers", () => {
  it("formats money in pesos", () => {
    expect(money(145000)).toBe("₱1,450.00");
    expect(money(1)).toBe("₱0.01");
  });
  it("parses exact decimal centavos", () => {
    expect(parsePesos("50")).toBe(5000);
    expect(parsePesos("0.29")).toBe(29);
    expect(parsePesos("100.5")).toBe(10050);
  });
  it.each(["0", "-1", "1.001", "no", "1e4", "", "999999999999999999"])(
    "rejects invalid amount %s",
    (value) => {
      expect(() => parsePesos(value)).toThrow();
    },
  );
});
describe("display helpers", () => {
  it("uses calendar dates without the browser timezone", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("labels phases", () => {
    expect(phaseDisplay("open", 1)).toBe("Open, 1 day left");
    expect(phaseDisplay("open", 15)).toBe("Open, 15 days left");
    expect(phaseDisplay("settling", 0)).toContain("last day");
    expect(phaseDisplay("ended", 0)).toBe("Ended");
    expect(phaseDisplay("completed", 0)).toBe("Goal reached ✓");
    expect(phaseDisplay("withdrawn", 0)).toBe("Withdrawn");
    expect(phaseDisplay("overdue", 0)).toBe("Lagpas sa target date");
    expect(phaseDisplay("expired", 0)).toBe("Proposal expired");

    setLang("en");
    expect(phaseDisplay("completed", 0)).toBe("Goal reached ✓");
    expect(phaseDisplay("withdrawn", 0)).toBe("Withdrawn");
    expect(phaseDisplay("overdue", 0)).toBe("Past target date");
    expect(phaseDisplay("expired", 0)).toBe("Proposal expired");
  });
  it("formats cadence intervals", () => {
    setLang("en");
    expect(cadenceDisplay(null)).toBe("Flexible anytime");
    expect(cadenceDisplay(1)).toBe("Every day");
    expect(cadenceDisplay(7)).toBe("Every week");
    expect(cadenceDisplay(3)).toBe("Every 3 days");
    expect(cadenceDisplay(14)).toBe("Every 14 days");

    setLang("taglish");
    expect(cadenceDisplay(null)).toBe("Flexible kahit kailan");
    expect(cadenceDisplay(1)).toBe("Araw-araw");
    expect(cadenceDisplay(7)).toBe("Linggu-linggo");
    expect(cadenceDisplay(3)).toBe("Tuwing 3 araw");
  });
  it("splits centavos evenly with ceiling for odd amounts", () => {
    expect(splitHalfCentavos(0)).toBe(0);
    expect(splitHalfCentavos(1)).toBe(1);
    expect(splitHalfCentavos(100)).toBe(50);
    expect(splitHalfCentavos(101)).toBe(51);
    expect(splitHalfCentavos(2500)).toBe(1250);
    expect(splitHalfCentavos(2501)).toBe(1251);
  });
  it("quotes CSV and prevents spreadsheet formula injection", () => {
    expect(csv([{ name: "=1+1", note: 'a,"b"\nline', amount: 5000 }])).toBe(
      '"name","note","amount"\r\n"\'=1+1","a,""b""\nline","5000"',
    );
    expect(csv([])).toBe("");
  });
  it("collects history months and filters history cycles, goals, and totals by month and member", () => {
    const cycles = [
      {
        id: "c1",
        end_date: "2026-09-15",
        receiver_id: "a",
        pot_centavos: 150000,
      },
      {
        id: "c2",
        end_date: "2026-10-20",
        receiver_id: "b",
        pot_centavos: 200000,
      },
    ];
    const goals = [
      {
        id: "g1",
        end_date: "2026-10-25",
        holder_id: "a",
        proposed_by: "b",
        saved_centavos: 100000,
      },
      {
        id: "g2",
        end_date: "2026-08-10",
        holder_id: "a",
        proposed_by: "a",
        saved_centavos: 50000,
      },
    ];
    const progress = [
      { cycle_id: "c1", member_id: "b", debt_centavos: 25000 },
      { cycle_id: "c2", member_id: "a", debt_centavos: 10000 },
    ];

    expect(historyMonths(cycles, goals)).toEqual([
      "2026-10",
      "2026-09",
      "2026-08",
    ]);

    const all = filterHistory({
      cycles,
      goals,
      progress,
      month: "all",
      memberId: "all",
    });
    expect(all.cycles).toHaveLength(2);
    expect(all.goals).toHaveLength(2);
    expect(all.totalPotCentavos).toBe(350000);
    expect(all.totalSavedCentavos).toBe(150000);
    expect(all.totalDebtCentavos).toBe(35000);

    const octOnly = filterHistory({
      cycles,
      goals,
      progress,
      month: "2026-10",
      memberId: "all",
    });
    expect(octOnly.cycles.map((c) => c.id)).toEqual(["c2"]);
    expect(octOnly.goals.map((g) => g.id)).toEqual(["g1"]);
    expect(octOnly.totalPotCentavos).toBe(200000);
    expect(octOnly.totalSavedCentavos).toBe(100000);
    expect(octOnly.totalDebtCentavos).toBe(10000);

    const memberBOnly = filterHistory({
      cycles,
      goals,
      progress,
      month: "all",
      memberId: "b",
    });
    expect(memberBOnly.cycles.map((c) => c.id)).toEqual(["c2"]);
    expect(memberBOnly.goals.map((g) => g.id)).toEqual(["g1"]);
    expect(memberBOnly.totalPotCentavos).toBe(200000);
    expect(memberBOnly.totalSavedCentavos).toBe(100000);
    expect(memberBOnly.totalDebtCentavos).toBe(10000);
  });
  it("computes iponGoalProgress percent and On track / Behind pace labels", () => {
    setLang("en");
    const baseGoal = {
      saved_centavos: 50000,
      target_amount_centavos: 100000,
      goal_mode: "matched" as const,
      step_amount_centavos: 5000,
      expected_steps_today: 5,
      start_date: "2026-10-17",
      end_date: "2026-10-26",
      phase: "open",
    };
    expect(iponGoalProgress(baseGoal)).toEqual({
      percent: 50,
      onTrack: true,
      paceLabel: "On track",
      reachedTarget: false,
    });
    expect(
      iponGoalProgress({ ...baseGoal, expected_steps_today: 6 }),
    ).toEqual({
      percent: 50,
      onTrack: false,
      paceLabel: "Behind",
      reachedTarget: false,
    });
    expect(
      iponGoalProgress({ ...baseGoal, saved_centavos: 100000 }),
    ).toEqual({
      percent: 100,
      onTrack: true,
      paceLabel: "On track",
      reachedTarget: true,
    });
    expect(
      iponGoalProgress({
        ...baseGoal,
        goal_mode: "flexible",
        step_amount_centavos: null,
        phase: "overdue",
      }),
    ).toEqual({
      percent: 50,
      onTrack: false,
      paceLabel: "Behind",
      reachedTarget: false,
    });

    setLang("taglish");
    expect(
      iponGoalProgress({ ...baseGoal, expected_steps_today: 6 }).paceLabel,
    ).toBe("Nahuhuli");
  });
  it("pins the final contribution day to payout tomorrow", () => {
    setLang("en");
    expect(payoutCountdown({
      status: "accepted",
      end_date: "2026-12-31",
      receiver_id: "a",
      payout_state: null,
      received_at: null,
    }, "2026-12-31", "a", "Ana")).toBe("Payout tomorrow - your turn");
  });
  it("computes payoutCountdown for today, tomorrow, multi-day, overdue, and no-active-cycle", () => {
    setLang("en");
    const base = {
      status: "accepted",
      end_date: "2026-10-20",
      receiver_id: "a",
      payout_state: null,
      received_at: null,
    };
    expect(payoutCountdown(null, "2026-10-20", "a", "Ana")).toBeNull();
    expect(
      payoutCountdown({ ...base, status: "proposed" }, "2026-10-20", "a", "Ana"),
    ).toBeNull();
    expect(
      payoutCountdown(
        { ...base, payout_state: "Received" },
        "2026-10-20",
        "a",
        "Ana",
      ),
    ).toBeNull();
    expect(payoutCountdown(base, "2026-10-21", "a", "Ana")).toBe(
      "Payout today - your turn",
    );
    expect(payoutCountdown(base, "2026-10-20", "b", "Ana")).toBe(
      "Payout tomorrow - Ana's turn",
    );
    expect(payoutCountdown(base, "2026-10-17", "a", "Ana")).toBe(
      "Payout in 4 days - your turn",
    );
    expect(payoutCountdown(base, "2026-10-17", "b", "Ana")).toBe(
      "Payout in 4 days - Ana's turn",
    );
    expect(payoutCountdown(base, "2026-10-22", "b", "Ana")).toBe(
      "Payout overdue - Ana's turn",
    );

    setLang("taglish");
    expect(payoutCountdown(base, "2026-10-17", "a", "Ana")).toBe(
      "Payout sa 4 araw - turn mo",
    );
  });
});

describe("solo helpers", () => {
  it("detects solo goals and formats title cleanly", () => {
    expect(isSoloGoal("[Solo] AI Subscription")).toBe(true);
    expect(isSoloGoal("[Solo: Angelo] AI Subscription")).toBe(true);
    expect(isSoloGoal("Japan Trip")).toBe(false);
    expect(cleanGoalTitle("[Solo] AI Subscription")).toBe("AI Subscription");
    expect(cleanGoalTitle("[Solo: Angelo] Claude Pro")).toBe("Claude Pro");
    expect(cleanGoalTitle("Japan Trip")).toBe("Japan Trip");
  });

  it("builds solo badge text for owner and observing partner", () => {
    setLang("en");
    const mockData = {
      memberships: [
        { user_id: "user-1", status: "active" },
        { user_id: "user-2", status: "active" },
      ],
      profiles: [
        { id: "user-1", display_name: "Angelo", nickname: "Angelo" },
        { id: "user-2", display_name: "Maya", nickname: "Maya" },
      ],
    };

    const goal = { title: "[Solo] AI Subscription", proposed_by: "user-1" };
    expect(getSoloBadgeText(goal, mockData, "user-1")).toBe(
      "Solo, You (Partner can view)",
    );
    expect(getSoloBadgeText(goal, mockData, "user-2")).toBe(
      "Solo, Angelo — visible to partner",
    );

    const singleData = {
      memberships: [{ user_id: "user-1", status: "active" }],
      profiles: [{ id: "user-1", display_name: "You", nickname: "You" }],
    };
    expect(getSoloBadgeText(goal, singleData, "user-1")).toBe("Solo, You");
  });

  it("detects solo rounds and builds solo cycle badge text", () => {
    setLang("en");
    const mockData = {
      memberships: [
        { user_id: "user-1", status: "active" },
        { user_id: "user-2", status: "active" },
      ],
      profiles: [
        { id: "user-1", display_name: "Angelo", nickname: "Angelo" },
        { id: "user-2", display_name: "Maya", nickname: "Maya" },
      ],
    };

    const soloCycle = {
      receiver_id: "user-1",
      daily_amount_centavos: 5000,
      num_days: 15,
      target_centavos: 75000,
      is_solo: true,
    };
    expect(isSoloCycle(soloCycle)).toBe(true);
    expect(getSoloCycleBadgeText(soloCycle, mockData, "user-1")).toBe(
      "Solo, You (Partner can view)",
    );
    expect(getSoloCycleBadgeText(soloCycle, mockData, "user-2")).toBe(
      "Solo, Angelo — visible to partner",
    );

    const duoCycle = {
      receiver_id: "user-1",
      daily_amount_centavos: 5000,
      num_days: 15,
      target_centavos: 150000,
    };
    expect(isSoloCycle(duoCycle)).toBe(false);
    expect(getSoloCycleBadgeText(duoCycle, mockData, "user-1")).toBe("");
    // Hosted cycle_summary uses 2x daily amount; even a legacy 1x target
    // is not evidence of a solo cycle without the explicit local flag.
    expect(isSoloCycle({ ...duoCycle, target_centavos: 75000 })).toBe(false);
  });
});
