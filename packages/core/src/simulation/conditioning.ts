import { normalizeSelectionCondition } from "../graph";
import type {
  GraphModel,
  SimulationConditioningSummary,
  SimulationInferenceMode,
  SimulationSelectionCondition,
  SimulationSpec
} from "../types";
import type { LinearGaussianConditioning } from "./analytic";

export function activeSelectionConditions(spec: SimulationSpec, graph: GraphModel): Array<[string, SimulationSelectionCondition]> {
  return Object.entries(spec.selections ?? {})
    .filter(([id]) => graph.nodes.some((node) => node.id === id))
    .map(([id, condition]) => [id, normalizeSelectionCondition(condition)]);
}

export function matchesSelectionConditions(values: Record<string, number>, conditions: Array<[string, SimulationSelectionCondition]>): boolean {
  for (const [id, condition] of conditions) {
    const value = values[id];
    if (value === undefined || !Number.isFinite(value)) return false;
    if (condition.operator === "one_of") {
      const allowed = condition.values ?? [condition.value];
      if (!allowed.some((candidate) => Math.abs(value - candidate) <= 1e-9)) return false;
      continue;
    }
    const lowerBound = resolveSelectionBound(values, condition.valueRef, condition.value);
    if (lowerBound === null) return false;
    if (condition.operator === "at_least" && value < lowerBound) return false;
    if (condition.operator === "at_most" && value > lowerBound) return false;
    if (condition.operator === "between") {
      const upperBound = resolveSelectionBound(values, condition.upperRef, condition.upper ?? condition.value);
      if (upperBound === null) return false;
      const [lo, hi] = lowerBound <= upperBound ? [lowerBound, upperBound] : [upperBound, lowerBound];
      if (value < lo || value > hi) return false;
    }
  }
  return true;
}

function resolveSelectionBound(values: Record<string, number>, ref: string | null, literal: number): number | null {
  if (!ref) return literal;
  const referenced = values[ref];
  return referenced === undefined || !Number.isFinite(referenced) ? null : referenced;
}

export function selectionConditionUsesRef(condition: SimulationSelectionCondition): boolean {
  return Boolean(condition.valueRef || condition.upperRef);
}

export function formatSelectionCondition(id: string, condition: SimulationSelectionCondition): string {
  if (condition.operator === "one_of") {
    const values = condition.values ?? [condition.value];
    return `${id} in {${values.join(", ")}}`;
  }
  const lower = condition.valueRef ?? String(condition.value);
  if (condition.operator === "at_most") return `${id} <= ${lower}`;
  if (condition.operator === "between") {
    const upper = condition.upperRef ?? String(condition.upper ?? condition.value);
    return `${lower} <= ${id} <= ${upper}`;
  }
  return `${id} >= ${lower}`;
}

export function emptyConditioningSummary(): SimulationConditioningSummary {
  return {
    totalSamples: 0,
    acceptedSamples: 0,
    activeConditions: [],
    analytic: null,
    empiricalMethod: "forward",
    requestedInference: "auto",
    primaryMethod: "forward",
    effectiveSampleSize: null
  };
}

export function requestedInferenceMode(conditions: Array<[string, SimulationSelectionCondition]>): SimulationInferenceMode {
  if (conditions.length === 0) return "auto";
  const first = conditions[0]?.[1].sampling ?? "auto";
  return conditions.every(([, condition]) => condition.sampling === first) ? first : "auto";
}

export function shouldApplyAnalyticInference(mode: SimulationInferenceMode): boolean {
  return mode === "auto" || mode === "analytic";
}

export function primaryConditioningMethod(
  requested: SimulationInferenceMode,
  analytic: LinearGaussianConditioning | null,
  empirical: SimulationConditioningSummary["empiricalMethod"],
  active: boolean
): SimulationConditioningSummary["primaryMethod"] {
  if (!active) return "forward";
  if (shouldApplyAnalyticInference(requested) && analytic) return "analytic";
  return empirical;
}

export function shouldUseImportanceSampling(condition: SimulationSelectionCondition): boolean {
  if (condition.operator === "one_of") return false;
  // Importance sampling needs a fixed numeric bound to compute the proposal density.
  // Variable-bound conditions resolve only at draw time, so fall back to rejection.
  if (selectionConditionUsesRef(condition)) return false;
  return condition.sampling !== "rejection";
}

export function selectionBounds(condition: SimulationSelectionCondition): [number, number] {
  if (condition.operator === "one_of") {
    const values = condition.values ?? [condition.value];
    return [Math.min(...values), Math.max(...values)];
  }
  if (condition.operator === "at_least") return [condition.value, Number.POSITIVE_INFINITY];
  if (condition.operator === "at_most") return [Number.NEGATIVE_INFINITY, condition.value];
  return [condition.value, condition.upper ?? condition.value];
}

export function normalizedWeights(logWeights: number[]): number[] {
  if (logWeights.length === 0) return [];
  const maxLog = Math.max(...logWeights);
  if (!Number.isFinite(maxLog)) return logWeights.map(() => 0);
  return logWeights.map((logWeight) => Math.exp(logWeight - maxLog));
}

// The canonical ESS is exactly this defensive (null-on-degenerate) variant.
export { effectiveSampleSize as computeEffectiveSampleSize } from "../stats/moments";
