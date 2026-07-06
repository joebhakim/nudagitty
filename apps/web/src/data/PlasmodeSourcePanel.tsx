import { documentDatasets, plasmodeSources } from "@nudagitty/core";
import type { GraphDocument } from "@nudagitty/core";
import "./plasmode-source.css";

// The Plasmode tab of the Joint / DGM editor: the empirical mechanism for the confounder joint. Where
// the Copula tab AUTHORS a parametric dependence, this one just reports the wiring — which covariates
// are drawn from the same real rows (so their joint is exactly empirical) and which columns are unused.
export function PlasmodeSourcePanel(props: { document: GraphDocument }) {
  const sources = plasmodeSources(props.document).filter((source) => source.covariates.length >= 2);
  const orphansByDataset = new Map(documentDatasets(props.document).map((entry) => [entry.dataset, entry.orphanColumns]));
  const labelOf = (id: string) => props.document.graph.nodes.find((node) => node.id === id)?.label ?? id;

  if (sources.length === 0) {
    return (
      <div className="plasmode-panel plasmode-panel--empty">
        <p className="plasmode-empty-title">No plasmode source in this model.</p>
        <p className="plasmode-empty-hint">
          A plasmode source draws several covariates from the <b>same real rows</b> of a dataset, so their joint
          dependence is exactly the empirical one — no parametric model. Import a CSV (top bar) or open a plasmode
          example to create one, then it shows up here as a “shared hidden causes” cloud on the canvas.
        </p>
      </div>
    );
  }

  return (
    <div className="plasmode-panel">
      <p className="plasmode-lede">
        These covariates are resampled from the <b>same real row</b> of a dataset, so their joint dependence is
        <b> exactly empirical</b> — the real correlations, tail behaviour and discrete structure, with no copula to author.
      </p>
      {sources.map((source) => {
        const orphans = orphansByDataset.get(source.dataset) ?? [];
        return (
          <div key={source.sourceId} className="plasmode-source">
            <div className="plasmode-source-head">
              <strong>{source.dataset}</strong>
              <span>{source.covariates.length} covariates from one shared row source</span>
            </div>
            <table className="plasmode-map">
              <thead>
                <tr><th>Node</th><th aria-hidden="true"></th><th>Data column</th></tr>
              </thead>
              <tbody>
                {source.covariates.map((covariate) => (
                  <tr key={covariate.nodeId}>
                    <td className="plasmode-node">{labelOf(covariate.nodeId)}</td>
                    <td className="plasmode-arrow">←</td>
                    <td className="plasmode-col">{covariate.column}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {orphans.length > 0 && (
              <div className="plasmode-orphans">
                ⚠ {orphans.length} column{orphans.length === 1 ? "" : "s"} in <b>{source.dataset}</b> {orphans.length === 1 ? "isn't" : "aren't"} wired
                to a node: <b>{orphans.join(", ")}</b>. Add nodes for them (or import again) to bring them into the model.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
