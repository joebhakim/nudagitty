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
