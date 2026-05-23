import { parseModel } from "./parser";
import { defaultEdgeMechanism, normalizeNodeMechanism, normalizeSelectionCondition, normalizeVariableModel } from "./graph";
import type { EdgeMechanismKind, GraphDocument, NodeDistribution, NodeMechanism, SimulationSelectionCondition, VariableModel } from "./types";

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

type VariablePatch = Partial<Omit<VariableModel, "measurement" | "simulation" | "intervention">> & {
  measurement?: Partial<VariableModel["measurement"]>;
  simulation?: Partial<VariableModel["simulation"]>;
  intervention?: Partial<VariableModel["intervention"]>;
};

const ZERO_NOISE: NodeDistribution = { kind: "constant", value: 0 };
const UNIT_NORMAL: NodeDistribution = { kind: "normal", mean: 0, sd: 1 };

export const EXAMPLES: ExampleModel[] = [
  {
    id: "simpson-severity",
    title: "Simpson's paradox: treatment by severity",
    domain: "classic",
    summary: "Fast explanation of confounding and why unadjusted group comparisons can reverse.",
    outputModule: "simpson-severity",
    code: `dag {
  Severity [pos="-2,1.1"]
  Treatment [exposure,pos="-0.3,0"]
  Recovery [outcome,pos="2,0"]
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
    id: "tutoring-scores",
    title: "Does tutoring hurt test scores (unadjusted)",
    domain: "classic",
    summary: "Three-node sign-flip example to fix: struggling students get tutoring, score lower in raw data, and the user should adjust for academic need.",
    outputModule: "tutoring-scores",
    code: `dag {
  Academic_need [label="academic need",pos="-2,0.9"]
  Tutoring [exposure,pos="-0.25,0"]
  Test_score [outcome,label="test score",pos="2,0"]
  Academic_need -> Tutoring
  Academic_need -> Test_score
  Tutoring -> Test_score
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
    title: "Lord's paradox: baseline adjustment",
    domain: "classic",
    summary: "Change-score and baseline-adjusted comparisons can disagree because they answer different causal questions.",
    outputModule: "lords-paradox",
    code: `dag {
  Baseline_weight [adjusted,label="baseline weight",pos="-2,0.9"]
  Program [exposure,label="group / program",pos="-0.25,0"]
  Final_weight [outcome,label="final weight",pos="1.8,0"]
  Baseline_weight -> Final_weight
  Baseline_weight -> Program
  Program -> Final_weight
}`
  },
  {
    id: "target-trial-followup",
    title: "Target trial: treatment start and follow-up",
    domain: "epidemiology",
    summary: "Eligibility, time zero, treatment strategy, censoring, measurement, selection, and a negative-control outcome.",
    code: `dag {
  Eligibility [selected,label="eligible cohort",pos="-2.8,1.45"]
  Baseline_severity [adjusted,label="baseline severity",pos="-2.45,-0.35"]
  Treatment_start [exposure,label="treatment start",pos="-0.55,0"]
  Adherence [label="adherence",pos="1.05,1.4"]
  Censoring [selected,label="loss to follow-up",pos="1.05,-1.45"]
  Outcome_90d [outcome,label="90-day outcome",pos="2.85,-0.35"]
  Negative_control [label="negative control outcome",pos="2.85,1.45"]
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
  "lords-paradox": {
    module: "Estimand / baseline adjustment",
    punchline: "A change-score comparison and a baseline-adjusted final-outcome comparison can disagree because they are answering different questions.",
    estimand: "Effect of Program on Final_weight at comparable Baseline_weight, contrasted with the raw change-score comparison.",
    primaryOutput: "Before/after comparison: Program group change score versus do(Program) final-weight contrast, plus baseline imbalance.",
    validity: "Credible if Baseline_weight is truly pre-program and the target question is about final outcomes at comparable baseline values.",
    nextAction: "Ask the causal question before choosing change scores or baseline adjustment.",
    sections: [
      {
        title: "Claim packet",
        defaultOpen: true,
        items: [
          "State whether the target is change from baseline or final outcome at comparable baseline.",
          "Name Baseline_weight as a pre-treatment difference between groups.",
          "Show how regression toward the mean makes change scores non-equivalent to baseline-adjusted final outcomes.",
          "Report both outputs as different estimands, not as one model winning by default."
        ]
      },
      {
        title: "Diagnostics to show",
        defaultOpen: true,
        items: [
          "Baseline imbalance by Program.",
          "Raw change-score contrast.",
          "do(Program=1) versus do(Program=0) final-outcome contrast.",
          "Question-first warning before interpreting either number."
        ]
      },
      {
        title: "Threats and failure modes",
        items: [
          "Baseline may be affected by earlier causes that also affect group assignment.",
          "Measurement error in baseline can make adjustment noisy.",
          "If the causal question is literally weight change, the change-score contrast may be descriptive but still confounded.",
          "The example is meant to force estimand language."
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
  return EXAMPLE_DENOUEMENTS[id] ?? null;
}

export function exampleDocument(id: string): GraphDocument | null {
  const example = EXAMPLES.find((candidate) => candidate.id === id);
  if (!example) return null;
  const document = parseModel(example.code, example.title).document;
  if (id === "galton-regression") return configureGaltonExample(document);
  if (example.domain !== "classic") return configurePractitionerExample(document, id);
  return configureClassicExample(document, id);
}

export function initialDocument(): GraphDocument {
  return exampleDocument(EXAMPLES[0]?.id ?? "") ?? parseModel(EXAMPLES[0]?.code ?? "dag {}", "Simpson's paradox").document;
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
  if (id === "policy-event-study") return configurePolicyEventStudy(next);
  if (id === "incrementality-uplift") return configureIncrementalityUplift(next);
  if (id === "causal-ml-refutation") return configureCausalMlRefutation(next);
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
  setBinaryVariable(document, "Program", "Group or program indicator. The groups differ at baseline before the final outcome is measured.", "group 1");
  setContinuousVariable(document, "Baseline_weight", "Baseline measurement before the final outcome. It differs by group and strongly predicts final weight.", "kg");
  setContinuousVariable(document, "Final_weight", "Final measurement after the program period.", "kg");
  setNode(document, "Baseline_weight", { distribution: { kind: "normal", mean: 70, sd: 5 }, noise: ZERO_NOISE });
  setLogitNode(document, "Program", -84);
  setNode(document, "Final_weight", { intercept: 18, noise: { kind: "normal", mean: 0, sd: 2.2 } });
  setLinearCoefficient(document, "Baseline_weight", "Program", 1.2);
  setLinearCoefficient(document, "Baseline_weight", "Final_weight", 0.75);
  setLinearCoefficient(document, "Program", "Final_weight", 1.2);
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
        intervention: patch.intervention ? { ...variable.intervention, ...patch.intervention } : variable.intervention
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
