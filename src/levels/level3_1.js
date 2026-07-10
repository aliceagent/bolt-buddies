// 3-1 "Attract Mode" (teach — World 3, Magnet Glove + Bubble Shield).
// GAME_DESIGN §World 3: "Magnet drags crates into stair-steps and clings across
// a steel ceiling; Bubble floats over the electric floor to press the far
// switch that de-electrifies it."
//
// Structure (pedestal intro -> skill stations -> co-op interleave -> exit), at
// W3 difficulty (> any W2 level: both gadgets every zone, enemy defang required):
//   1. crate yard   — a Junk-Chomper patrols the yard; the magnet yanks its
//                     teeth, then drags the two metal crates into a stair over
//                     the 4-high plate wall (an updraft beside the wall is the
//                     bubble lane / the no-crates recovery: a bubbled robot —
//                     self- or BUDDY-bubbled — floats the wall. Return steps on
//                     the far face keep the wall two-way, so no crate state can
//                     ever seal the team — see tools/softlock/scenarios/world3).
//   2. electric run — steel rail ('=') over a 9-tile electric floor: the magnet
//                     cling-traverses the ceiling while the bubble rolls the
//                     floor current. Both lanes re-crossable (reunite-safe).
//   3. the far switch — the bubbled robot rides the vent updraft to the high
//                     coil deck and pulls the power switch ("de-electrifies"
//                     the wing); the magnet flips the magswitch from the floor.
//                     BOTH drive gate g2 — the co-op interleave.
//   4. jelly socket — a Zap-Jelly patrols the exit yard; the bubbled robot
//                     boops it into the power socket, which powers the EXIT
//                     door. A second chomper camps the doorstep (defang #2).
// Checkpoints all on solid ground; global-checkpoint reunite semantics apply.
export default {
  id: "3-1",
  name: "Attract Mode",
  world: 3,
  skills: ["magnet", "bubble"],
  cols: 64,
  rows: 18,
  spawns: [[2, 13], [4, 13]],
  build(g) {
    g.rect(0, 0, 0, 13, "#"); // left wall
    g.rect(0, 14, 63, 17, "#"); // ground
    g.rect(63, 0, 63, 13, "#"); // right wall
    // (1) crate-stair plate wall: 4 tiles high — one crate is not enough, two
    // stacked are (the M3-proven lesson geometry). Far face gets return steps
    // so the wall is climbable BACK from the east side (softlock rule: the
    // stair consumables must never be the only way to reunite).
    g.rect(20, 10, 21, 13, "#");
    g.rect(22, 12, 22, 13, "#"); // far-side return steps
    g.set(23, 13, "#");
    // (2) steel ceiling rail over the electric floor (magnet lane above,
    // bubble-roll lane below). Rail starts/ends over clean ground.
    g.rect(25, 11, 35, 11, "=");
    for (let x = 26; x <= 34; x++) g.set(x, 13, "^");
    // (3) the high coil deck above the vent updraft. NOTE: the magswitch is
    // FLOOR-STANDING (no mount stub) — a stub tile under the coil corner-clips
    // the magnet's LOS ray from natural standing spots (drive-found), turning
    // the remote flip pixel-perfect. Ground level keeps the ray clean floor-wide.
    g.rect(39, 8, 41, 8, "#");
    // (4) the jelly socket hangs bracket-mounted at row 12 (NO floor stub: a
    // stub tile under it blocks the magnet's floor-level teeth-yank LOS to a
    // chomper east of the socket — same drive-found corner-clip class as the
    // magswitch mount; capture/parking are proximity-based and need no tile).
  },
  entities: [
    { t: "pedestal", x: 3, y: 13, skill: "magnet" },
    { t: "pedestal", x: 6, y: 13, skill: "bubble" },
    { t: "door", id: "gate", x: 9, y: 11, h: 3, needs: { skills: true } },
    { t: "checkpoint", x: 10, y: 13 },
    // (1) crate yard under a chomper patrol
    { t: "trigger", x: 11, y: 12, w: 3, h: 2, once: true, blip: "KOBI: Those crates are arranged PERFECTLY. Do not stack them into stairs. Do NOT." },
    { t: "crate", x: 12, y: 13 },
    { t: "crate", x: 14, y: 13 },
    { t: "chomper", x: 16, y: 13, facing: -1 },
    { t: "updraft", x: 18, y: 13 }, // the bubble lane over the plate wall
    { t: "core", x: 20, y: 9 },     // core 0: over the wall top
    { t: "checkpoint", x: 24, y: 13 },
    // (2) electric run: rail cling above, bubble roll below
    { t: "trigger", x: 24, y: 12, w: 2, h: 2, once: true, blip: "KOBI: The floor current is set to 'tingle'. The ceiling is genuine STEEL. I test-licked it myself." },
    { t: "core", x: 30, y: 12 },    // core 1: mid-rail, under the cling line
    // (3) the far switch: magswitch (magnet, from the floor) + high power
    // lever (bubble, via the updraft) BOTH feed gate g2 — the interleave
    { t: "magswitch", id: "msA", x: 37, y: 13 },
    { t: "updraft", x: 38, y: 13 },
    { t: "core", x: 39, y: 7 },     // core 2: on the coil deck
    { t: "lever", id: "lvA", x: 40, y: 7 },
    { t: "door", id: "g2", x: 43, y: 11, h: 3, needs: { levers: ["msA", "lvA"] } },
    { t: "checkpoint", x: 45, y: 13 },
    // (4) zap-jelly socket puzzle gates the exit; chomper #2 camps the doorstep
    { t: "trigger", x: 46, y: 12, w: 2, h: 2, once: true, blip: "KOBI: That jelly is my EMPLOYEE. Do not bounce it into the power socket it very obviously fits." },
    { t: "jelly", x: 50, y: 12, min: 48, max: 53 },
    { t: "socket", id: "sock1", x: 55, y: 12 },
    { t: "chomper", x: 59, y: 13, facing: -1 },
    { t: "exit", x: 61, y: 11, h: 3, needs: { levers: ["sock1"] } },
  ],
  // static key-cap prompts at the three teach stations (2-1-style kid aids)
  glyphs: [
    { x: 13, y: 10, caps: [{ k: "E" }, { k: "L", p: 1 }] },  // crates: ACTION latches
    { x: 25, y: 9, caps: [{ k: "E" }, { k: "L", p: 1 }] },   // rail: ACTION clings
    { x: 38, y: 10, caps: [{ k: "E" }, { k: "L", p: 1 }] },  // vent: ACTION bubbles up
  ],
  blips: {
    start: "KOBI: The MAGNET WORKS. I BUILT this maze. I am VERY proud of it. The floor is electric because I am VERY proud of that too.",
    skills: "KOBI: Oh good. A fridge magnet and a soap bubble. My beautiful machines are DEFINITELY safe now.",
    clear: "KOBI: You de-electrified MY floor and made friends with MY jelly. FINE. The next room is full of water. I hope you rust.",
  },
};
