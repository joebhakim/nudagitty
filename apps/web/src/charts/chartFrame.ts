// A margin-convention layout primitive for SVG charts.
//
// Charts here used to hand-compute pixel offsets — `plot.left = 54`,
// `const height = axisY + 34`, `x = left + ((v + domain) / (2*domain)) * (...)` —
// so adding one axis label meant re-guessing the arithmetic (and watching it
// clip). chartFrame replaces that: you DECLARE what each edge needs (tick
// labels, a title, or a fixed gutter) and get back the inner plot rect, the
// anchor positions for ticks/titles, and linear scales. No more magic numbers.

export interface ChartAxisSpec {
  /** Reserve room for tick labels along this edge. */
  ticks?: boolean;
  /** Reserve room for an axis title beyond the ticks. */
  title?: boolean;
  /** Override the reserved size in px (e.g. a wide left row-label gutter). */
  size?: number;
}

export interface ChartFrameSpec {
  width: number;
  /** Total height. Omit and pass `plotHeight` to size the frame from content. */
  height?: number;
  /** Plot-area height; total height is derived by adding the vertical margins. */
  plotHeight?: number;
  /** Bottom (horizontal) axis. */
  x?: ChartAxisSpec;
  /** Left (vertical) axis. */
  y?: ChartAxisSpec;
  /** Right (vertical) axis — e.g. a second y-axis in different units (a dual-axis chart). */
  right?: ChartAxisSpec;
  xDomain?: [number, number];
  yDomain?: [number, number];
  /** Inset the scale range from the plot edges (px) so extreme values breathe. */
  insetX?: number;
  insetY?: number;
  /** Base padding (px) reserved on edges without an axis. */
  pad?: number;
}

// The only tunable constants live here, once, instead of scattered per chart.
const TICK_COLUMN = 30; // width reserved for left tick labels
const RIGHT_TICK_COLUMN = 16; // width reserved for right tick labels (narrow, e.g. 0/1)
const TICK_ROW = 14; // height reserved for bottom tick labels
const TITLE_BAND = 16; // height/width reserved for an axis title

export interface ChartFrame {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  plot: {
    x: number;
    y: number;
    width: number;
    height: number;
    right: number;
    bottom: number;
    cx: number;
    cy: number;
  };
  anchors: {
    /** Baseline y for bottom tick labels; x for left tick labels (anchor end); x for right (anchor start). */
    ticks: { xY: number; yX: number; yXRight: number };
    /** Baseline y for the bottom axis title; x for the rotated left / right axis titles. */
    title: { xY: number; yX: number; yXRight: number };
  };
  /** Map a domain value to an x pixel inside the plot. */
  xScale: (value: number) => number;
  /** Map a domain value to a y pixel inside the plot (0 at bottom). */
  yScale: (value: number) => number;
}

/**
 * "Nice" tick values across [min, max] near `target` count (1/2/5 × 10^n steps).
 * Returns the round values that land inside the domain.
 */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (!(max > min)) return [min];
  const rawStep = (max - min) / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let value = start; value <= max + step * 1e-6; value += step) {
    // snap away tiny float dust
    ticks.push(Math.abs(value) < step * 1e-6 ? 0 : Number(value.toFixed(10)));
  }
  return ticks;
}

/**
 * Pad a data range by a fraction for headroom, optionally clamping the result so
 * it never reads below `clampMin` / above `clampMax` (e.g. a 0–1 rate axis that
 * gets breathing room but never shows negative or >100%).
 */
export function paddedDomain(
  min: number,
  max: number,
  options: { pad?: number; clampMin?: number; clampMax?: number } = {}
): [number, number] {
  const pad = options.pad ?? 0.08;
  if (!(max > min)) {
    const center = Number.isFinite(min) ? min : 0;
    return [center - 0.5, center + 0.5];
  }
  const amount = (max - min) * pad;
  let lo = min - amount;
  let hi = max + amount;
  if (options.clampMin !== undefined) lo = Math.max(lo, options.clampMin);
  if (options.clampMax !== undefined) hi = Math.min(hi, options.clampMax);
  return [lo, hi];
}

export function chartFrame(spec: ChartFrameSpec): ChartFrame {
  const pad = spec.pad ?? 10;
  const x = spec.x ?? {};
  const y = spec.y ?? {};
  const rightAxis = spec.right ?? {};

  const left = y.size ?? pad + (y.ticks ? TICK_COLUMN : 0) + (y.title ? TITLE_BAND : 0);
  const bottom = x.size ?? pad + (x.ticks ? TICK_ROW : 0) + (x.title ? TITLE_BAND : 0);
  const top = pad;
  const right = rightAxis.size ?? pad + (rightAxis.ticks ? RIGHT_TICK_COLUMN : 0) + (rightAxis.title ? TITLE_BAND : 0);
  const margin = { top, right, bottom, left };

  const plotWidth = Math.max(0, spec.width - left - right);
  const plotHeight = spec.height !== undefined
    ? Math.max(0, spec.height - top - bottom)
    : spec.plotHeight ?? 0;
  const height = spec.height ?? plotHeight + top + bottom;

  const plot = {
    x: left,
    y: top,
    width: plotWidth,
    height: plotHeight,
    right: left + plotWidth,
    bottom: top + plotHeight,
    cx: left + plotWidth / 2,
    cy: top + plotHeight / 2
  };

  const [xd0, xd1] = spec.xDomain ?? [0, 1];
  const [yd0, yd1] = spec.yDomain ?? [0, 1];
  const insetX = spec.insetX ?? 0;
  const insetY = spec.insetY ?? 0;
  const xSpan = Math.max(0, plot.width - 2 * insetX);
  const ySpan = Math.max(0, plot.height - 2 * insetY);
  const xScale = (value: number) => plot.x + insetX + ((value - xd0) / ((xd1 - xd0) || 1)) * xSpan;
  const yScale = (value: number) => plot.y + insetY + (1 - (value - yd0) / ((yd1 - yd0) || 1)) * ySpan;

  return {
    width: spec.width,
    height,
    margin,
    plot,
    anchors: {
      ticks: { xY: plot.bottom + 13, yX: plot.x - 6, yXRight: plot.right + 6 },
      title: { xY: plot.bottom + (x.ticks ? TICK_ROW : 0) + 12, yX: pad - 1, yXRight: spec.width - pad + 1 }
    },
    xScale,
    yScale
  };
}
