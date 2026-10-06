import { describe, expect, it } from "vitest";
import {
  addDays,
  csv,
  money,
  parsePesos,
  phaseDisplay,
  shortDate,
} from "./helpers";

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
  });
  it("quotes CSV and prevents spreadsheet formula injection", () => {
    expect(csv([{ name: "=1+1", note: 'a,"b"\nline', amount: 5000 }])).toBe(
      '"name","note","amount"\r\n"\'=1+1","a,""b""\nline","5000"',
    );
    expect(csv([])).toBe("");
  });
});
