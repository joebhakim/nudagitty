import { describe, expect, it } from "vitest";
import { EXAMPLES, exampleDenouement, exampleDocument } from "./examples";
import { runSimulation } from "./simulation";

describe("example catalog", () => {
  it("uses the classic example set and keeps Galton", () => {
    expect(EXAMPLES.map((example) => example.id)).toEqual([
      "simpson-severity",
      "icu-mortality-triage",
      "college-earnings",
      "tutoring-scores",
      "front-door-smoking",
      "berkson-hospital",
      "birthweight-paradox",
      "instrumental-encouragement",
      "mediation-direct-total",
      "measurement-error-latent",
      "case-control-selection",
      "target-trial-followup",
      "policy-event-study",
      "incrementality-uplift",
      "causal-ml-refutation",
      "ops-root-cause",
      "education-mediation",
      "galton-regression"
    ]);
    expect(EXAMPLES.some((example) => example.id === "confounding-triangle")).toBe(false);
    expect(EXAMPLES.some((example) => example.id === "collider")).toBe(false);
    expect(EXAMPLES.some((example) => example.id === "mediator")).toBe(false);
    expect(EXAMPLES.some((example) => example.id === "selection")).toBe(false);
  });

  it("loads and simulates every example", () => {
    for (const example of EXAMPLES) {
      const document = exampleDocument(example.id);
      if (!document) throw new Error(`missing ${example.id}`);
      const result = runSimulation(document.graph, document.simulation);
      expect(result.diagnostics.some((message) => message.startsWith("Simulation disabled"))).toBe(false);
      expect(Object.keys(result.values).length).toBe(document.graph.nodes.length);
    }
  });

  it("has denouement output metadata for every example", () => {
    for (const example of EXAMPLES) {
      const denouement = exampleDenouement(example.id);
      expect(denouement, example.id).not.toBeNull();
      expect(denouement?.punchline.length).toBeGreaterThan(40);
      expect(denouement?.sections.length).toBeGreaterThanOrEqual(3);
      expect(denouement?.sections.some((section) => section.defaultOpen)).toBe(true);
    }
  });

  it("declares completed output modules for the golden examples", () => {
    expect(Object.fromEntries(EXAMPLES.filter((example) => example.outputModule).map((example) => [example.id, example.outputModule]))).toEqual({
      "simpson-severity": "simpson-severity",
      "icu-mortality-triage": "icu-mortality-triage",
      "college-earnings": "college-earnings",
      "tutoring-scores": "tutoring-scores"
    });
  });

  it("configures the ICU example as a crude-versus-causal reversal with a triage collider", () => {
    const document = exampleDocument("icu-mortality-triage");
    if (!document) throw new Error("missing ICU example");
    const result = runSimulation(document.graph, document.simulation);
    const admission = result.nodeStates.ICU_admission;
    const death = result.nodeStates.Death;
    const severity = result.nodeStates.Severity;
    const triage = result.nodeStates.Triage_score;
    if (!admission || !death || !severity || !triage) throw new Error("missing ICU node state");
    const icuMortality = conditionalMean(admission.empirical.samples, death.empirical.samples, 1);
    const wardMortality = conditionalMean(admission.empirical.samples, death.empirical.samples, 0);
    const icuSeverity = conditionalMean(admission.empirical.samples, severity.empirical.samples, 1);
    const wardSeverity = conditionalMean(admission.empirical.samples, severity.empirical.samples, 0);
    const icuTriage = conditionalMean(admission.empirical.samples, triage.empirical.samples, 1);
    const wardTriage = conditionalMean(admission.empirical.samples, triage.empirical.samples, 0);
    const doIcu = runSimulation(document.graph, { ...document.simulation, overrides: { ICU_admission: 1 }, selections: {} });
    const doWard = runSimulation(document.graph, { ...document.simulation, overrides: { ICU_admission: 0 }, selections: {} });
    const doIcuDeath = doIcu.nodeStates.Death;
    const doWardDeath = doWard.nodeStates.Death;
    if (!doIcuDeath || !doWardDeath) throw new Error("missing intervention death state");

    expect(icuMortality).toBeGreaterThan(wardMortality);
    expect(doIcuDeath.empirical.mean ?? 1).toBeLessThan(doWardDeath.empirical.mean ?? 0);
    expect(icuSeverity).toBeGreaterThan(wardSeverity);
    expect(icuTriage).toBeGreaterThan(wardTriage);
  });

  it("configures the college example as a confounded raw wage premium", () => {
    const document = exampleDocument("college-earnings");
    if (!document) throw new Error("missing college example");
    const result = runSimulation(document.graph, document.simulation);
    const college = result.nodeStates.College;
    const earnings = result.nodeStates.Earnings;
    const advantage = result.nodeStates.Family_advantage;
    if (!college || !earnings || !advantage) throw new Error("missing college node state");
    const observedPremium = conditionalMean(college.empirical.samples, earnings.empirical.samples, 1) -
      conditionalMean(college.empirical.samples, earnings.empirical.samples, 0);
    const advantageGap = conditionalMean(college.empirical.samples, advantage.empirical.samples, 1) -
      conditionalMean(college.empirical.samples, advantage.empirical.samples, 0);
    const doCollege = runSimulation(document.graph, { ...document.simulation, overrides: { College: 1 }, selections: {} });
    const doNoCollege = runSimulation(document.graph, { ...document.simulation, overrides: { College: 0 }, selections: {} });
    const doCollegeEarnings = doCollege.nodeStates.Earnings;
    const doNoCollegeEarnings = doNoCollege.nodeStates.Earnings;
    if (!doCollegeEarnings || !doNoCollegeEarnings) throw new Error("missing intervention earnings state");
    const causalPremium = (doCollegeEarnings.empirical.mean ?? 0) - (doNoCollegeEarnings.empirical.mean ?? 0);

    expect(observedPremium).toBeGreaterThan(causalPremium);
    expect(causalPremium).toBeGreaterThan(0);
    expect(advantageGap).toBeGreaterThan(0);
  });

  it("configures the tutoring example as a raw-versus-causal sign flip", () => {
    const document = exampleDocument("tutoring-scores");
    if (!document) throw new Error("missing tutoring example");
    const result = runSimulation(document.graph, document.simulation);
    const tutoring = result.nodeStates.Tutoring;
    const score = result.nodeStates.Test_score;
    const need = result.nodeStates.Academic_need;
    if (!tutoring || !score || !need) throw new Error("missing tutoring node state");
    const observedGap = conditionalMean(tutoring.empirical.samples, score.empirical.samples, 1) -
      conditionalMean(tutoring.empirical.samples, score.empirical.samples, 0);
    const needGap = conditionalMean(tutoring.empirical.samples, need.empirical.samples, 1) -
      conditionalMean(tutoring.empirical.samples, need.empirical.samples, 0);
    const doTutoring = runSimulation(document.graph, { ...document.simulation, overrides: { Tutoring: 1 }, selections: {} });
    const doNoTutoring = runSimulation(document.graph, { ...document.simulation, overrides: { Tutoring: 0 }, selections: {} });
    const doTutoringScore = doTutoring.nodeStates.Test_score;
    const doNoTutoringScore = doNoTutoring.nodeStates.Test_score;
    if (!doTutoringScore || !doNoTutoringScore) throw new Error("missing intervention score state");
    const causalGap = (doTutoringScore.empirical.mean ?? 0) - (doNoTutoringScore.empirical.mean ?? 0);

    expect(observedGap).toBeLessThan(0);
    expect(causalGap).toBeGreaterThan(0);
    expect(needGap).toBeGreaterThan(0);
  });
});

function conditionalMean(condition: number[], outcome: number[], value: 0 | 1): number {
  let count = 0;
  let sum = 0;
  for (let index = 0; index < Math.min(condition.length, outcome.length); index += 1) {
    const matches = ((condition[index] ?? 0) >= 0.5 ? 1 : 0) === value;
    if (matches) {
      sum += outcome[index] ?? 0;
      count += 1;
    }
  }
  return sum / count;
}
