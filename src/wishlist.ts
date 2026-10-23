import type { SavingsGoal, Snapshot, WishlistItem } from "./data";

export const WISHLIST_MAX_ITEMS = 30;
export const WISHLIST_TITLE_MAX = 60;
export const WISHLIST_NOTE_MAX = 140;
export const WISHLIST_PRICE_MAX = 10000000000;

export const wishlistRpcNames = [
  "add_wishlist_item",
  "edit_wishlist_item",
  "set_wishlist_bought",
  "delete_wishlist_item",
];

/** Live items only; the database already hides deleted rows from readers. */
export function liveWishlist(
  items: WishlistItem[] | undefined,
): WishlistItem[] {
  return (items ?? []).filter((item) => !item.deleted_at);
}
/** Wanted items first (oldest first), then bought ones (most recently bought first). */
export function sortWishlist(items: WishlistItem[]): WishlistItem[] {
  const byCreated = (a: WishlistItem, b: WishlistItem) =>
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  return [
    ...items.filter((i) => i.status === "wanted").sort(byCreated),
    ...items
      .filter((i) => i.status === "bought")
      .sort(
        (a, b) =>
          (b.bought_at ?? "").localeCompare(a.bought_at ?? "") ||
          byCreated(a, b),
      ),
  ];
}
/** Manila calendar date of a timestamp. */
export function manilaDay(at: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    new Date(at),
  );
}
export function wantedCount(items: WishlistItem[]): number {
  return items.filter((i) => i.status === "wanted").length;
}
/** A shared ipon goal an item can point at: not withdrawn, declined, cancelled or expired. */
export function isLinkableGoal(goal: SavingsGoal): boolean {
  return goal.status === "accepted"
    ? !goal.withdrawn_at
    : goal.status === "proposed" && goal.phase !== "expired";
}
export function linkableGoals(goals: SavingsGoal[] | undefined): SavingsGoal[] {
  return (goals ?? [])
    .filter(isLinkableGoal)
    .sort((a, b) => a.title.localeCompare(b.title));
}
export interface WishlistProgress {
  goal: SavingsGoal;
  saved: number;
  price: number;
  percent: number;
  ready: boolean;
}
/** Confirmed saved of the linked shared goal against the item price; null when nothing to show. */
export function wishlistProgress(
  item: WishlistItem,
  goals: SavingsGoal[] | undefined,
): WishlistProgress | null {
  if (!item.linked_goal_id) return null;
  const goal = (goals ?? []).find((g) => g.id === item.linked_goal_id);
  if (!goal || !isLinkableGoal(goal)) return null;
  const saved = Math.max(0, goal.saved_centavos);
  const price = item.price_centavos;
  return {
    goal,
    saved,
    price,
    percent: price > 0 ? Math.min(100, Math.floor((saved / price) * 100)) : 0,
    ready: saved >= price,
  };
}

function text(value: unknown): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || trimmed.length > WISHLIST_TITLE_MAX)
    throw new Error("Wishlist title must be 1 to 60 characters");
  return trimmed;
}
function price(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > WISHLIST_PRICE_MAX
  )
    throw new Error("Invalid wishlist price");
  return value;
}
function note(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (trimmed.length > WISHLIST_NOTE_MAX)
    throw new Error("Note must be at most 140 characters");
  return trimmed || null;
}
function linked(snapshot: Snapshot, value: unknown): string | null {
  if (value == null || value === "") return null;
  const goal = (snapshot.savingsGoals ?? []).find(
    (g) => g.id === value && g.group_id === snapshot.groups[0].id,
  );
  if (!goal || !isLinkableGoal(goal))
    throw new Error(
      "Linked goal must be an active shared ipon goal in your group",
    );
  return goal.id;
}
/** Offline preview equivalent of the scoped online RPCs; never a security boundary. */
export function wishlistRpc(
  snapshot: Snapshot,
  user: string,
  name: string,
  args: Record<string, unknown>,
): unknown {
  const items = (snapshot.wishlistItems ??= []);
  const now = new Date().toISOString();
  // Mirrors the hosted audit trigger so the offline Changes feed matches.
  const audit = (
    item: WishlistItem,
    action: string,
    before: WishlistItem | null,
  ) => {
    const changes = (snapshot.changes ??= []);
    changes.push({
      id: (changes.at(-1)?.id ?? 0) + 1,
      actor_id: user,
      entity: "wishlist_items",
      entity_id: item.id,
      action,
      before: before as unknown as Record<string, unknown> | null,
      after: { ...item } as unknown as Record<string, unknown>,
      created_at: now,
      unread: false,
    });
  };
  const live = (id: unknown) => {
    const item = items.find((i) => i.id === id && !i.deleted_at);
    if (!item) throw new Error("Wishlist item unavailable");
    return item;
  };
  if (name === "add_wishlist_item") {
    const fields = {
      title: text(args.p_title),
      price_centavos: price(args.p_price_centavos),
      note: note(args.p_note),
      linked_goal_id: linked(snapshot, args.p_linked_goal_id),
    };
    if (items.filter((i) => !i.deleted_at).length >= WISHLIST_MAX_ITEMS)
      throw new Error("Maximum of 30 wishlist items reached");
    const item: WishlistItem = {
      id: crypto.randomUUID(),
      group_id: snapshot.groups[0].id,
      ...fields,
      added_by: user,
      status: "wanted",
      bought_by: null,
      bought_at: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    items.push(item);
    audit(item, "insert", null);
    return item.id;
  }
  const item = live(args.p_id);
  const before = { ...item };
  if (name === "edit_wishlist_item") {
    if (item.status !== "wanted")
      throw new Error("Bought items cannot be edited");
    Object.assign(item, {
      title: text(args.p_title),
      price_centavos: price(args.p_price_centavos),
      note: note(args.p_note),
      linked_goal_id: linked(snapshot, args.p_linked_goal_id),
      updated_at: now,
    });
    audit(item, "update", before);
    return;
  }
  if (name === "set_wishlist_bought") {
    if (typeof args.p_bought !== "boolean")
      throw new Error("Bought flag required");
    if ((item.status === "bought") === args.p_bought) return;
    Object.assign(
      item,
      args.p_bought
        ? { status: "bought", bought_by: user, bought_at: now }
        : { status: "wanted", bought_by: null, bought_at: null },
      { updated_at: now },
    );
    audit(item, "update", before);
    return;
  }
  if (name === "delete_wishlist_item") {
    item.deleted_at = now;
    item.updated_at = now;
    audit(item, "delete", before);
    return;
  }
  throw new Error(`Unknown wishlist RPC: ${name}`);
}
