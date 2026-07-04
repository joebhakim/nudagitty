import { createRoot } from "react-dom/client";
import { useState } from "react";
import { simpleEdge } from "@nudagitty/core";
import type { NodeDistribution } from "@nudagitty/core";
import { CopulaAuthor, type CopulaVariable, type VineSpec } from "./CopulaAuthor";
import "./copula-author.css";

const INITIAL_VARS: CopulaVariable[] = [
  { id: "v0", name: "age", marginal: { kind: "normal", mean: 34, sd: 10 } },
  { id: "v1", name: "educ", marginal: { kind: "normal", mean: 12, sd: 2.5 } },
  { id: "v2", name: "re74", marginal: { kind: "lognormal", meanLog: 8, sdLog: 1.2 } },
  { id: "v3", name: "re75", marginal: { kind: "lognormal", meanLog: 8, sdLog: 1.2 } }
];

function initialSpec(d: number): VineSpec {
  return {
    order: Array.from({ length: d }, (_, i) => i),
    trees: [Array.from({ length: d - 1 }, () => simpleEdge("gaussian", 0.35))],
    depth: 1
  };
}

function Harness() {
  const [variables, setVariables] = useState<CopulaVariable[]>(INITIAL_VARS);
  const [spec, setSpec] = useState<VineSpec>(() => initialSpec(INITIAL_VARS.length));

  const addVar = () => {
    const next = [...variables, { id: "v" + variables.length + "-" + variables.reduce((s, v) => s + v.name.length, 0), name: "X" + (variables.length + 1), marginal: { kind: "normal", mean: 0, sd: 1 } as NodeDistribution }];
    setVariables(next); setSpec(initialSpec(next.length));
  };
  const removeVar = () => {
    if (variables.length <= 2) return;
    const next = variables.slice(0, -1);
    setVariables(next); setSpec(initialSpec(next.length));
  };
  const onMarginal = (i: number, marginal: NodeDistribution) =>
    setVariables((vs) => vs.map((v, idx) => (idx === i ? { ...v, marginal } : v)));

  return (
    <div className="ca-page">
      <header className="ca-header">
        <h1>Joint Lab</h1>
        <p>The reusable dependence widget. A reorderable line of variables (a D-vine), each with a marginal; a pair-copula on every edge; live previews in rank space and data space. Reorder the line to restructure; add trees for conditional dependence. In the real system the variables are DAG nodes and the marginals come from them — here they are yours to pick.</p>
        <nav><a href="/formulas.html">Formulas</a> · <a href="/reading.html">Reading</a> · <a href="/">nudagitty</a></nav>
      </header>
      <div className="ca-varcount">
        <button onClick={removeVar} disabled={variables.length <= 2}>− variable</button>
        <span>{variables.length} variables</span>
        <button onClick={addVar} disabled={variables.length >= 6}>+ variable</button>
      </div>
      <CopulaAuthor variables={variables} spec={spec} onSpec={setSpec} onMarginal={onMarginal} />
    </div>
  );
}

createRoot(document.getElementById("copula-root") as HTMLElement).render(<Harness />);
