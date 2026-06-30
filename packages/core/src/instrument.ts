import type { GraphModel } from "./types";

// Instrumental-variable estimation (Wald / 2SLS) and structural candidate-IV detection.
//
// For a binary instrument Z, treatment A, outcome Y with no covariates:
//   first stage  = E[A | Z=1] − E[A | Z=0]
//   reduced form = E[Y | Z=1] − E[Y | Z=0]
//   Wald (LATE)  = reduced form ÷ first stage
// 2SLS with a single instrument and no covariates equals the Wald ratio exactly; we also compute it as
// Cov(Z,Y)/Cov(Z,A) so the same number generalises to a non-binary instrument. The point of IV: under the
// exclusion + independence assumptions, this recovers the causal effect of A on Y even when an unmeasured
// confounder makes the naive E[Y|A=1]−E[Y|A=0] contrast biased.

export interface IvEstimate {
  instrument: string;
  treatment: string;
  outcome: string;
  cells: { aGivenZ0: number; aGivenZ1: number; yGivenZ0: number; yGivenZ1: number };
  firstStage: number;
  reducedForm: number;
  wald: number | null;
  twoSLS: number | null;
  naive: number | null; // the confounded observational contrast, for comparison
  weakInstrument: boolean;
  sampleSize: number;
}

const WEAK_INSTRUMENT_THRESHOLD = 0.1;

function weightedMean(values: number[], weights: number[]): number | null {
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    const w = weights[i] ?? 1;
    if (value === undefined || !Number.isFinite(value) || w <= 0) continue;
    sum += value * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : null;
}

export function estimateInstrument(
  rows: Array<Record<string, number>>,
  weights: number[],
  spec: { instrument: string; treatment: string; outcome: string }
): IvEstimate | null {
  const { instrument, treatment, outcome } = spec;
  const zs: number[] = [];
  const as_: number[] = [];
  const ys: number[] = [];
  const ws: number[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    const z = row[instrument];
    const a = row[treatment];
    const y = row[outcome];
    if (z === undefined || a === undefined || y === undefined || !Number.isFinite(z) || !Number.isFinite(a) || !Number.isFinite(y)) continue;
    zs.push(z); as_.push(a); ys.push(y); ws.push(Math.max(0, weights[i] ?? 1));
  }
  if (zs.length === 0) return null;

  // By-instrument cells (binary Z via rounding) → first stage and reduced form.
  const lo: number[] = [];
  const hi: number[] = [];
  zs.forEach((z, i) => (Math.round(z) >= 1 ? hi : lo).push(i));
  const cell = (idx: number[], arr: number[]) => weightedMean(idx.map((i) => arr[i]!), idx.map((i) => ws[i]!));
  const aGivenZ0 = cell(lo, as_);
  const aGivenZ1 = cell(hi, as_);
  const yGivenZ0 = cell(lo, ys);
  const yGivenZ1 = cell(hi, ys);
  const firstStage = aGivenZ1 !== null && aGivenZ0 !== null ? aGivenZ1 - aGivenZ0 : NaN;
  const reducedForm = yGivenZ1 !== null && yGivenZ0 !== null ? yGivenZ1 - yGivenZ0 : NaN;
  const wald = Number.isFinite(firstStage) && Math.abs(firstStage) > 1e-9 ? reducedForm / firstStage : null;

  // 2SLS via covariances (general): Cov(Z,Y) / Cov(Z,A).
  const zbar = weightedMean(zs, ws);
  const abar = weightedMean(as_, ws);
  const ybar = weightedMean(ys, ws);
  let covZA = 0;
  let covZY = 0;
  if (zbar !== null && abar !== null && ybar !== null) {
    for (let i = 0; i < zs.length; i += 1) {
      const w = ws[i]!;
      covZA += w * (zs[i]! - zbar) * (as_[i]! - abar);
      covZY += w * (zs[i]! - zbar) * (ys[i]! - ybar);
    }
  }
  const twoSLS = Math.abs(covZA) > 1e-12 ? covZY / covZA : null;

  // Naive (confounded) observational contrast E[Y|A=1] − E[Y|A=0].
  const aLo: number[] = [];
  const aHi: number[] = [];
  as_.forEach((a, i) => (Math.round(a) >= 1 ? aHi : aLo).push(i));
  const yGivenA0 = cell(aLo, ys);
  const yGivenA1 = cell(aHi, ys);
  const naive = yGivenA1 !== null && yGivenA0 !== null ? yGivenA1 - yGivenA0 : null;

  return {
    instrument,
    treatment,
    outcome,
    cells: { aGivenZ0: aGivenZ0 ?? NaN, aGivenZ1: aGivenZ1 ?? NaN, yGivenZ0: yGivenZ0 ?? NaN, yGivenZ1: yGivenZ1 ?? NaN },
    firstStage,
    reducedForm,
    wald,
    twoSLS,
    naive,
    weakInstrument: !Number.isFinite(firstStage) || Math.abs(firstStage) < WEAK_INSTRUMENT_THRESHOLD,
    sampleSize: zs.length
  };
}

// Structural candidate-IV detection — advisory only ("this could be an IV"). A node is flagged when it
// plausibly satisfies the IV graph: it feeds the exposure (relevance), has no direct edge to the outcome
// (exclusion plausible), and is a root with no parents (no shared cause with the outcome → independence).
// The user still assigns the instrument role; nothing is auto-assigned.
export function candidateInstruments(graph: GraphModel): string[] {
  const exposureIds = graph.nodes.filter((node) => node.roles.exposure).map((node) => node.id);
  const outcomeIds = graph.nodes.filter((node) => node.roles.outcome).map((node) => node.id);
  if (exposureIds.length === 0 || outcomeIds.length === 0) return [];
  const directed = graph.edges.filter((edge) => edge.kind === "directed");
  const hasParent = (id: string) => directed.some((edge) => edge.target === id);
  const flagged: string[] = [];
  for (const node of graph.nodes) {
    if (node.roles.exposure || node.roles.outcome || node.roles.adjusted || node.roles.latent || node.roles.instrument) continue;
    const feedsExposure = directed.some((edge) => edge.source === node.id && exposureIds.includes(edge.target));
    const hitsOutcome = directed.some((edge) => edge.source === node.id && outcomeIds.includes(edge.target));
    if (feedsExposure && !hitsOutcome && !hasParent(node.id)) flagged.push(node.id);
  }
  return flagged.sort();
}
