import { EXAMPLES, EXAMPLE_DOMAINS } from "@nudagitty/core";
import type { ExampleDomain } from "@nudagitty/core";
import { useEffect, useState } from "react";
import type { WorkbenchMode } from "../shared/workbench";

const BASIC_EXAMPLE_IDS = [
  "simpson-severity",
  "front-door-smoking",
  "birthweight-paradox",
  "m-bias-adjustment",
  "lords-paradox",
  "chess-intelligence-practice-simple-flip"
];

export function ExampleMenu(props: { mode: WorkbenchMode; activeExampleId: string | null; onSelect: (id: string) => void }) {
  const activeExample = EXAMPLES.find((example) => example.id === props.activeExampleId);
  const basicMode = props.mode === "basic";
  const domains = exampleDomainsForMode(props.mode);
  const domainIds = new Set<ExampleDomain>(domains.map((domain) => domain.id));
  const activeDomain = activeExample && domainIds.has(activeExample.domain) ? activeExample.domain : domains[0]?.id ?? "classic";
  const [open, setOpen] = useState(false);
  const [highlightedDomain, setHighlightedDomain] = useState<ExampleDomain>(activeDomain);

  useEffect(() => {
    setHighlightedDomain(activeDomain);
  }, [activeDomain, props.mode]);

  const highlighted = EXAMPLE_DOMAINS.find((domain) => domain.id === highlightedDomain) ?? domains[0];
  const examples = basicMode
    ? BASIC_EXAMPLE_IDS.map((id) => EXAMPLES.find((example) => example.id === id)).filter((example): example is typeof EXAMPLES[number] => example !== undefined)
    : EXAMPLES.filter((example) => example.domain === highlighted?.id);
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
        <span className="example-menu-trigger-text">
          <span className="example-menu-label">Examples</span>
          <span className="example-menu-title">{activeExample?.title ?? "Choose one"}</span>
        </span>
      </button>
      {open && (
        <div className={basicMode ? "example-menu-popover basic" : "example-menu-popover"} role="menu">
          {!basicMode && <div className="example-domain-list" aria-label="Example domains">
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
          </div>}
          <div className="example-choice-list">
            <div className="example-choice-head">
              <strong>{basicMode ? "Core causal patterns" : highlighted?.label}</strong>
              <span>{basicMode ? "A short punchline tour: confounding, front door, selection, bad controls, estimand splits, and a chess sign flip." : highlighted?.description}</span>
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
