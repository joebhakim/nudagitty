import {
  DISAMBIGUATION_TERMS,
  DISAMBIGUATION_DISTINCTIONS,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  FIELD_LABELS,
  type DisambiguationTerm
} from "../shared/disambiguation";

// The standalone glossary map: the whole field at a glance, grouped by category (roles, paths,
// interactions, assumptions, estimands, methods, bad-controls), each term linking to its live example,
// plus the cross-field pitfalls.
export function DisambiguationMap({ onOpenExample }: { onOpenExample: (id: string) => void }) {
  return (
    <div className="disambiguation-map">
      {CATEGORY_ORDER.map((category) => {
        const terms = DISAMBIGUATION_TERMS.filter((term) => term.category === category);
        if (terms.length === 0) return null;
        return (
          <section className="disambiguation-map-section" key={category}>
            <h3>{CATEGORY_LABELS[category]}</h3>
            <div className="disambiguation-map-grid">
              {terms.map((term) => <TermCard key={term.id} term={term} onOpen={onOpenExample} />)}
            </div>
          </section>
        );
      })}

      <section className="disambiguation-map-section">
        <h3>Pitfalls — why the words slip</h3>
        <div className="disambiguation-map-pitfalls">
          {DISAMBIGUATION_DISTINCTIONS.map((distinction) => (
            <div className="disambiguation-pitfall" key={distinction.id}>
              <strong>{distinction.title}</strong>
              <p>{distinction.body}</p>
              <span className="disambiguation-anchor">{distinction.anchor}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TermCard({ term, onOpen }: { term: DisambiguationTerm; onOpen: (id: string) => void }) {
  return (
    <div className="disambiguation-map-term">
      <div className="disambiguation-map-term-head">
        <strong>{term.term}</strong>
        <code className="disambiguation-structure">{term.structure}</code>
      </div>
      <p className="disambiguation-oneliner">{term.oneLiner}</p>
      <div className="disambiguation-chips">
        {term.alsoCalled.map((alias) => (
          <span className="disambiguation-chip" key={alias.name}>{alias.name}<i>{FIELD_LABELS[alias.field]}</i></span>
        ))}
      </div>
      <div className="disambiguation-map-term-foot">
        <span className="disambiguation-anchor">{term.anchors.map((anchor) => anchor.cite).join(" · ")}</span>
        {term.exampleId && (
          <button type="button" className="disambiguation-open" onClick={() => onOpen(term.exampleId!)}>open example →</button>
        )}
      </div>
    </div>
  );
}
