import { parseModel } from "../parser";
import { analyzeGraph } from "../analysis";
import { datasetColumnIndex, datasetRows } from "../datasets";
import { defaultEdgeMechanism, normalizeGraphDocumentMetadata, normalizeNodeMechanism, normalizeSelectionCondition, normalizeVariableModel } from "../graph";
import type { EdgeMechanismKind, GraphDocument, GraphDocumentMetadata, GraphEdge, GraphModel, GraphNode, NodeDistribution, NodeInteraction, NodeMechanism, Point, SimulationSelectionCondition, VariableModel } from "../types";
import { HIV_CD4_SEQUENCE_VISITS, UNIT_NORMAL, ZERO_NOISE, addCopulaCovariates, addPlasmodeCovariates, applyWhatIfMetadata, binaryStrategies, dynamicLowRiskStrategy, exampleSeed, layoutExampleDocument, markExposures, prepareDocument, riskEstimand, setBinaryVariable, setContinuousVariable, setEdgeMechanism, setExampleSampleSize, setLinearCoefficient, setLogitNode, setNode, setSelection, setSmoothGate, setVariable, staticStrategy, survivalSpec } from "./builders";
import { configureBerksonHospital, configureBirthweightParadox, configureCaseControlSelection, configureCategoricalRegimen, configureCatsHighriseSyndrome, configureCausalMlRefutation, configureChessIntelligencePractice, configureChessIntelligenceSimpleFlip, configureCollegeEarnings, configureConfounderJointCopula, configureConfounderTripleCopula, configureContinuousDoseResponse, configureEducationMediation, configureErVisitsCount, configureEffectModificationCrossover, configureEffectModificationOrdinal, configureEpistasisCoatColor, configureFlexibleAdjustment, configureFrontDoorSmoking, configureGaltonExample, configureIcuMortalityTriage, configureIncrementalityUplift, configureInstrumentalEncouragement, configureJohnSnowCholera, configureLalondeGenerative, configureLalondeIndependent, configureLalondePlasmode, configureLalondeReplay, configureLordsParadox, configureMBiasAdjustment, configureMeasurementErrorLatent, configureMediationDirectTotal, configureModeratedMediation, configureObesityParadox, configureOpsRootCause, configureOtaGeneProgramTraits, configurePolicingEncounters, configurePolicyEventStudy, configurePositivityCorrelatedConfounders, configureRestaurantCollider, configureSimpsonSeverity, configureTargetTrialFollowup, configureTutoringScores, configureWhatIfCensoringIpcw, configureWhatIfDynamicGFormula, configureWhatIfHazardSelection, configureWhatIfHivCd4Variants, configureWhatIfIpwPseudopopulation, configureWhatIfNhefsMortalitySurvival, configureWhatIfNhefsWeightGain, configureWhatIfNhefsWeightGainConfounderDag, configureWhatIfNhefsWeightGainCopula, configureWhatIfNhefsWeightGainGenerative, configureWhatIfNhefsWeightGainPlasmode, configureWhatIfNhefsWeightGainPositivity, configureWhatIfSnaftSurvival, configureWhatIfTreatmentFeedback, configureWhatIfWeightGainGEstimation } from "./configurators";

export const EXAMPLE_DOMAINS = [
  { id: "classic", label: "Classic DAG patterns", description: "Compact examples for teaching and fast bias checks." },
  { id: "epidemiology", label: "Epidemiology / public health", description: "Target trial thinking, censoring, measurement, selection, and negative controls." },
  { id: "econometrics", label: "Econometrics / public policy", description: "IV, DiD, RD, synthetic control, panel timing, placebos, and exclusion restrictions." },
  { id: "product", label: "Product / experimentation / marketing", description: "A/B tests, incrementality, geolift, uplift, guardrails, and spillovers." },
  { id: "ml", label: "ML / data science", description: "Assumption declaration, graph refutation, discovery hypotheses, and treatment heterogeneity." },
  { id: "operations", label: "Operations / reliability / supply chain", description: "Root-cause analysis, mechanism shifts, and distribution-change attribution." },
  { id: "social", label: "Social science / education / psychology", description: "Mediation, latent constructs, surveys, attrition, and multilevel designs." },
  { id: "dgm", label: "Simulation design / DGMs", description: "How synthetic data is generated: independent vs correlated (copula), real (plasmode), and learned (generative) joints — same causal truth, different data." },
  { id: "disambiguation", label: "Term disambiguation", description: "Telling apart the things people conflate: moderation (a node acting on an edge), mediation (a chain through a variable), and interaction — ordinal vs disordinal (crossover)." },
  { id: "genetics", label: "Genetics", description: "The causal structure of genetic data: gene–gene interaction (epistasis), genotype as instrument (Mendelian randomization), and confounding by ancestry." }
] as const;

export type ExampleDomain = typeof EXAMPLE_DOMAINS[number]["id"];

export interface ExampleModel {
  id: string;
  title: string;
  domain: ExampleDomain;
  summary: string;
  outputModule?: string;
  code: string;
}

export interface ExampleDenouementSection {
  title: string;
  items: string[];
  defaultOpen?: boolean;
}

export interface ExampleDenouement {
  module: string;
  punchline: string;
  estimand: string;
  primaryOutput: string;
  validity: string;
  nextAction: string;
  sections: ExampleDenouementSection[];
}

const NHEFS_MORTALITY_CODE = `dag {
  Age [adjusted,pos="-2.6,3.6"]
  Baseline_risk [adjusted,label="baseline mortality risk",pos="-1.0,3.6"]
  Quit_smoking [exposure,label="quit smoking",pos="-1.9,2.3"]
  Weight_gain_2y [label="2-year weight gain",pos="0.3,1.5"]
  Censoring_5y [selected,label="censoring by 5y",pos="1.8,0.1"]
  Death_2y [label="death by 2y",pos="-1.7,0.7"]
  Death_4y [label="death by 4y",pos="-1.25,-0.4"]
  Death_6y [label="death by 6y",pos="-0.75,-1.3"]
  Death_8y [label="death by 8y",pos="-0.2,-2.1"]
  Death_10y [outcome,label="death by 10y",pos="0.45,-2.95"]
  Age -> Quit_smoking
  Age -> Censoring_5y
  Age -> Death_2y
  Age -> Death_4y
  Age -> Death_6y
  Age -> Death_8y
  Age -> Death_10y
  Baseline_risk -> Quit_smoking
  Baseline_risk -> Weight_gain_2y
  Baseline_risk -> Censoring_5y
  Baseline_risk -> Death_2y
  Baseline_risk -> Death_4y
  Baseline_risk -> Death_6y
  Baseline_risk -> Death_8y
  Baseline_risk -> Death_10y
  Quit_smoking -> Weight_gain_2y
  Quit_smoking -> Death_2y
  Quit_smoking -> Death_4y
  Quit_smoking -> Death_6y
  Quit_smoking -> Death_8y
  Quit_smoking -> Death_10y
  Weight_gain_2y -> Death_6y
  Weight_gain_2y -> Death_8y
  Weight_gain_2y -> Death_10y
  Death_2y -> Death_4y
  Death_4y -> Death_6y
  Death_6y -> Death_8y
  Death_8y -> Death_10y
}`;

// Array-generated longitudinal DAG: `visits` paired CD4-confounder / ART-treatment nodes
// in two columns down the canvas, plus a terminal AIDS/death node. The classic
// treatment-confounder-feedback structure (CD4_k -> A_k -> CD4_{k+1} -> A_{k+1} ...),
// authored from a node array so the visit count is a single knob.
function buildHivCd4SequenceCode(visits: number): string {
  const top = 3.6;
  const step = 1.15;
  const lines: string[] = ["dag {"];
  for (let k = 0; k < visits; k += 1) {
    const y = (top - k * step).toFixed(2);
    const ay = (top - 0.55 - k * step).toFixed(2);
    const cd4Tag = "adjusted";
    const aTag = k === 0 ? "exposure" : "";
    lines.push(`  CD4_${k} [${cd4Tag},label="low CD4 (t${k})",pos="-1.1,${y}"]`);
    lines.push(`  A_${k} [${aTag ? aTag + "," : ""}label="ART (t${k})",pos="0.95,${ay}"]`);
  }
  const deathY = (top - 0.4 - visits * step).toFixed(2);
  lines.push(`  AIDS_death [outcome,label="AIDS / death",pos="-0.1,${deathY}"]`);
  for (let k = 0; k < visits; k += 1) {
    lines.push(`  CD4_${k} -> A_${k}`);
    lines.push(`  CD4_${k} -> AIDS_death`);
    lines.push(`  A_${k} -> AIDS_death`);
    if (k + 1 < visits) {
      lines.push(`  CD4_${k} -> CD4_${k + 1}`);
      lines.push(`  A_${k} -> CD4_${k + 1}`);
      lines.push(`  A_${k} -> A_${k + 1}`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}

export const EXAMPLES: ExampleModel[] = [
  {
    id: "tutoring-scores",
    title: "Does tutoring hurt test scores (unadjusted)",
    domain: "classic",
    summary: "Three-node sign-flip example to fix: struggling students get tutoring, score lower in raw data, and the user should adjust for academic need.",
    outputModule: "tutoring-scores",
    code: `dag {
  Academic_need [label="academic need",pos="-1.15,0.9"]
  Tutoring [exposure,pos="-0.15,0"]
  Test_score [outcome,label="test score",pos="1.15,0"]
  Academic_need -> Tutoring
  Academic_need -> Test_score
  Tutoring -> Test_score
}`
  },
  {
    id: "flexible-adjustment",
    title: "How flexible should your adjustment be?",
    domain: "ml",
    summary: "A continuous confounder enters the outcome non-linearly. Linear outcome regression stays biased; raising the covariate basis (quadratic, cubic) removes it — bias-variance as one flexibility dial. Nonparametric methods are flexible already.",
    code: `dag {
  Risk_score [adjusted,label="risk score",pos="-1.15,1.2"]
  Treatment [exposure,pos="-0.15,0"]
  Outcome [outcome,pos="1.15,0"]
  Risk_score -> Treatment
  Risk_score -> Outcome
  Treatment -> Outcome
}`
  },
  {
    id: "simpson-severity",
    title: "Simpson's paradox: treatment by severity",
    domain: "classic",
    summary: "Fast explanation of confounding and why unadjusted group comparisons can reverse.",
    outputModule: "simpson-severity",
    code: `dag {
  Severity [pos="-1.15,1.1"]
  Treatment [exposure,pos="-0.15,0"]
  Recovery [outcome,pos="1.15,0"]
  Severity -> Treatment
  Severity -> Recovery
  Treatment -> Recovery
}`
  },
  {
    id: "effect-modification-crossover",
    title: "Effect modification: a crossover (disordinal) interaction",
    domain: "disambiguation",
    summary: "A moderator that flips the sign of the treatment effect — helps in one regime, hurts in the other. The regime acts upon the treatment→outcome edge (not the nodes).",
    outputModule: "effect-modification",
    code: `dag {
  Regime [pos="0.5,-1.15"]
  Treatment [exposure,pos="-0.15,0"]
  Outcome [outcome,pos="1.15,0"]
  Treatment -> Outcome
}`
  },
  {
    id: "effect-modification-ordinal",
    title: "Effect modification: an ordinal interaction (same sign, different size)",
    domain: "disambiguation",
    summary: "The contrast to the crossover: the regime changes how MUCH treatment helps, but not the sign. Still moderation — but the marginal effect is not misleading about direction.",
    outputModule: "effect-modification",
    code: `dag {
  Regime [pos="0.5,-1.15"]
  Treatment [exposure,pos="-0.15,0"]
  Outcome [outcome,pos="1.15,0"]
  Treatment -> Outcome
}`
  },
  {
    id: "moderated-mediation",
    title: "Moderated mediation: a moderator on the mediator's edge",
    domain: "disambiguation",
    summary: "Treatment moves a single behavior (the mediator); the regime decides whether more of that behavior helps or hurts — so the regime acts on the mediator→outcome edge, not the treatment→outcome edge. The cleanest generator of a crossover.",
    outputModule: "effect-modification",
    code: `dag {
  Regime [pos="0.75,-1.15"]
  Treatment [exposure,pos="-0.6,0"]
  Behavior [pos="0.5,0"]
  Outcome [outcome,pos="1.6,0"]
  Treatment -> Behavior
  Behavior -> Outcome
}`
  },
  {
    id: "john-snow-cholera",
    title: "John Snow's cholera study: the first instrument",
    domain: "econometrics",
    summary: "London, 1854: the water company (as-if random) instruments contaminated water for cholera.",
    outputModule: "instrument",
    code: `dag {
  Company [instrument,label="water company",pos="-1.5,-0.15"]
  Sanitation [latent,label="sanitation/poverty",pos="0.6,-1.25"]
  Contamination [exposure,label="contaminated water",pos="-0.2,0"]
  Cholera_death [outcome,label="cholera death",pos="1.5,0"]
  Company -> Contamination
  Sanitation -> Contamination
  Sanitation -> Cholera_death
  Contamination -> Cholera_death
}`
  },
  {
    id: "epistasis-coat-color",
    title: "Epistasis: one gene masks another (Labrador coat colour)",
    domain: "genetics",
    summary: "The pigment (B) locus only colours the coat when the extension (E) locus is functional — ee dogs are yellow regardless of B. Gene–gene interaction: E moderates B's effect.",
    outputModule: "effect-modification",
    code: `dag {
  E_locus [label="MC1R (extension)",pos="0.5,-1.25"]
  B_locus [exposure,label="TYRP1 (pigment B)",pos="-0.2,0"]
  Coat_darkness [outcome,label="coat darkness",pos="1.2,0"]
  B_locus -> Coat_darkness
  E_locus -> Coat_darkness
}`
  },
  {
    id: "icu-mortality-triage",
    title: "Does the ICU make patients die?",
    domain: "classic",
    summary: "Treatment-like ICU admission, Gaussian illness severity, binary mortality, and a Gaussian triage-score collider.",
    outputModule: "icu-mortality-triage",
    code: `dag {
  Severity [adjusted,label="baseline severity",pos="-2,0.75"]
  ICU_admission [exposure,label="ICU admission",pos="-0.25,0"]
  Death [outcome,pos="2,0"]
  Triage_score [label="triage score",pos="-0.15,1.45"]
  Severity -> ICU_admission
  Severity -> Death
  ICU_admission -> Death
  Severity -> Triage_score
  ICU_admission -> Triage_score
}`
  },
  {
    id: "college-earnings",
    title: "Does college raise earnings?",
    domain: "classic",
    summary: "Three-node wage-premium example: continuous family log income, binary college attendance, and continuous earnings.",
    outputModule: "college-earnings",
    code: `dag {
  Family_log_income [adjusted,label="family log income",pos="-2,0.9"]
  College [exposure,pos="-0.25,0"]
  Earnings [outcome,pos="2,0"]
  Family_log_income -> College
  Family_log_income -> Earnings
  College -> Earnings
}`
  },
  {
    id: "front-door-smoking",
    title: "Smoking, tar, cancer: front door",
    domain: "classic",
    summary: "Mediation-style front-door pattern with latent confounding between exposure and outcome.",
    outputModule: "front-door-smoking",
    code: `dag {
  Genetic_risk [latent,label="genetic risk",pos="-2,1.15"]
  Smoking [exposure,pos="-1,0"]
  Tar [adjusted,pos="0.55,0"]
  Cancer [outcome,pos="2,0"]
  Genetic_risk -> Smoking
  Genetic_risk -> Cancer
  Smoking -> Tar
  Tar -> Cancer
}`
  },
  {
    id: "berkson-hospital",
    title: "Berkson hospital collider",
    domain: "classic",
    summary: "Selection on a common effect creates an association between otherwise independent causes.",
    code: `dag {
  Disease_A [exposure,label="disease A",pos="-1.7,0"]
  Disease_B [outcome,label="disease B",pos="1.7,0"]
  Hospitalized [selected,adjusted,pos="0,1.25"]
  Disease_A -> Hospitalized
  Disease_B -> Hospitalized
}`
  },
  {
    id: "restaurant-collider",
    title: "Collider: great food, bad service",
    domain: "classic",
    summary: "Food and service are independent across all restaurants — yet among the places worth visiting they trade off. The correlation is manufactured by selection, not by any real tradeoff.",
    code: `dag {
  Food_quality [exposure,label="food quality",pos="-1.7,0"]
  Service_quality [outcome,label="service quality",pos="1.7,0"]
  Worth_visiting [selected,label="worth visiting",pos="0,1.3"]
  Food_quality -> Worth_visiting
  Service_quality -> Worth_visiting
}`
  },
  {
    id: "positivity-correlated-confounders",
    title: "Positivity: two strongly correlated confounders",
    domain: "classic",
    summary: "One treatment, one outcome, and two confounders that are almost the same variable (correlation ≈ 0.9 via a shared driver). Adjusting still identifies the +1 effect, but the near-collinear confounders push treatment probabilities toward 0/1, so overlap collapses and IPW/matching get shaky — open Σ (DGP) / Overlap to watch it. The confounder correlation is tunable.",
    code: `dag {
  Shared [latent,label="shared driver",pos="-0.5,-2.4"]
  Confounder_A [adjusted,label="confounder A",pos="-1.6,-1.1"]
  Confounder_B [adjusted,label="confounder B",pos="0.6,-1.1"]
  Treatment [exposure,label="treatment",pos="-1.0,0.2"]
  Outcome [outcome,label="outcome",pos="1.4,1.3"]
  Shared -> Confounder_A
  Shared -> Confounder_B
  Confounder_A -> Treatment
  Confounder_A -> Outcome
  Confounder_B -> Treatment
  Confounder_B -> Outcome
  Treatment -> Outcome
}`
  },
  {
    id: "continuous-dose-response",
    title: "Continuous treatment: a confounded dose–response",
    domain: "classic",
    summary: "A CONTINUOUS treatment (drug dose), not a 0/1 switch. Sicker patients get more dose and recover worse, so the crude dose–recovery slope looks negative (\"more drug, worse outcome\") — but do(dose) actually helps. Plot recovery by dose; adjusting for severity, or intervening, flips the slope positive. The continuous analogue of Simpson's.",
    code: `dag {
  Severity [adjusted,label="baseline severity",pos="-0.5,-1.5"]
  Dose [exposure,label="drug dose (mg)",pos="-1.3,0.0"]
  Recovery [outcome,label="recovery score",pos="1.3,0.8"]
  Severity -> Dose
  Severity -> Recovery
  Dose -> Recovery
}`
  },
  {
    id: "er-visits-count",
    title: "Count outcome: a care program and ER visits",
    domain: "classic",
    summary: "The outcome is a COUNT — ER visits over a year, drawn Poisson — not binary or continuous. Sicker patients enroll in the care program more AND visit the ER more, so the crude program–visits comparison is confounded (enrollees look no better). Adjust for illness, or intervene, and the program's true benefit appears: it cuts visits ~40%. A Poisson response family end to end.",
    code: `dag {
  Illness [adjusted,label="baseline illness",pos="-0.5,-1.5"]
  Program [exposure,label="care program",pos="-1.3,0.0"]
  Visits [outcome,label="ER visits (count)",pos="1.3,0.8"]
  Illness -> Program
  Illness -> Visits
  Program -> Visits
}`
  },
  {
    id: "confounder-joint-copula",
    title: "The confounder joint: couple the covariates",
    domain: "classic",
    summary: "Two independent baseline confounders drive a continuous dose and the outcome. Open Σ (DGP) → Confounder joint and drag the copula τ to couple them: positive coupling concentrates the confounding (crude estimate drifts, overlap strains); the g-computation / oracle do()-effect stays +0.8. The joint is a knob orthogonal to the truth — the whole point of controlling joints.",
    code: `dag {
  Severity_A [adjusted,label="severity A",pos="-1.6,-1.4"]
  Severity_B [adjusted,label="severity B",pos="0.4,-1.6"]
  Dose [exposure,label="drug dose (mg)",pos="-1.3,0.2"]
  Recovery [outcome,label="recovery score",pos="1.3,0.9"]
  Severity_A -> Dose
  Severity_B -> Dose
  Severity_A -> Recovery
  Severity_B -> Recovery
  Dose -> Recovery
}`
  },
  {
    id: "confounder-triple-copula",
    title: "The confounder joint: three coupled covariates",
    domain: "classic",
    summary: "Three baseline confounders drive a continuous dose and the outcome. With THREE covariates the vine gains a conditional (Tree-2) edge — so in Σ (DGP) → Confounder joint you can not only couple the covariates but MODERATE the coupling (make one pair's dependence vary with the third: a non-simplified vine), and the trivariate 3D view lights up. Adjust the joint however you like; the g-computation / oracle do()-effect holds at +0.8.",
    code: `dag {
  Age [adjusted,label="age (z)",pos="-2.0,-1.5"]
  Severity [adjusted,label="severity (z)",pos="-0.2,-1.7"]
  Comorbidity [adjusted,label="comorbidity (z)",pos="1.6,-1.5"]
  Dose [exposure,label="drug dose (mg)",pos="-1.3,0.4"]
  Recovery [outcome,label="recovery score",pos="1.4,1.0"]
  Age -> Dose
  Severity -> Dose
  Comorbidity -> Dose
  Age -> Recovery
  Severity -> Recovery
  Comorbidity -> Recovery
  Dose -> Recovery
}`
  },
  {
    id: "categorical-regimen",
    title: "Categorical treatment: three drug regimens",
    domain: "classic",
    summary: "The treatment is one of three UNORDERED regimens (A/B/C), not a dose or a 0/1 switch. Sicker patients are steered to the later regimens AND recover worse, so the crude per-regimen means are confounded. The output is a multi-arm table — each regimen's do()-effect standardized over severity, contrasted against A — where g-computation and the oracle agree while the crude column misleads.",
    code: `dag {
  Severity [adjusted,label="baseline severity",pos="-0.5,-1.5"]
  Regimen [exposure,label="drug regimen",pos="-1.3,0.0"]
  Recovery [outcome,label="recovery score",pos="1.3,0.8"]
  Severity -> Regimen
  Severity -> Recovery
  Regimen -> Recovery
}`
  },
  {
    id: "birthweight-paradox",
    title: "Birthweight paradox",
    domain: "classic",
    summary: "Collider-style adjustment and latent frailty in a public-health example.",
    outputModule: "birthweight-paradox",
    code: `dag {
  Smoking [exposure,pos="-2,0.35"]
  Frailty [latent,pos="0,1.3"]
  Birthweight [selected,pos="0,0"]
  Infant_mortality [outcome,label="infant mortality",pos="2,0"]
  Smoking -> Birthweight
  Smoking -> Infant_mortality
  Frailty -> Birthweight
  Frailty -> Infant_mortality
  Birthweight -> Infant_mortality
}`
  },
  {
    id: "obesity-paradox",
    title: "Obesity paradox: selected disease sample",
    domain: "classic",
    summary: "Obesity raises disease and mortality risk in the population, but can look protective after conditioning on having disease.",
    outputModule: "obesity-paradox",
    code: `dag {
  Obesity [exposure,pos="-2,0.35"]
  Frailty [latent,pos="0,1.25"]
  Chronic_disease [selected,label="chronic disease",pos="0,0"]
  Mortality [outcome,pos="2,0"]
  Obesity -> Chronic_disease
  Obesity -> Mortality
  Frailty -> Chronic_disease
  Frailty -> Mortality
  Chronic_disease -> Mortality
}`
  },
  {
    id: "cats-highrise-syndrome",
    title: "Falling-cats paradox: the vet-sample collider",
    domain: "classic",
    summary: "The urban legend that cats survive long falls better than short ones. Fall height and injury both decide whether a cat is ever carried into the clinic, so the recorded sample is a collider: among vet-treated cats, higher falls look less injured and more survivable even though dropping a cat from higher always harms it.",
    outputModule: "cats-highrise-syndrome",
    code: `dag {
  Fall_height [exposure,label="fall height (stories)",pos="-2,0.4"]
  Injury_severity [adjusted,label="injury severity",pos="0,1.2"]
  Survival [outcome,pos="1.4,0"]
  Brought_to_vet [selected,label="brought to vet",pos="2.6,-0.9"]
  Fall_height -> Injury_severity
  Injury_severity -> Survival
  Injury_severity -> Brought_to_vet
  Survival -> Brought_to_vet
}`
  },
  {
    id: "instrumental-encouragement",
    title: "Instrumental variable: encouragement design",
    domain: "classic",
    summary: "Randomized encouragement (as-if random) instruments treatment uptake, which latent health confounds with the outcome — 2SLS recovers the effect adjustment can't.",
    outputModule: "instrument",
    code: `dag {
  Encouragement [instrument,pos="-2,0"]
  Treatment [exposure,pos="0,0"]
  Outcome [outcome,pos="2,0"]
  Unobserved_health [latent,label="unobserved health",pos="0,1.25"]
  Encouragement -> Treatment
  Treatment -> Outcome
  Unobserved_health -> Treatment
  Unobserved_health -> Outcome
}`
  },
  {
    id: "mediation-direct-total",
    title: "Mediation: direct and total effect",
    domain: "classic",
    summary: "Direct and mediated pathways for separating total and direct effects.",
    code: `dag {
  Treatment [exposure,pos="-2,0"]
  Biomarker [pos="0,0.9"]
  Outcome [outcome,pos="2,0"]
  Treatment -> Biomarker
  Biomarker -> Outcome
  Treatment -> Outcome
}`
  },
  {
    id: "measurement-error-latent",
    title: "Measurement error: latent ability",
    domain: "classic",
    summary: "Latent construct with noisy proxy measurement and confounded exposure.",
    code: `dag {
  Family_background [adjusted,label="family background",pos="-2,1.05"]
  True_ability [latent,label="true ability",pos="0,1.1"]
  Education [exposure,pos="-1,0"]
  Test_score [adjusted,label="test score",pos="1,1.05"]
  Earnings [outcome,pos="2,0"]
  Family_background -> True_ability
  Family_background -> Education
  Family_background -> Earnings
  True_ability -> Test_score
  True_ability -> Earnings
  Education -> Earnings
}`
  },
  {
    id: "case-control-selection",
    title: "Case-control sampling selection",
    domain: "classic",
    summary: "Selection into the sample through the outcome in a case-control style setup.",
    code: `dag {
  Risk_factor [adjusted,label="risk factor",pos="-1.5,1.15"]
  Exposure [exposure,pos="-1,0"]
  Disease [outcome,pos="1,0"]
  Sampled [selected,pos="2.25,-0.7"]
  Risk_factor -> Exposure
  Risk_factor -> Disease
  Exposure -> Disease
  Disease -> Sampled
}`
  },
  {
    id: "policing-encounters",
    title: "Policing encounters: selected data",
    domain: "classic",
    summary: "Encounter-only data can reverse a group comparison because police contact is itself selected by surveillance intensity and incident risk.",
    outputModule: "policing-encounters",
    code: `dag {
  Group_A [exposure,label="group A",pos="-2.5,0.25"]
  Incident_risk [latent,label="incident risk",pos="-0.8,1.2"]
  Police_contact [selected,label="police contact",pos="-0.25,0"]
  Use_of_force [outcome,label="use of force",pos="2,0"]
  Group_A -> Police_contact
  Group_A -> Use_of_force
  Incident_risk -> Police_contact
  Incident_risk -> Use_of_force
  Police_contact -> Use_of_force
}`
  },
  {
    id: "m-bias-adjustment",
    title: "M-bias: adjustment can create bias",
    domain: "classic",
    summary: "A pre-treatment collider can make an unrelated exposure and outcome look associated after adjustment.",
    outputModule: "m-bias-adjustment",
    code: `dag {
  Cause_of_exposure [latent,label="cause of exposure",pos="-2.3,1.1"]
  Cause_of_outcome [latent,label="cause of outcome",pos="1.0,1.1"]
  Exposure [exposure,pos="-2.0,0"]
  Collider_score [adjusted,label="collider score",pos="-0.45,0.2"]
  Outcome [outcome,pos="1.7,0"]
  Cause_of_exposure -> Exposure
  Cause_of_exposure -> Collider_score
  Cause_of_outcome -> Collider_score
  Cause_of_outcome -> Outcome
}`
  },
  {
    id: "lords-paradox",
    title: "Lord's paradox: did the new method help?",
    domain: "classic",
    summary: "Two classes take the same test before and after a term; the new-method class started ahead. The change-score (gain) and the pretest-adjusted (ANCOVA) comparison disagree because of regression to the mean — two estimands, not two answers.",
    code: `dag {
  Pretest [adjusted,label="pretest score",pos="-2,0.9"]
  Teaching_method [exposure,label="teaching method",pos="-0.25,0"]
  Posttest [outcome,label="posttest score",pos="1.8,0"]
  Pretest -> Posttest
  Pretest -> Teaching_method
  Teaching_method -> Posttest
}`
  },
  {
    id: "target-trial-followup",
    title: "Target trial: treatment start and follow-up",
    domain: "epidemiology",
    summary: "Eligibility, time zero, treatment strategy, censoring, measurement, selection, and a negative-control outcome.",
    code: `dag {
  Eligibility [selected,label="eligible cohort",pos="-2.527,3.058"]
  Baseline_severity [adjusted,label="baseline severity",pos="-1.167,2.569"]
  Treatment_start [exposure,label="treatment start",pos="-2.139,1.1"]
  Adherence [label="adherence",pos="-1.136,-0.507"]
  Censoring [selected,label="loss to follow-up",pos="0.931,1.624"]
  Outcome_90d [outcome,label="90-day outcome",pos="-0.103,0.425"]
  Negative_control [label="negative control outcome",pos="0.728,3.131"]
  Eligibility -> Treatment_start
  Baseline_severity -> Treatment_start
  Baseline_severity -> Censoring
  Baseline_severity -> Outcome_90d
  Baseline_severity -> Negative_control
  Treatment_start -> Adherence
  Treatment_start -> Outcome_90d
  Adherence -> Outcome_90d
}`
  },
  {
    id: "what-if-treatment-feedback",
    title: "What If: treatment-confounder feedback",
    domain: "epidemiology",
    summary: "A time-varying covariate is affected by earlier treatment and also helps determine later treatment and outcome; g-methods target strategy contrasts.",
    outputModule: "what-if-treatment-feedback",
    code: `dag {
  Baseline_risk [adjusted,label="baseline risk",pos="-1.8,2.1"]
  A0 [exposure,label="treatment A0",pos="-2.25,0.95"]
  L1 [adjusted,label="risk L1",pos="-0.35,0.1"]
  A1 [exposure,label="treatment A1",pos="1.25,-0.75"]
  Y [outcome,label="event Y",pos="2.2,-1.75"]
  Baseline_risk -> L1
  Baseline_risk -> Y
  A0 -> L1
  A0 -> A1
  A0 -> Y
  L1 -> A1
  L1 -> Y
  A1 -> Y
}`
  },
  {
    id: "what-if-ipw-pseudopopulation",
    title: "What If: pseudo-population weighting",
    domain: "epidemiology",
    summary: "Single-time treatment example for standardization and inverse-probability weighting as two views of the same target contrast.",
    outputModule: "what-if-ipw-pseudopopulation",
    code: `dag {
  Baseline_C [adjusted,label="baseline C",pos="-1.5,2.5"]
  Treatment_A [exposure,label="treatment A",pos="-0.4,0.9"]
  Outcome_Y [outcome,label="outcome Y",pos="1.1,-0.9"]
  Baseline_C -> Treatment_A
  Baseline_C -> Outcome_Y
  Treatment_A -> Outcome_Y
}`
  },
  {
    id: "what-if-hazard-selection",
    title: "What If: hazard ratios and survivor selection",
    domain: "epidemiology",
    summary: "Survival example where conditioning on remaining alive can make interval-specific hazards diverge from cumulative risk.",
    outputModule: "what-if-hazard-selection",
    code: `dag {
  Frailty [adjusted,label="baseline frailty",pos="-1.8,2.6"]
  Treatment_A [exposure,label="treatment A",pos="0.1,1.3"]
  Death_1 [label="early death",pos="-0.65,0.05"]
  Alive_1 [adjusted,label="alive at t1",pos="0.55,-1.15"]
  Death_2 [outcome,label="later death",pos="1.55,-2.45"]
  Frailty -> Treatment_A
  Frailty -> Death_1
  Frailty -> Death_2
  Treatment_A -> Death_1
  Treatment_A -> Death_2
  Death_1 -> Death_2
  Death_1 -> Alive_1
}`
  },
  {
    id: "what-if-nhefs-mortality-survival",
    title: "What If: NHEFS smoking cessation and mortality",
    domain: "epidemiology",
    summary: "Target-trial survival sketch for smoking cessation, follow-up death indicators, weight change, and censoring.",
    outputModule: "what-if-nhefs-mortality-survival",
    code: NHEFS_MORTALITY_CODE
  },
  {
    id: "what-if-weight-gain-g-estimation",
    title: "What If: smoking cessation and weight-gain g-estimation",
    domain: "epidemiology",
    summary: "Time-fixed structural nested mean model sketch for quitting smoking and eight-year weight gain.",
    outputModule: "what-if-weight-gain-g-estimation",
    code: `dag {
  Smoking_intensity [adjusted,label="baseline cigarettes/day",pos="-2.3,2.6"]
  Socioeconomic [adjusted,label="socioeconomic baseline",pos="-0.4,2.6"]
  Quit_smoking [exposure,label="quit smoking",pos="-1.3,1.05"]
  Diet_change [label="post-quit diet change",pos="0.3,-0.35"]
  Weight_gain_8y [outcome,label="8-year weight gain",pos="-0.35,-1.9"]
  Smoking_intensity -> Quit_smoking
  Smoking_intensity -> Weight_gain_8y
  Socioeconomic -> Quit_smoking
  Socioeconomic -> Diet_change
  Socioeconomic -> Weight_gain_8y
  Quit_smoking -> Diet_change
  Quit_smoking -> Weight_gain_8y
  Diet_change -> Weight_gain_8y
}`
  },
  {
    id: "what-if-nhefs-weight-gain",
    title: "Smoking cessation → weight gain (independent confounders)",
    domain: "dgm",
    summary: "A synthetic example CALIBRATED to reproduce the headline result of Hernán & Robins' What If, Part II (Ch 12-14): quitting smoking → weight gain. Six INDEPENDENT baseline confounders (a transparent but unrealistic joint), a linear/logit DGP, true effect +3.5 kg. Crude ~+2.5 kg; adjusting for the confounders RAISES it toward the truth — the canonical IPW / standardization / g-estimation lesson. Not the book's real-data analysis — open the DGP panel (Σ) to see the exact mechanism.",
    code: `dag {
  Sex [adjusted,label="sex (female)",pos="-3.1,2.7"]
  Age [adjusted,label="age",pos="-1.85,3.15"]
  Smoking_intensity [adjusted,label="cigarettes/day",pos="-0.6,3.3"]
  Years_smoking [adjusted,label="years smoking",pos="0.65,3.15"]
  Exercise [adjusted,label="exercise",pos="1.9,2.7"]
  Baseline_weight [adjusted,label="baseline weight",pos="3.05,1.85"]
  Quit_smoking [exposure,label="quit smoking",pos="-1.75,0.65"]
  Weight_gain [outcome,label="weight gain",pos="1.5,-1.7"]
  Sex -> Quit_smoking
  Sex -> Weight_gain
  Age -> Quit_smoking
  Age -> Weight_gain
  Smoking_intensity -> Quit_smoking
  Smoking_intensity -> Weight_gain
  Years_smoking -> Quit_smoking
  Years_smoking -> Weight_gain
  Exercise -> Quit_smoking
  Exercise -> Weight_gain
  Baseline_weight -> Quit_smoking
  Baseline_weight -> Weight_gain
  Quit_smoking -> Weight_gain
}`
  },
  {
    id: "wg-dgm-copula",
    title: "Smoking cessation → weight gain (correlated confounders, copula)",
    domain: "dgm",
    summary: "The weight-gain example with the SAME treatment/outcome models and true effect (+3.5 kg), but the six confounders are now CORRELATED through a one-factor Gaussian copula (shared latent 'aging/burden'). Realistic joint dependence — open the DGP panel (Σ) to see the correlation matrix light up vs the independent variant, and watch overlap/positivity tighten while the truth is unchanged.",
    code: `dag {
  Health_factor [latent,label="latent aging/burden",pos="0.0,4.4"]
  Sex [adjusted,label="sex (female)",pos="-3.1,2.7"]
  Age [adjusted,label="age",pos="-1.85,3.15"]
  Smoking_intensity [adjusted,label="cigarettes/day",pos="-0.6,3.3"]
  Years_smoking [adjusted,label="years smoking",pos="0.65,3.15"]
  Exercise [adjusted,label="exercise",pos="1.9,2.7"]
  Baseline_weight [adjusted,label="baseline weight",pos="3.05,1.85"]
  Quit_smoking [exposure,label="quit smoking",pos="-1.75,0.65"]
  Weight_gain [outcome,label="weight gain",pos="1.5,-1.7"]
  Health_factor -> Sex
  Health_factor -> Age
  Health_factor -> Smoking_intensity
  Health_factor -> Years_smoking
  Health_factor -> Exercise
  Health_factor -> Baseline_weight
  Sex -> Quit_smoking
  Sex -> Weight_gain
  Age -> Quit_smoking
  Age -> Weight_gain
  Smoking_intensity -> Quit_smoking
  Smoking_intensity -> Weight_gain
  Years_smoking -> Quit_smoking
  Years_smoking -> Weight_gain
  Exercise -> Quit_smoking
  Exercise -> Weight_gain
  Baseline_weight -> Quit_smoking
  Baseline_weight -> Weight_gain
  Quit_smoking -> Weight_gain
}`
  },
  {
    id: "wg-dgm-plasmode",
    title: "Smoking cessation → weight gain (real NHEFS rows, plasmode)",
    domain: "dgm",
    summary: "The weight-gain example with the SAME true effect (+3.5 kg), but the six confounders are RESAMPLED from the real NHEFS public-use rows (true joint dependence + real mixed types). Treatment and outcome are simulated on top. The most faithful variant — open the DGP panel (Σ) to see the data source and the real correlation matrix; the marginals are the actual NHEFS distributions.",
    code: `dag {
  Row_source [latent,label="NHEFS rows (resample)",pos="0.0,4.4"]
  Sex [adjusted,label="sex (female)",pos="-3.1,2.7"]
  Age [adjusted,label="age",pos="-1.85,3.15"]
  Smoking_intensity [adjusted,label="cigarettes/day",pos="-0.6,3.3"]
  Years_smoking [adjusted,label="years smoking",pos="0.65,3.15"]
  Exercise [adjusted,label="exercise",pos="1.9,2.7"]
  Baseline_weight [adjusted,label="baseline weight",pos="3.05,1.85"]
  Quit_smoking [exposure,label="quit smoking",pos="-1.75,0.65"]
  Weight_gain [outcome,label="weight gain",pos="1.5,-1.7"]
  Row_source -> Sex
  Row_source -> Age
  Row_source -> Smoking_intensity
  Row_source -> Years_smoking
  Row_source -> Exercise
  Row_source -> Baseline_weight
  Sex -> Quit_smoking
  Sex -> Weight_gain
  Age -> Quit_smoking
  Age -> Weight_gain
  Smoking_intensity -> Quit_smoking
  Smoking_intensity -> Weight_gain
  Years_smoking -> Quit_smoking
  Years_smoking -> Weight_gain
  Exercise -> Quit_smoking
  Exercise -> Weight_gain
  Baseline_weight -> Quit_smoking
  Baseline_weight -> Weight_gain
  Quit_smoking -> Weight_gain
}`
  },
  {
    id: "wg-dgm-confounder-dag",
    title: "Smoking cessation → weight gain (confounder DAG)",
    domain: "dgm",
    summary: "The weight-gain example where confounder dependence is encoded by explicit edges AMONG the confounders (years-smoking ← age; baseline-weight ← sex). Same true effect (+3.5 kg). The 'invent your own dependence' DGM — open the DGP panel (Σ): the structure is visible in the equations, but it's a hand-built factorization, not learned from data.",
    code: `dag {
  Sex [adjusted,label="sex (female)",pos="-3.2,3.0"]
  Age [adjusted,label="age",pos="-1.5,3.4"]
  Smoking_intensity [adjusted,label="cigarettes/day",pos="0.2,3.4"]
  Exercise [adjusted,label="exercise",pos="1.9,3.0"]
  Baseline_weight [adjusted,label="baseline weight",pos="-3.2,1.4"]
  Years_smoking [adjusted,label="years smoking",pos="-1.5,1.7"]
  Quit_smoking [exposure,label="quit smoking",pos="0.6,0.5"]
  Weight_gain [outcome,label="weight gain",pos="1.8,-1.7"]
  Age -> Years_smoking
  Sex -> Baseline_weight
  Sex -> Quit_smoking
  Sex -> Weight_gain
  Age -> Quit_smoking
  Age -> Weight_gain
  Smoking_intensity -> Quit_smoking
  Smoking_intensity -> Weight_gain
  Years_smoking -> Quit_smoking
  Years_smoking -> Weight_gain
  Exercise -> Quit_smoking
  Exercise -> Weight_gain
  Baseline_weight -> Quit_smoking
  Baseline_weight -> Weight_gain
  Quit_smoking -> Weight_gain
}`
  },
  {
    id: "wg-dgm-generative",
    title: "Smoking cessation → weight gain (generative synthetic rows)",
    domain: "dgm",
    summary: "The weight-gain example with confounders resampled from a SYNTHETIC dataset generated by a model learned from real NHEFS (a Gaussian copula; novel rows, no real individuals). Same true effect (+3.5 kg). The generative DGM — open the DGP panel (Σ): the joint approximates the real one (correlations are close but not exact), the privacy/augmentation trade-off of learned data.",
    code: `dag {
  Row_source [latent,label="synthetic NHEFS (resample)",pos="0.0,4.4"]
  Sex [adjusted,label="sex (female)",pos="-3.1,2.7"]
  Age [adjusted,label="age",pos="-1.85,3.15"]
  Smoking_intensity [adjusted,label="cigarettes/day",pos="-0.6,3.3"]
  Years_smoking [adjusted,label="years smoking",pos="0.65,3.15"]
  Exercise [adjusted,label="exercise",pos="1.9,2.7"]
  Baseline_weight [adjusted,label="baseline weight",pos="3.05,1.85"]
  Quit_smoking [exposure,label="quit smoking",pos="-1.75,0.65"]
  Weight_gain [outcome,label="weight gain",pos="1.5,-1.7"]
  Row_source -> Sex
  Row_source -> Age
  Row_source -> Smoking_intensity
  Row_source -> Years_smoking
  Row_source -> Exercise
  Row_source -> Baseline_weight
  Sex -> Quit_smoking
  Sex -> Weight_gain
  Age -> Quit_smoking
  Age -> Weight_gain
  Smoking_intensity -> Quit_smoking
  Smoking_intensity -> Weight_gain
  Years_smoking -> Quit_smoking
  Years_smoking -> Weight_gain
  Exercise -> Quit_smoking
  Exercise -> Weight_gain
  Baseline_weight -> Quit_smoking
  Baseline_weight -> Weight_gain
  Quit_smoking -> Weight_gain
}`
  },
  {
    id: "wg-dgm-positivity",
    title: "Showcase: when positivity bites (strong copula)",
    domain: "dgm",
    summary: "A standalone showcase: strong confounder correlation (copula) AND strong confounder→treatment effects push the propensity toward 0/1, so overlap is poor. The IPW / matching estimators get unstable while the re-simulated g-formula still recovers the +3.5 kg truth — the positivity problem the artificially-perfect-overlap independent variant hides.",
    code: `dag {
  Health_factor [latent,label="latent factor (strong)",pos="0.0,4.4"]
  Sex [adjusted,label="sex (female)",pos="-3.1,2.7"]
  Age [adjusted,label="age",pos="-1.85,3.15"]
  Smoking_intensity [adjusted,label="cigarettes/day",pos="-0.6,3.3"]
  Years_smoking [adjusted,label="years smoking",pos="0.65,3.15"]
  Exercise [adjusted,label="exercise",pos="1.9,2.7"]
  Baseline_weight [adjusted,label="baseline weight",pos="3.05,1.85"]
  Quit_smoking [exposure,label="quit smoking",pos="-1.75,0.65"]
  Weight_gain [outcome,label="weight gain",pos="1.5,-1.7"]
  Health_factor -> Sex
  Health_factor -> Age
  Health_factor -> Smoking_intensity
  Health_factor -> Years_smoking
  Health_factor -> Exercise
  Health_factor -> Baseline_weight
  Sex -> Quit_smoking
  Sex -> Weight_gain
  Age -> Quit_smoking
  Age -> Weight_gain
  Smoking_intensity -> Quit_smoking
  Smoking_intensity -> Weight_gain
  Years_smoking -> Quit_smoking
  Years_smoking -> Weight_gain
  Exercise -> Quit_smoking
  Exercise -> Weight_gain
  Baseline_weight -> Quit_smoking
  Baseline_weight -> Weight_gain
  Quit_smoking -> Weight_gain
}`
  },
  {
    id: "lalonde-dgm-plasmode",
    title: "Job training → earnings (real LaLonde rows, plasmode)",
    domain: "dgm",
    summary: "The DGM contrast on the canonical LaLonde job-training story: the confounders are RESAMPLED from real LaLonde rows (real joint + real zero-inflated prior earnings). The program serves the disadvantaged, so the naive earnings gap looks bad — adjust for prior earnings / schooling and the true +$1,800 effect appears. Open the DGP panel (Σ) for the data source + real correlation matrix.",
    code: `dag {
  Row_source [latent,label="LaLonde rows (resample)",pos="0.0,4.4"]
  Age [adjusted,label="age",pos="-3.3,2.7"]
  Education [adjusted,label="education",pos="-2.35,3.15"]
  Black [adjusted,label="black",pos="-1.4,3.35"]
  Hispanic [adjusted,label="hispanic",pos="-0.45,3.45"]
  Married [adjusted,label="married",pos="0.5,3.45"]
  No_degree [adjusted,label="no degree",pos="1.45,3.35"]
  Earnings_74 [adjusted,label="earnings '74",pos="2.4,3.15"]
  Earnings_75 [adjusted,label="earnings '75",pos="3.35,2.7"]
  In_program [exposure,label="in program",pos="-1.75,0.7"]
  Earnings_78 [outcome,label="earnings '78",pos="1.6,-1.7"]
  Row_source -> Age
  Row_source -> Education
  Row_source -> Black
  Row_source -> Hispanic
  Row_source -> Married
  Row_source -> No_degree
  Row_source -> Earnings_74
  Row_source -> Earnings_75
  Age -> In_program
  Age -> Earnings_78
  Education -> In_program
  Education -> Earnings_78
  No_degree -> In_program
  No_degree -> Earnings_78
  Earnings_74 -> In_program
  Earnings_74 -> Earnings_78
  Earnings_75 -> In_program
  Earnings_75 -> Earnings_78
  Married -> Earnings_78
  In_program -> Earnings_78
}`
  },
  {
    id: "lalonde-dgm-independent",
    title: "Job training \u2192 earnings (independent confounders)",
    domain: "dgm",
    summary: "Same job-training story and +$1,800 truth, but each confounder is resampled INDEPENDENTLY from real LaLonde (its own row source) \u2014 the marginals are exactly real, but the JOINT is broken. Flip to the plasmode variant to see the real correlations reappear in the DGP panel while the truth stays fixed.",
    code: `dag {
  Src_Age [latent,label="src age",pos="-3.3,4.35"]
  Src_Education [latent,label="src education",pos="-2.35,4.35"]
  Src_Black [latent,label="src black",pos="-1.4,4.35"]
  Src_Hispanic [latent,label="src hispanic",pos="-0.45,4.35"]
  Src_Married [latent,label="src married",pos="0.5,4.35"]
  Src_No_degree [latent,label="src no_degree",pos="1.45,4.35"]
  Src_Earnings_74 [latent,label="src earnings_74",pos="2.4,4.35"]
  Src_Earnings_75 [latent,label="src earnings_75",pos="3.35,4.35"]
  Age [adjusted,label="age",pos="-3.3,2.7"]
  Education [adjusted,label="education",pos="-2.35,3.05"]
  Black [adjusted,label="black",pos="-1.4,3.3"]
  Hispanic [adjusted,label="hispanic",pos="-0.45,3.4"]
  Married [adjusted,label="married",pos="0.5,3.4"]
  No_degree [adjusted,label="no degree",pos="1.45,3.3"]
  Earnings_74 [adjusted,label="earnings '74",pos="2.4,3.05"]
  Earnings_75 [adjusted,label="earnings '75",pos="3.35,2.7"]
  In_program [exposure,label="in program",pos="-1.75,0.7"]
  Earnings_78 [outcome,label="earnings '78",pos="1.6,-1.7"]
  Src_Age -> Age
  Src_Education -> Education
  Src_Black -> Black
  Src_Hispanic -> Hispanic
  Src_Married -> Married
  Src_No_degree -> No_degree
  Src_Earnings_74 -> Earnings_74
  Src_Earnings_75 -> Earnings_75
  Age -> In_program
  Education -> In_program
  No_degree -> In_program
  Earnings_74 -> In_program
  Earnings_75 -> In_program
  Age -> Earnings_78
  Education -> Earnings_78
  No_degree -> Earnings_78
  Earnings_74 -> Earnings_78
  Earnings_75 -> Earnings_78
  Married -> Earnings_78
  In_program -> Earnings_78
}`
  },
  {
    id: "lalonde-dgm-generative",
    title: "Job training \u2192 earnings (generative synthetic rows)",
    domain: "dgm",
    summary: "The job-training DGM showcase with confounders resampled from a SYNTHETIC LaLonde dataset generated by a model learned from the real data (a Gaussian copula; novel rows). The learned joint approximates the real one \u2014 compare the DGP panel\u2019s correlation matrix to the plasmode variant.",
    code: `dag {
  Row_source [latent,label="synthetic LaLonde (resample)",pos="0.0,4.4"]
  Age [adjusted,label="age",pos="-3.3,2.7"]
  Education [adjusted,label="education",pos="-2.35,3.05"]
  Black [adjusted,label="black",pos="-1.4,3.3"]
  Hispanic [adjusted,label="hispanic",pos="-0.45,3.4"]
  Married [adjusted,label="married",pos="0.5,3.4"]
  No_degree [adjusted,label="no degree",pos="1.45,3.3"]
  Earnings_74 [adjusted,label="earnings '74",pos="2.4,3.05"]
  Earnings_75 [adjusted,label="earnings '75",pos="3.35,2.7"]
  In_program [exposure,label="in program",pos="-1.75,0.7"]
  Earnings_78 [outcome,label="earnings '78",pos="1.6,-1.7"]
  Row_source -> Age
  Row_source -> Education
  Row_source -> Black
  Row_source -> Hispanic
  Row_source -> Married
  Row_source -> No_degree
  Row_source -> Earnings_74
  Row_source -> Earnings_75
  Age -> In_program
  Education -> In_program
  No_degree -> In_program
  Earnings_74 -> In_program
  Earnings_75 -> In_program
  Age -> Earnings_78
  Education -> Earnings_78
  No_degree -> Earnings_78
  Earnings_74 -> Earnings_78
  Earnings_75 -> Earnings_78
  Married -> Earnings_78
  In_program -> Earnings_78
}`
  },
  {
    id: "lalonde-recover-rct",
    title: "Job training → earnings (recover the RCT)",
    domain: "dgm",
    summary: "The famous LaLonde benchmark: replay the REAL observational data (NSW-treated + PSID controls) — treatment and earnings are read straight from the rows, nothing is simulated. The naive gap is wildly biased because the PSID controls look nothing like the trainees; the true effect (+$1,794) is known from the randomized trial. Can adjustment recover it? Open the DGP panel (Σ) for the data source and the overlap.",
    code: `dag {
  Row_source [latent,label="LaLonde rows (replay)",pos="0.0,4.4"]
  Age [adjusted,label="age",pos="-3.3,2.7"]
  Education [adjusted,label="education",pos="-2.35,3.15"]
  Black [adjusted,label="black",pos="-1.4,3.35"]
  Hispanic [adjusted,label="hispanic",pos="-0.45,3.45"]
  Married [adjusted,label="married",pos="0.5,3.45"]
  No_degree [adjusted,label="no degree",pos="1.45,3.35"]
  Earnings_74 [adjusted,label="earnings '74",pos="2.4,3.15"]
  Earnings_75 [adjusted,label="earnings '75",pos="3.35,2.7"]
  In_program [exposure,label="in program",pos="-1.75,0.7"]
  Earnings_78 [outcome,label="earnings '78",pos="1.6,-1.7"]
  Row_source -> Age
  Row_source -> Education
  Row_source -> Black
  Row_source -> Hispanic
  Row_source -> Married
  Row_source -> No_degree
  Row_source -> Earnings_74
  Row_source -> Earnings_75
  Row_source -> In_program
  Row_source -> Earnings_78
  Age -> In_program
  Age -> Earnings_78
  Education -> In_program
  Education -> Earnings_78
  No_degree -> In_program
  No_degree -> Earnings_78
  Earnings_74 -> In_program
  Earnings_74 -> Earnings_78
  Earnings_75 -> In_program
  Earnings_75 -> Earnings_78
  Married -> Earnings_78
  In_program -> Earnings_78
}`
  },
  {
    id: "what-if-hiv-cd4-variants",
    title: "What If: ART and CD4 — why adjusting is wrong",
    domain: "epidemiology",
    summary: "Three-visit HIV/ART treatment-confounder feedback: low CD4 prompts treatment (confounding), and ART works mostly THROUGH later CD4 (mediation), so CD4 is a confounder of the next dose AND a mediator of the last one. The true always-vs-never effect is about -21 pp. Methods that reweight or standardize forward (IPW, the g-formula) recover it; methods that CONDITION on time-varying CD4 (outcome regression, AIPW) over-adjust away the mediated benefit and undershoot to ~-8. The textbook case where adjusting for a time-varying confounder is the wrong move.",
    outputModule: "what-if-hiv-cd4-variants",
    code: buildHivCd4SequenceCode(HIV_CD4_SEQUENCE_VISITS)
  },
  {
    id: "what-if-censoring-ipcw",
    title: "What If: censoring as a time-varying treatment",
    domain: "epidemiology",
    summary: "Longitudinal treatment example that makes censoring explicit and estimates a strategy contrast with IPCW.",
    outputModule: "what-if-censoring-ipcw",
    code: `dag {
  Baseline_risk [adjusted,label="baseline risk",pos="-1.8,3.6"]
  A0 [exposure,label="treatment A0",pos="0,2.5"]
  L1 [adjusted,label="risk L1",pos="-0.85,1.35"]
  C1 [selected,label="censored C1",pos="1.1,0.35"]
  A1 [label="treatment A1",pos="-0.35,-0.65"]
  C2 [selected,label="censored C2",pos="1.25,-1.5"]
  Y [outcome,label="outcome Y",pos="-0.15,-2.65"]
  Baseline_risk -> A0
  Baseline_risk -> L1
  Baseline_risk -> C1
  Baseline_risk -> C2
  Baseline_risk -> Y
  A0 -> L1
  A0 -> C1
  A0 -> A1
  A0 -> Y
  L1 -> C1
  L1 -> A1
  L1 -> C2
  L1 -> Y
  C1 -> A1
  A1 -> C2
  A1 -> Y
}`
  },
  {
    id: "what-if-dynamic-g-formula",
    title: "What If: dynamic strategies and the g-formula",
    domain: "epidemiology",
    summary: "Three-time risk-history example for comparing threshold-based dynamic treatment strategies.",
    outputModule: "what-if-dynamic-g-formula",
    code: `dag {
  Risk_0 [adjusted,label="risk L0",pos="-1.2,3.8"]
  A0 [exposure,label="action A0",pos="0.65,2.7"]
  Risk_1 [adjusted,label="risk L1",pos="-0.8,1.6"]
  A1 [label="action A1",pos="0.9,0.45"]
  Risk_2 [adjusted,label="risk L2",pos="-0.5,-0.7"]
  A2 [label="action A2",pos="0.9,-1.75"]
  Y [outcome,label="outcome Y",pos="0,-3"]
  Risk_0 -> A0
  Risk_0 -> Risk_1
  Risk_0 -> Y
  A0 -> Risk_1
  A0 -> A1
  A0 -> Y
  Risk_1 -> A1
  Risk_1 -> Risk_2
  Risk_1 -> Y
  A1 -> Risk_2
  A1 -> A2
  A1 -> Y
  Risk_2 -> A2
  Risk_2 -> Y
  A2 -> Y
}`
  },
  {
    id: "what-if-snaft-survival",
    title: "What If: structural nested survival time",
    domain: "epidemiology",
    summary: "Survival-time sketch for a structural nested accelerated failure time contrast under treatment and censoring.",
    outputModule: "what-if-snaft-survival",
    code: `dag {
  Baseline_risk [adjusted,label="baseline risk",pos="-1.7,2.9"]
  Treatment_start [exposure,label="treatment start",pos="-0.2,1.55"]
  Failure_time [outcome,label="counterfactual failure time",pos="-0.8,0.1"]
  Visit_schedule [label="visit schedule",pos="1.15,-0.25"]
  Censoring [selected,pos="0.95,-1.5"]
  Observed_death [outcome,label="observed death",pos="-0.1,-2.7"]
  Baseline_risk -> Treatment_start
  Baseline_risk -> Failure_time
  Baseline_risk -> Visit_schedule
  Baseline_risk -> Censoring
  Baseline_risk -> Observed_death
  Treatment_start -> Failure_time
  Treatment_start -> Censoring
  Failure_time -> Observed_death
  Visit_schedule -> Censoring
}`
  },
  {
    id: "policy-event-study",
    title: "Policy evaluation: DiD and synthetic control",
    domain: "econometrics",
    summary: "Policy timing, baseline differences, pre-trends, exclusion-style reasoning, placebos, and donor-pool quality.",
    code: `dag {
  Region_baseline [adjusted,label="region baseline",pos="-2.6,0.8"]
  Pre_trend [adjusted,label="pre-trend",pos="-2.4,-0.6"]
  Political_pressure [label="political pressure",pos="-1.1,1.3"]
  Policy_adoption [exposure,label="policy adoption",pos="-0.4,0"]
  Donor_pool_quality [adjusted,label="donor pool quality",pos="0.8,-1.1"]
  Placebo_pre_outcome [label="placebo pre-outcome",pos="1,1.15"]
  Post_outcome [outcome,label="post outcome",pos="2.4,0"]
  Region_baseline -> Pre_trend
  Region_baseline -> Policy_adoption
  Region_baseline -> Post_outcome
  Pre_trend -> Policy_adoption
  Pre_trend -> Placebo_pre_outcome
  Pre_trend -> Post_outcome
  Political_pressure -> Policy_adoption
  Political_pressure -> Post_outcome
  Policy_adoption -> Post_outcome
  Donor_pool_quality -> Post_outcome
}`
  },
  {
    id: "incrementality-uplift",
    title: "Incrementality: experiment, geolift, uplift",
    domain: "product",
    summary: "Random holdout, campaign exposure, user intent, effect heterogeneity, guardrails, and spillovers.",
    code: `dag {
  Random_holdout [label="random holdout",pos="-2.7,1.1"]
  User_intent [adjusted,label="user intent",pos="-2.5,-0.3"]
  Geo_market [adjusted,label="geo market",pos="-1.4,1.25"]
  Uplift_segment [adjusted,label="uplift segment",pos="-1.4,-1.1"]
  Campaign_exposure [exposure,label="campaign exposure",pos="-0.2,0"]
  Feature_use [label="feature use",pos="1,0.8"]
  Network_spillover [latent,label="network spillover",pos="1,-1.05"]
  Conversion [outcome,pos="2.35,0.2"]
  Guardrail_latency [outcome,label="guardrail latency",pos="2.35,-1.1"]
  Random_holdout -> Campaign_exposure
  User_intent -> Campaign_exposure
  User_intent -> Conversion
  Geo_market -> Campaign_exposure
  Geo_market -> Conversion
  Uplift_segment -> Campaign_exposure
  Uplift_segment -> Conversion
  Campaign_exposure -> Feature_use
  Campaign_exposure -> Conversion
  Campaign_exposure -> Guardrail_latency
  Feature_use -> Conversion
  Network_spillover -> Conversion
}`
  },
  {
    id: "causal-ml-refutation",
    title: "Causal ML: refutation and heterogeneity",
    domain: "ml",
    summary: "DoWhy-style assumption declaration, graph falsification, proxy confounding, discovery hypotheses, and CATE targets.",
    code: `dag {
  Observed_context [adjusted,label="observed context",pos="-2.5,0.9"]
  Effect_modifier [adjusted,label="effect modifier",pos="-2.5,-0.8"]
  Latent_need [latent,label="latent need",pos="-1.4,1.45"]
  Proxy_signal [adjusted,label="proxy signal",pos="-1.1,0"]
  Treatment [exposure,pos="0.1,0"]
  Model_score [label="model score",pos="1.1,-1"]
  Outcome [outcome,pos="2.4,0"]
  Observed_context -> Treatment
  Observed_context -> Outcome
  Effect_modifier -> Treatment
  Effect_modifier -> Outcome
  Latent_need -> Proxy_signal
  Latent_need -> Treatment
  Latent_need -> Outcome
  Proxy_signal -> Treatment
  Treatment -> Outcome
  Treatment -> Model_score
  Effect_modifier -> Model_score
}`
  },
  {
    id: "ota-gene-program-traits",
    title: "Gene programs to traits (Ota et al. reconstruction)",
    domain: "ml",
    summary: "Paper-derived reconstruction of Ota et al.'s gene -> program -> blood-trait model: Perturb-seq regulators, cNMF programs, LoF/GWAS evidence, and explicit separation between mechanism and association.",
    code: `dag {
  K562_context [label="K562 context",pos="-3.4,0"]
  CRISPRi_knockdown [exposure,label="CRISPRi knockdown",pos="-1.7,0"]
  Natural_LoF [label="natural LoF",pos="0,0"]
  GWAS_variants [label="GWAS variants",pos="1.7,0"]
  Gene_constraint_Shet [adjusted,label="S_het constraint",pos="3.4,0"]
  Regulator_activity [label="regulator activity",pos="-1.7,1"]
  Autophagy_program [label="autophagy program",pos="-3.2,2"]
  Heme_synthesis_program [label="heme synthesis",pos="-1.6,2"]
  G2M_cell_cycle_program [label="G2/M program",pos="0,2"]
  Other_cell_cycle_programs [label="cell-cycle programs",pos="1.6,2"]
  Mitochondrial_program [label="mitochondrial program",pos="3.2,2"]
  Erythroid_cell_state [label="erythroid cell state",pos="0,3"]
  MCH_trait [outcome,label="MCH trait effect",pos="-1.8,4"]
  RDW_trait [outcome,label="RDW trait effect",pos="0,4"]
  IRF_trait [outcome,label="IRF trait effect",pos="1.8,4"]
  Perturb_seq_beta [label="Perturb-seq beta",pos="-3.1,5"]
  Program_gene_content [label="top program genes",pos="-1.2,5"]
  LoF_burden_gamma [label="LoF gamma",pos="1.2,5"]
  GWAS_trait_signal [label="GWAS trait signal",pos="3.1,5"]
  Program_burden_effect [label="program burden",pos="-2.3,6"]
  Regulator_burden_correlation [label="regulator-burden corr",pos="0,6"]
  Trans_eQTL_validation [label="trans-eQTL check",pos="2.3,6"]
  Stepwise_program_model [label="stepwise program model",pos="-0.7,7"]
  Permutation_CV_fit [label="CV / permutation fit",pos="1.5,7"]
  Concordant_gene_map [label="concordant gene map",pos="0,8"]
  K562_context -> Regulator_activity
  K562_context -> Autophagy_program
  K562_context -> Heme_synthesis_program
  K562_context -> G2M_cell_cycle_program
  K562_context -> Other_cell_cycle_programs
  K562_context -> Mitochondrial_program
  CRISPRi_knockdown -> Regulator_activity
  Natural_LoF -> Regulator_activity
  Regulator_activity -> Autophagy_program
  Regulator_activity -> Heme_synthesis_program
  Regulator_activity -> G2M_cell_cycle_program
  Regulator_activity -> Other_cell_cycle_programs
  Regulator_activity -> Mitochondrial_program
  Heme_synthesis_program -> Mitochondrial_program
  Autophagy_program -> Erythroid_cell_state
  Heme_synthesis_program -> Erythroid_cell_state
  G2M_cell_cycle_program -> Erythroid_cell_state
  Other_cell_cycle_programs -> Erythroid_cell_state
  Mitochondrial_program -> Erythroid_cell_state
  Erythroid_cell_state -> MCH_trait
  Erythroid_cell_state -> RDW_trait
  Erythroid_cell_state -> IRF_trait
  Heme_synthesis_program -> MCH_trait
  Mitochondrial_program -> RDW_trait
  G2M_cell_cycle_program -> IRF_trait
  Regulator_activity -> Perturb_seq_beta
  Autophagy_program -> Perturb_seq_beta
  Heme_synthesis_program -> Perturb_seq_beta
  G2M_cell_cycle_program -> Perturb_seq_beta
  Other_cell_cycle_programs -> Perturb_seq_beta
  Mitochondrial_program -> Perturb_seq_beta
  Autophagy_program -> Program_gene_content
  Heme_synthesis_program -> Program_gene_content
  G2M_cell_cycle_program -> Program_gene_content
  Other_cell_cycle_programs -> Program_gene_content
  Mitochondrial_program -> Program_gene_content
  Natural_LoF -> LoF_burden_gamma
  MCH_trait -> LoF_burden_gamma
  RDW_trait -> LoF_burden_gamma
  IRF_trait -> LoF_burden_gamma
  Gene_constraint_Shet -> LoF_burden_gamma
  GWAS_variants -> GWAS_trait_signal
  MCH_trait -> GWAS_trait_signal
  RDW_trait -> GWAS_trait_signal
  IRF_trait -> GWAS_trait_signal
  Program_gene_content -> Program_burden_effect
  LoF_burden_gamma -> Program_burden_effect
  Gene_constraint_Shet -> Program_burden_effect
  Perturb_seq_beta -> Regulator_burden_correlation
  LoF_burden_gamma -> Regulator_burden_correlation
  Gene_constraint_Shet -> Regulator_burden_correlation
  GWAS_trait_signal -> Trans_eQTL_validation
  Program_gene_content -> Trans_eQTL_validation
  Program_burden_effect -> Stepwise_program_model
  Regulator_burden_correlation -> Stepwise_program_model
  Gene_constraint_Shet -> Stepwise_program_model
  Stepwise_program_model -> Permutation_CV_fit
  LoF_burden_gamma -> Permutation_CV_fit
  Stepwise_program_model -> Concordant_gene_map
  LoF_burden_gamma -> Concordant_gene_map
}`
  },
  {
    id: "ops-root-cause",
    title: "Operations: root cause and mechanism shift",
    domain: "operations",
    summary: "Upstream latency, deployment changes, traffic mix, queueing, alerts, and distribution-change attribution.",
    code: `dag {
  Deployment [exposure,pos="-2.5,0.9"]
  Traffic_mix [adjusted,label="traffic mix",pos="-2.5,-0.7"]
  Upstream_latency [label="upstream latency",pos="-1,1.1"]
  Cache_hit_rate [label="cache hit rate",pos="-1,-0.45"]
  Queue_depth [label="queue depth",pos="0.4,-1.1"]
  Service_latency [outcome,label="service latency",pos="1.6,0"]
  Incident_alert [selected,label="incident alert",pos="2.6,0"]
  Deployment -> Cache_hit_rate
  Deployment -> Service_latency
  Traffic_mix -> Cache_hit_rate
  Traffic_mix -> Queue_depth
  Traffic_mix -> Service_latency
  Upstream_latency -> Service_latency
  Cache_hit_rate -> Service_latency
  Queue_depth -> Service_latency
  Service_latency -> Incident_alert
}`
  },
  {
    id: "education-mediation",
    title: "Education: mediation, latent constructs, attrition",
    domain: "social",
    summary: "Program mediation, latent ability, survey measurement, classroom context, attrition, and multilevel concerns.",
    code: `dag {
  Family_background [adjusted,label="family background",pos="-2.6,1.1"]
  Latent_ability [latent,label="latent ability",pos="-1.5,-0.95"]
  Classroom_context [adjusted,label="classroom context",pos="-1.5,0.9"]
  Program [exposure,pos="-0.3,0"]
  Engagement [label="engagement",pos="0.95,0.85"]
  Survey_response [adjusted,label="survey response",pos="0.9,-0.85"]
  Attrition [selected,pos="1.85,-1.1"]
  Test_score [outcome,label="test score",pos="2.35,0.2"]
  Family_background -> Program
  Family_background -> Latent_ability
  Family_background -> Test_score
  Latent_ability -> Program
  Latent_ability -> Survey_response
  Latent_ability -> Test_score
  Classroom_context -> Program
  Classroom_context -> Engagement
  Classroom_context -> Test_score
  Program -> Engagement
  Program -> Test_score
  Engagement -> Test_score
  Survey_response -> Attrition
  Test_score -> Attrition
}`
  },
  {
    id: "chess-intelligence-practice",
    title: "Does chess need intelligence? (selection fails to flip)",
    domain: "social",
    summary: "Paper-shaped youth chess SEM drawn from Bilalic, McLeod, and Gobet (2007): nonlinear practice returns plus Elo-driven elite selection. It deliberately shows a failure case: conditioning on the generated elite sample attenuates the IQ-rating association but does not reproduce the paper's negative selected-sample sign flip.",
    code: `dag {
  Age [adjusted,label="age (years)",pos="-3.4,0.4"]
  Gender [adjusted,label="gender (1=boy)",pos="-3.4,-0.7"]
  Intelligence [exposure,label="intelligence (IQ)",pos="-1.6,1.2"]
  Experience_years [adjusted,label="years experience",pos="-2.0,-1.4"]
  Practice_hours [adjusted,label="deliberate practice",pos="-0.6,-0.2"]
  Chess_Elo [outcome,label="chess Elo",pos="1.4,0"]
  Elite_sample [selected,label="elite sample",pos="3.0,0.9"]
  Age -> Experience_years
  Age -> Practice_hours
  Age -> Chess_Elo
  Gender -> Practice_hours
  Gender -> Chess_Elo
  Intelligence -> Practice_hours
  Intelligence -> Chess_Elo
  Experience_years -> Practice_hours
  Experience_years -> Chess_Elo
  Practice_hours -> Chess_Elo
  Chess_Elo -> Elite_sample
}`
  },
  {
    id: "chess-intelligence-practice-simple-flip",
    title: "Does chess need intelligence? (manual sign flip)",
    domain: "social",
    summary: "A deliberately specified four-node compensatory-selection model that succeeds at reproducing the paper's selected-sample sign flip: intelligence helps rating in the full population, practice helps more, and the rated/elite sample selects children who arrive through either route.",
    outputModule: "chess-intelligence-practice-simple-flip",
    code: `dag {
  Intelligence [exposure,label="intelligence (IQ)",pos="-2.3,0.6"]
  Practice_hours [adjusted,label="practice (log hours)",pos="-2.3,-0.7"]
  Chess_Elo [outcome,label="chess rating",pos="0.1,0"]
  Elite_sample [selected,label="rated / elite sample",pos="2.3,0"]
  Intelligence -> Practice_hours
  Intelligence -> Chess_Elo
  Practice_hours -> Chess_Elo
  Intelligence -> Elite_sample
  Practice_hours -> Elite_sample
}`
  },
  {
    id: "galton-regression",
    title: "Galton regression to the mean",
    domain: "classic",
    summary: "Regression to the mean from shared latent causes rather than a father-to-son causal edge.",
    code: `dag {
  G_shared [latent,label="shared genetics",pos="-2,1.25"]
  G_son_other [latent,label="other son genetics",pos="0,1.45"]
  E_father [latent,label="father residual",pos="-3,-0.9"]
  E_son [latent,label="son residual",pos="1.2,-0.95"]
  Father_height [label="father height",pos="-1,-0.1"]
  Son_height [label="son height",pos="2,-0.1"]
  G_shared -> Father_height
  G_shared -> Son_height
  G_son_other -> Son_height
  E_father -> Father_height
  E_son -> Son_height
}`
  }
];

const EXAMPLE_DENOUEMENTS: Record<string, ExampleDenouement> = {
  "simpson-severity": {
    module: "Adjustment / backdoor",
    punchline: "The treatment looks worse in the crude comparison because sicker patients are more likely to receive it; the causal claim is the adjusted treatment effect within comparable severity levels.",
    estimand: "Total effect of Treatment on Recovery in the eligible population represented by the DAG.",
    primaryOutput: "Minimal sufficient adjustment set for the total effect, plus a before/after comparison of crude versus severity-adjusted conclusions.",
    validity: "Credible only if Severity captures the common causes of treatment assignment and recovery, and if no collider or post-treatment variable is added to the adjustment set.",
    nextAction: "Use the total-effect adjustment result; report the crude contrast only as the motivating Simpson reversal.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State the causal question as Treatment -> Recovery, not as a raw treated-versus-untreated association.",
          "Name Severity as the pre-treatment prognostic factor that opens the backdoor path Treatment <- Severity -> Recovery.",
          "Report that adjustment targets a total effect because no mediator is being conditioned on.",
          "Make the public-facing conclusion about the direction and magnitude after adjustment, not the aggregate reversal."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Causal paths from Treatment to Recovery.",
          "Open biasing paths before adjustment.",
          "Minimal adjustment sets that block those paths.",
          "A two-row comparison: unadjusted association versus adjusted causal contrast."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Unmeasured baseline prognosis would leave residual confounding.",
          "Adjusting for variables caused by Treatment would change the estimand or introduce bias.",
          "Poor overlap across Severity levels would make the adjusted comparison extrapolative.",
          "If Severity is measured with large error, the remaining backdoor path may stay partly open."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: after comparing patients with similar baseline severity, Treatment has the estimated effect on Recovery.",
          "Do not say: Treatment caused the crude aggregate recovery rate difference.",
          "Say whether the adjustment set is sufficient, empty, or unavailable under the drawn graph."
        ]
      }
    ]
  },
  "icu-mortality-triage": {
    module: "Adjustment / bad-control warning",
    punchline: "ICU patients can have higher crude mortality because they are much sicker at baseline, even when ICU admission causally reduces death risk for comparable patients.",
    estimand: "Total effect of ICU_admission on Death among patients represented by the graph, comparing admission versus no admission at the same baseline severity.",
    primaryOutput: "Crude mortality comparison, severity-adjusted/do contrast, and a bad-control warning that Triage_score is a collider affected by both Severity and ICU_admission.",
    validity: "Credible only if Severity captures the pre-admission prognosis that drives both ICU admission and death, and if Triage_score is not treated as a clean baseline confounder.",
    nextAction: "Use Severity for the total-effect adjustment story; do not fix the crude comparison by adjusting for the post-admission triage-score collider.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State the public argument as ICU_admission -> Death, not as raw ICU mortality versus ward mortality.",
          "Name Severity as the pre-treatment common cause: sicker patients are more likely to enter ICU and more likely to die.",
          "Name Triage_score as a common effect of Severity and ICU_admission, so it is not a safe default adjustment variable.",
          "Report the do-contrast as the causal claim and the crude contrast as the misleading descriptive fact."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Crude mortality among ICU patients and non-ICU patients.",
          "Average Severity among ICU and non-ICU groups; the visual separation should make the crude contrast suspect quickly.",
          "Causal path ICU_admission -> Death.",
          "Open backdoor path ICU_admission <- Severity -> Death.",
          "Collider path ICU_admission -> Triage_score <- Severity."
        ]
      },
      {
        title: "Assumption checklist",
        items: [
          "Severity is measured before ICU admission.",
          "ICU_admission is treatment-like: it is a decision or exposure, not just a label assigned after death risk is known.",
          "Death is measured after the ICU decision.",
          "Triage_score is downstream of ICU admission or partly produced by the admission process.",
          "No unmeasured pre-admission prognosis remains after Severity."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "If Triage_score is actually fully pre-admission, the graph should be redrawn before calling it a bad control.",
          "Unmeasured clinician judgment can confound ICU admission and death beyond the Severity node.",
          "ICU admission may have heterogeneous effects: it can help severe patients while being irrelevant or harmful for low-risk patients.",
          "Selection into the hospital or survival to ICU decision time can add another selection mechanism.",
          "Severity measurement error can leave residual confounding."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: ICU patients die more often in the crude data because they are much sicker; under the drawn DAG, the causal comparison asks what would happen to comparable patients under ICU versus no ICU.",
          "Do not say: ICU care is harmful merely because ICU patients have higher mortality.",
          "Do not say: adjust for every severity-like score unless the score is temporally and causally upstream of ICU admission.",
          "Say explicitly whether the estimate is a total ICU-admission effect or a controlled comparison holding some downstream score fixed."
        ]
      }
    ]
  },
  "college-earnings": {
    module: "Adjustment / wage premium",
    punchline: "College graduates earn more in the crude comparison, but that raw wage premium mixes the effect of college with family log income that affects both college attendance and earnings.",
    estimand: "Mean effect of College on Earnings, comparing do(College=1) versus do(College=0) for the population represented by the DAG.",
    primaryOutput: "Raw earnings premium, causal do-premium, family-income separation, binned overlap checks, and adjustment-set verdict.",
    validity: "Credible only if Family_log_income captures the pre-college background causes of both college attendance and earnings; omitted ability, school quality, or networks would remain threats.",
    nextAction: "Use the do-premium as the reportable causal claim; use the crude premium only as the tempting but confounded headline.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State the public argument as College -> Earnings, not as a raw graduate/non-graduate wage gap.",
          "Name Family_log_income as the pre-treatment common cause of College and Earnings.",
          "Report the target as a mean difference in earnings under do(College=1) versus do(College=0).",
          "Explain whether the raw wage premium overstates or understates the causal college premium."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Mean earnings among college and non-college groups.",
          "Mean Family_log_income among college and non-college groups.",
          "Open backdoor path College <- Family_log_income -> Earnings.",
          "Binned family-income overlap checks before trusting the adjusted contrast.",
          "Minimal adjustment set for the total effect.",
          "Continuous earnings distributions, so users do not need to parse a binary confusion matrix."
        ]
      },
      {
        title: "Assumption checklist",
        items: [
          "Family_log_income is measured before the college decision.",
          "College is a treatment-like decision or exposure, not merely a label assigned after earnings are known.",
          "Earnings are measured after college attendance.",
          "No important pre-college common causes remain unmeasured.",
          "The contrast is a population mean effect, not necessarily the effect for every individual."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Latent ability can confound college attendance and earnings beyond Family_log_income.",
          "College quality, major, local labor market, and networks can make the effect heterogeneous.",
          "Selection into college may involve expectations about future earnings.",
          "Conditioning on post-college occupation would change the estimand.",
          "Poor overlap can make low-income college graduates or high-income non-graduates rare."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: college graduates earn more in the raw data, but part of that gap reflects family log income.",
          "Say: under this DAG, the causal college premium is the do-contrast after accounting for family log income.",
          "Do not say: the entire graduate/non-graduate wage gap is caused by college.",
          "Mention that omitted ability or school-quality differences would weaken the claim."
        ]
      }
    ]
  },
  "tutoring-scores": {
    module: "Adjustment / sign reversal",
    punchline: "Tutored students can score lower in the raw comparison because tutoring is targeted to students who already need help, even when tutoring causally improves scores.",
    estimand: "Mean effect of Tutoring on Test_score, comparing do(Tutoring=1) versus do(Tutoring=0) for the student population represented by the DAG.",
    primaryOutput: "Collapsed reveal card: raw score gap, causal do-score gain, academic-need imbalance, and a sign-reversal verdict.",
    validity: "Credible only if Academic_need captures the pre-tutoring reasons students receive tutoring and score lower; omitted motivation, teacher assignment, or prior achievement would remain threats.",
    nextAction: "Make the user fix the graph by marking Academic_need adjusted. After that state change, reveal a corrected adjusted graph panel rather than immediately handing them the answer.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State the tempting claim as Tutoring -> Test_score, not as a raw tutored/non-tutored score gap.",
          "Name Academic_need as the pre-treatment common cause of tutoring assignment and lower scores.",
          "Report the target as a mean test-score difference under do(Tutoring=1) versus do(Tutoring=0).",
          "Make the sign flip explicit: raw association points down, causal intervention points up."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Mean Test_score among tutored and non-tutored students.",
          "Academic_need rate among tutored and non-tutored students.",
          "Open backdoor path Tutoring <- Academic_need -> Test_score.",
          "Minimal adjustment set for the total effect.",
          "Continuous score distributions so the conclusion reads as a mean score gap, not a confusion matrix."
        ]
      },
      {
        title: "Assumption checklist",
        items: [
          "Academic_need is measured before tutoring starts.",
          "Tutoring is a treatment-like exposure, not a label assigned after the score.",
          "Test_score is measured after tutoring.",
          "No important pre-tutoring common causes remain unmeasured.",
          "The causal claim is an average effect; some students may benefit more than others."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Prior achievement, motivation, family resources, teacher referral, or school quality may confound tutoring beyond Academic_need.",
          "Tutoring intensity and quality can vary across students.",
          "Conditioning on post-tutoring effort or attendance would change the estimand.",
          "Poor overlap can make low-need tutored students or high-need non-tutored students rare.",
          "Regression to the mean can complicate before/after score changes if pre-test score is used carelessly."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: tutored students score lower in raw data because tutoring is concentrated among students who need help.",
          "Say: under this DAG, the causal tutoring effect is positive after comparing students with the same academic need.",
          "Do not say: tutoring harms students merely because tutored students have lower scores.",
          "Mention omitted prior-achievement or referral mechanisms if Academic_need is too crude."
        ]
      },
      {
        title: "Adjusted graph reveal plan",
        items: [
          "Treat the initial catalog entry as the unadjusted state: same nodes and arrows, but Academic_need is not yet selected as adjusted.",
          "Detect the fix when Academic_need.roles.adjusted becomes true while Tutoring is exposure and Test_score is outcome.",
          "On that transition, open a lightweight comparison panel with two graph snapshots: raw graph and adjusted graph.",
          "In the adjusted snapshot, highlight Academic_need and the now-blocked path Tutoring <- Academic_need -> Test_score.",
          "Keep the completed output collapsed until the user expands it, so the exercise remains interactive rather than a pre-solved report."
        ]
      }
    ]
  },
  "front-door-smoking": {
    module: "Front-door / mediated identification",
    punchline: "Smoking is confounded with cancer by latent genetic risk, so the direct backdoor adjustment route is unavailable; the useful output is whether the tar-mediated mechanism can carry an identifiable front-door style claim.",
    estimand: "Total effect of Smoking on Cancer through the observed tar pathway, under front-door assumptions.",
    primaryOutput: "Mechanism-based identification statement: Smoking changes Tar, Tar changes Cancer, and all open paths required by the front-door logic are blocked or explicitly threatened.",
    validity: "Credible only if Tar captures the relevant smoking-to-cancer mechanism, there is no unblocked Smoking -> Tar confounding, and Smoking blocks the backdoor paths from Tar to Cancer.",
    nextAction: "Treat this as a mechanistic identification design; if the mediator is incomplete, downgrade the output to an assumption map rather than an effect claim.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State that latent Genetic_risk prevents ordinary covariate adjustment for Smoking -> Cancer.",
          "Separate the causal mechanism into Smoking -> Tar and Tar -> Cancer.",
          "Report whether the mediator route is complete enough to support a front-door interpretation.",
          "Make the output an identification argument before making it an estimate."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "The unblocked latent backdoor path Smoking <- Genetic_risk -> Cancer.",
          "The directed mechanism Smoking -> Tar -> Cancer.",
          "Whether Tar is downstream of Smoking and upstream of Cancer.",
          "A warning if a direct Smoking -> Cancer pathway is added outside the mediator."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Tar may be an incomplete proxy for the harmful exposure mechanism.",
          "There may be unmeasured causes of Tar and Cancer.",
          "Measurement error in Tar weakens the mediator-based claim.",
          "The graph does not by itself estimate the functional front-door formula."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: a front-door style claim requires the observed mediator to carry the relevant causal pathway.",
          "Do not say: latent confounding is solved merely because a mediator is observed.",
          "Flag this as stronger than a story but weaker than a randomized design unless mediator assumptions are defended."
        ]
      }
    ]
  },
  "berkson-hospital": {
    module: "Selection / collider bias",
    punchline: "Conditioning on hospitalization creates an association between Disease_A and Disease_B even if neither disease causes the other.",
    estimand: "Association induced by selection, not a causal effect, unless the graph is changed to include a causal path.",
    primaryOutput: "Collider warning showing that Hospitalized is a selected common effect and should not be interpreted as a neutral restriction.",
    validity: "Credible as a bias demonstration if Hospitalized is caused by both disease processes and analysis is restricted to hospitalized cases.",
    nextAction: "Use this output to explain why the sampled population changes the comparison; avoid causal language for Disease_A -> Disease_B.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State that Disease_A and Disease_B are marginally independent in the drawn causal model.",
          "Show that selecting or adjusting for Hospitalized opens Disease_A -> Hospitalized <- Disease_B.",
          "Describe the output as selection-induced dependence, not disease causation.",
          "Identify the target population that was lost when analysis was restricted to hospital patients."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Selected node marker on Hospitalized.",
          "Open path after conditioning on Hospitalized.",
          "A comparison of unconditional versus selected-sample association.",
          "A warning that the adjusted set contains a collider."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "If a real common cause exists, selection bias and confounding can coexist.",
          "If the analysis population is intentionally hospitalized patients, the estimand must be redefined.",
          "Conditioning on descendants of Hospitalized can create similar bias.",
          "Case mix changes can make the direction of induced association unintuitive."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: within hospitalized patients, the diseases may appear associated because either condition can cause admission.",
          "Do not say: Disease_A protects against or causes Disease_B without a causal path and design justification.",
          "Name selection explicitly in the conclusion."
        ]
      }
    ]
  },
  "birthweight-paradox": {
    module: "Adjustment / collider warning",
    punchline: "Birthweight is affected by both smoking and latent frailty, so adjusting for birthweight can distort the smoking-mortality relationship instead of clarifying it.",
    estimand: "Total effect of Smoking on Infant_mortality, with a warning that conditioning on Birthweight targets a different and biased contrast.",
    primaryOutput: "Bad-control report identifying Birthweight as a post-exposure collider/mediator-like variable and contrasting total-effect versus adjusted interpretations.",
    validity: "Credible if the analyst accepts that Frailty is an unobserved common cause of Birthweight and mortality, and Smoking affects Birthweight.",
    nextAction: "For the total effect, avoid Birthweight adjustment; use the panel to explain why the paradox arises.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State the target as Smoking -> Infant_mortality total effect.",
          "Mark Birthweight as post-treatment relative to Smoking.",
          "Show the latent Frailty -> Birthweight and Frailty -> Infant_mortality structure.",
          "Explain that controlling for Birthweight can compare infants with different latent frailty profiles."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Total-effect adjustment set excluding Birthweight.",
          "Biasing path opened by conditioning on Birthweight.",
          "Causal path Smoking -> Infant_mortality.",
          "Sensitivity note for latent Frailty because it cannot be observed directly."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "A user may ask a controlled direct-effect question where Birthweight is intentionally fixed; that is not the total effect.",
          "Latent frailty may stand in for multiple biological and social mechanisms.",
          "Measurement timing matters: birthweight must be after smoking exposure for the bad-control warning.",
          "Selection on live births can add another layer of collider bias."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: the birthweight-adjusted contrast is not the causal total effect of smoking.",
          "Do not say: low birthweight adjustment proves smoking is protective.",
          "Make the estimand switch explicit if reporting a controlled direct effect."
        ]
      }
    ]
  },
  "obesity-paradox": {
    module: "Selection / collider bias",
    punchline: "Among people who already have chronic disease, obesity can look protective because disease status is a selected collider reached through obesity or latent frailty.",
    estimand: "Population total effect of Obesity on Mortality, contrasted with the selected diseased-sample association.",
    primaryOutput: "Before/after comparison: diseased-sample mortality contrast versus population do(Obesity) contrast, plus frailty imbalance inside the diseased sample.",
    validity: "Credible as a teaching example if Chronic_disease is understood as a selected analysis sample caused by both Obesity and Frailty.",
    nextAction: "Use the example to explain why disease-restricted samples can invert risk-factor associations.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State the target as Obesity -> Mortality in the population.",
          "Mark Chronic_disease as the selected sample, not a harmless restriction.",
          "Show that Obesity and latent Frailty are alternative routes into the diseased cohort.",
          "Report the diseased-sample contrast separately from the population causal contrast."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Analysis-sample banner for Chronic_disease=1.",
          "Frailty imbalance between obese and non-obese people inside the diseased sample.",
          "Diseased-sample mortality contrast.",
          "Population do(Obesity=1) versus do(Obesity=0) contrast."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Real obesity-paradox examples can involve measurement, treatment, survival, and reverse-causation issues too.",
          "The graph only demonstrates one selection mechanism.",
          "If the target population is diseased patients, the estimand must be stated as such.",
          "Latent Frailty bundles many unmeasured risk processes."
        ]
      }
    ]
  },
  "cats-highrise-syndrome": {
    module: "Terminal-velocity physics + survivorship selection",
    punchline: "The legend that cats survive long falls better than short ones is real in the data but doubly explained: a genuine non-monotonic injury curve that peaks near the seventh story and then falls, plus survivorship selection because cats killed outright are rarely recorded.",
    estimand: "Population do(Fall_height) effect on injury and survival across heights, contrasted with the within-sample association in cats brought to the clinic.",
    primaryOutput: "Terminal-velocity J-curve (injury at the 7th versus 20th story), the do(7th) versus do(20th) survival contrast showing the mid-rise fall is deadliest, and the gap between recorded and full-population survival.",
    validity: "A stylized data-generating story calibrated to the qualitative findings of Whitney & Mehlhaff (1987): 115 cats, falls of 2-32 stories with a mean near 5.5, about 90% survival among treated cats, and injuries that stop rising past roughly the seventh story. It is not a refit of the paper's measurements.",
    nextAction: "Use it to show how a DAG separates a real non-monotonic causal effect from selection bias, and why the recorded-sample association overstates how safe high falls are.",
    sections: [
      {
        title: "Mechanism",
        defaultOpen: true,
        items: [
          "Fall height raises injury up to a peak around the seventh story, then injury declines to a plateau: cats hit terminal velocity (~60 mph near the fifth story), stop accelerating, relax, and spread out to add drag. The plateau still sits above a gentle two-story fall, so a long fall is never causally safer than a short one.",
          "Injury is the only cause of survival: a fall can kill a cat only by injuring it, so there is no direct fall-height-to-survival edge. All of height's effect on survival routes through injury.",
          "Brought_to_vet is the selected collider: a cat that dies on impact is rarely carried in, and a visibly hurt but living cat is more likely recorded than an unscathed one, so the clinic sample is conditioned on both survival and injury.",
          "do(fall height) on survival is non-monotonic through injury alone: lowest around the seventh story, recovering for terminal-velocity falls but never above the short-fall rate."
        ]
      },
      {
        title: "Why the legend looks true",
        defaultOpen: true,
        items: [
          "Physics: among intact cats, the seventh-story fall is genuinely worse than the twentieth, so injury really does decline at the top of the range.",
          "Selection: the most severely injured high-fall cats die and never reach the clinic, so recorded survival for tall falls is inflated.",
          "Both push the same way, which is why the recorded data reads as 'higher is safer'.",
          "The honest decomposition is the point: neither mechanism alone is the whole story, and a pure-selection model cannot reproduce the calibrated numbers."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: in the recorded sample, injuries stop rising past about the seventh story, partly real physics and partly survivorship.",
          "Say: intervening to drop a cat from the seventh floor is the most dangerous height, even though the records make high falls look safe.",
          "Do not say: falling from higher is causally safer than falling from lower.",
          "State whether the target population is all falling cats or only cats brought to a clinic, because the two give opposite-looking answers."
        ]
      }
    ]
  },
  "policing-encounters": {
    module: "Selection / observed-data denominator",
    punchline: "An encounter-only comparison is already conditioned on police contact, and police contact is caused by group-linked surveillance and latent incident risk.",
    estimand: "Synthetic structural disparity contrast for Use_of_force, contrasted with the encounter-only observed-data contrast.",
    primaryOutput: "Before/after comparison: use-of-force difference among police contacts versus the model's population structural contrast, plus incident-risk imbalance inside contacts.",
    validity: "This is a synthetic teaching graph, not a factual claim about any jurisdiction; it is valid only as an illustration of selected denominators.",
    nextAction: "Use careful wording: encounter data answer questions about contacts, not the whole upstream policing process.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State that Police_contact is selected observed data.",
          "Name Incident_risk as a latent route into both contact and force.",
          "Explain that Group_A changes contact probability in the toy DGP, so the encounter denominator is not neutral.",
          "Avoid interpreting the group contrast as a literal individual-level intervention."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Analysis-sample banner for Police_contact=1.",
          "Incident_risk imbalance inside contacts.",
          "Encounter-only use-of-force contrast.",
          "Population structural contrast under the toy DGP."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Race, neighborhood, police deployment, dispatch, reporting, and incident context are not interchangeable.",
          "Real data need temporal and institutional detail.",
          "The graph is for denominator reasoning, not for making empirical claims.",
          "Policy reporting should separate upstream contact risk from conditional force risk."
        ]
      }
    ]
  },
  "m-bias-adjustment": {
    module: "Adjustment / bad-control warning",
    punchline: "Exposure and Outcome are unrelated until the analyst adjusts for Collider_score, a pre-treatment common effect of two latent causes.",
    estimand: "Null total effect of Exposure on Outcome, contrasted with the biased association created by conditioning on Collider_score.",
    primaryOutput: "Before/after comparison: raw Exposure-Outcome association near zero versus collider-conditioned association away from zero.",
    validity: "Credible as an M-bias demonstration if Collider_score is a common effect and there is no causal path from Exposure to Outcome.",
    nextAction: "Use this to teach that pre-treatment does not automatically mean safe to adjust.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State that Exposure has no directed path to Outcome in this DAG.",
          "Show Collider_score as Cause_of_exposure -> Collider_score <- Cause_of_outcome.",
          "Report the raw association and the collider-conditioned association side by side.",
          "Name the adjustment as harmful, not merely unnecessary."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "No causal path from Exposure to Outcome.",
          "Closed path through the collider before adjustment.",
          "Opened path after conditioning on Collider_score.",
          "No-adjustment-is-better verdict."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "If Collider_score also measures a real confounder, the decision becomes a tradeoff.",
          "M-bias is often small in real settings unless the collider relationships are strong.",
          "The example is deliberately tuned so the sign is visible.",
          "Use causal structure, not variable timing alone, to choose controls."
        ]
      }
    ]
  },
  "instrumental-encouragement": {
    module: "Instrumental variables",
    punchline: "Encouragement can identify a treatment effect only through its impact on Treatment uptake, while latent health confounds Treatment and Outcome.",
    estimand: "Local average treatment effect for compliers affected by Encouragement, not necessarily the population ATE.",
    primaryOutput: "IV candidate verdict covering relevance, exclusion, independence, and the implied complier interpretation.",
    validity: "Credible only if Encouragement changes Treatment, has no direct path to Outcome except through Treatment, and is independent of unobserved health.",
    nextAction: "If the IV verdict is plausible, report a complier effect; otherwise return to an adjustment or design-redesign workflow.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State that Treatment -> Outcome is confounded by Unobserved_health.",
          "Name Encouragement as the candidate instrument.",
          "Separate relevance from exclusion and independence; all three need their own evidence.",
          "Report the estimand as a complier/local effect unless stronger assumptions are added."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Directed path Encouragement -> Treatment.",
          "No directed Encouragement -> Outcome edge outside Treatment.",
          "No open backdoor path from Encouragement to Outcome.",
          "Instrument list from the identification panel."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Encouragement may affect Outcome through motivation, access, or measurement rather than Treatment.",
          "Weak relevance makes estimates unstable even if the graph is valid.",
          "Compliers may differ from always-takers and never-takers.",
          "Monotonicity is not shown by this DAG and must be argued separately."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: among people whose treatment uptake is shifted by Encouragement, the treatment effect is identified under IV assumptions.",
          "Do not say: the IV automatically identifies the average effect for everyone.",
          "List exclusion and independence as assumptions, not facts inferred from data alone."
        ]
      }
    ]
  },
  "mediation-direct-total": {
    module: "Mediation",
    punchline: "Treatment affects Outcome both directly and through Biomarker, so the output should separate the total effect from the direct path that remains after the mediator route is blocked conceptually.",
    estimand: "Total effect of Treatment on Outcome, plus a controlled or natural direct-effect style contrast depending on assumptions.",
    primaryOutput: "Side-by-side total-effect and direct-effect identification results, with a warning about conditioning on a post-treatment mediator.",
    validity: "Credible if mediator-outcome confounding is absent or handled; direct-effect claims require stronger assumptions than total-effect claims.",
    nextAction: "Report the total effect first; use the direct-effect result only after naming the extra mediation assumptions.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State Treatment -> Outcome as the total-effect target.",
          "Identify Biomarker as a mediator, not a baseline covariate.",
          "Separate direct and indirect paths in the narrative.",
          "Warn that adjusting for Biomarker changes the estimand."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Causal paths Treatment -> Outcome and Treatment -> Biomarker -> Outcome.",
          "Total-effect adjustment result.",
          "Direct-effect adjustment result.",
          "Any open mediator-outcome backdoor paths if extra nodes are added."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Post-treatment mediator adjustment can block part of the effect by design.",
          "Unmeasured mediator-outcome confounding breaks mediation interpretation.",
          "Treatment-induced confounding of the mediator-outcome path requires specialized methods.",
          "The direct effect may not be policy-relevant if the mediator cannot actually be held fixed."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: the total effect includes both direct and biomarker-mediated pathways.",
          "Say: the direct-effect claim is conditional on mediation assumptions.",
          "Do not mix the adjusted direct-effect estimate with the total-effect conclusion."
        ]
      }
    ]
  },
  "measurement-error-latent": {
    module: "Latent measurement",
    punchline: "Education, ability, test scores, and earnings cannot be summarized by a clean adjustment set unless the latent ability and noisy proxy structure is made explicit.",
    estimand: "Effect of Education on Earnings after accounting for observed family background and acknowledging unresolved latent ability measurement.",
    primaryOutput: "Measurement-aware threat report: what is observed, what is latent, which proxy is being used, and how that affects the adjustment story.",
    validity: "Credible only to the extent that Family_background and Test_score capture the confounding path through latent ability without creating proxy-control bias.",
    nextAction: "Treat Test_score as a proxy with measurement error; report residual confounding risk rather than pretending ability is fully observed.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State the target as Education -> Earnings.",
          "Name True_ability as latent and Test_score as a noisy proxy.",
          "Separate adjustment for Family_background from measurement correction for ability.",
          "Report whether the graph supports a clean claim or only a partially adjusted sensitivity story."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Latent node marker on True_ability.",
          "Proxy path True_ability -> Test_score.",
          "Backdoor paths from Education to Earnings through Family_background and True_ability.",
          "Adjustment-set output with explicit unresolved latent path warnings."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Test_score may be affected by Education, which would make it a post-treatment proxy.",
          "Measurement error can leave residual confounding even after proxy adjustment.",
          "Family_background may be too broad to defend as a single measured covariate.",
          "Collider bias can arise if proxies are selected or missing in outcome-related ways."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: the education effect estimate is adjusted for observed background, with remaining latent ability risk.",
          "Do not say: test score fully controls for ability unless that measurement model is defended.",
          "List proxy limitations beside the causal conclusion."
        ]
      }
    ]
  },
  "case-control-selection": {
    module: "Selection-aware adjustment",
    punchline: "The disease process affects who is sampled, so the output must distinguish the disease odds-ratio target from associations in the selected sample.",
    estimand: "Effect of Exposure on Disease, with sampling conditioned on Disease as part of the design rather than a normal covariate.",
    primaryOutput: "Case-control design note showing confounder adjustment, outcome-driven sampling, and which odds-ratio interpretation remains valid.",
    validity: "Credible if the sampling rule is correctly represented and background Risk_factor is sufficient for exposure-disease confounding.",
    nextAction: "Use the graph to document selection, then estimate with a method appropriate for case-control sampling rather than treating Sampled as an ordinary adjustment variable.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State Exposure -> Disease as the causal target.",
          "Name Risk_factor as a pre-exposure common cause.",
          "Mark Sampled as a selection node caused by Disease.",
          "Explain that selection by Disease changes prevalence information but need not destroy the exposure odds-ratio design."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Backdoor path Exposure <- Risk_factor -> Disease.",
          "Minimal adjustment set containing Risk_factor.",
          "Selected node marker on Sampled.",
          "Warning that Sampled is part of ascertainment, not a causal confounder."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "If Sampled is also affected by Exposure or Risk_factor, additional selection bias can appear.",
          "Controls must represent the source population that produced the cases.",
          "Rare-disease or odds-ratio interpretations should be stated explicitly.",
          "Missing exposure measurement among sampled units can add measurement bias."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: within this case-control design, adjustment for Risk_factor supports the exposure-disease contrast under the sampling assumptions.",
          "Do not say: the sampled disease prevalence estimates population disease risk.",
          "Keep sampling design and causal adjustment as separate paragraphs."
        ]
      }
    ]
  },
  "target-trial-followup": {
    module: "Target trial",
    punchline: "The useful output is an emulated trial protocol: who enters at time zero, which treatment strategies are compared, what follow-up means, and how censoring and adherence are handled.",
    estimand: "Intention-to-treat or per-protocol effect of Treatment_start on Outcome_90d among eligible individuals at time zero.",
    primaryOutput: "Protocol checklist plus bias map for eligibility, baseline severity, adherence, censoring, primary outcome, and negative-control outcome.",
    validity: "Credible if eligibility, time zero, treatment start, baseline adjustment, censoring, and follow-up are aligned so immortal time and post-treatment adjustment are avoided.",
    nextAction: "Write the target-trial table before estimating; decide whether the main claim is intention-to-treat or per-protocol.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "Define the eligible cohort before Treatment_start.",
          "Set time zero to the moment treatment strategy is assigned or initiated.",
          "Define the 90-day outcome horizon before looking at post-treatment events.",
          "Choose intention-to-treat for treatment-start effects or per-protocol for adherence-regime effects."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Baseline_severity as a pre-treatment common cause of treatment, censoring, and outcome.",
          "Censoring as a selection process requiring explicit handling.",
          "Adherence as post-treatment and therefore not a naive baseline adjustment variable.",
          "Negative_control as a residual-bias probe that should not respond to Treatment_start."
        ]
      },
      {
        title: "Protocol checklist",
        items: [
          "Eligibility criteria: who could enter the trial.",
          "Treatment strategies: start versus not start, dose, grace period, and switching rules.",
          "Assignment procedure: randomized in the ideal trial, exchangeability by adjustment in the emulation.",
          "Follow-up: start, end, censoring rules, competing events, and outcome measurement.",
          "Analysis plan: adjustment set, censoring weights if needed, contrast scale, and sensitivity checks."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Immortal time if treated people must survive long enough to be classified as treated.",
          "Confounding by Baseline_severity if prognosis is incompletely captured.",
          "Selection bias if censoring depends on severity and future outcome risk.",
          "Per-protocol bias if Adherence is conditioned on without handling post-treatment confounding.",
          "Negative-control association suggests residual bias or measurement linkage."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: in the emulated target trial, starting treatment at time zero changes 90-day outcome risk by the estimated amount under the protocol assumptions.",
          "Do not say: everyone who eventually started treatment was exposed from baseline.",
          "Report the trial protocol and the DAG together."
        ]
      }
    ]
  },
  "what-if-treatment-feedback": {
    module: "Longitudinal g-methods",
    punchline: "The estimand is a contrast between complete treatment strategies, not a single adjusted regression coefficient after conditioning on the time-varying covariate.",
    estimand: "Risk difference for always treat versus never treat across A0 and A1, using Y as the end-of-follow-up event.",
    primaryOutput: "Estimator comparison across observed regimen contrast, L1-standardized contrast, parametric g-formula, IPW, and additive g-estimation.",
    validity: "Credible if the time order is right, treatment and covariate histories are measured before later decisions, positivity is adequate, and censoring is handled separately when present.",
    nextAction: "Use the g-method comparison as the reportable strategy contrast and treat conventional adjustment as a diagnostic, not the final estimand.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "Name the treatment strategies before looking at outcomes.",
          "Keep A0, L1, A1, and Y in time order.",
          "State that L1 is both affected by A0 and predictive of A1 and Y.",
          "Report the strategy contrast, not only the A1 coefficient from a regression adjusted for L1."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Support for both strategies within L1 histories.",
          "IPW effective sample size and positivity warnings.",
          "Difference between the observed regimen contrast and g-method estimates.",
          "Whether standardizing on L1 changes the target by conditioning on a post-A0 variable."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Poor support for always-treat or never-treat histories.",
          "Misspecified treatment models for IPW.",
          "Misspecified outcome model for the parametric g-formula.",
          "Censoring that depends on treatment/covariate history and is ignored.",
          "Unmeasured history variables that affect treatment and outcome."
        ]
      },
      {
        title: "Source lineage",
        items: [
          "Inspired by the longitudinal g-method chapters in Hernan and Robins, Causal Inference: What If.",
          "Explanations and DGP parameters here are rewritten for Nudagitty and are not copied from the book tables.",
          "The example is meant to teach treatment-confounder feedback before adding fuller survival/person-time examples."
        ]
      }
    ]
  },
  "policy-event-study": {
    module: "DiD / event study / synthetic control",
    punchline: "The denouement is the treated units' post-policy change relative to a credible counterfactual trend from untreated, not-yet-treated, or synthetic-control units.",
    estimand: "Average treatment effect on treated region-periods after Policy_adoption, often summarized as event-time effects or a post-period ATT.",
    primaryOutput: "Event-study and/or synthetic-control claim packet: estimated post-policy effect, pre-trend/placebo diagnostics, donor-pool credibility, and a validity verdict.",
    validity: "Credible only if pre-policy outcome paths support the counterfactual trend, timing is not driven by untreated shocks, no anticipation contaminates pre-periods, and spillovers are limited.",
    nextAction: "If pre-trends and placebo checks look credible, estimate with a modern DiD or synthetic-control workflow; if not, downgrade to descriptive policy timing evidence.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "Define treated units, comparison units, policy adoption date, and event time.",
          "State the counterfactual: what treated outcomes would have done without Policy_adoption.",
          "Report the main post-period ATT or event-time path as the punchline.",
          "Name whether the design is DiD, staggered event study, synthetic control, or a hybrid."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Pre-treatment trend comparison between treated and comparison units.",
          "Event-study coefficients before treatment as a falsification check, not as effects.",
          "Placebo_pre_outcome and placebo adoption dates if available.",
          "Donor_pool_quality and pre-period fit for synthetic control.",
          "Sensitivity to Political_pressure as a timing confounder."
        ]
      },
      {
        title: "Assumption checklist",
        items: [
          "Parallel trends or credible synthetic counterfactual before policy.",
          "No anticipation: units do not change behavior before adoption because they expect the policy.",
          "No interference: untreated regions are not affected by treated-region policy.",
          "Stable composition: region populations or measurement systems do not change discontinuously at adoption.",
          "No simultaneous shocks aligned with adoption timing."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Political_pressure may cause both Policy_adoption and Post_outcome.",
          "Pre_trend differences can masquerade as treatment effects.",
          "Staggered adoption can make naive two-way fixed effects averages misleading.",
          "Poor donor-pool fit makes synthetic-control gaps hard to interpret.",
          "Post-policy spillovers can contaminate controls."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: after adoption, treated regions changed by X relative to the counterfactual trend supported by controls.",
          "Do not say: the policy worked merely because outcomes changed after the policy.",
          "Put the validity verdict next to the effect estimate: credible, fragile, or not identified from this design."
        ]
      }
    ]
  },
  "incrementality-uplift": {
    module: "Experiment / uplift / geolift",
    punchline: "The useful output is incremental conversion caused by campaign exposure, with guardrail and spillover checks deciding whether the result is rollout-safe.",
    estimand: "ATE or CATE of Campaign_exposure on Conversion, plus guardrail effect on latency and segment-specific uplift.",
    primaryOutput: "Experiment claim packet with randomization/holdout status, conversion lift, heterogeneous uplift, guardrail movement, and spillover risk.",
    validity: "Credible if exposure variation is randomized or conditionally as-good-as-random, guardrails are not harmed, and network spillovers do not contaminate holdouts.",
    nextAction: "For randomized holdouts, report ATE and CATE; for geolift, report market-level incrementality with pre-period fit and spillover caveats.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "Define whether Random_holdout, geo assignment, or observational exposure is the source of variation.",
          "State Campaign_exposure -> Conversion as the primary effect.",
          "Report uplift by Uplift_segment only if the segment was pre-specified or honestly validated.",
          "Report Guardrail_latency beside Conversion so the recommendation is not single-metric."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Balance of User_intent and Geo_market across holdout/exposed groups.",
          "Conversion lift with uncertainty and baseline rate.",
          "CATE or uplift ranking by Uplift_segment.",
          "Guardrail_latency movement under campaign exposure.",
          "Network_spillover path warning if users or markets contaminate each other."
        ]
      },
      {
        title: "Assumption checklist",
        items: [
          "Randomization was implemented as designed and logged correctly.",
          "Exposure was not determined by user intent after assignment.",
          "No major interference between exposed and holdout units.",
          "Guardrail outcomes are measured on the same decision population.",
          "Segments were defined before outcome-driven optimization."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Ad targeting can reintroduce User_intent confounding.",
          "Geo-market shocks can mimic campaign incrementality.",
          "Spillovers can make holdout users partly treated.",
          "Optimizing on CATE estimates can overfit small segments.",
          "A positive conversion effect with a bad guardrail may still be a no-ship decision."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: the campaign caused X incremental conversions under the holdout/geolift design, with Y guardrail movement.",
          "Do not say: attributed conversions are causal incrementality unless the design supports it.",
          "Make the rollout recommendation explicit: ship, limit, retest, or do not ship."
        ]
      }
    ]
  },
  "causal-ml-refutation": {
    module: "Graph refutation / heterogeneous effects",
    punchline: "The output should make the assumptions behind the ML treatment-effect claim explicit, then show which graph implications and refutation checks survive contact with data.",
    estimand: "ATE and CATE of Treatment on Outcome conditional on observed context and pre-specified effect modifiers.",
    primaryOutput: "Assumption/refutation packet: adjustment story, latent-risk warning, proxy role, CATE target, and falsification checklist.",
    validity: "Credible only if observed context and proxies are sufficient for exchangeability, effect modifiers are pre-treatment, and refutation checks do not contradict the graph.",
    nextAction: "Use causal ML for estimation only after the graph packet states what is being adjusted for, what remains latent, and which refuters must pass.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State Treatment -> Outcome as a causal target rather than a prediction task.",
          "Name Observed_context and Proxy_signal as adjustment candidates.",
          "Name Latent_need as the remaining unobserved threat.",
          "Define Effect_modifier as a CATE dimension, not just a predictive feature."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Backdoor paths from Treatment to Outcome through observed and latent need.",
          "Whether Proxy_signal plausibly blocks enough of Latent_need.",
          "Graph-implied conditional independencies to test when data are attached.",
          "Placebo treatment, placebo outcome, subset, and bootstrap refuters.",
          "CATE stability by Effect_modifier."
        ]
      },
      {
        title: "Assumption checklist",
        items: [
          "All adjustment features are pre-treatment.",
          "No descendant of Treatment is used as a confounder.",
          "The model score is an output or policy object, not a confounder unless temporally prior.",
          "Heterogeneity claims are separated from average-effect identification.",
          "Discovery output is treated as hypotheses, not ground truth."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Latent_need can drive both Treatment and Outcome after proxy adjustment.",
          "Flexible ML can hide positivity problems in sparse regions.",
          "Feature leakage can turn post-treatment variables into confounders.",
          "CATE rankings may be unstable even when ATE is stable.",
          "Passing refuters reduces concern but does not prove the graph."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: under the declared graph and refutation checks, Treatment has the estimated ATE/CATE pattern.",
          "Do not say: the ML model discovered causality by itself.",
          "Report failed refuters as design failures, not as minor model metrics."
        ]
      }
    ]
  },
  "ota-gene-program-traits": {
    module: "Paper-derived reconstruction / gene-program mediation",
    punchline: "The useful claim is not that a gene-trait association is a direct mechanism. Ota et al. combine Perturb-seq regulator effects, cNMF programs, LoF burden effects, and validation checks to explain how gene effects can flow through programs into blood traits.",
    estimand: "Mechanistic gene-to-trait interpretation for K562-relevant erythroid traits: how a regulator perturbation changes program activity and how those programs explain MCH, RDW, and IRF genetic effects.",
    primaryOutput: "Layered graph: intervention biology above, evidence/model-selection layer below, with S_het shown as an analysis covariate rather than a biological mediator.",
    validity: "This is a Nudagitty reconstruction of the paper's implicit causal model, not a literal DAG supplied by the authors. It is credible only as a workbench map if K562 is a relevant cell model and if program selection, LoF estimates, and validation checks are kept distinct from biological arrows.",
    nextAction: "Use this example to ask which part of a gene association is direct, program-mediated, measurement-derived, or only model evidence; avoid treating GWAS or LoF significance as a direct gene -> trait edge.",
    sections: [
      {
        title: "Paper anchors",
        defaultOpen: true,
        items: [
          "Citation: Ota et al., Nature 650, 399-408, published 10 December 2025.",
          "The paper uses K562 Perturb-seq, cNMF expression programs, UK Biobank LoF burden effects, GWAS signals, and trans-eQTL validation.",
          "The model traits are erythroid blood traits: MCH, RDW, and IRF.",
          "The MCH model selected regulator-linked autophagy, hemoglobin synthesis, and G2/M programs, plus content-enriched hemoglobin and cell-cycle programs."
        ]
      },
      {
        title: "What the graph clarifies",
        defaultOpen: true,
        items: [
          "CRISPRi perturbation identifies regulator -> program effects, not a direct trait experiment.",
          "LoF gamma and GWAS signals are evidence nodes produced by human genetic data, not the same thing as cellular mechanism.",
          "Program burden and regulator-burden correlation are separate evidence routes that can agree, diverge, or point to different mechanisms.",
          "A program can mediate a gene-trait association even when the gene itself is not a core trait effector."
        ]
      },
      {
        title: "Nudagitty stress points",
        items: [
          "Multiple outcomes should be selectable: MCH, RDW, and IRF are different trait endpoints under the same program layer.",
          "Mediation and direct-effect views should distinguish total regulator effects from program-controlled questions.",
          "The evidence layer is not standard adjustment: conditioning on model outputs would answer a different question.",
          "This example pushes the app toward assumption ledgers and paper-provenance labels for each edge."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "K562 is a leukemia-derived erythroid-like cell line, so external trait relevance depends on cell-type matching.",
          "cNMF programs are learned summaries; changing program resolution can change which pathways appear.",
          "LoF effects are noisy for rare variants and are improved by GeneBayes-style shrinkage, not made assumption-free.",
          "A reconstructed DAG can overstate certainty if evidence edges are drawn as biological mechanisms."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: the paper links genetic effects to blood traits through perturbation-informed regulatory programs.",
          "Say: this graph separates biological pathways from statistical evidence used to choose and validate them.",
          "Do not say: every significant gene association is a direct causal gene-to-trait edge."
        ]
      }
    ]
  },
  "ops-root-cause": {
    module: "Root cause / mechanism shift",
    punchline: "The output should identify which upstream mechanism shift best explains the downstream latency incident, while separating causal mechanisms from alert selection.",
    estimand: "Effect of Deployment and other upstream mechanisms on Service_latency, plus attribution of observed distribution change during the incident window.",
    primaryOutput: "Incident claim packet: likely upstream cause, changed mechanism, affected downstream path, alternative causes, and confidence level.",
    validity: "Credible if timing, dependency paths, and before/after mechanism checks line up, and if alert-triggered selection is not mistaken for the cause.",
    nextAction: "Use the DAG to organize incident evidence; confirm with time-aligned logs and rollback or holdout comparisons before declaring root cause.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State the observed problem as Service_latency, not Incident_alert.",
          "List candidate upstream causes: Deployment, Traffic_mix, Upstream_latency, Cache_hit_rate, Queue_depth.",
          "Trace the path from the suspected changed mechanism to Service_latency.",
          "Separate direct deployment effects from deployment-caused cache-hit changes."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Before/after distribution of Service_latency.",
          "Mechanism checks for Cache_hit_rate and Queue_depth after Deployment.",
          "Traffic_mix adjustment or stratification so demand changes are not blamed on deployment.",
          "Dependency timing: upstream movement before downstream latency.",
          "Incident_alert as selected observation, not the root cause."
        ]
      },
      {
        title: "Assumption checklist",
        items: [
          "Timestamps are aligned across services.",
          "The suspected cause changed before the downstream symptom.",
          "Traffic mix and load are measured well enough to separate demand from system behavior.",
          "Rollback, canary, or unaffected service comparisons are available where possible.",
          "Alert thresholds did not create the apparent distribution shift."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Multiple upstream mechanisms can shift together during an incident.",
          "Alert selection can overrepresent severe traces.",
          "Traffic_mix may be a cause of both cache behavior and latency.",
          "Queueing feedback can make downstream symptoms look upstream.",
          "A rollback correlation is not definitive if traffic changed at the same time."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: the incident is most consistent with a changed Cache_hit_rate mechanism after Deployment, conditional on traffic mix checks.",
          "Do not say: the alert caused the latency.",
          "Include alternative causes that were ruled down and the evidence used."
        ]
      }
    ]
  },
  "education-mediation": {
    module: "Mediation / latent measurement / attrition",
    punchline: "The output should separate the program's total effect on test scores from the engagement-mediated pathway, while making latent ability, survey measurement, classroom context, and attrition threats explicit.",
    estimand: "Total effect of Program on Test_score, plus a mediated pathway through Engagement if mediation assumptions are defensible.",
    primaryOutput: "Education claim packet: total effect, mediation story, latent/proxy warning, attrition warning, and multilevel context checklist.",
    validity: "Credible if baseline family, ability, and classroom context are handled before Program; attrition and survey response do not selectively distort the observed outcome.",
    nextAction: "Report the total program effect first; treat engagement mediation and survey mechanisms as secondary unless their assumptions are documented.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State Program -> Test_score as the primary causal question.",
          "Name Engagement as a mediator and Survey_response as a measurement process.",
          "Name Latent_ability as unobserved and only partly represented by observed proxies.",
          "Name Classroom_context as a multilevel pre-treatment context variable."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Adjustment paths through Family_background, Latent_ability, and Classroom_context.",
          "Directed mediation path Program -> Engagement -> Test_score.",
          "Attrition as selected post-baseline missingness.",
          "Survey_response as a measurement/proxy node, not the construct itself.",
          "Classroom-level clustering or shared-context warning."
        ]
      },
      {
        title: "Assumption checklist",
        items: [
          "Program assignment is as-good-as-random after baseline context adjustment.",
          "Engagement is not conditioned on when estimating the total effect.",
          "Mediator analysis handles mediator-outcome confounding.",
          "Attrition is measured and handled rather than silently dropping students.",
          "Survey measures are linked to constructs with explicit measurement assumptions."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Latent ability can confound Program and Test_score if selection into Program is nonrandom.",
          "Attrition can select on both Survey_response and Test_score.",
          "Classroom_context can create clustered treatment and outcome dependence.",
          "Engagement may be both mediator and post-treatment collider.",
          "Survey nonresponse can make measured engagement unrepresentative."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: the program's total effect is estimated under baseline and attrition assumptions; mediation through engagement is a secondary claim.",
          "Do not say: engagement explains the effect unless mediator assumptions and attrition are addressed.",
          "Report classroom and missingness limitations next to the effect."
        ]
      }
    ]
  },
  "chess-intelligence-practice": {
    module: "Paper-shaped chess DGP / selection failure case",
    punchline: "This is the failure example: a fairly plausible nonlinear chess DGP with Elo-driven elite selection does not reproduce the paper's negative within-elite IQ-rating association. The selection effect attenuates the association, but the sign does not flip.",
    estimand: "Compare full-population r(Intelligence, Chess_Elo) with selected-sample r(Intelligence, Chess_Elo | Elite_sample = 1) under a paper-shaped youth chess SEM with Age, Gender, Experience_years, and Practice_hours.",
    primaryOutput: "Active selection filter: Elite_sample in {1}. Mechanism packet: saturating Practice -> Elo (Hill/Emax), saturating Experience -> Elo, linear IQ -> Elo plus IQ -> Practice, smooth_threshold Elo -> Elite_sample.",
    validity: "Calibrated to roughly match the marginal means and SDs reported in Table 1 of Bilalic, McLeod, and Gobet (2007), Intelligence 35(5):457-470. The nonlinear edge functions force forward simulation/rejection sampling rather than the linear-Gaussian analytic shortcut. Coefficients remain illustrative rather than refit from the original data.",
    nextAction: "Use this as the honest baseline: plausible paper-shaped structure plus nonlinear mechanisms is not enough to get the sign flip. Then load the manual sign-flip example to see what additional, deliberately specified selection structure is needed.",
    sections: [
      {
        title: "Failure result",
        defaultOpen: true,
        items: [
          "The generated Elite_sample is selected through an Elo threshold, and this example ships with Elite_sample in {1} active.",
          "Within that selected sample, the IQ-rating association should stay positive or only attenuate; it is the counterexample to an automatic Simpson-style sign flip.",
          "The paper reports a negative elite-subsample relation in a small restricted stratum. This DGP says: that sign flip is not a generic consequence of selecting high-rated players.",
          "Citation: Bilalic, M., McLeod, P., & Gobet, F. (2007). Does chess need intelligence? Intelligence, 35(5), 457-470. doi:10.1016/j.intell.2006.09.005."
        ]
      },
      {
        title: "Mechanism",
        defaultOpen: true,
        items: [
          "Practice_hours has a saturating Hill/Emax dose-response: early practice moves Elo more than later practice.",
          "Experience_years has diminishing returns into Elo.",
          "Intelligence has a direct positive contribution to Elo and a positive indirect path through Practice_hours.",
          "Elite_sample is a generated selected node driven by an Elo smooth threshold, then the analysis sample conditions on Elite_sample = 1."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "The analysis sample banner: Elite_sample in {1}.",
          "The selected-sample pairwise correlation between Intelligence and Chess_Elo.",
          "The nonlinear function on Practice_hours -> Chess_Elo.",
          "The smooth threshold on Chess_Elo -> Elite_sample.",
          "Clear the Elite_sample condition to compare the selected sample to the full population."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "The example is a stylized SEM, not a claim that the actual paper estimated these exact functions.",
          "Practice quality, motivation, parental support, tournament access, and age-at-start are compressed into a few nodes.",
          "Conditioning on elite players is a selection operation and should not be interpreted as the population relationship.",
          "Because this fails to reproduce the sign flip, it should not be presented as an explanation of the paper's elite-subsample coefficient."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: this paper-shaped DGP does not reproduce the paper's selected-sample sign flip.",
          "Say: selection changes the association, but the direction depends on the exact selection mechanism.",
          "Do not say: selecting elite players mechanically makes intelligence look harmful."
        ]
      }
    ]
  },
  "chess-intelligence-practice-simple-flip": {
    module: "Manual compensatory selection / success case",
    punchline: "This is the success example: a negative IQ-rating association appears after selecting a rated/elite sample even though IQ helps in the full population. The catch is that the DAG is deliberately specified so intelligence and practice are substitute routes into selection.",
    estimand: "Compare the full-population association r(Intelligence, Chess_Elo) with the selected-sample association r(Intelligence, Chess_Elo | Elite_sample = 1).",
    primaryOutput: "Active selection filter: Elite_sample in {1}. The diagnostic comparison is full population versus selected sample for IQ-rating, IQ-practice, and practice-rating correlations.",
    validity: "Stylized DGP for the paper's qualitative explanation, not a refit of the paper. It keeps only the core ingredients: IQ, practice, rating, and selected elite/rated membership, and it manually encodes compensatory selection.",
    nextAction: "Compare this against the paper-shaped failure example. The contrast is the lesson: reproducing the paper's sign flip is possible, but it depends on a deliberately chosen selection structure rather than falling out of any plausible chess SEM.",
    sections: [
      {
        title: "Mechanism",
        defaultOpen: true,
        items: [
          "Intelligence has a small direct positive path to rating and a positive path into practice.",
          "Practice has the dominant positive path to rating.",
          "Elite_sample is a selected collider with compensatory entry routes: high intelligence or high practice can get a child into the rated/elite analysis sample.",
          "Conditioning on Elite_sample = 1 makes intelligence and practice compete inside the selected stratum."
        ]
      },
      {
        title: "Why this succeeds",
        defaultOpen: true,
        items: [
          "Bilalic et al. report positive full-sample relations among IQ, practice, and chess-skill measures.",
          "In the elite subsample, IQ and practice were negatively correlated, and practice remained the stronger predictor.",
          "This toy DGP isolates that explanation without adding age, gender, experience, motivation, coaching, or tournament-drive nodes.",
          "The success is therefore informative but fragile: it depends on manually making selected membership a compensatory function of IQ and practice."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: the sign flip is a selected-sample association, not evidence that intelligence causally harms chess skill.",
          "Say: practice dominates rating in the selected group, while IQ and practice partly substitute as routes into selection.",
          "Do not say: this reproduces the original coefficients or sample design exactly."
        ]
      }
    ]
  },
  "galton-regression": {
    module: "Descriptive causal explanation / regression to the mean",
    punchline: "The son-father height relationship is not represented as Father_height causing Son_height; the useful output explains regression to the mean through shared and independent latent components.",
    estimand: "Descriptive conditional expectation of Son_height given Father_height, not a manipulable causal effect of changing father height.",
    primaryOutput: "Explanation packet showing shared latent genetics, independent residual components, and why extreme father heights predict less-extreme son heights.",
    validity: "Credible as a simulation/explanation if the shared and independent latent components are accepted as the data-generating story.",
    nextAction: "Use this example for teaching prediction versus intervention; do not export it as a causal effect estimate.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State that Father_height is predictive of Son_height because of shared causes.",
          "Point out the absence of a directed Father_height -> Son_height causal edge.",
          "Explain regression to the mean as partial sharing plus independent residual variation.",
          "Keep the output descriptive unless a manipulable exposure is added."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Shared latent path G_shared -> Father_height and G_shared -> Son_height.",
          "Independent father and son residual sources.",
          "Scatterplot of Father_height versus Son_height.",
          "Conditional distribution of Son_height among high or low Father_height values."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Users may confuse prediction with intervention.",
          "Assortative mating, environmental transmission, and measurement error are omitted in this compact example.",
          "Conditioning on extreme observed values can exaggerate regression-to-mean intuition.",
          "No adjustment set can turn father height into a manipulable treatment in this graph."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: tall fathers tend to have tall sons, but less extreme than themselves on average because only part of height variation is shared.",
          "Do not say: reducing father height would reduce son height.",
          "Use this as a contrast between predictive association and causal intervention."
        ]
      }
    ]
  }
};

export function exampleDenouement(id: string): ExampleDenouement | null {
  return EXAMPLE_DENOUEMENTS[id] ?? whatIfDenouement(id) ?? generatedDenouementForExample(id);
}

function generatedDenouementForExample(id: string): ExampleDenouement | null {
  const example = EXAMPLES.find((candidate) => candidate.id === id);
  if (!example) return null;
  return generateDenouement(parseModel(example.code, example.title).document.graph);
}

// Build a denouement from the DAG structure alone (roles, d-separation, the minimal
// adjustment set) rather than hand-writing one per example. See docs/causal-operations.md.
export function generateDenouement(graph: GraphModel): ExampleDenouement | null {
  const analysis = analyzeGraph(graph);
  const exposureId = analysis.exposures[0];
  const outcomeId = analysis.outcomes[0];
  if (!exposureId || !outcomeId) return null;
  const label = (nodeId: string) => graph.nodes.find((node) => node.id === nodeId)?.label ?? nodeId;
  const exposure = label(exposureId);
  const outcome = label(outcomeId);
  const colliders = analysis.conditioningRoles.filter((role) => role.classification === "collider");
  const adjusters = analysis.conditioningRoles.filter((role) => role.classification === "backdoor");
  const minimalSet = analysis.totalEffect.minimalSets[0] ?? [];
  const conditionedList = analysis.conditioningRoles.map((role) => `${label(role.node)} (${role.classification})`).join(", ") || "nothing";
  const isCollider = colliders.length > 0;
  const isConfounded = !isCollider && (adjusters.length > 0 || analysis.openBiasingPathCount > 0);

  const module = isCollider ? "Selection / collider bias (auto)" : isConfounded ? "Adjustment / backdoor (auto)" : "Identified effect (auto)";
  const punchline = isCollider
    ? `${colliders.map((role) => label(role.node)).join(", ")} is a collider on ${exposure} → ${outcome}; conditioning on it opens a biasing path, so the unconditioned estimate is the unbiased one.`
    : isConfounded
      ? `${exposure} → ${outcome} is confounded; the crude comparison is biased, and adjusting for ${(minimalSet.length > 0 ? minimalSet.map(label) : adjusters.map((role) => label(role.node))).join(", ") || "the confounders"} identifies the effect.`
      : `${exposure} → ${outcome} has no open biasing paths; the crude comparison already estimates the causal effect.`;
  const estimand = isConfounded && minimalSet.length > 0
    ? `Σ over ${minimalSet.map(label).join(", ")} of P(${outcome} | ${exposure}, covariates) · P(covariates) — backdoor-adjusted effect of ${exposure} on ${outcome}.`
    : `P(${outcome} | do(${exposure})) — the interventional effect of ${exposure} on ${outcome}.`;

  return {
    module,
    punchline,
    estimand,
    primaryOutput: `Crude ${exposure}–${outcome} contrast versus the ${isConfounded ? "adjusted" : "interventional"} contrast, with every conditioned variable classified as backdoor, collider, or neutral.`,
    validity: "Auto-generated from the DAG structure (roles, d-separation, the minimal adjustment set). It assumes the drawn graph is correct.",
    nextAction: isCollider
      ? `Remove ${colliders.map((role) => label(role.node)).join(", ")} from the conditioning set and report the unconditioned effect.`
      : isConfounded
        ? `Adjust for ${minimalSet.map(label).join(", ") || "a valid backdoor set"} and report the adjusted effect.`
        : "Report the crude effect; no adjustment is required.",
    sections: [
      {
        title: "Structure",
        defaultOpen: true,
        items: [
          `Exposure ${exposure}, outcome ${outcome}.`,
          `Conditioned variables: ${conditionedList}.`,
          `Open biasing paths: ${analysis.openBiasingPathCount}.`,
          `Minimal adjustment set: ${minimalSet.length > 0 ? minimalSet.map(label).join(", ") : "none required / none found"}.`
        ]
      },
      {
        title: "Diagnostics",
        defaultOpen: true,
        items: [
          `Crude ${exposure}–${outcome} contrast (the unadjusted comparison).`,
          isConfounded
            ? `Adjusted contrast, standardized over ${minimalSet.map(label).join(", ") || "the backdoor set"}.`
            : `Interventional contrast do(${exposure}).`,
          `Per-variable classification: ${conditionedList}.`
        ]
      },
      {
        title: "Report language",
        items: isCollider
          ? [
            `Say: the apparent ${exposure}–${outcome} association under conditioning is a collider artifact.`,
            `Do not control for ${colliders.map((role) => label(role.node)).join(", ")}.`
          ]
          : isConfounded
            ? [
              `Say: the crude ${exposure}–${outcome} comparison is confounded.`,
              `Report the effect adjusted for ${minimalSet.map(label).join(", ") || "the backdoor set"}.`
            ]
            : [
              `Say: ${exposure} and ${outcome} are unconfounded in this graph.`,
              "Report the crude effect as the causal effect."
            ]
      }
    ]
  };
}

function whatIfDenouement(id: string): ExampleDenouement | null {
  const example = EXAMPLES.find((candidate) => candidate.id === id);
  if (!example || !id.startsWith("what-if-")) return null;
  return {
    module: "What If advanced example",
    punchline: `${example.title} is a book-inspired advanced causal example for separating the target strategy contrast from the easier but misleading observed-data comparison.`,
    estimand: "Define the treatment strategy, time horizon, outcome, and baseline population before reading the graph as an adjustment recipe.",
    primaryOutput: "The pro output computes the available g-method, survival, or censoring-aware contrast from the configured simulated data.",
    validity: "The graph is a teaching DGP, not a reproduction of the book tables; source metadata points to the relevant chapter while app copy is rewritten.",
    nextAction: "Use the graph to decide which histories, censoring variables, and outcome scale must be represented before trusting a contrast.",
    sections: [
      {
        title: "Why this example matters",
        defaultOpen: true,
        items: [
          "It exercises the advanced longitudinal metadata rather than only a static exposure/outcome pair.",
          "It makes time order, strategy assignment, and the outcome horizon visible in the graph.",
          "It gives the UI a concrete stress test for g-methods, survival, and censoring outputs."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Naive conditioning can target an observed-history comparison rather than a strategy contrast.",
          "Dynamic strategies require rules that can be evaluated from prior history, not labels alone.",
          "Censoring and survivor selection change the denominator unless they are represented explicitly."
        ]
      },
      {
        title: "Report language",
        items: [
          "Say: this simulated graph illustrates the identifying structure of the chapter example.",
          "Do not say: these are the published numerical estimates from the book.",
          "Report the strategy, horizon, outcome scale, and censoring treatment together."
        ]
      }
    ]
  };
}

export function exampleDocument(id: string): GraphDocument | null {
  const example = EXAMPLES.find((candidate) => candidate.id === id);
  if (!example) return null;
  const document = parseModel(example.code, example.title).document;
  const configured = id === "galton-regression"
    ? configureGaltonExample(document)
    : example.domain !== "classic"
      ? configurePractitionerExample(document, id)
      : configureClassicExample(document, id);
  if (usesManualExampleLayout(id)) return configured;
  return layoutExampleDocument(configured);
}

function usesManualExampleLayout(id: string): boolean {
  return id === "target-trial-followup" || id.startsWith("what-if-") || id.startsWith("wg-dgm-");
}

export function initialDocument(): GraphDocument {
  return exampleDocument(EXAMPLES[0]?.id ?? "") ?? parseModel(EXAMPLES[0]?.code ?? "dag {}", EXAMPLES[0]?.title ?? "Untitled DAG").document;
}

function configureClassicExample(document: GraphDocument, id: string): GraphDocument {
  const next = prepareDocument(document, exampleSeed(id));
  if (id === "simpson-severity") return configureSimpsonSeverity(next);
  if (id === "icu-mortality-triage") return configureIcuMortalityTriage(next);
  if (id === "college-earnings") return configureCollegeEarnings(next);
  if (id === "tutoring-scores") return configureTutoringScores(next);
  if (id === "front-door-smoking") return configureFrontDoorSmoking(next);
  if (id === "berkson-hospital") return configureBerksonHospital(next);
  if (id === "restaurant-collider") return configureRestaurantCollider(next);
  if (id === "positivity-correlated-confounders") return configurePositivityCorrelatedConfounders(next);
  if (id === "continuous-dose-response") return configureContinuousDoseResponse(next);
  if (id === "confounder-joint-copula") return configureConfounderJointCopula(next);
  if (id === "confounder-triple-copula") return configureConfounderTripleCopula(next);
  if (id === "categorical-regimen") return configureCategoricalRegimen(next);
  if (id === "er-visits-count") return configureErVisitsCount(next);
  if (id === "birthweight-paradox") return configureBirthweightParadox(next);
  if (id === "obesity-paradox") return configureObesityParadox(next);
  if (id === "cats-highrise-syndrome") return configureCatsHighriseSyndrome(next);
  if (id === "instrumental-encouragement") return configureInstrumentalEncouragement(next);
  if (id === "mediation-direct-total") return configureMediationDirectTotal(next);
  if (id === "measurement-error-latent") return configureMeasurementErrorLatent(next);
  if (id === "case-control-selection") return configureCaseControlSelection(next);
  if (id === "policing-encounters") return configurePolicingEncounters(next);
  if (id === "m-bias-adjustment") return configureMBiasAdjustment(next);
  if (id === "lords-paradox") return configureLordsParadox(next);
  return next;
}

function configurePractitionerExample(document: GraphDocument, id: string): GraphDocument {
  const next = prepareDocument(document, exampleSeed(id));
  if (id === "effect-modification-crossover") return configureEffectModificationCrossover(next);
  if (id === "effect-modification-ordinal") return configureEffectModificationOrdinal(next);
  if (id === "moderated-mediation") return configureModeratedMediation(next);
  if (id === "john-snow-cholera") return configureJohnSnowCholera(next);
  if (id === "epistasis-coat-color") return configureEpistasisCoatColor(next);
  if (id === "flexible-adjustment") return configureFlexibleAdjustment(next);
  if (id === "target-trial-followup") return configureTargetTrialFollowup(next);
  if (id === "what-if-treatment-feedback") return configureWhatIfTreatmentFeedback(next);
  if (id === "what-if-ipw-pseudopopulation") return configureWhatIfIpwPseudopopulation(next);
  if (id === "what-if-hazard-selection") return configureWhatIfHazardSelection(next);
  if (id === "what-if-nhefs-mortality-survival") return configureWhatIfNhefsMortalitySurvival(next);
  if (id === "what-if-nhefs-weight-gain") return configureWhatIfNhefsWeightGain(next);
  if (id === "wg-dgm-copula") return configureWhatIfNhefsWeightGainCopula(next);
  if (id === "wg-dgm-plasmode") return configureWhatIfNhefsWeightGainPlasmode(next);
  if (id === "wg-dgm-confounder-dag") return configureWhatIfNhefsWeightGainConfounderDag(next);
  if (id === "wg-dgm-generative") return configureWhatIfNhefsWeightGainGenerative(next);
  if (id === "wg-dgm-positivity") return configureWhatIfNhefsWeightGainPositivity(next);
  if (id === "lalonde-dgm-plasmode") return configureLalondePlasmode(next);
  if (id === "lalonde-dgm-independent") return configureLalondeIndependent(next);
  if (id === "lalonde-dgm-generative") return configureLalondeGenerative(next);
  if (id === "lalonde-recover-rct") return configureLalondeReplay(next);
  if (id === "what-if-weight-gain-g-estimation") return configureWhatIfWeightGainGEstimation(next);
  if (id === "what-if-hiv-cd4-variants") return configureWhatIfHivCd4Variants(next);
  if (id === "what-if-censoring-ipcw") return configureWhatIfCensoringIpcw(next);
  if (id === "what-if-dynamic-g-formula") return configureWhatIfDynamicGFormula(next);
  if (id === "what-if-snaft-survival") return configureWhatIfSnaftSurvival(next);
  if (id === "policy-event-study") return configurePolicyEventStudy(next);
  if (id === "incrementality-uplift") return configureIncrementalityUplift(next);
  if (id === "causal-ml-refutation") return configureCausalMlRefutation(next);
  if (id === "ota-gene-program-traits") return configureOtaGeneProgramTraits(next);
  if (id === "ops-root-cause") return configureOpsRootCause(next);
  if (id === "education-mediation") return configureEducationMediation(next);
  if (id === "chess-intelligence-practice") return configureChessIntelligencePractice(next);
  if (id === "chess-intelligence-practice-simple-flip") return configureChessIntelligenceSimpleFlip(next);
  return next;
}
