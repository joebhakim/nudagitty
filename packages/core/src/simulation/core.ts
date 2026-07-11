import { topologicalOrder } from "../analysis";
import { createSeededRandomSource, sampleDistribution } from "../distributions";
import { directedParents, normalizeEdgeMechanism, normalizeNodeMechanism, normalizeVariableModel } from "../graph";
import { registerRuntimeDataset } from "../datasets";
import type {
  GraphModel,
  NodeDistribution,
  NodeMechanism,
  SimulatedAnalyticDistribution,
  SimulatedNodeState,
  SimulationConditioningSummary,
  SimulationResult,
  SimulationSpec,
  VariableModel
} from "../types";
import { buildLinearGaussianJoint, conditionLinearGaussianJoint } from "./analytic";
import { compileModel, runCompiledForward } from "./compiled";
import {
  activeSelectionConditions,
  computeEffectiveSampleSize,
  emptyConditioningSummary,
  primaryConditioningMethod,
  requestedInferenceMode,
  shouldApplyAnalyticInference
} from "./conditioning";
import { empiricalDistribution, emptyEmpiricalDistribution, simulateEmpiricalDistributions } from "./empirical";
import type { StructuralContribution } from "./interpreter";
import { coerceVariableValue, edgeContribution, finalizeNodeValue, gateProbability, interactionContribution, sampleRootValue } from "./interpreter";
import { empiricalSampleSize } from "./math";

export interface SimulationInterventionContext {
  nodeId: string;
  sampleIndex: number;
  values: Readonly<Record<string, number>>;
  variable: VariableModel;
}

export type SimulationIntervention = (context: SimulationInterventionContext) => number | null | undefined;

export function runSimulation(graph: GraphModel, spec: SimulationSpec, previous?: SimulationResult): SimulationResult {
  // Spec-carried datasets (imported CSVs) → the runtime registry, so `table_lookup` resolves them
  // here — including in a worker thread, which has its own module instance and empty global registry.
  if (spec.datasets) for (const [name, dataset] of Object.entries(spec.datasets)) registerRuntimeDataset(name, dataset);
  const diagnostics: string[] = [];
  if (graph.kind !== "dag" && graph.kind !== "digraph") diagnostics.push("Simulation is only enabled for DAG-like graphs.");
  if (graph.edges.some((edge) => edge.kind !== "directed")) diagnostics.push("Simulation ignores non-directed edges.");
  const activeGraph = {
    ...graph,
    edges: graph.edges.filter((edge) => edge.kind === "directed" && normalizeEdgeMechanism(spec.edges[edge.id]).enabled)
  };
  const disabledCount = graph.edges.filter((edge) => edge.kind === "directed" && !normalizeEdgeMechanism(spec.edges[edge.id]).enabled).length;
  if (disabledCount > 0) diagnostics.push(`${disabledCount} disabled directed edge${disabledCount === 1 ? " is" : "s are"} omitted.`);
  const order = topologicalOrder(activeGraph);
  if (!order) {
    diagnostics.push("Simulation disabled because the enabled directed graph contains a cycle.");
    return {
      seed: spec.seed,
      values: previous?.values ?? {},
      nodeStates: previous?.nodeStates ?? {},
      contributions: {},
      changedNodes: [],
      diagnostics,
      conditioning: previous?.conditioning ?? emptyConditioningSummary()
    };
  }
  const rng = createSeededRandomSource(spec.seed || 1);
  const nodesById = new Map(activeGraph.nodes.map((node) => [node.id, node]));
  const values: Record<string, number> = {};
  const analyticByNode = new Map<string, SimulatedAnalyticDistribution | null>();
  const contributions: Record<string, number> = {};
  for (const id of order) {
    const mechanism = normalizeNodeMechanism(spec.nodes[id]);
    const variable = normalizeVariableModel(nodesById.get(id)?.variable);
    if (Object.hasOwn(spec.overrides, id)) {
      const value = coerceVariableValue(spec.overrides[id] ?? 0, variable);
      values[id] = value;
      analyticByNode.set(id, analyticConstant(value, "hard do intervention"));
      continue;
    }
    const parents = directedParents(activeGraph, id);
    if (parents.length === 0) {
      const analytic = analyticDistribution(mechanism.distribution, "root distribution");
      const value = sampleRootValue(mechanism.distribution, variable, rng);
      values[id] = variable.valueType === "distributional" ? distributionProjection(analytic, value) : value;
      analyticByNode.set(id, analytic);
      continue;
    }
    let value = mechanism.intercept;
    const nodeContributions: StructuralContribution[] = [];
    let lookupContribution: number | null = null;
    for (const parent of parents) {
      const edge = activeGraph.edges.find((candidate) => candidate.kind === "directed" && candidate.source === parent && candidate.target === id);
      if (!edge) continue;
      const edgeMechanism = normalizeEdgeMechanism(spec.edges[edge.id]);
      if (!edgeMechanism.enabled) continue;
      const contribution = edgeContribution(values[parent] ?? 0, edgeMechanism);
      contributions[edge.id] = contribution;
      const absorbing = edgeMechanism.kind === "absorbing";
      nodeContributions.push({ value: contribution, absorbing });
      if (edgeMechanism.kind === "table_lookup") lookupContribution = contribution;
      if (!absorbing) value += contribution;
    }
    // Plasmode: a node read from data (a table_lookup edge, no interactions) IS the cell value — ignore
    // the other structural edges (the causal DAG for adjustment, not a regenerating model). Matches compiled.
    if (lookupContribution !== null && mechanism.interactions.length === 0) value = mechanism.intercept + lookupContribution;
    const interaction = interactionContribution(values, mechanism);
    const noise = sampleDistribution(mechanism.noise, rng);
    value += interaction + noise;
    const analytic = analyticForStructuralNode(activeGraph, id, spec, mechanism, analyticByNode);
    const gateProb = variable.valueType === "semicontinuous" ? gateProbability(mechanism, values) : 1;
    const finalized = finalizeNodeValue(value, mechanism, variable, nodeContributions, mechanism.intercept + interaction + noise, rng, false, gateProb);
    values[id] = variable.valueType === "distributional" ? distributionProjection(analytic, finalized) : finalized;
    analyticByNode.set(id, analytic);
  }
  const selectionConditions = activeSelectionConditions(spec, activeGraph);
  const requestedInference = requestedInferenceMode(selectionConditions);
  const joint = buildLinearGaussianJoint(activeGraph, spec, order);
  const candidateAnalyticConditioning = joint ? conditionLinearGaussianJoint(joint, selectionConditions) : null;
  const analyticConditioning = shouldApplyAnalyticInference(requestedInference) ? candidateAnalyticConditioning : null;
  const empirical = simulateEmpiricalDistributions(activeGraph, spec, order);
  if (empirical.conditioning.activeConditions.length > 0 && empirical.conditioning.acceptedSamples === 0) {
    diagnostics.push("No empirical samples matched the active conditioning filters.");
  }
  if (selectionConditions.some(([, condition]) => condition.sampling === "importance") && empirical.conditioning.empiricalMethod === "rejection") {
    diagnostics.push("Importance sampling is not available for the active conditioning filters; using rejection sampling.");
  }
  if (selectionConditions.some(([, condition]) => condition.sampling === "analytic") && !candidateAnalyticConditioning) {
    diagnostics.push("Analytic inference is not available for the active conditioning filters; using empirical inference.");
  }
  const primaryMethod = primaryConditioningMethod(requestedInference, candidateAnalyticConditioning, empirical.conditioning.empiricalMethod, selectionConditions.length > 0);
  const conditioning: SimulationConditioningSummary = {
    ...empirical.conditioning,
    analytic: candidateAnalyticConditioning?.note ?? null,
    requestedInference,
    primaryMethod
  };
  const nodeStates: Record<string, SimulatedNodeState> = {};
  for (const id of order) {
    const variable = normalizeVariableModel(nodesById.get(id)?.variable);
    const value = values[id] ?? 0;
    const analytic = selectionConditions.length > 0
      ? analyticConditioning?.nodeAnalytics.get(id) ?? null
      : analyticByNode.get(id) ?? null;
    nodeStates[id] = {
      kind: variable.valueType === "distributional" ? "distribution" : "scalar",
      value,
      observed: value,
      analytic,
      empirical: empirical.byNode[id] ?? emptyEmpiricalDistribution()
    };
  }
  const changedNodes = Object.keys(values).filter((id) => previous ? Math.abs((previous.values[id] ?? Number.NaN) - (values[id] ?? Number.NaN)) > 1e-9 : true);
  return { seed: spec.seed, values, nodeStates, contributions, changedNodes, diagnostics, conditioning };
}

export function runIntervenedEmpiricalSimulation(graph: GraphModel, spec: SimulationSpec, intervention: SimulationIntervention): SimulationResult {
  const diagnostics: string[] = [];
  if (graph.kind !== "dag" && graph.kind !== "digraph") diagnostics.push("Simulation is only enabled for DAG-like graphs.");
  if (graph.edges.some((edge) => edge.kind !== "directed")) diagnostics.push("Simulation ignores non-directed edges.");
  const activeGraph = {
    ...graph,
    edges: graph.edges.filter((edge) => edge.kind === "directed" && normalizeEdgeMechanism(spec.edges[edge.id]).enabled)
  };
  const disabledCount = graph.edges.filter((edge) => edge.kind === "directed" && !normalizeEdgeMechanism(spec.edges[edge.id]).enabled).length;
  if (disabledCount > 0) diagnostics.push(`${disabledCount} disabled directed edge${disabledCount === 1 ? " is" : "s are"} omitted.`);
  const order = topologicalOrder(activeGraph);
  if (!order) {
    diagnostics.push("Simulation disabled because the enabled directed graph contains a cycle.");
    return {
      seed: spec.seed,
      values: {},
      nodeStates: {},
      contributions: {},
      changedNodes: [],
      diagnostics,
      conditioning: emptyConditioningSummary()
    };
  }

  const sampleCount = empiricalSampleSize(activeGraph);
  const rng = createSeededRandomSource((spec.seed || 1) ^ 0x45d9f3b);
  const nodesById = new Map(activeGraph.nodes.map((node) => [node.id, node]));
  let samples: Record<string, number[]>;
  let lastValues: Record<string, number>;

  const compiled = compileModel(activeGraph, spec, order);
  if (compiled) {
    const result = runCompiledForward(compiled, spec, rng, sampleCount, intervention);
    samples = result.samples;
    lastValues = result.lastValues;
  } else {
    samples = Object.fromEntries(order.map((id) => [id, []]));
    lastValues = {};
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const values: Record<string, number> = {};
      for (const id of order) {
        const mechanism = normalizeNodeMechanism(spec.nodes[id]);
        const variable = normalizeVariableModel(nodesById.get(id)?.variable);
        const intervened = intervention({ nodeId: id, sampleIndex, values, variable });
        if (intervened !== null && intervened !== undefined) {
          values[id] = coerceVariableValue(intervened, variable);
          continue;
        }
        if (Object.hasOwn(spec.overrides, id)) {
          values[id] = coerceVariableValue(spec.overrides[id] ?? 0, variable);
          continue;
        }
        const parents = directedParents(activeGraph, id);
        if (parents.length === 0) {
          values[id] = sampleRootValue(mechanism.distribution, variable, rng, true);
          continue;
        }
        const nodeContributions: StructuralContribution[] = [];
        let value = mechanism.intercept;
        let lookupContribution: number | null = null;
        for (const parent of parents) {
          const edge = activeGraph.edges.find((candidate) => candidate.kind === "directed" && candidate.source === parent && candidate.target === id);
          if (!edge) continue;
          const edgeMechanism = normalizeEdgeMechanism(spec.edges[edge.id]);
          if (!edgeMechanism.enabled) continue;
          const contribution = edgeContribution(values[parent] ?? 0, edgeMechanism);
          const absorbing = edgeMechanism.kind === "absorbing";
          nodeContributions.push({ value: contribution, absorbing });
          if (edgeMechanism.kind === "table_lookup") lookupContribution = contribution;
          if (!absorbing) value += contribution;
        }
        if (lookupContribution !== null && mechanism.interactions.length === 0) value = mechanism.intercept + lookupContribution;
        const interaction = interactionContribution(values, mechanism);
        const noise = sampleDistribution(mechanism.noise, rng);
        value += interaction + noise;
        const gateProb = variable.valueType === "semicontinuous" ? gateProbability(mechanism, values) : 1;
        values[id] = finalizeNodeValue(value, mechanism, variable, nodeContributions, mechanism.intercept + interaction + noise, rng, true, gateProb);
      }
      lastValues = values;
      for (const id of order) samples[id]?.push(values[id] ?? 0);
    }
  }

  const weights = Array.from({ length: sampleCount }, () => 1);
  const nodeStates: Record<string, SimulatedNodeState> = {};
  for (const id of order) {
    const variable = normalizeVariableModel(nodesById.get(id)?.variable);
    const empirical = empiricalDistribution(samples[id] ?? [], weights);
    const value = empirical.mean ?? lastValues[id] ?? 0;
    nodeStates[id] = {
      kind: variable.valueType === "distributional" ? "distribution" : "scalar",
      value,
      observed: value,
      analytic: null,
      empirical
    };
  }

  return {
    seed: spec.seed,
    values: lastValues,
    nodeStates,
    contributions: {},
    changedNodes: order,
    diagnostics,
    conditioning: {
      totalSamples: sampleCount,
      acceptedSamples: sampleCount,
      activeConditions: [],
      analytic: null,
      empiricalMethod: "forward",
      requestedInference: "auto",
      primaryMethod: "forward",
      effectiveSampleSize: computeEffectiveSampleSize(weights)
    }
  };
}

function analyticForStructuralNode(
  graph: GraphModel,
  nodeId: string,
  spec: SimulationSpec,
  mechanism: NodeMechanism,
  analyticByNode: Map<string, SimulatedAnalyticDistribution | null>
): SimulatedAnalyticDistribution | null {
  if (mechanism.combiner !== "additive" || mechanism.interactions.length > 0) return null;
  const noiseMoments = distributionMoments(mechanism.noise);
  if (!noiseMoments) return null;
  if (!Number.isFinite(noiseMoments.mean) || !Number.isFinite(noiseMoments.variance)) return null;
  let mean = mechanism.intercept + noiseMoments.mean;
  let variance = noiseMoments.variance;
  let exactNormal = isNormalLike(mechanism.noise);
  for (const parent of directedParents(graph, nodeId)) {
    const edge = graph.edges.find((candidate) => candidate.kind === "directed" && candidate.source === parent && candidate.target === nodeId);
    if (!edge) continue;
    const edgeMechanism = normalizeEdgeMechanism(spec.edges[edge.id]);
    if (!edgeMechanism.enabled) continue;
    if (edgeMechanism.kind !== "linear") return null;
    const parentAnalytic = analyticByNode.get(parent);
    if (!parentAnalytic || parentAnalytic.mean === null || parentAnalytic.variance === null) return null;
    if (!Number.isFinite(parentAnalytic.mean) || !Number.isFinite(parentAnalytic.variance)) return null;
    mean += edgeMechanism.coefficient * parentAnalytic.mean;
    variance += edgeMechanism.coefficient * edgeMechanism.coefficient * parentAnalytic.variance;
    exactNormal = exactNormal && isNormalLike(parentAnalytic.distribution);
  }
  if (!Number.isFinite(mean) || !Number.isFinite(variance)) return null;
  const cleanVariance = Math.max(0, variance);
  const distribution: NodeDistribution = cleanVariance <= 1e-12 ? { kind: "constant", value: mean } : { kind: "normal", mean, sd: Math.sqrt(cleanVariance) };
  return {
    distribution,
    mean,
    variance: cleanVariance,
    note: exactNormal ? "linear Gaussian SEM" : "moment-matched normal approximation"
  };
}

function analyticDistribution(distribution: NodeDistribution, note: string): SimulatedAnalyticDistribution {
  const moments = distributionMoments(distribution);
  return {
    distribution,
    mean: moments?.mean ?? null,
    variance: moments?.variance ?? null,
    note
  };
}

function analyticConstant(value: number, note: string): SimulatedAnalyticDistribution {
  return {
    distribution: { kind: "constant", value },
    mean: value,
    variance: 0,
    note
  };
}

function distributionProjection(analytic: SimulatedAnalyticDistribution | null, fallback: number): number {
  if (analytic?.mean !== null && analytic?.mean !== undefined && Number.isFinite(analytic.mean)) return analytic.mean;
  return Number.isFinite(fallback) ? fallback : 0;
}

function distributionMoments(distribution: NodeDistribution): { mean: number; variance: number } | null {
  if (distribution.kind === "constant") return { mean: distribution.value, variance: 0 };
  if (distribution.kind === "normal") return { mean: distribution.mean, variance: distribution.sd * distribution.sd };
  if (distribution.kind === "lognormal") {
    const variance = (Math.exp(distribution.sdLog * distribution.sdLog) - 1) * Math.exp((2 * distribution.meanLog) + (distribution.sdLog * distribution.sdLog));
    return { mean: Math.exp(distribution.meanLog + (distribution.sdLog * distribution.sdLog / 2)), variance };
  }
  if (distribution.kind === "uniform") {
    const span = distribution.max - distribution.min;
    return { mean: (distribution.min + distribution.max) / 2, variance: (span * span) / 12 };
  }
  if (distribution.kind === "bernoulli") return { mean: distribution.p, variance: distribution.p * (1 - distribution.p) };
  if (distribution.kind === "poisson") return { mean: distribution.lambda, variance: distribution.lambda };
  if (distribution.kind === "beta") {
    const total = distribution.alpha + distribution.beta;
    return {
      mean: distribution.alpha / total,
      variance: (distribution.alpha * distribution.beta) / (total * total * (total + 1))
    };
  }
  if (distribution.kind === "laplace") return { mean: distribution.mean, variance: 2 * distribution.scale * distribution.scale };
  if (distribution.kind === "student_t") {
    if (distribution.df <= 1) return null;
    return {
      mean: distribution.mean,
      variance: distribution.df > 2 ? (distribution.scale * distribution.scale * distribution.df) / (distribution.df - 2) : Number.POSITIVE_INFINITY
    };
  }
  if (distribution.kind === "gamma") return { mean: distribution.shape * distribution.scale, variance: distribution.shape * distribution.scale * distribution.scale };
  if (distribution.kind === "exponential") return { mean: 1 / distribution.rate, variance: 1 / (distribution.rate * distribution.rate) };
  return null;
}

function isNormalLike(distribution: NodeDistribution): boolean {
  return distribution.kind === "normal" || distribution.kind === "constant";
}

export function downstreamNodes(graph: GraphModel, nodeIds: string[]): string[] {
  const seen = new Set<string>();
  const stack = [...nodeIds];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id) continue;
    for (const edge of graph.edges) {
      if (edge.kind !== "directed" || edge.source !== id || seen.has(edge.target)) continue;
      seen.add(edge.target);
      stack.push(edge.target);
    }
  }
  return [...seen];
}
