# Running TODOs

This branch is turning Nudagitty from a DAG drawing surface into a broader practitioner workbench. Keep this file current while the implementation is incomplete.

## Done In This Branch

- [x] Domain examples: added practitioner example models for epidemiology/public health, econometrics/public policy, product analytics/experimentation, ML/data science, operations/reliability/supply chain, and social science/education/psychology while keeping the existing classic examples.
- [x] Example browser: replaced the flat examples dropdown with a two-level domain menu so users can scan by practice area before loading a model.
- [x] Modes: added a basic/domain/pro mode toggle. Basic stays approachable for quick explanation and internet-argument use; domain mode shows recommended tools for the active example domain; pro exposes all modules.
- [x] Design modules: added structured module cards for adjustment, target trial, IV, DiD/event study, RD, synthetic control/CausalImpact, experiments/uplift, mediation, graph refutation, causal discovery, root-cause analysis, and distribution-change attribution.
- [x] Denouement packets: added module-specific output/checklist writing for every built-in example so each example states its intended causal claim, estimand, diagnostics, threats, and report language.
- [x] Completed Simpson example: added a computed final output card with crude recovery association, structural `do(Treatment=1)` versus `do(Treatment=0)` contrast, severity separation fast-read, adjustment set, and paradox verdict.
- [x] Completed ICU example: added the golden "Does the ICU make patients die?" model with Gaussian baseline severity, binary ICU admission, binary mortality, Gaussian triage-score collider, and a computed output card for crude mortality, `do(ICU)` contrast, severity separation, and bad-control warning.
- [x] Completed college example: added the golden "Does college raise earnings?" three-variable model with binary family advantage, binary college attendance, continuous earnings, and a computed output card for raw wage premium versus `do(College)` premium.
- [x] Completed tutoring sign-flip example: added the golden "Does tutoring hurt test scores?" three-variable model with binary academic need, binary tutoring, continuous test score, and a computed output card where the raw association is negative but the `do(Tutoring)` effect is positive.
- [x] Chess model consolidation: reduced the chess narrative to two examples: a paper-shaped nonlinear DGP that conditions on `Elite_sample` but fails to flip the IQ-rating sign, and a compact manually specified compensatory-selection DGP that succeeds. Removed the rich latent scaffolding from the catalog.
- [x] TODO affordances: added visible TODO cards for heavier workflows that are not implemented yet: question-first analysis plan, data-aware DAG/import, and code/export bridge.

## Later

- [ ] Data-aware DAG: import CSV, map columns to graph nodes, inspect missingness/types, run balance and overlap checks, and test graph implications against data.
- [ ] Synthetic datasets: add bundled or generated datasets aligned to each domain example so practitioners can move from diagram to diagnostics without hunting for data.
- [ ] Code/export bridge: generate reproducible R/Python/Stata skeletons for the selected design module and export a collaborator-facing report.
- [ ] Analysis plan mode: add a deliberately more demanding workflow for population, unit, time zero, treatment strategies, estimand, contrast, data source, and design assumptions.
- [ ] Alternative graph compare: support competing DAG versions and show which identification claims survive across alternatives.
- [ ] Assumption ledger: attach evidence, risk, measurement source, and comments to nodes/edges, then include them in exported reports.
