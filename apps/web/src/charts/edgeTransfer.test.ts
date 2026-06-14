import { describe, expect, it } from "vitest";
import { defaultEdgeMechanism, normalizeEdgeMechanism, type EdgeMechanism, type EdgeMechanismKind } from "@nudagitty/core";
import { computeEdgeTransfer } from "./edgeTransfer";

function mechanism(kind: EdgeMechanismKind, patch: Partial<EdgeMechanism> = {}): EdgeMechanism {
  return normalizeEdgeMechanism({ ...defaultEdgeMechanism(kind), ...patch });
}

/** Every finite sampled point must sit inside the reported y-domain. */
function curveFitsDomain(model: ReturnType<typeof computeEdgeTransfer>) {
  const finite = model.samples.filter((sample) => sample.finite);
  expect(finite.length).toBeGreaterThan(0);
  for (const sample of finite) {
    expect(sample.y).toBeGreaterThanOrEqual(model.y0 - 1e-9);
    expect(sample.y).toBeLessThanOrEqual(model.y1 + 1e-9);
  }
  // The fit should be reasonably tight: the curve's own span fills a healthy
  // fraction of the padded domain (not squished into a sliver).
  const ys = finite.map((sample) => sample.y);
  const span = Math.max(...ys) - Math.min(...ys);
  if (span > 1e-6) {
    expect(span / (model.y1 - model.y0)).toBeGreaterThan(0.5);
  }
}

const KINDS: EdgeMechanismKind[] = [
  "linear",
  "absorbing",
  "threshold",
  "smooth_threshold",
  "saturating",
  "quadratic",
  "piecewise_linear",
  "hill_emax",
  "log_linear",
  "power_law",
  "monotone_spline"
];

describe("computeEdgeTransfer axis auto-fit", () => {
  it("produces a valid, curve-bounding domain for every mechanism kind", () => {
    for (const kind of KINDS) {
      const model = computeEdgeTransfer(mechanism(kind), { domain: { min: -3, max: 3 } });
      expect(model.x1).toBeGreaterThan(model.x0);
      expect(model.y1).toBeGreaterThan(model.y0);
      expect(model.samples.length).toBe(72);
      curveFitsDomain(model);
    }
  });

  it("does NOT force zero into the domain — an offset positive curve fills the plot", () => {
    // saturating around a positive midpoint sits entirely above 0.
    const model = computeEdgeTransfer(mechanism("saturating", { scale: 4, midpoint: 0, steepness: 1 }), {
      domain: { min: 2, max: 6 }
    });
    const ys = model.samples.filter((s) => s.finite).map((s) => s.y);
    expect(Math.min(...ys)).toBeGreaterThan(0); // curve never touches zero
    expect(model.y0).toBeGreaterThan(-0.5); // domain stays near the curve, not dragged to 0
    expect(model.hasZeroLine).toBe(false);
    curveFitsDomain(model);
  });

  it("keeps the zero reference line when the curve genuinely straddles zero", () => {
    const model = computeEdgeTransfer(mechanism("linear", { coefficient: 2 }), { domain: { min: -3, max: 3 } });
    expect(model.y0).toBeLessThan(0);
    expect(model.y1).toBeGreaterThan(0);
    expect(model.hasZeroLine).toBe(true);
    expect(model.yTicks).toContain(0);
  });

  it("auto-fits a FALLING smooth_threshold (the cats injury->survival shape)", () => {
    const model = computeEdgeTransfer(mechanism("smooth_threshold", { scale: -6.8, threshold: 0.78, steepness: 3.2 }), {
      domain: { min: -1.5, max: 2.5 }
    });
    const first = model.samples.find((s) => s.finite)!.y;
    const last = [...model.samples].reverse().find((s) => s.finite)!.y;
    expect(last).toBeLessThan(first); // contribution falls left->right
    expect(model.y0).toBeLessThan(-6); // domain stretches down to the negative plateau
    expect(model.hasZeroLine).toBe(true); // top of curve is ~0
    curveFitsDomain(model);
  });

  it("re-scales the y-domain when the steepness/scale changes (axes adapt to params)", () => {
    const shallow = computeEdgeTransfer(mechanism("smooth_threshold", { scale: -2, threshold: 0, steepness: 1 }), {
      domain: { min: -3, max: 3 }
    });
    const steep = computeEdgeTransfer(mechanism("smooth_threshold", { scale: -8, threshold: 0, steepness: 4 }), {
      domain: { min: -3, max: 3 }
    });
    // A larger scale magnitude must yield a taller fitted domain.
    expect(steep.y1 - steep.y0).toBeGreaterThan(shallow.y1 - shallow.y0);
  });

  it("tracks the x-domain from the source empirical range", () => {
    const narrow = computeEdgeTransfer(mechanism("linear"), { domain: { min: 0, max: 1 } });
    const wide = computeEdgeTransfer(mechanism("linear"), { domain: { min: -50, max: 50 } });
    expect(wide.x1 - wide.x0).toBeGreaterThan(narrow.x1 - narrow.x0);
    expect(narrow.x0).toBeLessThan(0); // padded just past the empirical min
    expect(narrow.x1).toBeGreaterThan(1);
  });

  it("widens the x-domain to include piecewise knots beyond the empirical range", () => {
    const model = computeEdgeTransfer(
      mechanism("piecewise_linear", {
        points: [
          { x: -5, y: 0 },
          { x: 0, y: 1 },
          { x: 12, y: -2 }
        ]
      }),
      { domain: { min: -1, max: 1 } }
    );
    expect(model.x0).toBeLessThanOrEqual(-5);
    expect(model.x1).toBeGreaterThanOrEqual(12);
    curveFitsDomain(model);
  });

  it("gives a flat (constant) curve vertical breathing room instead of a zero-height axis", () => {
    const model = computeEdgeTransfer(mechanism("linear", { coefficient: 0 }), { domain: { min: -2, max: 2 } });
    expect(model.y1).toBeGreaterThan(model.y0);
    expect(model.samples.every((s) => s.finite && s.y === 0)).toBe(true);
    expect(model.hasZeroLine).toBe(true);
  });

  it("falls back to a sane domain when no source range and no knots are available", () => {
    const model = computeEdgeTransfer(mechanism("linear"), { domain: null });
    expect(model.x0).toBeLessThan(model.x1);
    expect(Number.isFinite(model.x0)).toBe(true);
    expect(Number.isFinite(model.y0)).toBe(true);
    curveFitsDomain(model);
  });

  it("stays finite-bounded even when the function can blow up (power_law / log_linear)", () => {
    for (const kind of ["power_law", "log_linear"] as EdgeMechanismKind[]) {
      const model = computeEdgeTransfer(mechanism(kind), { domain: { min: -4, max: 8 } });
      expect(Number.isFinite(model.y0)).toBe(true);
      expect(Number.isFinite(model.y1)).toBe(true);
      expect(model.y1).toBeGreaterThan(model.y0);
      // at least some samples render
      expect(model.samples.some((s) => s.finite)).toBe(true);
    }
  });
});
