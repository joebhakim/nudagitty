import { parseModel } from "./parser";
import { analyzeGraph } from "./analysis";
import { defaultEdgeMechanism, normalizeGraphDocumentMetadata, normalizeNodeMechanism, normalizeSelectionCondition, normalizeVariableModel } from "./graph";
import type { EdgeMechanismKind, GraphDocument, GraphDocumentMetadata, GraphEdge, GraphModel, GraphNode, NodeDistribution, NodeMechanism, Point, SimulationSelectionCondition, VariableModel } from "./types";

export const EXAMPLE_DOMAINS = [
  { id: "classic", label: "Classic DAG patterns", description: "Compact examples for teaching and fast bias checks." },
  { id: "epidemiology", label: "Epidemiology / public health", description: "Target trial thinking, censoring, measurement, selection, and negative controls." },
  { id: "econometrics", label: "Econometrics / public policy", description: "IV, DiD, RD, synthetic control, panel timing, placebos, and exclusion restrictions." },
  { id: "product", label: "Product / experimentation / marketing", description: "A/B tests, incrementality, geolift, uplift, guardrails, and spillovers." },
  { id: "ml", label: "ML / data science", description: "Assumption declaration, graph refutation, discovery hypotheses, and treatment heterogeneity." },
  { id: "operations", label: "Operations / reliability / supply chain", description: "Root-cause analysis, mechanism shifts, and distribution-change attribution." },
  { id: "social", label: "Social science / education / psychology", description: "Mediation, latent constructs, surveys, attrition, and multilevel designs." }
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

type VariablePatch = Partial<Omit<VariableModel, "measurement" | "simulation" | "intervention" | "adjustment">> & {
  measurement?: Partial<VariableModel["measurement"]>;
  simulation?: Partial<VariableModel["simulation"]>;
  intervention?: Partial<VariableModel["intervention"]>;
  adjustment?: Partial<VariableModel["adjustment"]>;
};

const ZERO_NOISE: NodeDistribution = { kind: "constant", value: 0 };
const UNIT_NORMAL: NodeDistribution = { kind: "normal", mean: 0, sd: 1 };

const WHAT_IF_SHOWCASE_DYNAMIC_RULES_CODE = `dag {
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
}`;

const WHAT_IF_SHOWCASE_SURVIVAL_CURVES_CODE = `dag {
  Age [adjusted,pos="-2.55,3.5"]
  Baseline_health [adjusted,label="baseline health",pos="-0.8,3.5"]
  Quit_smoking [exposure,label="quit smoking",pos="-1.55,2.05"]
  Weight_gain_2y [label="2-year weight gain",pos="-0.3,0.65"]
  Censoring_5y [selected,label="censoring by 5y",pos="1.25,-0.4"]
  Death_5y [label="death by 5y",pos="-0.45,-0.95"]
  Death_10y [outcome,label="death by 10y",pos="0.35,-2.35"]
  Age -> Quit_smoking
  Age -> Censoring_5y
  Age -> Death_5y
  Age -> Death_10y
  Baseline_health -> Quit_smoking
  Baseline_health -> Weight_gain_2y
  Baseline_health -> Censoring_5y
  Baseline_health -> Death_5y
  Baseline_health -> Death_10y
  Quit_smoking -> Weight_gain_2y
  Quit_smoking -> Death_5y
  Quit_smoking -> Death_10y
  Weight_gain_2y -> Death_10y
  Censoring_5y -> Death_10y
  Death_5y -> Death_10y
}`;

const WHAT_IF_SHOWCASE_HAZARD_DENOMINATOR_CODE = `dag {
  Frailty [adjusted,label="baseline frailty",pos="-1.8,2.6"]
  Treatment_A [exposure,label="treatment A",pos="0.1,1.3"]
  Death_1 [label="early death",pos="-0.65,0.05"]
  Alive_1 [selected,label="alive at t1",pos="0.55,-1.15"]
  Death_2 [outcome,label="later death",pos="1.55,-2.45"]
  Frailty -> Treatment_A
  Frailty -> Death_1
  Frailty -> Death_2
  Treatment_A -> Death_1
  Treatment_A -> Death_2
  Death_1 -> Alive_1
  Alive_1 -> Death_2
}`;

const WHAT_IF_SHOWCASE_G_ESTIMATION_CODE = `dag {
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
}`;

const WHAT_IF_SHOWCASE_IPCW_CODE = `dag {
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
  C1 -> Y
  A1 -> C2
  A1 -> Y
  C2 -> Y
}`;

const WHAT_IF_SHOWCASE_SNAFT_CODE = `dag {
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
  Censoring -> Observed_death
}`;

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
    summary: "Encouragement design with latent health confounding treatment uptake and outcome.",
    code: `dag {
  Encouragement [exposure,pos="-2,0"]
  Treatment [pos="0,0"]
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
  Censoring -> Outcome_90d
}`
  },
  {
    id: "what-if-showcase-dynamic-rules",
    title: "Showcase: sequential dynamic g-formula",
    domain: "epidemiology",
    summary: "A compact rule-based treatment strategy example: each action is assigned from the current risk history before downstream variables are generated.",
    outputModule: "what-if-dynamic-g-formula",
    code: WHAT_IF_SHOWCASE_DYNAMIC_RULES_CODE
  },
  {
    id: "what-if-showcase-survival-curves",
    title: "Showcase: strategy-specific survival curves",
    domain: "epidemiology",
    summary: "Smoking-cessation survival readout where quit and continue strategies get their own survival curves, final risk difference, and absorbing death edge.",
    outputModule: "what-if-nhefs-mortality-survival",
    code: WHAT_IF_SHOWCASE_SURVIVAL_CURVES_CODE
  },
  {
    id: "what-if-showcase-hazard-denominator",
    title: "Showcase: survivor denominators",
    domain: "epidemiology",
    summary: "Two-interval hazard example that keeps early deaths and later survivor conditioning visible instead of collapsing everything into one endpoint.",
    outputModule: "what-if-hazard-selection",
    code: WHAT_IF_SHOWCASE_HAZARD_DENOMINATOR_CODE
  },
  {
    id: "what-if-showcase-g-estimation",
    title: "Showcase: g-estimation blip coefficients",
    domain: "epidemiology",
    summary: "Smoking-cessation weight-gain example focused on the structural-nested mean-model row and its additive g-estimation diagnostics.",
    outputModule: "what-if-weight-gain-g-estimation",
    code: WHAT_IF_SHOWCASE_G_ESTIMATION_CODE
  },
  {
    id: "what-if-showcase-ipcw",
    title: "Showcase: censoring weights (IPCW)",
    domain: "epidemiology",
    summary: "Longitudinal treatment example where censoring is explicit and the output foregrounds IPW/IPCW support rather than a naive complete-case read.",
    outputModule: "what-if-censoring-ipcw",
    code: WHAT_IF_SHOWCASE_IPCW_CODE
  },
  {
    id: "what-if-showcase-snaft",
    title: "Showcase: structural nested survival time",
    domain: "epidemiology",
    summary: "Failure-time example that separates a mean survival-time contrast from observed-death and censoring diagnostics.",
    outputModule: "what-if-snaft-survival",
    code: WHAT_IF_SHOWCASE_SNAFT_CODE
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
  Alive_1 [selected,label="alive at t1",pos="0.55,-1.15"]
  Death_2 [outcome,label="later death",pos="1.55,-2.45"]
  Frailty -> Treatment_A
  Frailty -> Death_1
  Frailty -> Death_2
  Treatment_A -> Death_1
  Treatment_A -> Death_2
  Death_1 -> Alive_1
  Alive_1 -> Death_2
}`
  },
  {
    id: "what-if-nhefs-mortality-survival",
    title: "What If: NHEFS smoking cessation and mortality",
    domain: "epidemiology",
    summary: "Target-trial survival sketch for smoking cessation, follow-up death indicators, weight change, and censoring.",
    outputModule: "what-if-nhefs-mortality-survival",
    code: `dag {
  Age [adjusted,pos="-2.55,3.5"]
  Baseline_health [adjusted,label="baseline health",pos="-0.8,3.5"]
  Quit_smoking [exposure,label="quit smoking",pos="-1.55,2.05"]
  Weight_gain_2y [label="2-year weight gain",pos="-0.3,0.65"]
  Censoring_5y [selected,label="censoring by 5y",pos="1.25,-0.4"]
  Death_5y [label="death by 5y",pos="-0.45,-0.95"]
  Death_10y [outcome,label="death by 10y",pos="0.35,-2.35"]
  Age -> Quit_smoking
  Age -> Censoring_5y
  Age -> Death_5y
  Age -> Death_10y
  Baseline_health -> Quit_smoking
  Baseline_health -> Weight_gain_2y
  Baseline_health -> Censoring_5y
  Baseline_health -> Death_5y
  Baseline_health -> Death_10y
  Quit_smoking -> Weight_gain_2y
  Quit_smoking -> Death_5y
  Quit_smoking -> Death_10y
  Weight_gain_2y -> Death_10y
  Censoring_5y -> Death_10y
  Death_5y -> Death_10y
}`
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
    id: "what-if-hiv-cd4-variants",
    title: "What If: HIV treatment variants over CD4 history",
    domain: "epidemiology",
    summary: "Three-visit HIV treatment example with CD4 feedback and dynamic treatment variants.",
    outputModule: "what-if-hiv-cd4-variants",
    code: `dag {
  CD4_0 [adjusted,label="CD4 at baseline",pos="-1.2,3.8"]
  A0 [exposure,label="ART A0",pos="0.55,2.7"]
  CD4_1 [adjusted,label="CD4 at t1",pos="-0.75,1.6"]
  A1 [label="ART A1",pos="0.8,0.45"]
  CD4_2 [adjusted,label="CD4 at t2",pos="-0.45,-0.7"]
  A2 [label="ART A2",pos="0.9,-1.75"]
  AIDS_death [outcome,label="AIDS/death",pos="0,-3"]
  CD4_0 -> A0
  CD4_0 -> CD4_1
  CD4_0 -> AIDS_death
  A0 -> CD4_1
  A0 -> A1
  A0 -> AIDS_death
  CD4_1 -> A1
  CD4_1 -> CD4_2
  CD4_1 -> AIDS_death
  A1 -> CD4_2
  A1 -> A2
  A1 -> AIDS_death
  CD4_2 -> A2
  CD4_2 -> AIDS_death
  A2 -> AIDS_death
}`
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
  C1 -> Y
  A1 -> C2
  A1 -> Y
  C2 -> Y
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
  Censoring -> Observed_death
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
  return id === "target-trial-followup" || id.startsWith("what-if-");
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
  if (id === "target-trial-followup") return configureTargetTrialFollowup(next);
  if (id === "what-if-showcase-dynamic-rules") return configureWhatIfDynamicGFormula(next);
  if (id === "what-if-showcase-survival-curves") return configureWhatIfNhefsMortalitySurvival(next);
  if (id === "what-if-showcase-hazard-denominator") return configureWhatIfHazardSelection(next);
  if (id === "what-if-showcase-g-estimation") return configureWhatIfWeightGainGEstimation(next);
  if (id === "what-if-showcase-ipcw") return configureWhatIfCensoringIpcw(next);
  if (id === "what-if-showcase-snaft") return configureWhatIfSnaftSurvival(next);
  if (id === "what-if-treatment-feedback") return configureWhatIfTreatmentFeedback(next);
  if (id === "what-if-ipw-pseudopopulation") return configureWhatIfIpwPseudopopulation(next);
  if (id === "what-if-hazard-selection") return configureWhatIfHazardSelection(next);
  if (id === "what-if-nhefs-mortality-survival") return configureWhatIfNhefsMortalitySurvival(next);
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

function configureSimpsonSeverity(document: GraphDocument): GraphDocument {
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

function configureIcuMortalityTriage(document: GraphDocument): GraphDocument {
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

function configureCollegeEarnings(document: GraphDocument): GraphDocument {
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

function configureTutoringScores(document: GraphDocument): GraphDocument {
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

function configureFrontDoorSmoking(document: GraphDocument): GraphDocument {
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

function configureBerksonHospital(document: GraphDocument): GraphDocument {
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

function configureBirthweightParadox(document: GraphDocument): GraphDocument {
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

function configureObesityParadox(document: GraphDocument): GraphDocument {
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

function configureCatsHighriseSyndrome(document: GraphDocument): GraphDocument {
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

function configureInstrumentalEncouragement(document: GraphDocument): GraphDocument {
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

function configureMediationDirectTotal(document: GraphDocument): GraphDocument {
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

function configureMeasurementErrorLatent(document: GraphDocument): GraphDocument {
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

function configureCaseControlSelection(document: GraphDocument): GraphDocument {
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

function configurePolicingEncounters(document: GraphDocument): GraphDocument {
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

function configureMBiasAdjustment(document: GraphDocument): GraphDocument {
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

function configureLordsParadox(document: GraphDocument): GraphDocument {
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

function configureTargetTrialFollowup(document: GraphDocument): GraphDocument {
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
  setLinearCoefficient(document, "Censoring", "Outcome_90d", 0.9);
  return document;
}

function configureWhatIfTreatmentFeedback(document: GraphDocument): GraphDocument {
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

function configureWhatIfIpwPseudopopulation(document: GraphDocument): GraphDocument {
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

function configureWhatIfHazardSelection(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 6000);
  setContinuousVariable(document, "Frailty", "Baseline frailty that affects treatment and each interval's mortality risk.", "frailty z-score");
  setBinaryVariable(document, "Treatment_A", "Treatment at baseline.", "treated");
  setBinaryVariable(document, "Death_1", "Death during the first interval.", "death");
  setBinaryVariable(document, "Alive_1", "Indicator for surviving into the second interval.", "alive");
  setBinaryVariable(document, "Death_2", "Death during the second interval, observed among those still at risk.", "death");
  setNode(document, "Frailty", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Treatment_A", -0.25);
  setLogitNode(document, "Death_1", -2.4);
  setLogitNode(document, "Alive_1", 3.0);
  setLogitNode(document, "Death_2", -4.0);
  setLinearCoefficient(document, "Frailty", "Treatment_A", 1.05);
  setLinearCoefficient(document, "Frailty", "Death_1", 1.35);
  setLinearCoefficient(document, "Frailty", "Death_2", 1.15);
  setLinearCoefficient(document, "Treatment_A", "Death_1", -0.75);
  setLinearCoefficient(document, "Treatment_A", "Death_2", -0.3);
  setLinearCoefficient(document, "Death_1", "Alive_1", -6.0);
  setLinearCoefficient(document, "Alive_1", "Death_2", 3.1);
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

function configureWhatIfNhefsMortalitySurvival(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 7000);
  setContinuousVariable(document, "Age", "Baseline age at the start of follow-up.", "years");
  setContinuousVariable(document, "Baseline_health", "Baseline prognosis and smoking history summary.", "health z-score");
  setBinaryVariable(document, "Quit_smoking", "Smoking cessation at baseline.", "quit");
  setContinuousVariable(document, "Weight_gain_2y", "Weight change after quitting, measured before later mortality.", "kg");
  setBinaryVariable(document, "Censoring_5y", "Loss to follow-up by the intermediate visit.", "censored");
  setBinaryVariable(document, "Death_5y", "Cumulative death by the intermediate follow-up.", "death");
  setBinaryVariable(document, "Death_10y", "Cumulative death by the later follow-up. Anyone dead by 5 years is necessarily dead by 10 years.", "death");
  setNode(document, "Age", { distribution: { kind: "normal", mean: 50, sd: 10 }, noise: ZERO_NOISE });
  setNode(document, "Baseline_health", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Quit_smoking", 0.0);
  setNode(document, "Weight_gain_2y", { intercept: 2.2, noise: { kind: "normal", mean: 0, sd: 2.4 } });
  setLogitNode(document, "Censoring_5y", -2.4);
  setLogitNode(document, "Death_5y", -3.3);
  setLogitNode(document, "Death_10y", -2.7);
  setLinearCoefficient(document, "Age", "Quit_smoking", -0.012);
  setLinearCoefficient(document, "Age", "Censoring_5y", 0.025);
  setLinearCoefficient(document, "Age", "Death_5y", 0.035);
  setLinearCoefficient(document, "Age", "Death_10y", 0.032);
  setLinearCoefficient(document, "Baseline_health", "Quit_smoking", -0.55);
  setLinearCoefficient(document, "Baseline_health", "Weight_gain_2y", -0.7);
  setLinearCoefficient(document, "Baseline_health", "Censoring_5y", 0.6);
  setLinearCoefficient(document, "Baseline_health", "Death_5y", 1.1);
  setLinearCoefficient(document, "Baseline_health", "Death_10y", 1.0);
  setLinearCoefficient(document, "Quit_smoking", "Weight_gain_2y", 4.1);
  setLinearCoefficient(document, "Quit_smoking", "Death_5y", -0.35);
  setLinearCoefficient(document, "Quit_smoking", "Death_10y", -0.45);
  setLinearCoefficient(document, "Weight_gain_2y", "Death_10y", 0.045);
  setLinearCoefficient(document, "Censoring_5y", "Death_10y", 0.7);
  setEdgeMechanism(document, "Death_5y", "Death_10y", "absorbing", {});
  applyWhatIfMetadata(document, {
    chapter: "Chapter 17",
    section: "Survival analysis and target-trial follow-up",
    reference: "NHEFS smoking cessation mortality structure",
    longitudinal: {
      timePoints: [
        { id: "t0", label: "baseline", order: 0 },
        { id: "t1", label: "5 years", order: 1 },
        { id: "t2", label: "10 years", order: 2 }
      ],
      variables: {
        Age: { series: "age", time: "t0", role: "baseline" },
        Baseline_health: { series: "health", time: "t0", role: "baseline" },
        Quit_smoking: { series: "treatment", time: "t0", role: "treatment" },
        Weight_gain_2y: { series: "weight", time: "t1", role: "time_varying_confounder" },
        Censoring_5y: { series: "censoring", time: "t1", role: "censoring" },
        Death_5y: { series: "death", time: "t1", role: "outcome" },
        Death_10y: { series: "death", time: "t2", role: "outcome" }
      },
      treatmentStrategies: binaryStrategies("quit", "Quit smoking", "Quit_smoking", "Set smoking cessation to 1 at baseline.", "continue", "Continue smoking", "Quit_smoking", "Set smoking cessation to 0 at baseline."),
      estimands: [riskEstimand("quit-vs-continue-mortality-risk", "quit vs continue mortality risk", "Death_10y", ["quit", "continue"], "10 years")],
      censoring: [{ id: "censoring-5y", variable: "Censoring_5y", time: "t1", description: "Loss to follow-up before the later death indicator." }],
      survivalOutputs: [survivalSpec("mortality-survival", "mortality survival", ["Death_5y", "Death_10y"], ["Censoring_5y"])]
    }
  });
  return document;
}

function configureWhatIfWeightGainGEstimation(document: GraphDocument): GraphDocument {
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
        Diet_change: { series: "behavior", time: "t1", role: "time_varying_confounder" },
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

function configureWhatIfHivCd4Variants(document: GraphDocument): GraphDocument {
  setExampleSampleSize(document, 7000);
  markExposures(document, ["A0", "A1", "A2"]);
  setBinaryVariable(document, "CD4_0", "Baseline low-CD4 indicator.", "low CD4");
  setBinaryVariable(document, "A0", "Antiretroviral treatment at baseline.", "treated");
  setBinaryVariable(document, "CD4_1", "Low-CD4 indicator at the first follow-up.", "low CD4");
  setBinaryVariable(document, "A1", "Antiretroviral treatment at the first follow-up.", "treated");
  setBinaryVariable(document, "CD4_2", "Low-CD4 indicator at the second follow-up.", "low CD4");
  setBinaryVariable(document, "A2", "Antiretroviral treatment at the second follow-up.", "treated");
  setBinaryVariable(document, "AIDS_death", "AIDS or death endpoint.", "event");
  setNode(document, "CD4_0", { distribution: { kind: "bernoulli", p: 0.38 }, noise: ZERO_NOISE });
  setLogitNode(document, "A0", -0.45);
  setLogitNode(document, "CD4_1", -0.35);
  setLogitNode(document, "A1", -0.55);
  setLogitNode(document, "CD4_2", -0.45);
  setLogitNode(document, "A2", -0.65);
  setLogitNode(document, "AIDS_death", -2.5);
  setLinearCoefficient(document, "CD4_0", "A0", 1.3);
  setLinearCoefficient(document, "CD4_0", "CD4_1", 1.6);
  setLinearCoefficient(document, "CD4_0", "AIDS_death", 0.8);
  setLinearCoefficient(document, "A0", "CD4_1", -0.7);
  setLinearCoefficient(document, "A0", "A1", 1.1);
  setLinearCoefficient(document, "A0", "AIDS_death", -0.35);
  setLinearCoefficient(document, "CD4_1", "A1", 1.35);
  setLinearCoefficient(document, "CD4_1", "CD4_2", 1.5);
  setLinearCoefficient(document, "CD4_1", "AIDS_death", 0.95);
  setLinearCoefficient(document, "A1", "CD4_2", -0.75);
  setLinearCoefficient(document, "A1", "A2", 1.0);
  setLinearCoefficient(document, "A1", "AIDS_death", -0.4);
  setLinearCoefficient(document, "CD4_2", "A2", 1.45);
  setLinearCoefficient(document, "CD4_2", "AIDS_death", 1.05);
  setLinearCoefficient(document, "A2", "AIDS_death", -0.5);
  applyWhatIfMetadata(document, {
    chapter: "Chapter 19",
    section: "Treatment strategies and treatment variants",
    reference: "HIV/CD4 time-varying treatment structure",
    longitudinal: {
      timePoints: [
        { id: "t0", label: "baseline", order: 0 },
        { id: "t1", label: "visit 1", order: 1 },
        { id: "t2", label: "visit 2", order: 2 },
        { id: "t3", label: "endpoint", order: 3 }
      ],
      variables: {
        CD4_0: { series: "cd4", time: "t0", role: "baseline" },
        A0: { series: "art", time: "t0", role: "treatment" },
        CD4_1: { series: "cd4", time: "t1", role: "time_varying_confounder" },
        A1: { series: "art", time: "t1", role: "treatment" },
        CD4_2: { series: "cd4", time: "t2", role: "time_varying_confounder" },
        A2: { series: "art", time: "t2", role: "treatment" },
        AIDS_death: { series: "event", time: "t3", role: "outcome" }
      },
      treatmentStrategies: [
        dynamicLowRiskStrategy("treat-low-cd4", "treat when CD4 is low", ["A0", "A1", "A2"], ["CD4_0", "CD4_1", "CD4_2"], "Start or continue treatment when the current CD4 risk indicator is high."),
        staticStrategy("never-art", "never ART", "Keep A0=A1=A2=0.", [["A0", 0], ["A1", 0], ["A2", 0]]),
        staticStrategy("always-art", "always ART", "Keep A0=A1=A2=1.", [["A0", 1], ["A1", 1], ["A2", 1]])
      ],
      estimands: [riskEstimand("dynamic-vs-never-aids-death", "dynamic CD4 rule vs never ART", "AIDS_death", ["treat-low-cd4", "never-art"], "endpoint")],
      censoring: [],
      survivalOutputs: []
    }
  });
  return document;
}

function configureWhatIfCensoringIpcw(document: GraphDocument): GraphDocument {
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
  setLinearCoefficient(document, "C1", "Y", 0.7);
  setLinearCoefficient(document, "A1", "C2", -0.25);
  setLinearCoefficient(document, "A1", "Y", -0.45);
  setLinearCoefficient(document, "C2", "Y", 0.8);
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

function configureWhatIfDynamicGFormula(document: GraphDocument): GraphDocument {
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

function configureWhatIfSnaftSurvival(document: GraphDocument): GraphDocument {
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
  setLinearCoefficient(document, "Censoring", "Observed_death", 0.75);
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

function configurePolicyEventStudy(document: GraphDocument): GraphDocument {
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

function configureIncrementalityUplift(document: GraphDocument): GraphDocument {
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

function configureCausalMlRefutation(document: GraphDocument): GraphDocument {
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

function configureOtaGeneProgramTraits(document: GraphDocument): GraphDocument {
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

function configureOpsRootCause(document: GraphDocument): GraphDocument {
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

function configureEducationMediation(document: GraphDocument): GraphDocument {
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

function configureChessIntelligencePractice(document: GraphDocument): GraphDocument {
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

function configureChessIntelligenceSimpleFlip(document: GraphDocument): GraphDocument {
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

function configureGaltonExample(document: GraphDocument): GraphDocument {
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

function prepareDocument(document: GraphDocument, seed: number): GraphDocument {
  return {
    ...document,
    graph: {
      ...document.graph,
      nodes: document.graph.nodes.map((node) => ({
        ...node,
        variable: normalizeVariableModel(node.variable)
      }))
    },
    simulation: {
      ...document.simulation,
      nodes: { ...document.simulation.nodes },
      edges: { ...document.simulation.edges },
      seed
    }
  };
}

const EXAMPLE_LAYER_GAP = 132;
const EXAMPLE_DEEP_LAYER_GAP = 104;
const EXAMPLE_NODE_GAP = 48;
const EXAMPLE_NODE_MIN_WIDTH = 124;
const EXAMPLE_NODE_MAX_WIDTH = 196;
const EXAMPLE_LABEL_CHAR_WIDTH = 7.4;
const EXAMPLE_FIGURELET_WIDTH = 116;
const EXAMPLE_COLLINEAR_THRESHOLD = 58;
const EXAMPLE_SINGLETON_NUDGE = 116;
const EXAMPLE_ROLE_ORDER: Record<keyof GraphNode["roles"], number> = {
  latent: 0,
  adjusted: 1,
  exposure: 2,
  outcome: 3,
  selected: 4
};

function layoutExampleDocument(document: GraphDocument): GraphDocument {
  return {
    ...document,
    graph: layoutExampleGraph(document.graph)
  };
}

function layoutExampleGraph(graph: GraphModel): GraphModel {
  if (graph.nodes.length <= 1) return graph;
  const directedEdges = graph.edges.filter(isRankedEdge);
  const rankById = rankExampleNodes(graph, directedEdges);
  const layers = orderExampleLayers(graph, directedEdges, rankById);
  const nodeWidth = new Map(graph.nodes.map((node) => [node.id, exampleLayoutNodeWidth(node)]));
  const positions = new Map<string, Point>();
  const layerGap = exampleLayerGap(layers.length);
  const totalHeight = (layers.length - 1) * layerGap;
  for (const [layerIndex, layer] of layers.entries()) {
    const xPositions = exampleLayerXPositions(layer, nodeWidth);
    for (const node of layer) {
      positions.set(node.id, {
        x: xPositions.get(node.id) ?? node.position.x,
        y: layerIndex * layerGap - totalHeight / 2
      });
    }
  }
  breakExampleSingletonCollinearity(layers, positions);
  centerExamplePositions(positions, nodeWidth);
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? node.position
    })),
    edges: graph.edges.map((edge) => edge.control ? { ...edge, control: undefined } : edge)
  };
}

function exampleLayerGap(layerCount: number): number {
  return layerCount >= 5 ? EXAMPLE_DEEP_LAYER_GAP : EXAMPLE_LAYER_GAP;
}

function exampleLayerXPositions(layer: GraphNode[], nodeWidth: Map<string, number>): Map<string, number> {
  const sorted = [...layer].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
  const positions = new Map(sorted.map((node) => [node.id, node.position.x]));
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    const minGap = ((nodeWidth.get(previous.id) ?? EXAMPLE_NODE_MIN_WIDTH) + (nodeWidth.get(current.id) ?? EXAMPLE_NODE_MIN_WIDTH)) / 2 + EXAMPLE_NODE_GAP;
    const previousX = positions.get(previous.id) ?? previous.position.x;
    const currentX = positions.get(current.id) ?? current.position.x;
    if (currentX - previousX < minGap) positions.set(current.id, previousX + minGap);
  }
  for (let index = sorted.length - 2; index >= 0; index -= 1) {
    const current = sorted[index]!;
    const next = sorted[index + 1]!;
    const minGap = ((nodeWidth.get(current.id) ?? EXAMPLE_NODE_MIN_WIDTH) + (nodeWidth.get(next.id) ?? EXAMPLE_NODE_MIN_WIDTH)) / 2 + EXAMPLE_NODE_GAP;
    const currentX = positions.get(current.id) ?? current.position.x;
    const nextX = positions.get(next.id) ?? next.position.x;
    if (nextX - currentX < minGap) positions.set(current.id, nextX - minGap);
  }
  const originalCenter = sorted.length === 0 ? 0 : sorted.reduce((sum, node) => sum + node.position.x, 0) / sorted.length;
  const adjustedCenter = sorted.length === 0 ? 0 : sorted.reduce((sum, node) => sum + (positions.get(node.id) ?? node.position.x), 0) / sorted.length;
  const delta = originalCenter - adjustedCenter;
  for (const node of sorted) positions.set(node.id, (positions.get(node.id) ?? node.position.x) + delta);
  return positions;
}

function breakExampleSingletonCollinearity(layers: GraphNode[][], positions: Map<string, Point>) {
  if (layers.length < 3) return;
  if (!layers.every((layer) => layer.length === 1)) return;
  for (let layerIndex = 1; layerIndex < layers.length - 1; layerIndex += 1) {
    const previous = layers[layerIndex - 1];
    const current = layers[layerIndex];
    const next = layers[layerIndex + 1];
    if (!previous || !current || !next || previous.length !== 1 || current.length !== 1 || next.length !== 1) continue;
    const previousPoint = positions.get(previous[0]!.id);
    const currentNode = current[0]!;
    const currentPoint = positions.get(currentNode.id);
    const nextPoint = positions.get(next[0]!.id);
    if (!previousPoint || !currentPoint || !nextPoint) continue;
    const expectedX = (previousPoint.x + nextPoint.x) / 2;
    if (Math.abs(currentPoint.x - expectedX) > EXAMPLE_COLLINEAR_THRESHOLD) continue;
    const direction = exampleSingletonNudgeDirection(currentNode, layerIndex, currentPoint.x - expectedX);
    positions.set(currentNode.id, {
      ...currentPoint,
      x: expectedX + direction * EXAMPLE_SINGLETON_NUDGE
    });
  }
}

function exampleSingletonNudgeDirection(node: GraphNode, layerIndex: number, deltaFromLine: number): -1 | 1 {
  if (node.roles.exposure) return -1;
  if (node.roles.outcome || node.roles.selected) return 1;
  if (Math.abs(deltaFromLine) > 1e-6) return deltaFromLine > 0 ? 1 : -1;
  return layerIndex % 2 === 0 ? 1 : -1;
}

function centerExamplePositions(positions: Map<string, Point>, nodeWidth: Map<string, number>) {
  if (positions.size === 0) return;
  const entries = [...positions.entries()];
  const minX = Math.min(...entries.map(([id, point]) => point.x - (nodeWidth.get(id) ?? EXAMPLE_NODE_MIN_WIDTH) / 2));
  const maxX = Math.max(...entries.map(([id, point]) => point.x + (nodeWidth.get(id) ?? EXAMPLE_NODE_MIN_WIDTH) / 2));
  const delta = -(minX + maxX) / 2;
  for (const [id, point] of entries) {
    positions.set(id, { ...point, x: point.x + delta });
  }
}

function rankExampleNodes(graph: GraphModel, directedEdges: GraphEdge[]): Map<string, number> {
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const children = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of directedEdges) {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    children.get(edge.source)?.push(edge.target);
  }
  const order = originalExampleNodeOrder(graph);
  const ready = graph.nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .sort((a, b) => compareExampleNodes(a, b, order));
  const rank = new Map(graph.nodes.map((node) => [node.id, 0]));
  const visited = new Set<string>();
  while (ready.length > 0) {
    const node = ready.shift()!;
    visited.add(node.id);
    for (const child of children.get(node.id) ?? []) {
      rank.set(child, Math.max(rank.get(child) ?? 0, (rank.get(node.id) ?? 0) + 1));
      indegree.set(child, (indegree.get(child) ?? 0) - 1);
      if ((indegree.get(child) ?? 0) === 0) {
        const childNode = graph.nodes.find((candidate) => candidate.id === child);
        if (childNode) {
          ready.push(childNode);
          ready.sort((a, b) => compareExampleNodes(a, b, order));
        }
      }
    }
  }
  for (const node of graph.nodes) {
    if (!visited.has(node.id)) rank.set(node.id, Math.max(0, Math.round(node.position.y / EXAMPLE_LAYER_GAP)));
  }
  return compactExampleRanks(rank);
}

function compactExampleRanks(rank: Map<string, number>): Map<string, number> {
  const values = [...new Set(rank.values())].sort((a, b) => a - b);
  const compacted = new Map(values.map((value, index) => [value, index]));
  return new Map([...rank.entries()].map(([id, value]) => [id, compacted.get(value) ?? 0]));
}

function orderExampleLayers(graph: GraphModel, directedEdges: GraphEdge[], rankById: Map<string, number>): GraphNode[][] {
  const order = originalExampleNodeOrder(graph);
  const maxRank = Math.max(...rankById.values(), 0);
  const layers = Array.from({ length: maxRank + 1 }, (_, rank) => graph.nodes
    .filter((node) => rankById.get(node.id) === rank)
    .sort((a, b) => compareExampleNodes(a, b, order)));
  const parents = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  const children = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of directedEdges) {
    parents.get(edge.target)?.push(edge.source);
    children.get(edge.source)?.push(edge.target);
  }
  for (let pass = 0; pass < 4; pass += 1) {
    for (let rank = 1; rank < layers.length; rank += 1) {
      sortLayerByBarycenter(layers[rank]!, layers, parents, order);
    }
    for (let rank = layers.length - 2; rank >= 0; rank -= 1) {
      sortLayerByBarycenter(layers[rank]!, layers, children, order);
    }
  }
  return layers;
}

function sortLayerByBarycenter(layer: GraphNode[], layers: GraphNode[][], neighbors: Map<string, string[]>, order: Map<string, number>) {
  const indexById = new Map<string, number>();
  for (const currentLayer of layers) {
    currentLayer.forEach((node, index) => indexById.set(node.id, index));
  }
  layer.sort((a, b) => {
    const aScore = exampleBarycenter(a.id, neighbors, indexById);
    const bScore = exampleBarycenter(b.id, neighbors, indexById);
    if (Math.abs(aScore - bScore) > 1e-6) return aScore - bScore;
    return compareExampleNodes(a, b, order);
  });
}

function exampleBarycenter(nodeId: string, neighbors: Map<string, string[]>, indexById: Map<string, number>): number {
  const indexes = (neighbors.get(nodeId) ?? [])
    .map((neighbor) => indexById.get(neighbor))
    .filter((value): value is number => value !== undefined);
  if (indexes.length === 0) return Number.POSITIVE_INFINITY;
  return indexes.reduce((sum, value) => sum + value, 0) / indexes.length;
}

function compareExampleNodes(a: GraphNode, b: GraphNode, order: Map<string, number>): number {
  const roleDelta = exampleRoleSort(a) - exampleRoleSort(b);
  if (roleDelta !== 0) return roleDelta;
  const xDelta = a.position.x - b.position.x;
  if (Math.abs(xDelta) > 1e-6) return xDelta;
  const yDelta = a.position.y - b.position.y;
  if (Math.abs(yDelta) > 1e-6) return yDelta;
  return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
}

function exampleRoleSort(node: GraphNode): number {
  const active = (Object.keys(node.roles) as Array<keyof GraphNode["roles"]>)
    .filter((role) => node.roles[role])
    .map((role) => EXAMPLE_ROLE_ORDER[role]);
  return active.length === 0 ? 2.5 : Math.min(...active);
}

function originalExampleNodeOrder(graph: GraphModel): Map<string, number> {
  return new Map(graph.nodes.map((node, index) => [node.id, index]));
}

function isRankedEdge(edge: GraphEdge): boolean {
  return edge.kind === "directed" || edge.kind === "partialDirected";
}

function exampleLayoutNodeWidth(node: GraphNode): number {
  const labelLines = exampleNodeLabelLines(node.label || node.id);
  const labelWidth = Math.max(...labelLines.map((line) => line.length), 1) * EXAMPLE_LABEL_CHAR_WIDTH + 34;
  return Math.max(EXAMPLE_NODE_MIN_WIDTH, Math.min(EXAMPLE_NODE_MAX_WIDTH, Math.max(labelWidth, EXAMPLE_FIGURELET_WIDTH)));
}

function exampleNodeLabelLines(label: string): string[] {
  const normalized = label.replace(/_/g, " ").trim();
  if (normalized.length <= 11) return [normalized];
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [normalized];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= 11 || current.length === 0) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  if (lines.length <= 3) return lines;
  return [lines[0]!, lines[1]!, lines.slice(2).join(" ")];
}

type WhatIfMetadataConfig = {
  chapter: string;
  section: string;
  reference: string;
  longitudinal: GraphDocumentMetadata["longitudinal"];
};

function applyWhatIfMetadata(document: GraphDocument, config: WhatIfMetadataConfig) {
  document.metadata = normalizeGraphDocumentMetadata({
    ...document.metadata,
    longitudinal: config.longitudinal,
    sources: [
      ...document.metadata.sources.filter((source) => source.id !== "hernan-robins-what-if"),
      {
        id: "hernan-robins-what-if",
        label: "What If",
        authors: "Miguel A. Hernan and James M. Robins",
        title: "Causal Inference: What If",
        year: "2025",
        url: "https://www.hsph.harvard.edu/miguel-hernan/causal-inference-book/",
        chapter: config.chapter,
        section: config.section,
        reference: config.reference,
        note: "Book-inspired structure; all app explanations and simulation settings are rewritten for Nudagitty."
      }
    ]
  });
}

function staticStrategy(id: string, label: string, description: string, assignments: Array<[string, number]>): GraphDocumentMetadata["longitudinal"]["treatmentStrategies"][number] {
  return {
    id,
    label,
    description,
    kind: "static",
    assignments: assignments.map(([variable, value]) => ({ variable, value })),
    rules: []
  };
}

function binaryStrategies(
  leftId: string,
  leftLabel: string,
  leftVariable: string,
  leftDescription: string,
  rightId: string,
  rightLabel: string,
  rightVariable: string,
  rightDescription: string
): GraphDocumentMetadata["longitudinal"]["treatmentStrategies"] {
  return [
    staticStrategy(leftId, leftLabel, leftDescription, [[leftVariable, 1]]),
    staticStrategy(rightId, rightLabel, rightDescription, [[rightVariable, 0]])
  ];
}

function dynamicLowRiskStrategy(id: string, label: string, treatments: string[], riskVariables: string[], description: string): GraphDocumentMetadata["longitudinal"]["treatmentStrategies"][number] {
  return {
    id,
    label,
    description,
    kind: "dynamic",
    assignments: [],
    rules: treatments.map((variable, index) => ({
      variable,
      value: 1,
      conditionVariable: riskVariables[index] ?? riskVariables[riskVariables.length - 1] ?? variable,
      operator: "eq",
      conditionValue: 1,
      otherwise: 0
    }))
  };
}

function riskEstimand(id: string, label: string, outcome: string, strategies: string[], horizon: string): GraphDocumentMetadata["longitudinal"]["estimands"][number] {
  return {
    id,
    label,
    type: "risk_difference",
    outcome,
    strategies,
    population: "baseline simulated cohort",
    horizon
  };
}

function survivalSpec(id: string, label: string, eventVariables: string[], censoringVariables: string[]): GraphDocumentMetadata["longitudinal"]["survivalOutputs"][number] {
  return {
    id,
    label,
    timeVariable: null,
    eventVariable: eventVariables[0] ?? "",
    eventVariables,
    censoringVariable: censoringVariables[0] ?? null,
    censoringVariables,
    timeScale: "interval"
  };
}

function markExposures(document: GraphDocument, ids: string[]) {
  const exposureIds = new Set(ids);
  document.graph.nodes = document.graph.nodes.map((node) => exposureIds.has(node.id) ? { ...node, roles: { ...node.roles, exposure: true } } : node);
}

function setContinuousVariable(document: GraphDocument, id: string, description: string, unit: string, tags: string[] = [], measurement?: Partial<VariableModel["measurement"]>) {
  setVariable(document, id, {
    description,
    valueType: "continuous",
    unit,
    tags,
    measurement
  });
}

function setBinaryVariable(document: GraphDocument, id: string, description: string, unit: string) {
  setVariable(document, id, {
    description,
    valueType: "binary",
    unit,
    categories: ["0", "1"],
    simulation: { mode: "expected_value" }
  });
}

function setVariable(document: GraphDocument, id: string, patch: VariablePatch) {
  document.graph.nodes = document.graph.nodes.map((node) => {
    if (node.id !== id) return node;
    const variable = normalizeVariableModel(node.variable);
    return {
      ...node,
      variable: normalizeVariableModel({
        ...variable,
        ...patch,
        measurement: patch.measurement ? { ...variable.measurement, ...patch.measurement } : variable.measurement,
        simulation: patch.simulation ? { ...variable.simulation, ...patch.simulation } : variable.simulation,
        intervention: patch.intervention ? { ...variable.intervention, ...patch.intervention } : variable.intervention,
        adjustment: patch.adjustment ? { ...variable.adjustment, ...patch.adjustment } : variable.adjustment
      })
    };
  });
}

function setExampleSampleSize(document: GraphDocument, sampleSize: number) {
  document.graph.nodes = document.graph.nodes.map((node) => {
    const variable = normalizeVariableModel(node.variable);
    return {
      ...node,
      variable: normalizeVariableModel({
        ...variable,
        simulation: {
          ...variable.simulation,
          sampleSize
        }
      })
    };
  });
}

function setNode(document: GraphDocument, id: string, mechanism: Partial<NodeMechanism>) {
  document.simulation.nodes[id] = normalizeNodeMechanism(mechanism);
}

function setLogitNode(document: GraphDocument, id: string, intercept: number) {
  setNode(document, id, { intercept, noise: ZERO_NOISE, combiner: "bernoulli_logit" });
}

function setLinearCoefficient(document: GraphDocument, source: string, target: string, coefficient: number) {
  const edge = document.graph.edges.find((candidate) => candidate.source === source && candidate.target === target);
  if (!edge) return;
  document.simulation.edges[edge.id] = { ...defaultEdgeMechanism("linear"), coefficient };
}

function setEdgeMechanism(
  document: GraphDocument,
  source: string,
  target: string,
  kind: EdgeMechanismKind,
  patch: Partial<ReturnType<typeof defaultEdgeMechanism>>
) {
  const edge = document.graph.edges.find((candidate) => candidate.source === source && candidate.target === target);
  if (!edge) return;
  document.simulation.edges[edge.id] = { ...defaultEdgeMechanism(kind), ...patch };
}

function setSelection(document: GraphDocument, id: string, condition: Partial<SimulationSelectionCondition>) {
  document.simulation.selections[id] = normalizeSelectionCondition(condition);
}

function exampleSeed(id: string): number {
  return [...id].reduce((seed, char) => ((seed * 31) + char.charCodeAt(0)) >>> 0, 17) || 1;
}
