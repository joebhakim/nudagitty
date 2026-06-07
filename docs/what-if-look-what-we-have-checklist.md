# What If Advanced Track: Look What We Have Checklist

This is an inventory note for coming back later. It explains what was added, where it lives, and which parts are real versus provisional.

## Examples In The Catalog

- [x] `what-if-treatment-feedback`: A0 -> L1 -> A1 -> Y treatment-confounder feedback.
- [x] `what-if-ipw-pseudopopulation`: single-time treatment, standardization, and IP weighting.
- [x] `what-if-hazard-selection`: hazards and survivor-selection warning.
- [x] `what-if-nhefs-mortality-survival`: smoking cessation, censoring, and mortality survival.
- [x] `what-if-weight-gain-g-estimation`: smoking cessation and weight-gain structural nested mean model sketch.
- [x] `what-if-hiv-cd4-variants`: HIV/CD4 history with dynamic ART variants.
- [x] `what-if-censoring-ipcw`: censoring represented as a time-varying process with IPCW-style output.
- [x] `what-if-dynamic-g-formula`: threshold-style dynamic treatment strategy.
- [x] `what-if-snaft-survival`: structural nested accelerated-failure-time style survival sketch.

Source of example definitions: `packages/core/src/examples.ts`.

## Data Model And Metadata

- [x] `GraphDocument.schemaVersion` is v2.
- [x] Graph metadata has `metadata.longitudinal`.
- [x] Longitudinal metadata tracks time points, variable roles, strategies, estimands, censoring specs, and survival outputs.
- [x] Source metadata tracks book title, authors, year, URL, chapter, section, reference, and rewritten-note fields.
- [x] Dynamic treatment strategies are metadata rules, not parser syntax.

Source files: `packages/core/src/types.ts`, `packages/core/src/graph.ts`.

## Longitudinal Helpers

- [x] Extract and validate longitudinal metadata.
- [x] Build simulated cohorts from existing simulation output.
- [x] Compare naive, stratified/outcome-regression, g-formula, IPW/IPCW, and additive g-estimation rows.
- [x] Materialize simple dynamic treatment rules row by row.
- [x] Build person-time rows from repeated event/censoring variables.
- [x] Estimate simple discrete-time survival curves.
- [x] Cache treatment probability tables so examples do not peg a CPU during output recompute.
- [x] Support `absorbing` event edges for cumulative outcomes, e.g. death by 5 years deterministically implies death by 10 years while later death risk still depends on other factors.

Source file: `packages/core/src/longitudinal.ts`.

## Pro Output UI

- [x] Shared What If output module renders metric cards, estimator table, strategy cards, source details, and optional survival curve.
- [x] What If examples use `Model output` instead of the normal `After adjustment` frame title.
- [x] Source/chapter detail is tucked into the expandable diagnostics area.
- [x] Survival/risk summaries can appear as first-class metrics.

Source files: `apps/web/src/outputs/modules.tsx`, `apps/web/src/App.tsx`, `apps/web/src/styles.css`.

## What Is Real Enough To Trust

- [x] The graph shapes, time ordering, metadata validation, and output wiring are real.
- [x] Static and simple dynamic strategy contrasts are computed from the app's simulated DGPs.
- [x] IPW/IPCW rows use estimated binary probability tables from the simulated cohort.
- [x] Survival curves are computed from repeated event/censoring variables.
- [x] Cumulative survival outcomes can now use absorbing edges instead of fake high-coefficient linear/logit edges.
- [x] Tests cover catalog registration, metadata validation, dynamic strategy materialization, survival summaries, IPCW support, and browser loading.

## What Is Still Provisional

- [ ] These are rewritten teaching simulations, not reproduced book tables.
- [ ] No deterministic fixture tables from the book are wired yet.
- [ ] G-estimation is an additive teaching approximation, not a full SNMM/SNAFT estimator.
- [ ] Dynamic strategies only support simple threshold/equality rules.
- [ ] Stochastic strategy metadata exists as a type category but is not materially evaluated.
- [ ] Survival output is simple discrete-time product-limit style, not a complete causal survival pipeline.
- [ ] Censoring examples show IPCW-style calculations, but no full sensitivity or competing-event workflow.
- [ ] No graph overlays yet for time slices, opened collider paths, prior-treatment history, or pseudo-population edge removal.

## Tests To Re-Run After Bug Fixes

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run test:e2e`
- [ ] `npm run build`
- [ ] Manual screenshot of at least one dynamic strategy example and one survival example.

## Quiz Joe In The App Later

- [ ] Open `What If: NHEFS smoking cessation and mortality` and ask: does the `Death_5y -> Death_10y` edge read as deterministic/absorbing rather than a tunable linear coefficient?
- [ ] Ask whether the observed pairwise output is helping or distracting for the survival examples.
- [ ] Ask whether the first-visible model-output metrics are enough, or whether the survival curve should be higher priority than the estimator table.
- [ ] Ask whether the dynamic strategy labels make it clear which history rule is being applied.

## Good First Questions When Returning

- [ ] Are the new examples too numerous for the catalog without a subcategory?
- [ ] Should the output card expose less estimator machinery by default?
- [ ] Should survival examples prioritize survival curves over g-method tables in the first viewport?
- [ ] Should the pairwise observed graph be hidden or demoted for examples where it is predictably misleading?
- [ ] Do dynamic strategy labels make it obvious what rule is being applied?
- [ ] Which examples should get book-like deterministic fixtures before more UI polish?
