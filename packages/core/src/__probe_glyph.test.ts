import { describe, it } from "vitest";
import { exampleDocument } from "./examples";
import { normalizeNodeMechanism, normalizeEdgeMechanism, normalizeVariableModel, nodeDataMode, imposedEffectEdge } from "./index";

// PROBE — delete me. What does the 17-category state ACTUALLY look like on real setups?
// Shape matters: how many nodes, how many edges, how many provenance-bearing NUMBERS?
const IDS = ["lalonde-fit-recover-2part", "lalonde-heterogeneous", "tutoring-scores"];

describe("PROBE: glyph shape", () => {
  it("dumps the real per-node / per-edge / global state", () => {
    for (const id of IDS) {
      const doc = exampleDocument(id)!;
      const nodes = doc.graph.nodes;
      const edges = doc.graph.edges.filter((e) => e.kind === "directed");
      const pins = new Set(doc.metadata.pins ?? []);
      const authored = new Set(doc.metadata.authored ?? []);
      const eff = imposedEffectEdge(doc);

      // how many PROVENANCE-BEARING NUMBERS are there really?
      let numbers = 0;
      for (const n of nodes) {
        const m = normalizeNodeMechanism(doc.simulation.nodes[n.id]);
        numbers += 2;                                     // intercept + noise
        numbers += Object.keys(m.gate?.coefficients ?? {}).length;
      }
      numbers += edges.length;                            // one coefficient per edge

      console.log(`\n╔══ ${id}`);
      console.log(`║ nodes=${nodes.length}  directed edges=${edges.length}  provenance-bearing NUMBERS=${numbers}`);
      console.log(`║ pins=${pins.size}  authored=${authored.size}  imposedEffect=${doc.metadata.imposedEffect ? JSON.stringify(doc.metadata.imposedEffect) : "none"}`);
      console.log(`║`);
      console.log(`║ node                  role      family          combiner            noise      mode    inter`);
      for (const n of nodes) {
        const m = normalizeNodeMechanism(doc.simulation.nodes[n.id]);
        const v = normalizeVariableModel(n.variable);
        const role = n.roles?.exposure ? "EXPOSURE" : n.roles?.outcome ? "OUTCOME" : n.roles?.adjusted ? "adjusted" : n.roles?.latent ? "latent" : "-";
        const mode = nodeDataMode(doc, n.id) ?? "—";
        console.log(
          `║ ${n.id.padEnd(20)} ${role.padEnd(9)} ${v.valueType.padEnd(15)} ${m.combiner.padEnd(19)} ${m.noise.kind.padEnd(10)} ${String(mode).padEnd(7)} ${m.interactions.length || ""}`
        );
      }
      const forms = new Map<string, number>();
      for (const e of edges) {
        const k = normalizeEdgeMechanism(doc.simulation.edges[e.id]).kind;
        forms.set(k, (forms.get(k) ?? 0) + 1);
      }
      console.log(`║ edge forms: ${[...forms].map(([k, c]) => `${k}×${c}`).join("  ")}`);
      console.log(`║ effect edge: ${eff ? eff.edgeId : "none"}`);
    }
  }, 120000);
});
