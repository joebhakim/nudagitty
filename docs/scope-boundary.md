# Scope boundary: what belongs in Nudagitty, and what belongs in your spreadsheet

**Status:** decided (2026-07). This document exists to be cited when someone (including us) wants to add
"just one more transform."

---

## The problem this prevents

Nudagitty builds *causal* data-generating processes from data. Along the way it is constantly tempting to
add data-preparation features — log this column, bin that one, standardize, winsorize, lag, ratio — because
every one of them is *useful*, and each looks small. That is a can of worms with no bottom: every applied
project needs a different transform, and a tool that tries to be a spreadsheet is a bad spreadsheet.

Practitioners already have pandas, dplyr, and Excel. **They do not need us to reimplement those badly.**

---

## The rule

> **Add a derived-column primitive only when the existing modelling vocabulary is STRUCTURALLY INCAPABLE
> of expressing the thing — not when it is merely convenient.**

"Useful" is not the test; **"impossible without it"** is.

### A second, corroborating test

> **If the derived thing could plausibly have its OWN causal parents or children, it is a NODE.
> If it is just a different shape on the same arrow, it is an EDGE MECHANISM.**

`1(re74 == 0)` — "was this person employed in 1974?" — can have different parents *and* different children
from "how much did they earn in 1974?" (a recession moves employment without moving wages among the
employed). It is a **different construct**, so it gets a node.

`log(re74)` is the same construct on a different scale. It gets an **edge**, and we already have one.

---

## Applying the rule

| candidate | expressible today? | verdict |
|---|---|---|
| `log(x)`, `sqrt(x)`, `x^p`, `x²`, splines, thresholds | **yes** — `log_linear`, `power_law`, `quadratic`, `monotone_spline`, `threshold` edge mechanisms | **redundant.** Already have it. **The edge vocabulary is now CLOSED.** |
| standardize / rescale | **yes** — affine, and the fit z-scores internally regardless | **null.** Changes nothing. |
| **`1(x == 0)` — point-mass indicator** | **NO.** A point mass is a *discontinuity*; no smooth basis function can represent one. | **NECESSARY** ✅ |
| **categorical → dummy indicators** | **NO.** A linear mechanism cannot consume an unordered category at all. | **NECESSARY** ✅ |
| `1(x is missing)` — missingness indicator | **NO.** Same argument as the point-mass indicator. | **necessary**, when we handle missingness |
| bin / discretize a continuous variable | yes (splines handle the nonlinearity) | **no.** Infinite variants (how many bins, where); adds a researcher degree of freedom and buys nothing. |
| winsorize / trim outliers | — | **no.** Also **breaks the plasmode contract**: the covariates must be the *real rows*. |
| lags / reshape / panel construction | — | **no.** The app takes a wide table. Reshaping is upstream. |
| ratios, differences, dates, text parsing | — | **no.** Pure data prep. |
| impute missing values | — | **no.** A whole subsystem. The *indicator* yes; imputation no. |
| a propensity score / risk score as a column | — | **no.** That is an *estimator*, not a variable. |
| more edge functional forms | — | **no.** Closed. |

---

## Why the two exceptions are not arbitrary

**The point-mass indicator is a representational necessity, not a convenience.**

Smith & Todd (2005), Table 3 — Dehejia–Wahba logit coefficients on the LaLonde data:

| regressor | CPS controls | PSID controls |
|---|---|---|
| **`1(re74 == 0)`** | **1.9368** | **3.2583** |
| `re74` in dollars | −0.00007 | −0.00002 |

The **step at zero** is worth 7×–26× in the odds. The **slope in dollars is nil**. No polynomial, log, sqrt
or asinh can reproduce a discontinuity at a point — we proved this to ourselves the expensive way
(`docs/lalonde-specification.md`). Without this primitive, the model is *incapable* of representing the
single most predictive feature of the data.

**Dummies are the same kind of necessity:** an unordered categorical cannot enter a linear predictor at all
without them.

Both are cases where the *vocabulary* is missing a word — not cases where the user is missing a shortcut.

---

## The unification that tells us we got it right

The family guardrail already detects a point mass in a column. That **one detected fact** drives **two
different affordances, selected by the variable's ROLE**:

| the variable's role | the fix |
|---|---|
| **outcome** | *"switch to two-part"* — model the gate × amount (built) |
| **predictor** | *"add a zero-indicator"* — give the point mass its own regressor (to build) |

Same evidence, same detector, two fixes. When a new primitive slots into an existing diagnostic like that,
it is a primitive. When it needs its own bespoke UI and its own bespoke justification, it is a feature —
and probably belongs in pandas.

---

## The boundary, in one line

> **Nudagitty is a causal-structure tool, not a data-preparation tool.**
> **Columns come from your data.** Make them in pandas / R / your spreadsheet and import them.
> **Functional form lives on edges**, and that vocabulary is closed.
> **The only derived columns we build are the ones the modelling vocabulary cannot otherwise express:
> a point mass, and an unordered category.**
