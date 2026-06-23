import { EXAMPLE_DOMAINS } from "@nudagitty/core";
import type { ExampleDomain } from "@nudagitty/core";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useState } from "react";
import type { WorkbenchMode } from "../shared/workbench";
import { verifiedExamples } from "../shared/exampleVisibility";

export function ExampleMenu(props: { mode: WorkbenchMode; activeExampleId: string | null; onSelect: (id: string) => void; compact?: boolean }) {
  // Only verified examples are exposed; demo/basic gating is gone (the app is pro-only).
  const examples = verifiedExamples();
  const domains = EXAMPLE_DOMAINS.filter((domain) => examples.some((example) => example.domain === domain.id));
  const activeExample = examples.find((example) => example.id === props.activeExampleId);
  const activeDomain = activeExample ? activeExample.domain : domains[0]?.id ?? "classic";
  const [open, setOpen] = useState(false);
  const [highlightedDomain, setHighlightedDomain] = useState<ExampleDomain>(activeDomain);

  useEffect(() => {
    setHighlightedDomain(activeDomain);
  }, [activeDomain]);

  // Nothing verified to show yet -> render no example menu at all.
  if (examples.length === 0) return null;

  const highlighted = domains.find((domain) => domain.id === highlightedDomain) ?? domains[0];
  const domainExamples = examples.filter((example) => example.domain === highlighted?.id);
  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <div className="example-menu">
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label="Examples"
            className="example-menu-trigger"
          >
            <span className="example-menu-trigger-text">
              <span className="example-menu-label">{props.compact ? "More examples" : "Examples"}</span>
              {!props.compact && <span className="example-menu-title">{activeExample?.title ?? "Choose one"}</span>}
            </span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          className="example-menu-popover"
          aria-label="Example choices"
          aria-labelledby="example-menu-content-label"
          align="start"
          side="bottom"
          sideOffset={-1}
          collisionPadding={8}
        >
            <span id="example-menu-content-label" className="screen-reader-only">Example choices</span>
            <div className="example-sheet-head">
              <div>
                <strong>Examples</strong>
                <span>{highlighted?.label}</span>
              </div>
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}>close</button>
            </div>
            <div className="example-domain-list" aria-label="Example domains">
              {domains.map((domain) => (
                <button
                  type="button"
                  className={domain.id === highlightedDomain ? "active" : ""}
                  onMouseEnter={() => setHighlightedDomain(domain.id)}
                  onFocus={() => setHighlightedDomain(domain.id)}
                  onClick={(event) => {
                    event.preventDefault();
                    setHighlightedDomain(domain.id);
                  }}
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
              {domainExamples.map((example) => (
                <DropdownMenu.Item key={example.id} asChild onSelect={() => props.onSelect(example.id)}>
                  <button
                    type="button"
                    className={example.id === props.activeExampleId ? "active" : ""}
                  >
                    <strong>{example.title}</strong>
                    <span>{example.summary}</span>
                  </button>
                </DropdownMenu.Item>
              ))}
            </div>
        </DropdownMenu.Content>
      </div>
    </DropdownMenu.Root>
  );
}
