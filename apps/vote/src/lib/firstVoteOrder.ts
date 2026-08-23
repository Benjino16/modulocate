import { simulateOwnAllocation, type SimulationModule, type SimulationRule } from "./simulateAllocation";

// djb2-ish string hash -> uint32 seed, so the same student always gets the
// same shuffle (stable across reloads before they submit, see
// buildFirstVoteOrder) while different students get different, unbiased
// orders.
function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32 — same PRNG as allocation-engine/src/rng.ts, reimplemented here
// rather than imported since it's not part of that package's public API.
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const rng = createRng(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Order shown to a first-time voter (no preferences submitted yet, see
// vote.tsx's baseOrder). Two steps:
//  1. Randomize so students don't gravitate toward the system's natural
//     module order. Seeded by studentId (not Math.random) so a reload before
//     submitting doesn't reshuffle the list out from under the student.
//  2. Pull whatever the single-student allocation-engine preview would
//     actually grant in that shuffled order to the top, so a student's
//     top-ranked choices are never mutually exclusive / rule-conflicting
//     with each other — they only need to look further down the list once
//     they start wanting alternates. Non-granted modules keep their
//     shuffled relative order after the granted block.
//
// Moving the granted block to the front without reordering *within* either
// block preserves the simulation's outcome: relative preference order among
// the granted modules is unchanged, and every non-granted module now sits
// even later than before, so a second simulation pass on the returned order
// would grant the exact same set (verified live anyway — see vote.tsx's
// predictedModuleIds, which recomputes for whatever order is on screen).
export function buildFirstVoteOrder<M extends SimulationModule>(
  studentId: string,
  modules: M[],
  rule: SimulationRule | null,
): M[] {
  const shuffled = seededShuffle(modules, hashSeed(studentId));
  if (!rule) return shuffled;

  const simulation = simulateOwnAllocation(
    studentId,
    shuffled.map((m) => m.id),
    modules,
    rule,
  );
  const grantedIds = new Set<string>(simulation.assignments.map((a) => a.moduleId));
  const granted = shuffled.filter((m) => grantedIds.has(m.id));
  const rest = shuffled.filter((m) => !grantedIds.has(m.id));
  return [...granted, ...rest];
}
