import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { OUTCOME_LEARNERS, outcomeLearner, deriveAdjustmentSpec, analyzeAdjustment } from "./index";

describe("the outcome-model ladder", () => {
  it("is ordered by hypothesis class, and the DEFAULT is the smallest one", () => {
    const rungs = OUTCOME_LEARNERS.map((l) => l.rung);
    expect([...rungs].sort((a, b) => a - b)).toEqual(rungs);   // the array IS the ladder
    expect(OUTCOME_LEARNERS[0]!.id).toBe("ols");

    // Never silently upgrade: unknown, absent, or not-yet-built all resolve to the smallest class.
    expect(outcomeLearner().id).toBe("ols");
    expect(outcomeLearner("forest").id).toBe("ols");          // planned ⇒ falls back, does not throw
    expect(outcomeLearner("two_part").id).toBe("ols");
  });

  it("renders the PLANNED rungs too — a user must be able to see the ceiling and ask for what is missing", () => {
    const planned = OUTCOME_LEARNERS.filter((l) => l.status === "planned");
    expect(planned.length).toBeGreaterThan(3);
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
