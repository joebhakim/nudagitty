import type { CovariateDataset } from "./data/dataset";
import type { GraphDocument } from "./types";
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

// User-imported tables live here (session-only, not embedded/persisted). Lookups check this first,
// so a `table_lookup` edge pointing at an imported dataset resolves just like an embedded one.
const runtimeDatasets: Record<string, CovariateDataset> = {};
export function registerRuntimeDataset(name: string, dataset: CovariateDataset): void {
  runtimeDatasets[name] = dataset;
}
function lookupDataset(name: string | undefined): CovariateDataset | undefined {
  if (!name) return undefined;
  return runtimeDatasets[name] ?? DATASETS[name];
}

export function datasetRows(name: string | undefined): number[][] {
  return lookupDataset(name)?.rows ?? [];
}

export function datasetColumnIndex(name: string, column: string): number {
  return lookupDataset(name)?.columns.indexOf(column) ?? -1;
}

// Audit which columns of the datasets a document draws from are actually wired to a node (via a
// `table_lookup` edge) vs left ORPHAN (present in the data but absent from the DAG). Powers the
// data-table "N columns aren't in the DAG" check. Reads mechanism kinds off the raw spec (already
// normalized on load) to avoid a graph-normalize dependency here.
// The plasmode "joint sources" in a document: every node that fans out to covariates via table_lookup
// edges. Each is the empirical analogue of a copula block — one hidden row-identity that couples the
// covariates by making them read the same real row. `nodeIds` are the covariates it feeds.
export function plasmodeSources(document: GraphDocument): Array<{ sourceId: string; dataset: string; nodeIds: string[] }> {
  const bySource = new Map<string, { dataset: string; nodeIds: string[] }>();
  for (const edge of document.graph.edges) {
    const mechanism = document.simulation.edges[edge.id];
    if (mechanism?.kind !== "table_lookup" || !mechanism.dataset) continue;
    let entry = bySource.get(edge.source);
    if (!entry) { entry = { dataset: mechanism.dataset, nodeIds: [] }; bySource.set(edge.source, entry); }
    entry.nodeIds.push(edge.target);
  }
  return [...bySource].map(([sourceId, value]) => ({ sourceId, dataset: value.dataset, nodeIds: value.nodeIds }));
}

export function documentDatasets(document: GraphDocument): Array<{ dataset: string; allColumns: string[]; wiredColumns: string[]; orphanColumns: string[] }> {
  const wired = new Map<string, Set<number>>();
  for (const edge of document.graph.edges) {
    const mechanism = document.simulation.edges[edge.id];
    if (mechanism?.kind === "table_lookup" && mechanism.dataset) {
      let columns = wired.get(mechanism.dataset);
      if (!columns) { columns = new Set(); wired.set(mechanism.dataset, columns); }
      columns.add(mechanism.dataColumn ?? 0);
    }
  }
  const out: Array<{ dataset: string; allColumns: string[]; wiredColumns: string[]; orphanColumns: string[] }> = [];
  for (const [dataset, indices] of wired) {
    const allColumns = lookupDataset(dataset)?.columns ?? [];
    out.push({
      dataset,
      allColumns,
      wiredColumns: allColumns.filter((_, i) => indices.has(i)),
      orphanColumns: allColumns.filter((_, i) => !indices.has(i))
    });
  }
  return out;
}

/** Columns present in the document's source data but not represented by any node (across all datasets). */
export function orphanDataColumns(document: GraphDocument): string[] {
  return documentDatasets(document).flatMap((entry) => entry.orphanColumns);
}
