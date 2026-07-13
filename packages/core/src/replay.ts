import type { GraphDocument } from "./types";
import { normalizeEdgeMechanism, normalizeNodeMechanism } from "./graph";

/**
 * REPLAY — which nodes are reading their data column instead of being generated, and what that costs.
 *
 * Right after an import, every node is fed by an enabled `table_lookup` edge, so the simulator takes this
 * branch (simulation/core.ts):
 *
 *     const rawLookup = lookupContribution !== null && mechanism.interactions.length === 0;
 *     if (rawLookup) value = lookupContribution!;   // the data cell REPLACES everything
 *
 * The node IS its cell. Its intercept, noise, combiner and — the part nobody expects — **every other
 * incoming edge** are discarded. So the DAG you just drew does not generate anything, and the arrows render
 * a confident `linear coef +1.00` that has no effect whatsoever. Setting one to 999 changes nothing.
 *
 * That is defensible on its own (the DAG is still the ADJUSTMENT graph — it drives the backdoor set and
 * every estimator in the methods panel). What is NOT defensible is the consequence nobody was told about:
 *
 *     with the outcome replaying its column, do(T=1) − do(T=0) = $0.00, EXACTLY.
 *
 * Not "unknown", not "—". Zero, printed as the re-simulated oracle, next to estimators that disagree with
 * it — because intervening on a column that is read from a file cannot change it. It is the most persuasive
 * number on the screen and it is structurally guaranteed to be wrong.
 *
 * This module is the single predicate for that state, and it mirrors the simulator's `rawLookup` exactly. If
 * these two ever disagree, the UI is lying about which arrows are live — so they must be read together.
 */
export interface ReplayState {
  /** Nodes replaying their data column. Their equations AND their incoming structural edges are ignored. */
  replayNodes: string[];
  /** Drawn edges whose target replays ⇒ they contribute NOTHING to generation. (The table_lookup itself is
   *  excluded — it is the thing doing the replaying, not a victim of it.) */
  inertEdges: string[];
  /** The outcome replays ⇒ do() cannot move it ⇒ the oracle is structurally 0. The dangerous one. */
  outcomeReplays: boolean;
  /** True when there is anything at all to warn about. */
  any: boolean;
}

/** Does this node replay its data cell? EXACTLY the simulator's `rawLookup` predicate — keep them in step. */
export function nodeReplaysData(document: GraphDocument, nodeId: string): boolean {
  if (normalizeNodeMechanism(document.simulation.nodes[nodeId]).interactions.length > 0) return false;
  return document.graph.edges.some((edge) => {
    if (edge.target !== nodeId || edge.kind !== "directed") return false;
    const mech = normalizeEdgeMechanism(document.simulation.edges[edge.id]);
    return mech.kind === "table_lookup" && mech.enabled;
  });
}

/** Is this edge drawn but dead — i.e. does it contribute nothing to generation? */
export function edgeIsInert(document: GraphDocument, edgeId: string): boolean {
  const edge = document.graph.edges.find((e) => e.id === edgeId);
  if (!edge || edge.kind !== "directed") return false;
  const mech = normalizeEdgeMechanism(document.simulation.edges[edgeId]);
  if (mech.kind === "table_lookup") return false;   // this edge IS the replay
  if (!mech.enabled) return false;                  // already visibly off — a different state
  return nodeReplaysData(document, edge.target);
}

export function replayState(document: GraphDocument): ReplayState {
  const replayNodes = document.graph.nodes
    .filter((node) => nodeReplaysData(document, node.id))
    .map((node) => node.id);
  const replaying = new Set(replayNodes);
  const inertEdges = document.graph.edges
    .filter((edge) => edge.kind === "directed" && replaying.has(edge.target)
      && normalizeEdgeMechanism(document.simulation.edges[edge.id]).kind !== "table_lookup"
      && normalizeEdgeMechanism(document.simulation.edges[edge.id]).enabled)
    .map((edge) => edge.id);
  const outcome = document.graph.nodes.find((node) => node.roles?.outcome)?.id;
  const outcomeReplays = outcome !== undefined && replaying.has(outcome);
  return { replayNodes, inertEdges, outcomeReplays, any: inertEdges.length > 0 || outcomeReplays };
}

/** The refusal shown in place of the oracle. A wrong number is worse than no number. */
export const REPLAY_ORACLE_REFUSAL =
  "No causal effect to report: the outcome is REPLAYING its data column, so intervening on the treatment " +
  "cannot change it and this contrast is exactly 0 by construction — not an estimate of anything. Fit the " +
  "outcome from data (or author its equation) to give the intervention something to act on.";
