import type { SimulationResult } from "@nudagitty/core";
import { binnedBinaryRiskSummaries, type RiskBin, type ScatterPoint } from "../charts/CategoryOutcomePlot";
import { coerceBinary } from "../shared/formatting";

export type StratumRisk = {
  label: string;
  // the binary value of the conditioning variable for this stratum; null for the crude/all row
  stratumValue: number | null;
  weight: number;
  share: number;
  // overall binary-outcome rate in the stratum
  outcomeRate: number;
  bins: RiskBin[];
};

export type StratifiedRiskContrast = {
  crude: StratumRisk;
  strata: StratumRisk[];
  // backdoor-standardized risk curve over the conditioning variable (the "adjust" estimand),
  // computed on the crude band edges so it is comparable band-for-band with the crude curve
  standardized: RiskBin[];
  conditioningId: string;
};

type Row = { x: number; y: number; s: number; w: number };

// Partition the UNCONDITIONED simulation by a binary conditioning variable and report the
// continuous-exposure -> binary-outcome risk curve for the crude ("all") sample, each
// stratum (S=0, S=1 -> select / condition), and the backdoor-standardized combination
// (adjust). For a collider the standardized curve diverges from the crude one: that gap is
// the bias introduced by adjusting for it.
export function stratifyRiskCurves(
  unconditioned: SimulationResult,
  exposureId: string,
  outcomeId: string,
  conditioningId: string,
  binCount = 7
): StratifiedRiskContrast | null {
  const xState = unconditioned.nodeStates[exposureId];
  const yState = unconditioned.nodeStates[outcomeId];
  const sState = unconditioned.nodeStates[conditioningId];
  if (!xState || !yState || !sState) return null;
  const xs = xState.empirical.samples;
  const ys = yState.empirical.samples;
  const ss = sState.empirical.samples;
  const n = Math.min(xs.length, ys.length, ss.length);
  if (n === 0) return null;
  const rows: Row[] = [];
  for (let i = 0; i < n; i += 1) {
    const x = xs[i];
    const y = ys[i];
    const s = ss[i];
    if (x === undefined || y === undefined || s === undefined) continue;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(s)) continue;
    const w = xState.empirical.weights[i] ?? yState.empirical.weights[i] ?? 1;
    rows.push({ x, y, s: coerceBinary(s), w });
  }
  if (rows.length === 0) return null;

  const points = (subset: Row[]): ScatterPoint[] => subset.map((r, index) => ({ x: r.x, y: r.y, weight: r.w, index }));
  const summarize = (label: string, stratumValue: number | null, subset: Row[]): StratumRisk => {
    const weight = subset.reduce((sum, r) => sum + r.w, 0);
    const success = subset.reduce((sum, r) => sum + coerceBinary(r.y) * r.w, 0);
    return {
      label,
      stratumValue,
      weight,
      share: 0, // filled in below against the crude total
      outcomeRate: weight > 0 ? success / weight : NaN,
      bins: binnedBinaryRiskSummaries(points(subset), binCount)
    };
  };

  const total = rows.reduce((sum, r) => sum + r.w, 0);
  const crude = summarize("all", null, rows);
  crude.share = 1;
  const values = [...new Set(rows.map((r) => r.s))].sort((a, b) => a - b);
  const strata = values.map((value) => {
    const stratum = summarize(`${conditioningId} = ${value}`, value, rows.filter((r) => r.s === value));
    stratum.share = total > 0 ? stratum.weight / total : 0;
    return stratum;
  });

  // Standardize on the crude band edges: within each crude band, weight the per-stratum
  // outcome rate by the marginal P(stratum).
  const standardized: RiskBin[] = crude.bins.map((band) => {
    const inBand = (r: Row) => r.x >= band.loEdge && (band.hiEdge === null || r.x < band.hiEdge);
    let standardizedMean = 0;
    let usedWeight = 0;
    for (const stratum of strata) {
      const cell = rows.filter((r) => r.s === stratum.stratumValue && inBand(r));
      const cellWeight = cell.reduce((sum, r) => sum + r.w, 0);
      if (cellWeight <= 0) continue;
      const cellRate = cell.reduce((sum, r) => sum + coerceBinary(r.y) * r.w, 0) / cellWeight;
      standardizedMean += stratum.share * cellRate;
      usedWeight += stratum.share;
    }
    return {
      ...band,
      // renormalize if a stratum had no support in this band (positivity violation)
      mean: usedWeight > 0 ? standardizedMean / usedWeight : band.mean,
      lower: null,
      upper: null
    };
  });

  return { crude, strata, standardized, conditioningId };
}
