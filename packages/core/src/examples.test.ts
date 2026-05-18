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
      "obesity-paradox",
      "instrumental-encouragement",
      "mediation-direct-total",
      "measurement-error-latent",
      "case-control-selection",
      "policing-encounters",
      "m-bias-adjustment",
      "lords-paradox",
      "target-trial-followup",
      "policy-event-study",
      "incrementality-uplift",
      "causal-ml-refutation",
      "ops-root-cause",
      "education-mediation",
      "chess-intelligence-practice",
      "chess-intelligence-practice-simple-flip",
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
      "tutoring-scores": "tutoring-scores",
      "front-door-smoking": "front-door-smoking",
      "birthweight-paradox": "birthweight-paradox",
      "obesity-paradox": "obesity-paradox",
      "policing-encounters": "policing-encounters",
      "m-bias-adjustment": "m-bias-adjustment",
      "lords-paradox": "lords-paradox",
      "chess-intelligence-practice-simple-flip": "chess-intelligence-practice-simple-flip"
    });
  });

  it("configures the Simpson example as a crude treatment-hurts versus causal treatment-helps reversal", () => {
    const document = exampleDocument("simpson-severity");
    if (!document) throw new Error("missing Simpson example");
    const result = runSimulation(document.graph, document.simulation);
    const treatment = result.nodeStates.Treatment;
    const recovery = result.nodeStates.Recovery;
    const severity = result.nodeStates.Severity;
    if (!treatment || !recovery || !severity) throw new Error("missing Simpson node state");

    const treatedRecovery = conditionalMean(treatment.empirical.samples, recovery.empirical.samples, 1);
    const untreatedRecovery = conditionalMean(treatment.empirical.samples, recovery.empirical.samples, 0);
    const treatedSeverity = conditionalMean(treatment.empirical.samples, severity.empirical.samples, 1);
    const untreatedSeverity = conditionalMean(treatment.empirical.samples, severity.empirical.samples, 0);
    const doTreatment = runSimulation(document.graph, { ...document.simulation, overrides: { Treatment: 1 }, selections: {} });
    const doNoTreatment = runSimulation(document.graph, { ...document.simulation, overrides: { Treatment: 0 }, selections: {} });
    const causalDiff = (doTreatment.nodeStates.Recovery?.empirical.mean ?? 0) - (doNoTreatment.nodeStates.Recovery?.empirical.mean ?? 0);

    expect(treatedRecovery - untreatedRecovery).toBeLessThan(-0.1);
    expect(causalDiff).toBeGreaterThan(0.05);
    expect(treatedSeverity).toBeGreaterThan(untreatedSeverity + 1);
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
    const income = result.nodeStates.Family_log_income;
    if (!college || !earnings || !income) throw new Error("missing college node state");
    const observedPremium = conditionalMean(college.empirical.samples, earnings.empirical.samples, 1) -
      conditionalMean(college.empirical.samples, earnings.empirical.samples, 0);
    const incomeGap = conditionalMean(college.empirical.samples, income.empirical.samples, 1) -
      conditionalMean(college.empirical.samples, income.empirical.samples, 0);
    const doCollege = runSimulation(document.graph, { ...document.simulation, overrides: { College: 1 }, selections: {} });
    const doNoCollege = runSimulation(document.graph, { ...document.simulation, overrides: { College: 0 }, selections: {} });
    const doCollegeEarnings = doCollege.nodeStates.Earnings;
    const doNoCollegeEarnings = doNoCollege.nodeStates.Earnings;
    if (!doCollegeEarnings || !doNoCollegeEarnings) throw new Error("missing intervention earnings state");
    const causalPremium = (doCollegeEarnings.empirical.mean ?? 0) - (doNoCollegeEarnings.empirical.mean ?? 0);

    expect(observedPremium).toBeGreaterThan(causalPremium);
    expect(causalPremium).toBeGreaterThan(0);
    expect(incomeGap).toBeGreaterThan(0);
  });

  it("configures the tutoring example as a raw-versus-causal sign flip", () => {
    const document = exampleDocument("tutoring-scores");
    if (!document) throw new Error("missing tutoring example");
    expect(document.title).toBe("Does tutoring hurt test scores (unadjusted)");
    expect(document.graph.nodes.find((node) => node.id === "Academic_need")?.roles.adjusted).toBe(false);
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

  it("configures the front-door smoking example as confounded but mediated", () => {
    const document = exampleDocument("front-door-smoking");
    if (!document) throw new Error("missing front-door example");
    const result = runSimulation(document.graph, document.simulation);
    const smoking = result.nodeStates.Smoking;
    const cancer = result.nodeStates.Cancer;
    const geneticRisk = result.nodeStates.Genetic_risk;
    if (!smoking || !cancer || !geneticRisk) throw new Error("missing front-door node state");
    const rawGap = conditionalMean(smoking.empirical.samples, cancer.empirical.samples, 1) -
      conditionalMean(smoking.empirical.samples, cancer.empirical.samples, 0);
    const riskGap = conditionalMean(smoking.empirical.samples, geneticRisk.empirical.samples, 1) -
      conditionalMean(smoking.empirical.samples, geneticRisk.empirical.samples, 0);
    const doSmoke = runSimulation(document.graph, { ...document.simulation, overrides: { Smoking: 1 }, selections: {} });
    const doNoSmoke = runSimulation(document.graph, { ...document.simulation, overrides: { Smoking: 0 }, selections: {} });
    const causalGap = (doSmoke.nodeStates.Cancer?.empirical.mean ?? 0) - (doNoSmoke.nodeStates.Cancer?.empirical.mean ?? 0);
    const tarShift = (doSmoke.nodeStates.Tar?.empirical.mean ?? 0) - (doNoSmoke.nodeStates.Tar?.empirical.mean ?? 0);

    expect(rawGap).toBeGreaterThan(causalGap);
    expect(causalGap).toBeGreaterThan(0.1);
    expect(riskGap).toBeGreaterThan(0.3);
    expect(tarShift).toBeGreaterThan(1);
  });

  it("configures the birthweight example as a low-birthweight selected-sample reversal", () => {
    const document = exampleDocument("birthweight-paradox");
    if (!document) throw new Error("missing birthweight example");
    const selected = runSimulation(document.graph, document.simulation);
    const smoking = selected.nodeStates.Smoking;
    const mortality = selected.nodeStates.Infant_mortality;
    const frailty = selected.nodeStates.Frailty;
    if (!smoking || !mortality || !frailty) throw new Error("missing birthweight node state");
    const selectedGap = conditionalMean(smoking.empirical.samples, mortality.empirical.samples, 1) -
      conditionalMean(smoking.empirical.samples, mortality.empirical.samples, 0);
    const frailtyGap = conditionalMean(smoking.empirical.samples, frailty.empirical.samples, 1) -
      conditionalMean(smoking.empirical.samples, frailty.empirical.samples, 0);
    const doSmoke = runSimulation(document.graph, { ...document.simulation, overrides: { Smoking: 1 }, selections: {} });
    const doNoSmoke = runSimulation(document.graph, { ...document.simulation, overrides: { Smoking: 0 }, selections: {} });
    const causalGap = (doSmoke.nodeStates.Infant_mortality?.empirical.mean ?? 0) - (doNoSmoke.nodeStates.Infant_mortality?.empirical.mean ?? 0);

    expect(selected.conditioning.activeConditions).toEqual(["Birthweight <= 2500"]);
    expect(selectedGap).toBeLessThan(0);
    expect(causalGap).toBeGreaterThan(0);
    expect(frailtyGap).toBeLessThan(-0.2);
  });

  it("configures the obesity example as a diseased-sample paradox", () => {
    const document = exampleDocument("obesity-paradox");
    if (!document) throw new Error("missing obesity example");
    const selected = runSimulation(document.graph, document.simulation);
    const obesity = selected.nodeStates.Obesity;
    const mortality = selected.nodeStates.Mortality;
    const frailty = selected.nodeStates.Frailty;
    if (!obesity || !mortality || !frailty) throw new Error("missing obesity node state");
    const selectedGap = conditionalMean(obesity.empirical.samples, mortality.empirical.samples, 1) -
      conditionalMean(obesity.empirical.samples, mortality.empirical.samples, 0);
    const frailtyGap = conditionalMean(obesity.empirical.samples, frailty.empirical.samples, 1) -
      conditionalMean(obesity.empirical.samples, frailty.empirical.samples, 0);
    const doObese = runSimulation(document.graph, { ...document.simulation, overrides: { Obesity: 1 }, selections: {} });
    const doNonObese = runSimulation(document.graph, { ...document.simulation, overrides: { Obesity: 0 }, selections: {} });
    const causalGap = (doObese.nodeStates.Mortality?.empirical.mean ?? 0) - (doNonObese.nodeStates.Mortality?.empirical.mean ?? 0);

    expect(selected.conditioning.activeConditions).toEqual(["Chronic_disease in {1}"]);
    expect(selectedGap).toBeLessThan(0);
    expect(causalGap).toBeGreaterThan(0);
    expect(frailtyGap).toBeLessThan(-0.2);
  });

  it("configures the policing example as an encounter-denominator reversal", () => {
    const document = exampleDocument("policing-encounters");
    if (!document) throw new Error("missing policing example");
    const selected = runSimulation(document.graph, document.simulation);
    const group = selected.nodeStates.Group_A;
    const force = selected.nodeStates.Use_of_force;
    const risk = selected.nodeStates.Incident_risk;
    if (!group || !force || !risk) throw new Error("missing policing node state");
    const encounterGap = conditionalMean(group.empirical.samples, force.empirical.samples, 1) -
      conditionalMean(group.empirical.samples, force.empirical.samples, 0);
    const riskGap = conditionalMean(group.empirical.samples, risk.empirical.samples, 1) -
      conditionalMean(group.empirical.samples, risk.empirical.samples, 0);
    const doGroup = runSimulation(document.graph, { ...document.simulation, overrides: { Group_A: 1 }, selections: {} });
    const doOther = runSimulation(document.graph, { ...document.simulation, overrides: { Group_A: 0 }, selections: {} });
    const structuralGap = (doGroup.nodeStates.Use_of_force?.empirical.mean ?? 0) - (doOther.nodeStates.Use_of_force?.empirical.mean ?? 0);

    expect(selected.conditioning.activeConditions).toEqual(["Police_contact in {1}"]);
    expect(encounterGap).toBeLessThan(0);
    expect(structuralGap).toBeGreaterThan(0);
    expect(riskGap).toBeLessThan(-0.3);
  });

  it("configures the M-bias example as adjustment-created association", () => {
    const document = exampleDocument("m-bias-adjustment");
    if (!document) throw new Error("missing M-bias example");
    const result = runSimulation(document.graph, document.simulation);
    const exposure = result.nodeStates.Exposure;
    const outcome = result.nodeStates.Outcome;
    const collider = result.nodeStates.Collider_score;
    if (!exposure || !outcome || !collider) throw new Error("missing M-bias node state");
    const rawGap = conditionalMean(exposure.empirical.samples, outcome.empirical.samples, 1) -
      conditionalMean(exposure.empirical.samples, outcome.empirical.samples, 0);
    const cutoff = quantile(collider.empirical.samples, 0.7);
    const conditionedGap = filteredConditionalMean(exposure.empirical.samples, outcome.empirical.samples, collider.empirical.samples, 1, cutoff) -
      filteredConditionalMean(exposure.empirical.samples, outcome.empirical.samples, collider.empirical.samples, 0, cutoff);

    expect(Math.abs(rawGap)).toBeLessThan(0.12);
    expect(conditionedGap).toBeLessThan(-0.35);
  });

  it("configures Lord's paradox as change-score versus baseline-adjusted estimand split", () => {
    const document = exampleDocument("lords-paradox");
    if (!document) throw new Error("missing Lord's paradox example");
    const result = runSimulation(document.graph, document.simulation);
    const program = result.nodeStates.Program;
    const baseline = result.nodeStates.Baseline_weight;
    const final = result.nodeStates.Final_weight;
    if (!program || !baseline || !final) throw new Error("missing Lord node state");
    const changeGap = conditionalMeanOfDifference(program.empirical.samples, final.empirical.samples, baseline.empirical.samples, 1) -
      conditionalMeanOfDifference(program.empirical.samples, final.empirical.samples, baseline.empirical.samples, 0);
    const baselineGap = conditionalMean(program.empirical.samples, baseline.empirical.samples, 1) -
      conditionalMean(program.empirical.samples, baseline.empirical.samples, 0);
    const doProgram = runSimulation(document.graph, { ...document.simulation, overrides: { Program: 1 }, selections: {} });
    const doControl = runSimulation(document.graph, { ...document.simulation, overrides: { Program: 0 }, selections: {} });
    const adjustedFinalGap = (doProgram.nodeStates.Final_weight?.empirical.mean ?? 0) - (doControl.nodeStates.Final_weight?.empirical.mean ?? 0);

    expect(changeGap).toBeLessThan(0);
    expect(adjustedFinalGap).toBeGreaterThan(0);
    expect(baselineGap).toBeGreaterThan(6);
  });

  it("ships a paper-shaped chess selected-sample example that fails to flip sign", () => {
    const document = exampleDocument("chess-intelligence-practice");
    if (!document) throw new Error("missing chess example");
    expect(document.title).toContain("chess");
    expect(document.title).toContain("selection fails to flip");
    const practiceEdge = document.graph.edges.find((edge) => edge.source === "Practice_hours" && edge.target === "Chess_Elo");
    const intelligenceEdge = document.graph.edges.find((edge) => edge.source === "Intelligence" && edge.target === "Chess_Elo");
    const eliteEdge = document.graph.edges.find((edge) => edge.source === "Chess_Elo" && edge.target === "Elite_sample");
    if (!practiceEdge || !intelligenceEdge || !eliteEdge) throw new Error("missing chess edge");
    expect(document.simulation.edges[practiceEdge.id]?.kind).toBe("hill_emax");
    expect(document.simulation.edges[intelligenceEdge.id]?.kind).toBe("linear");
    expect(document.simulation.edges[eliteEdge.id]?.kind).toBe("smooth_threshold");
    expect(document.simulation.selections.Elite_sample?.operator).toBe("one_of");
    expect(document.simulation.selections.Elite_sample?.values).toEqual([1]);

    const selected = runSimulation(document.graph, document.simulation);
    const fullDocument = exampleDocument("chess-intelligence-practice");
    if (!fullDocument) throw new Error("missing chess full-population example");
    delete fullDocument.simulation.selections.Elite_sample;
    const full = runSimulation(fullDocument.graph, fullDocument.simulation);

    const practice = full.nodeStates.Practice_hours;
    const elo = full.nodeStates.Chess_Elo;
    const elite = full.nodeStates.Elite_sample;
    if (!practice || !elo || !elite) throw new Error("missing chess node state");
    expect(elo.empirical.mean ?? 0).toBeGreaterThan(1300);
    expect(elo.empirical.mean ?? 0).toBeLessThan(2100);
    expect((elite.empirical.mean ?? 0)).toBeGreaterThan(0.05);
    expect((elite.empirical.mean ?? 1)).toBeLessThan(0.6);
    expect(correlation(practice.empirical.samples, elo.empirical.samples)).toBeGreaterThan(0.35);
    expect(selected.conditioning.acceptedSamples).toBeGreaterThan(0);
    expect(selected.nodeStates.Elite_sample?.empirical.samples.every((value) => value >= 0.5)).toBe(true);

    const fullIqRating = correlation(full.nodeStates.Intelligence!.empirical.samples, full.nodeStates.Chess_Elo!.empirical.samples);
    const selectedIqRating = correlation(selected.nodeStates.Intelligence!.empirical.samples, selected.nodeStates.Chess_Elo!.empirical.samples);
    expect(fullIqRating).toBeGreaterThan(0.25);
    expect(selectedIqRating).toBeGreaterThan(0.05);
    expect(selectedIqRating).toBeLessThan(fullIqRating);
  });

  it("ships a simple chess selected-sample sign-flip example", () => {
    const document = exampleDocument("chess-intelligence-practice-simple-flip");
    if (!document) throw new Error("missing simple chess flip example");
    expect(document.graph.nodes.map((node) => node.id).sort()).toEqual(["Chess_Elo", "Elite_sample", "Intelligence", "Practice_hours"]);
    expect(document.graph.nodes.find((node) => node.id === "Elite_sample")?.roles.selected).toBe(true);
    expect(document.simulation.selections.Elite_sample?.operator).toBe("one_of");
    expect(document.simulation.selections.Elite_sample?.values).toEqual([1]);

    const selected = runSimulation(document.graph, document.simulation);
    const fullDocument = exampleDocument("chess-intelligence-practice-simple-flip");
    if (!fullDocument) throw new Error("missing simple chess full-population example");
    delete fullDocument.simulation.selections.Elite_sample;
    const full = runSimulation(fullDocument.graph, fullDocument.simulation);

    const fullIqRating = correlation(full.nodeStates.Intelligence!.empirical.samples, full.nodeStates.Chess_Elo!.empirical.samples);
    const fullIqPractice = correlation(full.nodeStates.Intelligence!.empirical.samples, full.nodeStates.Practice_hours!.empirical.samples);
    const selectedIqRating = correlation(selected.nodeStates.Intelligence!.empirical.samples, selected.nodeStates.Chess_Elo!.empirical.samples);
    const selectedIqPractice = correlation(selected.nodeStates.Intelligence!.empirical.samples, selected.nodeStates.Practice_hours!.empirical.samples);
    const selectedPracticeRating = correlation(selected.nodeStates.Practice_hours!.empirical.samples, selected.nodeStates.Chess_Elo!.empirical.samples);

    if (process.env.CHESS_PROBE === "1") {
      console.log("simple chess flip", {
        accepted: selected.conditioning.acceptedSamples,
        attempted: selected.conditioning.totalSamples,
        fullIqPractice,
        fullIqRating,
        selectedIqPractice,
        selectedIqRating,
        selectedPracticeRating
      });
    }

    expect(selected.conditioning.acceptedSamples).toBeGreaterThan(0);
    expect(fullIqRating).toBeGreaterThan(0.25);
    expect(fullIqPractice).toBeGreaterThan(0.25);
    expect(selectedIqPractice).toBeLessThan(-0.1);
    expect(selectedIqRating).toBeLessThan(-0.05);
    expect(selectedPracticeRating).toBeGreaterThan(0.6);
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

function filteredConditionalMean(condition: number[], outcome: number[], filter: number[], value: 0 | 1, threshold: number): number {
  let count = 0;
  let sum = 0;
  for (let index = 0; index < Math.min(condition.length, outcome.length, filter.length); index += 1) {
    const matches = ((condition[index] ?? 0) >= 0.5 ? 1 : 0) === value && (filter[index] ?? Number.NEGATIVE_INFINITY) >= threshold;
    if (matches) {
      sum += outcome[index] ?? 0;
      count += 1;
    }
  }
  return sum / count;
}

function conditionalMeanOfDifference(condition: number[], left: number[], right: number[], value: 0 | 1): number {
  let count = 0;
  let sum = 0;
  for (let index = 0; index < Math.min(condition.length, left.length, right.length); index += 1) {
    const matches = ((condition[index] ?? 0) >= 0.5 ? 1 : 0) === value;
    if (matches) {
      sum += (left[index] ?? 0) - (right[index] ?? 0);
      count += 1;
    }
  }
  return sum / count;
}

function quantile(values: number[], p: number): number {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  const index = Math.min(finite.length - 1, Math.max(0, Math.floor((finite.length - 1) * p)));
  return finite[index] ?? 0;
}

function correlation(x: number[], y: number[]): number {
  const length = Math.min(x.length, y.length);
  if (length === 0) return 0;
  const xs = x.slice(0, length);
  const ys = y.slice(0, length);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / length;
  let numerator = 0;
  let xVariance = 0;
  let yVariance = 0;
  for (let index = 0; index < length; index += 1) {
    const dx = (xs[index] ?? 0) - meanX;
    const dy = (ys[index] ?? 0) - meanY;
    numerator += dx * dy;
    xVariance += dx * dx;
    yVariance += dy * dy;
  }
  return numerator / Math.sqrt(Math.max(Number.EPSILON, xVariance * yVariance));
}
