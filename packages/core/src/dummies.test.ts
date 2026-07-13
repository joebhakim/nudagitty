import { describe, it, expect } from "vitest";
import { categoryCandidate, withCategoryDummies, lookupDataset } from "./index";
import type { CovariateDataset } from "./index";

// A synthetic table with an unordered category. (The shipped categorical example is GENERATIVE, not
// data-backed, so it has no column to dummy — which is itself correct: dummies are a data-column op.)
const DS: CovariateDataset = {
  name: "t", source: "test", covariates: ["region"], columns: ["region", "y"],
  rows: [
    ...Array.from({ length: 50 }, () => [0, 1]),   // level 0 — the most common ⇒ the reference
    ...Array.from({ length: 30 }, () => [1, 2]),
    ...Array.from({ length: 20 }, () => [2, 3])
  ]
} as CovariateDataset;

describe("categorical dummies — the OTHER thing the vocabulary cannot express", () => {
  it("emits k−1 columns and omits the MOST COMMON level as the reference", () => {
    // A linear mechanism cannot consume "region A / B / C" — there is no coefficient you can put on an
    // unordered label. Hence a missing WORD in the vocabulary, not a missing shortcut.
    const built = withCategoryDummies(DS, "region")!;
    expect(built.reference).toBe(0);                       // most common (50 rows) ⇒ best-estimated baseline
    expect(built.levels.map((l) => l.column)).toEqual(["region_1", "region_2"]);   // k−1
    expect(built.dataset.columns).toEqual(["region", "y", "region_1", "region_2"]);

    // and they really are the indicators, row for row
    const [r, , d1, d2] = [0, 1, 2, 3];
    for (const row of built.dataset.rows) {
      expect(row[d1]).toBe(row[r] === 1 ? 1 : 0);
      expect(row[d2]).toBe(row[r] === 2 ? 1 : 0);
    }
  });

  it("honours an explicit reference level", () => {
    const built = withCategoryDummies(DS, "region", { reference: 2 })!;
    expect(built.reference).toBe(2);
    expect(built.levels.map((l) => l.value)).toEqual([0, 1]);
  });

  it("uses the variable's own level names when it has them", () => {
    const built = withCategoryDummies(DS, "region", { labels: { 1: "south", 2: "west" } })!;
    expect(built.levels.map((l) => l.column)).toEqual(["region_south", "region_west"]);
  });

  it("refuses what is NOT a category — 2 levels, an id, or a continuous column", () => {
    const binary = { ...DS, columns: ["b"], rows: DS.rows.map((r: number[]) => [r[0]! > 0 ? 1 : 0]) } as CovariateDataset;
    expect(categoryCandidate(binary, "b")).toBeNull();                     // already an indicator
    const ids = { ...DS, columns: ["id"], rows: DS.rows.map((_: number[], i: number) => [i]) } as CovariateDataset;
    expect(categoryCandidate(ids, "id")).toBeNull();                       // 100 levels — an id, not a category
    const cts = { ...DS, columns: ["x"], rows: DS.rows.map((_: number[], i: number) => [i * 0.5]) } as CovariateDataset;
    expect(categoryCandidate(cts, "x")).toBeNull();                        // non-integer ⇒ continuous
    expect(categoryCandidate(DS, "region")).toEqual({ levels: [0, 1, 2] });
  });

  it("does not touch the embedded datasets", () => {
    expect(lookupDataset("lalonde-obs")!.columns).not.toContain("region_1");
  });
});
