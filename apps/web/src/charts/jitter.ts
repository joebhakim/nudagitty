// Canonical deterministic "jitter": a reproducible pseudo-random offset used to
// spread overlapping scatter dots into a readable swarm without carrying any RNG
// state. Every jitter call site in the app routes through this one hash, so the
// (fixed, seed-driven) point scatter is defined in exactly one place.
//
// The hash is the classic `fract(sin(seed) * scale)` trick, recentred to
// [-0.5, 0.5) and scaled by `amplitude`. Each caller builds `seed` from its own
// salted index scheme and passes the `scale`/`amplitude` that reproduce its exact
// historical offsets. This has been verified byte-identical against the previous
// per-call-site implementations (category-outcome, strip, and binned jitter) for
// every point they emit — see the throwaway numeric probe in the consolidation PR.
export function deterministicJitter(seed: number, scale: number, amplitude = 1): number {
  const x = Math.sin(seed) * scale;
  return (x - Math.floor(x) - 0.5) * amplitude;
}
