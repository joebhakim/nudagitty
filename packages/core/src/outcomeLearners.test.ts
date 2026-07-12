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

describe("the OTHER axis — flexibility in L — DOES help, once the DGP is honest", () => {
  it("converges monotonically toward the truth as the covariate basis relaxes", () => {
    // I previously asserted the OPPOSITE here, and I was wrong. The old numbers (linear +18,088 /
    // quadratic −5,347 / cubic +5,083 — a sign-flipping $23k thrash) were an ARTEFACT of a corrupted DGP:
    // a log link fed DOLLAR-VALUED earnings history made E[Y|L] exponential in dollars, manufacturing $2.9M
    // earners. Nothing could be learned from a fit to that world.
    //
    // With the Mincer-corrected DGP (earnings history enters as log(1+x)) the true outcome surface is
    // genuinely NONLINEAR in raw L — so flexibility in raw L genuinely helps, and it converges:
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const spec = deriveAdjustmentSpec(doc)!;
    const at = (covariateBasis: "linear" | "quadratic" | "cubic") =>
      analyzeAdjustment(doc, { ...spec, covariateBasis })!.estimates.find((e) => e.id === "outcome_regression")!.estimate!;

    const err = (v: number) => Math.abs(v - 1794);
    const linear = at("linear"), quadratic = at("quadratic"), cubic = at("cubic");
    expect(linear).toBeCloseTo(3611, -2);      // +3,611 — biased high by $1,817
    expect(quadratic).toBeCloseTo(2836, -2);   // +2,836 — $1,042 out
    expect(cubic).toBeCloseTo(2630, -2);       // +2,630 —   $836 out, closest of the three

    // The point: each relaxation moves it CLOSER, monotonically. A real ladder, not a fishing ground.
    expect(err(quadratic)).toBeLessThan(err(linear));
    expect(err(cubic)).toBeLessThan(err(quadratic));
    expect(err(cubic)).toBeLessThan(1000);
  }, 30000);
});

describe("the honest ledger: NO rung recovers the truth, and the log-link rungs are the WORST", () => {
  const run = (outcomeModel: "ols" | "ols_interactions" | "two_part" | "ppml") => {
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const spec = deriveAdjustmentSpec(doc)!;
    return analyzeAdjustment(doc, { ...spec, outcomeModel })!.estimates.find((e) => e.id === "outcome_regression")!.estimate!;
  };

  it("two-part and PPML — the family-aware rungs — do WORSE than plain OLS", () => {
    // This inverts the old result, and it is the whole Mincer lesson landing on the ESTIMATOR side.
    //
    // The DGP's outcome surface is linear in log(1+earnings-history). two_part and ppml fit log(Y) linearly
    // in RAW dollar history and then EXPONENTIATE — so their misspecification is amplified multiplicatively.
    // Plain OLS never exponentiates, so its error does not compound. A log-link model fed un-logged dollar
    // regressors is therefore MORE fragile than a linear one, not less. Getting the FAMILY right buys you
    // nothing if the PREDICTOR SCALE is wrong.
    //
    // So no rung recovers +$1,794, and the ladder's honest verdict is: you need the right family AND the
    // right predictor scale. That is precisely rung 4 (Mincer predictor transforms), still `planned`.
    const ols = run("ols");                    // +3,611
    const twoPart = run("two_part");           // −5,674
    const ppml = run("ppml");                  // −7,053
    expect(Math.abs(twoPart - 1794)).toBeGreaterThan(Math.abs(ols - 1794));
    expect(Math.abs(ppml - 1794)).toBeGreaterThan(Math.abs(ols - 1794));
    for (const v of [ols, twoPart, ppml, run("ols_interactions")]) expect(Math.abs(v - 1794)).toBeGreaterThan(500);
  }, 40000);
});

describe("a learner that cannot describe your outcome REFUSES, and says why", () => {
  it("gamma-log declines an outcome with a zero spike instead of quietly dropping the zeros", () => {
    // The gamma density has no mass at zero. ~12% of LaLonde earnings are exactly zero. Silently dropping
    // them is precisely the sin (that IS what log-OLS does); refusing is the informative answer.
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const spec = deriveAdjustmentSpec(doc)!;
    const or = analyzeAdjustment(doc, { ...spec, outcomeModel: "gamma_log" })!.estimates.find((e) => e.id === "outcome_regression")!;
    expect(or.estimate).toBeNull();
    expect(or.diagnostics?.[0]).toContain("Gamma GLM");
    expect(or.diagnostics?.[0]).toContain("no mass at zero");
    expect(OUTCOME_LEARNERS.find((l) => l.id === "gamma_log")!.requires).toBeTruthy();
  }, 30000);
});
