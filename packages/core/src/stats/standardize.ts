// Canonical covariate standardization + design-matrix row construction for the
// parametric outcome models. A continuous covariate is z-scored (mean / SD with an
// n-1 divisor) and expanded to `degree` polynomial terms; binary/discrete columns
// stay as a single linear term.

import type { CovariateBasis, LongitudinalCohort } from "../longitudinal/types";
import { asBinary } from "../longitudinal/internal";

export interface CovariateTerm {
  id: string;
  continuous: boolean;
  mean: number;
  sd: number;
  degree: number;
}

export function buildCovariatePlan(cohort: LongitudinalCohort, covariates: string[], basis: CovariateBasis): CovariateTerm[] {
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

export function designRow(row: Record<string, number>, treatments: string[], plan: CovariateTerm[], assignment: Map<string, number> | null): number[] {
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
