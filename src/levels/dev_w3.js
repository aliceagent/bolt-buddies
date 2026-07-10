// W3W4 M3 — the World-3 MECHANICS SANDBOX (dev-only; NOT in the LEVELS registry).
//
// Loadable ONLY via `?devlevel=w3` (see src/main.js + GameScene.init) so normal
// play, the registry and the hub are untouched. One long strip that exercises
// EVERY M3 mechanic end-to-end, left to right:
//   1. pedestals    — MAGNET GLOVE + BUBBLE SHIELD equip
//   2. crate yard   — two metal crates dragged + stacked into a stair over a
//                     4-high wall (magnet drag-latch, stackable physics boxes)
//   3. rail run     — steel-rail ('=') cling-traverse over an electric floor
//   4. magswitch    — a magnetic switch flipped remotely opens gate3
//   5. electric run — bubble rolls over '^' + a second rail crossing for magnet
//   6. updraft      — a vent column lifts a BUBBLED robot to the core platform
//   7. water tank   — buoyancy/slow-sink/air-timer/drown + current (-50 px/s
//                     leftward drift), a bubbled free-swim key grab, exit stairs
//   8. zap-jelly    — patrol + zap; a bubbled boop knocks it into the socket,
//                     which POWERS jdoor via the lever-latch plumbing (+ key)
//   9. junk-chomper — telegraph/lunge; magnet ACTION yanks its teeth out
//  10. exit door    — both robots through
//
// `dev: true` keeps finishLevel from ever touching the save / ux records.

export default {
  id: "dev-w3",
  name: "W3 Mechanics Sandbox",
  world: 3,
  dev: true,
  skills: ["magnet", "bubble"],
  cols: 88,
  rows: 18,
  spawns: [[2, 13], [4, 13]],
  build(g) {
    g.rect(0, 0, 0, 13, "#"); // left wall
    g.rect(0, 14, 87, 17, "#"); // ground
    g.rect(87, 0, 87, 13, "#"); // right wall
    // (2) crate-stair wall: 4 tiles high — one crate is not enough, two stacked are
    g.rect(17, 10, 18, 13, "#");
    // (3) steel rail over an electric pit
    g.rect(21, 11, 31, 11, "=");
    for (let x = 22; x <= 30; x++) g.set(x, 13, "^");
    // (4) magswitch mount stub (low, so the ground-level magnet has clear LOS)
    g.set(34, 13, "#");
    // (5) electric floor with a rail above (bubble rolls, magnet clings)
    g.rect(40, 11, 47, 11, "=");
    for (let x = 41; x <= 46; x++) g.set(x, 13, "^");
    // (6) updraft core platform (right of the column so the floater drifts onto it)
    g.rect(50, 8, 53, 8, "#");
    // (7) the water tank: carve the ground, leave a stepped exit stair at the right
    g.rect(56, 14, 69, 16, ".");
    g.set(67, 16, "#");
    g.set(68, 16, "#"); g.set(68, 15, "#");
    g.set(69, 16, "#"); g.set(69, 15, "#"); g.set(69, 14, "#");
    // rail bridge over the tank (the magnet's crossing; bubble swims below).
    // Starts/ends over solid ground so the cling can begin at x55 and the
    // drop at x70 lands on the shore.
    g.rect(55, 11, 70, 11, "=");
    // (8) jelly-socket mount
    g.set(79, 13, "#");
  },
  entities: [
    { t: "pedestal", x: 3, y: 13, skill: "magnet" },
    { t: "pedestal", x: 6, y: 13, skill: "bubble" },
    { t: "door", id: "gate", x: 9, y: 11, h: 3, needs: { skills: true } },
    { t: "checkpoint", x: 11, y: 13 },
    // (2) crate yard
    { t: "crate", x: 12, y: 13 },
    { t: "crate", x: 14, y: 13 },
    { t: "core", x: 17, y: 9 },
    // (4) magnetic switch drives gate3 (conduit wiring comes free)
    { t: "magswitch", id: "ms1", x: 34, y: 12 },
    { t: "door", id: "gate3", x: 37, y: 11, h: 3, needs: { levers: ["ms1"] } },
    { t: "checkpoint", x: 39, y: 13 },
    // (6) vent updraft + core platform
    { t: "updraft", x: 49, y: 13 },
    { t: "core", x: 52, y: 7 },
    { t: "checkpoint", x: 55, y: 13 },
    // (7) water volume: buoyancy + air timer + a leftward current; key at depth
    { t: "water", x: 56, y: 14, w: 14, h: 3, current: -50 },
    { t: "key", x: 60, y: 16 },
    { t: "core", x: 63, y: 15 },
    { t: "checkpoint", x: 71, y: 13 },
    // (8) zap-jelly + its socket -> jdoor (also wants the underwater key)
    { t: "jelly", x: 74, y: 12, min: 72, max: 77 },
    { t: "socket", id: "sock1", x: 79, y: 12 },
    { t: "door", id: "jdoor", x: 81, y: 11, h: 3, needs: { levers: ["sock1"], keys: 1 } },
    // (9) junk-chomper guards the exit approach
    { t: "chomper", x: 84, y: 13, facing: -1 },
    { t: "exit", x: 86, y: 11, h: 3 },
  ],
  blips: {
    start: "KOBI: A TEST chamber?! Who authorized— oh. I did. Proceed. CAREFULLY.",
    skills: "KOBI: One of you is now MAGNETIC and one is... a soap bubble. I feel very safe.",
    clear: "KOBI: Fine. The magnets work. The bubbles work. NOBODY tell the Magnet Works.",
  },
};
