import type React from "react";
import { useMemo, useRef, useState } from "react";
import type { GraphDocument, ImposedEffect } from "@nudagitty/core";
import { dataImpliedEffect, imposableEffect, imposedEffectContext, suggestImposedShare } from "@nudagitty/core";
import { Checkbox, InfoDot } from "../controls";

export interface ImposeSpec { exposure: string; outcome: string; target: number; extensiveShare?: number }

const PAD_TIP =
  "A two-part outcome has TWO treatment coefficients — γ on the participation gate (log-odds) and δ on the amount (dollars per worker on an identity link, log-dollars on a log link). \"ATE = $1,794\" is ONE equation in TWO unknowns, so it does not pick a single answer: it defines a whole FAMILY of causal stories that all deliver the same dollar effect. This pad IS that family. Slide along the curve to choose how much of the effect comes from MORE PEOPLE WORKING versus HIGHER PAY AMONG WORKERS — the dollar total stays exactly on target either way. (With an additive outcome none of this arises: the coefficient simply IS the ATE.)";
const WALL_TIP =
  "Not a preference — a proof. The gate can at most put EVERYONE into work, so the extensive margin can never deliver more than (everyone-works mean − do(0) mean). Everything in the grey band is unreachable, for ANY γ: no employment effect can get there, and pay must make up the difference. Whether the wall BINDS depends on your target. On the corrected LaLonde DGP the ceiling is $1,835, which sits just ABOVE the $1,794 benchmark — so employment alone could in principle do all of it, and the band is empty. Ask for $4,000 and the wall bites. (An earlier version of this example put the ceiling at $1,473 and made a great deal of the wall being unreachable. That was an artefact of a log link on dollar-valued regressors — a modelling error, not a fact about job training. See docs/lalonde-specification.md.)";
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

const IMPOSE_TIP =
  "Fitting this edge is a MULTIPLE regression on every other pinned parent, so its coefficient is the ADJUSTED association — which, under exchangeability, IS the outcome-regression estimate of the causal effect. That sounds right, and it is exactly wrong here: it makes the benchmark CIRCULAR. The DGP's \"truth\" becomes your estimator's answer, so outcome regression scores 100% by construction and you conclude \"adjustment works\" having merely assumed it. For a benchmark that can FAIL, the truth must come from OUTSIDE the estimation — a randomised experiment, a policy target, a scenario you want to stress. That is what imposing is.";
const SHAPE_TIP =
  "You brought the MAGNITUDE from outside. The data can still speak to the SHAPE — how the effect splits across the two margins — because a confounded sample can be wrong about size while still being informative about mechanism. Here it is only half-informative: it gets the employment margin's sign right but reports pay collapsing 36%, which is the confounding talking. So we take the margin it can be trusted on (a logistic on WHETHER SOMEONE WORKS is far less distorted by the PSID comparison group than dollar amounts are) and solve the other one to land your target exactly. It is a starting point, not a truth — move it on the pad.";

/**
 * Declare the effect this DGP carries. The affordance that did not exist: every path in the app led to
 * FITTING the exposure → outcome edge, which is the one edge you must never fit — so a user rebuilding the
 * LaLonde benchmark from a spreadsheet could not actually rebuild it. Now they can, in two fields.
 */
export function ImposeEffectCard(props: {
  document: GraphDocument;
  edgeId: string;
  onImpose: (spec: ImposeSpec) => void;
}) {
  const cand = useMemo(() => imposableEffect(props.document, props.edgeId), [props.document, props.edgeId]);
  const [text, setText] = useState("");
  const twoPart = cand?.family === "two_part";
  // The two-margin fit runs an IRLS over every row and does NOT depend on the typed target — so it is
  // memoized on the document alone, and typing costs only the cheap S(γ) map.
  const implied = useMemo(
    () => (cand && twoPart ? dataImpliedEffect(props.document, cand.exposure, cand.outcome) : null),
    [props.document, cand?.exposure, cand?.outcome, twoPart] // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!cand) return null;

  const target = Number(text);
  const valid = text.trim() !== "" && Number.isFinite(target) && Math.abs(target) > 1e-9;
  const suggestion = valid && twoPart
    ? suggestImposedShare(props.document, cand.exposure, cand.outcome, target, implied)
    : null;
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

  return (
    <div className="impose-card">
      <strong>Impose a causal effect{<InfoDot tip={IMPOSE_TIP} href="/effects.html#estimand" />}</strong>
      <p>
        Give this DGP a <b>known</b> effect, brought in from outside the data — an experiment, a policy target,
        a scenario. Then every estimator you run can be <i>graded</i> against it. <b>Fitting</b> this edge
        instead learns the adjusted association, and a benchmark graded against its own estimator cannot fail.
      </p>
      <div className="impose-row">
        <label>
          <span>effect on <b>{cand.outcome}</b> of <b>{cand.exposure}</b></span>
          <input
            type="number" inputMode="decimal" placeholder="e.g. 1794" value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && valid) props.onImpose({ ...cand, target, extensiveShare: suggestion?.share }); }}
          />
        </label>
        <button
          type="button" className="primary" disabled={!valid}
          onClick={() => props.onImpose({ ...cand, target, extensiveShare: suggestion?.share })}
        >Impose</button>
      </div>

      {/* What the data can say about the SHAPE — and, honestly, what it cannot. */}
      {suggestion?.basis === "gate-only" && implied && (
        <p className="impose-shape">
          <b>The data's two margins disagree{<InfoDot tip={SHAPE_TIP} href="/effects.html#two-margins" />}</b> — it
          has employment going <b>up</b>, but pay going <b>{pct(Math.exp(implied.delta) - 1)}</b>, which is the
          confounding, not an effect. So we keep only the margin it can be trusted on: its gate puts{" "}
          <b>{pct(suggestion.share)}</b> of your effect through <i>more people working</i>, and the pay effect is
          solved to land the total exactly. Adjust it on the pad afterwards.
        </p>
      )}
      {suggestion?.basis === "both-margins" && (
        <p className="impose-shape">
          <b>The data suggests a split{<InfoDot tip={SHAPE_TIP} href="/effects.html#two-margins" />}</b> —{" "}
          <b>{pct(suggestion.share)}</b> of the effect through <i>more people working</i>, the rest through{" "}
          <i>higher pay</i>. The magnitude is yours; only the shape is borrowed.
          {suggestion.clamped && " (Clamped — the data's shape exceeds what your target can feasibly deliver.)"}
        </p>
      )}
      {valid && !twoPart && (
        <p className="impose-shape muted">
          The outcome is <b>{cand.family === "log" ? "log-scale" : "additive"}</b>, so there is nothing further
          to choose: one parameter, one constraint. The coefficient is fully determined by the number above.
        </p>
      )}
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
  onClear: () => void;
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
  // decompose() is LINK-AGNOSTIC; the closed form e^δ·S(γ) − C₀ is the LOG link's only. On the identity
  // link δ is in DOLLARS, so exp(δ) = exp(580) = 1e252 and the pad printed a 250-digit number.
  const shownSplit = ctx.decompose(at.gamma, at.delta);
  const shownAte = shownSplit.ate;

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
        over: ctx.decompose(g, d).ate > ctx.target
      });
    }
  }

  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const money = (v: number) => (v < 0 ? `−$${Math.abs(Math.round(v)).toLocaleString()}` : `$${Math.round(v).toLocaleString()}`);
  // Under the IDENTITY intensive link δ is a per-worker RAISE IN DOLLARS, not a log-dollar shift. Rendering
  // it as exp(δ)−1 would print Infinity (exp(719)). The pad shows whichever the DGP actually uses.
  const payLabel = (delta: number) => (ctx.identityAmount ? money(delta) : `+${pct(Math.exp(delta) - 1)}`);
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
    const d = ctx.decompose(p.gamma, p.delta);
    const ate = d.ate;                                    // link-agnostic; never the log link's closed form
    if (!(ate > 1e-6)) return; // a non-positive ATE has no meaningful split — refuse rather than fake one
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
        <text x={mL - 4} y={y(ctx.deltaFor(0)) + 3} className="resid-tick" textAnchor="end">{payLabel(ctx.deltaFor(0))}</text>
        <text x={mL - 4} y={y(ctx.deltaFloor) + 3} className="resid-tick" textAnchor="end">{payLabel(ctx.deltaFloor)}</text>
        <text x={W - mR} y={mT + plotH + 12} className="resid-tick" textAnchor="end">employment →</text>
        <text x={mL + plotW / 2} y={H - 3} className="resid-axlabel" textAnchor="middle">grey = unreachable{<InfoDot tip={WALL_TIP} href="/effects.html#wall" />}</text>
      </svg>

      <div className="imposed-lock">
        <Checkbox label="hold the effect at target" checked={locked} onChange={setLocked} />
        <InfoDot tip={LOCK_TIP} href="/effects.html#estimand" />
        {/* Stop imposing: γ and δ keep the values they were last derived to, but they become YOURS. */}
        <button type="button" className="imposed-clear" onClick={props.onClear}>stop imposing</button>
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
        <div><span>pay at work</span><b>{payLabel(at.delta)}</b></div>
        <div><span>from working</span><b>{money(shownSplit.extensive)}</b></div>
        <div><span>from pay</span><b>{money(shownSplit.intensive)}</b></div>
      </div>

      <p className="muted imposed-foot">
        {/* The wall does not always BIND. Under the corrected LaLonde DGP the ceiling ($1,840) sits just
            ABOVE the $1,794 target, so employment alone could do all of it — and the old copy read
            "yields only $1,840, short of $1,794", which is a contradiction. */}
        {maxShare < 0.999 ? (
          <>
            At most {pct(maxShare)} can come from employment — putting <i>everyone</i> into work yields only{" "}
            {money(ctx.amax - ctx.c0)}, short of {money(ctx.target)}, so pay must rise ≥&nbsp;{payLabel(ctx.deltaFloor)}.
          </>
        ) : (
          <>
            Employment alone <i>could</i> deliver all of it: putting everyone into work yields{" "}
            {money(ctx.amax - ctx.c0)}, which covers the {money(ctx.target)} target — so the wall does not
            bind here, and pay need only change by&nbsp;{payLabel(ctx.deltaFloor)} at the extreme.
          </>
        )}
        {" "}γ&nbsp;=&nbsp;{at.gamma.toFixed(3)} (log-odds), δ&nbsp;=&nbsp;{ctx.identityAmount ? at.delta.toFixed(0) : at.delta.toFixed(4)} ({ctx.identityAmount ? "$/worker" : "log-$"}) are{" "}
        <b>derived</b> from the estimand — never typed.
      </p>
    </div>
  );
}
