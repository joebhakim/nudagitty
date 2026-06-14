import { describe, expect, it } from "vitest";
import { chartFrame, niceTicks, paddedDomain } from "./chartFrame";

describe("niceTicks", () => {
  it("returns round 1/2/5 steps inside the domain", () => {
    expect(niceTicks(0, 1, 4)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(0, 1, 2)).toEqual([0, 0.5, 1]);
    expect(niceTicks(0, 100, 4)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(-4, 4, 4)).toContain(0);
  });
});

describe("paddedDomain", () => {
  it("adds headroom and clamps to bounds (no negative / >1 rate)", () => {
    const [lo, hi] = paddedDomain(0.3, 1.0, { pad: 0.1, clampMin: 0, clampMax: 1 });
    expect(lo).toBeGreaterThan(0.2);
    expect(lo).toBeLessThan(0.3); // padded below the data
    expect(hi).toBe(1); // clamped, not 1.07
  });
  it("gives a flat value breathing room", () => {
    const [lo, hi] = paddedDomain(0.5, 0.5);
    expect(hi).toBeGreaterThan(lo);
  });
});

describe("chartFrame margin convention", () => {
  it("reserves left margin for declared tick labels + title (no magic numbers)", () => {
    const bare = chartFrame({ width: 300, height: 200 });
    const withY = chartFrame({ width: 300, height: 200, y: { ticks: true, title: true } });
    expect(withY.margin.left).toBeGreaterThan(bare.margin.left);
    // declaring a y axis shrinks the plot from the left but not the top/right
    expect(withY.plot.x).toBe(withY.margin.left);
    expect(withY.plot.width).toBeLessThan(bare.plot.width);
  });

  it("derives total height from plotHeight + reserved axis bands", () => {
    const frame = chartFrame({ width: 360, plotHeight: 76, x: { ticks: true, title: true } });
    // total height = top pad + plot + (pad + tick row + title band)
    expect(frame.plot.height).toBe(76);
    expect(frame.height).toBeGreaterThan(76);
    // the bottom axis title sits below the tick row, inside the frame
    expect(frame.anchors.title.xY).toBeGreaterThan(frame.anchors.ticks.xY);
    expect(frame.anchors.title.xY).toBeLessThanOrEqual(frame.height);
  });

  it("honors a fixed gutter size (e.g. a left row-label column)", () => {
    const frame = chartFrame({ width: 360, plotHeight: 60, y: { size: 150 } });
    expect(frame.margin.left).toBe(150);
    expect(frame.plot.x).toBe(150);
  });

  it("scales map the domain edges to the plot edges", () => {
    const frame = chartFrame({ width: 200, height: 100, xDomain: [-4, 4], yDomain: [0, 1] });
    expect(frame.xScale(-4)).toBeCloseTo(frame.plot.x);
    expect(frame.xScale(4)).toBeCloseTo(frame.plot.right);
    expect(frame.xScale(0)).toBeCloseTo(frame.plot.cx);
    expect(frame.yScale(1)).toBeCloseTo(frame.plot.y); // top
    expect(frame.yScale(0)).toBeCloseTo(frame.plot.bottom); // bottom
  });

  it("insets the scale range so edge values don't touch the plot border", () => {
    const frame = chartFrame({ width: 200, height: 100, yDomain: [0, 1], insetY: 8 });
    expect(frame.yScale(1)).toBeCloseTo(frame.plot.y + 8); // top value sits 8px in
    expect(frame.yScale(0)).toBeCloseTo(frame.plot.bottom - 8);
  });
});
