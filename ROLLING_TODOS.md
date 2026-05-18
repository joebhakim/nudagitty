# Rolling TODOs

Keep lightweight follow-ups here when a branch is reviewable but still needs product polish.

## Basic Mode Polish

- [ ] Tighten the Basic-mode layout after review: spacing, drawer sizing, right-panel density, responsive behavior, and visual hierarchy around the DAG.
- [ ] Refine coachmark copy so it feels like causal-inference guidance, not generic drawing-app help.
- [ ] Keep simulation controls secondary: `refresh sample` should stay available, but selection, intervention, and adjustment should remain the primary Basic-mode affordances.
- [ ] Revisit Basic-mode example count and ordering after user testing. Prefer fewer examples that each demonstrate a distinct causal idea over many minor `X -> Y` confounding variants.
- [ ] Add a clearer first-run path from roles to results: exposure/outcome first, then selection/intervention/adjustment, then visible output.

## Example Expansion Direction

- [ ] Expand examples around "huh" moments: cases where the graph changes what a user thinks the comparison means, not just cases where the graph labels a known confounder.
- [ ] For each future example, write the intended surprise in one sentence before tuning the DGP or output card.
- [x] Low birth-weight paradox: implemented as a selected low-birthweight sample where smoking looks protective in the sample but harmful in the population DGP.
- [x] Obesity paradox: implemented as a selected chronic-disease sample where obesity looks protective in the sample but harmful in the population DGP.
- [x] Policing encounters: implemented as a synthetic selected-denominator example where encounter-only force rates reverse relative to the population structural contrast.
- [x] Front-door smoking/tar/cancer: implemented with a completed output showing latent confounding, tar mediation, and the DGP do contrast.
- [x] M-bias / adjustment can hurt: implemented with a completed output showing raw near-null association versus collider-conditioned association.
- [x] Lord's paradox / baseline adjustment: implemented with a completed output showing change-score and baseline-adjusted final-outcome estimand split.
- [x] Chess selected-sample sign flip as the template: implemented with a completed output showing full-population positive IQ/Elo correlation versus selected-sample negative correlation.
