import { directedParents, normalizeEdgeMechanism, normalizeNodeMechanism, normalizeSelectionCondition, normalizeVariableModel } from "./graph";
import { topologicalOrder } from "./analysis";
import { createSeededRandomSource, sampleDistribution } from "./distributions";
import type {
  EdgeMechanism,
  GraphModel,
  NodeDistribution,
  NodeInteraction,
  NodeMechanism,
  SimulationConditioningSummary,
  SimulationInferenceMode,
  SimulationSelectionCondition,
  SimulatedAnalyticDistribution,
  SimulatedEmpiricalDistribution,
  SimulatedNodeState,
  SimulationResult,
  SimulationSpec,
  VariableModel
} from "./types";

export { createDistributionSampler, createSeededRandomSource, sampleDistribution } from "./distributions";

const EMPIRICAL_SAMPLE_MIN = 80;
const EMPIRICAL_SAMPLE_MAX = 50000;
const VARIANCE_EPSILON = 1e-12;

interface LinearGaussianJoint {
  ids: string[];
  mean: number[];
  covariance: number[][];
  binaryLatents: Map<string, BinaryLatentInfo>;
  binaryOverridden: Map<string, number>;
}

interface BinaryLatentInfo {
  approximate: boolean;
}

interface BinaryLatentNoise {
  meanShift: number;
  noiseVariance: number;
  approximate: boolean;
}

const LOGIT_LATENT_VARIANCE = (Math.PI * Math.PI) / 3;

interface LinearGaussianConditioning {
  nodeAnalytics: Map<string, SimulatedAnalyticDistribution>;
  note: string;
}

interface GuidedSample {
  value: number;
  logWeight: number;
  guided: boolean;
  possible: boolean;
}

interface EmpiricalSimulation {
  byNode: Record<string, SimulatedEmpiricalDistribution>;
  conditioning: SimulationConditioningSummary;
}

interface StructuralContribution {
  value: number;
  absorbing: boolean;
}

export interface SimulationInterventionContext {
  nodeId: string;
  sampleIndex: number;
  values: Readonly<Record<string, number>>;
  variable: VariableModel;
}

export type SimulationIntervention = (context: SimulationInterventionContext) => number | null | undefined;

export function runSimulation(graph: GraphModel, spec: SimulationSpec, previous?: SimulationResult): SimulationResult {
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
    for (const parent of parents) {
      const edge = activeGraph.edges.find((candidate) => candidate.kind === "directed" && candidate.source === parent && candidate.target === id);
      if (!edge) continue;
      const edgeMechanism = normalizeEdgeMechanism(spec.edges[edge.id]);
      if (!edgeMechanism.enabled) continue;
      const contribution = edgeContribution(values[parent] ?? 0, edgeMechanism);
      contributions[edge.id] = contribution;
      const absorbing = edgeMechanism.kind === "absorbing";
      nodeContributions.push({ value: contribution, absorbing });
      if (!absorbing) value += contribution;
    }
    const interaction = interactionContribution(values, mechanism);
    const noise = sampleDistribution(mechanism.noise, rng);
    value += interaction + noise;
    const analytic = analyticForStructuralNode(activeGraph, id, spec, mechanism, analyticByNode);
    const finalized = finalizeNodeValue(value, mechanism, variable, nodeContributions, mechanism.intercept + interaction + noise, rng);
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
  const samples: Record<string, number[]> = Object.fromEntries(order.map((id) => [id, []]));
  let lastValues: Record<string, number> = {};

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
      for (const parent of parents) {
        const edge = activeGraph.edges.find((candidate) => candidate.kind === "directed" && candidate.source === parent && candidate.target === id);
        if (!edge) continue;
        const edgeMechanism = normalizeEdgeMechanism(spec.edges[edge.id]);
        if (!edgeMechanism.enabled) continue;
        const contribution = edgeContribution(values[parent] ?? 0, edgeMechanism);
        const absorbing = edgeMechanism.kind === "absorbing";
        nodeContributions.push({ value: contribution, absorbing });
        if (!absorbing) value += contribution;
      }
      const interaction = interactionContribution(values, mechanism);
      const noise = sampleDistribution(mechanism.noise, rng);
      value += interaction + noise;
      values[id] = finalizeNodeValue(value, mechanism, variable, nodeContributions, mechanism.intercept + interaction + noise, rng, true);
    }
    lastValues = values;
    for (const id of order) samples[id]?.push(values[id] ?? 0);
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

export function edgeContribution(parentValue: number, mechanism: EdgeMechanism): number {
  switch (mechanism.kind) {
    case "absorbing":
      return clamp01(parentValue);
    case "threshold":
      return parentValue < mechanism.threshold ? mechanism.low : mechanism.high;
    case "smooth_threshold":
      return mechanism.scale * sigmoid(mechanism.steepness * (parentValue - mechanism.threshold));
    case "saturating":
      return mechanism.scale * Math.tanh(mechanism.steepness * (parentValue - mechanism.midpoint));
    case "quadratic":
      return mechanism.beta1 * parentValue + mechanism.beta2 * parentValue * parentValue;
    case "piecewise_linear":
      return interpolatePiecewise(parentValue, mechanism.points);
    case "hill_emax":
      return hillEmax(parentValue, mechanism);
    case "log_linear":
      return mechanism.baseline + mechanism.coefficient * Math.log(Math.max(Number.EPSILON, parentValue + mechanism.offset));
    case "power_law":
      return powerLaw(parentValue, mechanism);
    case "monotone_spline":
      return interpolateMonotoneCubic(parentValue, mechanism.points);
    case "linear":
      return mechanism.coefficient * parentValue;
  }
}

function interactionContribution(values: Record<string, number>, mechanism: NodeMechanism): number {
  return mechanism.interactions.reduce((sum, interaction) => sum + evaluateInteraction(values, interaction), 0);
}

function evaluateInteraction(values: Record<string, number>, interaction: NodeInteraction): number {
  if (interaction.kind === "product") {
    return interaction.coefficient * (values[interaction.left] ?? 0) * (values[interaction.right] ?? 0);
  }
  return interaction.coefficient * (values[interaction.source] ?? 0) * sigmoid(interaction.steepness * ((values[interaction.gate] ?? 0) - interaction.threshold));
}

function applyCombiner(value: number, mechanism: NodeMechanism, contributions: number[], leakTerm: number): number {
  if (mechanism.combiner === "bounded_logistic") return sigmoid(value);
  if (mechanism.combiner === "positive_softplus") return softplus(value);
  if (mechanism.combiner === "bernoulli_logit") return sigmoid(value);
  if (mechanism.combiner === "poisson_log" || mechanism.combiner === "gamma_log") return safeExp(value);
  if (mechanism.combiner === "noisy_or") return noisyOr(contributions, leakTerm);
  return value;
}

function sampleRootValue(distribution: NodeDistribution, variable: VariableModel, rng: () => number, forceDraw = false): number {
  if (variable.valueType !== "binary") return sampleDistribution(distribution, rng);
  if (distribution.kind === "bernoulli") {
    return !forceDraw && variable.simulation.mode === "expected_value" ? distribution.p : sampleDistribution(distribution, rng);
  }
  return coerceBinary(sampleDistribution(distribution, rng));
}

function finalizeNodeValue(value: number, mechanism: NodeMechanism, variable: VariableModel, contributions: StructuralContribution[], leakTerm: number, rng: () => number, forceDraw = false): number {
  const regularContributions = contributions.filter((contribution) => !contribution.absorbing).map((contribution) => contribution.value);
  if (variable.valueType !== "binary") return applyCombiner(value, mechanism, regularContributions, leakTerm);
  const probability = binaryProbability(value, mechanism, contributions, leakTerm);
  if (!forceDraw && variable.simulation.mode === "expected_value") return probability;
  return sampleDistribution({ kind: "bernoulli", p: probability }, rng);
}

function binaryProbability(value: number, mechanism: NodeMechanism, contributions: StructuralContribution[], leakTerm: number): number {
  const regularContributions = contributions.filter((contribution) => !contribution.absorbing).map((contribution) => contribution.value);
  const laterRisk = rawBinaryProbability(value, mechanism, regularContributions, leakTerm);
  const alreadyEvent = absorbingProbability(contributions);
  return alreadyEvent + (1 - alreadyEvent) * laterRisk;
}

function rawBinaryProbability(value: number, mechanism: NodeMechanism, contributions: number[], leakTerm: number): number {
  if (mechanism.combiner === "bernoulli_logit" || mechanism.combiner === "bounded_logistic") return sigmoid(value);
  if (mechanism.combiner === "noisy_or") return noisyOr(contributions, leakTerm);
  return clamp01(applyCombiner(value, mechanism, contributions, leakTerm));
}

function absorbingProbability(contributions: StructuralContribution[]): number {
  let probabilityOfNoPriorEvent = 1;
  for (const contribution of contributions) {
    if (!contribution.absorbing) continue;
    probabilityOfNoPriorEvent *= 1 - clamp01(contribution.value);
  }
  return 1 - probabilityOfNoPriorEvent;
}

function hillEmax(value: number, mechanism: EdgeMechanism): number {
  const concentration = Math.max(0, value);
  const ec50 = Math.max(mechanism.ec50, Number.EPSILON);
  const exponent = Math.max(mechanism.exponent, Number.EPSILON);
  const active = Math.pow(concentration, exponent);
  const halfMax = Math.pow(ec50, exponent);
  const fraction = active <= 0 ? 0 : active / (halfMax + active);
  return mechanism.baseline + mechanism.maxEffect * fraction;
}

function powerLaw(value: number, mechanism: EdgeMechanism): number {
  const scale = Math.max(Math.abs(mechanism.scale), Number.EPSILON);
  const input = (value - mechanism.offset) / scale;
  return mechanism.baseline + mechanism.coefficient * Math.sign(input) * Math.pow(Math.abs(input), Math.max(mechanism.exponent, Number.EPSILON));
}

function noisyOr(contributions: number[], leakTerm: number): number {
  let probabilityOfNoActivation = 1 - clamp01(leakTerm);
  for (const contribution of contributions) {
    probabilityOfNoActivation *= 1 - clamp01(contribution);
  }
  return 1 - probabilityOfNoActivation;
}

function interpolatePiecewise(value: number, points: EdgeMechanism["points"]): number {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  if (sorted.length === 0) return value;
  if (sorted.length === 1) return sorted[0]?.y ?? value;
  if (value <= (sorted[0]?.x ?? 0)) return sorted[0]?.y ?? value;
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const left = sorted[index];
    const right = sorted[index + 1];
    if (!left || !right) continue;
    if (value <= right.x) {
      const span = right.x - left.x || 1;
      const t = (value - left.x) / span;
      return left.y + t * (right.y - left.y);
    }
  }
  return sorted.at(-1)?.y ?? value;
}

function interpolateMonotoneCubic(value: number, points: EdgeMechanism["points"]): number {
  const sorted = monotonePoints(points);
  if (sorted.length < 3) return interpolatePiecewise(value, sorted);
  if (value <= (sorted[0]?.x ?? 0)) return sorted[0]?.y ?? value;
  if (value >= (sorted.at(-1)?.x ?? 0)) return sorted.at(-1)?.y ?? value;

  const slopes = sorted.slice(0, -1).map((point, index) => {
    const next = sorted[index + 1];
    if (!next) return 0;
    return (next.y - point.y) / (next.x - point.x || 1);
  });
  const tangents = sorted.map((_, index) => {
    if (index === 0) return slopes[0] ?? 0;
    if (index === sorted.length - 1) return slopes.at(-1) ?? 0;
    const before = slopes[index - 1] ?? 0;
    const after = slopes[index] ?? 0;
    return before * after <= 0 ? 0 : (before + after) / 2;
  });

  for (let index = 0; index < slopes.length; index += 1) {
    const slope = slopes[index] ?? 0;
    if (slope === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }
    const left = (tangents[index] ?? 0) / slope;
    const right = (tangents[index + 1] ?? 0) / slope;
    const length = Math.hypot(left, right);
    if (length > 3) {
      const scale = 3 / length;
      tangents[index] = scale * left * slope;
      tangents[index + 1] = scale * right * slope;
    }
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const left = sorted[index];
    const right = sorted[index + 1];
    if (!left || !right || value > right.x) continue;
    const width = right.x - left.x || 1;
    const t = (value - left.x) / width;
    const h00 = (2 * t * t * t) - (3 * t * t) + 1;
    const h10 = (t * t * t) - (2 * t * t) + t;
    const h01 = (-2 * t * t * t) + (3 * t * t);
    const h11 = (t * t * t) - (t * t);
    return (h00 * left.y) + (h10 * width * (tangents[index] ?? 0)) + (h01 * right.y) + (h11 * width * (tangents[index + 1] ?? 0));
  }
  return sorted.at(-1)?.y ?? value;
}

function monotonePoints(points: EdgeMechanism["points"]): EdgeMechanism["points"] {
  const sorted = [...points]
    .sort((a, b) => a.x - b.x)
    .filter((point, index, values) => index === 0 || point.x !== values[index - 1]?.x);
  if (sorted.length <= 1) return sorted;
  const first = sorted[0]?.y ?? 0;
  const last = sorted.at(-1)?.y ?? first;
  const increasing = last >= first;
  let previous = first;
  return sorted.map((point, index) => {
    if (index === 0) return { ...point };
    const y = increasing ? Math.max(previous, point.y) : Math.min(previous, point.y);
    previous = y;
    return { x: point.x, y };
  });
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function softplus(value: number): number {
  if (value > 30) return value;
  if (value < -30) return Math.exp(value);
  return Math.log1p(Math.exp(value));
}

function safeExp(value: number): number {
  return Math.exp(Math.max(-30, Math.min(30, value)));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function coerceBinary(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function coerceVariableValue(value: number, variable: VariableModel): number {
  return variable.valueType === "binary" ? coerceBinary(value) : value;
}

function simulateEmpiricalDistributions(
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
  const linearGaussianImportance = simulateLinearGaussianConditionedEmpirical(graph, spec, order, conditions, sampleCount, rng);
  if (linearGaussianImportance) return linearGaussianImportance;
  const maxAttempts = conditions.length > 0 ? sampleCount * 20 : sampleCount;
  let attempts = 0;
  let accepted = 0;
  let guidedSampleCount = 0;
  while (attempts < maxAttempts && accepted < sampleCount) {
    attempts += 1;
    const values: Record<string, number> = {};
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
        if (parents.length === 0) {
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
          for (const parent of parents) {
            const edge = graph.edges.find((candidate) => candidate.kind === "directed" && candidate.source === parent && candidate.target === id);
            if (!edge) continue;
            const edgeMechanism = normalizeEdgeMechanism(spec.edges[edge.id]);
            if (!edgeMechanism.enabled) continue;
            const contribution = edgeContribution(values[parent] ?? 0, edgeMechanism);
            const absorbing = edgeMechanism.kind === "absorbing";
            nodeContributions.push({ value: contribution, absorbing });
            if (!absorbing) value += contribution;
          }
          const interaction = interactionContribution(values, mechanism);
          const base = value + interaction;
          const guided = condition && shouldUseImportanceSampling(condition) ? guidedAdditiveNoiseSample(base, mechanism, variable, condition, rng) : null;
          if (guided) {
            if (!guided.possible) possible = false;
            values[id] = guided.value;
            logWeight += guided.logWeight;
            guidedThisSample = guidedThisSample || guided.guided;
            continue;
          }
          const noise = sampleDistribution(mechanism.noise, rng);
          value += interaction + noise;
          values[id] = finalizeNodeValue(value, mechanism, variable, nodeContributions, mechanism.intercept + interaction + noise, rng, true);
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
  const factor = choleskyLower(residualCovariance);
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

function choleskyLower(matrix: number[][]): number[][] | null {
  const size = matrix.length;
  const lower = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let sum = matrix[row]?.[column] ?? 0;
      for (let previous = 0; previous < column; previous += 1) {
        sum -= (lower[row]?.[previous] ?? 0) * (lower[column]?.[previous] ?? 0);
      }
      if (row === column) {
        if (sum < -1e-8) return null;
        lower[row]![column] = Math.sqrt(Math.max(0, sum));
      } else {
        const diagonal = lower[column]?.[column] ?? 0;
        lower[row]![column] = Math.abs(diagonal) <= 1e-10 ? 0 : sum / diagonal;
      }
    }
  }
  return lower;
}

function sampleResidual(factor: number[][], rng: () => number): number[] {
  const z = factor.map(() => inverseStandardNormalCdf(rng()));
  return factor.map((row) => row.reduce((sum, coefficient, index) => sum + coefficient * (z[index] ?? 0), 0));
}

function activeSelectionConditions(spec: SimulationSpec, graph: GraphModel): Array<[string, SimulationSelectionCondition]> {
  return Object.entries(spec.selections ?? {})
    .filter(([id]) => graph.nodes.some((node) => node.id === id))
    .map(([id, condition]) => [id, normalizeSelectionCondition(condition)]);
}

function matchesSelectionConditions(values: Record<string, number>, conditions: Array<[string, SimulationSelectionCondition]>): boolean {
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

function selectionConditionUsesRef(condition: SimulationSelectionCondition): boolean {
  return Boolean(condition.valueRef || condition.upperRef);
}

function formatSelectionCondition(id: string, condition: SimulationSelectionCondition): string {
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

function emptyConditioningSummary(): SimulationConditioningSummary {
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

function requestedInferenceMode(conditions: Array<[string, SimulationSelectionCondition]>): SimulationInferenceMode {
  if (conditions.length === 0) return "auto";
  const first = conditions[0]?.[1].sampling ?? "auto";
  return conditions.every(([, condition]) => condition.sampling === first) ? first : "auto";
}

function shouldApplyAnalyticInference(mode: SimulationInferenceMode): boolean {
  return mode === "auto" || mode === "analytic";
}

function primaryConditioningMethod(
  requested: SimulationInferenceMode,
  analytic: LinearGaussianConditioning | null,
  empirical: SimulationConditioningSummary["empiricalMethod"],
  active: boolean
): SimulationConditioningSummary["primaryMethod"] {
  if (!active) return "forward";
  if (shouldApplyAnalyticInference(requested) && analytic) return "analytic";
  return empirical;
}

function shouldUseImportanceSampling(condition: SimulationSelectionCondition): boolean {
  if (condition.operator === "one_of") return false;
  // Importance sampling needs a fixed numeric bound to compute the proposal density.
  // Variable-bound conditions resolve only at draw time, so fall back to rejection.
  if (selectionConditionUsesRef(condition)) return false;
  return condition.sampling !== "rejection";
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

function selectionBounds(condition: SimulationSelectionCondition): [number, number] {
  if (condition.operator === "one_of") {
    const values = condition.values ?? [condition.value];
    return [Math.min(...values), Math.max(...values)];
  }
  if (condition.operator === "at_least") return [condition.value, Number.POSITIVE_INFINITY];
  if (condition.operator === "at_most") return [Number.NEGATIVE_INFINITY, condition.value];
  return [condition.value, condition.upper ?? condition.value];
}

function normalizedWeights(logWeights: number[]): number[] {
  if (logWeights.length === 0) return [];
  const maxLog = Math.max(...logWeights);
  if (!Number.isFinite(maxLog)) return logWeights.map(() => 0);
  return logWeights.map((logWeight) => Math.exp(logWeight - maxLog));
}

function computeEffectiveSampleSize(weights: number[]): number | null {
  const sum = weights.reduce((total, weight) => total + weight, 0);
  const sumSquares = weights.reduce((total, weight) => total + weight * weight, 0);
  if (sum <= 0 || sumSquares <= 0) return null;
  return (sum * sum) / sumSquares;
}

function buildLinearGaussianJoint(graph: GraphModel, spec: SimulationSpec, order: string[]): LinearGaussianJoint | null {
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

function conditionLinearGaussianJoint(joint: LinearGaussianJoint, conditions: Array<[string, SimulationSelectionCondition]>): LinearGaussianConditioning | null {
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

function isImportanceSamplingValueType(variable: VariableModel): boolean {
  return variable.valueType === "continuous" || variable.valueType === "distributional";
}

function linearGaussianDistributionMoments(distribution: NodeDistribution): { mean: number; variance: number } | null {
  if (distribution.kind === "constant") return { mean: distribution.value, variance: 0 };
  if (distribution.kind === "normal") return { mean: distribution.mean, variance: distribution.sd * distribution.sd };
  return null;
}

function standardNormalPdf(value: number): number {
  return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

function standardNormalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

function inverseStandardNormalCdf(probability: number): number {
  const p = clampProbability(probability);
  const a = [-3.969683028665376e+1, 2.209460984245205e+2, -2.759285104469687e+2, 1.38357751867269e+2, -3.066479806614716e+1, 2.506628277459239];
  const b = [-5.447609879822406e+1, 1.615858368580409e+2, -1.556989798598866e+2, 6.680131188771972e+1, -1.328068155288572e+1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  const high = 1 - low;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    const numerator = (((((c[0] ?? 0) * q + (c[1] ?? 0)) * q + (c[2] ?? 0)) * q + (c[3] ?? 0)) * q + (c[4] ?? 0)) * q + (c[5] ?? 0);
    const denominator = ((((d[0] ?? 0) * q + (d[1] ?? 0)) * q + (d[2] ?? 0)) * q + (d[3] ?? 0)) * q + 1;
    return numerator / denominator;
  }
  if (p > high) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    const numerator = (((((c[0] ?? 0) * q + (c[1] ?? 0)) * q + (c[2] ?? 0)) * q + (c[3] ?? 0)) * q + (c[4] ?? 0)) * q + (c[5] ?? 0);
    const denominator = ((((d[0] ?? 0) * q + (d[1] ?? 0)) * q + (d[2] ?? 0)) * q + (d[3] ?? 0)) * q + 1;
    return -(numerator / denominator);
  }
  const q = p - 0.5;
  const r = q * q;
  const numerator = (((((a[0] ?? 0) * r + (a[1] ?? 0)) * r + (a[2] ?? 0)) * r + (a[3] ?? 0)) * r + (a[4] ?? 0)) * r + (a[5] ?? 0);
  const denominator = (((((b[0] ?? 0) * r + (b[1] ?? 0)) * r + (b[2] ?? 0)) * r + (b[3] ?? 0)) * r + (b[4] ?? 0)) * r + 1;
  return (numerator * q) / denominator;
}

function clampProbability(probability: number): number {
  return Math.min(1 - 1e-15, Math.max(1e-15, probability));
}

function erf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}

const GAUSS_LEGENDRE_16_NODES: number[] = [
  -0.9894009349916499, -0.9445750230732326, -0.8656312023878317, -0.7554044083550030,
  -0.6178762444026438, -0.4580167776572274, -0.2816035507792589, -0.0950125098376374,
   0.0950125098376374,  0.2816035507792589,  0.4580167776572274,  0.6178762444026438,
   0.7554044083550030,  0.8656312023878317,  0.9445750230732326,  0.9894009349916499
];

const GAUSS_LEGENDRE_16_WEIGHTS: number[] = [
  0.0271524594117541, 0.0622535239386479, 0.0951585116824928, 0.1246289712555339,
  0.1495959888165767, 0.1691565193950025, 0.1826034150449236, 0.1894506104550685,
  0.1894506104550685, 0.1826034150449236, 0.1691565193950025, 0.1495959888165767,
  0.1246289712555339, 0.0951585116824928, 0.0622535239386479, 0.0271524594117541
];

function gaussLegendre16(integrand: (x: number) => number, lower: number, upper: number): number {
  if (lower === upper) return 0;
  const half = (upper - lower) / 2;
  const mid = (upper + lower) / 2;
  let sum = 0;
  for (let i = 0; i < 16; i += 1) {
    const x = mid + half * (GAUSS_LEGENDRE_16_NODES[i] ?? 0);
    sum += (GAUSS_LEGENDRE_16_WEIGHTS[i] ?? 0) * integrand(x);
  }
  return half * sum;
}

function bivariateNormalCdf(h: number, k: number, rho: number): number {
  if (rho === 0) return standardNormalCdf(h) * standardNormalCdf(k);
  const r = Math.max(-0.9999, Math.min(0.9999, rho));
  const hSq = h * h;
  const kSq = k * k;
  const integrand = (rValue: number): number => {
    const denom = 1 - rValue * rValue;
    if (denom <= 1e-12) return 0;
    const exponent = -(hSq - 2 * rValue * h * k + kSq) / (2 * denom);
    if (exponent < -700) return 0;
    return Math.exp(exponent) / (2 * Math.PI * Math.sqrt(denom));
  };
  return standardNormalCdf(h) * standardNormalCdf(k) + gaussLegendre16(integrand, 0, r);
}

interface BivariateMoments {
  L: number;
  mean1: number;
  mean2: number;
  var1: number;
  var2: number;
  cov: number;
}

function bivariateRectangleMoments(a1: number, b1: number, a2: number, b2: number, rho: number): BivariateMoments | null {
  if (a1 >= b1 || a2 >= b2) return null;
  const r = Math.max(-0.9999, Math.min(0.9999, rho));
  const oneMinusRsq = Math.max(1 - r * r, 1e-12);
  const root = Math.sqrt(oneMinusRsq);

  const Phi2 = (h: number, k: number): number => {
    if (h === Number.NEGATIVE_INFINITY || k === Number.NEGATIVE_INFINITY) return 0;
    if (h === Number.POSITIVE_INFINITY) return k === Number.POSITIVE_INFINITY ? 1 : standardNormalCdf(k);
    if (k === Number.POSITIVE_INFINITY) return standardNormalCdf(h);
    return bivariateNormalCdf(h, k, r);
  };

  const phi2 = (h: number, k: number): number => {
    if (!Number.isFinite(h) || !Number.isFinite(k)) return 0;
    return Math.exp(-(h * h - 2 * r * h * k + k * k) / (2 * oneMinusRsq)) / (2 * Math.PI * root);
  };

  const m = (t: number, aOther: number, bOther: number): number => {
    if (!Number.isFinite(t)) return 0;
    const upper = bOther === Number.POSITIVE_INFINITY ? 1 : standardNormalCdf((bOther - r * t) / root);
    const lower = aOther === Number.NEGATIVE_INFINITY ? 0 : standardNormalCdf((aOther - r * t) / root);
    return standardNormalPdf(t) * (upper - lower);
  };

  const L = Phi2(b1, b2) - Phi2(a1, b2) - Phi2(b1, a2) + Phi2(a1, a2);
  if (L <= VARIANCE_EPSILON) return null;

  const m1a = m(a1, a2, b2);
  const m1b = m(b1, a2, b2);
  const m2a = m(a2, a1, b1);
  const m2b = m(b2, a1, b1);

  const F1 = m1a - m1b;
  const F2 = m2a - m2b;

  const safeProduct = (t: number, value: number): number => (Number.isFinite(t) ? t * value : 0);
  const G1 = safeProduct(a1, m1a) - safeProduct(b1, m1b);
  const G2 = safeProduct(a2, m2a) - safeProduct(b2, m2b);

  const Corner = phi2(a1, a2) - phi2(a1, b2) - phi2(b1, a2) + phi2(b1, b2);

  const mean1 = (F1 + r * F2) / L;
  const mean2 = (r * F1 + F2) / L;

  const ew1sq = 1 + (G1 + r * r * G2) / L + r * (1 - r * r) * Corner / L;
  const ew2sq = 1 + (G2 + r * r * G1) / L + r * (1 - r * r) * Corner / L;
  const ew1w2 = r + r * (G1 + G2) / L + (1 - r * r) * Corner / L;

  return {
    L,
    mean1,
    mean2,
    var1: Math.max(0, ew1sq - mean1 * mean1),
    var2: Math.max(0, ew2sq - mean2 * mean2),
    cov: ew1w2 - mean1 * mean2
  };
}

function empiricalSampleSize(graph: GraphModel): number {
  const requested = graph.nodes.reduce((max, node) => {
    const variable = normalizeVariableModel(node.variable);
    return Math.max(max, variable.simulation.sampleSize);
  }, EMPIRICAL_SAMPLE_MIN);
  return Math.min(EMPIRICAL_SAMPLE_MAX, Math.max(EMPIRICAL_SAMPLE_MIN, Math.round(requested)));
}

function emptyEmpiricalDistribution(): SimulatedEmpiricalDistribution {
  return { samples: [], weights: [], mean: null, variance: null, min: null, max: null, effectiveSampleSize: null };
}

function empiricalDistribution(samples: number[], weights: number[] = []): SimulatedEmpiricalDistribution {
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
