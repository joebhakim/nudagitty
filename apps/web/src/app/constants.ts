import type { CanvasViewport, DesignModuleStatus } from "./types";
import type {
  EdgeMechanismKind,
  ExampleDenouement,
  NodeCombinerKind,
  VariableModel
} from "@nudagitty/core";
import type { BibliographyTopic } from "../shared/appState";

export const BASE_VIEWBOX = { width: 1000, height: 700 };
export const DEFAULT_VIEWPORT: CanvasViewport = { cx: 0, cy: 0, zoom: 1 };
export const NODE_VIEW_MARGIN = { x: 100, top: 110, bottom: 130 };
export const BASIC_NODE_VIEW_MARGIN = { x: 66, top: 86, bottom: 118 };
export const BASIC_VIEWPORT_ZOOM_BONUS = 1.12;
export const EMPIRICAL_DRAW_MIN = 80;
export const EMPIRICAL_DRAW_DEFAULT = 320;
export const EMPIRICAL_DRAW_MAX = 50000;
export const EMPIRICAL_DRAW_STEP = 80;
export const WORKER_FALLBACK_MS = 2500;
export const MAX_SHARE_URL_LENGTH = 16000;
export const PAPER_NETWORK_HASH = "paper=k562";
export const EDGE_SOURCE_CLEARANCE = 1.5;
export const EDGE_ARROW_TIP_EXTENSION_FACTOR = 1.88;
export const EDGE_ARROW_NODE_OVERLAP = 1.2;
export const EDGE_CROWDED_FAN_THRESHOLD = 2;
export const EDGE_CROWDED_FAN_SPACING = 44;
export const EDGE_CROWDED_FAN_MAX_OFFSET = 68;
export const EDGE_OUTGOING_FAN_THRESHOLD = 2;
export const EDGE_OUTGOING_FAN_SPACING = 24;
export const EDGE_OUTGOING_FAN_MAX_OFFSET = 36;
export const EDGE_ENDPOINT_PORT_SPACING = 18;
export const EDGE_ENDPOINT_PORT_MAX_OFFSET = 26;
export const EDGE_ENDPOINT_PORT_DISTANCE = 64;

export const EDGE_MECHANISMS: Array<{ kind: EdgeMechanismKind; label: string; description: string }> = [
  { kind: "linear", label: "linear", description: "Straight proportional effect." },
  { kind: "absorbing", label: "absorbing event", description: "Deterministic cumulative-event edge: if the source event has happened, the target cumulative event has happened too." },
  { kind: "threshold", label: "threshold", description: "Step change after a cutoff." },
  { kind: "smooth_threshold", label: "smooth threshold", description: "Soft sigmoid transition around a cutoff." },
  { kind: "saturating", label: "saturating", description: "Effect rises and levels off." },
  { kind: "quadratic", label: "quadratic", description: "Curved parabolic response." },
  { kind: "piecewise_linear", label: "piecewise", description: "Connected straight segments." },
  { kind: "hill_emax", label: "Hill / Emax", description: "Dose-response curve with a maximum effect." },
  { kind: "log_linear", label: "log-linear", description: "Fast early change that flattens with input." },
  { kind: "power_law", label: "power law", description: "Scaled curved response with an exponent." },
  { kind: "monotone_spline", label: "monotone spline", description: "Smooth shape-constrained increasing or decreasing curve." }
];

export const NODE_COMBINERS: Array<{ kind: NodeCombinerKind; label: string }> = [
  { kind: "additive", label: "additive / normal mean" },
  { kind: "bounded_logistic", label: "bounded logistic" },
  { kind: "positive_softplus", label: "positive softplus" },
  { kind: "bernoulli_logit", label: "Bernoulli logit probability" },
  { kind: "poisson_log", label: "Poisson log rate" },
  { kind: "gamma_log", label: "Gamma log mean" },
  { kind: "noisy_or", label: "noisy-OR probability" }
];

// The RESPONSE FAMILY — what kind of thing this variable IS, which decides how it is fit and how it is
// generated. The labels say what the family ASSUMES, because "continuous" / "positive real" told a user
// nothing about which one their variable actually needs.
export const VARIABLE_TYPES: Array<[VariableModel["valueType"], string]> = [
  ["continuous", "continuous — any real value, symmetric noise (a linear model)"],
  ["binary", "binary — 0/1 (logistic)"],
  ["categorical", "categorical — unordered labels"],
  ["ordinal", "ordinal — ordered levels"],
  ["count", "count — non-negative integers (Poisson)"],
  ["positive", "positive — strictly > 0, right-skewed (log link)"],
  ["semicontinuous", "two-part — a mass at zero × a positive amount (earnings, spending)"],
  ["proportion", "proportion — between 0 and 1 (logit)"],
  ["time_to_event", "time to event"],
  ["vector", "vector"],
  ["time_series", "time series"],
  ["text", "text"],
  ["embedding", "embedding"],
  ["distributional", "distributional"]
];

export const PLANNED_CAUSAL_MODULES = [
  { id: "soft_shift", label: "Soft intervention" },
  { id: "stochastic", label: "Stochastic assignment" },
  { id: "policy", label: "Policy rule" }
] as const;

export const FRONTLINE_EXAMPLE_IDS = ["tutoring-scores", "simpson-severity"] as const;

export const DESIGN_MODULES: Array<{
  id: string;
  label: string;
  status: DesignModuleStatus;
  basic?: boolean;
  description: string;
}> = [
  {
    id: "adjustment",
    label: "Adjustment / backdoor",
    status: "usable",
    basic: true,
    description: "Use roles, biasing paths, and minimal adjustment sets to decide what belongs in the estimating equation."
  },
  {
    id: "target-trial",
    label: "Target trial",
    status: "todo",
    description: "TODO: specify eligibility, time zero, treatment strategies, follow-up, censoring, estimand, and analysis plan."
  },
  {
    id: "negative-controls",
    label: "Negative controls",
    status: "todo",
    description: "TODO: mark exposure/outcome controls that should have no effect and use violations as residual-bias warnings."
  },
  {
    id: "iv",
    label: "Instrumental variables",
    status: "usable",
    description: "Check relevance paths, exclusion restrictions, and unblocked backdoors from candidate instruments to outcomes."
  },
  {
    id: "did",
    label: "DiD / event study",
    status: "todo",
    description: "TODO: track policy timing, panel unit/time structure, pre-trends, staggered adoption, and placebo endpoints."
  },
  {
    id: "rd",
    label: "Regression discontinuity",
    status: "todo",
    description: "TODO: mark running variable, cutoff, manipulation risks, bandwidth choices, and continuity assumptions."
  },
  {
    id: "synthetic-control",
    label: "Synthetic control / CausalImpact",
    status: "todo",
    description: "TODO: define treated unit, donor pool, pre-period fit, unaffected control series, and placebo permutations."
  },
  {
    id: "experiment-uplift",
    label: "Experiment / uplift",
    status: "todo",
    description: "TODO: represent randomization, holdouts, geolift, guardrails, spillovers, and heterogeneous treatment effects."
  },
  {
    id: "mediation",
    label: "Mediation",
    status: "usable",
    basic: true,
    description: "Separate direct and indirect paths, then make post-treatment adjustment risks visible."
  },
  {
    id: "graph-refutation",
    label: "Graph refutation",
    status: "todo",
    description: "TODO: run conditional-independence checks implied by the graph and flag assumptions contradicted by data."
  },
  {
    id: "causal-discovery",
    label: "Discovery hypotheses",
    status: "todo",
    description: "TODO: import candidate structures from discovery tools as hypotheses, not automatic truth."
  },
  {
    id: "root-cause",
    label: "Root cause",
    status: "todo",
    description: "TODO: compare old/new mechanism behavior and attribute observed changes to upstream nodes."
  },
  {
    id: "distribution-change",
    label: "Distribution change",
    status: "todo",
    description: "TODO: attribute target distribution shifts to changed causal mechanisms, not only changed marginal correlations."
  },
  {
    id: "latent-measurement",
    label: "Latent measurement",
    status: "todo",
    description: "TODO: connect latent constructs, proxies, survey error, rounding, missingness, and attrition mechanisms."
  }
];

export const ROADMAP_TODOS = [
  {
    label: "Question-first analysis plan",
    description: "TODO mode for population, unit, time zero, treatment strategies, outcome horizon, estimand, contrast, data source, and design assumptions. Keep it optional because it demands more upfront thinking than quick DAG sketching."
  },
  {
    label: "Data-aware DAG",
    description: "TODO: CSV import, column-to-node mapping, type/missingness summaries, positivity and balance checks, and graph implication tests. Synthetic datasets will plug in here later."
  },
  {
    label: "Code/export bridge",
    description: "TODO: generate R, Python, and Stata starter code for selected design modules plus a collaborator-facing report with DAG, assumptions, threats, and chosen estimand."
  }
];

export const CUSTOM_DENOUEMENT: ExampleDenouement = {
  module: "Custom causal claim packet",
  punchline: "Turn the graph into a claim packet: what can be said causally, what design supports it, and what assumptions could embarrass the claim.",
  estimand: "Set an exposure and outcome, then choose whether the target is a total effect, direct effect, IV estimand, mediation contrast, policy effect, or descriptive mechanism claim.",
  primaryOutput: "A concise conclusion backed by an adjustment or design verdict, visible causal and biasing paths, diagnostics, and unresolved threats.",
  validity: "Credible only after the graph declares time order, treatment/exposure status, outcome, adjustment choices, sample-selection nodes, latent nodes, and post-treatment variables.",
  nextAction: "Pick a catalog example closest to the current problem or mark exposure/outcome roles and use the identification panel to start the packet.",
  sections: [
    {
      title: "Claim packet",
      defaultOpen: true,
      items: [
        "Name the causal contrast before interpreting associations.",
        "State the unit, population, exposure or treatment, outcome, time horizon, and contrast scale.",
        "Separate the graph-supported claim from unresolved threats.",
        "Write the final sentence as a claim with a validity qualifier, not as a dashboard observation."
      ]
    },
    {
      title: "Checklist",
      defaultOpen: true,
      items: [
        "Mark exposure and outcome roles.",
        "Mark adjusted, sample-selection, and unobserved nodes.",
        "Inspect causal and biasing paths.",
        "Choose the identification mode in Advanced diagnostics.",
        "Document any TODO design module that is relevant but not implemented yet."
      ]
    },
    {
      title: "Threats",
      items: [
        "Post-treatment adjustment can change the estimand or introduce bias.",
        "Sample-selection nodes can make the analysis population differ from the target population.",
        "Latent variables mean the DAG is an assumption statement, not a complete control strategy.",
        "Poor overlap, interference, and measurement error usually require specialized modules."
      ]
    }
  ]
};

export const BIBLIOGRAPHY: Array<{
  topic: BibliographyTopic;
  label: string;
  citation: string;
  url: string;
}> = [
  {
    topic: "sem",
    label: "Linear non-Gaussian SEM",
    citation: "Shimizu et al. (2006), A Linear Non-Gaussian Acyclic Model for Causal Discovery",
    url: "https://www.jmlr.org/beta/papers/v7/shimizu06a.html"
  },
  {
    topic: "sem",
    label: "Additive noise SEM",
    citation: "Peters et al. (2014), Causal Discovery with Continuous Additive Noise Models",
    url: "https://jmlr.csail.mit.edu/beta/papers/v15/peters14a.html"
  },
  {
    topic: "nonlinear",
    label: "Post-nonlinear SEM",
    citation: "Zhang and Hyvarinen (2012), On the Identifiability of the Post-Nonlinear Causal Model",
    url: "https://arxiv.org/abs/1205.2599"
  },
  {
    topic: "nonlinear",
    label: "Monotone cubic interpolation",
    citation: "Fritsch and Carlson (1980), Monotone Piecewise Cubic Interpolation",
    url: "https://epubs.siam.org/doi/10.1137/0717021"
  },
  {
    topic: "nonlinear",
    label: "Hill / Emax dose response",
    citation: "PK/PD reviews describe sigmoid Emax models based on the Hill equation",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7050630/"
  },
  {
    topic: "probability",
    label: "Generalized SEM",
    citation: "Generalized semiparametric SEMs use link functions and distributions for different data types",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5129644/"
  },
  {
    topic: "probability",
    label: "Noisy-OR",
    citation: "A Generalization of the Noisy-Or Model",
    url: "https://arxiv.org/abs/1303.1479"
  },
  {
    topic: "deep",
    label: "Causal generative neural networks",
    citation: "Goudet et al. (2017), Causal Generative Neural Networks",
    url: "https://arxiv.org/abs/1711.08936"
  },
  {
    topic: "deep",
    label: "Flow-based causal inference",
    citation: "Geffner et al. (2022), Deep End-to-end Causal Inference",
    url: "https://arxiv.org/abs/2202.02195"
  }
];

export const BIBLIOGRAPHY_TOPICS: Array<{ id: BibliographyTopic; label: string }> = [
  { id: "sem", label: "SEM foundations" },
  { id: "nonlinear", label: "Nonlinear functions" },
  { id: "probability", label: "Probabilistic nodes" },
  { id: "deep", label: "Neural mechanisms" }
];

export const FLOW_NODE_WIDTH = 142;
export const FLOW_NODE_HEIGHT = 150;
export const FLOW_NODE_CENTER_X = 71;
export const FLOW_NODE_CENTER_Y = (42 / 152) * FLOW_NODE_HEIGHT;

export const PENTAGON_POINTS = "0,-25 23.8,-7.7 14.7,20.2 -14.7,20.2 -23.8,-7.7";

export const NODE_DISTRIBUTION_PLOT_X = -48;
export const NODE_DISTRIBUTION_PLOT_Y = 40;
export const NODE_DISTRIBUTION_PLOT_WIDTH = 96;
export const NODE_DISTRIBUTION_PLOT_HEIGHT = 32;
export const NODE_DISTRIBUTION_ANNOTATION_Y = 86;
export const NODE_DISTRIBUTION_BOUNDS = {
  left: NODE_DISTRIBUTION_PLOT_X - 5,
  right: NODE_DISTRIBUTION_PLOT_X + NODE_DISTRIBUTION_PLOT_WIDTH + 5,
  top: NODE_DISTRIBUTION_PLOT_Y - 5,
  bottom: NODE_DISTRIBUTION_ANNOTATION_Y + 16
};
