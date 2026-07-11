import type React from "react";
import { useMemo, useRef, useState } from "react";
import type { GraphDocument, ImposedEffect } from "@nudagitty/core";
import { imposedEffectContext } from "@nudagitty/core";
import { Checkbox, InfoDot } from "../controls";

const PAD_TIP =
  "A two-part outcome has TWO treatment coefficients — γ on the participation gate (log-odds) and δ on the amount (log-dollars) — and neither is in dollars. \"ATE = $1,794\" is ONE equation in TWO unknowns, so it does not pick a single answer: it defines a whole FAMILY of causal stories that all deliver the same dollar effect. This pad IS that family. Slide along the curve to choose how much of the effect comes from MORE PEOPLE WORKING versus HIGHER PAY AMONG WORKERS — the dollar total stays exactly on target either way. (With an additive outcome none of this arises: the coefficient simply IS the ATE.)";
const WALL_TIP =
  "Not a preference — a proof. The gate can at most put EVERYONE into work, so the extensive margin can never deliver more than (everyone-works mean − do(0) mean). Here that is $1,473, LESS than the $1,794 target. So no amount of employment effect can reach it: pay must rise by at least the floor shown, and the extensive share can never hit 100%. Everything in the grey band is unreachable, for any γ.";
const LOCK_TIP =
  "Locked: you author the ESTIMAND (the dollar target + how the story splits) and the engine derives γ and δ — the handle can only move along the curve, because that curve IS every DGP consistent with your target. Unlocked: you drag anywhere and the ATE becomes whatever that point implies. Even then you are still authoring an estimand, not coefficients — the target and the split are read off the point you chose, and the coefficients are re-derived from them.";

const FIT_TRAP_TIP =
  "Fitting an edge means LEARNING its coefficient from the data. That is right for a confounder → outcome edge. It is wrong for the exposure → outcome edge, because what the data contains there is the CONFOUNDED association — the very thing you are trying to correct. Fit it and you learn the bias, then hand it to the simulator as if it were the causal mechanism: do() will faithfully report your confounding back to you, and there is no imposed truth left to recover. Author it (or impose an effect) instead.";

/**
 * The exposure → outcome edge must never be FITTED. This is the trap a real user fell into: they fitted it,
 * learned the confounded association (a −34% "effect" on log-earnings), and then had nothing to recover —
 * their DGP's do() simply replayed the bias. The UI made "fit everything" the easy path and said nothing.
 * Now it says something, and offers the one-click fix.
 */
export function EffectEdgeFitWarning(props: {
  document: GraphDocument;
  edge: { id: string; source: string; target: string };
  onAuthor: (key: string) => void;
}) {
  const nodes = props.document.graph.nodes;
  const isExposure = nodes.find((n) => n.id === props.edge.source)?.roles?.exposure;
  const isOutcome = nodes.find((n) => n.id === props.edge.target)?.roles?.outcome;
  const key = `e:${props.edge.id}`;
  const fitted = props.document.metadata.pins?.includes(key);
  if (!isExposure || !isOutcome || !fitted) return null;
  return (
    <div className="effect-fit-warning">
      <strong>⚠ This effect is being <em>fitted</em> from the data{<InfoDot tip={FIT_TRAP_TIP} href="/effects.html#trap" />}</strong>
      <p>
        It is the <b>exposure → outcome</b> edge, so what the data holds there is the <b>confounded
        association</b>, not the causal effect. Fitting it teaches the simulator your bias — <code>do()</code>{" "}
        will just hand it back, and there is no imposed truth to recover.
      </p>
      <button type="button" onClick={() => props.onAuthor(key)}>Author it instead</button>
    </div>
  );
}

/**
 * The (γ, δ) manifold. One equation, two unknowns ⇒ the solution set is a CURVE, not a point. The pad draws
 * the ATE field, the iso-ATE contour at the target, and the provably-unreachable band, and lets you pick a
 * point on (or, unlocked, off) the curve. Every number comes from imposedEffectContext() — the same code the
 * engine uses to derive the coefficients — so what you see is literally what the DGP does.
 */
export function ImposedEffectPad(props: {
  document: GraphDocument;
  edgeId: string;
  onChange: (patch: Partial<ImposedEffect>) => void;
}) {
  const ctx = useMemo(() => imposedEffectContext(props.document), [props.document]);
  const [locked, setLocked] = useState(true);
  const [preview, setPreview] = useState<{ gamma: number; delta: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Only on the edge that CARRIES the imposed effect, and only when it genuinely splits across two margins
  // (for an additive outcome the coefficient simply IS the ATE — there is nothing to choose).
  if (!ctx || ctx.family !== "two_part" || ctx.edgeId !== props.edgeId) return null;

  const share = props.document.metadata.imposedEffect?.extensiveShare ?? 0;
  const maxShare = ctx.maxExtensiveShare;
  const committed = ctx.solve(share);
  const at = preview ?? committed;
  const shownAte = Math.exp(at.delta) * ctx.s(at.gamma) - ctx.c0;
  const shownSplit = ctx.decompose(at.gamma, at.delta);

  // ---- geometry ----
  const W = 260, H = 178, mL = 42, mR = 10, mT = 24, mB = 34;
  const plotW = W - mL - mR, plotH = H - mT - mB;
  const gMax = Math.max(1e-6, ctx.solve(maxShare).gamma * 1.15 + 0.4);
  const dTop = ctx.deltaFor(0) * 1.10;                                     // all-intensive end (highest δ)
  const dBot = Math.min(ctx.deltaFloor * 0.5, ctx.deltaFloor - (dTop - ctx.deltaFloor) * 0.2);
  const x = (g: number) => mL + (g / gMax) * plotW;
  const y = (d: number) => mT + (1 - (d - dBot) / Math.max(1e-9, dTop - dBot)) * plotH;
  const gOfX = (px: number) => Math.max(0, Math.min(gMax, ((px - mL) / plotW) * gMax));
  const dOfY = (py: number) => dBot + (1 - (py - mT) / plotH) * (dTop - dBot);

  // ---- the iso-ATE contour: δ(γ) = ln((C₀+A)/S(γ)), in closed form ----
  const STEPS = 56;
  const contourPath = Array.from({ length: STEPS + 1 }, (_, i) => {
    const g = (i / STEPS) * gMax;
    return `${i === 0 ? "M" : "L"}${x(g).toFixed(1)} ${y(ctx.deltaFor(g)).toFixed(1)}`;
  }).join(" ");

  // ---- the ATE field behind it (faint: the CONTOUR is the message) ----
  const COLS = 22, ROWS = 14;
  const cells: Array<{ px: number; py: number; w: number; h: number; over: boolean }> = [];
  for (let c = 0; c < COLS; c += 1) {
    for (let r = 0; r < ROWS; r += 1) {
      const g = ((c + 0.5) / COLS) * gMax;
      const d = dBot + (1 - (r + 0.5) / ROWS) * (dTop - dBot);
      cells.push({
        px: mL + (c / COLS) * plotW, py: mT + (r / ROWS) * plotH,
        w: plotW / COLS + 0.6, h: plotH / ROWS + 0.6,
        over: Math.exp(d) * ctx.s(g) - ctx.c0 > ctx.target
      });
    }
  }

  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const money = (v: number) => `$${Math.round(v).toLocaleString()}`;
  const participation = (gamma: number) => ctx.s(gamma) / Math.max(1e-9, ctx.amax); // earnings-weighted

  const pointAt = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const gamma = gOfX(((e.clientX - rect.left) / rect.width) * W);
    if (locked) return { gamma, delta: ctx.deltaFor(gamma) }; // constrained to the curve
    const delta = Math.max(dBot, Math.min(dTop, dOfY(((e.clientY - rect.top) / rect.height) * H)));
    return { gamma, delta };
  };

  // Committing a point NEVER stores coefficients. Locked: re-author the split. Unlocked: read the target AND
  // the split off the chosen point and re-author BOTH — the engine still derives γ/δ from that estimand.
  // The ESTIMAND round-trips exactly (you get the dollar effect and the split you chose); the coefficients
  // may land a hair off the point you dragged to, because the new δ shifts the offset the confounders are fit
  // against. That is the system working: the estimand is the truth, the coefficient is just its encoding.
  const commitPoint = (p: { gamma: number; delta: number }) => {
    if (locked) {
      props.onChange({ extensiveShare: Math.min(maxShare, Math.max(0, (ctx.s(p.gamma) - ctx.c0) / ctx.target)) });
      return;
    }
    const ate = Math.exp(p.delta) * ctx.s(p.gamma) - ctx.c0;
    if (!(ate > 1e-6)) return; // a non-positive ATE has no meaningful split — refuse rather than fake one
    const d = ctx.decompose(p.gamma, p.delta);
    props.onChange({ target: ate, extensiveShare: Math.min(1, Math.max(0, d.extensive / ate)) });
  };

  const offTarget = Math.abs(shownAte - ctx.target) > Math.max(1, ctx.target * 0.002);

  return (
    <div className="imposed-pad">
      <div className="imposed-pad-head">
        <strong>Imposed effect{<InfoDot tip={PAD_TIP} href="/effects.html#family" />}</strong>
        <span className={offTarget ? "imposed-ate-off" : "muted"}>
          {money(shownAte)}{offTarget ? " (off target)" : " · one target, many stories"}
        </span>
      </div>

      <svg
        ref={svgRef}
        className="imposed-pad-svg"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="imposed effect manifold"
        onPointerMove={(e) => setPreview(pointAt(e))}
        onPointerLeave={() => setPreview(null)}
        onPointerDown={(e) => { const p = pointAt(e); if (p) commitPoint(p); }}
      >
        {cells.map((c, i) => (
          <rect key={i} x={c.px} y={c.py} width={c.w} height={c.h} className={c.over ? "ipad-field-over" : "ipad-field-under"} />
        ))}

        {/* PROVABLY unreachable: S(γ) ≤ Amax ⇒ no γ can hit the target below the δ floor */}
        <rect x={mL} y={y(ctx.deltaFloor)} width={plotW} height={Math.max(0, mT + plotH - y(ctx.deltaFloor))} className="ipad-infeasible" />
        <line x1={mL} y1={y(ctx.deltaFloor)} x2={W - mR} y2={y(ctx.deltaFloor)} className="ipad-floor" />

        <line x1={mL} y1={mT} x2={mL} y2={mT + plotH} className="resid-axis" />
        <line x1={mL} y1={mT + plotH} x2={W - mR} y2={mT + plotH} className="resid-axis" />

        {/* every point on this curve delivers EXACTLY the target */}
        <path d={contourPath} className="ipad-contour" />
        <circle cx={x(at.gamma)} cy={y(at.delta)} r={4} className={offTarget ? "ipad-handle off" : "ipad-handle"} />

        <text x={mL - 4} y={mT + 8} className="resid-axlabel" textAnchor="end">pay</text>
        <text x={mL - 4} y={y(ctx.deltaFor(0)) + 3} className="resid-tick" textAnchor="end">{pct(Math.exp(ctx.deltaFor(0)) - 1)}</text>
        <text x={mL - 4} y={y(ctx.deltaFloor) + 3} className="resid-tick" textAnchor="end">{pct(Math.exp(ctx.deltaFloor) - 1)}</text>
        <text x={W - mR} y={mT + plotH + 12} className="resid-tick" textAnchor="end">employment →</text>
        <text x={mL + plotW / 2} y={H - 3} className="resid-axlabel" textAnchor="middle">grey = unreachable{<InfoDot tip={WALL_TIP} href="/effects.html#wall" />}</text>
      </svg>

      <div className="imposed-lock">
        <Checkbox label="hold the effect at target" checked={locked} onChange={setLocked} />
        <InfoDot tip={LOCK_TIP} href="/effects.html#estimand" />
      </div>

      {locked && (
        <label className="imposed-share">
          <span>from more people working</span>
          <input
            type="range" min={0} max={Math.max(0.001, maxShare)} step={0.005}
            value={Math.min(share, maxShare)}
            onChange={(e) => props.onChange({ extensiveShare: Number(e.target.value) })}
          />
          <b>{pct(committed.extensiveShare)}</b>
        </label>
      )}

      <div className="imposed-readout">
        <div><span>employment</span><b>{pct(participation(0))} → {pct(participation(at.gamma))}</b></div>
        <div><span>pay at work</span><b>+{pct(Math.exp(at.delta) - 1)}</b></div>
        <div><span>from working</span><b>{money(shownSplit.extensive)}</b></div>
        <div><span>from pay</span><b>{money(shownSplit.intensive)}</b></div>
      </div>

      <p className="muted imposed-foot">
        At most {pct(maxShare)} can come from employment — putting <i>everyone</i> into work yields only{" "}
        {money(ctx.amax - ctx.c0)}, short of {money(ctx.target)}, so pay must rise ≥&nbsp;{pct(Math.exp(ctx.deltaFloor) - 1)}.
        {" "}γ&nbsp;=&nbsp;{at.gamma.toFixed(3)} (log-odds), δ&nbsp;=&nbsp;{at.delta.toFixed(4)} (log-$) are{" "}
        <b>derived</b> from the estimand — never typed.
      </p>
    </div>
  );
}
