import { directedParents, normalizeEdgeMechanism, normalizeNodeMechanism, normalizeVariableModel } from "../graph";
import type {
  GraphModel,
  NodeDistribution,
  NodeMechanism,
  SimulatedAnalyticDistribution,
  SimulationSelectionCondition,
  SimulationSpec,
  VariableModel
} from "../types";
import { LOGIT_LATENT_VARIANCE, VARIANCE_EPSILON } from "./constants";
import { formatSelectionCondition, selectionBounds, selectionConditionUsesRef } from "./conditioning";
import { coerceVariableValue } from "./interpreter";
import { bivariateRectangleMoments, clampProbability, inverseStandardNormalCdf, standardNormalCdf, standardNormalPdf } from "./math";

export interface LinearGaussianJoint {
  ids: string[];
  mean: number[];
  covariance: number[][];
  binaryLatents: Map<string, BinaryLatentInfo>;
  binaryOverridden: Map<string, number>;
}

export interface BinaryLatentInfo {
  approximate: boolean;
}

interface BinaryLatentNoise {
  meanShift: number;
  noiseVariance: number;
  approximate: boolean;
}

export interface LinearGaussianConditioning {
  nodeAnalytics: Map<string, SimulatedAnalyticDistribution>;
  note: string;
}

export function buildLinearGaussianJoint(graph: GraphModel, spec: SimulationSpec, order: string[]): LinearGaussianJoint | null {
  const ids = [...order];
  const indexById = new Map(ids.map((id, index) => [id, index]));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const mean = Array.from({ length: ids.length }, () => 0);
  const covariance = Array.from({ length: ids.length }, () => Array.from({ length: ids.length }, () => 0));
  const binaryLatents = new Map<string, BinaryLatentInfo>();
  const binaryOverridden = new Map<string, number>();

  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (!id) return null;
    const node = nodesById.get(id);
    const variable = normalizeVariableModel(node?.variable);
    const mechanism = normalizeNodeMechanism(spec.nodes[id]);
    // The copula marginal transform is non-linear/non-Gaussian — no analytic joint.
    if (mechanism.combiner === "copula_marginal") return null;
    const row = covariance[index];
    if (!row) return null;
    const parents = directedParents(graph, id);
    const isRoot = parents.length === 0;
    const continuous = isLinearGaussianValueType(variable);
    const binaryLatent = continuous ? null : binaryLatentNoise(variable, mechanism, isRoot);
    if (!continuous && !binaryLatent) return null;
    if (parents.some((parent) => binaryLatents.has(parent))) return null;

    if (Object.hasOwn(spec.overrides, id)) {
      const overrideValue = coerceVariableValue(spec.overrides[id] ?? 0, variable);
      mean[index] = overrideValue;
      row[index] = 0;
      if (variable.valueType === "binary") binaryOverridden.set(id, overrideValue);
      continue;
    }

    if (isRoot) {
      if (binaryLatent) {
        mean[index] = binaryLatent.meanShift;
        row[index] = binaryLatent.noiseVariance;
        binaryLatents.set(id, { approximate: binaryLatent.approximate });
        continue;
      }
      const moments = linearGaussianDistributionMoments(mechanism.distribution);
      if (!moments) return null;
      mean[index] = moments.mean;
      row[index] = moments.variance;
      continue;
    }

    if (mechanism.interactions.length > 0) return null;
    if (!binaryLatent && mechanism.combiner !== "additive") return null;
    const noiseMoments = linearGaussianDistributionMoments(mechanism.noise);
    if (!noiseMoments) return null;

    const parentTerms: Array<{ index: number; coefficient: number }> = [];
    for (const parent of parents) {
      const parentIndex = indexById.get(parent);
      if (parentIndex === undefined || parentIndex >= index) return null;
      const edge = graph.edges.find((candidate) => candidate.kind === "directed" && candidate.source === parent && candidate.target === id);
      if (!edge) return null;
      const edgeMechanism = normalizeEdgeMechanism(spec.edges[edge.id]);
      if (!edgeMechanism.enabled) continue;
      if (edgeMechanism.kind !== "linear") return null;
      parentTerms.push({ index: parentIndex, coefficient: edgeMechanism.coefficient });
    }

    mean[index] = mechanism.intercept + noiseMoments.mean + parentTerms.reduce((sum, term) => sum + term.coefficient * (mean[term.index] ?? 0), 0);
    for (let previous = 0; previous < index; previous += 1) {
      const previousRow = covariance[previous];
      if (!previousRow) return null;
      const cov = parentTerms.reduce((sum, term) => sum + term.coefficient * (covariance[term.index]?.[previous] ?? 0), 0);
      row[previous] = cov;
      previousRow[index] = cov;
    }
    const structuralVariance = parentTerms.reduce((outerSum, left) => {
      return outerSum + parentTerms.reduce((innerSum, right) => {
        return innerSum + left.coefficient * right.coefficient * (covariance[left.index]?.[right.index] ?? 0);
      }, 0);
    }, 0);
    const latentNoise = binaryLatent?.noiseVariance ?? 0;
    row[index] = Math.max(0, structuralVariance + noiseMoments.variance + latentNoise);
    if (binaryLatent) binaryLatents.set(id, { approximate: binaryLatent.approximate });
  }

  return { ids, mean, covariance, binaryLatents, binaryOverridden };
}

function binaryLatentNoise(variable: VariableModel, mechanism: NodeMechanism, isRoot: boolean): BinaryLatentNoise | null {
  if (variable.valueType !== "binary") return null;
  if (mechanism.interactions.length > 0) return null;
  if (isRoot) {
    if (mechanism.distribution.kind === "bernoulli") {
      const p = clampProbability(mechanism.distribution.p);
      return { meanShift: inverseStandardNormalCdf(p), noiseVariance: 1, approximate: false };
    }
    return null;
  }
  if (mechanism.combiner === "bernoulli_logit" || mechanism.combiner === "bounded_logistic") {
    return { meanShift: 0, noiseVariance: LOGIT_LATENT_VARIANCE, approximate: true };
  }
  return null;
}

export function conditionLinearGaussianJoint(joint: LinearGaussianJoint, conditions: Array<[string, SimulationSelectionCondition]>): LinearGaussianConditioning | null {
  if (conditions.length === 0) return null;
  // Variable-bound conditions resolve only at draw time and have no closed-form analytic conditioning.
  if (conditions.some(([, condition]) => selectionConditionUsesRef(condition))) return null;
  if (conditions.some(([, condition]) => condition.operator === "one_of")) return null;
  if (conditions.length === 2) {
    const c1 = conditions[0];
    const c2 = conditions[1];
    if (!c1 || !c2 || c1[0] === c2[0]) return null;
    return conditionLinearGaussianJointPair(joint, c1, c2);
  }
  if (conditions.length !== 1) return null;
  const [conditionId, condition] = conditions[0] ?? [];
  if (!conditionId || !condition) return null;
  const conditionIndex = joint.ids.indexOf(conditionId);
  if (conditionIndex < 0) return null;
  const conditionIsBinary = joint.binaryLatents.has(conditionId);
  const binaryDirection = conditionIsBinary ? translateBinaryCondition(condition) : null;
  if (conditionIsBinary && (binaryDirection === "trivial" || binaryDirection === "impossible")) return null;
  const effectiveCondition: SimulationSelectionCondition = conditionIsBinary
    ? { operator: binaryDirection === "high" ? "at_least" : "at_most", value: 0, upper: null, valueRef: null, upperRef: null, sampling: condition.sampling }
    : condition;
  const conditionMean = joint.mean[conditionIndex] ?? 0;
  const conditionVariance = joint.covariance[conditionIndex]?.[conditionIndex] ?? 0;
  if (conditionVariance <= VARIANCE_EPSILON) return null;
  const conditionSd = Math.sqrt(conditionVariance);
  const truncated = conditionalSelectionMoments(conditionMean, conditionSd, effectiveCondition);
  if (!truncated) return null;
  const anyApproximate = Array.from(joint.binaryLatents.values()).some((info) => info.approximate);
  const noteSuffix = formatSelectionCondition(conditionId, condition);
  const noteKind = anyApproximate
    ? "logit-as-probit moment match"
    : conditionIsBinary
      ? "multivariate probit"
      : (truncated.exact ? "analytic linear Gaussian" : "analytic linear Gaussian moment match");
  const note = `${noteKind} conditioned on ${noteSuffix}`;

  const nodeAnalytics = new Map<string, SimulatedAnalyticDistribution>();
  for (let index = 0; index < joint.ids.length; index += 1) {
    const id = joint.ids[index];
    if (!id) continue;
    const unconditionalMean = joint.mean[index] ?? 0;
    const unconditionalVariance = joint.covariance[index]?.[index] ?? 0;
    const covarianceWithCondition = joint.covariance[index]?.[conditionIndex] ?? 0;
    const slope = covarianceWithCondition / conditionVariance;
    const residualVariance = Math.max(0, unconditionalVariance - (covarianceWithCondition * covarianceWithCondition / conditionVariance));
    const mean = unconditionalMean + slope * (truncated.mean - conditionMean);
    const variance = Math.max(0, residualVariance + slope * slope * truncated.variance);
    const isLatent = joint.binaryLatents.has(id);
    const overrideValue = joint.binaryOverridden.get(id);
    const isBinary = isLatent || overrideValue !== undefined;
    if (isBinary) {
      const probability = overrideValue !== undefined
        ? overrideValue
        : index === conditionIndex
          ? (binaryDirection === "high" ? 1 : 0)
          : binaryProbabilityFromLatent(mean, variance);
      nodeAnalytics.set(id, {
        distribution: { kind: "bernoulli", p: probability },
        mean: probability,
        variance: probability * (1 - probability),
        note,
        density: { kind: "bernoulli", p: probability }
      });
      continue;
    }
    const distribution: NodeDistribution = variance <= VARIANCE_EPSILON ? { kind: "constant", value: mean } : { kind: "normal", mean, sd: Math.sqrt(variance) };
    const density = index === conditionIndex && !conditionIsBinary ? truncatedNormalDensitySpec(conditionMean, conditionSd, condition, truncated.exact) : undefined;
    nodeAnalytics.set(id, {
      distribution,
      mean,
      variance,
      note,
      ...(density ? { density } : {})
    });
  }

  return {
    nodeAnalytics,
    note
  };
}

interface PairConditionBounds {
  idx: number;
  mu: number;
  sd: number;
  lower: number;
  upper: number;
  isBinary: boolean;
  binaryDirection: "high" | "low" | null;
}

function conditionToWBounds(joint: LinearGaussianJoint, conditionId: string, cond: SimulationSelectionCondition): PairConditionBounds | null {
  if (cond.operator === "one_of") return null;
  const idx = joint.ids.indexOf(conditionId);
  if (idx < 0) return null;
  const mu = joint.mean[idx] ?? 0;
  const variance = joint.covariance[idx]?.[idx] ?? 0;
  if (variance <= VARIANCE_EPSILON) return null;
  const sd = Math.sqrt(variance);
  const isBinary = joint.binaryLatents.has(conditionId);
  if (isBinary) {
    const dir = translateBinaryCondition(cond);
    if (dir !== "high" && dir !== "low") return null;
    return dir === "high"
      ? { idx, mu, sd, lower: -mu / sd, upper: Number.POSITIVE_INFINITY, isBinary: true, binaryDirection: "high" }
      : { idx, mu, sd, lower: Number.NEGATIVE_INFINITY, upper: -mu / sd, isBinary: true, binaryDirection: "low" };
  }
  if (cond.operator === "at_least") {
    return { idx, mu, sd, lower: (cond.value - mu) / sd, upper: Number.POSITIVE_INFINITY, isBinary: false, binaryDirection: null };
  }
  if (cond.operator === "at_most") {
    return { idx, mu, sd, lower: Number.NEGATIVE_INFINITY, upper: (cond.value - mu) / sd, isBinary: false, binaryDirection: null };
  }
  const upper = cond.upper ?? cond.value;
  if (Math.abs(upper - cond.value) <= 1e-9) return null;
  return {
    idx,
    mu,
    sd,
    lower: (cond.value - mu) / sd,
    upper: (upper - mu) / sd,
    isBinary: false,
    binaryDirection: null
  };
}

function conditionLinearGaussianJointPair(
  joint: LinearGaussianJoint,
  c1: [string, SimulationSelectionCondition],
  c2: [string, SimulationSelectionCondition]
): LinearGaussianConditioning | null {
  const [id1, cond1] = c1;
  const [id2, cond2] = c2;
  if (id1 === id2) return null;
  const b1 = conditionToWBounds(joint, id1, cond1);
  const b2 = conditionToWBounds(joint, id2, cond2);
  if (!b1 || !b2) return null;

  const cov12 = joint.covariance[b1.idx]?.[b2.idx] ?? 0;
  const rho = cov12 / (b1.sd * b2.sd);
  const moments = bivariateRectangleMoments(b1.lower, b1.upper, b2.lower, b2.upper, rho);
  if (!moments) return null;

  const ez1 = b1.mu + b1.sd * moments.mean1;
  const ez2 = b2.mu + b2.sd * moments.mean2;
  const vz1 = b1.sd * b1.sd * moments.var1;
  const vz2 = b2.sd * b2.sd * moments.var2;
  const cz12 = b1.sd * b2.sd * moments.cov;

  const var1 = b1.sd * b1.sd;
  const var2 = b2.sd * b2.sd;
  const det = var1 * var2 - cov12 * cov12;
  if (Math.abs(det) <= VARIANCE_EPSILON) return null;
  const inv00 = var2 / det;
  const inv11 = var1 / det;
  const inv01 = -cov12 / det;

  const anyApproximate = Array.from(joint.binaryLatents.values()).some((info) => info.approximate);
  const bothBinary = b1.isBinary && b2.isBinary;
  const anyBinary = b1.isBinary || b2.isBinary;
  const noteSuffix = `${formatSelectionCondition(id1, cond1)}, ${formatSelectionCondition(id2, cond2)}`;
  const noteKind = bothBinary
    ? (anyApproximate ? "logit-as-probit moment match orthant" : "multivariate probit orthant")
    : anyBinary
      ? (anyApproximate ? "logit-as-probit moment match joint" : "multivariate probit joint")
      : "analytic linear Gaussian joint moment match";
  const note = `${noteKind} conditioned on ${noteSuffix}`;

  const nodeAnalytics = new Map<string, SimulatedAnalyticDistribution>();
  for (let index = 0; index < joint.ids.length; index += 1) {
    const id = joint.ids[index];
    if (!id) continue;
    const isLatent = joint.binaryLatents.has(id);
    const overrideValue = joint.binaryOverridden.get(id);
    const isBinaryNode = isLatent || overrideValue !== undefined;

    let conditionalMean: number;
    let conditionalVariance: number;
    if (index === b1.idx) {
      conditionalMean = ez1;
      conditionalVariance = vz1;
    } else if (index === b2.idx) {
      conditionalMean = ez2;
      conditionalVariance = vz2;
    } else {
      const sigmaY1 = joint.covariance[index]?.[b1.idx] ?? 0;
      const sigmaY2 = joint.covariance[index]?.[b2.idx] ?? 0;
      const s1 = sigmaY1 * inv00 + sigmaY2 * inv01;
      const s2 = sigmaY1 * inv01 + sigmaY2 * inv11;
      const muY = joint.mean[index] ?? 0;
      const varY = joint.covariance[index]?.[index] ?? 0;
      const residualVar = Math.max(0, varY - s1 * sigmaY1 - s2 * sigmaY2);
      conditionalMean = muY + s1 * (ez1 - b1.mu) + s2 * (ez2 - b2.mu);
      conditionalVariance = Math.max(0, residualVar + s1 * s1 * vz1 + s2 * s2 * vz2 + 2 * s1 * s2 * cz12);
    }

    if (isBinaryNode) {
      let probability: number;
      if (overrideValue !== undefined) {
        probability = overrideValue;
      } else if (index === b1.idx && b1.isBinary) {
        probability = b1.binaryDirection === "high" ? 1 : 0;
      } else if (index === b2.idx && b2.isBinary) {
        probability = b2.binaryDirection === "high" ? 1 : 0;
      } else {
        probability = binaryProbabilityFromLatent(conditionalMean, conditionalVariance);
      }
      nodeAnalytics.set(id, {
        distribution: { kind: "bernoulli", p: probability },
        mean: probability,
        variance: probability * (1 - probability),
        note,
        density: { kind: "bernoulli", p: probability }
      });
      continue;
    }
    const distribution: NodeDistribution = conditionalVariance <= VARIANCE_EPSILON
      ? { kind: "constant", value: conditionalMean }
      : { kind: "normal", mean: conditionalMean, sd: Math.sqrt(conditionalVariance) };
    let density: SimulatedAnalyticDistribution["density"] | undefined;
    if (index === b1.idx && !b1.isBinary) density = continuousDensityForCondition(b1.mu, b1.sd, cond1);
    else if (index === b2.idx && !b2.isBinary) density = continuousDensityForCondition(b2.mu, b2.sd, cond2);
    nodeAnalytics.set(id, {
      distribution,
      mean: conditionalMean,
      variance: conditionalVariance,
      note,
      ...(density ? { density } : {})
    });
  }

  return { nodeAnalytics, note };
}

function continuousDensityForCondition(mean: number, sd: number, cond: SimulationSelectionCondition): SimulatedAnalyticDistribution["density"] | undefined {
  if (sd <= VARIANCE_EPSILON) return undefined;
  if (cond.operator === "at_least") return { kind: "truncated_normal", mean, sd, lower: cond.value, upper: null };
  if (cond.operator === "at_most") return { kind: "truncated_normal", mean, sd, lower: null, upper: cond.value };
  if (cond.operator === "one_of") return undefined;
  const upper = cond.upper ?? cond.value;
  return { kind: "truncated_normal", mean, sd, lower: cond.value, upper };
}

function translateBinaryCondition(condition: SimulationSelectionCondition): "high" | "low" | "trivial" | "impossible" {
  const include0 = matchesBinaryValue(0, condition);
  const include1 = matchesBinaryValue(1, condition);
  if (include0 && include1) return "trivial";
  if (include1) return "high";
  if (include0) return "low";
  return "impossible";
}

function matchesBinaryValue(value: 0 | 1, condition: SimulationSelectionCondition): boolean {
  if (condition.operator === "one_of") return (condition.values ?? [condition.value]).some((candidate) => Math.abs(value - candidate) <= 1e-9);
  if (condition.operator === "at_least") return value >= condition.value;
  if (condition.operator === "at_most") return value <= condition.value;
  const upper = condition.upper ?? condition.value;
  return value >= condition.value && value <= upper;
}

function binaryProbabilityFromLatent(latentMean: number, latentVariance: number): number {
  const sd = Math.sqrt(Math.max(latentVariance, VARIANCE_EPSILON));
  return clampProbability(standardNormalCdf(latentMean / sd));
}

function truncatedNormalDensitySpec(
  mean: number,
  sd: number,
  condition: SimulationSelectionCondition,
  exact: boolean
): SimulatedAnalyticDistribution["density"] | undefined {
  if (exact || sd <= VARIANCE_EPSILON) return undefined;
  const [lower, upper] = selectionBounds(condition);
  return {
    kind: "truncated_normal",
    mean,
    sd,
    lower: Number.isFinite(lower) ? lower : null,
    upper: Number.isFinite(upper) ? upper : null
  };
}

function conditionalSelectionMoments(mean: number, sd: number, condition: SimulationSelectionCondition): { mean: number; variance: number; exact: boolean } | null {
  if (condition.operator === "one_of") return null;
  if (condition.operator === "at_least") {
    const alpha = (condition.value - mean) / sd;
    const denominator = 1 - standardNormalCdf(alpha);
    if (denominator <= VARIANCE_EPSILON) return null;
    const lambda = standardNormalPdf(alpha) / denominator;
    return {
      mean: mean + sd * lambda,
      variance: sd * sd * Math.max(0, 1 + alpha * lambda - lambda * lambda),
      exact: false
    };
  }

  if (condition.operator === "at_most") {
    const alpha = (condition.value - mean) / sd;
    const denominator = standardNormalCdf(alpha);
    if (denominator <= VARIANCE_EPSILON) return null;
    const lambda = standardNormalPdf(alpha) / denominator;
    return {
      mean: mean - sd * lambda,
      variance: sd * sd * Math.max(0, 1 - alpha * lambda - lambda * lambda),
      exact: false
    };
  }

  const upper = condition.upper ?? condition.value;
  if (Math.abs(upper - condition.value) <= 1e-9) {
    return { mean: condition.value, variance: 0, exact: true };
  }
  const lowerAlpha = (condition.value - mean) / sd;
  const upperAlpha = (upper - mean) / sd;
  const lowerPdf = standardNormalPdf(lowerAlpha);
  const upperPdf = standardNormalPdf(upperAlpha);
  const denominator = standardNormalCdf(upperAlpha) - standardNormalCdf(lowerAlpha);
  if (denominator <= VARIANCE_EPSILON) return null;
  const standardizedMean = (lowerPdf - upperPdf) / denominator;
  const standardizedVariance = 1 + ((lowerAlpha * lowerPdf) - (upperAlpha * upperPdf)) / denominator - standardizedMean * standardizedMean;
  return {
    mean: mean + sd * standardizedMean,
    variance: sd * sd * Math.max(0, standardizedVariance),
    exact: false
  };
}

function isLinearGaussianValueType(variable: VariableModel): boolean {
  return variable.valueType === "continuous" || variable.valueType === "distributional";
}

function linearGaussianDistributionMoments(distribution: NodeDistribution): { mean: number; variance: number } | null {
  if (distribution.kind === "constant") return { mean: distribution.value, variance: 0 };
  if (distribution.kind === "normal") return { mean: distribution.mean, variance: distribution.sd * distribution.sd };
  return null;
}
