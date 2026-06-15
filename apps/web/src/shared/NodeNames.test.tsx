import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { GraphNode } from "@nudagitty/core";
import { HighlightNames, NodeNamesProvider, buildNodeNameRegistry, highlightNodeNames } from "./NodeNames";

function node(id: string, label?: string): GraphNode {
  // minimal shape the registry reads
  return { id, label: label ?? id } as unknown as GraphNode;
}

const NODES = [
  node("Brought_to_vet", "brought to vet"),
  node("Injury_severity", "injury severity"),
  node("Survival", "Survival"),
  node("Fall_height", "fall height (stories)")
];

function chips(text: string): string[] {
  const registry = buildNodeNameRegistry(NODES);
  const html = renderToStaticMarkup(<>{highlightNodeNames(text, registry)}</>);
  return [...html.matchAll(/<span class="node-name">([^<]*)<\/span>/g)].map((m) => m[1] ?? "");
}

describe("node-name registry + highlighter", () => {
  it("chips a verbatim id, normalizing underscores", () => {
    expect(chips("conditioning on Brought_to_vet opens a path")).toEqual(["brought to vet"]);
  });

  it("matches case-insensitively and renders the canonical name", () => {
    expect(chips("survival falls with injury severity")).toEqual(["Survival", "injury severity"]);
  });

  it("strips the unit annotation from a label match", () => {
    // the label is "fall height (stories)" but prose says "fall height"
    expect(chips("do(fall height = 7)")).toEqual(["fall height"]);
  });

  it("prefers the longest alias (no partial double-chipping)", () => {
    // "injury severity" must win as one chip, not "injury" + leftover
    expect(chips("the injury severity rose")).toEqual(["injury severity"]);
  });

  it("does not match inside a larger word", () => {
    // "Survival" should not chip inside "Survivalist"
    expect(chips("a Survivalist camp")).toEqual([]);
  });

  it("leaves plain text with no node names untouched", () => {
    expect(chips("the cats fell from a height")).toEqual([]);
  });

  it("HighlightNames walks a subtree, chipping text but skipping SVG and existing chips", () => {
    const html = renderToStaticMarkup(
      <NodeNamesProvider nodes={NODES}>
        <HighlightNames>
          <div>
            <p>Survival depends on injury severity</p>
            <span className="node-name">already a chip</span>
            <svg><text>Survival axis label</text></svg>
          </div>
        </HighlightNames>
      </NodeNamesProvider>
    );
    // prose chipped
    expect(html).toContain('<span class="node-name">Survival</span>');
    expect(html).toContain('<span class="node-name">injury severity</span>');
    // existing chip untouched (not re-wrapped/altered)
    expect(html).toContain('<span class="node-name">already a chip</span>');
    // svg text NOT chipped
    expect(html).toContain("<text>Survival axis label</text>");
  });
});
