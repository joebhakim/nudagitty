import { describe, expect, it } from "vitest";
import { createSeededRandomSource, runSimulation, sampleDistribution } from "./simulation";
import { parseModel } from "./parser";
import { defaultEdgeMechanism, normalizeNodeMechanism } from "./graph";
import { exampleDocument } from "./examples";

describe("SEM simulation", () => {
  it("propagates linear edge coefficients in topological order", () => {
    const doc = parseModel(`dag {
      X [exposure]
      M
      Y [outcome]
      X -> M
      M -> Y
    }`).document;
    doc.simulation.nodes.X = normalizeNodeMechanism({ distribution: { kind: "constant", value: 2 }, intercept: 0, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.M = normalizeNodeMechanism({ distribution: { kind: "constant", value: 0 }, intercept: 1, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.Y = normalizeNodeMechanism({ distribution: { kind: "constant", value: 0 }, intercept: 0, noise: { kind: "constant", value: 0 } });
    const xm = doc.graph.edges.find((edge) => edge.source === "X" && edge.target === "M");
    const my = doc.graph.edges.find((edge) => edge.source === "M" && edge.target === "Y");
    if (!xm || !my) throw new Error("missing fixture edges");
    doc.simulation.edges[xm.id] = { ...defaultEdgeMechanism(), coefficient: 3 };
    doc.simulation.edges[my.id] = { ...defaultEdgeMechanism(), coefficient: 2 };

    const result = runSimulation(doc.graph, doc.simulation);
    expect(result.values.X).toBe(2);
    expect(result.values.M).toBe(7);
    expect(result.values.Y).toBe(14);
  });

  it("allows simulation when a cycle edge is disabled", () => {
    const doc = parseModel(`dag {
      A
      B
      A -> B
      B -> A
    }`).document;
    const ba = doc.graph.edges.find((edge) => edge.source === "B" && edge.target === "A");
    if (!ba) throw new Error("missing cycle edge");
    doc.simulation.nodes.A = normalizeNodeMechanism({ distribution: { kind: "constant", value: 1 }, intercept: 0, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.B = normalizeNodeMechanism({ distribution: { kind: "constant", value: 0 }, intercept: 0, noise: { kind: "constant", value: 0 } });
    doc.simulation.edges[ba.id] = { ...defaultEdgeMechanism(), enabled: false };

    const result = runSimulation(doc.graph, doc.simulation);
    expect(result.diagnostics.some((message) => message.startsWith("Simulation disabled"))).toBe(false);
    expect(result.values.B).toBe(1);
  });

  it("supports threshold edge mechanisms", () => {
    const doc = parseModel(`dag {
      A
      B
      A -> B
    }`).document;
    const edge = doc.graph.edges[0];
    if (!edge) throw new Error("missing edge");
    doc.simulation.nodes.A = normalizeNodeMechanism({ distribution: { kind: "constant", value: 2 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.B = normalizeNodeMechanism({ intercept: 0, noise: { kind: "constant", value: 0 } });
    doc.simulation.edges[edge.id] = { ...defaultEdgeMechanism("threshold"), threshold: 1, low: -1, high: 5 };

    const result = runSimulation(doc.graph, doc.simulation);
    expect(result.values.B).toBe(5);
  });

  it("supports dose-response, log, power, and monotone edge mechanisms", () => {
    const doc = parseModel(`dag {
      A
      B
      A -> B
    }`).document;
    const edge = doc.graph.edges[0];
    if (!edge) throw new Error("missing edge");
    doc.simulation.nodes.A = normalizeNodeMechanism({ distribution: { kind: "constant", value: 1 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.B = normalizeNodeMechanism({ intercept: 0, noise: { kind: "constant", value: 0 } });

    doc.simulation.edges[edge.id] = { ...defaultEdgeMechanism("hill_emax"), baseline: 0, maxEffect: 10, ec50: 1, exponent: 1 };
    expect(runSimulation(doc.graph, doc.simulation).values.B).toBe(5);

    doc.simulation.edges[edge.id] = { ...defaultEdgeMechanism("log_linear"), coefficient: 2, offset: 1, baseline: 0 };
    expect(runSimulation(doc.graph, doc.simulation).values.B).toBeCloseTo(2 * Math.log(2));

    doc.simulation.nodes.A = normalizeNodeMechanism({ distribution: { kind: "constant", value: 2 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.edges[edge.id] = { ...defaultEdgeMechanism("power_law"), coefficient: 3, scale: 2, exponent: 2, offset: 0, baseline: 0 };
    expect(runSimulation(doc.graph, doc.simulation).values.B).toBe(3);

    doc.simulation.edges[edge.id] = { ...defaultEdgeMechanism("monotone_spline"), points: [{ x: 0, y: 0 }, { x: 2, y: 4 }, { x: 4, y: 5 }] };
    expect(runSimulation(doc.graph, doc.simulation).values.B).toBe(4);
  });

  it("supports bounded node combiners and product interactions", () => {
    const doc = parseModel(`dag {
      A
      C
      B
      A -> B
      C -> B
    }`).document;
    const edges = doc.graph.edges;
    doc.simulation.nodes.A = normalizeNodeMechanism({ distribution: { kind: "constant", value: 2 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.C = normalizeNodeMechanism({ distribution: { kind: "constant", value: 3 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.B = normalizeNodeMechanism({
      intercept: 0,
      noise: { kind: "constant", value: 0 },
      interactions: [{ id: "i1", kind: "product", left: "A", right: "C", coefficient: 2 }]
    });
    for (const edge of edges) {
      doc.simulation.edges[edge.id] = { ...defaultEdgeMechanism(), coefficient: 0 };
    }

    expect(runSimulation(doc.graph, doc.simulation).values.B).toBe(12);

    doc.simulation.nodes.B = normalizeNodeMechanism({ ...doc.simulation.nodes.B, combiner: "bounded_logistic", interactions: [] });
    expect(runSimulation(doc.graph, doc.simulation).values.B).toBe(0.5);
  });

  it("supports probabilistic node combiners and additional noise menus", () => {
    const doc = parseModel(`dag {
      A
      C
      B
      A -> B
      C -> B
    }`).document;
    const aToB = doc.graph.edges.find((edge) => edge.source === "A");
    const cToB = doc.graph.edges.find((edge) => edge.source === "C");
    if (!aToB || !cToB) throw new Error("missing fixture edges");
    doc.simulation.nodes.A = normalizeNodeMechanism({ distribution: { kind: "constant", value: 1 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.C = normalizeNodeMechanism({ distribution: { kind: "constant", value: 1 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.B = normalizeNodeMechanism({ intercept: 0, noise: { kind: "constant", value: 0 }, combiner: "noisy_or" });
    doc.simulation.edges[aToB.id] = { ...defaultEdgeMechanism(), coefficient: 0.3 };
    doc.simulation.edges[cToB.id] = { ...defaultEdgeMechanism(), coefficient: 0.4 };

    expect(runSimulation(doc.graph, doc.simulation).values.B).toBeCloseTo(0.58);

    doc.simulation.nodes.B = normalizeNodeMechanism({ intercept: Math.log(3), noise: { kind: "constant", value: 0 }, combiner: "poisson_log" });
    doc.simulation.edges[aToB.id] = { ...defaultEdgeMechanism(), coefficient: 0 };
    doc.simulation.edges[cToB.id] = { ...defaultEdgeMechanism(), coefficient: 0 };
    expect(runSimulation(doc.graph, doc.simulation).values.B).toBeCloseTo(3);

    expect(sampleDistribution({ kind: "laplace", mean: 0, scale: 1 }, () => 0.5)).toBe(0);
    expect(sampleDistribution({ kind: "exponential", rate: 2 }, () => 0)).toBeCloseTo(0);
  });

  it("samples expanded distributions reproducibly from a seeded source", () => {
    const distributions = [
      { kind: "normal", mean: 2, sd: 0.4 },
      { kind: "lognormal", meanLog: 0, sdLog: 0.2 },
      { kind: "poisson", lambda: 3 },
      { kind: "beta", alpha: 2, beta: 5 },
      { kind: "gamma", shape: 2, scale: 0.5 },
      { kind: "student_t", mean: 0, scale: 1, df: 6 }
    ] as const;

    const sourceA = createSeededRandomSource(42);
    const sourceB = createSeededRandomSource(42);
    const first = distributions.map((distribution) => sampleDistribution(distribution, sourceA));
    const second = distributions.map((distribution) => sampleDistribution(distribution, sourceB));

    expect(first).toEqual(second);
    expect(first.every((value) => Number.isFinite(value))).toBe(true);
  });

  it("exposes analytic and empirical distributions for the Galton example", () => {
    const doc = exampleDocument("galton-regression");
    if (!doc) throw new Error("missing Galton example");

    const result = runSimulation(doc.graph, doc.simulation);
    const father = result.nodeStates.Father_height;
    const son = result.nodeStates.Son_height;
    if (!father?.analytic || !son?.analytic) throw new Error("missing distribution states");

    expect(father.analytic.distribution.kind).toBe("normal");
    expect(son.analytic.distribution.kind).toBe("normal");
    expect(father.analytic.mean).toBeCloseTo(69);
    expect(son.analytic.mean).toBeCloseTo(69);
    expect(father.analytic.variance).toBeCloseTo(2.8 * 2.8);
    expect(son.analytic.variance).toBeCloseTo(2.8 * 2.8, 1);
    expect(father.empirical.samples.length).toBeGreaterThanOrEqual(80);
    expect(son.empirical.samples.every((value) => Number.isFinite(value))).toBe(true);
  });

  it("separates hard intervention from observational conditioning in the Galton example", () => {
    const baseline = exampleDocument("galton-regression");
    const intervened = exampleDocument("galton-regression");
    const conditioned = exampleDocument("galton-regression");
    if (!baseline || !intervened || !conditioned) throw new Error("missing Galton example");

    intervened.simulation.overrides.Father_height = 78;
    conditioned.simulation.selections.Father_height = { operator: "at_least", value: 72, upper: null, sampling: "auto" };

    const baselineResult = runSimulation(baseline.graph, baseline.simulation);
    const interventionResult = runSimulation(intervened.graph, intervened.simulation);
    const conditioningResult = runSimulation(conditioned.graph, conditioned.simulation);

    expect(interventionResult.values.Father_height).toBe(78);
    expect(interventionResult.nodeStates.Father_height?.analytic?.note).toBe("hard do intervention");
    expect(interventionResult.values.Son_height).toBeCloseTo(baselineResult.values.Son_height ?? 0);
    expect(conditioningResult.nodeStates.Son_height?.analytic?.mean ?? 0).toBeCloseTo(70.6, 1);
    expect(conditioningResult.nodeStates.Son_height?.analytic?.note).toContain("linear Gaussian");
    expect(conditioningResult.nodeStates.Father_height?.analytic?.density).toEqual({
      kind: "truncated_normal",
      mean: 69,
      sd: 2.8,
      lower: 72,
      upper: null
    });
    expect(conditioningResult.nodeStates.Son_height?.empirical.mean ?? 0).toBeGreaterThan(69);
    expect(conditioningResult.conditioning.acceptedSamples).toBeGreaterThan(0);
    expect(conditioningResult.conditioning.activeConditions).toEqual(["Father_height >= 72"]);
    expect(conditioningResult.conditioning.analytic).toContain("analytic linear Gaussian");
    expect(conditioningResult.conditioning.requestedInference).toBe("auto");
    expect(conditioningResult.conditioning.primaryMethod).toBe("analytic");
  });

  it("uses importance sampling for rare conditions on noisy intermediate variables", () => {
    const doc = parseModel(`dag {
      A
      M
      Y
      A -> M
      M -> Y
    }`).document;
    const aToM = doc.graph.edges.find((edge) => edge.source === "A" && edge.target === "M");
    const mToY = doc.graph.edges.find((edge) => edge.source === "M" && edge.target === "Y");
    if (!aToM || !mToY) throw new Error("missing fixture edges");

    doc.simulation.nodes.A = normalizeNodeMechanism({ distribution: { kind: "normal", mean: 0, sd: 1 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.M = normalizeNodeMechanism({ intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
    doc.simulation.nodes.Y = normalizeNodeMechanism({ intercept: 0, noise: { kind: "constant", value: 0 } });
    doc.simulation.edges[aToM.id] = { ...defaultEdgeMechanism(), coefficient: 1 };
    doc.simulation.edges[mToY.id] = { ...defaultEdgeMechanism(), coefficient: 1 };
    doc.simulation.selections.M = { operator: "at_least", value: 4, upper: null, sampling: "auto" };

    const result = runSimulation(doc.graph, doc.simulation);
    expect(result.conditioning.empiricalMethod).toBe("importance");
    expect(result.conditioning.acceptedSamples).toBe(320);
    expect(result.conditioning.totalSamples).toBe(320);
    expect(result.conditioning.effectiveSampleSize ?? 0).toBeGreaterThan(1);
    expect(result.nodeStates.M?.empirical.samples.every((value) => value >= 4)).toBe(true);
    expect(result.nodeStates.Y?.empirical.mean ?? 0).toBeGreaterThan(4);
  });

  it("uses linear Gaussian importance sampling for Galton conditioning", () => {
    const importance = exampleDocument("galton-regression");
    const rejection = exampleDocument("galton-regression");
    if (!importance || !rejection) throw new Error("missing Galton example");

    importance.simulation.selections.Father_height = { operator: "at_least", value: 72, upper: null, sampling: "importance" };
    rejection.simulation.selections.Father_height = { operator: "at_least", value: 72, upper: null, sampling: "rejection" };

    const importanceResult = runSimulation(importance.graph, importance.simulation);
    const rejectionResult = runSimulation(rejection.graph, rejection.simulation);

    expect(importanceResult.conditioning.empiricalMethod).toBe("importance");
    expect(importanceResult.conditioning.primaryMethod).toBe("importance");
    expect(importanceResult.conditioning.acceptedSamples).toBe(320);
    expect(importanceResult.conditioning.totalSamples).toBe(320);
    expect(importanceResult.nodeStates.Father_height?.empirical.samples.every((value) => value >= 72)).toBe(true);
    expect(importanceResult.nodeStates.Son_height?.analytic).toBeNull();
    expect(importanceResult.nodeStates.Son_height?.empirical.mean ?? 0).toBeGreaterThan(69);
    expect(rejectionResult.conditioning.empiricalMethod).toBe("rejection");
    expect(rejectionResult.conditioning.primaryMethod).toBe("rejection");
    expect(rejectionResult.conditioning.totalSamples).toBeGreaterThan(rejectionResult.conditioning.acceptedSamples);
    expect(rejectionResult.nodeStates.Son_height?.analytic).toBeNull();
  });

  it("coerces binary overrides and exposes binary expected values", () => {
    const doc = parseModel(`dag {
      A
      B
      A -> B
    }`).document;
    const a = doc.graph.nodes.find((node) => node.id === "A");
    const b = doc.graph.nodes.find((node) => node.id === "B");
    const edge = doc.graph.edges[0];
    if (!a || !b || !edge) throw new Error("missing fixture graph");

    a.variable = { ...a.variable, valueType: "binary" };
    b.variable = { ...b.variable, valueType: "binary", simulation: { ...b.variable.simulation, mode: "expected_value" } };
    doc.simulation.overrides.A = 0.3;
    doc.simulation.nodes.B = normalizeNodeMechanism({ intercept: 0, noise: { kind: "constant", value: 0 }, combiner: "bernoulli_logit" });
    doc.simulation.edges[edge.id] = { ...defaultEdgeMechanism(), coefficient: 0 };

    const result = runSimulation(doc.graph, doc.simulation);
    expect(result.values.A).toBe(0);
    expect(result.values.B).toBe(0.5);
  });

  it("analytically conditions a logit binary leaf on a continuous tail", () => {
    const doc = parseModel(`dag {
      X
      Y
      X -> Y
    }`).document;
    const y = doc.graph.nodes.find((node) => node.id === "Y");
    const edge = doc.graph.edges[0];
    if (!y || !edge) throw new Error("missing fixture graph");
    y.variable = { ...y.variable, valueType: "binary" };
    doc.simulation.nodes.X = normalizeNodeMechanism({ distribution: { kind: "normal", mean: 0, sd: 1 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.Y = normalizeNodeMechanism({ intercept: 0, noise: { kind: "constant", value: 0 }, combiner: "bernoulli_logit" });
    doc.simulation.edges[edge.id] = { ...defaultEdgeMechanism(), coefficient: 1 };
    doc.simulation.selections.X = { operator: "at_least", value: 1, upper: null, sampling: "analytic" };

    const result = runSimulation(doc.graph, doc.simulation);
    expect(result.conditioning.primaryMethod).toBe("analytic");
    expect(result.conditioning.analytic).toContain("logit-as-probit");
    const yAnalytic = result.nodeStates.Y?.analytic;
    expect(yAnalytic?.distribution.kind).toBe("bernoulli");
    expect((yAnalytic?.mean ?? 0)).toBeGreaterThan(0.5);
    expect(yAnalytic?.density).toEqual({ kind: "bernoulli", p: yAnalytic?.mean });
  });

  it("analytically conditions a continuous parent on a binary outcome", () => {
    const doc = parseModel(`dag {
      X
      Y
      X -> Y
    }`).document;
    const y = doc.graph.nodes.find((node) => node.id === "Y");
    const edge = doc.graph.edges[0];
    if (!y || !edge) throw new Error("missing fixture graph");
    y.variable = { ...y.variable, valueType: "binary" };
    doc.simulation.nodes.X = normalizeNodeMechanism({ distribution: { kind: "normal", mean: 0, sd: 1 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.Y = normalizeNodeMechanism({ intercept: 0, noise: { kind: "constant", value: 0 }, combiner: "bernoulli_logit" });
    doc.simulation.edges[edge.id] = { ...defaultEdgeMechanism(), coefficient: 1 };
    doc.simulation.selections.Y = { operator: "at_least", value: 1, upper: null, sampling: "analytic" };

    const result = runSimulation(doc.graph, doc.simulation);
    expect(result.conditioning.primaryMethod).toBe("analytic");
    const xAnalytic = result.nodeStates.X?.analytic;
    expect(xAnalytic?.distribution.kind).toBe("normal");
    expect((xAnalytic?.mean ?? 0)).toBeGreaterThan(0);
    const yAnalytic = result.nodeStates.Y?.analytic;
    expect(yAnalytic?.distribution).toEqual({ kind: "bernoulli", p: 1 });
    expect(yAnalytic?.density).toEqual({ kind: "bernoulli", p: 1 });
  });

  it("falls back to empirical when a binary node feeds another node", () => {
    const doc = parseModel(`dag {
      A
      B
      A -> B
    }`).document;
    const a = doc.graph.nodes.find((node) => node.id === "A");
    const b = doc.graph.nodes.find((node) => node.id === "B");
    const edge = doc.graph.edges[0];
    if (!a || !b || !edge) throw new Error("missing fixture graph");
    a.variable = { ...a.variable, valueType: "binary" };
    b.variable = { ...b.variable, valueType: "binary" };
    doc.simulation.nodes.A = normalizeNodeMechanism({ distribution: { kind: "bernoulli", p: 0.3 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.B = normalizeNodeMechanism({ intercept: 0, noise: { kind: "constant", value: 0 }, combiner: "bernoulli_logit" });
    doc.simulation.edges[edge.id] = { ...defaultEdgeMechanism(), coefficient: 2 };
    doc.simulation.selections.B = { operator: "at_least", value: 1, upper: null, sampling: "auto" };

    const result = runSimulation(doc.graph, doc.simulation);
    expect(result.conditioning.primaryMethod).not.toBe("analytic");
    expect(result.conditioning.analytic).toBeNull();
  });

  it("recovers a Bernoulli root marginal under independent continuous conditioning", () => {
    const doc = parseModel(`dag {
      A
      X
    }`).document;
    const a = doc.graph.nodes.find((node) => node.id === "A");
    if (!a) throw new Error("missing fixture graph");
    a.variable = { ...a.variable, valueType: "binary" };
    doc.simulation.nodes.A = normalizeNodeMechanism({ distribution: { kind: "bernoulli", p: 0.4 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.X = normalizeNodeMechanism({ distribution: { kind: "normal", mean: 0, sd: 1 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.selections.X = { operator: "at_least", value: 1, upper: null, sampling: "analytic" };

    const result = runSimulation(doc.graph, doc.simulation);
    expect(result.conditioning.primaryMethod).toBe("analytic");
    const aAnalytic = result.nodeStates.A?.analytic;
    expect(aAnalytic?.distribution.kind).toBe("bernoulli");
    expect(aAnalytic?.mean).toBeCloseTo(0.4, 2);
  });

  it("conditions on a joint event on two binaries via bivariate orthant truncation", () => {
    const doc = parseModel(`dag {
      U
      A
      B
      U -> A
      U -> B
    }`).document;
    const a = doc.graph.nodes.find((node) => node.id === "A");
    const b = doc.graph.nodes.find((node) => node.id === "B");
    const ua = doc.graph.edges.find((edge) => edge.source === "U" && edge.target === "A");
    const ub = doc.graph.edges.find((edge) => edge.source === "U" && edge.target === "B");
    if (!a || !b || !ua || !ub) throw new Error("missing fixture graph");
    a.variable = { ...a.variable, valueType: "binary" };
    b.variable = { ...b.variable, valueType: "binary" };
    doc.simulation.nodes.U = normalizeNodeMechanism({ distribution: { kind: "normal", mean: 0, sd: 1 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.A = normalizeNodeMechanism({ intercept: 0, noise: { kind: "constant", value: 0 }, combiner: "bernoulli_logit" });
    doc.simulation.nodes.B = normalizeNodeMechanism({ intercept: 0, noise: { kind: "constant", value: 0 }, combiner: "bernoulli_logit" });
    doc.simulation.edges[ua.id] = { ...defaultEdgeMechanism(), coefficient: 1 };
    doc.simulation.edges[ub.id] = { ...defaultEdgeMechanism(), coefficient: 1 };
    doc.simulation.selections.A = { operator: "at_least", value: 1, upper: null, sampling: "analytic" };
    doc.simulation.selections.B = { operator: "at_least", value: 1, upper: null, sampling: "analytic" };

    const result = runSimulation(doc.graph, doc.simulation);
    expect(result.conditioning.primaryMethod).toBe("analytic");
    expect(result.conditioning.analytic).toContain("orthant");
    const uAnalytic = result.nodeStates.U?.analytic;
    expect(uAnalytic?.distribution.kind).toBe("normal");
    expect(uAnalytic?.mean ?? 0).toBeGreaterThan(0.4);
    expect(uAnalytic?.mean ?? 0).toBeLessThan(0.9);
    expect(result.nodeStates.A?.analytic?.mean).toBe(1);
    expect(result.nodeStates.B?.analytic?.mean).toBe(1);
  });

  it("conditions on a mixed binary+continuous pair analytically", () => {
    const doc = parseModel(`dag {
      U
      A
    }`).document;
    const a = doc.graph.nodes.find((node) => node.id === "A");
    if (!a) throw new Error("missing fixture graph");
    a.variable = { ...a.variable, valueType: "binary" };
    doc.simulation.nodes.U = normalizeNodeMechanism({ distribution: { kind: "normal", mean: 0, sd: 1 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.A = normalizeNodeMechanism({ distribution: { kind: "bernoulli", p: 0.5 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.selections.U = { operator: "at_least", value: 0, upper: null, sampling: "analytic" };
    doc.simulation.selections.A = { operator: "at_least", value: 1, upper: null, sampling: "analytic" };

    const result = runSimulation(doc.graph, doc.simulation);
    expect(result.conditioning.primaryMethod).toBe("analytic");
    expect(result.conditioning.analytic).toContain("joint");
    const uAnalytic = result.nodeStates.U?.analytic;
    expect(uAnalytic?.mean ?? 0).toBeCloseTo(Math.sqrt(2 / Math.PI), 2);
    expect(result.nodeStates.A?.analytic?.mean).toBe(1);
  });

  it("conditions on two continuous interval events jointly", () => {
    const doc = parseModel(`dag {
      U
      X
      Y
      U -> X
      U -> Y
    }`).document;
    const ux = doc.graph.edges.find((edge) => edge.source === "U" && edge.target === "X");
    const uy = doc.graph.edges.find((edge) => edge.source === "U" && edge.target === "Y");
    if (!ux || !uy) throw new Error("missing fixture edges");
    doc.simulation.nodes.U = normalizeNodeMechanism({ distribution: { kind: "normal", mean: 0, sd: 1 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.X = normalizeNodeMechanism({ intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
    doc.simulation.nodes.Y = normalizeNodeMechanism({ intercept: 0, noise: { kind: "normal", mean: 0, sd: 1 } });
    doc.simulation.edges[ux.id] = { ...defaultEdgeMechanism(), coefficient: 1 };
    doc.simulation.edges[uy.id] = { ...defaultEdgeMechanism(), coefficient: 1 };
    doc.simulation.selections.X = { operator: "at_least", value: 1, upper: null, sampling: "analytic" };
    doc.simulation.selections.Y = { operator: "at_least", value: 1, upper: null, sampling: "analytic" };

    const result = runSimulation(doc.graph, doc.simulation);
    expect(result.conditioning.primaryMethod).toBe("analytic");
    expect(result.conditioning.analytic).toContain("analytic linear Gaussian");
    const uAnalytic = result.nodeStates.U?.analytic;
    expect(uAnalytic?.distribution.kind).toBe("normal");
    expect(uAnalytic?.mean ?? 0).toBeGreaterThan(0.5);
  });

  it("samples non-root binary variables as zero-or-one draws", () => {
    const doc = parseModel(`dag {
      A
      B
      A -> B
    }`).document;
    const b = doc.graph.nodes.find((node) => node.id === "B");
    const edge = doc.graph.edges[0];
    if (!b || !edge) throw new Error("missing fixture graph");

    b.variable = { ...b.variable, valueType: "binary" };
    doc.simulation.nodes.A = normalizeNodeMechanism({ distribution: { kind: "constant", value: 1 }, noise: { kind: "constant", value: 0 } });
    doc.simulation.nodes.B = normalizeNodeMechanism({ intercept: 30, noise: { kind: "constant", value: 0 }, combiner: "bernoulli_logit" });
    doc.simulation.edges[edge.id] = { ...defaultEdgeMechanism(), coefficient: 0 };

    expect(runSimulation(doc.graph, doc.simulation).values.B).toBe(1);
  });
});
