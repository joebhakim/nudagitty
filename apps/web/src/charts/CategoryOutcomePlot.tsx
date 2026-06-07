import {
  clamp,
  coerceBinary,
  formatPercent,
  formatValue
} from "../shared/formatting";

export type ScatterPoint = { x: number; y: number; weight: number; index: number };

type CategoryOutcomeKind = "binary" | "continuous";

export type CategoryOutcomeSummary = {
  group: 0 | 1;
  label: string;
  tone: "treated" | "untreated";
  mean: number | null;
  lower: number | null;
  upper: number | null;
  nEff: number | null;
  points: ScatterPoint[];
};

export function CategoryOutcomePlot(props: {
  points: ScatterPoint[];
  summaries: CategoryOutcomeSummary[];
  xLabel: string;
  yLabel: string;
  yDomain: [number, number];
  outcomeKind: CategoryOutcomeKind;
  compact?: boolean;
  ariaLabel?: string;
}) {
  const width = props.compact ? 300 : 360;
  const height = props.compact ? 168 : 188;
  const plot = { left: 42, right: 18, top: 18, bottom: 46 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const [min, max] = props.yDomain;
  const y = (value: number) => plot.top + (1 - ((value - min) / Math.max(max - min, 1e-9))) * plotHeight;
  const groupX = (group: 0 | 1) => plot.left + plotWidth * (group === 0 ? 0.3 : 0.7);
  const maxWeight = Math.max(...props.points.map((point) => point.weight), 1);
  const formatOutcome = (value: number) => props.outcomeKind === "binary" ? formatPercent(value) : formatValue(value);
  const pointY = (point: ScatterPoint, group: 0 | 1) => {
    if (props.outcomeKind !== "binary") return y(point.y);
    const outcome = coerceBinary(point.y);
    const jitter = deterministicCategoryOutcomeJitter(point.index, group, 13) * 0.045;
    return y(outcome === 1 ? clamp(0.97 + jitter, 0.93, 1) : clamp(0.03 + jitter, 0, 0.07));
  };
  const pointX = (point: ScatterPoint, group: 0 | 1) => groupX(group) + deterministicCategoryOutcomeJitter(point.index, group, 29) * (props.compact ? 26 : 34);
  return (
    <svg
      className={`category-outcome-plot${props.compact ? " compact" : ""}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={props.ariaLabel ?? `${props.yLabel} by ${props.xLabel}`}
    >
      <rect className="category-outcome-background" x={plot.left} y={plot.top} width={plotWidth} height={plotHeight} rx="5" />
      <line className="category-outcome-axis" x1={plot.left} x2={plot.left + plotWidth} y1={plot.top + plotHeight} y2={plot.top + plotHeight} />
      <line className="category-outcome-axis" x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.top + plotHeight} />
      <line className="category-outcome-guide" x1={plot.left} x2={plot.left + plotWidth} y1={y(max)} y2={y(max)} />
      <line className="category-outcome-guide" x1={plot.left} x2={plot.left + plotWidth} y1={y(min)} y2={y(min)} />
      <text className="category-outcome-axis-label y-start" x={plot.left - 7} y={y(min) + 4}>{formatOutcome(min)}</text>
      <text className="category-outcome-axis-label y-end" x={plot.left - 7} y={y(max) + 4}>{formatOutcome(max)}</text>
      <text className="category-outcome-axis-title x" x={plot.left + plotWidth / 2} y={height - 4}>{abbreviateLabel(props.xLabel, props.compact ? 22 : 28)}</text>
      <text className="category-outcome-axis-title y" x="12" y={plot.top + plotHeight / 2} transform={`rotate(-90 12 ${plot.top + plotHeight / 2})`}>{abbreviateLabel(props.yLabel, props.compact ? 18 : 24)}</text>
      {props.summaries.map((summary) => {
        const x = groupX(summary.group);
        return (
          <g className={`category-outcome-group ${summary.tone}`} key={summary.group}>
            <line className="category-outcome-category-guide" x1={x} x2={x} y1={plot.top} y2={plot.top + plotHeight} />
            {summary.points.map((point) => {
              const normalizedWeight = Math.sqrt(Math.max(0, point.weight) / maxWeight);
              return (
                <circle
                  className={`category-outcome-observation ${summary.tone}`}
                  cx={pointX(point, summary.group)}
                  cy={pointY(point, summary.group)}
                  r={1.65 + normalizedWeight * 1.65}
                  key={`${summary.group}-${point.index}`}
                  style={{ opacity: 0.16 + normalizedWeight * 0.32 }}
                />
              );
            })}
            {summary.lower !== null && summary.upper !== null && (
              <g className={`category-outcome-ci ${summary.tone}`}>
                <line x1={x} x2={x} y1={y(summary.upper)} y2={y(summary.lower)} />
                <line x1={x - 9} x2={x + 9} y1={y(summary.upper)} y2={y(summary.upper)} />
                <line x1={x - 9} x2={x + 9} y1={y(summary.lower)} y2={y(summary.lower)} />
              </g>
            )}
            {summary.mean !== null && (
              <>
                <circle className={`category-outcome-summary-point ${summary.tone}`} cx={x} cy={y(summary.mean)} r={5.2} />
                <text className="category-outcome-summary-value" x={x} y={Math.max(plot.top + 10, y(summary.mean) - 8)}>{formatOutcome(summary.mean)}</text>
              </>
            )}
            <text className="category-outcome-group-label" x={x} y={height - 23}>{categoryOutcomeGroupTickLabel(summary.label, summary.group, Boolean(props.compact))}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function continuousOutcomeSummaries(points: ScatterPoint[], xLabel: string): CategoryOutcomeSummary[] {
  return [
    continuousOutcomeSummary(points, 0, binaryAxisValueLabel(xLabel, 0), "untreated"),
    continuousOutcomeSummary(points, 1, binaryAxisValueLabel(xLabel, 1), "treated")
  ];
}

export function binaryOutcomeSummaries(points: ScatterPoint[], xLabel: string): CategoryOutcomeSummary[] {
  return [
    binaryOutcomeSummary(points, 0, binaryAxisValueLabel(xLabel, 0), "untreated"),
    binaryOutcomeSummary(points, 1, binaryAxisValueLabel(xLabel, 1), "treated")
  ];
}

export function categoryOutcomeDomain(base: [number, number], summaries: CategoryOutcomeSummary[], binary: boolean): [number, number] {
  if (binary) return [0, 1];
  const values = [base[0], base[1]];
  for (const summary of summaries) {
    if (summary.mean !== null) values.push(summary.mean);
    if (summary.lower !== null) values.push(summary.lower);
    if (summary.upper !== null) values.push(summary.upper);
  }
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return base;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (Math.abs(max - min) < 1e-9) return [min - 1, max + 1];
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

export function weightedPointMoments(points: ScatterPoint[], groupValue: 0 | 1): { mean: number; variance: number; nEff: number } | null {
  let sumWeight = 0;
  let sumWeightSquared = 0;
  let sum = 0;
  const retained: Array<{ value: number; weight: number }> = [];
  for (const point of points) {
    if (coerceBinary(point.x) !== groupValue || point.weight <= 0) continue;
    retained.push({ value: point.y, weight: point.weight });
    sumWeight += point.weight;
    sumWeightSquared += point.weight * point.weight;
    sum += point.y * point.weight;
  }
  if (sumWeight <= 0 || sumWeightSquared <= 0) return null;
  const mean = sum / sumWeight;
  const variance = retained.reduce((acc, item) => acc + item.weight * (item.value - mean) ** 2, 0) / sumWeight;
  return {
    mean,
    variance,
    nEff: sumWeight * sumWeight / sumWeightSquared
  };
}

function continuousOutcomeSummary(points: ScatterPoint[], group: 0 | 1, label: string, tone: "treated" | "untreated"): CategoryOutcomeSummary {
  const groupPoints = binaryContinuousPointsForGroup(points, group);
  const moments = weightedPointMoments(points, group);
  if (!moments) return { group, label, tone, mean: null, lower: null, upper: null, nEff: null, points: groupPoints };
  const se = moments.nEff > 1 ? Math.sqrt(moments.variance / moments.nEff) : Number.NaN;
  return {
    group,
    label,
    tone,
    mean: moments.mean,
    lower: Number.isFinite(se) ? moments.mean - 1.96 * se : null,
    upper: Number.isFinite(se) ? moments.mean + 1.96 * se : null,
    nEff: moments.nEff,
    points: groupPoints
  };
}

function binaryOutcomeSummary(points: ScatterPoint[], group: 0 | 1, label: string, tone: "treated" | "untreated"): CategoryOutcomeSummary {
  const groupPoints = binaryContinuousPointsForGroup(points, group);
  let sumWeight = 0;
  let sumWeightSquared = 0;
  let successes = 0;
  for (const point of groupPoints) {
    sumWeight += point.weight;
    sumWeightSquared += point.weight * point.weight;
    successes += coerceBinary(point.y) * point.weight;
  }
  if (sumWeight <= 0 || sumWeightSquared <= 0) return { group, label, tone, mean: null, lower: null, upper: null, nEff: null, points: groupPoints };
  const mean = successes / sumWeight;
  const nEff = sumWeight * sumWeight / sumWeightSquared;
  if (!Number.isFinite(nEff) || nEff <= 0) return { group, label, tone, mean, lower: null, upper: null, nEff: null, points: groupPoints };
  const z = 1.96;
  const denominator = 1 + (z * z) / nEff;
  const center = (mean + (z * z) / (2 * nEff)) / denominator;
  const halfWidth = (z * Math.sqrt((mean * (1 - mean) + (z * z) / (4 * nEff)) / nEff)) / denominator;
  return {
    group,
    label,
    tone,
    mean,
    lower: clamp(center - halfWidth, 0, 1),
    upper: clamp(center + halfWidth, 0, 1),
    nEff,
    points: groupPoints
  };
}

function binaryContinuousPointsForGroup(points: ScatterPoint[], groupValue: 0 | 1): ScatterPoint[] {
  return points.filter((point) => point.weight > 0 && Number.isFinite(point.y) && coerceBinary(point.x) === groupValue);
}

function categoryOutcomeGroupTickLabel(label: string, group: 0 | 1, compact: boolean): string {
  const equalsIndex = label.lastIndexOf("=");
  if (compact) return equalsIndex >= 0 ? label.slice(equalsIndex + 1) : String(group);
  if (label.length <= 20) return label;
  if (equalsIndex > 0) return `${abbreviateLabel(label.slice(0, equalsIndex), 14)}=${label.slice(equalsIndex + 1)}`;
  return abbreviateLabel(label, 20);
}

function binaryAxisValueLabel(label: string, value: 0 | 1): string {
  return `${binaryShortLabel(label)}=${value}`;
}

function binaryShortLabel(value: string): string {
  return abbreviateLabel(value.replace(/\s+\([^)]*\)$/u, ""), 18);
}

function abbreviateLabel(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}

function deterministicCategoryOutcomeJitter(index: number, groupValue: 0 | 1, salt: number): number {
  return deterministicJitter(index + groupValue * 1009 + salt * 7919);
}

function deterministicJitter(index: number): number {
  const x = Math.sin((index + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}
