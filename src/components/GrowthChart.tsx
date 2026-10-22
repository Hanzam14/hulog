import { scalePoints, type GrowthPoint } from "../growth";
import { money, shortDate } from "../helpers";
import { t } from "../i18n";
import type { Tone } from "./shared";

const WIDTH = 320;
const HEIGHT = 140;

/**
 * Compact savings-over-time step chart: hand-rolled SVG, no animation, with a
 * dashed target line. Renders nothing until there are two points to join.
 */
export default function GrowthChart({
  series,
  tone,
  targetCentavos,
}: {
  series: GrowthPoint[];
  tone: Tone;
  targetCentavos?: number;
}) {
  if (series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];
  const chart = scalePoints(series, WIDTH, HEIGHT, targetCentavos);
  const end = chart.points[chart.points.length - 1];
  const summary =
    targetCentavos === undefined
      ? t("{amount} saved since {date}", {
          amount: money(last.centavos),
          date: shortDate(first.date),
        })
      : t("{amount} of {target} saved since {date}", {
          amount: money(last.centavos),
          target: money(targetCentavos),
          date: shortDate(first.date),
        });
  return (
    <figure className={`growth-chart ${tone}`}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={summary}
        preserveAspectRatio="xMidYMid meet"
      >
        <line
          className="growth-zero"
          x1={0}
          x2={WIDTH}
          y1={chart.zeroY}
          y2={chart.zeroY}
        />
        {chart.targetY !== null && (
          <line
            className="growth-target"
            x1={0}
            x2={WIDTH}
            y1={chart.targetY}
            y2={chart.targetY}
          />
        )}
        <path className="growth-line" d={chart.path} />
        <circle className="growth-dot" cx={end.x} cy={end.y} r={4} />
      </svg>
      <figcaption>
        <span>{shortDate(first.date)}</span>
        <span>
          {shortDate(last.date)} · <b>{money(last.centavos)}</b>
        </span>
      </figcaption>
    </figure>
  );
}
