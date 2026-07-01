import type { AnalysisReport, EffectKind } from "@nudagitty/core";
import { List } from "../controls";
import { BIBLIOGRAPHY, BIBLIOGRAPHY_TOPICS } from "../app/constants";
import type { BibliographyTopic } from "../shared/appState";

export function EffectPanel({ effectKind, analysis }: { effectKind: EffectKind; analysis: AnalysisReport }) {
  if (effectKind === "instrument") {
    return (
      <div>
        <p>{analysis.instruments.message}</p>
        <List values={analysis.instruments.instruments.map((item) => item.conditionedOn.length ? `${item.instrument} | ${item.conditionedOn.join(", ")}` : item.instrument)} empty="No instruments found." />
      </div>
    );
  }
  const report = effectKind === "direct" ? analysis.directEffect : effectKind === "causalOdds" ? analysis.causalOdds : analysis.totalEffect;
  return (
    <div>
      <p className={report.valid ? "assurance" : "warning"}>{report.message}</p>
      <p>Exposure{analysis.exposures.length === 1 ? "" : "s"}: {analysis.exposures.join(", ") || "not set"}</p>
      <p>Outcome{analysis.outcomes.length === 1 ? "" : "s"}: {analysis.outcomes.join(", ") || "not set"}</p>
      {report.minimalSets.length > 0 && <List values={report.minimalSets.map((set) => set.length ? `{${set.join(", ")}}` : "{}")} empty="" />}
    </div>
  );
}

export function ImplicationPanel({ analysis }: { analysis: AnalysisReport }) {
  if (analysis.implications.length === 0) return <p className="muted">No testable conditional independencies found in the current bounded search.</p>;
  return <List values={analysis.implications.map((item) => `${item.left} independent ${item.right}${item.given.length ? ` | ${item.given.join(", ")}` : ""}`)} empty="" />;
}

export function SummaryPanel({ analysis }: { analysis: AnalysisReport }) {
  if (analysis.cycle) return <p className="warning">Directed cycle: {analysis.cycle.join(" -> ")}</p>;
  return (
    <table className="summary-table">
      <tbody>
        <tr><td>exposure(s)</td><td>{analysis.exposures.join(", ") || "not set"}</td></tr>
        <tr><td>outcome(s)</td><td>{analysis.outcomes.join(", ") || "not set"}</td></tr>
        <tr><td>adjusted</td><td>{analysis.adjusted.join(", ") || "none"}</td></tr>
        <tr><td>sample markers</td><td>{analysis.selected.join(", ") || "none"}</td></tr>
        <tr><td>covariates</td><td>{analysis.covariateCount}</td></tr>
        <tr><td>causal paths</td><td>{analysis.causalPathCount}</td></tr>
        <tr><td>open biasing paths</td><td>{analysis.openBiasingPathCount}</td></tr>
      </tbody>
    </table>
  );
}

export function BibliographyPanel(props: { topic: BibliographyTopic; onTopic: (topic: BibliographyTopic) => void }) {
  const entries = BIBLIOGRAPHY.filter((entry) => entry.topic === props.topic);
  return (
    <div className="bibliography-panel">
      <select value={props.topic} onChange={(event) => props.onTopic(event.target.value as BibliographyTopic)}>
        {BIBLIOGRAPHY_TOPICS.map((topic) => <option value={topic.id} key={topic.id}>{topic.label}</option>)}
      </select>
      <ul className="bibliography-list">
        {entries.map((entry) => (
          <li key={entry.url}>
            <span>{entry.label}</span>
            <a href={entry.url} target="_blank" rel="noreferrer">{entry.citation}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
