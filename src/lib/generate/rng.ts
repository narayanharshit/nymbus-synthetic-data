/**
 * Seeded, deterministic pseudo-random number generator (mulberry32).
 *
 * Determinism is a feature, not an accident: the same seed + the same spec
 * always produces the byte-identical dataset. That makes "regenerate" stable,
 * makes bugs reproducible, and lets the validation layer be trusted. None of
 * this would hold if we asked an LLM to emit the rows.
 */

export class Rng {
  private state: number;

  constructor(seed: number) {
    // Ensure a non-zero 32-bit state.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** True with probability p (0–1). */
  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  /** Uniformly pick one element. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Pick an index according to non-negative weights. */
  weightedIndex(weights: readonly number[]): number {
    const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
    if (total <= 0) return 0;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** Pick one element according to a parallel weights array. */
  weightedPick<T>(arr: readonly T[], weights: readonly number[]): T {
    return arr[this.weightedIndex(weights)];
  }

  /** Approximately-normal value via summed uniforms (Irwin–Hall), clamped. */
  gaussian(mean: number, std: number, min = -Infinity, max = Infinity): number {
    let s = 0;
    for (let i = 0; i < 6; i++) s += this.next();
    const z = (s - 3) / Math.sqrt(0.5); // ~N(0,1)
    return Math.min(max, Math.max(min, mean + z * std));
  }

  /** In-place Fisher–Yates shuffle (returns the same array). */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** A random integer amount in cents within [minDollars, maxDollars]. */
  amountMinor(minDollars: number, maxDollars: number): number {
    return this.int(Math.round(minDollars * 100), Math.round(maxDollars * 100));
  }
}
