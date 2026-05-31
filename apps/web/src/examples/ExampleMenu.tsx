import { EXAMPLES } from "@nudagitty/core";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Fragment, useState } from "react";
import type { WorkbenchMode } from "../shared/workbench";

const BASIC_EXAMPLE_IDS = [
  "tutoring-scores",
  "simpson-severity",
  "front-door-smoking",
  "birthweight-paradox",
  "m-bias-adjustment",
  "lords-paradox",
  "chess-intelligence-practice-simple-flip"
];

export function ExampleMenu(props: { mode: WorkbenchMode; activeExampleId: string | null; onSelect: (id: string) => void; compact?: boolean }) {
  const activeExample = EXAMPLES.find((example) => example.id === props.activeExampleId);
  const basicMode = props.mode === "basic";
  const [open, setOpen] = useState(false);
  const examples = basicMode
    ? BASIC_EXAMPLE_IDS.map((id) => EXAMPLES.find((example) => example.id === id)).filter((example): example is typeof EXAMPLES[number] => example !== undefined)
    : EXAMPLES;
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
          className={basicMode ? "example-menu-popover basic" : "example-menu-popover"}
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
                <span>{basicMode ? "Start with Simpson or tutoring." : "All examples"}</span>
              </div>
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}>close</button>
            </div>
            <div className="example-choice-list">
              <div className="example-choice-head">
                <strong>{basicMode ? "Core causal patterns" : "All examples"}</strong>
                <span>{basicMode ? "Start with the two sign flips, then use the rest as follow-up patterns." : "One flat catalog, ordered from teaching demos to advanced patterns."}</span>
              </div>
              {examples.map((example, index) => (
                <Fragment key={example.id}>
                  {basicMode && index === 2 && <div className="example-more-divider">More examples</div>}
                  <DropdownMenu.Item asChild onSelect={() => props.onSelect(example.id)}>
                    <button
                      type="button"
                      className={[
                        example.id === props.activeExampleId ? "active" : "",
                        basicMode && index < 2 ? "frontline" : "",
                        basicMode && index >= 2 ? "secondary" : ""
                      ].filter(Boolean).join(" ")}
                    >
                      <strong>{example.title}</strong>
                      <span>{example.summary}</span>
                    </button>
                  </DropdownMenu.Item>
                </Fragment>
              ))}
            </div>
        </DropdownMenu.Content>
      </div>
    </DropdownMenu.Root>
  );
}
