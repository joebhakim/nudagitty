import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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

// --- "atom confession" helpers: what discrete/atomic marginals hide ---
// τ_b (tie-corrected Kendall's τ) of the GENERATED data — the achieved rank association, which
// atoms compress below the latent copula τ.
function kendallB(xs: number[], ys: number[], cap = 320): number {
  const n = Math.min(xs.length, ys.length, cap);
  let c = 0, d = 0, xt = 0, yt = 0;
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) {
    const a = xs[i]! - xs[j]!, b = ys[i]! - ys[j]!;
    if (a === 0 && b === 0) continue;
    if (a === 0) { xt += 1; continue; }
    if (b === 0) { yt += 1; continue; }
    if (a * b > 0) c += 1; else d += 1;
  }
  return (c - d) / (Math.sqrt((c + d + yt) * (c + d + xt)) || 1);
}
function distinctCount(xs: number[], cap = 800): number {
  const s = new Set<number>();
  for (let i = 0; i < Math.min(xs.length, cap); i += 1) s.add(Math.round(xs[i]! * 1e6));
  return s.size;
}
// Max attainable Pearson correlation between two binaries with means p, q (the discrete Fréchet bound).
function frechetCapBinary(p: number, q: number): number {
  return (Math.min(p, q) - p * q) / (Math.sqrt(p * (1 - p) * q * (1 - q)) || 1);
}
function hiFraction(xs: number[]): number {
  let mx = -Infinity; for (const v of xs) if (v > mx) mx = v;
  let c = 0; for (const v of xs) if (v === mx) c += 1;
  return c / (xs.length || 1);
}

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
  const [confess, setConfess] = useState(false); // reveal what atomic marginals hide
  // trivariate view — three freely-chosen variables at once (only meaningful for d ≥ 3)
  const [axes3, setAxes3] = useState<[number, number, number]>([0, 1, 2]);
  const [space3, setSpace3] = useState<"data" | "rank">("data");
  const [mode3, setMode3] = useState<"points" | "density">("points");

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
          <div className="ca-cap">observable marginal joint — every pair, marginals applied
            <button className="ca-confess-btn" onClick={() => setConfess((c) => !c)}>{confess ? "hide" : "⚠ what the atoms hide"}</button>
          </div>
          {confess && <p className="ca-note ca-confess-note">Atoms confess: where a marginal has point masses (binary / count / categorical), Sklar's copula is <b>unidentified</b> across the gaps — for a binary pair, everything but one grid point. Generatively that free region is <b>invisible</b> (NORTA reads the copula only at grid values), so the DGP is unambiguous — but the authored τ is a <b>latent</b> knob the atoms compress. Below, <b>got</b> is the achieved association (Kendall τ<sub>b</sub> of the generated data); <b>cap</b> is the Fréchet bound — the most a binary pair's marginals allow.</p>}
          <Splom variables={variables} dataCols={dataCols} uCols={uCols} highlight={[Math.min(fa, fb), Math.max(fa, fb)]} confess={confess} />
        </div>
        <div className="ca-rank-wrap">
          <div className="ca-cap">{safeTree === 0
            ? `copula being edited — ${variables[fa]!.name} × ${variables[fb]!.name} (rank space)`
            : `conditional copula being edited — ${variables[fa]!.name} × ${variables[fb]!.name} | ${between} (conditional-rank space)`}</div>
          <RankDensity xs={focusPseudo.u} ys={focusPseudo.v} />
        </div>
      </div>

      {/* trivariate solid view — three variables at once (fixed isometric, hand-rolled canvas) */}
      {d >= 3 && (() => {
        const clamp = (i: number) => Math.max(0, Math.min(d - 1, i));
        const [ix, iy, iz] = [clamp(axes3[0]), clamp(axes3[1]), clamp(axes3[2])] as const;
        const cols3 = space3 === "rank" ? uCols : dataCols;
        const setAxis = (slot: 0 | 1 | 2, vi: number) => setAxes3((a) => { const n = [...a] as [number, number, number]; n[slot] = vi; return n; });
        const axisSelect = (slot: 0 | 1 | 2, cur: number, glyph: string) => (
          <label className="ca-solid-axis"><span className={`ca-solid-axistag ax${slot}`}>{glyph}</span>
            <select value={cur} onChange={(ev) => setAxis(slot, +ev.target.value)}>
              {variables.map((v, k) => <option key={v.id} value={k}>{v.name}</option>)}
            </select>
          </label>
        );
        return (
          <div className="ca-solid">
            <div className="ca-cap">trivariate view — three variables at once, {space3 === "rank" ? "rank" : "data"} space · drag to rotate</div>
            <div className="ca-solid-controls">
              {axisSelect(0, ix, "X")}{axisSelect(1, iy, "Y")}{axisSelect(2, iz, "Z")}
              <div className="ca-solid-toggle" role="group" aria-label="space">
                <button className={space3 === "data" ? "on" : ""} onClick={() => setSpace3("data")}>data</button>
                <button className={space3 === "rank" ? "on" : ""} onClick={() => setSpace3("rank")}>rank</button>
              </div>
              <div className="ca-solid-toggle" role="group" aria-label="representation">
                <button className={mode3 === "points" ? "on" : ""} onClick={() => setMode3("points")}>points</button>
                <button className={mode3 === "density" ? "on" : ""} onClick={() => setMode3("density")}>density</button>
              </div>
            </div>
            <Trivariate3D
              nameX={variables[ix]!.name} nameY={variables[iy]!.name} nameZ={variables[iz]!.name}
              xs={cols3[ix] ?? []} ys={cols3[iy] ?? []} zs={cols3[iz] ?? []}
              space={space3} mode={mode3}
            />
            <p className="ca-note">The 2D panels are shadows of this cube. <b>Data space</b> shows the realistic joint (marginals applied); <b>rank space</b> is the unit cube of pure dependence (the copula). <b>Density</b> bins the cloud into depth-sorted voxels. <b>Drag</b> to rotate; ⟳ resets to isometric.</p>
          </div>
        );
      })()}
    </div>
  );
}

function Splom(props: { variables: CopulaVariable[]; dataCols: number[][]; uCols: number[][]; highlight: [number, number]; confess: boolean }) {
  const { variables, dataCols, uCols, confess } = props;
  const d = variables.length;
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < d; i += 1) for (let j = i + 1; j < d; j += 1) pairs.push([i, j]);
  return (
    <div className="ca-splom" style={{ gridTemplateColumns: `repeat(${Math.min(3, pairs.length)}, 1fr)` }}>
      {pairs.map(([i, j]) => {
        const xs = dataCols[i] ?? [], ys = dataCols[j] ?? [];
        const tau = kendallSub(uCols[i] ?? [], uCols[j] ?? []);
        const di = distinctCount(xs), dj = distinctCount(ys);
        const atomic = di < 15 || dj < 15;
        const cap = di === 2 && dj === 2 ? frechetCapBinary(hiFraction(xs), hiFraction(ys)) : null;
        const active = props.highlight[0] === i && props.highlight[1] === j;
        return (
          <div className={`ca-panel${active ? " active" : ""}`} key={`${i}-${j}`}>
            <div className="ca-panel-cap">{variables[i]!.name} — {variables[j]!.name} · τ {fmt(tau)}
              {confess && atomic && <span className="ca-confess"> → got {fmt(kendallB(xs, ys))}{cap !== null ? ` · cap ${fmt(cap)}` : ""}</span>}
            </div>
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

// --- trivariate solid view: hand-rolled canvas 3D (no WebGL dep) ---
// Fixed isometric projection (yaw/pitch are constants but factored so drag-rotation is a small
// follow-up). Points get depth cueing (nearer = bigger/darker); density bins into depth-sorted
// voxel splats. Each axis is normalized to [0,1] — rank space is already there, data space via a
// robust 2–98% domain so outliers don't flatten the cloud.
const ISO_YAW = -0.62;   // rotate about the vertical (up) axis
const ISO_PITCH = 0.5;   // tilt the camera down
function normAxis(vals: number[], rank: boolean): number[] {
  if (rank) return vals;
  const [lo, hi] = domain(vals);
  const span = hi - lo + 1e-9;
  return vals.map((v) => Math.min(1, Math.max(0, (v - lo) / span)));
}
function Trivariate3D(props: {
  nameX: string; nameY: string; nameZ: string;
  xs: number[]; ys: number[]; zs: number[];
  space: "data" | "rank"; mode: "points" | "density";
}) {
  const { xs, ys, zs, space, mode } = props;
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [rot, setRot] = useState<{ yaw: number; pitch: number }>({ yaw: ISO_YAW, pitch: ISO_PITCH });
  const drag = useRef<{ x: number; y: number } | null>(null);

  // normalize once per data/space change — dragging re-renders shouldn't redo the sort.
  const norm = useMemo(() => {
    const rank = space === "rank";
    const nx = normAxis(xs, rank), ny = normAxis(ys, rank), nz = normAxis(zs, rank);
    return { nx, ny, nz, n: Math.min(nx.length, ny.length, nz.length) };
  }, [xs, ys, zs, space]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.clientWidth || 360;
    const H = canvas.clientHeight || 360;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const cs = getComputedStyle(canvas);
    const accent = cs.getPropertyValue("--ca-accent").trim() || "#2f7d6b";
    const line = cs.getPropertyValue("--ca-line").trim() || "#e2e5e9";
    const muted = cs.getPropertyValue("--ca-muted").trim() || "#5a6670";

    const { nx, ny, nz, n } = norm;

    // projection: world coords x=right, y=up, z=toward-viewer; centered cube [-0.5,0.5]³.
    const cy = Math.cos(rot.yaw), sy = Math.sin(rot.yaw), cp = Math.cos(rot.pitch), sp = Math.sin(rot.pitch);
    const pad = 30;
    const scale = (Math.min(W, H) * 0.5 - pad) / 0.78;
    const ox = W / 2, oy = H / 2;
    // (worldX, worldY-up, worldZ-depth) ← we map var0→x, var2→up, var1→depth so all three read clearly.
    const project = (wx: number, wyUp: number, wzDepth: number) => {
      const x1 = wx * cy + wzDepth * sy;
      const z1 = -wx * sy + wzDepth * cy;
      const y2 = wyUp * cp - z1 * sp;
      const z2 = wyUp * sp + z1 * cp;
      return { sx: ox + scale * x1, sy: oy - scale * y2, depth: z2 };
    };
    const p3 = (a: number, b: number, c: number) => project(a - 0.5, c - 0.5, b - 0.5); // (var0, var1, var2)

    // wireframe cube — draw edges, back edges fainter.
    const corners: Array<[number, number, number]> = [];
    for (const a of [0, 1]) for (const b of [0, 1]) for (const c of [0, 1]) corners.push([a, b, c]);
    const proj = corners.map(([a, b, c]) => p3(a, b, c));
    let dLo = Infinity, dHi = -Infinity;
    for (const p of proj) { if (p.depth < dLo) dLo = p.depth; if (p.depth > dHi) dHi = p.depth; }
    const dt = (depth: number) => (depth - dLo) / (dHi - dLo + 1e-9);
    const edges: Array<[number, number]> = [];
    for (let i = 0; i < 8; i += 1) for (let j = i + 1; j < 8; j += 1) {
      const diff = (corners[i]![0] !== corners[j]![0] ? 1 : 0) + (corners[i]![1] !== corners[j]![1] ? 1 : 0) + (corners[i]![2] !== corners[j]![2] ? 1 : 0);
      if (diff === 1) edges.push([i, j]);
    }
    ctx.lineWidth = 1;
    for (const [i, j] of edges) {
      const a = proj[i]!, b = proj[j]!;
      ctx.strokeStyle = line;
      ctx.globalAlpha = 0.35 + 0.5 * dt((a.depth + b.depth) / 2);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // axis labels at the far end of the three edges from the origin corner (0,0,0).
    const origin = p3(0, 0, 0);
    const label = (end: { sx: number; sy: number }, text: string, tag: string) => {
      const lx = end.sx + (end.sx - origin.sx) * 0.12;
      const ly = end.sy + (end.sy - origin.sy) * 0.12;
      ctx.font = "600 11px -apple-system, system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = muted;
      ctx.fillText(`${tag} ${text}`, lx, ly);
    };
    label(p3(1, 0, 0), props.nameX, "X");
    label(p3(0, 1, 0), props.nameY, "Y");
    label(p3(0, 0, 1), props.nameZ, "Z");

    if (mode === "points") {
      const pts = [];
      for (let i = 0; i < n; i += 1) pts.push(p3(nx[i]!, ny[i]!, nz[i]!));
      pts.sort((a, b) => a.depth - b.depth); // far → near
      ctx.fillStyle = accent;
      for (const p of pts) {
        const t = dt(p.depth);
        ctx.globalAlpha = 0.18 + 0.42 * t;
        const r = 1.1 + 1.7 * t;
        ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      // voxel density: bin into G³, splat non-empty cells back-to-front, alpha ∝ density.
      const G = 12;
      const counts = new Map<number, number>();
      let mx = 0;
      for (let i = 0; i < n; i += 1) {
        const gi = Math.min(G - 1, Math.floor(nx[i]! * G));
        const gj = Math.min(G - 1, Math.floor(ny[i]! * G));
        const gk = Math.min(G - 1, Math.floor(nz[i]! * G));
        const key = (gi * G + gj) * G + gk;
        const c = (counts.get(key) ?? 0) + 1; counts.set(key, c);
        if (c > mx) mx = c;
      }
      const voxels: Array<{ sx: number; sy: number; depth: number; o: number }> = [];
      for (const [key, c] of counts) {
        const gk = key % G, gj = Math.floor(key / G) % G, gi = Math.floor(key / (G * G));
        const p = p3((gi + 0.5) / G, (gj + 0.5) / G, (gk + 0.5) / G);
        voxels.push({ sx: p.sx, sy: p.sy, depth: p.depth, o: Math.pow(c / mx, 0.6) });
      }
      voxels.sort((a, b) => a.depth - b.depth);
      const vs = (scale / G) * 1.25;
      ctx.fillStyle = accent;
      for (const v of voxels) {
        ctx.globalAlpha = Math.min(0.85, 0.06 + 0.7 * v.o);
        ctx.fillRect(v.sx - vs / 2, v.sy - vs / 2, vs, vs);
      }
      ctx.globalAlpha = 1;
    }
  }, [norm, rot, mode, props.nameX, props.nameY, props.nameZ]);

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setRot((r) => ({ yaw: r.yaw + dx * 0.012, pitch: Math.max(-1.45, Math.min(1.45, r.pitch - dy * 0.012)) }));
  };
  const onUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  };
  const reset = () => setRot({ yaw: ISO_YAW, pitch: ISO_PITCH });

  return (
    <div className="ca-solid-canvas-wrap">
      <canvas ref={ref} className="ca-solid-canvas"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      <button className="ca-solid-reset" onClick={reset} title="reset to isometric" aria-label="reset view">⟳</button>
    </div>
  );
}
