import { clamp, coerceBinary } from "../shared/formatting";
import type { CategoryOutcomeSummary, RiskBin, ScatterPoint } from "./categoryOutcomePlotTypes";

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

// Wilson score interval for a weighted binary proportion at effective sample size nEff.
export function wilsonInterval(mean: number, nEff: number): { lower: number; upper: number } {
  const z = 1.96;
  const denominator = 1 + (z * z) / nEff;
  const center = (mean + (z * z) / (2 * nEff)) / denominator;
  const halfWidth = (z * Math.sqrt((mean * (1 - mean) + (z * z) / (4 * nEff)) / nEff)) / denominator;
  return { lower: clamp(center - halfWidth, 0, 1), upper: clamp(center + halfWidth, 0, 1) };
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
  let sumWeight = 0;
  let sumWeightSquared = 0;
  let successes = 0;
  let sumX = 0;
  for (const point of points) {
    sumWeight += point.weight;
    sumWeightSquared += point.weight * point.weight;
    successes += coerceBinary(point.y) * point.weight;
    sumX += point.x * point.weight;
  }
  if (sumWeight <= 0 || sumWeightSquared <= 0) return null;
  const mean = successes / sumWeight;
  const nEff = sumWeight * sumWeight / sumWeightSquared;
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

function formatBandEdges(loEdge: number, hiEdge: number | null): string {
  const low = roundBandEdge(loEdge);
  if (hiEdge === null) return `${low}+`;
  const high = roundBandEdge(hiEdge);
  return low === high ? `${low}` : `${low}–${high}`;
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
  return deterministicJitter(index + groupValue * 1009 + salt * 7919);
}

function deterministicJitter(index: number): number {
  const x = Math.sin((index + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}
