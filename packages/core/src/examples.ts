import { parseModel } from "./parser";
import { defaultEdgeMechanism, normalizeNodeMechanism, normalizeVariableModel } from "./graph";
import type { GraphDocument } from "./types";

export interface ExampleModel {
  id: string;
  title: string;
  code: string;
}

export const EXAMPLES: ExampleModel[] = [
  {
    id: "confounding-triangle",
    title: "Confounding triangle",
    code: `dag {
  X [exposure,pos="-2,0"]
  Y [outcome,pos="2,0"]
  Z [adjusted,pos="0,1.4"]
  Z -> X
  Z -> Y
  X -> Y
}`
  },
  {
    id: "collider",
    title: "Collider warning",
    code: `dag {
  X [exposure,pos="-2,0"]
  Y [outcome,pos="2,0"]
  C [adjusted,pos="0,1.2"]
  X -> C
  Y -> C
}`
  },
  {
    id: "mediator",
    title: "Mediator and direct effect",
    code: `dag {
  X [exposure,pos="-2,0"]
  M [pos="0,0.9"]
  Y [outcome,pos="2,0"]
  U [latent,pos="0,-1.1"]
  X -> M
  M -> Y
  X -> Y
  U -> X
  U -> Y
}`
  },
  {
    id: "selection",
    title: "Selection node",
    code: `dag {
  X [exposure,pos="-2,0"]
  Y [outcome,pos="2,0"]
  S [selected,pos="0,-1.2"]
  Z [pos="0,1.2"]
  Z -> X
  Z -> Y
  X -> Y
  Y -> S
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
  return document;
}

export function initialDocument(): GraphDocument {
  return exampleDocument(EXAMPLES[0]?.id ?? "") ?? parseModel(EXAMPLES[0]?.code ?? "dag {}", "Confounding triangle").document;
}

function configureGaltonExample(document: GraphDocument): GraphDocument {
  const next = {
    ...document,
    graph: {
      ...document.graph,
      nodes: document.graph.nodes.map((node) => {
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
      })
    },
    simulation: {
      ...document.simulation,
      nodes: { ...document.simulation.nodes },
      edges: { ...document.simulation.edges },
      seed: 7
    }
  };
  const root = normalizeNodeMechanism({ distribution: { kind: "normal", mean: 0, sd: 1 }, intercept: 0, noise: { kind: "constant", value: 0 } });
  for (const id of ["G_shared", "G_son_other", "E_father", "E_son"]) {
    next.simulation.nodes[id] = root;
  }
  next.simulation.nodes.Father_height = normalizeNodeMechanism({ intercept: 69, noise: { kind: "constant", value: 0 } });
  next.simulation.nodes.Son_height = normalizeNodeMechanism({ intercept: 69, noise: { kind: "constant", value: 0 } });
  setLinearCoefficient(next, "G_shared", "Father_height", 2.24);
  setLinearCoefficient(next, "E_father", "Father_height", 1.68);
  setLinearCoefficient(next, "G_shared", "Son_height", 1.26);
  setLinearCoefficient(next, "G_son_other", "Son_height", 1.26);
  setLinearCoefficient(next, "E_son", "Son_height", 2.16);
  return next;
}

function setLinearCoefficient(document: GraphDocument, source: string, target: string, coefficient: number) {
  const edge = document.graph.edges.find((candidate) => candidate.source === source && candidate.target === target);
  if (!edge) return;
  document.simulation.edges[edge.id] = { ...defaultEdgeMechanism("linear"), coefficient };
}
