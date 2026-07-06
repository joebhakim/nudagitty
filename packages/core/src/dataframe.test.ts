import { describe, expect, it } from "vitest";
import { exampleDocument } from "./examples";
import { runSimulation } from "./simulation";
import { dataFrameFromSimulation, dataFrameToCsv } from "./dataframe";

describe("dataframe", () => {
  it("materializes a simulation as typed columns + rows", () => {
    const doc = exampleDocument("categorical-regimen")!; // has a categorical node (Regimen)
    const result = runSimulation(doc.graph, doc.simulation);
    const df = dataFrameFromSimulation(doc.graph, result);
    expect(df.columns.length).toBe(doc.graph.nodes.length);
    expect(df.nRows).toBeGreaterThan(1000);
    const regimen = df.columns.find((c) => c.name.toLowerCase().includes("regimen"))!;
    expect(regimen.type).toBe("categorical");
    expect(regimen.categories?.length).toBe(3);
    // every column has nRows values (index-aligned rows)
    for (const col of df.columns) expect(col.values.length).toBe(df.nRows);
  });

  it("excludes latent nodes (unobserved / plasmode index) from the data by default", () => {
    const doc = exampleDocument("lalonde-dgm-plasmode")!; // has a latent Row_source plasmode index
    const result = runSimulation(doc.graph, doc.simulation);
    const df = dataFrameFromSimulation(doc.graph, result);
    expect(df.columns.some((c) => /row|resample/i.test(c.name))).toBe(false); // the row-index source is gone
    const latentIds = doc.graph.nodes.filter((n) => n.roles.latent).map((n) => n.label || n.id);
    expect(latentIds.length).toBeGreaterThan(0);
    const withLatent = dataFrameFromSimulation(doc.graph, result, { includeLatent: true });
    expect(withLatent.columns.length).toBe(df.columns.length + latentIds.length); // opt-in brings them back
  });

  it("exports CSV with a header, category labels, and one line per row", () => {
    const doc = exampleDocument("simpson-severity")!;
    const result = runSimulation(doc.graph, doc.simulation);
    const df = dataFrameFromSimulation(doc.graph, result);
    const csv = dataFrameToCsv(df, { maxRows: 5 });
    const lines = csv.split("\n");
    expect(lines.length).toBe(6); // header + 5 rows
    expect(lines[0]!.split(",").length).toBe(df.columns.length);
    for (let i = 1; i < lines.length; i += 1) expect(lines[i]!.split(",").length).toBe(df.columns.length);

    // labelled discrete values: a categorical column writes its label, not the code
    const catDoc = exampleDocument("categorical-regimen")!;
    const catDf = dataFrameFromSimulation(catDoc.graph, runSimulation(catDoc.graph, catDoc.simulation));
    const labelled = dataFrameToCsv(catDf, { labels: true, maxRows: 200 });
    expect(labelled).toMatch(/regimen [ABC]/);
    const coded = dataFrameToCsv(catDf, { labels: false, maxRows: 200 });
    expect(coded).not.toMatch(/regimen [ABC]/);
  });
});
