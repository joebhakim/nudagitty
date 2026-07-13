import type { TreatmentStrategy } from "../../types";
import type { CovariateBasis, LongitudinalCohort } from "../types";
import { asBinary, assignedTreatmentValue } from "../internal";
import { sigmoid } from "../../stats/links";
import { dot, gaussianSolve, solveNormalEquations } from "../../stats/linalg";
import { buildCovariatePlan, designRow } from "../../stats/standardize";

export function strategyAssignmentMap(row: Record<string, number>, strategy: TreatmentStrategy, treatments: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const treatment of treatments) map.set(treatment, asBinary(assignedTreatmentValue(row, strategy, treatment)));
  return map;
}

// Fit E[Y | treatments, covariates] parametrically (OLS for continuous, IRLS
// logistic for binary). Returns a predictor (row, treatment-assignment) -> Ŷ.
export function fitOutcomeModel(cohort: LongitudinalCohort, outcome: string, treatments: string[], covariates: string[], binary: boolean, basis: CovariateBasis = "linear"): ((row: Record<string, number>, assignment: Map<string, number> | null) => number) | null {
  const plan = buildCovariatePlan(cohort, covariates, basis);
  const indices = cohort.rows.map((_, i) => i).filter((i) => { const y = cohort.rows[i]![outcome]; return y !== undefined && Number.isFinite(y); });
  const params = 1 + treatments.length + plan.reduce((sum, term) => sum + term.degree, 0);
  if (indices.length < params + 2) return null;
  const design = indices.map((i) => designRow(cohort.rows[i]!, treatments, plan, null));
  const response = indices.map((i) => cohort.rows[i]![outcome]!);
  const baseWeights = indices.map((i) => cohort.weights[i] ?? 1);
  let beta: number[] | null;
  if (!binary) {
    beta = solveNormalEquations(design, response, baseWeights, { ridge: 1e-6 });
  } else {
    beta = new Array<number>(params).fill(0);
    for (let iter = 0; iter < 20; iter += 1) {
      const working: number[] = [];
      const irlsWeights: number[] = [];
      for (let r = 0; r < design.length; r += 1) {
        const eta = dot(design[r]!, beta);
        const mu = sigmoid(eta);
        const variance = Math.max(1e-3, mu * (1 - mu));
        irlsWeights.push(variance * (baseWeights[r] ?? 1));
        working.push(eta + ((response[r] ?? 0) - mu) / variance);
      }
      const next = solveNormalEquations(design, working, irlsWeights, { ridge: 1e-6 });
      if (!next || !next.every((value) => Number.isFinite(value))) break;
      beta = next;
    }
  }
  if (!beta || !beta.every((value) => Number.isFinite(value))) return null;
  const coefficients = beta;
  return (row, assignment) => {
    const linear = dot(designRow(row, treatments, plan, assignment), coefficients);
    return binary ? sigmoid(linear) : linear;
  };
}

export function fitLinearModel(rows: Array<Record<string, number>>, outcome: string, features: string[]): number[] | null {
  const size = features.length + 1;
  const xtx = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
  const xty = Array.from({ length: size }, () => 0);
  for (const row of rows) {
    const y = row[outcome];
    if (y === undefined || !Number.isFinite(y)) continue;
    const x = [1, ...features.map((feature) => row[feature] ?? 0)];
    for (let i = 0; i < size; i += 1) {
      xty[i] = (xty[i] ?? 0) + (x[i] ?? 0) * y;
      for (let j = 0; j < size; j += 1) xtx[i]![j] = (xtx[i]![j] ?? 0) + (x[i] ?? 0) * (x[j] ?? 0);
    }
  }
  for (let i = 1; i < size; i += 1) xtx[i]![i] = (xtx[i]![i] ?? 0) + 1e-6;
  // The ridge is pre-added to the (non-intercept) diagonal above, so the solver
  // itself just needs the looser 1e-9 pivot tolerance the OLS path historically used.
  return gaussianSolve(xtx, xty, { pivotTolerance: 1e-9 });
}

// ============================ rung 3: family-aware outcome models ============================
//
// The rung-1 model (fitOutcomeModel above) is linear on the IDENTITY scale, so nothing stops it predicting a
// negative outcome. On lalonde-fit-recover-2part it imputes a counterfactual Y(0) of −$10,101 for the
// treated — negative earnings — and beta_T is exactly the arithmetic needed to drag them back up. These two
// models respect the outcome's SUPPORT instead, which is what actually fixes that.

/**
 * TWO-PART / CRAGG. P(Y>0) = σ(x'γ) — a logistic gate — times E[Y | Y>0] = exp(x'δ + h), a log-link amount
 * fit on the positive rows only, with h = σ²/2 the lognormal retransformation (Duan/Manning) correction.
 * Cannot emit a negative, and reproduces a zero spike instead of smearing through it.
 */
export function fitTwoPartOutcomeModel(cohort: LongitudinalCohort, outcome: string, treatments: string[], covariates: string[], binary: boolean, basis: CovariateBasis = "linear"): ((row: Record<string, number>, assignment: Map<string, number> | null) => number) | null {
  if (binary) return null;                                        // a two-part model of a 0/1 outcome is nonsense
  const plan = buildCovariatePlan(cohort, covariates, basis);
  const rows = cohort.rows.filter((r) => { const y = r[outcome]; return y !== undefined && Number.isFinite(y); });
  // A negative value would be silently relabelled "it never happened" by the gate. Refuse rather than lie.
  if (rows.some((r) => (r[outcome] ?? 0) < 0)) return null;
  const params = 1 + treatments.length + plan.reduce((s, t) => s + t.degree, 0);
  const positive = rows.filter((r) => (r[outcome] ?? 0) > 0);
  if (positive.length < params + 2) return null;

  // Extensive margin. If nothing is zero there is no gate to learn — degrade to "everybody participates"
  // rather than run a logistic on an all-ones response.
  const anyZero = positive.length < rows.length;
  let gate: number[] | null = null;
  if (anyZero) {
    const design = rows.map((r) => designRow(r, treatments, plan, null));
    const response = rows.map((r) => ((r[outcome] ?? 0) > 0 ? 1 : 0));
    const weights = rows.map((_, i) => cohort.weights[i] ?? 1);
    gate = irlsLogistic(design, response, weights, params);
    if (!gate) return null;
  }

  // Intensive margin: log-OLS on the positive rows.
  const posDesign = positive.map((r) => designRow(r, treatments, plan, null));
  const posResponse = positive.map((r) => Math.log(r[outcome]!));
  const posWeights = positive.map(() => 1);
  const amount = solveNormalEquations(posDesign, posResponse, posWeights, { ridge: 1e-6 });
  if (!amount || !amount.every(Number.isFinite)) return null;

  let ss = 0;
  for (let i = 0; i < posDesign.length; i += 1) { const e = posResponse[i]! - dot(posDesign[i]!, amount); ss += e * e; }
  const sigma2 = ss / Math.max(1, posDesign.length - params);
  const h = sigma2 / 2;                                           // E[exp(ε)] = exp(σ²/2), not 1

  return (row, assignment) => {
    const x = designRow(row, treatments, plan, assignment);
    const p = gate ? sigmoid(dot(x, gate)) : 1;
    return p * Math.exp(dot(x, amount) + h);
  };
}

/**
 * PPML (Poisson pseudo-maximum-likelihood, Santos Silva & Tenreyro 2006). Fits E[Y|x] = exp(x'β) directly on
 * the MEAN scale by quasi-likelihood — so it keeps the zeros (log-OLS silently drops them) and needs no
 * retransformation correction at all (no Jensen gap: you never took a log of Y). Y need not be an integer;
 * only the mean/variance relationship is assumed. Non-negative outcomes only.
 */
export function fitPpmlOutcomeModel(cohort: LongitudinalCohort, outcome: string, treatments: string[], covariates: string[], binary: boolean, basis: CovariateBasis = "linear"): ((row: Record<string, number>, assignment: Map<string, number> | null) => number) | null {
  if (binary) return null;
  const plan = buildCovariatePlan(cohort, covariates, basis);
  const rows = cohort.rows.filter((r) => { const y = r[outcome]; return y !== undefined && Number.isFinite(y); });
  if (rows.some((r) => (r[outcome] ?? 0) < 0)) return null;       // exp(x'β) is strictly positive
  const params = 1 + treatments.length + plan.reduce((s, t) => s + t.degree, 0);
  if (rows.length < params + 2) return null;

  const design = rows.map((r) => designRow(r, treatments, plan, null));
  const response = rows.map((r) => r[outcome]!);
  const baseWeights = rows.map((_, i) => cohort.weights[i] ?? 1);
  const scale = Math.max(1e-9, response.reduce((a, b) => a + b, 0) / response.length);

  // IRLS for the Poisson log link: w = μ, working response = η + (y − μ)/μ.
  let beta: number[] | null = new Array<number>(params).fill(0);
  beta[0] = Math.log(scale);                                      // start at the marginal mean, not at 1
  for (let iter = 0; iter < 40; iter += 1) {
    const working: number[] = [];
    const weights: number[] = [];
    for (let r = 0; r < design.length; r += 1) {
      const eta = Math.max(-30, Math.min(30, dot(design[r]!, beta!)));
      const mu = Math.max(1e-6 * scale, Math.exp(eta));
      weights.push(mu * (baseWeights[r] ?? 1));
      working.push(eta + ((response[r] ?? 0) - mu) / mu);
    }
    const next = solveNormalEquations(design, working, weights, { ridge: 1e-6 });
    if (!next || !next.every(Number.isFinite)) break;
    let delta = 0;
    for (let i = 0; i < params; i += 1) delta += Math.abs(next[i]! - beta![i]!);
    beta = next;
    if (delta < 1e-9) break;
  }
  if (!beta || !beta.every(Number.isFinite)) return null;
  const coefficients = beta;
  return (row, assignment) => Math.exp(Math.max(-30, Math.min(30, dot(designRow(row, treatments, plan, assignment), coefficients))));
}

// Shared IRLS logistic (the gate). Kept local: fitOutcomeModel's copy is entangled with its own design/plan.
function irlsLogistic(design: number[][], response: number[], weights: number[], params: number): number[] | null {
  let beta: number[] | null = new Array<number>(params).fill(0);
  for (let iter = 0; iter < 30; iter += 1) {
    const working: number[] = [];
    const w: number[] = [];
    for (let r = 0; r < design.length; r += 1) {
      const eta = dot(design[r]!, beta!);
      const mu = sigmoid(eta);
      const variance = Math.max(1e-3, mu * (1 - mu));
      w.push(variance * (weights[r] ?? 1));
      working.push(eta + ((response[r] ?? 0) - mu) / variance);
    }
    const next = solveNormalEquations(design, working, w, { ridge: 1e-6 });
    if (!next || !next.every(Number.isFinite)) return null;
    let delta = 0;
    for (let i = 0; i < params; i += 1) delta += Math.abs(next[i]! - beta![i]!);
    beta = next;
    if (delta < 1e-9) break;
  }
  return beta && beta.every(Number.isFinite) ? beta : null;
}

/**
 * RUNG 2 — linear, but with treatment × covariate interactions: a separate surface per arm. Still linear in
 * L (so it still extrapolates, and can still emit a negative), but the treatment effect is now allowed to
 * VARY with L instead of being one constant beta_T. That is the honest first relaxation: rung 1 does not
 * merely mis-estimate the effect, it assumes there is only one.
 */
export function fitInteractionOutcomeModel(cohort: LongitudinalCohort, outcome: string, treatments: string[], covariates: string[], binary: boolean, basis: CovariateBasis = "linear"): ((row: Record<string, number>, assignment: Map<string, number> | null) => number) | null {
  const plan = buildCovariatePlan(cohort, covariates, basis);
  const k = treatments.length;
  // [1, T..., L...] then every T × L product.
  const expand = (row: Record<string, number>, assignment: Map<string, number> | null): number[] => {
    const base = designRow(row, treatments, plan, assignment);
    const cov = base.slice(1 + k);
    const out = [...base];
    for (let i = 0; i < k; i += 1) for (const c of cov) out.push(base[1 + i]! * c);
    return out;
  };
  const indices = cohort.rows.map((_, i) => i).filter((i) => { const y = cohort.rows[i]![outcome]; return y !== undefined && Number.isFinite(y); });
  if (indices.length === 0) return null;
  const design = indices.map((i) => expand(cohort.rows[i]!, null));
  const params = design[0]!.length;
  if (indices.length < params + 2) return null;   // interactions are expensive in df — refuse rather than overfit
  const response = indices.map((i) => cohort.rows[i]![outcome]!);
  const weights = indices.map((i) => cohort.weights[i] ?? 1);

  const beta = binary
    ? irlsLogistic(design, response, weights, params)
    : solveNormalEquations(design, response, weights, { ridge: 1e-6 });
  if (!beta || !beta.every(Number.isFinite)) return null;
  return (row, assignment) => {
    const linear = dot(expand(row, assignment), beta);
    return binary ? sigmoid(linear) : linear;
  };
}

/**
 * RUNG 3 — GAMMA GLM with a log link. E[Y|x] = exp(x'b), Var ∝ μ². Same log link as PPML; the two differ
 * ONLY in the IRLS weight (gamma: 1, Poisson: μ), i.e. in what they assume about the variance. Gamma is the
 * positive-skew workhorse — but the gamma density is undefined at zero, so it REFUSES an outcome with a zero
 * spike rather than quietly dropping those rows. On LaLonde earnings (12% exact zeros) it therefore declines
 * to fit at all, which is the correct and informative answer: this family cannot describe this outcome.
 */
export function fitGammaLogOutcomeModel(cohort: LongitudinalCohort, outcome: string, treatments: string[], covariates: string[], binary: boolean, basis: CovariateBasis = "linear"): ((row: Record<string, number>, assignment: Map<string, number> | null) => number) | null {
  if (binary) return null;
  const plan = buildCovariatePlan(cohort, covariates, basis);
  const rows = cohort.rows.filter((r) => { const y = r[outcome]; return y !== undefined && Number.isFinite(y); });
  if (rows.some((r) => (r[outcome] ?? 0) <= 0)) return null;      // gamma has no mass at (or below) zero
  const params = 1 + treatments.length + plan.reduce((s, t) => s + t.degree, 0);
  if (rows.length < params + 2) return null;

  const design = rows.map((r) => designRow(r, treatments, plan, null));
  const response = rows.map((r) => r[outcome]!);
  const baseWeights = rows.map((_, i) => cohort.weights[i] ?? 1);
  const scale = Math.max(1e-9, response.reduce((a, b) => a + b, 0) / response.length);

  let beta: number[] | null = new Array<number>(params).fill(0);
  beta[0] = Math.log(scale);
  for (let iter = 0; iter < 40; iter += 1) {
    const working: number[] = [];
    const weights: number[] = [];
    for (let r = 0; r < design.length; r += 1) {
      const eta = Math.max(-30, Math.min(30, dot(design[r]!, beta!)));
      const mu = Math.max(1e-6 * scale, Math.exp(eta));
      weights.push(baseWeights[r] ?? 1);                          // gamma/log: the IRLS weight is 1
      working.push(eta + ((response[r] ?? 0) - mu) / mu);
    }
    const next = solveNormalEquations(design, working, weights, { ridge: 1e-6 });
    if (!next || !next.every(Number.isFinite)) break;
    let delta = 0;
    for (let i = 0; i < params; i += 1) delta += Math.abs(next[i]! - beta![i]!);
    beta = next;
    if (delta < 1e-9) break;
  }
  if (!beta || !beta.every(Number.isFinite)) return null;
  const coefficients = beta;
  return (row, assignment) => Math.exp(Math.max(-30, Math.min(30, dot(designRow(row, treatments, plan, assignment), coefficients))));
}

/**
 * TWO-PART with an IDENTITY amount margin. P(Y>0) = σ(x'γ) — a logistic gate — times E[Y | Y>0] = x'β,
 * fit by OLS on the positive rows in LEVELS. No log, no exponential, no retransformation.
 *
 * This is the rung the ladder was missing. `two_part` (fitTwoPartOutcomeModel) has the right FAMILY but a
 * LOG amount link: it fits log(Y) on the positive rows and then exponentiates, so on a DGP whose amount
 * margin is linear it is misspecified — right family, wrong link — and it missed the imposed +$1,794 by
 * $3,500. It is also the model the LaLonde literature actually fits: every paper puts re78 in LEVELS.
 *
 * The mean is floored at zero rather than softplus'd: an estimator should not have to know the generator's
 * softplus scale, and a linear amount model that predicts a negative wage is telling you something true
 * about itself. (E[Y|x] = P(Y>0|x)·0 = 0 there, which is at least a value the outcome can actually take.)
 */
export function fitTwoPartIdentityOutcomeModel(cohort: LongitudinalCohort, outcome: string, treatments: string[], covariates: string[], binary: boolean, basis: CovariateBasis = "linear"): ((row: Record<string, number>, assignment: Map<string, number> | null) => number) | null {
  if (binary) return null;
  const plan = buildCovariatePlan(cohort, covariates, basis);
  const rows = cohort.rows.filter((r) => { const y = r[outcome]; return y !== undefined && Number.isFinite(y); });
  // A negative value would be silently relabelled "it never happened" by the gate. Refuse rather than lie.
  if (rows.some((r) => (r[outcome] ?? 0) < 0)) return null;
  const params = 1 + treatments.length + plan.reduce((s, t) => s + t.degree, 0);
  const positive = rows.filter((r) => (r[outcome] ?? 0) > 0);
  if (positive.length < params + 2) return null;

  // Extensive margin — over ALL rows (participation is observed for everyone).
  const anyZero = positive.length < rows.length;
  let gate: number[] | null = null;
  if (anyZero) {
    const design = rows.map((r) => designRow(r, treatments, plan, null));
    const response = rows.map((r) => ((r[outcome] ?? 0) > 0 ? 1 : 0));
    const weights = rows.map((_, i) => cohort.weights[i] ?? 1);
    gate = irlsLogistic(design, response, weights, params);
    if (!gate) return null;
  }

  // Intensive margin — OLS on the AMOUNTS themselves, over the positive rows. Levels, not logs.
  const posDesign = positive.map((r) => designRow(r, treatments, plan, null));
  const posResponse = positive.map((r) => r[outcome]!);
  const amount = solveNormalEquations(posDesign, posResponse, positive.map(() => 1), { ridge: 1e-6 });
  if (!amount || !amount.every(Number.isFinite)) return null;

  return (row, assignment) => {
    const x = designRow(row, treatments, plan, assignment);
    const p = gate ? sigmoid(dot(x, gate)) : 1;
    return p * Math.max(0, dot(x, amount));
  };
}

/**
 * TWO-PART, AMOUNT IN LEVELS, WITH TREATMENT INTERACTIONS — the two axes of the ladder, together.
 *
 * `two_part_identity` gets the FAMILY right (a gate × an amount in levels) but still assumes ONE effect for
 * everybody. On a DGP where the effect depends on who you are, that is not a small error: it recovers the
 * homogeneous benchmark to $20, and misses the same benchmark with a modifier attached by ~$1,000.
 *
 * So this rung crosses the two axes — the outcome's FAMILY and the effect's SHAPE — by expanding both margins
 * with T × L. It is the smallest class that contains a heterogeneous two-part effect.
 *
 * It buys nothing for free, in two ways.
 *
 * The interaction is LINEAR IN THE MODIFIER: it can say "dropouts gain more than graduates" and cannot say
 * "the payoff falls off a cliff at thirty". That is the ceiling of every rung we ship, and lifting it is
 * exactly what the planned GAM / forest rungs are for.
 *
 * And a hypothesis class you cannot ESTIMATE is worth nothing either. On lalonde-heterogeneous this rung is
 * the correctly specified model and it still fails, because 6.9% of rows are treated and their pre-program
 * earnings differ NINE-FOLD from the controls': T × L then has to be fitted on 185 off-support rows and
 * extrapolated onto 2,490 that resemble none of them. It swings +4,352 / +1,427 / +936 as n grows and never
 * settles, while the additive rung sits placidly at a WRONG +2,650 forever. Right class, no identification.
 *
 * Given clean overlap it does exactly what it says (see outcomeLearnerCorrectness.test.ts: CATEs 5.82 / 13.88
 * against an oracle 6.08 / 13.43, where the additive rung collapses both to 9). The learner is not the
 * problem. LaLonde is the problem, which is why LaLonde is famous.
 */
export function fitTwoPartIdentityInteractionOutcomeModel(cohort: LongitudinalCohort, outcome: string, treatments: string[], covariates: string[], binary: boolean, basis: CovariateBasis = "linear"): ((row: Record<string, number>, assignment: Map<string, number> | null) => number) | null {
  if (binary) return null;
  const plan = buildCovariatePlan(cohort, covariates, basis);
  const k = treatments.length;
  // [1, T..., L...] then every T × L product — on BOTH margins: treatment may move who works AND what they earn.
  const expand = (row: Record<string, number>, assignment: Map<string, number> | null): number[] => {
    const base = designRow(row, treatments, plan, assignment);
    const cov = base.slice(1 + k);
    const out = [...base];
    for (let i = 0; i < k; i += 1) for (const c of cov) out.push(base[1 + i]! * c);
    return out;
  };
  const rows = cohort.rows.filter((r) => { const y = r[outcome]; return y !== undefined && Number.isFinite(y); });
  if (rows.length === 0) return null;
  if (rows.some((r) => (r[outcome] ?? 0) < 0)) return null;   // same refusal as the additive two-part rung
  const params = expand(rows[0]!, null).length;
  const positive = rows.filter((r) => (r[outcome] ?? 0) > 0);
  if (positive.length < params + 2) return null;              // interactions are expensive in df — refuse, don't overfit

  const anyZero = positive.length < rows.length;
  let gate: number[] | null = null;
  if (anyZero) {
    const design = rows.map((r) => expand(r, null));
    const response = rows.map((r) => ((r[outcome] ?? 0) > 0 ? 1 : 0));
    const weights = rows.map((_, i) => cohort.weights[i] ?? 1);
    gate = irlsLogistic(design, response, weights, params);
    if (!gate) return null;
  }
  const posDesign = positive.map((r) => expand(r, null));
  const posResponse = positive.map((r) => r[outcome]!);
  const amount = solveNormalEquations(posDesign, posResponse, positive.map(() => 1), { ridge: 1e-6 });
  if (!amount || !amount.every(Number.isFinite)) return null;

  return (row, assignment) => {
    const x = expand(row, assignment);
    const p = gate ? sigmoid(dot(x, gate)) : 1;
    return p * Math.max(0, dot(x, amount));
  };
}
