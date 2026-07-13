import type { GraphDocument, GraphModel, GraphNode } from "./types";
import { normalizeNodeMechanism, normalizeVariableModel, normalizeEdgeMechanism } from "./graph";
import { ancestorsOf, classifyConditioned, descendantsOf } from "./analysis";
import { nodeDataMode, imposedEffectEdge } from "./fitDgp";

/**
 * THE SETUP SCRIPT — a whole nudagitty configuration as one dense, pasteable glyph block.
 *
 * The design rule, arrived at the hard way: DO NOT INVENT ICONS. Steal the notation the reader already
 * writes. An abstract shape needs a legend; `≥` does not — it IS the support of a two-part outcome (zero or
 * more, with a mass sitting on the zero), just as `>` IS the support of a strictly-positive one. `|` is the
 * conditioning bar, because adjusting for a covariate IS conditioning on it. `∧` and `∨` are the DAG motifs
 * drawn: a fork (X ← L → Y) and a collision (X → C ← Y).
 *
 * The ONE invented encoding is `owner`, and deliberately: "who owns this number — the data, the fit, or you"
 * has no notation in any literature, because it is the thing this tool added. So it gets the one encoding
 * that needs no vocabulary at all — INK. `·` plumbing → `░` from data → `▒` fitted → `█` AUTHORED. A dark
 * script is a model you wrote; a pale one is a model the data wrote.
 *
 * MONO-SAFE BY CONSTRUCTION. Every glyph is Latin-1, Greek, a Math Operator, a non-emoji Arrow, a Block
 * Element or Box Drawing. Two things break a monospace grid and both are designed out:
 *   1. an EMOJI PRESENTATION — `▶` is also ▶️ (U+25B6) and `↗` is also ↗️ (U+2197); the colour-emoji font
 *      claims them and renders them double-width. `→` and `↓` have no emoji variant, so they are safe.
 *   2. a COVERAGE GAP — `✓ ∅ ◇ ▦ ⊗` are simply absent from most monospace faces, which silently fall back
 *      to a PROPORTIONAL one. A proportional glyph in a monospace grid is what drifts the column.
 */
export const SETUP_GLYPHS = {
  exposure: "τ",     // the treatment
  outcome: "Υ",      // it is literally Y
  confounder: "∧",   // a FORK:      X ← L → Y
  collider: "∨",     // a COLLISION: X → C ← Y
  mediator: "→",     // on the causal path
  precision: "↓",    // predicts Y only — not a confounder
  instrument: "⇒",   // implies the exposure and nothing else
  inert: "ø",        // irrelevant to the estimand — it cannot confound anything
  postY: "↑",        // a DESCENDANT of the outcome — conditioning on it is conditioning on Y
  unmeasured: "◌",   // a dotted ghost: not in your data
  adjusted: "|",     // THE CONDITIONING BAR. P(Y | X)
  // family — the glyph IS the support
  continuous: "∼", binary: "½", twopart: "≥", positive: ">", count: "λ",
  categorical: "χ", ordinal: "≤", proportion: "%",
  // mechanism
  additive: "+", logit: "σ", softplus: "/", logLink: "×", boundedLogit: "σ", noisyOr: "∪", copula: "∼",
  normal: "Φ", gamma: "Γ", bernoulli: "β", poisson: "λ", lognormal: "Λ", uniform: "∪",
  student: "t", beta: "β", laplace: "L", exponential: "ε", constant: "·", categoricalNoise: "χ",
  modifier: "×",     // it IS the interaction, T × L
  // owner — the ink ramp
  plumbing: "·", fromData: "░", fitted: "▒", authored: "█",
  none: "·", blank: " "
} as const;

export type SetupRowKey = "estimand" | "struct" | "seen" | "adj" | "family" | "link" | "noise" | "modifier" | "owner";
export type SetupGroup = "exposure" | "outcome" | "adjusted" | "other" | "latent";

export interface SetupNode {
  id: string;
  key: string;                            // the 4-char column header
  group: SetupGroup;
  cells: Record<SetupRowKey, string>;     // exactly ONE glyph each
  warn: Partial<Record<SetupRowKey, string>>;  // why this cell is flagged
}

export interface SetupScript {
  title: string;
  nodes: SetupNode[];
  edges: { plumbing: number; fitted: number; authored: number; total: number };
  effectOwner: "authored" | "fitted" | null;   // null ⇒ no imposed effect
  facts: string[];
  warnings: string[];   // ✗ — a contradiction, or bias you are actively creating
  notes: string[];      // observations worth knowing; not problems
}

const FAMILY: Record<string, string> = {
  continuous: SETUP_GLYPHS.continuous, binary: SETUP_GLYPHS.binary, categorical: SETUP_GLYPHS.categorical,
  ordinal: SETUP_GLYPHS.ordinal, count: SETUP_GLYPHS.count, positive: SETUP_GLYPHS.positive,
  semicontinuous: SETUP_GLYPHS.twopart, proportion: SETUP_GLYPHS.proportion
};
const LINK: Record<string, string> = {
  additive: SETUP_GLYPHS.additive, bernoulli_logit: SETUP_GLYPHS.logit, bounded_logistic: SETUP_GLYPHS.boundedLogit,
  positive_softplus: SETUP_GLYPHS.softplus, gamma_log: SETUP_GLYPHS.logLink, poisson_log: SETUP_GLYPHS.logLink,
  noisy_or: SETUP_GLYPHS.noisyOr, copula_marginal: SETUP_GLYPHS.copula
};
const NOISE: Record<string, string> = {
  constant: SETUP_GLYPHS.constant, normal: SETUP_GLYPHS.normal, gamma: SETUP_GLYPHS.gamma,
  lognormal: SETUP_GLYPHS.lognormal, bernoulli: SETUP_GLYPHS.bernoulli, poisson: SETUP_GLYPHS.poisson,
  uniform: SETUP_GLYPHS.uniform, beta: SETUP_GLYPHS.beta, laplace: SETUP_GLYPHS.laplace,
  student_t: SETUP_GLYPHS.student, exponential: SETUP_GLYPHS.exponential, categorical: SETUP_GLYPHS.categoricalNoise
};

/** 4-char column key. Digits are kept — `Earnings_78` → `e78`, which is how a reader recognises it. */
function abbreviate(node: GraphNode, taken: Set<string>): string {
  const raw = (node.label ?? node.id).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const words = raw.split(" ").filter(Boolean);
  const digits = /(\d+)$/.exec(raw)?.[1] ?? "";
  const letters = words.filter((w) => !/^\d+$/.test(w));
  let key: string;
  if (letters.length === 0) key = raw.slice(0, 4);
  else if (letters.length === 1) key = digits ? letters[0]!.slice(0, 4 - digits.length) + digits : letters[0]!.slice(0, 4);
  else {
    const initials = letters.map((w) => w[0]).join("");
    key = digits ? (initials + digits).slice(0, 4) : (letters[0]!.slice(0, 2) + letters[1]!.slice(0, 2));
  }
  key = key.slice(0, 4) || "?";
  let out = key, n = 2;
  while (taken.has(out)) out = (key.slice(0, 3) + n++).slice(0, 4);
  taken.add(out);
  return out;
}

/** The graph with the exposures deleted — lets us ask "is L an ancestor of Y by a path NOT through T?", which
 *  is the ONLY thing separating a confounder from an instrument. */
function withoutNodes(graph: GraphModel, drop: string[]): GraphModel {
  const gone = new Set(drop);
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => !gone.has(n.id)),
    edges: graph.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target))
  };
}

/**
 * Derive the structural position of every node FROM THE DAG.
 *
 * Deliberately NOT `structuralRoleOf` — that is a first-match `if`-cascade returning exactly one role, so it
 * cannot express a node that is a confounder on one path and a mediator on another, and it swallows
 * observability into the same axis. Here, position and observability are separate rows, as they are separate
 * questions.
 */
function structureOf(doc: GraphDocument): Map<string, { glyph: string; why: string; note: string }> {
  const g = doc.graph;
  const exposures = g.nodes.filter((n) => n.roles?.exposure).map((n) => n.id);
  const outcomes = g.nodes.filter((n) => n.roles?.outcome).map((n) => n.id);
  const out = new Map<string, { glyph: string; why: string; note: string }>();
  if (exposures.length === 0 || outcomes.length === 0) {
    for (const n of g.nodes) out.set(n.id, { glyph: SETUP_GLYPHS.none, why: "", note: "" });
    return out;
  }
  const ancT = new Set(ancestorsOf(g, exposures));
  const ancY = new Set(ancestorsOf(g, outcomes));
  const descT = new Set(descendantsOf(g, exposures));
  const descY = new Set(descendantsOf(g, outcomes));
  // …and the same, in a world with no treatment at all.
  const ancYnoT = new Set(ancestorsOf(withoutNodes(g, exposures), outcomes));

  for (const n of g.nodes) {
    const G = SETUP_GLYPHS;
    if (exposures.includes(n.id) || outcomes.includes(n.id)) { out.set(n.id, { glyph: G.none, why: "", note: "" }); continue; }
    if (descT.has(n.id) && descY.has(n.id)) {
      out.set(n.id, { glyph: G.collider, why: "", note: "a COLLIDER of the exposure and the outcome" });
    } else if (descT.has(n.id) && ancY.has(n.id)) {
      out.set(n.id, { glyph: G.mediator, why: "", note: "a MEDIATOR — it carries part of the effect" });
    } else if (ancT.has(n.id) && ancYnoT.has(n.id)) {
      out.set(n.id, { glyph: G.confounder, why: "", note: "" });               // the honest confounder
    } else if (ancT.has(n.id)) {
      out.set(n.id, { glyph: G.instrument, why: "", note: "predicts TREATMENT only — an instrument, or a bias amplifier if you adjust" });
    } else if (ancYnoT.has(n.id)) {
      out.set(n.id, { glyph: G.precision, why: "", note: "predicts the OUTCOME only — precision, not confounding" });
    } else if (descY.has(n.id)) {
      out.set(n.id, { glyph: G.postY, why: "", note: "a DESCENDANT of the outcome" });
    } else {
      // NOT edge-less — in a plasmode every node hangs off the row-source. It is irrelevant TO THE ESTIMAND:
      // not an ancestor of T, not an ancestor of Y except through T, not downstream of either. It cannot
      // confound, so adjusting for it buys nothing. (This is how black/hispanic in our LaLonde DGP surfaced.)
      out.set(n.id, { glyph: G.inert, why: "", note: "not on any path between the exposure and the outcome" });
    }
  }
  return out;
}

export function analyzeSetup(doc: GraphDocument): SetupScript {
  const G = SETUP_GLYPHS;
  const g = doc.graph;
  const struct = structureOf(doc);
  const effect = imposedEffectEdge(doc);
  const exposures = g.nodes.filter((n) => n.roles?.exposure).map((n) => n.id);
  const taken = new Set<string>();
  const warnings: string[] = [];
  const notes: string[] = [];

  const groupOf = (n: GraphNode): SetupGroup =>
    n.roles?.exposure ? "exposure" : n.roles?.outcome ? "outcome"
    : n.roles?.latent ? "latent" : n.roles?.adjusted ? "adjusted" : "other";
  const RANK: Record<SetupGroup, number> = { exposure: 0, outcome: 1, adjusted: 2, other: 3, latent: 4 };

  const nodes: SetupNode[] = [...g.nodes]
    .sort((a, b) => RANK[groupOf(a)] - RANK[groupOf(b)] || g.nodes.indexOf(a) - g.nodes.indexOf(b))
    .map((n) => {
      const mech = normalizeNodeMechanism(doc.simulation.nodes[n.id]);
      const vt = normalizeVariableModel(n.variable).valueType;
      const st = struct.get(n.id) ?? { glyph: G.none as string, why: "", note: "" };
      const mode = nodeDataMode(doc, n.id);
      const isPlumbing = Boolean(n.roles?.latent) && mode === null &&
        g.edges.some((e) => e.source === n.id && normalizeEdgeMechanism(doc.simulation.edges[e.id]).kind === "table_lookup");
      const owner = isPlumbing ? G.plumbing
        : mode === "read" ? G.fromData
        : mode === "fit" ? G.fitted
        : G.authored;   // no data column ⇒ every number in it is yours
      const modifies = mech.interactions.some((i) =>
        i.kind === "product" ? exposures.includes(i.left) || exposures.includes(i.right) : exposures.includes(i.source));

      // A WARNING is a CONTRADICTION or a bias you are actively creating — never merely an observation.
      // A precision covariate is GOOD (it buys variance). An unadjusted collider is FINE. Only the pairing
      // of a structural position with an ANALYST'S CHOICE that fights it earns a ✗.
      // Does CONDITIONING on this node OPEN a biasing path? That is not the same question as "where does it
      // sit", and M-BIAS is the case that proves it: the collider in U1 → C ← U2 is on NO path between the
      // exposure and the outcome, so a position-only check calls it harmless — while conditioning on it opens
      // a backdoor through two unmeasured causes. `classifyConditioned` already answers this by d-separation;
      // asking it is the difference between a linter that is right and one that is merely plausible.
      const opens = n.roles?.adjusted ? classifyConditioned(g, n.id).opensBiasingPath : false;

      const warn: SetupNode["warn"] = {};
      if (n.roles?.exposure && n.roles?.outcome) warn.estimand = "exposure AND outcome — a node cannot cause itself";
      if (n.roles?.adjusted && opens) warn.adj = "conditioning on it OPENS a biasing path — this MANUFACTURES bias (M-bias / collider)";
      else if (n.roles?.adjusted && n.roles?.latent) warn.adj = "conditioning on a variable you never measured";
      else if (n.roles?.adjusted && st.glyph === G.mediator) warn.adj = "conditioning on a MEDIATOR — this removes the effect you are estimating";
      else if (n.roles?.adjusted && st.glyph === G.postY) warn.adj = "conditioning on a DESCENDANT of the outcome";
      else if (n.roles?.adjusted && st.glyph === G.instrument) warn.adj = "adjusting for a TREATMENT-only predictor — this AMPLIFIES bias";
      else if (n.roles?.adjusted && st.glyph === G.inert) warn.adj = "adjusted, but on no path between exposure and outcome — it buys nothing";
      // …and mark the position too, so the glyph itself shows a collider that a position-only walk missed.
      if (opens && st.glyph === G.inert) st.glyph = G.collider;
      // A latent CONFOUNDER is fatal… unless it is the plasmode row-source, whose whole job is to be the
      // shared hidden cause that reproduces the real joint. Its children are the observed covariates.
      if (n.roles?.latent && st.glyph === G.confounder && owner !== G.plumbing)
        warn.seen = "an UNMEASURED CONFOUNDER — no adjustment can fix this";
      for (const w of Object.values(warn)) if (w) warnings.push(`${n.id}: ${w}`);
      if (st.note) notes.push(`${n.id}: ${st.note}`);

      return {
        id: n.id,
        key: abbreviate(n, taken),
        group: groupOf(n),
        warn,
        cells: {
          estimand: n.roles?.exposure && n.roles?.outcome ? G.exposure
            : n.roles?.exposure ? G.exposure : n.roles?.outcome ? G.outcome : G.blank,
          struct: st.glyph,
          seen: n.roles?.latent ? G.unmeasured : G.blank,
          adj: n.roles?.adjusted ? G.adjusted : G.none,
          family: FAMILY[vt] ?? G.none,
          link: LINK[mech.combiner] ?? G.none,
          noise: NOISE[mech.noise.kind] ?? G.none,
          modifier: modifies ? G.modifier : G.blank,
          owner
        }
      };
    });

  const directed = g.edges.filter((e) => e.kind === "directed");
  const pins = new Set(doc.metadata.pins ?? []);
  const authoredKeys = new Set(doc.metadata.authored ?? []);
  let plumbing = 0, fitted = 0, authored = 0;
  for (const e of directed) {
    const kind = normalizeEdgeMechanism(doc.simulation.edges[e.id]).kind;
    if (kind === "table_lookup") plumbing++;
    else if (pins.has(`e:${e.id}`)) fitted++;
    else authored++;
  }
  const effectOwner: SetupScript["effectOwner"] = !effect ? null
    : authoredKeys.has(`e:${effect.edgeId}`) ? "authored"
    : pins.has(`e:${effect.edgeId}`) ? "fitted" : "authored";
  if (effectOwner === "fitted") {
    warnings.push("THE EFFECT EDGE IS FITTED — the imposed truth is gone; the DGP now carries the confounded association");
  }

  const facts: string[] = [];
  const imposed = doc.metadata.imposedEffect;
  if (imposed) facts.push(`imposed   ${imposed.target > 0 ? "+" : ""}${imposed.target}` +
    (imposed.extensiveShare != null ? `   extensive ${Math.round(imposed.extensiveShare * 100)}%` : ""));
  facts.push(`counts    ${g.nodes.length} nodes · ${directed.length} edges · ${plumbing} lookup / ${fitted} fitted / ${authored} authored`);

  return {
    title: doc.title || doc.id || "untitled",
    nodes, edges: { plumbing, fitted, authored, total: directed.length },
    effectOwner, facts, warnings, notes
  };
}

const ROWS: Array<[string, SetupRowKey] | null> = [
  ["estimand", "estimand"], ["struct", "struct"], ["seen", "seen"], ["in model", "adj"], null,
  ["family", "family"], ["link", "link"], ["noise", "noise"], ["modifier", "modifier"], null,
  ["owner", "owner"]
];
const GROUP_LABEL: Record<SetupGroup, string> = {
  exposure: "τ", outcome: "Υ", adjusted: "ADJUSTED", other: "OTHER", latent: "LATENT"
};

/** Render the script as mono-safe text. One glyph per cell; every column is exactly `cw` wide. */
export function renderSetupScript(s: SetupScript, cw = 4): string {
  const LBL = 9;
  const groups: SetupGroup[] = ["exposure", "outcome", "adjusted", "other", "latent"];
  const present = groups.filter((gr) => s.nodes.some((n) => n.group === gr));
  const cols = present.map((gr) => s.nodes.filter((n) => n.group === gr));
  // TRUNCATE, never overflow: a label wider than its group silently pushes every column right of it.
  const centre = (t: string, w: number) => {
    const cut = [...t].slice(0, w).join("");
    const l = Math.floor((w - [...cut].length) / 2);
    return " ".repeat(Math.max(0, l)) + cut + " ".repeat(Math.max(0, w - [...cut].length - l));
  };
  const rule = (l: string, m: string, r: string) =>
    " ".repeat(LBL) + cols.map((c, i) => (i === 0 ? l : m) + "─".repeat(c.length * cw)).join("") + r;

  const L: string[] = [];
  L.push(`⟦ ${s.title} ⟧`);
  L.push(rule("┌", "┬", "┐"));
  L.push(" ".repeat(LBL) + cols.map((c, i) => "│" + centre(GROUP_LABEL[present[i]!], c.length * cw)).join("") + "│");
  L.push(" ".repeat(LBL) + cols.map((c) => "│" + c.map((n) => centre(n.key, cw)).join("")).join("") + "│");
  L.push(rule("├", "┼", "┤"));
  for (const row of ROWS) {
    if (!row) { L.push(rule("├", "┼", "┤")); continue; }
    const [label, key] = row;
    L.push(label.padEnd(LBL) + cols.map((c) => "│" + c.map((n) => centre(n.cells[key], cw)).join("")).join("") + "│");
  }
  L.push(rule("└", "┴", "┘"));
  L.push("");
  const e = s.edges;
  L.push("edges    " + SETUP_GLYPHS.plumbing.repeat(e.plumbing) + SETUP_GLYPHS.fitted.repeat(e.fitted) +
         SETUP_GLYPHS.authored.repeat(e.authored));
  for (const f of s.facts) L.push(f);
  if (s.effectOwner) L.push(`effect    ${s.effectOwner === "authored" ? "█ authored — the imposed truth is intact" : "▒ FITTED — the imposed truth is GONE"}`);
  if (s.warnings.length) {
    L.push("");
    for (const w of s.warnings) L.push("  ✗ " + w);
  }
  if (s.notes.length) {
    L.push("");
    for (const n of s.notes) L.push("  · " + n);
  }
  L.push("");
  L.push("keys     " + s.nodes.map((n) => `${n.key}=${n.id}`).join("  "));
  return L.join("\n");
}

/** One call: a document in, the pasteable block out. */
export function setupScript(doc: GraphDocument, cw = 4): string {
  return renderSetupScript(analyzeSetup(doc), cw);
}
