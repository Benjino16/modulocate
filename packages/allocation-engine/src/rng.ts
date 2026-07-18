// mulberry32 — small, dependency-free, deterministic PRNG. Used only for the
// algorithm's tie-breaks (allocator_planning.md Section 2, step 1), so a run
// is fully reproducible for the same input + AllocationConfig.seed.
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
