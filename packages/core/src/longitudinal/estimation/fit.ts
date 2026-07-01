import type { TreatmentStrategy } from "../../types";
import type { CovariateBasis, LongitudinalCohort } from "../types";
import { asBinary, assignedTreatmentValue } from "../internal";
import { sigmoid } from "../../stats/links";
import { dot, gaussianSolve, solveNormalEquations } from "../../stats/linalg";

interface CovariateTerm { id: string; continuous: boolean; mean: number; sd: number; degree: number }

// A continuous covariate is standardized and expanded to `degree` polynomial terms
// (z, z², z³); binary/discrete covariates stay as a single linear term (a square of a
// 0/1 indicator is itself, so expanding it just adds collinear columns).
function buildCovariatePlan(cohort: LongitudinalCohort, covariates: string[], basis: CovariateBasis): CovariateTerm[] {
  const degree = basis === "cubic" ? 3 : basis === "quadratic" ? 2 : 1;
  return covariates.map((id) => {
    const values = cohort.rows.map((row) => row[id]).filter((value): value is number => value !== undefined && Number.isFinite(value));
    const distinct = new Set(values.map((value) => Math.round(value * 1e6))).size;
    const continuous = distinct > 2;
    const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
    const sd = Math.sqrt(Math.max(1e-9, variance));
    return { id, continuous, mean, sd, degree: continuous ? degree : 1 };
  });
}

function designRow(row: Record<string, number>, treatments: string[], plan: CovariateTerm[], assignment: Map<string, number> | null): number[] {
  const xs = [1];
  for (const treatment of treatments) xs.push(assignment ? assignment.get(treatment) ?? 0 : asBinary(row[treatment]));
  for (const term of plan) {
    const raw = row[term.id];
    const value = raw !== undefined && Number.isFinite(raw) ? raw : term.mean;
    if (term.continuous) {
      const z = (value - term.mean) / term.sd;
      let power = 1;
      for (let d = 1; d <= term.degree; d += 1) { power *= z; xs.push(power); }
    } else {
      xs.push(value);
    }
  }
  return xs;
}

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
