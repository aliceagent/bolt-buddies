// 4-1 "Lights Out" (teach — World 4, Time-Freeze + Light-Beam).
// GAME_DESIGN §World 4: "Beam reveals invisible platforms and scares Gloomies
// off switches; Freeze stops the rotating bridge so both can cross."
//
// The Dark Core's intro — pedestals early, ONE mechanic per station, W4 > W3
// (visibility + time as resources: beam battery, freeze cooldown) but every
// beat input-only-driver beatable (FL-005: no pixel-perfect demands):
//   1. equip yard    — TIME-FREEZE + LIGHT-BEAM pedestals -> skills gate.
//   2. the unlit crossing — a dark-zone pit spanned by three invisible/ghost
//                     platforms (+1/+1/-1 profile, 2-wide treads, 1-tile gaps —
//                     generous jumps; the darkness is the challenge, the beam
//                     the answer). Ghost plates are SOLID always, so a fall is
//                     only ever a mistimed jump -> standard pit death ->
//                     checkpoint respawn 4 tiles from the pit lip.
//   3. gloomy switch — a Gloomy SITS on plate pl1 and JAMS it; only the beam
//                     herds it off (a seated guard ignores mere glow — M4).
//                     Standing the freed plate opens gd1 (LATCHED, so the
//                     gloomy re-seating can never re-seal the door — see
//                     tools/softlock/scenarios/world4.mjs).
//   4. rotating bridge — spinning bar over a pit; TIME-FREEZE holds it flat
//                     (5s window, 45 deg/s = a flat pose every ~4s) and BOTH
//                     cross. Freeze is castable from either side, and the
//                     armed far checkpoint gives the deliberate-death reunite,
//                     so no separation can strand (softlock scenario 3).
//   5. the lonely corridor — one more dark zone with a ROAMING gloomy hovering
//                     ABOVE the path (home y10: the glow radius keeps it off a
//                     walking robot by construction — menace, not a wall), then
//                     a Ticker dash-lane doorstep (freeze = statue = safe) whose
//                     patrol can never reach the exit zone or a checkpoint.
// 3 cores, all ON the taught lanes (coreprobe: no detours, no FL-T3 trap):
// core 0 over the middle ghost platform, core 1 on the dark floor of the
// gloomy station (the glow reveals it), core 2 on the corridor floor past the
// bridge. 4 checkpoints, every one on solid ground (respawn-strand audited).
export default {
  id: "4-1",
  name: "Lights Out",
  world: 4,
  skills: ["freeze", "beam"],
  cols: 76,
  rows: 18,
  spawns: [[2, 13], [4, 13]],
  build(g) {
    g.rect(0, 0, 0, 13, "#"); // left wall
    g.rect(0, 14, 75, 17, "#"); // ground
    g.rect(75, 0, 75, 13, "#"); // right wall
    // (2) the unlit crossing: a 9-tile pit under the ghost-platform run.
    // SPARK FLOOR at the bottom (the shipped-level pit convention, e.g. 1-2's
    // electric chasm): a floor-less carve is NOT a death — a fallen body RESTS
    // on the physics world bounds (drive-found: a robot survived at ty 17.5,
    // grounded, alive — a 4-tile shaft with no exit, the audit's textbook hard
    // softlock). The hazard row turns any fall into the standard checkpoint
    // respawn instead.
    g.rect(16, 14, 24, 16, ".");
    for (let x = 16; x <= 24; x++) g.set(x, 17, "^");
    // (3) the gloomy's PODIUM: plate pl1 sits on a 1-tile stub so the blob's
    // hover/return line is ~2 tiles ABOVE the floor walk line (drive-found:
    // with the post on the floor, a robot walking the corridor at full speed
    // RUNS DOWN the fleeing/at-bay blob — its 58px/s glow-shy flee can't beat
    // a 240px/s walk, and the level turns into a timing dance. Elevated, the
    // contact box (|dy|<28) can never meet a floor walker; the plate is still
    // a plain auto-hop press. Same drive-found class as L31's stub-LOS notes.)
    g.set(36, 13, "#");
    // (4) the rotating-bridge pit (same span profile as the M4-proven dev-w4
    // bridge: bar tip meets the far lip exactly, 1-tile ground overlap west)
    // with the same spark floor as the ghost pit (falls die, never strand).
    g.rect(46, 14, 49, 16, ".");
    for (let x = 46; x <= 49; x++) g.set(x, 17, "^");
  },
  entities: [
    { t: "pedestal", x: 3, y: 13, skill: "freeze" },
    { t: "pedestal", x: 6, y: 13, skill: "beam" },
    { t: "door", id: "gate", x: 9, y: 11, h: 3, needs: { skills: true } },
    { t: "checkpoint", x: 11, y: 13 },
    // (2) the unlit crossing — dark zone over the pit; the beam reveals the run
    { t: "trigger", x: 12, y: 12, w: 2, h: 2, once: true, blip: "KOBI: I removed the floor somewhere in there. The dark remembers where. I do NOT." },
    { t: "dark", x: 14, y: 5, w: 14, h: 9 },
    { t: "ghost", x: 17, y: 13, w: 2 },
    { t: "ghost", x: 20, y: 12, w: 2 },
    { t: "core", x: 20, y: 11 },   // core 0: over the middle ghost platform
    { t: "ghost", x: 23, y: 13, w: 2 },
    { t: "checkpoint", x: 28, y: 13 },
    // (3) the gloomy switch — the shadow blob jams pl1 until the beam herds it
    { t: "trigger", x: 28, y: 12, w: 2, h: 2, once: true, blip: "KOBI: That blob on the switch is my EMPLOYEE OF THE MONTH. He sits SO well. Do not shine anything at him." },
    { t: "dark", x: 30, y: 5, w: 12, h: 9 },
    { t: "core", x: 32, y: 13 },   // core 1: on the dark floor (the glow finds it)
    { t: "plate", id: "pl1", x: 36, y: 12, threshold: 1 },
    { t: "gloomy", x: 36, y: 12 },
    { t: "door", id: "gd1", x: 40, y: 11, h: 3, latch: true, needs: { plates: ["pl1"] } },
    { t: "checkpoint", x: 43, y: 13 },
    // (4) the rotating bridge — freeze it flat, both cross
    { t: "trigger", x: 43, y: 12, w: 2, h: 2, once: true, blip: "KOBI: My bridge spins because standing still is for LOSERS. You cannot stop time. ...Can you? WAIT." },
    { t: "rotbridge", x: 47, y: 13, len: 5, speed: 45 },
    { t: "checkpoint", x: 52, y: 13 },
    // (5) the lonely corridor — roaming gloomy ABOVE the path + ticker doorstep
    { t: "trigger", x: 53, y: 12, w: 2, h: 2, once: true, blip: "KOBI: It is dark because I LIKE it dark. The dark does not leave. It is me and the dark in here and we are FINE." },
    { t: "dark", x: 54, y: 5, w: 11, h: 9 },
    { t: "core", x: 57, y: 13 },   // core 2: on the corridor floor
    { t: "gloomy", x: 60, y: 10 }, // roaming menace (hovers over the path; glow-shy)
    { t: "trigger", x: 63, y: 12, w: 2, h: 2, once: true, blip: "KOBI: The Ticker only bites when time is moving. Time is ALWAYS moving. I checked twice." },
    { t: "ticker", x: 67, y: 13, min: 65, max: 70, facing: 1 },
    { t: "exit", x: 73, y: 11, h: 3, needs: { skills: true } },
  ],
  // static key-cap prompts at the teach stations (2-1-style kid aids)
  glyphs: [
    { x: 14, y: 10, caps: [{ k: "E" }, { k: "L", p: 1 }] }, // dark lip: HOLD to shine
    { x: 33, y: 10, caps: [{ k: "E" }, { k: "L", p: 1 }] }, // gloomy: the beam herds
    { x: 44, y: 10, caps: [{ k: "E" }, { k: "L", p: 1 }] }, // bridge: freeze it flat
  ],
  blips: {
    start: "KOBI: Welcome to the DARK CORE. It is dark because I LIKE it dark. The dark does not leave. Neither do visitors. LEAVE.",
    skills: "KOBI: A flashlight and a pause button. Wonderful. Time and darkness are my TWO best walls and you brought exactly two things.",
    clear: "KOBI: You lit up my dark and FROZE my beautiful spinny bridge. FINE. The next garden is grown entirely from LASERS.",
  },
};
