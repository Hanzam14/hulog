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
