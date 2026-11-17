/** A goal's progress as a ring with the percent in the middle. */
export default function ProgressRing({
  percent,
  label,
}: {
  percent: number;
  label: string;
}) {
  const shown = Math.max(0, Math.round(percent));
  const value = Math.min(100, shown);
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  return (
    <span
      className="ring"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle className="ring-track" cx="32" cy="32" r={radius} />
        <circle
          className="ring-fill"
          cx="32"
          cy="32"
          r={radius}
          strokeDasharray={circumference.toFixed(2)}
          strokeDashoffset={(circumference * (1 - value / 100)).toFixed(2)}
        />
      </svg>
      <span className="ipon-pct">{shown}%</span>
    </span>
  );
}
