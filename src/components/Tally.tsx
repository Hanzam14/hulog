import type { Tone } from "./shared";
import { t } from "../i18n";

/** One row of the planner: a sticker per paid day, dashed while waiting. */
export default function Tally({
  label,
  paid,
  pending,
  total,
  tone,
}: {
  label: string;
  paid: number;
  pending: number;
  total: number;
  tone: Tone;
}) {
  const marks = Array.from({ length: total }, (_, i) =>
    i < paid ? "paid" : i < paid + pending ? "pending" : "open",
  );
  return (
    <div
      className={`tally ${tone}`}
      role="img"
      aria-label={t("{label}: {paid} of {total} days paid, {pending} pending", {
        label,
        paid,
        total,
        pending,
      })}
    >
      {marks.map((mark, i) => (
        <span key={i} className={mark} />
      ))}
    </div>
  );
}
