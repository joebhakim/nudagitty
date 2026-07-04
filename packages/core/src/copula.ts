import type { CopulaBlock, GraphDocument } from "./types";

/** Set (or clear, with null) the document's copula blocks — the general moderated-vine dependence layer. */
export function setCopulaBlock(document: GraphDocument, block: CopulaBlock | null): GraphDocument {
  return { ...document, simulation: { ...document.simulation, copulaBlocks: block ? [block] : undefined } };
}

// Gaussian-copula covariates are nodes whose value is drawn from a marginal mapped through a shared
// latent Gaussian source (combiner "copula_marginal"). Their pairwise correlation ≈ loading², where the
// loading is the source→covariate edge coefficient; the residual sd = √(1−loading²) keeps each marginal
// calibrated. These helpers let the UI tune that correlation while moving BOTH together (editing the
// edge coefficient alone would silently break the marginal).

export function copulaCovariateIds(document: GraphDocument): string[] {
  return document.graph.nodes
    .filter((node) => document.simulation.nodes[node.id]?.combiner === "copula_marginal")
    .map((node) => node.id);
}

function loadingEdgeId(document: GraphDocument, covariateId: string): string | null {
  const edge = document.graph.edges.find((candidate) => candidate.target === covariateId && candidate.kind === "directed");
  return edge?.id ?? null;
}

/** Current uniform copula correlation (≈ loading² of the first covariate), or null if no copula. */
export function copulaCorrelation(document: GraphDocument): number | null {
  const ids = copulaCovariateIds(document);
  if (ids.length === 0) return null;
  const edgeId = loadingEdgeId(document, ids[0]!);
  if (!edgeId) return null;
  const lambda = document.simulation.edges[edgeId]?.coefficient ?? 0;
  return Math.min(1, Math.max(0, lambda * lambda));
}

/**
 * Set a uniform pairwise correlation across the copula covariates: every loading → √ρ and every residual
 * sd → √(1−ρ). Exact for symmetric copulas (equal loadings); for a copula with intentionally unequal
 * loadings this flattens them to one shared value (the price of a single slider).
 */
export function setCopulaCorrelation(document: GraphDocument, rho: number): GraphDocument {
  const ids = copulaCovariateIds(document);
  if (ids.length === 0) return document;
  const clamped = Math.min(0.97, Math.max(0, rho));
  const lambda = Math.sqrt(clamped);
  const residualSd = Math.sqrt(Math.max(0, 1 - clamped));
  const edges = { ...document.simulation.edges };
  const nodes = { ...document.simulation.nodes };
  for (const id of ids) {
    const edgeId = loadingEdgeId(document, id);
    if (edgeId && edges[edgeId]) edges[edgeId] = { ...edges[edgeId], coefficient: lambda };
    const node = nodes[id];
    if (node) nodes[id] = { ...node, noise: { kind: "normal", mean: 0, sd: residualSd } };
  }
  return { ...document, simulation: { ...document.simulation, edges, nodes } };
}
