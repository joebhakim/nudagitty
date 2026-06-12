import { describe, expect, it } from "vitest";
import { binnedBinaryRiskSummaries, type ScatterPoint } from "./CategoryOutcomePlot";

function points(xs: number[], ys: number[]): ScatterPoint[] {
  return xs.map((x, index) => ({ x, y: ys[index] ?? 0, weight: 1, index }));
}

describe("binnedBinaryRiskSummaries", () => {
  it("reports per-bin survival proportion and orders bins by exposure", () => {
    const xs = Array.from({ length: 100 }, (_, i) => i);
    const ys = xs.map((x) => (x < 50 ? 1 : 0));
    const bins = binnedBinaryRiskSummaries(points(xs, ys), 2);
    expect(bins).toHaveLength(2);
    expect(bins[0]!.mean).toBeGreaterThan(0.9);
    expect(bins[1]!.mean).toBeLessThan(0.1);
    expect(bins[0]!.center).toBeLessThan(bins[1]!.center);
    // fixed-width bands: low edge is the band start, the top band is open-ended
    expect(bins[0]!.loEdge).toBeCloseTo(0, 5);
    expect(bins[1]!.hiEdge).toBeNull();
    // proportions stay in [0, 1] with a finite Wilson interval
    expect(bins[0]!.lower).not.toBeNull();
    expect(bins[0]!.upper).not.toBeNull();
  });

  it("captures a non-monotonic risk dip in the middle band", () => {
    const xs = Array.from({ length: 150 }, (_, i) => i);
    const ys = xs.map((x) => (x >= 50 && x < 100 ? 0 : 1));
    const bins = binnedBinaryRiskSummaries(points(xs, ys), 3);
    expect(bins).toHaveLength(3);
    expect(bins[1]!.mean).toBeLessThan(bins[0]!.mean);
    expect(bins[1]!.mean).toBeLessThan(bins[2]!.mean);
  });

  it("returns no bins for empty input", () => {
    expect(binnedBinaryRiskSummaries([], 5)).toEqual([]);
  });
});
