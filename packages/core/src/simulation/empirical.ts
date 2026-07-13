import { createSeededRandomSource, sampleDistribution } from "../distributions";
import { directedParents, normalizeEdgeMechanism, normalizeNodeMechanism, normalizeVariableModel } from "../graph";
import type {
  EdgeMechanism,
  GraphModel,
  NodeDistribution,
  NodeMechanism,
  SimulatedEmpiricalDistribution,
  SimulationConditioningSummary,
  SimulationSelectionCondition,
  SimulationSpec,
  VariableModel
} from "../types";
import type { LinearGaussianJoint } from "./analytic";
import { buildLinearGaussianJoint } from "./analytic";
import {
  activeSelectionConditions,
  computeEffectiveSampleSize,
  formatSelectionCondition,
  matchesSelectionConditions,
  normalizedWeights,
  requestedInferenceMode,
  selectionBounds,
  selectionConditionUsesRef,
  shouldUseImportanceSampling
} from "./conditioning";
import { compileModel, runCompiledForward } from "./compiled";
import { prepareCopulaBlock, drawCopulaBlockSample } from "../copulaVine";
import { VARIANCE_EPSILON } from "./constants";
import type { StructuralContribution } from "./interpreter";
import { coerceVariableValue, edgeContribution, finalizeNodeValue, gateProbability, interactionContribution, plasmodePassthroughMechanism, sampleRootValue } from "./interpreter";
import { clampProbability, empiricalSampleSize, inverseStandardNormalCdf, standardNormalCdf } from "./math";
import { choleskyDecomposition } from "../stats/linalg";

interface GuidedSample {
  value: number;
  logWeight: number;
  guided: boolean;
  possible: boolean;
}

export interface EmpiricalSimulation {
  byNode: Record<string, SimulatedEmpiricalDistribution>;
  conditioning: SimulationConditioningSummary;
}

// Coupled root-block draws are expensive (per-sample vine h-inverse) but dose-INDEPENDENT: the
// effect stack re-simulates the oracle do()-grid ~13× with the same seed, redrawing the identical
// confounder block each time. Cache the transformed samples by (seed, sampleCount, block spec,
// marginals). On a hit we still pull the SAME d×N uniforms from the shared rng so the forward pass
// stays byte-identical (results unchanged — the golden net's block examples guard this).
const blockDrawCache = new Map<string, Record<string, number[]>>();
function drawBlockSamplesCached(
  preparedBlocks: ReturnType<typeof prepareCopulaBlock>[],
  sampleCount: number,
  spec: SimulationSpec,
  rng: () => number
): Record<string, number[]> {
  const marginals = preparedBlocks.flatMap((pb) => pb.block.nodes.map((id) => normalizeNodeMechanism(spec.nodes[id]).distribution));
  const key = `${spec.seed || 1}:${sampleCount}:${JSON.stringify(preparedBlocks.map((pb) => pb.block))}:${JSON.stringify(marginals)}`;
  const hit = blockDrawCache.get(key);
  if (hit) {
    // Replay the exact uniform consumption (d per block per sample) to keep the shared stream in lockstep.
    const uniforms = sampleCount * preparedBlocks.reduce((acc, pb) => acc + pb.block.nodes.length, 0);
    for (let i = 0; i < uniforms; i += 1) rng();
    return hit;
  }
  const blockSamples: Record<string, number[]> = {};
  for (const pb of preparedBlocks) for (const id of pb.block.nodes) blockSamples[id] = new Array<number>(sampleCount).fill(0);
  for (let s = 0; s < sampleCount; s += 1) {
    for (const pb of preparedBlocks) { const draw = drawCopulaBlockSample(pb, rng); for (const id in draw) blockSamples[id]![s] = draw[id]!; }
  }
  if (blockDrawCache.size > 64) blockDrawCache.clear();
  blockDrawCache.set(key, blockSamples);
  return blockSamples;
}

export function simulateEmpiricalDistributions(
  graph: GraphModel,
  spec: SimulationSpec,
  order: string[]
): EmpiricalSimulation {
  const sampleCount = empiricalSampleSize(graph);
  const samples: Record<string, number[]> = Object.fromEntries(order.map((id) => [id, []]));
  const logWeights: number[] = [];
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const rng = createSeededRandomSource((spec.seed || 1) ^ 0x9E3779B9);
  const conditions = activeSelectionConditions(spec, graph);
  // Copula blocks couple root-covariate marginals via a moderated mixture vine. Only valid on roots;
  // when present, the analytic/compiled fast paths are skipped so the coupled draw runs in the loop.
  const blocks = (spec.copulaBlocks ?? []).filter((b) => b.nodes.length >= 2 && b.nodes.every((id) => directedParents(graph, id).length === 0));
  const preparedBlocks = blocks.map((b) => prepareCopulaBlock(b, (id) => normalizeNodeMechanism(spec.nodes[id]).distribution));
  const blockNodeIds = new Set(blocks.flatMap((b) => b.nodes));
  const linearGaussianImportance = blocks.length === 0 ? simulateLinearGaussianConditionedEmpirical(graph, spec, order, conditions, sampleCount, rng) : null;
  if (linearGaussianImportance) return linearGaussianImportance;
  // Fast path: unconditioned forward sampling (no rejection/importance) via the compiled loop.
  // Copula blocks ride the same fast path — draw the coupled root values up front and inject them
  // through the intervention hook (which skips those nodes' own draws), instead of the slow loop.
  if (conditions.length === 0) {
    const compiled = compileModel(graph, spec, order);
    if (compiled) {
      let intervention: Parameters<typeof runCompiledForward>[4];
      if (blocks.length > 0) {
        const blockSamples = drawBlockSamplesCached(preparedBlocks, sampleCount, spec, rng);
        // A do()-override on a coupled node MUST win over the copula draw and sever its coupling: the
        // copula is a latent common cause (a bidirected edge), so do(X) cuts that edge at X. Returning
        // null here lets runCompiledForward apply the override; the other coupled nodes keep their
        // (marginal) coupled draws, now independent of the forced constant — exactly ADMG do() semantics.
        intervention = (ctx) => (blockNodeIds.has(ctx.nodeId) && !Object.hasOwn(spec.overrides, ctx.nodeId) ? (blockSamples[ctx.nodeId]?.[ctx.sampleIndex] ?? 0) : null);
      }
      const { samples } = runCompiledForward(compiled, spec, rng, sampleCount, intervention);
      const logWeights = new Array<number>(sampleCount).fill(0);
      const weights = normalizedWeights(logWeights);
      return {
        byNode: Object.fromEntries(order.map((id) => [id, empiricalDistribution(samples[id] ?? [], weights)])),
        conditioning: {
          totalSamples: sampleCount,
          acceptedSamples: sampleCount,
          activeConditions: [],
          analytic: null,
          empiricalMethod: "forward",
          requestedInference: requestedInferenceMode([]),
          primaryMethod: "forward",
          effectiveSampleSize: weights.length > 0 ? computeEffectiveSampleSize(weights) : null
        }
      };
    }
  }
  const maxAttempts = conditions.length > 0 ? sampleCount * 20 : sampleCount;
  let attempts = 0;
  let accepted = 0;
  let guidedSampleCount = 0;
  while (attempts < maxAttempts && accepted < sampleCount) {
    attempts += 1;
    const values: Record<string, number> = {};
    // Draw the coupled block values for this attempt up front; block (root) nodes read them below.
    const blockDraw: Record<string, number> = {};
    for (const pb of preparedBlocks) Object.assign(blockDraw, drawCopulaBlockSample(pb, rng));
    let logWeight = 0;
    let possible = true;
    let guidedThisSample = false;
    for (const id of order) {
      if (!possible) break;
      const mechanism = normalizeNodeMechanism(spec.nodes[id]);
      const variable = normalizeVariableModel(nodesById.get(id)?.variable);
      const condition = conditions.find(([conditionId]) => conditionId === id)?.[1] ?? null;
      if (Object.hasOwn(spec.overrides, id)) {
        values[id] = coerceVariableValue(spec.overrides[id] ?? 0, variable);
      } else {
        const parents = directedParents(graph, id);
        if (parents.length === 0 && blockNodeIds.has(id)) {
          values[id] = coerceVariableValue(blockDraw[id] ?? 0, variable); // coupled draw from the vine
        } else if (parents.length === 0) {
          const guided = condition && shouldUseImportanceSampling(condition) ? guidedRootSample(mechanism.distribution, condition, variable, rng) : null;
          if (guided) {
            if (!guided.possible) possible = false;
            values[id] = guided.value;
            logWeight += guided.logWeight;
            guidedThisSample = guidedThisSample || guided.guided;
          } else {
            values[id] = sampleRootValue(mechanism.distribution, variable, rng, true);
          }
        } else {
          const nodeContributions: StructuralContribution[] = [];
          let value = mechanism.intercept;
          let lookupContribution: number | null = null;
          const parentMechanisms: Record<string, EdgeMechanism> = {};
          for (const parent of parents) {
            const edge = graph.edges.find((candidate) => candidate.kind === "directed" && candidate.source === parent && candidate.target === id);
            if (!edge) continue;
            const edgeMechanism = normalizeEdgeMechanism(spec.edges[edge.id]);
            if (!edgeMechanism.enabled) continue;
            parentMechanisms[parent] = edgeMechanism;   // the gate needs each parent's basis
            const contribution = edgeContribution(values[parent] ?? 0, edgeMechanism);
            const absorbing = edgeMechanism.kind === "absorbing";
            nodeContributions.push({ value: contribution, absorbing });
            if (edgeMechanism.kind === "table_lookup") lookupContribution = contribution;
            if (!absorbing) value += contribution;
          }
          // Plasmode: a node read from data (an ENABLED table_lookup, no interactions) IS the cell value —
          // ignore the other structural edges AND its own intercept/noise/combiner, so a stale fitted
          // marginal can never be added on top of the column. Matches core.ts / compiled.ts.
          const rawLookup = lookupContribution !== null && mechanism.interactions.length === 0;
          const mech = rawLookup ? plasmodePassthroughMechanism(mechanism) : mechanism;
          if (rawLookup) value = lookupContribution!;
          const interaction = interactionContribution(values, mech);
          const base = value + interaction;
          const guided = condition && shouldUseImportanceSampling(condition) ? guidedAdditiveNoiseSample(base, mech, variable, condition, rng) : null;
          if (guided) {
            if (!guided.possible) possible = false;
            values[id] = guided.value;
            logWeight += guided.logWeight;
            guidedThisSample = guidedThisSample || guided.guided;
            continue;
          }
          const noise = sampleDistribution(mech.noise, rng);
          value += interaction + noise;
          const gateProb = variable.valueType === "semicontinuous" ? gateProbability(mech, values, parentMechanisms) : 1;
          values[id] = finalizeNodeValue(value, mech, variable, nodeContributions, mech.intercept + interaction + noise, rng, true, gateProb, noise);
        }
      }
    }
    if (!possible) continue;
    if (!matchesSelectionConditions(values, conditions)) continue;
    accepted += 1;
    if (guidedThisSample) guidedSampleCount += 1;
    logWeights.push(logWeight);
    for (const id of order) samples[id]?.push(values[id] ?? 0);
  }
  const weights = normalizedWeights(logWeights);
  const method = conditions.length === 0 ? "forward" : guidedSampleCount > 0 ? "importance" : "rejection";
  const sampleEss = weights.length > 0 ? computeEffectiveSampleSize(weights) : null;
  return {
    byNode: Object.fromEntries(Object.entries(samples).map(([id, values]) => [id, empiricalDistribution(values, weights)])),
    conditioning: {
      totalSamples: attempts,
      acceptedSamples: accepted,
      activeConditions: conditions.map(([id, condition]) => formatSelectionCondition(id, condition)),
      analytic: null,
      empiricalMethod: method,
      requestedInference: requestedInferenceMode(conditions),
      primaryMethod: method,
      effectiveSampleSize: sampleEss
    }
  };
}

function simulateLinearGaussianConditionedEmpirical(
  graph: GraphModel,
  spec: SimulationSpec,
  order: string[],
  conditions: Array<[string, SimulationSelectionCondition]>,
  sampleCount: number,
  rng: () => number
): EmpiricalSimulation | null {
  if (conditions.length !== 1) return null;
  const [conditionId, condition] = conditions[0] ?? [];
  if (!conditionId || !condition || condition.sampling === "rejection") return null;
  if (condition.operator === "one_of") return null;
  // Variable-bound conditions cannot use linear-Gaussian importance sampling;
  // the bound is not a fixed scalar so the truncation density is undefined.
  if (selectionConditionUsesRef(condition)) return null;
  const joint = buildLinearGaussianJoint(graph, spec, order);
  if (!joint) return null;
  const conditionIndex = joint.ids.indexOf(conditionId);
  if (conditionIndex < 0) return null;
  const conditionMean = joint.mean[conditionIndex] ?? 0;
  const conditionVariance = joint.covariance[conditionIndex]?.[conditionIndex] ?? 0;
  if (conditionVariance <= VARIANCE_EPSILON) return null;
  const conditionSd = Math.sqrt(conditionVariance);
  const firstConditionSample = sampleNormalWithinBounds(conditionMean, conditionSd, ...selectionBounds(condition), rng);
  if (!firstConditionSample) return null;

  const slopes = joint.ids.map((_, index) => (joint.covariance[index]?.[conditionIndex] ?? 0) / conditionVariance);
  const residualCovariance = conditionalResidualCovariance(joint, conditionIndex, conditionVariance);
  const factor = choleskyDecomposition(residualCovariance);
  if (!factor) return null;

  const samples: Record<string, number[]> = Object.fromEntries(order.map((id) => [id, []]));
  const logWeights: number[] = [];
  const logWeight = Math.log(firstConditionSample.probability);
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const conditionSample = sampleIndex === 0
      ? firstConditionSample
      : sampleNormalWithinBounds(conditionMean, conditionSd, ...selectionBounds(condition), rng);
    if (!conditionSample) return null;
    const residual = sampleResidual(factor, rng);
    for (let index = 0; index < joint.ids.length; index += 1) {
      const id = joint.ids[index];
      if (!id) continue;
      const mean = (joint.mean[index] ?? 0) + (slopes[index] ?? 0) * (conditionSample.value - conditionMean);
      const value = index === conditionIndex ? conditionSample.value : mean + (residual[index] ?? 0);
      samples[id]?.push(value);
    }
    logWeights.push(logWeight);
  }
  const weights = normalizedWeights(logWeights);
  return {
    byNode: Object.fromEntries(Object.entries(samples).map(([id, values]) => [id, empiricalDistribution(values, weights)])),
    conditioning: {
      totalSamples: sampleCount,
      acceptedSamples: sampleCount,
      activeConditions: conditions.map(([id, item]) => formatSelectionCondition(id, item)),
      analytic: null,
      empiricalMethod: "importance",
      requestedInference: requestedInferenceMode(conditions),
      primaryMethod: "importance",
      effectiveSampleSize: computeEffectiveSampleSize(weights)
    }
  };
}

function conditionalResidualCovariance(joint: LinearGaussianJoint, conditionIndex: number, conditionVariance: number): number[][] {
  return joint.covariance.map((row, rowIndex) => row.map((covariance, columnIndex) => {
    if (rowIndex === conditionIndex || columnIndex === conditionIndex) return 0;
    const rowCovariance = joint.covariance[rowIndex]?.[conditionIndex] ?? 0;
    const columnCovariance = joint.covariance[columnIndex]?.[conditionIndex] ?? 0;
    return covariance - (rowCovariance * columnCovariance / conditionVariance);
  }));
}

function sampleResidual(factor: number[][], rng: () => number): number[] {
  const z = factor.map(() => inverseStandardNormalCdf(rng()));
  return factor.map((row) => row.reduce((sum, coefficient, index) => sum + coefficient * (z[index] ?? 0), 0));
}

function guidedRootSample(distribution: NodeDistribution, condition: SimulationSelectionCondition, variable: VariableModel, rng: () => number): GuidedSample | null {
  if (!isImportanceSamplingValueType(variable)) return null;
  return guidedDistributionSample(distribution, condition, 0, rng);
}

function guidedAdditiveNoiseSample(
  base: number,
  mechanism: NodeMechanism,
  variable: VariableModel,
  condition: SimulationSelectionCondition,
  rng: () => number
): GuidedSample | null {
  if (!isImportanceSamplingValueType(variable)) return null;
  if (mechanism.combiner !== "additive") return null;
  const guided = guidedDistributionSample(mechanism.noise, condition, base, rng);
  if (!guided) return null;
  return { ...guided, value: base + guided.value };
}

function guidedDistributionSample(distribution: NodeDistribution, condition: SimulationSelectionCondition, shift: number, rng: () => number): GuidedSample | null {
  const [lower, upper] = selectionBounds(condition);
  const shiftedLower = lower - shift;
  const shiftedUpper = upper - shift;
  if (distribution.kind === "normal") {
    const sampled = sampleNormalWithinBounds(distribution.mean, distribution.sd, shiftedLower, shiftedUpper, rng);
    if (!sampled) return { value: distribution.mean, logWeight: Number.NEGATIVE_INFINITY, guided: true, possible: false };
    return {
      value: sampled.value,
      logWeight: Math.log(sampled.probability),
      guided: true,
      possible: true
    };
  }
  if (distribution.kind === "constant") {
    const possible = distribution.value >= shiftedLower && distribution.value <= shiftedUpper;
    return {
      value: distribution.value,
      logWeight: 0,
      guided: false,
      possible
    };
  }
  return null;
}

function sampleNormalWithinBounds(mean: number, sd: number, lower: number, upper: number, rng: () => number): { value: number; probability: number } | null {
  const cleanSd = Math.max(sd, Number.EPSILON);
  const lowerZ = (lower - mean) / cleanSd;
  const upperZ = (upper - mean) / cleanSd;
  const lowerCdf = Number.isFinite(lowerZ) ? standardNormalCdf(lowerZ) : 0;
  const upperCdf = Number.isFinite(upperZ) ? standardNormalCdf(upperZ) : 1;
  const probability = Math.max(0, upperCdf - lowerCdf);
  if (probability <= VARIANCE_EPSILON) return null;
  const probabilityPoint = clampProbability(lowerCdf + rng() * probability);
  const rawValue = mean + cleanSd * inverseStandardNormalCdf(probabilityPoint);
  const value = Math.min(upper, Math.max(lower, rawValue));
  return { value, probability };
}

function isImportanceSamplingValueType(variable: VariableModel): boolean {
  return variable.valueType === "continuous" || variable.valueType === "distributional";
}

export function emptyEmpiricalDistribution(): SimulatedEmpiricalDistribution {
  return { samples: [], weights: [], mean: null, variance: null, min: null, max: null, effectiveSampleSize: null };
}

export function empiricalDistribution(samples: number[], weights: number[] = []): SimulatedEmpiricalDistribution {
  const finite = samples.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return emptyEmpiricalDistribution();
  const finiteWeights = finite.map((_, index) => weights[index] ?? 1);
  const weightSum = finiteWeights.reduce((sum, weight) => sum + weight, 0);
  const normalized = weightSum > 0 ? finiteWeights.map((weight) => weight / weightSum) : finite.map(() => 1 / finite.length);
  const mean = finite.reduce((sum, value, index) => sum + value * (normalized[index] ?? 0), 0);
  const variance = finite.reduce((sum, value, index) => sum + (normalized[index] ?? 0) * (value - mean) * (value - mean), 0);
  return {
    samples: finite,
    weights: finiteWeights,
    mean,
    variance,
    min: Math.min(...finite),
    max: Math.max(...finite),
    effectiveSampleSize: computeEffectiveSampleSize(finiteWeights)
  };
}
