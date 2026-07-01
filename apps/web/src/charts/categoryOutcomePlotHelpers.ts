import { coerceBinary } from "../shared/formatting";
import { effectiveSampleSize, weightedMoments, wilsonInterval } from "@nudagitty/core";
import { deterministicJitter } from "./jitter";
import type { CategoryOutcomeSummary, RiskBin, ScatterPoint } from "./categoryOutcomePlotTypes";

// Wilson score interval for a weighted binary proportion at effective sample size
// nEff, from the canonical stats lib (identical z=1.96 default and [0,1] clamp).
// Re-exported for the chart/output modules that import it via this helper module.
export { wilsonInterval };

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
  // Select this group's positive-weight points, then defer to the canonical
  // weighted-moments pass with the biased ('n') variance divisor — byte-identical
  // to the former inline accumulation. Non-null only when the group is non-empty
  // (matching the old `sumWeight <= 0 || sumWeightSquared <= 0 -> null` guard: all
  // retained weights are > 0, so Σw > 0 iff Σw² > 0).
  const values: number[] = [];
  const weights: number[] = [];
  for (const point of points) {
    if (coerceBinary(point.x) !== groupValue || point.weight <= 0) continue;
    values.push(point.y);
    weights.push(point.weight);
  }
  const { mean, variance, nEff } = weightedMoments(values, weights, { varianceDivisor: "n" });
  if (mean === null || variance === null || nEff === null) return null;
  return { mean, variance, nEff };
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
  // nEff via the canonical Kish effective sample size; it returns null on exactly the
  // same degenerate weights (Σw ≤ 0 or Σw² ≤ 0) the inline guard used to reject.
  const nEff = effectiveSampleSize(groupPoints.map((point) => point.weight));
  let sumWeight = 0;
  let successes = 0;
  for (const point of groupPoints) {
    sumWeight += point.weight;
    successes += coerceBinary(point.y) * point.weight;
  }
  if (nEff === null) return { group, label, tone, mean: null, lower: null, upper: null, nEff: null, points: groupPoints };
  const mean = successes / sumWeight;
  if (!Number.isFinite(nEff) || nEff <= 0) return { group, label, tone, mean, lower: null, upper: null, nEff: null, points: groupPoints };
  const interval = wilsonInterval(mean, nEff);
  return {
    group,
    label,
    tone,
    mean,
    lower: interval.lower,
    upper: interval.upper,
    nEff,
    points: groupPoints
  };
}

// Bin a continuous exposure into fixed-width bands and report the weighted
// binary-outcome proportion (risk) per band with a Wilson interval. This is the
// approved "Continuous/binary: risk curve / binned treatment contrast" output:
// it treats the outcome as binary (proportions in [0, 1]) instead of plotting
// raw 0/1 dots. Fixed width (rather than equal-weight quantiles) keeps a skewed
// exposure from collapsing its whole upper tail into one giant band; a robust
// upper edge (the 96th percentile) stops a few extreme values from stretching
// every band, and anything beyond it lands in the open-ended top band.
export function binnedBinaryRiskSummaries(points: ScatterPoint[], binCount: number): RiskBin[] {
  const usable = points
    .filter((point) => point.weight > 0 && Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((a, b) => a.x - b.x);
  if (usable.length === 0 || binCount < 1) return [];
  const totalWeight = usable.reduce((sum, point) => sum + point.weight, 0);
  if (totalWeight <= 0) return [];
  const min = usable[0]!.x;
  const robustMax = weightedQuantile(usable, totalWeight, 0.96);
  const span = robustMax - min;
  if (span <= 0) {
    const single = riskBinFromPoints(usable, min, null);
    return single ? [single] : [];
  }
  const width = span / binCount;
  const groups: ScatterPoint[][] = Array.from({ length: binCount }, () => []);
  for (const point of usable) {
    const index = Math.min(binCount - 1, Math.max(0, Math.floor((point.x - min) / width)));
    groups[index]!.push(point);
  }
  const bins: RiskBin[] = [];
  for (let index = 0; index < binCount; index += 1) {
    const group = groups[index]!;
    if (group.length === 0) continue;
    const loEdge = min + index * width;
    const hiEdge = index === binCount - 1 ? null : min + (index + 1) * width;
    const summary = riskBinFromPoints(group, loEdge, hiEdge);
    if (summary) bins.push(summary);
  }
  return bins;
}

// Weight-cumulative quantile over already-sorted points: distinct from the canonical
// (unweighted, order-statistic) `quantile` in @nudagitty/core, so it stays local.
function weightedQuantile(sorted: ScatterPoint[], totalWeight: number, q: number): number {
  const threshold = totalWeight * q;
  let cumulative = 0;
  for (const point of sorted) {
    cumulative += point.weight;
    if (cumulative >= threshold) return point.x;
  }
  return sorted[sorted.length - 1]!.x;
}

function riskBinFromPoints(points: ScatterPoint[], loEdge: number, hiEdge: number | null): RiskBin | null {
  // nEff via the canonical Kish effective sample size; null on the same degenerate
  // weights (Σw ≤ 0 or Σw² ≤ 0) the inline guard used to reject with a null bin.
  const nEff = effectiveSampleSize(points.map((point) => point.weight));
  if (nEff === null) return null;
  let sumWeight = 0;
  let successes = 0;
  let sumX = 0;
  for (const point of points) {
    sumWeight += point.weight;
    successes += coerceBinary(point.y) * point.weight;
    sumX += point.x * point.weight;
  }
  const mean = successes / sumWeight;
  const interval = Number.isFinite(nEff) && nEff > 0 ? wilsonInterval(mean, nEff) : null;
  return {
    center: sumX / sumWeight,
    mean,
    lower: interval ? interval.lower : null,
    upper: interval ? interval.upper : null,
    nEff: Number.isFinite(nEff) ? nEff : null,
    weight: sumWeight,
    loEdge,
    hiEdge
  };
}

export function roundBandEdge(value: number): number {
  if (Math.abs(value) >= 10) return Math.round(value);
  return Math.round(value * 10) / 10;
}

function binaryContinuousPointsForGroup(points: ScatterPoint[], groupValue: 0 | 1): ScatterPoint[] {
  return points.filter((point) => point.weight > 0 && Number.isFinite(point.y) && coerceBinary(point.x) === groupValue);
}

export function categoryOutcomeGroupTickLabel(label: string, group: 0 | 1, compact: boolean): string {
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

export function deterministicCategoryOutcomeJitter(index: number, groupValue: 0 | 1, salt: number): number {
  // Same offsets as before: the previous private helper applied `(seed + 1) * 12.9898`
  // and scale 43758.5453 to `seed = index + group*1009 + salt*7919`; that is folded into
  // the canonical hash's `seed`/`scale` arguments here (amplitude stays at the call site).
  return deterministicJitter((index + groupValue * 1009 + salt * 7919 + 1) * 12.9898, 43758.5453);
}
