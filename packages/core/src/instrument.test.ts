import { describe, it, expect } from "vitest";
import { estimateInstrument, candidateInstruments } from "./instrument";
import { parseModel } from "./parser";

// Deterministic seeded generator so the test is reproducible without Math.random.
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("estimateInstrument", () => {
  it("recovers the causal effect under unmeasured confounding (Wald = 2SLS ≈ truth, naive is biased)", () => {
    const rand = lcg(42);
    const rows: Array<Record<string, number>> = [];
    const TRUE_EFFECT = 1.0;
    for (let i = 0; i < 40000; i += 1) {
      const Z = rand() < 0.5 ? 0 : 1; // instrument, as-if random
      const U = rand(); // unmeasured confounder in [0,1]
      // A depends on Z (first stage ≈ 0.6) AND U (confounding).
      const A = 0.15 + 0.6 * Z + 0.4 * U > rand() ? 1 : 0;
      // Y = effect·A + 2·U + noise. Z reaches Y only through A (exclusion); Z ⫫ U (independence).
      const Y = TRUE_EFFECT * A + 2 * U + (rand() - 0.5) * 0.2;
      rows.push({ Z, A, Y });
    }
    const weights = rows.map(() => 1);
    const est = estimateInstrument(rows, weights, { instrument: "Z", treatment: "A", outcome: "Y" });
    expect(est).not.toBeNull();
    if (!est) return;
    // First stage is real and not weak.
    expect(est.firstStage).toBeGreaterThan(0.4);
    expect(est.weakInstrument).toBe(false);
    // Wald and 2SLS coincide for a binary instrument and recover the true effect.
    expect(est.wald).toBeCloseTo(TRUE_EFFECT, 1);
    expect(est.twoSLS).toBeCloseTo(TRUE_EFFECT, 1);
    expect(Math.abs((est.wald ?? 0) - (est.twoSLS ?? 0))).toBeLessThan(1e-6);
    // The naive contrast is biased UPWARD by the confounder, and IV is closer to the truth than naive.
    expect(est.naive).not.toBeNull();
    expect(est.naive ?? 0).toBeGreaterThan(TRUE_EFFECT + 0.1);
    expect(Math.abs((est.wald ?? 0) - TRUE_EFFECT)).toBeLessThan(Math.abs((est.naive ?? 0) - TRUE_EFFECT));
  });

  it("flags a weak instrument when the first stage is ~0", () => {
    const rand = lcg(7);
    const rows: Array<Record<string, number>> = [];
    for (let i = 0; i < 5000; i += 1) {
      const Z = rand() < 0.5 ? 0 : 1;
      const A = rand() < 0.5 ? 1 : 0; // A independent of Z → no first stage
      const Y = A + (rand() - 0.5);
      rows.push({ Z, A, Y });
    }
    const est = estimateInstrument(rows, rows.map(() => 1), { instrument: "Z", treatment: "A", outcome: "Y" });
    expect(est?.weakInstrument).toBe(true);
  });
});

describe("candidateInstruments", () => {
  it("flags a root that feeds the exposure but not the outcome", () => {
    const graph = parseModel(`dag {
  Z
  A [exposure]
  Y [outcome]
  Z -> A
  A -> Y
}`, "iv").document.graph;
    expect(candidateInstruments(graph)).toEqual(["Z"]);
  });

  it("does NOT flag a node with a direct edge to the outcome (exclusion fails)", () => {
    const graph = parseModel(`dag {
  Z
  A [exposure]
  Y [outcome]
  Z -> A
  Z -> Y
  A -> Y
}`, "not-iv").document.graph;
    expect(candidateInstruments(graph)).toEqual([]);
  });
});
