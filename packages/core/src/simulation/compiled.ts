import { sampleDistribution } from "../distributions";
import { directedParents, normalizeEdgeMechanism, normalizeNodeMechanism, normalizeVariableModel } from "../graph";
import type {
  EdgeMechanism,
  GraphModel,
  NodeDistribution,
  NodeInteraction,
  SimulationSpec,
  VariableModel
} from "../types";
import { clamp01, coerceBinary, edgeContribution, ordinalThresholds, safeExp, sigmoid, softplus } from "./interpreter";

// === Compiled forward-sampling fast path =====================================
// A monomorphic, allocation-free reimplementation of the per-sample forward loop.
// It is BIT-IDENTICAL to the interpreted loops (same PRNG draw order + values: d3
// formulas replicated inline, same arithmetic grouping). Falls back to the
// interpreted path (returns null) for distributional nodes or noisy_or combiners,
// and is only used when there are no active selection conditions.

export type FastSampler = (rng: () => number) => number;

// Replicates each d3-random sampler exactly as the interpreted path uses it (a
// fresh closure per call, so normal always takes the polar branch / discards the
// Box-Muller spare). Rare distributions defer to the d3 path (still bit-identical).
function compileDistributionSampler(dist: NodeDistribution): FastSampler {
  switch (dist.kind) {
    case "constant": { const v = dist.value; return () => v; }
    case "bernoulli": { const p = dist.p; return (rng) => Math.floor(rng() + p); }
    case "uniform": { const min = dist.min; const span = dist.max - dist.min; return (rng) => rng() * span + min; }
    case "normal": {
      const mu = dist.mean; const sd = dist.sd;
      return (rng) => { let x: number, y: number, r: number; do { x = rng() * 2 - 1; y = rng() * 2 - 1; r = x * x + y * y; } while (!r || r > 1); return mu + sd * y * Math.sqrt(-2 * Math.log(r) / r); };
    }
    default: return (rng) => sampleDistribution(dist, rng);
  }
}

function compileEdgeFn(mechanism: EdgeMechanism): (parentValue: number) => number {
  switch (mechanism.kind) {
    case "linear": { const c = mechanism.coefficient; return (x) => c * x; }
    case "quadratic": { const b1 = mechanism.beta1; const b2 = mechanism.beta2; return (x) => b1 * x + b2 * x * x; }
    case "absorbing": return (x) => clamp01(x);
    default: return (x) => edgeContribution(x, mechanism);
  }
}

function compileInteractionFn(interaction: NodeInteraction, index: Map<string, number>): (vals: Float64Array) => number {
  const c = interaction.coefficient;
  if (interaction.kind === "product") {
    const l = index.get(interaction.left) ?? 0; const r = index.get(interaction.right) ?? 0;
    return (vals) => c * vals[l]! * vals[r]!;
  }
  const s = index.get(interaction.source) ?? 0; const g = index.get(interaction.gate) ?? 0; const steep = interaction.steepness; const thr = interaction.threshold;
  return (vals) => c * vals[s]! * sigmoid(steep * (vals[g]! - thr));
}

export interface CompiledNodePlan {
  id: string;
  out: number;
  binary: boolean;
  count: boolean;
  ordinal: boolean;
  ordinalThr: number[];
  categorical: boolean;
  catLevels: number;
  isRoot: boolean;
  rootSampler: FastSampler;
  binaryNonBernoulliRoot: boolean;
  intercept: number;
  edgeParents: number[];
  edgeFns: Array<(x: number) => number>;
  absorbParents: number[];
  absorbFns: Array<(x: number) => number>;
  interactions: Array<(vals: Float64Array) => number>;
  noiseSampler: FastSampler;
  riskFn: (eta: number) => number;
  combineFn: (eta: number) => number;
  variable: VariableModel;
}

export interface CompiledModel { plan: CompiledNodePlan[]; index: Map<string, number> }

export function compileModel(graph: GraphModel, spec: SimulationSpec, order: string[]): CompiledModel | null {
  const index = new Map(order.map((id, i) => [id, i]));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const identity: FastSampler = () => 0;
  const plan: CompiledNodePlan[] = [];
  for (const id of order) {
    const variable = normalizeVariableModel(nodesById.get(id)?.variable);
    if (variable.valueType === "distributional") return null;
    const mechanism = normalizeNodeMechanism(spec.nodes[id]);
    if (mechanism.combiner === "noisy_or") return null;
    // Copula marginal needs the inverse-CDF transform; run the interpreted path for it.
    if (mechanism.combiner === "copula_marginal") return null;
    const out = index.get(id) ?? 0;
    const binary = variable.valueType === "binary";
    const count = variable.valueType === "count";
    const ordinal = variable.valueType === "ordinal";
    const ordinalThr = ordinal ? ordinalThresholds(variable.responseFamily.levels, variable.responseFamily.thresholds) : [];
    const categorical = variable.valueType === "categorical";
    const catLevels = categorical ? Math.max(2, Math.floor(variable.responseFamily.levels) || 2) : 0;
    const parents = directedParents(graph, id);
    const combiner = mechanism.combiner;
    const link: (eta: number) => number = combiner === "bounded_logistic" || combiner === "bernoulli_logit"
      ? sigmoid
      : combiner === "positive_softplus" ? softplus
        : combiner === "poisson_log" || combiner === "gamma_log" ? safeExp : (eta) => eta;
    const riskFn: (eta: number) => number = (combiner === "bernoulli_logit" || combiner === "bounded_logistic") ? sigmoid : (eta) => clamp01(link(eta));
    if (parents.length === 0) {
      const binaryNonBernoulliRoot = binary && mechanism.distribution.kind !== "bernoulli";
      plan.push({ id, out, binary, count, ordinal, ordinalThr, categorical, catLevels, isRoot: true, rootSampler: compileDistributionSampler(mechanism.distribution), binaryNonBernoulliRoot, intercept: 0, edgeParents: [], edgeFns: [], absorbParents: [], absorbFns: [], interactions: [], noiseSampler: identity, riskFn, combineFn: link, variable });
      continue;
    }
    const edgeParents: number[] = []; const edgeFns: Array<(x: number) => number> = [];
    const absorbParents: number[] = []; const absorbFns: Array<(x: number) => number> = [];
    for (const parent of parents) {
      const edge = graph.edges.find((candidate) => candidate.kind === "directed" && candidate.source === parent && candidate.target === id);
      if (!edge) continue;
      const edgeMechanism = normalizeEdgeMechanism(spec.edges[edge.id]);
      if (!edgeMechanism.enabled) continue;
      const fn = compileEdgeFn(edgeMechanism);
      const pIdx = index.get(parent) ?? 0;
      if (edgeMechanism.kind === "absorbing") { absorbParents.push(pIdx); absorbFns.push(fn); }
      else { edgeParents.push(pIdx); edgeFns.push(fn); }
    }
    plan.push({ id, out, binary, count, ordinal, ordinalThr, categorical, catLevels, isRoot: false, rootSampler: identity, binaryNonBernoulliRoot: false, intercept: mechanism.intercept, edgeParents, edgeFns, absorbParents, absorbFns, interactions: mechanism.interactions.map((interaction) => compileInteractionFn(interaction, index)), noiseSampler: compileDistributionSampler(mechanism.noise), riskFn, combineFn: link, variable });
  }
  return { plan, index };
}

type CompiledIntervention = (ctx: { nodeId: string; sampleIndex: number; values: Record<string, number>; variable: VariableModel }) => number | null | undefined;

// The hot loop. `out[i]` holds node i's N draws; mirrors the interpreted loops draw-for-draw.
export function runCompiledForward(compiled: CompiledModel, spec: SimulationSpec, rng: () => number, sampleCount: number, intervention?: CompiledIntervention): { samples: Record<string, number[]>; lastValues: Record<string, number> } {
  const plan = compiled.plan;
  const numNodes = plan.length;
  const vals = new Float64Array(numNodes);
  const out: number[][] = plan.map(() => new Array<number>(sampleCount));
  const overrideVal = new Float64Array(numNodes).fill(Number.NaN);
  for (let i = 0; i < numNodes; i += 1) {
    const node = plan[i]!;
    if (Object.hasOwn(spec.overrides, node.id)) overrideVal[i] = node.variable.valueType === "binary" ? coerceBinary(spec.overrides[node.id] ?? 0) : (spec.overrides[node.id] ?? 0);
  }
  const valuesRecord: Record<string, number> = {};
  for (let s = 0; s < sampleCount; s += 1) {
    for (let i = 0; i < numNodes; i += 1) {
      const n = plan[i]!;
      let v: number;
      if (intervention) {
        const intervened = intervention({ nodeId: n.id, sampleIndex: s, values: valuesRecord, variable: n.variable });
        if (intervened !== null && intervened !== undefined) {
          v = n.variable.valueType === "binary" ? coerceBinary(intervened) : intervened;
          vals[i] = v; out[i]![s] = v; valuesRecord[n.id] = v; continue;
        }
      }
      if (!Number.isNaN(overrideVal[i])) {
        v = overrideVal[i]!;
      } else if (n.isRoot) {
        v = n.rootSampler(rng);
        if (n.binaryNonBernoulliRoot) v = coerceBinary(v);
      } else {
        let eta = n.intercept;
        const ep = n.edgeParents; const ef = n.edgeFns;
        for (let k = 0; k < ep.length; k += 1) eta += ef[k]!(vals[ep[k]!]!);
        let interactionSum = 0;
        const ix = n.interactions;
        for (let j = 0; j < ix.length; j += 1) interactionSum += ix[j]!(vals);
        const noise = n.noiseSampler(rng);
        eta = eta + (interactionSum + noise);
        if (n.binary) {
          const laterRisk = n.riskFn(eta);
          let pNoEvent = 1;
          const ap = n.absorbParents; const af = n.absorbFns;
          for (let a = 0; a < ap.length; a += 1) pNoEvent *= 1 - clamp01(af[a]!(vals[ap[a]!]!));
          const p = (1 - pNoEvent) + pNoEvent * laterRisk;
          v = Math.floor(rng() + p);
        } else if (n.count) {
          v = sampleDistribution({ kind: "poisson", lambda: Math.max(0, n.combineFn(eta)) }, rng);
        } else if (n.ordinal) {
          const u = rng();
          let level = n.ordinalThr.length;
          for (let k = 0; k < n.ordinalThr.length; k += 1) { if (u <= sigmoid((n.ordinalThr[k] ?? 0) - eta)) { level = k; break; } }
          v = level;
        } else if (n.categorical) {
          const K = n.catLevels;
          const center = (K - 1) / 2;
          const scale = Math.max(1, center);
          const exps: number[] = [];
          let maxU = -Infinity;
          for (let k = 0; k < K; k += 1) { const u = eta * ((k - center) / scale); if (u > maxU) maxU = u; exps.push(u); }
          let total = 0;
          for (let k = 0; k < K; k += 1) { exps[k] = Math.exp(exps[k]! - maxU); total += exps[k]!; }
          const uu = rng();
          let cum = 0;
          let level = K - 1;
          for (let k = 0; k < K; k += 1) { cum += exps[k]! / total; if (uu <= cum) { level = k; break; } }
          v = level;
        } else {
          v = n.combineFn(eta);
        }
      }
      vals[i] = v; out[i]![s] = v; valuesRecord[n.id] = v;
    }
  }
  const samples: Record<string, number[]> = {};
  const lastValues: Record<string, number> = {};
  for (let i = 0; i < numNodes; i += 1) { samples[plan[i]!.id] = out[i]!; lastValues[plan[i]!.id] = out[i]![sampleCount - 1] ?? 0; }
  return { samples, lastValues };
}
