import type { Tone } from "./shared";
import { t } from "../i18n";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { coinColumns } from "../coins";
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
  const [cols, setCols] = useState<number | null>(null);
  useEffect(() => {
    const el = row.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setCols(coinColumns(total, el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [total]);
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
      style={cols ? ({ "--coin-cols": cols } as CSSProperties) : undefined}
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
        <span
          key={i}
          className={mark}
          style={
            { "--coin-rotation": `${((i * 7) % 13) - 6}deg` } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
