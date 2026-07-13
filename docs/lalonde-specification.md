# Modelling LaLonde: what the literature says, what we did wrong, and what the data says

**Status:** ✅ **BUILT** (commit following). Findings, autopsy, and the specification we now ship.
**Companion to:** [`fitting-outcome-marginals.md`](fitting-outcome-marginals.md) (the honest-fit philosophy).
**Bibliography:** [`references/outcome-marginals-earnings.bib`](references/outcome-marginals-earnings.bib).

---

## 0. Why this document exists

We built a plasmode DGP on the LaLonde data: covariates replayed from real rows, confounding *fitted* from
those rows, and a known causal effect *imposed* on top so estimators can be graded against a truth.

Then we spent a long time being surprised that estimators failed badly, and hunting for a predictor
transform that would fix it — by eye, scoring candidates on a residual-independence statistic. Two
transforms were shipped and both were wrong.

The failure was not the estimators. **It was our DGP.** And the failure was findable: this is one of the
most-studied datasets in applied econometrics, and the literature had already answered every question we
were guessing at. We did not look first. This document is the correction.

The methodological sin has a name in this very literature. Smith & Todd [@smith2005does] criticise exactly
this move — choosing a specification by a post-hoc search until a statistic looks acceptable — and show it
does not travel. We did it to ourselves.

---

## 1. What we got wrong, in order

| # | what we did | why it was wrong | how we found out |
|---|---|---|---|
| 1 | Fit the intensive margin with a **log link** on **dollar-valued** earnings history | `E[Y\|L] = exp(β·re74)` with `re74` in dollars is exponential *in dollars* | our simulated world contained **$2.9M earners** (real max: $121k) |
| 2 | "Fixed" it with **`log(1+x)`** — the Mincer move | `log(1+x)` is the *worst* option on the board here, and Imbens uses this exact error as a cautionary tale on this exact dataset | our own residual test: dCor 0.354, worse than **raw dollars** (0.245) |
| 3 | "Fixed" it again with **`sqrt(x)`** | a hack with no basis in any literature; treats a symptom | it scored best on dCor, which is *why it was suspicious* — that is a specification search |
| 4 | Kept a **lognormal** intensive margin throughout | `log(re78)` on this data is **left-skewed (−1.79), excess kurtosis 5.34** — it is not normal | measured, finally, in §5 |
| 5 | Never included **zero-earnings indicators** (`u74`, `u75`) | they are the single strongest predictor of treatment in the whole literature | the literature (§3) |

Errors 1–3 are all downstream of error 4. We were transforming regressors to compensate for a noise family
and a link that were wrong to begin with.

---

## 2. The LaLonde specifications, as actually run

### 2.1 LaLonde (1986) [@lalonde1986evaluating]

**Everything is in levels. The paper contains no logs at all** (full text grepped: zero occurrences of
"log"/"logarithm").

- **Outcome:** real earnings in 1978 (males) / 1979 (females), 1982 dollars. **Levels.**
- **Regression covariates** (Tables 4–5, note c, verbatim): *"age, age squared, years of schooling, high
  school dropout status, and race."*
- Column 8 of Tables 4/5: post-training earnings *"holding constant the **level** of pre-training
  earnings"* — i.e. **lagged earnings on the RHS in raw dollars.**
- Also runs a Heckman (1979) [@heckman1979sample] two-step selection estimator (Table 6).
- His specification test (p. 616): *"if the regression-adjusted difference between the post-training
  earnings of the two groups is going to be a consistent estimator of the training effect, the
  regression-adjusted pre-training earnings of the two groups should be the same."*

### 2.2 Dehejia & Wahba — there is no single "DW specification"

There are **five**, and DW 1999 ≠ DW 2002. Verbatim from the table notes.

**DW (1999) [@dehejia1999causal], Table 3 notes:**

| comparison group | logit specification |
|---|---|
| PSID-1 | `age, age², educ, educ², married, nodegree, black, hisp, RE74, RE75, RE74², RE75², u74·black` |
| PSID-2, PSID-3 | `age, age², educ, educ², nodegree, married, black, hisp, RE74, RE74², RE75, RE75², u74, u75` |
| CPS-1/2/3 | `age, age², educ, educ², nodegree, married, black, hisp, RE74, RE75, u74, u75, educ·RE74, age³` |

**DW (2002) [@dehejia2002propensity]** changed them:

| comparison group | logit specification |
|---|---|
| CPS (Table 2, note A) | `Age, Age², Age³, School, School², Married, No degree, Black, Hisp, RE74, RE75, U74, U75, School·RE74` |
| PSID (Table 3, note A) | `Age, Age², School, School², Married, No degree, Black, Hisp, RE74, RE74², RE75, RE75², U74, U75, U74·Hisp` |

**How the terms were chosen** — DW 2002's own appendix algorithm, verbatim step 4c:

> *"If a covariate is not balanced for many strata, modify the logit by adding interaction terms and/or
> higher-order terms of the covariate and reevaluate."*

The higher-order terms are selected **by covariate balance, not by fit**. This is DW's defence and also the
crux of the critique: the terms are *whatever balanced that sample*, so "the DW specification" is not a
portable object.

**DW 2002's own sensitivity table (Table 4)** — dropping terms from the full spec:

| specification | CPS ATT | PSID ATT |
|---|---|---|
| Full | 1360 (633) | 1890 (1202) |
| Dropping interactions and cubes | 1037 (1005) | 1004 (2412) |
| **Dropping indicators (u74/u75)** | 1874 (911) | 1845 (1720) |
| Dropping squares | 1637 (944) | 1428 (1126) |

*"For all specifications other than the full specifications, some covariates are not balanced."*

### 2.3 Smith & Todd (2005) [@smith2005does] — the fragility

Abstract, verbatim:

> *"We find that estimates of the impact of NSW based on propensity score matching are **highly sensitive to
> both the set of variables included in the scores and the particular analysis sample** used in the
> estimation. Among the estimators we study, the difference-in-differences matching estimator performs the
> best."*

Bias as % of the relevant experimental benchmark (Table 5, CPS comparison group):

| sample × pscore | 1-NN | 10-NN | local linear |
|---|---|---|---|
| DW sample, DW pscore | 23% | 0.3% | 5% |
| LaLonde sample, DW pscore | 63% | 30% | 156% |
| **Early RA sample, DW pscore** | **283%** | 132% | 125% |
| LaLonde sample, LaLonde pscore | 406% | 240% | 402% |

Their own "Rich Covariates" model (Table 7, note c), verbatim: *"…**real earnings in 1975 and its square,
an indicator for zero earnings in 1975**, number of children…"* — **levels + square + zero-indicator. No
logs.**

### 2.4 Dehejia (2005) [@dehejia2005practical] — the reply

Smith & Todd applied *DW's* score (selected by balance on *DW's* sample) to a *different* sample without
re-running the balance search. Re-specifying on the Early RA sample, Dehejia gets **$2,705 (CPS)** and
**$2,711 (PSID)** against a benchmark of **$2,717**.

**Be skeptical of both.** The honest synthesis: matching *can* hit the benchmark, but only via a
sample-specific, balance-driven, post-hoc specification search. Diamond & Sekhon [@diamond2013genetic]
undercut both sides by showing DW's scores don't even achieve balance where they "work":
*"We obtain Kolmogorov-Smirnov p-values less than 0.01 for all non-dichotomous covariates."*

### 2.5 The canonical covariate vector

Used **identically** by DW, Smith & Todd, Diamond & Sekhon, Imbens [@imbens2015matching], Imbens & Xu
[@imbens2024lalonde], and the R `Matching` package:

```
age, education, black, hispanic, married, nodegree,
re74   (real 1974 earnings, 1982 dollars, LEVEL)
re75   (real 1975 earnings, 1982 dollars, LEVEL)
u74  = 1(re74 == 0)
u75  = 1(re75 == 0)
```

plus balance-selected `age²`, `education²`, sometimes `age³`, `re74²`, `re75²`, and interactions.

> **Caveat.** The R teaching vignettes (`MatchIt`, `cobalt`) use a stripped-down
> `treat ~ age + educ + race + married + nodegree + re74 + re75` with **no zero-indicators and no
> higher-order terms**. That is a *pedagogical* spec, not the benchmark one. Do not cite the vignettes as
> the econometric standard.

### 2.6 The benchmarks

| sample | N | experimental ATT (1978 earnings, 1982$) |
|---|---|---|
| LaLonde male | 297 T / 425 C | **$886** (SE 476) |
| LaLonde female AFDC | — | **$851** (SE 317) |
| **Dehejia–Wahba subsample** | 185 T / 260 C | **$1,794** (SE 633) — *this is the one we impose* |
| Smith–Todd "Early RA" | 108 T / 142 C | **$2,748** (SE 1,005) |
| Imbens–Xu trimmed LDW-PSID | — | **$306**, not significant |

Raw difference in means: **−$8,497 (CPS)**, **−$15,204 (PSID)**.

**The benchmark itself is contested.** $886 / $1,794 / $2,748 are three different "truths" for three
different samples, and the famous $1,794 is *inflated* by DW's zero-earnings-conditioned selection rule
(§3, point 5). The PSID arm remains unsolved: Imbens & Xu get **$4 to $2,420** across nine modern
estimators.

---

## 3. The zero-earnings indicators (`u74`, `u75`) — and why they are not optional

**Definition.** `u74 = 1(re74 == 0)`. Note Smith & Todd's footnote 31: *"note that it corresponds to
**nonemployment rather than unemployment**"* — DW's label is a misnomer. It is literally an indicator for
a point mass at zero.

**Five reasons it matters, each citable:**

**1. It is the strongest predictor of treatment by an order of magnitude.** Smith & Todd Table 3, DW (2002)
logit coefficients:

| regressor | CPS controls | PSID controls |
|---|---|---|
| **`1(re74 == 0)`** | **1.9368** (0.2209) | **3.2583** (0.4340) |
| `re74` in dollars | −0.00007 (0.00007) | −0.00002 (0.00003) |

The **step at zero** is worth ≈ e^1.94 ≈ **7×** (CPS) to e^3.26 ≈ **26×** (PSID) in the odds. The **slope in
dollars is nil**. *No smooth function of `re74` — polynomial, log, sqrt, asinh — can reproduce a
discontinuity at a point mass.* This is the single fact that invalidates every transform we tried.

**2. The zero mass *is* the overlap problem.** Smith & Todd Table 1, share with zero 1974 earnings:

| LaLonde sample | **DW sample** | Early RA | **CPS-1** | **PSID-1** |
|---|---|---|---|---|
| 0.45 | **0.73** | 0.52 | **0.12** | **0.09** |

A 73% point mass against a 9–12% point mass. That is not "low value vs lower value"; it is categorical.

**3. Participation is driven by the extensive margin, not the earnings level.** Heckman & Smith (1999)
[@heckman1999pre] show labour-force *status* in the months before the participation decision predicts
programme participation better than annual or quarterly *earnings*.

**4. The zeros are partly a measurement artefact, and mean different things in the two arms.** NSW earnings
are self-reported survey measures; CPS-1 is an administrative SSA-matched file. And, per Diamond & Sekhon
(fn. 17, following Smith & Todd): *"The variable that DW call 'real earnings in 1974' actually consists of
real earnings in months 13–24 prior to the month of randomization"* — for the treated, but calendar-1974
for the controls. **The same column name means different things in the two arms.**

**5. The zeros are partly a sample-selection artefact.** Smith & Todd reverse-engineered DW's rule: include
everyone randomised Jan–Apr 1976; of those randomised later, *include only persons with zero earnings in
months 13–24 before random assignment*. That is why 73% of the DW sample has `re74 = 0`, and why the DW
benchmark ($1,794) is more than double LaLonde's ($886).

---

## 4. Modelling earnings: what the literature actually recommends

### 4.1 Mincer [@mincer1974schooling] — and its limit

> **log y = log y₀ + r·S + β₁·X + β₂·X²**,  X = potential experience = age − S − 6

Logs follow from exponential human-capital accumulation with a constant proportional return.

**Critical caveat for us:** the Mincer equation is fit on **wages/earnings of the employed** — strictly
positive. **It has nothing to say about zeros.** Its authority does not transfer to a zero-inflated
earnings variable, and it *certainly* does not license putting dollar-valued lagged earnings inside an
exponential. Mincer never puts lagged earnings on the RHS at all.

### 4.2 Tobit vs two-part vs Heckman — the consensus

Wooldridge's teaching treatment, verbatim:

> *"Consider the case with a corner at zero and a continuous distribution for strictly positive values…
> **The value zero is not arbitrary; it is observed data.** … Often see discussions of the 'selection'
> problem with corner solution outcomes, but **this is usually not appropriate**. … We cannot think of a
> counterfactual for y in the two different states."*
>
> *"Why should we move beyond Tobit? It can be too restrictive because a single mechanism governs the
> 'participation decision' and the 'amount decision'… it is impossible for x_j to have a positive effect on
> P(y>0|x) and a negative effect on E(y|x, y>0)."*

| model | when appropriate |
|---|---|
| **Tobit** [@tobin1958estimation] | only if one index drives both margins with the same signs *and* relative magnitudes. For earnings, rarely defensible. |
| **Heckman selection** [@heckman1979sample] | when zero means the outcome is **missing** (a wage offer exists but is unobserved). Needs an exclusion restriction. |
| **Two-part / hurdle (Cragg)** [@cragg1971some] | when zero is a **real, observed** outcome (a corner solution). **This is the earnings-in-a-training-evaluation case.** ✅ *we have this* |

**And Wooldridge's recommended form for part 2 — which we do NOT have:**

> *"More direct approach: just specify **E(y|x, y>0) = exp(xβ)**… Use nonlinear least squares or a
> quasi-MLE in the linear exponential family (such as the Poisson or gamma). … can easily estimate
> E(y|x) = Φ(xγ)·exp(xβ) **without additional distributional assumptions**."*

Note what this rules out: **log-OLS followed by retransformation**, which is exactly what we do.

### 4.3 The retransformation problem: Duan → Manning → Manning & Mullahy

- **Duan (1983)** [@duan1983smearing]: fitting `log(y) = xβ + ε` and exponentiating estimates the
  conditional **median**, not the mean. The smearing factor is `(1/n)Σ exp(ε̂ᵢ)`. Consistent **under
  homoskedasticity**.
- **Manning (1998)** [@manning1998logged]: smearing **breaks under heteroskedasticity** — if `Var(ε|x)`
  depends on `x`, a single global factor is biased.
- **Manning & Mullahy (2001)** [@manning2001estimating]: *"The GLM models provide estimates of ln(E(y|x))
  and E(y|x) directly without any requirement for retransformation… Least-squares-based methods can be
  biased in the face of heteroscedasticity if not appropriately retransformed, while GLM models can yield
  very imprecise estimates if the log-scale error is heavy-tailed."* Operational rule: **use a log-link GLM
  when the kurtosis of the log-scale OLS residual is below ≈ 3**; above that, log-OLS + heteroskedastic
  smearing is more *precise*.

> **Our number (§5): log-scale residual kurtosis = 12.91.** By M&M's rule we are deep in the heavy-tail
> regime — which is a warning about *precision*, but it is also a loud signal that the log scale is simply
> the wrong place to be modelling this variable.

### 4.4 PPML [@santossilva2006log]

Two distinct arguments, which they are careful to separate:

> *"An obvious problem… is that this approach is infeasible if y is zero for some observations. **The more
> serious problem** is that, due to Jensen's inequality, the least squares regression of ln(y) on x is
> generally an **inconsistent estimator** for the parameters of E[y|x] = exp(xβ)."*

PPML is consistent under **only** the correct-mean assumption — no distributional assumption, no count
requirement. They explicitly reject negative-binomial/zero-inflated alternatives because *"overdispersion
is not defined when the dependent variable does not have a natural scale… estimates… are sensitive to the
scale of the dependent variable and to the units in which it is measured, and therefore are arbitrary."*

### 4.5 Chen & Roth (2024) [@chen2024logs]

> *"ATEs for log-like transformations should not be interpreted as approximating percentage effects, since
> **unlike a percentage, they depend on the units of the outcome**. … if the treatment affects the extensive
> margin, **one can obtain a treatment effect of any magnitude simply by re-scaling the units of Y** …
> **trilemma**: when the outcome can equal zero, there is no treatment effect parameter that is an average
> of individual-level treatment effects, unit-invariant, and point-identified."*

Their recommendation is one of three, chosen deliberately: (1) ATE in **levels**, reported as a % of the
control mean (estimate `E[Y|x] = exp(xβ)` by **Poisson/PPML**); (2) explicitly **calibrate** the
extensive-vs-intensive weight; (3) **estimate the two margins separately**.

**`log(1+Y)` and `asinh(Y)` are not on the list.** See also Bellemare & Wichman
[@bellemare2020elasticities], who derive the same unit-dependence for IHS on the **right-hand side**.

### 4.6 The direct hit: Imbens (2015) on *exactly our mistake*

Imbens [@imbens2015matching, §3.2] builds his case against naïve regression on the LaLonde data using
precisely the error we shipped. He regresses 1978 earnings on 1975 earnings among PSID controls, two ways:

```
earn78 = α + β · earn75            (linear)
earn78 = α + β · ln(1 + earn75)    (log-linear)
```

and reports the implied counterfactual for the treated (in $000s):

| specification | Ê[Y(0) \| W=1] |
|---|---|
| linear | **6.88** (0.48) |
| **log-linear `ln(1+earn75)`** | **2.81** (0.66) |

**A $4,070 swing, against a true ATT of roughly $2,000.** His diagnosis:

> *"for the range where the trainees are and where we therefore need to predict Y(0), with earn75 between 0
> and 1.82, the predictions of the linear and the log-linear model are quite different."*

The treated are massed at **zero** earnings; the controls at $10k–$25k. In the region where the prediction
is needed, the regression is **pure extrapolation**, so **the functional form of the earnings regressor
entirely determines the answer.** `ln(1+x)` is steep near zero and flat in the control mass — it
hallucinates a very low counterfactual.

**Under poor overlap, the transform silently *is* the identifying assumption.**

### 4.7 Lagged earnings as a RHS regressor — the unanimous answer

1. **Raw dollars (levels).** Every paper: LaLonde 1986 col. 8, DW 1999/2002 (`RE74`, `RE75`), Smith & Todd,
   Diamond & Sekhon, Imbens 2015, Imbens & Xu 2024.
2. **Plus a separate zero-indicator per year** (`u74`, `u75`). Non-negotiable.
3. **Plus polynomial terms** chosen for **balance**, not fit.
4. **Plus interactions** of the earnings/zero terms with demographics, again by balance.
5. **At least two lags** — the Ashenfelter dip is DW's entire justification for their subsample.
6. **Nobody logs the earnings regressor. Zero papers.**

The one counter-practice: some recent stats/ML papers use `asinh(re74)`. Treat as an ML-benchmark
convention, not econometric practice — and note it inherits the unit-dependence problem. `asinh` at least
is *defined* at zero and locally linear there, which is why it survives where `log` does not; but it still
**smooths over the point mass instead of indicating it.**

---

## 5. What our data actually says

All measured on the embedded `lalonde-obs` rows (n = 2,675; 12.4% have `re78 = 0`).

### 5.1 The conditional distribution of earnings, given employed

| quantity | value |
|---|---|
| `log(re78) \| re78>0` — mean | 9.82 |
| — sd | 0.826 |
| — **skew** | **−1.79** |
| — **excess kurtosis** | **5.34** |
| `re78 \| re78>0` — mean | 23,398 |
| — sd | 14,527 |
| — **CV** | **0.621** → a **gamma with shape ≈ 2.6** |
| **log-scale OLS residual kurtosis** | **12.91** |

**Log-earnings are LEFT-skewed with heavy tails. They are not normal.** Our intensive margin —
`exp(η + ε)`, `ε ~ N(0, σ)` — is therefore wrong twice: **wrong shape**, and an **exponential that
manufactures an absurd tail**.

Mincer's log-normality is a claim about **wages**. This is **annual earnings**, which includes part-year
workers — hence the long *left* tail. The authority does not transfer.

### 5.2 Every transform we tried, against the real marginal

Intensive margin fit on the real rows; DGP then drawn from it. Real `re78`:
**mean 20,502 · sd 15,630 · p99 73,886 · max 121,174 · skew 1.3.**

| intensive-margin spec | mean | sd | p99 | max | skew | dCor(ε, re74) |
|---|---|---|---|---|---|---|
| levels, log-OLS | 23,714 | 44,023 | 132,892 | **$2,423,251** | 27.6 | 0.248 |
| **sqrt, log-OLS** *(shipped)* | 22,906 | 25,596 | 114,022 | $772,137 | 5.7 | **0.243** |
| **log(1+x), log-OLS** *(shipped earlier)* | 22,383 | 22,994 | 106,583 | $321,024 | 2.9 | **0.349** ✗ |
| levels + **u74/u75**, log-OLS | 23,447 | 44,526 | 126,003 | **$2,906,613** | 37.7 | 0.252 |
| levels + u74/u75, **gamma-QMLE** | 21,388 | 33,305 | 108,698 | $1,985,540 | 28.9 | 0.252 |
| levels + u74/u75, **Poisson-QMLE (PPML)** | **20,649** | 20,739 | 93,872 | $619,757 | **5.3** | 0.252 |

**Two separate problems, which we had conflated:**

- **`u74`/`u75` fix the *selection* model, not the tail.** Adding them changes the marginal barely at all
  (their power is in the *logit*, where their coefficient is 1.94–3.26 against a dollar-slope of −0.00007).
- **The tail is fixed by the *estimator*, not the regressor.** Poisson-QMLE weights by μ, so the fit
  *cannot* tolerate absurd predictions: skew 27.6 → 5.3, mean lands at 20,649 against a real 20,502.
  Gamma-QMLE (IRLS weight 1) barely helps — which is itself diagnostic. Exactly Santos Silva & Tenreyro's
  and Manning & Mullahy's point.

**And `log(1+x)` is the worst option on residual dependence (0.349) — worse than raw dollars (0.245).**
Our own diagnostic said so, and it agrees with Imbens.

### 5.3 Candidate DGPs, drawn properly

Selection model held fixed (logistic on the canonical vector *with* `u74`/`u75`); only the amount model and
the noise family vary.

| DGP for the amount | mean | sd | p99 | max | skew |
|---|---|---|---|---|---|
| **REAL** | **20,502** | **15,630** | 73,886 | **121,174** | **1.3** |
| log-OLS + lognormal *(what we ship today)* | 23,677 | 35,120 | 137,308 | **$1,597,146** | 16.1 |
| PPML mean + lognormal noise | 20,816 | 22,444 | 94,775 | $469,466 | 5.9 |
| PPML mean + **gamma** noise (shape 2.6) | 20,439 | 20,287 | 91,705 | $325,882 | 3.1 |
| **linear (levels) mean + gamma noise (shape 2.6)** | **20,488** | **20,179** | 92,276 | **$236,861** | **2.5** |

**The literature's specification wins — and it wins because it has no log link at all.**

Residual imperfection, stated honestly: skew 2.5 vs a real 1.3, max $237k vs $121k. Not perfect. But a
different universe from $2.4M, and what remains is honest model error rather than an artefact of our own
construction.

### 5.4 A linear mean can go negative — but barely

Predicted `E[Y|Y>0]` over all rows, from the linear levels model:

| min | p1 | median | max | **non-positive** |
|---|---|---|---|---|
| −1,119 | 2,596 | 21,025 | 129,959 | **3 of 2,675 (0.11%)** |

All three are in the treated (extrapolation) region. A numerically stable **softplus** link
(`η` for large `η`, → 0 below) is the identity everywhere that matters and floors exactly those three.

### 5.5 The DGP is sound; the misses are pure misspecification

Our DGP has **no unmeasured confounding by construction** — treatment is generated from a fitted logistic
on observed covariates only. So a correctly-specified estimator *must* recover the imposed truth. Verified:

| two-part g-formula | estimate | imposed truth |
|---|---|---|
| with the **DGP's own functional form** | **+1,880** | **+1,794** |
| with **raw dollars** (what the estimator suite ships) | **−5,674** | |

Within **$86** — Monte-Carlo noise. **Every dollar of every miss in our ledger is one nameable defect: the
estimator suite does not transform its predictors.** There is no mystery and no residual confounding to
appeal to.

---

## 6. The principled DGP

| component | what it should be | authority |
|---|---|---|
| **family** | two-part / hurdle (Cragg) | Wooldridge; zero is observed data, not missing ✅ *have it* |
| **selection / gate** | logistic on `age, age², educ, educ², black, hisp, married, nodegree, re74, re75, `**`u74, u75`** | the canonical LDW vector (§2.5) ❌ *we lack u74/u75* |
| **intensive margin** | `E[Y\|Y>0] = xβ`, **linear in levels** (softplus for positivity) — **no log link** | every paper in §2; §5.3 measurement ❌ *we use a log link* |
| **noise** | **gamma**, shape ≈ 2.6 (matches the real conditional CV of 0.621) | §5.1 ❌ *we use lognormal* |
| **lagged earnings** | **raw dollars + zero-indicators**. Never logged. | §4.7, unanimous ❌ *we use sqrt* |

### What changes for the imposed effect

With a **linear** amount model, δ is in **dollars**, and the (γ, δ) manifold gets *simpler*:

```
ATE(γ, δ)     = mean[ σ(η_g + γ) · (η_a + δ) ]  −  mean[ σ(η_g) · η_a ]
extensive(γ)  = mean[ (σ(η_g + γ) − σ(η_g)) · η_a ]
intensive(γ,δ)= δ · mean[ σ(η_g + γ) ]
⇒  δ(γ)       = ( A − extensive(γ) ) / mean[ σ(η_g + γ) ]
```

Closed form, **no `exp`**. The feasibility wall survives: extensive alone can deliver at most
`mean[(1 − σ(η_g)) · η_a]`.

### Built — and what it measured

All five pieces shipped: `u74`/`u75` as a derived-column primitive (with a UI affordance), the
`semicontinuous` intensive link as a **choice** (`positive_softplus` opts into identity; `gamma_log`
remains the default so nothing else moved), **gamma** noise, the re-derived manifold, and the re-baseline.

| re78 | mean | sd | p99 | max | skew | zeros |
|---|---|---|---|---|---|---|
| **REAL** | 20,502 | 15,630 | 73,886 | **121,174** | **1.3** | 12.4% |
| **ours, now** | **20,911** | **16,526** | **75,831** | **153,270** | **1.7** | 10.9% |
| *ours, before (log + lognormal)* | *23,677* | *35,120* | *137,308* | ***1,597,146*** | *16.1* | — |

**δ is now $719 — a per-worker raise in dollars.** `decompose(γ, δ).ate == 1794.00` exactly.

### Two honest consequences

**1. The feasibility wall was an artefact.** We made much of it: *"employment alone can deliver at most
$1,473 < $1,794, so the extensive share can never exceed 82%."* Under the corrected DGP the ceiling is
**$1,835**, which sits just *above* the $1,794 benchmark — so **the wall no longer binds**, and
`maxExtensiveShare = 1.0`. The machinery is unchanged and still correct (ask for $4,000 and it bites); the
*number* was a property of a log link on dollar-valued regressors, not a fact about job training.

**2. Nothing recovers the truth, and the reason is now nameable.** OLS **+$3,460**, +interactions
**−$2,790**, two-part **−$1,715**, PPML **+$3,921** against a true **+$1,794**. The DGP is
`gate(L,T) × softplus(L,T)` — a *product* of two linear pieces, so not linear, so plain OLS cannot be right.
And our `two_part` learner fits `log(Y)` on the positive rows — a **log** amount link — while this DGP's
amount margin is **identity**. **Right family, wrong link.** The missing rung is a **two-part-identity**
learner.

Also: the residual panel's worst offender is now **the zero-indicator itself** (dCor 0.385) — which is
*precisely* why Dehejia–Wahba include `u74 × black` (PSID-1, 1999) and `U74 × Hisp` (PSID, 2002). The tool
independently rediscovered their balance finding.

### The covariate-basis test has now flipped three times, and that is the finding

| DGP | linear | quadratic | cubic | reading |
|---|---|---|---|---|
| v1 — log link on raw dollars ($2.4M earners) | +18,088 | −5,347 | +5,083 | **thrashing** |
| v2 — log link on `sqrt(dollars)` | −1,904 | +540 | +2,259 | **converging** |
| **v3 — identity link, levels + indicators** | **+3,460** | **+3,634** | **+3,635** | **flat** |

The covariate basis helps exactly when the true surface is **nonlinear in raw L**, and not otherwise —
and *which of those worlds you are in is precisely what you do not know.* It is not a ladder to climb; it
is a sensitivity check whose behaviour is a property of the **DGP**, not of the estimator.

### Open design question

Should the zero-indicators be **derived data columns** (simple; matches the literature's `u74`), or
**nodes in the DAG** (`Employed_74 → Earnings_78`)? The latter makes the extensive-margin story visible in
the graph and is arguably the more honest causal representation — "was employed in '74" is a genuinely
different construct from "how much they earned in '74" — but it clutters the canvas.

---

## 7. Disagreements and caveats we should not paper over

1. **There is no single "DW specification."** DW 1999 ≠ DW 2002; CPS ≠ PSID. Five specs. Anyone quoting
   "the DW propensity score" is quoting one of them.
2. **Smith & Todd vs Dehejia is unresolved, and both are partly right.** ST: the DW score fails
   out-of-sample (bias up to 283% of benchmark). Dehejia: you are *supposed* to re-run the balance search
   per sample. The uncomfortable synthesis: the method works, but only via a sample-specific, post-hoc
   search — which is not a *specification* in the usual sense.
3. **Diamond & Sekhon undercut both**: DW's scores don't achieve balance even where they "work".
4. **The benchmark itself is contested** ($886 / $1,794 / $2,748), and $1,794 is *inflated* by DW's
   zero-earnings-conditioned selection rule.
5. **The PSID arm is still unsolved.** Imbens & Xu get **$4 to $2,420** across nine modern estimators;
   after trimming, the experimental benchmark itself falls to **$306** and is insignificant.
6. **We are building the wrong *kind* of benchmark.** Our DGP has **no unmeasured confounding** (§5.5), so
   it can only test *functional-form robustness*. The reason LaLonde is famous is **residual confounding +
   a positivity catastrophe** — misses in the real literature are not a missing `sqrt()`. A second example
   with a latent `U → (T, Y)` would test the thing LaLonde is actually about. The tool should **say which
   benchmark you are in**; today it does not, which is why this ledger has been so easy to misread.

---

## 8. What this changes about how we work

The transform hunt was a **specification search on a fit statistic** — the exact practice this literature
spent twenty years learning to distrust. Two lessons worth keeping:

- **Look at the literature before the residuals.** This dataset has been modelled by Heckman, Imbens,
  Wooldridge, Dehejia, Smith, Todd, Abadie, Sekhon. Every question we guessed at was already answered.
- **A diagnostic that ranks candidates is not a substitute for a model.** dCor told us `sqrt` beat `log`.
  Both were wrong, because the thing that needed fixing was the *noise family and the link*, and no choice
  of regressor transform could have revealed that.
