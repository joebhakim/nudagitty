import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { OUTCOME_LEARNERS, outcomeLearner, deriveAdjustmentSpec, analyzeAdjustment, specificationMatch } from "./index";

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

describe("THE MISSING RUNG: two-part with a LEVELS amount — the ladder finally lands on the truth", () => {
  const run = (outcomeModel: "ols" | "ols_interactions" | "two_part" | "two_part_identity" | "ppml", id = "outcome_regression") => {
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const spec = deriveAdjustmentSpec(doc)!;
    return analyzeAdjustment(doc, { ...spec, outcomeModel })!.estimates.find((e) => e.id === id)!.estimate!;
  };

  it("recovers the imposed +$1,794 that every other rung missed", () => {
    // The DGP is gate(L,T) × softplus(L,T) with gamma noise. This learner is a logistic gate × an OLS
    // amount model in LEVELS — the same shape, and the shape every paper in the LaLonde literature fits.
    // Nothing else on the ladder can: rung 1 is linear (but the truth is a PRODUCT, so not linear); rung 2
    // adds flexibility on the wrong axis; `two_part` has the right FAMILY but a LOG amount link and so
    // EXPONENTIATES its own misspecification; PPML puts a log link on a linear mean.
    const got = run("two_part_identity");
    expect(Math.abs(got - 1794)).toBeLessThan(150);          // measured: +1,814 — off by $20
    expect(Math.abs(run("two_part_identity", "aipw") - 1794)).toBeLessThan(150);   // measured: +1,793 — off by $1
  }, 60000);

  it("…and every WRONG rung is wrong for a nameable reason", () => {
    const err = (v: number) => Math.abs(v - 1794);
    const right = err(run("two_part_identity"));
    for (const wrong of ["ols", "ols_interactions", "two_part", "ppml"] as const) {
      // each misses by $1.6k–$4.6k, and by at least an order of magnitude more than the correct rung
      expect(err(run(wrong))).toBeGreaterThan(1000);
      expect(err(run(wrong))).toBeGreaterThan(5 * right);
    }
  }, 90000);
});

describe("heterogeneity: the right hypothesis class, and no way to fit it", () => {
  const or = (id: string, outcomeModel: "ols" | "two_part_identity" | "two_part_identity_interactions") => {
    const doc = exampleDocument(id)!;
    const spec = deriveAdjustmentSpec(doc)!;
    return analyzeAdjustment(doc, { ...spec, outcomeModel })!.estimates.find((e) => e.id === "outcome_regression")!.estimate!;
  };

  it("the rung that recovers the HOMOGENEOUS truth is off by ~$900 once the effect has a shape", () => {
    // Same $1,794, same data, same confounding — only the SHAPE of the effect differs. two_part_identity
    // recovers the homogeneous benchmark to $20 and misses this one by ~$900, and it misses by the same
    // ~$900 at n = 4,000 / 20,000 / 80,000 (+2,703 / +2,603 / +2,617). A hypothesis class that assumes ONE
    // effect cannot be argued out of it with more rows.
    expect(or("lalonde-fit-recover-2part", "two_part_identity")).toBeCloseTo(1814, -2);
    expect(or("lalonde-heterogeneous", "two_part_identity")).toBeCloseTo(2703, -2);
  }, 120000);

  it("…and the CORRECTLY SPECIFIED rung does no better, because 6.9% of rows are treated", () => {
    // This is the LaLonde disease, not a broken learner: T × L is fitted on 185 off-support rows (pre-program
    // earnings $2,096 vs the controls' $19,428) and extrapolated onto 2,490 that resemble none of them. It
    // swings +4,352 / +1,427 / +936 with n and never settles. Given clean overlap the SAME learner recovers
    // both subgroup effects almost exactly — see outcomeLearnerCorrectness.test.ts.
    const got = or("lalonde-heterogeneous", "two_part_identity_interactions");
    expect(got).toBeCloseTo(4352, -2);
    expect(Math.abs(got - 1794)).toBeGreaterThan(1000);   // the right model, still nowhere near
  }, 120000);

  it("specificationMatch reads the effect's SHAPE, not just the outcome's family", () => {
    // With a modifier on the DGP, the model that MATCHES is the one carrying T×L — so the tautology warning
    // has to move with it, or it would flatter the wrong rung.
    expect(specificationMatch(exampleDocument("lalonde-fit-recover-2part")!, "two_part_identity")).toBe("exact");
    expect(specificationMatch(exampleDocument("lalonde-heterogeneous")!, "two_part_identity")).toBe("family");
    expect(specificationMatch(exampleDocument("lalonde-heterogeneous")!, "two_part_identity_interactions")).toBe("exact");
  });
});
