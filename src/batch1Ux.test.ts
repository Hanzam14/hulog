import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot, SavingsGoal } from "./data";
import { rpc } from "./data";
import { setLang } from "./i18n";
import { NO_SPLIT, owedFieldText, owedForSplit, shareLabel } from "./split";
import SplitPicker from "./components/SplitPicker";
import Tracker from "./screens/Tracker";
import Home from "./screens/Home";
import IponDetail from "./screens/IponDetail";
import { loadSoloSnapshot, setSoloMode, soloRpc } from "./solo";

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async () => ({
  ...(await vi.importActual<typeof import("react")>("react")),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) {
      state.values[index] =
        typeof initial === "function" ? (initial as () => unknown)() : initial;
    }
    return [
      state.values[index],
      (value: unknown) => {
        state.values[index] =
          typeof value === "function"
            ? (value as (prev: unknown) => unknown)(state.values[index])
            : value;
      },
    ];
  },
  useRef: (initial: unknown) => ({ current: initial }),
  useSyncExternalStore: (
    _subscribe: unknown,
    getSnapshot: () => unknown,
  ) => getSnapshot(),
  useEffect: (fn: () => (() => void) | void) => {
    fn();
  },
}));

vi.mock("./data", async () => {
  const actual = await vi.importActual<typeof import("./data")>("./data");
  return {
    ...actual,
    rpc: vi.fn().mockResolvedValue(undefined),
    load: vi.fn(),
  };
});

beforeEach(() => {
  setLang("en");
  state.values = [];
  state.cursor = 0;
});

afterEach(() => {
  setLang("en");
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const html = (element: ReactElement) => {
  state.cursor = 0;
  return renderToStaticMarkup(createElement(MemoryRouter, {}, element));
};

const baseSnapshot = (): Snapshot => ({
  profiles: [
    {
      id: "a",
      display_name: "Ana Cruz",
      nickname: null,
      email: "ana@example.com",
      avatar_url: null,
      avatar_kind: "initial",
      avatar_emoji: null,
      color: "pink",
    },
    {
      id: "b",
      display_name: "Ben Santos",
      nickname: null,
      email: "ben@example.com",
      avatar_url: null,
      avatar_kind: "initial",
      avatar_emoji: null,
      color: "blue",
    },
  ],
  groups: [
    {
      id: "group",
      name: "Pair",
      owner_id: "a",
      pot_location: "MariBank",
    },
  ],
  memberships: [
    {
      group_id: "group",
      user_id: "a",
      status: "active",
      last_seen_history_at: "",
    },
    {
      group_id: "group",
      user_id: "b",
      status: "active",
      last_seen_history_at: "",
    },
  ],
  cycles: [],
  payments: [],
  repayments: [],
  progress: [],
  changes: [],
  invites: [],
  today: "2026-10-22",
  wallets: [
    {
      id: "w1",
      group_id: "group",
      holder_id: "a",
      label: "MariBank",
      archived_at: null,
      created_by: "a",
      created_at: "2026-10-17",
    },
    {
      id: "w2",
      group_id: "group",
      holder_id: "b",
      label: "GCash",
      archived_at: null,
      created_by: "b",
      created_at: "2026-10-17",
    },
  ],
  custody: [],
  savingsGoals: [],
  savingsContributions: [],
  abonoEntries: [],
  abonoSummary: [],
  personalGoals: [],
  personalEntries: [],
  personalHistory: [],
});

describe("Batch 1 UX audit fixes: Abono owed-amount labels/presets, Home Keep/Delete, and Pending explanations", () => {
  it("Item 1: shareLabel and SplitPicker clearly identify who owes whom in both payer directions while preserving PR #24 presets", () => {
    setLang("en");
    // User paid (otherIsMe = false): partner owes user
    expect(shareLabel(false, "Ben Santos", "₱")).toBe("Ben Santos owes you (₱)");
    expect(shareLabel(false, "Ben Santos", "%")).toBe("Ben Santos's share (%)");
    // Partner paid (otherIsMe = true): user owes partner
    expect(shareLabel(true, "Ben Santos", "₱")).toBe("You owe Ben Santos (₱)");
    expect(shareLabel(true, "Ben Santos", "%")).toBe("Your share (%)");

    setLang("taglish");
    expect(shareLabel(false, "Ben Santos", "₱")).toBe(
      "Utang ni Ben Santos sa'yo (₱)",
    );
    expect(shareLabel(true, "Ben Santos", "₱")).toBe(
      "Utang mo kay Ben Santos (₱)",
    );

    const pickerEn = (() => {
      setLang("en");
      return renderToStaticMarkup(
        createElement(SplitPicker, {
          split: { choice: "custom", percent: "30" },
          onChange: () => {},
          otherName: "Ben Santos",
          otherIsMe: false,
        }),
      );
    })();
    expect(pickerEn).toContain("50/50 split");
    expect(pickerEn).toContain("All mine");
    expect(pickerEn).toContain("All for Ben Santos");
    expect(pickerEn).toContain("Custom %");
    expect(pickerEn).toContain("Ben Santos&#x27;s share (%)");

    // Verify unequal split accounting (₱1,000 total / ₱700 payer share / ₱300 owed)
    expect(owedFieldText("1000.00", NO_SPLIT, true, "300.00")).toBe("300.00");
    expect(owedFieldText("1000.00", NO_SPLIT, false, "300.00")).toBe("300.00");
    expect(
      owedForSplit(100000, { choice: "custom", percent: "30" }, true),
    ).toBe(30000);
    expect(
      owedForSplit(100000, { choice: "custom", percent: "30" }, false),
    ).toBe(30000);
  });

  it("Item 1 (Tracker integration): renders owed-amount labels and records unequal ₱1,000 / ₱700 / ₱300 splits in both payer directions", async () => {
    const data = baseSnapshot();

    // Case A: User ('a', Ana) paid ₱1,000; Ana's share is ₱700, Ben ('b') owes Ana ₱300
    state.values = [
      false, // 0: showSettle
      "", // 1: settleAmount
      "", // 2: settleNote
      "", // 3: settleRef
      true, // 4: showAdd
      "Groceries", // 5: description
      "a", // 6: fromMember = user ('a')
      "1000.00", // 7: total
      "300.00", // 8: owed
      NO_SPLIT, // 9: split
      "2026-10-22", // 10: entryDate
      "", // 11: note
      "", // 12: proofRef
      null, // 13: editingId
    ];

    setLang("en");
    const markupUserPaid = html(
      createElement(Tracker, {
        data,
        user: "a",
        run: async (fn) => {
          await fn();
        },
        busy: false,
      }),
    );

    expect(markupUserPaid).toContain("Ben Santos owes you (₱)");
    expect(markupUserPaid).not.toContain("You owe Ben Santos (₱)");
    expect(markupUserPaid).toContain("All for Ben Santos");
    expect(markupUserPaid).toContain("All mine");

    const findForms = (
      node: unknown,
    ): { props: { onSubmit?: (e: unknown) => void } }[] => {
      if (!node || typeof node !== "object") return [];
      if (Array.isArray(node)) return node.flatMap(findForms);
      const el = node as {
        type?: unknown;
        props?: { children?: unknown; onSubmit?: (e: unknown) => void };
      };
      const res =
        el.type === "form" && el.props?.onSubmit ? [{ props: el.props }] : [];
      if (el.props?.children) res.push(...findForms(el.props.children));
      return res;
    };

    state.cursor = 0;
    const treeUserPaid = Tracker({
      data,
      user: "a",
      run: async (fn) => {
        await fn();
      },
      busy: false,
    });
    const formsUserPaid = findForms(treeUserPaid);
    expect(formsUserPaid.length).toBeGreaterThan(0);
    formsUserPaid[0].props.onSubmit!({ preventDefault: vi.fn() });
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledWith(
      "record_abono_entry",
      expect.objectContaining({
        p_kind: "expense",
        p_from_member: "a",
        p_to_member: "b",
        p_description: "Groceries",
        p_total_amount_centavos: 100000,
        p_owed_amount_centavos: 30000,
        p_entry_date: "2026-10-22",
        p_note: "",
      }),
    );

    vi.mocked(rpc).mockClear();

    // Case B: Partner ('b', Ben) paid ₱1,000; Ben's share is ₱700, Ana ('a') owes Ben ₱300
    state.values = [
      false, // 0: showSettle
      "", // 1: settleAmount
      "", // 2: settleNote
      "", // 3: settleRef
      true, // 4: showAdd
      "Groceries", // 5: description
      "b", // 6: fromMember = partner ('b')
      "1000.00", // 7: total
      "300.00", // 8: owed
      NO_SPLIT, // 9: split
      "2026-10-22", // 10: entryDate
      "", // 11: note
      "", // 12: proofRef
      null, // 13: editingId
    ];

    const markupPartnerPaid = html(
      createElement(Tracker, {
        data,
        user: "a",
        run: async (fn) => {
          await fn();
        },
        busy: false,
      }),
    );

    expect(markupPartnerPaid).toContain("You owe Ben Santos (₱)");
    expect(markupPartnerPaid).not.toContain("Ben Santos owes you (₱)");
    expect(markupPartnerPaid).toContain("All for Ben Santos");
    expect(markupPartnerPaid).toContain("All mine");

    state.cursor = 0;
    const treePartnerPaid = Tracker({
      data,
      user: "a",
      run: async (fn) => {
        await fn();
      },
      busy: false,
    });
    const formsPartnerPaid = findForms(treePartnerPaid);
    formsPartnerPaid[0].props.onSubmit!({ preventDefault: vi.fn() });
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledWith(
      "record_abono_entry",
      expect.objectContaining({
        p_kind: "expense",
        p_from_member: "b",
        p_to_member: "a",
        p_description: "Groceries",
        p_total_amount_centavos: 100000,
        p_owed_amount_centavos: 30000,
        p_entry_date: "2026-10-22",
        p_note: "",
      }),
    );
  });

  it("Item 2: Home deletion requests render explicit localized Keep and Delete buttons, invoke mutual-confirmation RPCs, and preserve soft deletion in solo mode", async () => {
    const data = baseSnapshot();
    data.savingsContributions = [
      {
        id: "sc-del",
        goal_id: "g-1",
        member_id: "a",
        amount_centavos: 10000,
        steps: 1,
        note: "Trip",
        status: "confirmed",
        was_confirmed: true,
        created_at: "2026-10-21",
        created_by: "a",
        last_edited_by: null,
        delete_proposed_by: "b",
        confirmed_by: "b",
        confirmed_at: "2026-10-21",
        edited_at: null,
        deleted_at: null,
      },
    ];
    data.abonoEntries = [
      {
        id: "ae-del",
        group_id: "group",
        description: "Dinner",
        from_member: "a",
        to_member: "b",
        total_amount_centavos: 20000,
        owed_amount_centavos: 10000,
        entry_date: "2026-10-21",
        note: "",
        proof_ref: "GCASH-9988",
        status: "confirmed",
        was_confirmed: true,
        kind: "expense",
        created_by: "a",
        last_edited_by: null,
        delete_proposed_by: "b",
        created_at: "2026-10-21",
        confirmed_by: "b",
        confirmed_at: "2026-10-21",
        edited_at: null,
        deleted_at: null,
      },
    ];

    setLang("en");
    const enMarkup = html(
      createElement(Home, { data, user: "a", run: async () => {}, busy: false }),
    );
    expect(enMarkup).toContain(">Keep</button>");
    expect(enMarkup).toContain(">Delete</button>");
    expect(enMarkup).toContain("Ref GCASH-9988");

    setLang("taglish");
    const taglishMarkup = html(
      createElement(Home, { data, user: "a", run: async () => {}, busy: false }),
    );
    expect(taglishMarkup).toContain(">Panatilihin</button>");
    expect(taglishMarkup).toContain(">Alisin</button>");
    expect(taglishMarkup).toContain("flex:0 0 auto");

    setLang("en");
    state.cursor = 0;
    const homeTree = Home({
      data,
      user: "a",
      run: async (fn) => {
        await fn();
      },
      busy: false,
    });
    const findButtons = (
      node: unknown,
    ): { props: { children?: unknown; onClick?: () => void } }[] => {
      if (!node || typeof node !== "object") return [];
      if (Array.isArray(node)) return node.flatMap(findButtons);
      const el = node as {
        type?: unknown;
        props?: { children?: unknown; onClick?: () => void };
      };
      const res =
        el.type === "button" && el.props?.onClick ? [{ props: el.props }] : [];
      if (el.props?.children) res.push(...findButtons(el.props.children));
      return res;
    };
    const buttons = findButtons(homeTree);
    const keepButtons = buttons.filter((b) => b.props.children === "Keep");
    const deleteButtons = buttons.filter((b) => b.props.children === "Delete");
    expect(keepButtons).toHaveLength(2);
    expect(deleteButtons).toHaveLength(2);

    vi.mocked(rpc).mockClear();
    keepButtons[0].props.onClick!();
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledWith("respond_delete_savings_contribution", {
      p_id: "sc-del",
      p_action: "decline",
    });

    deleteButtons[0].props.onClick!();
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledWith("respond_delete_savings_contribution", {
      p_id: "sc-del",
      p_action: "accept",
    });

    keepButtons[1].props.onClick!();
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledWith("respond_delete_abono_entry", {
      p_id: "ae-del",
      p_action: "decline",
    });

    deleteButtons[1].props.onClick!();
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledWith("respond_delete_abono_entry", {
      p_id: "ae-del",
      p_action: "accept",
    });

    // Also verify soloRpc soft-deletion and Keep/decline behavior
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    setSoloMode(true);
    try {
      const entryId = (await soloRpc("record_abono_entry", {
        p_kind: "expense",
        p_from_member: "solo-user",
        p_to_member: "partner",
        p_description: "Water",
        p_total_amount_centavos: 40000,
        p_owed_amount_centavos: 20000,
        p_entry_date: "2026-10-22",
        p_note: "",
      })) as string;

      // Simulate a delete proposal on the solo snapshot
      const raw = JSON.parse(storage.get("hulog-solo-snapshot")!);
      raw.abonoEntries[0].delete_proposed_by = "partner";
      storage.set("hulog-solo-snapshot", JSON.stringify(raw));

      // Keep (decline) clears delete_proposed_by and preserves deleted_at = null
      await soloRpc("respond_delete_abono_entry", {
        p_id: entryId,
        p_action: "decline",
      });
      let updated = await loadSoloSnapshot();
      expect(updated.abonoEntries?.[0].delete_proposed_by).toBeNull();
      expect(updated.abonoEntries?.[0].deleted_at).toBeNull();

      // Delete (accept) sets deleted_at (soft deletion) while keeping record in array
      const raw2 = JSON.parse(storage.get("hulog-solo-snapshot")!);
      raw2.abonoEntries[0].delete_proposed_by = "partner";
      storage.set("hulog-solo-snapshot", JSON.stringify(raw2));

      await soloRpc("respond_delete_abono_entry", {
        p_id: entryId,
        p_action: "accept",
      });
      updated = await loadSoloSnapshot();
      expect(updated.abonoEntries).toHaveLength(1);
      expect(updated.abonoEntries?.[0].deleted_at).toBeTruthy();
      expect(updated.abonoEntries?.[0].delete_proposed_by).toBeNull();
    } finally {
      setSoloMode(false);
    }
  });

  it("Item 3: Pending Abono settlements identify the right confirmer (debtor-recorded, creditor-recorded, edited, and mixed) and IponDetail explains pending withdrawal blockers", () => {
    const data = baseSnapshot();
    data.abonoSummary = [
      {
        group_id: "group",
        debtor_id: "a",
        creditor_id: "b",
        owed_centavos: 50000,
        pending_settlement_centavos: 50000,
      },
    ];

    // 1. Debtor-recorded settlement -> waiting for Creditor ('b', Ben Santos)
    data.abonoEntries = [
      {
        id: "ae-settle-1",
        group_id: "group",
        description: "Settlement",
        from_member: "a",
        to_member: "b",
        total_amount_centavos: 50000,
        owed_amount_centavos: 50000,
        entry_date: "2026-10-22",
        note: "",
        status: "pending",
        was_confirmed: false,
        kind: "settlement",
        created_by: "a",
        last_edited_by: null,
        delete_proposed_by: null,
        created_at: "2026-10-22",
        confirmed_by: null,
        confirmed_at: null,
        edited_at: null,
        deleted_at: null,
      },
    ];
    setLang("en");
    const debtorRecordedMarkup = html(
      createElement(Tracker, { data, user: "a", run: async () => {}, busy: false }),
    );
    expect(debtorRecordedMarkup).toContain("Ana Cruz owes Ben Santos ₱500.00");
    expect(debtorRecordedMarkup).toContain(
      "₱500.00 settlement waiting for Ben Santos&#x27;s confirmation",
    );

    // 2. Creditor-recorded settlement ("Natanggap ko") -> waiting for Debtor ('a', Ana Cruz)
    data.abonoEntries = [
      {
        ...data.abonoEntries[0],
        id: "ae-settle-2",
        created_by: "b",
        last_edited_by: null,
      },
    ];
    const creditorRecordedMarkup = html(
      createElement(Tracker, { data, user: "b", run: async () => {}, busy: false }),
    );
    expect(creditorRecordedMarkup).toContain(
      "₱500.00 settlement waiting for Ana Cruz&#x27;s confirmation",
    );

    // 3. Edited settlement (created by 'a', edited by 'b') -> waiting for 'a' (Ana Cruz)
    data.abonoEntries = [
      {
        ...data.abonoEntries[0],
        id: "ae-settle-3",
        created_by: "a",
        last_edited_by: "b",
      },
    ];
    const editedMarkup = html(
      createElement(Tracker, { data, user: "b", run: async () => {}, busy: false }),
    );
    expect(editedMarkup).toContain(
      "₱500.00 settlement waiting for Ana Cruz&#x27;s confirmation",
    );

    // 4. Mixed pending settlements awaiting different confirmers -> neutral wording
    data.abonoEntries.push({
      ...data.abonoEntries[0],
      id: "ae-settle-4",
      created_by: "a",
      last_edited_by: null,
    });
    const mixedMarkup = html(
      createElement(Tracker, { data, user: "a", run: async () => {}, busy: false }),
    );
    expect(mixedMarkup).toContain(
      "₱500.00 settlement waiting for confirmation",
    );

    // 5. Empty abonoEntries with pending_settlement_centavos > 0 renders generic explanation without guessing member
    data.abonoEntries = [];
    data.abonoSummary = [
      {
        group_id: "group",
        debtor_id: "a",
        creditor_id: "b",
        owed_centavos: 30000,
        pending_settlement_centavos: 30000,
      },
    ];
    const emptyEntriesMarkup = html(
      createElement(Tracker, { data, user: "a", run: async () => {}, busy: false }),
    );
    expect(emptyEntriesMarkup).toContain(
      "₱300.00 settlement waiting for confirmation",
    );
    expect(emptyEntriesMarkup).not.toContain(
      "settlement waiting for Ben Santos",
    );
    expect(emptyEntriesMarkup).not.toContain(
      "settlement waiting for Ana Cruz",
    );

    // 6. IponDetail pending blocker explanation
    const goal: SavingsGoal = {
      id: "g-1",
      group_id: "group",
      title: "Trip",
      goal_mode: "matched",
      step_amount_centavos: 10000,
      cadence_days: 7,
      num_steps: 10,
      target_amount_centavos: 100000,
      wallet_id: "w1",
      holder_id: "a",
      wallet_label: "MariBank",
      pending_wallet_id: null,
      wallet_proposed_by: null,
      start_date: "2026-10-20",
      end_date: "2026-12-01",
      proposed_by: "a",
      status: "accepted",
      accepted_by: "b",
      accepted_at: "2026-10-20",
      withdraw_proposed_by: null,
      withdrawn_by: null,
      withdrawn_at: null,
      saved_centavos: 10000,
      phase: "open",
      days_left: 5,
      expected_steps_today: 0,
      created_at: "2026-10-20",
    };
    data.savingsGoals = [goal];
    data.savingsContributions = [
      {
        id: "sc-pending",
        goal_id: "g-1",
        member_id: "a",
        steps: 1,
        amount_centavos: 10000,
        note: "",
        status: "pending",
        was_confirmed: false,
        created_by: "a",
        last_edited_by: null,
        delete_proposed_by: null,
        created_at: "2026-10-21",
        confirmed_by: null,
        confirmed_at: null,
        edited_at: null,
        deleted_at: null,
      },
    ];

    const iponMarkup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ["/ipon/g-1"] },
        createElement(
          Routes,
          {},
          createElement(Route, {
            path: "/ipon/:id",
            element: createElement(IponDetail, {
              data,
              user: "a",
              run: async () => {},
              busy: false,
            }),
          }),
        ),
      ),
    );

    expect(iponMarkup).toMatch(
      /<button[^>]+disabled[^>]*>Propose withdrawal \/ close goal<\/button>/,
    );
    expect(iponMarkup).toContain(
      "Confirm or resolve pending contributions and deletions before withdrawing or closing this goal.",
    );
    expect(iponMarkup).toContain('href="/ipon/g-1/record"');

    // Resolved contribution enables withdrawal button and removes blocker text
    data.savingsContributions = [
      {
        ...data.savingsContributions[0],
        status: "confirmed",
        was_confirmed: true,
        confirmed_by: "b",
        confirmed_at: "2026-10-21",
      },
    ];
    const confirmedIponMarkup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ["/ipon/g-1"] },
        createElement(
          Routes,
          {},
          createElement(Route, {
            path: "/ipon/:id",
            element: createElement(IponDetail, {
              data,
              user: "a",
              run: async () => {},
              busy: false,
            }),
          }),
        ),
      ),
    );
    expect(confirmedIponMarkup).not.toMatch(
      /<button[^>]+disabled[^>]*>Propose withdrawal \/ close goal<\/button>/,
    );
    expect(confirmedIponMarkup).not.toContain(
      "Confirm or resolve pending contributions and deletions before withdrawing or closing this goal.",
    );
  });
});
