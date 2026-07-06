import type { GraphModel, SimulationResult, VariableValueType } from "./types";
import type { CovariateDataset } from "./data/dataset";
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

// --- CSV import: parse a table, infer column types, and adapt to the embedded-dataset shape ---

// Minimal RFC-4180-ish parser: quoted cells, "" escapes, commas, CRLF. Returns non-blank rows.
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const t = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i]!;
    if (inQuotes) {
      if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i += 1; } else inQuotes = false; }
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function inferColumn(name: string, raw: string[]): DataColumn {
  const missing = raw.map((v) => v.trim() === "");
  const anyMissing = missing.some(Boolean);
  const nonEmpty = raw.filter((v) => v.trim() !== "");
  const numeric = nonEmpty.length > 0 && nonEmpty.every((v) => Number.isFinite(Number(v)));
  if (numeric) {
    const values = raw.map((v) => (v.trim() === "" ? 0 : Number(v)));
    const distinct = new Set(nonEmpty.map((v) => Number(v)));
    const binary = distinct.size <= 2 && [...distinct].every((v) => v === 0 || v === 1);
    return { name, type: binary ? "binary" : "continuous", values, ...(anyMissing ? { missing } : {}) };
  }
  // non-numeric ⇒ categorical: map unique labels (first-seen order) to integer codes.
  const categories: string[] = [];
  const index = new Map<string, number>();
  const values = raw.map((v) => {
    const key = v.trim();
    if (key === "") return 0;
    if (!index.has(key)) { index.set(key, categories.length); categories.push(key); }
    return index.get(key)!;
  });
  return { name, type: "categorical", values, categories, ...(anyMissing ? { missing } : {}) };
}

/** Parse CSV text into a typed DataFrame (binary / continuous / categorical inferred per column). */
export function parseCsvToDataFrame(text: string): DataFrame {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return { columns: [], nRows: 0 };
  const header = rows[0]!;
  const body = rows.slice(1);
  const columns = header.map((name, c) => inferColumn(name.trim() || `col${c + 1}`, body.map((r) => r[c] ?? "")));
  return { columns, nRows: body.length };
}

/** Adapt a DataFrame to the embedded-dataset shape so `table_lookup` / plasmode can read it. */
export function dataFrameToDataset(df: DataFrame, name: string): CovariateDataset {
  const rows: number[][] = Array.from({ length: df.nRows }, (_, i) => df.columns.map((column) => column.values[i] ?? 0));
  const names = df.columns.map((column) => column.name);
  return { name, source: "user import", columns: names, rows, covariates: names };
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
