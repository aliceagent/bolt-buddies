// 4-2 "The Laser Garden" (twist — World 4, Time-Freeze + Light-Beam).
// GAME_DESIGN §World 4: "sweeping laser fields — Freeze stops them in safe
// positions while Beam melts the three ice-locked doors; each door's key is
// guarded by a Ticker."
//
// The twist composes what 4-1 taught, now under pressure (W4 > W3: visibility
// and time as resources; W4-twist > 4-1: compound set pieces) but every beat
// stays input-only-driver beatable (FL-005: no pixel-perfect demands):
//   Three GARDEN BEDS, each the same grammar at rising intensity — a hanging
//   laser "bloom" sweeps the walk line (FREEZE it in a SAFE pose: parked at
//   its sweep END the beam hangs HIGH over the corridor, tip ~y559 vs head
//   ~y630 — frozen mid-sweep at ~90 deg it is a floor-to-ceiling WALL, so the
//   MOMENT of the cast matters, not just the button), then a Ticker dash lane
//   guarding that bed's KEY, then the bed's gate: an ICE sheet (sustained
//   Beam melts it, 2.2s) fused to a KEY lock (the carried key turns it).
//   1. equip yard    — pedestals -> skills gate (4-1's shape; no re-teach).
//   2. bed 1 (single bloom) — one sweeper + lane + gate: ONE well-timed
//                     freeze crosses sweeper AND statues the key's guard —
//                     the level's thesis in its simplest form.
//   3. bed 2 (the twin blooms, dark) — a dark zone hides TWO sweepers that
//                     run MIRRORED (a1+a2=180: both park at their safe ends
//                     on the SAME instant — one deliberate cast clears both);
//                     the freeze budget forces a second cast for the lane
//                     (cooldown wait in the attested-safe pocket between).
//   4. bed 3 (the compound bloom) — the sweeper hangs DIRECTLY OVER the
//                     Ticker's lane and the key: one cast, timed to the
//                     laser's safe pose, must also statue the guard — laser
//                     timing and guard timing spend the SAME resource.
// Geometry safety (the L41 lessons, applied):
//   - NO pits at all: the floor is solid end to end, so a floor-less carve
//     can never cage a body — every death is a hazard kill (laser/Ticker) ->
//     the standard checkpoint respawn.
//   - every checkpoint sits OUTSIDE every laser's head-height reach (kill
//     band = emitter x +-230px; nearest checkpoint >= 280px clear) and
//     outside every Ticker's patrol+contact reach — a respawned robot can
//     IDLE at any checkpoint forever (no death loop; drive-audited).
//   - laser emitters hang from ceiling trellises (never floor pillars): a
//     walk-line crossing never has to JUMP over an emitter, so no frozen
//     beam stub can clip a hopper's arc.
//   - keys are SHARED-COUNTER pickups (death never drops one) and key locks
//     never re-close (keysGiven persists); ice doors melt once, forever —
//     no bed's state is consumable, no melt/unlock ORDER can strand (see
//     tools/softlock/scenarios/world4.mjs, the 4-2 set).
// 3 cores, all ON the mandatory walk line (coreprobe: no detours, no FL-T3
// trap): core 0 in bed 1's lane, core 1 on the dark floor between the twin
// blooms, core 2 in the compound lane. 4 checkpoints, all on solid ground.
export default {
  id: "4-2",
  name: "The Laser Garden",
  world: 4,
  skills: ["freeze", "beam"],
  cols: 88,
  rows: 18,
  spawns: [[2, 13], [4, 13]],
  build(g) {
    g.rect(0, 0, 0, 13, "#"); // left wall
    g.rect(0, 14, 87, 17, "#"); // ground — SOLID end to end (no pits, see header)
    g.rect(87, 0, 87, 13, "#"); // right wall
    // ceiling trellises the laser blooms hang from (one per garden bed)
    g.rect(14, 5, 23, 5, "#"); // bed 1
    g.rect(36, 5, 52, 5, "#"); // bed 2 (spans the dark zone)
    g.rect(68, 5, 80, 5, "#"); // bed 3
  },
  entities: [
    { t: "pedestal", x: 3, y: 13, skill: "freeze" },
    { t: "pedestal", x: 6, y: 13, skill: "beam" },
    { t: "door", id: "gate", x: 9, y: 11, h: 3, needs: { skills: true } },
    { t: "checkpoint", x: 11, y: 13 },
    // --- bed 1: the single bloom (sweeper -> lane -> gate) -------------------
    { t: "trigger", x: 12, y: 12, w: 2, h: 2, once: true, blip: "KOBI: Welcome to the LASER GARDEN. I grew every beam from a single red dot. They sweep because a garden must be TIDY. Do NOT be untidy." },
    { t: "laser", x: 18, y: 6, len: 8, mode: "sweep", min: 40, max: 140, speed: 45 },
    { t: "trigger", x: 23, y: 12, w: 2, h: 2, once: true, blip: "KOBI: Every key in my garden has its own Ticker. They never sleep. They never blink. They never STOP. I am a little afraid of them." },
    { t: "ticker", x: 27, y: 13, min: 25, max: 29, facing: 1 },
    { t: "key", x: 27, y: 13 },
    { t: "core", x: 28, y: 13 },   // core 0: on bed 1's lane floor (walked over)
    { t: "icedoor", id: "ice1", x: 32, y: 11, h: 3 },
    { t: "door", id: "lock1", x: 33, y: 11, h: 3, needs: { keys: 1 } },
    { t: "checkpoint", x: 34, y: 13 },
    // --- bed 2: the twin blooms, in the dark ---------------------------------
    { t: "trigger", x: 36, y: 12, w: 2, h: 2, once: true, blip: "KOBI: Dark AND lasers. I combined my two BEST ideas. It is perfect. It is unbeatable. I also cannot see anything in there. It is perfect." },
    { t: "dark", x: 37, y: 5, w: 15, h: 9 },
    // mirrored pair: a1 starts at min rising, a2 at max falling — a1+a2 = 180
    // forever, so both park on their safe ends at the SAME instant (one cast).
    { t: "laser", x: 41, y: 6, len: 8, mode: "sweep", min: 40, max: 140, speed: 45, angle: 40 },
    { t: "core", x: 44, y: 13 },   // core 1: dark floor between the blooms (glow finds it)
    { t: "laser", x: 47, y: 6, len: 8, mode: "sweep", min: 40, max: 140, speed: 45, angle: 140 },
    { t: "ticker", x: 57, y: 13, min: 55, max: 59, facing: -1 },
    { t: "key", x: 57, y: 13 },
    { t: "icedoor", id: "ice2", x: 62, y: 11, h: 3 },
    { t: "door", id: "lock2", x: 63, y: 11, h: 3, needs: { keys: 1 } },
    { t: "checkpoint", x: 65, y: 13 },
    // --- bed 3: the compound bloom (laser OVER the guard OVER the key) -------
    { t: "trigger", x: 66, y: 12, w: 2, h: 2, once: true, blip: "KOBI: The last bloom guards its OWN key. Laser, guard, lock — ALL AT ONCE. I call it multitasking. You will call it something ruder." },
    { t: "laser", x: 73, y: 6, len: 8, mode: "sweep", min: 40, max: 140, speed: 50 },
    { t: "ticker", x: 72, y: 13, min: 70, max: 75, facing: 1 },
    { t: "key", x: 73, y: 13 },
    { t: "core", x: 75, y: 13 },   // core 2: on the compound lane floor
    { t: "icedoor", id: "ice3", x: 81, y: 11, h: 3 },
    { t: "door", id: "lock3", x: 82, y: 11, h: 3, needs: { keys: 1 } },
    { t: "checkpoint", x: 84, y: 13 },
    { t: "exit", x: 86, y: 11, h: 3, needs: { skills: true } },
  ],
  // static key-cap prompts at the set pieces (2-1-style kid aids)
  glyphs: [
    { x: 14, y: 10, caps: [{ k: "E" }, { k: "L", p: 1 }] }, // bed 1: freeze the sweep SAFE
    { x: 30, y: 10, caps: [{ k: "E" }, { k: "L", p: 1 }] }, // gate 1: HOLD the beam on the ice
    { x: 69, y: 10, caps: [{ k: "E" }, { k: "L", p: 1 }] }, // bed 3: one cast for all of it
  ],
  blips: {
    start: "KOBI: You found my LASER GARDEN. Three beds. Three locks. Three guards. I counted them MYSELF, twice, in the dark.",
    skills: "KOBI: The pause button and the flashlight AGAIN. Fine. My garden has thorns that sweep and locks that bite. Gardens are SUPPOSED to be relaxing. This one is NOT.",
    clear: "KOBI: You picked ALL THREE of my laser blooms... FINE. There is nothing left to guard me but my HEART. Do not come there. It is dark there. Even for me.",
  },
};
