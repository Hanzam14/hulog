import type { Snapshot } from "../data";
import { t } from "../i18n";
import { memberStreak } from "../streaks";

const minStreak = 2;

/** A quiet "🔥 N rounds na buo" chip once a member has finished 2+ clean rounds in a row. */
export default function StreakChip({
  data,
  memberId,
}: {
  data: Pick<Snapshot, "cycles" | "progress">;
  memberId: string;
}) {
  const count = memberStreak(data, memberId);
  if (count < minStreak) return null;
  return (
    <span className="chip streak-chip">
      {t("🔥 {count} rounds na buo", { count })}
    </span>
  );
}
