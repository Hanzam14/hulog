import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { Cycle, Snapshot } from "../data";
import { setLang } from "../i18n";
import Payout from "./Payout";

const cycle = (overrides: Partial<Cycle> = {}): Cycle => ({
  id: "closed-cycle",
  group_id: "group",
  daily_amount_centavos: 5000,
  num_days: 10,
  start_date: "2026-10-01",
  end_date: "2026-10-10",
  receiver_id: "b",
  proposed_by: "a",
  status: "accepted",
  phase: "ended",
  pot_centavos: 100000,
  target_centavos: 100000,
  payout_state: "Waiting for Got it",
  received_at: null,
  days_left: 0,
  created_at: "2026-10-01T00:00:00Z",
  wallet_id: "wallet",
  holder_id: "a",
  wallet_label: "Cash box",
  withdrawn_centavos: 30000,
  held_centavos: 70000,
  ...overrides,
});

const snapshot = (): Snapshot => ({
  profiles: [
    {
      id: "a",
      display_name: "Ana Cruz",
      nickname: null,
      email: "a@test",
      avatar_url: null,
      avatar_kind: "initial",
      avatar_emoji: null,
      color: "pink",
    },
    {
      id: "b",
      display_name: "Bea Cruz",
      nickname: null,
      email: "b@test",
      avatar_url: null,
      avatar_kind: "initial",
      avatar_emoji: null,
      color: "blue",
    },
  ],
  groups: [
    { id: "group", name: "Pair", owner_id: "a", pot_location: "Cash box" },
  ],
  memberships: [],
  cycles: [],
  payments: [],
  repayments: [],
  progress: [],
  changes: [],
  invites: [],
  today: "2026-10-23",
  wallets: [],
  payoutWithdrawals: [
    {
      id: "withdrawal",
      group_id: "group",
      cycle_id: "closed-cycle",
      amount_centavos: 30000,
      withdrawal_date: "2026-10-22",
      note: "Cash for her",
      created_by: "a",
      created_at: "2026-10-22T12:00:00Z",
      voided_by: null,
      voided_at: null,
    },
  ],
});

describe("payout withdrawals", () => {
  afterEach(() => setLang("taglish"));

  it("shows original pot, remaining custody, quick record action, and actor-tagged history", () => {
    setLang("en");
    const html = renderToStaticMarkup(
      createElement(Payout, {
        c: cycle(),
        data: snapshot(),
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );
    expect(html).toContain("Original pot");
    expect(html).toContain("Still held by you");
    expect(html).toContain("₱700.00");
    expect(html).toContain("Record pot withdrawal");
    expect(html).toContain("Withdrawal history");
    expect(html).toContain("Recorded by Ana Cruz");
    expect(html).toContain("Cash for her");
  });

  it("uses distinct Taglish wording for a paluwagan cash withdrawal", () => {
    const html = renderToStaticMarkup(
      createElement(Payout, {
        c: cycle(),
        data: snapshot(),
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );
    expect(html).toContain("I-record ang nakuha");
    expect(html).not.toContain("I-record ang bawas sa ipon");
    expect(html).toContain("Hawak mo pa");
  });

  it("does not show held custody or undo after the receiver acknowledges receipt", () => {
    setLang("en");
    const html = renderToStaticMarkup(
      createElement(Payout, {
        c: cycle({
          payout_state: "Received",
          held_centavos: 0,
          received_at: "2026-10-23T00:00:00Z",
        }),
        data: snapshot(),
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );
    expect(html).toContain("No amount remains held");
    expect(html).not.toContain("Still held by you");
    expect(html).not.toContain("Record pot withdrawal");
    expect(html).not.toContain("Undo withdrawal");
  });

  it("keeps a ledger-only full withdrawal correctable", () => {
    setLang("en");
    const html = renderToStaticMarkup(
      createElement(Payout, {
        c: cycle({
          payout_state: "Received",
          held_centavos: 0,
          withdrawn_centavos: 100000,
        }),
        data: snapshot(),
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );
    expect(html).toContain("Undo withdrawal");
  });

  it("lets the receiver acknowledge a closed zero-pot cycle", () => {
    setLang("en");
    const data = snapshot();
    data.payoutWithdrawals = [];
    const html = renderToStaticMarkup(
      createElement(Payout, {
        c: cycle({ pot_centavos: 0, held_centavos: 0, withdrawn_centavos: 0 }),
        data,
        user: "b",
        run: async () => {},
        busy: false,
      }),
    );
    expect(html).toContain(">got it ");
    expect(html).not.toContain("receive remaining");
  });

  it("lets only the receiver acknowledge a full ledger withdrawal", () => {
    setLang("en");
    const fullyWithdrawn = cycle({
      payout_state: "Received",
      held_centavos: 0,
      withdrawn_centavos: 100000,
    });
    const data = snapshot();
    data.payoutWithdrawals![0].amount_centavos = 100000;
    const receiverHtml = renderToStaticMarkup(
      createElement(Payout, {
        c: fullyWithdrawn,
        data,
        user: "b",
        run: async () => {},
        busy: false,
      }),
    );
    expect(receiverHtml).toContain("Confirm fully received");
    expect(receiverHtml).toContain("Undo withdrawal");

    const holderHtml = renderToStaticMarkup(
      createElement(Payout, {
        c: fullyWithdrawn,
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );
    expect(holderHtml).not.toContain("Confirm fully received");
    expect(holderHtml).toContain("Undo withdrawal");
  });

  it("closes the full-withdrawal correction window after acknowledgment", () => {
    setLang("en");
    const html = renderToStaticMarkup(
      createElement(Payout, {
        c: cycle({
          payout_state: "Received",
          held_centavos: 0,
          withdrawn_centavos: 100000,
          received_at: "2026-10-23T12:00:00Z",
        }),
        data: snapshot(),
        user: "b",
        run: async () => {},
        busy: false,
      }),
    );
    expect(html).not.toContain("Confirm fully received");
    expect(html).not.toContain("Undo withdrawal");
  });

  it("mutes and labels voided withdrawals in history", () => {
    setLang("en");
    const data = snapshot();
    data.payoutWithdrawals![0].voided_at = "2026-10-23T12:00:00Z";
    data.payoutWithdrawals![0].voided_by = "a";
    const html = renderToStaticMarkup(
      createElement(Payout, {
        c: cycle({ withdrawn_centavos: 0, held_centavos: 100000 }),
        data,
        user: "a",
        run: async () => {},
        busy: false,
      }),
    );
    expect(html).toMatch(/entry payout-withdrawal-voided/);
    expect(html).toContain('aria-label="Voided"');
  });
});
