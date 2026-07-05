// Beat-kit route/core merge (Beat Sprint T3).
//
// The 12-run DEFAULT matrix runs each route's `export default [...]` VERBATIM —
// this module is never touched there, so that path is provably unchanged.
//
// `--full` builds the 100%-core variant of a route by splicing the route's
// `export const coreSteps` into the base step list. Each coreSteps entry is a
// detour anchored to a base step by name:
//
//   export const coreSteps = [
//     { after: "@start",          steps: [ ...prepended detours... ] },
//     { after: "<base step name>", steps: [ ...detours run right after it... ] },
//   ];
//
// A detour is a normal { name, fn } step. It collects one or more data-cores
// input-only, then RETURNS the world to the state the next base step expects
// (same as any route step). `@start` prepends before the first base step.
//
// The runner additionally inserts a single "assert all 3 data-cores collected"
// step immediately before the route's final (exit/complete) step — so every
// core is proven collected before the level can be finished.

export function buildCoreRoute(baseSteps, coreSteps = []) {
  const byAfter = new Map();
  for (const cs of coreSteps) {
    const key = cs.after;
    if (!byAfter.has(key)) byAfter.set(key, []);
    byAfter.get(key).push(...cs.steps);
  }
  const out = [];
  if (byAfter.has("@start")) out.push(...byAfter.get("@start"));
  for (const step of baseSteps) {
    out.push(step);
    if (byAfter.has(step.name)) {
      out.push(...byAfter.get(step.name));
      byAfter.delete(step.name);
    }
  }
  // surface a typo in an `after:` anchor rather than silently dropping a detour
  const orphans = [...byAfter.keys()].filter((k) => k !== "@start");
  if (orphans.length) {
    throw new Error(`coreSteps anchored to unknown base step(s): ${orphans.join(", ")}`);
  }
  return out;
}

// The assertion step spliced in before the final route step in --full mode.
// `exclude` is a Set of core indices documented UNCOLLECTABLE-by-real-input for
// this level (see a route's `uncollectableCores` export + the T3 findings in
// TESTKIT_ROADMAP.md). Those indices are not required — they are open findings
// for design arbitration, not kit failures.
export function assertCoresStep(exclude = new Set()) {
  const required = [0, 1, 2].filter((i) => !exclude.has(i));
  return {
    name: exclude.size
      ? `assert data-cores ${required.join("+")} collected (${[...exclude].join(",")} = documented finding)`
      : "assert all 3 data-cores collected",
    fn: async (bb) => {
      await bb.waitFor(
        (s) => Array.isArray(s.coresGot) && required.every((i) => s.coresGot[i]),
        4000,
        `cores ${required.join("+")} collected`
      ).catch(async () => {
        const s = await bb.state();
        throw new Error(`required cores incomplete: coresGot=${JSON.stringify(s?.coresGot)} (required ${required.join("+")})`);
      });
      bb.log(`required data-cores collected (${required.join("+")})`);
    },
  };
}
