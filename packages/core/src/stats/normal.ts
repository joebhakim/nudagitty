// Canonical standard-normal distribution math: density, CDF, and the error
// function it is built on (Abramowitz & Stegun 7.1.26, |error| ~1.5e-7).

/** Standard-normal probability density φ(z). */
export function standardNormalPdf(value: number): number {
  return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

/** Standard-normal cumulative distribution Φ(z). */
export function standardNormalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

/** Gauss error function erf(x). */
export function erf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}
