import { describe, it, expect } from "vitest";
import { fitTwoPartIdentityOutcomeModel, fitTwoPartIdentityInteractionOutcomeModel } from "./longitudinal/estimation/fit";
import type { LongitudinalCohort } from "./longitudinal/types";

/**
 * IS THE INTERACTION RUNG CORRECT? — asked away from LaLonde, on purpose.
 *
 * On lalonde-heterogeneous the two-part + T×L rung is the CORRECTLY SPECIFIED model and it still fails:
 * +4,352 / +1,427 / +936 as n grows, never settling, against a truth of +1,794. Two explanations fit that,
 * and they demand opposite responses:
 *
 *   (a) the learner is BUGGY        ⇒ do not ship it
 *   (b) LaLonde has no OVERLAP      ⇒ ship it; its failure is the lesson
 *
 * A benchmark cannot distinguish them, because LaLonde's positivity violation contaminates every estimate on
 * it. So this test asks the question on a DGP where (b) cannot be the answer: randomised treatment, perfect
 * overlap, a known heterogeneous two-part effect, plenty of rows. A correct learner MUST recover the CATEs
 * here — and it does, which is what licenses shipping a rung that visibly fails on the benchmark.
 *
 * DGP:  X ~ Bern(.4), Z ~ N(0,1) nuisance,  T ~ Bern(.5)   ← RANDOMISED: no confounding, perfect overlap
 *       gate:   P(Y>0)     = sigmoid(0.8 + 0.5·Z + 0.6·T)
 *       amount: E[Y | Y>0] = 20 + 3·Z + 2·X + 5·T + 9·T·X   ← the effect is 5 at X=0 and 14 at X=1
 */
function makeCohort(n: number, seed = 7): LongitudinalCohort {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const sig = (x: number) => 1 / (1 + Math.exp(-x));
  const rows: Array<Record<string, number>> = [];
  for (let i = 0; i < n; i += 1) {
    const X = rnd() < 0.4 ? 1 : 0;
    const Z = gauss();
    const T = rnd() < 0.5 ? 1 : 0;
    const p = sig(0.8 + 0.5 * Z + 0.6 * T);
    const amount = 20 + 3 * Z + 2 * X + 5 * T + 9 * T * X + gauss() * 2;
    const Y = rnd() < p ? Math.max(0, amount) : 0;
    rows.push({ X, Z, T, Y });
  }
  return { result: null as never, rows, weights: rows.map(() => 1), sampleSize: n };
}

// The oracle CATE at a row, by construction: E[Y|do(T=1)] − E[Y|do(T=0)], averaging out the noise.
const sig = (x: number) => 1 / (1 + Math.exp(-x));
function oracleCate(X: number, n = 40000, seed = 99) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  let acc = 0;
  for (let i = 0; i < n; i += 1) {
    const Z = gauss();
    const y = (T: number) => sig(0.8 + 0.5 * Z + 0.6 * T) * Math.max(0, 20 + 3 * Z + 2 * X + 5 * T + 9 * T * X);
    acc += y(1) - y(0);
  }
  return acc / n;
}

describe("the two-part + T×L rung, on a DGP with clean overlap", () => {
  const cohort = makeCohort(20000);
  const covs = ["X", "Z"];
  const add = fitTwoPartIdentityOutcomeModel(cohort, "Y", ["T"], covs, false)!;
  const het = fitTwoPartIdentityInteractionOutcomeModel(cohort, "Y", ["T"], covs, false)!;
  /** The model's OWN CATE at X=x: average mu(T=1) − mu(T=0) over the rows in that subgroup. */
  const cateOf = (f: typeof add, x: number) => {
    const rs = cohort.rows.filter((r) => r["X"] === x);
    let acc = 0;
    for (const r of rs) acc += f(r, new Map([["T", 1]])) - f(r, new Map([["T", 0]]));
    return acc / rs.length;
  };

  it("recovers BOTH subgroup effects — so the rung is sound, and LaLonde is the problem", () => {
    expect(add).toBeTruthy();
    expect(het).toBeTruthy();
    //            oracle   two_part_identity   +T×L
    //   X=0        6.08          8.82         5.82
    //   X=1       13.43          9.57        13.88
    expect(cateOf(het, 0)).toBeCloseTo(oracleCate(0), -0.5);   // ≈ 6
    expect(cateOf(het, 1)).toBeCloseTo(oracleCate(1), -0.5);   // ≈ 13.4
    expect(Math.abs(cateOf(het, 1) - cateOf(het, 0))).toBeGreaterThan(6);  // it SEES the heterogeneity
  });

  it("…while the additive rung collapses them to one number, exactly as its class says it must", () => {
    // Not a bug — a hypothesis class. `two_part_identity` has no T×L term, so it CANNOT represent two
    // effects, and it reports ~9 for both subgroups whose true effects are 6.1 and 13.4.
    expect(Math.abs(cateOf(add, 1) - cateOf(add, 0))).toBeLessThan(1.5);
    expect(cateOf(add, 0)).toBeGreaterThan(oracleCate(0) + 1.5);   // over-states the graduates'
    expect(cateOf(add, 1)).toBeLessThan(oracleCate(1) - 1.5);      // under-states the dropouts'
  });

  it("RANDOMISATION forgives the wrong shape — CONFOUNDING does not. That is the whole lesson.", () => {
    // Both models get the ATE right here (9.12 and 9.04 against 9.02) even though one of them has the
    // effect's shape badly wrong. Under a coin flip there is no counterfactual to impute ACROSS arms, so a
    // misspecified CATE averages out. Under confounding — LaLonde — the model must predict Y(1) for controls
    // who look nothing like any treated unit, and then the shape is load-bearing and the ATE inherits the
    // error. This is why the SAME rung that is merely imprecise here is off by ~$900 there.
    const ate = (f: typeof add) => 0.6 * cateOf(f, 0) + 0.4 * cateOf(f, 1);
    const truth = 0.6 * oracleCate(0) + 0.4 * oracleCate(1);
    expect(ate(add)).toBeCloseTo(truth, -0.5);   // the WRONG-shape model still nails the ATE…
    expect(ate(het)).toBeCloseTo(truth, -0.5);   // …and so does the right one
  });
});
