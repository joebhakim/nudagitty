import { describe, expect, it } from "vitest";
import { samplePair, sampleDVine, sampleDVineModerated, simpleEdge, tailDependence, type MixtureEdge, type PairCopula } from "./copulaVine";
import { normalizeEdgeMechanism } from "./graph";
import { buildDistributionQuantile } from "./distributions";

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

describe("copulaVine — moderated mixture edges (the complete model)", () => {
  const id = (u: number) => u;

  it("constant mixture edges reproduce sampleDVine exactly (backward compatible)", () => {
    const trees: PairCopula[][] = [[{ family: "gaussian", tau: 0.6 }, { family: "clayton", tau: 0.5 }], [{ family: "gaussian", tau: 0.4 }]];
    const edges: MixtureEdge[][] = [[simpleEdge("gaussian", 0.6), simpleEdge("clayton", 0.5)], [simpleEdge("gaussian", 0.4)]];
    const q = [id, id, id];
    const su = uniforms(11, 30);
    for (let s = 0; s < 8; s += 1) {
      const w = [su[3 * s]!, su[3 * s + 1]!, su[3 * s + 2]!];
      const a = sampleDVine(trees, w);
      const b = sampleDVineModerated(edges, w, q).u;
      for (let p = 0; p < 3; p += 1) expect(b[p]).toBeCloseTo(a[p]!, 10);
    }
  });

  it("a moderated edge flips the conditional τ with the moderator's value (non-simplified)", () => {
    // T2 edge (0,2|1): τ = 0.95·tanh(2·value_of_position_1) — negative for low moderator, positive for high.
    const lin = normalizeEdgeMechanism({ kind: "linear", coefficient: 2 });
    const modEdge: MixtureEdge = { components: [{ family: "gaussian", rotation: 0, tau: { by: 1, constant: 0, mechanism: lin } }], weights: [{ by: null, constant: 1 }] };
    const edges: MixtureEdge[][] = [[simpleEdge("gaussian", 0.3), simpleEdge("gaussian", 0.3)], [modEdge]];
    const normalQ = buildDistributionQuantile({ kind: "normal", mean: 0, sd: 1 });
    const q = [normalQ, normalQ, normalQ];
    const su = uniforms(31, 3 * N);
    const loU: number[] = [], loV: number[] = [], hiU: number[] = [], hiV: number[] = [];
    for (let s = 0; s < N; s += 1) {
      const pseudo: Record<string, [number, number]> = {};
      const { u } = sampleDVineModerated(edges, [su[3 * s]!, su[3 * s + 1]!, su[3 * s + 2]!], q, pseudo);
      const modVal = normalQ(u[1]!);
      const [a, b] = pseudo["1:0"]!;
      if (modVal < -0.4) { loU.push(a); loV.push(b); } else if (modVal > 0.4) { hiU.push(a); hiV.push(b); }
    }
    expect(kendall(loU, loV)).toBeLessThan(-0.1);   // low moderator → negative conditional dependence
    expect(kendall(hiU, hiV)).toBeGreaterThan(0.1); // high moderator → positive
  });

  it("a mixture edge blends its components' dependence", () => {
    const mix: MixtureEdge = {
      components: [{ family: "gaussian", rotation: 0, tau: { by: null, constant: 0.7 } }, { family: "independence", rotation: 0, tau: { by: null, constant: 0 } }],
      weights: [{ by: null, constant: 1.5 }, { by: null, constant: 0 }] // softmax([1.5,0]) ≈ [0.82, 0.18]
    };
    const su = uniforms(41, 2 * N);
    const us: number[] = [], vs: number[] = [];
    for (let s = 0; s < N; s += 1) { const { u } = sampleDVineModerated([[mix]], [su[2 * s]!, su[2 * s + 1]!], [id, id]); us.push(u[0]!); vs.push(u[1]!); }
    const t = kendall(us, vs);
    expect(t).toBeGreaterThan(0.15); // above independence
    expect(t).toBeLessThan(0.65);    // below the pure gaussian(0.7) component
  });
});
