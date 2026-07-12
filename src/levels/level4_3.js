// 4-3 "KOBI's Heart" (master, FINALE — World 4, Time-Freeze + Light-Beam).
// GAME_DESIGN §World 4: "The confrontation. Beam blinds KOBI's eye to expose
// its three cooling cores; Freeze stops the defense turbines so the partner
// can reach each core. No violence — you're *unplugging his tantrum*. Bolt
// bounds out; KOBI, revealed to be lonely, is adopted by the family. Epilogue
// playground scene + credits."
//
// Shape (the crane fight's staging grammar, W4-master scale — ~10 min, every
// beat input-only-driver beatable, FL-005: no pixel-perfect demands):
//   1. equip yard    — pedestals -> skills gate (4-1/4-2's shape; no re-teach).
//   2. the last dark hall — one composed refresher (dark zone + a Ticker lane
//                     + a roaming gloomy ABOVE the walk line): freeze statues
//                     the guard, both cross. Core 0 sits ON the lane floor.
//   3. THE HEART ARENA — KOBI's great eye hovers over the arena center
//                     (`kobiheart` ent). The fight loop, ×3 with escalation:
//        BLIND: hold the beam cone ON the eye from a blind PERCH (raised
//               1-tile podium west/east of the eye — the stance geometry that
//               puts the eye inside the cone's 24° half-angle). While lit the
//               eye SQUINTS (its glare cycle holds — it cannot aim); the
//               dazzle meter fills (2.6s vs the 6s battery) and the CURRENT
//               station's vent hatch blows: a cooling core is EXPOSED —
//               PERMANENTLY (monotonic, like ice melts: no blind-window to
//               miss, no unwinnable state — see softlock scenarios).
//        REACH: the exposed core is flanked by DEFENSE TURBINES (lethal spin,
//               utterly held + SAFE under TIME-FREEZE — the Ticker contract).
//               Freeze, run in, TOUCH the core: unplugged. That station's
//               turbines power down FOREVER (the corridor back stays clear).
//        Between cores the eye's GLARE attack (aim-follow -> lock -> strike
//        column, crane-telegraph rhythm: visible stripes, 0.75s lock) speeds
//        up per core taken and the turbine gauntlets sit deeper east — the
//        crane's escalation staging, non-violently.
//   4. POWER-DOWN + RESCUE — third core out: KOBI powers down MID-TANTRUM
//                     (staged like the crane defeat: shake/smoke/grey-out +
//                     the A11 defeated mood through the blip bar), Bolt's
//                     cage pops and he BOUNDS across the arena to the
//                     buddies. The exit opens only then (needs.heart).
//                     finishLevel is the STANDARD contract; the clear
//                     overlay's continue routes to the Epilogue scene.
// Geometry safety (the L41/L42 lessons, applied):
//   - NO pits anywhere: the floor is solid end to end — every death is a
//     hazard kill (ticker/turbine/glare) -> the standard checkpoint respawn.
//   - the glare column CLAMPS to tiles 34-72: the arena checkpoint (x30), the
//     hall checkpoint (x26) and the exit zone (x74+) are outside its reach —
//     and every turbine is >=2.5 tiles from every checkpoint — so a respawned
//     robot can IDLE at any checkpoint forever (no death loop; drive-audited).
//   - all boss progress is MONOTONIC: exposed vents never re-close, unplugged
//     cores never re-plug, dead turbines never respin, and blinds/freezes are
//     unlimited (battery + cooldown always recharge) — the fight can never
//     become unwinnable (softlock scenario 4-3-blind-window-missed).
// 3 cores, all ON the mandatory walk line (coreprobe: no detours, no FL-T3
// trap): core 0 in the hall's ticker lane, core 1 under the eye's west
// approach, core 2 on the station-2 approach floor. 3 checkpoints, all on
// solid ground outside every hazard's reach.
export default {
  id: "4-3",
  name: "KOBI's Heart",
  world: 4,
  finale: true, // the campaign finale: clear-overlay continue -> Epilogue
  skills: ["freeze", "beam"],
  cols: 78,
  rows: 18,
  spawns: [[2, 13], [4, 13]],
  build(g) {
    g.rect(0, 0, 0, 13, "#"); // left wall
    g.rect(0, 14, 77, 17, "#"); // ground — SOLID end to end (no pits, see header)
    g.rect(77, 0, 77, 13, "#"); // right wall
    // the blind PERCHES: 1-tile podiums west/east of the hovering eye — the
    // attested stance band that puts the eye inside the beam cone's half-angle
    g.set(42, 13, "#");
    g.set(43, 13, "#");
    g.set(53, 13, "#");
    g.set(54, 13, "#");
  },
  entities: [
    { t: "pedestal", x: 3, y: 13, skill: "freeze" },
    { t: "pedestal", x: 6, y: 13, skill: "beam" },
    { t: "door", id: "gate", x: 9, y: 11, h: 3, needs: { skills: true } },
    { t: "checkpoint", x: 11, y: 13 },
    // --- the last dark hall (refresher: dark + ticker + gloomy menace) -------
    { t: "trigger", x: 12, y: 12, w: 2, h: 2, once: true, blip: "KOBI: This is my LAST hallway. Behind it is where I keep ME. The puppy is there too. He is my guest. GUESTS STAY." },
    { t: "dark", x: 13, y: 5, w: 14, h: 9 },
    { t: "ticker", x: 19, y: 13, min: 17, max: 22, facing: 1 },
    { t: "core", x: 21, y: 13 },   // core 0: on the lane floor (frozen pass sweeps it)
    { t: "gloomy", x: 24, y: 10 }, // roaming menace ABOVE the walk line (glow-shy)
    { t: "checkpoint", x: 26, y: 13 },
    // --- THE HEART ARENA ------------------------------------------------------
    { t: "trigger", x: 28, y: 12, w: 2, h: 2, once: true, blip: "KOBI: STOP. STOP RIGHT THERE. Blind me and my vents pop open — I READ MY OWN MANUAL. Do NOT read my manual." },
    { t: "checkpoint", x: 30, y: 13 },
    // the boss rig: the hovering eye + its three cooling-core stations.
    // glare clamp 34-72 keeps every checkpoint + the exit zone out of reach.
    { t: "kobiheart", x: 48, y: 10.5, minX: 34, maxX: 72, cage: 51,
      stations: [{ x: 58, y: 13 }, { x: 63, y: 13 }, { x: 71, y: 13 }] },
    { t: "core", x: 46, y: 13 },   // core 1: under the eye's west approach floor
    // station 1 (teach the loop): two turbines flanking the core
    { t: "turbine", x: 57, y: 13, station: 0 },
    { t: "turbine", x: 59, y: 13, station: 0 },
    // station 2 (deeper, wider): the run spends more of the 5s hold
    { t: "core", x: 60, y: 13 },   // core 2: on the station-2 approach floor
    { t: "turbine", x: 62, y: 13, station: 1 },
    { t: "turbine", x: 65, y: 13, station: 1 },
    // station 3 (the deepest gauntlet): three turbines, the fastest glare
    { t: "turbine", x: 68, y: 13, station: 2 },
    { t: "turbine", x: 70, y: 13, station: 2 },
    { t: "turbine", x: 72, y: 13, station: 2 },
    { t: "trigger", x: 74, y: 12, w: 2, h: 2, once: true, blip: { text: "KOBI: Wait. You are LEAVING leaving? What do I guard now? Guarding is my whole personality.", mood: "defeated" } },
    { t: "exit", x: 75, y: 11, h: 3, needs: { heart: true } },
  ],
  // static key-cap prompts at the set pieces (2-1-style kid aids)
  glyphs: [
    { x: 15, y: 10, caps: [{ k: "E" }, { k: "L", p: 1 }] }, // hall: freeze the guard
    { x: 42, y: 10, caps: [{ k: "E" }, { k: "L", p: 1 }] }, // perch: HOLD the beam on the eye
    { x: 57, y: 10, caps: [{ k: "E" }, { k: "L", p: 1 }] }, // station 1: freeze the turbines
  ],
  blips: {
    start: "KOBI: You found it. My HEART. It is a giant eye because hearts are GROSS. Three cooling cores keep my tantrum running. They are PRIVATE.",
    skills: "KOBI: The flashlight and the pause button. In MY heart-room. Fine. FINE. My turbines spin at ONE MILLION and my eye never blinks. Almost never.",
    clear: "KOBI: ...You want me to COME WITH YOU? I am a whole building. I am also, technically, this little eye. YES. WAIT THERE. I am coming. HOLD THE DOOR.",
  },
};
