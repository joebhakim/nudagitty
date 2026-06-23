# Track B: benchmark mode (grade estimators against a known truth)

Track A *simulates* the DGM (we impose `A|L` and `Y|A,L`, so the truth is a `do`-contrast we
recompute by re-simulation). Track B *replays* real data — `treat` and the outcome are read
straight from the real row via `table_lookup`, the same mechanism the plasmode covariates use.
Nothing is simulated, so the re-simulation oracle is **degenerate** (overriding `treat` cannot
move a looked-up outcome → `do`-contrast ≈ 0). The truth must come from **outside** the replay.

## The truth-provider abstraction (the general idea)

Benchmark mode = "grade the cohort estimators against whichever truth applies." Three routes,
unified behind one resolver so every benchmark example shares an output panel:

1. **External benchmark** — `lalonde-obs.trueAte` = the RCT estimate from the 445-row
   experimental file (+$1,794.34). The observational replay has no internal truth; we import it.
2. **Per-row potential outcomes** — IHDP (`mu0`/`mu1`) and Twins (`y0`/`y1`) carry *both*
   outcomes per unit, so we know the true ITE → true ATE now, and **PEHE / CATE** later
   (the IHDP-standard metrics).
3. **Imposed DGP** — fully-known simulated truth (latent vars, our `Y|A,L`); the do-oracle Track
   A already computes. The richest route: we know individual effects, not just the ATE.

The resolver picks a route per example (explicit `benchmark` metadata, falling back to: replay +
`dataset.trueAte` → external; `potentialOutcomes` present → per-row; else → imposed DGP/do-oracle).
In benchmark mode the degenerate do-oracle is **suppressed**.

## What the LaLonde replay actually shows (real numbers, measured)

`lalonde-obs` = 185 NSW-treated + 2,490 PSID controls. Estimators computed directly on the rows:

| | estimate | vs benchmark (+$1,794) |
|---|---|---|
| RCT benchmark (n=445) | **+$1,794** | — truth |
| naïve diff | **−$15,205** | catastrophic |
| linear OLS (adjusted) | **+$752** | undershoots badly |
| crude IPW (Hájek) | **−$10,030** | barely helps; **PS range 0.000–0.935** |

The PSID controls have a **severe positivity violation** — general-population workers look nothing
like the trainees, so propensities crash toward 0 and full-sample linear/IPW adjustment fails to
recover the benchmark. This is the *real* Dehejia-Wahba lesson and it is richer than
"adjustment fixes it": observational recovery here is **fragile**, and the **overlap diagnostic**
is what reveals why. Recovery (DW's positive result) needs PS methods restricted to common
support (caliper matching / trimming). → Track B is a *"why observational inference is hard +
overlap"* story, and it pulls in the round-2 **positivity/overlap module** (PS histogram, ESS).

Open question the build resolves first: does the app's `matching` estimator (with trimming) climb
back toward +$1,794, or does it also fail here? That decides the message: "recovery is possible
but needs care" vs "even careful adjustment mostly fails on PSID — use CPS, or show the caution."

## Framing (decided)

**Experimental + observational side-by-side.** The RCT estimate (+$1,794, n=445) is the anchor
truth at the top; below it the observational estimators graded against it (estimate, signed error,
% of truth recovered, rank). Panel built to extend to per-row metrics (PEHE/CATE) for IHDP/Twins.

## Build phases (proposed)

1. **Truth resolver + benchmark detection (core).** `resolveBenchmark(document)` → `{ value,
   source, label, perRow? }`. Detect replay (treat+outcome `table_lookup`, or `benchmark` meta);
   suppress the do-oracle there. Extend `addPlasmodeCovariates` to optionally replay treat+outcome.
2. **Benchmark output panel (web).** Side-by-side anchor-truth + graded estimator table; reuse the
   methods panel, add benchmark line + error/%-recovered/rank. Extensible to PEHE.
3. **LaLonde recover-the-RCT example.** Replay on `lalonde-obs` + experimental anchor from
   `lalonde` (445). Verify the measured story above; decide PSID vs CPS controls by what recovers.
4. **Overlap diagnostic hook.** PS histogram + ESS on the replay cohort — the diagnostic that
   explains the failure. (Shared with the round-2 positivity module.)
5. **IHDP + Twins benchmark examples** (the generalization payoff; per-row truth; ATE now, PEHE
   later) + surface verified ids + docs.

## Deferred
- PEHE / CATE grading and per-row effect viz (needs the per-row route fully wired).
- CPS controls (milder positivity than PSID) as an alternate comparison group — embed if PSID
  proves too extreme to show any recovery.
