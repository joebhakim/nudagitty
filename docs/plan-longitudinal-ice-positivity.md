# Plan: teaching longitudinal g-methods — ICE vs plug-in, and positivity decay over time

Status: design / not started. Spun out of vetting `what-if-hiv-cd4-variants` (see "Origin").
These concepts do NOT belong inside that example — they need dedicated, carefully-staged
teaching, possibly across more than one example.

## Origin (what we measured)

While checking whether `what-if-hiv-cd4-variants` is "100% legit," we found it (a) mislabels the
truth and (b) tangles two distinct pathologies into one error column.

- True always-vs-never ART effect = **−30.7 pp** (always 5.3% die, never 36.0%). Only the
  `g_formula` row hits it — but that row is the **Monte-Carlo plug-in re-simulating the TRUE
  structural model**, i.e. the oracle, not a from-data estimator. No genuine estimator recovers it.
- Two **separable** failure modes are currently read as one blob:
  1. **Positivity / support collapse** — weighting + empirical-cell estimators: naïve −4.6, IPW
     −10.8, matching −6.0, stratified −14.4. Measured at K=6: only **0.8% (54/7000)** follow
     never-treat; those survivors die at **11%** vs the true **36%** — the never-treat
     counterfactual has almost no empirical anchor. Amplified by treatment **persistence**
     (`A_{k-1}→A_k`) and **confounding-by-indication** (staying untreated ⇒ staying healthy).
  2. **Treatment-confounder-feedback over-adjustment** — plug-in regressions: OR −20.8, AIPW −20.9,
     g-estimation −19.9. Holding the observed time-varying CD4 fixed erases the `A→CD4→survival`
     mediated path → a *stable but wrong* −20. Orthogonal to support (these don't lean on
     observed regime-followers at all).

## What to teach (carefully; maybe >1 example)

- **A. Treatment-confounder feedback & why conditioning fails.** `L_k` is simultaneously a
  confounder of `A_k` and a mediator of `A_{k-1}`. Conditioning (regression) over-adjusts and kills
  the mediated effect; the g-formula lets `L` *move* under the intervention; IPW reweights to sever
  `L→A` while leaving `L` on the causal path. ("Use L, never hold it fixed.")
- **B. Positivity decay over time.** Support for a sustained static regime shrinks ~geometrically in
  the number of decision points; effective overlap evaporates and the surviving regime-followers are
  a selected (unrepresentative) set. The **coarseness-vs-support tradeoff**: coarsen K to buy back
  support, or keep K and lose it.
- **C. ICE vs non-iterated g-formula.**
  - Non-iterated: **IPW** (product of inverse weights → variance/positivity blowup) and the
    **MC/parametric plug-in g-formula** (model the covariate process, simulate forward — dodges
    positivity but pays a covariate-model price + the **g-null paradox**).
  - **ICE** (Bang–Robins sequential regression / longitudinal TMLE): iterate conditional
    expectations backward, modeling only outcome regressions (not covariate densities); but the
    final-step regressions **extrapolate** into low-support regime regions, so the positivity
    problem is *relocated* (weights → extrapolation), not removed.
- **D. Two failure modes are not one.** Positivity collapse ≠ over-adjustment; the output must
  distinguish them.

References to stay honest to: Robins 1986 (g-formula); Bang & Robins 2005 (DR sequential
regression / ICE); van der Laan & Gruber, Petersen et al. (LTMLE); Hernán & Robins *What If* Ch.
19–21; Robins & Wasserman 1997 (g-null paradox).

## Proposed examples (sketch — refine on build)

1. **"Treatment-confounder feedback: why you can't just adjust."** A minimal 2–3-visit version where
   support is FINE, so the ONLY failure is over-adjustment (isolates mode A from positivity).
   g-formula and IPW both recover; regression/OR over-adjusts. The canonical Ch.19 lesson, done
   right and uncluttered.
2. **"Positivity over time: the vanishing regime."** A **K (time-resolution) slider**. As K grows,
   watch the always/never regime support evaporate (live support + ESS readout), the weighting
   estimators destabilize, and the plug-in g-formula stay put (it simulates forward). Teaches B +
   the coarseness tradeoff directly.
3. *(optional)* **"ICE vs plug-in."** Same DGM, a real ICE-DR/TMLE fit alongside the MC plug-in:
   same estimand, different sensitivities (ICE extrapolates under low support; plug-in needs the
   covariate model). Possibly folded into #2.

## Build requirements

- **Engine — a real from-data longitudinal g-method.** Today the panel's `g_formula` is the oracle
  (re-simulation of the true SEM). To teach ICE honestly we need ≥1 estimator that fits models to
  the finite sample:
  - a **sequential-regression ICE-DR** (Bang–Robins): `Q_k = E[Q_{k+1} | history_k, A_k=regime]`
    iterated backward, with the AIPTW/clever-covariate augmentation for double robustness;
  - and/or a **parametric g-formula fit from data** (fit `L_k | past`, `A_k | past` from the sample,
    then MC-simulate) — distinct from re-simulating the truth; this one exposes the g-null paradox.
- **UI — a K slider** on the positivity example: re-derive the visit chain, re-simulate, update a
  live support/ESS readout. Reuse the overlap/positivity module (PS histogram + ESS) generalized to
  sequential regime-following weights.
- **Output — separate the two failure modes.** Annotate each estimator with *why* it's off
  (over-adjusted vs under-supported), not one undifferentiated error column. Label the oracle as the
  oracle.

## Open questions (for Joe — PhD on this)

- Which ICE variant first: pooled-LTMLE, sequential-regression AIPTW, or a teaching-simplified ICE
  that still exhibits the extrapolation pathology?
- Fit the covariate process from data (real plug-in g-formula, shows the g-null paradox) or keep the
  oracle as a labeled "truth" reference and add ICE as the from-data contrast?
- One combined K-slider example vs separate "feedback" and "positivity" examples — how much to split.
- Calibrate so at small K the only failure is over-adjustment (isolating the modes), and support
  visibly dies by some K\*.

## Not in scope here

Fixing `what-if-hiv-cd4-variants` itself (coherence: teach ONE thing, label the oracle, decide which
estimators to show) is tracked separately and discussed next.
