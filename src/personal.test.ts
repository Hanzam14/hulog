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
  migratePersonalSavings,
  personalBalance,
  personalRpc,
} from "./personal";
import { GoalForm, PersonalGoalCard } from "./components/PersonalSavings";
import { setLang } from "./i18n";
import type { PersonalGoal, Snapshot } from "./data";

let snapshot: Snapshot;
const owner = "personal-owner";
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
  snapshot = createInitialSoloSnapshot(owner, "partnered");
  migratePersonalSavings(snapshot);
  setLang("en");
});
afterEach(() => {
  setLang("taglish");
  vi.unstubAllGlobals();
});
function createGoal() {
  const id = personalRpc(snapshot, owner, "create_personal_goal", {
    p_title: "Camera",
    p_target_amount_centavos: 100000,
  }) as string;
  return snapshot.personalGoals!.find((g) => g.id === id)!;
}
function record(goal: PersonalGoal, kind = "deposit", amount = 10000) {
  return personalRpc(snapshot, owner, "record_personal_entry", {
    p_goal_id: goal.id,
    p_kind: kind,
    p_amount_centavos: amount,
  }) as string;
}
describe("personal savings ledger", () => {
  it("migrates legacy local goals once with the same balance, IDs, notes and prior shared visibility", () => {
    const goal = snapshot.personalGoals!.find(
      (g) => g.title === "AI Subscription",
    )!;
    expect(goal).toMatchObject({
      id: "demo-solo-ai-goal",
      owner_id: owner,
      visibility: "shared",
    });
    expect(personalBalance(snapshot.personalEntries!, goal.id)).toBe(60000);
    expect(
      snapshot.personalEntries!.find((e) => e.goal_id === goal.id)?.note,
    ).toBe("First half for Claude Pro");
    expect(snapshot.savingsGoals).toHaveLength(0);
    const before = structuredClone(snapshot);
    migratePersonalSavings(snapshot);
    expect(snapshot).toEqual(before);
  });
  it("defaults new goals to private, derives the owner and records the audit", () => {
    const goal = createGoal();
    expect(goal).toMatchObject({
      owner_id: owner,
      group_id: snapshot.groups[0].id,
      visibility: "private",
    });
    expect(snapshot.personalHistory!.at(-1)).toMatchObject({
      actor_id: owner,
      goal_id: goal.id,
      action: "insert",
    });
  });
  it("deposits, withdraws, corrects and soft deletes while preserving nonnegative balance and history", () => {
    const goal = createGoal();
    const deposit = record(goal);
    const withdrawal = record(goal, "withdrawal", 3000);
    expect(personalBalance(snapshot.personalEntries!, goal.id)).toBe(7000);
    personalRpc(snapshot, owner, "update_personal_entry", {
      p_entry_id: deposit,
      p_amount_centavos: 12000,
      p_note: "Correction",
    });
    expect(personalBalance(snapshot.personalEntries!, goal.id)).toBe(9000);
    expect(() =>
      personalRpc(snapshot, owner, "update_personal_entry", {
        p_entry_id: deposit,
        p_delete: true,
      }),
    ).toThrow("Personal savings balance out of range");
    personalRpc(snapshot, owner, "update_personal_entry", {
      p_entry_id: withdrawal,
      p_delete: true,
    });
    expect(personalBalance(snapshot.personalEntries!, goal.id)).toBe(12000);
    expect(
      snapshot.personalEntries!.find((e) => e.id === withdrawal)?.deleted_at,
    ).toBeTruthy();
    expect(snapshot.personalHistory!.at(-1)).toMatchObject({
      action: "delete",
      before: { amount_centavos: 3000 },
      after: { amount_centavos: 3000 },
    });
  });
  it("rejects overdraws, invalid centavos and future dates without changing records", () => {
    const goal = createGoal();
    const before = structuredClone(snapshot);
    expect(() => record(goal, "withdrawal", 1)).toThrow(
      "Personal savings balance out of range",
    );
    for (const value of [0, -1, 1.1, 10000000001, NaN])
      expect(() => record(goal, "deposit", value)).toThrow(
        "Invalid personal savings amount",
      );
    expect(() =>
      personalRpc(snapshot, owner, "record_personal_entry", {
        p_goal_id: goal.id,
        p_kind: "deposit",
        p_amount_centavos: 1,
        p_entry_date: "2099-01-01",
      }),
    ).toThrow("Entry date cannot be in the future");
    expect(snapshot).toEqual(before);
  });
  it("rejects another member's writes even when the goal is shared", () => {
    const goal = createGoal();
    const deposit = record(goal);
    personalRpc(snapshot, owner, "update_personal_goal", {
      p_goal_id: goal.id,
      p_visibility: "shared",
    });
    for (const [rpc, args] of [
      ["update_personal_goal", { p_goal_id: goal.id, p_delete: true }],
      [
        "record_personal_entry",
        { p_goal_id: goal.id, p_kind: "deposit", p_amount_centavos: 1 },
      ],
      ["update_personal_entry", { p_entry_id: deposit, p_amount_centavos: 1 }],
    ] as const)
      expect(() => personalRpc(snapshot, "partner-user", rpc, args)).toThrow(
        "Personal savings owner only",
      );
  });
  it("keeps soft-deleted goals for owner history and rejects further writes", () => {
    const goal = createGoal();
    personalRpc(snapshot, owner, "update_personal_goal", {
      p_goal_id: goal.id,
      p_delete: true,
    });
    expect(goal.deleted_at).toBeTruthy();
    expect(() => record(goal)).toThrow("Personal savings owner only");
  });
  it("preserves personal records when switching the offline preview's pot mode", async () => {
    const id = await soloRpc("create_personal_goal", {
      p_title: "Keep me",
      p_target_amount_centavos: 50000,
    });
    await soloRpc("record_personal_entry", {
      p_goal_id: id,
      p_kind: "deposit",
      p_amount_centavos: 2000,
    });
    setSoloPotMode("standalone");
    const saved = await loadSoloSnapshot();
    expect(saved.personalGoals!.find((g) => g.id === id)?.title).toBe(
      "Keep me",
    );
    expect(personalBalance(saved.personalEntries!, id as string)).toBe(2000);
    expect(saved.personalHistory!.filter((h) => h.goal_id === id)).toHaveLength(
      2,
    );
  });
});
describe("personal savings presentation permissions", () => {
  it("renders partner-shared goals with their name and no write controls", () => {
    const goal = createGoal();
    goal.visibility = "shared";
    const html = renderToStaticMarkup(
      createElement(PersonalGoalCard, {
        goal,
        data: snapshot,
        user: "partner-user",
        run: async () => {},
        busy: false,
      }),
    );
    expect(html).toContain("Personal savings by Ikaw");
    expect(html).toContain(
      "Read-only. Only the owner can change these records.",
    );
    expect(html).not.toContain("<button");
    expect(html).toContain("Shared, read-only");
  });
  it("renders private owner controls and private-by-default creation", () => {
    const goal = createGoal();
    const html = renderToStaticMarkup(
      createElement(PersonalGoalCard, {
        goal,
        data: snapshot,
        user: owner,
        run: async () => {},
        busy: false,
      }),
    );
    expect(html).toContain("Private");
    expect(html).toContain("Let partner view");
    expect(html).toContain("Record deposit");
    const form = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        {},
        createElement(GoalForm, {
          run: async () => {},
          busy: false,
          close: () => {},
        }),
      ),
    );
    expect(form).toContain('<option value="private" selected="">');
    expect(form).toContain("Only you can change this goal or its records.");
  });
});
