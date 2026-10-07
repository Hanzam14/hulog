import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Cycle, Snapshot } from "../data";
import { rpc } from "../data";
import { setLang } from "../i18n";
import CycleCard from "./CycleCard";
import GivePayout from "./GivePayout";
import Home from "../screens/Home";
import Detail from "../screens/Detail";
import Propose from "../screens/Propose";
import { Route, Routes } from "react-router-dom";

vi.mock("../data", () => ({ rpc: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => {
  setLang("taglish");
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const cycle: Cycle = {
  id: "cycle",
  group_id: "group",
  daily_amount_centavos: 7500,
  num_days: 15,
  start_date: "2026-10-07",
  end_date: "2026-10-21",
  receiver_id: "a",
  proposed_by: "b",
  status: "accepted",
  phase: "open",
  pot_centavos: 112500,
  target_centavos: 225000,
  payout_state: null,
  received_at: null,
  days_left: 15,
  created_at: "2026-10-07",
};
const snapshot = (): Snapshot => ({
  profiles: ["a", "b"].map((id, i) => ({
    id,
    display_name: ["Ana Cruz", "Ben Santos"][i],
    nickname: null,
    email: "",
    avatar_url: null,
    avatar_kind: "initial",
    avatar_emoji: null,
    color: "auto",
  })),
  groups: [{ id: "group", name: "Pair", owner_id: "a", pot_location: "" }],
  memberships: ["a", "b"].map((user_id) => ({
    group_id: "group",
    user_id,
    status: "active",
    last_seen_history_at: "",
  })),
  cycles: [{ ...cycle }],
  payments: ["a", "b"].map((member_id) => ({
    id: `pay-${member_id}`,
    cycle_id: "cycle",
    member_id,
    days: 1,
    amount_centavos: 7500,
    status: "pending",
    was_confirmed: false,
    created_at: "2026-10-07",
    deleted_at: null,
  })),
  repayments: [],
  progress: [],
  changes: [],
  invites: [],
  today: "2026-10-07",
});
const run = async (action: () => Promise<unknown>) => {
  await action();
};
const html = (element: ReactElement) =>
  renderToStaticMarkup(createElement(MemoryRouter, {}, element));

describe("mutual confirmation screens", () => {
  for (const user of ["a", "b"]) {
    it(`shows only the other member's confirmation and decline actions to ${user}`, () => {
      setLang("en");
      const props = { data: snapshot(), user, run, busy: false };
      const other = user === "a" ? "Ben Santos" : "Ana Cruz";
      const own = user === "a" ? "Ana Cruz" : "Ben Santos";
      const home = html(createElement(Home, props));
      expect(home).toContain(`Confirm ${other}&#x27;s`);
      expect(home).not.toContain(`Confirm ${own}&#x27;s`);
      expect(home).toContain(`Decline ${other}&#x27;s`);
      const detail = renderToStaticMarkup(
        createElement(
          MemoryRouter,
          { initialEntries: ["/cycles/cycle"] },
          createElement(
            Routes,
            {},
            createElement(Route, {
              path: "/cycles/:id",
              element: createElement(Detail, props),
            }),
          ),
        ),
      );
      expect(detail).toContain(`Confirm ${other}&#x27;s`);
      expect(detail).not.toContain(`Confirm ${own}&#x27;s`);
      expect(detail).toContain(`Decline ${other}&#x27;s`);
    });
  }
});
describe("receiver hand-off UI", () => {
  const props = () => ({
    c: { ...cycle },
    data: snapshot(),
    user: "a",
    run,
    busy: false,
  });
  it("is available only to an active receiver before the window closes", () => {
    const p = props();
    expect(GivePayout(p)).not.toBeNull();
    expect(GivePayout({ ...p, user: "b" })).toBeNull();
    for (const c of [
      { ...cycle, status: "proposed" },
      { ...cycle, received_at: "2026-10-07" },
    ])
      expect(GivePayout({ ...p, c })).toBeNull();
    p.data.today = "2026-10-22";
    expect(GivePayout(p)).toBeNull();
    p.data.today = "2026-10-21";
    expect(GivePayout(p)).not.toBeNull();
    p.data.memberships[0].status = "removed";
    expect(GivePayout(p)).toBeNull();
  });
  it("calls give_payout only after the named confirmation", async () => {
    setLang("en");
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("window", { confirm });
    const button = GivePayout(props())!;
    button.props.onClick();
    expect(confirm).toHaveBeenCalledWith(
      "Give this round’s payout to Ben Santos?",
    );
    expect(rpc).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    button.props.onClick();
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("give_payout", {
      p_cycle_id: "cycle",
    });
  });
  it("keeps proposal default opposite the handed-off receiver", () => {
    const data = snapshot();
    data.cycles[0].receiver_id = "b";
    const markup = html(
      createElement(Propose, { data, user: "a", run, busy: false }),
    );
    expect(markup).toMatch(
      /class="who on" aria-pressed="true"><span class="avatar pink lg"[^>]*aria-label="Ana Cruz"/,
    );
    expect(markup).toMatch(
      /class="who " aria-pressed="false"><span class="avatar blue lg"[^>]*aria-label="Ben Santos"/,
    );
  });
});
describe("hero pot card", () => {
  it("shows half progress and clamps empty, negative and over-target amounts", () => {
    for (const [pot, target, expected] of [
      [112500, 225000, 50],
      [0, 225000, 0],
      [-1, 225000, 0],
      [300000, 225000, 100],
      [0, 0, 0],
    ]) {
      const markup = html(
        createElement(CycleCard, {
          c: { ...cycle, pot_centavos: pot, target_centavos: target },
          data: snapshot(),
        }),
      );
      expect(markup).toContain(`aria-valuenow="${expected}"`);
      expect(markup).toContain(`width:${expected}%`);
      expect(markup).toContain('aria-valuemin="0" aria-valuemax="100"');
    }
  });
  it("translates progress and target labels in all three languages and shows first name", () => {
    for (const [lang, label] of [
      ["en", "Pot progress"],
      ["tl", "Pag-usad ng ipon"],
      ["taglish", "Progress ng ipon"],
    ] as const) {
      setLang(lang);
      const markup = html(
        createElement(CycleCard, { c: cycle, data: snapshot() }),
      );
      expect(markup).toContain(`aria-label="${label}"`);
      expect(markup).toContain("₱2,250.00");
      expect(markup).toContain("<b>Ana</b>");
    }
  });
});
