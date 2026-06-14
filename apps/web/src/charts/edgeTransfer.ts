import { edgeContribution, type EdgeMechanism } from "@nudagitty/core";

export interface EdgeTransferSample {
  x: number;
  y: number;
  finite: boolean;
}

export interface EdgeTransferModel {
  /** Input-axis (parent value) domain, padded. */
  x0: number;
  x1: number;
  /** Output-axis (edge contribution) domain, tightly fit to the curve, padded. */
  y0: number;
  y1: number;
  /** Sampled transfer curve across [x0, x1]; non-finite outputs flagged, not dropped. */
  samples: EdgeTransferSample[];
  /** True when contribution = 0 falls inside the y-domain (so a zero reference line is meaningful). */
  hasZeroLine: boolean;
  xTicks: number[];
  yTicks: number[];
}

export interface EdgeTransferOptions {
  /** Empirical range of the source node, when a simulation is available. */
  domain?: { min: number; max: number } | null;
  sampleCount?: number;
}

/**
 * Compute the domain + sampled curve for the edge transfer-function preview.
 *
 * The y-domain is fit to the actual curve (and any piecewise knots) rather than
 * being forced through zero, so each function — a rising saturating curve, a
 * falling smooth_threshold bottoming out well below zero, a log-linear ramp —
 * fills the plot instead of being squished toward an arbitrary baseline. The
 * zero reference line is only drawn when 0 genuinely lands inside that fitted
 * range. This is what makes the axes auto-adjust as the function/params change.
 */
export function computeEdgeTransfer(mechanism: EdgeMechanism, options: EdgeTransferOptions = {}): EdgeTransferModel {
  const sampleCount = Math.max(2, options.sampleCount ?? 72);
  // Only point-based mechanisms actually use `points`; other kinds carry
  // vestigial default knots that must not drag the domain around.
  const usesPoints = mechanism.kind === "piecewise_linear" || mechanism.kind === "monotone_spline";
  const points = usesPoints ? mechanism.points ?? [] : [];

  // X-domain: empirical source range, widened to include any piecewise knots.
  let lo: number | null = options.domain ? options.domain.min : null;
  let hi: number | null = options.domain ? options.domain.max : null;
  for (const point of points) {
    lo = lo === null ? point.x : Math.min(lo, point.x);
    hi = hi === null ? point.x : Math.max(hi, point.x);
  }
  if (lo === null || hi === null || !(hi > lo)) {
    lo = -2;
    hi = 2;
  }
  const xpad = (hi - lo) * 0.06 || 1;
  const x0 = lo - xpad;
  const x1 = hi + xpad;

  const samples: EdgeTransferSample[] = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const x = x0 + ((x1 - x0) * i) / (sampleCount - 1);
    const y = edgeContribution(x, mechanism);
    samples.push({ x, y, finite: Number.isFinite(y) });
  }

  // Y-domain: tight fit to the finite curve and any knots. Not forced through 0.
  const yValues = samples
    .filter((sample) => sample.finite)
    .map((sample) => sample.y)
    .concat(points.map((point) => point.y).filter((value) => Number.isFinite(value)));
  let y0 = yValues.length ? Math.min(...yValues) : -1;
  let y1 = yValues.length ? Math.max(...yValues) : 1;
  if (!(y1 > y0)) {
    // Flat curve (constant contribution): give it a little vertical breathing room.
    const center = Number.isFinite(y0) ? y0 : 0;
    y0 = center - 1;
    y1 = center + 1;
  }
  const ypad = (y1 - y0) * 0.12 || 1;
  y0 -= ypad;
  y1 += ypad;

  const hasZeroLine = y0 < 0 && y1 > 0;
  return {
    x0,
    x1,
    y0,
    y1,
    samples,
    hasZeroLine,
    xTicks: [x0, (x0 + x1) / 2, x1],
    yTicks: hasZeroLine ? [y1, 0, y0] : [y1, (y0 + y1) / 2, y0]
  };
}
