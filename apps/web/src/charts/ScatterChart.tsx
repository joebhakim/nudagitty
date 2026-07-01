import type { DoseResponseCurves } from "@nudagitty/core";
import { clamp, formatValue } from "../shared/formatting";
import { SvgAxisName } from "../shared/NodeNames";
import { chartFrame, niceTicks } from "./chartFrame";
import type { ScatterPoint } from "./categoryOutcomePlotTypes";

// A regression (or reference) line drawn across the plot, in DATA coordinates.
export type ScatterRegression = { x1: number; y1: number; x2: number; y2: number };

// The continuous-x × continuous-y scatter: individual points (opacity modulated
// by importance weight) with either a regression line or the dose-response
// overlay layered on. Extracted verbatim from ScatterplotPanel so its markup is
// byte-identical; the dose overlay is now a prop so the gallery can render the
// scatter both with and without it.
export function ScatterChart(props: {
  points: ScatterPoint[];
  xDomain: [number, number];
  yDomain: [number, number];
  regression: ScatterRegression | null;
  xLabel: string;
  yLabel: string;
  pointAlpha: number;
  doseResponse?: DoseResponseCurves | null;
  width?: number;
  height?: number;
}) {
  const width = props.width ?? 280;
  const height = props.height ?? 220;
  const { points, xDomain, yDomain, regression, xLabel, yLabel, pointAlpha } = props;
  const doseResponse = props.doseResponse ?? null;
  const scatterFrame = chartFrame({ width, height, x: { ticks: true, title: true }, y: { ticks: true, title: true }, xDomain, yDomain, insetX: 6, insetY: 6 });
  const scatterXTicks = niceTicks(xDomain[0], xDomain[1], 4);
  const scatterYTicks = niceTicks(yDomain[0], yDomain[1], 4);
  const maxWeight = Math.max(...points.map((point) => point.weight), 1);
  const toX = scatterFrame.xScale;
  const toY = scatterFrame.yScale;
  return (
    <svg
      className="scatterplot-svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Scatterplot of ${xLabel} and ${yLabel}`}
    >
      <rect className="scatter-plot-background" x={scatterFrame.plot.x} y={scatterFrame.plot.y} width={scatterFrame.plot.width} height={scatterFrame.plot.height} />
      <line className="scatter-axis" x1={scatterFrame.plot.x} y1={scatterFrame.plot.bottom} x2={scatterFrame.plot.right} y2={scatterFrame.plot.bottom} />
      <line className="scatter-axis" x1={scatterFrame.plot.x} y1={scatterFrame.plot.y} x2={scatterFrame.plot.x} y2={scatterFrame.plot.bottom} />
      {scatterYTicks.map((tick) => (
        <g key={`sy${tick}`}>
          <line className="scatter-grid" x1={scatterFrame.plot.x} x2={scatterFrame.plot.right} y1={toY(tick)} y2={toY(tick)} />
          <text className="scatter-tick-label end" x={scatterFrame.anchors.ticks.yX} y={toY(tick) + 4}>{formatValue(tick)}</text>
        </g>
      ))}
      {scatterXTicks.map((tick) => (
        <text key={`sx${tick}`} className="scatter-tick-label" x={toX(tick)} y={scatterFrame.anchors.ticks.xY} textAnchor="middle">{formatValue(tick)}</text>
      ))}
      <SvgAxisName className="scatter-axis-label x" label={xLabel} x={scatterFrame.plot.cx} y={scatterFrame.anchors.title.xY} maxChars={28} />
      <SvgAxisName className="scatter-axis-label y" label={yLabel} x={scatterFrame.anchors.title.yX} y={scatterFrame.plot.cy} transform={`rotate(-90 ${scatterFrame.anchors.title.yX} ${scatterFrame.plot.cy})`} maxChars={20} />
      {points.map((point) => {
        const normalizedWeight = Math.sqrt(Math.max(0, point.weight) / maxWeight);
        // Fixed radius; opacity is the user's slider value, modulated mildly by importance weight.
        const opacity = clamp(pointAlpha * (0.5 + 0.5 * normalizedWeight), 0.02, 1);
          return (
            <circle
              className="scatter-point"
              key={point.index}
              cx={toX(point.x)}
              cy={toY(point.y)}
              r={2 + normalizedWeight * 1.4}
              style={{ opacity }}
            />
          );
        })}
      {doseResponse ? (
        <DoseResponseOverlay curves={doseResponse} toX={toX} toY={toY} />
      ) : regression ? (
        <line
          className="scatter-regression"
          x1={toX(regression.x1)}
          y1={toY(regression.y1)}
          x2={toX(regression.x2)}
          y2={toY(regression.y2)}
        />
      ) : null}
    </svg>
  );
}

// Builds an SVG path through (grid[i], values[i]), lifting the pen across non-finite points.
function doseCurvePath(grid: number[], values: number[], toX: (v: number) => number, toY: (v: number) => number): string {
  let d = "";
  let pen = false;
  for (let i = 0; i < grid.length; i += 1) {
    const value = values[i];
    if (value === undefined || !Number.isFinite(value)) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${toX(grid[i]!).toFixed(2)},${toY(value).toFixed(2)} `;
    pen = true;
  }
  return d.trim();
}

function doseBandPath(grid: number[], lower: number[], upper: number[], toX: (v: number) => number, toY: (v: number) => number): string {
  const pts: Array<{ x: number; lo: number; hi: number }> = [];
  for (let i = 0; i < grid.length; i += 1) {
    if (Number.isFinite(lower[i]) && Number.isFinite(upper[i])) pts.push({ x: toX(grid[i]!), lo: toY(lower[i]!), hi: toY(upper[i]!) });
  }
  if (pts.length < 2) return "";
  let d = `M${pts[0]!.x.toFixed(2)},${pts[0]!.hi.toFixed(2)} `;
  for (let i = 1; i < pts.length; i += 1) d += `L${pts[i]!.x.toFixed(2)},${pts[i]!.hi.toFixed(2)} `;
  for (let i = pts.length - 1; i >= 0; i -= 1) d += `L${pts[i]!.x.toFixed(2)},${pts[i]!.lo.toFixed(2)} `;
  return `${d}Z`;
}

// Overlays the three dose-response curves on the continuous-exposure scatter:
// crude (gray) vs re-simulated oracle (ochre) vs from-data adjusted (blue, with
// a confidence band that widens where the dose is sparsely observed).
function DoseResponseOverlay(props: { curves: DoseResponseCurves; toX: (v: number) => number; toY: (v: number) => number }) {
  const { curves, toX, toY } = props;
  const hasAdjusted = curves.adjusted !== null;
  return (
    <g className="dose-response-overlay" aria-hidden="true">
      {hasAdjusted && curves.adjustedLower && curves.adjustedUpper && (
        <path className="dose-band" d={doseBandPath(curves.grid, curves.adjustedLower, curves.adjustedUpper, toX, toY)} />
      )}
      <path className="dose-curve crude" d={doseCurvePath(curves.grid, curves.observed, toX, toY)} />
      <path className="dose-curve oracle" d={doseCurvePath(curves.grid, curves.oracle, toX, toY)} />
      {hasAdjusted && curves.adjusted && (
        <path className="dose-curve adjusted" d={doseCurvePath(curves.grid, curves.adjusted, toX, toY)} />
      )}
      {curves.grid.map((x, index) => {
        const value = curves.oracle[index];
        if (value === undefined || !Number.isFinite(value)) return null;
        return <circle key={`do${index}`} className="dose-dot" cx={toX(x)} cy={toY(value)} r={1.9} />;
      })}
    </g>
  );
}
