import type { GraphModel, SimulationResult, VariableValueType } from "./types";
import { normalizeVariableModel } from "./graph";

// A typed, column-oriented data frame — the shared substrate for the data-table work: the same shape
// serves embedded datasets, user CSV imports, and materialized simulation output. Values are always a
// numeric encoding (categorical/ordinal = level index); `categories` carries the labels, `missing` the
// NA mask. Deliberately minimal so the engine, the UI table, CSV I/O, and joint-fitting all share it.
export interface DataColumn {
  name: string;
  type: VariableValueType;
  values: number[];
  categories?: string[]; // labels for categorical / ordinal levels (index → label)
  unit?: string;
  missing?: boolean[]; // per-row NA mask (absent ⇒ nothing missing)
}

export interface DataFrame {
  columns: DataColumn[];
  nRows: number;
}

/** Materialize a simulation result as a data frame — one OBSERVED column per node, one row per sample.
 * Latent nodes are excluded by default: they are unobserved (a real confounder, or a plasmode
 * row-index source) and so aren't part of "the data". Pass `includeLatent` to keep them. */
export function dataFrameFromSimulation(graph: GraphModel, result: SimulationResult, options?: { nodeIds?: string[]; includeLatent?: boolean }): DataFrame {
  const ids = options?.nodeIds ?? graph.nodes.map((node) => node.id);
  const columns: DataColumn[] = [];
  let nRows = 0;
  for (const id of ids) {
    const node = graph.nodes.find((candidate) => candidate.id === id);
    const state = result.nodeStates[id];
    if (!node || !state) continue;
    if (node.roles.latent && !options?.includeLatent) continue;
    const variable = normalizeVariableModel(node.variable);
    const values = state.empirical.samples ?? [];
    nRows = Math.max(nRows, values.length);
    columns.push({
      name: node.label || node.id,
      type: variable.valueType,
      values,
      ...(variable.categories.length > 0 ? { categories: variable.categories } : {}),
      ...(variable.unit ? { unit: variable.unit } : {})
    });
  }
  return { columns, nRows };
}

const DISCRETE_LABELLED = new Set<VariableValueType>(["categorical", "ordinal", "binary"]);

function csvCell(text: string): string {
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatValue(column: DataColumn, index: number, labels: boolean): string {
  if (column.missing?.[index]) return "";
  const value = column.values[index];
  if (value == null || !Number.isFinite(value)) return "";
  if (labels && column.categories && DISCRETE_LABELLED.has(column.type)) {
    return csvCell(column.categories[Math.round(value)] ?? String(value));
  }
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6);
}

/** Serialize a data frame to CSV. `labels` writes category labels for discrete columns instead of codes. */
export function dataFrameToCsv(df: DataFrame, options?: { labels?: boolean; maxRows?: number }): string {
  const labels = options?.labels ?? true;
  const n = Math.min(df.nRows, options?.maxRows ?? df.nRows);
  const lines: string[] = [df.columns.map((column) => csvCell(column.name)).join(",")];
  for (let i = 0; i < n; i += 1) {
    lines.push(df.columns.map((column) => formatValue(column, i, labels)).join(","));
  }
  return lines.join("\n");
}
