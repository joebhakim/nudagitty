import { EXAMPLE_DOMAINS, EXAMPLES } from "@nudagitty/core";
import type { ExampleDomain } from "@nudagitty/core";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useState } from "react";
import type { WorkbenchMode } from "../shared/workbench";
import { isExampleVerified, verifiedExamples } from "../shared/exampleVisibility";

export function ExampleMenu(props: { mode: WorkbenchMode; activeExampleId: string | null; onSelect: (id: string) => void; onOpenGlossary?: () => void; compact?: boolean }) {
  // "Include WIP examples" (default on) exposes every example; off restricts to the curated
  // (verified / joe-approved) allowlist. Lets us sanity-check changes against the full set.
  const [includeWip, setIncludeWip] = useState<boolean>(() => {
    try { return localStorage.getItem("nudagitty.includeWip") !== "0"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem("nudagitty.includeWip", includeWip ? "1" : "0"); } catch { /* ignore */ }
  }, [includeWip]);

  const wipCount = EXAMPLES.length - verifiedExamples().length;
  const examples = includeWip ? EXAMPLES.slice() : verifiedExamples();
  const domains = EXAMPLE_DOMAINS.filter((domain) => examples.some((example) => example.domain === domain.id));
  // Look the active example up against the full set so the trigger title is right even when
  // the toggle is off and a WIP example is loaded.
  const activeExample = EXAMPLES.find((example) => example.id === props.activeExampleId);
  const activeDomain = activeExample ? activeExample.domain : domains[0]?.id ?? "classic";
  const [open, setOpen] = useState(false);
  const [highlightedDomain, setHighlightedDomain] = useState<ExampleDomain>(activeDomain);

  useEffect(() => {
    setHighlightedDomain(activeDomain);
  }, [activeDomain]);

  // Nothing to show yet -> render no example menu at all.
  if (examples.length === 0) return null;

  const highlighted = domains.find((domain) => domain.id === highlightedDomain) ?? domains[0];
  // Curated examples first within each domain, WIP ones after (stable sort keeps source order).
  const domainExamples = examples
    .filter((example) => example.domain === highlighted?.id)
    .sort((a, b) => Number(isExampleVerified(b.id)) - Number(isExampleVerified(a.id)));
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
              <label className="example-wip-toggle" title="Show work-in-progress examples that aren't curated yet">
                <input type="checkbox" checked={includeWip} onChange={(event) => setIncludeWip(event.target.checked)} />
                <span>Include WIP{wipCount > 0 ? ` (${wipCount})` : ""}</span>
              </label>
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
                {highlighted?.id === "disambiguation" && props.onOpenGlossary && (
                  <button
                    type="button"
                    className="example-glossary-link"
                    onClick={() => { setOpen(false); props.onOpenGlossary!(); }}
                  >
                    Open the term-disambiguation map →
                  </button>
                )}
              </div>
              {domainExamples.map((example) => (
                <DropdownMenu.Item key={example.id} asChild onSelect={() => props.onSelect(example.id)}>
                  <button
                    type="button"
                    className={example.id === props.activeExampleId ? "active" : ""}
                  >
                    <strong className="example-choice-title-row">
                      <span className="example-choice-title">{example.title}</span>
                      {!isExampleVerified(example.id) && <span className="example-wip-badge">WIP</span>}
                    </strong>
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
