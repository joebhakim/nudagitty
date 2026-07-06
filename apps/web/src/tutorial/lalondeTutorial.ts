import type { GraphDocument } from "@nudagitty/core";
import type { TutorialCtx, TutorialStep } from "./types";

// The confounders the tutorial wires (everything that isn't the treatment or the outcome).
export const LALONDE_CONFOUNDERS = ["age", "education", "black", "hispanic", "married", "nodegree", "re74", "re75"];
export const LALONDE_TREATMENT = "treat";
export const LALONDE_OUTCOME = "re78";

const findNode = (doc: GraphDocument, key: string) => doc.graph.nodes.find((node) => node.id === key || node.label === key);
const parentsInto = (doc: GraphDocument, key: string) => doc.graph.edges.filter((edge) => edge.target === key).length;

// The LaLonde walkthrough. Each step spotlights a real control and auto-advances on an observable
// fact; "Next" is always available so the tour never gets stuck if a predicate doesn't fire.
export const LALONDE_TUTORIAL: TutorialStep[] = [
  {
    id: "import",
    title: "Bring in real data",
    instruction:
      "This is the LaLonde study — real people from a job-training program, each with their background, whether they trained, and their 1978 earnings. Click Import data and choose lalonde-obs.csv.",
    target: '[aria-label^="Import data"]',
    advanceOn: (ctx: TutorialCtx) => ctx.jointSources.some((cloud) => cloud.kind === "plasmode")
  },
  {
    id: "cloud",
    title: "Every column is a variable — and they share a joint",
    instruction:
      "Each column became a variable, all fed by one hidden source: the cloud. Because the numbers came from the same real people, their joint dependence is exactly real. Nothing is causal yet — that's your job next.",
    target: ".copula-cloud-node"
  },
  {
    id: "roles",
    title: "State the causal question",
    instruction:
      "Click the treat variable on the canvas — its editor opens. Under “Use this variable”, turn on exposure. Then click re78 (1978 earnings) and turn on outcome. Now the model knows the effect you're after: did training raise earnings?",
    advanceOn: (ctx: TutorialCtx) => Boolean(findNode(ctx.document, LALONDE_TREATMENT)?.roles.exposure) && Boolean(findNode(ctx.document, LALONDE_OUTCOME)?.roles.outcome)
  },
  {
    id: "wire",
    title: "Wire the confounders",
    instruction:
      "The other eight variables (age, education, prior earnings…) shape both who trained and who earned more later — so they confound the comparison. Draw an arrow from each into treat and into re78, or let me wire them for you.",
    actionLabel: "Wire the 8 confounders → treat & re78",
    advanceOn: (ctx: TutorialCtx) => parentsInto(ctx.document, LALONDE_TREATMENT) >= 3 && parentsInto(ctx.document, LALONDE_OUTCOME) >= 4
  },
  {
    id: "crude",
    title: "The naive answer is biased",
    instruction:
      "Look at the raw trained-vs-untrained earnings gap in the results. It's badly off — often negative — because training wasn't random: the people who trained were more disadvantaged to begin with.",
    target: '[aria-label^="Data —"]'
  },
  {
    id: "joint",
    title: "The joint is a separate knob",
    instruction:
      "Open Joint / DGM. On the Plasmode tab, break the shared joint (independent) and watch overlap and the crude gap move — then restore it. The causal truth never moved: the confounders' joint is a dial you can turn on its own.",
    target: '[aria-label^="Joint / DGM"]'
  },
  {
    id: "adjust",
    title: "Adjust — and recover the truth",
    instruction:
      "Now adjust for those confounders (g-computation or IPW). The estimate climbs back toward +$1,800 — the answer the randomized experiment actually found. Adjustment recovers the truth no matter how the joint was generated.",
    advanceOn: (ctx: TutorialCtx) => ctx.document.graph.nodes.some((node) => node.roles.adjusted)
  },
  {
    id: "done",
    title: "That's the whole loop",
    instruction:
      "Real data → a data-generating process you can see → the confounder joint as a knob → adjustment that recovers the truth. The causal effect and the data's joint are independent dials — which is the entire point.",
  }
];
