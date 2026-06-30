import { FIELD_LABELS, type DisambiguationTerm } from "../shared/disambiguation";

// Per-example reference card: ties the live structure on screen to its cross-field / cross-author
// vocabulary — what it's also called, what it's confused with, and the anchoring papers.
export function DisambiguationCard({ term }: { term: DisambiguationTerm }) {
  return (
    <details className="output-box disambiguation-card" open>
      <summary>
        <strong>{term.term}</strong>
        <span className="disambiguation-structure">{term.structure}</span>
      </summary>
      <div className="disambiguation-card-body">
        <p className="disambiguation-oneliner">{term.oneLiner}</p>

        <div className="disambiguation-row">
          <span className="disambiguation-row-label">Also called</span>
          <span className="disambiguation-chips">
            {term.alsoCalled.map((alias) => (
              <span className="disambiguation-chip" key={alias.name}>
                {alias.name}<i>{FIELD_LABELS[alias.field]}</i>
              </span>
            ))}
          </span>
        </div>

        <div className="disambiguation-row">
          <span className="disambiguation-row-label">Distinct from</span>
          <ul className="disambiguation-distinct">
            {term.distinctFrom.map((other) => (
              <li key={other.term}><strong>{other.term}</strong> — {other.because}</li>
            ))}
          </ul>
        </div>

        <div className="disambiguation-anchors">
          {term.anchors.map((anchor) => (
            <span className="disambiguation-anchor" key={anchor.cite}>
              {anchor.cite}{anchor.note ? <i> · {anchor.note}</i> : null}
            </span>
          ))}
        </div>
      </div>
    </details>
  );
}
