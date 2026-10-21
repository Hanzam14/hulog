import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Change, Snapshot } from "../data";
import { setLang } from "../i18n";
import Changes from "./Changes";

const html = (element: ReactElement) =>
  renderToStaticMarkup(createElement(MemoryRouter, {}, element));

const change = (id: number, createdAt: string, unread = false): Change => ({
  id,
  actor_id: "a",
  entity: "group",
  entity_id: "group",
  action: "updated",
  before: { name: "Old" },
  after: { name: "New" },
  created_at: createdAt,
  unread,
});

const snapshot = (changes: Change[]): Snapshot =>
  ({
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
    ],
    groups: [{ id: "group", name: "Pair", owner_id: "a", pot_location: "" }],
    memberships: [],
    cycles: [],
    payments: [],
    repayments: [],
    progress: [],
    changes,
    invites: [],
    today: "2026-10-17",
    wallets: [],
  }) as unknown as Snapshot;

const render = (changes: Change[]) =>
  html(
    createElement(Changes, {
      data: snapshot(changes),
      run: async () => undefined,
      busy: false,
    }),
  );

beforeEach(() => {
  setLang("en");
});

afterEach(() => {
  setLang("taglish");
});

describe("Changes screen", () => {
  it("groups by Manila day and shows at most 20 changes with Show more", () => {
    // Manila mid-day timestamps (+08:00) so the calendar day is unambiguous.
    const today = Array.from({ length: 15 }, (_, i) =>
      change(i + 1, `2026-10-17T1${(i % 9) + 0}:30:00+08:00`),
    );
    const yesterday = Array.from({ length: 10 }, (_, i) =>
      change(100 + i, `2026-10-16T1${(i % 9) + 0}:30:00+08:00`),
    );
    // data.changes is oldest-first; the screen reverses it to show newest first.
    const markup = render([...yesterday, ...today]);

    expect(markup).toContain("Today");
    expect(markup).toContain("Yesterday");
    expect(markup.match(/class="change-row"/g)).toHaveLength(20);
    expect(markup).toContain("Show more");
  });

  it("shows the empty state and no Mark read button when there are no changes", () => {
    const markup = render([]);

    expect(markup).toContain("No changes yet.");
    expect(markup).not.toContain("Mark read");
  });

  it("shows Mark read and the unread dot only when a change is unread", () => {
    const unread = render([change(1, "2026-10-17T10:00:00+08:00", true)]);
    expect(unread).toContain("Mark read");
    expect(unread).toContain("change-new");

    const read = render([change(1, "2026-10-17T10:00:00+08:00", false)]);
    expect(read).not.toContain("Mark read");
    expect(read).not.toContain("change-new");
  });
});
