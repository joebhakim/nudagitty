# Plan: output panel redesign — by EXTENDING existing components

Status: design / planning only. **Supersedes the from-scratch gallery prototype** (the toy-model
bars/arms plot in `apps/web/src/outputs/prototype/` — keep as a sketch or delete; do NOT graduate
it). The redesign is composing and extending the components that already exist, adding the missing
features — not building new charts.

## When / where (decided)

- **Its own branch**, created **after** the DGM toolbox (`dgm-toolbox`) is wrapped — do NOT tangle
  this into the DGM-toolbox branch. No code changes until then.
- **Steps 1–3 are all in scope**, including the per-method prediction/performance viz (step 3) and
  the `internals` payload it needs.
- Build it **end-to-end**, then reveal on the local **temp preview server (:4173)** for review (a
  temporary showcase, like the other canary reviews).
- Gate: branch only once we agree the DGM toolbox is "done" (current state: feature-complete and
  deployed to prod; round-2 items in ROLLING_TODOS are deferred, not blockers).

## The mistake to avoid

The prototypes looked like toy models because they were rebuilt from scratch and threw away the
app's real components, color vocabulary, axis controls, subtitles, and per-method copy. Every piece
we want mostly already exists. The plan is to ADD features to those, not replace them.

## What already exists (and what to add to each)

| feature we want | already exists | what to ADD |
|---|---|---|
| **X and Y axis controls** on the graph | **`PairVariableSelect`** (axis="x"/"y" dropdowns, driven by `exposureOptions`/`outcomeOptions`), composed in `ScatterplotPanel` | reuse verbatim in the effect graph; let it also pick a *strategy contrast* as the X when treatment is a joined regime |
| **the data graph** (points/alpha + CI) | **`CategoryOutcomePlot`** — its `CategoryOutcomeSummary` already has `mean`/`lower`/`upper`/`points`/`tone`, so **error bars are already in the data model**; binary→proportion+CI, continuous→swarm | add extra summary *series* = one per estimator (each method's arm means + CI), overlaid on the observed swarm; keep tones/color vocab |
| **subtitles** | **`ModuleFrame`** has `title` + `detail` (the subtitle), used across the app | give each box a `ModuleFrame` with a real title + `detail` subtitle (the prototype dropped these) |
| **methods table + primary/basis pickers** | **`MethodsComparisonPanel`** | add per-row ▸ expand (below) |
| **per-method "how it works" copy** | **`METHOD_GLOSSARY`** (plain + formula per estimator) already written | promote it from a single "How to read these methods" blob into a **per-row expandable**, plus model/variables/prediction viz |
| **color vocabulary** | base.css `--accent`, `--chart-series-1..3`, `--chart-muted`, `--ok`/`--danger`/`--bias`/`--causal`; chart tones `.treated`/`.untreated` | just USE them (the prototype invented hexes) |
| **observed/crude view** | `ScatterplotPanel` / `CategoryOutcomePlot` already renders the crude relation | it becomes the observed series in the same effect graph |

## The information hierarchy (what was missing)

Nest real `ModuleFrame`s with title + subtitle, progressive disclosure via the existing `<details>`
pattern:

```
Output  (ModuleFrame, subtitle: the question)
├─ Box: Effect graph        (ModuleFrame title + subtitle)
│    ├─ PairVariableSelect (X axis = treatment/strategy · Y axis = outcome)   ← existing control
│    └─ CategoryOutcomePlot, extended: observed swarm + one CI series per method, color vocab
├─ Box: Methods table       (ModuleFrame title + subtitle)
│    └─ MethodsComparisonPanel rows, each with a ▸ per-method expand:
│         · subtitle (one-line what-it-does)        ← from METHOD_GLOSSARY.plain
│         · model + variables it uses
│         · formula                                  ← from METHOD_GLOSSARY.formula
│         · prediction / performance viz             ← NEW, needs core internals
└─ (reliability + "how we know" stay the Overlap and DGP toolbar buttons)
```

Every level has a **subtitle**; everything past the headline is **collapsed by default**
(progressive disclosure), so a glance answers "does it help / do methods find it" and the mechanics
hide until expanded.

## The two real gaps (genuinely new work)

1. **Method-overlay series in `CategoryOutcomePlot`.** Today it shows ONE observed contrast
   (treated/untreated summaries). Extend the summaries input so the panel can render N series —
   the observed swarm plus each estimator's arm means with its CI — without changing the chart's
   visual grammar. The data model (`mean/lower/upper`) is already there; this is an API + render
   extension, not a new chart.
2. **Per-method prediction/performance viz + the core `internals` payload.** `GMethodEstimate`
   returns `{estimate, arms, diagnostics}`; the per-row expand needs the fitted model spec
   (variables, link, basis) and per-unit predictions/propensities/weights (or a summary) to plot
   predicted-vs-observed, the PS distribution, the weight spread. Add an optional `internals` field
   on `GMethodEstimate`, populated by each estimator.

## The joined-treatment X axis (decided: no glyph)

The structural glyph (▣▣▣/□□□) is dropped — too confusing. The two X positions are just the
contrast's arms, labeled by whatever the example calls them — the **strategy labels read from the
estimand's contrast** (config data like "always ART"/"never ART", not prose authored in the output
renderer). For a single-node treatment it's the node's two value labels. The "this is a 3-visit
regime" nuance is carried by the box subtitle / the DGP button, not crammed onto the axis.

## Sequencing

1. Compose the three boxes from existing components (`ModuleFrame` + `PairVariableSelect` +
   `CategoryOutcomePlot` + `MethodsComparisonPanel`) with subtitles + progressive disclosure — no
   new charts, just wiring + the hierarchy. Verify it doesn't look like a toy because it IS the
   real components.
2. Extend `CategoryOutcomePlot` to overlay method series (gap #1).
3. Add `internals` to `GMethodEstimate` + the per-row prediction viz (gap #2).
4. Settle the joined-treatment X representation; generalize across example types.

## Not in scope

Reliability (positivity) and provenance (DGP) stay as the existing Overlap and DGP toolbar buttons.
