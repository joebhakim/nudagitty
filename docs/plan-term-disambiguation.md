# Plan: Term Disambiguation section

## Goal

A comprehensive "Term disambiguation" section that teaches the vocabulary people conflate — across the
roles a third variable can play AND across fields/authors. Two layers, both requested (user picked
"Both" for display and "Full sweep" for example coverage):

1. **Phenomenon examples** (live DGPs): one minimal example per term, each rendering its structural
   signature on the canvas (the node-on-edge moderation primitive does the heavy lifting) plus its
   signature output portrayal.
2. **Terminology layer**: per-example reference cards + a standalone glossary map, sourced to specific
   authors/fields (Baron & Kenny; VanderWeele; Gail & Simon; Preacher-Rucker-Hayes; Muller-Judd-Yzerbyt).

## Backbone (DONE)

- `apps/web/src/shared/disambiguation.ts` — the term registry: `DISAMBIGUATION_TERMS` (confounder,
  mediator, moderator, collider, instrument, crossover, ordinal, moderated-mediation,
  mediated-moderation) each with `oneLiner`, `structure`, `alsoCalled` (name+field), `distinctFrom`,
  `anchors`; plus `DISAMBIGUATION_DISTINCTIONS` (synonymy, effect-mod≠interaction, four-types, scale
  dependence, relational roles). `disambiguationTermForExample(id)` maps an example → its term.
- `apps/web/src/outputs/DisambiguationCard.tsx` — the per-example reference card; wired into
  `AdjustedOutputPanel` (App.tsx) so it appears for any example with a registry entry. Already shows on
  the moderation examples and the existing confounder (`simpson-severity`) / mediator
  (`mediation-direct-total`) / collider (`berkson-hospital`) / instrument (`instrumental-encouragement`).
- Moderation examples + the `effect-modification` moderator-CATE output module (crossover / ordinal /
  moderated-mediation) — done in prior work.

## Remaining phases

### Phase A — Glossary map (standalone)
A single reference surface (overlay or `/disambiguation` page, mirroring the chart gallery / DGP
inspector pattern) rendering from the registry:
- A **roles grid**: confounder / mediator / moderator / collider / instrument — structure glyph, aka,
  anchors — each row linking to its live example (deep-link `#example=…`).
- An **interaction strip**: ordinal vs disordinal (crossover) vs moderated mediation vs mediated
  moderation, with the scale-invariance note on the crossover.
- A **pitfalls** block from `DISAMBIGUATION_DISTINCTIONS` (effect-mod ≠ interaction; four types; scale
  dependence; relational roles; cross-field synonymy).
- Reachable from the toolbar (next to "Explain"/Σ) and cross-linked from each card ("see the full map").

### Phase B — Full-sweep examples (pure teaching DGPs)
Make the disambiguation domain self-contained with **dedicated, pure teaching examples** — minimal
abstract DGPs named by role (Confounder/Treatment/Outcome, Treatment/Mediator/Outcome,
Treatment/Collider/Outcome, Instrument/Treatment/Outcome) in the style of the existing
`effect-modification-crossover`. **Not** the applied examples (jobs/LaLonde, HIV, NHEFS, simpson,
berkson, …) — the section is for the clean structural contrast, not real-data case studies.
- **Author** `disambig-confounder`, `disambig-mediator`, `disambig-collider`, `disambig-instrument`,
  `mediated-moderation` as pure DGPs in the `disambiguation` domain, then **re-point** the registry's
  `exampleId`s from the applied examples to these (so the cards + map land on pure examples only).
- **Author the missing**: `mediated-moderation` (W×A → M → Y — needs a `product` interaction routed
  through a mediator, or a gated path; contrast with moderated mediation).
- Per-term **signature portrayal** beyond the card: confounder → crude vs adjusted; mediator →
  direct/indirect decomposition; collider → "association appears on conditioning"; these mostly exist as
  their current output modules — verify each renders sensibly in-section.

### Phase C — polish
- Card ↔ map cross-links; "distinct from X" links to X's example.
- Optional: a compare mode (two phenomena side by side: fork vs chain vs node-on-edge).

## Decisions taken (from user)
- Display: **Both** (per-example cards + standalone glossary map).
- Example coverage: **Full sweep** (every catalogued term gets a live example in the section).

## Open choices (resolve in Phase B)
- Gather existing role examples by **clone** (stable `disambig-*` ids, self-contained section) vs
  **cross-list** (one example surfaced under two domains — needs menu support). Lean clone.
- `mediated-moderation` mechanism: `product` (W×A) feeding a mediator vs a gated mediator path.

## Verification
- Numbers probe per new example: confirm the intended contrast (e.g. mediated moderation's interaction
  is carried by the mediator, not direct).
- UI probe: each example's canvas shows the right structure (fork / chain / node-on-edge / inverted
  fork), the card shows the right term, the glossary map links resolve via `#example=`.
- `npx vitest run` + `npx tsc -b` green; update `examples.test.ts` id-list + outputModule map; remove
  throwaway probes.

## Critical files
- `apps/web/src/shared/disambiguation.ts` — registry (extend for new terms/links).
- `apps/web/src/outputs/DisambiguationCard.tsx` — the card.
- `apps/web/src/<new>/DisambiguationMap.tsx` (Phase A) + toolbar/overlay wiring in `App.tsx`.
- `packages/core/src/examples.ts` — full-sweep examples, `disambiguation` domain, dispatch, verified ids.
- `apps/web/src/shared/exampleVisibility.ts` — surface the new examples.
