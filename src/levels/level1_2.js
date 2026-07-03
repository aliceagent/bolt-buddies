// 1-2 "The Crusher Line" (twist)
// Heavy walks safely under the crushers and holds the plate that opens the sky-route
// barrier; Grapple zips along the ceiling over the Scuttlebug swarm; a partner-reel
// sequence crosses the great chasm with Heavy anchored on the pillar.
export default {
  id: "1-2",
  name: "The Crusher Line",
  world: 1,
  skills: ["grapple", "heavy"],
  cols: 64,
  rows: 18,
  spawns: [[2, 13], [4, 13]],
  build(g) {
    g.rect(0, 0, 0, 13, "#"); // left wall
    g.rect(0, 14, 9, 17, "#"); // start floor
    g.rect(8, 12, 9, 12, "#"); // step ledge to reach the entry anchor
    g.rect(10, 8, 25, 9, "#"); // tunnel ceiling slab (sky route on top)
    g.rect(10, 14, 25, 17, "#"); // tunnel floor
    g.rect(19, 15, 20, 16, "."); // carve core pocket
    g.set(19, 16, "#"); // step out of the pocket
    g.set(19, 14, "%"); // cracked lid over the pocket
    g.set(20, 14, "%");
    g.rect(26, 14, 40, 17, "#"); // scuttlebug yard
    g.rect(41, 17, 51, 17, "#"); // chasm bottom
    for (let x = 41; x <= 51; x++) g.set(x, 16, "^"); // electric chasm floor
    g.rect(46, 11, 47, 17, "#"); // anchor pillar
    g.rect(52, 14, 63, 17, "#"); // right floor
    g.rect(55, 10, 57, 10, "#"); // core 3 ledge
    g.rect(63, 0, 63, 13, "#"); // right wall
  },
  entities: [
    { t: "pedestal", x: 3, y: 13, skill: "grapple" },
    { t: "pedestal", x: 6, y: 13, skill: "heavy" },
    { t: "door", id: "gate", x: 10, y: 10, h: 4, needs: { skills: true } },
    { t: "anchor", x: 9, y: 5 },
    { t: "crusher", x: 13, y: 10, offset: 0 },
    { t: "crusher", x: 17, y: 10, offset: 900 },
    { t: "crusher", x: 21, y: 10, offset: 1800 },
    { t: "plate", id: "plA", x: 15, y: 13, w: 2, threshold: 2 },
    { t: "door", id: "b1", x: 18, y: 5, h: 3, needs: { plates: ["plA"] } },
    { t: "core", x: 20, y: 16 },
    { t: "checkpoint", x: 27, y: 13 },
    { t: "bug", x: 29, y: 13, min: 27, max: 33 },
    { t: "bug", x: 33, y: 13, min: 31, max: 36 },
    { t: "bug", x: 36, y: 13, min: 34, max: 39 },
    { t: "bug", x: 31, y: 13, min: 28, max: 38 },
    { t: "anchor", x: 29, y: 7 },
    { t: "anchor", x: 34, y: 7 },
    { t: "anchor", x: 39, y: 7 },
    { t: "core", x: 34, y: 8 },
    { t: "anchor", x: 43, y: 8 },
    { t: "anchor", x: 46, y: 8 },
    { t: "anchor", x: 52, y: 8 },
    { t: "checkpoint", x: 54, y: 13 },
    { t: "lever", id: "lv2", x: 55, y: 13 },
    { t: "plate", id: "pl2", x: 57, y: 13, w: 2, threshold: 2 },
    { t: "door", id: "d2", x: 60, y: 11, h: 3, latch: true, needs: { levers: ["lv2"], plates: ["pl2"] } },
    { t: "core", x: 56, y: 9 },
    { t: "anchor", x: 56, y: 6 },
    { t: "exit", x: 62, y: 11, h: 3, needs: { opened: ["d2"] } },
  ],
  blips: {
    start: "SPARK: Ah, the Crusher Line! I flattened four hundred defective toasters here. It is my FAVORITE chamber.",
    skills: "SPARK: The crushers only respect HEAVY machinery. Everyone else gets... recycled. Heehee.",
    clear: "SPARK: IMPOSSIBLE. Those crushers were RECENTLY SERVICED!",
  },
};
