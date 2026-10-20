import { afterEach, describe, expect, it } from "vitest";
import {
  addDays,
  cadenceDisplay,
  csv,
  filterHistory,
  historyMonths,
  money,
  parsePesos,
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
    expect(phaseDisplay("open", 1)).toBe("Open · 1 day left");
    expect(phaseDisplay("open", 15)).toBe("Open · 15 days left");
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
});
