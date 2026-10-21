import { describe, expect, it } from "vitest";
import { coinColumns } from "./coins";

describe("coin sticker rows", () => {
  it("keeps one row when every coin fits", () => {
    expect(coinColumns(15, 480)).toBe(15);
    expect(coinColumns(1, 100)).toBe(1);
  });
  it("wraps 15 coins evenly at phone widths", () => {
    expect(coinColumns(15, 308)).toBe(8);
    expect(coinColumns(15, 293)).toBe(8);
  });
  it("never returns fewer than one column", () => {
    expect(coinColumns(5, 10)).toBe(1);
    expect(coinColumns(0, 300)).toBe(1);
  });
});
