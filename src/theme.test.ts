import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, initializeTheme, readTheme, setTheme } from "./theme";

let stored: Map<string, string>;
let dark: boolean;
let media: EventTarget;
let browser: EventTarget;
let html: { dataset: { theme?: string } };
let metaColor: string;
beforeEach(() => {
  stored = new Map();
  dark = false;
  media = new EventTarget();
  browser = new EventTarget();
  html = { dataset: {} };
  metaColor = "";
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
  vi.stubGlobal(
    "window",
    Object.assign(browser, {
      matchMedia: () => Object.assign(media, { matches: dark }),
    }),
  );
  vi.stubGlobal("document", {
    documentElement: html,
    querySelector: () => ({
      setAttribute: (_key: string, value: string) => {
        metaColor = value;
      },
    }),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("device theme", () => {
  it("defaults missing or invalid preferences to system", () => {
    expect(readTheme()).toBe("system");
    stored.set("hulog-theme", "broken");
    expect(readTheme()).toBe("system");
  });
  it("uses explicit device preference and updates the browser color", () => {
    dark = true;
    setTheme("light");
    expect(stored.get("hulog-theme")).toBe("light");
    expect(html.dataset.theme).toBe("light");
    expect(metaColor).toBe("#fff6d8");
    applyTheme("dark");
    expect(html.dataset.theme).toBe("dark");
    expect(metaColor).toBe("#1d1915");
  });
  it("Auto follows OS changes while explicit light stays light", () => {
    initializeTheme();
    dark = true;
    media.dispatchEvent(new Event("change"));
    expect(html.dataset.theme).toBe("dark");
    setTheme("light");
    media.dispatchEvent(new Event("change"));
    expect(html.dataset.theme).toBe("light");
  });
  it("applies changes from another tab", () => {
    initializeTheme();
    stored.set("hulog-theme", "dark");
    browser.dispatchEvent(
      Object.assign(new Event("storage"), { key: "hulog-theme" }),
    );
    expect(html.dataset.theme).toBe("dark");
  });
  it("works for this session when storage access is denied", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(readTheme()).toBe("system");
    initializeTheme();
    expect(() => setTheme("dark")).not.toThrow();
    expect(html.dataset.theme).toBe("dark");
    media.dispatchEvent(new Event("change"));
    expect(html.dataset.theme).toBe("dark");
  });
});
