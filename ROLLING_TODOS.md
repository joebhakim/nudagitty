# Rolling TODOs

Keep lightweight follow-ups here when a branch is reviewable but still needs product polish.

> Consolidated 2026-07-10: the old lowercase `ROLLING_TODOs.md` (a case-collision hazard on
> case-insensitive checkouts) was merged into this file as the "Active thread" section below.

## Active thread: family-aware fit + provenance — branch `refactor/decompose` (2026-07-10)

Working backlog for the canary branch. Grouped by theme, most-active first. Deeper context lives in
the auto-memory: `provenance-pins`, `data-table-rework`, `joint-source-cloud`, `tutorial-scaffold`,
`canvas-selection`, `copula-vine-toolbox`.

The core mental model for the current thread: **a data variable's *marginal* is always from data; its
*edges* (dependence on parents) are learned or authored, per-edge.** Marginal and dependence are separate
axes — the old whole-node "From data / Fit / Author" toggle conflated them.

### 0. Family-aware fit + stronger target (active — tasks #93/#94/#95)

The honest replacement for NORTA: fix a fitted marginal by **improving the model** (link + noise
family), not by forcing it through a copula (which buries the residual/endogeneity warnings). Generation
already does `Y = g⁻¹(η+ε)`, so the fitter just learns the link the node's family implies.
**Full design + econ literature + roadmap: `docs/fitting-outcome-marginals.md`** (references in
`docs/references/outcome-marginals-earnings.bib`).

- [x] **#93 Family-aware fit v1 DONE** (commits e41adb4, ae031ae) — reconcilePins fits OLS on the LINK
      scale from the node's valueType (identity / log=`positive`/gamma_log / logit=`proportion`), normal
      noise on that scale, + a retransformation-bias correction so the log-link generated MEAN still matches
      the data. residualDiagnostics computes ε on the link scale (`scale` field + UI footer). Family select
      exposed for data nodes ("fit family (link)"); `positive`/`proportion` un-gated. Golden byte-identical.
      Verified on lalonde re78: identity→8.4% negatives; log→positive (min $840), mean matched — and the
      diagnostic HONESTLY still fails on the log scale (earnings aren't lognormal → two-part = #94).
- [x] **#94 P4 two-part/hurdle (Cragg) SHIPPED** (commits f3c054c…8a8151f) — new `semicontinuous` family:
      logistic gate × log-link intensive → real earnings zero spike; `lalonde-fit-recover-2part` recovers the
      imposed +$1,794 (extensive-led: γ solved ~62% via gate, δ solved so the analytic two-part do() = 1794
      exactly); scale-aware diagnostic checks both margins; editor exposes the family + gate row. Two honest
      limitations FLAGGED not hidden: log-link amplifies dollar earnings-history predictors → heavy intensive
      tail (Mincer "log your regressors" fix deferred); the nonlinear do()-oracle is MC-noisy (imposed truth
      is analytic 1794 — surfacing it in the output card is polish). **CANARY-CONFIRMED WORKING:** oracle
      +$1,785 ≈ imposed +$1,794, crude −$14,842, gate row renders (87%/89%), $0 spike visible, ~$2M outliers.
- [x] **Two-part UI follow-ups DONE** (canary review, 2026-07-10; commits 8b0ed15, 44292c1) — (i) InfoDots on
      the fit-family select + residual panel (gate=extensive / scatter=intensive log scale / +0.03 is log not $ /
      retransformation); endogeneity scatter axis labels + dollar min/max ticks (~$2M tail legible); **collapsible
      marginal-distribution panel** in the editor (MarginalPlot: labelled histogram, distinct $0-spike bar, tail
      clipped at p98 with max noted); **oracle explanation generalized** (was "outcome ~ treatment + confounder +
      noise", wrong for gate×amount — now names two-part/survival + the MC-noise caveat); **analytic imposed truth
      surfaced** (GraphDocumentMetadata.imposedEffect + GMethodsComparison.imposedEffect → "DGP imposes +$1,794
      exactly · this row is a Monte-Carlo estimate" under the g-formula oracle). **REMAINING (minor):** optional (i)
      on the canvas/edge editor for the log-scale coefficient; the imposed-truth line is example-specific (a general
      truth-provider/benchmark panel is the larger deferred item). **All UI still wants a canary visual pass.**
- [ ] **REPRODUCIBILITY GAP (found 2026-07-11, from a real user replication attempt)** — `lalonde-fit-recover-2part`
      **cannot be rebuilt from the UI**, and nothing says so. The imposed effect needs (a) the **gate coefficient
      γ=1.754**, for which there is **no UI at all** (you cannot author an extensive-margin effect), and (b) **δ
      solved by a numeric root-find** so the analytic two-part do() = 1794 — configurator-only. Decide: expose
      gate-coefficient authoring + a "solve δ for a target ATE" affordance, OR label the example curated-only and
      point hand-replication at the additive #95 (`lalonde-fit-recover`, which IS reproducible — replicate.test.ts).
      Related trap seen in the wild: user FIT treat→outcome (learning the confounded −0.413) instead of AUTHORING
      it — the UI makes "fit everything" the easy path, so there's no imposed truth. Consider warning when the
      exposure→outcome edge is fitted in a "recover the imposed effect" workflow.
- [ ] **Compact share links** — the `#c=` payload is ~9KB of base64 for one example (whole doc inlined). Want
      short/compact links (id + delta, or a hash-backed store). Raised during the replication debug.
- [ ] **core/empirical divergence** — empirical.ts had NO plasmode passthrough at all (it treated table_lookup as
      a plain additive edge); now aligned, but the two loops duplicate node-evaluation logic and drifted once
      already. Worth unifying into one evaluator.
- [ ] **#94 Follow-ups (remaining)** — noise-family fit (skew/heavy-tail ε); **Tobit** single-index contrast;
      **PPML / gamma-GLM** mean-scale fit (fixes #93's zero-dropping log-OLS); `log(Y+c)`/asinh refutation
      widget (Chen–Roth); **Mincer predictor transforms** for the two-part intensive; **retire NORTA** (#92).
      **Design write-up: `docs/fitting-outcome-marginals.md` — noise-family mechanics + log-link ∞ guardrail
      (§6); econ literature + the "mechanically include for economists" menu (§7–8).**
- [x] **#95 Stronger target DONE** (commits 5da08d7, 1a1ebf2) — `lalonde-fit-recover`: plasmode covariates +
      FIT treat (logistic) + FIT re78 confounders holding treat→re78 AUTHORED at **+$1,794** (identity link /
      additive — the honest "clean ATE, drifted marginal" choice; log fails for earnings anyway). do(treat)
      = +1794 exactly; crude gap −$14,117 (biased); AIPW ~+$1,576 recovers within noise. The recovered-vs-
      truth "card" = the existing observed-vs-oracle-vs-adjustment output (oracle lands exactly on +1794) +
      the adjustment-methods ledger. Replication golden test locks the from-scratch build (fitted coefs +
      do-oracle match). Residual check honestly flags the marginal drift.
      - [ ] optional follow-up: a one-glance "imposed +1794 · recovered +X · naive −14117" summary chip.
  - [ ] DEFERRED (not now): a **tutorial walkthrough** that builds the fitted DGP from scratch
        (import → mark → wire → fit → author effect → recover), like the LaLonde tour ([[tutorial-scaffold]]).

### 1. Provenance / fit-from-data (active thread)

- [ ] **"Not learned" edge state.** A drawn edge with no fitted/authored value renders dimmed as
      *"not learned"* (no number) and contributes nothing to generation — kills the phantom `coef 1.0`
      that shows on inert edges today. *(task #91)*
- [ ] **Editor: Marginal + Dependence split.** Generation block →
      *Marginal:* "from data" for a data node (a stated fact + the observed shape, with an
      "author a parametric marginal instead" escape); *Dependence:* the edge list, each
      **Not-learned / Fitted 📌 / Authored ✎**, plus "fit all". Drop the whole-node mode toggle. *(task #91)*
- [x] **Wire-time model-type prompt.** DONE — wiring an edge into a still-reading data variable pops a
      non-blocking card: "<node> is a data variable — its new arrow is not learned yet. [Fit <node> from
      data (logistic|linear) →] [Leave not learned]". Model type inferred from the target's family.
      Verified: Hispanic→In_program shows "(logistic)". *(task #91)*
      - [ ] follow-up: fire once for a bulk multi-wire (currently per completed edge); mobile placement.
- [x] **Marginal-preserving fit — binary.** VERIFIED already preserved: the logistic MLE with a fitted
      intercept makes the mean predicted probability equal the empirical rate, and Bernoulli(rate) IS the
      whole marginal. (lalonde-recover-rct In_program: read 0.063 → fit 0.066 vs empirical 0.069.) No extra
      calibration needed. The editor badge says "from data (rate preserved)" for a fitted binary node. *(#92)*
- [~] **Marginal-preserving fit — continuous (NORTA). DECIDED: SKIP** (2026-07). It's un-falsifiable (you
      can never catch it being wrong), the coefficient becomes an un-interpretable latent loading (bad for a
      teaching tool), and it's heavy (new `empirical` dist kind → normalize/sample/inverseMarginalCdf/
      analytic/**golden**/share-URL churn). The additive-noise fit + the residual test below is the honest,
      *falsifiable* alternative and is already shipped; the "modeled" badge keeps the continuous case honest.
      The one real downside (a fitted earnings marginal that can go negative) is better fixed cheaply with a
      positive/skewed **family link** (`gamma_log` / `positive_softplus`, already exist) than with NORTA.
      Revisit only if a user specifically needs exact continuous shapes. *(#92 — parked)*
- [x] **Residual-independence / exogeneity diagnostic.** *(task #90)* DONE — `residualDiagnostics` +
      `distanceCorrelation` in fitDgp.ts; `ResidualCheck` panel in the node editor for a fitted continuous
      node: residuals-vs-fitted scatter + per-parent **distance correlation** bars + an ok/weak/violated
      verdict naming the worst parent. Uses dCor (not linear corr, which OLS forces to ~0) so it catches
      nonlinear/heteroskedastic dependence — a refutation, powerless under linear-Gaussian. Verified on
      lalonde-recover-rct Earnings_78: verdict "weak", worst=education (0.19), earnings '74/'75 elevated —
      the skewed/zero-inflated earnings break additive-normal noise, exactly as expected.
- [x] **Residual test SET rounded out** (commit 215067c) — web-validated against the literature. It IS
      RESIT (Peters et al. 2014); dCor ≡ HSIC (Sejdinovic et al. 2013). Now three tests: (1) **joint**
      ε⊥X dCor + **permutation p-value** (was eyeballed; also was only pairwise); (2) **heteroskedasticity**
      dCor(ε²,X)+p (catches the hourglass BP misses); (3) **non-Gaussianity** Jarque–Bera; + a
      **linear-Gaussian identifiability warning** (the powerless case). Verdict from the joint p-value.
      - [ ] follow-up: lift into a top-level diagnostics panel (not only the node editor); optional
            Breusch–Pagan as a familiar named alternative; Ramsey RESET for functional form.

### 2. Provenance Phase 2b — remaining polish (minor)

- [ ] Literal **📌 on the canvas edge coefficient labels** (they render in a separate layer; `data.pinned`
      is already plumbed — just needs the glyph). Line color carries provenance there for now.
- [x] Node marginal **markers + split legend** DONE (commit e9080f4): teal mini-table = data-derived, amber
      ƒ = model-defined/ex-nihilo; legend split into Nodes vs Edges groups.
- [ ] Mixed-node **dominant-provenance nuance** on the canvas node tint (a part-fitted node shows one color).
- [ ] Reconsider the **"Learn the DGP →" wording** — may overclaim. Consider "Fit this DGP to the data" +
      a "given your DAG + functional forms + no hidden confounders" caveat.

### 3. Fit the confounder JOINT from data (Phase 3b)

- [ ] Empirical marginals (per-column inverse-CDF) + a **vine fitted from the table** (Kendall τ per pair
      → `CopulaBlock`) → author-free copula joint; wire into the Joint/DGM **Copula tab** as "fit from data".
      The copula analogue of the edge-fitting already shipped.

### 4. Tutorial — remaining

- [ ] **Auto-load / download the sample CSV** in step 1 (the tour says "upload lalonde-obs.csv" but doesn't
      hand it to you — it's at `/sample-data/lalonde-obs.csv`).
- [ ] Deferred knobs: **adjustment auto-launch vs the user choosing**; allow fitting/adjusting a **data subset**.
- [ ] **Mobile long-press → multi-select** (desktop Ctrl+drag marquee is done).

### 5. Editor / canvas UX

- [ ] **Grey out non-relevant controls** to lower salience (esp. during the tour) — the button-declutter pass
      (the "implicit noise nodes" toggle etc.). Grey out, don't delete.
- [ ] **Connect / Couple tool-mode hijack:** clicking a node in those modes doesn't surface exposure/outcome
      (this was the real cause of "re78 outcome not highlighting"). Rethink the tool modes.
- [ ] Surface **exposure/outcome** more prominently vs the Analysis-operation panel in the node editor
      (partly addressed by the Generation restructure).

### 6. Import

- [ ] **File upload skips the preview/confirm** that paste shows — add a "N columns → nodes + types" confirm
      (and a chance to deselect columns) before committing.
- [ ] **Type inference is binary-or-continuous only** — add a cardinality heuristic (few distinct integers →
      categorical/ordinal), so codes like twins `mrace/frace/birattnd/pldel` aren't inferred "continuous".
- [ ] **Imported datasets drop from the compact share-URL** (large-data-won't-share) — a re-upload prompt or
      a compressed-sample embed so a shared fitted model isn't empty.

### 7. Misc / smaller

- [ ] **galton-regression** shows the "mark an exposure and outcome" empty state (it's the only example with
      no roles) — decide whether to auto-mark its roles (would shift its golden snapshot).
- [ ] **#82 — GLUT4 full-curve tooling:** let a node modulate a full edge-mechanism curve.

### Recently shipped (canary, this thread)

Joint-source cloud unification (copula + plasmode → one cloud + Joint/DGM editor + shared↔independent
switch) · CSV import → typed node dump · multi-select + group actions · Ctrl+drag marquee · interactive
tutorial (LaLonde) · **learn edges from data** (fitDgpFromData) · **live pin engine** (reactive reconcile,
offset regression, mixable) · **provenance overlay** (authored/data/pinned colours + legend + flash) ·
**unified "Generation" editor element** with per-number 📌/✎ chips · per-node Read/Fit/Author + edit-authors ·
**family-aware fit v1** (link-scale fitting + scale-aware diagnostics) · **stronger-target fitted-DGP example**
(`lalonde-fit-recover`, recovers imposed +$1,794) + from-scratch replication test.

## Decomposition + re-architecture — branch `refactor/decompose` (2026-06-30)

Big structural pass: every monster file split into small descriptive files. `App.tsx` 7945 -> ~1215
(shell); `examples.ts`/`simulation.ts`/`longitudinal.ts`/`graph.ts`/`outputs/modules.tsx` are now
re-export barrels over part-file dirs; App's content lives in `apps/web/src/{app,canvas,controls,editors,panels,compute,share,hooks}/`;
g-methods monolith split into per-estimator files; dead `GraphCanvas`/`VariableMechanismPanel` deleted.
Behavior-locked by a new golden net (`packages/core/src/__golden__/`, byte-identical throughout).

> ⚠ STALE LINE NUMBERS EVERYWHERE: every `App.tsx`/`modules.tsx` line reference elsewhere in this
> file now predates the decomposition — re-locate by SYMBOL, and expect the symbol to live in one of
> the new subdirs, not App.tsx/modules.tsx.

In progress (do-it-right re-architecture):
- [ ] **Canonical stats library** — one shared stats module with options (ridge, n-vs-(n-1),
  quantile interpolation, clipping) + sensible defaults; route every duplicated quantile / weighted-
  moment / linear-solver / sigmoid-logit / correlation / SMD / ESS copy (core + web) through it.
- [ ] **Consistent chart-type library** — one canonical component per data-shape (binary×binary,
  binary×continuous, continuous×binary, continuous×continuous, survival, effect-by-arm, …);
  consolidate the scattered pair-views/plots.

Deferred (needs care, not blocking):
- [ ] **3 skipped App() hook regions:** `useSimulationResult` (simulation/analysis state + derived
  cache + worker effects are non-contiguous — top/mid/bottom of `App()`), `useShareState` (status
  states + reset effects + copy handlers scattered), and the keydown-shortcuts effect (references
  handlers declared *after* it). Extracting any of these needs the state/handler declarations
  reordered FIRST (hook order is load-bearing; tsc won't catch a reorder). Do with a manual canary
  click-through of share buttons + keyboard shortcuts + pending spinners.
- Decision: **keep `catalog.ts` as one file** (2924 lines) — the format/expected shape is obvious
  when every example literal sits together; do NOT split it.

## Term disambiguation section (2026-06-29)

A comprehensive section teaching the conflated vocabulary — roles (confounder / mediator / moderator /
collider / instrument) AND cross-field/author terminology — built on the node-on-edge moderation
primitive. Full design in **`docs/plan-term-disambiguation.md`**. DONE: the term registry
(`apps/web/src/shared/disambiguation.ts`), per-example reference cards
(`apps/web/src/outputs/DisambiguationCard.tsx`, wired into `AdjustedOutputPanel`), the moderation
examples + `effect-modification` moderator-CATE output. REMAINING: Phase A standalone glossary map
(roles grid + interaction strip + pitfalls, toolbar overlay, deep-links to examples); Phase B full-sweep
examples (gather existing role examples into the `disambiguation` domain + author `mediated-moderation`).

## Output panel — ground-up redesign (2026-06-24)

Rethink the output from scratch around the five questions people actually ask, graphs-first, with
progressive disclosure. Replaces the current ~9-module stack (which shows the headline number 3-4×
under different names, scatters positivity across 3 places, and leads with jargon). Full design +
old→new mapping + mockup in **`docs/plan-output-redesign.md`**. Five cards: (1) does treatment help?
(2) do methods uncover the effect? (3) are the methods reliable? (4) how are variables related?
(5) how does nudagitty know? Prototype on `what-if-hiv-cd4-variants`, then generalize. One new chart
(Q2 method forest plot); the rest reuse existing panels + the overlap/positivity module.

## Longitudinal g-methods: ICE vs plug-in + positivity decay (2026-06-24)

New dedicated teaching examples (NOT to be crammed into `what-if-hiv-cd4-variants`). Full design in
**`docs/plan-longitudinal-ice-positivity.md`**. Came out of vetting the HIV example: it conflates
two separable failure modes (positivity collapse — never-treat support 0.8%/54-of-7000, observed
11% vs true 36% death; and treatment-confounder-feedback over-adjustment — the stable-but-wrong −20
plug-in cluster), and its `g_formula` row is the re-simulated oracle, not a from-data estimator.
Proposed: (1) a minimal feedback example where support is fine so over-adjustment is the only
failure; (2) a K-slider "vanishing regime" example that makes positivity decay visible; needs a real
from-data ICE-DR/TMLE estimator + a parametric g-formula fit from data + failure-mode-aware output.
**Separately**, make `what-if-hiv-cd4-variants` coherent (teach one thing, label the oracle) —
discussed live, not yet written up.

## Data-generating-mechanism (DGM) toolbox — branch `dgm-toolbox` (2026-06-23)

Full design in `docs/data-generating-mechanisms.md` and the approved plan. Goal: make confounder
*joint dependence* a first-class, visible, inspectable feature (independent / confounder-DAG /
Gaussian-copula / plasmode / generative), with a paired contrast on smoking→weight-gain + standalone
showcases.

Shipped (Phase 1):
- **DGP inspector** (`apps/web/src/outputs/DgpInspector.tsx`, Σ toolbar button): structural
  equations, empirical correlation heatmap (auto-detected DGM), marginals, link-coefficient table,
  imposed-truth panel. Honestly labels the "oracle" as our construction.
- It surfaced + we fixed two latent bugs in `what-if-nhefs-weight-gain`: `Sex` set via
  `setLogitNode` on a *root* (sampled constant → everyone male, inert) and `Sex→Weight_gain`
  defaulting to coef 1.0. Recalibrated (crude 2.44, oracle 3.50).
- **Relabeled** that example: "Smoking cessation → weight gain (independent confounders)" — a
  *synthetic, calibrated* example, NOT a "book replica"; infobox/summary/comments made honest.

Shipped (Phases 2–5):
- [x] **Copula** — `copula_marginal` node combiner (NORTA: latent-Gaussian → Φ → marginal⁻¹) +
  `addCopulaCovariates`; `wg-dgm-copula` (exact marginals, specified correlation, oracle 3.5).
- [x] **Plasmode** — `table_lookup` edge + real **NHEFS** embedded (`data/nhefs.ts`, 1629 rows) +
  `datasets.ts` + `addPlasmodeCovariates`; `wg-dgm-plasmode` (real joint, real mixed types).
- [x] **Confounder-DAG** variant (`wg-dgm-confounder-dag`, edges among confounders) + **generative**
  stand-in (`wg-dgm-generative`, table_lookup over a learned-copula synthetic dataset `data/nhefs-synthetic.ts`).
- [x] **Positivity showcase** (`wg-dgm-positivity`) + new `dgm` `EXAMPLE_DOMAINS` entry; all six
  weight-gain variants surfaced in `VERIFIED_EXAMPLE_IDS` and grouped under "Simulation design / DGMs".
- [x] Source nodes render via the existing `latent` styling (visible + excluded from adjustment).

Remaining polish:
- [ ] More standalone showcases (e.g. mediator-among-confounders for the confounder-DAG; a
  high-dimensional generative case). The positivity showcase is mild — could be dialled sharper.
- [ ] The copula is a one-factor model; a full target-correlation-matrix (Cholesky) author path
  would allow arbitrary specified correlations.

## DGM toolbox — round 2 (vision-informed, 2026-06-23)

User feedback after the walkthrough + the vision answers. Sequencing is roughly top-to-bottom.

0. **Canonical dataset library — SHIPPED.** `packages/core/src/data/` now holds five embedded
   datasets behind one schema (`dataset.ts`: covariates + optional ground-truth), registered in
   `datasets.ts`, all regenerable via the committed `build_datasets.py`:
   - `nhefs` (1629×9, epi; covariates only) · `nhefs-synthetic` (2000×9, learned-copula generative)
   - `ihdp` (747×29, CATE benchmark; true ATE **4.02**, mu0/mu1) · `twins` (2500×13, both potential
     outcomes; true ATE **−0.024**) · `lalonde` (445×10, NSW job-training RCT).
   - IHDP & Twins carry **known ground truth** → they enable "estimators vs the ACTUAL effect"
     benchmark examples (not a DGP we imposed). NHEFS stays the real-data plasmode anchor.
1. **Relatable running example** (replaces smoking for the contrast): **study-skills Program → Test
   score**, confounders {prior grades, motivation, income}, true effect **+8 points** (same across
   all DGMs). Build the independent baseline + reuse the same A|L, Y|A,L for every DGM variant.
   Plasmode/generative for it use NHEFS (real-data anchor); standalone benchmark examples use
   IHDP / Twins / LaLonde directly.
2. **DGM switcher = centerpiece of a guided "DGM" category** (chosen: Both). Collapse the variants
   into ONE example with an in-place dial (independent / confounder-DAG / copula / plasmode /
   generative): flip it, watch the correlation matrix + overlap + estimators change, truth fixed.
   - Engine: a switchable "covariate-source config" on the document; re-derive source node + edges
     + re-simulate on switch. UI: live update of canvas + DGP panel + output.
   - Guided category: the switcher example as centerpiece + an explicit built-in step-through
     (coachmarks / sequenced explainer) — the "tour" baked into the site, not just chat.
3. **Overlap / positivity output module** (chosen: Both → new module): PS-by-arm histogram +
   IP-weight distribution + ESS. Reusable across adjustment examples; makes "positivity bites"
   *shown*, not asserted. Wire into the positivity case + the switcher.
4. **"Covariate source" node panel** (chosen: explainer + switcher): selecting a latent source node
   opens a cockpit — DGM type dropdown (the switcher), loadings/dataset, "feeds: …" list, link to
   the DGP panel. Replaces the meaningless generic node editor for plumbing nodes.
5. **Register the new mechanisms in the web UI** (fixes the "spline" mislabel): `table_lookup` +
   `copula_marginal` in `edgeMechanismCanvasLabel` (`App.tsx:2588` — the fallback returns "spline"),
   `EDGE_MECHANISMS`/`FunctionPicker`/`EdgeTransferPlot`, and `NODE_COMBINERS` + the node editor.
   Give them real param displays instead of the spline-knot fallback.
5b. **Switch the DGM showcase running example smoking → LaLonde** (job training → earnings; more
   intuitive: trainees start worse off, naïve gap looks bad until adjusted). Two complementary tracks:
   - **Track A (DGM contrast):** LaLonde covariates as the real L, an IMPOSED ~+$1,800 effect; the
     5 DGM variants + positivity, plasmode resampling real LaLonde rows. Replaces smoking as the front.
   - **Track B ("recover the RCT" benchmark):** real `treat`/`re78`, NSW-treated + PSID controls
     (2,675 rows), graded against the experimental benchmark (+$1,794). `lalonde-obs` dataset shipped;
     experimental `lalonde` (445) is the anchor. Replay example `lalonde-recover-rct` built
     (`configureLalondeReplay`: covariates + real treat + real re78 all `table_lookup`; do-oracle
     degenerate → truth is external). **Design in `docs/track-b-benchmark-mode.md`; the measured
     finding in `docs/lalonde-recover-rct.md`.**
     - **KEY FINDING (measured):** on PSID, **nothing fully recovers**. Propensity methods stay
       catastrophically biased (naïve −$14.9k, IPW −$14.3k, matching −$5.0k, g-est −$21.7k); only
       outcome-regression / AIPW get the *sign* right (~+$500), undershooting. The honest lesson is
       *"adjustment can fail — and overlap is the tell,"* not "methods claw back."
     - **WHY (the validatable assumption):** severe **positivity violation** — median control
       propensity **0.0001** vs treated 0.743; **93%** of controls in the lowest PS bin, IPW control
       **ESS = 43/2490 (1.7%)**, common support retains 49%. The example MUST *show* this (PS-by-arm
       histogram + IP-weights + ESS — the round-2 positivity module is the centerpiece here).
     - **Open fork (pending):** (1) PSID cautionary-only, (2) add CPS controls for a recovery
       contrast, or (3) add a common-support-trimmed estimator for "fails → trim → recovers."
     - Remaining build: benchmark output panel (anchor truth + graded estimators) + suppress the
       degenerate do-oracle; truth-resolver abstraction (external / per-row PO / imposed DGP) that
       also unlocks IHDP (4.02) & Twins (−0.024) benchmark examples; then surface + verify.
6. **Explanatory titles** for every DGM example (what it *teaches*, not just the DGM name).
7. **Generative cleanups**: commit the synthetic-data generation script (currently a throwaway →
   `data/nhefs-synthetic.ts` is not reproducible); relabel any "GAN" copy → "learned copula".
   Real GAN/VAE/**WebGPU** generator stays the deferred ambition.

Deferred (bigger, separate):
- [ ] **Generative, for real:** in-browser learned-joint generation via a dispatched worker /
  **WebGPU** (train/run a GAN/VAE/flow client-side). Runtime CART/synthpop is the lighter fallback.
- [ ] **General data import:** bring-your-own-data — paste/upload CSV → a plasmode covariate source
  for any dataset.


## Smoking-example consolidation + array-generated longitudinal example (2026-06-20)

- Removed the 6 `what-if-showcase-*` examples (exact duplicates of the `what-if-*` set):
  entries, dispatch, 5 orphaned DAG-code consts, the App.tsx `showcaseGuideForExample`
  branches (re-pointed to the canonical ids), three test lists, and the audit-ledger rows.
- Added `what-if-nhefs-weight-gain` (qsmk -> weight gain) + a detailed "i" infobox. NOTE: later
  (dgm-toolbox branch) relabeled honestly as a *synthetic, calibrated* example (independent
  confounders), NOT a "replica"; Sex/coefficient bugs fixed; crude ~2.5, adjusted ~3.0-3.5, true +3.5.
- Rewrote `what-if-hiv-cd4-variants` as a 6-visit **array-generated** longitudinal DAG
  (`buildHivCd4SequenceCode(HIV_CD4_SEQUENCE_VISITS)` + loop-driven config). Full
  treatment-confounder feedback; naive ~-4.6pp (badly confounded) vs g-formula -30.7pp (= oracle
  always-vs-never). The visit count is a single knob.
- Follow-up: the binned-PS / time-varying methods (IPW/AIPW/g-est) only partially recover the
  6-visit effect (-11 to -21pp vs -30.7 oracle) — a real engine limitation (no proper
  time-varying IP weighting / smooth propensity), not the example. Worth a core pass later.


## Adjustment-pipeline unification + NHEFS survival arc (2026-06-19)

**State:** local `main` is **8 commits ahead of `origin/main`, UNPUSHED**. Pushing `main` ->
`origin` auto-deploys via the joesite webhook (deployed checkout is this repo; service
`joesite-nudagitty.service` on :8502 -> nudag.joeha.kim). Note: the
`fix-gmethods-continuous-confounders` branch is the PRE-merge state; all recent work landed
on local main after the earlier no-ff merge (1d49d11).

Shipped this session (committed to local main, not yet pushed):
- Unified the four ad-hoc "adjust" output paths -> one operation-derived engine + one
  methods panel + one adaptive-quantile binning, for every example (the 1d49d11 merge).
- Added matching / parametric outcome-regression / doubly-robust AIPW estimators + a
  per-analysis primary-method selector (drives a live headline).
- NHEFS rebuilt: 5 death intervals (2/4/6/8/10y, absorbing chain), recalibrated so all 7
  adjusted estimators converge on the oracle; method-specific survival curves (naive /
  IPW / g-formula swap with the dropdown); analytic Greenwood CI bands; naive == observed
  scatter consistency; modules renamed ("Observed association" / "Adjusted estimate") and
  reordered (adjusted is now the primary/top panel).
- Covariate basis expansion (linear / quadratic / cubic) on the parametric estimators +
  the new "How flexible should your adjustment be?" example + a "Confounder basis" selector.
- Observed-association card now renders the crude (naive) survival curves for survival
  examples — same view as the adjusted card, before adjustment.

Outstanding:
- [ ] **Push local main -> origin** (auto-deploys). Decide when.
- [ ] **Variable groups, "all types now" (started with the basis kind):** survival
  observed/adjusted are matched. Remaining: BINARY (a crude two-arm risk contrast shown in
  both cards: naive arms vs primary-method arms, methods table as adjusted-card detail),
  CONTINUOUS (arm means), and a COMPACT HEADER pair-picker to replace the retired scatter.
  Shape: an `outputViewType` switch (survival | binary | continuous | survival_time) + one
  contrast component reused by both cards.
- [ ] **Basis selector is classic-only** — the what-if path (NHEFS) wasn't wired for it.
  Extend `OutputContext.covariateBasis` threading through `WhatIfAdvancedOutputView` if wanted.
- [ ] **Other variable-group kinds** beyond basis: series / regimen / categorical (most are
  already implicit in the longitudinal engine — formalize them as `VariableGroup`s).
- [ ] **Bootstrap CI worker (deferred):** per-estimator TABLE CIs need an off-thread Web
  Worker (~0.5s/replicate, too slow inline; ~100s even in a worker at B=200; subsampling
  would wrongly inflate CIs). The survival CURVE already uses analytic Greenwood. Revisit
  only if the table CIs feel missing.
- [ ] **Example audit ledger** (`docs/example-audit-ledger.md`): every example is still
  ❌/❌ (Joe-audited + Claude-skeptical). The skeptical audits were offered, never run.
- [ ] **birthweight-paradox calibration:** marginal smoking->mortality reads ~null/protective
  (should be harmful) — pre-existing, logged in the ledger, not chased.
- [ ] Kill the leftover dev server on port 1337 (started for verification).

## Basic Mode Polish

- [ ] Tighten the Basic-mode layout after review: spacing, drawer sizing, right-panel density, responsive behavior, and visual hierarchy around the DAG.
- [ ] Refine coachmark copy so it feels like causal-inference guidance, not generic drawing-app help.
- [ ] Keep simulation controls secondary: `refresh sample` should stay available, but selection, intervention, and adjustment should remain the primary Basic-mode affordances.
- [ ] Revisit Basic-mode example count and ordering after user testing. Prefer fewer examples that each demonstrate a distinct causal idea over many minor `X -> Y` confounding variants.
- [ ] Add a clearer first-run path from roles to results: exposure/outcome first, then selection/intervention/adjustment, then visible output.

## Example Expansion Direction

- [ ] Expand examples around "huh" moments: cases where the graph changes what a user thinks the comparison means, not just cases where the graph labels a known confounder.
- [ ] For each future example, write the intended surprise in one sentence before tuning the DGP or output card.
- [x] Low birth-weight paradox: implemented as a selected low-birthweight sample where smoking looks protective in the sample but harmful in the population DGP.
- [x] Obesity paradox: implemented as a selected chronic-disease sample where obesity looks protective in the sample but harmful in the population DGP.
- [x] Policing encounters: implemented as a synthetic selected-denominator example where encounter-only force rates reverse relative to the population structural contrast.
- [x] Front-door smoking/tar/cancer: implemented with a completed output showing latent confounding, tar mediation, and the DGP do contrast.
- [x] M-bias / adjustment can hurt: implemented with a completed output showing raw near-null association versus collider-conditioned association.
- [x] Lord's paradox / baseline adjustment: implemented with a completed output showing change-score and baseline-adjusted final-outcome estimand split.
- [x] Chess selected-sample sign flip as the template: implemented with a completed output showing full-population positive IQ/Elo correlation versus selected-sample negative correlation.

## Recent Paper DAG Replication Track

- [ ] Build a curated set of 2025-2026 paper-derived DAG examples where the paper's causal structure is partly implicit. For each candidate, record: citation/date, design, implied nodes/edges, estimand, identification strategy, what the graph clarifies, and which Nudagitty features it stresses or lacks.
- [x] Start with a gene-network stress test from Brown et al. 2025, "Large-scale causal discovery using interventional data sheds light on gene network structure in K562 cells" (Nature Communications, 2025). Implemented the no-simplification full-network import, then made the primary view an intervention-mechanics explorer: selected perturbation gene, `delta * R_hat` forecasts, `G_hat` direct-edge comparison, mediated effects, sign disagreements, path-explanation examples, source links, and full-graph fallback.
- [ ] Follow up on the Brown et al. gene-network stress test with a collapsed hub/subgraph teaching view that can sit beside the full faithful import without pretending the cyclic inferred network is a clean small DAG.
- [x] Follow with Ota et al. 2025/2026, "Causal modelling of gene effects from regulators to programs to traits" (Nature, published Dec 2025; issue Feb 2026). Implemented a paper-derived layered reconstruction in the pro catalog: CRISPRi regulator effects, cNMF programs, MCH/RDW/IRF outcomes, LoF/GWAS/trans-eQTL evidence nodes, S_het analysis covariate, and explicit "association is not direct mechanism" denouement copy.
- [ ] Add a GLP-1 target-trial/EHR example: initiation of GLP-1RA versus active comparators, diabetes/obesity severity, care access, adherence/discontinuation, censoring, negative controls, and many outcomes. Target: serious observational causal-inference stress test with high-dimensional confounding and outcome atlas output.
- [ ] Add an AI-labor-market example from Humlum and Vestergaard 2025, "Large Language Models, Small Labor Market Effects" (NBER WP 33777). Target: adoption -> task restructuring -> productivity -> earnings/hours, with DiD, employer-worker hierarchy, and a "mechanisms moved but headline outcomes did not" punchline.
- [ ] Add a phone-ban/school-policy example if the 2026 NBER source is stable and accessible. Target: staggered adoption, baseline trends, student composition, distraction/discipline/well-being/test-score mediators, and interference across students/classrooms.
- [ ] Add a climate/wildfire-smoke health example from 2025 Nature work. Target: climate -> fire/weather -> smoke PM2.5 -> exposure -> mortality, with spatial/temporal confounding, nonlinear dose response, adaptation, and projection versus causal-estimation distinction.
- [ ] For this track, avoid presenting reconstructed graphs as "the paper's DAG" unless the paper explicitly supplies one. Label them as "Nudagitty reconstruction of the paper's implicit causal model" and keep assumptions editable.

## Hand-Written Copy: Staleness + Auto-Population Sweep

From a codebase sweep (2026-06-12). The recurring risk: output prose and labels hardcode node names, structural claims, or calibrated numbers that drift when a DAG is renamed/recalibrated. The recurring opportunity: most of it is derivable from the existing analysis layer (`conditioningRoles`/`classifyConditioned`, `computeStructuralDiagnosis`, the estimand descriptor). Note: the cats recalibration did NOT break existing cats copy — the injury J-curve drives the "seventh story" claims and was untouched — but it is exactly this coupling that motivates the work below.

Highest leverage: a `(operation, exposure, outcome, adjuster, conditioningRoles) -> { narrative, explainer }` helper so renaming a node or recalibrating can never desync the prose, and every example gets an "i" panel for free.

> ⚠ STALE LINE NUMBERS: the `App.tsx`/`modules.tsx` line references in this section predate
> the 2026-06-19 output-pipeline unification (which deleted the bespoke binary/continuous
> adjustment cards and moved everything) — re-locate by symbol before acting. Some items may
> already be resolved by that refactor.

Review for staleness (hand-written, drifts silently):

- [ ] Migrate per-example output narratives off literal node names. `modules.tsx` `visualRead`/`verdict`/`conclusion` for Simpson (~1504), ICU (~1568), College (~1629), Tutoring (~1791), the demo conclusions (~491, ~666), and all 7 "huh" examples (front-door ~1892, birthweight ~1927, obesity ~1962, cats ~2029, policing ~2078, m-bias ~2117, chess ~2256). Interpolated numbers are fine; the embedded variable names and structural claims ("no Exposure -> Outcome path") are the drift risk.
- [ ] Replace the ICU hardcoded collider warning (`modules.tsx:1569`, the `ICU_admission -> Triage_score <- Severity` string) with the generic `badControlWarning` + `classifyConditioned` path it predates.
- [ ] Derive the App.tsx ledger notes (`~3568, ~3576-3577, ~3611, ~3618`) — currently name Severity/Academic_need and their estimand semantics by hand.
- [x] Showcase guide hardcoded the Death_5y/Death_10y horizons — FIXED 2026-06-19 (NHEFS now has 5 intervals; copy made generic). Still nice-to-have: read timepoints from graph/metadata instead of any prose.
- [ ] Justify or centralize hardcoded numeric thresholds: weak-support cutoff `n<8 || <8%` (`modules.tsx:1757`), M-bias stratification `quantile(…, 0.7)` (`modules.tsx:2103`), and the cats injury bin `7` passed to `stratifyRiskCurves`.
- [ ] Add a calibration-snapshot test that fails when copy numbers (e.g. cats "~90% survival", "mean near 5.5") drift from the live simulation, so recalibration surfaces stale prose instead of hiding it.

Auto-population opportunities (derivable from DAG/sim today):

- [ ] Delete the App.tsx per-example label special-cases that already have generic graph-derived fallbacks beside them: `rawAdjustmentLabel` (~3426-3427), `selectedAdjustmentLabel` (~3434-3435), `basicDemoRecommendedAdjustmentId` (~3448-3451).
- [ ] Auto-generate the "i" explainer (`ExampleExplanation.tsx`): only 2 of ~87 examples (`lords-paradox`, `simpson-severity`) have an entry; the rest show nothing. Generate a baseline from `conditioningRoles`/`classifyConditioned` + `computeStructuralDiagnosis` + estimand descriptor, falling back to hand-authored prose for the special pair. Keep the Simpson<->Lord table editorial.
- [ ] Template the what-if conclusions (`modules.tsx:1305-1397`) off each config's metadata names (L1/A0/A1/CD4/ART) instead of interpolating them by hand.

Genuinely fine (do not touch): estimand strings (`estimand.ts:20-50`), `OPERATION_LABELS/BLURBS`, `frameOperation` titles (`App.tsx:776`), the Simpson-vs-Lord table, and the docs (no stale numbers quoted).
