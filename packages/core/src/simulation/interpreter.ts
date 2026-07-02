import { datasetRows } from "../datasets";
import { sampleDistribution } from "../distributions";
import type {
  EdgeMechanism,
  NodeDistribution,
  NodeInteraction,
  NodeMechanism,
  VariableModel
} from "../types";
import { probit, standardNormalCdf } from "./math";
import { sigmoid } from "../stats/links";
import { clamp01, coerceBinary } from "../stats/util";

// Re-export the canonical link / clamp helpers under their historical names so the
// simulation barrel (and existing importers) keep resolving them.
export { sigmoid, clamp01, coerceBinary };

// Ordinal (proportional-odds) cutpoints: K-1 ascending thresholds on the η scale. Uses the node's
// own thresholds when it carries the right count, else evenly-probable defaults (logistic quantiles,
// so the K categories are equiprobable at η = 0).
export function ordinalThresholds(levels: number, provided: number[]): number[] {
  const K = Math.max(2, Math.floor(levels) || 2);
  if (provided.length === K - 1) return provided;
  return Array.from({ length: K - 1 }, (_, k) => Math.log((k + 1) / (K - k - 1)));
}

export interface StructuralContribution {
  value: number;
  absorbing: boolean;
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
    case "table_lookup":
      return tableLookup(parentValue, mechanism);
    case "linear":
      return mechanism.coefficient * parentValue;
  }
}

// Plasmode: read the embedded dataset row selected by the (floored) parent row-index, column
// dataColumn. Wraps the index into range so any uniform source over [0, rows) lands on a row.
function tableLookup(parentValue: number, mechanism: EdgeMechanism): number {
  const rows = datasetRows(mechanism.dataset);
  if (rows.length === 0) return 0;
  const index = ((Math.floor(parentValue) % rows.length) + rows.length) % rows.length;
  return rows[index]?.[mechanism.dataColumn ?? 0] ?? 0;
}

export function interactionContribution(values: Record<string, number>, mechanism: NodeMechanism): number {
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

export function sampleRootValue(distribution: NodeDistribution, variable: VariableModel, rng: () => number, forceDraw = false): number {
  if (variable.valueType !== "binary") return sampleDistribution(distribution, rng);
  if (distribution.kind === "bernoulli") {
    return !forceDraw && variable.simulation.mode === "expected_value" ? distribution.p : sampleDistribution(distribution, rng);
  }
  return coerceBinary(sampleDistribution(distribution, rng));
}

export function finalizeNodeValue(value: number, mechanism: NodeMechanism, variable: VariableModel, contributions: StructuralContribution[], leakTerm: number, rng: () => number, forceDraw = false): number {
  // Gaussian copula: η (= value, built from latent-Gaussian parents + noise) is mapped through
  // Φ then the node's target marginal — deterministic given η, for both continuous and binary
  // marginals (so the cross-covariate correlation carried by the shared latent is preserved).
  if (mechanism.combiner === "copula_marginal") {
    return inverseMarginalCdf(mechanism.distribution, standardNormalCdf(value));
  }
  const regularContributions = contributions.filter((contribution) => !contribution.absorbing).map((contribution) => contribution.value);
  // Count family: the combiner is the (log) link giving the mean λ = link(η); draw a Poisson.
  // expected_value mode returns λ, matching how binary returns its probability.
  if (variable.valueType === "count") {
    const lambda = Math.max(0, applyCombiner(value, mechanism, regularContributions, leakTerm));
    if (!forceDraw && variable.simulation.mode === "expected_value") return lambda;
    return sampleDistribution({ kind: "poisson", lambda }, rng);
  }
  // Ordinal family: ordered/cumulative logit. η is the linear predictor; P(Y≤k) = σ(θ_k − η).
  // A single uniform draw walks the thresholds to pick the level (0..K-1).
  if (variable.valueType === "ordinal") {
    const thresholds = ordinalThresholds(variable.responseFamily.levels, variable.responseFamily.thresholds);
    if (!forceDraw && variable.simulation.mode === "expected_value") {
      let prev = 0;
      let expected = 0;
      for (let k = 0; k <= thresholds.length; k += 1) {
        const cdf = k < thresholds.length ? sigmoid((thresholds[k] ?? 0) - value) : 1;
        expected += k * (cdf - prev);
        prev = cdf;
      }
      return expected;
    }
    const u = rng();
    for (let k = 0; k < thresholds.length; k += 1) if (u <= sigmoid((thresholds[k] ?? 0) - value)) return k;
    return thresholds.length;
  }
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

export function softplus(value: number): number {
  if (value > 30) return value;
  if (value < -30) return Math.exp(value);
  return Math.log1p(Math.exp(value));
}

export function safeExp(value: number): number {
  return Math.exp(Math.max(-30, Math.min(30, value)));
}

export function coerceVariableValue(value: number, variable: VariableModel): number {
  return variable.valueType === "binary" ? coerceBinary(value) : value;
}

// Map a uniform u = Φ(η) to the node's target marginal (the copula inverse-CDF, F⁻¹). Covers
// the marginal kinds copula covariates use; others fall back to their mean (a no-op marginal).
function inverseMarginalCdf(distribution: NodeDistribution, u: number): number {
  const p = Math.min(1 - 1e-12, Math.max(1e-12, u));
  switch (distribution.kind) {
    case "normal": return distribution.mean + distribution.sd * probit(p);
    case "lognormal": return Math.exp(distribution.meanLog + distribution.sdLog * probit(p));
    case "uniform": return distribution.min + (distribution.max - distribution.min) * p;
    case "bernoulli": return p > 1 - distribution.p ? 1 : 0;
    case "constant": return distribution.value;
    case "exponential": return -Math.log(1 - p) / Math.max(distribution.rate, Number.EPSILON);
    case "laplace": {
      const m = distribution.mean, b = distribution.scale;
      return p < 0.5 ? m + b * Math.log(2 * p) : m - b * Math.log(2 * (1 - p));
    }
    default:
      // poisson / beta / gamma / student_t: no closed-form quantile here; fall back to the mean.
      return sampleDistributionMeanFallback(distribution);
  }
}

function sampleDistributionMeanFallback(distribution: NodeDistribution): number {
  switch (distribution.kind) {
    case "poisson": return distribution.lambda;
    case "beta": return distribution.alpha / (distribution.alpha + distribution.beta);
    case "gamma": return distribution.shape * distribution.scale;
    case "student_t": return distribution.mean;
    default: return 0;
  }
}
