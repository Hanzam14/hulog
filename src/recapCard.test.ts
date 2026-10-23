import { beforeEach, describe, expect, it } from "vitest";
import { setLang } from "./i18n";
import { drawRecapCard } from "./recapCard";

/** A canvas stand-in that records every string drawn. */
function fakeContext() {
  const drawn: string[] = [];
  const ctx = new Proxy(
    {
      measureText: (text: string) => ({ width: text.length * 10 }),
      fillText: (text: string) => {
        drawn.push(text);
      },
    } as Record<string, unknown>,
    {
      get: (target, key: string) => target[key] ?? (() => undefined),
      set: () => true,
    },
  );
  return { ctx: ctx as unknown as CanvasRenderingContext2D, drawn };
}

beforeEach(() => setLang("en"));

describe("recap card", () => {
  it("names the period it is for and says the right thing when nothing moved", () => {
    const month = fakeContext();
    drawRecapCard(month.ctx, "2026-10", "Kami", []);
    expect(month.drawn).toContain("October 2026");
    expect(month.drawn).toContain("Nothing moved this month");

    const year = fakeContext();
    drawRecapCard(year.ctx, "2026", "Kami", []);
    expect(year.drawn).toContain("2026");
    expect(year.drawn).toContain("Nothing moved this year");
    expect(year.drawn).not.toContain("Nothing moved this month");
  });

  it("draws only the lines it is given", () => {
    const { ctx, drawn } = fakeContext();
    drawRecapCard(ctx, "2026", "Kami", [
      { label: "Abono spent", value: "₱1.00", tone: "blue" },
    ]);
    expect(drawn).toContain("Abono spent");
    expect(drawn).toContain("₱1.00");
    expect(drawn).not.toContain("Nothing moved this year");
  });
});
