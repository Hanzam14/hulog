import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { Cycle, Progress, Snapshot } from "../data";
import { setLang } from "../i18n";
import RoundCalendar from "./RoundCalendar";

const me = "member-me";
const partner = "member-partner";

const cycle = (patch: Partial<Cycle> = {}): Cycle => ({
  id: "c1",
  group_id: "g",
  daily_amount_centavos: 10000,
  num_days: 10,
  start_date: "2026-10-10",
  end_date: "2026-10-19",
  receiver_id: partner,
  proposed_by: me,
  status: "accepted",
  phase: "open",
  pot_centavos: 0,
  target_centavos: 200000,
  payout_state: null,
  received_at: null,
  days_left: 3,
  created_at: "2026-10-09",
  ...patch,
});
const row = (member: string, confirmed: number, pending: number): Progress => ({
  cycle_id: "c1",
  member_id: member,
  expected_centavos: 100000,
  confirmed_days: confirmed,
  pending_days: pending,
  pending_count: pending > 0 ? 1 : 0,
  debt_centavos: 0,
});
const snapshot = (c: Cycle, today: string): Snapshot =>
  ({
    profiles: [
      { id: me, display_name: "Ana Reyes", nickname: null, color: "auto" },
      { id: partner, display_name: "Ben Cruz", nickname: null, color: "auto" },
    ],
    groups: [{ id: "g", owner_id: me }],
    cycles: [c],
    payments: [],
    progress: [row(me, 3, 2), row(partner, 1, 0)],
    today,
  }) as unknown as Snapshot;
const render = (c: Cycle, today = "2026-10-17", user = me) =>
  renderToStaticMarkup(
    createElement(RoundCalendar, { c, data: snapshot(c, today), user }),
  );

afterEach(() => setLang("taglish"));

describe("RoundCalendar", () => {
  it("labels every cell with its date and state, and marks today", () => {
    setLang("en");
    const html = render(cycle());
    expect(html).toContain('aria-label="Oct 10: Paid"');
    expect(html).toContain('aria-label="Oct 12: Paid"');
    expect(html).toContain('aria-label="Oct 13: Pending"');
    expect(html).toContain('aria-label="Oct 15: Missed"');
    expect(html).toContain('aria-label="Oct 17 (today): Upcoming"');
    expect(html).toContain('aria-label="Oct 19: Upcoming"');
    expect(html.match(/role="listitem"/g)).toHaveLength(10);
    expect(html.match(/class="cal-day [^"]*today"/g)).toHaveLength(1);
  });

  it("shows the legend counts with the Taglish names", () => {
    const html = render(cycle());
    expect(html).toContain("Paid 3");
    expect(html).toContain("Pending 2");
    expect(html).toContain("Kulang 2");
    expect(html).toContain("Darating 3");
  });

  it("defaults the toggle to the viewer and shows the other member on request", () => {
    const mine = render(cycle());
    expect(mine).toMatch(/aria-pressed="true"[^>]*>Ana</);
    expect(mine).toMatch(/aria-pressed="false"[^>]*>Ben</);
    const theirs = render(cycle(), undefined, partner);
    expect(theirs).toMatch(/aria-pressed="true"[^>]*>Ben</);
    expect(theirs).toContain("Paid 1");
  });

  it("opens by default while the round runs and collapses once it has ended", () => {
    expect(render(cycle())).toMatch(/<details open/);
    expect(render(cycle({ phase: "settling" }), "2026-10-20")).toMatch(
      /<details open/,
    );
    const ended = render(cycle({ phase: "ended" }), "2026-10-25");
    expect(ended).toContain("<details>");
    expect(ended).toContain("Oct 15: Kulang");
  });

  it("has no toggle for a solo round and shows only the saver", () => {
    const html = render(cycle({ is_solo: true, receiver_id: me }));
    expect(html).not.toContain("aria-pressed");
    expect(html).toContain("Paid 3");
  });

  it("renders nothing before the round starts or when it has no days", () => {
    expect(render(cycle({ phase: "upcoming" }), "2026-10-05")).toBe("");
    expect(render(cycle({ status: "proposed" }))).toBe("");
    expect(render(cycle({ end_date: "2026-10-09" }))).toBe("");
  });
});
