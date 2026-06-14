# Output text architecture: bespoke vs. generic-template prose

Where the prose in a result/output panel comes from, and how "manual" each
example's text really is. Written after a mis-classification: Lord's paradox *looks*
auto-derived but its conclusion is a hand-written template (`modules.tsx:2255`).

## Two tiers of output prose

Every example's result panel gets its conclusion/recommendation text from **one of
two tiers — there is no example whose output text is fully generated with zero
hand-authored language.** The difference is granularity.

### Tier 1 — bespoke per-example modules

An example declares `outputModule: "<id>"` (`packages/core/src/examples.ts`). That id
resolves to a `CompletedOutputModule` in `apps/web/src/outputs/modules.tsx`
(`completedOutputModules`), whose `compute`/`render` produce prose written for that
one example. Values are interpolated, but the sentences and framing are bespoke.

The 20 with an `outputModule`: `tutoring-scores`, `simpson-severity`,
`icu-mortality-triage`, `college-earnings`, `front-door-smoking`,
`birthweight-paradox`, `obesity-paradox`, `cats-highrise-syndrome`,
`policing-encounters`, `m-bias-adjustment`, `chess-intelligence-practice-simple-flip`,
and the eleven `what-if-*` g-method examples.

### Tier 2 — the shared `computeStructuralDiagnosis` fallback

Examples with **no** `outputModule` fall through to `computeStructuralDiagnosis`
(`apps/web/src/outputs/modules.tsx`, used when `moduleId` is null →
`computedOutput.moduleId === "structural-diagnosis"`, see `App.tsx:4033`). This is
**not** auto-generated text — it is a set of **hand-written template branches
selected by graph structure** (~`modules.tsx:2240–2270`):

| Branch | Selected when | Reuse |
|---|---|---|
| **collider** | a conditioned node is a collider | generic — any collider |
| **gain-score** | exposure binary + a node shares the outcome's unit (pre/post) | **near single-example** (Lord's) |
| **confounder** | backdoor adjusters present | generic |
| **open-path** | open biasing paths remain | generic |
| **clean** | no open biasing paths | generic |

So the real axis is **per-example template (Tier 1)** vs **shared structural
template (Tier 2)** — not "manual vs auto." Lord's reads fully bespoke because it
trips the `gain-score` branch, which is shaped for essentially one example.

## "Pure" examples

A **pure** example renders entirely from the *generic* Tier-2 branches
(collider / confounder / open-path / clean) — no bespoke module, and not the
near-single-example gain-score branch. Improving a generic template improves all of
them at once.

Determined by driving each no-`outputModule` example through
`computeStructuralDiagnosis` and reading which branch fired:

| Example | Generic branch | Badge |
|---|---|---|
| `berkson-hospital` | collider | bad control |
| `case-control-selection` | confounder | confounding |
| `instrumental-encouragement` | clean | identified |
| `mediation-direct-total` | clean | identified |
| `target-trial-followup` | confounder | confounding |
| `ota-gene-program-traits` | clean | identified |
| `ops-root-cause` | collider | bad control |
| `education-mediation` | collider | bad control |
| `policy-event-study` | confounder | confounding |
| `incrementality-uplift` | confounder | confounding |
| `causal-ml-refutation` | confounder | confounding |

**Cleanest standalone teaching candidates** (the rest are broad domain surveys):
`berkson-hospital`, `case-control-selection`, `instrumental-encouragement`,
`mediation-direct-total`, `target-trial-followup`.

### Not pure

- `lords-paradox` — trips the bespoke **gain-score** branch (the one that looks
  auto-derived but is hand-written prose).

### Empty (a third category)

These have no exposure/outcome marked, so `computeStructuralDiagnosis` returns
`null` and they render **no** auto conclusion at all — empty, not pure:
`measurement-error-latent`, `chess-intelligence-practice`, `galton-regression`.

## Reproducing the classification

Throwaway vitest: load each `EXAMPLES` entry without `outputModule`, build
`{ analysis, document, simulation }`, call `computeStructuralDiagnosis`, and bucket
by a distinctive phrase in `out.conclusion` (`"is a collider on"`, `"Lord's
paradox"`, `"is confounded by"`, `"open biasing path(s)"`, `"already the causal
effect"`). Delete the probe after — see `CLAUDE.md`.
