import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../data";
import { setLang } from "../i18n";
import CustodyCard from "./CustodyCard";
import IponCard from "./IponCard";
import ProposeIpon from "../screens/ProposeIpon";
import IponDetail from "../screens/IponDetail";
import { buildSettlementPayload } from "../helpers";
import Tracker from "../screens/Tracker";
import Home from "../screens/Home";

vi.mock("../data", async () => {
  const actual = await vi.importActual<typeof import("../data")>("../data");
  return {
    ...actual,
    rpc: vi.fn().mockResolvedValue(undefined),
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
    expect(markup).toContain("₱3,750.00");

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
    expect(markup).toContain("₱500.00");
    expect(markup).toContain("sa ₱1,000.00");
    expect(markup).toContain('aria-valuenow="50"');
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

    // Debt banner shows who owes whom in Taglish
    const debtorMarkup = renderTrackerFor("a");
    expect(debtorMarkup).toContain("May utang si Ana Cruz kay Ben Santos na ₱500.00");
    // Debtor 'a' sees Bayaran (Settle)
    expect(debtorMarkup).toContain("Bayaran (Settle)");
    expect(debtorMarkup).not.toContain("Natanggap ko (Record settlement)");

    // Creditor 'b' sees Natanggap ko (Record settlement)
    const creditorMarkup = renderTrackerFor("b");
    expect(creditorMarkup).toContain("Natanggap ko (Record settlement)");
    expect(creditorMarkup).not.toContain("Bayaran (Settle)");
  });

  it("renders All settled up when there is no active debt", () => {
    setLang("taglish");
    const data = v2Snapshot();
    data.abonoSummary = [];

    const markup = html(
      createElement(Tracker, { data, user: "a", run, busy: false }),
    );
    expect(markup).toContain("Walang utang ang bawat isa ✓");
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
      /\.header-bell\s*\{[^}]*width:\s*44px;\s*height:\s*44px;/s,
    );
    expect(css).toMatch(/\.quiet\s*\{[^}]*min-height:\s*44px;/s);
    expect(css).toMatch(/nav a\s*\{[^}]*min-height:\s*44px;/s);
    expect(css).toMatch(
      /\.celebration-toast\s*\{[^}]*max-width:\s*calc\(100vw - 32px\);/s,
    );
  });
});

describe("Hulog v2 Unified Home Dashboard", () => {
  it("renders CustodyCard and active Ipon goals section with quick Mag-ipon action", () => {
    setLang("taglish");
    const data = v2Snapshot();
    const markup = html(
      createElement(Home, { data, user: "a", run, busy: false }),
    );

    // CustodyCard rendered on Home
    expect(markup).toContain("Nasaan ang pera natin");
    expect(markup).toContain("₱3,750.00");

    // Ipon goals section rendered on Home
    expect(markup).toContain("Ipon goals");
    expect(markup).toContain("Japan Trip");
    expect(markup).toContain("Mag-ipon");
    expect(markup).toContain("Bagong ipon goal");
  });
});
