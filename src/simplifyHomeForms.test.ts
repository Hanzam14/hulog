import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "./data";
import { setLang } from "./i18n";
import Home from "./screens/Home";
import Record from "./screens/Record";
import RecordIpon from "./screens/RecordIpon";
import Tracker from "./screens/Tracker";
import { PersonalGoalCard } from "./components/PersonalSavings";
import { NO_SPLIT } from "./split";

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

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
  setLang("taglish");
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const html = (element: ReactElement, initialEntries = ["/"]) => {
  state.cursor = 0;
  return renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries }, element),
  );
};

function makeSnapshot(): Snapshot {
  return {
    profiles: [
      {
        id: "a",
        display_name: "Ana Cruz",
        nickname: "Ana",
        email: "ana@example.com",
        avatar_url: null,
        avatar_kind: "initial",
        avatar_emoji: null,
        color: "pink",
      },
      {
        id: "b",
        display_name: "Ben Santos",
        nickname: "Ben",
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
    cycles: [
      {
        id: "cycle-1",
        group_id: "group",
        daily_amount_centavos: 10000,
        num_days: 15,
        start_date: "2026-10-20",
        end_date: "2026-11-03",
        receiver_id: "b",
        proposed_by: "a",
        status: "accepted",
        phase: "open",
        pot_centavos: 100000,
        target_centavos: 300000,
        payout_state: null,
        received_at: null,
        days_left: 3,
        created_at: "2026-10-20",
        wallet_id: "w1",
        holder_id: "a",
        wallet_label: "MariBank",
      },
    ],
    payments: [],
    repayments: [],
    progress: [
      {
        cycle_id: "cycle-1",
        member_id: "a",
        expected_centavos: 150000,
        confirmed_days: 5,
        pending_days: 0,
        pending_count: 0,
        debt_centavos: 0,
      },
      {
        cycle_id: "cycle-1",
        member_id: "b",
        expected_centavos: 150000,
        confirmed_days: 5,
        pending_days: 0,
        pending_count: 0,
        debt_centavos: 0,
      },
    ],
    changes: [],
    invites: [],
    today: "2026-10-25",
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
    ],
    custody: [],
    savingsGoals: [
      {
        id: "goal-flex",
        group_id: "group",
        title: "Baguio Weekend",
        goal_mode: "flexible",
        wallet_id: "w1",
        holder_id: "a",
        wallet_label: "MariBank",
        pending_wallet_id: null,
        wallet_proposed_by: null,
        target_amount_centavos: 400000,
        step_amount_centavos: null,
        cadence_days: null,
        num_steps: null,
        start_date: "2026-10-15",
        end_date: "2026-12-24",
        proposed_by: "a",
        status: "accepted",
        accepted_by: "b",
        accepted_at: "2026-10-15",
        withdraw_proposed_by: null,
        withdrawn_by: null,
        withdrawn_at: null,
        saved_centavos: 60000,
        phase: "open",
        days_left: 60,
        expected_steps_today: 0,
        created_at: "2026-10-15",
      },
    ],
    savingsContributions: [],
    savingsProgress: [],
    abonoEntries: [],
    abonoSummary: [],
    personalGoals: [
      {
        id: "pg-1",
        group_id: "group",
        owner_id: "a",
        title: "Emergency Fund",
        target_amount_centavos: 500000,
        visibility: "private",
        created_at: "2026-10-01",
        updated_at: "2026-10-01",
        deleted_at: null,
      },
    ],
    personalEntries: [
      {
        id: "pe-1",
        goal_id: "pg-1",
        kind: "deposit",
        amount_centavos: 100000,
        entry_date: "2026-10-05",
        note: "Start",
        created_at: "2026-10-05",
        updated_at: "2026-10-05",
        deleted_at: null,
      },
      {
        id: "pe-2",
        goal_id: "pg-1",
        kind: "deposit",
        amount_centavos: 150000,
        entry_date: "2026-10-15",
        note: "Second",
        created_at: "2026-10-15",
        updated_at: "2026-10-15",
        deleted_at: null,
      },
    ],
    personalHistory: [],
    wishlistItems: [],
  };
}

describe("Simplify Home and Recording Forms (Batch 1)", () => {
  it("Home clearly surfaces today's action and summarizes long confirmation lists without hiding urgent or blocked items", () => {
    const data = makeSnapshot();
    // Add 3 regular pending payments + 1 urgent deletion request + 1 blocked unconfirmed ended-cycle payment
    data.cycles.push({
      ...data.cycles[0],
      id: "cycle-ended",
      phase: "ended",
      days_left: 0,
    });
    data.payments = [
      {
        id: "pay-reg-1",
        cycle_id: "cycle-1",
        member_id: "b",
        days: 1,
        amount_centavos: 10000,
        note: "Reg 1",
        status: "pending",
        was_confirmed: false,
        created_at: "2026-10-21",
        deleted_at: null,
      },
      {
        id: "pay-reg-2",
        cycle_id: "cycle-1",
        member_id: "b",
        days: 1,
        amount_centavos: 10000,
        note: "Reg 2",
        status: "pending",
        was_confirmed: false,
        created_at: "2026-10-22",
        deleted_at: null,
      },
      {
        id: "pay-reg-3",
        cycle_id: "cycle-1",
        member_id: "b",
        days: 1,
        amount_centavos: 10000,
        note: "Reg 3",
        status: "pending",
        was_confirmed: false,
        created_at: "2026-10-23",
        deleted_at: null,
      },
      {
        id: "pay-blocked",
        cycle_id: "cycle-ended",
        member_id: "b",
        days: 1,
        amount_centavos: 10000,
        note: "Late blocked",
        status: "pending",
        was_confirmed: false,
        created_at: "2026-10-24",
        deleted_at: null,
      },
    ];
    data.abonoEntries = [
      {
        id: "ae-urgent-delete",
        group_id: "group",
        kind: "expense",
        from_member: "b",
        to_member: "a",
        description: "Urgent Delete Bill",
        total_amount_centavos: 40000,
        owed_amount_centavos: 20000,
        entry_date: "2026-10-24",
        note: "",
        status: "confirmed",
        was_confirmed: true,
        created_by: "b",
        last_edited_by: null,
        delete_proposed_by: "b",
        created_at: "2026-10-24",
        confirmed_by: "a",
        confirmed_at: "2026-10-24",
        edited_at: null,
        deleted_at: null,
      },
    ];

    setLang("en");
    const markup = html(
      createElement(Home, { data, user: "a", run: async () => {}, busy: false }),
    );

    // 1. Shows today's action header/card
    expect(markup).toContain("Today&#x27;s action");
    // 2. Urgent deletion request and blocked payment are OUTSIDE any closed <details>
    const beforeMoreDetails = markup.split("<details")[0];
    expect(beforeMoreDetails).toContain("Urgent Delete Bill");
    expect(beforeMoreDetails).toContain("not counted");
    // 3. Long confirmation list summarizes overflow items behind an expandable <details> summary
    expect(markup).toMatch(/Show \d+ more waiting/);
    // 4. Personal savings chart is tucked inside Savings records details, not expanded on the main card face
    const cardBeforeDetails = markup.split("<details")[0];
    expect(cardBeforeDetails).not.toContain('class="growth-chart"');

    // 5. When a closed round's receiver holds its wallet (payout_state === "Received" without received_at),
    // Home shows "Start a new round when ready" instead of prompting to confirm receipt when no button exists
    data.cycles[0] = {
      ...data.cycles[0],
      phase: "ended",
      payout_state: "Received",
      received_at: null,
      receiver_id: "a",
      holder_id: "a",
    };
    const closedSelfHeldMarkup = html(
      createElement(Home, { data, user: "a", run: async () => {}, busy: false }),
    );
    expect(closedSelfHeldMarkup).toContain("Start a new round when ready");
    expect(closedSelfHeldMarkup).not.toContain("Confirm payout receipt below");

    // 6. When a round has both confirmed and pending days, the logged count includes pending days
    data.cycles[0] = {
      ...data.cycles[0],
      phase: "open",
      payout_state: null,
    };
    data.progress[0] = {
      ...data.progress[0],
      confirmed_days: 5,
      pending_days: 2,
      pending_count: 1,
    };
    const pendingDaysMarkup = html(
      createElement(Home, { data, user: "a", run: async () => {}, busy: false }),
    );
    expect(pendingDaysMarkup).toContain("7 of 15 days logged · 2 pending");
  });

  it("Record (/hulog) tucks optional note and payment ref behind a collapsible option, preserves values, and reveals validation errors", () => {
    const data = makeSnapshot();
    // State for Record: 0: days, 1: note, 2: proofRef, 3: detailsOpen, 4: formError
    state.values = [2, "Saved note", "bad", false, null];

    setLang("en");
    const collapsedMarkup = html(
      createElement(Record, {
        data,
        user: "a",
        run: async (fn) => {
          await fn();
        },
        busy: false,
      }),
      ["/hulog"],
    );

    // Exact amount shown before saving (2 days * ₱100 = ₱200.00)
    expect(collapsedMarkup).toContain("₱200.00");
    // Optional fields are inside a <details> with descriptive summary, and value is preserved even when closed
    expect(collapsedMarkup).toContain("Add note or payment ref (optional)");
    expect(collapsedMarkup).toContain('value="Saved note"');
    expect(collapsedMarkup).toContain('value="bad"');

    // Trigger submit with invalid proofRef ("bad") while details is closed
    state.cursor = 0;
    const tree = Record({
      data,
      user: "a",
      run: async (fn) => {
        await fn();
      },
      busy: false,
    });
    const findBigButton = (
      node: unknown,
    ): { props: { onClick?: () => void } } | null => {
      if (!node || typeof node !== "object") return null;
      if (Array.isArray(node)) {
        for (const item of node) {
          const found = findBigButton(item);
          if (found) return found;
        }
        return null;
      }
      const el = node as {
        type?: unknown;
        props?: { className?: string; onClick?: () => void; children?: unknown };
      };
      if (el.type === "button" && el.props?.className === "big") {
        return { props: el.props };
      }
      return findBigButton(el.props?.children);
    };
    const submitBtn = findBigButton(tree);
    expect(submitBtn).not.toBeNull();
    submitBtn!.props.onClick!();

    // Re-render after validation error: details must be open and error revealed!
    const errorMarkup = html(
      createElement(Record, {
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
      ["/hulog"],
    );
    expect(errorMarkup).toMatch(/<details[^>]*open/);
    expect(errorMarkup).toContain(
      "Reference must be 4 to 40 letters, numbers, spaces or dashes",
    );
  });

  it("RecordIpon (/ipon/:id/record) shows exact peso preview before saving in flexible mode and tucks optional note", () => {
    const data = makeSnapshot();
    setLang("en");
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ["/ipon/goal-flex/record"] },
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

    // Shows formatted exact amount before saving (default 500 -> ₱500.00)
    expect(markup).toContain("₱500.00");
    // Tucks optional note inside <details>
    expect(markup).toContain("Add note or payment ref (optional)");
  });

  it("Tracker expense form shows exact pre-save split summary, tucks optional date/note/ref, and reveals validation errors", () => {
    const data = makeSnapshot();
    // Preserve exact state.values order 0..13 for batch1Ux compatibility:
    state.values = [
      false, // 0: showSettle
      "", // 1: settleAmount
      "", // 2: settleNote
      "", // 3: settleRef
      true, // 4: showAdd
      "Meralco", // 5: description
      "a", // 6: fromMember = 'a' (Ana)
      "1000.00", // 7: total
      "300.00", // 8: owed
      NO_SPLIT, // 9: split
      "2026-10-25", // 10: entryDate
      "Oct bill", // 11: note
      "bad", // 12: proofRef (invalid 3-char ref)
      null, // 13: editingId
    ];

    setLang("en");
    const markup = html(
      createElement(Tracker, {
        data,
        user: "a",
        run: async (fn) => {
          await fn();
        },
        busy: false,
      }),
      ["/tracker"],
    );

    // Pre-save split summary shows Total, payer's share (₱700.00), and who owes whom (₱300.00)
    expect(markup).toContain("₱1,000.00");
    expect(markup).toContain("₱700.00");
    expect(markup).toContain("₱300.00");
    // Optional date, note, and payment ref are tucked inside <details> without required date attribute and preserve entered values
    expect(markup).toContain("Date, note &amp; payment ref (optional)");
    expect(markup).toContain('value="Oct bill"');
    expect(markup).toContain('value="bad"');
    expect(markup).not.toMatch(/type="date"[^>]*required/);
    expect(markup).not.toMatch(/type="date"[^>]*max=/);
    expect(markup).not.toMatch(/class="split-preview"[^>]*role="status"/);

    // Submit with invalid proofRef ("bad") reveals error and opens details
    state.cursor = 0;
    const tree = Tracker({
      data,
      user: "a",
      run: async (fn) => {
        await fn();
      },
      busy: false,
    });
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
    const forms = findForms(tree);
    expect(forms.length).toBeGreaterThan(0);
    forms[0].props.onSubmit!({ preventDefault: vi.fn() });

    const afterErrorMarkup = html(
      createElement(Tracker, {
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
      ["/tracker"],
    );
    expect(afterErrorMarkup).toMatch(/<details[^>]*open/);
    expect(afterErrorMarkup).toContain(
      "Reference must be 4 to 40 letters, numbers, spaces or dashes",
    );

    // Also verify invalid custom split percent shows percentage-specific error
    state.values[12] = ""; // valid empty proofRef
    state.values[9] = { choice: "custom", percent: "150" }; // invalid > 100%
    state.cursor = 0;
    const treeCustomErr = Tracker({
      data,
      user: "a",
      run: async (fn) => {
        await fn();
      },
      busy: false,
    });
    const formsCustomErr = findForms(treeCustomErr);
    formsCustomErr[0].props.onSubmit!({ preventDefault: vi.fn() });

    const percentErrorMarkup = html(
      createElement(Tracker, {
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
      ["/tracker"],
    );
    expect(percentErrorMarkup).toContain(
      "Enter a valid percentage (0 to 100).",
    );

    // Verify partner-paid preview shows current user (Ana) owing partner (Ben)
    state.values[6] = "b"; // fromMember = 'b' (Ben paid)
    state.values[9] = NO_SPLIT;
    const partnerPaidMarkup = html(
      createElement(Tracker, {
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
      ["/tracker"],
    );
    expect(partnerPaidMarkup).toContain("Ana owes Ben: ₱300.00");
  });

  it("PersonalSavings EntryForm tucks optional date and note inside details while showing exact amount", () => {
    const data = makeSnapshot();
    const goal = data.personalGoals![0];
    // PersonalGoalCard state: 0: editingGoal, 1: recording, 2: editingEntry
    state.values = [false, "deposit", null];

    setLang("en");
    const markup = html(
      createElement(PersonalGoalCard, {
        goal,
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );

    expect(markup).toContain("Details (optional)");
    expect(markup).toContain('name="date"');
    expect(markup).toContain('name="note"');
    expect(markup).not.toMatch(/type="date"[^>]*max=/);
  });
});
