import { describe, expect, it } from "vitest";
import { exampleDocument } from "./examples";
import { cohortFromSimulationResult, compareLongitudinalGMethods, estimateSurvivalCurve, evaluateTreatmentStrategy, extractLongitudinalGraph, simulateLongitudinalCohort, validateLongitudinalMetadata } from "./longitudinal";

describe("longitudinal instrumentation", () => {
  it("extracts time-indexed metadata from the What If feedback example", () => {
    const document = exampleDocument("what-if-treatment-feedback");
    if (!document) throw new Error("missing what-if example");

    const extracted = extractLongitudinalGraph(document);

    expect(document.schemaVersion).toBe(2);
    expect(extracted.timePoints.map((point) => point.id)).toEqual(["t0", "t1", "t2"]);
    expect(extracted.nodes.map((entry) => [entry.node.id, entry.metadata.role])).toContainEqual(["L1", "time_varying_confounder"]);
    expect(extracted.treatmentStrategies.map((strategy) => strategy.id)).toEqual(["always-treat", "never-treat"]);
    expect(validateLongitudinalMetadata(document)).toEqual([]);
  });

  it("computes reusable g-method summaries for two-time treatment strategies", () => {
    const document = exampleDocument("what-if-treatment-feedback");
    if (!document) throw new Error("missing what-if example");

    const comparison = compareLongitudinalGMethods(document, {
      treatmentVariables: ["A0", "A1"],
      timeVaryingCovariates: ["L1"],
      outcome: "Y",
      strategyIds: ["always-treat", "never-treat"]
    });

    expect(comparison).not.toBeNull();
    expect(comparison?.cohort.sampleSize).toBeGreaterThan(1000);
    expect(comparison?.estimates.map((estimate) => estimate.id)).toEqual(["naive", "stratified", "g_formula", "ipw", "g_estimation"]);
    const gFormula = comparison?.estimates.find((estimate) => estimate.id === "g_formula");
    const ipw = comparison?.estimates.find((estimate) => estimate.id === "ipw");
    const gEstimation = comparison?.estimates.find((estimate) => estimate.id === "g_estimation");
    expect(gFormula?.estimate).not.toBeNull();
    expect(ipw?.estimate).not.toBeNull();
    expect(gEstimation?.estimate).not.toBeNull();
    expect(ipw?.arms.every((arm) => (arm.effectiveSampleSize ?? 0) > 10)).toBe(true);
  });

  it("validates all advanced What If examples", () => {
    for (const id of [
      "what-if-showcase-dynamic-rules",
      "what-if-showcase-survival-curves",
      "what-if-showcase-hazard-denominator",
      "what-if-showcase-g-estimation",
      "what-if-showcase-ipcw",
      "what-if-showcase-snaft",
      "what-if-ipw-pseudopopulation",
      "what-if-hazard-selection",
      "what-if-nhefs-mortality-survival",
      "what-if-weight-gain-g-estimation",
      "what-if-hiv-cd4-variants",
      "what-if-censoring-ipcw",
      "what-if-dynamic-g-formula",
      "what-if-snaft-survival"
    ]) {
      const document = exampleDocument(id);
      if (!document) throw new Error(`missing ${id}`);
      expect(validateLongitudinalMetadata(document), id).toEqual([]);
      expect(document.metadata.sources[0]?.chapter, id).toMatch(/^Chapter/);
      expect(document.metadata.longitudinal.treatmentStrategies.length, id).toBeGreaterThanOrEqual(2);
    }
  });

  it("materializes dynamic treatment rules in g-method comparisons", () => {
    const document = exampleDocument("what-if-dynamic-g-formula");
    if (!document) throw new Error("missing dynamic g-formula example");

    const comparison = compareLongitudinalGMethods(document, {
      treatmentVariables: ["A0", "A1", "A2"],
      timeVaryingCovariates: ["Risk_0", "Risk_1", "Risk_2"],
      outcome: "Y",
      strategyIds: ["treat-when-high-risk", "never-treat"]
    });

    expect(comparison).not.toBeNull();
    expect(comparison?.strategies[0].kind).toBe("dynamic");
    expect(comparison?.estimates.find((estimate) => estimate.id === "g_formula")?.label).toBe("Sequential strategy g-formula");
    expect(comparison?.estimates.find((estimate) => estimate.id === "g_formula")?.estimate).not.toBeNull();
    expect(comparison?.estimates.find((estimate) => estimate.id === "g_estimation")?.estimate).not.toBeNull();
    expect(comparison?.support).toHaveLength(6);
    expect(comparison?.support.some((row) => row.ruleConditionShare !== null)).toBe(true);
  });

  it("simulates dynamic strategies sequentially from generated history", () => {
    const document = exampleDocument("what-if-dynamic-g-formula");
    if (!document) throw new Error("missing dynamic g-formula example");
    const strategy = document.metadata.longitudinal.treatmentStrategies.find((candidate) => candidate.id === "treat-when-high-risk");
    if (!strategy) throw new Error("missing dynamic strategy");

    const evaluation = evaluateTreatmentStrategy(document, strategy, "Y");
    const cohort = cohortFromSimulationResult(evaluation.result);

    expect(evaluation.diagnostics.join(" ")).toContain("dynamic strategy sequentially");
    expect(cohort.rows.length).toBeGreaterThan(1000);
    expect(cohort.rows.every((row) => row.A0 === row.Risk_0 && row.A1 === row.Risk_1 && row.A2 === row.Risk_2)).toBe(true);
  });

  it("computes person-time survival summaries from repeated event variables", () => {
    const document = exampleDocument("what-if-nhefs-mortality-survival");
    if (!document) throw new Error("missing NHEFS survival example");
    const cohort = simulateLongitudinalCohort(document);
    const spec = document.metadata.longitudinal.survivalOutputs[0];
    if (!spec) throw new Error("missing survival spec");

    const curve = estimateSurvivalCurve(cohort, spec);

    expect(curve).toHaveLength(2);
    expect(curve[0]?.atRisk).toBeGreaterThan(curve[1]?.atRisk ?? 0);
    expect(curve[1]?.risk).toBeGreaterThanOrEqual(curve[0]?.risk ?? 0);
  });

  it("computes strategy-specific survival curves for NHEFS mortality", () => {
    const document = exampleDocument("what-if-nhefs-mortality-survival");
    if (!document) throw new Error("missing NHEFS survival example");
    const spec = document.metadata.longitudinal.survivalOutputs[0];
    if (!spec) throw new Error("missing survival spec");

    const comparison = compareLongitudinalGMethods(document, {
      treatmentVariables: ["Quit_smoking"],
      timeVaryingCovariates: ["Age", "Baseline_health"],
      outcome: "Death_10y",
      strategyIds: ["quit", "continue"],
      censoringVariables: ["Censoring_5y"]
    });
    if (!comparison) throw new Error("missing comparison");
    const curves = comparison.strategyEvaluations.map((evaluation) => estimateSurvivalCurve(cohortFromSimulationResult(evaluation.result), spec));
    const finalRisks = curves.map((curve) => curve.at(-1)?.risk ?? null);

    expect(curves).toHaveLength(2);
    expect(curves.every((curve) => curve.length === 2)).toBe(true);
    expect(finalRisks[0]).not.toBeNull();
    expect(finalRisks[1]).not.toBeNull();
    expect(finalRisks[0] ?? 1).toBeLessThan(finalRisks[1] ?? 0);
  });

  it("models NHEFS cumulative mortality as an absorbing event", () => {
    const document = exampleDocument("what-if-nhefs-mortality-survival");
    if (!document) throw new Error("missing NHEFS survival example");
    const edge = document.graph.edges.find((candidate) => candidate.source === "Death_5y" && candidate.target === "Death_10y");
    if (!edge) throw new Error("missing cumulative mortality edge");
    const cohort = simulateLongitudinalCohort(document);

    expect(document.simulation.edges[edge.id]?.kind).toBe("absorbing");
    expect(cohort.rows.some((row) => row.Death_5y === 1)).toBe(true);
    expect(cohort.rows.every((row) => row.Death_5y !== 1 || row.Death_10y === 1)).toBe(true);
  });

  it("reports censoring-aware IPW support when censoring variables are supplied", () => {
    const document = exampleDocument("what-if-censoring-ipcw");
    if (!document) throw new Error("missing censoring example");

    const comparison = compareLongitudinalGMethods(document, {
      treatmentVariables: ["A0", "A1"],
      timeVaryingCovariates: ["Baseline_risk", "L1"],
      outcome: "Y",
      strategyIds: ["always-treat", "never-treat"],
      censoringVariables: ["C1", "C2"]
    });

    const ipw = comparison?.estimates.find((estimate) => estimate.id === "ipw");
    expect(ipw?.label).toContain("IPW/IPCW");
    expect(ipw?.arms.every((arm) => (arm.effectiveSampleSize ?? 0) > 10)).toBe(true);
  });
});
