import Money from "./Money";
import { money } from "../helpers";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../data";
import { setLang, t } from "../i18n";
import CustodyCard from "./CustodyCard";
import IponCard from "./IponCard";
import ProposeIpon from "../screens/ProposeIpon";
import IponDetail from "../screens/IponDetail";
import Tracker from "../screens/Tracker";
import Home from "../screens/Home";
import Settings from "../screens/Settings";
import Propose from "../screens/Propose";
import {
  isSoloMode,
  setSoloMode,
  setSoloPotMode,
  loadSoloSnapshot,
  createInitialSoloSnapshot,
  soloRpc,
} from "../solo";
import App from "../App";
import { buildSettlementPayload, isNavigatorOffline } from "../helpers";

vi.mock("./InstallSettings", () => ({
  default: () => null,
  InstallBanner: () => null,
}));
vi.mock("./AppUpdates", () => ({
  default: () => null,
  UpdateBanner: () => null,
}));
import History from "../screens/History";
import Detail from "../screens/Detail";
import { readFileSync } from "node:fs";
import NoGroup from "../screens/NoGroup";

vi.mock("../data", async () => {
  const actual = await vi.importActual<typeof import("../data")>("../data");
  return {
    ...actual,
    rpc: vi.fn().mockResolvedValue(undefined),
    supabase: {
      auth: {
        getSession: vi
          .fn()
          .mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
      },
    },
  };
});

afterEach(() => {
  setLang("taglish");
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const run = async (action: () => Promise<unknown>) => {
  await action();
};

const html = (element: ReactElement) =>
  renderToStaticMarkup(createElement(MemoryRouter, {}, element));

const v2Snapshot = (): Snapshot => ({
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
  today: "2026-10-17",
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
      holder_id: "a",
      label: "Cash Pot",
      archived_at: null,
      created_by: "a",
      created_at: "2026-10-17",
    },
    {
      id: "w3",
      group_id: "group",
      holder_id: "b",
      label: "SeaBank",
      archived_at: null,
      created_by: "b",
      created_at: "2026-10-17",
    },
  ],
  custody: [
    {
      wallet_id: "w1",
      group_id: "group",
      holder_id: "a",
      label: "MariBank",
      archived_at: null,
      holder_active: true,
      paluwagan_centavos: 100000,
      ipon_centavos: 50000,
      total_centavos: 150000,
    },
    {
      wallet_id: "w2",
      group_id: "group",
      holder_id: "a",
      label: "Cash Pot",
      archived_at: null,
      holder_active: true,
      paluwagan_centavos: 0,
      ipon_centavos: 25000,
      total_centavos: 25000,
    },
    {
      wallet_id: "w3",
      group_id: "group",
      holder_id: "b",
      label: "SeaBank",
      archived_at: null,
      holder_active: true,
      paluwagan_centavos: 200000,
      ipon_centavos: 0,
      total_centavos: 200000,
    },
  ],
  savingsGoals: [
    {
      id: "goal-1",
      group_id: "group",
      title: "Japan Trip",
      goal_mode: "matched",
      wallet_id: "w1",
      holder_id: "a",
      wallet_label: "MariBank",
      pending_wallet_id: null,
      wallet_proposed_by: null,
      target_amount_centavos: 100000,
      step_amount_centavos: 5000,
      cadence_days: 1,
      num_steps: 10,
      start_date: "2026-10-17",
      end_date: "2026-10-26",
      proposed_by: "a",
      status: "accepted",
      accepted_by: "b",
      accepted_at: "2026-10-17",
      withdraw_proposed_by: null,
      withdrawn_by: null,
      withdrawn_at: null,
      saved_centavos: 50000,
      phase: "open",
      days_left: 9,
      expected_steps_today: 1,
      created_at: "2026-10-17",
    },
  ],
  savingsContributions: [],
  savingsProgress: [],
  abonoEntries: [],
  abonoSummary: [],
});

describe("Hulog v2 CustodyCard", () => {
  it("renders multiple wallets and holders with totals and breakdown in Taglish", () => {
    setLang("taglish");
    const data = v2Snapshot();
    const markup = html(createElement(CustodyCard, { data }));

    // Header and overall total: 1500 + 250 + 2000 = 3750
    expect(markup).toContain("Nasaan ang pera natin");
    expect(markup).toContain(
      '<span class="money"><span class="money-sign">₱</span><span class="money-whole">3,750</span><span class="sr-only">.</span><span class="money-centavos">00</span></span>',
    );

    // Holder totals: Ana = 1500 + 250 = 1750, Ben = 2000
    expect(markup).toContain("Ana Cruz");
    expect(markup).toContain("₱1,750.00");
    expect(markup).toContain("Ben Santos");
    expect(markup).toContain("₱2,000.00");

    // Wallet labels
    expect(markup).toContain("MariBank");
    expect(markup).toContain("Cash Pot");
    expect(markup).toContain("SeaBank");

    // Breakdown on MariBank in Taglish (Paluwagan and Ipon)
    expect(markup).toContain("Paluwagan: ₱1,000.00");
    expect(markup).toContain("Ipon: ₱500.00");
  });

  it("renders breakdown in English when set to en", () => {
    setLang("en");
    const data = v2Snapshot();
    const markup = html(createElement(CustodyCard, { data }));

    expect(markup).toContain("Where our money is");
    expect(markup).toContain("Shared pot: ₱1,000.00");
    expect(markup).toContain("Savings: ₱500.00");
  });

  it("returns null when no wallets or custody items exist", () => {
    const emptyData = {
      ...v2Snapshot(),
      wallets: [],
      custody: [],
    };
    expect(CustodyCard({ data: emptyData })).toBeNull();
  });
});

describe("Hulog v2 IponCard & ProposeIpon", () => {
  it("renders IponCard with title, saved amount, target, and progress bar", () => {
    setLang("taglish");
    const data = v2Snapshot();
    const goal = data.savingsGoals![0];
    const markup = html(createElement(IponCard, { g: goal, data }));

    expect(markup).toContain("Japan Trip");
    expect(markup).toContain(
      '<span class="money"><span class="money-sign">₱</span><span class="money-whole">500</span><span class="sr-only">.</span><span class="money-centavos">00</span></span>',
    );
    expect(markup).toContain("sa ₱1,000.00");
    expect(markup).toContain('aria-valuenow="50"');
    expect(markup).toContain("50%");
    expect(markup).toContain("On track");

    const behindGoal = { ...goal, expected_steps_today: 8 };
    const behindMarkup = html(createElement(IponCard, { g: behindGoal, data }));
    expect(behindMarkup).toContain("Nahuhuli");
  });

  it("renders ProposeIpon with mode choices, title input, and options", () => {
    setLang("taglish");
    const data = v2Snapshot();
    const markup = html(
      createElement(ProposeIpon, { data, user: "a", run, busy: false }),
    );

    expect(markup).toContain("Ipanukala ang ipon goal");
    expect(markup).toContain("Sabay na hulog (Matched)");
    expect(markup).toContain("Flexible na ipon");
    expect(markup).toContain("Pangalan ng goal");
  });
});

describe("Hulog v2 IponDetail", () => {
  it("shows Cancel proposal to proposer and Accept/Decline to partner", () => {
    setLang("taglish");
    const data = v2Snapshot();
    data.savingsGoals![0].status = "proposed";
    data.savingsGoals![0].proposed_by = "a";

    const renderDetailFor = (user: string) =>
      renderToStaticMarkup(
        createElement(
          MemoryRouter,
          { initialEntries: ["/ipon/goal-1"] },
          createElement(
            Routes,
            {},
            createElement(Route, {
              path: "/ipon/:id",
              element: createElement(IponDetail, {
                data,
                user,
                run,
                busy: false,
              }),
            }),
          ),
        ),
      );

    // Proposer 'a' sees Cancel
    const proposerMarkup = renderDetailFor("a");
    expect(proposerMarkup).toContain("Cancel proposal");
    expect(proposerMarkup).not.toContain("Accept");

    // Partner 'b' sees Accept and Decline
    const partnerMarkup = renderDetailFor("b");
    expect(partnerMarkup).toContain("Accept");
    expect(partnerMarkup).toContain("Decline");
  });

  it("handles contribution confirmation and two-step delete proposal", () => {
    setLang("taglish");
    const data = v2Snapshot();
    data.savingsContributions = [
      {
        id: "contrib-1",
        goal_id: "goal-1",
        member_id: "a",
        steps: 1,
        amount_centavos: 5000,
        note: "Initial contribution",
        status: "pending",
        was_confirmed: false,
        created_by: "a",
        last_edited_by: null,
        delete_proposed_by: null,
        created_at: "2026-10-17",
        confirmed_by: null,
        confirmed_at: null,
        edited_at: null,
        deleted_at: null,
      },
      {
        id: "contrib-2",
        goal_id: "goal-1",
        member_id: "a",
        steps: 1,
        amount_centavos: 5000,
        note: "Confirmed contribution with delete requested",
        status: "confirmed",
        was_confirmed: true,
        created_by: "a",
        last_edited_by: null,
        delete_proposed_by: "a",
        created_at: "2026-10-17",
        confirmed_by: "b",
        confirmed_at: "2026-10-17",
        edited_at: null,
        deleted_at: null,
      },
    ];

    const renderDetailFor = (user: string) =>
      renderToStaticMarkup(
        createElement(
          MemoryRouter,
          { initialEntries: ["/ipon/goal-1"] },
          createElement(
            Routes,
            {},
            createElement(Route, {
              path: "/ipon/:id",
              element: createElement(IponDetail, {
                data,
                user,
                run,
                busy: false,
              }),
            }),
          ),
        ),
      );

    // Partner 'b' can confirm pending contrib-1 and confirm delete on contrib-2
    const partnerMarkup = renderDetailFor("b");
    expect(partnerMarkup).toContain("Confirm");
    expect(partnerMarkup).toContain("Kumpirmahing alisin");

    // Proposer 'a' cannot confirm own pending contrib-1 and sees Cancel delete for contrib-2
    const proposerMarkup = renderDetailFor("a");
    expect(proposerMarkup).toContain("Kanselahin ang pag-alis");
    expect(proposerMarkup).not.toContain("Kumpirmahing alisin");

    // In English mode
    setLang("en");
    const enPartnerMarkup = renderDetailFor("b");
    expect(enPartnerMarkup).toContain("Confirm");
    expect(enPartnerMarkup).toContain("Confirm delete");
    const enProposerMarkup = renderDetailFor("a");
    expect(enProposerMarkup).toContain("Cancel delete");
    expect(enProposerMarkup).not.toContain("Confirm delete");
  });
});

describe("Hulog v2 Tracker", () => {
  it("renders net Abono balance banner with Bayaran (Settle) for debtor and Natanggap ko for creditor", () => {
    setLang("taglish");
    const data = v2Snapshot();
    data.abonoSummary = [
      {
        group_id: "group",
        debtor_id: "a",
        creditor_id: "b",
        owed_centavos: 50000,
        pending_settlement_centavos: 0,
      },
    ];

    const renderTrackerFor = (user: string) =>
      renderToStaticMarkup(
        createElement(
          MemoryRouter,
          { initialEntries: ["/tracker"] },
          createElement(
            Routes,
            {},
            createElement(Route, {
              path: "/tracker",
              element: createElement(Tracker, {
                data,
                user,
                run,
                busy: false,
              }),
            }),
          ),
        ),
      );

    // Debt banner shows who owes whom in Taglish with distinct member tones
    const debtorMarkup = renderTrackerFor("a");
    expect(debtorMarkup.replace(/<[^>]+>/g, "")).toContain(
      "May utang si Ana Cruz kay Ben Santos na ₱500.00",
    );
    expect(debtorMarkup).toContain(
      '<span class="member-name pink">Ana Cruz</span>',
    );
    expect(debtorMarkup).toContain(
      '<span class="member-name blue">Ben Santos</span>',
    );
    // Debtor 'a' sees Bayaran (Settle)
    expect(debtorMarkup).toContain("Magbayad");
    expect(debtorMarkup).not.toContain("→");
    expect(debtorMarkup).not.toContain("Natanggap ko ang bayad");

    // Creditor 'b' sees Natanggap ko (Record settlement)
    const creditorMarkup = renderTrackerFor("b");
    expect(creditorMarkup).toContain("Natanggap ko ang bayad");
    expect(creditorMarkup).not.toContain("Magbayad");
  });

  it("renders All settled up when there is no active debt", () => {
    setLang("taglish");
    const data = v2Snapshot();
    data.abonoSummary = [];

    const markup = html(
      createElement(Tracker, { data, user: "a", run, busy: false }),
    );
    expect(markup).toContain("Walang utang ang bawat isa");
    expect(markup).not.toContain("✓");
  });

  it("renders 50/50 split shared expense details", () => {
    setLang("taglish");
    const data = v2Snapshot();
    data.abonoEntries = [
      {
        id: "abono-1",
        group_id: "group",
        kind: "expense",
        from_member: "a",
        to_member: "b",
        description: "Dinner & Drinks",
        total_amount_centavos: 200000,
        owed_amount_centavos: 100000,
        entry_date: "2026-10-17",
        note: "Half-half split",
        status: "confirmed",
        was_confirmed: true,
        created_by: "a",
        last_edited_by: null,
        delete_proposed_by: null,
        created_at: "2026-10-17",
        confirmed_by: "b",
        confirmed_at: "2026-10-17",
        edited_at: null,
        deleted_at: null,
      },
    ];

    const markup = html(
      createElement(Tracker, { data, user: "a", run, busy: false }),
    );
    expect(markup).toContain("Dinner &amp; Drinks");
    expect(markup).toContain("May utang na ₱1,000.00 sa ₱2,000.00");
    expect(markup).toContain("Half-half split");
  });

  it("sends canonical Settlement description when language is tl or taglish and displays stored Settlement row translated in each language", () => {
    for (const lang of ["tl", "taglish", "en"] as const) {
      setLang(lang);
      const payload = buildSettlementPayload({
        debtorId: "a",
        creditorId: "b",
        amountCentavos: 50000,
        entryDate: "2026-10-17",
        note: " GCash ",
      });
      expect(payload.p_description).toBe("Settlement");
      expect(payload.p_note).toBe("GCash");
    }

    const data = v2Snapshot();
    data.abonoEntries = [
      {
        id: "settle-1",
        group_id: "group",
        kind: "settlement",
        from_member: "a",
        to_member: "b",
        description: "Settlement",
        total_amount_centavos: 50000,
        owed_amount_centavos: 50000,
        entry_date: "2026-10-17",
        note: "Paid via GCash",
        status: "confirmed",
        was_confirmed: true,
        created_by: "a",
        last_edited_by: null,
        delete_proposed_by: null,
        created_at: "2026-10-17",
        confirmed_by: "b",
        confirmed_at: "2026-10-17",
        edited_at: null,
        deleted_at: null,
      },
    ];

    setLang("en");
    const enMarkup = html(
      createElement(Tracker, { data, user: "a", run, busy: false }),
    );
    expect(enMarkup).toContain("<strong>Settlement</strong>");

    setLang("tl");
    const tlMarkup = html(
      createElement(Tracker, { data, user: "a", run, busy: false }),
    );
    expect(tlMarkup).toContain("<strong>Bayad</strong>");

    setLang("taglish");
    const taglishMarkup = html(
      createElement(Tracker, { data, user: "a", run, busy: false }),
    );
    expect(taglishMarkup).toContain("<strong>Bayad</strong>");
  });

  it("enforces 44px minimum tap targets and mobile wrapping rules in style.css", async () => {
    const fs = await import("node:fs");
    const css = fs.readFileSync("src/style.css", "utf8");
    expect(css).toMatch(/\.back\s*\{[^}]*width:\s*44px;\s*height:\s*44px;/s);
    expect(css).toMatch(
      /\.header-bell\s*\{[^}]*min-width:\s*44px;\s*height:\s*44px;/s,
    );
    expect(css).toMatch(/\.quiet\s*\{[^}]*min-height:\s*44px;/s);
    expect(css).toMatch(/nav a\s*\{[^}]*min-height:\s*44px;/s);
    expect(css).toMatch(
      /\.celebration-toast\s*\{[^}]*max-width:\s*calc\(100% - 32px\);/s,
    );
  });
});

describe("Hulog v2 Unified Home Dashboard", () => {
  it("shows a withdrawn savings goal's status once, inside its History card", () => {
    setLang("en");
    const data = v2Snapshot();
    const goal = data.savingsGoals![0];
    goal.withdrawn_at = "2026-10-24";
    goal.phase = "withdrawn";

    const markup = html(
      createElement(History, { data, user: "a", run, busy: false }),
    );
    expect(markup).toContain("<small>Withdrawn</small>");
    expect(markup).not.toContain('<span class="chip">withdrawn</span>');
  });

  it("renders the Ipon section with quick Mag-ipon action and keeps custody/mode controls off Home", () => {
    setLang("taglish");
    const data = v2Snapshot();
    const markup = html(
      createElement(Home, { data, user: "a", run, busy: false }),
    );

    // CustodyCard moved to Group
    expect(markup).not.toContain("Nasaan ang pera natin");

    // Ipon section rendered on Home
    expect(markup).toContain("Ipon");
    expect(markup).toContain("Japan Trip");
    expect(markup).toContain("Mag-ipon");
    expect(markup).toContain("Bagong ipon goal");
    expect(markup).not.toContain("Para sa akin");
    expect(markup).not.toContain("Kasama si ");
  });

  it("renders friendly empty states and next-step actions across History, Tracker, Home/IponDetail, and NoGroup", () => {
    setLang("en");
    const data = v2Snapshot();
    data.cycles = [];
    data.savingsGoals = [];
    data.savingsContributions = [];
    data.abonoEntries = [];

    const historyMarkup = html(
      createElement(History, { data, user: "a", run, busy: false }),
    );
    expect(historyMarkup).toContain("Past rounds will appear here.");
    // Empty History shows only the empty-state line: no filters, totals or CTA.
    expect(historyMarkup).not.toContain('href="/propose"');
    expect(historyMarkup).not.toContain("Print summary");
    expect(historyMarkup).not.toContain("history-filters");

    const trackerMarkup = html(
      createElement(Tracker, { data, user: "a", run, busy: false }),
    );
    expect(trackerMarkup).not.toContain(
      "No shared expenses yet. Log a bill or abono above.",
    );
    expect(trackerMarkup).toContain("Add shared expense");
    expect(trackerMarkup).not.toContain("+ Add shared expense");

    const homeMarkup = html(
      createElement(Home, { data, user: "a", run, busy: false }),
    );
    expect(homeMarkup).toContain('class="secondary new-savings-goal"');
    expect(homeMarkup).toContain("New savings goal");
    expect(homeMarkup).not.toContain('href="/ipon/new"');

    const noGroupMarkup = html(createElement(NoGroup, { run, busy: false }));
    expect(noGroupMarkup).toContain(
      "Start a shared pot or paste an invite link from your partner.",
    );
    expect(noGroupMarkup).toContain("Create group");

    const dataWithGoal = v2Snapshot();
    dataWithGoal.savingsContributions = [];
    const iponDetailMarkup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ["/ipon/goal-1"] },
        createElement(
          Routes,
          {},
          createElement(Route, {
            path: "/ipon/:id",
            element: createElement(IponDetail, {
              data: dataWithGoal,
              user: "a",
              run,
              busy: false,
            }),
          }),
        ),
      ),
    );
    expect(iponDetailMarkup).toContain(
      "No contributions yet. Start saving toward this goal.",
    );
    expect(iponDetailMarkup).toContain('href="/ipon/goal-1/record"');
  });
});

describe("Hulog v2 Loading Skeleton & Offline Banner", () => {
  it("renders placeholder skeleton blocks and aria-busy while initial session loads", () => {
    vi.stubGlobal("navigator", { onLine: true });
    setLang("en");
    const markup = html(createElement(App));
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Loading…");
    expect(markup).toContain('class="skeleton skeleton-card"');
    expect(markup).not.toContain("offline-banner");
  });

  it("detects navigator offline state and renders translated offline banner", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isNavigatorOffline()).toBe(true);

    setLang("en");
    const enMarkup = html(createElement(App));
    expect(enMarkup).toContain("offline-banner");
    expect(enMarkup).toContain(
      "You&#x27;re offline. Changes won&#x27;t save until you&#x27;re back online.",
    );

    setLang("tl");
    expect(
      t("You're offline. Changes won't save until you're back online."),
    ).toBe(
      "Wala kang internet ngayon. Hindi mase-save ang mga pagbabago hangga't wala ka pang internet.",
    );

    setLang("taglish");
    expect(
      t("You're offline. Changes won't save until you're back online."),
    ).toBe(
      "Offline ka ngayon. Hindi mase-save ang changes hangga't offline ka.",
    );

    vi.stubGlobal("navigator", { onLine: true });
    expect(isNavigatorOffline()).toBe(false);
  });
});

describe("Hulog Solo Mode", () => {
  it("keeps hosted flexible solo goals free of partner tallies while retaining partner controls", () => {
    setLang("en");
    const data = v2Snapshot();
    const goal = data.savingsGoals![0];
    Object.assign(goal, {
      title: "[Solo] AI subscription",
      goal_mode: "flexible",
      step_amount_centavos: null,
      cadence_days: null,
      num_steps: null,
      expected_steps_today: 0,
    });
    data.savingsProgress = ["a", "b"].map((member_id) => ({
      goal_id: goal.id,
      member_id,
      expected_centavos: goal.target_amount_centavos,
      confirmed_centavos: 0,
      pending_centavos: 0,
      confirmed_steps: 0,
      pending_steps: 0,
    }));
    const card = html(createElement(IponCard, { g: goal, data, user: "b" }));
    expect(card).toContain("₱0, Observing");
    expect(card).not.toContain('class="tally');
    const detail = (user: string) =>
      renderToStaticMarkup(
        createElement(
          MemoryRouter,
          { initialEntries: ["/ipon/goal-1"] },
          createElement(
            Routes,
            {},
            createElement(Route, {
              path: "/ipon/:id",
              element: createElement(IponDetail, {
                data,
                user,
                run,
                busy: false,
              }),
            }),
          ),
        ),
      );
    goal.status = "proposed";
    expect(detail("b")).toContain('aria-label="Accept"');
    expect(detail("b")).toContain('aria-label="Decline"');
    expect(detail("a")).toContain('aria-label="Cancel proposal"');
    goal.status = "accepted";
    data.savingsContributions = [
      {
        id: "pending-solo",
        goal_id: goal.id,
        member_id: "a",
        steps: null,
        amount_centavos: 10000,
        note: "",
        status: "pending",
        was_confirmed: false,
        created_by: "a",
        last_edited_by: null,
        delete_proposed_by: null,
        created_at: data.today,
        confirmed_by: null,
        confirmed_at: null,
        edited_at: null,
        deleted_at: null,
      },
    ];
    expect(detail("b")).toContain(">Confirm</button>");
    expect(detail("a")).not.toContain(">Confirm</button>");
    expect(detail("b")).not.toContain('class="tally');
  });
  it("enables and disables solo mode in localStorage", () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });

    expect(isSoloMode()).toBe(false);
    setSoloMode(true);
    expect(isSoloMode()).toBe(true);
    setSoloMode(false);
    expect(isSoloMode()).toBe(false);
  });

  it("loads a default partnered pot demo snapshot with partner and pre-seeded solo AI goal", async () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });

    const snapshot = await loadSoloSnapshot();
    expect(snapshot.groups.length).toBe(1);
    // Partnered pot includes You and partner Maya
    expect(snapshot.memberships.length).toBe(2);
    expect(snapshot.profiles.some((p) => p.id === "partner-user")).toBe(true);
    expect(snapshot.wallets?.length).toBe(2);
    expect(snapshot.custody?.length).toBe(2);

    // Pre-seeded shared cycle
    expect(snapshot.cycles.length).toBe(2);
    expect(snapshot.cycles[0].target_centavos).toBe(150000);
    expect(snapshot.cycles[0].pot_centavos).toBe(30000);
    expect(snapshot.cycles[1]).toMatchObject({
      id: "demo-completed-held-cycle",
      phase: "ended",
      payout_state: "Waiting for Got it",
      held_centavos: 150000,
    });

    // Pre-seeded active Solo Ipon Goal: [Solo] AI Subscription (₱600 / ₱1,200)
    const soloGoal = snapshot.personalGoals?.find(
      (g) => g.title === "AI Subscription",
    );
    expect(soloGoal).toBeDefined();
    expect(soloGoal?.target_amount_centavos).toBe(120000);
    expect(
      snapshot.personalEntries
        ?.filter((e) => e.goal_id === soloGoal?.id && !e.deleted_at)
        .reduce(
          (sum, e) =>
            sum +
            (e.kind === "deposit" ? e.amount_centavos : -e.amount_centavos),
          0,
        ),
    ).toBe(60000);
    expect(soloGoal?.visibility).toBe("shared");
  });

  it("records, caps, voids, and preserves solo demo pot withdrawals", async () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });
    const before = await loadSoloSnapshot();
    const oldCycle = before.cycles.find(
      (c) => c.id === "demo-completed-held-cycle",
    )!;
    const currentCycle = before.cycles.find(
      (c) => c.id === "demo-shared-cycle",
    )!;
    await expect(
      soloRpc("record_payout_withdrawal", {
        p_cycle_id: oldCycle.id,
        p_amount_centavos: 100,
        p_withdrawal_date: "2000-01-01",
      }),
    ).rejects.toThrow("Withdrawal date cannot be before the cycle start date");
    const withdrawalId = await soloRpc("record_payout_withdrawal", {
      p_cycle_id: oldCycle.id,
      p_amount_centavos: 25000,
      p_withdrawal_date: before.today,
      p_note: "cash for her",
    });
    const after = await loadSoloSnapshot();
    expect(
      after.payoutWithdrawals?.find((entry) => entry.id === withdrawalId),
    ).toMatchObject({
      amount_centavos: 25000,
      note: "cash for her",
    });
    expect(after.cycles.find((c) => c.id === oldCycle.id)).toMatchObject({
      pot_centavos: 150000,
      withdrawn_centavos: 25000,
      held_centavos: 125000,
      payout_state: "Waiting for Got it",
    });
    expect(
      after.cycles.find((c) => c.id === currentCycle.id)?.pot_centavos,
    ).toBe(30000);
    expect(
      after.custody?.find((row) => row.wallet_id === oldCycle.wallet_id)
        ?.paluwagan_centavos,
    ).toBe(155000);
    await expect(
      soloRpc("record_payout_withdrawal", {
        p_cycle_id: oldCycle.id,
        p_amount_centavos: 125001,
      }),
    ).rejects.toThrow("Withdrawal exceeds the remaining held amount");
    await soloRpc("void_payout_withdrawal", { p_id: withdrawalId });
    expect(
      (await loadSoloSnapshot()).cycles.find((c) => c.id === oldCycle.id)
        ?.held_centavos,
    ).toBe(150000);
    const fullWithdrawalId = await soloRpc("record_payout_withdrawal", {
      p_cycle_id: oldCycle.id,
      p_amount_centavos: 150000,
    });
    const fullyWithdrawn = await loadSoloSnapshot();
    expect(
      fullyWithdrawn.custody?.find(
        (row) => row.wallet_id === oldCycle.wallet_id,
      )?.paluwagan_centavos,
    ).toBe(30000);
    await soloRpc("void_payout_withdrawal", { p_id: fullWithdrawalId });
    const restored = await loadSoloSnapshot();
    expect(
      restored.custody?.find((row) => row.wallet_id === oldCycle.wallet_id)
        ?.paluwagan_centavos,
    ).toBe(180000);
    const beforeReceiptId = await soloRpc("record_payout_withdrawal", {
      p_cycle_id: oldCycle.id,
      p_amount_centavos: 1000,
    });
    await soloRpc("receive_payout", { p_id: oldCycle.id });
    expect(
      (await loadSoloSnapshot()).cycles.find((c) => c.id === oldCycle.id),
    ).toMatchObject({ payout_state: "Received", held_centavos: 0 });
    await expect(
      soloRpc("void_payout_withdrawal", { p_id: beforeReceiptId }),
    ).rejects.toThrow(
      "Withdrawal cannot be corrected after the remaining payout is acknowledged",
    );
    await expect(
      soloRpc("record_payout_withdrawal", {
        p_cycle_id: currentCycle.id,
        p_amount_centavos: 100,
      }),
    ).rejects.toThrow(
      "Only an unreceived completed cycle can record a withdrawal",
    );
  });

  it("can switch to standalone solo mode with 1 member", async () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });

    setSoloPotMode("standalone");
    const snapshot = await loadSoloSnapshot();
    expect(snapshot.memberships.length).toBe(1);
    expect(snapshot.memberships[0].status).toBe("active");
    expect(snapshot.wallets?.length).toBe(1);
  });

  it("proposes cycle and auto-confirms with 1x solo pool when is_solo", async () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });

    const cycleId = await soloRpc("propose_cycle", {
      p_daily_amount_centavos: 5000,
      p_num_days: 15,
      p_start_date: "2026-10-21",
      p_is_solo: true,
    });

    const snapshot = await loadSoloSnapshot();
    const cycle = snapshot.cycles.find((c) => c.id === cycleId);
    expect(cycle).toBeDefined();
    expect(cycle?.status).toBe("accepted");
    // 1x pool: 5000 * 15 * 1 = 75000 centavos
    expect(cycle?.target_centavos).toBe(75000);
    expect(cycle?.receiver_id).toBe("solo-user");

    const paymentId = await soloRpc("record_payment", {
      p_cycle_id: cycleId,
      p_days: 2,
      p_note: "solo test",
    });

    const afterPayment = await loadSoloSnapshot();
    const payment = afterPayment.payments.find((p) => p.id === paymentId);
    expect(payment?.status).toBe("confirmed");
    expect(payment?.was_confirmed).toBe(true);
    expect(payment?.amount_centavos).toBe(10000);
    expect(cycle?.pot_centavos).toBeDefined();
  });

  it("records personal goals, deposits and withdrawals without partner confirmation", async () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });
    const goalId = await soloRpc("create_personal_goal", {
      p_title: "Personal Goal",
      p_target_amount_centavos: 100000,
    });
    const goal = (await loadSoloSnapshot()).personalGoals?.find(
      (g) => g.id === goalId,
    );
    expect(goal).toMatchObject({
      title: "Personal Goal",
      visibility: "private",
      owner_id: "solo-user",
      target_amount_centavos: 100000,
    });
    const depositId = await soloRpc("record_personal_entry", {
      p_goal_id: goalId,
      p_kind: "deposit",
      p_amount_centavos: 10000,
      p_note: "first deposit",
    });
    const deposit = (await loadSoloSnapshot()).personalEntries?.find(
      (e) => e.id === depositId,
    );
    expect(deposit).toMatchObject({
      kind: "deposit",
      amount_centavos: 10000,
      note: "first deposit",
      deleted_at: null,
    });
    const withdrawalId = await soloRpc("record_personal_entry", {
      p_goal_id: goalId,
      p_kind: "withdrawal",
      p_amount_centavos: 2000,
    });
    const saved = await loadSoloSnapshot();
    expect(
      saved.personalEntries?.find((e) => e.id === withdrawalId),
    ).toMatchObject({ kind: "withdrawal", amount_centavos: 2000 });
    expect(
      saved.personalHistory?.filter((h) => h.goal_id === goalId),
    ).toHaveLength(3);
    expect(
      saved.personalEntries
        ?.filter((e) => e.goal_id === goalId)
        .reduce(
          (sum, e) =>
            sum +
            (e.kind === "deposit" ? e.amount_centavos : -e.amount_centavos),
          0,
        ),
    ).toBe(8000);
  });

  it("previews one payer for local standalone rounds and two for partnered rounds", () => {
    vi.stubGlobal("localStorage", { getItem: () => "true" });
    setLang("en");
    const soloData = v2Snapshot();
    soloData.memberships = [soloData.memberships[0]]; // 1 active member
    const soloMarkup = html(
      createElement(Propose, { data: soloData, user: "a", run, busy: false }),
    );
    // 50 pesos * 15 days * 1 = ₱750.00
    expect(soloMarkup).toContain("₱750.00");

    const duoData = v2Snapshot(); // 2 active members
    const duoMarkup = html(
      createElement(Propose, { data: duoData, user: "a", run, busy: false }),
    );
    // 50 pesos * 15 days * 2 = ₱1,500.00
    expect(duoMarkup).toContain("₱1,500.00");
  });

  it("renders solo mode empty state on Home and the exit button in Group when solo", () => {
    const store: Record<string, string> = { "hulog-solo-mode": "true" };
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });

    setLang("en");
    const soloData = v2Snapshot();
    soloData.memberships = [soloData.memberships[0]];
    soloData.cycles = []; // No cycle
    const markup = html(
      createElement(Home, { data: soloData, user: "a", run, busy: false }),
    );

    // Solo empty state without partner-waiting blocker
    expect(markup).toContain("Start a round to begin tracking your savings.");
    expect(markup).not.toContain("Invite your partner from the group tab");
    expect(markup).not.toContain("Exit solo mode");
    expect(markup).not.toContain("Switch to solo mode");
    const group = html(
      createElement(Settings, { data: soloData, user: "a", run, busy: false }),
    );
    expect(group).toContain("Exit solo mode");
  });
  it("moves the Together/Solo toggle and custody card from Home to Group", () => {
    const store: Record<string, string> = { "hulog-solo-mode": "true" };
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });
    setLang("en");
    const data = v2Snapshot();
    const home = html(
      createElement(Home, { data, user: "a", run, busy: false }),
    );
    expect(home).not.toContain("Together");
    expect(home).not.toContain("Pot mode");
    expect(home).not.toContain("Where is our money");
    expect(home).not.toContain("custody-ledger");
    const group = html(
      createElement(Settings, { data, user: "a", run, busy: false }),
    );
    expect(group).toContain("Pot mode");
    expect(group).toContain("Together");
    expect(group).toContain("custody-ledger");
    expect(group).toContain(
      '<span class="money"><span class="money-sign">₱</span><span class="money-whole">3,750</span><span class="sr-only">.</span><span class="money-centavos">00</span></span>',
    );
  });
});

describe("UI simplification layout regressions", () => {
  it.each(["en", "taglish", "tl"] as const)(
    "lets History filters wrap and keeps printing after every list in %s",
    (lang) => {
      setLang(lang);
      const data = v2Snapshot();
      data.savingsGoals![0].withdrawn_at = "2026-10-17";
      data.savingsGoals![0].phase = "withdrawn";
      const markup = html(
        createElement(History, { data, user: "a", run, busy: false }),
      );
      const filters = markup.match(
        /<div class="history-filters no-print">([\s\S]*?)<\/div>/,
      )?.[1];
      expect(filters).toBeDefined();
      expect(filters!.match(/<select /g)).toHaveLength(2);
      expect(filters).toContain(`aria-label="${t("Month")}"`);
      expect(filters).toContain(`aria-label="${t("Member")}"`);
      expect(filters).not.toContain("<label");
      expect(markup).not.toContain('<section class="history-filters');
      expect(
        markup.slice(0, markup.indexOf('class="history-filters')),
      ).not.toContain(t("Print summary"));
      expect(markup).toMatch(
        /<button type="button" class="secondary no-print">[^<]+<\/button>$/,
      );
      const css = readFileSync("src/style.css", "utf8");
      expect(css).toMatch(
        /\.history-filters \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 190px\), 1fr\)\)/,
      );
      expect(css).toMatch(/\.history-filters select \{[^}]*min-height: 44px/);
      expect(css).not.toContain(".history-filters .row > label");
    },
  );

  it.each(["en", "taglish", "tl"] as const)(
    "renders wallets once with balances and owner actions in the first money card in %s",
    (lang) => {
      setLang(lang);
      const data = v2Snapshot();
      const markup = html(
        createElement(Settings, { data, user: "a", run, busy: false }),
      );
      expect(markup).not.toContain("wallets-section");
      const card = markup.match(
        /<section class="custody-ledger">([\s\S]*?)<\/section>/,
      )?.[1];
      expect(card).toBeDefined();
      expect(card).toContain(
        '<span class="money"><span class="money-sign">₱</span><span class="money-whole">3,750</span><span class="sr-only">.</span><span class="money-centavos">00</span></span>',
      );
      for (const wallet of data.wallets!) {
        expect(card!.split(`>${wallet.label}<`)).toHaveLength(2);
        expect(markup.split(`>${wallet.label}<`)).toHaveLength(2);
      }
      expect(card!.match(/class="holder-header row"/g)).toHaveLength(2);
      const walletRows = [
        ...card!.matchAll(/<div class="custody-wallet-row">([\s\S]*?)<\/li>/g),
      ];
      expect(walletRows).toHaveLength(3);
      expect(walletRows[0][1]).toContain("₱1,500.00");
      expect(walletRows[0][1]).toContain(`aria-label="${t("Rename wallet")}"`);
      expect(walletRows[0][1]).toContain(`aria-label="${t("Archive wallet")}"`);
      expect(walletRows[2][1]).not.toContain(
        `aria-label="${t("Rename wallet")}"`,
      );
      expect(card).toContain('<details class="wallet-add">');
      expect(card!.indexOf('class="wallet-add"')).toBeGreaterThan(
        card!.lastIndexOf('class="custody-wallet-row"'),
      );
    },
  );

  it("keeps the Settings profile trigger with compact avatars and adjacent names", () => {
    setLang("en");
    const markup = html(
      createElement(Settings, {
        data: v2Snapshot(),
        user: "a",
        run,
        busy: false,
      }),
    );
    const duo = markup.match(
      /<div class="duo">([\s\S]*?)<\/figure><\/div>/,
    )?.[1];
    expect(duo).toBeDefined();
    expect(duo!.match(/class="avatar (?:pink|blue) md"/g)).toHaveLength(2);
    expect(duo).not.toContain(' lg"');
    expect(duo).toContain('class="avatar-edit"');
    expect(duo).toContain("<figcaption>Ana Cruz</figcaption>");
    expect(duo).toContain("<figcaption>Ben Santos</figcaption>");
    const css = readFileSync("src/style.css", "utf8");
    expect(css).toMatch(
      /\.duo \.avatar.md \{[^}]*width: 48px;[^}]*height: 48px/,
    );
    expect(css).toMatch(/\.duo figure \{[^}]*display: flex/);
  });

  it("places the transfer select and button inside closed details after the round calendar", () => {
    setLang("en");
    const data = v2Snapshot();
    // Reuse an accepted round from the solo fixture, retaining the multi-wallet group.
    const cycle = createInitialSoloSnapshot("a").cycles[0];
    data.cycles = [
      {
        ...cycle,
        id: "round",
        wallet_id: "w1",
        holder_id: "a",
        receiver_id: "a",
        payout_state: null,
        phase: "open",
      },
    ];
    data.today = cycle.start_date;
    data.progress = [
      {
        cycle_id: "round",
        member_id: "a",
        expected_centavos: 75000,
        confirmed_days: 0,
        pending_days: 0,
        pending_count: 0,
        debt_centavos: 0,
      },
    ];
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ["/cycles/round"] },
        createElement(
          Routes,
          {},
          createElement(Route, {
            path: "/cycles/:id",
            element: createElement(Detail, {
              data,
              user: "a",
              run,
              busy: false,
            }),
          }),
        ),
      ),
    );
    const transfer = markup.match(
      /<details class="cycle-wallet-control">([\s\S]*?)<\/details>/,
    )?.[1];
    expect(transfer).toBeDefined();
    expect(transfer).toContain("<summary>Move pot to another wallet</summary>");
    expect(transfer).toContain(
      '<select aria-label="Move pot to another wallet" name="wallet_id"',
    );
    expect(transfer!.match(/<button /g)).toHaveLength(1);
    expect(transfer).not.toContain("<label");
    expect(markup).toContain('class="round-cal ');
    expect(markup.indexOf('class="cycle-wallet-control"')).toBeGreaterThan(
      markup.indexOf('class="round-cal '),
    );
  });
});

describe("hero money", () => {
  it.each([0, 30000, 123456789, -12345])(
    "preserves formatted text for %s centavos",
    (amount) => {
      const value = money(amount);
      const markup = renderToStaticMarkup(createElement(Money, { value }));
      expect(markup.replace(/<[^>]+>/g, "")).toBe(value);
      expect(markup).toMatch(/<span class="money-sign">[^<]*₱<\/span>/);
      expect(markup).toMatch(/<span class="money-whole">[\d,]+<\/span>/);
      expect(markup).toMatch(/<span class="sr-only">\.<\/span><span class="money-centavos">\d{2}<\/span>/);
    },
  );
});
