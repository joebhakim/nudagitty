import { describe, expect, it } from "vitest";
import { buildDistributionQuantile } from "./distributions";

describe("buildDistributionQuantile", () => {
  it("normal quantiles match the standard normal", () => {
    const q = buildDistributionQuantile({ kind: "normal", mean: 0, sd: 1 }, 8000);
    expect(q(0.5)).toBeCloseTo(0, 1);
    expect(q(0.975)).toBeCloseTo(1.96, 0);
    expect(q(0.025)).toBeCloseTo(-1.96, 0);
  });

  it("is monotone non-decreasing", () => {
    const q = buildDistributionQuantile({ kind: "lognormal", meanLog: 0, sdLog: 0.5 }, 6000);
    expect(q(0.2)).toBeLessThan(q(0.8));
    expect(q(0)).toBeLessThanOrEqual(q(1));
  });

  it("discrete families return integer levels", () => {
    const qb = buildDistributionQuantile({ kind: "bernoulli", p: 0.3 }, 6000);
    expect(qb(0.4)).toBe(0);       // below 1 − p ≈ 0.7
    expect(qb(0.95)).toBe(1);
    const qp = buildDistributionQuantile({ kind: "poisson", lambda: 3 }, 6000);
    expect(Number.isInteger(qp(0.5))).toBe(true);
    expect(qp(0.99)).toBeGreaterThan(qp(0.5));
  });
});
