import type { DataFrame } from "./dataframe";
import type { GraphDocument, GraphNode } from "./types";
import { createGraphDocument, createNode, edgeId, reconcileSimulationSpec } from "./graph";
import { addPlasmodeCovariates, layoutExampleDocument, setBinaryVariable, setContinuousVariable, setVariable } from "./examples/builders";
import { registerRuntimeDataset } from "./datasets";
import { dataFrameToDataset } from "./dataframe";

// Turn a column name into a valid, unique node id (keep the original as the label).
function sanitizeId(name: string, taken: Set<string>): string {
  let base = name.trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "col";
  if (/^[0-9]/.test(base)) base = `c_${base}`;
  let id = base;
  let k = 2;
  while (taken.has(id)) { id = `${base}_${k}`; k += 1; }
  taken.add(id);
  return id;
}

// Build a "node dump" document from an imported table: one node per column (typed), laid out in a
// grid, all fed by a single latent row-resample source (plasmode) so the exact real joint flows.
// The user then draws the causal edges and adds their own (e.g. latent) nodes. Session-only: the
// table is registered as a runtime dataset (not persisted).
export function documentFromDataFrame(df: DataFrame, options?: { title?: string; datasetName?: string }): GraphDocument {
  const datasetName = options?.datasetName ?? "user-data";
  const dataset = dataFrameToDataset(df, datasetName);
  registerRuntimeDataset(datasetName, dataset); // for same-thread use; also carried in the spec below for workers
  if (df.columns.length === 0) return createGraphDocument({ kind: "dag", nodes: [], edges: [] }, options?.title ?? "Imported data");

  const taken = new Set<string>();
  const cols = df.columns.map((column) => ({ column, id: sanitizeId(column.name, taken) }));
  const sourceId = sanitizeId("Data_rows", taken);

  const perRow = Math.min(5, Math.max(1, cols.length));
  const gapX = 2.7;
  const gapY = 3.0;
  const width = (perRow - 1) * gapX;
  const nodes: GraphNode[] = cols.map(({ column, id }, i) => {
    const node = createNode(id, { x: (i % perRow) * gapX - width / 2, y: Math.floor(i / perRow) * gapY });
    node.label = column.name;
    return node;
  });
  const source = createNode(sourceId, { x: 0, y: -gapY }, { latent: true });
  source.label = "imported rows (resample)";
  nodes.unshift(source);
  const edges = cols.map(({ id }) => ({ id: edgeId(sourceId, id, "directed"), source: sourceId, target: id, kind: "directed" as const }));

  const document = createGraphDocument({ kind: "dag", nodes, edges }, options?.title ?? "Imported data");
  setContinuousVariable(document, sourceId, "Row resample index over the imported table (unobserved).", "row");
  for (const { column, id } of cols) {
    const description = `Imported column “${column.name}”.`;
    if (column.type === "binary") setBinaryVariable(document, id, description, column.unit ?? "");
    else if (column.type === "categorical") setVariable(document, id, { valueType: "categorical", categories: column.categories ?? [], description, unit: column.unit ?? "" });
    else setContinuousVariable(document, id, description, column.unit ?? "");
  }
  addPlasmodeCovariates(document, sourceId, datasetName, cols.map(({ column, id }) => ({ id, column: column.name })));
  document.simulation = reconcileSimulationSpec(document.graph, document.simulation);
  const laidOut = layoutExampleDocument(document); // proper pixel-scale layout (raw positions are logical units)
  laidOut.simulation.datasets = { [datasetName]: dataset }; // travels with the doc → reaches the sim worker
  return laidOut;
}
