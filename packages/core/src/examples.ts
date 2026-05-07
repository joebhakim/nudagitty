import { parseModel } from "./parser";
import { defaultEdgeMechanism, normalizeNodeMechanism, normalizeVariableModel } from "./graph";
import type { GraphDocument, NodeDistribution, NodeMechanism, VariableModel } from "./types";

export interface ExampleModel {
  id: string;
  title: string;
  code: string;
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
    code: `dag {
  Severity [adjusted,pos="-2,1.1"]
  Treatment [exposure,pos="-0.3,0"]
  Recovery [outcome,pos="2,0"]
  Severity -> Treatment
  Severity -> Recovery
  Treatment -> Recovery
}`
  },
  {
    id: "front-door-smoking",
    title: "Smoking, tar, cancer: front door",
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
    code: `dag {
  Smoking [exposure,pos="-2,0.35"]
  Frailty [latent,pos="0,1.3"]
  Birthweight [adjusted,pos="0,0"]
  Infant_mortality [outcome,label="infant mortality",pos="2,0"]
  Smoking -> Birthweight
  Smoking -> Infant_mortality
  Frailty -> Birthweight
  Frailty -> Infant_mortality
  Birthweight -> Infant_mortality
}`
  },
  {
    id: "instrumental-encouragement",
    title: "Instrumental variable: encouragement design",
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
    id: "galton-regression",
    title: "Galton regression to the mean",
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

export function exampleDocument(id: string): GraphDocument | null {
  const example = EXAMPLES.find((candidate) => candidate.id === id);
  if (!example) return null;
  const document = parseModel(example.code, example.title).document;
  if (id === "galton-regression") return configureGaltonExample(document);
  return configureClassicExample(document, id);
}

export function initialDocument(): GraphDocument {
  return exampleDocument(EXAMPLES[0]?.id ?? "") ?? parseModel(EXAMPLES[0]?.code ?? "dag {}", "Simpson's paradox").document;
}

function configureClassicExample(document: GraphDocument, id: string): GraphDocument {
  const next = prepareDocument(document, exampleSeed(id));
  if (id === "simpson-severity") return configureSimpsonSeverity(next);
  if (id === "front-door-smoking") return configureFrontDoorSmoking(next);
  if (id === "berkson-hospital") return configureBerksonHospital(next);
  if (id === "birthweight-paradox") return configureBirthweightParadox(next);
  if (id === "instrumental-encouragement") return configureInstrumentalEncouragement(next);
  if (id === "mediation-direct-total") return configureMediationDirectTotal(next);
  if (id === "measurement-error-latent") return configureMeasurementErrorLatent(next);
  if (id === "case-control-selection") return configureCaseControlSelection(next);
  return next;
}

function configureSimpsonSeverity(document: GraphDocument): GraphDocument {
  setContinuousVariable(document, "Severity", "Baseline severity. Sicker patients are more likely to receive treatment and less likely to recover.", "severity z-score");
  setBinaryVariable(document, "Treatment", "Observed treatment assignment. Treatment is more common among severe cases.", "treated");
  setBinaryVariable(document, "Recovery", "Observed recovery indicator. Treatment helps, but severity hurts recovery.", "recovered");
  setNode(document, "Severity", { distribution: UNIT_NORMAL, noise: ZERO_NOISE });
  setLogitNode(document, "Treatment", -0.15);
  setLogitNode(document, "Recovery", 0.45);
  setLinearCoefficient(document, "Severity", "Treatment", 1.4);
  setLinearCoefficient(document, "Severity", "Recovery", -1.5);
  setLinearCoefficient(document, "Treatment", "Recovery", 0.9);
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
  setLogitNode(document, "Infant_mortality", 1.0);
  setLinearCoefficient(document, "Smoking", "Birthweight", -220);
  setLinearCoefficient(document, "Frailty", "Birthweight", -350);
  setLinearCoefficient(document, "Smoking", "Infant_mortality", 0.35);
  setLinearCoefficient(document, "Frailty", "Infant_mortality", 1.2);
  setLinearCoefficient(document, "Birthweight", "Infant_mortality", -0.001);
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

function exampleSeed(id: string): number {
  return [...id].reduce((seed, char) => ((seed * 31) + char.charCodeAt(0)) >>> 0, 17) || 1;
}
