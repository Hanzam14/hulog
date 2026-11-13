import type { Tone } from "./shared";
import { t } from "../i18n";
import { useEffect, useRef, type CSSProperties } from "react";

const MAX_SEGMENTED_TRACK_DAYS = 30;

/** One row of the planner: dots, a full-width segmented track, or a proportional track for long rounds. */
export default function Tally({
  label,
  paid,
  pending,
  total,
  tone,
  className = "",
  decorative = false,
  variant = "dots",
}: {
  label: string;
  paid: number;
  pending: number;
  total: number;
  tone: Tone;
  className?: string;
  decorative?: boolean;
  variant?: "dots" | "track";
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
  const isTrack = variant === "track";
  const isProportional = isTrack && total > MAX_SEGMENTED_TRACK_DAYS;
  const safeTotal = Math.max(0, total);
  const clampedPaid = Math.min(safeTotal, Math.max(0, paid));
  const clampedPending = Math.min(
    safeTotal - clampedPaid,
    Math.max(0, pending),
  );
  const paidPct = safeTotal > 0 ? (clampedPaid / safeTotal) * 100 : 0;
  const pendingPct = safeTotal > 0 ? (clampedPending / safeTotal) * 100 : 0;
  const hasOpen = clampedPaid + clampedPending < safeTotal || safeTotal === 0;
  const marks = isProportional
    ? []
    : Array.from({ length: total }, (_, i) =>
        i < paid ? "paid" : i < paid + pending ? "pending" : "open",
      );
  const trackStyle =
    isTrack && !isProportional
      ? ({ "--tally-total": Math.max(1, total) } as CSSProperties)
      : undefined;
  return (
    <div
      ref={row}
      className={`tally ${isTrack ? "tally-track" : ""} ${isProportional ? "proportional" : ""} ${tone} ${className}`
        .replace(/\s+/g, " ")
        .trim()}
      style={trackStyle}
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
      {isProportional ? (
        <>
          {clampedPaid > 0 && (
            <span className="paid" style={{ width: `${paidPct}%` }} />
          )}
          {clampedPending > 0 && (
            <span className="pending" style={{ width: `${pendingPct}%` }} />
          )}
          {hasOpen && <span className="open" style={{ flex: 1 }} />}
        </>
      ) : (
        marks.map((mark, i) => <span key={i} className={mark} />)
      )}
    </div>
  );
}
