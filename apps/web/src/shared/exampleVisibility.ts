import { EXAMPLES } from "@nudagitty/core";

// Curated allowlist of examples we are confident enough about to expose to users.
// Anything not listed here is hidden from the example menu and never auto-loaded.
//
// The first id is the fresh-start landing (so keep the most approachable one first).
// Add an id here once its DAG/DGP has been verified.
export const VERIFIED_EXAMPLE_IDS: readonly string[] = [
  // Basic 3-node confounder: crude "treatment hurts" reverses to "treatment helps" (+10pp)
  // once Severity is adjusted. The canonical confounding example, with a single right answer.
  "simpson-severity",
  // Collider hook (restaurant food vs service): independent in the population, a manufactured
  // negative correlation among the "worth visiting" sample. The launch-anchor demo — toggle the
  // selection and the round blob collapses into a downward tradeoff band.
  "restaurant-collider",
  "positivity-correlated-confounders",
  "continuous-dose-response",
  "categorical-regimen",
  "er-visits-count",
  // Term disambiguation: the node-on-edge moderation primitive. Regime modulates an edge (dashed
  // violet arrow); the moderator-CATE output facets the effect by regime. Crossover (sign flips) vs
  // ordinal (same sign) vs moderated mediation (the gate sits on the mediator→outcome edge).
  "effect-modification-crossover",
  "effect-modification-ordinal",
  "moderated-mediation",
  // John Snow's cholera study — the canonical instrument (IV/2SLS recovers the water effect despite
  // unmeasured sanitation/poverty confounding).
  "john-snow-cholera",
  // Epistasis (Labrador coat colour) — gene–gene interaction: the extension locus masks the pigment
  // locus, so B's effect on the coat is only present when E is functional.
  "epistasis-coat-color",
  // PROVISIONAL — high-yield examples exposed on the canary for manual verification before they're
  // truly blessed: front-door identification (recovers an effect through a mediator despite latent
  // confounding) and the time-varying-confounding g-methods flagship (only g-methods recover
  // always-vs-never-treat; adjusting for time-varying CD4 is wrong).
  "front-door-smoking",
  "what-if-hiv-cd4-variants",
  // LaLonde job-training DGM contrast (real data; same +$1,800 truth, joint broken→real→learned;
  // naive bias tracks the joint). Leads the DGM showcase.
  "lalonde-dgm-independent",
  "lalonde-dgm-plasmode",
  "lalonde-dgm-generative",
  // Track B "recover the RCT" benchmark replay (real treat/re78; truth = the experimental +$1,794).
  // PROVISIONAL / under review: the main output still shows the degenerate do-oracle (truth ≈ 0);
  // the payoff is the Σ panel's Overlap/positivity section. Needs the benchmark grading panel before
  // it's truly user-ready.
  "lalonde-recover-rct",
  // The DGM-toolbox contrast: smoking -> weight gain, same true effect (+3.5 kg), five different
  // confounder joints (independent / confounder-DAG / copula / real plasmode / generative). Open
  // the DGP panel (Σ) on each to see the correlation matrix change while the truth is fixed.
  "what-if-nhefs-weight-gain",
  "wg-dgm-confounder-dag",
  "wg-dgm-copula",
  "wg-dgm-plasmode",
  "wg-dgm-generative",
  // Standalone showcase: strong correlation + strong confounding -> poor overlap; IPW/matching
  // degrade (ESS collapses) while the g-formula still recovers the +3.5 kg truth.
  "wg-dgm-positivity"
];

export function verifiedExamples(): Array<typeof EXAMPLES[number]> {
  return VERIFIED_EXAMPLE_IDS
    .map((id) => EXAMPLES.find((example) => example.id === id))
    .filter((example): example is typeof EXAMPLES[number] => example !== undefined);
}

export function isExampleVerified(id: string | null | undefined): boolean {
  return id != null && VERIFIED_EXAMPLE_IDS.includes(id);
}
