import { describe, it, expect } from "vitest";
import { exampleDocument } from "./examples";
import { runSimulation, normalizeNodeMechanism, normalizeEdgeMechanism, normalizeVariableModel } from "./index";

// Behavioral lock for the two-part (Cragg) fitted-DGP example: Earnings_78 is a SEMICONTINUOUS outcome
// whose fitted marginal has the real earnings zero spike, the imposed +$1,794 is split extensive-led
// across both margins, and adjustment must recover it from a badly confounded crude gap. The do()-oracle
// carries Monte-Carlo noise (a two-part effect is nonlinear, unlike the exact additive #95), so it is
// checked within a band around the imposed truth, clearly distinct from the crude gap.
describe("two-part fitted-DGP example (lalonde-fit-recover-2part)", () => {
  const doc = exampleDocument("lalonde-fit-recover-2part")!;

  it("is a semicontinuous outcome with both margins imposed", () => {
    const outcome = doc.graph.nodes.find((n) => n.id === "Earnings_78")!;
    expect(normalizeVariableModel(outcome.variable).valueType).toBe("semicontinuous");
    const mech = normalizeNodeMechanism(doc.simulation.nodes["Earnings_78"]);
    expect(mech.combiner).toBe("positive_softplus");
    expect(mech.gate?.coefficients["In_program"] ?? 0).toBeGreaterThan(0); // extensive shift γ
    const effect = doc.graph.edges.find((e) => e.source === "In_program" && e.target === "Earnings_78")!;
    const m = normalizeEdgeMechanism(doc.simulation.edges[effect.id]);
    expect(m.kind === "linear" ? m.coefficient : 0).toBeGreaterThan(0); // intensive shift δ
  });

  it("fitted marginal has the zero spike and no negatives", () => {
    const s = runSimulation(doc.graph, doc.simulation).nodeStates["Earnings_78"]?.empirical.samples ?? [];
    const zero = s.filter((x) => x === 0).length / s.length;
    const neg = s.filter((x) => x < 0).length / s.length;
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    expect(zero).toBeGreaterThan(0.05); // a real zero spike (the two-part win)
    expect(neg).toBe(0); // strictly non-negative earnings
    expect(mean).toBeGreaterThan(15000);
    expect(mean).toBeLessThan(27000);
  });

  it("do() recovers the imposed +$1,794 while the crude gap is badly biased", () => {
    const s1 = runSimulation(doc.graph, { ...doc.simulation, overrides: { In_program: 1 } });
    const s0 = runSimulation(doc.graph, { ...doc.simulation, overrides: { In_program: 0 } });
    const ate = (s1.nodeStates["Earnings_78"]?.empirical.mean ?? NaN) - (s0.nodeStates["Earnings_78"]?.empirical.mean ?? NaN);
    expect(ate).toBeGreaterThan(1300); // recovers +1794 within Monte-Carlo noise
    expect(ate).toBeLessThan(2300);

    const base = runSimulation(doc.graph, doc.simulation);
    const y = base.nodeStates["Earnings_78"]?.empirical.samples ?? [];
    const t = base.nodeStates["In_program"]?.empirical.samples ?? [];
    let s1sum = 0, n1 = 0, s0sum = 0, n0 = 0;
    for (let i = 0; i < y.length; i += 1) { if ((t[i] ?? 0) > 0.5) { s1sum += y[i]!; n1 += 1; } else { s0sum += y[i]!; n0 += 1; } }
    const crude = s1sum / n1 - s0sum / n0;
    expect(crude).toBeLessThan(-5000); // confounded: the naive gap is badly negative
  });
});
