import { useMemo, useRef, useState } from "react";
import type { GraphDocument } from "@nudagitty/core";
import { imposedEffectContext } from "@nudagitty/core";
import { InfoDot } from "../controls";

const PAD_TIP =
  "A two-part outcome has TWO treatment coefficients — γ on the participation gate (log-odds) and δ on the amount (log-dollars) — and neither is in dollars. \"ATE = $1,794\" is one equation in two unknowns, so it does not pick a single answer: it defines a whole FAMILY of causal stories that all deliver the same dollar effect. This pad is that family. Slide along the curve to choose how much of the effect comes from MORE PEOPLE WORKING versus HIGHER PAY AMONG WORKERS — the dollar total stays exactly on target either way.";
const WALL_TIP =
  "Not a preference — a proof. The gate can at most put EVERYONE into work, so the extensive margin can never deliver more than (everyone-works mean − do(0) mean). Here that is $1,473, which is LESS than the $1,794 target. So no amount of employment effect can reach it: pay must rise by at least the floor shown, and the extensive share can never hit 100%. Anything in the grey band is unreachable.";

/**
 * The (γ, δ) manifold. One equation, two unknowns ⇒ the solution set is a CURVE, not a point — so the pad
 * draws the ATE field, the iso-ATE contour at the target, and the provably-unreachable band, and lets you
 * pick a point ON the curve. All the math comes from imposedEffectContext(), the same code the engine uses
 * to derive the coefficients — so what you see is literally what the DGP does.
 */
export function ImposedEffectPad(props: {
  document: GraphDocument;
  edgeId: string;
  onShare: (share: number) => void;
}) {
  const ctx = useMemo(() => imposedEffectContext(props.document), [props.document]);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Only on the edge that CARRIES the imposed effect, and only when it genuinely splits across two margins
  // (for an additive outcome the coefficient simply IS the ATE — nothing to choose).
  if (!ctx || ctx.family !== "two_part" || ctx.edgeId !== props.edgeId) return null;

  const share = props.document.metadata.imposedEffect?.extensiveShare ?? 0;
  const maxShare = ctx.maxExtensiveShare;
  const current = ctx.solve(share);
  const shown = ctx.solve(hover ?? share);

  // ---- geometry ----
  const W = 260, H = 176, mL = 40, mR = 10, mT = 24, mB = 34;
  const plotW = W - mL - mR, plotH = H - mT - mB;
  // γ spans 0 → the γ that reaches the feasibility limit; δ spans a little below the floor to the
  // all-intensive end (γ=0), so the whole reachable curve is on screen with the grey band visible.
  const gMax = Math.max(1e-6, ctx.solve(maxShare).gamma * 1.15 + 0.4);
  const dTop = ctx.deltaFor(0) * 1.08;                    // all-intensive: the highest δ on the curve
  const dBot = Math.min(ctx.deltaFloor * 0.55, ctx.deltaFloor - (dTop - ctx.deltaFloor) * 0.18);
  const x = (g: number) => mL + (g / gMax) * plotW;
  const y = (d: number) => mT + (1 - (d - dBot) / Math.max(1e-9, dTop - dBot)) * plotH;
  const gOfX = (px: number) => Math.max(0, Math.min(gMax, ((px - mL) / plotW) * gMax));

  // ---- the iso-ATE contour (closed form: δ(γ) = ln((C₀+A)/S(γ))) ----
  const STEPS = 56;
  const contour: Array<[number, number]> = [];
  for (let i = 0; i <= STEPS; i += 1) {
    const g = (i / STEPS) * gMax;
    contour.push([x(g), y(ctx.deltaFor(g))]);
  }
  const contourPath = contour.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");

  // ---- the ATE field behind it (coarse; just enough to read "which way is more/less") ----
  const COLS = 22, ROWS = 14;
  const cells: Array<{ px: number; py: number; w: number; h: number; over: boolean }> = [];
  for (let c = 0; c < COLS; c += 1) {
    for (let r = 0; r < ROWS; r += 1) {
      const g = ((c + 0.5) / COLS) * gMax;
      const d = dBot + (1 - (r + 0.5) / ROWS) * (dTop - dBot);
      const ate = Math.exp(d) * ctx.s(g) - ctx.c0;
      cells.push({ px: mL + (c / COLS) * plotW, py: mT + (r / ROWS) * plotH, w: plotW / COLS + 0.6, h: plotH / ROWS + 0.6, over: ate > ctx.target });
    }
  }

  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const money = (v: number) => `$${Math.round(v).toLocaleString()}`;
  const p0 = ctx.decompose(0, 0); // baseline (for the participation readout we recompute below)
  void p0;

  // participation under the shown point
  const partAt = (gamma: number) => {
    // S(γ)/Amax is a weighted participation; report the plain mean σ(ηg+γ) instead via the contract:
    // we don't have ηg here, so use the S ratio, which is the participation weighted by earnings — the
    // quantity that actually drives the dollars. Labelled as such.
    return ctx.s(gamma) / Math.max(1e-9, ctx.amax);
  };

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const g = gOfX(px);
    // LOCKED mode: the handle is constrained to the contour, so a 2-D drag is really a 1-D choice —
    // which is exactly the truth of the situation (one equation, two unknowns ⇒ one degree of freedom).
    const s = Math.min(maxShare, Math.max(0, (ctx.s(g) - ctx.c0) / ctx.target));
    return s;
  };

  return (
    <div className="imposed-pad">
      <div className="imposed-pad-head">
        <strong>Imposed effect: {money(ctx.target)}<InfoDot tip={PAD_TIP} /></strong>
        <span className="muted">one target · many stories</span>
      </div>

      <svg
        ref={svgRef}
        className="imposed-pad-svg"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="imposed effect manifold"
        onPointerMove={(e) => { const s = onPointer(e); if (s !== undefined) setHover(s); }}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => { const s = onPointer(e); if (s !== undefined) props.onShare(s); }}
      >
        {/* ATE field: is this point above or below the target? */}
        {cells.map((c, i) => (
          <rect key={i} x={c.px} y={c.py} width={c.w} height={c.h} className={c.over ? "ipad-field-over" : "ipad-field-under"} />
        ))}

        {/* the PROVABLY unreachable band: δ below the floor cannot hit the target for ANY γ */}
        <rect x={mL} y={y(ctx.deltaFloor)} width={plotW} height={Math.max(0, mT + plotH - y(ctx.deltaFloor))} className="ipad-infeasible" />
        <line x1={mL} y1={y(ctx.deltaFloor)} x2={W - mR} y2={y(ctx.deltaFloor)} className="ipad-floor" />

        {/* axes */}
        <line x1={mL} y1={mT} x2={mL} y2={mT + plotH} className="resid-axis" />
        <line x1={mL} y1={mT + plotH} x2={W - mR} y2={mT + plotH} className="resid-axis" />

        {/* the iso-ATE contour — every point on it delivers EXACTLY the target */}
        <path d={contourPath} className="ipad-contour" />

        {/* the chosen point */}
        <circle cx={x(shown.gamma)} cy={y(shown.delta)} r={4} className="ipad-handle" />

        {/* labels */}
        <text x={mL} y={mT - 8} className="resid-axlabel">pay effect ↑</text>
        <text x={W - mR} y={mT + plotH + 12} className="resid-tick" textAnchor="end">employment effect →</text>
        <text x={mL - 4} y={y(ctx.deltaFloor) + 3} className="resid-tick" textAnchor="end">{pct(Math.exp(ctx.deltaFloor) - 1)}</text>
        <text x={mL - 4} y={y(ctx.deltaFor(0)) + 3} className="resid-tick" textAnchor="end">{pct(Math.exp(ctx.deltaFor(0)) - 1)}</text>
        <text x={mL + plotW / 2} y={H - 3} className="resid-axlabel" textAnchor="middle">
          grey = unreachable<InfoDot tip={WALL_TIP} />
        </text>
      </svg>

      {/* the honest 1-DOF control: the SHARE, not the Greek letters */}
      <label className="imposed-share">
        <span>from more people working</span>
        <input
          type="range"
          min={0}
          max={Math.max(0.001, maxShare)}
          step={0.005}
          value={Math.min(share, maxShare)}
          onChange={(e) => props.onShare(Number(e.target.value))}
        />
        <b>{pct(current.extensiveShare)}</b>
      </label>

      <div className="imposed-readout">
        <div><span>employment</span><b>{pct(partAt(0))} → {pct(partAt(shown.gamma))}</b></div>
        <div><span>pay among workers</span><b>+{pct(Math.exp(shown.delta) - 1)}</b></div>
        <div><span>from working</span><b>{money(shown.extensive)}</b></div>
        <div><span>from pay</span><b>{money(shown.intensive)}</b></div>
      </div>
      <p className="muted imposed-foot">
        Max {pct(maxShare)} can come from employment — putting <i>everyone</i> into work yields only{" "}
        {money(ctx.amax - ctx.c0)}, short of the {money(ctx.target)} target, so pay must rise at least{" "}
        {pct(Math.exp(ctx.deltaFloor) - 1)}. γ&nbsp;=&nbsp;{shown.gamma.toFixed(3)} (log-odds),
        δ&nbsp;=&nbsp;{shown.delta.toFixed(4)} (log-$) are <b>derived</b>, never typed.
      </p>
    </div>
  );
}
