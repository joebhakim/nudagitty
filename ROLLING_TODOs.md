# Nudagitty — TODO

Working backlog for the canary branch (`refactor/decompose`). Grouped by theme, most-active first.
Deeper context lives in the auto-memory: `provenance-pins`, `data-table-rework`, `joint-source-cloud`,
`tutorial-scaffold`, `canvas-selection`, `copula-vine-toolbox`.

The core mental model for the current thread: **a data variable's *marginal* is always from data; its
*edges* (dependence on parents) are learned or authored, per-edge.** Marginal and dependence are separate
axes — the old whole-node "From data / Fit / Author" toggle conflated them.

---

## 0. Family-aware fit + stronger target (active — tasks #93/#94/#95)

The honest replacement for NORTA: fix a fitted marginal by **improving the model** (link + noise
family), not by forcing it through a copula (which buries the residual/endogeneity warnings). Generation
already does `Y = g⁻¹(η+ε)`, so the fitter just learns the link the node's family implies.

- [ ] **#93 Family-aware fit v1** — fit OLS on `g(Y)~X` (identity/log/softplus/logit from the node's
      combiner) + normal noise on the link scale; residual check moves to that scale. Golden-safe (additive
      = identity, unchanged). Verify the fit-link ↔ generate-`g⁻¹` round-trip.
- [ ] **#94 Follow-ups** — noise-family fit (skew/heavy-tail ε), two-part/hurdle for zero-inflation (the
      real earnings-$0 fix), **retire NORTA** (#92): keep `copula_marginal` only for the copula/joint tool's
      authored correlations, never fit-from-data.
- [ ] **#95 Stronger target** — `lalonde-fit-recover`: plasmode covariates + FIT treat (logistic) + FIT
      re78 confounders holding treat→re78 AUTHORED at the imposed effect (treat→outcome is NOT a fit DoF).
      Imposed effect = **+$1,794 (real RCT benchmark)**. Estimator LEDGER vs truth (crude biased; g-formula
      /IPW/AIPW recover). **Recovered-vs-truth card** included. Golden replication test (build from scratch →
      match saved example). Open sub-decision: additive +$1,794 (identity link, marginal drift diagnosed —
      "the limit of DGM") vs log link + τ calibrated to ATE $1,794 (realistic marginal, multiplicative
      effect). Blocked by #93.
  - [ ] DEFERRED (not now): a **tutorial walkthrough** that builds the fitted DGP from scratch
        (import → mark → wire → fit → author effect → recover), like the LaLonde tour ([[tutorial-scaffold]]).

## 1. Provenance / fit-from-data (active thread)

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

## 2. Provenance Phase 2b — remaining polish (minor)

- [ ] Literal **📌 on the canvas edge coefficient labels** (they render in a separate layer; `data.pinned`
      is already plumbed — just needs the glyph). Line color carries provenance there for now.
- [x] Node marginal **markers + split legend** DONE (commit e9080f4): teal mini-table = data-derived, amber
      ƒ = model-defined/ex-nihilo; legend split into Nodes vs Edges groups.
- [ ] Mixed-node **dominant-provenance nuance** on the canvas node tint (a part-fitted node shows one color).
- [ ] Reconsider the **"Learn the DGP →" wording** — may overclaim. Consider "Fit this DGP to the data" +
      a "given your DAG + functional forms + no hidden confounders" caveat.

## 3. Fit the confounder JOINT from data (Phase 3b)

- [ ] Empirical marginals (per-column inverse-CDF) + a **vine fitted from the table** (Kendall τ per pair
      → `CopulaBlock`) → author-free copula joint; wire into the Joint/DGM **Copula tab** as "fit from data".
      The copula analogue of the edge-fitting already shipped.

## 4. Tutorial — remaining

- [ ] **Auto-load / download the sample CSV** in step 1 (the tour says "upload lalonde-obs.csv" but doesn't
      hand it to you — it's at `/sample-data/lalonde-obs.csv`).
- [ ] Deferred knobs: **adjustment auto-launch vs the user choosing**; allow fitting/adjusting a **data subset**.
- [ ] **Mobile long-press → multi-select** (desktop Ctrl+drag marquee is done).

## 5. Editor / canvas UX

- [ ] **Grey out non-relevant controls** to lower salience (esp. during the tour) — the button-declutter pass
      (the "implicit noise nodes" toggle etc.). Grey out, don't delete.
- [ ] **Connect / Couple tool-mode hijack:** clicking a node in those modes doesn't surface exposure/outcome
      (this was the real cause of "re78 outcome not highlighting"). Rethink the tool modes.
- [ ] Surface **exposure/outcome** more prominently vs the Analysis-operation panel in the node editor
      (partly addressed by the Generation restructure).

## 6. Import

- [ ] **File upload skips the preview/confirm** that paste shows — add a "N columns → nodes + types" confirm
      (and a chance to deselect columns) before committing.
- [ ] **Type inference is binary-or-continuous only** — add a cardinality heuristic (few distinct integers →
      categorical/ordinal), so codes like twins `mrace/frace/birattnd/pldel` aren't inferred "continuous".
- [ ] **Imported datasets drop from the compact share-URL** (large-data-won't-share) — a re-upload prompt or
      a compressed-sample embed so a shared fitted model isn't empty.

## 7. Misc / smaller

- [ ] **galton-regression** shows the "mark an exposure and outcome" empty state (it's the only example with
      no roles) — decide whether to auto-mark its roles (would shift its golden snapshot).
- [ ] **#82 — GLUT4 full-curve tooling:** let a node modulate a full edge-mechanism curve.

---

## Recently shipped (canary, this thread)

Joint-source cloud unification (copula + plasmode → one cloud + Joint/DGM editor + shared↔independent
switch) · CSV import → typed node dump · multi-select + group actions · Ctrl+drag marquee · interactive
tutorial (LaLonde) · **learn edges from data** (fitDgpFromData) · **live pin engine** (reactive reconcile,
offset regression, mixable) · **provenance overlay** (authored/data/pinned colours + legend + flash) ·
**unified "Generation" editor element** with per-number 📌/✎ chips · per-node Read/Fit/Author + edit-authors.
