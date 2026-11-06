/**
 * Deterministic PRNG and distribution utilities for reproducible performance datasets.
 */

export interface PRNG {
  next(): number;
  nextInt(min: number, max: number): number;
  choice<T>(arr: readonly T[]): T;
  paretoIndex(length: number, alpha?: number): number;
}

export function createPrng(seed: number = 42): PRNG {
  let s = seed >>> 0;

  // Mulberry32 32-bit state generator
  function next(): number {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function nextInt(min: number, max: number): number {
    return Math.floor(next() * (max - min + 1)) + min;
  }

  function choice<T>(arr: readonly T[]): T {
    const idx = Math.floor(next() * arr.length);
    return arr[idx];
  }

  /**
   * Generates an index heavily skewed towards lower indices (80/20 Pareto principle).
   * Alpha ~ 1.16 gives roughly 80/20 distribution.
   */
  function paretoIndex(length: number, alpha: number = 1.16): number {
    const u = Math.max(0.0001, 1 - next());
    const pareto = Math.pow(u, -1 / alpha) - 1;
    const normalized = Math.min(1, pareto / 10);
    return Math.min(length - 1, Math.floor(normalized * length));
  }

  return { next, nextInt, choice, paretoIndex };
}
