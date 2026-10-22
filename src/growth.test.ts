import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GrowthChart from "./components/GrowthChart";
import type {
  PersonalEntry,
  PersonalGoal,
  SavingsContribution,
  SavingsGoal,
  Snapshot,
} from "./data";
import { iponSeries, personalSeries, scalePoints } from "./growth";
import { setLang } from "./i18n";

const me = "me";
const partner = "partner";

const goal = (over: Partial<SavingsGoal> = {}) =>
  ({
    id: "g1",
    start_date: "2026-10-01",
    target_amount_centavos: 100000,
    ...over,
  }) as SavingsGoal;
const contribution = (over: Partial<SavingsContribution>) =>
  ({
    goal_id: "g1",
    amount_centavos: 1000,
    status: "confirmed",
    created_at: "2026-10-02T01:00:00Z",
    confirmed_at: "2026-10-02T02:00:00Z",
    deleted_at: null,
    ...over,
  }) as SavingsContribution;
const personalGoal = (over: Partial<PersonalGoal> = {}) =>
  ({
    id: "p1",
    owner_id: me,
    visibility: "private",
    target_amount_centavos: 50000,
    deleted_at: null,
    ...over,
  }) as PersonalGoal;
const entry = (over: Partial<PersonalEntry>) =>
  ({
    goal_id: "p1",
    kind: "deposit",
    amount_centavos: 1000,
    entry_date: "2026-10-02",
    deleted_at: null,
    ...over,
  }) as PersonalEntry;
const snap = (parts: Partial<Snapshot>) => parts as Snapshot;

describe("iponSeries", () => {
  it("starts at zero on the goal start date and accumulates", () => {
    const data = snap({
      savingsGoals: [goal()],
      savingsContributions: [
        contribution({ amount_centavos: 1000 }),
        contribution({
          amount_centavos: 2500,
          confirmed_at: "2026-10-05T04:00:00Z",
        }),
      ],
    });
    expect(iponSeries(data, "g1")).toEqual([
      { date: "2026-10-01", centavos: 0 },
      { date: "2026-10-02", centavos: 1000 },
      { date: "2026-10-05", centavos: 3500 },
    ]);
  });
  it("leaves out pending, deleted and other-goal contributions", () => {
    const data = snap({
      savingsGoals: [goal()],
      savingsContributions: [
        contribution({ amount_centavos: 1000 }),
        contribution({ amount_centavos: 9999, status: "pending" }),
        contribution({
          amount_centavos: 8888,
          deleted_at: "2026-10-03T00:00:00Z",
        }),
        contribution({ amount_centavos: 7777, goal_id: "other" }),
      ],
    });
    expect(iponSeries(data, "g1").at(-1)).toEqual({
      date: "2026-10-02",
      centavos: 1000,
    });
  });
  it("dates by the Manila day of confirmation, falling back to created_at", () => {
    const data = snap({
      savingsGoals: [goal({ start_date: "2026-09-01" })],
      savingsContributions: [
        contribution({
          confirmed_at: "2026-09-30T16:30:00Z",
          created_at: "2026-09-30T10:00:00Z",
        }),
        contribution({
          amount_centavos: 500,
          confirmed_at: null,
          created_at: "2026-10-04T17:00:00Z",
        }),
      ],
    });
    expect(iponSeries(data, "g1")).toEqual([
      { date: "2026-09-01", centavos: 0 },
      { date: "2026-10-01", centavos: 1000 },
      { date: "2026-10-05", centavos: 1500 },
    ]);
  });
  it("merges same-day contributions into one point", () => {
    const data = snap({
      savingsGoals: [goal()],
      savingsContributions: [
        contribution({ amount_centavos: 1000 }),
        contribution({
          amount_centavos: 400,
          confirmed_at: "2026-10-02T09:00:00Z",
        }),
      ],
    });
    expect(iponSeries(data, "g1")).toEqual([
      { date: "2026-10-01", centavos: 0 },
      { date: "2026-10-02", centavos: 1400 },
    ]);
  });
  it("is empty without confirmed money or for an unknown goal", () => {
    const data = snap({
      savingsGoals: [goal()],
      savingsContributions: [contribution({ status: "pending" })],
    });
    expect(iponSeries(data, "g1")).toEqual([]);
    expect(iponSeries(data, "missing")).toEqual([]);
  });
});

describe("personalSeries", () => {
  it("subtracts withdrawals and merges same-day entries", () => {
    const data = snap({
      personalGoals: [personalGoal()],
      personalEntries: [
        entry({ amount_centavos: 5000 }),
        entry({ amount_centavos: 1000, entry_date: "2026-10-02" }),
        entry({
          kind: "withdrawal",
          amount_centavos: 2000,
          entry_date: "2026-10-04",
        }),
      ],
    });
    expect(personalSeries(data, me, "p1")).toEqual([
      { date: "2026-10-02", centavos: 6000 },
      { date: "2026-10-04", centavos: 4000 },
    ]);
  });
  it("ignores deleted entries and does not floor a negative balance", () => {
    const data = snap({
      personalGoals: [personalGoal()],
      personalEntries: [
        entry({ amount_centavos: 9999, deleted_at: "2026-10-03T00:00:00Z" }),
        entry({ amount_centavos: 1000 }),
        entry({
          kind: "withdrawal",
          amount_centavos: 1500,
          entry_date: "2026-10-03",
        }),
      ],
    });
    expect(personalSeries(data, me, "p1")).toEqual([
      { date: "2026-10-02", centavos: 1000 },
      { date: "2026-10-03", centavos: -500 },
    ]);
  });
  it("returns nothing for a partner private goal", () => {
    const data = snap({
      personalGoals: [personalGoal({ owner_id: partner })],
      personalEntries: [entry({}), entry({ entry_date: "2026-10-03" })],
    });
    expect(personalSeries(data, me, "p1")).toEqual([]);
    expect(personalSeries(data, partner, "p1")).toHaveLength(2);
  });
  it("returns the series for a partner shared goal", () => {
    const data = snap({
      personalGoals: [
        personalGoal({ owner_id: partner, visibility: "shared" }),
      ],
      personalEntries: [entry({}), entry({ entry_date: "2026-10-03" })],
    });
    expect(personalSeries(data, me, "p1")).toEqual([
      { date: "2026-10-02", centavos: 1000 },
      { date: "2026-10-03", centavos: 2000 },
    ]);
  });
  it("returns nothing for a deleted goal", () => {
    const data = snap({
      personalGoals: [personalGoal({ deleted_at: "2026-10-05T00:00:00Z" })],
      personalEntries: [entry({}), entry({ entry_date: "2026-10-03" })],
    });
    expect(personalSeries(data, me, "p1")).toEqual([]);
  });
});

describe("scalePoints", () => {
  const pad = { top: 0, right: 0, bottom: 0, left: 0 };
  it("lets a target above the peak set the top of the axis", () => {
    const chart = scalePoints(
      [
        { date: "2026-10-01", centavos: 0 },
        { date: "2026-10-03", centavos: 25000 },
      ],
      200,
      100,
      100000,
      pad,
    );
    expect(chart.max).toBe(100000);
    expect(chart.targetY).toBe(0);
    expect(chart.points).toEqual([
      { x: 0, y: 100 },
      { x: 200, y: 75 },
    ]);
    expect(chart.path).toBe("M0 100H200V75");
  });
  it("lets the peak set the top when it is above the target", () => {
    const chart = scalePoints(
      [
        { date: "2026-10-01", centavos: 0 },
        { date: "2026-10-02", centavos: 200 },
      ],
      100,
      100,
      100,
      pad,
    );
    expect(chart.max).toBe(200);
    expect(chart.targetY).toBe(50);
  });
  it("spaces points by real days, not by index", () => {
    const chart = scalePoints(
      [
        { date: "2026-10-01", centavos: 0 },
        { date: "2026-10-02", centavos: 1 },
        { date: "2026-10-11", centavos: 2 },
      ],
      100,
      10,
      undefined,
      pad,
    );
    expect(chart.points.map((p) => p.x)).toEqual([0, 10, 100]);
  });
  it("includes negative balances below the zero line", () => {
    const chart = scalePoints(
      [
        { date: "2026-10-01", centavos: 1000 },
        { date: "2026-10-02", centavos: -1000 },
      ],
      100,
      100,
      undefined,
      pad,
    );
    expect(chart.min).toBe(-1000);
    expect(chart.max).toBe(1000);
    expect(chart.zeroY).toBe(50);
    expect(chart.points[1].y).toBe(100);
  });
  it("does not divide by zero when every balance is zero", () => {
    const chart = scalePoints(
      [
        { date: "2026-10-01", centavos: 0 },
        { date: "2026-10-02", centavos: 0 },
      ],
      100,
      100,
    );
    expect(chart.points.every((p) => Number.isFinite(p.y))).toBe(true);
  });
});

describe("GrowthChart", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
    });
    setLang("en");
  });
  afterEach(() => {
    setLang("taglish");
    vi.unstubAllGlobals();
  });
  const series = [
    { date: "2026-10-01", centavos: 0 },
    { date: "2026-10-05", centavos: 25000 },
  ];
  it("renders an svg with a text summary, dates and a target line", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthChart, {
        series,
        tone: "green",
        targetCentavos: 100000,
      }),
    );
    expect(html).toContain("<svg");
    expect(html).toContain('role="img"');
    expect(html).toContain("₱250.00 of ₱1,000.00 saved since Oct 1");
    expect(html).toContain("growth-target");
    expect(html).toContain("Oct 5");
  });
  it("omits the target line and its wording when there is no target", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthChart, { series, tone: "green" }),
    );
    expect(html).toContain('aria-label="₱250.00 saved since Oct 1"');
    expect(html).not.toContain("growth-target");
  });
  it("renders nothing for fewer than two points", () => {
    expect(
      renderToStaticMarkup(
        createElement(GrowthChart, { series: [], tone: "green" }),
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        createElement(GrowthChart, {
          series: series.slice(0, 1),
          tone: "green",
        }),
      ),
    ).toBe("");
  });
});
