import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { OUTCOME_LEARNERS, outcomeLearner, deriveAdjustmentSpec, analyzeAdjustment } from "./index";

describe("the outcome-model ladder", () => {
  it("is ordered by hypothesis class, and the DEFAULT is the smallest one", () => {
    const rungs = OUTCOME_LEARNERS.map((l) => l.rung);
    expect([...rungs].sort((a, b) => a - b)).toEqual(rungs);   // the array IS the ladder
    expect(OUTCOME_LEARNERS[0]!.id).toBe("ols");

    // Never silently upgrade: absent, or a rung that is not built yet, both resolve to the smallest class.
    expect(outcomeLearner().id).toBe("ols");
    expect(outcomeLearner("forest").id).toBe("ols");          // planned ⇒ falls back, does not throw
    expect(outcomeLearner("gam").id).toBe("ols");
    expect(outcomeLearner("two_part").id).toBe("two_part");   // built ⇒ you get what you asked for
  });

  it("renders the PLANNED rungs too — a user must be able to see the ceiling and ask for what is missing", () => {
    const planned = OUTCOME_LEARNERS.filter((l) => l.status === "planned");
    expect(planned.length).toBeGreaterThanOrEqual(3);   // mincer, gam, forest — the ceiling is still visible
    for (const l of planned) {
      expect(l.fit).toBeUndefined();          // planned means planned; nothing pretends to work
      expect(l.hypothesisClass).toBeTruthy(); // …but the UI can still SHOW what it would buy you
      expect(l.unlockedBy).toBeTruthy();      // …and the diagnostic that would license it
    }
    for (const l of OUTCOME_LEARNERS.filter((x) => x.status === "usable")) expect(l.fit).toBeDefined();
  });

  it("a forest can never be offered as naive plug-in — it is gated on cross-fitting", () => {
    // ML nuisances converge slower than √n, so a plug-in forest is not valid inference. The constraint is
    // encoded on the learner rather than left in a comment, so the UI cannot accidentally offer it.
    expect(OUTCOME_LEARNERS.find((l) => l.id === "forest")!.needsCrossFitting).toBe(true);
    expect(OUTCOME_LEARNERS.filter((l) => l.needsCrossFitting).every((l) => l.rung >= 5)).toBe(true);
  });
});

describe("the OTHER axis — flexibility in L — helps only when the truth is nonlinear in L", () => {
  it("is FLAT on this DGP, because the true surface is already linear in L", () => {
    // THIS TEST HAS NOW FLIPPED THREE TIMES, and that is the finding.
    //
    //   DGP v1 (log link on raw dollars, a world with $2.4M earners):
    //       linear +18,088   quadratic −5,347   cubic +5,083     ⇒ thrashing, a fishing ground
    //   DGP v2 (log link on sqrt(dollars)):
    //       linear −1,904    quadratic   +540   cubic +2,259     ⇒ converging monotonically
    //   DGP v3 (identity link, levels + zero-indicators — the literature's spec):
    //       linear +3,460    quadratic +3,634   cubic +3,635     ⇒ FLAT
    //
    // The covariate basis helps exactly when the true outcome surface is NONLINEAR in raw L, and not
    // otherwise. Which of those three worlds you are in is precisely what you do not know. So this axis is
    // not a ladder to climb toward truth — it is a SENSITIVITY CHECK whose behaviour is a property of the
    // DGP, not of the estimator. Show all three; never invite someone to pick one and believe it.
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const spec = deriveAdjustmentSpec(doc)!;
    const at = (covariateBasis: "linear" | "quadratic" | "cubic") =>
      analyzeAdjustment(doc, { ...spec, covariateBasis })!.estimates.find((e) => e.id === "outcome_regression")!.estimate!;

    const linear = at("linear"), quadratic = at("quadratic"), cubic = at("cubic");
    expect(linear).toBeCloseTo(3460, -2);
    expect(quadratic).toBeCloseTo(3634, -2);
    expect(cubic).toBeCloseTo(3635, -2);

    // Flat: the extra flexibility buys nothing, and it does NOT reach the truth.
    const spread = Math.max(linear, quadratic, cubic) - Math.min(linear, quadratic, cubic);
    expect(spread).toBeLessThan(400);
    for (const v of [linear, quadratic, cubic]) expect(Math.abs(v - 1794)).toBeGreaterThan(1000);
  }, 30000);
});

describe("the honest ledger: NO rung recovers, and the reason is now nameable", () => {
  const run = (outcomeModel: "ols" | "ols_interactions" | "two_part" | "ppml") => {
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const spec = deriveAdjustmentSpec(doc)!;
    return analyzeAdjustment(doc, { ...spec, outcomeModel })!.estimates.find((e) => e.id === "outcome_regression")!.estimate!;
  };

  it("even the two-part learner misses — it has the right FAMILY but the wrong LINK", () => {
    // The DGP is now gate(L,T) × softplus(L,T) with gamma noise: a PRODUCT of two linear pieces, which is
    // not linear, so plain OLS cannot be right either. And our `two_part` learner fits log(Y) on the
    // positive rows — a LOG amount link — while this DGP's amount margin is IDENTITY. Right family, wrong
    // link. The missing rung is a two-part-IDENTITY learner; until it exists, nothing here can recover.
    // (Each run() rebuilds the example and refits it, so compute each ONCE — eight calls timed out.)
    const got = { ols: run("ols"), inter: run("ols_interactions"), twoPart: run("two_part"), ppml: run("ppml") };
    expect(got.ols).toBeCloseTo(3460, -2);
    expect(got.inter).toBeCloseTo(-2790, -2);
    expect(got.twoPart).toBeCloseTo(-1715, -2);
    expect(got.ppml).toBeCloseTo(3921, -2);
    for (const v of Object.values(got)) expect(Math.abs(v - 1794)).toBeGreaterThan(1000);
  }, 60000);
});

describe("a learner that cannot describe your outcome REFUSES, and says why", () => {
  it("gamma-log declines an outcome with a zero spike instead of quietly dropping the zeros", () => {
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const spec = deriveAdjustmentSpec(doc)!;
    const or = analyzeAdjustment(doc, { ...spec, outcomeModel: "gamma_log" })!.estimates.find((e) => e.id === "outcome_regression")!;
    expect(or.estimate).toBeNull();
    expect(or.diagnostics?.[0]).toContain("Gamma GLM");
    expect(or.diagnostics?.[0]).toContain("no mass at zero");
    expect(OUTCOME_LEARNERS.find((l) => l.id === "gamma_log")!.requires).toBeTruthy();
  }, 30000);
});
