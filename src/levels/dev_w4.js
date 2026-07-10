// W3W4 M4 — the World-4 MECHANICS SANDBOX (dev-only; NOT in the LEVELS registry).
//
// Loadable ONLY via `?devlevel=w4` (see src/main.js + GameScene.init) so normal
// play, the registry and the hub are untouched. One long strip that exercises
// EVERY M4 mechanic end-to-end, left to right:
//   1. pedestals    — TIME-FREEZE + LIGHT-BEAM equip
//   2. freeze yard  — crusher + weighted lift + laser sweeper + ticker in one
//                     screen: ONE freeze holds them all (crusher phase, lift
//                     mid-travel = stepping stone, laser angle, ticker statue);
//                     byte-identical resume is the probe's drift proof
//   3. ticker key   — the key sits inside the ticker's dash lane (freeze-assisted)
//   4. ice door     — beam melts it (progress fill, stays melted)
//   5. dark zone A  — near-black; robots' glow radius + the beam cone reveal;
//                     a GLOOMY jams the plate (herd it off with the beam) ->
//                     gdoor; a ghost-platform stair up to a core
//   6. rot bridge   — spinning platform over a pit, crossable under freeze
//   7. dark zone B  — long black corridor (glow-radius traversal + a hidden core)
//   8. exit door    — needs the ticker key; both robots through
//
// `dev: true` keeps finishLevel from ever touching the save / ux records.

export default {
  id: "dev-w4",
  name: "W4 Mechanics Sandbox",
  world: 4,
  dev: true,
  skills: ["freeze", "beam"],
  cols: 90,
  rows: 18,
  spawns: [[2, 13], [4, 13]],
  build(g) {
    g.rect(0, 0, 0, 13, "#"); // left wall
    g.rect(0, 14, 89, 17, "#"); // ground
    g.rect(89, 0, 89, 13, "#"); // right wall
    // (2) freeze yard: crusher frame + lift-top ledge + laser pillar
    g.rect(13, 9, 15, 9, "#");  // crusher mount beam
    g.rect(19, 9, 22, 9, "#");  // the ledge the frozen/ridden lift serves
    g.set(26, 12, "#");         // laser pillar
    // (4) ice-door frame stub (door body is the ent)
    // (5) dark zone A interior — ghost stair only (platform ents)
    // (6) rot-bridge pit: carve the ground
    g.rect(59, 14, 62, 17, ".");
  },
  entities: [
    { t: "pedestal", x: 3, y: 13, skill: "freeze" },
    { t: "pedestal", x: 6, y: 13, skill: "beam" },
    { t: "door", id: "gate", x: 9, y: 11, h: 3, needs: { skills: true } },
    { t: "checkpoint", x: 11, y: 13 },
    // (2) the freeze yard — all four device families in one screen
    { t: "crusher", x: 14, y: 10 },
    { t: "lift", x: 17, y: 13, w: 2, toY: 9, threshold: 1 },
    { t: "core", x: 21, y: 8 },
    { t: "laser", x: 26, y: 11, len: 4, mode: "sweep", min: 15, max: 165, speed: 40 },
    // (3) ticker guards the key in its dash lane
    { t: "ticker", x: 31, y: 13, min: 29, max: 35, facing: 1 },
    { t: "key", x: 33, y: 13 },
    { t: "checkpoint", x: 37, y: 13 },
    // (4) ice door across the corridor
    { t: "icedoor", id: "ice1", x: 39, y: 11, h: 3 },
    // (5) dark zone A: gloomy-jammed plate -> gdoor; ghost stair -> core
    { t: "dark", x: 41, y: 5, w: 16, h: 9 },
    { t: "ghost", x: 43, y: 12, w: 2 },
    { t: "ghost", x: 45, y: 10, w: 3 },
    { t: "core", x: 46, y: 9 },
    { t: "plate", id: "pl1", x: 50, y: 13, threshold: 1 },
    { t: "gloomy", x: 50, y: 13 },
    { t: "door", id: "gdoor", x: 54, y: 11, h: 3, latch: true, needs: { plates: ["pl1"] } },
    { t: "checkpoint", x: 57, y: 13 },
    // (6) the rotating bridge over the pit — cross it FROZEN FLAT
    { t: "rotbridge", x: 60, y: 13, len: 5, speed: 45 },
    { t: "checkpoint", x: 64, y: 13 },
    // (7) dark zone B: a long black corridor (glow-radius traversal)
    { t: "dark", x: 66, y: 5, w: 14, h: 9 },
    { t: "core", x: 73, y: 13 },
    { t: "gloomy", x: 76, y: 12 },
    // (8) exit: the ticker key unlocks it; both robots through
    { t: "exit", x: 86, y: 11, h: 3, needs: { keys: 1 } },
  ],
  blips: {
    start: "KOBI: Who turned off the LIGHTS?! ...I did. I turned off the lights. It is ATMOSPHERIC.",
    skills: "KOBI: One of you can stop TIME and one of you has a FLASHLIGHT. That is NOT balanced and I am NOT scared.",
    clear: "KOBI: Fine. The dark works. The freeze works. NOBODY tell the Dark Core I said 'works'.",
  },
};
