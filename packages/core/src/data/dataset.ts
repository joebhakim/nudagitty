// Schema for an embedded canonical causal-inference dataset. `rows` is a dense numeric matrix
// (categoricals coded as integers); `columns` names every column. The role fields say how the
// columns are used: `covariates` are the pre-treatment L (the only part plasmode needs), and the
// optional ground-truth fields (present for semi-synthetic / both-potential-outcome datasets) let
// an example grade estimators against the ACTUAL truth instead of a DGP we imposed.
export interface CovariateDataset {
  name: string;
  source: string;
  columns: string[];
  rows: number[][];
  /** Pre-treatment covariate columns (the L vector a plasmode source resamples). */
  covariates: string[];
  /** Observed treatment column (0/1), if the dataset carries one. */
  treatment?: string;
  /** Observed (factual) outcome column, if present. */
  outcome?: string;
  /** [Y(0), Y(1)] columns when both potential outcomes are available (IHDP sim, Twins co-twin). */
  potentialOutcomes?: [string, string];
  /** Known true average treatment effect, when the dataset provides one. */
  trueAte?: number;
  /** Column flagging an experimental (RCT) subsample, e.g. LaLonde's NSW units (1 = RCT). */
  experimentalFlag?: string;
}
