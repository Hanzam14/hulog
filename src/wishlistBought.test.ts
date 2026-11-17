import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Snapshot, WishlistItem } from "./data";
import { WishlistRow } from "./screens/Wishlist";

const goal = {
  id: "g1",
  group_id: "grp",
  title: "test",
  status: "accepted",
  withdrawn_at: null,
  target_amount_centavos: 50000,
  saved_centavos: 50000,
};

const data = {
  savingsGoals: [goal],
  savingsContributions: [],
  profiles: [{ id: "u1", display_name: "James" }],
  memberships: [],
} as unknown as Snapshot;

const item = (status: "wanted" | "bought") =>
  ({
    id: "w1",
    group_id: "grp",
    title: "lambo",
    price_centavos: 50000,
    note: null,
    linked_goal_id: "g1",
    status,
    added_by: "u1",
    bought_by: status === "bought" ? "u1" : null,
    bought_at: status === "bought" ? "2026-11-13T04:00:00Z" : null,
    deleted_at: null,
  }) as unknown as WishlistItem;

const render = (status: "wanted" | "bought") =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(WishlistRow, {
        data,
        item: item(status),
        busy: false,
        run: async () => undefined,
        edit: () => undefined,
      } as never),
    ),
  );

describe("wishlist bought items", () => {
  it("shows goal progress while the item is still wanted", () => {
    expect(render("wanted")).toContain('role="progressbar"');
  });

  it("drops the progress bar and 'kaya na' once bought, keeping the goal link", () => {
    const markup = render("bought");
    expect(markup).not.toContain('role="progressbar"');
    expect(markup).not.toContain("kaya na");
    expect(markup).not.toContain("afford");
    expect(markup).toContain('href="/ipon/g1"');
  });
});
