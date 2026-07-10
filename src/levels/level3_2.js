// 3-2 "The Flooded Tank" (twist — World 3, Magnet Glove + Bubble Shield).
// GAME_DESIGN §World 3: "Bubble travels underwater carrying the key; Magnet
// redirects the current by moving metal baffles from above; partner-reel
// across the great tank."
//
// THE TWIST IS THE ASYMMETRY: one robot is IN the tank, the other works ABOVE
// it. The whole middle of the level is a two-lane relay:
//   swimmer lane  — the BUBBLED robot free-swims the flooded tank (the bubble
//                   is the dive suit: un-bubbled robots slow-sink and drown on
//                   the 6s air timer), carrying the KEY through baffled,
//                   current-pushed sections;
//   deck lane     — the MAGNET robot walks the tank's top deck, flipping the
//                   magnetic baffle switches that open the swimmer's next
//                   section, crossing its own electrified run on a steel rail,
//                   defanging the "lifeguard" chomper, and finally winching
//                   the swimmer up the ascent (DOWN+ACTION partner-reel).
//
// Structure (harder than 3-1 — twist tier):
//   1. teaching pool — a 2-deep wading pool right after the pedestals: the air
//      ring, splash and swim-kick are FELT with zero stakes (steps both sides).
//   2. the great tank — cols 24-66, water rows 9-16 under a top deck (row 7).
//      Three sections split by METAL BAFFLES (sluice doors sealed deck-to-
//      floor) with section currents: A +45 (carries you in), B -60 (KOBI's
//      pumps fight you — the key dive), C +45. Baffle 1 latches open off
//      magswitch ms1; baffle 2 is TIMED (7s, ms2 pops back out and is
//      re-flippable) — the relay squeeze. The deck robot cannot do the water
//      half (the buddy-bubble can't reach the tank floor) and the swimmer
//      cannot do the deck half (magswitches are magnet-only) — true asymmetry.
//   3. jelly + lock — a Zap-Jelly patrols section C; the bubbled swimmer boops
//      it into the underwater socket (sock1), which powers the tank-bottom
//      LOCK; the carried key turns it (needs keys:1 + sock1) and the swimmer
//      surfaces in the drained escape chamber.
//   4. the winch ascent — the chamber's east wall is a sheer 4-tile rise (a
//      real reel dependency: unjumpable bare, no crates/updrafts, bubble-
//      bounce tops out ~2 tiles). The deck robot defangs the chomper guarding
//      the LAST switch (msD), flips it, drops onto the winch ledge and reels
//      the swimmer up (DOWN+ACTION from the grounded lip — FL-005 head-line
//      geometry, same shape as 1-3's tower rungs). Exit needs msD + the
//      opened lock, so neither lane can be skipped.
//
// Softlock geometry (see tools/softlock/scenarios/world3.mjs, 3-2-*):
//   * the key is a TEAM counter (keysHeld) — a drowned carrier keeps it; the
//     lock's keysGiven latches, so no water state can lose the key.
//   * both baffles are re-openable (ms1 latches; timed ms2 pops back out and
//     re-flips), and every water lane re-crosses — no one-way pockets.
//   * un-bubbled robots in the tank drown-respawn at the shared checkpoint
//     (all 4 checkpoints are on solid ground: 2 on the approach, 2 on the
//     deck — a mid-tank death respawns BOTH robots somewhere safe).
//   * the escape chamber (enterable early only by hopping down off the winch
//     ledge) keeps a 2-tile DRAIN SUMP (72-73,16): a stranded robot wades in
//     and drown-respawns — the pit can never hard-seal anyone.
export default {
  id: "3-2",
  name: "The Flooded Tank",
  world: 3,
  skills: ["magnet", "bubble"],
  cols: 82,
  rows: 18,
  spawns: [[2, 13], [4, 13]],
  build(g) {
    g.rect(0, 0, 0, 13, "#");    // left wall
    g.rect(0, 17, 81, 17, "#");  // bedrock
    g.rect(81, 0, 81, 16, "#");  // right wall
    // approach ground + the 2-deep teaching pool (steps BOTH sides — two-way)
    g.rect(0, 14, 23, 16, "#");
    g.rect(12, 14, 15, 15, ".");
    g.set(12, 15, "#"); // west step out
    g.set(15, 15, "#"); // east step out
    // stairs up to the tank deck (2-rise blocks, solid to the ground — no
    // walkable tunnel beneath) + the tank's west wall as the last step
    g.rect(19, 12, 20, 13, "#");
    g.rect(21, 10, 22, 13, "#");
    g.rect(23, 8, 23, 16, "#");
    // the top deck over the great tank + the escape chamber. Two 2-wide dive
    // gaps: G1 (27-28, the dive-in) and G2 (43-44, the mid-tank relay hole).
    g.rect(24, 7, 26, 7, "#");
    g.rect(29, 7, 42, 7, "#");
    g.rect(45, 7, 73, 7, "#");
    // the great tank interior (cols 24-66, rows 8-16) stays carved by default;
    // core-pocket ridges on the tank floor (the optional deep-dip detour)
    g.rect(32, 15, 32, 16, "#");
    g.rect(35, 15, 35, 16, "#");
    // steel rails: the optional core spur (over plain deck) and the REQUIRED
    // cling crossing over the electrified deck run
    g.rect(30, 4, 35, 4, "=");
    g.rect(47, 4, 54, 4, "=");
    // electrified deck strip (49-51): a 2-tile clean margin at BOTH rail ends —
    // drive-found: a 48-52 strip put the col-47 mount stance 6px from the kill
    // zone (walk-up overshoot zapped the magnet — pixel-perfect, not kid-fair)
    for (let x = 49; x <= 51; x++) g.set(x, 6, "^");
    // tank east wall (solid above the lock hole rows 14-16)
    g.rect(67, 8, 67, 13, "#");
    // escape chamber floor + the 2-tile drain sump (the pit's escape valve —
    // drive-found: a 1-tile sump can be STRADDLED by the 30px body, which
    // never registers as submerged; 2 tiles cannot be stood across)
    g.rect(68, 16, 73, 16, "#");
    g.rect(72, 16, 73, 16, ".");
    // the winch ledge (sheer 4-tile rise from the chamber floor — reel land)
    g.rect(74, 12, 80, 16, "#");
  },
  entities: [
    { t: "pedestal", x: 3, y: 13, skill: "magnet" },
    { t: "pedestal", x: 6, y: 13, skill: "bubble" },
    { t: "door", id: "gate", x: 9, y: 11, h: 3, needs: { skills: true } },
    { t: "checkpoint", x: 10, y: 13 },
    // (1) teaching pool — feel the water before the stakes rise
    { t: "trigger", x: 11, y: 12, w: 2, h: 2, once: true, blip: "KOBI: That is the KIDDIE pool. Practice your little bubbles. The big tank has OPINIONS about robots." },
    { t: "water", x: 12, y: 14, w: 4, h: 2 },
    { t: "core", x: 13, y: 15 },   // core 0: a duck-under on the wade through
    { t: "checkpoint", x: 17, y: 13 },
    // (2) the great tank: deck above, three baffled water sections below
    { t: "trigger", x: 24, y: 5, w: 2, h: 2, once: true, blip: "KOBI: One of you swims and one of you stays DRY?! Splitting up is CHEATING. Rule four. I just wrote rule four." },
    { t: "water", x: 24, y: 9, w: 16, h: 8, current: 45 },   // section A: carried in
    { t: "water", x: 40, y: 9, w: 17, h: 8, current: -60 },  // section B: the pumps fight you
    { t: "water", x: 57, y: 9, w: 10, h: 8, current: 45 },   // section C: the jelly's yard
    { t: "core", x: 33, y: 16 },   // core 1: the deep dip between the floor ridges (optional)
    { t: "core", x: 32, y: 5 },    // core 2: under the optional rail spur over the deck
    { t: "checkpoint", x: 34, y: 6 },
    { t: "trigger", x: 36, y: 5, w: 2, h: 2, once: true, blip: "KOBI: Those baffles steer MY currents. Flip that switch and the water flows the WRONG way. There is a right way. It is MINE." },
    { t: "magswitch", id: "ms1", x: 38, y: 6 },
    { t: "door", id: "baf1", x: 40, y: 8, h: 9, needs: { levers: ["ms1"] } },
    { t: "trigger", x: 44, y: 11, w: 2, h: 3, once: true, blip: "KOBI: Halfway across MY tank. Your warranty does not cover water damage. I CHECKED. Twice." },
    { t: "key", x: 48, y: 15 },    // the key dive, at the bottom of the adverse current
    { t: "checkpoint", x: 55, y: 6 },
    { t: "magswitch", id: "ms2", x: 56, y: 6 },
    // baffle 2 is TIMED — the relay squeeze; ms2 pops back out and re-flips
    { t: "door", id: "baf2", x: 57, y: 8, h: 9, timer: 7000, needs: { levers: ["ms2"] } },
    // (3) jelly section + the tank-bottom lock
    { t: "trigger", x: 58, y: 10, w: 2, h: 4, once: true, blip: "KOBI: The jelly is my LIFEGUARD'S assistant. Do NOT introduce it to that socket. They would be TOO happy together." },
    { t: "jelly", x: 61, y: 12, min: 58, max: 63 },
    { t: "socket", id: "sock1", x: 65, y: 13 },
    { t: "trigger", x: 64, y: 13, w: 2, h: 3, once: true, blip: "KOBI: That is the master drain lock. The key does NOT fit. (It fits. I watched them machine it. WHY did I watch.)" },
    { t: "door", id: "tanklock", x: 67, y: 14, h: 3, needs: { keys: 1, levers: ["sock1"] } },
    { t: "water", x: 72, y: 16, w: 2, h: 1 }, // the chamber's drain sump (escape valve)
    // (4) the deck's last switch (chomper-guarded) + the winch ascent
    { t: "chomper", x: 62, y: 6, facing: -1 },
    { t: "magswitch", id: "msD", x: 66, y: 6 },
    { t: "exit", x: 78, y: 9, h: 3, needs: { levers: ["msD"], opened: ["tanklock"] } },
  ],
  // static key-cap prompts (2-1-style kid aids) at the three relay stations
  glyphs: [
    { x: 27, y: 4, caps: [{ k: "E" }, { k: "L", p: 1 }] },   // the dive gap: ACTION bubbles up
    { x: 38, y: 3, caps: [{ k: "E" }, { k: "L", p: 1 }] },   // magswitch: magnet ACTION flips it
    { x: 76, y: 9, caps: [{ k: "S" }, { k: "E" }, { gap: 8 }, { k: "↓", p: 1 }, { k: "L", p: 1 }] }, // the winch: DOWN+ACTION reels your buddy up
  ],
  blips: {
    start: "KOBI: The GREAT TANK. 40,000 liters of certified security water. I said I hoped you'd rust and I MEANT it. I mean it MORE now.",
    skills: "KOBI: Oh no. The bubble is a DIVE SUIT?! And the magnet just... stays dry on MY deck. That is unfair to everyone. Mostly me.",
    clear: "KOBI: You drained MY tank, hired MY jelly, and yo-yo'd each other up MY winch. FINE. The next chamber throws SCRAP at you. I am DONE being subtle.",
  },
};
