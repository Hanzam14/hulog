import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const light = css.match(/:root\s*\{([^}]+)\}/)![1];
const dark = css.match(/:root\[data-theme="dark"\]\s*\{([^}]+)\}/)![1];
function value(block: string, variable: string): string {
  const match = block.match(
    new RegExp(`--${variable}:\\s*(#[a-f0-9]{6});`, "i"),
  );
  if (!match) throw new Error(`Missing palette variable ${variable}`);
  return match[1];
}
function luminance(hex: string) {
  const rgb = [1, 3, 5].map(
    (offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const linear = rgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(first: string, second: string) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
describe("planner text contrast", () => {
  it.each(["pink", "blue", "green", "orange", "purple"])(
    "%s text meets 4.5:1 on white and dark cards",
    (color) => {
      expect(
        contrast(value(light, `${color}-deep`), "#ffffff"),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(value(dark, `${color}-deep`), value(dark, "card")),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(value(light, color), value(light, "sticker-ink")),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});
