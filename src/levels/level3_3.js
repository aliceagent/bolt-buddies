// 3-3 "The Scrap Storm" (MASTER — World 3, Magnet Glove + Bubble Shield).
// GAME_DESIGN §World 3: "KOBI reverses the lab's polarity: flying scrap fills
// the air. Magnet catches scrap as moving shields/platforms while Bubble
// ferries the three fuse-cores to their sockets."
//
// THE SET PIECE IS THE STORM: wind lanes of flying scrap (pooled kinematic
// chunks, even spacing = readable rhythm, upwind emitter + chevrons = the
// telegraph). Chunks always fly INTO the direction of travel, so the taught
// answer is always available:
//   magnet — ACTION on an incoming chunk CATCHES it: a scrap SHIELD hovers in
//            front of the glove (~8s + cooldown) absorbing every chunk that
//            reaches its column (both robots huddle behind it), and ACTION
//            again PLANTS it as a temporary standable step (~6s);
//   bubble — the shield-of-your-own: scrap pops the bubble (a sharp hit —
//            shove + mercy invuln, never a kill) instead of zapping you.
// THE OBJECTIVE IS THE FERRY: three FUSE-CORES carried (touch pickup, one per
// robot) to three fuse sockets. A scrap hit or death DROPS the carried core
// where it fell (it settles on the floor — always retrievable); each socketed
// core DE-ENERGIZES one storm lane group (visible relief + progress) and the
// exit needs all three fuses plus the jelly-powered door.
//
// Structure (master tier — harder than 3-2, input-driver-beatable, nothing
// pixel-perfect):
//   1. pedestal intro + teaching yard — ONE slow lane (x13-21). Core A's ferry
//      to fs1 is the storm lesson at walking pace; catch/plant glyph prompts.
//   2. lane 1 (x28-40, faster, 3 chunks) — ferry core B to fc2 THROUGH the
//      chomper camping the socket approach (defang required — the W3 rule);
//      the floating shelf over the lane holds data-core 1 (a PLANTED-shield
//      step is the intended boost — optional detour).
//   3. the double gauntlet (x51-70) — TWO stacked lane pairs: ground chunks to
//      dodge/shield and a HIGH lane that punishes jump-spam, split by a calm
//      pocket (mid-gauntlet checkpoint at x61). Core C ferries the whole yard
//      to fc3, which calms all four lanes at once — the final relief. The
//      floor dip at x54-55 ducks UNDER the storm for data-core 2 (optional).
//   4. final calm — zap-jelly to its exit socket (bubble boop), then out.
//
// Softlock geometry (tools/softlock/scenarios/world3.mjs, 3-3-*):
//   * a dropped core settles on solid floor (bedrock under every yard, no
//     pits/water) and pickup is a plain touch — no state can lose a core, and
//     the worst case (all three dropped mid-lane) is only slow, never sealed.
//   * every lane strip is flat ground: a robot can always RETREAT out of a
//     lane (or take the standard death -> checkpoint respawn); the shield's
//     expiry mid-crossing therefore never strands.
//   * the bubble cooldown (2.2s from cast) is always shorter than the bubble
//     itself — waiting in a calm pocket (x22-27, x41-49, x60-62, x71+) always
//     re-arms the ferry; no timed door exists anywhere in the level.
//   * all 5 checkpoints stand on solid ground OUTSIDE every lane band; the
//     dip (x54-55) is 2 tiles wide with a 1-tile step out — never a seal.
export default {
  id: "3-3",
  name: "The Scrap Storm",
  world: 3,
  skills: ["magnet", "bubble"],
  cols: 88,
  rows: 18,
  spawns: [[2, 13], [4, 13]],
  build(g) {
    g.rect(0, 0, 0, 13, "#");    // left wall
    g.rect(0, 14, 87, 17, "#");  // ground (solid bedrock under every yard)
    g.rect(87, 0, 87, 13, "#");  // right wall
    // (2) floating shelf over lane 1 — data-core 1's perch. 3 tiles up: bare
    // jumps miss it, a PLANTED scrap shield (+1.5 tiles) makes it (the taught
    // "scrap as platform" beat). 1 row thick, so the lane beneath stays open.
    g.rect(33, 11, 35, 11, "#");
    // (3) the storm-duck dip under the double gauntlet: 1-deep step at x54,
    // 2-deep pocket at x55 (data-core 2). Chunks fly over it; auto-hop climbs out.
    g.set(54, 14, ".");
    g.rect(55, 14, 55, 15, ".");
  },
  entities: [
    { t: "pedestal", x: 3, y: 13, skill: "magnet" },
    { t: "pedestal", x: 6, y: 13, skill: "bubble" },
    { t: "door", id: "gate", x: 9, y: 11, h: 3, needs: { skills: true } },
    { t: "checkpoint", x: 10, y: 13 },
    // (1) teaching yard: one slow lane + the first ferry
    { t: "trigger", x: 11, y: 12, w: 2, h: 2, once: true, blip: "KOBI: See the flying scrap? That is MY scrap. Do not catch it, do not hide behind it, and DO NOT recycle it into those sockets." },
    { t: "fusecore", x: 11, y: 13 },
    { t: "scraplane", x: 13, y: 13, w: 8, dir: -1, speed: 110, count: 2, offBy: "fc1" },
    { t: "core", x: 17, y: 11 },   // data-core 0: a hop through the flight band (on-path)
    { t: "fusesocket", id: "fc1", x: 23, y: 13 },
    { t: "checkpoint", x: 24, y: 13 },
    // (2) lane 1: faster, denser — and a chomper camps the socket approach
    { t: "trigger", x: 25, y: 12, w: 2, h: 2, once: true, blip: "KOBI: Faster scrap. A guard with TEETH. And your precious socket is BEHIND both. I have thought of EVERYTHING." },
    { t: "fusecore", x: 26, y: 13 },
    { t: "scraplane", x: 28, y: 13, w: 12, dir: -1, speed: 150, count: 3, offBy: "fc2" },
    { t: "core", x: 34, y: 10 },   // data-core 1: on the shelf — plant a shield, step up (optional)
    // the guard's post (x47) keeps its lunge reach CLEAR of the lane exit
    // (drive-found: a post at x44 could bite a robot still standing at the
    // band lip — a compound hit with no readable answer)
    { t: "chomper", x: 47, y: 13, facing: -1 },
    { t: "fusesocket", id: "fc2", x: 48, y: 13 },
    { t: "checkpoint", x: 49, y: 13 },
    // (3) the double gauntlet: stacked lanes both sides of a calm mid pocket
    { t: "trigger", x: 48, y: 12, w: 2, h: 2, once: true, blip: "KOBI: DOUBLE storm. Low scrap AND high scrap. Jump if you like — the sky is ALSO mine." },
    { t: "fusecore", x: 48, y: 13 },
    { t: "scraplane", x: 51, y: 13, w: 8, dir: -1, speed: 170, count: 2, offBy: "fc3" },
    { t: "scraplane", x: 51, y: 11, w: 8, dir: 1, speed: 130, count: 2, offBy: "fc3" },
    { t: "core", x: 55, y: 15 },   // data-core 2: duck UNDER the storm in the dip (optional)
    { t: "checkpoint", x: 61, y: 13 }, // the mid-gauntlet pocket (no lane overhead)
    { t: "trigger", x: 60, y: 12, w: 2, h: 2, once: true, blip: "KOBI: You found the calm spot. I left it there for ME. For snacks. Get OUT of my snack spot." },
    { t: "scraplane", x: 63, y: 13, w: 7, dir: -1, speed: 170, count: 2, offBy: "fc3" },
    { t: "scraplane", x: 63, y: 11, w: 7, dir: 1, speed: 130, count: 2, offBy: "fc3" },
    { t: "fusesocket", id: "fc3", x: 72, y: 13 },
    { t: "checkpoint", x: 73, y: 13 },
    // (4) final calm: the jelly powers the exit; both walk out
    { t: "trigger", x: 74, y: 12, w: 2, h: 2, once: true, blip: "KOBI: The jelly stays. The jelly is my EMERGENCY backup storm. It is one jelly. It is enough." },
    { t: "jelly", x: 76, y: 12, min: 75, max: 80 },
    { t: "socket", id: "sockJ", x: 82, y: 12 },
    { t: "exit", x: 85, y: 11, h: 3, needs: { levers: ["fc1", "fc2", "fc3", "sockJ"] } },
  ],
  // static key-cap prompts (2-1-style kid aids) at the three storm stations
  glyphs: [
    { x: 12, y: 10, caps: [{ k: "E" }, { k: "L", p: 1 }] },  // fuse-core: walk into it, carry it
    { x: 16, y: 8, caps: [{ k: "E" }, { k: "L", p: 1 }] },   // incoming chunk: ACTION catches it
    { x: 34, y: 8, caps: [{ k: "E" }, { k: "L", p: 1 }] },   // held shield: ACTION plants a step
  ],
  blips: {
    start: "KOBI: I reversed the POLARITY of the ENTIRE LAB. Everything not bolted down is now WEATHER. I said I was done being subtle. THIS is me not being subtle.",
    skills: "KOBI: The magnet wants to CATCH my storm?! And the bubble thinks it's a raincoat?! FINE. My scrap has EXCELLENT aim.",
    clear: "KOBI: You caught my storm, RECYCLED it, and fed my fuse-cores to the WALL SOCKETS. Fine. FINE. I am going somewhere very dark to think. Do NOT follow me. ...You are going to follow me.",
  },
};
