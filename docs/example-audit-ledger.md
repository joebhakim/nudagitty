# Example audit ledger

Audit status for every example. Two **independent** gates, both starting ❌ for everyone — recent
work this session (the kludge sweep, the estimator/oracle-gap fixes) is **not** a full skeptical audit.

- **Joe** — the maintainer has reviewed the example end-to-end (DGP, output, teaching point) and signed off.
- **Claude-skeptical** — a deliberate adversarial pass checking: DGP sanity (numbers / signs / overlap /
  positivity), estimand correctness, the kludge rubric (K1 selection/censoring-as-cause · K2 mediator
  mislabeled as confounder · K3 misnamed/sign-inverted variable · K4 fake-deterministic via extreme
  coefficients · K5 method-assumption violation), metadata-role correctness, output + label accuracy, and
  *"does it actually teach what it claims?"*. Green means a written skeptical review exists, not just that code runs.

Legend: ❌ not done · 🔶 partial · ✅ done

| Example | Domain | Joe | Claude-skeptical | Notes |
|---|---|:--:|:--:|---|
| `tutoring-scores` | classic | ❌ | ❌ |  |
| `simpson-severity` | classic | ❌ | ❌ |  |
| `icu-mortality-triage` | classic | ❌ | ❌ |  |
| `college-earnings` | classic | ❌ | ❌ |  |
| `front-door-smoking` | classic | ❌ | ❌ |  |
| `berkson-hospital` | classic | ❌ | ❌ |  |
| `birthweight-paradox` | classic | ❌ | ❌ | ⚠ marginal smoking→mortality reads ~null/protective (should be harmful) — calibration check needed; collider paradox itself holds |
| `obesity-paradox` | classic | ❌ | ❌ |  |
| `cats-highrise-syndrome` | classic | ❌ | ❌ |  |
| `instrumental-encouragement` | classic | ❌ | ❌ |  |
| `mediation-direct-total` | classic | ❌ | ❌ |  |
| `measurement-error-latent` | classic | ❌ | ❌ |  |
| `case-control-selection` | classic | ❌ | ❌ |  |
| `policing-encounters` | classic | ❌ | ❌ |  |
| `m-bias-adjustment` | classic | ❌ | ❌ |  |
| `lords-paradox` | classic | ❌ | ❌ |  |
| `target-trial-followup` | epidemiology | ❌ | ❌ | censoring→outcome kludge removed (this session) |
| `what-if-treatment-feedback` | epidemiology | ❌ | ❌ | clean; IPW recovers oracle (reference for 'sane') |
| `what-if-ipw-pseudopopulation` | epidemiology | ❌ | ❌ | oracle-gap: adaptive binning improved recovery; residual ~0.025 is finite-sample |
| `what-if-hazard-selection` | epidemiology | ❌ | ❌ | fake-deterministic survivor gating replaced w/ absorbing + deterministic complement (this session) |
| `what-if-nhefs-mortality-survival` | epidemiology | ❌ | ❌ | censoring-as-cause kludge removed; Baseline_health→Baseline_risk; Weight_gain_2y→mediator; survival curve relabeled (this session) |
| `what-if-weight-gain-g-estimation` | epidemiology | ❌ | ❌ | Diet_change mislabel → mediator (this session); estimators agree but DGP has little confounding to demonstrate |
| `what-if-hiv-cd4-variants` | epidemiology | ❌ | ❌ | structural residual gap in dynamic 3-step contrast — revisit |
| `what-if-censoring-ipcw` | epidemiology | ❌ | ❌ | two censoring→outcome kludge edges removed (this session) |
| `what-if-dynamic-g-formula` | epidemiology | ❌ | ❌ |  |
| `what-if-snaft-survival` | epidemiology | ❌ | ❌ | censoring→outcome kludge removed; still flagged provisional (SNAFT) |
| `policy-event-study` | econometrics | ❌ | ❌ |  |
| `incrementality-uplift` | product | ❌ | ❌ |  |
| `causal-ml-refutation` | ml | ❌ | ❌ |  |
| `ota-gene-program-traits` | ml | ❌ | ❌ |  |
| `ops-root-cause` | operations | ❌ | ❌ |  |
| `education-mediation` | social | ❌ | ❌ |  |
| `chess-intelligence-practice` | social | ❌ | ❌ |  |
| `chess-intelligence-practice-simple-flip` | social | ❌ | ❌ |  |
| `galton-regression` | classic | ❌ | ❌ |  |

**Totals:** 41 examples · Joe-audited 0/41 · Claude-skeptical-audited 0/41.

Update a row's gate to 🔶/✅ when an audit is performed, and record what was checked in Notes (or link a commit/doc).
