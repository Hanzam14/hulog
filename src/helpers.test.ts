import { afterEach, describe, expect, it } from "vitest";
import {
  addDays,
  cadenceDisplay,
  csv,
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
    expect(payoutCountdown(base, "2026-10-20", "a", "Ana")).toBe(
      "Payout today - your turn",
    );
    expect(payoutCountdown(base, "2026-10-19", "b", "Ana")).toBe(
      "Payout tomorrow - Ana's turn",
    );
    expect(payoutCountdown(base, "2026-10-17", "a", "Ana")).toBe(
      "Payout in 3 days - your turn",
    );
    expect(payoutCountdown(base, "2026-10-17", "b", "Ana")).toBe(
      "Payout in 3 days - Ana's turn",
    );
    expect(payoutCountdown(base, "2026-10-21", "b", "Ana")).toBe(
      "Payout overdue - Ana's turn",
    );

    setLang("taglish");
    expect(payoutCountdown(base, "2026-10-17", "a", "Ana")).toBe(
      "Payout sa 3 araw - turn mo",
    );
  });
});
