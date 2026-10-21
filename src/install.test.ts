import { afterEach, describe, expect, it, vi } from "vitest";
import { isIosOutsideHomeScreen } from "./install";

function browser(userAgent: string, standalone = false) {
  vi.stubGlobal("navigator", { userAgent, platform: "iPhone", standalone });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: standalone }) });
}

describe("isIosOutsideHomeScreen", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the Home Screen hint in Chrome on iPhone", () => {
    browser(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1",
    );
    expect(isIosOutsideHomeScreen()).toBe(true);
  });

  it("hides the hint once opened from the Home Screen", () => {
    browser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", true);
    expect(isIosOutsideHomeScreen()).toBe(false);
  });
});
