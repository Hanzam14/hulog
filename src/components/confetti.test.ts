import { describe, expect, it } from "vitest";
import { claimCelebration, parseSeenIds } from "./confetti";

describe("payout celebration memory", () => {
  it("tolerates corrupt and non-array storage", () => {
    for (const value of [null, "broken", "{}", "42"]) {
      expect(parseSeenIds(value)).toEqual([]);
    }
    expect(parseSeenIds('["round", 4, "round", null]')).toEqual(["round"]);
  });
  it("claims each cycle once, including after a reload", () => {
    let saved: string | null = null;
    const storage = {
      getItem: () => saved,
      setItem: (_: string, value: string) => {
        saved = value;
      },
    };
    expect(claimCelebration("round", storage, new Set())).toBe(true);
    expect(claimCelebration("round", storage, new Set())).toBe(false);
    expect(claimCelebration("next", storage, new Set())).toBe(true);
    expect(JSON.parse(saved!)).toEqual(["round", "next"]);
  });
  it("does not repeat in this session if storage is blocked", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const memory = new Set<string>();
    expect(claimCelebration("round", storage, memory)).toBe(true);
    expect(claimCelebration("round", storage, memory)).toBe(false);
  });
});
