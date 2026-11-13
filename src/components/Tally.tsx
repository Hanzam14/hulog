import type { Tone } from "./shared";
import { t } from "../i18n";
import { useEffect, useRef } from "react";
/** One row of the planner: a sticker per paid day, dashed while waiting. */
export default function Tally({
  label,
  paid,
  pending,
  total,
  tone,
  className = "",
  decorative = false,
}: {
  label: string;
  paid: number;
  pending: number;
  total: number;
  tone: Tone;
  className?: string;
  decorative?: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  const previousPaid = useRef(paid);
  useEffect(() => {
    if (paid > previousPaid.current) {
      row.current?.querySelectorAll<HTMLElement>(".paid").forEach((coin, i) => {
        if (i >= previousPaid.current) {
          coin.classList.add("stamped");
          coin.addEventListener(
            "animationend",
            () => coin.classList.remove("stamped"),
            { once: true },
          );
        }
      });
    }
    previousPaid.current = paid;
  }, [paid]);
  const marks = Array.from({ length: total }, (_, i) =>
    i < paid ? "paid" : i < paid + pending ? "pending" : "open",
  );
  return (
    <div
      ref={row}
      className={`tally ${tone} ${className}`.trim()}
      {...(decorative
        ? { "aria-hidden": true }
        : {
            role: "img",
            "aria-label": t(
              "{label}: {paid} of {total} days paid, {pending} pending",
              { label, paid, total, pending },
            ),
          })}
    >
      {marks.map((mark, i) => (
        <span key={i} className={mark} />
      ))}
    </div>
  );
}
