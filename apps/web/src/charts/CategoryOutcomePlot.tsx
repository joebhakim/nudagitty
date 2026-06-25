import { useEffect, useRef, useState } from "react";
import {
  clamp,
  coerceBinary,
  formatPercent,
  formatValue
} from "../shared/formatting";
import { SvgAxisName } from "../shared/NodeNames";
import { chartFrame, niceTicks, paddedDomain } from "./chartFrame";

// Measure a container so a chart can render at its actual pixel size (and fill it) instead
// of being locked to a fixed viewBox aspect ratio that leaves whitespace.
function useElementSize(fallback: { width: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 10 && rect.height > 10) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
}

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
  // Method estimates overlaid beside the observed summary — each a point + CI per group, connected
  // across groups (slope = the effect), dodged so they don't collide. Drives the redesign's
  // "observed + every method's estimate" effect graph without changing the chart's grammar.
  overlays?: Array<{ id: string; color: string; emphasis?: boolean; groups: Array<{ group: 0 | 1; mean: number; lower: number | null; upper: number | null }> }>;
}) {
  const { ref: wrapRef, size } = useElementSize({ width: props.compact ? 300 : 360, height: props.compact ? 200 : 210 });
  const width = size.width;
  const height = size.height;
  const isBinary = props.outcomeKind === "binary";

  // Data-driven y-domain: crop to where the means/CIs (and, for continuous, the
  // points) actually live, padded for headroom and clamped to [0,1] for a rate
  // axis — so there's no empty 0–100% band, but 0/100 values still get spacing
  // (via insetY) and the axis never shows negative / >100%.
  const domainValues: number[] = [];
  for (const summary of props.summaries) {
    if (summary.mean !== null) domainValues.push(summary.mean);
    if (summary.lower !== null) domainValues.push(summary.lower);
    if (summary.upper !== null) domainValues.push(summary.upper);
  }
  if (!isBinary) for (const point of props.points) if (Number.isFinite(point.y)) domainValues.push(point.y);
  for (const overlay of props.overlays ?? []) for (const g of overlay.groups) {
    domainValues.push(g.mean);
    if (g.lower !== null) domainValues.push(g.lower);
    if (g.upper !== null) domainValues.push(g.upper);
  }
  const dataMin = domainValues.length ? Math.min(...domainValues) : 0;
  const dataMax = domainValues.length ? Math.max(...domainValues) : 1;
  const [yMin, yMax] = paddedDomain(dataMin, dataMax, {
    pad: 0.1,
    clampMin: isBinary ? 0 : undefined,
    clampMax: isBinary ? 1 : undefined
  });

  // Below ~132px there isn't room for the x-axis title band; drop it (the group
  // labels still identify the axis) and thin the y-ticks so nothing overlaps or
  // clips. This lets the chart degrade gracefully into very short panels.
  const shortChart = height < 132;
  const frame = chartFrame({
    width,
    height,
    y: { ticks: true, title: true },
    x: shortChart ? { ticks: true } : { ticks: true, title: true },
    yDomain: [yMin, yMax],
    insetY: shortChart ? 7 : 12
  });
  const { plot, yScale, anchors } = frame;
  const groupX = (group: 0 | 1) => plot.x + plot.width * (group === 0 ? 0.32 : 0.68);
  const maxWeight = Math.max(...props.points.map((point) => point.weight), 1);
  const formatOutcome = (value: number) => isBinary ? formatPercent(value) : formatValue(value);
  const ticks = niceTicks(yMin, yMax, shortChart || props.compact ? 2 : 3);
  const pointX = (point: ScatterPoint, group: 0 | 1) => groupX(group) + deterministicCategoryOutcomeJitter(point.index, group, 29) * (props.compact ? 22 : 30);

  return (
    <div ref={wrapRef} className={`category-outcome-plot-wrap${props.compact ? " compact" : ""}`}>
    <svg
      className={`category-outcome-plot${props.compact ? " compact" : ""}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={props.ariaLabel ?? `${props.yLabel} by ${props.xLabel}`}
    >
      <rect className="category-outcome-background" x={plot.x} y={plot.y} width={plot.width} height={plot.height} rx="5" />
      <line className="category-outcome-axis" x1={plot.x} x2={plot.right} y1={plot.bottom} y2={plot.bottom} />
      <line className="category-outcome-axis" x1={plot.x} x2={plot.x} y1={plot.y} y2={plot.bottom} />
      {ticks.map((tick) => (
        <g key={tick}>
          <line className="category-outcome-guide" x1={plot.x} x2={plot.right} y1={yScale(tick)} y2={yScale(tick)} />
          <text className="category-outcome-axis-label" x={anchors.ticks.yX} y={yScale(tick) + 4}>{formatOutcome(tick)}</text>
        </g>
      ))}
      {!shortChart && <SvgAxisName className="category-outcome-axis-title x" label={props.xLabel} x={plot.cx} y={anchors.title.xY} maxChars={props.compact ? 22 : 28} />}
      <SvgAxisName className="category-outcome-axis-title y" label={props.yLabel} x={anchors.title.yX} y={plot.cy} transform={`rotate(-90 ${anchors.title.yX} ${plot.cy})`} maxChars={props.compact ? 16 : 22} />
      {props.summaries.map((summary) => {
        const x = groupX(summary.group);
        return (
          <g className={`category-outcome-group ${summary.tone}`} key={summary.group}>
            <line className="category-outcome-category-guide" x1={x} x2={x} y1={plot.y} y2={plot.bottom} />
            {!isBinary && summary.points.map((point) => {
              const normalizedWeight = Math.sqrt(Math.max(0, point.weight) / maxWeight);
              return (
                <circle
                  className={`category-outcome-observation ${summary.tone}`}
                  cx={pointX(point, summary.group)}
                  cy={yScale(point.y)}
                  r={1.5 + normalizedWeight * 1.4}
                  key={`${summary.group}-${point.index}`}
                  style={{ opacity: 0.05 + normalizedWeight * 0.1 }}
                />
              );
            })}
            {summary.lower !== null && summary.upper !== null && (
              <g className={`category-outcome-ci ${summary.tone}`}>
                <line x1={x} x2={x} y1={yScale(summary.upper)} y2={yScale(summary.lower)} />
                <line x1={x - 9} x2={x + 9} y1={yScale(summary.upper)} y2={yScale(summary.upper)} />
                <line x1={x - 9} x2={x + 9} y1={yScale(summary.lower)} y2={yScale(summary.lower)} />
              </g>
            )}
            {summary.mean !== null && (
              <>
                <circle className={`category-outcome-summary-point ${summary.tone}`} cx={x} cy={yScale(summary.mean)} r={5.2} />
                <text className="category-outcome-summary-value" x={x} y={Math.max(plot.y + 11, yScale(summary.mean) - 9)}>{formatOutcome(summary.mean)}</text>
              </>
            )}
            <text className="category-outcome-group-label" x={x} y={anchors.ticks.xY}>{categoryOutcomeGroupTickLabel(summary.label, summary.group, Boolean(props.compact))}</text>
          </g>
        );
      })}
      {(props.overlays ?? []).map((overlay, k) => {
        const n = (props.overlays ?? []).length;
        const off = ((k - (n - 1) / 2) * (props.compact ? 9 : 11)) + (props.compact ? 13 : 16); // dodge to one side of the observed center
        const at = (g: { group: 0 | 1; mean: number }) => ({ x: groupX(g.group) + off, y: yScale(g.mean) });
        const sw = overlay.emphasis ? 2 : 1.2;
        return (
          <g className="category-outcome-overlay" key={overlay.id}>
            {overlay.groups.length === 2 && (
              <line x1={at(overlay.groups[0]!).x} y1={at(overlay.groups[0]!).y} x2={at(overlay.groups[1]!).x} y2={at(overlay.groups[1]!).y} stroke={overlay.color} strokeWidth={sw} opacity={0.55} />
            )}
            {overlay.groups.map((g) => {
              const { x, y } = at(g);
              return (
                <g key={g.group}>
                  {g.lower !== null && g.upper !== null && (
                    <g stroke={overlay.color} strokeWidth={sw}>
                      {/* end caps so a narrow CI is still visible (was collapsing to an invisible line) */}
                      <line x1={x} x2={x} y1={yScale(g.upper)} y2={yScale(g.lower)} />
                      <line x1={x - 4} x2={x + 4} y1={yScale(g.upper)} y2={yScale(g.upper)} />
                      <line x1={x - 4} x2={x + 4} y1={yScale(g.lower)} y2={yScale(g.lower)} />
                    </g>
                  )}
                  <circle cx={x} cy={y} r={overlay.emphasis ? 4 : 3} fill={overlay.color} stroke="#fff" strokeWidth="1" />
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
    </div>
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

export type RiskBin = {
  center: number;
  mean: number;
  lower: number | null;
  upper: number | null;
  nEff: number | null;
  weight: number;
  loEdge: number;
  hiEdge: number | null; // null marks the open-ended top band ("x+")
};

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

// Binned treatment contrast: equal-spaced exposure bands (so a skewed exposure
// does not cram every band into one corner) with the binary-outcome proportion
// and a Wilson interval per band, joined by a guide line.
export function RiskCurvePlot(props: {
  bins: RiskBin[];
  xLabel: string;
  yLabel: string;
  /** Shared y-domain (e.g. across small-multiples). Defaults to full 0–100%. */
  yDomain?: [number, number];
  compact?: boolean;
  ariaLabel?: string;
}) {
  const width = props.compact ? 300 : 360;
  const height = props.compact ? 172 : 200;
  const bins = props.bins;
  const lastBin = bins[bins.length - 1];
  // Continuous exposure x-axis from the band edges, so we can show a few nice
  // numeric ticks instead of cramming a range label under every band (which
  // overlapped). y stays 0–100% so stacked small-multiples are comparable.
  const xMin = bins.length ? Math.min(bins[0]!.loEdge, ...bins.map((bin) => bin.center)) : 0;
  const xMax = lastBin ? (lastBin.hiEdge ?? Math.max(...bins.map((bin) => bin.center))) : 1;
  // A shared yDomain (small-multiples) wins; otherwise crop to the data so a
  // "flat high" curve (90–99%) doesn't sit in an empty 0–100% band.
  const rates = bins.flatMap((bin) => [bin.mean, bin.lower, bin.upper]).filter((value): value is number => value !== null && Number.isFinite(value));
  const [yMin, yMax] = props.yDomain
    ?? (rates.length ? paddedDomain(Math.min(...rates), Math.max(...rates), { pad: 0.12, clampMin: 0, clampMax: 1 }) : [0, 1]);
  // Value labels are noise (and overlap) once there are many bins.
  const showValues = bins.length <= 8;
  const frame = chartFrame({
    width,
    height,
    y: { ticks: true, title: true },
    x: { ticks: true, title: true },
    xDomain: [xMin, xMax],
    yDomain: [yMin, yMax],
    insetX: 14,
    insetY: 8
  });
  const { plot, xScale, yScale, anchors } = frame;
  const bandX = (bin: RiskBin) => xScale(bin.center);
  const yTicks = niceTicks(yMin, yMax, props.compact ? 2 : 3);
  const xTicks = niceTicks(xMin, xMax, props.compact ? 3 : 5);
  const linePoints = bins
    .map((bin) => (Number.isFinite(bin.mean) ? `${bandX(bin)},${yScale(bin.mean)}` : null))
    .filter((point): point is string => point !== null)
    .join(" ");
  return (
    <svg
      className={`category-outcome-plot risk-curve-plot${props.compact ? " compact" : ""}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={props.ariaLabel ?? `${props.yLabel} by ${props.xLabel}`}
    >
      <rect className="category-outcome-background" x={plot.x} y={plot.y} width={plot.width} height={plot.height} rx="5" />
      <line className="category-outcome-axis" x1={plot.x} x2={plot.right} y1={plot.bottom} y2={plot.bottom} />
      <line className="category-outcome-axis" x1={plot.x} x2={plot.x} y1={plot.y} y2={plot.bottom} />
      {yTicks.map((tick) => (
        <g key={tick}>
          <line className="category-outcome-guide" x1={plot.x} x2={plot.right} y1={yScale(tick)} y2={yScale(tick)} />
          <text className="category-outcome-axis-label" x={anchors.ticks.yX} y={yScale(tick) + 4}>{formatPercent(tick)}</text>
        </g>
      ))}
      {xTicks.map((tick) => (
        <text key={`x${tick}`} className="risk-curve-band-label" x={xScale(tick)} y={anchors.ticks.xY} textAnchor="middle">{roundBandEdge(tick)}</text>
      ))}
      <SvgAxisName className="category-outcome-axis-title x" label={props.xLabel} x={plot.cx} y={anchors.title.xY} maxChars={props.compact ? 22 : 28} />
      <SvgAxisName className="category-outcome-axis-title y" label={props.yLabel} x={anchors.title.yX} y={plot.cy} transform={`rotate(-90 ${anchors.title.yX} ${plot.cy})`} maxChars={props.compact ? 16 : 22} />
      {linePoints.length > 0 && <polyline className="risk-curve-line" points={linePoints} />}
      {bins.map((bin, index) => {
        const cx = bandX(bin);
        return (
          <g className="risk-curve-bin" key={`${index}-${bin.center}`}>
            {bin.lower !== null && bin.upper !== null && (
              <g className="category-outcome-ci treated">
                <line x1={cx} x2={cx} y1={yScale(bin.upper)} y2={yScale(bin.lower)} />
                <line x1={cx - 6} x2={cx + 6} y1={yScale(bin.upper)} y2={yScale(bin.upper)} />
                <line x1={cx - 6} x2={cx + 6} y1={yScale(bin.lower)} y2={yScale(bin.lower)} />
              </g>
            )}
            <circle className="category-outcome-summary-point treated" cx={cx} cy={yScale(bin.mean)} r={4.2} />
            {showValues && <text className="category-outcome-summary-value" x={cx} y={Math.max(plot.y + 10, yScale(bin.mean) - 9)}>{formatPercent(bin.mean)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function formatBandEdges(loEdge: number, hiEdge: number | null): string {
  const low = roundBandEdge(loEdge);
  if (hiEdge === null) return `${low}+`;
  const high = roundBandEdge(hiEdge);
  return low === high ? `${low}` : `${low}–${high}`;
}

function roundBandEdge(value: number): number {
  if (Math.abs(value) >= 10) return Math.round(value);
  return Math.round(value * 10) / 10;
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
