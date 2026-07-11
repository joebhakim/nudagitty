// Three REAL node shapes from the LaLonde examples, so the equation view is stress-tested against the
// families it actually has to render — not just the easy additive one. The whole point of the equation
// direction is that the generative FORM is the thing worth teaching, so it must be family-aware.
import type { DepState } from "./fixtures";

export type Family = "continuous" | "binary" | "semicontinuous";

export interface EqTerm { id: string; parent: string; coef: number | null; state: DepState }
export interface EqPart { intercept: { value: number; state: DepState }; terms: EqTerm[] }
export interface EqNode {
  id: string;
  label: string;
  family: Family;
  /** The linear predictor η (for two-part this is the INTENSIVE part). */
  eta: EqPart;
  /** Additive noise on the η scale. Absent for a pure Bernoulli node (no free noise). */
  noise?: { sd: number; state: DepState };
  /** Two-part only: the extensive-margin (participation) predictor. */
  gate?: EqPart;
}

const F = (id: string, parent: string, coef: number | null, state: DepState = "fitted"): EqTerm => ({ id, parent, coef, state });

// 1 · The additive continuous outcome (lalonde-fit-recover). Real fitted values; treat→earnings AUTHORED.
export const NODE_CONTINUOUS: EqNode = {
  id: "earnings78",
  label: "earnings '78",
  family: "continuous",
  eta: {
    intercept: { value: -797.10, state: "fitted" },
    terms: [
      F("age", "age", -79.63),
      F("education", "education", 593.73),
      F("married", "married", 1626.90),
      F("re74", "earnings '74", 0.282),
      F("re75", "earnings '75", 0.569),
      F("nodegree", "no degree", null, "not-learned"),
      F("treat", "in program", 1794.0, "authored")
    ]
  },
  noise: { sd: 6500, state: "fitted" }
};

// 2 · The binary treatment (its enrolment logistic). Shows P(A=1)=σ(η) — the reason a coefficient here
// is +0.6 and not "+0.6 people".
export const NODE_BINARY: EqNode = {
  id: "in_program",
  label: "in program",
  family: "binary",
  eta: {
    intercept: { value: 0.40, state: "fitted" },
    terms: [
      F("age", "age", -0.010),
      F("education", "education", -0.050),
      F("nodegree", "no degree", 0.600),
      F("re74", "earnings '74", -0.00002),
      F("re75", "earnings '75", -0.00002)
    ]
  }
};

// 3 · The two-part outcome (lalonde-fit-recover-2part). THE case that motivated all this: the gate and the
// exp() are currently invisible in the editor — here they're just… the equation.
export const NODE_TWO_PART: EqNode = {
  id: "earnings78_2p",
  label: "earnings '78",
  family: "semicontinuous",
  gate: {
    intercept: { value: 2.01, state: "fitted" },
    terms: [
      F("treat", "in program", 1.754, "authored"),
      F("age", "age", -0.021),
      F("education", "education", 0.088),
      F("re75", "earnings '75", 0.00004)
    ]
  },
  eta: {
    intercept: { value: 9.52, state: "fitted" },
    terms: [
      F("treat", "in program", 0.031, "authored"),
      F("age", "age", -0.004),
      F("education", "education", 0.024),
      F("married", "married", 0.302),
      F("re74", "earnings '74", 0.0000, "not-learned")
    ]
  },
  noise: { sd: 0.604, state: "fitted" }
};

export const EQ_NODES: EqNode[] = [NODE_CONTINUOUS, NODE_BINARY, NODE_TWO_PART];

// The generative shape + a plain-language gloss. The gloss is the point: "not everyone using this will be
// a stats expert", so every symbol the equation introduces gets said in words exactly once.
export const FAMILY_SHAPE: Record<Family, { shape: string; gloss: string }> = {
  continuous: {
    shape: "= η + ε",
    gloss: "A score η built from the parents, plus random noise ε. That's it — the value IS the score plus noise."
  },
  binary: {
    shape: "P( · = 1 ) = σ(η)",
    gloss: "σ (the logistic curve) squashes the score η into a probability between 0 and 1 — then we flip a coin at that probability. So a coefficient here moves the odds, not the outcome directly."
  },
  semicontinuous: {
    shape: "= works? × amount",
    gloss: "Two questions, two models. First: did they earn anything at all? Then, only if they did: how much? That's why there's a spike at $0 — and why the amount's coefficients live inside an exp(), so they read as percentages, not dollars."
  }
};
