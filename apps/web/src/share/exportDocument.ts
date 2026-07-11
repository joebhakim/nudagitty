import { exampleDocument, serializeTikz } from "@nudagitty/core";
import type { GraphDocument, GraphModel } from "@nudagitty/core";
import type { ShareStatus } from "../app/types";
import {
  SHARE_COMPACT_HASH_KEY,
  SHARE_DOCUMENT_HASH_KEY,
  SHARE_EXAMPLE_HASH_KEY,
  createWorkbenchSnapshot,
  encodeCompactShareDocument,
  encodeWorkbenchSnapshot
} from "../shared/appState";

export function compactShareUrlForDocument(document: GraphDocument, activeExampleId: string | null): string {
  const url = new URL(window.location.href);
  const exampleId = canonicalShareExampleId(document, activeExampleId);
  if (exampleId) {
    url.hash = `${SHARE_EXAMPLE_HASH_KEY}=${encodeURIComponent(exampleId)}`;
    return url.toString();
  }
  const encoded = encodeCompactShareDocument(document, activeExampleId);
  url.hash = `${SHARE_COMPACT_HASH_KEY}=${encoded}`;
  return url.toString();
}

export function fullShareUrlForDocument(document: GraphDocument, activeExampleId: string | null): string {
  const url = new URL(window.location.href);
  const encoded = encodeWorkbenchSnapshot(createWorkbenchSnapshot(document, activeExampleId));
  url.hash = `${SHARE_DOCUMENT_HASH_KEY}=${encoded}`;
  return url.toString();
}

export function hashMatchesPaperNetwork(hash: string): boolean {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return params.get("paper") === "k562";
}

export function canonicalShareExampleId(document: GraphDocument, activeExampleId: string | null): string | null {
  if (!activeExampleId) return null;
  const example = exampleDocument(activeExampleId);
  if (!example) return null;
  const current = JSON.stringify({ graph: document.graph, simulation: document.simulation });
  const canonical = JSON.stringify({ graph: example.graph, simulation: example.simulation });
  return current === canonical ? activeExampleId : null;
}

export function shareStatusLabel(status: ShareStatus, idleLabel: string) {
  if (status === "copied") return "Copied";
  if (status === "copied-no-data") return "Copied — your imported data can't travel in a link; the recipient must re-upload the CSV";
  if (status === "too-large") return "Link too big";
  if (status === "failed") return "Copy failed";
  return idleLabel;
}

export function exportSvg() {
  const svg = document.querySelector(".graph-canvas");
  if (!(svg instanceof SVGSVGElement)) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  downloadText("nudagitty-model.svg", new XMLSerializer().serializeToString(clone), "image/svg+xml");
}

export function exportBitmap(format: "png" | "jpeg") {
  const svg = document.querySelector(".graph-canvas");
  if (!(svg instanceof SVGSVGElement)) return;
  const rect = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", `${rect.width}`);
  clone.setAttribute("height", `${rect.height}`);
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const canvas = window.document.createElement("canvas");
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const ext = format === "jpeg" ? "jpg" : "png";
    downloadUrl(`nudagitty-model.${ext}`, canvas.toDataURL(`image/${format}`));
  };
  image.src = url;
}

export function downloadText(filename: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  downloadUrl(filename, url);
  URL.revokeObjectURL(url);
}

export function downloadUrl(filename: string, url: string) {
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
}

export function tikzDocument(graph: GraphModel): string {
  return `% This code uses the tikz package
\\begin{tikzpicture}
${serializeTikz(graph)}
\\end{tikzpicture}
`;
}
