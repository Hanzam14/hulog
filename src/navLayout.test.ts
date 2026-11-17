import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/style.css", "utf8");

describe("bottom nav layout", () => {
  it("spans the content column flush to the bottom on every width", () => {
    // The last .app > nav rule must undo the old wide-screen floating pill
    // (min(440px, ...) width, 16px bottom offset), or the bar sits narrow,
    // left-aligned and lifted on desktop.
    const rules = [...css.matchAll(/(?:^|\n)\.app > nav \{([^}]+)\}/g)];
    const last = rules.at(-1)?.[1];
    expect(last).toBeDefined();
    expect(last).toContain("bottom: 0;");
    expect(last).toContain("width: 100%;");
    expect(last).toContain("align-self: stretch;");
    expect(last).toContain("margin: 0;");
    expect(css).toMatch(/\.app:has\(> nav\) \{\s*padding-bottom: 0;\s*\}/);
  });
});
