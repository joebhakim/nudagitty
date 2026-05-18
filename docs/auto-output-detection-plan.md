# Automatic Output Detection Plan

Goal: choose the useful raw and adjusted output automatically from the graph, variable types, and estimand roles, before falling back to example-specific modules.

## Current foundation

- Binary exposure + binary outcome now has a generic output family:
  - raw 2x2 matrix for exposure by outcome
  - one 2x2 matrix per binary adjusted stratum
  - explicit empty state when no binary adjusted strata exist
  - warning when adjusted variables are continuous and need bins, matching, or standardization

## Detection stages

1. Read graph roles.
   - Require exactly one exposure and one outcome for automatic primary output.
   - Treat multiple exposures/outcomes as a future multi-estimand problem.

2. Classify variable types.
   - Binary/binary: confusion-matrix family.
   - Binary/continuous: two vertical distributions, raw and adjusted.
   - Continuous/continuous: scatter, regression slope, and conditional means.
   - Continuous/binary: risk curves or binned treatment contrasts.

3. Use causal identification logic.
   - Ask analysis for valid adjustment sets for the total effect.
   - Prefer user-marked adjusted variables if they satisfy a valid set.
   - If user-marked adjustment is insufficient, show raw output plus the smallest suggested valid set.
   - If no valid set exists, say so and avoid pretending the adjusted output is causal.

4. Select adjustment display.
   - All adjusted variables binary: exact strata.
   - One continuous adjusted variable: user-editable bins plus support warnings.
   - Multiple continuous/mixed adjusted variables: model-based standardization, matching neighborhoods, or propensity weighting.
   - Sparse strata: show positivity/support warnings and collapse low-support cells.

5. Separate causal questions from descriptive conditioning.
   - Raw output: observed association.
   - Adjusted output: association after the selected adjustment strategy.
   - Do output: interventional contrast only when the simulation graph supports it.

## Pearl-style logic needed

- Backdoor path checks: identify open noncausal paths from exposure to outcome.
- Valid adjustment-set checks: block every open backdoor path without conditioning on descendants of exposure.
- Minimal set ranking: prefer smaller sufficient sets, then user-marked sets, then domain-labeled confounders.
- Bad-control warnings: flag descendants, colliders, and selected nodes in proposed adjustment sets.
- Positivity checks: every adjusted stratum or neighborhood needs support for both exposure levels.

## Near-term implementation order

1. Add an output registry with predicates: `canRender(context)`, `priority`, and `render(context)`.
2. Move binary raw/adjusted output into that registry.
3. Add generic binary/continuous raw-vs-adjusted output using vertical strip plots.
4. Add binned continuous adjustment as a reusable output, not only the college example.
5. Teach the registry to choose outputs from valid adjustment sets when the user has not marked any adjusted variables.
