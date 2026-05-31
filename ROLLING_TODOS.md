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

## Recent Paper DAG Replication Track

- [ ] Build a curated set of 2025-2026 paper-derived DAG examples where the paper's causal structure is partly implicit. For each candidate, record: citation/date, design, implied nodes/edges, estimand, identification strategy, what the graph clarifies, and which Nudagitty features it stresses or lacks.
- [x] Start with a gene-network stress test from Brown et al. 2025, "Large-scale causal discovery using interventional data sheds light on gene network structure in K562 cells" (Nature Communications, 2025). Implemented the no-simplification full-network import, then made the primary view an intervention-mechanics explorer: selected perturbation gene, `delta * R_hat` forecasts, `G_hat` direct-edge comparison, mediated effects, sign disagreements, path-explanation examples, source links, and full-graph fallback.
- [ ] Follow up on the Brown et al. gene-network stress test with a collapsed hub/subgraph teaching view that can sit beside the full faithful import without pretending the cyclic inferred network is a clean small DAG.
- [x] Follow with Ota et al. 2025/2026, "Causal modelling of gene effects from regulators to programs to traits" (Nature, published Dec 2025; issue Feb 2026). Implemented a paper-derived layered reconstruction in the pro catalog: CRISPRi regulator effects, cNMF programs, MCH/RDW/IRF outcomes, LoF/GWAS/trans-eQTL evidence nodes, S_het analysis covariate, and explicit "association is not direct mechanism" denouement copy.
- [ ] Add a GLP-1 target-trial/EHR example: initiation of GLP-1RA versus active comparators, diabetes/obesity severity, care access, adherence/discontinuation, censoring, negative controls, and many outcomes. Target: serious observational causal-inference stress test with high-dimensional confounding and outcome atlas output.
- [ ] Add an AI-labor-market example from Humlum and Vestergaard 2025, "Large Language Models, Small Labor Market Effects" (NBER WP 33777). Target: adoption -> task restructuring -> productivity -> earnings/hours, with DiD, employer-worker hierarchy, and a "mechanisms moved but headline outcomes did not" punchline.
- [ ] Add a phone-ban/school-policy example if the 2026 NBER source is stable and accessible. Target: staggered adoption, baseline trends, student composition, distraction/discipline/well-being/test-score mediators, and interference across students/classrooms.
- [ ] Add a climate/wildfire-smoke health example from 2025 Nature work. Target: climate -> fire/weather -> smoke PM2.5 -> exposure -> mortality, with spatial/temporal confounding, nonlinear dose response, adaptation, and projection versus causal-estimation distinction.
- [ ] For this track, avoid presenting reconstructed graphs as "the paper's DAG" unless the paper explicitly supplies one. Label them as "Nudagitty reconstruction of the paper's implicit causal model" and keep assumptions editable.
