import { describe, expect, it } from "vitest";
import { abonoAmount, parsePesos } from "./helpers";
import {
  NO_SPLIT,
  owedFieldText,
  owedForSplit,
  parsePercent,
  shareCentavos,
  type SplitState,
} from "./split";

const custom = (percent: string): SplitState => ({ choice: "custom", percent });

describe("parsePercent", () => {
  it("reads whole and two-decimal percentages as hundredths", () => {
    expect(parsePercent("0")).toBe(0);
    expect(parsePercent("33")).toBe(3300);
    expect(parsePercent(" 33.3 ")).toBe(3330);
    expect(parsePercent("33.33")).toBe(3333);
    expect(parsePercent("100")).toBe(10000);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "abc", "-1", "101", "100.01", "1.234", "1,5", "%"])
      expect(parsePercent(bad)).toBeNull();
  });
});

describe("shareCentavos", () => {
  it("gives exact centavos for an uneven amount", () => {
    // 10001 centavos (₱100.01) at 33% is 3300.33 centavos: 3300, ₱33.00.
    expect(shareCentavos(10001, 3300)).toBe(3300);
    // The payer absorbs the remainder, so the parts always add up.
    expect(10001 - shareCentavos(10001, 3300)).toBe(6701);
  });

  it("rounds half up to the centavo", () => {
    expect(shareCentavos(5, 5000)).toBe(3); // 2.5
    expect(shareCentavos(10001, 5000)).toBe(5001); // 5000.5
    expect(shareCentavos(10050, 3333)).toBe(3350); // 3350.165
    expect(shareCentavos(3, 1667)).toBe(1); // 0.5001
    expect(shareCentavos(3, 1666)).toBe(0); // 0.4998
  });

  it("gives the other member the extra centavo at 50/50 (the old ceiling)", () => {
    for (const [total, other] of [
      [0, 0],
      [1, 1],
      [100, 50],
      [101, 51],
      [2500, 1250],
      [2501, 1251],
    ])
      expect(shareCentavos(total, 5000)).toBe(other);
  });

  it("covers the bounds and stays within 0..total", () => {
    expect(shareCentavos(24500, 0)).toBe(0);
    expect(shareCentavos(24500, 10000)).toBe(24500);
    expect(shareCentavos(1, 10000)).toBe(1);
    expect(shareCentavos(0, 5000)).toBe(0);
    expect(shareCentavos(9_999_999_999, 3333)).toBe(3_333_000_000);
  });
});

describe("owedForSplit", () => {
  it("splits 50/50 with the other member taking the extra centavo", () => {
    expect(owedForSplit(10001, { choice: "half", percent: "" }, true)).toBe(
      5001,
    );
    expect(owedForSplit(10000, { choice: "half", percent: "" }, false)).toBe(
      5000,
    );
  });

  it("maps all mine and all theirs by who paid", () => {
    const mine: SplitState = { choice: "mine", percent: "" };
    const theirs: SplitState = { choice: "theirs", percent: "" };
    // I paid: nothing is owed if it is all mine, everything if it is all theirs.
    expect(owedForSplit(24500, mine, true)).toBe(0);
    expect(owedForSplit(24500, theirs, true)).toBe(24500);
    // They paid: reversed.
    expect(owedForSplit(24500, mine, false)).toBe(24500);
    expect(owedForSplit(24500, theirs, false)).toBe(0);
  });

  it("uses the custom percent for the member who does not pay", () => {
    expect(owedForSplit(10001, custom("33"), true)).toBe(3300);
    expect(owedForSplit(10001, custom("100"), true)).toBe(10001);
    expect(owedForSplit(10001, custom("0"), false)).toBe(0);
    expect(owedForSplit(10001, custom("abc"), true)).toBeNull();
    expect(owedForSplit(10001, NO_SPLIT, true)).toBeNull();
  });
});

describe("owedFieldText", () => {
  it("keeps what was typed when no preset is chosen", () => {
    expect(owedFieldText("100.00", NO_SPLIT, true, "12.5")).toBe("12.5");
  });

  it("computes the field from the preset, following the total and the payer", () => {
    const half: SplitState = { choice: "half", percent: "" };
    expect(owedFieldText("100.01", half, true, "")).toBe("50.01");
    expect(owedFieldText("100.01", custom("33"), true, "")).toBe("33.00");
    const mine: SplitState = { choice: "mine", percent: "" };
    expect(owedFieldText("245", mine, true, "9")).toBe("0.00");
    expect(owedFieldText("245", mine, false, "9")).toBe("245.00");
  });

  it("is blank while the total or percent is not usable", () => {
    expect(owedFieldText("", { choice: "half", percent: "" }, true, "")).toBe(
      "",
    );
    expect(
      owedFieldText("abc", { choice: "mine", percent: "" }, true, ""),
    ).toBe("");
    expect(owedFieldText("100", custom("x"), true, "")).toBe("");
  });
});

describe("zero shares in the helpers", () => {
  it("parsePesos allows zero only when asked", () => {
    expect(() => parsePesos("0")).toThrow();
    expect(() => parsePesos("0.00")).toThrow();
    expect(parsePesos("0.00", true)).toBe(0);
    expect(parsePesos("0", true)).toBe(0);
    expect(() => parsePesos("-1", true)).toThrow();
    expect(() => parsePesos("", true)).toThrow();
    expect(parsePesos("100.01", true)).toBe(10001);
  });

  it("abonoAmount shows the total when the share is 0", () => {
    expect(
      abonoAmount({ owed_amount_centavos: 0, total_amount_centavos: 24500 }),
    ).toBe(24500);
    expect(
      abonoAmount({ owed_amount_centavos: 3300, total_amount_centavos: 10001 }),
    ).toBe(3300);
  });
});
