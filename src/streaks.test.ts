import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  Cycle,
  PersonalEntry,
  PersonalGoal,
  Progress,
  SavingsGoal,
  Snapshot,
} from "./data";
import { setLang } from "./i18n";
import {
  celebrationId,
  goalReached,
  hasCelebrated,
  markCelebrated,
  memberStreak,
} from "./streaks";
import StreakChip from "./components/StreakChip";
import { celebrateGoal, celebratePayout } from "./components/confetti";

const me = "member-me";
const partner = "member-partner";

function cycle(id: string, over: Partial<Cycle> = {}): Cycle {
  return {
    id,
    group_id: "g",
    daily_amount_centavos: 10000,
    num_days: 10,
    start_date: "2026-01-01",
    end_date: "2026-01-10",
    receiver_id: partner,
    proposed_by: me,
    status: "accepted",
    phase: "ended",
    pot_centavos: 0,
    target_centavos: 0,
    payout_state: "Received",
    received_at: null,
    days_left: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}
function row(
  cycleId: string,
  memberId: string,
  over: Partial<Progress> = {},
): Progress {
  return {
    cycle_id: cycleId,
    member_id: memberId,
    expected_centavos: 100000,
    confirmed_days: 10,
    pending_days: 0,
    pending_count: 0,
    debt_centavos: 0,
    ...over,
  };
}
/** Ended rounds oldest to newest; `clean[i]` is whether `me` finished round i clean. */
function history(clean: boolean[]) {
  const cycles: Cycle[] = [];
  const progress: Progress[] = [];
  clean.forEach((ok, i) => {
    const day = String(i + 1).padStart(2, "0");
    const c = cycle(`c${i}`, {
      start_date: `2026-${day}-01`,
      end_date: `2026-${day}-10`,
      created_at: `2026-${day}-01T00:00:00Z`,
    });
    cycles.push(c);
    progress.push(
      row(c.id, me, ok ? {} : { debt_centavos: 20000, confirmed_days: 8 }),
    );
  });
  return { cycles, progress };
}

describe("paluwagan streak", () => {
  it("counts consecutive clean ended rounds from the latest", () => {
    expect(memberStreak(history([true, true, true]), me)).toBe(3);
    expect(memberStreak(history([]), me)).toBe(0);
  });
  it("is broken by a round with debt, counting only the rounds after it", () => {
    expect(memberStreak(history([true, true, false, true, true]), me)).toBe(2);
    expect(memberStreak(history([true, true, true, false]), me)).toBe(0);
  });
  it("is broken by a round with days missing even when no debt is owed", () => {
    const data = history([true, true]);
    data.progress[1] = row("c1", me, { debt_centavos: 0, confirmed_days: 9 });
    expect(memberStreak(data, me)).toBe(0);
  });
  it("orders by end date, not by array order", () => {
    const data = history([false, true, true]);
    data.cycles.reverse();
    expect(memberStreak(data, me)).toBe(2);
  });
  it("ignores open, upcoming, settling, proposed and declined rounds", () => {
    const data = history([true, true]);
    for (const phase of [
      "open",
      "upcoming",
      "settling",
      "proposed",
      "declined",
    ]) {
      const c = cycle(`x-${phase}`, {
        phase,
        end_date: "2026-12-31",
        created_at: "2026-12-01T00:00:00Z",
      });
      data.cycles.push(c);
      data.progress.push(
        row(c.id, me, { debt_centavos: 999, confirmed_days: 1 }),
      );
    }
    expect(memberStreak(data, me)).toBe(2);
  });
  it("skips rounds the member was not part of without breaking the streak", () => {
    const data = history([true, true, true]);
    data.progress = data.progress.filter((p) => p.cycle_id !== "c1");
    expect(memberStreak(data, me)).toBe(2);
  });
  it("skips a solo round saved by someone else but counts the member's own solo round", () => {
    const data = history([true, true]);
    const theirs = cycle("solo-theirs", {
      is_solo: true,
      receiver_id: partner,
      end_date: "2026-11-10",
    });
    const mine = cycle("solo-mine", {
      is_solo: true,
      receiver_id: me,
      end_date: "2026-11-20",
    });
    data.cycles.push(theirs, mine);
    data.progress.push(
      row(theirs.id, me, { debt_centavos: 100000, confirmed_days: 0 }),
      row(mine.id, me),
    );
    expect(memberStreak(data, me)).toBe(3);
  });
  it("is per member", () => {
    const data = history([true, true]);
    data.progress.push(
      row("c1", partner, { debt_centavos: 50000, confirmed_days: 5 }),
      row("c0", partner),
    );
    expect(memberStreak(data, me)).toBe(2);
    expect(memberStreak(data, partner)).toBe(0);
  });
});

describe("streak chip", () => {
  afterEach(() => setLang("taglish"));
  it("shows only from two clean rounds", () => {
    expect(
      renderToStaticMarkup(
        createElement(StreakChip, { data: history([true]), memberId: me }),
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        createElement(StreakChip, {
          data: history([false, true]),
          memberId: me,
        }),
      ),
    ).toBe("");
    const html = renderToStaticMarkup(
      createElement(StreakChip, {
        data: history([true, true, true]),
        memberId: me,
      }),
    );
    expect(html).toContain("streak-chip");
    expect(html).toContain("🔥 3 rounds na buo");
    setLang("en");
    expect(
      renderToStaticMarkup(
        createElement(StreakChip, {
          data: history([true, true]),
          memberId: me,
        }),
      ),
    ).toContain("🔥 2 full rounds");
  });
});

function ipon(over: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: "i1",
    target_amount_centavos: 100000,
    saved_centavos: 100000,
    status: "accepted",
    withdrawn_at: null,
    ...over,
  } as SavingsGoal;
}
function personal(over: Partial<PersonalGoal> = {}): PersonalGoal {
  return {
    id: "p1",
    owner_id: me,
    target_amount_centavos: 50000,
    visibility: "shared",
    deleted_at: null,
    ...over,
  } as PersonalGoal;
}
function entry(
  id: string,
  kind: PersonalEntry["kind"],
  amount: number,
  over: Partial<PersonalEntry> = {},
): PersonalEntry {
  return {
    id,
    goal_id: "p1",
    kind,
    amount_centavos: amount,
    deleted_at: null,
    ...over,
  } as PersonalEntry;
}

describe("goalReached", () => {
  const none = { personalEntries: [] };
  it("shared ipon uses confirmed saved against the target", () => {
    const at = (saved: number, over: Partial<SavingsGoal> = {}) =>
      goalReached(
        none,
        { kind: "ipon", goal: ipon({ saved_centavos: saved, ...over }) },
        me,
      );
    expect(at(99999)).toBe(false);
    expect(at(100000)).toBe(true);
    expect(at(150000)).toBe(true);
    expect(at(100000, { status: "proposed" })).toBe(false);
    expect(at(100000, { withdrawn_at: "2026-02-01T00:00:00Z" })).toBe(false);
    expect(at(0, { target_amount_centavos: 0 })).toBe(false);
  });
  it("own personal goal celebrates from its balance, withdrawals included", () => {
    const goal = personal();
    const reached = (entries: PersonalEntry[], g = goal, viewer = me) =>
      goalReached(
        { personalEntries: entries },
        { kind: "personal", goal: g },
        viewer,
      );
    expect(reached([entry("a", "deposit", 49999)])).toBe(false);
    expect(reached([entry("a", "deposit", 50000)])).toBe(true);
    expect(
      reached([entry("a", "deposit", 60000), entry("b", "withdrawal", 20000)]),
    ).toBe(false);
    expect(
      reached([
        entry("a", "deposit", 50000),
        entry("b", "deposit", 9, { deleted_at: "x" }),
        entry("c", "deposit", 50000, { goal_id: "other" }),
      ]),
    ).toBe(true);
    expect(
      reached([entry("a", "deposit", 50000)], personal({ deleted_at: "x" })),
    ).toBe(false);
  });
  it("a partner's personal goal never celebrates, shared or private", () => {
    const entries = [entry("a", "deposit", 90000)];
    for (const visibility of ["shared", "private"] as const)
      expect(
        goalReached(
          { personalEntries: entries },
          { kind: "personal", goal: personal({ visibility }) },
          partner,
        ),
      ).toBe(false);
  });
  it("gives each goal kind its own celebration id", () => {
    expect(celebrationId({ kind: "ipon", goal: ipon({ id: "same" }) })).toBe(
      "ipon-same",
    );
    expect(
      celebrationId({ kind: "personal", goal: personal({ id: "same" }) }),
    ).toBe("personal-same");
  });
});

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
}
const blocked = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("celebration memory", () => {
  it("remembers a goal per device and survives a fresh session", () => {
    const storage = memoryStorage();
    expect(hasCelebrated("ipon-a", storage, new Set())).toBe(false);
    markCelebrated("ipon-a", storage, new Set());
    expect(hasCelebrated("ipon-a", storage, new Set())).toBe(true);
    expect(hasCelebrated("ipon-b", storage, new Set())).toBe(false);
    expect([...storage.store.keys()].join()).toContain("ipon-a");
  });
  it("treats ids the earlier payout-style burst already stored as seen", () => {
    const storage = memoryStorage({
      "hulog-confetti-seen": JSON.stringify(["ipon-old", "cycle-1"]),
    });
    expect(hasCelebrated("ipon-old", storage, new Set())).toBe(true);
    expect(hasCelebrated("ipon-new", storage, new Set())).toBe(false);
  });
  it("tolerates corrupt legacy data and missing storage", () => {
    const storage = memoryStorage({ "hulog-confetti-seen": "{broken" });
    expect(hasCelebrated("ipon-a", storage, new Set())).toBe(false);
    expect(hasCelebrated("ipon-a", null, new Set())).toBe(false);
    expect(() => markCelebrated("ipon-a", null, new Set())).not.toThrow();
  });
  it("does not crash or repeat in-session when storage throws", () => {
    const memory = new Set<string>();
    expect(hasCelebrated("ipon-a", blocked, memory)).toBe(false);
    expect(() => markCelebrated("ipon-a", blocked, memory)).not.toThrow();
    expect(hasCelebrated("ipon-a", blocked, memory)).toBe(true);
  });
  it("reads window.localStorage defensively when the accessor throws", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("denied");
      },
    });
    try {
      expect(() => hasCelebrated("ipon-denied")).not.toThrow();
      expect(() => markCelebrated("ipon-denied")).not.toThrow();
      expect(hasCelebrated("ipon-denied")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("goal celebration output", () => {
  const data = { memberships: [] } as unknown as Snapshot;
  let created: string[];
  let reduced: boolean;
  let canvas: { remove: ReturnType<typeof vi.fn> };
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    created = [];
    reduced = false;
    storage = memoryStorage();
    canvas = { remove: vi.fn() };
    vi.stubGlobal("window", {
      localStorage: storage,
      matchMedia: () => ({ matches: reduced }),
      setTimeout: () => 1,
    });
    vi.stubGlobal("document", {
      body: { append: vi.fn() },
      createElement: (tag: string) => {
        created.push(tag);
        return tag === "canvas"
          ? {
              ...canvas,
              setAttribute: vi.fn(),
              getContext: () => null,
            }
          : { setAttribute: vi.fn(), remove: vi.fn(), textContent: "" };
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reduced motion shows the text badge and never touches a canvas", () => {
    reduced = true;
    celebrateGoal("ipon-rm", data);
    expect(created).toEqual(["div"]);
  });
  it("normal motion shows the burst and the line", () => {
    celebrateGoal("ipon-motion", data);
    expect(created.sort()).toEqual(["canvas", "div"]);
  });
  it("celebrates a goal only once per device", () => {
    celebrateGoal("ipon-once", data);
    celebrateGoal("ipon-once", data);
    expect(created.filter((tag) => tag === "div")).toHaveLength(1);
    expect(storage.store.size).toBe(1);
  });
  it("does not celebrate when this device already did", () => {
    markCelebrated("personal-seen", storage, new Set());
    celebrateGoal("personal-seen", data);
    expect(created).toEqual([]);
  });
  it("keeps the payout celebration unchanged: no text beside the burst", () => {
    celebratePayout("cycle-motion", data);
    expect(created).toEqual(["canvas"]);
    reduced = true;
    celebratePayout("cycle-reduced", data);
    expect(created).toEqual(["canvas", "div"]);
  });
});
