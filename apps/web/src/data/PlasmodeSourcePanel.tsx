import { documentDatasets, plasmodeSources } from "@nudagitty/core";
import type { GraphDocument } from "@nudagitty/core";
import "./plasmode-source.css";

type JointMode = "shared" | "independent";

// The Plasmode tab of the Joint / DGM editor: the empirical mechanism for the confounder joint. Where
// the Copula tab AUTHORS a parametric dependence, this one reports the wiring AND exposes the one knob
// that matters — shared vs independent resampling (the mirror of dragging a copula's τ to zero).
export function PlasmodeSourcePanel(props: { document: GraphDocument; onSetJointMode: (dataset: string, mode: JointMode) => void; fittable?: boolean; onFitDgp?: () => void }) {
  const orphansByDataset = new Map(documentDatasets(props.document).map((entry) => [entry.dataset, entry.orphanColumns]));
  const labelOf = (id: string) => props.document.graph.nodes.find((node) => node.id === id)?.label ?? id;

  // Group every plasmode covariate by its dataset (a dataset in "shared" mode has one source feeding all;
  // in "independent" mode it has one source per covariate). This survives both states, unlike per-source.
  const byDataset = new Map<string, { covariates: Array<{ nodeId: string; column: string }>; sourceCount: number }>();
  for (const source of plasmodeSources(props.document)) {
    let entry = byDataset.get(source.dataset);
    if (!entry) { entry = { covariates: [], sourceCount: 0 }; byDataset.set(source.dataset, entry); }
    entry.covariates.push(...source.covariates);
    entry.sourceCount += 1;
  }
  const datasets = [...byDataset.entries()].filter(([, entry]) => entry.covariates.length >= 1);

  if (datasets.length === 0) {
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
      {props.fittable && (
        <div className="plasmode-fit">
          <div className="plasmode-fit-copy">
            <strong>Learn the causal edges from data</strong>
            <span>Keep the covariates real, but FIT every variable you've drawn arrows into — logistic for a binary treatment, least-squares for a continuous outcome. The arrows become learned coefficients and the fitted effect is the DGP's known truth, which adjustment should recover.</span>
          </div>
          <button type="button" className="plasmode-fit-go" onClick={props.onFitDgp}>Learn the DGP →</button>
        </div>
      )}
      <p className="plasmode-lede">
        These covariates are resampled from real rows of a dataset. Draw them from the <b>same</b> row and their joint
        dependence is <b>exactly empirical</b> (real correlations, tails, discrete structure); draw each from its own row
        and the marginals stay real but the <b>joint is broken</b> — the empirical analogue of a copula’s τ.
      </p>
      {datasets.map(([dataset, entry]) => {
        const mode: JointMode = entry.sourceCount === 1 && entry.covariates.length >= 2 ? "shared" : "independent";
        const canToggle = entry.covariates.length >= 2;
        const orphans = orphansByDataset.get(dataset) ?? [];
        return (
          <div key={dataset} className="plasmode-source">
            <div className="plasmode-source-head">
              <strong>{dataset}</strong>
              <span>{entry.covariates.length} covariates{canToggle ? "" : " (need ≥2 for a joint)"}</span>
            </div>
            {canToggle && (
              <div className="plasmode-mode" role="group" aria-label="Resample joint mode">
                <span className="plasmode-mode-label">Joint</span>
                <div className="plasmode-mode-seg">
                  <button type="button" className={mode === "shared" ? "active" : ""} aria-pressed={mode === "shared"}
                    onClick={() => mode !== "shared" && props.onSetJointMode(dataset, "shared")}>shared</button>
                  <button type="button" className={mode === "independent" ? "active" : ""} aria-pressed={mode === "independent"}
                    onClick={() => mode !== "independent" && props.onSetJointMode(dataset, "independent")}>independent</button>
                </div>
                <span className="plasmode-mode-hint">{mode === "shared" ? "one shared row → the exact real joint" : "one row each → real marginals, joint broken"}</span>
              </div>
            )}
            <table className="plasmode-map">
              <thead>
                <tr><th>Node</th><th aria-hidden="true"></th><th>Data column</th></tr>
              </thead>
              <tbody>
                {entry.covariates.map((covariate) => (
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
                ⚠ {orphans.length} column{orphans.length === 1 ? "" : "s"} in <b>{dataset}</b> {orphans.length === 1 ? "isn't" : "aren't"} wired
                to a node: <b>{orphans.join(", ")}</b>. Add nodes for them (or import again) to bring them into the model.
              </div>
            )}
          </div>
        );
      })}
      <p className="plasmode-bridge">
        Swap the mechanism itself — <b>fit a copula</b> from these rows, or resample a fitted copula — needs
        <i> joints-from-data</i>, coming in a later pass.
      </p>
    </div>
  );
}
