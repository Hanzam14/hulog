import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { InstallBanner } from "./InstallSettings";

const iphoneChrome =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1";

function browser(userAgent: string, stored: Record<string, string> = {}) {
  vi.stubGlobal("navigator", { userAgent, platform: "", standalone: false });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal("localStorage", { getItem: (key: string) => stored[key] });
}
const render = () => renderToString(createElement(InstallBanner));

describe("InstallBanner", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows iPhone users the Add to Home Screen steps", () => {
    browser(iphoneChrome);
    const html = render();
    expect(html).toContain("Add to Home Screen");
    expect(html).toContain("<ol>");
  });

  it("stays hidden after it is dismissed", () => {
    browser(iphoneChrome, { "hulog-install-dismissed": "1" });
    expect(render()).toBe("");
  });

  it("stays hidden on desktop without an install prompt", () => {
    browser("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0");
    expect(render()).toBe("");
  });
});
