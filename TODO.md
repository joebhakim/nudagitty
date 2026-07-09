# Nudagitty — TODO

Working backlog for the canary branch (`refactor/decompose`). Grouped by theme, most-active first.
Deeper context lives in the auto-memory: `provenance-pins`, `data-table-rework`, `joint-source-cloud`,
`tutorial-scaffold`, `canvas-selection`, `copula-vine-toolbox`.

The core mental model for the current thread: **a data variable's *marginal* is always from data; its
*edges* (dependence on parents) are learned or authored, per-edge.** Marginal and dependence are separate
axes — the old whole-node "From data / Fit / Author" toggle conflated them.

---

## 1. Provenance / fit-from-data (active thread)

- [ ] **"Not learned" edge state.** A drawn edge with no fitted/authored value renders dimmed as
      *"not learned"* (no number) and contributes nothing to generation — kills the phantom `coef 1.0`
      that shows on inert edges today. *(task #91)*
- [ ] **Editor: Marginal + Dependence split.** Generation block →
      *Marginal:* "from data" for a data node (a stated fact + the observed shape, with an
      "author a parametric marginal instead" escape); *Dependence:* the edge list, each
      **Not-learned / Fitted 📌 / Authored ✎**, plus "fit all". Drop the whole-node mode toggle. *(task #91)*
- [ ] **Wire-time model-type prompt.** Drawing (or bulk-wiring) an edge into a data variable pauses:
      "You're giving `treat` a dependence — model: **logistic** (binary). [Learn from data] [Leave unlearned]"
      → fits per-node (joint over its parents). Not silent inert edges. *(task #91)*
- [x] **Marginal-preserving fit — binary.** VERIFIED already preserved: the logistic MLE with a fitted
      intercept makes the mean predicted probability equal the empirical rate, and Bernoulli(rate) IS the
      whole marginal. (lalonde-recover-rct In_program: read 0.063 → fit 0.066 vs empirical 0.069.) No extra
      calibration needed. The editor badge says "from data (rate preserved)" for a fitted binary node. *(#92)*
- [ ] **Marginal-preserving fit — continuous (NORTA).** OLS preserves the fitted continuous node's MEAN
      (verified: Earnings_78 20232 → 20555 vs 20502) but NOT the shape — additive-normal noise makes a
      symmetric Gaussian, wrong for skewed/zero-inflated earnings. `copula_marginal` already IS the NORTA
      transform (η → Φ → F⁻¹); the missing piece is an **`empirical` NodeDistribution kind** (sorted-sample
      inverse-CDF) to use as F. Then fit on the normal-score scale (coef = latent loading, not a $-slope),
      set combiner=`copula_marginal` + the empirical marginal. Heavy/own pass: the new dist kind ripples
      through normalize / sampleDistribution / inverseMarginalCdf / analytic / **golden** / share-URL
      (samples bloat the compact URL — store a downsample or a ref). Until then the editor honestly shows
      a "modeled" badge for a fitted continuous node. *(#92)*
- [ ] **Residual-independence / exogeneity diagnostic.** *(task #90)* After fitting `Y ~ X` in additive-noise
      mode, show residuals-vs-fitted + residuals-vs-each-parent + an **HSIC / distance-correlation**
      independence score. Fail ⇒ flag *"the exogenous-noise assumption (ε⊥X) looks violated — enrich the
      functional form, or suspect an unmeasured confounder,"* pointing at the offending parent. This is the
      **additive-noise-model spec/identifiability test** (LiNGAM / nonlinear-ANM): a **refutation, not a
      confirmation**, and **powerless in the linear-Gaussian case** (needs non-Gaussianity/nonlinearity to
      bite — earnings qualify). Makes additive-noise the honest, *falsifiable* default vs NORTA (which can't
      be caught being wrong).

## 2. Provenance Phase 2b — remaining polish (minor)

- [ ] Literal **📌 on the canvas edge coefficient labels** (they render in a separate layer; `data.pinned`
      is already plumbed — just needs the glyph). Line color carries provenance there for now.
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
