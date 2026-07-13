import type { GraphDocument, VariableValueType } from "./types";
import { normalizeVariableModel } from "./graph";
import { datasetRows } from "./datasets";
import { categoryIndicatorCandidate, nodeColumn, nodeGenerates, pointMassCandidate } from "./fitDgp";

/**
 * Guardrails: does the declared response FAMILY match the variable it claims to model?
 *
 * The engine will happily fit and simulate a family that cannot possibly have produced the data, and say
 * nothing. The worst case is not exotic — it is the DEFAULT. `lalonde-fit-recover` declares earnings
 * `continuous`, so it is fit and generated as linear + Gaussian noise, and the result is a population in
 * which **9.2% of people earn NEGATIVE money** (down to −$29,403) and **nobody earns exactly zero** —
 * against real rows where negatives are impossible and 12.4% earn exactly zero. Every downstream estimate
 * is then computed on a population that cannot exist. Nothing in the app said so.
 *
 * These checks compare two things it is cheap to have side by side:
 *   the DATA  — what the real column looks like (what is possible), and
 *   the DRAWS — what the DGP actually emits (what the model believes is possible).
 * A mismatch between them is a modelling error, not a preference. So the check is a HEURISTIC (thresholds,
 * not proofs) but the evidence it reports is a measured fact, and it always names the number that fired it.
 *
 * Deliberately a list, not a boolean — this grows. Obvious next rules: non-negative integers modelled as
 * continuous (⇒ count/Poisson); a hard upper bound in the data that the model overshoots (⇒ bounded);
 * generated mass beyond the data's support by orders of magnitude (the log-link tail).
 */
export type FamilyWarningKind =
  /** Real rows pile up at exactly 0, but the family is additive — it can reproduce neither the spike nor
   *  the floor, and will invent negatives to fit the mean. This is the two-part (Cragg) case. */
  | "zero-spike-under-additive"
  /** The DGP emits values the DATA says are impossible: negatives for a column that is never negative.
   *  The most damning one, because it is measured off the draws themselves, not inferred. */
  | "generates-impossible-negatives"
  /** The data HAS negatives but the family is log-scale (positive / semicontinuous). The fit takes
   *  log(Y) on Y>0, so those rows are silently dropped — and for two-part they are lumped in with the
   *  zeros as "did not participate", which is a different claim entirely. */
  | "negatives-under-positive-family"
  /** A PREDICTOR whose data piles up at zero. Its point mass needs its OWN regressor — no smooth basis
   *  function can represent a discontinuity, so no edge mechanism will ever do this job. Same detected fact
   *  as `zero-spike-under-additive`, different fix, selected by the variable's ROLE. */
  | "point-mass-predictor-needs-indicator"
  /** An unordered CATEGORICAL used as a predictor. A linear mechanism cannot consume one at all — there is
   *  no coefficient you can put on an unordered label. The other missing word in the vocabulary. */
  | "category-needs-dummies"
  /** The DGP emits values ORDERS OF MAGNITUDE beyond anything in the data. Not "impossible" like a negative
   *  — just absurd. This is the rule that would have caught OUR OWN bug: a log link fed dollar-valued
   *  regressors is exponential IN DOLLARS, and it built a world containing $1.6M earners against a real
   *  maximum of $121k. Every estimate underneath was computed on a population that does not exist. */
  | "generates-beyond-support";

export interface FamilyWarning {
  kind: FamilyWarningKind;
  nodeId: string;
  /** The share of rows (or draws) that triggered it — always shown, so the user judges the evidence. */
  fraction: number;
  /** The worst value seen, when there is one (e.g. the most negative value the DGP emitted). */
  extreme?: number;
  /** The family that would fix it, when there is an obvious one. */
  suggest?: VariableValueType;
}

/** Below this share we do not nag — a stray draw is not a misspecification. */
const NEGATIVE_DRAW_FLOOR = 0.005;
const ZERO_SPIKE_FLOOR = 0.02;
/** How far past the data's maximum the DGP's 99.9th percentile must go before we call it absurd. Generous
 *  on purpose: a good model should be ABLE to exceed its sample. Five-fold is not "exceeding"; it is a
 *  different world. (Our own bug was 13x, at the 99.9th percentile.) */
const BEYOND_SUPPORT_FACTOR = 5;

/**
 * @param generated The node's simulated draws, when available (`nodeStates[id].empirical.samples`). Without
 *   them the draw-based check simply does not fire — the data-based ones still do.
 */
export function familyWarnings(document: GraphDocument, nodeId: string, generated?: readonly number[]): FamilyWarning[] {
  const node = document.graph.nodes.find((n) => n.id === nodeId);
  const col = nodeColumn(document, nodeId);
  if (!node || !col) return [];   // no real column to compare against ⇒ nothing to be honest about

  const rows = datasetRows(col.dataset);
  if (rows.length < 8) return [];
  const data = rows.map((r) => r[col.dataColumn] ?? 0);
  const valueType = normalizeVariableModel(node.variable).valueType;

  const n = data.length;
  const negatives = data.filter((v) => v < 0);
  const neverNegative = negatives.length === 0;
  const zeroShare = data.filter((v) => v === 0).length / n;
  const distinct = new Set(data).size;

  const out: FamilyWarning[] = [];
  // The FAMILY rules only apply to a node that GENERATES. A plasmode covariate that replays its data column
  // IS the data — its declared family is never consulted, so it cannot be wrong. Warning about it was a
  // false positive that fired on every zero-inflated covariate in every plasmode example.
  const generates = nodeGenerates(document, nodeId);

  // 1. A zero spike under an additive family. Requires a genuinely continuous, non-negative column — a 0/1
  //    column is binary, not a spike, and a column that already goes negative has no floor to violate.
  if (generates && valueType === "continuous" && neverNegative && distinct > 3 && zeroShare >= ZERO_SPIKE_FLOOR) {
    out.push({ kind: "zero-spike-under-additive", nodeId, fraction: zeroShare, suggest: "semicontinuous" });
  }

  // 2. The DGP emits negatives for a column that is never negative. Measured off the draws — the one check
  //    that catches the failure rather than predicting it.
  if (generates && generated && generated.length >= 8 && neverNegative) {
    const bad = generated.filter((v) => v < 0);
    const fraction = bad.length / generated.length;
    if (fraction >= NEGATIVE_DRAW_FLOOR) {
      out.push({
        kind: "generates-impossible-negatives", nodeId, fraction,
        extreme: Math.min(...bad),
        // If the real column also has a zero spike the honest family is two-part; otherwise plain positive.
        suggest: zeroShare >= ZERO_SPIKE_FLOOR ? "semicontinuous" : "positive"
      });
    }
  }

  // 3. A PREDICTOR with a point mass at zero. Same evidence as rule 1 — a pile-up at exactly zero — but the
  //    fix is decided by the variable's ROLE: as an OUTCOME the answer is a two-part family (rule 1); as a
  //    PREDICTOR the answer is to give the point mass its own regressor. On LaLonde the indicator's logit
  //    coefficient is 1.94-3.26 while the dollar slope is -0.00007: the mass carries the selection signal
  //    and the amount carries none, and NO smooth transform of the column can express that discontinuity.
  const feedsSomething = document.graph.edges.some((e) => e.kind === "directed" && e.source === nodeId);
  if (feedsSomething && !node.roles?.outcome && neverNegative && zeroShare >= ZERO_SPIKE_FLOOR && distinct > 3) {
    const candidate = pointMassCandidate(document, nodeId);
    if (candidate) out.push({ kind: "point-mass-predictor-needs-indicator", nodeId, fraction: candidate.share });
  }

  // 4. The DGP emits values ORDERS OF MAGNITUDE beyond the data's support. The rule that would have caught
  //    our own $1.6M-earner bug — and it is measured off the DRAWS, so it catches the failure rather than
  //    predicting it. Deliberately generous (5x the data's max, and only above the 99.9th percentile of the
  //    draws) so a fat but plausible tail does not nag: an honest model SHOULD be able to exceed its sample.
  if (generates && generated && generated.length >= 100) {
    const dataMax = Math.max(...data);
    const sorted = [...generated].sort((a, b) => a - b);
    const p999 = sorted[Math.floor(0.999 * (sorted.length - 1))] ?? 0;
    const genMax = sorted[sorted.length - 1] ?? 0;
    // TWO conditions, so one freak draw cannot trip it and a fat-but-honest tail is left alone. Measured on
    // LaLonde earnings (data max $121,174):
    //     levels + gamma  (correct)   max $153,270 = 1.3x   p99.9 $122,141 = 1.0x   ⇒ silent
    //     log + lognormal (our bug)   max $1,571,370 = 13x  p99.9 $414,440 = 3.4x   ⇒ fires
    if (dataMax > 0 && genMax > BEYOND_SUPPORT_FACTOR * dataMax && p999 > 1.5 * dataMax) {
      out.push({
        kind: "generates-beyond-support", nodeId, extreme: genMax,
        fraction: generated.filter((v) => v > dataMax).length / generated.length
      });
    }
  }

  // 5. An unordered CATEGORY used as a predictor. Not a matter of degree like the others: a linear term
  //    cannot consume "regimen A / B / C" AT ALL. k−1 indicator nodes, most common level as the reference.
  if (feedsSomething && categoryIndicatorCandidate(document, nodeId)) {
    out.push({ kind: "category-needs-dummies", nodeId, fraction: 0 });
  }

  // 6. Negatives in the data under a log-scale family — those rows are being silently reinterpreted.
  if (generates && (valueType === "positive" || valueType === "semicontinuous") && negatives.length > 0) {
    out.push({
      kind: "negatives-under-positive-family", nodeId, fraction: negatives.length / n,
      extreme: Math.min(...negatives), suggest: "continuous"
    });
  }

  return out;
}
