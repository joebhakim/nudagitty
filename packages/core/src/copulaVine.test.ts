import { describe, expect, it } from "vitest";
import { samplePair, sampleDVine, tailDependence, type PairCopula } from "./copulaVine";

// deterministic uniforms
function uniforms(seed: number, n: number): number[] {
  let s = seed >>> 0;
  return Array.from({ length: n }, () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; });
}
function kendall(xs: number[], ys: number[]): number {
  let c = 0, d = 0;
  for (let i = 0; i < xs.length; i += 1) for (let j = i + 1; j < xs.length; j += 1) {
    const a = (xs[i]! - xs[j]!) * (ys[i]! - ys[j]!); if (a > 0) c += 1; else if (a < 0) d += 1;
  }
  return (c - d) / (c + d);
}
const N = 500;

describe("copulaVine — bivariate families reproduce their Kendall's τ", () => {
  const cases: Array<[PairCopula, number]> = [
    [{ family: "gaussian", tau: 0.6 }, 0.6],
    [{ family: "gaussian", tau: -0.5 }, -0.5],
    [{ family: "frank", tau: 0.4 }, 0.4],
    [{ family: "frank", tau: -0.7 }, -0.7],
    [{ family: "clayton", tau: 0.5 }, 0.5],
    [{ family: "gumbel", tau: 0.5 }, 0.5],
    [{ family: "clayton", tau: 0.5, rotation: 90 }, -0.5], // rotation flips the sign
    [{ family: "gumbel", tau: 0.5, rotation: 180 }, 0.5],  // survival keeps τ, flips the tail
  ];
  for (const [pc, target] of cases) {
    it(`${pc.family}${pc.rotation ? " rot" + pc.rotation : ""} τ≈${target}`, () => {
      const w = uniforms(7, 2 * N);
      const us: number[] = [], vs: number[] = [];
      for (let i = 0; i < N; i += 1) { const [u, v] = samplePair(pc, w[2 * i]!, w[2 * i + 1]!); us.push(u); vs.push(v); }
      expect(kendall(us, vs)).toBeCloseTo(target, 1);
    });
  }

  it("tail dependence: Clayton lower, Gumbel upper, survival flips", () => {
    expect(tailDependence({ family: "clayton", tau: 0.5 })).toEqual([expect.closeTo(0.707, 2), 0]);
    expect(tailDependence({ family: "gumbel", tau: 0.5 })).toEqual([0, expect.closeTo(0.586, 2)]);
    expect(tailDependence({ family: "gumbel", tau: 0.5, rotation: 180 })).toEqual([expect.closeTo(0.586, 2), 0]);
  });
});

describe("copulaVine — D-vine", () => {
  function vinePairs(x: number, y: number, z: number): number[][][] {
    const w = uniforms(11, 3 * N);
    const trees = (c13: PairCopula): PairCopula[][] => [
      [{ family: "gaussian", tau: x }, { family: "clayton", tau: y }], // T1: (0,1),(1,2)
      [c13]                                                            // T2: (0,2|1)
    ];
    const draw = (c13: PairCopula) => {
      const X: number[] = [], Y: number[] = [], Z: number[] = [];
      for (let i = 0; i < N; i += 1) { const p = sampleDVine(trees(c13), [w[3 * i]!, w[3 * i + 1]!, w[3 * i + 2]!]); X.push(p[0]!); Y.push(p[1]!); Z.push(p[2]!); }
      return { X, Y, Z };
    };
    const indep = draw({ family: "independence", tau: 0 });
    const coupled = draw({ family: "gaussian", tau: z });
    return [
      [[kendall(indep.X, indep.Y)], [kendall(indep.Y, indep.Z)], [kendall(indep.X, indep.Z)]],
      [[kendall(coupled.X, coupled.Z)]]
    ];
  }

  it("d=3: direct pairs hit their τ; the conditional cell raises the induced outer τ", () => {
    const [[[t01], [t12], [t02indep]], [[t02coupled]]] = vinePairs(0.6, 0.5, 0.7) as unknown as [[[number], [number], [number]], [[number]]];
    expect(t01).toBeCloseTo(0.6, 1);          // direct (0,1)
    expect(t12).toBeCloseTo(0.5, 1);          // direct (1,2)
    expect(t02indep).toBeGreaterThan(0.2);    // induced through the middle, even with c02|1 = independence
    expect(t02indep).toBeLessThan(0.55);
    expect(t02coupled).toBeGreaterThan(t02indep + 0.15); // adding direct conditional dependence lifts it
  });

  it("a conditional edge's pseudo-observations carry the edited conditional τ, not the marginal", () => {
    const w = uniforms(23, 3 * N);
    const trees: PairCopula[][] = [
      [{ family: "gaussian", tau: 0.6 }, { family: "clayton", tau: 0.5 }], // T1
      [{ family: "gaussian", tau: 0.5 }]                                   // T2: c_{0,2|1}
    ];
    const pu: number[] = [], pv: number[] = [], m0: number[] = [], m2: number[] = [];
    for (let i = 0; i < N; i += 1) {
      const pseudo: Record<string, [number, number]> = {};
      const pos = sampleDVine(trees, [w[3 * i]!, w[3 * i + 1]!, w[3 * i + 2]!], pseudo);
      const [a, b] = pseudo["1:0"]!; pu.push(a); pv.push(b);          // conditional-rank pseudo-obs of the T2 edge
      m0.push(pos[0]!); m2.push(pos[2]!);                             // marginal ranks of the same outer pair
    }
    expect(kendall(pu, pv)).toBeCloseTo(0.5, 1);                       // the copula we edited
    expect(kendall(m0, m2)).toBeGreaterThan(0.55);                    // the MARGINAL is higher (leak through the middle)
  });

  it("d=4 truncated at T1: adjacent pairs strong, distant pair weaker (chain decay)", () => {
    const w = uniforms(19, 4 * N);
    const trees: PairCopula[][] = [[
      { family: "gaussian", tau: 0.6 }, { family: "gaussian", tau: 0.6 }, { family: "gaussian", tau: 0.6 }
    ]]; // only T1; T2,T3 truncated to independence
    const cols: number[][] = [[], [], [], []];
    for (let i = 0; i < N; i += 1) { const p = sampleDVine(trees, [w[4 * i]!, w[4 * i + 1]!, w[4 * i + 2]!, w[4 * i + 3]!]); for (let k = 0; k < 4; k += 1) cols[k]!.push(p[k]!); }
    const adj = kendall(cols[0]!, cols[1]!);
    const far = kendall(cols[0]!, cols[3]!); // positions 0 and 3: coupled only through the chain
    expect(adj).toBeCloseTo(0.6, 1);
    expect(far).toBeGreaterThan(0.15);
    expect(far).toBeLessThan(adj); // decays with distance along the line
  });
});
