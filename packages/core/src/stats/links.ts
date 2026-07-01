// Canonical link functions: logistic (sigmoid), its inverse (logit), and the
// probit / inverse-standard-normal-CDF.
//
// The probit uses Acklam's rational approximation (|error| < 1.2e-9). The engine
// previously carried two copies that differed ONLY in how far they clamped the
// input off {0, 1} — `probit` used 1e-12, `inverseStandardNormalCdf` used 1e-15.
// That single knob is exposed here as `clampEpsilon` so both are reproduced
// byte-for-byte.

/** Numerically stable logistic function, 1 / (1 + e^-x), valued in (0, 1). */
export function sigmoid(value: number): number {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

/** Inverse of {@link sigmoid}: log(p / (1 - p)). */
export function logit(p: number): number {
  return Math.log(p / (1 - p));
}

export interface ProbitOptions {
  /** Half-width the input probability is clamped off {0, 1} before evaluation.
   *  Default 1e-12 (the historical `probit`); pass 1e-15 to reproduce the old
   *  `inverseStandardNormalCdf`. */
  clampEpsilon?: number;
}

/** Inverse standard-normal CDF (probit), Φ⁻¹(p), via Acklam's approximation. */
export function probit(p: number, options: ProbitOptions = {}): number {
  const eps = options.clampEpsilon ?? 1e-12;
  const u = Math.min(1 - eps, Math.max(eps, p));
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425, phigh = 1 - plow;
  if (u < plow) {
    const q = Math.sqrt(-2 * Math.log(u));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (u > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - u));
    return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  const q = u - 0.5;
  const r = q * q;
  return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

/** Alias for {@link probit}: the inverse standard-normal CDF. */
export const inverseNormalCdf = probit;
