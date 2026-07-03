// 2-3 "The Warden's Maze" (master)
// Mirrored lanes: Tiny runs the slab top past rollers and vents while Phase
// works the tunnel below, ambushing Wall-Wardens through shimmer panels.
// Each lane's timed door is opened from the other lane (generous 6.5s windows).
// Finale: Phase ambushes the last Warden, then throws Tiny across the gap.
export default {
  id: "2-3",
  name: "The Warden's Maze",
  world: 2,
  skills: ["phase", "tiny"],
  cols: 64,
  rows: 18,
  spawns: [[2, 13], [4, 13]],
  build(g) {
    g.rect(0, 0, 0, 13, "#"); // left wall
    g.rect(0, 14, 51, 17, "#"); // ground up to the gap
    g.rect(9, 12, 9, 13, "#"); // stairs to the slab
    g.rect(10, 10, 10, 13, "#");
    g.rect(11, 9, 45, 10, "#"); // maze slab: Tiny on top, Phase in the tunnel
    // top lane vent pinches
    for (const x of [16, 30, 40]) {
      g.rect(x, 5, x, 7, "#");
      g.set(x, 8, "d");
    }
    // core 1: vent-gated pocket on the slab top
    g.rect(42, 5, 42, 7, "#");
    g.set(42, 8, "d");
    g.rect(44, 5, 44, 7, "#");
    g.set(44, 8, "d");
    // tunnel shimmer panels (each with a warden lurking just beyond)
    g.rect(20, 11, 20, 13, "~");
    g.rect(37, 11, 37, 13, "~");
    // core 2: double-shimmer pocket at the tunnel's end
    g.rect(43, 11, 43, 13, "~");
    g.rect(45, 11, 45, 13, "~");
    // finale: shimmer wall guarding the last warden's back, then the gap
    g.rect(49, 11, 49, 13, "~");
    g.rect(52, 17, 58, 17, "#"); // gap bottom
    for (let x = 52; x <= 58; x++) g.set(x, 16, "^");
    g.rect(59, 14, 63, 17, "#"); // far side
    g.rect(63, 0, 63, 13, "#"); // right wall
  },
  entities: [
    { t: "pedestal", x: 3, y: 13, skill: "phase" },
    { t: "pedestal", x: 6, y: 13, skill: "tiny" },
    { t: "door", id: "gate", x: 8, y: 11, h: 3, needs: { skills: true } },
    { t: "checkpoint", x: 7, y: 13 },
    // top lane
    { t: "roller", x: 22, y: 8, min: 18, max: 26, beam: 120 },
    { t: "door", id: "tDoorA", x: 26, y: 5, h: 4, timer: 6500, needs: { levers: ["lvB1"] } },
    { t: "lever", id: "lvA1", x: 32, y: 8 },
    { t: "roller", x: 36, y: 8, min: 33, max: 39, beam: 120 },
    // bottom lane
    { t: "warden", id: "w1", x: 21, y: 13, facing: 1 },
    { t: "lever", id: "lvB1", x: 24, y: 13 },
    { t: "door", id: "tDoorB", x: 34, y: 11, h: 3, timer: 6500, needs: { levers: ["lvA1"] } },
    { t: "warden", id: "w2", x: 38, y: 13, facing: 1 },
    { t: "core", x: 43, y: 7 },
    { t: "core", x: 44, y: 12 },
    { t: "checkpoint", x: 47, y: 13 },
    // finale
    { t: "warden", id: "w3", x: 50, y: 13, facing: 1 },
    { t: "core", x: 55, y: 12 }, // snag it mid-throw!
    { t: "lever", id: "lvF", x: 61, y: 13 },
    { t: "bridge", id: "br1", x: 52, y: 14, w: 7, needs: { levers: ["lvF"] } },
    { t: "exit", x: 62, y: 11, h: 3, needs: { opened: ["br1"] } },
  ],
  blips: {
    start: "KOBI: My Wall-Wardens guard this maze. They have ONE eye each and NO peripheral vision. It was a budget year.",
    skills: "KOBI: The doors are on TIMERS. Coordinate! Or better yet — don't, and stay here forever with me.",
    clear: "KOBI: You THREW your friend?! ...And they LIKED it?! Get out. GET OUT OF MY TUNNELS.",
  },
};
