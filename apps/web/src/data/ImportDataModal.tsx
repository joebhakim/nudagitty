import { useMemo, useRef, useState } from "react";
import { builtInDatasets, csvFromDataset, parseCsvToDataFrame, documentFromDataFrame } from "@nudagitty/core";
import type { GraphDocument } from "@nudagitty/core";
import "./import-data.css";

// Phase 2: bring-your-own-data. Upload/paste a CSV → a node per column (typed), all fed by one resample
// source so the real joint is preserved. The user then draws the causal edges + adds their own nodes.
/** The known effect, in whatever units the dataset happens to use. Big ⇒ integer; small ⇒ 3 sig figs. */
function formatEffect(v: number): string {
  if (Math.abs(v) >= 100) return Math.round(v).toLocaleString();
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toPrecision(2);
}

export function ImportDataModal(props: { onImport: (doc: GraphDocument) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const preview = text.trim() ? parseCsvToDataFrame(text) : null;
  // Already compiled into the bundle (that is how table_lookup resolves them), so offering them costs
  // nothing but the affordance to START from one.
  const builtIns = useMemo(() => builtInDatasets(), []);

  const doImport = (csv: string, title = "Imported data", datasetName?: string) => {
    const df = parseCsvToDataFrame(csv);
    if (df.columns.length === 0 || df.nRows === 0) { setError("Couldn't find any rows or columns in that CSV."); return; }
    props.onImport(documentFromDataFrame(df, { title, ...(datasetName ? { datasetName } : {}) }));
  };

  // Deliberately the SAME text -> DataFrame -> document path an uploaded file takes. A shortcut here would
  // make the built-ins a privileged path that could silently diverge from what a user's own CSV does.
  //
  // The import lands under `<id>-imported`, NOT `<id>`. Registering it under the embedded name would put a
  // runtime copy in front of the real dataset for the rest of the session — and the CSV round-trip rounds
  // to 4dp — so every shipped example that reads that table would quietly shift underneath the user.
  const useBuiltIn = (id: string, label: string) => {
    const csv = csvFromDataset(id);
    if (!csv) { setError(`Couldn't load the built-in dataset "${id}".`); return; }
    doImport(csv, label, `${id}-imported`);
  };
  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void file.text().then((content) => { setText(content); setError(null); doImport(content); });
  };

  return (
    <div className="import-data">
      <div className="import-builtin">
        <div className="import-builtin-head">
          <b>Start from a built-in dataset</b>
          <span>no upload — these ship with the app</span>
        </div>
        {builtIns.map((d) => (
          <button type="button" className="import-builtin-row" key={d.id} onClick={() => useBuiltIn(d.id, d.label)}>
            <span className="import-builtin-title">
              <b>{d.label}</b>
              <em>{d.rows.toLocaleString()} rows × {d.columns} cols</em>
              {/* NOT always dollars: LaLonde is earnings, IHDP a simulated continuous outcome, Twins a
                mortality risk difference. A hardcoded "$" printed "benchmark $-0" for Twins. */}
            {typeof d.trueAte === "number" && <i>true effect {formatEffect(d.trueAte)}</i>}
            </span>
            <span className="import-builtin-blurb">{d.blurb}</span>
          </button>
        ))}
      </div>
      <p className="import-blurb">…or bring your own. Upload or paste a CSV. <b>Each column becomes a node</b> (type inferred), all fed by one resample source so the real joint is preserved — then draw the causal edges and add your own (e.g. latent) nodes. Session-only; the data isn't saved with the model.</p>
      <div className="import-actions">
        <button type="button" className="import-file" onClick={() => fileRef.current?.click()}>⭳ Choose CSV file…</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" style={{ display: "none" }} onChange={onFile} />
        <span className="import-or">or paste below</span>
      </div>
      <textarea className="import-textarea" spellCheck={false} placeholder={"age,sex,city\n34,1,NYC\n52,0,LA\n41,1,NYC"} value={text} onChange={(event) => { setText(event.target.value); setError(null); }} />
      {error && <p className="import-error">{error}</p>}
      {preview && preview.columns.length > 0 && (
        <div className="import-preview">
          <b>{preview.columns.length} columns × {preview.nRows.toLocaleString()} rows</b> → nodes:
          <div className="import-cols">
            {preview.columns.map((column) => <span key={column.name} className={`import-col type-${column.type}`}>{column.name} <em>{column.type}</em></span>)}
          </div>
        </div>
      )}
      <div className="import-footer">
        <button type="button" className="import-cancel" onClick={props.onClose}>Cancel</button>
        <button type="button" className="import-go" disabled={!preview || preview.columns.length === 0} onClick={() => doImport(text)}>Create {preview?.columns.length ? `${preview.columns.length} nodes` : "nodes"} from this data →</button>
      </div>
    </div>
  );
}
