import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const declarations = (property: string) =>
  [...css.matchAll(new RegExp(`(?<![\\w-])${property}:\\s*([^;]+);`, "g"))].map(
    (m) => m[1].trim(),
  );

describe("listahan identity contract", () => {
  it("has one light and one dark token source", () => {
    expect(css.match(/:root\s*\{/g)).toHaveLength(1);
    expect(css.match(/:root\[data-theme="dark"\]\s*\{/g)).toHaveLength(1);
  });
  it("uses only the type scale", () => {
    for (const size of declarations("font-size")) {
      expect(size).toMatch(
        /^(var\(--text-(xs|sm|base|input|md|lg|xl|2xl|3xl)\)|inherit)$/,
      );
    }
  });
  it("uses only the radius scale", () => {
    for (const [name, value] of Object.entries({
      sm: 14,
      button: 16,
      md: 14,
      card: 24,
      pill: 999,
    })) {
      expect(css).toContain(`--radius-${name}: ${value}px;`);
    }
    for (const radius of declarations("border-radius")) {
      expect(radius).toMatch(
        /^(var\(--radius-(sm|md|button|card|pill)\)|50%|0|inherit)$/,
      );
    }
  });
  it("uses only named elevation or no shadow", () => {
    for (const shadow of declarations("box-shadow")) {
      expect(shadow).toMatch(
        /^(none|var\(--elev-(sm|pop|nav|focus|sticker)\))$/,
      );
    }
  });
  it("disables motion for reduced motion preferences", () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toContain("transition: none !important;");
    expect(css).toContain("animation: none !important;");
    expect(css).toContain("transform: none !important;");
  });
  it("uses the requested scale and font weights", () => {
    const sizes = {
      xs: 12,
      sm: 13,
      base: 15,
      input: 16,
      md: 17,
      lg: 20,
      xl: 26,
      "2xl": 44,
    };
    for (const [name, px] of Object.entries(sizes)) {
      expect(css).toContain(`--text-${name}: ${px}px;`);
    }
    for (const weight of declarations("font-weight")) {
      expect(weight).toMatch(/^(200 800|400|450|500|600|700|750|800|inherit)$/);
    }
  });
  it("keeps Today solid pink with one inverted full-width action", () => {
    const today = [...css.matchAll(/(?:^|\n)\.today-action \{([^}]+)\}/g)].at(
      -1,
    )![1];
    expect(today).toContain("background: var(--pink);");
    expect(today).toContain("color: var(--sticker-ink);");
    expect(today).toContain("border: 0;");
    expect(today).toContain("box-shadow: none;");
    expect(today).not.toContain("gradient");
    expect(css).toMatch(
      /\.today-action \.button\.big[^{}]*\{[^}]*background: var\(--ink\);[^}]*color: var\(--paper\);[^}]*width: 100%;[^}]*min-height: 52px;/,
    );
  });
  it("keeps light and dark cards borderless without shadows", () => {
    expect(css.replace(/\s+/g, " ")).toContain(
      "section, .custody-ledger, .abono-hero, .welcome figure, .pot, .celebrate, .round-panel { border-radius: var(--radius-card); border: 0; box-shadow: none; }",
    );
    expect(css).not.toMatch(
      /:root\[data-theme="dark"\][^{}]*:is\([^)]*main section[^)]*\)\s*\{[^}]*border: 1px/,
    );
    expect(css).toMatch(
      /\.secondary \{[^}]*background: var\(--card-tint\);[^}]*border: 0;/,
    );
    expect(css).toMatch(
      /\.chip \{[^}]*border: 0;[^}]*background: var\(--card-tint\);/,
    );
    expect(css).toContain("--elev-sm: none;");
    expect(css).toContain("--elev-pop: none;");
    expect(css).toContain("--elev-nav: none;");
  });
  it("keeps form controls at the iOS zoom floor and keyboard focus visible", () => {
    expect(css).toMatch(
      /input,\s*select,\s*textarea \{[^}]*font-size: var\(--text-input\);/,
    );
    expect(css).toMatch(
      /input,\s*select,\s*textarea \{[^}]*border: 1px solid var\(--control-border\);/,
    );
    expect(css).toMatch(
      /:focus-visible,[^{}]+\{[^}]*outline: 2px solid var\(--ink\);/,
    );
  });
  it("shares interaction timing, keeps bars still on load, and reserves nav clearance", () => {
    for (const transition of declarations("transition")) {
      if (!transition.startsWith("none"))
        expect(transition).toContain("var(--ease)");
    }
    expect(css).not.toContain("transition: width");
    expect(css).toMatch(
      /\.pot-progress > span,[^{}]*progress \{\s*transition: none;/,
    );
    expect(css).toContain("transform: scale(0.98);");
    expect(css).toContain(
      "padding: 8px 16px calc(100px + env(safe-area-inset-bottom));",
    );
    expect(css).toMatch(/section \{[^}]*padding: 20px;[^}]*margin: 12px 0;/);
    expect(css).toMatch(/\.ipon-item \{[^}]*padding: 20px;[^}]*gap: 12px;/);
  });
  it("raises price-tag fractions with tabular body figures", () => {
    expect(css).toMatch(/body \{[^}]*font-variant-numeric: tabular-nums;/);
    expect(css).toMatch(
      /\.money \{[^}]*font-size: var\(--text-2xl\);[^}]*color: var\(--ink\);/,
    );
    expect(css).toMatch(
      /\.money \.money-sign \{[^}]*font-size: var\(--text-2xl\);[^}]*zoom: 0.5;/,
    );
    expect(css).toMatch(
      /\.money \.money-centavos \{[^}]*font-size: var\(--text-lg\);[^}]*font-weight: 600;[^}]*color: var\(--soft\);[^}]*margin-left: 2px;/,
    );
    expect(css).toMatch(
      /\.money \{[^}]*display: inline-flex;[^}]*align-items: flex-start;/,
    );
  });
  it("never uppercases or tracks out labels", () => {
    expect(css).not.toMatch(/text-transform:\s*uppercase/);
    expect(css).not.toMatch(/letter-spacing:\s*0\.(0[1-9]|[1-9])/);
    expect(css).toMatch(
      /\.section-label \{[^}]*color: var\(--ink\);[^}]*font-size: var\(--text-md\);[^}]*font-weight: 700;[^}]*letter-spacing: -0.01em;/,
    );
  });
  it("self-hosts Bricolage Grotesque before the system fallback", () => {
    expect(css).toContain(
      '--font-sans: "Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;',
    );
    expect(css).toMatch(
      /@font-face\s*\{\s*font-family: "Bricolage Grotesque";\s*src: url\("\/fonts\/bricolage-grotesque-latin-wght\.woff2"\) format\("woff2"\);\s*font-weight: 200 800;\s*font-display: swap;\s*\}/,
    );
    expect(css).not.toMatch(/https?:\/\/[^;]*fonts/);
  });
  it("fits fifteen 16px Home stickers with a 3px gap and card-colored outlines", () => {
    expect(css).toMatch(
      /\.tally\.tally-track:not\(\.proportional\) \{[^}]*--coin: 12px;[^}]*gap: 4px;/,
    );
    expect(css).toMatch(
      /\.tally\.tally-track:not\(\.proportional\) > span \{[^}]*height: var\(--coin\);[^}]*border-radius: var\(--radius-pill\);/,
    );
    expect(css).toMatch(
      /\.tally\.tally-track:not\(\.proportional\) > :is\(\.paid, \.pending\) \{[^}]*border: 0;/,
    );
  });
  it("puts the round status above the softer rate and dates", () => {
    expect(css).toMatch(/\.pot > \.pot-bottom \{[^}]*display: grid;/);
    expect(css).toMatch(
      /\.pot > \.pot-bottom > small:first-child \{[^}]*color: var\(--ink\);[^}]*font-size: var\(--text-sm\);[^}]*font-weight: 600;/,
    );
  });
  it("uses outlined rotated stickers and dashed empty slots", () => {
    expect(css).toMatch(
      /\.tally:not\(\.proportional\) \.paid[^{}]*\{[^}]*border: 2.5px solid var\(--sticker-outline\);[^}]*box-shadow: var\(--elev-sticker\);/,
    );
    expect(css).toContain("--sticker-outline: #ffffff;");
    expect(css).toContain("--sticker-outline: var(--paper);");
    expect(css).toContain("--elev-sticker: 0 1px 0 rgba(0, 0, 0, 0.18);");
    expect(css).toMatch(
      /\.tally:not\(\.proportional\) > span:nth-child\(4n \+ 1\)[^{}]*\{\s*rotate: -8deg;/,
    );
    expect(css).toMatch(
      /\.tally:not\(\.proportional\) \.open[^{}]*\{[^}]*background: transparent;[^}]*border: 1.5px dashed var\(--line\);/,
    );
  });
  it("presses only the newest sticker and respects reduced motion", () => {
    expect(css).toMatch(
      /\.paid:not\(:has\(~ \.paid\)\)[^{}]*\{\s*animation: sticker-press 220ms ease-out;/,
    );
    expect(css).toMatch(/@keyframes sticker-press \{\s*from \{\s*scale: 1.25;/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.tally \.paid,[\s\S]*?animation: none !important;/,
    );
    expect(css).not.toContain("animation: skeleton-pulse");
  });
  it("anchors a solid nav with a four-pixel active marker and solid header", () => {
    expect(css).toMatch(
      /\.app > nav \{[^}]*margin: 0;[^}]*border: 0;[^}]*border-top: 1px solid var\(--line\);[^}]*border-radius: 0;[^}]*background: var\(--card\);/,
    );
    expect(css).toMatch(
      /\.app > nav a\.active \{\s*background: transparent;\s*color: var\(--ink\);/,
    );
    expect(css).toMatch(
      /\.app > nav a\.active::before \{[^}]*height: 4px;[^}]*background: var\(--pink\);/,
    );
    expect(css).toMatch(/\.app > header \{[^}]*background: var\(--paper\);/);
    expect(css).not.toContain("backdrop-filter");
  });
});

const originalTokens = [
  {
    "--paper": "#f3f4fa",
    "--dots": "#e9ebf5",
    "--ink": "#1c1b3f",
    "--soft": "#565a7c",
    "--card": "#ffffff",
    "--card-tint": "#e9ebf5",
    "--pink": "#ff4f8b",
    "--pink-deep": "#c21e5c",
    "--blue": "#2e86ff",
    "--blue-deep": "#155ac2",
    "--mango": "#ffc233",
    "--mango-deep": "#855200",
    "--leaf": "#17a974",
    "--leaf-deep": "#186843",
    "--green": "#17a974",
    "--green-deep": "#186843",
    "--orange": "#ffc233",
    "--orange-deep": "#855200",
    "--purple": "#b89eff",
    "--purple-deep": "#5e3db3",
    "--danger": "#d2342c",
    "--sticker-ink": "#1c1b3f",
    "--control-border": "#828491",
    "--line": "color-mix(in srgb, var(--ink) 12%, transparent)",
    "--card-border": "var(--line)",
    "--highlight-border": "var(--line)",
    "--highlight": "var(--card-tint)",
    "--hover-card": "var(--card-tint)",
    "--inset": "var(--card-tint)",
    "--nav-surface": "var(--card)",
    "--action-pink": "var(--pink)",
    "--tan": "color-mix(in srgb, var(--soft) 28%, transparent)",
    "--success-tint": "color-mix(in srgb, var(--leaf) 12%, var(--card))",
    "--danger-tint": "color-mix(in srgb, var(--danger) 10%, var(--card))",
    "--brand-soft": "color-mix(in srgb, var(--pink) 14%, var(--card))",
    "--brand": "var(--pink-deep)",
    "--elev-sm": "none",
    "--display": "var(--font-sans)",
    "--radius-card": "24px",
    "--elev-pop": "none",
  },
  {
    "--paper": "#15142e",
    "--dots": "#2a2950",
    "--card": "#1f1e3d",
    "--card-tint": "#2a2950",
    "--ink": "#f3f2ff",
    "--soft": "#a9a8cf",
    "--pink": "#ff6b9e",
    "--blue": "#5aa2ff",
    "--mango": "#ffd166",
    "--leaf": "#5ed19a",
    "--green": "#5ed19a",
    "--orange": "#ffd166",
    "--purple": "#c3abff",
    "--pink-deep": "#ff9ebc",
    "--blue-deep": "#8cd0ff",
    "--mango-deep": "#ffd166",
    "--leaf-deep": "#89dfb5",
    "--green-deep": "#89dfb5",
    "--orange-deep": "#ffd166",
    "--purple-deep": "#d0bfff",
    "--danger": "#ff9f96",
    "--control-border": "#777988",
    "--elev-sm": "none",
    "--line": "color-mix(in srgb, #ffffff 9%, transparent)",
    "--elev-pop": "none",
    "--nav-surface": "var(--card)",
  },
];

it("checks every winning custom property against the identity palette", () => {
  const blocks = [
    css.match(/:root\s*\{([^}]+)\}/)![1],
    css.match(/:root\[data-theme="dark"\]\s*\{([^}]+)\}/)![1],
  ];
  blocks.forEach((block, theme) => {
    const values = Object.fromEntries(
      [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [
        m[1],
        m[2].replace(/\s+/g, " ").trim(),
      ]),
    );
    for (const [key, value] of Object.entries(originalTokens[theme])) {
      expect(values[key], key).toBe(value);
    }
  });
});
