import { copulaCorrelation, normalizeEdgeMechanism, normalizeNodeMechanism, normalizeVariableModel, topologicalOrder } from "@nudagitty/core";
import type {
  EdgeMechanism,
  GraphDocument,
  GraphEdge,
  NodeCombinerKind,
  NodeDistribution,
  NodeMechanism,
  SimulationResult
} from "@nudagitty/core";
import { formatValue } from "../shared/formatting";

// A holistic, read-only view of the EXACT data-generating process behind the current graph:
// the structural equations, the marginals, the joint-dependence (correlation matrix + the
// data-generating mechanism / source), every link coefficient, and the imposed "truth".
// Reuses the same value formatting as the rest of the app; everything is derived live from
// `document.simulation` (the mechanism spec) and `simulation` (the realized samples).

function distLabel(d: NodeDistribution): string {
  switch (d.kind) {
    case "constant": return `constant ${formatValue(d.value)}`;
    case "normal": return `Normal(${formatValue(d.mean)}, ${formatValue(d.sd)})`;
    case "lognormal": return `Lognormal(${formatValue(d.meanLog)}, ${formatValue(d.sdLog)})`;
    case "uniform": return `Uniform(${formatValue(d.min)}, ${formatValue(d.max)})`;
    case "bernoulli": return `Bernoulli(${formatValue(d.p)})`;
    case "poisson": return `Poisson(${formatValue(d.lambda)})`;
    case "beta": return `Beta(${formatValue(d.alpha)}, ${formatValue(d.beta)})`;
    case "laplace": return `Laplace(${formatValue(d.mean)}, ${formatValue(d.scale)})`;
    case "student_t": return `Student-t(${formatValue(d.mean)}, ${formatValue(d.scale)}, df ${formatValue(d.df)})`;
    case "gamma": return `Gamma(${formatValue(d.shape)}, ${formatValue(d.scale)})`;
    case "exponential": return `Exponential(${formatValue(d.rate)})`;
    case "categorical": return `Categorical(${d.weights.length} levels)`;
  }
}

const COMBINER_LABEL: Record<NodeCombinerKind, string> = {
  additive: "identity (linear mean)",
  bounded_logistic: "logistic σ(·)",
  positive_softplus: "softplus",
  bernoulli_logit: "logit → P(=1)=σ(·)",
  poisson_log: "log link → rate=exp(·)",
  gamma_log: "log link → mean=exp(·)",
  noisy_or: "noisy-OR",
  copula_marginal: "copula F⁻¹(Φ(·))"
};

// One additive term contributed by a parent edge, e.g. "0.50·Age" or "quad(Age)".
function edgeTermLabel(mech: EdgeMechanism, source: string): string {
  switch (mech.kind) {
    case "linear": return `${formatValue(mech.coefficient)}·${source}`;
    case "quadratic": return `(${formatValue(mech.beta1)}·${source} + ${formatValue(mech.beta2)}·${source}²)`;
    case "absorbing": return `absorbing(${source})`;
    case "threshold": return `threshold(${source})`;
    case "smooth_threshold": return `smoothThreshold(${source})`;
    case "saturating": return `saturating(${source})`;
    case "piecewise_linear": return `piecewise(${source})`;
    case "monotone_spline": return `spline(${source})`;
    case "hill_emax": return `hill(${source})`;
    case "log_linear": return `${formatValue(mech.coefficient)}·log(${source})`;
    case "power_law": return `powerLaw(${source})`;
    case "table_lookup": return `${mech.dataset ?? "data"}[row][${mech.dataColumn ?? 0}]`;
    default: return `${mech.kind}(${source})`;
  }
}

function edgeParamSummary(mech: EdgeMechanism): string {
  switch (mech.kind) {
    case "linear": return `coef ${formatValue(mech.coefficient)}`;
    case "quadratic": return `β1 ${formatValue(mech.beta1)}, β2 ${formatValue(mech.beta2)}`;
    case "threshold":
    case "smooth_threshold": return `thr ${formatValue(mech.threshold)}, lo ${formatValue(mech.low)}, hi ${formatValue(mech.high)}`;
    case "saturating": return `scale ${formatValue(mech.scale)}, mid ${formatValue(mech.midpoint)}`;
    case "hill_emax": return `base ${formatValue(mech.baseline)}, max ${formatValue(mech.maxEffect)}, ec50 ${formatValue(mech.ec50)}`;
    case "log_linear": return `coef ${formatValue(mech.coefficient)}, offset ${formatValue(mech.offset)}`;
    case "power_law": return `coef ${formatValue(mech.coefficient)}, exp ${formatValue(mech.exponent)}`;
    case "piecewise_linear":
    case "monotone_spline": return `${mech.points.length} knots`;
    case "absorbing": return "carries event forward";
    case "table_lookup": return `resample ${mech.dataset ?? "data"} col ${mech.dataColumn ?? 0}`;
    default: return "";
  }
}

function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i += 1) { sa += a[i]!; sb += b[i]!; }
  const ma = sa / n, mb = sb / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i]! - ma, db = b[i]! - mb;
    cov += da * db; va += da * da; vb += db * db;
  }
  if (va <= 0 || vb <= 0) return null;
  return cov / Math.sqrt(va * vb);
}

function corrColor(r: number): string {
  // diverging red(+)/blue(-) by magnitude
  const m = Math.min(1, Math.abs(r));
  const a = 0.12 + 0.55 * m;
  return r >= 0 ? `rgba(200, 60, 50, ${a.toFixed(2)})` : `rgba(50, 90, 200, ${a.toFixed(2)})`;
}

export function DgpInspector(props: { document: GraphDocument; simulation: SimulationResult; onCorrelationChange?: (rho: number) => void }) {
  const copulaRho = copulaCorrelation(props.document);
  const { document, simulation } = props;
  const graph = document.graph;
  const order = topologicalOrder(graph) ?? graph.nodes.map((node) => node.id);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const parentEdges = (id: string): GraphEdge[] => graph.edges.filter((edge) => edge.kind === "directed" && edge.target === id);
  const mechOf = (id: string): NodeMechanism => normalizeNodeMechanism(document.simulation.nodes[id]);
  const edgeMechOf = (edge: GraphEdge): EdgeMechanism => normalizeEdgeMechanism(document.simulation.edges[edge.id]);

  // --- detect the data-generating mechanism for the covariate joint ---
  const edgeMechs = graph.edges.map(edgeMechOf);
  const nodeMechs = graph.nodes.map((node) => mechOf(node.id));
  // Copula = node combiner (marginal transform); plasmode = table_lookup edge (Phase 3).
  const hasCopula = nodeMechs.some((m) => m.combiner === "copula_marginal");
  const hasPlasmode = edgeMechs.some((m) => (m.kind as string) === "table_lookup");
  const adjusted = graph.nodes.filter((node) => node.roles.adjusted);
  const confounders = (adjusted.length > 0 ? adjusted : graph.nodes.filter((node) => parentEdges(node.id).length === 0));
  const confoundersHaveParents = confounders.some((node) => parentEdges(node.id).length > 0);
  const plasmodeDataset = edgeMechs.find((m) => (m.kind as string) === "table_lookup")?.dataset;
  const dgmName = hasPlasmode ? `Plasmode — resampled real rows${plasmodeDataset ? ` (${plasmodeDataset})` : ""}`
    : hasCopula ? "Gaussian copula (specified dependence)"
    : confoundersHaveParents ? "Confounder DAG (edges among covariates)"
    : "Independent parametric covariates";
  const dgmNote = hasPlasmode ? "Covariates are drawn jointly from real data rows, so their true joint dependence is preserved exactly."
    : hasCopula ? "Covariates share a latent-Gaussian source mapped through each marginal, encoding a specified correlation."
    : confoundersHaveParents ? "Covariates depend on one another through explicit edges (a sequential factorization of the joint)."
    : "Each covariate is an INDEPENDENT draw — a transparent but unrealistic joint (perfect overlap, no collinearity). Adjustment is unaffected, but positivity looks easier than real data.";

  // --- structural equation per node ---
  const equations = order.map((id) => {
    const node = nodeById.get(id);
    if (!node) return null;
    const mech = mechOf(id);
    const parents = parentEdges(id);
    const variable = normalizeVariableModel(node.variable);
    const binary = variable.valueType === "binary" || mech.combiner === "bernoulli_logit" || mech.combiner === "noisy_or";
    if (parents.length === 0) {
      return { id, binary, text: `${id} ~ ${distLabel(mech.distribution)}` };
    }
    const terms = parents.map((edge) => edgeTermLabel(edgeMechOf(edge), edge.source));
    const linear = [formatValue(mech.intercept), ...terms].join(" + ");
    const interactions = mech.interactions.map((it) =>
      it.kind === "product" ? ` + ${formatValue(it.coefficient)}·${it.left}·${it.right}` : ` + gate(${it.source}|${it.gate})`
    ).join("");
    const inner = `${linear}${interactions}`;
    if (mech.combiner === "copula_marginal") return { id, binary, text: `${id} = F⁻¹(Φ( ${inner} + ε )),  F = ${distLabel(mech.distribution)}, ε ~ ${distLabel(mech.noise)}` };
    if (mech.combiner === "bernoulli_logit") return { id, binary, text: `P(${id}=1) = σ( ${inner} )` };
    if (mech.combiner === "additive") return { id, binary, text: `${id} = ${inner} + ε, ε ~ ${distLabel(mech.noise)}` };
    return { id, binary, text: `${id} = ${COMBINER_LABEL[mech.combiner]}( ${inner} ) + ε, ε ~ ${distLabel(mech.noise)}` };
  }).filter(Boolean) as Array<{ id: string; binary: boolean; text: string }>;

  // --- marginals + correlation among the covariates ---
  const corrNodes = confounders.map((node) => node.id);
  const samplesOf = (id: string): number[] => simulation.nodeStates[id]?.empirical.samples ?? [];
  const corr: Array<Array<number | null>> = corrNodes.map((a) => corrNodes.map((b) => a === b ? 1 : pearson(samplesOf(a), samplesOf(b))));

  // --- truth: the exposure -> outcome structural coefficient(s) ---
  const exposure = graph.nodes.find((node) => node.roles.exposure);
  const outcome = graph.nodes.find((node) => node.roles.outcome);
  const truthEdge = exposure && outcome
    ? graph.edges.find((edge) => edge.kind === "directed" && edge.source === exposure.id && edge.target === outcome.id)
    : undefined;

  return (
    <div className="dgp-inspector">
      <section>
        <h4>Data-generating mechanism</h4>
        <p><strong>{dgmName}</strong></p>
        <p className="muted">{dgmNote}</p>
        <p className="muted">seed {simulation.seed} · {samplesOf(corrNodes[0] ?? graph.nodes[0]?.id ?? "").length || "—"} simulated draws</p>
      </section>

      <section>
        <h4>Structural equations</h4>
        <div className="dgp-equations">
          {equations.map((eq) => (
            <div key={eq.id} className={`dgp-eq${eq.binary ? " binary" : ""}`}><code>{eq.text}</code></div>
          ))}
        </div>
      </section>

      {copulaRho !== null && props.onCorrelationChange && (
        <section className="dgp-copula-control">
          <h4>Copula correlation — tune it</h4>
          <p>Each confounder loads on a shared latent factor; the slider sets the pairwise correlation (loading = √ρ, with the residual sd kept at √(1−ρ) so the marginals stay fixed). Watch overlap/positivity tighten as it climbs.</p>
          <label>
            <span>ρ = {formatValue(copulaRho)}</span>
            <input
              type="range"
              min="0"
              max="0.95"
              step="0.01"
              value={copulaRho}
              aria-label="Copula correlation"
              onChange={(event) => props.onCorrelationChange!(parseFloat(event.target.value))}
            />
          </label>
        </section>
      )}

      {corrNodes.length >= 2 && (
        <section>
          <h4>Covariate joint — empirical correlation</h4>
          <table className="dgp-corr">
            <thead>
              <tr><th aria-label="row" /></tr>
            </thead>
            <tbody>
              {corrNodes.map((rowId, i) => (
                <tr key={rowId}>
                  <th scope="row">{rowId}</th>
                  {corrNodes.map((colId, j) => {
                    const r = corr[i]?.[j] ?? null;
                    return (
                      <td key={colId} style={{ background: r === null ? undefined : corrColor(r) }} title={`corr(${rowId}, ${colId}) = ${r === null ? "—" : formatValue(r)}`}>
                        {r === null ? "—" : r.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr><th aria-label="col" />{corrNodes.map((colId) => <td key={colId} className="dgp-corr-colhead">{colId}</td>)}</tr>
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h4>Marginals</h4>
        <table className="dgp-table">
          <thead><tr><th>variable</th><th>analytic</th><th>empirical mean</th><th>sd</th></tr></thead>
          <tbody>
            {order.map((id) => {
              const st = simulation.nodeStates[id];
              const mean = st?.empirical.mean;
              const variance = st?.empirical.variance;
              const sd = variance != null && Number.isFinite(variance) ? Math.sqrt(Math.max(0, variance)) : null;
              const analytic = st?.analytic ? distLabel(st.analytic.distribution) : "empirical only";
              return (
                <tr key={id}><th scope="row">{id}</th><td>{analytic}</td><td>{mean == null ? "—" : formatValue(mean)}</td><td>{sd == null ? "—" : formatValue(sd)}</td></tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h4>Link coefficients</h4>
        <table className="dgp-table">
          <thead><tr><th>edge</th><th>mechanism</th><th>params</th></tr></thead>
          <tbody>
            {graph.edges.filter((edge) => edge.kind === "directed").map((edge) => {
              const m = edgeMechOf(edge);
              return (
                <tr key={edge.id}><th scope="row">{edge.source} → {edge.target}</th><td>{m.kind}</td><td>{edgeParamSummary(m)}</td></tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h4>Imposed truth</h4>
        {truthEdge ? (
          <p>
            Direct structural effect <code>{exposure!.id} → {outcome!.id}</code>: <strong>{edgeParamSummary(edgeMechOf(truthEdge))}</strong>.
            <br /><span className="muted">This is the effect we built in. For a linear, no-mediator outcome it equals the true ATE — the number every estimator should recover. (It is our construction, not a published estimate.)</span>
          </p>
        ) : (
          <p className="muted">No direct exposure → outcome edge; the true effect is the simulated do-contrast.</p>
        )}
      </section>
    </div>
  );
}
