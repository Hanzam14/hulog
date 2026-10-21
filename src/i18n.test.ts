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
  it("translates new wallet and ipon stepper keys and audited taglish/tl strings across all languages", () => {
    setLang("en");
    expect(t("Rename wallet")).toBe("Rename wallet");
    expect(t("One hulog less")).toBe("One step less");
    expect(t("One hulog more")).toBe("One step more");
    expect(t("Status")).toBe("Status");
    expect(t("Share → Add to Home Screen")).toBe("Share → Add to Home Screen");
    expect(t("Auto")).toBe("Auto");
    expect(t("Continue with Google")).toBe("Continue with Google");
    expect(
      t("Confirm {name}'s {amount}", { name: "Ana", amount: "₱50.00" }),
    ).toBe("Confirm Ana's ₱50.00");

    setLang("tl");
    expect(t("Rename wallet")).toBe("Palitan ang pangalan ng wallet");
    expect(t("One hulog less")).toBe("Bawasan ng isang hulog");
    expect(t("One hulog more")).toBe("Dagdagan ng isang hulog");
    expect(t("Status")).toBe("Kalagayan");
    expect(t("Share → Add to Home Screen")).toBe(
      "I-share → Idagdag sa Home Screen",
    );
    expect(t("Auto")).toBe("Kusa");
    expect(t("Continue with Google")).toBe("Magpatuloy gamit ang Google");
    expect(
      t("Confirm {name}'s {amount}", { name: "Ana", amount: "₱50.00" }),
    ).toBe("Kumpirmahin ang ₱50.00 ni Ana");

    setLang("taglish");
    expect(t("Rename wallet")).toBe("I-rename ang wallet");
    expect(t("One hulog less")).toBe("Bawasan ng 1 hulog");
    expect(t("One hulog more")).toBe("Dagdagan ng 1 hulog");
    expect(t("Continue with Google")).toBe("Mag-sign in sa Google");
    expect(
      t("Confirm {name}'s {amount}", { name: "Ana", amount: "₱50.00" }),
    ).toBe("I-confirm ang ₱50.00 ni Ana");
    expect(t("Settling · last day to confirm")).toBe(
      "Settling, last day na para mag-confirm",
    );
    expect(t("savings_goals")).toBe("mga ipon goal");
    expect(t("abono_entries")).toBe("mga abono");
  });
});
