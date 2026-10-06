import { describe, expect, it } from "vitest";
import { claimCelebration, parseSeenIds, recentlyReceived } from "./confetti";

describe("payout celebration memory", () => {
  it("skips payouts received more than a week ago", () => {
    const now = Date.parse("2026-10-07T00:00:00Z");
    expect(recentlyReceived("2026-10-05T00:00:00Z", now)).toBe(true);
    expect(recentlyReceived("2026-09-01T00:00:00Z", now)).toBe(false);
    expect(recentlyReceived(null, now)).toBe(false);
  });
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
