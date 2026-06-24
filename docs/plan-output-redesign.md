# Plan: output panel, rethought from the ground up

Status: design / not started. Replaces the current output composition entirely (the
WhatIfAdvancedOutputView stack + the separate "Observed association" frame). Nothing of the current
structure is assumed kept.

## Why

The current output for a longitudinal example renders ~9 modules in two frames ("Observed
association" + "Adjusted estimate"), shows the headline number 3–4 times under different names
("Sequential g-formula", "True effect (oracle)", the methods headline), scatters support/positivity
across three places, and leads with jargon ("Sequential g-formula −21.3 pp"). People spend ~0.5s on
a dense page and bounce. See the "total tree" audit in chat (2026-06-24).

## Principles (from Joe)

1. **Graphs first, details second.** Every section leads with a picture, then one plain sentence,
   then optional ▸ detail.
2. **Graph more than the observed** — the oracle (truth) and the user's chosen method belong on the
   same chart, not buried in a table.
3. **No jargon headlines.** Lead with "does it help / by how much," not the estimator name.
4. **Progressive disclosure.** A glance answers the question; everything else hides behind ▸ until
   the reader knows to care (rule-support-by-visit, weights, formulas…).
5. **Organize by the questions people actually ask**, not by estimator.

## The five questions = the five sections (priority order)

Each is one card: a plain-language question header → a graph → one sentence → ▸ details. Cards get
progressively quieter (1 loud, 5 a footnote).

1. **Does the treatment help?** — the headline. Graph: the two potential-outcome levels under the
   contrasted strategies (e.g. "treat every visit 12%" vs "never 33%"), the gap annotated. One
   sentence in plain outcome terms ("ART cuts AIDS/death ~21 points"). This is the oracle/truth,
   stated as outcomes, never as "g-formula −21.3 pp".
2. **Do the methods uncover that effect?** — graph: a forest/dot plot of every estimator on a
   "harm ◄ 0 ► help" axis with the TRUTH as a reference line; on-target vs off-target colored. One
   sentence ("reweighting lands on it; adjusting for CD4 over-adjusts"). ▸ the full method table +
   glossary.
3. **Can you trust the methods here?** — reliability/positivity. Graph: the overlap/PS histogram (or
   a support gauge) + the positivity verdict badge (ok/weak/violated, already built). One sentence.
   ▸ ESS, rule-support-by-visit, weight distribution.
4. **How are the variables related?** — the observed/raw relationship. Graph: the scatter / crude
   contrast, or the DAG with the active path lit. One sentence on the confounding ("sicker patients
   get treated, so raw data hides the benefit"). ▸ correlations / observed detail.
5. **How does nudagitty know the truth?** — provenance, deepest ▸. It's a simulation we built (the
   DGP); the "truth" is the oracle (re-simulation) or, for benchmark replays, an external number.
   Source, the honest "this is a constructed DGP, not book tables."

## What graphs (concrete)

- **Q1 headline chart:** two bars / two dots = outcome under each strategy, gap shaded. Intuitive
  "if everyone treated vs no one." Carries the oracle.
- **Q2 method chart:** horizontal effect axis, truth as a vertical line, each method a dot
  (highlight the user's chosen method); distance from the line = error. Replaces leading with the
  table. (This is the one new chart to build; the rest reuse existing panels.)
- **Q3:** reuse the overlap histogram + positivity badge.
- **Q4:** reuse ScatterplotPanel / the DAG highlight.

## Old → new mapping (everything folds or dies)

| current module | becomes |
|---|---|
| "Observed association" frame | Q4 (demoted from a co-equal frame to a quieter card) |
| shell header + conclusion | Q1 plain sentence |
| metric tiles (Sequential g-formula / rule support / IPW support) | split: g-formula→Q1, supports→Q3 |
| "Rule support by visit" table | Q3 ▸ details |
| methods headline + plain | Q1/Q2 |
| primary-method + basis dropdowns | a small control on Q2 (or a gear), not a headline element |
| "Compare all methods" table | Q2 ▸ details |
| "How to read these methods" glossary | Q2 ▸ (or Q5) |
| strategy grid | Q1/Q5 ▸ |
| "Source and diagnostics" | Q5 |

## Generalization

The five questions are universal across example types (classic / DGM / longitudinal). The only thing
that varies is the *source of truth* in Q1/Q5: imposed-DGP oracle for simulated examples, external
benchmark for replays (lalonde-recover-rct), do-contrast otherwise. Build the shell once; per-example
config supplies the strategies, the truth source, and the confounding one-liner.

## Build approach (proposed)

- New `OutputView` shell that renders the five `<QuestionCard>`s; drive it from the existing
  computed output (GMethodsComparison + strategy evaluations + overlap diagnostic) — no new core.
- One new chart component (Q2 method forest plot); Q1 is a tiny two-bar SVG; Q3/Q4 reuse existing.
- Prototype on `what-if-hiv-cd4-variants` first (it's the worst offender and now numerically clean),
  then generalize to classic/DGM examples.
- Keep it behind the existing output-module dispatch so we can ship per-example.

## Open questions

- One scrolling stack of five cards, or Q1+Q2 always-open and Q3–Q5 collapsed by default?
- Does Q1 show just the truth, or truth + the user's chosen method side by side?
- Mobile: the forest plot at 393px — horizontal axis or stacked?
