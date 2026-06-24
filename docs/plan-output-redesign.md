# Plan: output panel, rethought from the ground up

Status: design / iterating. Replaces the current output composition entirely (the
WhatIfAdvancedOutputView stack + the separate "Observed association" frame). Nothing of the current
structure is assumed kept.

## Why

The current output renders ~9 modules in two frames, shows the headline number 3–4× under different
names, scatters support/positivity across three places, and leads with jargon ("Sequential
g-formula −21.3 pp"). People spend ~0.5s on a dense page and bounce. (Total-tree audit in chat,
2026-06-24.)

## Principles (from Joe)

1. **Graphs first; no prose on the graphs.** The effect graph stands on its own — no
   plain-language sentence leading it.
2. **Vertical bars: x = treatment, y = outcome.** Facet by approach when useful, but only a few
   facets — never a wall of small multiples.
3. **The effect graph and the methods are ONE linked unit.** A set of rows whose numbers match the
   graph exactly; selecting/hovering a row highlights its facet (and vice versa). You always know
   the table and the picture are the same thing.
4. **Reliability and provenance live in the toolbar buttons we already have**, not as output cards:
   - **Overlap / positivity** → the existing Blend button (positivity verdict, PS histogram, ESS).
   - **How nudagitty knows the true answer** → the existing DGP (Σ) button, made richer: the actual
     structural equations *with the plugged-in coefficients*, plus each method's real fitted numbers.
5. **Progressive disclosure for mechanics.** Per-method internals (models, variables, prediction
   viz) hide behind ▸ until asked for.
6. **"Can you trust the methods" is deferred** — revisit after the effect+methods core lands.

## The output panel = one linked unit (effect + methods)

```
OUTPUT
├─ Effect graph  — vertical bars, x = treatment (e.g. never / always), y = outcome (% event).
│     Faceted by approach (a FEW: truth + the selected/representative methods). Generic, no prose.
│     The "truth" facet carries the oracle's potential outcomes.
├─ Methods rows  — one row per estimator, numbers matching the graph EXACTLY
│     (arm outcomes + effect). Selecting a row highlights its facet in the graph; the truth row is
│     set apart (oracle). This is the link between ① "does it help" and ② "do methods find it".
└─ Per-method mechanics ▸ (one per row)
      what model(s) it fits, which variables, and a viz of its predictions/performance
      (e.g. IPW: P(treat | CD4) logistic → weight distribution; AIPW: outcome model + propensity,
      predicted-vs-observed; regression: fitted outcome curve). See "core work".
```

- **Facets, curated.** Default to **truth + the selected method** (2 facets), with the rows letting
  you swap/pin which method is faceted. Never dump all 8 as small multiples.
- **Linking.** Rows ↔ facets is brushing: hover a row → its bars light up; the displayed numbers are
  literally the bar heights, so table and graph can't disagree.

## Toolbar (unchanged in placement, richer in content)

- **Overlap / positivity (Blend button):** stays exactly where it is — the reliability story.
- **DGP (Σ button):** becomes "how nudagitty knows" — the structural equations WITH plugged-in
  numbers (already most of the DGP inspector) + surface each method's actual fitted models/numbers.

## Old → new mapping

| current module | becomes |
|---|---|
| "Observed association" frame | a facet/row of the effect graph (the crude/naïve estimate), not a separate box |
| shell header + conclusion | gone (no prose headline) |
| metric tiles (g-formula / rule support / IPW support) | g-formula → the truth row; supports → the positivity button |
| "Rule support by visit" table | positivity button ▸ |
| methods headline + plain | gone / folded into the rows |
| primary-method + basis dropdowns | a small control on the rows (highlight = select) |
| "Compare all methods" table | the linked methods rows (now graph-coupled) |
| "How to read these methods" glossary | per-method mechanics ▸ |
| strategy grid | DGP button / a row tooltip |
| "Source and diagnostics" | DGP button |

## Core work this needs (new)

The estimators currently return only `{estimate, arms, diagnostics}`. The per-method mechanics +
prediction viz need them to also expose intermediates:
- the **fitted model spec** (which variables, link, basis) per estimator;
- **per-unit predictions / propensities / weights** (or a summarized distribution) so we can plot
  predicted-vs-observed, the PS distribution, the weight spread.
Scope this as an optional `diagnostics`/`internals` payload on `GMethodEstimate` so the panel can
visualize without recomputing.

## Generalization

The effect graph (x = treatment, y = outcome, truth facet) and the linked rows are universal across
example types. The only per-example variation is the *source of truth* (imposed-DGP oracle vs
external benchmark for replays) and the treatment axis labels (binary arms vs strategies).

## Build approach

- New `OutputView` = effect graph + linked rows; one new small-multiple bar chart with brushing.
- Reuse the overlap module (positivity button) and DGP inspector (Σ button) as-is.
- Per-method mechanics + prediction viz is a second phase (needs the core `internals` payload).
- Prototype on `what-if-hiv-cd4-variants` (now numerically clean), then generalize.

## Open questions

- Effect graph: always truth + selected method (2 facets), or truth + a fixed small set (naïve /
  IPW / regression)?
- Binary outcome → bars are % event; continuous outcome → bars are mean. Same chart, different y.
- Brushing on mobile (393px): tap-to-select rows, single facet pair shown.
