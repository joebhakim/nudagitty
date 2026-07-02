import { useEffect, useRef, useState } from "react";
import {
  clamp,
  formatPercent,
  formatValue
} from "../shared/formatting";
import { SvgAxisName } from "../shared/NodeNames";
import { chartFrame, niceTicks, paddedDomain } from "./chartFrame";
import type {
  CategoryOutcomeKind,
  CategoryOutcomeSummary,
  RiskBin,
  ScatterPoint
} from "./categoryOutcomePlotTypes";
import {
  categoryOutcomeGroupTickLabel,
  deterministicCategoryOutcomeJitter,
  roundBandEdge
} from "./categoryOutcomePlotHelpers";

// Keep the type + helper exports resolvable from "../charts/CategoryOutcomePlot" for the many
// existing importers, even though they now live in sibling files.
export type { CategoryOutcomeSummary, RiskBin, ScatterPoint } from "./categoryOutcomePlotTypes";
export {
  binaryOutcomeSummaries,
  binnedBinaryRiskSummaries,
  categoryOutcomeDomain,
  continuousOutcomeSummaries,
  multiLevelContinuousSummaries,
  weightedPointMoments,
  wilsonInterval
} from "./categoryOutcomePlotHelpers";

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

export function CategoryOutcomePlot(props: {
  points: ScatterPoint[];
  summaries: CategoryOutcomeSummary[];
  xLabel: string;
  yLabel: string;
  yDomain: [number, number];
  outcomeKind: CategoryOutcomeKind;
  compact?: boolean;
  ariaLabel?: string;
  // Use `yDomain` as the authoritative axis instead of auto-fitting to the data (the small-multiples
  // shared-scale case). Points outside the domain are not drawn — so a few heavy-tailed values (e.g.
  // an AIPW unit with a tiny propensity) can't blow up the scale and squash the rest.
  clampToDomain?: boolean;
  // Color the whole chart by one series color (points, CI, mean) instead of by treatment arm. Used by
  // the small-multiples effect facets, where each facet's IDENTITY (observed / truth / method) is the
  // color and the two arms are told apart by x-position — so the legend's series colors mean something.
  seriesColor?: string;
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
  // Binary swarm: when individual 0/1 points are supplied, show them — jittered into bands with alpha —
  // on the full [0,1] axis (so the density IS the proportion), rather than only a cropped proportion+CI.
  // Without points (e.g. estimate-only facets), keep the cropped rate band for a tight comparison.
  const binarySwarm = isBinary && props.summaries.some((summary) => summary.points.length > 0);
  const [yMin, yMax] = binarySwarm
    ? [0, 1]
    : props.clampToDomain
      ? props.yDomain
      : paddedDomain(dataMin, dataMax, {
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
    // Binary swarm is a dual-axis chart: the left axis is the proportion ESTIMATE (0–100%, the marker +
    // CI), the right axis is the EMPIRICAL outcome (0/1, where the individual points live).
    right: binarySwarm ? { ticks: true, title: true } : undefined,
    yDomain: [yMin, yMax],
    insetY: shortChart ? 7 : 12
  });
  const { plot, yScale, anchors } = frame;
  const groupX = (group: number) => (props.summaries.length <= 2
    ? plot.x + plot.width * (group === 0 ? 0.32 : 0.68)
    : plot.x + plot.width * ((group + 1) / (props.summaries.length + 1)));
  const maxWeight = Math.max(...props.points.map((point) => point.weight), 1);
  const formatOutcome = (value: number) => isBinary ? formatPercent(value) : formatValue(value);
  const ticks = niceTicks(yMin, yMax, shortChart || props.compact ? 2 : 3);
  const pointX = (point: ScatterPoint, group: number) => groupX(group) + deterministicCategoryOutcomeJitter(point.index, group, 29) * (props.compact ? 22 : 30);

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
      {binarySwarm && (
        <g className="category-outcome-right-axis" aria-hidden="true">
          <line className="category-outcome-axis" x1={plot.right} x2={plot.right} y1={plot.y} y2={plot.bottom} />
          {[0, 1].map((level) => (
            <g key={level}>
              <line className="category-outcome-axis" x1={plot.right} x2={plot.right + 3} y1={yScale(level)} y2={yScale(level)} />
              <text className="category-outcome-axis-label-right" x={anchors.ticks.yXRight} y={yScale(level) + 4}>{level}</text>
            </g>
          ))}
          <SvgAxisName className="category-outcome-axis-title y" label="outcome (0/1)" x={anchors.title.yXRight} y={plot.cy} transform={`rotate(-90 ${anchors.title.yXRight} ${plot.cy})`} maxChars={props.compact ? 16 : 22} />
        </g>
      )}
      {!shortChart && <SvgAxisName className="category-outcome-axis-title x" label={props.xLabel} x={plot.cx} y={anchors.title.xY} maxChars={props.compact ? 22 : 28} />}
      <SvgAxisName className="category-outcome-axis-title y" label={binarySwarm ? "rate (%)" : props.yLabel} x={anchors.title.yX} y={plot.cy} transform={`rotate(-90 ${anchors.title.yX} ${plot.cy})`} maxChars={props.compact ? 16 : 22} />
      {props.summaries.map((summary) => {
        const x = groupX(summary.group);
        return (
          <g className={`category-outcome-group ${summary.tone}`} key={summary.group}>
            <line className="category-outcome-category-guide" x1={x} x2={x} y1={plot.y} y2={plot.bottom} />
            {(!isBinary || binarySwarm) && summary.points.filter((point) => binarySwarm || (point.y >= yMin && point.y <= yMax)).map((point) => {
              const normalizedWeight = Math.sqrt(Math.max(0, point.weight) / maxWeight);
              // Binary: jitter each 0/1 into a band so the column reads as a density swarm, not a line.
              const cy = binarySwarm
                ? yScale(clamp(point.y + deterministicCategoryOutcomeJitter(point.index, summary.group, 17) * 0.07, 0, 1))
                : yScale(point.y);
              return (
                <circle
                  className={`category-outcome-observation ${summary.tone}`}
                  cx={pointX(point, summary.group)}
                  cy={cy}
                  r={1.5 + normalizedWeight * 1.2}
                  key={`${summary.group}-${point.index}`}
                  style={{ opacity: 0.28 + normalizedWeight * 0.14, fill: props.seriesColor }}
                />
              );
            })}
            {summary.lower !== null && summary.upper !== null && (() => {
              const ciStyle = props.seriesColor ? { stroke: props.seriesColor } : undefined;
              return (
                <g className={`category-outcome-ci ${summary.tone}`}>
                  <line x1={x} x2={x} y1={yScale(summary.upper)} y2={yScale(summary.lower)} style={ciStyle} />
                  <line x1={x - 9} x2={x + 9} y1={yScale(summary.upper)} y2={yScale(summary.upper)} style={ciStyle} />
                  <line x1={x - 9} x2={x + 9} y1={yScale(summary.lower)} y2={yScale(summary.lower)} style={ciStyle} />
                </g>
              );
            })()}
            {summary.mean !== null && (
              <>
                <circle className={`category-outcome-summary-point ${summary.tone}`} cx={x} cy={yScale(summary.mean)} r={5.2} style={props.seriesColor ? { fill: props.seriesColor } : undefined} />
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
        const at = (g: { group: number; mean: number }) => ({ x: groupX(g.group) + off, y: yScale(g.mean) });
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
