import { EXAMPLES, EXAMPLE_DOMAINS } from "@nudagitty/core";
import type { ExampleDomain } from "@nudagitty/core";
import { useEffect, useState } from "react";
import type { WorkbenchMode } from "../shared/workbench";

export function ExampleMenu(props: { mode: WorkbenchMode; activeExampleId: string | null; onSelect: (id: string) => void }) {
  const activeExample = EXAMPLES.find((example) => example.id === props.activeExampleId);
  const domains = exampleDomainsForMode(props.mode);
  const domainIds = new Set<ExampleDomain>(domains.map((domain) => domain.id));
  const activeDomain = activeExample && domainIds.has(activeExample.domain) ? activeExample.domain : domains[0]?.id ?? "classic";
  const [open, setOpen] = useState(false);
  const [highlightedDomain, setHighlightedDomain] = useState<ExampleDomain>(activeDomain);

  useEffect(() => {
    setHighlightedDomain(activeDomain);
  }, [activeDomain, props.mode]);

  const highlighted = EXAMPLE_DOMAINS.find((domain) => domain.id === highlightedDomain) ?? domains[0];
  const examples = EXAMPLES.filter((example) => example.domain === highlighted?.id);
  return (
    <div className="example-menu" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label="Examples"
        aria-haspopup="menu"
        aria-expanded={open}
        className="example-menu-trigger"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{activeExample?.title ?? "Examples"}</span>
      </button>
      {open && (
        <div className="example-menu-popover" role="menu">
          <div className="example-domain-list" aria-label="Example domains">
            {domains.map((domain) => (
              <button
                type="button"
                className={domain.id === highlightedDomain ? "active" : ""}
                onMouseEnter={() => setHighlightedDomain(domain.id)}
                onFocus={() => setHighlightedDomain(domain.id)}
                key={domain.id}
              >
                <span>{domain.label}</span>
              </button>
            ))}
          </div>
          <div className="example-choice-list">
            <div className="example-choice-head">
              <strong>{highlighted?.label}</strong>
              <span>{highlighted?.description}</span>
            </div>
            {examples.map((example) => (
              <button
                type="button"
                role="menuitem"
                className={example.id === props.activeExampleId ? "active" : ""}
                onClick={() => {
                  props.onSelect(example.id);
                  setOpen(false);
                }}
                key={example.id}
              >
                <strong>{example.title}</strong>
                <span>{example.summary}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function exampleDomainsForMode(mode: WorkbenchMode): ReadonlyArray<typeof EXAMPLE_DOMAINS[number]> {
  if (mode === "basic") return EXAMPLE_DOMAINS.filter((domain) => domain.id === "classic");
  return EXAMPLE_DOMAINS;
}
