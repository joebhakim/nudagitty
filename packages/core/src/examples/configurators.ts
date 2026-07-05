import { parseModel } from "../parser";
import { analyzeGraph } from "../analysis";
import { datasetColumnIndex, datasetRows } from "../datasets";
import { defaultEdgeMechanism, normalizeEdgeMechanism, normalizeGraphDocumentMetadata, normalizeNodeMechanism, normalizeSelectionCondition, normalizeVariableModel } from "../graph";
import { setCopulaBlock } from "../copula";
import { simpleEdge } from "../copulaVine";
import type { CopulaBlock, EdgeMechanismKind, GraphDocument, GraphDocumentMetadata, GraphEdge, GraphModel, GraphNode, MixtureEdge, NodeDistribution, NodeInteraction, NodeMechanism, Point, SimulationSelectionCondition, VariableModel } from "../types";
import { HIV_CD4_SEQUENCE_VISITS, UNIT_NORMAL, ZERO_NOISE, addCopulaCovariates, addPlasmodeCovariates, applyWhatIfMetadata, binaryStrategies, dynamicLowRiskStrategy, exampleSeed, layoutExampleDocument, markExposures, prepareDocument, riskEstimand, setBinaryVariable, setContinuousVariable, setEdgeMechanism, setExampleSampleSize, setLinearCoefficient, setLogitNode, setNode, setSelection, setSmoothGate, setVariable, staticStrategy, survivalSpec } from "./builders";

export function configureFlexibleAdjustment(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 6000);
  setContinuousVariable(document, "Risk_score", "Continuous baseline risk. It drives both treatment and outcome through its SQUARE — people at either extreme are treated more and fare worse — so the confounding is orthogonal to a straight line in risk.", "risk z-score");
  setBinaryVariable(document, "Treatment", "Binary treatment, more common at risk extremes.", "treated");
  setBinaryVariable(document, "Outcome", "Binary outcome.", "event");
  setNode(document, "Risk_score", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Treatment", -1.5);
  setLogitNode(document, "Outcome", -0.6);
  setLinearCoefficient(document, "Treatment", "Outcome", -0.9);
  // Both edges enter through Risk_score² (a U-shape: extremes drive treatment AND
  // outcome). Because the confounder is orthogonal to linear Risk_score, adjusting for
  // it LINEARLY does essentially nothing — outcome regression stays as biased as the
  // crude. A quadratic basis recovers the L² term and removes the confounding entirely;
  // the nonparametric rows (which bin Risk_score) are flexible already.
  setEdgeMechanism(document, "Risk_score", "Treatment", "quadratic", { beta1: 0, beta2: 1.5 });
  setEdgeMechanism(document, "Risk_score", "Outcome", "quadratic", { beta1: 0, beta2: 1.4 });
  return document;
}

export function configureSimpsonSeverity(document: GraphDocument): GraphDocument {
  setContinuousVariable(document, "Severity", "Baseline severity. Sicker patients are more likely to receive treatment and less likely to recover.", "severity z-score");
  setVariable(document, "Severity", { adjustment: { method: "stabilized_ipw", cutpoints: [] } });
  setBinaryVariable(document, "Treatment", "Observed treatment assignment. Treatment is more common among severe cases.", "treated");
  setBinaryVariable(document, "Recovery", "Observed recovery indicator. Treatment helps, but severity hurts recovery.", "recovered");
  setNode(document, "Severity", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Treatment", -0.15);
  setLogitNode(document, "Recovery", 0.45);
  // TODO(simpson-ipw-math): The DGP-implied marginal do contrast is about +7.3 pp
  // while the raw observational contrast is about -43.8 pp. Stabilized IPW with the
  // current 0.03..0.97 propensity clipping targets a clipped/overlap-ish estimand
  // closer to +1 pp in large samples, not the full DGP do contrast.
  setLinearCoefficient(document, "Severity", "Treatment", 2.8);
  setLinearCoefficient(document, "Severity", "Recovery", -3.0);
  setLinearCoefficient(document, "Treatment", "Recovery", 0.65);
  return document;
}

// Pure effect modification: Treatment is randomized (no confounding), and Regime — a root with no
// structural edge of its own — only MODULATES Treatment's effect on Outcome. The baseline edge gives
// +1 when Regime=0; the smooth gate subtracts 2 when Regime=1, so the effect crosses to -1. The
// canvas shows this as Regime's dashed arrow landing on the Treatment→Outcome edge.
export function configureEffectModificationCrossover(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 6000);
  setBinaryVariable(document, "Regime", "The moderator: a context that flips the sign of the treatment effect. Treatment helps when Regime=0 and hurts when Regime=1.", "regime");
  setBinaryVariable(document, "Treatment", "Randomized treatment — no confounding here, so any subgroup difference is genuine effect modification.", "treated");
  setContinuousVariable(document, "Outcome", "Outcome whose response to treatment reverses across the regime — a disordinal (crossover) interaction.", "outcome score");
  setNode(document, "Regime", { distribution: { kind: "bernoulli", p: 0.5 }, noise: ZERO_NOISE });
  setNode(document, "Treatment", { distribution: { kind: "bernoulli", p: 0.5 }, noise: ZERO_NOISE });
  setNode(document, "Outcome", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.6 } });
  setLinearCoefficient(document, "Treatment", "Outcome", 1.0);
  setSmoothGate(document, "Outcome", "Treatment", "Regime", -2.0, 0.5, 8);
  return document;
}

// Ordinal counterpart: same structure as the crossover, but the gate only DAMPENS the effect (−0.6)
// rather than overpowering it (−2.0), so Regime=1's effect is +0.4 — still positive. Same sign, smaller
// size: moderation without a crossover, where the marginal effect is not misleading about direction.
export function configureEffectModificationOrdinal(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 6000);
  setBinaryVariable(document, "Regime", "The moderator: it changes how much treatment helps, but not the sign. Treatment helps in both regimes (more when Regime=0).", "regime");
  setBinaryVariable(document, "Treatment", "Randomized treatment — no confounding, so the subgroup differences are genuine effect modification.", "treated");
  setContinuousVariable(document, "Outcome", "Outcome whose response to treatment shrinks (but never reverses) across the regime — an ordinal interaction.", "outcome score");
  setNode(document, "Regime", { distribution: { kind: "bernoulli", p: 0.5 }, noise: ZERO_NOISE });
  setNode(document, "Treatment", { distribution: { kind: "bernoulli", p: 0.5 }, noise: ZERO_NOISE });
  setNode(document, "Outcome", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.6 } });
  setLinearCoefficient(document, "Treatment", "Outcome", 1.0);
  setSmoothGate(document, "Outcome", "Treatment", "Regime", -0.6, 0.5, 8);
  return document;
}

// Second-stage moderated mediation: Treatment moves a single binary Behavior (the mediator), and the
// Regime gates the Behavior→Outcome edge — so the INDIRECT effect crosses sign by regime while the
// mediator path itself is fixed. The moderator acts on the mediator's edge, not treatment's.
export function configureModeratedMediation(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 6000);
  setBinaryVariable(document, "Regime", "The moderator: it decides whether more of the behavior helps or hurts — it gates the behavior→outcome edge.", "regime");
  setBinaryVariable(document, "Treatment", "Randomized treatment that pushes the behavior.", "treated");
  setBinaryVariable(document, "Behavior", "The single mediating behavior the treatment changes. Whether it helps depends on the regime.", "adheres");
  setContinuousVariable(document, "Outcome", "Outcome reached only through the behavior; its response to the behavior flips across the regime.", "outcome score");
  setNode(document, "Regime", { distribution: { kind: "bernoulli", p: 0.5 }, noise: ZERO_NOISE });
  setNode(document, "Treatment", { distribution: { kind: "bernoulli", p: 0.5 }, noise: ZERO_NOISE });
  setLogitNode(document, "Behavior", -1.0);
  setNode(document, "Outcome", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.6 } });
  setLinearCoefficient(document, "Treatment", "Behavior", 2.2);
  setLinearCoefficient(document, "Behavior", "Outcome", 1.0);
  setSmoothGate(document, "Outcome", "Behavior", "Regime", -2.0, 0.5, 8);
  return document;
}

// John Snow's 1854 cholera study as an instrument. Company (Z) is as-if random (intermingled pipes), so
// it instruments Contamination (A) for Cholera (Y). Sanitation/poverty (U, latent) confounds A↔Y — it
// raises both contaminated-water exposure and cholera risk by other routes — so the naive Contamination→
// Cholera contrast is biased UP, while the company-instrument recovers the effect of the water itself.
export function configureJohnSnowCholera(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 8000);
  setBinaryVariable(document, "Company", "Water company supplying the house. As-if random: the two companies' pipes were intermingled street by street, decided years earlier by landlords. Lambeth (0) drew clean water upstream; Southwark & Vauxhall (1) drew sewage-tainted water downstream.", "S&V supplier");
  setContinuousVariable(document, "Sanitation", "Unmeasured neighbourhood sanitation / poverty. Worse sanitation means BOTH more contaminated water AND higher cholera risk by other routes — the confounding the instrument defeats.", "sanitation z-score", ["latent"]);
  setBinaryVariable(document, "Contamination", "Whether the household actually drank cholera-contaminated water — mostly set by the company, but not entirely (private wells, other sources).", "contaminated water");
  setBinaryVariable(document, "Cholera_death", "Death from cholera.", "cholera death");
  setNode(document, "Company", { distribution: { kind: "bernoulli", p: 0.5 }, noise: ZERO_NOISE });
  setNode(document, "Sanitation", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Contamination", -2.8); // low baseline so Lambeth (clean) households are rarely exposed
  setLogitNode(document, "Cholera_death", -4.0);  // low baseline cholera (rare absolute rates, like the real 0.4–3%)
  setLinearCoefficient(document, "Company", "Contamination", 4.0);       // strong first stage (S&V → contaminated)
  setLinearCoefficient(document, "Sanitation", "Contamination", 1.1);    // poorer → more contaminated (confounding)
  setLinearCoefficient(document, "Contamination", "Cholera_death", 3.1); // contaminated water → cholera (the true effect)
  setLinearCoefficient(document, "Sanitation", "Cholera_death", 1.45);   // poorer → cholera by other routes (confounding)
  return document;
}

// Recessive epistasis (Labrador coat colour). The extension locus E is EPISTATIC to the pigment locus B:
// ee blocks all pigment (yellow) regardless of B, so B's effect on colour is MASKED unless E is
// functional. Modelled as E gating B's effect on the trait — a gene–gene interaction. B has no effect on
// its own (the B→trait edge is 0); the smooth gate switches it on only when E is functional.
export function configureEpistasisCoatColor(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 6000);
  setBinaryVariable(document, "E_locus", "MC1R, the extension locus — the receptor that switches pigment cells to dark (eumelanin). ee (0) = non-functional → only yellow pigment, masking the B locus; E_ (1) = functional → dark pigment allowed. The epistatic (masking) gene.", "MC1R functional");
  setBinaryVariable(document, "B_locus", "TYRP1, the B locus — black (B=1) vs brown/chocolate (B=0) eumelanin. Only visible when MC1R is functional. The hypostatic (masked) gene.", "B (black) allele");
  setContinuousVariable(document, "Coat_darkness", "Coat darkness. Yellow (low) when ee; chocolate (medium) or black (high) when MC1R is functional.", "darkness");
  setNode(document, "E_locus", { distribution: { kind: "bernoulli", p: 0.5 }, noise: ZERO_NOISE });
  setNode(document, "B_locus", { distribution: { kind: "bernoulli", p: 0.5 }, noise: ZERO_NOISE });
  setNode(document, "Coat_darkness", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.4 } });
  setLinearCoefficient(document, "E_locus", "Coat_darkness", 1.0);  // MC1R functional → dark pigment (yellow → chocolate baseline)
  setLinearCoefficient(document, "B_locus", "Coat_darkness", 1.0);  // TYRP1: black (B) is +1 darker than chocolate (b)
  // MC1R MASKS TYRP1: when MC1R is non-functional (ee) the gate removes TYRP1's effect entirely (yellow).
  // Negative coefficient + negative steepness ⇒ the gate is active (subtracts the full +1) only when E=0.
  setSmoothGate(document, "Coat_darkness", "B_locus", "E_locus", -1.0, 0.5, -8);
  return document;
}

export function configureIcuMortalityTriage(document: GraphDocument): GraphDocument {
  setContinuousVariable(document, "Severity", "Baseline illness severity measured before the ICU decision.", "severity z-score");
  setBinaryVariable(document, "ICU_admission", "Treatment-like ICU admission decision. Sicker patients are much more likely to be admitted.", "admitted");
  setBinaryVariable(document, "Death", "In-hospital mortality after the admission decision.", "death");
  setContinuousVariable(document, "Triage_score", "Administrative or clinical score affected by both baseline severity and ICU admission; a collider/bad-control candidate.", "score");
  setNode(document, "Severity", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "ICU_admission", -0.45);
  setLogitNode(document, "Death", -2.35);
  setNode(document, "Triage_score", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.35 } });
  setLinearCoefficient(document, "Severity", "ICU_admission", 2.0);
  setLinearCoefficient(document, "Severity", "Death", 1.45);
  setLinearCoefficient(document, "ICU_admission", "Death", -0.75);
  setLinearCoefficient(document, "Severity", "Triage_score", 1.1);
  setLinearCoefficient(document, "ICU_admission", "Triage_score", 1.2);
  return document;
}

export function configureCollegeEarnings(document: GraphDocument): GraphDocument {
  setContinuousVariable(document, "Family_log_income", "Standardized pre-college log family income. Higher-income families make college attendance more likely and also raise expected adult earnings through non-college pathways.", "log income z");
  setBinaryVariable(document, "College", "College attendance or completion indicator.", "college");
  setContinuousVariable(document, "Earnings", "Adult earnings measured after the college decision.", "earnings index");
  setNode(document, "Family_log_income", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "College", -0.35);
  setNode(document, "Earnings", { intercept: 45, noise: { kind: "normal", mean: 0, sd: 7 } });
  setLinearCoefficient(document, "Family_log_income", "College", 1.25);
  setLinearCoefficient(document, "Family_log_income", "Earnings", 12);
  setLinearCoefficient(document, "College", "Earnings", 8);
  return document;
}

export function configureTutoringScores(document: GraphDocument): GraphDocument {
  setBinaryVariable(document, "Academic_need", "Pre-tutoring academic need. Students needing help are more likely to receive tutoring and score lower without it.", "needs help");
  setBinaryVariable(document, "Tutoring", "Tutoring participation before the test.", "tutored");
  setContinuousVariable(document, "Test_score", "Post-tutoring test score.", "points");
  setNode(document, "Academic_need", { distribution: { kind: "bernoulli", p: 0.34 }, noise: ZERO_NOISE });
  setLogitNode(document, "Tutoring", -1.25);
  setNode(document, "Test_score", { intercept: 78, noise: { kind: "normal", mean: 0, sd: 5.5 } });
  setLinearCoefficient(document, "Academic_need", "Tutoring", 2.8);
  setLinearCoefficient(document, "Academic_need", "Test_score", -50);
  setLinearCoefficient(document, "Tutoring", "Test_score", 7);
  return document;
}

export function configureFrontDoorSmoking(document: GraphDocument): GraphDocument {
  setContinuousVariable(document, "Genetic_risk", "Latent predisposition that affects smoking and cancer risk.", "risk z-score", ["latent"]);
  setBinaryVariable(document, "Smoking", "Smoking behavior, confounded by latent genetic risk.", "smokes");
  setContinuousVariable(document, "Tar", "Measured tar exposure mediating the smoking effect.", "tar index");
  setBinaryVariable(document, "Cancer", "Cancer indicator affected by tar exposure and latent genetic risk.", "case");
  setNode(document, "Genetic_risk", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Smoking", -0.45);
  setNode(document, "Tar", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.3 } });
  setLogitNode(document, "Cancer", -2.5);
  setLinearCoefficient(document, "Genetic_risk", "Smoking", 1.2);
  setLinearCoefficient(document, "Genetic_risk", "Cancer", 0.8);
  setLinearCoefficient(document, "Smoking", "Tar", 1.5);
  setLinearCoefficient(document, "Tar", "Cancer", 1.1);
  return document;
}

export function configureBerksonHospital(document: GraphDocument): GraphDocument {
  setBinaryVariable(document, "Disease_A", "First independent disease process.", "case");
  setBinaryVariable(document, "Disease_B", "Second independent disease process.", "case");
  setBinaryVariable(document, "Hospitalized", "Collider selection variable. Either disease can make hospitalization likely.", "selected");
  setNode(document, "Disease_A", { distribution: { kind: "bernoulli", p: 0.15 }, noise: ZERO_NOISE });
  setNode(document, "Disease_B", { distribution: { kind: "bernoulli", p: 0.12 }, noise: ZERO_NOISE });
  setLogitNode(document, "Hospitalized", -3.2);
  setLinearCoefficient(document, "Disease_A", "Hospitalized", 2.8);
  setLinearCoefficient(document, "Disease_B", "Hospitalized", 2.8);
  return document;
}

export function configureRestaurantCollider(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 5000);
  setContinuousVariable(document, "Food_quality", "How good the food is. Independent of service across the full population of restaurants.", "food (z)");
  setContinuousVariable(document, "Service_quality", "How good the service is. Independent of food across the full population of restaurants.", "service (z)");
  setBinaryVariable(document, "Worth_visiting", "Selection: a restaurant survives / makes your shortlist only if it is good enough overall — a common effect of food AND service. Conditioning on this is what manufactures the tradeoff.", "worth visiting");
  setNode(document, "Food_quality", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Service_quality", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  // Sharp selection on (food + service): only the upper-right frontier survives, so among the
  // visited restaurants food and service are forced into a tradeoff (~ -0.5) though they are
  // independent in the full population.
  setLogitNode(document, "Worth_visiting", -3.2);
  setLinearCoefficient(document, "Food_quality", "Worth_visiting", 3.4);
  setLinearCoefficient(document, "Service_quality", "Worth_visiting", 3.4);
  // Condition the analysis sample on the survivors (worth visiting = 1): this is what turns the
  // independent (round) cloud into a downward tradeoff band.
  setSelection(document, "Worth_visiting", { operator: "at_least", value: 1, sampling: "rejection" });
  return document;
}

// Gentle positivity demo: two near-collinear confounders (corr ≈ 0.9 via a shared latent driver,
// Gaussian copula) that both strongly drive treatment. Adjusting still identifies the +1 effect, but
// the correlation pushes propensities toward 0/1 → overlap collapses and IPW/matching wobble. The
// copula correlation is tunable from the source→confounder loadings (corr ≈ loading²).
export function configurePositivityCorrelatedConfounders(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 4000);
  setContinuousVariable(document, "Shared", "Latent standard-normal driver that the two confounders share — its loading sets their correlation.", "z", ["latent"]);
  setContinuousVariable(document, "Confounder_A", "Confounder A — drives both treatment and outcome.", "z");
  setContinuousVariable(document, "Confounder_B", "Confounder B — drives both; almost the same variable as A.", "z");
  setBinaryVariable(document, "Treatment", "Binary treatment, assigned far more often when A and B are high.", "treated");
  setContinuousVariable(document, "Outcome", "Continuous outcome.", "outcome");
  // Strong copula correlation: loading 0.95 on each ⇒ corr(A,B) ≈ 0.95² ≈ 0.90.
  addCopulaCovariates(document, "Shared", [
    { id: "Confounder_A", marginal: UNIT_NORMAL, loading: 0.95 },
    { id: "Confounder_B", marginal: UNIT_NORMAL, loading: 0.95 }
  ]);
  // Treatment strongly driven by the confounders → extreme propensities (poor overlap).
  setLogitNode(document, "Treatment", 0);
  setLinearCoefficient(document, "Confounder_A", "Treatment", 1.6);
  setLinearCoefficient(document, "Confounder_B", "Treatment", 1.6);
  // Outcome: a clean +1 treatment effect plus confounding through A and B.
  setNode(document, "Outcome", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
  setLinearCoefficient(document, "Treatment", "Outcome", 1.0);
  setLinearCoefficient(document, "Confounder_A", "Outcome", 1.0);
  setLinearCoefficient(document, "Confounder_B", "Outcome", 1.0);
  return document;
}

// Continuous-treatment example: a CONTINUOUS dose (not a 0/1 switch). Severity confounds: sicker
// patients get more dose AND recover worse, so the crude dose→recovery slope is negative even though
// do(dose) helps (+0.8 per mg). Intervening on / adjusting for severity flips it positive — the
// continuous analogue of Simpson's. (The engine supports do() on continuous nodes via overrides.)
export function configureContinuousDoseResponse(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 4000);
  setContinuousVariable(document, "Severity", "Baseline illness severity. Sicker patients are given more drug and also recover worse — the confounding.", "severity z-score");
  setContinuousVariable(document, "Dose", "Continuous drug dose actually administered.", "mg");
  setContinuousVariable(document, "Recovery", "Recovery score at follow-up.", "score");
  setNode(document, "Severity", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Dose", { intercept: 5, noise: { kind: "normal", mean: 0, sd: 0.8 } });
  setNode(document, "Recovery", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
  setLinearCoefficient(document, "Severity", "Dose", 1.6);     // sicker → more dose
  setLinearCoefficient(document, "Severity", "Recovery", -3.6); // sicker → much worse recovery (confounding)
  setLinearCoefficient(document, "Dose", "Recovery", 0.8);      // the TRUE causal effect: dose helps
  return document;
}

export function configureErVisitsCount(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 4000);
  setContinuousVariable(document, "Illness", "Baseline illness burden. Sicker patients enroll in the program more AND visit the ER more — the confounding.", "illness z-score");
  setBinaryVariable(document, "Program", "Enrolled in the care-management program.", "enrolled");
  setVariable(document, "Visits", { valueType: "count", description: "ER visits over the year — a COUNT outcome, drawn Poisson(exp η).", unit: "visits" });
  setNode(document, "Illness", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Program", -0.2);
  setNode(document, "Visits", { combiner: "poisson_log", intercept: Math.log(4), noise: ZERO_NOISE });
  setLinearCoefficient(document, "Illness", "Program", 0.9);   // sicker → enroll more (the confounding)
  setLinearCoefficient(document, "Illness", "Visits", 0.45);   // sicker → more visits (log-mean scale)
  setLinearCoefficient(document, "Program", "Visits", -0.55);  // TRUE effect: the program cuts visits (×exp(−0.55) ≈ 0.58)
  return document;
}

export function configureConfounderJointCopula(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 4000);
  setContinuousVariable(document, "Severity_A", "First baseline confounder — sicker on axis A gets more dose AND recovers worse.", "z-score");
  setContinuousVariable(document, "Severity_B", "Second baseline confounder — same story on a different axis.", "z-score");
  setContinuousVariable(document, "Dose", "Continuous drug dose administered.", "mg");
  setContinuousVariable(document, "Recovery", "Recovery score at follow-up.", "score");
  setNode(document, "Severity_A", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Severity_B", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Dose", { intercept: 5, noise: { kind: "normal", mean: 0, sd: 0.8 } });
  setNode(document, "Recovery", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
  setLinearCoefficient(document, "Severity_A", "Dose", 1.2);
  setLinearCoefficient(document, "Severity_B", "Dose", 1.2);
  setLinearCoefficient(document, "Severity_A", "Recovery", -2);
  setLinearCoefficient(document, "Severity_B", "Recovery", -2);
  setLinearCoefficient(document, "Dose", "Recovery", 0.8); // the true effect
  return document;
}

export function configureConfounderTripleCopula(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 4000);
  setContinuousVariable(document, "Age", "First baseline confounder — older patients get more dose AND recover worse.", "z-score");
  setContinuousVariable(document, "Severity", "Second baseline confounder — sicker gets more dose AND recovers worse.", "z-score");
  setContinuousVariable(document, "Comorbidity", "Third baseline confounder — more comorbid gets more dose AND recovers worse.", "z-score");
  setContinuousVariable(document, "Dose", "Continuous drug dose administered.", "mg");
  setContinuousVariable(document, "Recovery", "Recovery score at follow-up.", "score");
  setNode(document, "Age", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Severity", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Comorbidity", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Dose", { intercept: 5, noise: { kind: "normal", mean: 0, sd: 0.8 } });
  setNode(document, "Recovery", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
  setLinearCoefficient(document, "Age", "Dose", 0.9);
  setLinearCoefficient(document, "Severity", "Dose", 0.9);
  setLinearCoefficient(document, "Comorbidity", "Dose", 0.9);
  setLinearCoefficient(document, "Age", "Recovery", -1.4);
  setLinearCoefficient(document, "Severity", "Recovery", -1.4);
  setLinearCoefficient(document, "Comorbidity", "Recovery", -1.4);
  setLinearCoefficient(document, "Dose", "Recovery", 0.8); // the true effect
  return document;
}

// --- New showcase examples (2026-07): copula/dependence sims + literature-grounded structures ---

// A copula block over root covariates (nodes in vine order), with the given trees.
function covariateBlock(nodeIds: string[], trees: MixtureEdge[][], depth = 1): CopulaBlock {
  return { id: "cov", nodes: nodeIds, order: nodeIds.map((_, i) => i), depth, edges: trees };
}

export function configureTailDependentConfounders(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 4000);
  setContinuousVariable(document, "Severity_A", "Baseline severity, axis A — Clayton-coupled to B, so when both are extreme-LOW they move together (lower-tail dependence).", "z-score");
  setContinuousVariable(document, "Severity_B", "Baseline severity, axis B — the lower-tail partner of A.", "z-score");
  setContinuousVariable(document, "Dose", "Continuous drug dose administered.", "mg");
  setContinuousVariable(document, "Recovery", "Recovery score at follow-up.", "score");
  setNode(document, "Severity_A", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Severity_B", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Dose", { intercept: 5, noise: { kind: "normal", mean: 0, sd: 0.8 } });
  setNode(document, "Recovery", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
  setLinearCoefficient(document, "Severity_A", "Dose", 1.2);
  setLinearCoefficient(document, "Severity_B", "Dose", 1.2);
  setLinearCoefficient(document, "Severity_A", "Recovery", -2);
  setLinearCoefficient(document, "Severity_B", "Recovery", -2);
  setLinearCoefficient(document, "Dose", "Recovery", 0.8); // the true effect
  return setCopulaBlock(document, covariateBlock(["Severity_A", "Severity_B"], [[simpleEdge("clayton", 0.5, 0)]]));
}

export function configureModeratedConfounding(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 5000);
  setBinaryVariable(document, "Sex", "Biological sex (0/1). It MODERATES how Age and Smoking co-vary — the conditional copula's τ flips sign by Sex (a non-simplified vine).", "male");
  setContinuousVariable(document, "Age", "Baseline age (z). Confounds the treatment; its dependence with Smoking depends on Sex.", "z-score");
  setContinuousVariable(document, "Smoking", "Smoking intensity (z). Confounds the treatment.", "z-score");
  setContinuousVariable(document, "Treatment", "Continuous treatment intensity.", "dose");
  setContinuousVariable(document, "Outcome", "Outcome score.", "score");
  setNode(document, "Sex", { distribution: { kind: "bernoulli", p: 0.5 }, noise: ZERO_NOISE });
  setNode(document, "Age", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Smoking", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Treatment", { intercept: 5, noise: { kind: "normal", mean: 0, sd: 0.9 } });
  setNode(document, "Outcome", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
  setLinearCoefficient(document, "Sex", "Treatment", 0.8);
  setLinearCoefficient(document, "Age", "Treatment", 1.0);
  setLinearCoefficient(document, "Smoking", "Treatment", 1.0);
  setLinearCoefficient(document, "Sex", "Outcome", -1.0);
  setLinearCoefficient(document, "Age", "Outcome", -1.5);
  setLinearCoefficient(document, "Smoking", "Outcome", -1.5);
  setLinearCoefficient(document, "Treatment", "Outcome", 0.8); // the true effect
  // Vine order [Age, Sex, Smoking]: Age–Smoking | Sex is a Tree-2 conditional edge whose τ is a step
  // function of Sex — τ≈−0.68 for Sex=0, τ≈+0.79 for Sex=1 (the sex/height moderation, made concrete).
  const moderated: MixtureEdge = {
    components: [{ family: "gaussian", rotation: 0, tau: { by: 1, constant: 0, mechanism: normalizeEdgeMechanism({ kind: "threshold", threshold: 0.5, low: -0.9, high: 1.2 }) } }],
    weights: [{ by: null, constant: 0 }]
  };
  const block: CopulaBlock = {
    id: "cov", nodes: ["Age", "Sex", "Smoking"], order: [0, 1, 2], depth: 2,
    edges: [[simpleEdge("independence", 0), simpleEdge("independence", 0)], [moderated]]
  };
  return setCopulaBlock(document, block);
}

export function configureDiscreteMarginConfession(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 5000);
  setBinaryVariable(document, "Risk_A", "A binary risk factor (prevalence 30%). Its authored copula τ with Risk_B is a LATENT knob the point masses compress — the UNEQUAL prevalences cap the achievable association well below it (Fréchet–Hoeffding).", "present");
  setBinaryVariable(document, "Risk_B", "A second binary risk factor (prevalence 70%) — the mismatched marginals are what bite: a 30% and a 70% binary can be at most ~0.43 correlated, no matter the authored τ.", "present");
  setContinuousVariable(document, "Dose", "Continuous drug dose.", "mg");
  setContinuousVariable(document, "Recovery", "Recovery score.", "score");
  setNode(document, "Risk_A", { distribution: { kind: "bernoulli", p: 0.3 }, noise: ZERO_NOISE });
  setNode(document, "Risk_B", { distribution: { kind: "bernoulli", p: 0.7 }, noise: ZERO_NOISE });
  setNode(document, "Dose", { intercept: 5, noise: { kind: "normal", mean: 0, sd: 0.8 } });
  setNode(document, "Recovery", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
  setLinearCoefficient(document, "Risk_A", "Dose", 1.5);
  setLinearCoefficient(document, "Risk_B", "Dose", 1.5);
  setLinearCoefficient(document, "Risk_A", "Recovery", -2);
  setLinearCoefficient(document, "Risk_B", "Recovery", -2);
  setLinearCoefficient(document, "Dose", "Recovery", 0.8); // the true effect
  return setCopulaBlock(document, covariateBlock(["Risk_A", "Risk_B"], [[simpleEdge("gaussian", 0.8)]]));
}

export function configureBiasAmplificationZ(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 6000);
  setContinuousVariable(document, "Z", "A near-instrument: a strong predictor of the exposure with no direct effect on the outcome. Tempting to 'adjust for everything' — but it AMPLIFIES the unmeasured bias.", "z-score");
  setContinuousVariable(document, "U", "Unmeasured confounder of exposure and outcome (latent — cannot be adjusted).", "z-score", ["latent"]);
  setContinuousVariable(document, "X", "Continuous exposure.", "dose");
  setContinuousVariable(document, "Y", "Outcome.", "score");
  setNode(document, "Z", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "U", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "X", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.5 } });
  setNode(document, "Y", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
  setLinearCoefficient(document, "Z", "X", 2.0);
  setLinearCoefficient(document, "U", "X", 1.0);
  setLinearCoefficient(document, "U", "Y", 1.5);
  setLinearCoefficient(document, "X", "Y", 0.8); // the true effect
  return document;
}

export function configureTable2Fallacy(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 6000);
  setContinuousVariable(document, "Confounder", "A baseline confounder of the primary exposure (adjust for this).", "z-score");
  setContinuousVariable(document, "Drug", "The PRIMARY exposure whose effect you want.", "dose");
  setContinuousVariable(document, "Blood_pressure", "A SECOND risk factor for the outcome — but it's a MEDIATOR of the drug (Drug → BP → Outcome). Its regression coefficient is NOT its total effect, and putting it in the model turns the drug's total effect into a direct effect.", "mmHg z");
  setContinuousVariable(document, "Outcome", "Outcome.", "score");
  setNode(document, "Confounder", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Drug", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
  setNode(document, "Blood_pressure", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
  setNode(document, "Outcome", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
  setLinearCoefficient(document, "Confounder", "Drug", 1.0);
  setLinearCoefficient(document, "Confounder", "Outcome", 1.0);
  setLinearCoefficient(document, "Drug", "Blood_pressure", 1.2);  // Drug → BP (a mediator)
  setLinearCoefficient(document, "Blood_pressure", "Outcome", 0.7); // BP → Outcome
  setLinearCoefficient(document, "Drug", "Outcome", 0.5);          // Drug direct — total = 0.5 + 1.2*0.7 = 1.34
  return document;
}

export function configureSuppressorConfounding(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 6000);
  setContinuousVariable(document, "Severity", "A SUPPRESSOR confounder: sicker patients get MORE of the drug but recover WORSE, so crudely the drug looks useless — its true benefit is masked.", "z-score");
  setContinuousVariable(document, "Dose", "Continuous drug dose.", "mg");
  setContinuousVariable(document, "Recovery", "Recovery score.", "score");
  setNode(document, "Severity", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Dose", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
  setNode(document, "Recovery", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
  setLinearCoefficient(document, "Severity", "Dose", 1.5);
  setLinearCoefficient(document, "Severity", "Recovery", -2.0);
  setLinearCoefficient(document, "Dose", "Recovery", 0.8); // true +0.8, but crude ≈ −0.1 (sign-reversed)
  return document;
}

export function configureImmortalTimeBias(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 8000);
  setBinaryVariable(document, "Survived_window", "Did the patient survive the initial window — long enough to receive treatment? Early deaths never get treated, so 'treated' quietly means 'survived long enough'.", "survived");
  setBinaryVariable(document, "Treatment", "Whether treatment was started. Only patients still alive at the treatment time can be classified treated — the immortal time.", "treated");
  setBinaryVariable(document, "Death", "Death by end of follow-up.", "death");
  setNode(document, "Survived_window", { distribution: { kind: "bernoulli", p: 0.75 }, noise: ZERO_NOISE });
  setLogitNode(document, "Treatment", -6);  // Survived_window=0 ⇒ logit −6 ⇒ p≈0 treated (early deaths untreated)
  setLogitNode(document, "Death", 3);        // Survived_window=0 ⇒ logit +3 ⇒ p≈0.95 (they died early)
  setLinearCoefficient(document, "Survived_window", "Treatment", 6);  // survivors: logit 0 ⇒ ~50% treated
  setLinearCoefficient(document, "Survived_window", "Death", -4);      // survivors: logit −1 ⇒ ~27% later death
  setLinearCoefficient(document, "Treatment", "Death", 0);            // the TRUE effect is null
  return document;
}

export function configureCategoricalRegimen(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 5000);
  setContinuousVariable(document, "Severity", "Baseline illness severity. Sicker patients are steered to the later regimens AND recover worse — the confounding.", "severity z-score");
  setVariable(document, "Regimen", { valueType: "categorical", categories: ["regimen A", "regimen B", "regimen C"], description: "Which of three UNORDERED drug regimens the patient received — a categorical treatment, not a dose.", unit: "" });
  setContinuousVariable(document, "Recovery", "Recovery score at follow-up.", "score");
  setNode(document, "Severity", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Recovery", { intercept: 6, noise: { kind: "normal", mean: 0, sd: 1 } });
  setLinearCoefficient(document, "Severity", "Regimen", 1.3);   // sicker → steered to a later regimen (the confounding channel)
  setLinearCoefficient(document, "Severity", "Recovery", -3.5); // sicker → worse recovery (confounding)
  setLinearCoefficient(document, "Regimen", "Recovery", 1.6);   // per-level lift: each later regimen genuinely helps more (the truth)
  return document;
}

export function configureBirthweightParadox(document: GraphDocument): GraphDocument {
  setBinaryVariable(document, "Smoking", "Maternal smoking exposure.", "smokes");
  setContinuousVariable(document, "Frailty", "Latent infant frailty that lowers birthweight and raises mortality.", "frailty z-score", ["latent"]);
  setContinuousVariable(document, "Birthweight", "Observed birthweight. Smoking and frailty both lower it.", "grams");
  setBinaryVariable(document, "Infant_mortality", "Infant mortality indicator.", "death");
  setNode(document, "Smoking", { distribution: { kind: "bernoulli", p: 0.3 }, noise: ZERO_NOISE });
  setNode(document, "Frailty", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Birthweight", { intercept: 3300, noise: { kind: "normal", mean: 0, sd: 150 } });
  setLogitNode(document, "Infant_mortality", -0.2);
  setLinearCoefficient(document, "Smoking", "Birthweight", -260);
  setLinearCoefficient(document, "Frailty", "Birthweight", -420);
  setLinearCoefficient(document, "Smoking", "Infant_mortality", 0.45);
  setLinearCoefficient(document, "Frailty", "Infant_mortality", 1.55);
  setLinearCoefficient(document, "Birthweight", "Infant_mortality", -0.0011);
  setSelection(document, "Birthweight", {
    operator: "at_most",
    value: 2500,
    sampling: "importance"
  });
  return document;
}

export function configureObesityParadox(document: GraphDocument): GraphDocument {
  setBinaryVariable(document, "Obesity", "Obesity indicator. In the population it increases chronic-disease risk and modestly increases mortality.", "obese");
  setContinuousVariable(document, "Frailty", "Latent disease severity and background mortality risk.", "frailty z-score", ["latent"]);
  setBinaryVariable(document, "Chronic_disease", "Selected disease cohort. Obesity and latent frailty are alternative routes into the diseased sample.", "diseased");
  setBinaryVariable(document, "Mortality", "Mortality indicator after disease ascertainment.", "death");
  setNode(document, "Obesity", { distribution: { kind: "bernoulli", p: 0.34 }, noise: ZERO_NOISE });
  setNode(document, "Frailty", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Chronic_disease", -2.0);
  setLogitNode(document, "Mortality", -2.8);
  setLinearCoefficient(document, "Obesity", "Chronic_disease", 2.0);
  setLinearCoefficient(document, "Frailty", "Chronic_disease", 1.85);
  setLinearCoefficient(document, "Obesity", "Mortality", 0.45);
  setLinearCoefficient(document, "Frailty", "Mortality", 1.55);
  setLinearCoefficient(document, "Chronic_disease", "Mortality", 0.75);
  setSelection(document, "Chronic_disease", {
    operator: "one_of",
    value: 1,
    values: [1],
    sampling: "rejection"
  });
  return document;
}

export function configureCatsHighriseSyndrome(document: GraphDocument): GraphDocument {
  // Calibrated to Whitney & Mehlhaff (1987), JAVMA: 115 cats with known falls of
  // 2-32 stories (mean ~5.5), ~90% survival among cats brought in for treatment,
  // and the reported curvilinear pattern where injuries stop rising past ~7 stories.
  setContinuousVariable(document, "Fall_height", "How many stories the cat fell. Most reported falls are from the lower floors with a long right tail toward the highest balconies.", "stories");
  setContinuousVariable(document, "Injury_severity", "Injury severity on a standardized clinical scale. Trauma rises with fall height to a peak near the seventh story, then declines to a terminal-velocity plateau that still sits above a gentle fall. This is the only path from fall height to survival.", "severity z");
  setBinaryVariable(document, "Survival", "Survived the fall. Caused by injury alone, so its dependence on fall height is non-monotonic: lowest around the seventh story and recovering for terminal-velocity falls, but never above the short-fall rate.", "survived");
  setBinaryVariable(document, "Brought_to_vet", "Selection: the cat was carried into the clinic and recorded. Both a dramatic high fall and a visibly severe injury make this more likely, so it is a collider.", "selected");

  setExampleSampleSize(document, 12000);
  // Root marginal for fall height: lognormal floored near the low stories with a
  // long tail so a handful of cats fall from ~20-32 stories.
  setNode(document, "Fall_height", { distribution: { kind: "lognormal", meanLog: 1.46, sdLog: 0.6 }, noise: ZERO_NOISE });
  // Terminal-velocity physics: injury severity rises with impact energy up to a
  // peak around the seventh story (Whitney & Mehlhaff's reported inflection),
  // then declines toward a PLATEAU as the cat reaches terminal velocity (~60 mph
  // at ~5 stories), relaxes, and spreads out like a flying squirrel to add drag.
  // Crucially the high-fall plateau sits ABOVE the gentle-fall baseline: a
  // terminal-velocity impact is still far worse than a two-story tumble, just no
  // worse than (in fact a little better than) the mid-rise peak. This is the
  // only route by which fall height reaches survival -- there is no direct
  // height->survival edge, because a fall can only kill a cat by injuring it.
  setNode(document, "Injury_severity", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.5 } });
  setEdgeMechanism(document, "Fall_height", "Injury_severity", "piecewise_linear", {
    points: [
      { x: 0, y: -0.5 },
      { x: 2, y: -0.1 },
      { x: 5, y: 0.62 },
      { x: 7, y: 0.85 },
      { x: 10, y: 0.62 },
      { x: 15, y: 0.48 },
      { x: 20, y: 0.45 },
      { x: 32, y: 0.44 }
    ]
  });
  // Survival is caused by injury alone, but NOT linearly in the log-odds: a cat
  // shrugs off minor trauma (survival stays at its baseline high rate), then once
  // injury crosses a roughly fatal threshold the odds of survival collapse, and
  // for catastrophic trauma they bottom out on a floor (more injury past "almost
  // certainly fatal" can't lower survival further). That S-shaped dose-response is
  // a falling smooth_threshold on the logit scale, which is far more honest than a
  // straight line that would imply every extra unit of injury costs the same odds.
  setLogitNode(document, "Survival", 4.2);
  setEdgeMechanism(document, "Injury_severity", "Survival", "smooth_threshold", {
    scale: -6.8,
    threshold: 0.78,
    steepness: 3.2
  });
  // Survivorship selection: a cat that dies on impact is rarely carried in and
  // recorded, and a visibly hurt (but living) cat is more likely to be taken in
  // than an unscathed one. Conditioning on this recorded sample (Brought_to_vet)
  // is what lifts recorded survival above the true population rate, on top of the
  // real terminal-velocity physics in the injury curve.
  setLogitNode(document, "Brought_to_vet", -1.3);
  setLinearCoefficient(document, "Injury_severity", "Brought_to_vet", 0.5);
  setLinearCoefficient(document, "Survival", "Brought_to_vet", 2.4);
  setSelection(document, "Brought_to_vet", {
    operator: "one_of",
    value: 1,
    values: [1],
    sampling: "rejection"
  });
  return document;
}

export function configureInstrumentalEncouragement(document: GraphDocument): GraphDocument {
  setBinaryVariable(document, "Encouragement", "Randomized encouragement or assignment offer.", "encouraged");
  setBinaryVariable(document, "Treatment", "Treatment uptake affected by encouragement and latent health.", "treated");
  setContinuousVariable(document, "Outcome", "Outcome affected by treatment and unobserved baseline health.", "outcome score");
  setContinuousVariable(document, "Unobserved_health", "Latent baseline health that confounds treatment uptake and outcome.", "health z-score", ["latent"]);
  setNode(document, "Encouragement", { distribution: { kind: "bernoulli", p: 0.5 }, noise: ZERO_NOISE });
  setNode(document, "Unobserved_health", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Treatment", -0.5);
  setNode(document, "Outcome", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.8 } });
  setLinearCoefficient(document, "Encouragement", "Treatment", 1.8);
  setLinearCoefficient(document, "Unobserved_health", "Treatment", 0.9);
  setLinearCoefficient(document, "Treatment", "Outcome", 1.1);
  setLinearCoefficient(document, "Unobserved_health", "Outcome", -1.1);
  return document;
}

export function configureMediationDirectTotal(document: GraphDocument): GraphDocument {
  setBinaryVariable(document, "Treatment", "Treatment assignment.", "treated");
  setContinuousVariable(document, "Biomarker", "Mediator changed by treatment and predictive of outcome.", "biomarker z-score");
  setContinuousVariable(document, "Outcome", "Outcome with a direct treatment effect and an indirect biomarker path.", "outcome score");
  setNode(document, "Treatment", { distribution: { kind: "bernoulli", p: 0.5 }, noise: ZERO_NOISE });
  setNode(document, "Biomarker", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.7 } });
  setNode(document, "Outcome", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.8 } });
  setLinearCoefficient(document, "Treatment", "Biomarker", 1.2);
  setLinearCoefficient(document, "Biomarker", "Outcome", 1.3);
  setLinearCoefficient(document, "Treatment", "Outcome", 0.5);
  return document;
}

export function configureMeasurementErrorLatent(document: GraphDocument): GraphDocument {
  setContinuousVariable(document, "Family_background", "Family background affecting education, ability, and earnings.", "background z-score");
  setContinuousVariable(document, "True_ability", "Latent ability construct.", "ability z-score", ["latent"]);
  setContinuousVariable(document, "Education", "Years of education.", "years");
  setContinuousVariable(document, "Test_score", "Noisy observed proxy for true ability.", "score", ["proxy"], { kind: "noisy_proxy", errorSd: 8 });
  setContinuousVariable(document, "Earnings", "Adult earnings outcome.", "income index");
  setNode(document, "Family_background", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "True_ability", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.7 } });
  setNode(document, "Education", { intercept: 12, noise: { kind: "normal", mean: 0, sd: 0.8 } });
  setNode(document, "Test_score", { intercept: 100, noise: { kind: "normal", mean: 0, sd: 8 } });
  setNode(document, "Earnings", { intercept: 50, noise: { kind: "normal", mean: 0, sd: 5 } });
  setLinearCoefficient(document, "Family_background", "True_ability", 0.6);
  setLinearCoefficient(document, "Family_background", "Education", 0.8);
  setLinearCoefficient(document, "Family_background", "Earnings", 3);
  setLinearCoefficient(document, "True_ability", "Test_score", 12);
  setLinearCoefficient(document, "True_ability", "Earnings", 6);
  setLinearCoefficient(document, "Education", "Earnings", 4);
  return document;
}

export function configureCaseControlSelection(document: GraphDocument): GraphDocument {
  setContinuousVariable(document, "Risk_factor", "Background risk factor affecting both exposure and disease.", "risk z-score");
  setBinaryVariable(document, "Exposure", "Exposure affected by baseline risk.", "exposed");
  setBinaryVariable(document, "Disease", "Disease indicator.", "case");
  setBinaryVariable(document, "Sampled", "Selection indicator for case-control style sampling.", "sampled");
  setNode(document, "Risk_factor", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Exposure", -0.3);
  setLogitNode(document, "Disease", -2.2);
  setLogitNode(document, "Sampled", -2.5);
  setLinearCoefficient(document, "Risk_factor", "Exposure", 0.9);
  setLinearCoefficient(document, "Risk_factor", "Disease", 1.0);
  setLinearCoefficient(document, "Exposure", "Disease", 1.0);
  setLinearCoefficient(document, "Disease", "Sampled", 3.0);
  return document;
}

export function configurePolicingEncounters(document: GraphDocument): GraphDocument {
  setBinaryVariable(document, "Group_A", "Synthetic group indicator used to demonstrate selected encounter data. Treat this as a structural disparity example, not a literal intervention recommendation.", "group A");
  setContinuousVariable(document, "Incident_risk", "Latent incident risk / situational severity that affects both police contact and force.", "risk z-score", ["latent"]);
  setBinaryVariable(document, "Police_contact", "Observed police encounter. This is selected data, not a neutral denominator.", "contact");
  setBinaryVariable(document, "Use_of_force", "Use-of-force indicator among all simulated people, observed only after contact in many datasets.", "force");
  setNode(document, "Group_A", { distribution: { kind: "bernoulli", p: 0.45 }, noise: ZERO_NOISE });
  setNode(document, "Incident_risk", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Police_contact", -2.2);
  setLogitNode(document, "Use_of_force", -3.4);
  setLinearCoefficient(document, "Group_A", "Police_contact", 2.7);
  setLinearCoefficient(document, "Incident_risk", "Police_contact", 1.7);
  setLinearCoefficient(document, "Group_A", "Use_of_force", 0.18);
  setLinearCoefficient(document, "Incident_risk", "Use_of_force", 1.65);
  setLinearCoefficient(document, "Police_contact", "Use_of_force", 0.9);
  setSelection(document, "Police_contact", {
    operator: "one_of",
    value: 1,
    values: [1],
    sampling: "rejection"
  });
  return document;
}

export function configureMBiasAdjustment(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 5000);
  setContinuousVariable(document, "Cause_of_exposure", "Latent cause of the exposure and the collider score.", "u1", ["latent"]);
  setContinuousVariable(document, "Cause_of_outcome", "Latent cause of the outcome and the collider score.", "u2", ["latent"]);
  setBinaryVariable(document, "Exposure", "Exposure with no causal path to the outcome in this DAG.", "exposed");
  setContinuousVariable(document, "Collider_score", "Pre-treatment common effect of two latent causes. Adjusting for it opens a noncausal path.", "score");
  setContinuousVariable(document, "Outcome", "Outcome affected by its own latent cause, not by Exposure.", "outcome");
  setNode(document, "Cause_of_exposure", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Cause_of_outcome", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Exposure", -0.1);
  setNode(document, "Collider_score", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.45 } });
  setNode(document, "Outcome", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.75 } });
  setLinearCoefficient(document, "Cause_of_exposure", "Exposure", 1.4);
  setLinearCoefficient(document, "Cause_of_exposure", "Collider_score", 1.0);
  setLinearCoefficient(document, "Cause_of_outcome", "Collider_score", 1.0);
  setLinearCoefficient(document, "Cause_of_outcome", "Outcome", 1.2);
  return document;
}

export function configureLordsParadox(document: GraphDocument): GraphDocument {
  // Lord's paradox as a pretest/posttest study of a teaching method. The new-method class
  // is not randomized: stronger students cluster in it, so it starts ahead at pretest. The
  // within-class pretest->posttest slope is < 1 (regression to the mean), which is what makes
  // the change-score (gain) and the pretest-adjusted (ANCOVA) effect disagree -- and here
  // even take opposite signs.
  setContinuousVariable(document, "Pretest", "Score on a test taken BEFORE the term, in points. The class that later used the new method happened to start higher.", "points");
  setBinaryVariable(document, "Teaching_method", "Which class: 1 = new method, 0 = old method. Not randomized -- stronger students clustered in the new-method class.", "new method");
  setContinuousVariable(document, "Posttest", "Score on the SAME test taken AFTER the term, in points. Same scale as the pretest, so a change score is meaningful.", "points");
  setNode(document, "Pretest", { distribution: { kind: "normal", mean: 70, sd: 10 }, noise: ZERO_NOISE });
  setLogitNode(document, "Teaching_method", -12.6);
  setLinearCoefficient(document, "Pretest", "Teaching_method", 0.18);
  setNode(document, "Posttest", { intercept: 35, noise: { kind: "normal", mean: 0, sd: 5 } });
  setLinearCoefficient(document, "Pretest", "Posttest", 0.5); // < 1: regression to the mean
  setLinearCoefficient(document, "Teaching_method", "Posttest", 3); // true causal effect at equal pretest
  return document;
}

export function configureTargetTrialFollowup(document: GraphDocument): GraphDocument {
  setBinaryVariable(document, "Eligibility", "Eligibility criteria define the emulated trial population at time zero.", "eligible");
  setContinuousVariable(document, "Baseline_severity", "Pre-treatment prognosis that affects treatment, censoring, and outcomes.", "severity z-score");
  setBinaryVariable(document, "Treatment_start", "Treatment strategy assigned or initiated at time zero.", "treated");
  setBinaryVariable(document, "Adherence", "Post-baseline adherence, useful for per-protocol contrasts but dangerous as a naive adjustment.", "adherent");
  setBinaryVariable(document, "Censoring", "Loss to follow-up or censoring process after treatment assignment.", "censored");
  setBinaryVariable(document, "Outcome_90d", "Primary endpoint measured at the planned follow-up horizon.", "event");
  setBinaryVariable(document, "Negative_control", "Outcome that should not be affected by treatment, used to probe residual bias.", "event");
  setNode(document, "Eligibility", { distribution: { kind: "bernoulli", p: 0.82 }, noise: ZERO_NOISE });
  setNode(document, "Baseline_severity", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Treatment_start", -0.15);
  setLogitNode(document, "Adherence", 0.7);
  setLogitNode(document, "Censoring", -2.0);
  setLogitNode(document, "Outcome_90d", -1.4);
  setLogitNode(document, "Negative_control", -1.8);
  setLinearCoefficient(document, "Eligibility", "Treatment_start", 0.5);
  setLinearCoefficient(document, "Baseline_severity", "Treatment_start", 1.0);
  setLinearCoefficient(document, "Baseline_severity", "Censoring", 0.9);
  setLinearCoefficient(document, "Baseline_severity", "Outcome_90d", 1.2);
  setLinearCoefficient(document, "Baseline_severity", "Negative_control", 0.6);
  setLinearCoefficient(document, "Treatment_start", "Adherence", 1.4);
  setLinearCoefficient(document, "Treatment_start", "Outcome_90d", -0.55);
  setLinearCoefficient(document, "Adherence", "Outcome_90d", -0.35);
  return document;
}

export function configureWhatIfTreatmentFeedback(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 5000);
  setContinuousVariable(document, "Baseline_risk", "Pre-baseline prognosis measured before treatment starts.", "risk z-score");
  setBinaryVariable(document, "A0", "Treatment decision at baseline.", "treated");
  setBinaryVariable(document, "L1", "Time-varying risk measured after A0 and before A1. It is affected by earlier treatment and predicts later treatment and outcome.", "high risk");
  setBinaryVariable(document, "A1", "Treatment decision at the next follow-up time.", "treated");
  setBinaryVariable(document, "Y", "End-of-follow-up event.", "event");
  setNode(document, "Baseline_risk", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "A0", { distribution: { kind: "bernoulli", p: 0.5 }, noise: ZERO_NOISE });
  setLogitNode(document, "L1", -0.15);
  setLogitNode(document, "A1", -0.35);
  setLogitNode(document, "Y", -2.05);
  setLinearCoefficient(document, "Baseline_risk", "L1", 1.05);
  setLinearCoefficient(document, "Baseline_risk", "Y", 0.65);
  setLinearCoefficient(document, "A0", "L1", 0.9);
  setLinearCoefficient(document, "A0", "A1", 1.25);
  setLinearCoefficient(document, "A0", "Y", -0.42);
  setLinearCoefficient(document, "L1", "A1", 1.35);
  setLinearCoefficient(document, "L1", "Y", 1.05);
  setLinearCoefficient(document, "A1", "Y", -0.58);
  document.metadata = normalizeGraphDocumentMetadata({
    ...document.metadata,
    longitudinal: {
      timePoints: [
        { id: "t0", label: "baseline", order: 0 },
        { id: "t1", label: "follow-up 1", order: 1 },
        { id: "t2", label: "end of follow-up", order: 2 }
      ],
      variables: {
        Baseline_risk: { series: "risk", time: "t0", role: "baseline" },
        A0: { series: "treatment", time: "t0", role: "treatment" },
        L1: { series: "risk", time: "t1", role: "time_varying_confounder" },
        A1: { series: "treatment", time: "t1", role: "treatment" },
        Y: { series: "event", time: "t2", role: "outcome" }
      },
      treatmentStrategies: [
        {
          id: "always-treat",
          label: "always treat",
          description: "Set A0=1 and A1=1.",
          kind: "static",
          assignments: [
            { variable: "A0", value: 1 },
            { variable: "A1", value: 1 }
          ],
          rules: []
        },
        {
          id: "never-treat",
          label: "never treat",
          description: "Set A0=0 and A1=0.",
          kind: "static",
          assignments: [
            { variable: "A0", value: 0 },
            { variable: "A1", value: 0 }
          ],
          rules: []
        }
      ],
      estimands: [
        {
          id: "always-vs-never-risk-difference",
          label: "always treat vs never treat",
          type: "risk_difference",
          outcome: "Y",
          strategies: ["always-treat", "never-treat"],
          population: "baseline-eligible simulated cohort",
          horizon: "end of follow-up"
        }
      ],
      censoring: [],
      survivalOutputs: [
        {
          id: "event-person-time",
          label: "person-time event table",
          timeVariable: null,
          eventVariable: "Y",
          eventVariables: ["Y"],
          censoringVariable: null,
          censoringVariables: [],
          timeScale: "follow-up interval"
        }
      ]
    },
    sources: [
      {
        id: "hernan-robins-what-if",
        label: "What If",
        authors: "Miguel A. Hernan and James M. Robins",
        title: "Causal Inference: What If",
        year: "2025",
        url: "https://www.hsph.harvard.edu/miguel-hernan/causal-inference-book/",
        chapter: "Chapters 20-21",
        section: "Longitudinal g-methods",
        reference: "Treatment-confounder feedback teaching structure",
        note: "Inspired by the longitudinal g-method chapters; graph text and DGP are rewritten for this app."
      }
    ]
  });
  return document;
}

export function configureWhatIfIpwPseudopopulation(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 5000);
  setContinuousVariable(document, "Baseline_C", "Baseline covariate that affects both treatment and the outcome.", "covariate z-score");
  setBinaryVariable(document, "Treatment_A", "Treatment assigned with probability depending on the baseline covariate.", "treated");
  setBinaryVariable(document, "Outcome_Y", "End-of-follow-up binary outcome.", "event");
  setNode(document, "Baseline_C", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Treatment_A", -0.1);
  setLogitNode(document, "Outcome_Y", -1.8);
  setLinearCoefficient(document, "Baseline_C", "Treatment_A", 1.35);
  setLinearCoefficient(document, "Baseline_C", "Outcome_Y", 1.0);
  setLinearCoefficient(document, "Treatment_A", "Outcome_Y", -0.65);
  applyWhatIfMetadata(document, {
    chapter: "Chapter 2",
    section: "Standardization and inverse probability weighting",
    reference: "Pseudo-population teaching example",
    longitudinal: {
      timePoints: [
        { id: "t0", label: "baseline", order: 0 },
        { id: "t1", label: "follow-up", order: 1 }
      ],
      variables: {
        Baseline_C: { series: "covariate", time: "t0", role: "baseline" },
        Treatment_A: { series: "treatment", time: "t0", role: "treatment" },
        Outcome_Y: { series: "event", time: "t1", role: "outcome" }
      },
      treatmentStrategies: binaryStrategies("treat", "Treat", "Treatment_A", "Do A=1.", "untreat", "No treatment", "Treatment_A", "Do A=0."),
      estimands: [riskEstimand("treat-vs-untreat-risk-difference", "treat vs no treatment", "Outcome_Y", ["treat", "untreat"], "end of follow-up")],
      censoring: [],
      survivalOutputs: []
    }
  });
  return document;
}

export function configureWhatIfHazardSelection(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 6000);
  setContinuousVariable(document, "Frailty", "Baseline frailty that affects treatment and each interval's mortality risk.", "frailty z-score");
  setBinaryVariable(document, "Treatment_A", "Treatment at baseline.", "treated");
  setBinaryVariable(document, "Death_1", "Death during the first interval.", "death");
  setBinaryVariable(document, "Alive_1", "Indicator for surviving into the second interval.", "alive");
  setBinaryVariable(document, "Death_2", "Death during the second interval, observed among those still at risk.", "death");
  setNode(document, "Frailty", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Treatment_A", -0.25);
  setLogitNode(document, "Death_1", -2.4);
  // Alive_1 is the deterministic survivor indicator (1 - Death_1), not a leaky logit:
  // additive combiner + zero noise + a -1 edge gives exactly 1 - Death_1.
  setNode(document, "Alive_1", { intercept: 1, noise: ZERO_NOISE, combiner: "additive" });
  setLogitNode(document, "Death_2", -1.6);
  setLinearCoefficient(document, "Frailty", "Treatment_A", 1.05);
  setLinearCoefficient(document, "Frailty", "Death_1", 1.35);
  setLinearCoefficient(document, "Frailty", "Death_2", 1.15);
  setLinearCoefficient(document, "Treatment_A", "Death_1", -0.75);
  setLinearCoefficient(document, "Treatment_A", "Death_2", -0.3);
  setLinearCoefficient(document, "Death_1", "Alive_1", -1);
  // Death_2 is cumulative: a first-interval death is necessarily dead by interval 2.
  // The at-risk gating is the absorbing edge (like NHEFS), not a coefficient on Alive_1.
  setEdgeMechanism(document, "Death_1", "Death_2", "absorbing", {});
  applyWhatIfMetadata(document, {
    chapter: "Chapters 8 and 17",
    section: "Hazards, survival, and selection among survivors",
    reference: "Hazard-ratio selection warning",
    longitudinal: {
      timePoints: [
        { id: "t0", label: "baseline", order: 0 },
        { id: "t1", label: "interval 1", order: 1 },
        { id: "t2", label: "interval 2", order: 2 }
      ],
      variables: {
        Frailty: { series: "frailty", time: "t0", role: "baseline" },
        Treatment_A: { series: "treatment", time: "t0", role: "treatment" },
        Death_1: { series: "death", time: "t1", role: "outcome" },
        Alive_1: { series: "survival", time: "t1", role: "selection" },
        Death_2: { series: "death", time: "t2", role: "outcome" }
      },
      treatmentStrategies: binaryStrategies("treat", "Treat", "Treatment_A", "Set A=1 at baseline.", "untreat", "No treatment", "Treatment_A", "Set A=0 at baseline."),
      estimands: [riskEstimand("cumulative-risk-difference", "cumulative risk difference", "Death_2", ["treat", "untreat"], "two intervals")],
      censoring: [],
      survivalOutputs: [survivalSpec("two-interval-survival", "two-interval survival", ["Death_1", "Death_2"], [])]
    }
  });
  return document;
}

export function configureWhatIfNhefsWeightGain(document: GraphDocument): GraphDocument {
  // SYNTHETIC example calibrated to reproduce the headline result of Hernan & Robins
  // "What If" Part II (Ch 12-14): the average causal effect of smoking cessation on weight
  // gain. NOT the book's real-data analysis -- it is a hand-built linear/logit DGP whose
  // crude (~+2.5 kg) and adjusted (~+3.5 kg) numbers we tuned to match the book's published
  // estimates. The confounders here are mutually INDEPENDENT (a transparent but unrealistic
  // joint); the copula/plasmode variants relax that. True effect = +3.5 kg.
  setExampleSampleSize(document, 4000);
  // Baseline covariates L (a subset of the book's 9 confounders), all measured pre-treatment.
  setBinaryVariable(document, "Sex", "Baseline sex (1 = female). Quitters were more often men.", "female");
  setContinuousVariable(document, "Age", "Baseline age. Quitters were ~4 years older, and older people gain less weight regardless of quitting -- the book's headline (surrogate) confounder.", "years");
  setContinuousVariable(document, "Smoking_intensity", "Baseline cigarettes per day. Quitters smoked fewer.", "cigarettes/day");
  setContinuousVariable(document, "Years_smoking", "Years of smoking at baseline. Quitters had smoked longer.", "years");
  setContinuousVariable(document, "Exercise", "Baseline recreational activity (z-score, higher = more active).", "activity z-score");
  setContinuousVariable(document, "Baseline_weight", "Body weight at the baseline visit. Quitters were slightly heavier.", "kg");
  setBinaryVariable(document, "Quit_smoking", "Quit smoking between the baseline (1971-75) and follow-up (1982) visits.", "quit");
  setContinuousVariable(document, "Weight_gain", "Weight change (follow-up minus baseline) in kg.", "kg");

  // Baseline covariate distributions (means/spreads echo Table 12.1).
  // Sex is a binary ROOT, so it must carry a Bernoulli *distribution* (a root ignores the
  // combiner); ~47% female (the book skews slightly male).
  setNode(document, "Sex", { distribution: { kind: "bernoulli", p: 0.47 }, noise: ZERO_NOISE });
  setNode(document, "Age", { distribution: { kind: "normal", mean: 43.5, sd: 12 }, noise: ZERO_NOISE });
  setNode(document, "Smoking_intensity", { distribution: { kind: "normal", mean: 20.5, sd: 11 }, noise: ZERO_NOISE });
  setNode(document, "Years_smoking", { distribution: { kind: "normal", mean: 24.5, sd: 12 }, noise: ZERO_NOISE });
  setNode(document, "Exercise", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Baseline_weight", { distribution: { kind: "normal", mean: 71, sd: 15 }, noise: ZERO_NOISE });

  // Treatment model: who quits. Signs follow Table 12.1 (older, more male, lighter and
  // longer-duration smokers, more active, heavier are likelier to have quit). ~26% quit.
  // Intercept offsets the raw-valued covariate means (logit edges use raw, not centered,
  // values) so the marginal quit rate lands near the book's ~26% (403/1566).
  setLogitNode(document, "Quit_smoking", -2.35);
  setLinearCoefficient(document, "Age", "Quit_smoking", 0.028);
  setLinearCoefficient(document, "Sex", "Quit_smoking", -0.25);
  setLinearCoefficient(document, "Smoking_intensity", "Quit_smoking", -0.02);
  setLinearCoefficient(document, "Years_smoking", "Quit_smoking", 0.008);
  setLinearCoefficient(document, "Exercise", "Quit_smoking", 0.12);
  setLinearCoefficient(document, "Baseline_weight", "Quit_smoking", 0.006);

  // Outcome model: weight gain (kg). TRUE causal effect of quitting = +3.5 kg. The
  // confounder coefficients pull the CRUDE difference down to ~2.5 kg (older/heavier
  // people quit more and gain less, masking part of the effect). Age is the dominant
  // channel, matching the book's "age is THE surrogate confounder" framing.
  setNode(document, "Weight_gain", { intercept: 11.5, noise: { kind: "normal", mean: 0, sd: 7.5 } });
  setLinearCoefficient(document, "Quit_smoking", "Weight_gain", 3.5);
  setLinearCoefficient(document, "Sex", "Weight_gain", 0.6);
  setLinearCoefficient(document, "Age", "Weight_gain", -0.13);
  setLinearCoefficient(document, "Smoking_intensity", "Weight_gain", 0.08);
  setLinearCoefficient(document, "Years_smoking", "Weight_gain", -0.03);
  setLinearCoefficient(document, "Exercise", "Weight_gain", -0.8);
  setLinearCoefficient(document, "Baseline_weight", "Weight_gain", -0.05);
  return document;
}

export function configureWhatIfNhefsWeightGainCopula(document: GraphDocument): GraphDocument {
  // Gaussian-copula variant of the weight-gain example. SAME treatment/outcome models, marginals,
  // and true effect (+3.5 kg) as the independent variant — but the six confounders are now
  // CORRELATED through a shared latent factor ("aging/burden": older → smoked longer, weigh more,
  // exercise less). Identification is unchanged (still adjust for the observed L), so the contrast
  // isolates what realistic correlation does to overlap/positivity and finite-sample estimators.
  setExampleSampleSize(document, 4000);
  setContinuousVariable(document, "Health_factor", "Latent standard-normal factor driving the covariate correlations (unobserved).", "z");
  setBinaryVariable(document, "Sex", "Baseline sex (1 = female).", "female");
  setContinuousVariable(document, "Age", "Baseline age.", "years");
  setContinuousVariable(document, "Smoking_intensity", "Baseline cigarettes per day.", "cigarettes/day");
  setContinuousVariable(document, "Years_smoking", "Years of smoking at baseline.", "years");
  setContinuousVariable(document, "Exercise", "Baseline recreational activity (z-score).", "activity z-score");
  setContinuousVariable(document, "Baseline_weight", "Body weight at the baseline visit.", "kg");
  setBinaryVariable(document, "Quit_smoking", "Quit smoking between baseline (1971-75) and follow-up (1982).", "quit");
  setContinuousVariable(document, "Weight_gain", "Weight change (follow-up minus baseline) in kg.", "kg");

  // Correlated covariate block: identical marginals to the independent variant, now sharing one
  // latent factor. Loadings → realistic correlations (pairwise ≈ loading_i · loading_j): age,
  // years-smoking and weight load positively together; exercise loads negatively; sex ~ unrelated.
  addCopulaCovariates(document, "Health_factor", [
    { id: "Age", marginal: { kind: "normal", mean: 43.5, sd: 12 }, loading: 0.85 },
    { id: "Years_smoking", marginal: { kind: "normal", mean: 24.5, sd: 12 }, loading: 0.70 },
    { id: "Baseline_weight", marginal: { kind: "normal", mean: 71, sd: 15 }, loading: 0.50 },
    { id: "Smoking_intensity", marginal: { kind: "normal", mean: 20.5, sd: 11 }, loading: 0.30 },
    { id: "Exercise", marginal: { kind: "normal", mean: 0, sd: 1 }, loading: -0.45 },
    { id: "Sex", marginal: { kind: "bernoulli", p: 0.47 }, loading: 0.10 }
  ]);

  // Treatment model (identical coefficients to the independent variant). ~26% quit.
  setLogitNode(document, "Quit_smoking", -2.35);
  setLinearCoefficient(document, "Age", "Quit_smoking", 0.028);
  setLinearCoefficient(document, "Sex", "Quit_smoking", -0.25);
  setLinearCoefficient(document, "Smoking_intensity", "Quit_smoking", -0.02);
  setLinearCoefficient(document, "Years_smoking", "Quit_smoking", 0.008);
  setLinearCoefficient(document, "Exercise", "Quit_smoking", 0.12);
  setLinearCoefficient(document, "Baseline_weight", "Quit_smoking", 0.006);

  // Outcome model (identical coefficients; TRUE effect of quitting = +3.5 kg).
  setNode(document, "Weight_gain", { intercept: 11.5, noise: { kind: "normal", mean: 0, sd: 7.5 } });
  setLinearCoefficient(document, "Quit_smoking", "Weight_gain", 3.5);
  setLinearCoefficient(document, "Sex", "Weight_gain", 0.6);
  setLinearCoefficient(document, "Age", "Weight_gain", -0.13);
  setLinearCoefficient(document, "Smoking_intensity", "Weight_gain", 0.08);
  setLinearCoefficient(document, "Years_smoking", "Weight_gain", -0.03);
  setLinearCoefficient(document, "Exercise", "Weight_gain", -0.8);
  setLinearCoefficient(document, "Baseline_weight", "Weight_gain", -0.05);
  return document;
}

export function configureWhatIfNhefsWeightGainConfounderDag(document: GraphDocument): GraphDocument {
  // Confounder-DAG variant: dependence is encoded by explicit edges AMONG the confounders
  // (a sequential factorization) rather than a latent factor or real data. Years-smoking is
  // caused by Age (older smoked longer); Baseline-weight by Sex (women lighter) but NOT Age
  // (matching the real near-zero Age-weight correlation). Same treatment/outcome and true
  // effect (+3.5 kg). The literature's least-favored DGM (you invent the structure) — shown
  // here for the contrast.
  setExampleSampleSize(document, 4000);
  setBinaryVariable(document, "Sex", "Baseline sex (1 = female).", "female");
  setContinuousVariable(document, "Age", "Baseline age.", "years");
  setContinuousVariable(document, "Smoking_intensity", "Baseline cigarettes per day.", "cigarettes/day");
  setContinuousVariable(document, "Years_smoking", "Years of smoking at baseline (caused by age).", "years");
  setContinuousVariable(document, "Exercise", "Baseline recreational activity (z-score).", "activity z-score");
  setContinuousVariable(document, "Baseline_weight", "Body weight at the baseline visit (caused by sex).", "kg");
  setBinaryVariable(document, "Quit_smoking", "Quit smoking between baseline (1971-75) and follow-up (1982).", "quit");
  setContinuousVariable(document, "Weight_gain", "Weight change (follow-up minus baseline) in kg.", "kg");

  // Roots.
  setNode(document, "Sex", { distribution: { kind: "bernoulli", p: 0.47 }, noise: ZERO_NOISE });
  setNode(document, "Age", { distribution: { kind: "normal", mean: 43.5, sd: 12 }, noise: ZERO_NOISE });
  setNode(document, "Smoking_intensity", { distribution: { kind: "normal", mean: 20.5, sd: 11 }, noise: ZERO_NOISE });
  setNode(document, "Exercise", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  // Derived confounders: Years = -1.6 + 0.6·Age + noise (corr ~0.6); Weight = 76.6 - 12·Sex + noise.
  setNode(document, "Years_smoking", { intercept: -1.6, noise: { kind: "normal", mean: 0, sd: 9.6 } });
  setLinearCoefficient(document, "Age", "Years_smoking", 0.6);
  setNode(document, "Baseline_weight", { intercept: 76.6, noise: { kind: "normal", mean: 0, sd: 14.5 } });
  setLinearCoefficient(document, "Sex", "Baseline_weight", -12);

  // Treatment model (same coefficients as the independent variant).
  setLogitNode(document, "Quit_smoking", -2.35);
  setLinearCoefficient(document, "Age", "Quit_smoking", 0.028);
  setLinearCoefficient(document, "Sex", "Quit_smoking", -0.25);
  setLinearCoefficient(document, "Smoking_intensity", "Quit_smoking", -0.02);
  setLinearCoefficient(document, "Years_smoking", "Quit_smoking", 0.008);
  setLinearCoefficient(document, "Exercise", "Quit_smoking", 0.12);
  setLinearCoefficient(document, "Baseline_weight", "Quit_smoking", 0.006);

  // Outcome model (true effect +3.5 kg).
  setNode(document, "Weight_gain", { intercept: 11.5, noise: { kind: "normal", mean: 0, sd: 7.5 } });
  setLinearCoefficient(document, "Quit_smoking", "Weight_gain", 3.5);
  setLinearCoefficient(document, "Sex", "Weight_gain", 0.6);
  setLinearCoefficient(document, "Age", "Weight_gain", -0.13);
  setLinearCoefficient(document, "Smoking_intensity", "Weight_gain", 0.08);
  setLinearCoefficient(document, "Years_smoking", "Weight_gain", -0.03);
  setLinearCoefficient(document, "Exercise", "Weight_gain", -0.8);
  setLinearCoefficient(document, "Baseline_weight", "Weight_gain", -0.05);
  return document;
}

export function configureWhatIfNhefsWeightGainPositivity(document: GraphDocument): GraphDocument {
  // Standalone showcase: strong copula correlation + strong confounder->treatment effects push
  // the propensity toward 0/1 (poor overlap). The weighting/propensity methods (IPW, matching)
  // get unstable while the re-simulated g-formula holds — the positivity lesson that the
  // independent variant's artificially-perfect overlap hides. Same true effect (+3.5 kg).
  setExampleSampleSize(document, 4000);
  setContinuousVariable(document, "Health_factor", "Latent standard-normal factor driving strong covariate correlations (unobserved).", "z");
  setBinaryVariable(document, "Sex", "Baseline sex (1 = female).", "female");
  setContinuousVariable(document, "Age", "Baseline age.", "years");
  setContinuousVariable(document, "Smoking_intensity", "Baseline cigarettes per day.", "cigarettes/day");
  setContinuousVariable(document, "Years_smoking", "Years of smoking at baseline.", "years");
  setContinuousVariable(document, "Exercise", "Baseline recreational activity (z-score).", "activity z-score");
  setContinuousVariable(document, "Baseline_weight", "Body weight at the baseline visit.", "kg");
  setBinaryVariable(document, "Quit_smoking", "Quit smoking between baseline and follow-up.", "quit");
  setContinuousVariable(document, "Weight_gain", "Weight change (follow-up minus baseline) in kg.", "kg");

  // Strong loadings -> near-collinear confounders.
  addCopulaCovariates(document, "Health_factor", [
    { id: "Age", marginal: { kind: "normal", mean: 43.5, sd: 12 }, loading: 0.95 },
    { id: "Years_smoking", marginal: { kind: "normal", mean: 24.5, sd: 12 }, loading: 0.9 },
    { id: "Baseline_weight", marginal: { kind: "normal", mean: 71, sd: 15 }, loading: 0.85 },
    { id: "Smoking_intensity", marginal: { kind: "normal", mean: 20.5, sd: 11 }, loading: 0.7 },
    { id: "Exercise", marginal: { kind: "normal", mean: 0, sd: 1 }, loading: -0.8 },
    { id: "Sex", marginal: { kind: "bernoulli", p: 0.47 }, loading: 0.2 }
  ]);

  // STRONG confounder -> treatment effects -> propensity spreads toward 0/1 (positivity bites).
  setLogitNode(document, "Quit_smoking", -4.3);
  setLinearCoefficient(document, "Age", "Quit_smoking", 0.11);
  setLinearCoefficient(document, "Sex", "Quit_smoking", -0.5);
  setLinearCoefficient(document, "Smoking_intensity", "Quit_smoking", -0.05);
  setLinearCoefficient(document, "Years_smoking", "Quit_smoking", 0.02);
  setLinearCoefficient(document, "Exercise", "Quit_smoking", 0.3);
  setLinearCoefficient(document, "Baseline_weight", "Quit_smoking", 0.02);

  // Outcome model (true effect +3.5 kg).
  setNode(document, "Weight_gain", { intercept: 11.5, noise: { kind: "normal", mean: 0, sd: 7.5 } });
  setLinearCoefficient(document, "Quit_smoking", "Weight_gain", 3.5);
  setLinearCoefficient(document, "Sex", "Weight_gain", 0.6);
  setLinearCoefficient(document, "Age", "Weight_gain", -0.13);
  setLinearCoefficient(document, "Smoking_intensity", "Weight_gain", 0.08);
  setLinearCoefficient(document, "Years_smoking", "Weight_gain", -0.03);
  setLinearCoefficient(document, "Exercise", "Weight_gain", -0.8);
  setLinearCoefficient(document, "Baseline_weight", "Weight_gain", -0.05);
  return document;
}

export function configureWhatIfNhefsWeightGainPlasmode(document: GraphDocument): GraphDocument {
  return configurePlasmodeWeightGain(document, "nhefs");
}

// The eight LaLonde covariates and the embedded column each resamples from.
const LALONDE_DGM_COVS: Array<{ id: string; column: string }> = [
  { id: "Age", column: "age" },
  { id: "Education", column: "education" },
  { id: "Black", column: "black" },
  { id: "Hispanic", column: "hispanic" },
  { id: "Married", column: "married" },
  { id: "No_degree", column: "nodegree" },
  { id: "Earnings_74", column: "re74" },
  { id: "Earnings_75", column: "re75" }
];

// Independent ("shuffle") covariate generation: each covariate gets its OWN row-index source and
// reads a column from an independently-drawn row, so the marginals are exactly real but the JOINT
// is broken (covariates decorrelated). Contrast with the shared-source plasmode (real joint).
function addShuffledCovariates(document: GraphDocument, dataset: string, covariates: Array<{ id: string; column: string; sourceId: string }>) {
  const rows = datasetRows(dataset);
  const n = Math.max(1, rows.length);
  for (const { id, column, sourceId } of covariates) {
    setContinuousVariable(document, sourceId, "Independent resample index for this covariate (unobserved).", "row");
    setNode(document, sourceId, { distribution: { kind: "uniform", min: 0, max: n }, noise: ZERO_NOISE });
    setNode(document, id, { combiner: "additive", intercept: 0, noise: ZERO_NOISE });
    setEdgeMechanism(document, sourceId, id, "table_lookup", { dataset, dataColumn: datasetColumnIndex(dataset, column) });
  }
}

// Shared LaLonde DGM setup: variable types + the imposed treatment and outcome models (true
// +$1,800 effect; the program serves the disadvantaged). The confounder JOINT is wired separately
// by each variant (independent / plasmode / generative) so only the joint differs.
function configureLalondeBase(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 4000);
  setContinuousVariable(document, "Age", "Age at program entry.", "years");
  setContinuousVariable(document, "Education", "Years of schooling.", "years");
  setBinaryVariable(document, "Black", "Race indicator (Black).", "black");
  setBinaryVariable(document, "Hispanic", "Ethnicity indicator (Hispanic).", "hispanic");
  setBinaryVariable(document, "Married", "Married at baseline.", "married");
  setBinaryVariable(document, "No_degree", "No high-school degree.", "no degree");
  setContinuousVariable(document, "Earnings_74", "Real earnings in 1974 (pre-program).", "USD");
  setContinuousVariable(document, "Earnings_75", "Real earnings in 1975 (pre-program).", "USD");
  setBinaryVariable(document, "In_program", "Enrolled in the NSW job-training program.", "in program");
  setContinuousVariable(document, "Earnings_78", "Real earnings in 1978 (outcome).", "USD");

  // Treatment model: the program serves the disadvantaged -> lower prior earnings / no degree raise
  // the chance of enrolment (the confounding we impose). ~30% enrol.
  setLogitNode(document, "In_program", 0.4);
  setLinearCoefficient(document, "Earnings_74", "In_program", -0.00002);
  setLinearCoefficient(document, "Earnings_75", "In_program", -0.00002);
  setLinearCoefficient(document, "No_degree", "In_program", 0.6);
  setLinearCoefficient(document, "Education", "In_program", -0.05);
  setLinearCoefficient(document, "Age", "In_program", -0.01);

  // Outcome model: 1978 earnings driven by human capital plus the TRUE program effect of +$1,800.
  setNode(document, "Earnings_78", { intercept: 1500, noise: { kind: "normal", mean: 0, sd: 6500 } });
  setLinearCoefficient(document, "In_program", "Earnings_78", 1800);
  setLinearCoefficient(document, "Earnings_74", "Earnings_78", 0.35);
  setLinearCoefficient(document, "Earnings_75", "Earnings_78", 0.45);
  setLinearCoefficient(document, "Education", "Earnings_78", 450);
  setLinearCoefficient(document, "Age", "Earnings_78", 40);
  setLinearCoefficient(document, "Married", "Earnings_78", 600);
  setLinearCoefficient(document, "No_degree", "Earnings_78", -500);
  return document;
}

export function configureLalondePlasmode(document: GraphDocument): GraphDocument {
  configureLalondeBase(document);
  setContinuousVariable(document, "Row_source", "Uniform draw over the embedded LaLonde rows (shared resampling index, unobserved).", "row");
  addPlasmodeCovariates(document, "Row_source", "lalonde-obs", LALONDE_DGM_COVS);
  return document;
}

export function configureLalondeGenerative(document: GraphDocument): GraphDocument {
  configureLalondeBase(document);
  setContinuousVariable(document, "Row_source", "Uniform draw over the synthetic LaLonde rows (shared resampling index, unobserved).", "row");
  addPlasmodeCovariates(document, "Row_source", "lalonde-synthetic", LALONDE_DGM_COVS);
  return document;
}

export function configureLalondeIndependent(document: GraphDocument): GraphDocument {
  configureLalondeBase(document);
  addShuffledCovariates(document, "lalonde-obs", LALONDE_DGM_COVS.map((c) => ({ ...c, sourceId: `Src_${c.id}` })));
  return document;
}

// Track B "recover the RCT": REPLAY the real observational LaLonde rows. Covariates, the real
// treatment, and the real 1978 earnings are all read from the same row via table_lookup — nothing
// is simulated, so the do-oracle is degenerate (the truth is the EXTERNAL RCT benchmark of +$1,794
// carried on lalonde-obs.trueAte). The covariate→treatment/outcome structural edges are kept for
// the DAG/identification but disabled in simulation (the real joint already encodes them).
export function configureLalondeReplay(document: GraphDocument): GraphDocument {
  configureLalondeBase(document);
  setContinuousVariable(document, "Row_source", "Uniform draw over the embedded observational LaLonde rows (shared replay index, unobserved).", "row");
  addPlasmodeCovariates(document, "Row_source", "lalonde-obs", LALONDE_DGM_COVS);
  setNode(document, "In_program", { combiner: "additive", intercept: 0, noise: ZERO_NOISE });
  setNode(document, "Earnings_78", { combiner: "additive", intercept: 0, noise: ZERO_NOISE });
  setEdgeMechanism(document, "Row_source", "In_program", "table_lookup", { dataset: "lalonde-obs", dataColumn: datasetColumnIndex("lalonde-obs", "treat") });
  setEdgeMechanism(document, "Row_source", "Earnings_78", "table_lookup", { dataset: "lalonde-obs", dataColumn: datasetColumnIndex("lalonde-obs", "re78") });
  for (const { id } of LALONDE_DGM_COVS) {
    disableEdge(document, id, "In_program");
    disableEdge(document, id, "Earnings_78");
  }
  // The outcome is the REAL re78; drop the imposed structural treatment effect so nothing is
  // simulated on top of the replay (the do-oracle is therefore degenerate and is suppressed).
  disableEdge(document, "In_program", "Earnings_78");
  return document;
}

function disableEdge(document: GraphDocument, source: string, target: string) {
  const edge = document.graph.edges.find((candidate) => candidate.source === source && candidate.target === target);
  if (!edge) return;
  const mechanism = document.simulation.edges[edge.id];
  if (mechanism) {
    document.simulation.edges[edge.id] = { ...mechanism, enabled: false };
  }
}

export function configureWhatIfNhefsWeightGainGenerative(document: GraphDocument): GraphDocument {
  return configurePlasmodeWeightGain(document, "nhefs-synthetic");
}

function configurePlasmodeWeightGain(document: GraphDocument, dataset: string): GraphDocument {
  // PLASMODE variant: the six confounders are RESAMPLED from the real NHEFS rows (true joint
  // dependence + real mixed types: binary sex, 3-category exercise, continuous age/cigs/years/
  // weight). Treatment A|L and outcome Y|A,L are simulated on top with a known true effect
  // (+3.5 kg). The confounder coefficients are recalibrated to the real covariate scales so the
  // crude (~+2.5 kg) → adjusted (~+3.5 kg) story matches the synthetic variants.
  setExampleSampleSize(document, 4000);
  setContinuousVariable(document, "Row_source", "Uniform draw over the embedded NHEFS rows (resampling index, unobserved).", "row");
  setBinaryVariable(document, "Sex", "Baseline sex (1 = female) — from NHEFS.", "female");
  setContinuousVariable(document, "Age", "Baseline age — from NHEFS.", "years");
  setContinuousVariable(document, "Smoking_intensity", "Baseline cigarettes per day — from NHEFS.", "cigarettes/day");
  setContinuousVariable(document, "Years_smoking", "Years of smoking at baseline — from NHEFS.", "years");
  setContinuousVariable(document, "Exercise", "Recreational activity (0 much, 1 some, 2 little) — from NHEFS.", "exercise level");
  setContinuousVariable(document, "Baseline_weight", "Body weight at the baseline visit — from NHEFS.", "kg");
  setBinaryVariable(document, "Quit_smoking", "Quit smoking between baseline (1971-75) and follow-up (1982).", "quit");
  setContinuousVariable(document, "Weight_gain", "Weight change (follow-up minus baseline) in kg.", "kg");

  // Resample the six confounders jointly from the dataset's real (or synthetic) rows.
  addPlasmodeCovariates(document, "Row_source", dataset, [
    { id: "Sex", column: "sex" },
    { id: "Age", column: "age" },
    { id: "Smoking_intensity", column: "smokeintensity" },
    { id: "Years_smoking", column: "smokeyrs" },
    { id: "Exercise", column: "exercise" },
    { id: "Baseline_weight", column: "wt71" }
  ]);

  // Treatment model (recalibrated for the real covariate scales; ~26% quit). Exercise is now
  // 0-2 (higher = less active), so its sign flips vs the synthetic z-score version.
  setLogitNode(document, "Quit_smoking", -2.4);
  setLinearCoefficient(document, "Age", "Quit_smoking", 0.028);
  setLinearCoefficient(document, "Sex", "Quit_smoking", -0.25);
  setLinearCoefficient(document, "Smoking_intensity", "Quit_smoking", -0.02);
  setLinearCoefficient(document, "Years_smoking", "Quit_smoking", 0.008);
  setLinearCoefficient(document, "Exercise", "Quit_smoking", -0.12);
  setLinearCoefficient(document, "Baseline_weight", "Quit_smoking", 0.006);

  // Outcome model (TRUE effect of quitting = +3.5 kg).
  setNode(document, "Weight_gain", { intercept: 9.0, noise: { kind: "normal", mean: 0, sd: 7.5 } });
  setLinearCoefficient(document, "Quit_smoking", "Weight_gain", 3.5);
  setLinearCoefficient(document, "Sex", "Weight_gain", 0.6);
  setLinearCoefficient(document, "Age", "Weight_gain", -0.13);
  setLinearCoefficient(document, "Smoking_intensity", "Weight_gain", 0.08);
  setLinearCoefficient(document, "Years_smoking", "Weight_gain", -0.03);
  setLinearCoefficient(document, "Exercise", "Weight_gain", 0.8);
  setLinearCoefficient(document, "Baseline_weight", "Weight_gain", -0.05);
  return document;
}

export function configureWhatIfNhefsMortalitySurvival(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 7000);
  setContinuousVariable(document, "Age", "Baseline age at the start of follow-up.", "years");
  setContinuousVariable(document, "Baseline_risk", "Baseline mortality risk: underlying illness and smoking-history burden. Higher means worse prognosis.", "risk z-score");
  setBinaryVariable(document, "Quit_smoking", "Smoking cessation at baseline.", "quit");
  setContinuousVariable(document, "Weight_gain_2y", "Weight change after quitting, measured before later mortality.", "kg");
  setBinaryVariable(document, "Censoring_5y", "Loss to follow-up around the 5-year visit.", "censored");
  // Five cumulative-death indicators (death by 2/4/6/8/10 years), absorbing-chained so
  // once a subject dies they stay dead. Each logit node is the conditional hazard among
  // survivors of that interval; the absorbing edges carry death forward.
  const DEATH_INTERVALS: Array<{ id: string; label: string; intercept: number }> = [
    { id: "Death_2y", label: "Cumulative death by 2 years.", intercept: -3.6 },
    { id: "Death_4y", label: "Cumulative death by 4 years (anyone dead earlier stays dead).", intercept: -3.4 },
    { id: "Death_6y", label: "Cumulative death by 6 years.", intercept: -3.2 },
    { id: "Death_8y", label: "Cumulative death by 8 years.", intercept: -3.05 },
    { id: "Death_10y", label: "Cumulative death by 10 years.", intercept: -2.95 }
  ];
  for (const death of DEATH_INTERVALS) {
    setBinaryVariable(document, death.id, death.label, "death");
  }
  setNode(document, "Age", { distribution: { kind: "normal", mean: 50, sd: 10 }, noise: ZERO_NOISE });
  setNode(document, "Baseline_risk", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Quit_smoking", 0.0);
  setNode(document, "Weight_gain_2y", { intercept: 2.2, noise: { kind: "normal", mean: 0, sd: 2.4 } });
  setLogitNode(document, "Censoring_5y", -2.9);
  for (const death of DEATH_INTERVALS) {
    setLogitNode(document, death.id, death.intercept);
    // Age -> per-interval hazard accelerates (Gompertz-like), scaled for five intervals.
    setEdgeMechanism(document, "Age", death.id, "piecewise_linear", {
      points: [
        { x: 30, y: 0.1 },
        { x: 50, y: 0.5 },
        { x: 65, y: 1.35 },
        { x: 80, y: 2.7 }
      ]
    });
    setLinearCoefficient(document, "Baseline_risk", death.id, 0.7);
    setLinearCoefficient(document, "Quit_smoking", death.id, -0.3);
  }
  // Quitting falls with age non-linearly: younger smokers quit readily, then cessation
  // tapers and flattens among older, long-established smokers. A straight age slope
  // would over-state how much the oldest still quit. (logit contributions)
  setEdgeMechanism(document, "Age", "Quit_smoking", "piecewise_linear", {
    points: [
      { x: 25, y: 0.55 },
      { x: 45, y: 0.15 },
      { x: 60, y: -0.2 },
      { x: 80, y: -0.6 }
    ]
  });
  setLinearCoefficient(document, "Age", "Censoring_5y", 0.025);
  setLinearCoefficient(document, "Baseline_risk", "Quit_smoking", -0.9);
  setLinearCoefficient(document, "Baseline_risk", "Weight_gain_2y", -0.7);
  setLinearCoefficient(document, "Baseline_risk", "Censoring_5y", 0.2);
  setLinearCoefficient(document, "Quit_smoking", "Weight_gain_2y", 4.1);
  // Mediator: post-quit weight gain modestly raises mortality in the later intervals.
  setLinearCoefficient(document, "Weight_gain_2y", "Death_6y", 0.02);
  setLinearCoefficient(document, "Weight_gain_2y", "Death_8y", 0.02);
  setLinearCoefficient(document, "Weight_gain_2y", "Death_10y", 0.02);
  // Cumulative absorbing chain: once dead, dead at every later interval.
  setEdgeMechanism(document, "Death_2y", "Death_4y", "absorbing", {});
  setEdgeMechanism(document, "Death_4y", "Death_6y", "absorbing", {});
  setEdgeMechanism(document, "Death_6y", "Death_8y", "absorbing", {});
  setEdgeMechanism(document, "Death_8y", "Death_10y", "absorbing", {});
  applyWhatIfMetadata(document, {
    chapter: "Chapter 17",
    section: "Survival analysis and target-trial follow-up",
    reference: "NHEFS smoking cessation mortality structure",
    longitudinal: {
      timePoints: [
        { id: "t0", label: "baseline", order: 0 },
        { id: "t1", label: "2 years", order: 1 },
        { id: "t2", label: "4 years", order: 2 },
        { id: "t3", label: "6 years", order: 3 },
        { id: "t4", label: "8 years", order: 4 },
        { id: "t5", label: "10 years", order: 5 }
      ],
      variables: {
        Age: { series: "age", time: "t0", role: "baseline" },
        Baseline_risk: { series: "risk", time: "t0", role: "baseline" },
        Quit_smoking: { series: "treatment", time: "t0", role: "treatment" },
        Weight_gain_2y: { series: "weight", time: "t1", role: "mediator" },
        Censoring_5y: { series: "censoring", time: "t3", role: "censoring" },
        Death_2y: { series: "death", time: "t1", role: "outcome" },
        Death_4y: { series: "death", time: "t2", role: "outcome" },
        Death_6y: { series: "death", time: "t3", role: "outcome" },
        Death_8y: { series: "death", time: "t4", role: "outcome" },
        Death_10y: { series: "death", time: "t5", role: "outcome" }
      },
      treatmentStrategies: binaryStrategies("quit", "Quit smoking", "Quit_smoking", "Set smoking cessation to 1 at baseline.", "continue", "Continue smoking", "Quit_smoking", "Set smoking cessation to 0 at baseline."),
      estimands: [riskEstimand("quit-vs-continue-mortality-risk", "quit vs continue mortality risk", "Death_10y", ["quit", "continue"], "10 years")],
      censoring: [{ id: "censoring-5y", variable: "Censoring_5y", time: "t3", description: "Loss to follow-up around year 5, before the later death indicators." }],
      survivalOutputs: [survivalSpec("mortality-survival", "mortality survival", ["Death_2y", "Death_4y", "Death_6y", "Death_8y", "Death_10y"], ["", "", "Censoring_5y", "", ""])]
    }
  });
  return document;
}

export function configureWhatIfWeightGainGEstimation(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 6000);
  setContinuousVariable(document, "Smoking_intensity", "Baseline cigarettes per day, centered and scaled.", "z-score");
  setContinuousVariable(document, "Socioeconomic", "Baseline social and behavioral context.", "z-score");
  setBinaryVariable(document, "Quit_smoking", "Smoking cessation by the start of follow-up.", "quit");
  setContinuousVariable(document, "Diet_change", "Post-quit behavior that can mediate part of the weight change.", "z-score");
  setContinuousVariable(document, "Weight_gain_8y", "Eight-year weight gain.", "kg");
  setNode(document, "Smoking_intensity", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Socioeconomic", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Quit_smoking", -0.1);
  setNode(document, "Diet_change", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.6 } });
  setNode(document, "Weight_gain_8y", { intercept: 1.4, noise: { kind: "normal", mean: 0, sd: 2.1 } });
  setLinearCoefficient(document, "Smoking_intensity", "Quit_smoking", -0.8);
  setLinearCoefficient(document, "Smoking_intensity", "Weight_gain_8y", -0.4);
  setLinearCoefficient(document, "Socioeconomic", "Quit_smoking", 0.5);
  setLinearCoefficient(document, "Socioeconomic", "Diet_change", 0.55);
  setLinearCoefficient(document, "Socioeconomic", "Weight_gain_8y", -0.55);
  setLinearCoefficient(document, "Quit_smoking", "Diet_change", 0.65);
  setLinearCoefficient(document, "Quit_smoking", "Weight_gain_8y", 4.4);
  setLinearCoefficient(document, "Diet_change", "Weight_gain_8y", 0.85);
  applyWhatIfMetadata(document, {
    chapter: "Chapter 14",
    section: "Structural nested mean models and g-estimation",
    reference: "NHEFS smoking cessation weight-gain structure",
    longitudinal: {
      timePoints: [
        { id: "t0", label: "baseline", order: 0 },
        { id: "t1", label: "follow-up", order: 1 }
      ],
      variables: {
        Smoking_intensity: { series: "smoking", time: "t0", role: "baseline" },
        Socioeconomic: { series: "context", time: "t0", role: "baseline" },
        Quit_smoking: { series: "treatment", time: "t0", role: "treatment" },
        Diet_change: { series: "behavior", time: "t1", role: "mediator" },
        Weight_gain_8y: { series: "weight", time: "t1", role: "outcome" }
      },
      treatmentStrategies: binaryStrategies("quit", "Quit smoking", "Quit_smoking", "Set Quit_smoking=1.", "continue", "Continue smoking", "Quit_smoking", "Set Quit_smoking=0."),
      estimands: [{
        id: "quit-vs-continue-weight-gain",
        label: "quit vs continue smoking",
        type: "mean_difference",
        outcome: "Weight_gain_8y",
        strategies: ["quit", "continue"],
        population: "baseline NHEFS-like simulated cohort",
        horizon: "8 years"
      }],
      censoring: [],
      survivalOutputs: []
    }
  });
  return document;
}

export function configureWhatIfHivCd4Variants(document: GraphDocument): GraphDocument {
  // HIV/ART time-varying-confounding structure, authored from node arrays so the visit count
  // is one knob (HIV_CD4_SEQUENCE_VISITS). Kept SHORT (3 visits) on purpose: a static
  // always/never contrast loses positivity geometrically in the number of visits (0.5^K), so
  // a short chain keeps both regimes well-supported and isolates the over-adjustment lesson
  // from the positivity-collapse one (the latter gets its own dedicated example; see
  // docs/plan-longitudinal-ice-positivity.md). At each visit: low CD4 prompts treatment
  // (CD4_k -> A_k, confounding), and ART's benefit flows mostly THROUGH the next CD4
  // (A_k -> CD4_{k+1}, strong; small direct A_k -> death), so CD4_{k>=1} is a confounder for
  // A_k AND a mediator of A_{k-1}. Conditioning on it (regression/AIPW) over-adjusts away the
  // mediated benefit; reweighting/standardizing forward (IPW/g-formula) recovers the truth.
  const visits = HIV_CD4_SEQUENCE_VISITS;
  const treatments = Array.from({ length: visits }, (_, k) => `A_${k}`);
  const confounders = Array.from({ length: visits }, (_, k) => `CD4_${k}`);
  setExampleSampleSize(document, 7000);
  markExposures(document, treatments);

  for (let k = 0; k < visits; k += 1) {
    setBinaryVariable(document, `CD4_${k}`, k === 0 ? "Baseline low-CD4 indicator." : `Low-CD4 indicator at visit ${k}.`, "low CD4");
    setBinaryVariable(document, `A_${k}`, k === 0 ? "Antiretroviral treatment at baseline." : `Antiretroviral treatment at visit ${k}.`, "treated");
  }
  setBinaryVariable(document, "AIDS_death", "AIDS or death endpoint.", "event");

  // CD4_0 is an exogenous Bernoulli; every later CD4 and treatment is a logit node.
  setNode(document, "CD4_0", { distribution: { kind: "bernoulli", p: 0.4 }, noise: ZERO_NOISE });
  for (let k = 0; k < visits; k += 1) {
    setLogitNode(document, `A_${k}`, -0.5);
    if (k >= 1) setLogitNode(document, `CD4_${k}`, -0.4);
  }
  setLogitNode(document, "AIDS_death", -2.2);

  for (let k = 0; k < visits; k += 1) {
    setLinearCoefficient(document, `CD4_${k}`, `A_${k}`, 1.4);        // low CD4 -> treat now
    setLinearCoefficient(document, `CD4_${k}`, "AIDS_death", 0.85);   // low CD4 harms (most of the risk)
    setLinearCoefficient(document, `A_${k}`, "AIDS_death", -0.2);     // small DIRECT ART effect...
    if (k + 1 < visits) {
      setLinearCoefficient(document, `CD4_${k}`, `CD4_${k + 1}`, 1.6); // CD4 autocorrelation
      setLinearCoefficient(document, `A_${k}`, `CD4_${k + 1}`, -2.1);  // ...most of ART's benefit is MEDIATED through CD4
      setLinearCoefficient(document, `A_${k}`, `A_${k + 1}`, 1.0);     // treatment persists
    }
  }

  const timePoints: GraphDocumentMetadata["longitudinal"]["timePoints"] = [
    ...Array.from({ length: visits }, (_, k) => ({ id: `t${k}`, label: k === 0 ? "baseline" : `visit ${k}`, order: k })),
    { id: `t${visits}`, label: "endpoint", order: visits }
  ];
  const variables: GraphDocumentMetadata["longitudinal"]["variables"] = {};
  for (let k = 0; k < visits; k += 1) {
    variables[`CD4_${k}`] = { series: "cd4", time: `t${k}`, role: k === 0 ? "baseline" : "time_varying_confounder" };
    variables[`A_${k}`] = { series: "art", time: `t${k}`, role: "treatment" };
  }
  variables["AIDS_death"] = { series: "event", time: `t${visits}`, role: "outcome" };

  applyWhatIfMetadata(document, {
    chapter: "Chapter 19",
    section: "Time-varying treatments and treatment-confounder feedback",
    reference: "HIV/CD4 time-varying treatment structure",
    longitudinal: {
      timePoints,
      variables,
      treatmentStrategies: [
        staticStrategy("always-art", "always ART", `Treat at every visit (A_0..A_${visits - 1} = 1).`, treatments.map((t) => [t, 1] as [string, number])),
        staticStrategy("never-art", "never ART", `Treat at no visit (A_0..A_${visits - 1} = 0).`, treatments.map((t) => [t, 0] as [string, number])),
        dynamicLowRiskStrategy("treat-low-cd4", "treat when CD4 is low", treatments, confounders, "Start or continue treatment whenever the current CD4 indicator is low.")
      ],
      estimands: [riskEstimand("always-vs-never-aids-death", "always vs never ART", "AIDS_death", ["always-art", "never-art"], "endpoint")],
      censoring: [],
      survivalOutputs: []
    }
  });
  return document;
}

export function configureWhatIfCensoringIpcw(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 7000);
  markExposures(document, ["A0", "A1"]);
  setContinuousVariable(document, "Baseline_risk", "Baseline prognosis before treatment and follow-up.", "risk z-score");
  setBinaryVariable(document, "A0", "Treatment decision at baseline.", "treated");
  setBinaryVariable(document, "L1", "Post-baseline risk affected by A0 and used for later decisions.", "high risk");
  setBinaryVariable(document, "C1", "Censoring after the first risk update.", "censored");
  setBinaryVariable(document, "A1", "Treatment decision at the second decision time.", "treated");
  setBinaryVariable(document, "C2", "Later censoring before outcome ascertainment.", "censored");
  setBinaryVariable(document, "Y", "End-of-follow-up endpoint.", "event");
  setNode(document, "Baseline_risk", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "A0", -0.2);
  setLogitNode(document, "L1", -0.1);
  setLogitNode(document, "C1", -2.3);
  setLogitNode(document, "A1", -0.35);
  setLogitNode(document, "C2", -2.2);
  setLogitNode(document, "Y", -2.0);
  setLinearCoefficient(document, "Baseline_risk", "A0", 0.85);
  setLinearCoefficient(document, "Baseline_risk", "L1", 1.0);
  setLinearCoefficient(document, "Baseline_risk", "C1", 0.55);
  setLinearCoefficient(document, "Baseline_risk", "C2", 0.5);
  setLinearCoefficient(document, "Baseline_risk", "Y", 0.7);
  setLinearCoefficient(document, "A0", "L1", 0.75);
  setLinearCoefficient(document, "A0", "C1", -0.2);
  setLinearCoefficient(document, "A0", "A1", 1.1);
  setLinearCoefficient(document, "A0", "Y", -0.35);
  setLinearCoefficient(document, "L1", "C1", 0.8);
  setLinearCoefficient(document, "L1", "A1", 1.25);
  setLinearCoefficient(document, "L1", "C2", 0.9);
  setLinearCoefficient(document, "L1", "Y", 1.0);
  setLinearCoefficient(document, "C1", "A1", -1.1);
  setLinearCoefficient(document, "A1", "C2", -0.25);
  setLinearCoefficient(document, "A1", "Y", -0.45);
  applyWhatIfMetadata(document, {
    chapter: "Chapter 21.5",
    section: "Censoring as a time-varying treatment",
    reference: "IPCW teaching structure",
    longitudinal: {
      timePoints: [
        { id: "t0", label: "baseline", order: 0 },
        { id: "t1", label: "visit 1", order: 1 },
        { id: "t2", label: "visit 2", order: 2 },
        { id: "t3", label: "endpoint", order: 3 }
      ],
      variables: {
        Baseline_risk: { series: "risk", time: "t0", role: "baseline" },
        A0: { series: "treatment", time: "t0", role: "treatment" },
        L1: { series: "risk", time: "t1", role: "time_varying_confounder" },
        C1: { series: "censoring", time: "t1", role: "censoring" },
        A1: { series: "treatment", time: "t2", role: "treatment" },
        C2: { series: "censoring", time: "t2", role: "censoring" },
        Y: { series: "event", time: "t3", role: "outcome" }
      },
      treatmentStrategies: [
        staticStrategy("always-treat", "always treat", "Set A0=A1=1.", [["A0", 1], ["A1", 1]]),
        staticStrategy("never-treat", "never treat", "Set A0=A1=0.", [["A0", 0], ["A1", 0]])
      ],
      estimands: [riskEstimand("always-vs-never-with-ipcw", "always treat vs never treat", "Y", ["always-treat", "never-treat"], "endpoint")],
      censoring: [
        { id: "censoring-c1", variable: "C1", time: "t1", description: "Censoring after first follow-up." },
        { id: "censoring-c2", variable: "C2", time: "t2", description: "Censoring before outcome." }
      ],
      survivalOutputs: []
    }
  });
  return document;
}

export function configureWhatIfDynamicGFormula(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 7000);
  markExposures(document, ["A0", "A1", "A2"]);
  setBinaryVariable(document, "Risk_0", "Baseline high-risk indicator.", "high risk");
  setBinaryVariable(document, "A0", "Action at baseline.", "treated");
  setBinaryVariable(document, "Risk_1", "Updated high-risk indicator after A0.", "high risk");
  setBinaryVariable(document, "A1", "Action at the first follow-up.", "treated");
  setBinaryVariable(document, "Risk_2", "Updated high-risk indicator after A1.", "high risk");
  setBinaryVariable(document, "A2", "Action at the second follow-up.", "treated");
  setBinaryVariable(document, "Y", "End-of-follow-up event.", "event");
  setNode(document, "Risk_0", { distribution: { kind: "bernoulli", p: 0.42 }, noise: ZERO_NOISE });
  setLogitNode(document, "A0", -0.35);
  setLogitNode(document, "Risk_1", -0.2);
  setLogitNode(document, "A1", -0.4);
  setLogitNode(document, "Risk_2", -0.25);
  setLogitNode(document, "A2", -0.45);
  setLogitNode(document, "Y", -2.15);
  setLinearCoefficient(document, "Risk_0", "A0", 1.1);
  setLinearCoefficient(document, "Risk_0", "Risk_1", 1.2);
  setLinearCoefficient(document, "Risk_0", "Y", 0.55);
  setLinearCoefficient(document, "A0", "Risk_1", 0.55);
  setLinearCoefficient(document, "A0", "A1", 0.9);
  setLinearCoefficient(document, "A0", "Y", -0.25);
  setLinearCoefficient(document, "Risk_1", "A1", 1.2);
  setLinearCoefficient(document, "Risk_1", "Risk_2", 1.2);
  setLinearCoefficient(document, "Risk_1", "Y", 0.75);
  setLinearCoefficient(document, "A1", "Risk_2", 0.45);
  setLinearCoefficient(document, "A1", "A2", 0.9);
  setLinearCoefficient(document, "A1", "Y", -0.35);
  setLinearCoefficient(document, "Risk_2", "A2", 1.3);
  setLinearCoefficient(document, "Risk_2", "Y", 0.9);
  setLinearCoefficient(document, "A2", "Y", -0.45);
  applyWhatIfMetadata(document, {
    chapter: "Chapter 21",
    section: "The parametric g-formula for dynamic strategies",
    reference: "Dynamic threshold strategy teaching structure",
    longitudinal: {
      timePoints: [
        { id: "t0", label: "baseline", order: 0 },
        { id: "t1", label: "visit 1", order: 1 },
        { id: "t2", label: "visit 2", order: 2 },
        { id: "t3", label: "endpoint", order: 3 }
      ],
      variables: {
        Risk_0: { series: "risk", time: "t0", role: "baseline" },
        A0: { series: "action", time: "t0", role: "treatment" },
        Risk_1: { series: "risk", time: "t1", role: "time_varying_confounder" },
        A1: { series: "action", time: "t1", role: "treatment" },
        Risk_2: { series: "risk", time: "t2", role: "time_varying_confounder" },
        A2: { series: "action", time: "t2", role: "treatment" },
        Y: { series: "event", time: "t3", role: "outcome" }
      },
      treatmentStrategies: [
        dynamicLowRiskStrategy("treat-when-high-risk", "treat when risk is high", ["A0", "A1", "A2"], ["Risk_0", "Risk_1", "Risk_2"], "Set treatment to 1 whenever the current risk indicator is high."),
        staticStrategy("never-treat", "never treat", "Set all actions to 0.", [["A0", 0], ["A1", 0], ["A2", 0]]),
        staticStrategy("always-treat", "always treat", "Set all actions to 1.", [["A0", 1], ["A1", 1], ["A2", 1]])
      ],
      estimands: [riskEstimand("dynamic-vs-never-risk", "dynamic strategy vs never treat", "Y", ["treat-when-high-risk", "never-treat"], "endpoint")],
      censoring: [],
      survivalOutputs: []
    }
  });
  return document;
}

export function configureWhatIfSnaftSurvival(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 6000);
  setContinuousVariable(document, "Baseline_risk", "Baseline prognosis before treatment and visit scheduling.", "risk z-score");
  setBinaryVariable(document, "Treatment_start", "Treatment initiation at baseline.", "treated");
  setContinuousVariable(document, "Failure_time", "Latent failure time under the observed treatment regime.", "months");
  setContinuousVariable(document, "Visit_schedule", "Follow-up intensity and administrative visit timing.", "visit index");
  setBinaryVariable(document, "Censoring", "Censoring before complete failure-time observation.", "censored");
  setBinaryVariable(document, "Observed_death", "Observed death indicator by the study horizon.", "death");
  setNode(document, "Baseline_risk", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Treatment_start", -0.15);
  setNode(document, "Failure_time", { intercept: 24, noise: { kind: "normal", mean: 0, sd: 3.5 } });
  setNode(document, "Visit_schedule", { intercept: 3, noise: { kind: "normal", mean: 0, sd: 0.8 } });
  setLogitNode(document, "Censoring", -2.15);
  setLogitNode(document, "Observed_death", -4.6);
  setLinearCoefficient(document, "Baseline_risk", "Treatment_start", 0.85);
  setLinearCoefficient(document, "Baseline_risk", "Failure_time", -4.5);
  setLinearCoefficient(document, "Baseline_risk", "Visit_schedule", 0.45);
  setLinearCoefficient(document, "Baseline_risk", "Censoring", 0.6);
  setLinearCoefficient(document, "Baseline_risk", "Observed_death", 1.1);
  setLinearCoefficient(document, "Treatment_start", "Failure_time", 3.8);
  setLinearCoefficient(document, "Treatment_start", "Censoring", -0.25);
  setLinearCoefficient(document, "Failure_time", "Observed_death", -0.16);
  setLinearCoefficient(document, "Visit_schedule", "Censoring", -0.55);
  applyWhatIfMetadata(document, {
    chapter: "Chapter 17.6",
    section: "Structural nested accelerated failure time models",
    reference: "Survival-time g-estimation teaching structure",
    longitudinal: {
      timePoints: [
        { id: "t0", label: "baseline", order: 0 },
        { id: "t1", label: "follow-up", order: 1 }
      ],
      variables: {
        Baseline_risk: { series: "risk", time: "t0", role: "baseline" },
        Treatment_start: { series: "treatment", time: "t0", role: "treatment" },
        Failure_time: { series: "survival_time", time: "t1", role: "outcome" },
        Visit_schedule: { series: "visit", time: "t1", role: "other" },
        Censoring: { series: "censoring", time: "t1", role: "censoring" },
        Observed_death: { series: "death", time: "t1", role: "outcome" }
      },
      treatmentStrategies: binaryStrategies("treat", "start treatment", "Treatment_start", "Set Treatment_start=1.", "untreat", "no treatment start", "Treatment_start", "Set Treatment_start=0."),
      estimands: [{
        id: "survival-time-contrast",
        label: "treated vs untreated failure time",
        type: "mean_difference",
        outcome: "Failure_time",
        strategies: ["treat", "untreat"],
        population: "baseline simulated cohort",
        horizon: "study follow-up"
      }],
      censoring: [{ id: "censoring", variable: "Censoring", time: "t1", description: "Administrative or informative censoring before full failure-time observation." }],
      survivalOutputs: [survivalSpec("observed-death-survival", "observed death survival", ["Observed_death"], ["Censoring"])]
    }
  });
  return document;
}

export function configurePolicyEventStudy(document: GraphDocument): GraphDocument {
  setContinuousVariable(document, "Region_baseline", "Stable region-level baseline differences before policy adoption.", "baseline index");
  setContinuousVariable(document, "Pre_trend", "Pre-period outcome trend used for parallel-trends and placebo checks.", "trend");
  setContinuousVariable(document, "Political_pressure", "Pressure that can influence both adoption timing and outcomes.", "pressure");
  setBinaryVariable(document, "Policy_adoption", "Policy exposure or treatment timing.", "adopted");
  setContinuousVariable(document, "Donor_pool_quality", "How comparable the synthetic-control donor pool is for this treated unit.", "fit score");
  setContinuousVariable(document, "Placebo_pre_outcome", "Pre-period placebo endpoint that should not move because of later adoption.", "placebo");
  setContinuousVariable(document, "Post_outcome", "Post-period outcome used in DiD, event-study, or synthetic-control designs.", "outcome");
  setNode(document, "Region_baseline", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Pre_trend", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.35 } });
  setNode(document, "Political_pressure", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Policy_adoption", -0.25);
  setNode(document, "Donor_pool_quality", { distribution: { kind: "normal", mean: 0.7, sd: 0.25 }, noise: ZERO_NOISE });
  setNode(document, "Placebo_pre_outcome", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.5 } });
  setNode(document, "Post_outcome", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.7 } });
  setLinearCoefficient(document, "Region_baseline", "Pre_trend", 0.7);
  setLinearCoefficient(document, "Region_baseline", "Policy_adoption", 0.7);
  setLinearCoefficient(document, "Region_baseline", "Post_outcome", 0.8);
  setLinearCoefficient(document, "Pre_trend", "Policy_adoption", 0.9);
  setLinearCoefficient(document, "Pre_trend", "Placebo_pre_outcome", 1.0);
  setLinearCoefficient(document, "Pre_trend", "Post_outcome", 1.1);
  setLinearCoefficient(document, "Political_pressure", "Policy_adoption", 0.8);
  setLinearCoefficient(document, "Political_pressure", "Post_outcome", 0.5);
  setLinearCoefficient(document, "Policy_adoption", "Post_outcome", -0.6);
  setLinearCoefficient(document, "Donor_pool_quality", "Post_outcome", -0.25);
  return document;
}

export function configureIncrementalityUplift(document: GraphDocument): GraphDocument {
  setBinaryVariable(document, "Random_holdout", "Random holdout or encouragement that creates clean variation in exposure.", "held out");
  setContinuousVariable(document, "User_intent", "Baseline purchase intent that confounds exposure and conversion.", "intent");
  setContinuousVariable(document, "Geo_market", "Market-level demand and media environment used in geolift designs.", "market index");
  setContinuousVariable(document, "Uplift_segment", "Effect modifier used for CATE or uplift targeting.", "segment score");
  setBinaryVariable(document, "Campaign_exposure", "Marketing or product treatment whose incrementality is being estimated.", "exposed");
  setBinaryVariable(document, "Feature_use", "Post-treatment behavior that mediates some of the effect.", "used");
  setContinuousVariable(document, "Network_spillover", "Latent interference from peers or markets outside the assigned unit.", "spillover", ["latent"]);
  setBinaryVariable(document, "Conversion", "Primary conversion or revenue event.", "converted");
  setContinuousVariable(document, "Guardrail_latency", "Guardrail metric that may be harmed by the treatment.", "ms");
  setNode(document, "Random_holdout", { distribution: { kind: "bernoulli", p: 0.5 }, noise: ZERO_NOISE });
  setNode(document, "User_intent", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Geo_market", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Uplift_segment", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Campaign_exposure", -0.1);
  setLogitNode(document, "Feature_use", -0.5);
  setNode(document, "Network_spillover", { distribution: { kind: "normal", mean: 0, sd: 0.7 }, noise: ZERO_NOISE });
  setLogitNode(document, "Conversion", -1.2);
  setNode(document, "Guardrail_latency", { intercept: 180, noise: { kind: "normal", mean: 0, sd: 20 } });
  setLinearCoefficient(document, "Random_holdout", "Campaign_exposure", -2.3);
  setLinearCoefficient(document, "User_intent", "Campaign_exposure", 1.1);
  setLinearCoefficient(document, "User_intent", "Conversion", 1.2);
  setLinearCoefficient(document, "Geo_market", "Campaign_exposure", 0.7);
  setLinearCoefficient(document, "Geo_market", "Conversion", 0.5);
  setLinearCoefficient(document, "Uplift_segment", "Campaign_exposure", 0.4);
  setLinearCoefficient(document, "Uplift_segment", "Conversion", 0.6);
  setLinearCoefficient(document, "Campaign_exposure", "Feature_use", 1.5);
  setLinearCoefficient(document, "Campaign_exposure", "Conversion", 0.55);
  setLinearCoefficient(document, "Campaign_exposure", "Guardrail_latency", 18);
  setLinearCoefficient(document, "Feature_use", "Conversion", 0.65);
  setLinearCoefficient(document, "Network_spillover", "Conversion", 0.35);
  return document;
}

export function configureCausalMlRefutation(document: GraphDocument): GraphDocument {
  setContinuousVariable(document, "Observed_context", "Measured context variables used for adjustment or nuisance models.", "context");
  setContinuousVariable(document, "Effect_modifier", "Feature set where heterogeneous treatment effects may vary.", "modifier");
  setContinuousVariable(document, "Latent_need", "Unmeasured need or severity that leaves residual confounding.", "need", ["latent"]);
  setContinuousVariable(document, "Proxy_signal", "Proxy feature that helps but does not fully measure latent need.", "proxy");
  setBinaryVariable(document, "Treatment", "Treatment or decision whose effect is estimated with ML-assisted methods.", "treated");
  setContinuousVariable(document, "Model_score", "Prediction score or policy score that can be audited as a downstream artifact.", "score");
  setContinuousVariable(document, "Outcome", "Outcome for ATE, CATE, or policy evaluation.", "outcome");
  setNode(document, "Observed_context", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Effect_modifier", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Latent_need", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Proxy_signal", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.45 } });
  setLogitNode(document, "Treatment", -0.25);
  setNode(document, "Model_score", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.3 } });
  setNode(document, "Outcome", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.8 } });
  setLinearCoefficient(document, "Observed_context", "Treatment", 0.8);
  setLinearCoefficient(document, "Observed_context", "Outcome", 0.9);
  setLinearCoefficient(document, "Effect_modifier", "Treatment", 0.35);
  setLinearCoefficient(document, "Effect_modifier", "Outcome", 0.7);
  setLinearCoefficient(document, "Latent_need", "Proxy_signal", 1.2);
  setLinearCoefficient(document, "Latent_need", "Treatment", 0.7);
  setLinearCoefficient(document, "Latent_need", "Outcome", 0.9);
  setLinearCoefficient(document, "Proxy_signal", "Treatment", 0.6);
  setLinearCoefficient(document, "Treatment", "Outcome", 0.8);
  setLinearCoefficient(document, "Treatment", "Model_score", 0.5);
  setLinearCoefficient(document, "Effect_modifier", "Model_score", 0.7);
  return document;
}

export function configureOtaGeneProgramTraits(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 3000);
  setContinuousVariable(document, "K562_context", "Cell-state and cell-type context that makes K562 a plausible erythroid model while also limiting external generalization.", "context z");
  setBinaryVariable(document, "CRISPRi_knockdown", "Experimental Perturb-seq knockdown used to perturb one regulator gene at a time.", "knockdown");
  setBinaryVariable(document, "Natural_LoF", "Naturally occurring loss-of-function dosage used in UK Biobank burden tests.", "LoF carrier");
  setContinuousVariable(document, "GWAS_variants", "Polygenic common-variant signal for the blood traits.", "variant score");
  setContinuousVariable(document, "Gene_constraint_Shet", "Gene constraint score S_het. The paper accounts for this when comparing program genes and burden effects.", "S_het");
  setContinuousVariable(document, "Regulator_activity", "Activity or expression of the perturbed regulator gene after CRISPRi or natural loss of function.", "activity");
  setContinuousVariable(document, "Autophagy_program", "cNMF-like autophagy transcriptional program selected through regulator-burden evidence for MCH.", "program score");
  setContinuousVariable(document, "Heme_synthesis_program", "Hemoglobin synthesis program, a core erythroid pathway for MCH and the RDW mitochondrial-program relation.", "program score");
  setContinuousVariable(document, "G2M_cell_cycle_program", "G2/M phase cell-cycle program selected in the MCH regulator model.", "program score");
  setContinuousVariable(document, "Other_cell_cycle_programs", "Additional cell-cycle programs selected through program-gene burden effects.", "program score");
  setContinuousVariable(document, "Mitochondrial_program", "Mitochondrial program; the paper reports a directional hemoglobin-synthesis-to-mitochondrial program relation for RDW.", "program score");
  setContinuousVariable(document, "Erythroid_cell_state", "Downstream erythroid cellular state summarizing the program layer before trait interpretation.", "state");
  setContinuousVariable(document, "MCH_trait", "Mean corpuscular hemoglobin trait effect in the paper's erythroid model.", "trait z");
  setContinuousVariable(document, "RDW_trait", "Red cell distribution width trait effect in the paper's erythroid model.", "trait z");
  setContinuousVariable(document, "IRF_trait", "Immature reticulocyte fraction trait effect in the paper's erythroid model.", "trait z");
  setContinuousVariable(document, "Perturb_seq_beta", "Estimated Perturb-seq regulatory effect beta_x->P from regulator knockdown to program activity.", "effect estimate");
  setContinuousVariable(document, "Program_gene_content", "Top-loading cNMF program genes used for program burden tests.", "gene-set score");
  setContinuousVariable(document, "LoF_burden_gamma", "Gene-level LoF burden effect gamma, estimated from UK Biobank and improved with GeneBayes shrinkage.", "gamma");
  setContinuousVariable(document, "GWAS_trait_signal", "Common-variant GWAS association evidence for the same blood traits.", "association");
  setContinuousVariable(document, "Program_burden_effect", "Average burden effect among top-loading program genes after accounting for gene constraint.", "effect");
  setContinuousVariable(document, "Regulator_burden_correlation", "Correlation between regulator effects on programs and gene-level LoF trait effects.", "correlation");
  setContinuousVariable(document, "Trans_eQTL_validation", "External validation using trans-eQTL effects on program genes among trait-associated variants.", "validation score");
  setContinuousVariable(document, "Stepwise_program_model", "Selected multi-program regression model linking regulators and program content to trait effects.", "model score");
  setContinuousVariable(document, "Permutation_CV_fit", "Permutation and leave-one-out cross-validation evidence for directional concordance.", "fit score");
  setContinuousVariable(document, "Concordant_gene_map", "Final gene-to-program-to-trait map containing concordant high-effect genes and paths.", "map score");

  setNode(document, "K562_context", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "CRISPRi_knockdown", { distribution: { kind: "bernoulli", p: 0.5 }, noise: ZERO_NOISE });
  setNode(document, "Natural_LoF", { distribution: { kind: "bernoulli", p: 0.08 }, noise: ZERO_NOISE });
  setNode(document, "GWAS_variants", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Gene_constraint_Shet", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Regulator_activity", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.55 } });
  setNode(document, "Autophagy_program", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.55 } });
  setNode(document, "Heme_synthesis_program", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.5 } });
  setNode(document, "G2M_cell_cycle_program", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.55 } });
  setNode(document, "Other_cell_cycle_programs", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.6 } });
  setNode(document, "Mitochondrial_program", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.55 } });
  setNode(document, "Erythroid_cell_state", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.55 } });
  setNode(document, "MCH_trait", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.7 } });
  setNode(document, "RDW_trait", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.7 } });
  setNode(document, "IRF_trait", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.75 } });
  setNode(document, "Perturb_seq_beta", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.45 } });
  setNode(document, "Program_gene_content", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.45 } });
  setNode(document, "LoF_burden_gamma", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.55 } });
  setNode(document, "GWAS_trait_signal", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.55 } });
  setNode(document, "Program_burden_effect", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.45 } });
  setNode(document, "Regulator_burden_correlation", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.45 } });
  setNode(document, "Trans_eQTL_validation", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.5 } });
  setNode(document, "Stepwise_program_model", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.4 } });
  setNode(document, "Permutation_CV_fit", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.45 } });
  setNode(document, "Concordant_gene_map", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.45 } });

  setLinearCoefficient(document, "K562_context", "Regulator_activity", 0.4);
  setLinearCoefficient(document, "K562_context", "Autophagy_program", 0.35);
  setLinearCoefficient(document, "K562_context", "Heme_synthesis_program", 0.55);
  setLinearCoefficient(document, "K562_context", "G2M_cell_cycle_program", 0.35);
  setLinearCoefficient(document, "K562_context", "Other_cell_cycle_programs", 0.3);
  setLinearCoefficient(document, "K562_context", "Mitochondrial_program", 0.35);
  setLinearCoefficient(document, "CRISPRi_knockdown", "Regulator_activity", -1.2);
  setLinearCoefficient(document, "Natural_LoF", "Regulator_activity", -0.75);
  setLinearCoefficient(document, "Regulator_activity", "Autophagy_program", -0.45);
  setLinearCoefficient(document, "Regulator_activity", "Heme_synthesis_program", 0.85);
  setLinearCoefficient(document, "Regulator_activity", "G2M_cell_cycle_program", 0.65);
  setLinearCoefficient(document, "Regulator_activity", "Other_cell_cycle_programs", 0.5);
  setLinearCoefficient(document, "Regulator_activity", "Mitochondrial_program", 0.25);
  setLinearCoefficient(document, "Heme_synthesis_program", "Mitochondrial_program", 0.55);
  setLinearCoefficient(document, "Autophagy_program", "Erythroid_cell_state", 0.25);
  setLinearCoefficient(document, "Heme_synthesis_program", "Erythroid_cell_state", 0.85);
  setLinearCoefficient(document, "G2M_cell_cycle_program", "Erythroid_cell_state", -0.25);
  setLinearCoefficient(document, "Other_cell_cycle_programs", "Erythroid_cell_state", -0.2);
  setLinearCoefficient(document, "Mitochondrial_program", "Erythroid_cell_state", 0.35);
  setLinearCoefficient(document, "Erythroid_cell_state", "MCH_trait", 0.65);
  setLinearCoefficient(document, "Erythroid_cell_state", "RDW_trait", -0.3);
  setLinearCoefficient(document, "Erythroid_cell_state", "IRF_trait", 0.4);
  setLinearCoefficient(document, "Heme_synthesis_program", "MCH_trait", 0.85);
  setLinearCoefficient(document, "Mitochondrial_program", "RDW_trait", 0.75);
  setLinearCoefficient(document, "G2M_cell_cycle_program", "IRF_trait", 0.55);
  setLinearCoefficient(document, "Regulator_activity", "Perturb_seq_beta", 0.45);
  setLinearCoefficient(document, "Autophagy_program", "Perturb_seq_beta", -0.25);
  setLinearCoefficient(document, "Heme_synthesis_program", "Perturb_seq_beta", 0.5);
  setLinearCoefficient(document, "G2M_cell_cycle_program", "Perturb_seq_beta", 0.35);
  setLinearCoefficient(document, "Other_cell_cycle_programs", "Perturb_seq_beta", 0.25);
  setLinearCoefficient(document, "Mitochondrial_program", "Perturb_seq_beta", 0.25);
  setLinearCoefficient(document, "Autophagy_program", "Program_gene_content", 0.3);
  setLinearCoefficient(document, "Heme_synthesis_program", "Program_gene_content", 0.65);
  setLinearCoefficient(document, "G2M_cell_cycle_program", "Program_gene_content", 0.45);
  setLinearCoefficient(document, "Other_cell_cycle_programs", "Program_gene_content", 0.5);
  setLinearCoefficient(document, "Mitochondrial_program", "Program_gene_content", 0.35);
  setLinearCoefficient(document, "Natural_LoF", "LoF_burden_gamma", 0.35);
  setLinearCoefficient(document, "MCH_trait", "LoF_burden_gamma", 0.45);
  setLinearCoefficient(document, "RDW_trait", "LoF_burden_gamma", 0.4);
  setLinearCoefficient(document, "IRF_trait", "LoF_burden_gamma", 0.25);
  setLinearCoefficient(document, "Gene_constraint_Shet", "LoF_burden_gamma", 0.25);
  setLinearCoefficient(document, "GWAS_variants", "GWAS_trait_signal", 0.75);
  setLinearCoefficient(document, "MCH_trait", "GWAS_trait_signal", 0.35);
  setLinearCoefficient(document, "RDW_trait", "GWAS_trait_signal", 0.3);
  setLinearCoefficient(document, "IRF_trait", "GWAS_trait_signal", 0.25);
  setLinearCoefficient(document, "Program_gene_content", "Program_burden_effect", 0.65);
  setLinearCoefficient(document, "LoF_burden_gamma", "Program_burden_effect", 0.75);
  setLinearCoefficient(document, "Gene_constraint_Shet", "Program_burden_effect", 0.2);
  setLinearCoefficient(document, "Perturb_seq_beta", "Regulator_burden_correlation", 0.8);
  setLinearCoefficient(document, "LoF_burden_gamma", "Regulator_burden_correlation", 0.55);
  setLinearCoefficient(document, "Gene_constraint_Shet", "Regulator_burden_correlation", 0.2);
  setLinearCoefficient(document, "GWAS_trait_signal", "Trans_eQTL_validation", 0.55);
  setLinearCoefficient(document, "Program_gene_content", "Trans_eQTL_validation", 0.45);
  setLinearCoefficient(document, "Program_burden_effect", "Stepwise_program_model", 0.75);
  setLinearCoefficient(document, "Regulator_burden_correlation", "Stepwise_program_model", 0.8);
  setLinearCoefficient(document, "Gene_constraint_Shet", "Stepwise_program_model", 0.15);
  setLinearCoefficient(document, "Stepwise_program_model", "Permutation_CV_fit", 0.75);
  setLinearCoefficient(document, "LoF_burden_gamma", "Permutation_CV_fit", 0.25);
  setLinearCoefficient(document, "Stepwise_program_model", "Concordant_gene_map", 0.85);
  setLinearCoefficient(document, "LoF_burden_gamma", "Concordant_gene_map", 0.3);
  return document;
}

export function configureOpsRootCause(document: GraphDocument): GraphDocument {
  setBinaryVariable(document, "Deployment", "Release or configuration change suspected of shifting a mechanism.", "deployed");
  setContinuousVariable(document, "Traffic_mix", "Incoming workload mix that affects queues and latency.", "traffic index");
  setContinuousVariable(document, "Upstream_latency", "Latency inherited from an upstream dependency.", "ms");
  setContinuousVariable(document, "Cache_hit_rate", "Cache hit rate or service efficiency mechanism.", "rate");
  setContinuousVariable(document, "Queue_depth", "Queueing pressure inside the service.", "jobs");
  setContinuousVariable(document, "Service_latency", "Target metric whose distribution changed.", "ms");
  setBinaryVariable(document, "Incident_alert", "Alerting or incident declaration threshold.", "alert");
  setNode(document, "Deployment", { distribution: { kind: "bernoulli", p: 0.35 }, noise: ZERO_NOISE });
  setNode(document, "Traffic_mix", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Upstream_latency", { distribution: { kind: "normal", mean: 80, sd: 12 }, noise: ZERO_NOISE });
  setNode(document, "Cache_hit_rate", { intercept: 0.7, noise: { kind: "normal", mean: 0, sd: 0.08 } });
  setNode(document, "Queue_depth", { intercept: 30, noise: { kind: "normal", mean: 0, sd: 6 } });
  setNode(document, "Service_latency", { intercept: 110, noise: { kind: "normal", mean: 0, sd: 12 } });
  setLogitNode(document, "Incident_alert", -7);
  setLinearCoefficient(document, "Deployment", "Cache_hit_rate", -0.12);
  setLinearCoefficient(document, "Deployment", "Service_latency", 16);
  setLinearCoefficient(document, "Traffic_mix", "Cache_hit_rate", -0.08);
  setLinearCoefficient(document, "Traffic_mix", "Queue_depth", 12);
  setLinearCoefficient(document, "Traffic_mix", "Service_latency", 10);
  setLinearCoefficient(document, "Upstream_latency", "Service_latency", 0.55);
  setLinearCoefficient(document, "Cache_hit_rate", "Service_latency", -60);
  setLinearCoefficient(document, "Queue_depth", "Service_latency", 0.8);
  setLinearCoefficient(document, "Service_latency", "Incident_alert", 0.05);
  return document;
}

export function configureEducationMediation(document: GraphDocument): GraphDocument {
  setContinuousVariable(document, "Family_background", "Family and socioeconomic background affecting program take-up and outcomes.", "background");
  setContinuousVariable(document, "Latent_ability", "Latent student ability or preparation measured imperfectly by surveys and tests.", "ability", ["latent"]);
  setContinuousVariable(document, "Classroom_context", "Teacher, classroom, or school-level context.", "context");
  setBinaryVariable(document, "Program", "Educational or behavioral intervention.", "treated");
  setContinuousVariable(document, "Engagement", "Mediator affected by the program and predictive of learning.", "engagement");
  setContinuousVariable(document, "Survey_response", "Noisy self-report or survey response proxy.", "score", ["proxy"], { kind: "noisy_proxy", errorSd: 0.4 });
  setBinaryVariable(document, "Attrition", "Attrition or missing outcome process.", "attrited");
  setContinuousVariable(document, "Test_score", "Outcome assessment, potentially affected by mediation and latent ability.", "score");
  setNode(document, "Family_background", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setNode(document, "Latent_ability", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.7 } });
  setNode(document, "Classroom_context", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Program", -0.2);
  setNode(document, "Engagement", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.5 } });
  setNode(document, "Survey_response", { intercept: 0, noise: { kind: "normal", mean: 0, sd: 0.4 } });
  setLogitNode(document, "Attrition", -2.0);
  setNode(document, "Test_score", { intercept: 70, noise: { kind: "normal", mean: 0, sd: 5 } });
  setLinearCoefficient(document, "Family_background", "Program", 0.7);
  setLinearCoefficient(document, "Family_background", "Latent_ability", 0.7);
  setLinearCoefficient(document, "Family_background", "Test_score", 3);
  setLinearCoefficient(document, "Latent_ability", "Program", 0.5);
  setLinearCoefficient(document, "Latent_ability", "Survey_response", 1.0);
  setLinearCoefficient(document, "Latent_ability", "Test_score", 6);
  setLinearCoefficient(document, "Classroom_context", "Program", 0.4);
  setLinearCoefficient(document, "Classroom_context", "Engagement", 0.7);
  setLinearCoefficient(document, "Classroom_context", "Test_score", 4);
  setLinearCoefficient(document, "Program", "Engagement", 0.9);
  setLinearCoefficient(document, "Program", "Test_score", 2.5);
  setLinearCoefficient(document, "Engagement", "Test_score", 4);
  setLinearCoefficient(document, "Survey_response", "Attrition", -0.5);
  setLinearCoefficient(document, "Test_score", "Attrition", -0.04);
  return document;
}

export function configureChessIntelligencePractice(document: GraphDocument): GraphDocument {
  setContinuousVariable(document, "Age", "Child age at testing. Bilalic et al. (2007) sample mean 10.7 years (SD 1.2).", "years");
  setBinaryVariable(document, "Gender", "Gender indicator (1=boy). Sample was 77% boys; boys practiced more and rated higher.", "boy");
  setContinuousVariable(document, "Experience_years", "Years of tournament chess experience. Sample mean 4.3 (SD 1.8).", "years");
  setContinuousVariable(document, "Intelligence", "WISC-III composite IQ. Sample mean 121.6 (SD 16.7); above population norms because the study recruited from chess clubs.", "IQ");
  setContinuousVariable(document, "Practice_hours", "Cumulative deliberate chess practice in hours. Paper log10-transformed (M=2.1, SD=0.6 in log10 hours); modeled here on the raw scale with a wide normal stand-in. Effect on Elo is saturating.", "hours");
  setContinuousVariable(document, "Chess_Elo", "Elo-like chess skill rating. Average rated player ~1500 (SD 200); paper's elite subsample averaged 1603 (range 1390-1835).", "Elo");
  setBinaryVariable(document, "Elite_sample", "Indicator for being in the tournament-active elite subsample. Selection is on Elo above ~1400.", "selected");

  setNode(document, "Age", { distribution: { kind: "normal", mean: 10.7, sd: 1.2 }, noise: ZERO_NOISE });
  setNode(document, "Gender", { distribution: { kind: "bernoulli", p: 0.77 }, noise: ZERO_NOISE });
  setNode(document, "Intelligence", { distribution: { kind: "normal", mean: 121, sd: 15 }, noise: ZERO_NOISE });
  setNode(document, "Experience_years", { intercept: -5.4, noise: { kind: "normal", mean: 0, sd: 1.0 } });
  setNode(document, "Practice_hours", { intercept: -2900, noise: { kind: "normal", mean: 0, sd: 400 } });
  setNode(document, "Chess_Elo", { intercept: 700, noise: { kind: "normal", mean: 0, sd: 90 } });
  setLogitNode(document, "Elite_sample", -4.5);

  setLinearCoefficient(document, "Age", "Experience_years", 0.95);
  setLinearCoefficient(document, "Age", "Practice_hours", 130);
  setLinearCoefficient(document, "Age", "Chess_Elo", 8);
  setLinearCoefficient(document, "Gender", "Practice_hours", 250);
  setLinearCoefficient(document, "Gender", "Chess_Elo", 50);
  setLinearCoefficient(document, "Intelligence", "Practice_hours", 22);
  setLinearCoefficient(document, "Intelligence", "Chess_Elo", 3.2);
  setLinearCoefficient(document, "Experience_years", "Practice_hours", 200);
  setEdgeMechanism(document, "Experience_years", "Chess_Elo", "saturating", {
    scale: 80,
    midpoint: 3.5,
    steepness: 0.6
  });
  setEdgeMechanism(document, "Practice_hours", "Chess_Elo", "hill_emax", {
    baseline: 0,
    maxEffect: 500,
    ec50: 800,
    exponent: 1.5
  });
  setEdgeMechanism(document, "Chess_Elo", "Elite_sample", "smooth_threshold", {
    threshold: 1650,
    scale: 9,
    steepness: 0.04
  });
  setSelection(document, "Elite_sample", {
    operator: "one_of",
    value: 1,
    values: [1],
    sampling: "rejection"
  });
  return document;
}

export function configureChessIntelligenceSimpleFlip(document: GraphDocument): GraphDocument {
  setContinuousVariable(document, "Intelligence", "WISC-III-like composite IQ. In the full player population it helps rating directly and also predicts somewhat more practice.", "IQ");
  setContinuousVariable(document, "Practice_hours", "Cumulative chess practice on the paper's log10-hours scale. Practice is the dominant driver of rating.", "log10 hours");
  setContinuousVariable(document, "Chess_Elo", "Elo-like chess rating / skill. Practice dominates; intelligence has a smaller positive contribution.", "Elo");
  setBinaryVariable(document, "Elite_sample", "Rated/elite analysis sample. This is a selected collider: children can enter through high IQ, high practice, or both.", "selected");

  setNode(document, "Intelligence", { distribution: { kind: "normal", mean: 121, sd: 15 }, noise: ZERO_NOISE });
  setNode(document, "Practice_hours", { intercept: -0.078, noise: { kind: "normal", mean: 0, sd: 0.58 } });
  setNode(document, "Chess_Elo", { intercept: 650, noise: { kind: "normal", mean: 0, sd: 100 } });
  setLogitNode(document, "Elite_sample", -78.4);

  setLinearCoefficient(document, "Intelligence", "Practice_hours", 0.018);
  setLinearCoefficient(document, "Intelligence", "Chess_Elo", 0.6);
  setLinearCoefficient(document, "Practice_hours", "Chess_Elo", 430);
  // Elite/rated status is modeled as a compensatory threshold on standardized
  // IQ plus standardized practice: either route can get a child into the sample.
  setLinearCoefficient(document, "Intelligence", "Elite_sample", 0.4);
  setLinearCoefficient(document, "Practice_hours", "Elite_sample", 10);
  setSelection(document, "Elite_sample", {
    operator: "one_of",
    value: 1,
    values: [1],
    sampling: "rejection"
  });
  return document;
}

export function configureGaltonExample(document: GraphDocument): GraphDocument {
  const next = prepareDocument(document, 7);
  next.graph.nodes = next.graph.nodes.map((node) => {
    const variable = normalizeVariableModel(node.variable);
    if (node.id === "Father_height") {
      return {
        ...node,
        variable: {
          ...variable,
          description: "Observed adult father height in inches. In this model it is not a direct cause of son height; it is a noisy readout of shared latent height causes, especially the shared genetic component, plus father-specific residual causes.",
          valueType: "continuous" as const,
          unit: "in",
          tags: ["observed", "height", "normal"]
        }
      };
    }
    if (node.id === "Son_height") {
      return {
        ...node,
        variable: {
          ...variable,
          description: "Observed adult son height in inches. Its expectation regresses toward the population mean because only part of an unusually tall or short father's latent height causes are shared with the son.",
          valueType: "continuous" as const,
          unit: "in",
          tags: ["observed", "height", "normal"]
        }
      };
    }
    if (node.id === "G_shared") {
      return {
        ...node,
        variable: {
          ...variable,
          description: "Latent standardized height factor shared by father and son. It represents inherited causes that make both heights move together, not a measured DNA variable.",
          valueType: "continuous" as const,
          unit: "sd",
          tags: ["latent", "genetic", "shared", "standard-normal"]
        }
      };
    }
    if (node.id === "G_son_other") {
      return {
        ...node,
        variable: {
          ...variable,
          description: "Latent standardized son-specific inherited factor. It bundles maternal inheritance and Mendelian reshuffling that affect the son's height but are not observed through the father's height.",
          valueType: "continuous" as const,
          unit: "sd",
          tags: ["latent", "genetic", "son-specific", "standard-normal"]
        }
      };
    }
    if (node.id === "E_father") {
      return {
        ...node,
        variable: {
          ...variable,
          description: "Father-specific residual height factor. Residual means the modeled remainder: nutrition, childhood environment, measurement noise, developmental randomness, and genetic details not represented by the shared factor.",
          valueType: "continuous" as const,
          unit: "sd",
          tags: ["latent", "residual", "father-specific", "standard-normal"]
        }
      };
    }
    if (node.id === "E_son") {
      return {
        ...node,
        variable: {
          ...variable,
          description: "Son-specific residual height factor. It captures the modeled remainder after shared genetics and other inherited son factors: environment, growth history, measurement noise, and developmental randomness.",
          valueType: "continuous" as const,
          unit: "sd",
          tags: ["latent", "residual", "son-specific", "standard-normal"]
        }
      };
    }
    return {
      ...node,
      variable: {
        ...variable,
        description: "Latent standardized height component.",
        valueType: "continuous" as const,
        unit: "sd",
        tags: ["latent", "standard-normal"]
      }
    };
  });
  const root = normalizeNodeMechanism({ distribution: UNIT_NORMAL, intercept: 0, noise: ZERO_NOISE });
  for (const id of ["G_shared", "G_son_other", "E_father", "E_son"]) {
    next.simulation.nodes[id] = root;
  }
  next.simulation.nodes.Father_height = normalizeNodeMechanism({ intercept: 69, noise: ZERO_NOISE });
  next.simulation.nodes.Son_height = normalizeNodeMechanism({ intercept: 69, noise: ZERO_NOISE });
  setLinearCoefficient(next, "G_shared", "Father_height", 2.24);
  setLinearCoefficient(next, "E_father", "Father_height", 1.68);
  setLinearCoefficient(next, "G_shared", "Son_height", 1.26);
  setLinearCoefficient(next, "G_son_other", "Son_height", 1.26);
  setLinearCoefficient(next, "E_son", "Son_height", 2.16);
  return next;
}
