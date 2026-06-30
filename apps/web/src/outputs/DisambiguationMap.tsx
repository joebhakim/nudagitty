import {
  DISAMBIGUATION_TERMS,
  DISAMBIGUATION_DISTINCTIONS,
  FIELD_LABELS,
  type DisambiguationTerm
} from "../shared/disambiguation";

// The standalone glossary map: the whole field at a glance. Roles (what a third variable does) and the
// interaction flavours, each linking to its live example, plus the cross-field pitfalls.
const ROLE_IDS = ["confounder", "mediator", "moderator", "collider", "instrument"];

export function DisambiguationMap({ onOpenExample }: { onOpenExample: (id: string) => void }) {
  const roles = DISAMBIGUATION_TERMS.filter((term) => ROLE_IDS.includes(term.id));
  const interactions = DISAMBIGUATION_TERMS.filter((term) => !ROLE_IDS.includes(term.id));
  return (
    <div className="disambiguation-map">
      <section className="disambiguation-map-section">
        <h3>Roles — what a third variable does</h3>
        <div className="disambiguation-map-grid">
          {roles.map((term) => <TermCard key={term.id} term={term} onOpen={onOpenExample} />)}
        </div>
      </section>

      <section className="disambiguation-map-section">
        <h3>Interaction — how a moderator bends the effect</h3>
        <div className="disambiguation-map-grid">
          {interactions.map((term) => <TermCard key={term.id} term={term} onOpen={onOpenExample} />)}
        </div>
      </section>

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
