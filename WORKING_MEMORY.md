# WORKING_MEMORY.md

Findings from a survey of the conditioning / intervention surface area, captured for future cleanup. None of these block current functionality, but each is a footgun for new contributors and for example authors.

## Three parallel "fix this variable" mechanisms

| Mechanism | Type | Wired? | Semantics |
| --- | --- | --- | --- |
| `SimulationSpec.overrides: Record<string, number>` | per-node hard scalar | yes (`packages/core/src/simulation.ts:95-99`, `:405-406`, `:735-736`) | `do(X = value)` — skips parents and noise, marks the node as constant in analytic output |
| `SimulationSpec.selections: Record<string, SimulationSelectionCondition>` | per-node observational filter | yes (`packages/core/src/simulation.ts:568-586`) | rejection / importance / analytic Gaussian conditioning on `at_least`, `at_most`, `between` |
| `selected`-roled downstream binary node (e.g. `Elite_sample`) | structural graph node | yes, but it does not condition draws | DAG pedagogy for selection-as-collider; a regular node with `roles.selected = true` rendered with a checkmark |

Pick by intent: do-intervention → `overrides`. Observational within-stratum analysis → `selections`. Visual collider in the diagram → `selected`-roled node. **There is no shared abstraction.** A future cleanup could collapse these into a single `analysisContext` object on the simulation spec.

## Dead intervention kinds

`VariableInterventionModel.kind` (`packages/core/src/types.ts:51-57`) declares five values:

- `hard_do` — *only one consumed*, and only because it duplicates into `overrides`. The simulator never reads `variable.intervention`.
- `soft_shift` — declared, validated, exposed in UI dropdown at `apps/web/src/App.tsx:255` ("Soft intervention"), **not consumed**. Selecting it silently no-ops.
- `stochastic` — declared, **not consumed**.
- `policy` — declared, **not consumed**.
- `manual_override` — declared, **not consumed**.

Either implement the four dead kinds in `simulation.ts`, or remove them from `InterventionKind` and the UI tab. Current state misleads users who pick the dropdown and expect their shift to take effect.

## Adjustment method enum is for the output layer, not simulation

`VariableAdjustmentModel.method`: `none | bins | stabilized_ipw | propensity_score_todo`. Lives in the planned output-rendering layer per `docs/auto-output-detection-plan.md`. The simulator does not read it directly. The recently-added `stabilized_ipw` value is consumed by the binary adjusted-output/IPW display layer, not by the simulator. `propensity_score_todo` is explicitly named TODO.

Keep this in mind when designing the output registry described in the plan doc — adjustment is an *output-rendering* concern (binning, IPW reweighting of displayed scatter plots), not a simulation concern.

## Examples can ship with `selections` baked in (since this branch)

Helper `setSelection(document, id, condition)` in `packages/core/src/examples.ts` writes to `document.simulation.selections[id]`. Current chess users are `chess-intelligence-practice` and `chess-intelligence-practice-simple-flip`, both conditioning on `Elite_sample in {1}` so the examples load directly into the selected-sample analysis.

## Variable-bound conditioning (since this branch)

`SimulationSelectionCondition` still carries optional `valueRef: string | null` and `upperRef: string | null` (`packages/core/src/types.ts:214-225`). When set programmatically, the bound is read from `values[refId]` per draw in `matchesSelectionConditions` (`simulation.ts:574-595`) — enabling conditions like `X >= Y` instead of just `X >= 1.5`. Variable-bound conditions force rejection sampling: both `simulateLinearGaussianConditionedEmpirical` and `shouldUseImportanceSampling` bail out, and `conditionLinearGaussianJoint` returns null. The UI no longer exposes variable-bound selection because it confused the core selection-vs-intervention story; the `ConditioningEditor` now offers literal numeric bounds for continuous variables and category checkboxes for binary/categorical variables.

Limitation: no closed-form analytic or Gaussian-importance support — only rejection sampling, which can be slow for very tight ref-based conditions. If acceptance rate is low, widen the operator or add slack via a constant offset (would need a small extension to allow `X >= Y + c`).

Wholesale-replacement plumbing was already in place: `loadExample(id)` in `apps/web/src/App.tsx:700-705` calls `commit(document)`, replacing the entire `SimulationSpec` including `selections`. The `ConditioningEditor` (App.tsx:2184-2281) reads `document.simulation.selections` directly and reflects pre-populated entries on load. The `ScenarioPanel` (App.tsx:1803-1836) shows a "clear conditions" button when `selections` is non-empty.

Candidates for further baked-in conditioning examples: `berkson-hospital`, `case-control-selection`, `birthweight-paradox`, `causal-ml-refutation`. Each has a within-stratum story that currently requires manual setup.

## `selected`-roled node ≠ within-stratum analysis

The chess examples now use both pieces explicitly: the `Elite_sample` binary node makes the collider visible in the DAG, and `simulation.selections.Elite_sample = one_of {1}` slices the simulated draws for the displayed analysis sample. Without the `selections` entry, a selected-role node is still only a regular generated variable.
