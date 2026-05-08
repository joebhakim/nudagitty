export type WorkbenchMode = "basic" | "domain" | "pro";

export const MODE_LABELS: Record<WorkbenchMode, string> = {
  basic: "Basic",
  domain: "Domain",
  pro: "Pro"
};

export function modeDescription(mode: WorkbenchMode): string {
  if (mode === "basic") return "Keep the surface focused on compact teaching and everyday adjustment checks.";
  if (mode === "domain") return "Show examples and modules recommended for the selected practitioner domain.";
  return "Expose every current and planned causal design module.";
}
