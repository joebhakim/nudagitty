# UI element guide — expected hierarchy per example

The contract for what every example should render, top to bottom, so we can audit end-to-end
that nothing is missing (the chess "no estimand panel" gap is the kind of thing this catches).

Audited by the survey harness in **Verification** below — drive every example, record its actual
UI elements, diff against the expectation for its category.

## Universal (every Pro example)

1. **Canvas (DAG)** — role-styled nodes (`exposure` / `outcome` / `adjusted` / `selected` /
   `latent` / `instrument`), edges with coefficient labels, per-node distribution mini-plots.
   - A **modulation arrow** (dashed violet, `masks`/`flips`/`amplifies` + ⊣ cap) wherever the DGP
     has a `smooth_gated` node-on-edge interaction.
   - An **"IV?" candidate flag** wherever a node qualifies as an instrument.
2. **Toolbar** — `Examples`, `Explain this example`, `Data-generating process` (Σ); plus
   `Term disambiguation` and `Overlap / positivity` when relevant.
3. **At least one Output frame** (right / bottom column).

## Output categories

Each example resolves to exactly one of these by `(outputModule, exposure type, operation)`. The
**boxes** are the uniform collapsible `.output-box` cards, in order.

### A. Crude scatter — continuous exposure, no adjustment column
*Output frame: "Observed association".* The scatter (swarm / individual points) is the whole output.
- **Expected:** Observed-association scatter panel with individual points.
- **Known gap:** selection/collider examples here (chess, restaurant-collider) have a real
  **selection estimand** (`P(Y | X, S=1)`, restricted to the selected sub-sample) but render **no
  Estimand/Structure panel**, because that panel is gated to binary exposures
  (`shouldShowAdjustedOutputColumn → isBinaryGraphNode`). Candidate fix: relax the gate.

### B. Confounder adjustment — binary exposure, generic structural diagnosis
*Output frame: "Adjusted output".* No dedicated module; the structural-diagnosis fallback runs.
- **Expected boxes:** `Effect by treatment` → `Interpretation` (methods) → `Compare all methods`
  → metric grid → `Interpretation` (structural) → `Estimand` → `Structure` → `Recommendation`.
- No "Observed association" pane (removed as redundant once the adjusted column is present).

### C. What-if g-methods — `outputModule: "what-if-*"`
*Output frame: "Output".* The longitudinal / g-methods completed output.
- **Expected boxes:** `Effect by treatment` (faceted observed/truth/selected) → `Interpretation`
  → metric grid → `Compare all methods` → (survival curve, when survival) → `Source and diagnostics`.

### D. Effect modification / moderator — `outputModule: "effect-modification"`
- **Expected:** moderator-CATE output (`Effect by {moderator}` facets) + the **disambiguation card**
  (for the `disambiguation` / `genetics` domains) + a **modulation arrow** on the canvas.

### E. Instrument / IV — `outputModule: "instrument"`
- **Expected:** instrument output (reduced-form by instrument, first-stage, naive/IV/oracle verdict)
  + an **"IV?" candidate flag** on the canvas.

### F. Paradox / "Huh" — dedicated module (collider/selection/mediation stories)
*Output frame: "Output" / "Diagnosis".* `renderHuhOutput`.
- **Expected boxes/blocks:** metric grid → `Interpretation` → narrative bullet list. May *also* show
  `Effect by treatment` + `Compare all methods` when a g-methods comparison is available.

### G. DGM toolbox — `dgm` domain
- As **C**, plus the **`Data-generating process` (Σ) inspector** and (where overlap matters) the
  **`Overlap / positivity`** panel; same fixed truth across the variants.

## Verification — the audit harness

`apps/web` survey (throwaway Playwright, `--workers=1`): drive every id in `EXAMPLES`, record
`{ boxes, scatter, moderator, instrument, facets, metricGrid, methods, disambig, modulation,
observedAssoc, dgpBtn, … }`, then diff each example against its category's expectation. Re-run after
any output-composition change.

## Audit results

Survey of all **52 examples** (drive each, record actual UI). Eight observed patterns; the **gaps**
are where an example renders less than its category warrants. The Σ "Data-generating process" button
is **universal** (present on all 52) — it's the *content* that's DGM-specific, not the button.

### Observed patterns
- **P2 — complete generic adjustment** (Effect-by-treatment · Interpretation · Compare-all-methods ·
  metric grid · Interpretation · Estimand · Structure · Recommendation): flexible-adjustment, berkson,
  case-control-selection, lords-paradox, target-trial-followup, what-if-nhefs-weight-gain, all 5 wg-dgm,
  lalonde-dgm-independent/generative, lalonde-recover-rct, policy-event-study, incrementality-uplift,
  causal-ml-refutation, ops-root-cause, education-mediation. **This is the reference shape.**
- **P3 — dedicated module, no Estimand/Structure**: icu-mortality-triage, college-earnings,
  front-door-smoking, cats-highrise-syndrome, m-bias-adjustment, chess-simple-flip.
- **P4 — what-if g-methods** (named interpretation box, no Estimand/Structure): the 9 what-if-* survival/
  longitudinal examples.
- **P5 — minimal** (metric grid + one Interpretation + narrative bullets only): tutoring-scores,
  birthweight-paradox, obesity-paradox, policing-encounters.
- **P6 — moderator** (complete): effect-modification-crossover/ordinal, moderated-mediation, epistasis.
- **P7 — IV** (complete): john-snow-cholera.
- **Scatter-only**: restaurant-collider, measurement-error-latent, chess-intelligence-practice,
  galton-regression.

### Gaps — status after the fix pass
1. **`instrumental-encouragement` rendered no instrument output.** ✅ **FIXED** — rewired
   `Encouragement [instrument]` / `Treatment [exposure]` + `outputModule: "instrument"`; now shows the
   full IV output (By Encouragement, Naive·IV·truth) like John Snow, with AIPW failing (latent confounder)
   while IV recovers the effect.
2. **Selection examples lost the estimand.** ✅ **FIXED** — `shouldShowAdjustedOutputColumn` now also
   fires for continuous exposures with a conditioning operation; `computeStructuralDiagnosis` produces the
   estimand/structure without binary contrast metrics; the layout keeps the scatter alongside (continuous
   only). chess + restaurant-collider now show `P(Y | X, S=1)` + the collider "bad control" structure.
3. **Estimand/Structure presence depended on code path.** ✅ **FIXED (with a correctness guard)** —
   `AuxEstimandStructure` renders the estimand/structure alongside a dedicated module too, **but only when
   the estimand is trustworthy**: a selection/stratification estimand always shows; a backdoor-standardized
   estimand shows only when the adjustment actually identifies the effect (`totalEffect.valid`). So icu /
   college / cats gain it; **front-door (mediator) and M-bias (collider) deliberately suppress it** rather
   than assert a wrong "backdoor-standardized" target. what-if examples are excluded (own framing).
4. **Double "Interpretation" boxes.** ✅ **FIXED** — the methods-panel card is now **"Chosen estimate"**;
   the structural/completed conclusion keeps **"Interpretation"**. One of each per output.
5. **Richness varies within a category.** ⏳ **OPEN** — some paradoxes (cats) show Effect-by-treatment +
   methods while siblings (obesity, birthweight, policing, tutoring) show only a metric grid + one
   Interpretation, driven by whether a g-methods comparison is available. Not yet addressed.

Re-run the survey harness after any output change to keep this current.
