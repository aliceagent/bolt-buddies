// 2-1 "The Vents" (teach)
// Two lanes under/over a long slab: Tiny crawls the tunnel through vent pinches,
// Phase walks the slab top through shimmer panels. Each lane has a locked door
// that only the OTHER lane's lever opens — alternation is the lesson.
export default {
  id: "2-1",
  name: "The Vents",
  world: 2,
  skills: ["phase", "tiny"],
  cols: 60,
  rows: 18,
  spawns: [[2, 13], [4, 13]],
  build(g) {
    g.rect(0, 0, 0, 13, "#"); // left wall
    g.rect(0, 14, 59, 17, "#"); // ground
    g.rect(10, 12, 10, 13, "#"); // stairs to the slab top
    g.rect(11, 10, 11, 13, "#");
    g.rect(12, 8, 44, 9, "#"); // the long slab: tunnel below, walkway on top
    // tunnel vent pinches (Tiny only)
    for (const x of [15, 25, 35]) {
      g.rect(x, 10, x, 12, "#");
      g.set(x, 13, "d");
    }
    // slab-top shimmer panels (Phase only)
    for (const x of [15, 25, 35]) g.rect(x, 5, x, 7, "~");
    // core 2: a sealed shimmer box on the slab top
    g.rect(38, 4, 40, 4, "~");
    g.rect(38, 5, 38, 7, "~");
    g.rect(40, 5, 40, 7, "~");
    // core 1: vent-gated pocket at the tunnel's end
    g.rect(42, 10, 42, 12, "#");
    g.set(42, 13, "d");
    g.rect(44, 10, 44, 12, "#");
    g.set(44, 13, "d");
    // core 3 toss ledge in the merge zone
    g.rect(45, 10, 47, 10, "#");
    // roller yard shimmer pillars (shared shelter)
    g.rect(50, 11, 50, 13, "~");
    g.rect(54, 11, 54, 13, "~");
    g.rect(59, 0, 59, 13, "#"); // right wall
  },
  entities: [
    { t: "pedestal", x: 3, y: 13, skill: "phase" },
    { t: "pedestal", x: 6, y: 13, skill: "tiny" },
    { t: "door", id: "gate", x: 9, y: 11, h: 3, needs: { skills: true } },
    { t: "checkpoint", x: 8, y: 13 },
    // tunnel door opened from the slab top; slab door opened from the tunnel
    { t: "door", id: "dT1", x: 20, y: 10, h: 4, needs: { levers: ["lvP1"] } },
    { t: "lever", id: "lvP1", x: 18, y: 7 },
    { t: "door", id: "dP1", x: 30, y: 5, h: 3, needs: { levers: ["lvT1"] } },
    { t: "lever", id: "lvT1", x: 28, y: 13 },
    { t: "core", x: 43, y: 12 },
    { t: "core", x: 39, y: 7 },
    { t: "core", x: 46, y: 9 },
    { t: "checkpoint", x: 46, y: 13 },
    { t: "roller", x: 49, y: 13, min: 47, max: 52 },
    { t: "roller", x: 55, y: 13, min: 52, max: 57, beam: 120 },
    { t: "lever", id: "lvE", x: 54, y: 13 }, // tucked inside the second pillar
    { t: "exit", x: 57, y: 11, h: 3, needs: { levers: ["lvE"] } },
  ],
  blips: {
    start: "KOBI: The Maintenance Tunnels! I mopped them MYSELF. Do NOT touch my beautiful Patrol Rollers.",
    skills: "KOBI: One of you is now VERY small, and one walks through WALLS. I officially hate this wing.",
    clear: "KOBI: Fine. FINE! But the vents get SMALLER. Probably. I have not checked.",
  },
};
