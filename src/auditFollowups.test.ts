import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Snapshot } from "./data";
import { setLang, strings } from "./i18n";
import NoGroup from "./screens/NoGroup";
import Home from "./screens/Home";
import Propose from "./screens/Propose";
import Settings from "./screens/Settings";
import PersonalSavings from "./components/PersonalSavings";
vi.mock("./components/InstallSettings", () => ({ default: () => null }));
vi.mock("./components/AppUpdates", () => ({ default: () => null }));
const mode = vi.hoisted(() => ({ solo: false }));
vi.mock("./solo", async () => ({
  ...(await vi.importActual<typeof import("./solo")>("./solo")),
  isSoloMode: () => mode.solo,
}));
const run = async (action: () => Promise<unknown>) => {
  await action();
};
const html = (el: ReactElement) =>
  renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: ["/join/x"] }, el),
  );
const props = () => {
  const data = snapshot();
  data.cycles = [];
  data.progress = [];
  data.memberships = data.memberships.slice(0, 1);
  return { data, user: "a", busy: false, run };
};
beforeEach(() => {
  setLang("en");
  mode.solo = false;
});
afterEach(() => {
  setLang("taglish");
  vi.clearAllMocks();
});
const snapshot = (): Snapshot => ({
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
it("NoGroup has exactly one Create group button and a visible form heading", () => {
  const out = html(createElement(NoGroup, { run, busy: false, user: "a" }));
  expect(out.match(/<button[^>]*>Create group<\/button>/g)).toHaveLength(1);
  expect(out).toContain("<h2>Create group</h2>");
});
it.each(["pending", "denied", "removed", "unknown"])(
  "Waiting handles %s without group data",
  async (status) => {
    const { default: Waiting } = await import("./screens/Waiting");
    const out = html(
      createElement(Waiting, {
        status,
        run,
        busy: false,
        user: "a",
        onSignOut: vi.fn(),
      }),
    );
    if (status === "pending") {
      expect(out).toContain("<ol>");
      for (const step of [
        "Request sent ✓",
        "Your partner approves you",
        "Then you&#x27;re in!",
      ])
        expect(out).toContain(step);
      expect(out).toContain("Refresh status");
    } else {
      expect(out).toContain("Go solo on this device");
      expect(out).not.toContain("Your partner approves you");
      expect(out).toContain("Sign out");
      if (status === "denied") expect(out).toContain("Request denied");
      else {
        expect(out).toContain("You&#x27;re no longer in this group");
        expect(out).not.toContain("Request denied");
      }
    }
    expect(out).not.toContain("Pair");
    expect(out).not.toContain("Ana");
  },
);
it("Home invites the missing online partner instead of proposing", () => {
  const out = html(createElement(Home, props()));
  expect(out).toMatch(/href="\/settings"[^>]*>Invite your partner<\/a>/);
  expect(out).not.toContain('href="/propose"');
  expect(out).not.toContain("A round needs two people."); // existing empty copy already explains it
});
it("Home still offers solo rounds", () => {
  mode.solo = true;
  expect(html(createElement(Home, props()))).toContain('href="/propose"');
});
it("Home preserves an existing partnerless proposal", () => {
  const p = props();
  const cycle: Snapshot["cycles"][number] = {
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
  };
  cycle.status = "proposed";
  p.data.cycles = [cycle];
  const out = html(createElement(Home, p));
  expect(out).toContain("Cancel proposal");
  expect(out).not.toContain(">Invite your partner</a>");
});
it("Propose guards an online partnerless group", () => {
  const out = html(createElement(Propose, props()));
  expect(out).toContain("A round needs two people.");
  expect(out).toContain('href="/settings"');
  expect(out).not.toContain("<form");
});
it("Propose preserves the solo form", () => {
  mode.solo = true;
  expect(html(createElement(Propose, props()))).toContain("<form");
});
it("solo invite entry explains exit and wires App route", async () => {
  mode.solo = true;
  const { ActiveInvite } = await import("./components/InviteEntry");
  const out = html(
    createElement(ActiveInvite, { busy: false, onExitSolo: vi.fn() }),
  );
  expect(out).toContain("To use this invite, leave solo and sign in.");
  expect(out).toContain("Exit solo mode");
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  expect(app).toMatch(/path="\/join\/:token"[\s\S]*?<ActiveInvite/);
  expect(app).toContain("onExitSolo={() => void signOut()}");
});
it("online invite entry keeps existing group message", async () => {
  const { ActiveInvite } = await import("./components/InviteEntry");
  expect(
    html(createElement(ActiveInvite, { busy: false, onExitSolo: vi.fn() })),
  ).toContain("You already have a group.");
});
it("welcome invite path hides solo and keeps sign-in message", async () => {
  const { WelcomeActions } = await import("./components/InviteEntry");
  const out = html(
    createElement(WelcomeActions, {
      busy: false,
      onSignIn: vi.fn(),
      onSolo: vi.fn(),
    }),
  );
  expect(out).toContain("Continue with Google");
  expect(out).toContain("Your invite will be here after sign-in.");
  expect(out).not.toContain("Go solo on this device");
});
it("solo Settings hides invite creation, groups headings, and discloses solo controls", () => {
  mode.solo = true;
  const out = html(createElement(Settings, props()));
  expect(out).not.toMatch(
    /<button[^>]*>[\s\S]*?class="tabler-icon tabler-icon-qrcode/,
  );
  expect(out).not.toContain(">invite</button>");
  expect(out).toContain("To invite a partner, leave solo and sign in.");
  const headings = [
    ...out.matchAll(/<h2 class="section-label settings-title">(.*?)<\/h2>/g),
  ].map((m) => m[1]);
  expect(headings).toEqual(["Group", "Money", "App", "More"]);
  expect(out).toContain("<summary>Solo mode</summary>");
});
it("pending request precedes Group heading", () => {
  const p = props();
  p.data.memberships.push({
    ...p.data.memberships[0],
    user_id: "b",
    status: "pending",
  });
  const out = html(createElement(Settings, p));
  expect(out.indexOf('aria-label="Let Ben')).toBeGreaterThan(-1);
  expect(out.indexOf('aria-label="Let Ben')).toBeLessThan(
    out.indexOf(">Group</h2>"),
  );
});
it("solo personal savings labels the section once", () => {
  mode.solo = true;
  const out = html(createElement(PersonalSavings, props()));
  expect(out.split("Saved on this device only. Not synced.")).toHaveLength(2);
  expect(out).toContain("tabler-icon-device-mobile");
});
it("online personal savings has no local label", () => {
  expect(html(createElement(PersonalSavings, props()))).not.toContain(
    "Saved on this device only. Not synced.",
  );
});
it("all new copy exists in three languages", () => {
  const keys = [
    "Request sent ✓",
    "Your partner approves you",
    "Then you're in!",
    "You're no longer in this group",
    "Invite your partner",
    "A round needs two people.",
    "This screen updates automatically.",
    "The owner did not approve your request. Ask them directly.",
    "Want to join another group? Ask the owner to remove your membership first.",
    "Solo data stays on this device.",
    "Money",
    "Solo mode",
    "Saved on this device only. Not synced.",
    "To invite a partner, leave solo and sign in.",
    "You're in solo mode on this device. To use this invite, leave solo and sign in.",
  ];
  for (const dict of Object.values(strings))
    for (const key of keys) expect(dict).toHaveProperty(key);
});
