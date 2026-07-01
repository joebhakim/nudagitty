import type { GMethodEstimate, GMethodsComparison, IvEstimate, SurvivalCurvePoint } from "@nudagitty/core";
import type { CategoryOutcomeSummary, ScatterPoint } from "../../charts/CategoryOutcomePlot";
import type { CompletedOutputModule } from "../types";

export type SimpsonCompletedOutput = {
  crudeTreatedRecovery: number;
  crudeUntreatedRecovery: number;
  crudeDiff: number;
  causalTreatedRecovery: number;
  causalUntreatedRecovery: number;
  causalDiff: number;
  treatedSeverity: number;
  untreatedSeverity: number;
  severityDiff: number;
  adjustmentSet: string;
  visualRead: string;
  paradox: string;
  conclusion: string;
  severityAdjusted: boolean;
};

export type IcuCompletedOutput = {
  crudeIcuMortality: number;
  crudeWardMortality: number;
  crudeDiff: number;
  causalIcuMortality: number;
  causalWardMortality: number;
  causalDiff: number;
  icuSeverity: number;
  wardSeverity: number;
  severityDiff: number;
  icuTriage: number;
  wardTriage: number;
  triageDiff: number;
  adjustmentSet: string;
  visualRead: string;
  colliderWarning: string;
  verdict: string;
  conclusion: string;
};

export type CollegeCompletedOutput = {
  crudeCollegeEarnings: number;
  crudeNoCollegeEarnings: number;
  crudePremium: number;
  causalCollegeEarnings: number;
  causalNoCollegeEarnings: number;
  causalPremium: number;
  collegeFamilyIncome: number;
  noCollegeFamilyIncome: number;
  incomeDiff: number;
  adjustmentSet: string;
  visualRead: string;
  verdict: string;
  conclusion: string;
  binnedBins: CollegeBinnedAdjustmentBin[];
  binnedPremium: number | null;
  earningsDomain: [number, number];
};

export type CollegeBinnedAdjustmentBin = {
  index: number;
  label: string;
  lower: number;
  upper: number;
  weight: number;
  collegeCount: number;
  noCollegeCount: number;
  collegeEarnings: number | null;
  noCollegeEarnings: number | null;
  gap: number | null;
  collegeSamples: number[];
  noCollegeSamples: number[];
  warning: string | null;
};

export type TutoringCompletedOutput = {
  crudeTutoredScore: number;
  crudeUntutoredScore: number;
  crudeGap: number;
  causalTutoredScore: number;
  causalUntutoredScore: number;
  causalGap: number;
  tutoredNeed: number;
  untutoredNeed: number;
  needDiff: number;
  adjustmentSet: string;
  visualRead: string;
  verdict: string;
  conclusion: string;
  academicNeedAdjusted: boolean;
  adjustedPairs: TutoringAdjustedPair[];
  adjustedPairGap: number | null;
  scoreDomain: [number, number];
};

export type TutoringAdjustedPair = {
  needValue: 0 | 1;
  label: string;
  weight: number;
  tutoredScore: number;
  untutoredScore: number;
  gap: number;
  tutoredSamples: number[];
  untutoredSamples: number[];
};

export type HuhMetric = {
  label: string;
  value: string;
  detail: string;
  numericValue?: number;
  lower?: number;
  upper?: number;
};

// The contrast at the heart of a paradox card: a naive observed estimate versus
// the corrected causal estimate of the SAME quantity. Replaces the old, ambiguous
// "before / after" plot (which just charted metrics[0] vs metrics[1], even when
// those were unrelated quantities).
export type HuhShiftRow = { label: string; sublabel?: string; value: string; numeric: number; lower?: number; upper?: number };
export type HuhShift = {
  title: string;
  axisLabel: string;
  caption: string;
  observed: HuhShiftRow;
  causal: HuhShiftRow;
};

export type HuhCompletedOutput = {
  badge: string;
  conclusion: string;
  metrics: HuhMetric[];
  bullets: Array<{ label: string; text: string }>;
  shift?: HuhShift;
  // When true, each bullet renders as its own collapsible .output-box (used by the structural
  // diagnosis so Estimand / Structure / Recommendation match the other adjusted-output cards)
  // instead of a single narrative bullet list.
  bulletsAsBoxes?: boolean;
};

export type WhatIfOutputScale = "risk" | "mean";
export type WhatIfOutputView = "generic" | "survival" | "dynamic" | "g_estimation" | "ipcw" | "survival_time";

export type WhatIfStrategySurvivalSummary = {
  strategyId: string;
  label: string;
  points: SurvivalCurvePoint[];
  finalRisk: number | null;
  finalSurvival: number | null;
  totalEvents: number;
  totalCensored: number;
  sampleSize: number;
  effectiveSampleSize: number | null;
};

export type WhatIfSurvivalSummary = {
  label: string;
  strategies: WhatIfStrategySurvivalSummary[];
  natural: WhatIfStrategySurvivalSummary | null;
  riskDifference: number | null;
  survivalDifference: number | null;
  // Per-method strategy curves (g_formula = re-sim, naive = crude KM, ipw = IPCW KM).
  // The dropdown picks one; methods without a distinct curve fall back to g_formula.
  curvesByMethod: Partial<Record<GMethodEstimate["id"], WhatIfStrategySurvivalSummary[]>>;
};

export type WhatIfAdvancedOutput = {
  badge: string;
  title: string;
  view: WhatIfOutputView;
  denominatorsOpen: boolean;
  comparison: GMethodsComparison | null;
  survival: WhatIfSurvivalSummary | null;
  conclusion: string;
  outcomeScale: WhatIfOutputScale;
  outcomeUnit: string;
  source: string;
  sourceUrl: string;
  sourceDetail: string;
};

export type BasicOutputPunchlineMetric = {
  label: string;
  value: string;
  detail: string;
  numericValue: number | null;
  lower?: number;
  upper?: number;
};

export type BasicOutputPunchline = {
  badge: string;
  title: string;
  observed: BasicOutputPunchlineMetric;
  comparison: BasicOutputPunchlineMetric;
  note: string;
};

export type ComputedCompletedOutput = {
  moduleId: string;
  module: CompletedOutputModule<unknown>;
  result: unknown | null;
};

export type ModeratorFacet = { id: string; title: string; color: string; effect: number | null; points: ScatterPoint[]; summaries: CategoryOutcomeSummary[] };
export type ModeratorEffectOutput = {
  treatmentLabel: string;
  moderatorLabel: string;
  outcomeLabel: string;
  outcomeUnit: string;
  binary: boolean;
  facets: ModeratorFacet[];
  marginalEffect: number | null;
  crossover: boolean;
  ordinal: boolean;
};

export type InstrumentOutput = {
  instrumentLabel: string;
  treatmentLabel: string;
  outcomeLabel: string;
  binaryOutcome: boolean;
  binaryTreatment: boolean;
  reducedFormSummaries: CategoryOutcomeSummary[];
  firstStageSummaries: CategoryOutcomeSummary[];
  reducedFormPoints: ScatterPoint[];
  firstStagePoints: ScatterPoint[];
  reducedFormDomain: [number, number];
  firstStageDomain: [number, number];
  iv: IvEstimate;
  oracle: number | null;
};
