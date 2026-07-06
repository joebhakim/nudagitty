import { useMemo } from "react";
import { dataFrameFromSimulation, dataFrameToCsv } from "@nudagitty/core";
import type { DataColumn, GraphModel, SimulationResult } from "@nudagitty/core";
import "./data-table.css";

const LABELLED = new Set(["categorical", "ordinal", "binary"]);

function cellText(column: DataColumn, index: number): string {
  const value = column.values[index];
  if (value == null || !Number.isFinite(value)) return "";
  if (column.categories && LABELLED.has(column.type)) return column.categories[Math.round(value)] ?? String(value);
  return Number.isInteger(value) ? String(value) : (Math.round(value * 1000) / 1000).toString();
}

// Phase 1 of the data-table rework: the simulated sample as an actual typed table + CSV export.
export function DataTablePanel(props: { graph: GraphModel; simulation: SimulationResult; title?: string; orphanColumns?: string[] }) {
  const df = useMemo(() => dataFrameFromSimulation(props.graph, props.simulation), [props.graph, props.simulation]);
  const previewRows = Math.min(df.nRows, 200);
  const orphans = props.orphanColumns ?? [];
  const download = () => {
    const csv = dataFrameToCsv(df);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(props.title ?? "simulated-sample").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "sample"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  if (df.columns.length === 0) return <p className="data-table-empty">No variables to show yet.</p>;
  return (
    <div className="data-table-panel">
      {orphans.length > 0 && (
        <div className="data-orphan-warning">
          ⚠ {orphans.length} column{orphans.length === 1 ? "" : "s"} in the source data {orphans.length === 1 ? "isn't" : "aren't"} in the DAG (unused): <b>{orphans.join(", ")}</b>. Add nodes for them, or they're dropped from the generated data.
        </div>
      )}
      <div className="data-table-head">
        <span>{df.columns.length} variables × {df.nRows.toLocaleString()} rows{df.nRows > previewRows ? ` — showing the first ${previewRows}` : ""}</span>
        <button type="button" className="data-download" onClick={download}>⭳ Download CSV</button>
      </div>
      <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th className="data-rownum">#</th>
              {df.columns.map((column) => (
                <th key={column.name}>{column.name}<span className="data-coltype">{column.unit ? column.unit : column.type}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: previewRows }, (_, i) => (
              <tr key={i}>
                <td className="data-rownum">{i + 1}</td>
                {df.columns.map((column) => <td key={column.name} className={LABELLED.has(column.type) ? "data-cat" : "data-num"}>{cellText(column, i)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
