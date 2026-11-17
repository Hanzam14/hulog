import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { SavingsGoal, Snapshot, WishlistItem } from "./data";
import { WishlistRow } from "./screens/Wishlist";
import {
  canPayFromGoal,
  goalAvailable,
  wishlistProgress,
  wishlistRpc,
} from "./wishlist";

const goal = (over: Partial<SavingsGoal> = {}) =>
  ({
    id: "g1",
    group_id: "grp",
    title: "test",
    status: "accepted",
    withdrawn_at: null,
    withdraw_proposed_by: null,
    target_amount_centavos: 50000,
    saved_centavos: 50000,
    spent_centavos: 0,
    phase: "completed",
    ...over,
  }) as SavingsGoal;

const item = (over: Partial<WishlistItem> = {}) =>
  ({
    id: "w1",
    group_id: "grp",
    title: "lambo",
    price_centavos: 50000,
    note: null,
    linked_goal_id: "g1",
    status: "wanted",
    added_by: "u1",
    bought_by: null,
    bought_at: null,
    created_at: "2026-11-13T04:00:00Z",
    updated_at: "2026-11-13T04:00:00Z",
    deleted_at: null,
    ...over,
  }) as WishlistItem;

const snapshot = (g = goal(), items = [item()]) =>
  ({
    groups: [{ id: "grp" }],
    today: "2026-11-17",
    savingsGoals: [g],
    savingsContributions: [],
    wishlistItems: items,
    changes: [],
    profiles: [{ id: "u1", display_name: "James" }],
    memberships: [],
  }) as unknown as Snapshot;

describe("money left in a goal", () => {
  it("subtracts active spends and never goes below zero", () => {
    expect(goalAvailable(goal({ spent_centavos: 20000 }))).toBe(30000);
    expect(goalAvailable(goal({ spent_centavos: 90000 }))).toBe(0);
    expect(goalAvailable(goal({ spent_centavos: undefined }))).toBe(50000);
  });

  it("measures wishlist progress against what is left, not what was saved", () => {
    const p = wishlistProgress(item({ price_centavos: 40000 }), [
      goal({ spent_centavos: 30000 }),
    ]);
    expect(p?.saved).toBe(20000);
    expect(p?.ready).toBe(false);
  });

  it("offers paying from the goal only when the goal is active and holds enough", () => {
    expect(canPayFromGoal(item(), [goal()])).toBe(true);
    expect(canPayFromGoal(item(), [goal({ spent_centavos: 1 })])).toBe(false);
    expect(canPayFromGoal(item(), [goal({ withdraw_proposed_by: "u2" })])).toBe(
      false,
    );
    expect(
      canPayFromGoal(item(), [goal({ withdrawn_at: "2026-11-15T00:00:00Z" })]),
    ).toBe(false);
    expect(canPayFromGoal(item({ linked_goal_id: null }), [goal()])).toBe(
      false,
    );
  });
});

describe("solo set_wishlist_bought from a goal", () => {
  it("records the spend, lowers the goal, and undo gives it back", () => {
    const s = snapshot();
    wishlistRpc(s, "u1", "set_wishlist_bought", {
      p_id: "w1",
      p_bought: true,
      p_from_goal: true,
    });
    expect(s.wishlistItems?.[0].status).toBe("bought");
    expect(s.savingsSpends).toHaveLength(1);
    expect(s.savingsSpends?.[0].amount_centavos).toBe(50000);
    expect(goalAvailable(s.savingsGoals![0])).toBe(0);
    expect(s.changes.some((c) => c.entity === "savings_spends")).toBe(true);

    wishlistRpc(s, "u1", "set_wishlist_bought", {
      p_id: "w1",
      p_bought: false,
    });
    expect(s.wishlistItems?.[0].status).toBe("wanted");
    expect(s.savingsSpends?.[0].voided_at).not.toBeNull();
    expect(goalAvailable(s.savingsGoals![0])).toBe(50000);
  });

  it("buying with other money leaves the goal alone", () => {
    const s = snapshot();
    wishlistRpc(s, "u1", "set_wishlist_bought", { p_id: "w1", p_bought: true });
    expect(s.savingsSpends ?? []).toHaveLength(0);
    expect(goalAvailable(s.savingsGoals![0])).toBe(50000);
  });

  it("refuses a spend larger than what is left", () => {
    const s = snapshot(goal({ saved_centavos: 49999 }));
    expect(() =>
      wishlistRpc(s, "u1", "set_wishlist_bought", {
        p_id: "w1",
        p_bought: true,
        p_from_goal: true,
      }),
    ).toThrow("Not enough saved in the goal");
    expect(s.wishlistItems?.[0].status).toBe("wanted");
  });
});

describe("bought item paid from a goal", () => {
  it("says how much came out of which goal", () => {
    const data = {
      ...snapshot(),
      savingsSpends: [
        {
          id: "s1",
          group_id: "grp",
          goal_id: "g1",
          wishlist_item_id: "w1",
          amount_centavos: 50000,
          spend_date: "2026-11-17",
          created_by: "u1",
          created_at: "2026-11-17T04:00:00Z",
          voided_by: null,
          voided_at: null,
        },
      ],
    } as Snapshot;
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(WishlistRow, {
          data,
          item: item({
            status: "bought",
            bought_by: "u1",
            bought_at: "2026-11-17T04:00:00Z",
          }),
          busy: false,
          run: async () => undefined,
          edit: () => undefined,
        } as never),
      ),
    );
    expect(markup).toContain("Ibinawas ang");
    expect(markup).toContain("sa test");
    expect(markup).toContain('href="/ipon/g1"');
    expect(markup).not.toContain('role="progressbar"');
  });
});
