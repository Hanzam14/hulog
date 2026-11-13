import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CycleCard from "./components/CycleCard";
import IponCard from "./components/IponCard";
import { PersonalGoalCard } from "./components/PersonalSavings";
import Tally from "./components/Tally";
import { setLang } from "./i18n";
import { migratePersonalSavings } from "./personal";
import Home from "./screens/Home";
import Wishlist from "./screens/Wishlist";
import { createInitialSoloSnapshot, setSoloMode } from "./solo";

const SELF_ID = "solo-user";

describe("Minimalist UI and Hulog /hulog flow", () => {
  beforeEach(() => {
    setLang("en");
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
  });

  afterEach(() => {
    setSoloMode(false);
    vi.unstubAllGlobals();
  });

  it("renders a single clear Hulog button on Home linking to /hulog with primary emphasis when due and secondary when caught up", () => {
    const data = createInitialSoloSnapshot(SELF_ID);
    const cycle = data.cycles[0];
    const render = () =>
      renderToStaticMarkup(
        createElement(
          MemoryRouter,
          null,
          createElement(Home, {
            data,
            user: SELF_ID,
            run: async () => {},
            busy: false,
          }),
        ),
      );

    // Demo round started 3 days ago with 3 days logged: today is due.
    const dueHtml = render();
    expect(dueHtml).toContain('class="button big" href="/hulog"');
    expect(dueHtml).toContain("Hulog ₱50.00");
    expect(dueHtml).not.toContain("More options");
    expect(dueHtml).not.toContain("today-controls");

    // Caught up: logging ahead via /hulog stays available without shouting.
    const caughtUpData = {
      ...data,
      progress: data.progress.map((p) =>
        p.cycle_id === cycle.id && p.member_id === SELF_ID
          ? { ...p, confirmed_days: 4 }
          : p,
      ),
    };
    const caughtUpHtml = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(Home, {
          data: caughtUpData,
          user: SELF_ID,
          run: async () => {},
          busy: false,
        }),
      ),
    );
    expect(caughtUpHtml).toContain('class="button secondary big" href="/hulog"');
    expect(caughtUpHtml).toContain("Hulog ₱50.00");
  });

  it("hides the Hulog link once the member has already logged all round days", () => {
    const data = createInitialSoloSnapshot(SELF_ID);
    const cycle = data.cycles[0];
    data.progress = data.progress.map((p) =>
      p.cycle_id === cycle.id && p.member_id === SELF_ID
        ? { ...p, confirmed_days: cycle.num_days, pending_days: 0 }
        : p,
    );

    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(Home, {
          data,
          user: SELF_ID,
          run: async () => {},
          busy: false,
        }),
      ),
    );
    expect(html).not.toContain('href="/hulog"');
    expect(html).not.toContain("Hulog ₱");
  });

  it("renders CycleCard without decorative piggy SVG while keeping accessible progress", () => {
    const data = createInitialSoloSnapshot(SELF_ID);
    const cycle = data.cycles[0];

    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(CycleCard, {
          c: cycle,
          data,
          user: SELF_ID,
        }),
      ),
    );

    expect(html).not.toContain("<svg");
    expect(html).not.toContain(`× ${cycle.num_days}`);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Pot progress"');
    expect(html).toContain("pot-figure");
  });

  it("renders IponCard with crisp percentage badge and without the redundant 44px ring SVG", () => {
    const data = createInitialSoloSnapshot(SELF_ID);
    const goal = data.savingsGoals![0];

    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(IponCard, {
          g: goal,
          data,
          user: SELF_ID,
        }),
      ),
    );

    expect(html).not.toContain("ipon-ring");
    expect(html).toContain("ipon-pct");
    expect(html).toContain("%");
  });

  it("renders Tally indicators evenly without random coin rotation inline styles", () => {
    const html = renderToStaticMarkup(
      createElement(Tally, {
        label: "Paid",
        paid: 3,
        pending: 1,
        total: 10,
        tone: "pink",
      }),
    );

    expect(html).not.toContain("--coin-rotation");
    expect(html.match(/class="paid"/g)?.length).toBe(3);
    expect(html.match(/class="pending"/g)?.length).toBe(1);
    expect(html.match(/class="open"/g)?.length).toBe(6);
  });

  it("keeps ipon titles word-wrapped cleanly and pairs More-card buttons above version metadata", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");

    expect(css).toMatch(/\.brand\s*\{[\s\S]*?min-height:\s*44px;/);
    expect(css).not.toMatch(/\.round-panel\s*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(
      /\.ipon-title\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow-wrap:\s*anywhere;/,
    );
    expect(css).toMatch(
      /\.personal-goal\s*\{[\s\S]*?overflow-wrap:\s*break-word;/,
    );
    expect(css).toMatch(
      /\.personal-goal\s*>\s*\.row\s*\{[\s\S]*?flex-wrap:\s*wrap;/,
    );
    expect(css).toMatch(/\.personal-manage-body\s*\{[\s\S]*?gap:\s*10px;/);
    expect(css).toMatch(/\.history-metrics\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
    expect(css).toMatch(/\.more-card\s+\.export\s*\{[\s\S]*?order:\s*2;/);
    expect(css).toMatch(
      /\.more-card\s+\.app-updates\s*>\s*button\s*\{[\s\S]*?order:\s*3;/,
    );
    expect(css).toMatch(/\.more-card\s+\.app-version\s*\{[\s\S]*?order:\s*4;/);
  });

  it("shows local-only device notice on Wishlist only in solo mode", () => {
    const data = createInitialSoloSnapshot(SELF_ID);
    setSoloMode(true);
    const soloHtml = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(Wishlist, {
          data,
          user: SELF_ID,
          run: async () => {},
          busy: false,
        }),
      ),
    );
    expect(soloHtml).toContain("Saved on this device only. Not synced.");

    setSoloMode(false);
    const groupHtml = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(Wishlist, {
          data,
          user: SELF_ID,
          run: async () => {},
          busy: false,
        }),
      ),
    );
    expect(groupHtml).not.toContain("Saved on this device only. Not synced.");
  });

  it("renders personal savings records minimally with icon actions and spaced goal controls", () => {
    const data = createInitialSoloSnapshot(SELF_ID);
    migratePersonalSavings(data);
    const goal = data.personalGoals![0];
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(PersonalGoalCard, {
          goal,
          data,
          user: SELF_ID,
          run: async () => {},
          busy: false,
        }),
      ),
    );

    expect(html).toContain("personal-manage-body");
    expect(html).toContain("personal-entry-actions");
    expect(html).toContain('aria-label="Edit entry"');
    expect(html).toContain('aria-label="Delete entry"');
    expect(html).not.toContain("This records money you moved yourself.");
  });
});
