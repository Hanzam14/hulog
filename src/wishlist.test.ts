import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  createInitialSoloSnapshot,
  loadSoloSnapshot,
  setSoloPotMode,
  soloRpc,
} from "./solo";
import {
  WISHLIST_MAX_ITEMS,
  linkableGoals,
  liveWishlist,
  sortWishlist,
  wantedCount,
  wishlistProgress,
  wishlistRpc,
} from "./wishlist";
import Wishlist, { WishlistForm } from "./screens/Wishlist";
import { setLang } from "./i18n";
import type { SavingsGoal, Snapshot, WishlistItem } from "./data";

const owner = "wish-owner";
let snapshot: Snapshot;
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
  snapshot = createInitialSoloSnapshot(owner, "partnered");
  snapshot.wishlistItems = [];
  setLang("en");
});
afterEach(() => {
  setLang("taglish");
  vi.unstubAllGlobals();
});

function goal(over: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: "goal-" + Math.random().toString(36).slice(2),
    group_id: snapshot.groups[0].id,
    title: "Appliances",
    goal_mode: "flexible",
    wallet_id: "w",
    holder_id: owner,
    wallet_label: "Main",
    pending_wallet_id: null,
    wallet_proposed_by: null,
    target_amount_centavos: 500000,
    step_amount_centavos: null,
    cadence_days: null,
    num_steps: null,
    start_date: "2026-10-24",
    end_date: "2026-12-01",
    proposed_by: owner,
    status: "accepted",
    accepted_by: "partner-user",
    accepted_at: "2026-10-23T00:00:00Z",
    withdraw_proposed_by: null,
    withdrawn_by: null,
    withdrawn_at: null,
    saved_centavos: 0,
    phase: "open",
    days_left: 10,
    expected_steps_today: 0,
    created_at: "2026-10-23T00:00:00Z",
    ...over,
  };
}
function item(over: Partial<WishlistItem> = {}): WishlistItem {
  return {
    id: "item-" + Math.random().toString(36).slice(2),
    group_id: snapshot.groups[0].id,
    title: "Rice cooker",
    price_centavos: 250000,
    note: null,
    linked_goal_id: null,
    added_by: owner,
    status: "wanted",
    bought_by: null,
    bought_at: null,
    created_at: "2026-10-23T01:00:00Z",
    updated_at: "2026-10-23T01:00:00Z",
    deleted_at: null,
    ...over,
  };
}
function add(args: Record<string, unknown> = {}, user = owner) {
  return wishlistRpc(snapshot, user, "add_wishlist_item", {
    p_title: "Air fryer",
    p_price_centavos: 350000,
    ...args,
  }) as string;
}
const find = (id: string) => snapshot.wishlistItems!.find((i) => i.id === id)!;
const edit = (id: string, args: Record<string, unknown>, user = owner) =>
  wishlistRpc(snapshot, user, "edit_wishlist_item", { p_id: id, ...args });
const mark = (id: string, bought: unknown, user = owner) =>
  wishlistRpc(snapshot, user, "set_wishlist_bought", {
    p_id: id,
    p_bought: bought,
  });
const remove = (id: string, user = owner) =>
  wishlistRpc(snapshot, user, "delete_wishlist_item", { p_id: id });

describe("wishlist helpers", () => {
  it("lists wanted items oldest first, then bought items newest bought first", () => {
    const list = [
      item({
        id: "b-old",
        status: "bought",
        bought_at: "2026-10-20T00:00:00Z",
      }),
      item({ id: "w-new", created_at: "2026-10-23T05:00:00Z" }),
      item({
        id: "b-new",
        status: "bought",
        bought_at: "2026-10-22T00:00:00Z",
      }),
      item({ id: "w-old", created_at: "2026-10-21T05:00:00Z" }),
    ];
    expect(sortWishlist(list).map((i) => i.id)).toEqual([
      "w-old",
      "w-new",
      "b-new",
      "b-old",
    ]);
    expect(wantedCount(list)).toBe(2);
  });
  it("hides soft-deleted items", () => {
    const list = [item({ id: "a" }), item({ id: "b", deleted_at: "x" })];
    expect(liveWishlist(list).map((i) => i.id)).toEqual(["a"]);
    expect(liveWishlist(undefined)).toEqual([]);
  });
  it("shows confirmed saved against the price and flips to kaya na exactly at the price", () => {
    const g = goal({ saved_centavos: 249999 });
    const linked = item({ linked_goal_id: g.id });
    expect(wishlistProgress(linked, [g])).toMatchObject({
      saved: 249999,
      price: 250000,
      percent: 99,
      ready: false,
    });
    g.saved_centavos = 250000;
    expect(wishlistProgress(linked, [g])).toMatchObject({
      percent: 100,
      ready: true,
    });
    g.saved_centavos = 900000;
    expect(wishlistProgress(linked, [g])).toMatchObject({
      percent: 100,
      ready: true,
    });
  });
  it("shows no progress without a usable link", () => {
    const g = goal({ saved_centavos: 999999 });
    const gone = goal({ withdrawn_at: "2026-10-23T00:00:00Z" });
    expect(wishlistProgress(item(), [g])).toBeNull();
    expect(wishlistProgress(item({ linked_goal_id: "none" }), [g])).toBeNull();
    expect(
      wishlistProgress(item({ linked_goal_id: gone.id }), [gone]),
    ).toBeNull();
    expect(
      wishlistProgress(item({ linked_goal_id: g.id }), undefined),
    ).toBeNull();
  });
  it("only offers live shared goals for linking", () => {
    const list = [
      goal({ id: "live" }),
      goal({ id: "proposed", status: "proposed", phase: "upcoming" }),
      goal({ id: "withdrawn", withdrawn_at: "2026-10-23T00:00:00Z" }),
      goal({ id: "declined", status: "declined", phase: "declined" }),
      goal({ id: "cancelled", status: "cancelled", phase: "cancelled" }),
      goal({ id: "expired", status: "proposed", phase: "expired" }),
    ];
    expect(
      linkableGoals(list)
        .map((g) => g.id)
        .sort(),
    ).toEqual(["live", "proposed"]);
  });
});

describe("solo wishlist RPCs", () => {
  it("adds a trimmed item as the actor in the group of the caller, blank note stored as null", () => {
    const id = add({ p_title: "  Air fryer  ", p_note: "   " });
    expect(find(id)).toMatchObject({
      title: "Air fryer",
      price_centavos: 350000,
      note: null,
      linked_goal_id: null,
      added_by: owner,
      group_id: snapshot.groups[0].id,
      status: "wanted",
      bought_by: null,
      bought_at: null,
      deleted_at: null,
    });
  });
  it("accepts the boundary values and rejects everything just outside them", () => {
    expect(() => add({ p_title: "x".repeat(60) })).not.toThrow();
    expect(() => add({ p_note: "n".repeat(140) })).not.toThrow();
    expect(() => add({ p_price_centavos: 1 })).not.toThrow();
    expect(() => add({ p_price_centavos: 10000000000 })).not.toThrow();
    const before = structuredClone(snapshot);
    for (const title of ["", "   ", null, undefined, "x".repeat(61)])
      expect(() => add({ p_title: title })).toThrow(
        "Wishlist title must be 1 to 60 characters",
      );
    for (const price of [0, -1, 1.5, NaN, 10000000001, null, "100"])
      expect(() => add({ p_price_centavos: price })).toThrow(
        "Invalid wishlist price",
      );
    expect(() => add({ p_note: "n".repeat(141) })).toThrow(
      "Note must be at most 140 characters",
    );
    expect(snapshot).toEqual(before);
  });
  it("links only live shared goals of the same group, never personal goals", () => {
    const good = goal();
    const other = goal({ group_id: "another-group" });
    const withdrawn = goal({ withdrawn_at: "2026-10-23T00:00:00Z" });
    const cancelled = goal({ status: "cancelled", phase: "cancelled" });
    snapshot.savingsGoals = [good, other, withdrawn, cancelled];
    snapshot.personalGoals = [
      {
        id: "personal-1",
        group_id: snapshot.groups[0].id,
        owner_id: owner,
        title: "Private",
        target_amount_centavos: 1000,
        visibility: "shared",
        created_at: "x",
        updated_at: "x",
        deleted_at: null,
      },
    ];
    expect(find(add({ p_linked_goal_id: good.id })).linked_goal_id).toBe(
      good.id,
    );
    for (const bad of [other.id, withdrawn.id, cancelled.id, "x", "personal-1"])
      expect(() => add({ p_linked_goal_id: bad })).toThrow(
        "Linked goal must be an active shared ipon goal in your group",
      );
  });
  it("caps the list at 30 live items and frees a slot when one is deleted", () => {
    const ids = Array.from({ length: WISHLIST_MAX_ITEMS }, (_, n) =>
      add({ p_title: "Item " + n }),
    );
    expect(() => add()).toThrow("Maximum of 30 wishlist items reached");
    expect(() => add({}, "partner-user")).toThrow(
      "Maximum of 30 wishlist items reached",
    );
    remove(ids[0], "partner-user");
    expect(() => add()).not.toThrow();
    expect(() => add()).toThrow("Maximum of 30 wishlist items reached");
  });
});

describe("solo wishlist edits, bought toggle and delete", () => {
  it("edits every field while wanted for either member and clears note and link when omitted", () => {
    const g = goal();
    snapshot.savingsGoals = [g];
    const id = add({ p_note: "old", p_linked_goal_id: g.id });
    edit(
      id,
      {
        p_title: " Big air fryer ",
        p_price_centavos: 400000,
        p_note: "new",
        p_linked_goal_id: g.id,
      },
      "partner-user",
    );
    expect(find(id)).toMatchObject({
      title: "Big air fryer",
      price_centavos: 400000,
      note: "new",
      linked_goal_id: g.id,
      added_by: owner,
    });
    edit(id, { p_title: "Big air fryer", p_price_centavos: 400000 });
    expect(find(id)).toMatchObject({ note: null, linked_goal_id: null });
    const before = structuredClone(snapshot);
    expect(() => edit(id, { p_title: "", p_price_centavos: 1 })).toThrow(
      "Wishlist title must be 1 to 60 characters",
    );
    expect(() => edit(id, { p_title: "ok", p_price_centavos: 0 })).toThrow(
      "Invalid wishlist price",
    );
    expect(snapshot).toEqual(before);
  });
  it("records who bought and when, keeps the first buyer on repeat, clears on undo and blocks edits while bought", () => {
    const id = add();
    mark(id, true, "partner-user");
    expect(find(id)).toMatchObject({
      status: "bought",
      bought_by: "partner-user",
    });
    expect(find(id).bought_at).toBeTruthy();
    mark(id, true, owner);
    expect(find(id).bought_by).toBe("partner-user");
    expect(() => edit(id, { p_title: "Changed", p_price_centavos: 1 })).toThrow(
      "Bought items cannot be edited",
    );
    expect(() => mark(id, null)).toThrow("Bought flag required");
    expect(() => mark(id, "yes")).toThrow("Bought flag required");
    mark(id, false);
    expect(find(id)).toMatchObject({
      status: "wanted",
      bought_by: null,
      bought_at: null,
    });
    expect(() =>
      edit(id, { p_title: "Changed", p_price_centavos: 1 }),
    ).not.toThrow();
  });
  it("soft deletes: the row stays, leaves the live list and rejects further changes", () => {
    const id = add();
    mark(id, true);
    remove(id, "partner-user");
    expect(find(id).deleted_at).toBeTruthy();
    expect(liveWishlist(snapshot.wishlistItems).map((i) => i.id)).not.toContain(
      id,
    );
    expect(() => edit(id, { p_title: "x", p_price_centavos: 1 })).toThrow(
      "Wishlist item unavailable",
    );
    expect(() => mark(id, false)).toThrow("Wishlist item unavailable");
    expect(() => remove(id)).toThrow("Wishlist item unavailable");
    expect(() => remove("nope")).toThrow("Wishlist item unavailable");
  });
  it("writes before/after change entries for add, edit, bought toggle and delete, and none for no-ops or failures", () => {
    const start = snapshot.changes.length;
    const id = add();
    edit(id, { p_title: "Renamed", p_price_centavos: 500 });
    mark(id, true);
    mark(id, true);
    expect(() => edit(id, { p_title: "x", p_price_centavos: 1 })).toThrow();
    mark(id, false);
    remove(id);
    expect(() => remove(id)).toThrow();
    const mine = snapshot.changes.slice(start);
    expect(mine.map((c) => c.action)).toEqual([
      "insert",
      "update",
      "update",
      "update",
      "delete",
    ]);
    expect(mine.every((c) => c.entity === "wishlist_items")).toBe(true);
    expect(mine.every((c) => c.entity_id === id)).toBe(true);
    expect(mine[0].before).toBeNull();
    expect(mine[1].before).toMatchObject({ title: "Air fryer" });
    expect(mine[1].after).toMatchObject({ title: "Renamed" });
    expect(mine[2].after).toMatchObject({ status: "bought" });
    expect(mine[4].after).toMatchObject({ deleted_at: expect.any(String) });
    expect(new Set(mine.map((c) => c.id)).size).toBe(5);
  });
  it("persists through the solo ledger and survives an offline pot-mode switch", async () => {
    const id = (await soloRpc("add_wishlist_item", {
      p_title: "Persisted",
      p_price_centavos: 12345,
    })) as string;
    await soloRpc("set_wishlist_bought", { p_id: id, p_bought: true });
    setSoloPotMode("standalone");
    const saved = await loadSoloSnapshot();
    expect(saved.wishlistItems!.find((i) => i.id === id)).toMatchObject({
      title: "Persisted",
      price_centavos: 12345,
      status: "bought",
    });
    await expect(
      soloRpc("add_wishlist_item", { p_title: "", p_price_centavos: 1 }),
    ).rejects.toThrow("Wishlist title must be 1 to 60 characters");
  });
});

function view(data: Snapshot, user = owner) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {},
      createElement(Wishlist, { data, user, run: async () => {}, busy: false }),
    ),
  );
}
function form(data: Snapshot, existing?: WishlistItem) {
  return renderToStaticMarkup(
    createElement(WishlistForm, {
      data,
      item: existing,
      busy: false,
      run: async () => {},
      close: () => {},
    }),
  );
}
const personal = (snap: Snapshot) => ({
  id: "p1",
  group_id: snap.groups[0].id,
  owner_id: owner,
  title: "Secret camera",
  target_amount_centavos: 1000,
  visibility: "private" as const,
  created_at: "x",
  updated_at: "x",
  deleted_at: null,
});

describe("wishlist screen", () => {
  it("shows the empty state with the records-only line", () => {
    const html = view(snapshot);
    expect(html).toContain("Our wishlist");
    expect(html).toContain("Nothing on the wishlist yet");
    expect(html).toContain("Buying is your own action outside the app.");
    expect(html).toContain("Add to wishlist");
  });
  it("lists wanted before bought with price, goal progress and who added or bought", () => {
    const g = goal({ title: "Kitchen fund", saved_centavos: 300000 });
    snapshot.savingsGoals = [g];
    snapshot.wishlistItems = [
      item({
        id: "bought-1",
        title: "Blender",
        price_centavos: 150000,
        status: "bought",
        bought_by: "partner-user",
        bought_at: "2026-10-22T04:00:00Z",
      }),
      item({
        id: "wanted-1",
        note: "the 1.8L one",
        linked_goal_id: g.id,
      }),
      item({ id: "gone", title: "Deleted thing", deleted_at: "x" }),
    ];
    const html = view(snapshot);
    expect(html.indexOf("Rice cooker")).toBeLessThan(html.indexOf("Blender"));
    expect(html).not.toContain("Deleted thing");
    expect(html).toContain("₱2,500.00");
    expect(html).toContain("the 1.8L one");
    expect(html).toContain("Goal: Kitchen fund");
    expect(html).toContain("₱3,000.00 of ₱2,500.00 — you can afford it!");
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain("Added by Ikaw");
    expect(html).toContain("Bought by Maya · Oct 22");
    expect(html).toContain("Mark bought");
    expect(html).toContain("Undo bought");
    expect(html).toContain('aria-label="Edit Rice cooker"');
    expect(html).not.toContain('aria-label="Edit Blender"');
    expect(html).toContain('aria-label="Delete Blender"');
  });
  it("shows partial progress without the ready wording, and Taglish copy by default", () => {
    const g = goal({ saved_centavos: 100000 });
    snapshot.savingsGoals = [g];
    snapshot.wishlistItems = [item({ linked_goal_id: g.id })];
    expect(view(snapshot)).toContain("₱1,000.00 of ₱2,500.00");
    expect(view(snapshot)).not.toContain("afford");
    setLang("taglish");
    const html = view(snapshot);
    expect(html).toContain("Gusto natin");
    expect(html).toContain("₱1,000.00 ng ₱2,500.00");
    expect(html).toContain("Nabili na");
  });
  it("replaces the add button with the limit message at 30 items", () => {
    snapshot.wishlistItems = Array.from({ length: 30 }, (_, n) =>
      item({ id: "i" + n, title: "Item " + n }),
    );
    const html = view(snapshot);
    expect(html).toContain("The wishlist is full (30 items)");
    expect(html).not.toContain("Add to wishlist");
  });
  it("offers only live shared goals in the form and never personal goals", () => {
    snapshot.savingsGoals = [
      goal({ id: "live", title: "Kitchen fund" }),
      goal({
        id: "old",
        title: "Old fund",
        withdrawn_at: "2026-10-23T00:00:00Z",
      }),
    ];
    snapshot.personalGoals = [personal(snapshot)];
    const html = form(snapshot);
    expect(html).toContain("Kitchen fund");
    expect(html).not.toContain("Old fund");
    expect(html).not.toContain("Secret camera");
    expect(html).toContain("Personal savings stay private.");
    expect(html).toContain('maxLength="60"');
    expect(html).toContain('maxLength="140"');
  });
  it("preselects the current link when editing and falls back to none once that goal ended", () => {
    snapshot.savingsGoals = [goal({ id: "live", title: "Kitchen fund" })];
    expect(form(snapshot, item({ linked_goal_id: "live" }))).toContain(
      '<option value="live" selected="">',
    );
    expect(form(snapshot, item({ linked_goal_id: "ended" }))).toContain(
      '<option value="" selected="">',
    );
  });
});
