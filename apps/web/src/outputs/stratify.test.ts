import { describe, expect, it } from "vitest";
import { exampleDocument, runSimulation } from "@nudagitty/core";
import { stratifyRiskCurves } from "./stratify";

describe("stratifyRiskCurves on the cats collider", () => {
  it("reproduces the all / S=1 / S=0 survival contrast and a biased standardized curve", () => {
    const document = exampleDocument("cats-highrise-syndrome");
    if (!document) throw new Error("missing");
    // unconditioned population (the only place every stratum is observable)
    const full = runSimulation(document.graph, { ...document.simulation, selections: {} });
    const contrast = stratifyRiskCurves(full, "Fall_height", "Survival", "Brought_to_vet", 7);
    if (!contrast) throw new Error("no contrast");

    // crude ~82%, recorded (S=1) ~92%, not-brought (S=0) ~61% (matches the measured bias table)
    expect(contrast.crude.outcomeRate).toBeGreaterThan(0.78);
    expect(contrast.crude.outcomeRate).toBeLessThan(0.86);
    const s1 = contrast.strata.find((stratum) => stratum.stratumValue === 1);
    const s0 = contrast.strata.find((stratum) => stratum.stratumValue === 0);
    expect(s1).toBeDefined();
    expect(s0).toBeDefined();
    expect(s1!.outcomeRate).toBeGreaterThan(s0!.outcomeRate); // selection inflates survival
    expect(s1!.outcomeRate).toBeGreaterThan(0.88);
    expect(s0!.outcomeRate).toBeLessThan(0.7);
    // strata shares sum to ~1
    expect(s0!.share + s1!.share).toBeCloseTo(1, 5);

    // The selected stratum is far from the true population survival (selection bias),
    // but standardizing RE-MARGINALIZES over Brought_to_vet and lands back near crude
    // (the honest nuance: here the danger is selection, not standardization).
    const selectGap = Math.abs(s1!.outcomeRate - contrast.crude.outcomeRate);
    expect(selectGap).toBeGreaterThan(0.05); // selection on the collider is clearly biased
    expect(contrast.standardized).toHaveLength(contrast.crude.bins.length);
    const standardizedGap = contrast.standardized.reduce((sum, band, i) => sum + Math.abs(band.mean - contrast.crude.bins[i]!.mean), 0) / contrast.standardized.length;
    expect(standardizedGap).toBeLessThan(selectGap); // standardization recovers the population
    for (const band of contrast.standardized) {
      expect(band.mean).toBeGreaterThanOrEqual(0);
      expect(band.mean).toBeLessThanOrEqual(1);
    }
  });
});
