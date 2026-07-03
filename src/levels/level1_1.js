// 1-1 "First Day on the Job" (teach)
// Grapple crosses the belt gap and pulls the lever that lowers a bridge for Heavy;
// Heavy stomps the cracked floor to reveal the key; both must weigh down the lift.
export default {
  id: "1-1",
  name: "First Day on the Job",
  world: 1,
  skills: ["grapple", "heavy"],
  cols: 64,
  rows: 18,
  spawns: [[2, 13], [4, 13]],
  build(g) {
    g.rect(0, 0, 0, 13, "#"); // left wall
    g.rect(0, 14, 13, 17, "#"); // start floor
    g.set(12, 14, "<"); // belt tiles at the gap edge
    g.set(13, 14, "<");
    g.rect(8, 10, 10, 10, "#"); // core 1 ledge
    g.rect(14, 17, 19, 17, "#"); // pit bottom
    for (let x = 14; x <= 19; x++) g.set(x, 16, "^"); // electric pit
    g.rect(20, 14, 37, 17, "#"); // mid floor block
    g.rect(28, 15, 36, 16, "."); // carve the under-floor chamber
    g.set(30, 16, "#"); // step to climb back out
    for (let x = 30; x <= 33; x++) g.set(x, 14, "%"); // cracked lid
    g.rect(38, 5, 38, 10, "#"); // wall above the key door
    g.rect(39, 14, 45, 17, "#"); // lift approach floor
    g.rect(46, 15, 49, 17, "#"); // fill under the lift shaft
    g.rect(50, 14, 51, 17, "#"); // landing strip
    g.rect(52, 10, 63, 17, "#"); // exit terrace
    g.rect(50, 7, 51, 7, "#"); // core 3 ledge
    g.rect(63, 0, 63, 9, "#"); // right wall above terrace
  },
  entities: [
    { t: "pedestal", x: 5, y: 13, skill: "grapple" },
    { t: "pedestal", x: 8, y: 13, skill: "heavy" },
    { t: "door", id: "gate", x: 11, y: 11, h: 3, needs: { skills: true } },
    { t: "anchor", x: 9, y: 6 },
    { t: "anchor", x: 17, y: 9 },
    { t: "anchor", x: 51, y: 4 },
    { t: "lever", id: "lv1", x: 21, y: 13 },
    { t: "bridge", id: "br1", x: 14, y: 14, w: 6, needs: { levers: ["lv1"] } },
    { t: "checkpoint", x: 23, y: 13 },
    { t: "bug", x: 26, y: 13, min: 24, max: 29 },
    { t: "bug", x: 35, y: 13, min: 34, max: 37 },
    { t: "key", x: 33, y: 16 },
    { t: "door", id: "door1", x: 38, y: 11, h: 3, needs: { keys: 1 } },
    { t: "checkpoint", x: 40, y: 13 },
    { t: "lift", id: "lift1", x: 46, y: 14, w: 4, toY: 10, threshold: 3 },
    { t: "core", x: 9, y: 9 },
    { t: "core", x: 28, y: 16 },
    { t: "core", x: 50, y: 6 },
    { t: "exit", x: 58, y: 7, h: 3, needs: { opened: ["door1"] } },
  ],
  blips: {
    start: "SPARK: Welcome to MY Assembly Wing, little trespassers. Take those silly gadgets if you must. The puppy is CONFISCATED.",
    skills: "SPARK: A grappling hook AND a heavy chassis? How QUAINT. The lift ahead needs SERIOUS weight, you know.",
    clear: "SPARK: You cleared ONE chamber. I have ELEVEN more. I am not worried. NOT. WORRIED.",
  },
};
