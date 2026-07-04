import { useState } from "react";
import { normalizeNodeMechanism, setCopulaBlock, simpleEdge } from "@nudagitty/core";
import type { CopulaBlock, GraphDocument } from "@nudagitty/core";
import { CopulaAuthor, type CopulaVariable, type VineSpec } from "./CopulaAuthor";

// In-app mount of CopulaAuthor: authors the joint dependence of the root covariates (confounders)
// and commits it as a copula block, so the simulation — and the effect stack / overlap card — react.
// Marginals are read from the nodes; only the dependence is authored here.
function rootCovariates(document: GraphDocument): CopulaVariable[] {
  const graph = document.graph;
  const hasParent = (id: string) => graph.edges.some((e) => e.kind === "directed" && e.target === id);
  return graph.nodes
    .filter((n) => !hasParent(n.id) && !n.roles.exposure && !n.roles.outcome && !n.roles.latent)
    .map((n) => ({ id: n.id, name: n.label || n.id, marginal: normalizeNodeMechanism(document.simulation.nodes[n.id]).distribution }));
}
function defaultVine(d: number): VineSpec {
  return { order: Array.from({ length: d }, (_, i) => i), depth: 1, trees: [Array.from({ length: d - 1 }, () => ({ family: "gaussian", tau: 0 }))] };
}
function blockToVine(block: CopulaBlock | undefined, vars: CopulaVariable[]): VineSpec | null {
  if (!block || block.nodes.length !== vars.length || !block.nodes.every((id, i) => id === vars[i]!.id)) return null;
  return {
    order: block.order,
    depth: block.depth,
    trees: block.edges.map((tree) => tree.map((edge) => { const c = edge.components[0]!; return { family: c.family, tau: c.tau.constant, rotation: c.rotation }; }))
  };
}
function vineToBlock(spec: VineSpec, nodeIds: string[]): CopulaBlock {
  return {
    id: "cov",
    nodes: nodeIds,
    order: spec.order,
    depth: spec.depth,
    edges: spec.trees.map((tree) => tree.map((pc) => simpleEdge(pc.family, pc.tau, pc.rotation ?? 0)))
  };
}

export function CopulaBlockEditor(props: { document: GraphDocument; onCommit: (doc: GraphDocument) => void }) {
  const vars = rootCovariates(props.document);
  const [spec, setSpec] = useState<VineSpec>(() => blockToVine(props.document.simulation.copulaBlocks?.[0], vars) ?? defaultVine(Math.max(2, vars.length)));
  if (vars.length < 2) {
    return <p className="ca-note">Mark at least two independent root covariates (confounders) to author their joint dependence here — coupling them changes overlap and the observed estimates while the do()-truth stays fixed.</p>;
  }
  const onSpec = (next: VineSpec) => {
    setSpec(next);
    props.onCommit(setCopulaBlock(props.document, vineToBlock(next, vars.map((v) => v.id))));
  };
  return (
    <div>
      <p className="ca-note">Author the confounder joint. Coupling the covariates (drag the τ sliders) changes overlap and the crude/observed estimates downstream while adjustment still recovers the truth. Marginals come from the nodes.</p>
      <CopulaAuthor variables={vars} spec={spec} onSpec={onSpec} marginalsReadOnly />
    </div>
  );
}
