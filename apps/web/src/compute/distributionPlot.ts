import type {
  NodeDistribution,
  NodeMechanism,
  SimulatedAnalyticDistribution,
  SimulatedNodeState,
  VariableModel
} from "@nudagitty/core";
import { clamp, formatPercent, formatValue } from "../shared/formatting";
import { VARIABLE_TYPES } from "../app/constants";
import { compactSvgText, trimNumber } from "./format";


export function distributionPlotDomain(state: SimulatedNodeState): [number, number] | null {
  const candidates = state.empirical.samples.filter(Number.isFinite);
  if (state.empirical.min !== null) candidates.push(state.empirical.min);
  if (state.empirical.max !== null) candidates.push(state.empirical.max);
  const analytic = state.analytic;
  if (analytic) {
    const bounds = analyticDistributionBounds(analytic);
    if (bounds) candidates.push(bounds[0], bounds[1]);
  }
  if (candidates.length === 0) return null;
  let min = Math.min(...candidates);
  let max = Math.max(...candidates);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (Math.abs(max - min) < 1e-6) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

export function analyticDistributionBounds(analytic: SimulatedAnalyticDistribution): [number, number] | null {
  if (analytic.density?.kind === "truncated_normal") {
    const lower = analytic.density.lower ?? analytic.density.mean - 3.5 * analytic.density.sd;
    const upper = analytic.density.upper ?? analytic.density.mean + 3.5 * analytic.density.sd;
    return [lower, upper];
  }
  const distribution = analytic.distribution;
  const mean = analytic.mean;
  const variance = analytic.variance;
  if (distribution.kind === "constant") return [distribution.value - 1, distribution.value + 1];
  if (distribution.kind === "uniform") return [distribution.min, distribution.max];
  if (distribution.kind === "bernoulli" || distribution.kind === "beta") return [0, 1];
  if (distribution.kind === "poisson") return [0, distribution.lambda + 4 * Math.sqrt(distribution.lambda)];
  if (distribution.kind === "exponential") return [0, 5 / distribution.rate];
  if (distribution.kind === "lognormal") {
    const m = Math.exp(distribution.meanLog + (distribution.sdLog * distribution.sdLog / 2));
    const sd = Math.sqrt((Math.exp(distribution.sdLog * distribution.sdLog) - 1) * Math.exp((2 * distribution.meanLog) + (distribution.sdLog * distribution.sdLog)));
    return [Math.max(0, m - 3 * sd), m + 4 * sd];
  }
  if (distribution.kind === "gamma") return [0, distribution.shape * distribution.scale + 4 * Math.sqrt(distribution.shape * distribution.scale * distribution.scale)];
  const center = mean ?? ("mean" in distribution ? distribution.mean : 0);
  const sd = variance !== null && Number.isFinite(variance) ? Math.sqrt(Math.max(variance, 0)) : ("sd" in distribution ? distribution.sd : "scale" in distribution ? distribution.scale : 1);
  return [center - 3.5 * sd, center + 3.5 * sd];
}

export function histogram(samples: number[], domain: [number, number], binCount: number, weights: number[] = []): number[] {
  const [min, max] = domain;
  const span = max - min || 1;
  const bins = Array.from({ length: binCount }, () => 0);
  for (const [sampleIndex, sample] of samples.entries()) {
    if (!Number.isFinite(sample)) continue;
    const index = Math.min(binCount - 1, Math.max(0, Math.floor(((sample - min) / span) * binCount)));
    bins[index] = (bins[index] ?? 0) + (weights[sampleIndex] ?? 1);
  }
  return bins;
}

export function analyticDistributionPath(analytic: SimulatedAnalyticDistribution, domain: [number, number], width: number, height: number): string | null {
  const distribution = analytic.distribution;
  const [min, max] = domain;
  const span = max - min || 1;
  if (distribution.kind === "constant") {
    const x = ((distribution.value - min) / span) * width;
    return `M ${trimNumber(x)} ${height - 2} L ${trimNumber(x)} 3`;
  }
  if (distribution.kind === "uniform") {
    const x0 = ((distribution.min - min) / span) * width;
    const x1 = ((distribution.max - min) / span) * width;
    return `M ${trimNumber(Math.max(0, x0))} ${height - 5} L ${trimNumber(Math.min(width, x1))} ${height - 5}`;
  }
  const density = analyticDensity(analytic);
  if (!density) return null;
  const points = Array.from({ length: 36 }, (_, index) => {
    const t = index / 35;
    const xValue = min + t * span;
    return { x: t * width, density: density(xValue) };
  }).filter((point) => Number.isFinite(point.density) && point.density >= 0);
  if (points.length < 2) return null;
  const maxDensity = Math.max(...points.map((point) => point.density), Number.EPSILON);
  return points.map((point, index) => {
    const y = height - 2 - Math.min(height - 5, (point.density / maxDensity) * (height - 5));
    return `${index === 0 ? "M" : "L"} ${trimNumber(point.x)} ${trimNumber(y)}`;
  }).join(" ");
}

export function analyticDensity(analytic: SimulatedAnalyticDistribution): ((value: number) => number) | null {
  const density = analytic.density;
  if (density?.kind === "truncated_normal") {
    return (value) => {
      if (density.lower !== null && value < density.lower) return 0;
      if (density.upper !== null && value > density.upper) return 0;
      return normalDensity(value, density.mean, density.sd);
    };
  }
  const distribution = analytic.distribution;
  if (distribution.kind === "normal") return (value) => normalDensity(value, distribution.mean, distribution.sd);
  if (distribution.kind === "lognormal") return (value) => value <= 0 ? 0 : normalDensity(Math.log(value), distribution.meanLog, distribution.sdLog) / value;
  if (distribution.kind === "laplace") return (value) => Math.exp(-Math.abs(value - distribution.mean) / distribution.scale) / (2 * distribution.scale);
  if (distribution.kind === "exponential") return (value) => value < 0 ? 0 : distribution.rate * Math.exp(-distribution.rate * value);
  if (distribution.kind === "student_t") return (value) => normalDensity(value, distribution.mean, distribution.scale * Math.sqrt(distribution.df / Math.max(1, distribution.df - 2)));
  if (distribution.kind === "gamma") {
    const mean = distribution.shape * distribution.scale;
    const sd = Math.sqrt(distribution.shape * distribution.scale * distribution.scale);
    return (value) => value < 0 ? 0 : normalDensity(value, mean, sd);
  }
  return null;
}

export function normalDensity(value: number, mean: number, sd: number): number {
  const cleanSd = Math.max(sd, Number.EPSILON);
  const z = (value - mean) / cleanSd;
  return Math.exp(-0.5 * z * z) / (cleanSd * Math.sqrt(2 * Math.PI));
}

export function distributionLabel(distribution: NodeDistribution): string {
  if (distribution.kind === "constant") return `constant ${formatValue(distribution.value)}`;
  if (distribution.kind === "normal") return `Normal(${formatValue(distribution.mean)}, ${formatValue(distribution.sd)})`;
  if (distribution.kind === "lognormal") return `Lognormal(${formatValue(distribution.meanLog)}, ${formatValue(distribution.sdLog)})`;
  if (distribution.kind === "uniform") return `Uniform(${formatValue(distribution.min)}, ${formatValue(distribution.max)})`;
  if (distribution.kind === "bernoulli") return `Bernoulli(${formatValue(distribution.p)})`;
  if (distribution.kind === "poisson") return `Poisson(${formatValue(distribution.lambda)})`;
  if (distribution.kind === "beta") return `Beta(${formatValue(distribution.alpha)}, ${formatValue(distribution.beta)})`;
  if (distribution.kind === "laplace") return `Laplace(${formatValue(distribution.mean)}, ${formatValue(distribution.scale)})`;
  if (distribution.kind === "student_t") return `Student-t(${formatValue(distribution.mean)}, ${formatValue(distribution.scale)}, ${formatValue(distribution.df)})`;
  if (distribution.kind === "gamma") return `Gamma(${formatValue(distribution.shape)}, ${formatValue(distribution.scale)})`;
  if (distribution.kind === "categorical") return `Categorical(${distribution.weights.length} levels)`;
  return `Exponential(${formatValue(distribution.rate)})`;
}

export function analyticDistributionLabel(analytic: SimulatedAnalyticDistribution): string {
  if (analytic.density?.kind === "truncated_normal") {
    const lower = analytic.density.lower === null ? "-inf" : formatValue(analytic.density.lower);
    const upper = analytic.density.upper === null ? "inf" : formatValue(analytic.density.upper);
    return `truncated Normal(${formatValue(analytic.density.mean)}, ${formatValue(analytic.density.sd)}, ${lower}..${upper})`;
  }
  return distributionLabel(analytic.distribution);
}

export function distributionParameterLabel(distribution: NodeDistribution): string {
  if (distribution.kind === "constant") return `Constant value=${formatValue(distribution.value)}`;
  if (distribution.kind === "normal") return `Normal mean=${formatValue(distribution.mean)} sd=${formatValue(distribution.sd)}`;
  if (distribution.kind === "lognormal") return `Lognormal logmean=${formatValue(distribution.meanLog)} logsd=${formatValue(distribution.sdLog)}`;
  if (distribution.kind === "uniform") return `Uniform min=${formatValue(distribution.min)} max=${formatValue(distribution.max)}`;
  if (distribution.kind === "bernoulli") return `Bernoulli p=${formatValue(distribution.p)}`;
  if (distribution.kind === "poisson") return `Poisson lambda=${formatValue(distribution.lambda)}`;
  if (distribution.kind === "beta") return `Beta alpha=${formatValue(distribution.alpha)} beta=${formatValue(distribution.beta)}`;
  if (distribution.kind === "laplace") return `Laplace mean=${formatValue(distribution.mean)} scale=${formatValue(distribution.scale)}`;
  if (distribution.kind === "student_t") return `Student-t mean=${formatValue(distribution.mean)} scale=${formatValue(distribution.scale)} df=${formatValue(distribution.df)}`;
  if (distribution.kind === "gamma") return `Gamma shape=${formatValue(distribution.shape)} scale=${formatValue(distribution.scale)}`;
  if (distribution.kind === "categorical") return `Categorical ${distribution.weights.length} levels`;
  return `Exponential rate=${formatValue(distribution.rate)}`;
}

export function nodeMomentLabel(state: SimulatedNodeState | undefined): string {
  const mean = state?.analytic?.mean ?? state?.empirical.mean;
  const variance = state?.analytic?.variance ?? state?.empirical.variance;
  if (mean === null || mean === undefined || !Number.isFinite(mean)) return "";
  const sd = variance !== null && variance !== undefined && Number.isFinite(variance) ? Math.sqrt(Math.max(0, variance)) : null;
  return sd === null ? `mean ${formatValue(mean)}` : `mean ${formatValue(mean)} sd ${formatValue(sd)}`;
}

export function defaultDistribution(kind: NodeDistribution["kind"]): NodeDistribution {
  if (kind === "normal") return { kind, mean: 0, sd: 1 };
  if (kind === "lognormal") return { kind, meanLog: 0, sdLog: 1 };
  if (kind === "uniform") return { kind, min: 0, max: 1 };
  if (kind === "bernoulli") return { kind, p: 0.5 };
  if (kind === "poisson") return { kind, lambda: 1 };
  if (kind === "beta") return { kind, alpha: 2, beta: 2 };
  if (kind === "laplace") return { kind, mean: 0, scale: 1 };
  if (kind === "student_t") return { kind, mean: 0, scale: 1, df: 5 };
  if (kind === "gamma") return { kind, shape: 2, scale: 1 };
  if (kind === "exponential") return { kind, rate: 1 };
  if (kind === "categorical") return { kind, weights: [1, 1, 1] };
  return { kind: "constant", value: 0 };
}

export function inferValueTypeFromMechanism(isRoot: boolean, mechanism: NodeMechanism, fallback: VariableModel["valueType"]): VariableModel["valueType"] {
  if (!isRoot) {
    if (mechanism.combiner === "bernoulli_logit" || mechanism.combiner === "noisy_or") return "binary";
    if (mechanism.combiner === "poisson_log") return "count";
    if (mechanism.combiner === "gamma_log" || mechanism.combiner === "positive_softplus") return "positive";
    if (mechanism.combiner === "bounded_logistic") return "proportion";
  }
  return valueTypeFromDistribution(isRoot ? mechanism.distribution : mechanism.noise, fallback);
}

export function valueTypeFromDistribution(distribution: NodeDistribution, fallback: VariableModel["valueType"]): VariableModel["valueType"] {
  if (distribution.kind === "bernoulli") return "binary";
  if (distribution.kind === "poisson") return "count";
  if (distribution.kind === "beta") return "proportion";
  if (distribution.kind === "gamma" || distribution.kind === "exponential" || distribution.kind === "lognormal") return "positive";
  if (distribution.kind === "normal" || distribution.kind === "uniform" || distribution.kind === "laplace" || distribution.kind === "student_t") return "continuous";
  return fallback;
}

export function valueTypeLabel(valueType: VariableModel["valueType"]): string {
  return VARIABLE_TYPES.find(([id]) => id === valueType)?.[1] ?? valueType;
}

export function isBinaryDistributionState(state: SimulatedNodeState | undefined, variable: VariableModel): boolean {
  return variable.valueType === "binary" || state?.analytic?.distribution.kind === "bernoulli";
}

export function binaryProbabilitySummary(state: SimulatedNodeState | undefined): string {
  const probability = binaryProbabilityFromState(state);
  return probability === null ? "" : `P(1) ${formatPercent(probability)}`;
}

export function binaryProbabilityFromState(state: SimulatedNodeState | undefined): number | null {
  if (!state) return null;
  const analytic = state.analytic;
  if (analytic?.distribution.kind === "bernoulli") return clamp(analytic.distribution.p, 0, 1);
  if (analytic?.mean !== null && analytic?.mean !== undefined && Number.isFinite(analytic.mean)) return clamp(analytic.mean, 0, 1);
  if (state.empirical.mean !== null && Number.isFinite(state.empirical.mean)) return clamp(state.empirical.mean, 0, 1);
  return null;
}

export function nodeDistributionAnnotationLines(state: SimulatedNodeState | undefined, variable: VariableModel): string[] {
  if (isBinaryDistributionState(state, variable)) {
    const lines: string[] = [];
    const probability = binaryProbabilityFromState(state);
    if (probability !== null) lines.push(`P(1) ${formatPercent(probability)}`);
    return lines.map((line) => compactSvgText(line, 28)).slice(0, 1);
  }
  const lines: string[] = [];
  const moment = nodeMomentLabel(state);
  if (moment) lines.push(moment);
  return lines.map((line) => compactSvgText(line, 28)).slice(0, 2);
}

export function nodeDistributionFullSummary(state: SimulatedNodeState | undefined, variable: VariableModel): string {
  const binary = isBinaryDistributionState(state, variable);
  return [
    binary ? binaryProbabilitySummary(state) : nodeMomentLabel(state),
    state?.analytic ? distributionParameterLabel(state.analytic.distribution) : "",
    state?.analytic ? `analytic ${analyticDistributionLabel(state.analytic)}` : "",
    state?.empirical.effectiveSampleSize !== null && state?.empirical.effectiveSampleSize !== undefined ? `ESS ${formatValue(state.empirical.effectiveSampleSize)}` : ""
  ].filter(Boolean).join("; ");
}
