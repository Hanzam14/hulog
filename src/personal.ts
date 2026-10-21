import type { PersonalEntry, PersonalGoal, Snapshot } from "./data";
import { cleanGoalTitle, isSoloGoal } from "./helpers";

export const personalRpcNames = [
  "create_personal_goal",
  "update_personal_goal",
  "record_personal_entry",
  "update_personal_entry",
];
export function personalBalance(
  entries: PersonalEntry[],
  goalId: string,
): number {
  return entries
    .filter((e) => e.goal_id === goalId && !e.deleted_at)
    .reduce(
      (sum, e) =>
        sum + (e.kind === "deposit" ? e.amount_centavos : -e.amount_centavos),
      0,
    );
}
/** Upgrade the local preview's old [Solo] goals once, preserving IDs and notes. */
export function migratePersonalSavings(snapshot: Snapshot): void {
  snapshot.personalGoals ??= [];
  snapshot.personalEntries ??= [];
  const legacy = (snapshot.savingsGoals ?? []).filter(isSoloGoal);
  for (const goal of legacy) {
    if (!snapshot.personalGoals.some((g) => g.id === goal.id)) {
      snapshot.personalGoals.push({
        id: goal.id,
        group_id: goal.group_id,
        owner_id: goal.proposed_by,
        title: cleanGoalTitle(goal.title),
        target_amount_centavos: goal.target_amount_centavos,
        visibility: "shared",
        created_at: goal.created_at,
        updated_at: goal.created_at,
        deleted_at: null,
      });
      for (const entry of (snapshot.savingsContributions ?? []).filter(
        (e) => e.goal_id === goal.id,
      )) {
        snapshot.personalEntries.push({
          id: entry.id,
          goal_id: goal.id,
          kind: "deposit",
          amount_centavos: entry.amount_centavos,
          entry_date: entry.created_at.slice(0, 10),
          note: entry.note,
          created_at: entry.created_at,
          updated_at: entry.edited_at ?? entry.created_at,
          deleted_at: entry.deleted_at,
        });
      }
      const balance = personalBalance(snapshot.personalEntries, goal.id);
      if (goal.withdrawn_at && balance > 0)
        snapshot.personalEntries.push({
          id: `${goal.id}-withdrawal`,
          goal_id: goal.id,
          kind: "withdrawal",
          amount_centavos: balance,
          entry_date: goal.withdrawn_at.slice(0, 10),
          note: "",
          created_at: goal.withdrawn_at,
          updated_at: goal.withdrawn_at,
          deleted_at: null,
        });
    }
  }
  const ids = new Set(legacy.map((g) => g.id));
  snapshot.savingsGoals = (snapshot.savingsGoals ?? []).filter(
    (g) => !ids.has(g.id),
  );
  snapshot.savingsContributions = (snapshot.savingsContributions ?? []).filter(
    (e) => !ids.has(e.goal_id),
  );
  snapshot.savingsProgress = (snapshot.savingsProgress ?? []).filter(
    (p) => !ids.has(p.goal_id),
  );
}
function amount(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 10000000000
  )
    throw new Error("Invalid personal savings amount");
  return value;
}
function visibility(value: unknown): "private" | "shared" {
  if (value !== "private" && value !== "shared")
    throw new Error("Invalid visibility");
  return value;
}
function title(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 60)
    throw new Error("Goal title must be 1 to 60 characters");
  return value.trim();
}
function entryDate(value: unknown, today: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value ||
    value > today
  )
    throw new Error("Entry date cannot be in the future");
  return value;
}
function note(value: unknown): string {
  if (typeof value !== "string" || value.length > 140)
    throw new Error("Note must be at most 140 characters");
  return value;
}
/** Offline preview equivalent of the scoped online RPCs; never a security boundary. */
export function personalRpc(
  snapshot: Snapshot,
  user: string,
  name: string,
  args: Record<string, unknown>,
): unknown {
  const goals = (snapshot.personalGoals ??= []);
  const entries = (snapshot.personalEntries ??= []);
  const now = new Date().toISOString();
  const audit = (
    goalId: string,
    entity: string,
    before: PersonalGoal | PersonalEntry | null,
    after: PersonalGoal | PersonalEntry,
  ) => {
    const history = (snapshot.personalHistory ??= []);
    history.push({
      id: history.length + 1,
      goal_id: goalId,
      actor_id: user,
      entity,
      entity_id: after.id,
      action:
        after.deleted_at && !before?.deleted_at
          ? "delete"
          : before
            ? "update"
            : "insert",
      before: before ? { ...before } : null,
      after: { ...after },
      created_at: now,
    });
  };
  const own = (id: unknown): PersonalGoal => {
    const goal = goals.find(
      (g) => g.id === id && g.owner_id === user && !g.deleted_at,
    );
    if (!goal) throw new Error("Personal savings owner only");
    return goal;
  };
  if (name === "create_personal_goal") {
    const goal: PersonalGoal = {
      id: crypto.randomUUID(),
      group_id: snapshot.groups[0].id,
      owner_id: user,
      title: title(args.p_title),
      target_amount_centavos: amount(args.p_target_amount_centavos),
      visibility: visibility(args.p_visibility ?? "private"),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    goals.push(goal);
    audit(goal.id, "personal_savings_goals", null, goal);
    return goal.id;
  }
  if (name === "update_personal_goal") {
    const goal = own(args.p_goal_id);
    const before = { ...goal };
    Object.assign(goal, {
      title: title(args.p_title ?? goal.title),
      target_amount_centavos: amount(
        args.p_target_amount_centavos ?? goal.target_amount_centavos,
      ),
      visibility: visibility(args.p_visibility ?? goal.visibility),
      updated_at: now,
      deleted_at: args.p_delete ? now : goal.deleted_at,
    });
    audit(goal.id, "personal_savings_goals", before, goal);
    return;
  }
  const existing =
    name === "update_personal_entry"
      ? entries.find((e) => e.id === args.p_entry_id && !e.deleted_at)
      : undefined;
  const goal = own(existing?.goal_id ?? args.p_goal_id);
  if (name === "update_personal_entry" && !existing)
    throw new Error("Personal savings entry unavailable");
  const kind = existing?.kind ?? args.p_kind;
  if (kind !== "deposit" && kind !== "withdrawal")
    throw new Error("Invalid personal savings entry kind");
  const entry: PersonalEntry = {
    id: existing?.id ?? crypto.randomUUID(),
    goal_id: goal.id,
    kind,
    amount_centavos: amount(
      args.p_amount_centavos ?? existing?.amount_centavos,
    ),
    entry_date: entryDate(
      args.p_entry_date ?? existing?.entry_date ?? snapshot.today,
      snapshot.today,
    ),
    note: note(args.p_note ?? existing?.note ?? ""),
    created_at: existing?.created_at ?? now,
    updated_at: now,
    deleted_at: args.p_delete ? now : null,
  };
  const after = entries.filter((e) => e.id !== entry.id).concat(entry);
  const balance = personalBalance(after, goal.id);
  if (balance < 0 || balance > 10000000000)
    throw new Error("Personal savings balance out of range");
  const before = existing ? { ...existing } : null;
  if (existing) Object.assign(existing, entry);
  else entries.push(entry);
  audit(goal.id, "personal_savings_entries", before, entry);
  return entry.id;
}
