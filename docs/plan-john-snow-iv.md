# Plan: John Snow's cholera study — the canonical instrument, done right

## Why this example

John Snow's 1854 "Grand Experiment" is cited as the **first use of an instrumental variable**. It is the
ideal IV teaching case for the disambiguation section: concrete but pristine — a clean as-if-random
instrument with an obvious exclusion restriction — not a messy modern case study. It replaces the
abstract/`instrumental-encouragement` placeholder as the section's `instrument` exemplar.

### The history (sourced)
- Two companies supplied South London. **Southwark & Vauxhall (S&V)** drew Thames water **downstream**,
  beside the sewage outfalls → contaminated. **Lambeth** had moved its intake **upstream** (above the
  sewage) by 1852 → clean.
- The companies' pipes were **intermingled** house-by-house ("supplied alike both rich and poor"),
  decided years earlier by landlords — so which company served a house was **as-if random** w.r.t.
  household SES/behavior. Customers did not choose based on health.
- 1854 epidemic death rates: **S&V ≈ 315 per 10,000 houses vs Lambeth ≈ 37** (~8.5×).
- Sources: 1854 Broad Street outbreak (Wikipedia); UChicago "Causality in the Time of Cholera"; Deaton &
  Cartwright on natural experiments; "Rethinking John Snow's South London study" (Bayesian recalculation).

## The causal structure (the IV the modern literature reads into it)

```
  U (sanitation / SES, latent, unmeasured)
   │            │
   ▼            ▼
  A ──────────▶ Y
  ▲
  │
  Z (water company:  Lambeth = clean intake,  S&V = sewage intake)
```

- **Z — Water company** (instrument, binary): as-if random (intermingled pipes).
- **A — Contaminated-water exposure** (treatment, binary): drinking cholera-laden water. Driven mostly,
  but NOT entirely, by the company (households also had wells / other sources) → a real first stage < 1.
- **Y — Cholera death** (outcome, binary).
- **U — Neighborhood sanitation / poverty** (confounder, latent): raises A (worse local water) AND raises
  Y (worse outcomes regardless of source). This is the confounding the instrument defeats.

### The three IV assumptions, mapped to Snow (and what would break each)
1. **Relevance** (Z → A): company strongly shifts contamination. *Break it:* if both companies drew the
   same water, no first stage — nothing to divide by.
2. **Exclusion** (Z affects Y only through A): the company per se has no other path to cholera, because
   pipes intermingle so company isn't tied to neighborhood. *Break it:* if a company only served slums.
3. **Independence** (Z ⫫ U): the as-if-random assignment. *Break it:* if richer people chose Lambeth.

Snow's actual genius was #3 — the as-if-random company assignment. The IV framing (treating contaminated
water as the treatment and company as its instrument) is the modern reading; the example should say so.

## The estimand & why naive fails

- **Naive** contrast (cholera by *observed* water quality A) is **confounded upward** by U: poor areas have
  both worse water and higher mortality → naive overstates the effect of contaminated water.
- **IV / Wald** = (Δ cholera by company) / (Δ contamination by company)
  = reduced-form ÷ first-stage = the causal effect of contaminated water (a LATE). Z ⫫ U makes it valid.
- **Oracle** = re-simulation under do(A) — the app's existing truth.

The teaching beat: IV ≠ naive precisely because of U, and IV ≈ oracle. The first-stage < 1 is what makes
the Wald *division* visible (not just the reduced form).

## The machinery gap (the real work)

The app has **no IV estimator** (no Wald/2SLS; the methods table is naive/stratified/g-formula/IPW/
g-estimation/outcome-regression/matching/AIPW). `instrumental-encouragement` only renders the DAG. So this
example requires NEW estimator machinery — this is the centrepiece, not the DGP.

### A. Designate the instrument
Add an **`instrument` node role** (alongside exposure/outcome/adjusted/latent/selected) so a DAG can mark
`Company [instrument]`. Explicit beats auto-detection (which would be fragile: "a Z with Z→A, no Z→Y,
Z⫫U"). Engine/types change in `packages/core/src/types.ts` + graph parse + canvas styling.

### B. The Wald / 2SLS estimator (core)
A new estimator in `packages/core` that, given (instrument Z, treatment A, outcome Y):
- **first stage** = E[A|Z=1] − E[A|Z=0]
- **reduced form** = E[Y|Z=1] − E[Y|Z=0]
- **Wald** = reduced form / first stage (the LATE); weak-instrument guard when |first stage| → 0.
- (2SLS with covariates is the generalization; binary-instrument Wald is enough for the teaching case.)
Returns {firstStage, reducedForm, wald, plus the four E[·|Z] cells} for the portrayal.

### C. The portrayal (a dedicated `instrument` output module)
Don't cram IV into the g-methods table — give it its own module that tells the IV story in three moves:
1. **The famous comparison** — cholera rate by *company* (the 315 vs 37 bars): the reduced form.
2. **The first stage** — contamination rate by company (why the companies differ in exposure).
3. **The verdict** — naive (confounded) vs **IV/Wald** vs oracle truth, as the shared-scale facets we
   already have; the Wald = reduced-form ÷ first-stage shown explicitly.
Plus a one-line reading: "company is as-if random, so dividing the death gap by the contamination gap
recovers the effect of the water itself — the first instrument."

### D. Integration
- New example `john-snow-cholera` (or `disambig-instrument`) in the `disambiguation` domain, `outputModule:
  "instrument"`, verified, pure teaching DGP calibrated to the story (first stage ≈ 0.6–0.7; U-confounding
  makes naive overstate; Wald ≈ oracle).
- **Re-point** the registry's `instrument` term `exampleId` → this example; enrich its `anchors` (Snow 1855
  "first IV"; Deaton & Cartwright) and `alsoCalled` (natural experiment).
- Keep or retire `instrumental-encouragement` (the generic encouragement design) separately.

## DGP sketch (calibrate during build)
- Z ~ Bernoulli(0.5).
- U ~ Normal(0,1) (latent).
- A (contaminated water) = logit: strong +Z (clean company lowers exposure), + U (poorer → more exposure)
  → first stage ≈ 0.6.
- Y (cholera death) = logit: + A (contaminated water kills), + U (SES → mortality) → naive A→Y biased up
  by U; true do(A) effect = the target; Wald recovers it.
- Tune so the by-company cholera gap echoes the historical ~5–8×, naive clearly overstates the water
  effect, and Wald ≈ oracle within MC error.

## Verification
- **Numbers probe**: confirm first-stage ≈ target, naive > truth (U-confounded), Wald ≈ oracle within MC
  error; weak-instrument guard triggers when first stage → 0.
- **Engine**: Wald estimator unit test (known DGP → known LATE); bit-identity if compiled path touched.
- **UI probe**: canvas shows Z `[instrument]` styled distinctly with Z→A (no Z→Y); the instrument module
  shows the three moves; the card/map land on this example.
- `npx vitest run` + `npx tsc -b` green; examples.test id-list + outputModule map updated; probes removed.

## Decisions (confirmed)
1. **Dedicated `instrument` output module that EXPLAINS the logic** — the three moves (first stage,
   reduced form, Wald = the ratio), not an IV row crammed into the g-methods table.
2. **Both**: an explicit, fully-wired `instrument` role the user assigns, AND **automatic structural
   detection** that *flags* likely instruments ("This could be an IV!") as a non-binding hint — never
   auto-assigns the role.
3. **Treatment A binary** (contaminated-water exposure) — clean Wald.
4. **Keep `instrumental-encouragement`** as a separate generic encouragement-design IV example.
5. **Estimator = 2SLS** (the general method the user uses); the module **explains Wald** as the
   binary-instrument intuition (reduced form ÷ first stage), noting 2SLS = Wald with no covariates.

### Candidate-IV detection (the "could be an IV!" flag)
Heuristic over the DAG: a node Z is flagged as a *candidate* instrument when it has a directed edge into
the exposure, NO directed edge into the outcome (exclusion plausible), and no observed common cause with
the outcome (e.g. Z is a root / not adjusted). Purely advisory — surfaced as a hint on the node + in the
instrument module; the user still assigns the role.

## Critical files
- `packages/core/src/types.ts` — `instrument` role; estimator result type.
- `packages/core/src/` — new Wald/2SLS estimator (+ test).
- `packages/core/src/examples.ts` — `john-snow-cholera` example, configure, dispatch, domain, verified.
- `apps/web/src/outputs/modules.tsx` — `instrument` output module (first stage / reduced form / Wald vs
  naive vs oracle), reusing the facet small-multiples.
- `apps/web/src/shared/disambiguation.ts` — re-point `instrument` term, enrich anchors.
- `apps/web/src/App.tsx` + `graph.css` — instrument-role canvas styling.
