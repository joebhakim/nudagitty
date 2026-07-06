import { describe, expect, it } from "vitest";
import { parseCsvToDataFrame, documentFromDataFrame, dataFrameFromSimulation } from "./index";
import { runSimulation } from "./simulation";

describe("dataImport", () => {
  const csv = "age,sex,city\n30,1,NYC\n40,1,NYC\n50,0,LA\n60,0,LA\n"; // NYC⇔sex1, LA⇔sex0 (perfect joint)

  it("infers column types from a CSV", () => {
    const df = parseCsvToDataFrame(csv);
    expect(df.nRows).toBe(4);
    expect(df.columns.map((c) => c.name)).toEqual(["age", "sex", "city"]);
    expect(df.columns[0]!.type).toBe("continuous");
    expect(df.columns[1]!.type).toBe("binary");
    expect(df.columns[2]!.type).toBe("categorical");
    expect(df.columns[2]!.categories).toEqual(["NYC", "LA"]);
  });

  it("builds a plasmode node-dump that preserves the real joint", () => {
    const df = parseCsvToDataFrame(csv);
    const doc = documentFromDataFrame(df, { datasetName: "test-import-joint" });
    // one node per column + a latent resample source
    expect(doc.graph.nodes.length).toBe(4);
    expect(doc.graph.nodes.filter((n) => n.roles.latent).length).toBe(1);

    const result = runSimulation(doc.graph, doc.simulation);
    const out = dataFrameFromSimulation(doc.graph, result); // latent source excluded
    expect(out.columns.map((c) => c.name).sort()).toEqual(["age", "city", "sex"]);

    const city = out.columns.find((c) => c.name === "city")!; // NYC=0, LA=1
    const sex = out.columns.find((c) => c.name === "sex")!;
    const age = out.columns.find((c) => c.name === "age")!;
    let nyc = 0, la = 0;
    for (let i = 0; i < out.nRows; i += 1) {
      if (Math.round(city.values[i]!) === 0) { nyc += 1; expect(sex.values[i]).toBe(1); expect([30, 40]).toContain(Math.round(age.values[i]!)); }
      else { la += 1; expect(sex.values[i]).toBe(0); expect([50, 60]).toContain(Math.round(age.values[i]!)); }
    }
    expect(nyc).toBeGreaterThan(0); // both regimes appear — the exact real joint, resampled
    expect(la).toBeGreaterThan(0);
  });
});
