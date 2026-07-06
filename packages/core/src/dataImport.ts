import type { DataFrame } from "./dataframe";
import type { GraphDocument, GraphNode } from "./types";
import { cloneDocument, createGraphDocument, createNode, edgeId, reconcileSimulationSpec } from "./graph";
import { addPlasmodeCovariates, layoutExampleDocument, setBinaryVariable, setContinuousVariable, setVariable } from "./examples/builders";
import { lookupDataset, registerRuntimeDataset } from "./datasets";
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

// Switch how a dataset's plasmode covariates share their resample source — the empirical mechanism knob,
// the mirror of dragging a copula's τ to zero. "shared": one row-index feeds every covariate, so each drawn
// observation is a whole real row (the exact joint). "independent": each covariate gets its OWN row-index,
// so the marginals stay exactly real but the joint is broken (the confounders are shuffled apart). Rebuilds
// the source node(s) + table_lookup edges from the covariate→column mapping, then re-lays-out.
export function setPlasmodeJointMode(input: GraphDocument, dataset: string, mode: "shared" | "independent"): GraphDocument {
  const document = cloneDocument(input);
  const columns = lookupDataset(dataset)?.columns ?? [];
  const covariates: Array<{ id: string; column: string }> = [];
  const seen = new Set<string>();
  const oldSources = new Set<string>();
  for (const edge of document.graph.edges) {
    const mechanism = document.simulation.edges[edge.id];
    if (mechanism?.kind !== "table_lookup" || mechanism.dataset !== dataset) continue;
    oldSources.add(edge.source);
    if (!seen.has(edge.target)) { seen.add(edge.target); covariates.push({ id: edge.target, column: columns[mechanism.dataColumn ?? 0] ?? `column ${mechanism.dataColumn ?? 0}` }); }
  }
  if (covariates.length === 0) return input;
  const datasets = document.simulation.datasets; // carry the (possibly imported) table so it still reaches the worker

  // Drop the old row-index sources and their lookup edges (sources are pure row-index latents → every out-edge is a lookup).
  document.graph.nodes = document.graph.nodes.filter((node) => !oldSources.has(node.id));
  document.graph.edges = document.graph.edges.filter((edge) => !oldSources.has(edge.source));
  for (const id of oldSources) delete document.simulation.nodes[id];

  const taken = new Set(document.graph.nodes.map((node) => node.id));
  // Create a row-index source node + the directed source→covariate edges, THEN attach the table_lookup
  // mechanisms (setEdgeMechanism no-ops unless the graph edge already exists).
  const addSource = (id: string, label: string, fed: Array<{ id: string; column: string }>) => {
    const source = createNode(id, { x: 0, y: 0 }, { latent: true });
    source.label = label;
    document.graph.nodes.push(source);
    setContinuousVariable(document, id, "Resample index over the dataset rows (unobserved).", "row");
    for (const covariate of fed) document.graph.edges.push({ id: edgeId(id, covariate.id, "directed"), source: id, target: covariate.id, kind: "directed" });
    addPlasmodeCovariates(document, id, dataset, fed);
  };
  if (mode === "shared") {
    addSource(sanitizeId(`${dataset}_rows`, taken), `${dataset} rows (resample)`, covariates);
  } else {
    for (const covariate of covariates) addSource(sanitizeId(`Src_${covariate.id}`, taken), `${covariate.id} row (resample)`, [covariate]);
  }

  document.simulation = reconcileSimulationSpec(document.graph, document.simulation);
  const laidOut = layoutExampleDocument(document);
  if (datasets) laidOut.simulation.datasets = datasets;
  return laidOut;
}
