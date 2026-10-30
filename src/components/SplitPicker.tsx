import { t } from "../i18n";
import { shareLabel, type SplitChoice, type SplitState } from "../split";

/**
 * How an expense is shared: 50/50, all mine, all theirs, or a custom percent.
 * It fills in the other member's share (see src/split.ts); the share field stays
 * editable below it.
 */
export default function SplitPicker({
  split,
  onChange,
  otherName,
  otherIsMe,
}: {
  split: SplitState;
  onChange: (next: SplitState) => void;
  /** The member who does not pay: their share is what the percent means. */
  otherName: string;
  otherIsMe: boolean;
}) {
  const pick = (choice: SplitChoice, label: string) => (
    <button
      type="button"
      className={`pick ${split.choice === choice ? "on" : ""}`}
      aria-pressed={split.choice === choice}
      onClick={() => onChange({ ...split, choice })}
    >
      {label}
    </button>
  );
  return (
    <>
      <div className="chips">
        {pick("half", t("50/50 split"))}
        {pick("mine", t("All mine"))}
        {pick(
          "theirs",
          otherName ? t("All for {name}", { name: otherName }) : t("All theirs"),
        )}
        {pick("custom", t("Custom %"))}
      </div>
      {split.choice === "custom" && (
        <label>
          {shareLabel(otherIsMe, otherName, "%")}
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="30"
            value={split.percent}
            onChange={(e) =>
              onChange({ choice: "custom", percent: e.target.value })
            }
          />
        </label>
      )}
    </>
  );
}
