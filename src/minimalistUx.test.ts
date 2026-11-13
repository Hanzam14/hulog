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
import ProposeIpon from "./screens/ProposeIpon";
import Tracker from "./screens/Tracker";
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

  it("drops the redundant Savings goals subheading and places Your savings history last after Our wishlist", () => {
    const data = createInitialSoloSnapshot(SELF_ID, "partnered");
    migratePersonalSavings(data);
    data.savingsGoals = [
      {
        id: "sg-1",
        group_id: data.groups[0].id,
        title: "Japan Fund",
        goal_mode: "flexible",
        wallet_id: "w-1",
        wallet_label: "MariBank",
        holder_id: SELF_ID,
        pending_wallet_id: null,
        wallet_proposed_by: null,
        start_date: data.today,
        end_date: "2026-12-31",
        step_amount_centavos: null,
        cadence_days: null,
        num_steps: null,
        target_amount_centavos: 100000,
        status: "accepted",
        proposed_by: SELF_ID,
        accepted_by: "partner-1",
        accepted_at: "2026-10-01T00:00:00Z",
        withdrawn_at: null,
        withdrawn_by: null,
        withdraw_proposed_by: null,
        created_at: "2026-10-01T00:00:00Z",
        saved_centavos: 20000,
        phase: "open",
        days_left: 30,
        expected_steps_today: 0,
      },
    ];
    data.personalHistory = [
      {
        id: 1,
        goal_id: data.personalGoals![0].id,
        actor_id: SELF_ID,
        entity: "personal_savings_entries",
        entity_id: "pe-1",
        action: "insert",
        before: null,
        after: { amount_centavos: 10000 },
        created_at: "2026-10-20T00:00:00Z",
      },
    ];

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
    expect(html).toContain('<h2 class="section-label">Savings</h2>');
    expect(html).not.toContain("Savings goals");
    expect(html).toContain("Our wishlist");
    expect(html).toContain("Your savings history");
    expect(html.indexOf("Our wishlist")).toBeLessThan(
      html.indexOf("Your savings history"),
    );

    setSoloMode(true);
    const soloData = createInitialSoloSnapshot(SELF_ID);
    migratePersonalSavings(soloData);
    soloData.memberships = soloData.memberships.filter(
      (m) => m.user_id === SELF_ID,
    );
    soloData.personalHistory = [
      {
        id: 1,
        goal_id: soloData.personalGoals![0].id,
        actor_id: SELF_ID,
        entity: "personal_savings_entries",
        entity_id: "pe-1",
        action: "insert",
        before: null,
        after: { amount_centavos: 10000 },
        created_at: "2026-10-20T00:00:00Z",
      },
    ];
    const soloProposeHtml = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(ProposeIpon, {
          data: soloData,
          user: SELF_ID,
          run: async () => {},
          busy: false,
        }),
      ),
    );
    expect(soloProposeHtml).toContain("Your savings history");
  });

  it("renders full-width segmented tracks on Home for short rounds and proportional tracks up to 366 days", () => {
    const shortHtml = renderToStaticMarkup(
      createElement(Tally, {
        label: "James",
        paid: 7,
        pending: 2,
        total: 15,
        tone: "blue",
        variant: "track",
      }),
    );
    expect(shortHtml).toContain("tally tally-track blue");
    expect(shortHtml).not.toContain("proportional");
    expect(shortHtml).toContain("--tally-total:15");
    expect(shortHtml).toContain(
      'aria-label="James: 7 of 15 days paid, 2 pending"',
    );
    expect(shortHtml.match(/class="paid"/g)?.length).toBe(7);
    expect(shortHtml.match(/class="pending"/g)?.length).toBe(2);
    expect(shortHtml.match(/class="open"/g)?.length).toBe(6);

    const longHtml = renderToStaticMarkup(
      createElement(Tally, {
        label: "James",
        paid: 100,
        pending: 20,
        total: 366,
        tone: "pink",
        variant: "track",
      }),
    );
    expect(longHtml).toContain("tally tally-track proportional pink");
    expect(longHtml).toContain(
      'aria-label="James: 100 of 366 days paid, 20 pending"',
    );
    expect(longHtml.match(/class="paid"/g)?.length).toBe(1);
    expect(longHtml.match(/class="pending"/g)?.length).toBe(1);
    expect(longHtml.match(/class="open"/g)?.length).toBe(1);

    const homeData = createInitialSoloSnapshot(SELF_ID);
    homeData.cycles[0].num_days = 366;
    homeData.progress[0] = {
      ...homeData.progress[0],
      confirmed_days: 300,
      pending_days: 1,
    };
    homeData.progress[1] = {
      ...homeData.progress[1],
      confirmed_days: 200,
      pending_days: 0,
    };
    setLang("en");
    const home366En = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(Home, {
          data: homeData,
          user: SELF_ID,
          run: async () => {},
          busy: false,
        }),
      ),
    );
    expect(home366En).toContain("300/366 · Pending 1");
    expect(home366En).toContain("200/366</span>");
    expect(home366En).toContain("tally tally-track proportional");

    setLang("tl");
    const home366Tl = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(Home, {
          data: homeData,
          user: SELF_ID,
          run: async () => {},
          busy: false,
        }),
      ),
    );
    expect(home366Tl).toContain("300/366 · Naghihintay 1");
  });

  it("keeps bell badge centering, history chevron rules, and compact Tracker entry spacing in CSS", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");

    expect(css).toMatch(/\.header-bell\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
    expect(css).toMatch(
      /\.header-bell\s+\.badge\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?line-height:\s*1;/,
    );
    expect(css).toContain("details.personal-history > summary");
    expect(css).toMatch(/\.abono-entry\s+\.actions\s*\{[\s\S]*?margin:\s*0\s+0\s+0\s+-8px;/);
    expect(css).toMatch(/\.member-name\s*\{\s*color:\s*var\(--tone-deep\);/);
  });

  it("colors debtor and creditor names in Tracker owes banner across English, Taglish, and Filipino", () => {
    const data = createInitialSoloSnapshot("a", "partnered");
    data.profiles = [
      {
        id: "a",
        display_name: "Vinice Coso",
        email: "vinice@example.com",
        nickname: null,
        avatar_url: null,
        avatar_kind: "initial",
        avatar_emoji: null,
        color: "pink",
      },
      {
        id: "b",
        display_name: "James",
        email: "james@example.com",
        nickname: null,
        avatar_url: null,
        avatar_kind: "initial",
        avatar_emoji: null,
        color: "blue",
      },
    ];
    data.abonoSummary = [
      {
        group_id: data.groups[0].id,
        debtor_id: "a",
        creditor_id: "b",
        owed_centavos: 50000,
        pending_settlement_centavos: 0,
      },
    ];

    setLang("en");
    const enHtml = renderToStaticMarkup(
      createElement(Tracker, { data, user: "a", run: async () => {}, busy: false }),
    );
    expect(enHtml.replace(/<[^>]+>/g, "")).toContain(
      "Vinice Coso owes James ₱500.00",
    );
    expect(enHtml).toContain('<span class="member-name pink">Vinice Coso</span>');
    expect(enHtml).toContain('<span class="member-name blue">James</span>');

    setLang("taglish");
    const taglishHtml = renderToStaticMarkup(
      createElement(Tracker, { data, user: "a", run: async () => {}, busy: false }),
    );
    expect(taglishHtml.replace(/<[^>]+>/g, "")).toContain(
      "May utang si Vinice Coso kay James na ₱500.00",
    );
    expect(taglishHtml).toContain('<span class="member-name pink">Vinice Coso</span>');
    expect(taglishHtml).toContain('<span class="member-name blue">James</span>');

    setLang("tl");
    const tlHtml = renderToStaticMarkup(
      createElement(Tracker, { data, user: "a", run: async () => {}, busy: false }),
    );
    expect(tlHtml.replace(/<[^>]+>/g, "")).toContain(
      "May utang si Vinice Coso kay James na ₱500.00",
    );
    expect(tlHtml).toContain('<span class="member-name pink">Vinice Coso</span>');
    expect(tlHtml).toContain('<span class="member-name blue">James</span>');
  });
});
