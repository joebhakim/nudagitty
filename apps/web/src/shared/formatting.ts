export function formatValue(value: number): string {
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function formatInputNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Object.is(value, -0) || value === 0) return "0";
  if (Number.isInteger(value)) return String(value);
  const abs = Math.abs(value);
  if (abs < 0.001) return Number(value.toPrecision(3)).toString();
  const decimals = abs >= 100 ? 1 : abs >= 10 ? 2 : abs >= 1 ? 3 : 4;
  return value.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatSignedValue(value: number): string {
  const formatted = formatValue(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${formatted}`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

export function formatPercentagePoints(value: number): string {
  if (!Number.isFinite(value)) return "0 pp";
  return `${value >= 0 ? "+" : "-"}${formatValue(Math.abs(value * 100))} pp`;
}

export function formatPercentagePointMagnitude(value: number): string {
  if (!Number.isFinite(value)) return "0 pp";
  return `${formatValue(Math.abs(value * 100))} pp`;
}

export function formatWeightedCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Math.abs(value - Math.round(value)) < 1e-6 ? String(Math.round(value)) : formatValue(value);
}

// Canonical clamp/coerce helpers live in the shared stats lib. `clampFinite` is the
// NaN-guarded clamp this module historically exposed as `clamp`, and `coerceBinary`
// is byte-identical to the local copy that used to live here.
export { clampFinite as clamp, coerceBinary } from "@nudagitty/core";
