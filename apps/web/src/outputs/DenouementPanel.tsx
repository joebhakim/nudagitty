import type { ExampleDenouement } from "@nudagitty/core";
import { useEffect, useState } from "react";

export function DenouementPanel({ denouement, title }: { denouement: ExampleDenouement; title: string }) {
  return (
    <div className="denouement-panel">
      <div className="module-card-header">
        <strong>Denouement</strong>
        <span className="module-badge">{denouement.module}</span>
      </div>
      <div className="denouement-head">
        <span>{title}</span>
        <p>{denouement.punchline}</p>
      </div>
      <dl className="denouement-summary">
        <div>
          <dt>estimand</dt>
          <dd>{denouement.estimand}</dd>
        </div>
        <div>
          <dt>main output</dt>
          <dd>{denouement.primaryOutput}</dd>
        </div>
        <div>
          <dt>validity</dt>
          <dd>{denouement.validity}</dd>
        </div>
        <div>
          <dt>next action</dt>
          <dd>{denouement.nextAction}</dd>
        </div>
      </dl>
      <div className="denouement-sections">
        {denouement.sections.map((section) => <DenouementSection section={section} key={section.title} />)}
      </div>
    </div>
  );
}

function DenouementSection({ section }: { section: ExampleDenouement["sections"][number] }) {
  const [open, setOpen] = useState(section.defaultOpen ?? false);
  useEffect(() => {
    setOpen(section.defaultOpen ?? false);
  }, [section]);
  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{section.title}</summary>
      <ul className="denouement-checklist">
        {section.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </details>
  );
}
