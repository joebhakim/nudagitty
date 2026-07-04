import { useMemo, useState } from "react";
import { buildDistributionQuantile, sampleDVineModerated, simpleEdge, normalizeEdgeMechanism, ARCHIMEDEAN_FAMILIES } from "@nudagitty/core";
import type { CopulaFamily, CopulaRotation, MixtureEdge, Moderation, NodeDistribution } from "@nudagitty/core";
import { defaultDistribution } from "../compute/distributionPlot";
import "./copula-component.css";

// ---------------------------------------------------------------------------
// CopulaAuthor — the reusable dependence-authoring widget.
//   · a reorderable line of variables (a D-vine); each carries a marginal
//   · a pair-copula on every vine edge (Tree 1 = adjacent/direct; deeper = conditional)
//   · live previews in rank space (pure dependence) and data space (marginals applied)
// In the app the marginals come from the DAG nodes; here they are user-picked.
// ---------------------------------------------------------------------------

export interface CopulaVariable { id: string; name: string; marginal: NodeDistribution }
export interface VineSpec { order: number[]; trees: MixtureEdge[][]; depth: number }

type ModKind = "constant" | "linear" | "step";
const CONST_TAU: Moderation = { by: null, constant: 0 };
function modKindOf(m: Moderation): ModKind {
  if (m.by === null || !m.mechanism) return "constant";
  return m.mechanism.kind === "threshold" ? "step" : "linear";
}
// Build a Moderation for a conditional edge moderated by line-position `byPos`, strength `s`.
function buildModeration(kind: ModKind, byPos: number, s: number, prevConst: number): Moderation {
  if (kind === "constant") return { by: null, constant: prevConst || 0.3 };
  if (kind === "linear") return { by: byPos, constant: 0, mechanism: normalizeEdgeMechanism({ kind: "linear", coefficient: s }) };
  return { by: byPos, constant: 0, mechanism: normalizeEdgeMechanism({ kind: "threshold", threshold: 0, low: -s, high: s }) };
}
function modStrength(m: Moderation): number {
  if (!m.mechanism) return 2;
  return m.mechanism.kind === "threshold" ? m.mechanism.high : m.mechanism.coefficient;
}

const FAMILY_LABEL: Record<CopulaFamily, string> = {
  independence: "independence", gaussian: "Gaussian", frank: "Frank", clayton: "Clayton", gumbel: "Gumbel"
};
const MARGINAL_KINDS: NodeDistribution["kind"][] = [
  "normal", "lognormal", "uniform", "exponential", "laplace", "student_t", "gamma", "beta", "bernoulli", "poisson", "categorical", "constant"
];
const DISCRETE_KINDS = new Set(["bernoulli", "poisson", "categorical"]);
const N = 1400;

function seededBase(d: number): number[][] {
  let s = 0x9e3779b1 ^ (d * 2654435761);
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  return Array.from({ length: N }, () => Array.from({ length: d }, () => rnd()));
}
function kendallSub(xs: number[], ys: number[], cap = 260): number {
  const n = Math.min(xs.length, cap); let c = 0, d = 0;
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) {
    const a = (xs[i]! - xs[j]!) * (ys[i]! - ys[j]!); if (a > 0) c += 1; else if (a < 0) d += 1;
  }
  return (c - d) / (c + d || 1);
}
const fmt = (v: number, dg = 2) => (v >= 0 ? "+" : "") + v.toFixed(dg);

export function CopulaAuthor(props: {
  variables: CopulaVariable[];
  spec: VineSpec;
  onSpec: (spec: VineSpec) => void;
  onMarginal?: (variableIndex: number, marginal: NodeDistribution) => void;
  marginalsReadOnly?: boolean;
}) {
  const { variables, spec, onSpec } = props;
  const d = variables.length;
  const [focus, setFocus] = useState<[number, number]>([0, 0]); // focused edge [tree, edge] for the copula view

  const base = useMemo(() => seededBase(d), [d]);
  const quantiles = useMemo(() => variables.map((v) => buildDistributionQuantile(v.marginal)), [variables]);

  // sample the joint: vine → position-order uniforms → reorder to variables → apply marginals.
  // Also collect each edge's conditional-rank pseudo-observations (the copula's own arguments).
  const { uCols, dataCols, pseudoByEdge } = useMemo(() => {
    const uCols: number[][] = Array.from({ length: d }, () => []);
    const dataCols: number[][] = Array.from({ length: d }, () => []);
    const pseudoByEdge: Record<string, { u: number[]; v: number[] }> = {};
    const positionQ = spec.order.map((vi) => quantiles[vi]!);
    for (const w of base) {
      const pseudo: Record<string, [number, number]> = {};
      const { u, data } = sampleDVineModerated(spec.trees, w, positionQ, pseudo);
      for (let p = 0; p < d; p += 1) {
        const vi = spec.order[p]!;
        uCols[vi]!.push(u[p]!);
        dataCols[vi]!.push(data[p]!);
      }
      for (const key in pseudo) {
        (pseudoByEdge[key] ??= { u: [], v: [] });
        pseudoByEdge[key]!.u.push(pseudo[key]![0]);
        pseudoByEdge[key]!.v.push(pseudo[key]![1]);
      }
    }
    return { uCols, dataCols, pseudoByEdge };
  }, [base, spec, quantiles, d]);

  const edgeAt = (tree: number, edge: number): MixtureEdge => spec.trees[tree]?.[edge] ?? simpleEdge("independence", 0);
  const mutateEdge = (tree: number, edge: number, fn: (e: MixtureEdge) => MixtureEdge) => {
    const trees = spec.trees.map((t) => t.slice());
    while (trees.length <= tree) trees.push([]);
    trees[tree]![edge] = fn(trees[tree]![edge] ?? simpleEdge("independence", 0));
    onSpec({ ...spec, trees });
    setFocus([tree, edge]); // editing an edge focuses it, so the copula view follows
  };
  const setComponent = (tree: number, edge: number, ci: number, patch: { family?: CopulaFamily; rotation?: CopulaRotation; tau?: Moderation }) => mutateEdge(tree, edge, (ed) => {
    const comps = ed.components.slice();
    let comp = { ...comps[ci]!, ...(patch.family !== undefined ? { family: patch.family } : {}), ...(patch.rotation !== undefined ? { rotation: patch.rotation } : {}), ...(patch.tau !== undefined ? { tau: patch.tau } : {}) };
    if (ARCHIMEDEAN_FAMILIES.includes(comp.family) && comp.tau.by === null && comp.tau.constant < 0.02) comp = { ...comp, tau: { by: null, constant: 0.3 } };
    if (!ARCHIMEDEAN_FAMILIES.includes(comp.family)) comp = { ...comp, rotation: 0 };
    comps[ci] = comp;
    return { ...ed, components: comps };
  });
  const setEdge = (tree: number, edge: number, patch: { family?: CopulaFamily; rotation?: CopulaRotation; tau?: Moderation }) => setComponent(tree, edge, 0, patch);
  const addComponent = (tree: number, edge: number) => mutateEdge(tree, edge, (ed) => ({ components: [...ed.components, { family: "clayton", rotation: 0, tau: { by: null, constant: 0.4 } }], weights: [...ed.weights, { by: null, constant: 0 }] }));
  const removeComponent = (tree: number, edge: number, ci: number) => mutateEdge(tree, edge, (ed) => (ed.components.length <= 1 ? ed : { components: ed.components.filter((_, i) => i !== ci), weights: ed.weights.filter((_, i) => i !== ci) }));
  const setWeight = (tree: number, edge: number, ci: number, w: number) => mutateEdge(tree, edge, (ed) => { const weights = ed.weights.slice(); weights[ci] = { by: null, constant: w }; return { ...ed, weights }; });
  const swap = (p: number, q: number) => {
    if (q < 0 || q >= d) return;
    const order = spec.order.slice();
    [order[p], order[q]] = [order[q]!, order[p]!];
    onSpec({ ...spec, order }); // structure changes; keep the copulas positionally
  };
  const setDepth = (depth: number) => onSpec({ ...spec, depth: Math.max(1, Math.min(d - 1, depth)) });

  const hasDiscrete = variables.some((v) => DISCRETE_KINDS.has(v.marginal.kind));

  // Resolve the focused edge (clamped for depth/dimension changes) → its variables + pseudo-obs.
  const safeTree = Math.max(0, Math.min(focus[0], spec.depth - 1));
  const safeEdge = Math.max(0, Math.min(focus[1], d - 2 - safeTree));
  const faPos = safeEdge, fbPos = safeEdge + safeTree + 1;
  const fa = spec.order[faPos]!, fb = spec.order[fbPos]!;
  const between = spec.order.slice(faPos + 1, fbPos).map((k) => variables[k]!.name).join(", ");
  const focusPseudo = pseudoByEdge[`${safeTree}:${safeEdge}`] ?? { u: [], v: [] };

  return (
    <div className="copula-author">
      {/* the line of variables */}
      <div className="ca-line">
        {spec.order.map((vi, p) => (
          <div className="ca-chip" key={variables[vi]!.id}>
            <div className="ca-chip-reorder">
              <button onClick={() => swap(p, p - 1)} disabled={p === 0} aria-label="move left">◀</button>
              <span className="ca-chip-name">{variables[vi]!.name}</span>
              <button onClick={() => swap(p, p + 1)} disabled={p === d - 1} aria-label="move right">▶</button>
            </div>
            {props.marginalsReadOnly
              ? <div className="ca-chip-marginal">{variables[vi]!.marginal.kind}</div>
              : <select value={variables[vi]!.marginal.kind}
                  onChange={(e) => props.onMarginal?.(vi, defaultDistribution(e.target.value as NodeDistribution["kind"]))}>
                  {MARGINAL_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>}
          </div>
        ))}
      </div>

      {/* the vine trees */}
      <div className="ca-trees">
        {Array.from({ length: spec.depth }, (_, tree) => {
          const edges = d - 1 - tree;
          if (edges <= 0) return null;
          return (
            <div className="ca-tree" key={tree}>
              <div className="ca-tree-label">{tree === 0 ? "Tree 1 · direct" : `Tree ${tree + 1} · conditional`}</div>
              <div className="ca-edges">
                {Array.from({ length: edges }, (_, e) => {
                  const va = spec.order[e]!, vb = spec.order[e + tree + 1]!;
                  const between = spec.order.slice(e + 1, e + tree + 1).map((k) => variables[k]!.name).join(",");
                  const c0 = edgeAt(tree, e).components[0]!;
                  const arch = ARCHIMEDEAN_FAMILIES.includes(c0.family);
                  const active = focus[0] === tree && focus[1] === e;
                  const mk = modKindOf(c0.tau);
                  const modByPos = e + 1;                       // the nearest conditioning variable
                  const modName = variables[spec.order[modByPos]!]?.name ?? "";
                  return (
                    <div className={`ca-edge${active ? " active" : ""}`} key={e} onClick={() => setFocus([tree, e])}>
                      <div className="ca-edge-title">{variables[va]!.name} — {variables[vb]!.name}{tree > 0 && <span className="ca-cond"> | {between}</span>}</div>
                      <select value={c0.family} onClick={(ev) => ev.stopPropagation()} onChange={(ev) => setEdge(tree, e, { family: ev.target.value as CopulaFamily })}>
                        {(["independence", "gaussian", "frank", "clayton", "gumbel"] as CopulaFamily[]).map((f) => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}
                      </select>
                      {mk === "constant" ? (
                        <div className="ca-edge-tau">
                          <input type="range" min={arch ? 0.02 : -0.9} max={0.9} step={0.01} value={c0.tau.constant}
                            onClick={(ev) => ev.stopPropagation()}
                            onChange={(ev) => setEdge(tree, e, { tau: { by: null, constant: +ev.target.value } })} />
                          <span>τ {fmt(c0.tau.constant)}</span>
                        </div>
                      ) : (
                        <div className="ca-edge-tau">
                          <input type="range" min={-4} max={4} step={0.1} value={modStrength(c0.tau)}
                            onClick={(ev) => ev.stopPropagation()}
                            onChange={(ev) => setEdge(tree, e, { tau: buildModeration(mk, modByPos, +ev.target.value, c0.tau.constant) })} />
                          <span>{mk === "step" ? "±" : "slope"} {fmt(modStrength(c0.tau))}</span>
                        </div>
                      )}
                      {arch && mk === "constant" && (
                        <div className="ca-rot" onClick={(ev) => ev.stopPropagation()}>
                          {[0, 90, 180, 270].map((r) => (
                            <button key={r} className={(c0.rotation ?? 0) === r ? "on" : ""} onClick={() => setEdge(tree, e, { rotation: r as CopulaRotation })}>{r}°</button>
                          ))}
                        </div>
                      )}
                      {tree > 0 && (
                        <div className="ca-mod" onClick={(ev) => ev.stopPropagation()}>
                          <div className="ca-mod-row">
                            <span>τ&nbsp;by</span>
                            <select value={mk} onChange={(ev) => setEdge(tree, e, { tau: buildModeration(ev.target.value as ModKind, modByPos, modStrength(c0.tau), c0.tau.constant) })}>
                              <option value="constant">constant</option>
                              <option value="linear">∿ {modName} (smooth)</option>
                              <option value="step">⊐ {modName} (step)</option>
                            </select>
                          </div>
                        </div>
                      )}
                      <div className="ca-mod" onClick={(ev) => ev.stopPropagation()}>
                        {edgeAt(tree, e).components.slice(1).map((comp, i) => {
                          const ci = i + 1;
                          return (
                            <div className="ca-mod-row" key={ci} title="mixture component: family · τ · weight">
                              <select value={comp.family} onChange={(ev) => setComponent(tree, e, ci, { family: ev.target.value as CopulaFamily })}>
                                {(["gaussian", "frank", "clayton", "gumbel"] as CopulaFamily[]).map((f) => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}
                              </select>
                              <input type="range" min={ARCHIMEDEAN_FAMILIES.includes(comp.family) ? 0.02 : -0.9} max={0.9} step={0.01} value={comp.tau.constant} onChange={(ev) => setComponent(tree, e, ci, { tau: { by: null, constant: +ev.target.value } })} />
                              <input type="range" min={-3} max={3} step={0.1} value={edgeAt(tree, e).weights[ci]?.constant ?? 0} onChange={(ev) => setWeight(tree, e, ci, +ev.target.value)} />
                              <button onClick={() => removeComponent(tree, e, ci)}>×</button>
                            </div>
                          );
                        })}
                        <button className="ca-mix-add" onClick={() => addComponent(tree, e)}>+ mix a family</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="ca-depth">
          <button onClick={() => setDepth(spec.depth - 1)} disabled={spec.depth <= 1}>− fewer trees</button>
          <span>truncation K = {spec.depth} of {d - 1}</span>
          <button onClick={() => setDepth(spec.depth + 1)} disabled={spec.depth >= d - 1}>+ deeper (conditional)</button>
        </div>
        {hasDiscrete && <p className="ca-note">A discrete marginal is in play — attainable dependence is capped by the Fréchet–Hoeffding bounds, so extreme τ may not be reachable for those pairs (bound-surfacing is a follow-up).</p>}
      </div>

      {/* previews */}
      <p className="ca-note">Conditional edges can be <b>moderated</b> — set τ&nbsp;by the conditioning variable (a non-simplified vine: the sex/height case). The focused edge's density is the copula in <b>conditional-rank space</b> (the pseudo-observations F(a|D), F(b|D); moderator-averaged when moderated); the SPLOM is the <b>observable marginal</b> joint, which integrates over everything.</p>
      <div className="ca-preview">
        <div className="ca-splom-wrap">
          <div className="ca-cap">observable marginal joint — every pair, marginals applied</div>
          <Splom variables={variables} dataCols={dataCols} uCols={uCols} highlight={[Math.min(fa, fb), Math.max(fa, fb)]} />
        </div>
        <div className="ca-rank-wrap">
          <div className="ca-cap">{safeTree === 0
            ? `copula being edited — ${variables[fa]!.name} × ${variables[fb]!.name} (rank space)`
            : `conditional copula being edited — ${variables[fa]!.name} × ${variables[fb]!.name} | ${between} (conditional-rank space)`}</div>
          <RankDensity xs={focusPseudo.u} ys={focusPseudo.v} />
        </div>
      </div>
    </div>
  );
}

function Splom(props: { variables: CopulaVariable[]; dataCols: number[][]; uCols: number[][]; highlight: [number, number] }) {
  const { variables, dataCols, uCols } = props;
  const d = variables.length;
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < d; i += 1) for (let j = i + 1; j < d; j += 1) pairs.push([i, j]);
  return (
    <div className="ca-splom" style={{ gridTemplateColumns: `repeat(${Math.min(3, pairs.length)}, 1fr)` }}>
      {pairs.map(([i, j]) => {
        const xs = dataCols[i] ?? [], ys = dataCols[j] ?? [];
        const tau = kendallSub(uCols[i] ?? [], uCols[j] ?? []);
        const active = props.highlight[0] === i && props.highlight[1] === j;
        return (
          <div className={`ca-panel${active ? " active" : ""}`} key={`${i}-${j}`}>
            <div className="ca-panel-cap">{variables[i]!.name} — {variables[j]!.name} · τ {fmt(tau)}</div>
            <Scatter xs={xs} ys={ys} />
          </div>
        );
      })}
    </div>
  );
}

function domain(vals: number[]): [number, number] {
  const s = [...vals].sort((a, b) => a - b);
  const q = (p: number) => s[Math.max(0, Math.min(s.length - 1, Math.floor(p * (s.length - 1))))] ?? 0;
  const lo = q(0.02), hi = q(0.98);
  return hi > lo ? [lo, hi] : [lo - 1, lo + 1];
}
function Scatter(props: { xs: number[]; ys: number[] }) {
  const { xs, ys } = props;
  const [xl, xh] = domain(xs), [yl, yh] = domain(ys);
  const px = (v: number) => 4 + ((Math.min(xh, Math.max(xl, v)) - xl) / (xh - xl + 1e-9)) * 92;
  const py = (v: number) => 96 - ((Math.min(yh, Math.max(yl, v)) - yl) / (yh - yl + 1e-9)) * 92;
  const pts: string[] = [];
  for (let i = 0; i < xs.length; i += 2) pts.push(`${px(xs[i]!).toFixed(1)},${py(ys[i]!).toFixed(1)}`);
  return (
    <svg viewBox="0 0 100 100" className="ca-svg">
      <rect x={2} y={2} width={96} height={96} className="ca-frame" />
      {pts.map((p, i) => <circle key={i} cx={p.split(",")[0]} cy={p.split(",")[1]} r={0.7} className="ca-dot" />)}
    </svg>
  );
}
function RankDensity(props: { xs: number[]; ys: number[] }) {
  const { xs, ys } = props;
  const G = 26;
  const grid = new Float64Array(G * G); let mx = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const gi = Math.min(G - 1, Math.floor(xs[i]! * G)), gj = Math.min(G - 1, Math.floor(ys[i]! * G));
    grid[gj * G + gi]! += 1;
  }
  for (let i = 0; i < grid.length; i += 1) if (grid[i]! > mx) mx = grid[i]!;
  const cells: Array<{ x: number; y: number; o: number }> = [];
  const cw = 96 / G;
  for (let gj = 0; gj < G; gj += 1) for (let gi = 0; gi < G; gi += 1) {
    const c = grid[gj * G + gi]!; if (c <= 0) continue;
    cells.push({ x: 2 + gi * cw, y: 2 + (G - 1 - gj) * cw, o: Math.pow(c / mx, 0.55) });
  }
  return (
    <svg viewBox="0 0 100 100" className="ca-svg">
      <rect x={2} y={2} width={96} height={96} className="ca-frame" />
      {cells.map((c, i) => <rect key={i} x={c.x.toFixed(1)} y={c.y.toFixed(1)} width={cw.toFixed(2)} height={cw.toFixed(2)} className="ca-cell" fillOpacity={c.o.toFixed(3)} />)}
    </svg>
  );
}
