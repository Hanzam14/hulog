import { parsePesos } from "./helpers";
import { t } from "./i18n";

/**
 * Splitting a shared expense (SPEC 10.15). The form fills in the other member's
 * share, the amount they owe the member who paid, in whole centavos. Whatever
 * the other member does not owe stays with the payer, so the two parts always
 * add up to the total exactly.
 */
export type SplitChoice = "half" | "mine" | "theirs" | "custom";

export interface SplitState {
  /** The preset in use, or null once the share was typed by hand. */
  choice: SplitChoice | null;
  /** The custom percentage, as typed. */
  percent: string;
}

export const NO_SPLIT: SplitState = { choice: null, percent: "" };

/** "33" or "33.33" as hundredths of a percent (0 to 10000), or null if invalid. */
export function parsePercent(text: string): number | null {
  const value = text.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const hundredths = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return hundredths <= 10000 ? hundredths : null;
}

/** `total × percent`, rounded half up to the centavo. Never below 0 or above the total. */
export function shareCentavos(
  totalCentavos: number,
  hundredthsOfPercent: number,
): number {
  const numerator = BigInt(totalCentavos) * BigInt(hundredthsOfPercent);
  const share = Number((numerator + 5000n) / 10000n);
  return Math.min(totalCentavos, Math.max(0, share));
}

/**
 * The other member's share for a preset, or null while the input is not usable.
 * `payerIsMe`: the member filling in the form paid. "Ako lahat" means the whole
 * expense is the form-filler's own, "Siya lahat" means it is all the other
 * member's.
 */
export function owedForSplit(
  totalCentavos: number,
  split: SplitState,
  payerIsMe: boolean,
): number | null {
  switch (split.choice) {
    case "half":
      return shareCentavos(totalCentavos, 5000);
    case "mine":
      return payerIsMe ? 0 : totalCentavos;
    case "theirs":
      return payerIsMe ? totalCentavos : 0;
    case "custom": {
      const hundredths = parsePercent(split.percent);
      return hundredths === null
        ? null
        : shareCentavos(totalCentavos, hundredths);
    }
    default:
      return null;
  }
}

/** The text for the share field: computed from the preset, else what was typed. */
export function owedFieldText(
  totalText: string,
  split: SplitState,
  payerIsMe: boolean,
  typed: string,
): string {
  if (!split.choice) return typed;
  try {
    const owed = owedForSplit(parsePesos(totalText), split, payerIsMe);
    return owed === null ? "" : (owed / 100).toFixed(2);
  } catch {
    return "";
  }
}

/** "Utang mo kay Maya (₱)" when Maya paid, "Utang ni Maya sa'yo (₱)" when you paid. */
export function shareLabel(
  otherIsMe: boolean,
  otherName: string,
  unit: "₱" | "%",
): string {
  return unit === "₱"
    ? otherIsMe
      ? otherName
        ? t("You owe {name} (₱)", { name: otherName })
        : t("Your share (₱)")
      : t("{name} owes you (₱)", { name: otherName })
    : otherIsMe
      ? t("Your share (%)")
      : t("{name}'s share (%)", { name: otherName });
}
