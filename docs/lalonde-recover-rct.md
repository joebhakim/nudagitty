# LaLonde "recover the RCT" — the measured finding (and why it fails)

This note records what the data actually shows for the LaLonde benchmark replay
(`lalonde-recover-rct`, Track B). It is the raw material for the example's explainer text and for
the overlap/positivity output module. Numbers are measured on the embedded `lalonde-obs` rows; see
`docs/track-b-benchmark-mode.md` for the architecture.

## The setup

The 1970s **National Supported Work** demonstration randomized disadvantaged men into a
job-training program. Because it was randomized, the simple difference in 1978 earnings is an
unbiased causal effect: **+$1,794** (the 445-row experimental file, `lalonde`). That is the *known
truth*.

The **observational** version (`lalonde-obs`) discards the experiment's control group and instead
compares the **185 NSW-treated** men to **2,490 PSID controls** — a general-population survey of
ordinary working men. Treated and controls now differ for all sorts of non-causal reasons, so the
naïve comparison is badly confounded. The test: can adjustment recover **+$1,794**?

We *replay* the real rows — covariates, the real treatment, and the real 1978 earnings are all read
straight from the data (`table_lookup`); nothing is simulated. (Because the outcome is a recorded
number, not a function of treatment, the internal do-oracle is degenerate = 0; the truth comes from
*outside* the replay — the experimental +$1,794.)

## What the estimators give (truth = +$1,794)

**Propensity-based (model who-got-trained):**

| Method | Estimate | Error |
|---|---:|---:|
| naïve (raw gap) | −$14,922 | −$16,716 |
| IPW (inverse-propensity reweight) | −$14,303 | −$16,097 |
| matching (nearest-control) | −$4,982 | −$6,776 |
| stratification | −$1,840 | −$3,634 |
| g-estimation | −$21,666 | −$23,460 |

**Outcome-regression-based (model earnings-given-covariates):**

| Method | Estimate | Error |
|---|---:|---:|
| outcome-regression | **+$546** | −$1,248 |
| AIPW (doubly robust) | **+$492** | −$1,302 |

**On PSID, nothing fully recovers.** Every propensity-based method stays catastrophically negative;
only the outcome-model methods get the *sign* right, undershooting to ~+$500 (and leaning on
extrapolation). Corroborated by from-scratch estimators (OLS +$752, crude IPW −$10k), so the
failure is real, not an estimator artifact.

## WHY it fails — the overlap diagnostic (the validatable assumption)

Positivity/overlap is the one identification assumption you can check directly against data. Fit a
propensity model (treatment ~ covariates, standardized) and look at the score distribution by arm:

```
 PS bin     controls (n=2490)              treated (n=185)
 0.0–0.1    ████████████████████ 2326      ██ 10
 0.1–0.2    █ 72                            █ 8
 0.2–0.3    · 28                            ██ 13
 0.3–0.4    · 20                            ██ 11
 0.4–0.5    · 11                            ██ 13
 0.5–0.6    · 8                             ███ 15
 0.6–0.7    · 7                             ██ 11
 0.7–0.8    · 7                             █████ 28
 0.8–0.9    · 8                             █████████ 47
 0.9–1.0    · 3                             █████ 29
```

- Median control propensity **0.0001** vs median treated **0.743**.
- **93%** of controls fall in the lowest bin; **78%** have PS < 0.01.
- IPW control weights have an **effective sample size of 43 / 2,490 (1.7%)** — the reweighting
  leans on ~43 people; max single weight 10.8.
- Common-support trimming retains only **49%** of rows.

There are almost no controls who plausibly *could* have been trainees. That is the positivity
violation, and it is exactly why dividing-by-propensity (IPW) and matching collapse while
extrapolating-an-outcome-model only bends the estimate partway back. **The diagnostic is the tell:
the example should *show* this histogram + ESS, not just report a biased number.**

## The teaching arc (and open design fork)

Honest message: *adjustment can fail, and overlap is what warns you.* Three ways to land it
(decision pending):

1. **PSID as the cautionary tale** — show every method failing against the +$1,794 line + the
   overlap chart that explains it. True to the data, no new data, pairs with the positivity module.
2. **Add CPS controls** — a different comparison group with milder overlap where methods *do*
   recover; PSID-fails next to CPS-recovers ⇒ "the control group / overlap decides success." Needs
   embedding CPS (~16k rows, subsampled) + a second replay example.
3. **Add a common-support–trimmed estimator** — restrict PSID to the overlap region (how the
   original authors recovered ~+$1,794); tells the full "fails → trim → recovers" arc on one
   dataset. Needs a trimmed estimator.

Whichever we pick, the overlap/positivity output module (PS-by-arm histogram + IP-weight
distribution + ESS, already on the round-2 list) is the centerpiece that makes the failure legible.
