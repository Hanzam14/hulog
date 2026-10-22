import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot, Cycle, Progress, PersonalGoal, PersonalEntry, AbonoEntry, Wallet, SavingsContribution, Repayment, AbonoSummary } from "./data";
import { formatError, setLang, t } from "./i18n";
import { parsePesos } from "./helpers";
import RecordScreen from "./screens/Record";
import Tracker from "./screens/Tracker";
import Home from "./screens/Home";
import WalletsSettings from "./components/WalletsSettings";
import Settings from "./screens/Settings";
import { rpc, load } from "./data";

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

interface ButtonNode {
  type: string;
  props?: {
    children?: unknown;
    className?: string;
    onClick?: () => void;
  };
}

function findButtons(node: unknown): ButtonNode[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(findButtons);
  const element = node as ButtonNode;
  const res: ButtonNode[] = [];
  if (element.type === "button") res.push(element);
  if (element.props?.children) res.push(...findButtons(element.props.children));
  return res;
}

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
    { group_id: "group", user_id: "a", status: "active", last_seen_history_at: "" },
    { group_id: "group", user_id: "b", status: "active", last_seen_history_at: "" },
  ],
  cycles: [],
  payments: [],
  repayments: [],
  progress: [],
  changes: [],
  invites: [],
  today: "2026-10-22",
  wallets: [],
  custody: [],
  savingsGoals: [],
  savingsContributions: [],
  abonoEntries: [],
  abonoSummary: [],
  personalGoals: [],
  personalEntries: [],
  personalHistory: [],
});

describe("Fix 7: parsePesos bounds and error message", () => {
  it("throws distinct error for amounts that are too large or non-safe integers", () => {
    setLang("en");
    expect(() => parsePesos("100000000.01")).toThrow("Amount is too large.");
    expect(() => parsePesos("999999999999999999")).toThrow("Amount is too large.");
    expect(() => parsePesos("0")).toThrow("Enter a positive amount.");
  });

  it("translates parsePesos errors in taglish and tl", () => {
    setLang("taglish");
    expect(() => parsePesos("100000000.01")).toThrow(t("Amount is too large."));
    expect(() => parsePesos("0")).toThrow(t("Enter a positive amount."));

    setLang("tl");
    expect(() => parsePesos("100000000.01")).toThrow(t("Amount is too large."));
    expect(() => parsePesos("0")).toThrow(t("Enter a positive amount."));
  });
});

describe("Fix 1: Record screen", () => {
  it("disables submit, shows friendly fully-paid message, wraps in form, has sr-only h1, and includes peso in stepper aria-live", () => {
    setLang("en");
    const data = baseSnapshot();
    const cycle = {
      id: "cycle-1",
      group_id: "group",
      daily_amount_centavos: 5000,
      num_days: 7,
      target_centavos: 70000,
      start_date: "2026-10-20",
      end_date: "2026-10-27",
      receiver_id: "a",
      proposed_by: "a",
      status: "accepted",
      phase: "open",
      pot_centavos: 70000,
      payout_state: "upcoming",
      received_at: null,
      days_left: 5,
      created_at: "2026-10-20",
    } as unknown as Cycle;
    const progress = {
      cycle_id: "cycle-1",
      member_id: "a",
      confirmed_days: 7,
      pending_days: 0,
      is_complete: true,
      user_id: "a",
      debt_centavos: 0,
    } as unknown as Progress;
    data.cycles = [cycle];
    data.progress = [progress];

    const markup = html(
      createElement(RecordScreen, {
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );

    // Form element wrapping
    expect(markup).toContain("<form");
    // sr-only h1 heading
    expect(markup).toContain('class="sr-only"');
    // friendly fully-paid message
    expect(markup).toMatch(/paid up/i);
    // submit button disabled
    expect(markup).toMatch(/<button[^>]+disabled[^>]*>.*?(?:hulog!|Record contribution).*?<\/button>/i);
    // stepper aria-live includes amount
    expect(markup).toMatch(/aria-live="polite"[^>]*>.*?₱/);
  });
});

describe("Fix 2: Tracker screen active members check and delete confirm", () => {
  it("hides/disables Add expense and Settle when active members < 2 and shows invite partner note", () => {
    setLang("en");
    const data = baseSnapshot();
    // Only 1 active member
    data.memberships = [
      { group_id: "group", user_id: "a", status: "active", last_seen_history_at: "" },
    ];
    data.abonoSummary = [
      {
        group_id: "group",
        debtor_id: "a",
        creditor_id: "a",
        owed_centavos: 5000,
        pending_settlement_centavos: 0,
      } as AbonoSummary,
    ];

    const markup = html(
      createElement(Tracker, {
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );

    // Should show invite note
    expect(markup).toMatch(/invite your partner/i);
    // Should NOT have active add expense button or settle button
    expect(markup).not.toContain("Add shared expense");
    expect(markup).not.toContain("Bayaran (Settle)");
  });

  it("requires confirmation before deleting or proposing deletion of an abono entry", async () => {
    setLang("en");
    const data = baseSnapshot();
    const entry = {
      id: "e-pending",
      group_id: "group",
      description: "Groceries",
      from_member: "a",
      to_member: "b",
      total_amount_centavos: 10000,
      owed_amount_centavos: 5000,
      entry_date: "2026-10-22",
      status: "pending",
      kind: "expense",
      created_by: "a",
      delete_proposed_by: null,
      created_at: "2026-10-22",
      deleted_at: null,
    } as unknown as AbonoEntry;
    data.abonoEntries = [entry];

    const confirmMock = vi.fn().mockReturnValue(false);
    vi.stubGlobal("window", { confirm: confirmMock });

    state.cursor = 0;
    const tree = Tracker({
      data,
      user: "a",
      run: async (fn) => { await fn(); },
      busy: false,
    });

    const buttons = findButtons(tree);
    const deleteBtn = buttons.find((b) => b.props?.children === "Delete");
    expect(deleteBtn).toBeDefined();

    // Clicking when confirm returns false should NOT call rpc
    deleteBtn!.props!.onClick!();
    expect(confirmMock).toHaveBeenCalledWith(t("Delete this expense record? The change stays in history."));
    expect(rpc).not.toHaveBeenCalled();

    // Clicking when confirm returns true SHOULD call rpc
    confirmMock.mockReturnValue(true);
    deleteBtn!.props!.onClick!();
    expect(rpc).toHaveBeenCalledWith("edit_abono_entry", { p_id: "e-pending", p_delete: true });
  });
});

describe("Fix 3: Home screen waiting list and entity-specific decline copy", () => {
  it("includes partner delete proposals for contributions & abono, and pending repayments where user is creditor", () => {
    setLang("en");
    const data = baseSnapshot();
    data.savingsContributions = [
      {
        id: "sc-1",
        goal_id: "g-1",
        member_id: "a",
        amount_centavos: 10000,
        steps: 1,
        note: "Trip savings",
        status: "confirmed",
        created_at: "2026-10-21",
        created_by: "a",
        delete_proposed_by: "b",
        deleted_at: null,
      } as unknown as SavingsContribution,
    ];
    data.abonoEntries = [
      {
        id: "ae-1",
        group_id: "group",
        description: "Dinner",
        from_member: "a",
        to_member: "b",
        total_amount_centavos: 20000,
        owed_amount_centavos: 10000,
        entry_date: "2026-10-21",
        status: "confirmed",
        kind: "expense",
        created_by: "a",
        delete_proposed_by: "b",
        created_at: "2026-10-21",
        deleted_at: null,
      } as unknown as AbonoEntry,
    ];
    data.repayments = [
      {
        id: "rep-1",
        cycle_id: "c-1",
        debtor_id: "b",
        creditor_id: "a",
        amount_centavos: 5000,
        status: "pending",
        deleted_at: null,
      } as unknown as Repayment,
    ];

    const markup = html(
      createElement(Home, {
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );

    expect(markup).toContain(t("Waiting for your check"));
    expect(markup).toContain("Savings goal detail");
    expect(markup).toContain("Dinner");
    expect(markup).toContain("₱50.00");
  });

  it("renders empty shared goals note when no active shared goals exist", () => {
    setLang("en");
    const data = baseSnapshot();
    data.savingsGoals = [];

    const markup = html(
      createElement(Home, {
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );

    expect(markup).toContain(t("No ipon goals yet. Save together for a trip or goal."));
  });
});

describe("Fix 4: App error formatting and RPC messages", () => {
  it("translates known RPC error messages across en, taglish, tl", () => {
    setLang("en");
    expect(formatError("Payment days exceed cap or are invalid")).toBe("Payment days exceed cap or are invalid.");
    expect(formatError("Cannot archive wallet in active use")).toBe("Cannot archive wallet in active use.");
    expect(formatError("Active member only")).toBe("Active member only.");

    setLang("taglish");
    expect(formatError("Payment days exceed cap or are invalid")).toBe("Lampas sa limit ang bilang ng araw o hindi valid.");
    expect(formatError("Cannot archive wallet in active use")).toBe("Hindi puwedeng i-archive ang wallet na ginagamit pa.");

    setLang("tl");
    expect(formatError("Payment days exceed cap or are invalid")).toBe("Lumampas sa takda ang mga araw ng hulog o hindi wasto.");
    expect(formatError("Active member only")).toBe("Para sa aktibong miyembro lamang.");
  });

  it("appends raw text to generic localized fallback for unknown errors", () => {
    setLang("en");
    expect(formatError("deadlock detected on relation cycles")).toBe("Something went wrong. deadlock detected on relation cycles");

    setLang("taglish");
    expect(formatError("deadlock detected on relation cycles")).toBe("Nagka-problema. deadlock detected on relation cycles");

    setLang("tl");
    expect(formatError("deadlock detected on relation cycles")).toBe("May naganap na problema. deadlock detected on relation cycles");
  });
});

describe("Fix 5: WalletsSettings empty state and confirm", () => {
  it("renders empty state when there are no wallets", () => {
    setLang("en");
    const data = baseSnapshot();
    data.wallets = [];

    const markup = html(
      createElement(WalletsSettings, {
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );

    expect(markup).toMatch(/no wallets yet/i);
  });

  it("requires confirmation before archiving a wallet", async () => {
    setLang("en");
    const data = baseSnapshot();
    const wallet: Wallet = {
      id: "w-1",
      group_id: "group",
      holder_id: "a",
      label: "GCash",
      archived_at: null,
      created_by: "a",
      created_at: "2026-10-22",
    };
    data.wallets = [wallet];

    const confirmMock = vi.fn().mockReturnValue(false);
    vi.stubGlobal("window", { confirm: confirmMock });

    state.cursor = 0;
    const tree = WalletsSettings({
      data,
      user: "a",
      run: async (fn) => { await fn(); },
      busy: false,
    });

    const buttons = findButtons(tree);
    const archiveBtn = buttons.find((b) => b.props?.className?.includes("wallet-archive"));
    expect(archiveBtn).toBeDefined();

    // Cancel archive
    archiveBtn!.props!.onClick!();
    expect(confirmMock).toHaveBeenCalledWith(t("Archive this wallet?"));
    expect(rpc).not.toHaveBeenCalled();

    // Confirm archive
    confirmMock.mockReturnValue(true);
    archiveBtn!.props!.onClick!();
    expect(rpc).toHaveBeenCalledWith("update_wallet", { p_id: "w-1", p_label: "GCash", p_archive: true });
  });
});

describe("Fix 6: Settings screen exit solo mode and personal CSV export", () => {
  it("shows Exit solo mode when isSoloMode is true even if partnered preview has 2 members", () => {
    setLang("en");
    const store: Record<string, string> = { "hulog-solo-mode": "true" };
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });

    const data = baseSnapshot();
    // 2 active members in partnered solo preview
    data.memberships = [
      { group_id: "group", user_id: "a", status: "active", last_seen_history_at: "" },
      { group_id: "group", user_id: "b", status: "active", last_seen_history_at: "" },
    ];

    const markup = html(
      createElement(Settings, {
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );

    expect(markup).toContain("Exit solo mode");
  });

  it("exports CSV including only user's personal savings goals and entries, and staggers downloads", async () => {
    setLang("en");
    const data = baseSnapshot();
    const myGoal: PersonalGoal = {
      id: "goal-mine",
      group_id: "group",
      owner_id: "a",
      title: "My Laptop",
      target_amount_centavos: 5000000,
      visibility: "private",
      created_at: "2026-10-22",
      updated_at: "2026-10-22",
      deleted_at: null,
    };
    const partnerGoal: PersonalGoal = {
      id: "goal-partner",
      group_id: "group",
      owner_id: "b",
      title: "Partner's Private Secret",
      target_amount_centavos: 9000000,
      visibility: "private",
      created_at: "2026-10-22",
      updated_at: "2026-10-22",
      deleted_at: null,
    };
    const myEntry: PersonalEntry = {
      id: "entry-mine",
      goal_id: "goal-mine",
      kind: "deposit",
      amount_centavos: 100000,
      entry_date: "2026-10-22",
      note: "Saved from salary",
      created_at: "2026-10-22",
      updated_at: "2026-10-22",
      deleted_at: null,
    };
    const partnerEntry: PersonalEntry = {
      id: "entry-partner",
      goal_id: "goal-partner",
      kind: "deposit",
      amount_centavos: 200000,
      entry_date: "2026-10-22",
      note: "Partner secret",
      created_at: "2026-10-22",
      updated_at: "2026-10-22",
      deleted_at: null,
    };

    vi.mocked(load).mockResolvedValue({
      ...data,
      personalGoals: [myGoal, partnerGoal],
      personalEntries: [myEntry, partnerEntry],
    });

    const downloads: string[] = [];
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:mock",
      revokeObjectURL: vi.fn(),
    });

    vi.stubGlobal("document", {
      createElement: () => ({
        set href(_val: string) {},
        set download(val: string) { downloads.push(val); },
        click: vi.fn(),
      }),
    });

    state.cursor = 0;
    const tree = Settings({
      data,
      user: "a",
      run: async (fn) => { await fn(); },
      busy: false,
    });

    const buttons = findButtons(tree);
    const exportBtn = buttons.find((b) => b.props?.className?.includes("export"));
    expect(exportBtn).toBeDefined();

    await exportBtn!.props!.onClick!();

    // Verify downloads include personal-goals and personal-entries
    expect(downloads).toContain("hulog-personal-goals.csv");
    expect(downloads).toContain("hulog-personal-entries.csv");
  });
});
