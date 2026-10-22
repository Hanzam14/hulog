import type {
  Cycle,
  PersonalGoal,
  Progress,
  SavingsGoal,
  Snapshot,
} from "./data";
import { personalBalance } from "./personal";

/** Spec 10.8. Everything here is derived from rows the viewer can already read. */

/** A finished round is clean when no debt remains and every day was paid and confirmed. */
export const isCleanFinish = (cycle: Cycle, row: Progress) =>
  row.debt_centavos === 0 && row.confirmed_days >= cycle.num_days;

/**
 * Consecutive most-recent ended rounds the member finished clean. Rounds the
 * member did not take part in are skipped; the first unclean round stops the count.
 */
export function memberStreak(
  data: Pick<Snapshot, "cycles" | "progress">,
  memberId: string,
): number {
  const ended = data.cycles
    .filter((c) => c.phase === "ended")
    .sort(
      (a, b) =>
        b.end_date.localeCompare(a.end_date) ||
        b.created_at.localeCompare(a.created_at),
    );
  let streak = 0;
  for (const cycle of ended) {
    const row = data.progress.find(
      (p) => p.cycle_id === cycle.id && p.member_id === memberId,
    );
    if (!row) continue;
    // A solo round only obliges its saver; the observer's row is not a real obligation.
    if (cycle.is_solo && cycle.receiver_id !== memberId) continue;
    if (!isCleanFinish(cycle, row)) break;
    streak += 1;
  }
  return streak;
}

export type GoalRef =
  | { kind: "ipon"; goal: SavingsGoal }
  | { kind: "personal"; goal: PersonalGoal };

/** Id used to remember that a goal was celebrated on this device. */
export const celebrationId = (ref: GoalRef) => `${ref.kind}-${ref.goal.id}`;

/**
 * Shared ipon: confirmed saved has reached the target. Personal: only the
 * viewer's own goal counts, so a partner's goal never celebrates for the viewer.
 */
export function goalReached(
  data: Pick<Snapshot, "personalEntries">,
  ref: GoalRef,
  viewer: string,
): boolean {
  if (!(ref.goal.target_amount_centavos > 0)) return false;
  if (ref.kind === "ipon")
    return (
      ref.goal.status === "accepted" &&
      !ref.goal.withdrawn_at &&
      ref.goal.saved_centavos >= ref.goal.target_amount_centavos
    );
  return (
    ref.goal.owner_id === viewer &&
    !ref.goal.deleted_at &&
    personalBalance(data.personalEntries ?? [], ref.goal.id) >=
      ref.goal.target_amount_centavos
  );
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;
const keyPrefix = "hulog-goal-celebrated:";
/** The earlier payout-style burst stored ipon ids here; honour them so those never repeat. */
const legacyKey = "hulog-confetti-seen";
const sessionSeen = new Set<string>();

function deviceStorage(): StorageLike | null {
  try {
    // Reading window.localStorage itself can throw in private or blocked contexts.
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function hasCelebrated(
  id: string,
  storage: StorageLike | null = deviceStorage(),
  memory = sessionSeen,
): boolean {
  if (memory.has(id)) return true;
  try {
    if (storage?.getItem(keyPrefix + id) != null) return true;
    const legacy: unknown = JSON.parse(storage?.getItem(legacyKey) ?? "[]");
    return Array.isArray(legacy) && legacy.includes(id);
  } catch {
    return false;
  }
}

export function markCelebrated(
  id: string,
  storage: StorageLike | null = deviceStorage(),
  memory = sessionSeen,
): void {
  memory.add(id);
  try {
    storage?.setItem(keyPrefix + id, "1");
  } catch {
    /* Session memory still prevents a repeat. */
  }
}
