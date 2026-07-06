import { useRef, useState } from "react";
import { parseCsvToDataFrame, documentFromDataFrame } from "@nudagitty/core";
import type { GraphDocument } from "@nudagitty/core";
import "./import-data.css";

// Phase 2: bring-your-own-data. Upload/paste a CSV → a node per column (typed), all fed by one resample
// source so the real joint is preserved. The user then draws the causal edges + adds their own nodes.
export function ImportDataModal(props: { onImport: (doc: GraphDocument) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const preview = text.trim() ? parseCsvToDataFrame(text) : null;

  const doImport = (csv: string) => {
    const df = parseCsvToDataFrame(csv);
    if (df.columns.length === 0 || df.nRows === 0) { setError("Couldn't find any rows or columns in that CSV."); return; }
    props.onImport(documentFromDataFrame(df, { title: "Imported data" }));
  };
  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void file.text().then((content) => { setText(content); setError(null); doImport(content); });
  };

  return (
    <div className="import-data">
      <p className="import-blurb">Upload or paste a CSV. <b>Each column becomes a node</b> (type inferred), all fed by one resample source so the real joint is preserved — then draw the causal edges and add your own (e.g. latent) nodes. Session-only; the data isn't saved with the model.</p>
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
