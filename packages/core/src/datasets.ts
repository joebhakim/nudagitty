import type { CovariateDataset } from "./data/dataset";
import { NHEFS_COVARIATES } from "./data/nhefs";
import { NHEFS_SYNTHETIC } from "./data/nhefs-synthetic";
import { IHDP_DATASET } from "./data/ihdp";
import { TWINS_DATASET } from "./data/twins";
import { LALONDE_DATASET } from "./data/lalonde";
import { LALONDE_OBS_DATASET } from "./data/lalonde-obs";
import { LALONDE_SYNTHETIC } from "./data/lalonde-synthetic";

export type { CovariateDataset };

// Registry of embedded canonical causal-inference datasets, available for plasmode / generative
// simulation and (where they carry ground truth) for benchmark examples. The `table_lookup` edge
// mechanism resolves rows/columns from here by name. See `data/build_datasets.py` to regenerate.
//   nhefs            — real NHEFS public-use (epi; smoking → weight gain). Covariates only.
//   nhefs-synthetic  — novel rows from a learned Gaussian copula (generative stand-in).
//   ihdp             — IHDP npci (CATE benchmark); real covariates, simulated outcome, true ITE.
//   twins            — US same-sex twins <2kg; both potential outcomes (the co-twin).
//   lalonde          — National Supported Work job-training RCT (econ); treatment + earnings.
export const DATASETS: Record<string, CovariateDataset> = {
  nhefs: NHEFS_COVARIATES,
  "nhefs-synthetic": NHEFS_SYNTHETIC,
  ihdp: IHDP_DATASET,
  twins: TWINS_DATASET,
  lalonde: LALONDE_DATASET,
  "lalonde-obs": LALONDE_OBS_DATASET,
  "lalonde-synthetic": LALONDE_SYNTHETIC
};

export function datasetRows(name: string | undefined): number[][] {
  return (name ? DATASETS[name]?.rows : undefined) ?? [];
}

export function datasetColumnIndex(name: string, column: string): number {
  return DATASETS[name]?.columns.indexOf(column) ?? -1;
}
