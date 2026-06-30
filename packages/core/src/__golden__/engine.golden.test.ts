import { describe, expect, it } from "vitest";
import { EXAMPLES, exampleDocument } from "../examples";
import { runSimulation } from "../simulation";
import { normalizeVariableModel } from "../graph";
import type { GraphModel, SimulationResult, SimulationSpec } from "../types";

// ---------------------------------------------------------------------------
// GOLDEN / CHARACTERIZATION NET (permanent — do NOT delete).
//
// Locks the engine's numerical behavior for every example so the decomposition
// + re-architecture run can move/rewrite code under a hard guard. Simulations
// are seeded (createSeededRandomSource), so these snapshots are deterministic.
// A snapshot diff during the refactor means an UNINTENDED behavior change —
// investigate; never `-u` it blindly.
// ---------------------------------------------------------------------------

const r6 = (x: number | null | undefined): number | null =>
  x == null || !Number.isFinite(x) ? null : Math.round(x * 1e6) / 1e6;

function isBinary(graph: GraphModel, id: string): boolean {
  const node = graph.nodes.find((n) => n.id === id);
  return node ? normalizeVariableModel(node.variable).valueType === "binary" : false;
}

function percentile(samples: number[], q: number): number {
  const finite = samples.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (finite.length === 0) return 0;
  const pos = (finite.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? finite[lo]! : finite[lo]! + (finite[hi]! - finite[lo]!) * (pos - lo);
}

function doMean(graph: GraphModel, spec: SimulationSpec, node: string, value: number, outcome: string): number {
  const result: SimulationResult = runSimulation(graph, {
    ...spec,
    overrides: { ...spec.overrides, [node]: value },
    selections: {}
  });
  return result.nodeStates[outcome]?.empirical.mean ?? NaN;
}

function snapshotExample(id: string) {
  const document = exampleDocument(id);
  if (!document) throw new Error(`no document for example ${id}`);
  const { graph } = document;
  const base = runSimulation(graph, document.simulation);

  // Per-node weighted moments (the engine's empirical mean / sd).
  const nodes: Record<string, { mean: number | null; sd: number | null }> = {};
  for (const node of graph.nodes) {
    const state = base.nodeStates[node.id];
    const variance = state?.empirical.variance;
    nodes[node.id] = {
      mean: r6(state?.empirical.mean ?? null),
      sd: r6(variance != null && Number.isFinite(variance) ? Math.sqrt(variance) : null)
    };
  }

  // Interventional do()-contrasts for every exposure × outcome — the causal
  // signature. Binary: do(1) − do(0). Continuous: do(p90) − do(p10).
  const exposures = graph.nodes.filter((n) => n.roles.exposure);
  const outcomes = graph.nodes.filter((n) => n.roles.outcome).map((n) => n.id);
  const doContrasts: Record<string, number | null> = {};
  for (const exposure of exposures) {
    const binary = isBinary(graph, exposure.id);
    const samples = base.nodeStates[exposure.id]?.empirical.samples ?? [];
    const hiValue = binary ? 1 : percentile(samples, 0.9);
    const loValue = binary ? 0 : percentile(samples, 0.1);
    for (const outcome of outcomes) {
      if (outcome === exposure.id) continue;
      const contrast = doMean(graph, document.simulation, exposure.id, hiValue, outcome) - doMean(graph, document.simulation, exposure.id, loValue, outcome);
      const label = binary ? `do(${exposure.id}=1)−do(0) on ${outcome}` : `do(${exposure.id}↑)−do(↓) on ${outcome}`;
      doContrasts[label] = r6(contrast);
    }
  }

  return { nodes, doContrasts };
}

describe("engine golden", () => {
  for (const example of EXAMPLES) {
    it(`${example.id} — simulation + do-contrasts are stable`, () => {
      expect(snapshotExample(example.id)).toMatchSnapshot();
    });
  }
});
