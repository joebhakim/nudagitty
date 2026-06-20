# Rolling TODOs

Keep lightweight follow-ups here when a branch is reviewable but still needs product polish.

## Smoking-example consolidation + array-generated longitudinal example (2026-06-20)

- Removed the 6 `what-if-showcase-*` examples (exact duplicates of the `what-if-*` set):
  entries, dispatch, 5 orphaned DAG-code consts, the App.tsx `showcaseGuideForExample`
  branches (re-pointed to the canonical ids), three test lists, and the audit-ledger rows.
- Added `what-if-nhefs-weight-gain` — faithful Hernán-Robins Ch 12-14 point-treatment replica
  (qsmk -> weight gain; crude ~+2.7 kg, adjusted ~+3.5 kg) + a detailed "i" infobox with a
  book-vs-simulation table.
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
