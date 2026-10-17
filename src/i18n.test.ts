import { afterEach, describe, expect, it, vi } from "vitest";
import { readLang, setLang, strings, t } from "./i18n";

afterEach(() => {
  setLang("taglish");
  vi.unstubAllGlobals();
});

describe("device language", () => {
  it("has identical dictionary keys in every language", () => {
    expect(Object.keys(strings.en).sort()).toEqual(
      Object.keys(strings.taglish).sort(),
    );
    expect(Object.keys(strings.tl).sort()).toEqual(
      Object.keys(strings.taglish).sort(),
    );
  });
  it("interpolates names and amounts without interpreting replacement characters", () => {
    setLang("en");
    expect(
      t("Decline {name}'s {amount}", { name: "$& Ana", amount: "₱50.00" }),
    ).toBe("Decline $& Ana's ₱50.00");
    setLang("tl");
    expect(t("{days} days", { days: 3 })).toBe("3 araw");
  });
  it("falls back to Taglish when storage fails and still switches this session", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("disabled");
      },
      setItem: () => {
        throw new Error("disabled");
      },
    });
    expect(readLang()).toBe("taglish");
    setLang("en");
    expect(t("Save")).toBe("Save");
  });
  it("stores the device choice and applies the document language", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: () => "tl", setItem });
    vi.stubGlobal("document", { documentElement: { lang: "" } });
    expect(readLang()).toBe("tl");
    setLang("en");
    expect(setItem).toHaveBeenCalledWith("hulog-lang", "en");
    expect(document.documentElement.lang).toBe("en");
    setLang("taglish");
    expect(document.documentElement.lang).toBe("tl");
  });
  it("translates v2 keys across en, tl, and taglish", () => {
    setLang("en");
    expect(t("Goal reached ✓")).toBe("Goal reached ✓");
    expect(t("Tracker")).toBe("Tracker");
    expect(
      t("{debtor} owes {creditor} {amount}", {
        debtor: "Ana",
        creditor: "Ben",
        amount: "₱100.00",
      }),
    ).toBe("Ana owes Ben ₱100.00");

    setLang("tl");
    expect(t("Goal reached ✓")).toBe("Naabot ang layunin ✓");
    expect(t("Tracker")).toBe("Tracker");
    expect(
      t("{debtor} owes {creditor} {amount}", {
        debtor: "Ana",
        creditor: "Ben",
        amount: "₱100.00",
      }),
    ).toBe("May utang si Ana kay Ben na ₱100.00");

    setLang("taglish");
    expect(t("Goal reached ✓")).toBe("Goal reached ✓");
    expect(t("Tracker")).toBe("Tracker");
    expect(
      t("{debtor} owes {creditor} {amount}", {
        debtor: "Ana",
        creditor: "Ben",
        amount: "₱100.00",
      }),
    ).toBe("May utang si Ana kay Ben na ₱100.00");
  });
});
