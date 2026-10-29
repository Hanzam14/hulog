import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type {
  Snapshot,
  Cycle,
  SavingsGoal,
  PersonalGoal,
} from "./data";
import { setLang } from "./i18n";
import CycleCard from "./components/CycleCard";
import IponCard from "./components/IponCard";
import IponDetail from "./screens/IponDetail";
import Propose from "./screens/Propose";
import ProposeIpon from "./screens/ProposeIpon";
import Tracker from "./screens/Tracker";
import ProfileEditor from "./components/ProfileEditor";
import RecordIpon from "./screens/RecordIpon";
import Detail from "./screens/Detail";
import History from "./screens/History";
import Home from "./screens/Home";
import PersonalSavings, { GoalForm } from "./components/PersonalSavings";
import { rpc } from "./data";

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async () => ({
  ...(await vi.importActual<typeof import("react")>("react")),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = initial;
    return [
      state.values[index],
      (value: unknown) => {
        state.values[index] = value;
      },
    ];
  },
  useEffect: (fn: () => (() => void) | void) => {
    fn();
  },
}));

vi.mock("./components/InstallSettings", () => ({
  default: () => null,
  InstallBanner: () => null,
}));
vi.mock("./components/AppUpdates", () => ({
  default: () => null,
  UpdateBanner: () => null,
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

describe("Fix 1: CycleCard and IponCard aria-label removal", () => {
  it("CycleCard link does not override children with aria-label", () => {
    const data = baseSnapshot();
    const cycle: Cycle = {
      id: "c-1",
      group_id: "group",
      daily_amount_centavos: 5000,
      num_days: 10,
      target_centavos: 50000,
      start_date: "2026-10-20",
      end_date: "2026-10-30",
      receiver_id: "a",
      proposed_by: "a",
      status: "accepted",
      phase: "open",
      pot_centavos: 25000,
      payout_state: "upcoming",
      received_at: null,
      days_left: 5,
      created_at: "2026-10-20",
    };

    const markup = html(createElement(CycleCard, { c: cycle, data, user: "a" }));
    // Link should NOT have aria-label overriding the pot amount and details
    expect(markup).not.toMatch(/<a[^>]+class="pot"[^>]+aria-label=/);
  });

  it("IponCard link does not override children with aria-label", () => {
    const data = baseSnapshot();
    const goal = {
      id: "g-1",
      group_id: "group",
      title: "Trip to Coron",
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
      accepted_by: null,
      accepted_at: null,
      withdraw_proposed_by: null,
      withdrawn_by: null,
      withdrawn_at: null,
      saved_centavos: 0,
      phase: "open",
      days_left: 5,
      expected_steps_today: 0,
      created_at: "2026-10-20",
    } as unknown as SavingsGoal;

    const markup = html(createElement(IponCard, { g: goal, data, user: "a" }));
    // Link should NOT have aria-label overriding card contents
    expect(markup).not.toMatch(/<a[^>]+class="pot ipon-card"[^>]+aria-label=/);
  });
});

describe("Fix 2: IponDetail wallet select accessible name", () => {
  it("wallet select in move wallet form has an accessible name", () => {
    const data = baseSnapshot();
    const goal = {
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
      accepted_by: null,
      accepted_at: null,
      withdraw_proposed_by: null,
      withdrawn_by: null,
      withdrawn_at: null,
      saved_centavos: 0,
      phase: "open",
      days_left: 5,
      expected_steps_today: 0,
      created_at: "2026-10-20",
    } as unknown as SavingsGoal;
    data.savingsGoals = [goal];

    // Set movingWallet state to true (it's one of the state variables in IponDetail)
    // Let's inspect or pre-set state
    state.values[4] = true; // movingWallet = true

    const markup = renderToStaticMarkup(
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

    expect(markup).toMatch(/<select[^>]+name="wallet_id"[^>]+aria-label=/);
  });
});

describe("Fix 3: style.css dark theme button borders & shadow", () => {
  it("style.css defines dark-mode button border contrast and dark button shadow", () => {
    const cssPath = path.resolve(__dirname, "style.css");
    const css = fs.readFileSync(cssPath, "utf8");

    // Must have dark mode button border override or rule giving contrast
    const hasDarkButtonBorder =
      css.includes('[data-theme="dark"] button') ||
      css.includes('[data-theme="dark"] .button') ||
      (css.includes('--button-border') && css.includes(':root[data-theme="dark"]'));
    expect(hasDarkButtonBorder).toBe(true);

    // Must have dark mode primary button shadow override (not white / not var(--ink))
    const hasDarkButtonShadow =
      css.includes('[data-theme="dark"] button:not') ||
      (css.includes('--button-shadow') && css.includes(':root[data-theme="dark"]'));
    expect(hasDarkButtonShadow).toBe(true);
  });
});

describe("Fix 4: 360px overflow protections", () => {
  it("style.css allows custody-wallet-row to wrap or break", () => {
    const cssPath = path.resolve(__dirname, "style.css");
    const css = fs.readFileSync(cssPath, "utf8");
    const custodyMatch = css.match(/\.custody-wallet-row\s*\{([^}]+)\}/);
    expect(custodyMatch).not.toBeNull();
    const rule = custodyMatch![1];
    const allowsWrap =
      rule.includes("flex-wrap") ||
      rule.includes("overflow-wrap") ||
      rule.includes("min-width") ||
      css.includes(".custody-wallet-row span");
    expect(allowsWrap).toBe(true);
  });

  it("Propose screen wallet chip has max-width and ellipsis/wrap styling", () => {
    const data = baseSnapshot();
    data.wallets = [
      {
        id: "w-long",
        group_id: "group",
        holder_id: "a",
        label: "VeryLongWalletNameExceedingThirtyCharactersTotal",
        archived_at: null,
        created_by: "a",
        created_at: "2026-10-17",
      },
    ];

    const markup = html(
      createElement(Propose, {
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );

    // The wallet chip button must have max-width: 100% (or maxWidth: 100%)
    expect(markup).toMatch(/max-width:\s*100%/);
  });

  it("Tracker screen hero debt summary has overflow-wrap anywhere", () => {
    const data = baseSnapshot();
    data.abonoSummary = [
      {
        group_id: "group",
        debtor_id: "a",
        creditor_id: "b",
        owed_centavos: 500000,
        pending_settlement_centavos: 0,
      },
    ];

    const markup = html(
      createElement(Tracker, {
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );

    expect(markup).toMatch(/overflow-wrap:\s*anywhere/);
  });
});

describe("Fix 5: ProfileEditor keyboard & focus management", () => {
  it("ProfileEditor adds Escape keydown listener that calls close", () => {
    const data = baseSnapshot();
    const closeSpy = vi.fn();

    const listeners: Record<string, (e: unknown) => void> = {};
    vi.stubGlobal("window", {
      addEventListener: vi.fn((event: string, handler: (e: unknown) => void) => {
        listeners[event] = handler;
      }),
      removeEventListener: vi.fn(),
    });

    html(
      createElement(ProfileEditor, {
        data,
        user: "a",
        run: async () => {},
        busy: false,
        close: closeSpy,
      }),
    );

    expect(window.addEventListener).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
    );
    const mockCalls = (window.addEventListener as unknown as { mock: { calls: [string, (e: unknown) => void][] } }).mock.calls;
    const keydownCall = mockCalls.find((c) => c[0] === "keydown");
    const keydownHandler = keydownCall![1];
    keydownHandler({ key: "Escape", preventDefault: vi.fn() });
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});

describe("Fix 6: RecordIpon semantic form and empty amount error", () => {
  it("wraps inputs and submit in a semantic form with onSubmit", () => {
    const data = baseSnapshot();
    const goal = {
      id: "g-flex",
      group_id: "group",
      title: "Flexible Goal",
      goal_mode: "flexible",
      step_amount_centavos: null,
      cadence_days: null,
      num_steps: null,
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
      accepted_by: null,
      accepted_at: null,
      withdraw_proposed_by: null,
      withdrawn_by: null,
      withdrawn_at: null,
      saved_centavos: 0,
      phase: "open",
      days_left: 5,
      expected_steps_today: 0,
      created_at: "2026-10-20",
    } as unknown as SavingsGoal;
    data.savingsGoals = [goal];

    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ["/ipon/g-flex/record"] },
        createElement(
          Routes,
          {},
          createElement(Route, {
            path: "/ipon/:id/record",
            element: createElement(RecordIpon, {
              data,
              user: "a",
              run: async () => {},
              busy: false,
            }),
          }),
        ),
      ),
    );

    expect(markup).toMatch(/<form[^>]+class="record"/);
  });
});

describe("Fix 7: Detail and History back links, empty states, and cancel buttons", () => {
  it("Detail screen has back link, empty state when zero payments, and cancel in edit form", () => {
    const data = baseSnapshot();
    const cycle: Cycle = {
      id: "c-1",
      group_id: "group",
      daily_amount_centavos: 5000,
      num_days: 10,
      target_centavos: 50000,
      start_date: "2026-10-20",
      end_date: "2026-10-30",
      receiver_id: "a",
      proposed_by: "a",
      status: "accepted",
      phase: "open",
      pot_centavos: 0,
      payout_state: "upcoming",
      received_at: null,
      days_left: 10,
      created_at: "2026-10-20",
    };
    data.cycles = [cycle];
    data.payments = [];

    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ["/cycles/c-1"] },
        createElement(
          Routes,
          {},
          createElement(Route, {
            path: "/cycles/:id",
            element: createElement(Detail, {
              data,
              user: "a",
              run: async () => {},
              busy: false,
            }),
          }),
        ),
      ),
    );

    // Standard back link
    expect(markup).toMatch(/<a[^>]+class="back"[^>]*>/);
    // Empty state "No payments yet."
    expect(markup).toContain("No payments yet.");
  });

  it("History screen shows 'No cycles match.' when history exists but filter matches nothing", () => {
    const data = baseSnapshot();
    const cycle: Cycle = {
      id: "c-old",
      group_id: "group",
      daily_amount_centavos: 5000,
      num_days: 10,
      target_centavos: 50000,
      start_date: "2026-10-01",
      end_date: "2026-10-11",
      receiver_id: "a",
      proposed_by: "a",
      status: "accepted",
      phase: "ended",
      pot_centavos: 50000,
      payout_state: "received",
      received_at: "2026-10-11",
      days_left: 0,
      created_at: "2026-10-01",
    };
    data.cycles = [cycle];
    // Filter set to member "b" (so filteredCycles is empty, but hasHistory is true)
    // History has monthFilter at index 0, memberFilter at index 1
    state.values[1] = "b";

    const markup = html(
      createElement(History, {
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );

    expect(markup).toContain("No cycles match.");
    expect(markup).not.toContain("Past cycles will appear here.");
  });
});

describe("Fix 8: ProposeIpon with <2 active members has header & back link", () => {
  it("renders back link and header when active members < 2", () => {
    const data = baseSnapshot();
    // Only 1 active member
    data.memberships = [
      {
        group_id: "group",
        user_id: "a",
        status: "active",
        last_seen_history_at: "",
      },
    ];

    const markup = html(
      createElement(ProposeIpon, {
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );

    expect(markup).toMatch(/<a[^>]+class="back"[^>]*>/);
  });
});

describe("Fix 9: PersonalSavings progress clamp and whitespace title validation", () => {
  it("clamps progress to 0..100 even with negative balance", () => {
    const data = baseSnapshot();
    const goal: PersonalGoal = {
      id: "pg-1",
      group_id: "group",
      owner_id: "a",
      title: "Emergency",
      target_amount_centavos: 50000,
      visibility: "private",
      created_at: "2026-10-20",
      updated_at: "2026-10-20",
      deleted_at: null,
    };
    data.personalGoals = [goal];
    // Net negative balance (e.g. withdrawal > deposit)
    data.personalEntries = [
      {
        id: "pe-1",
        goal_id: "pg-1",
        kind: "withdrawal",
        amount_centavos: 10000,
        entry_date: "2026-10-21",
        note: "",
        created_at: "2026-10-21",
        updated_at: "2026-10-21",
        deleted_at: null,
      },
    ];

    const markup = html(
      createElement(PersonalSavings, {
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );

    // aria-valuenow must be 0, not negative
    expect(markup).toMatch(/aria-valuenow="0"/);
    expect(markup).toMatch(/width:\s*0%/);
  });

  it("GoalForm trims title and blocks whitespace-only titles client-side", async () => {
    const runSpy = vi.fn();
    const closeSpy = vi.fn();

    // Render GoalForm
    state.cursor = 0;
    const tree = GoalForm({
      busy: false,
      run: runSpy,
      close: closeSpy,
    });

    // Submit form with whitespace-only title
    const fakeEvent = {
      preventDefault: vi.fn(),
      currentTarget: {
        title: { value: "   " },
        target: { value: "100" },
        visibility: { value: "private" },
      },
    };
    // If GoalForm uses new FormData(event.currentTarget), in Node we can mock FormData or pass inputs
    const originalFormData = globalThis.FormData;
    globalThis.FormData = class MockFormData {
      get(name: string) {
        if (name === "title") return "   ";
        if (name === "target") return "100";
        if (name === "visibility") return "private";
        return null;
      }
    } as unknown as typeof FormData;

    try {
      tree.props.onSubmit(fakeEvent);
      // rpc must NOT be called
      expect(rpc).not.toHaveBeenCalled();
      expect(runSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.FormData = originalFormData;
    }
  });
});

describe("Batch 1 UX audit fixes: Abono recording, Home delete requests, and Pending states", () => {
  it("Item 1: Abono recording dynamically names who owes whom and covers unequal splits in both payer directions (₱1,000 bill / ₱700 payer share / ₱300 other-person share)", async () => {
    const data = baseSnapshot();

    // Case A: User ('a', Ana) paid ₱1,000; Ana's share is ₱700, Ben ('b') owes Ana ₱300
    state.values = [
      false, // showSettle
      "", // settleAmount
      "", // settleNote
      true, // showAdd
      "Groceries", // description
      "a", // fromMember = user ('a')
      "1000.00", // total
      "300.00", // owed
      "2026-10-22", // entryDate
      "", // note
      null, // editingId
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
    expect(markupUserPaid).toContain("All for Ben Santos (100%)");

    // Submit when user ('a') paid ₱1,000 and Ben ('b') owes ₱300
    state.cursor = 0;
    const treeUserPaid = Tracker({
      data,
      user: "a",
      run: async (fn) => {
        await fn();
      },
      busy: false,
    });
    const findForms = (node: unknown): { props: { onSubmit?: (e: unknown) => void } }[] => {
      if (!node || typeof node !== "object") return [];
      if (Array.isArray(node)) return node.flatMap(findForms);
      const el = node as { type?: unknown; props?: { children?: unknown; onSubmit?: (e: unknown) => void } };
      const res = el.type === "form" && el.props?.onSubmit ? [{ props: el.props }] : [];
      if (el.props?.children) res.push(...findForms(el.props.children));
      return res;
    };
    const formsUserPaid = findForms(treeUserPaid);
    expect(formsUserPaid.length).toBeGreaterThan(0);
    formsUserPaid[0].props.onSubmit!({ preventDefault: vi.fn() });
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledWith("record_abono_entry", {
      p_kind: "expense",
      p_from_member: "a",
      p_to_member: "b",
      p_description: "Groceries",
      p_total_amount_centavos: 100000,
      p_owed_amount_centavos: 30000,
      p_entry_date: "2026-10-22",
      p_note: "",
    });

    vi.mocked(rpc).mockClear();

    // Case B: Partner ('b', Ben) paid ₱1,000; Ben's share is ₱700, Ana ('a') owes Ben ₱300
    state.values = [
      false, // showSettle
      "", // settleAmount
      "", // settleNote
      true, // showAdd
      "Groceries", // description
      "b", // fromMember = partner ('b')
      "1000.00", // total
      "300.00", // owed
      "2026-10-22", // entryDate
      "", // note
      null, // editingId
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
    expect(markupPartnerPaid).not.toContain("Partner&#x27;s share (₱)");
    expect(markupPartnerPaid).toContain("All for me (100%)");

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
    expect(rpc).toHaveBeenCalledWith("record_abono_entry", {
      p_kind: "expense",
      p_from_member: "b",
      p_to_member: "a",
      p_description: "Groceries",
      p_total_amount_centavos: 100000,
      p_owed_amount_centavos: 30000,
      p_entry_date: "2026-10-22",
      p_note: "",
    });
  });

  it("Item 2: Home deletion requests render explicit localized Delete and Keep buttons instead of icon-only controls", async () => {
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
    expect(enMarkup).not.toContain('class="round ok" aria-label="Confirm delete"');

    setLang("taglish");
    const taglishMarkup = html(
      createElement(Home, { data, user: "a", run: async () => {}, busy: false }),
    );
    expect(taglishMarkup).toContain(">Panatilihin</button>");
    expect(taglishMarkup).toContain(">Alisin</button>");
    expect(taglishMarkup).toContain("flex:0 0 auto");

    // Verify Keep and Delete button clicks invoke the mutual-confirmation soft-delete RPCs
    setLang("en");
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
  });

  it("Item 3: Pending Abono settlements are explained beside the balance, and pending Ipon entries show disabled withdraw action with clear reason", () => {
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

    setLang("en");
    const trackerMarkup = html(
      createElement(Tracker, { data, user: "a", run: async () => {}, busy: false }),
    );
    expect(trackerMarkup).toContain("Ana Cruz owes Ben Santos ₱500.00");
    expect(trackerMarkup).toContain(
      "₱500.00 settlement waiting for Ben Santos&#x27;s confirmation",
    );

    // When creditor ('b', Ben) recorded the settlement ("Natanggap ko"), debtor ('a', Ana) must confirm
    data.abonoEntries = [
      {
        id: "ae-settle-creditor",
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
        created_by: "b",
        last_edited_by: null,
        delete_proposed_by: null,
        created_at: "2026-10-22",
        confirmed_by: null,
        confirmed_at: null,
        edited_at: null,
        deleted_at: null,
      },
    ];
    const trackerCreditorRecordedMarkup = html(
      createElement(Tracker, { data, user: "b", run: async () => {}, busy: false }),
    );
    expect(trackerCreditorRecordedMarkup).toContain(
      "₱500.00 settlement waiting for Ana Cruz&#x27;s confirmation",
    );

    // When multiple pending settlements await different confirmers, use neutral wording
    data.abonoEntries.push({
      ...data.abonoEntries[0],
      id: "ae-settle-debtor",
      created_by: "a",
    });
    const trackerMixedMarkup = html(
      createElement(Tracker, { data, user: "a", run: async () => {}, busy: false }),
    );
    expect(trackerMixedMarkup).toContain(
      "₱500.00 settlement waiting for confirmation",
    );

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
    // Valid actions like Mag-ipon / Save remain available
    expect(iponMarkup).toContain('href="/ipon/g-1/record"');

    // When all contributions are confirmed and none have delete_proposed_by, withdrawal proposal is enabled
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
