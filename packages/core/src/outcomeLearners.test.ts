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

describe("the OTHER axis — flexibility in L — does NOT ladder toward truth", () => {
  it("thrashes across a $23k range, sign-flipping, while the truth sits still at +$1,794", () => {
    // Same family (linear/identity), same data, same estimator. ONLY the covariate basis changes. If more
    // flexibility in L were the fix, these would march toward 1794. They do not — they wander, which makes
    // the basis a researcher degree of freedom to fish in rather than a ladder to climb. This is precisely
    // why the response-FAMILY axis (learners.ts) is the one that gets a guided default, and why the basis
    // should be shown as a SENSITIVITY DISPLAY (all three at once), never as a picker.
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const spec = deriveAdjustmentSpec(doc)!;
    const at = (covariateBasis: "linear" | "quadratic" | "cubic") =>
      analyzeAdjustment(doc, { ...spec, covariateBasis })!.estimates.find((e) => e.id === "outcome_regression")!.estimate!;

    const linear = at("linear"), quadratic = at("quadratic"), cubic = at("cubic");
    expect(linear).toBeGreaterThan(15000);     // +18,088 — wildly high
    expect(quadratic).toBeLessThan(0);         //  −5,347 — sign-flipped
    expect(cubic).toBeGreaterThan(0);          //  +5,083 — back over, still wrong

    const spread = Math.max(linear, quadratic, cubic) - Math.min(linear, quadratic, cubic);
    expect(spread).toBeGreaterThan(20000);     // the truth (+1,794) is nowhere near the middle of this
  }, 20000);
});

describe("rung 3 — the family-aware learners, on the real ledger", () => {
  const doc = () => exampleDocument("lalonde-fit-recover-2part")!;
  const run = (outcomeModel: "ols" | "two_part" | "ppml") => {
    const spec = deriveAdjustmentSpec(doc())!;
    const rep = analyzeAdjustment(doc(), { ...spec, outcomeModel })!;
    return rep.estimates.find((e) => e.id === "outcome_regression")!.estimate!;
  };

  it("two-part recovers the imposed +$1,794 that OLS missed by an order of magnitude", () => {
    expect(run("ols")).toBeGreaterThan(15000);          // +18,088 — the impossible-counterfactual artefact
    expect(run("two_part")).toBeGreaterThan(1500);      // +1,860 — recovered
    expect(run("two_part")).toBeLessThan(2200);
  }, 30000);

  it("…but PPML does NOT, and that is the honest lesson: the family has to be RIGHT, not merely better", () => {
    // PPML is a perfectly respectable family for non-negative skewed outcomes with zeros — it just is not
    // THIS DGP's family. A single exp(x'b) index cannot represent a saturating participation gate, so it
    // stays misspecified and lands ~47% low. Two-part "wins" here only because it IS the generating family:
    // correct specification is what buys correct extrapolation across a support gap. On real data you do not
    // get that gift — which is exactly why LaLonde is hard, and why the UI must never read
    // "switch to two-part and you win".
    const ppml = run("ppml");
    expect(ppml).toBeGreaterThan(500);
    expect(ppml).toBeLessThan(1500);                    // +948 — right ballpark, still biased
    expect(Math.abs(ppml - 1794)).toBeGreaterThan(Math.abs(run("two_part") - 1794));
  }, 30000);

  it("refuses to model a negative outcome rather than silently relabelling it", () => {
    // Both rung-3 learners return null on negative values: the gate would quietly recode them as
    // "it never happened", and exp(x'b) cannot produce them at all.
    const learners = OUTCOME_LEARNERS.filter((l) => ["two_part", "ppml"].includes(l.id));
    const cohort = { rows: [{ y: -5, t: 1, l: 2 }, { y: 3, t: 0, l: 1 }], weights: [1, 1], sampleSize: 2 } as never;
    for (const l of learners) expect(l.fit!(cohort, "y", ["t"], ["l"], false, "linear")).toBeNull();
  });
});

describe("climbing the ladder within the WRONG axis does not help", () => {
  const run = (outcomeModel: "ols" | "ols_interactions") => {
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const spec = deriveAdjustmentSpec(doc)!;
    return analyzeAdjustment(doc, { ...spec, outcomeModel })!.estimates.find((e) => e.id === "outcome_regression")!.estimate!;
  };

  it("rung 2 relaxes the constant-effect assumption — and SIGN-FLIPS instead of improving", () => {
    // Rung 1 assumes there is only ONE effect. Rung 2 lets it vary with L, which is a real and honest
    // relaxation... and the estimate goes from +18,088 to −3,996 against a truth of +1,794. Both rungs are
    // still LINEAR IN THE OUTCOME'S SUPPORT, so both still impute impossible counterfactual earnings; the
    // extra flexibility just redistributes the lie. Flexibility was never the problem. SUPPORT was.
    expect(run("ols")).toBeGreaterThan(15000);
    expect(run("ols_interactions")).toBeLessThan(0);
    expect(Math.abs(run("ols_interactions") - 1794)).toBeGreaterThan(3000);
  }, 30000);
});

describe("a learner that cannot describe your outcome REFUSES, and says why", () => {
  it("gamma-log declines an outcome with a zero spike instead of quietly dropping the zeros", () => {
    // The gamma density has no mass at zero. 12.4% of LaLonde earnings are exactly zero. Silently dropping
    // them is precisely the sin (that IS what log-OLS does); refusing is the informative answer.
    const doc = exampleDocument("lalonde-fit-recover-2part")!;
    const spec = deriveAdjustmentSpec(doc)!;
    const rep = analyzeAdjustment(doc, { ...spec, outcomeModel: "gamma_log" })!;
    const or = rep.estimates.find((e) => e.id === "outcome_regression")!;
    expect(or.estimate).toBeNull();
    expect(or.diagnostics?.[0]).toContain("Gamma GLM");
    expect(or.diagnostics?.[0]).toContain("no mass at zero");

    expect(OUTCOME_LEARNERS.find((l) => l.id === "gamma_log")!.requires).toBeTruthy();
  }, 30000);
});
