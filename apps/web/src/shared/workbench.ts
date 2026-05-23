export type WorkbenchMode = "basic" | "domain" | "pro";

export const MODE_LABELS: Record<WorkbenchMode, string> = {
  basic: "Demo",
  domain: "Domain",
  pro: "Pro"
};

export function modeDescription(mode: WorkbenchMode): string {
  if (mode === "basic") return "Start with a guided causal demo focused on the main punchline.";
  if (mode === "domain") return "Show examples and modules recommended for the selected practitioner domain.";
  return "Expose every current and planned causal design module.";
}
