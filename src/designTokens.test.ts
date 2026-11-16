import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const declarations = (property: string) =>
  [...css.matchAll(new RegExp(`(?<![\\w-])${property}:\\s*([^;]+);`, "g"))].map(
    (m) => m[1].trim(),
  );

describe("aesthetic design contract", () => {
  it("has one light and one dark token source", () => {
    expect(css.match(/:root\s*\{/g)).toHaveLength(1);
    expect(css.match(/:root\[data-theme="dark"\]\s*\{/g)).toHaveLength(1);
  });
  it("uses only the type scale", () => {
    for (const size of declarations("font-size")) {
      expect(size).toMatch(
        /^(var\(--text-(xs|sm|base|input|md|lg|xl|2xl)\)|inherit)$/,
      );
    }
  });
  it("uses only the radius scale", () => {
    for (const [name, value] of Object.entries({
      sm: 10,
      md: 14,
      card: 20,
      pill: 999,
    })) {
      expect(css).toContain(`--radius-${name}: ${value}px;`);
    }
    for (const radius of declarations("border-radius")) {
      expect(radius).toMatch(
        /^(var\(--radius-(sm|md|card|pill)\)|50%|0|inherit)$/,
      );
    }
  });
  it("uses only named elevation or no shadow", () => {
    for (const shadow of declarations("box-shadow")) {
      expect(shadow).toMatch(/^(none|var\(--elev-(sm|pop|nav|focus)\))$/);
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
      "2xl": 34,
    };
    for (const [name, px] of Object.entries(sizes)) {
      expect(css).toContain(`--text-${name}: ${px}px;`);
    }
    for (const weight of declarations("font-weight")) {
      expect(weight).toMatch(/^(400|500|650|800|inherit)$/);
    }
  });
  it("keeps the Today card flat with the only pop shadow", () => {
    const today = [...css.matchAll(/(?:^|\n)\.today-action \{([^}]+)\}/g)].at(
      -1,
    )![1];
    expect(today).toContain("background: var(--brand-soft);");
    expect(today).toContain("border: 0;");
    expect(today).toContain("box-shadow: none;");
    expect(today).not.toContain("gradient");
    expect(css.match(/box-shadow: var\(--elev-pop\);/g)).toHaveLength(1);
    expect(css).toMatch(
      /\.today-action \.button.big:not\(\.secondary\) \{\s*box-shadow: var\(--elev-pop\);/,
    );
  });
  it("uses borderless light cards and hairlines without shadows on dark cards", () => {
    const flat = css.replace(/\s+/g, " ");
    expect(flat).toContain(
      "section, .custody-ledger, .abono-hero, .welcome figure, .pot, .celebrate, .round-panel { border-radius: var(--radius-card); border: 0; box-shadow: var(--elev-sm); }",
    );
    expect(flat).toContain(
      ':root[data-theme="dark"] :is( main section, .pot, .custody-ledger, .round-panel, .ipon-item, .abono-hero, .welcome figure, .celebrate, .celebration-toast ) { border: 1px solid var(--line); box-shadow: none; }',
    );
    expect(css).toMatch(
      /\.secondary \{[^}]*background: var\(--card-tint\);[^}]*border: 0;/,
    );
    expect(css).toMatch(
      /\.chip \{[^}]*border: 0;[^}]*background: var\(--card-tint\);/,
    );
  });
  it("keeps form controls at the iOS zoom floor and keyboard focus visible", () => {
    expect(css).toMatch(
      /input,\s*select,\s*textarea \{[^}]*font-size: var\(--text-input\);/,
    );
    expect(css).toMatch(
      /input,\s*select,\s*textarea \{[^}]*border: 1px solid var\(--control-border\);/,
    );
    expect(css).toMatch(
      /:focus-visible,[^{}]+\{[^}]*outline: 2px solid var\(--blue-deep\);/,
    );
  });
  it("shares transition timing, animates bars at 400ms, and reserves nav clearance", () => {
    for (const transition of declarations("transition")) {
      if (!transition.startsWith("none"))
        expect(transition).toContain("var(--ease)");
    }
    expect(css).toContain(
      "transition: width var(--ease);\n  transition-duration: 400ms;",
    );
    expect(css).toContain("transform: scale(0.98);");
    expect(css).toContain(
      "padding: 8px 16px calc(100px + env(safe-area-inset-bottom));",
    );
    expect(css).toMatch(/section \{[^}]*padding: 20px;[^}]*margin: 12px 0;/);
    expect(css).toMatch(/\.ipon-item \{[^}]*padding: 20px;[^}]*gap: 12px;/);
  });
  it("keeps hero fractions at sixty percent with tabular body figures", () => {
    expect(css).toMatch(/body \{[^}]*font-variant-numeric: tabular-nums;/);
    expect(css).toMatch(
      /\.money \{[^}]*font-size: var\(--text-2xl\);[^}]*color: var\(--ink\);/,
    );
    expect(css).toMatch(
      /\.money \.money-centavos \{[^}]*zoom: 0.6;[^}]*color: var\(--soft\);/,
    );
  });
});

const originalTokens = [
  {
    "--paper": "#f6f5f2",
    "--dots": "#e5e6eb",
    "--ink": "#141418",
    "--soft": "#595a66",
    "--card": "#ffffff",
    "--card-tint": "#f2f1ee",
    "--pink": "#ff85a9",
    "--pink-deep": "#b82858",
    "--blue": "#6cb8ff",
    "--blue-deep": "#155fa0",
    "--mango": "#f7be42",
    "--mango-deep": "#855200",
    "--leaf": "#42c288",
    "--leaf-deep": "#186843",
    "--green": "#42c288",
    "--green-deep": "#186843",
    "--orange": "#f7be42",
    "--orange-deep": "#855200",
    "--purple": "#b89eff",
    "--purple-deep": "#5e3db3",
    "--danger": "#ba2b26",
    "--sticker-ink": "#141418",
    "--control-border": "#828491",
    "--line": "color-mix(in srgb, var(--ink) 8%, transparent)",
    "--card-border": "var(--line)",
    "--highlight-border": "var(--line)",
    "--highlight": "var(--card-tint)",
    "--hover-card": "var(--card-tint)",
    "--inset": "var(--card-tint)",
    "--nav-surface": "color-mix(in srgb, var(--card) 82%, transparent)",
    "--action-pink": "var(--pink)",
    "--tan": "color-mix(in srgb, var(--soft) 28%, transparent)",
    "--success-tint": "color-mix(in srgb, var(--leaf) 12%, var(--card))",
    "--danger-tint": "color-mix(in srgb, var(--danger) 10%, var(--card))",
    "--brand-soft": "color-mix(in srgb, var(--pink) 14%, var(--card))",
    "--brand": "var(--pink-deep)",
    "--elev-sm":
      "0 1px 2px rgba(24, 20, 16, 0.04), 0 6px 20px -8px rgba(24, 20, 16, 0.08)",
    "--display": "var(--font-sans)",
    "--radius-card": "20px",
    "--elev-pop": "0 10px 30px -12px rgba(184, 40, 88, 0.45)",
  },
  {
    "--paper": "#0c0d11",
    "--dots": "#252730",
    "--card": "#15171e",
    "--card-tint": "#1d2029",
    "--ink": "#f3f4f6",
    "--soft": "#9fa2b2",
    "--pink": "#ff8fb1",
    "--blue": "#7bc6ff",
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
    "--elev-sm": "inset 0 1px 0 rgba(255, 255, 255, 0.03)",
    "--line": "color-mix(in srgb, #ffffff 7%, transparent)",
    "--elev-pop": "0 10px 30px -14px rgba(255, 133, 169, 0.5)",
    "--nav-surface": "color-mix(in srgb, var(--card) 80%, transparent)",
  },
];

it("preserves every original winning custom property in each theme", () => {
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
