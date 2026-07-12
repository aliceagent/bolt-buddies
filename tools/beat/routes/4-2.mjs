// 4-2 "The Laser Garden" — role-parametric walkthrough (W3W4 L42).
// Roles: F = time-freeze, B = light-beam. Input-only, closed-loop (same contract
// as every route: reads state to time REAL key presses, never mutates the scene).
//
// Beats: equip -> bed 1: F freezes the single bloom PARKED LOW ON ITS SAFE END
// (the design's "frozen mid-sweep in a SAFE position" — near-vertical it is a
// wall), both cross sweeper + Ticker lane (statued by the same cast; the key and
// core 0 sit on the walk line) inside one 5s hold -> B melts ice1 with the
// sustained beam, the carried key turns lock1 -> bed 2: the dark TWIN blooms run
// mirrored (a1+a2=180), so ONE deliberate cast parks both high; cross to the
// attested-safe pocket, wait out the freeze cooldown there (the budget beat),
// second cast statues the lane's Ticker -> gate 2 -> bed 3 (the compound): one
// cast timed to the overhead sweeper's safe pose ALSO statues the key's guard;
// key + core 2 grabbed in the same hold -> gate 3 -> exit.
//
// Laser geometry facts the timings rest on (emitters at ty 6, len 8 = 384px,
// sweep 40..140 deg, 0=right/90=down): a beam only reaches head height
// (body top y630) while sin(angle) >= 318/384 — i.e. angle in [55.9, 124.1] deg.
// Frozen anywhere <= ~53 deg (or mirror >= ~127) the whole corridor floor is
// walkable. The cast predicate (angle <= maxDeg && dir === -1, maxDeg 50-52)
// leaves >= 3 deg of margin over the worst poll+tap latency at 45-50 deg/s.
const TILE = 48;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deg = (r) => ((r * 180) / Math.PI);

// Wait until the freeze is ready AND laser `laserIdx` is parked low on its min
// side (falling through maxDeg), then cast with a real key. laserIdx null =
// no pose gate (lane-only casts). Returns true once the world is frozen.
async function freezeWhenSafe(bb, laserIdx, maxDeg = 52) {
  const fi = bb.idx("F");
  const kF = bb.keysFor("F");
  await bb.waitFor((s) => s.players[fi].freezeCd <= 0, 18000, "freeze cooldown ready");
  if (laserIdx != null) {
    await bb.waitFor((s) => {
      const L = s.lasers[laserIdx];
      return !!L && deg(L.angle) <= maxDeg && L.dir === -1;
    }, 18000, `sweeper ${laserIdx} parked on its safe end`);
  }
  await bb.tap(kF.act);
  return bb.waitFor((s) => s.frozen, 1500, "world frozen").then(() => true).catch(() => false);
}

// Cross one garden field under a single freeze hold. Closed-loop attempt cycle:
// park every not-yet-across robot on the attested-safe west stance, cast on the
// safe pose, then BOTH hurry east inside the 5s hold (frozen sweepers hang high;
// frozen Tickers are statues — contact is gated off). A straggler caught by the
// thaw takes at worst the standard hazard death -> checkpoint respawn -> the
// next attempt re-parks and re-casts (freezes are unlimited; cd ~13s).
async function crossField(bb, { name, laserIdx = null, maxDeg = 52, parks, targets, past, attempts = 6 }) {
  const fi = bb.idx("F");
  const bi = bb.idx("B");
  for (let attempt = 0; attempt < attempts; attempt++) {
    let st = await bb.state();
    if (st.players[fi].dead) { await bb.awaitRespawn("F"); continue; }
    if (st.players[bi].dead) { await bb.awaitRespawn("B"); continue; }
    const fPast = st.players[fi].tx > past;
    const bPast = st.players[bi].tx > past;
    if (fPast && bPast) return;
    // park the west-side robots on the safe stance (outside the sweep's reach)
    if (!fPast) await bb.walkTo("F", parks.F, { tol: 6, timeout: 9000 }).catch(() => {});
    if (!bPast) await bb.walkTo("B", parks.B, { tol: 6, timeout: 9000 }).catch(() => {});
    st = await bb.state();
    if (st.players[fi].dead || st.players[bi].dead) continue;
    const froze = await freezeWhenSafe(bb, laserIdx, maxDeg);
    if (!froze) continue;
    const walkers = [];
    if (!fPast) walkers.push(bb.walkTo("F", targets.F, { tol: 8, timeout: 4600 }).catch(() => {}));
    if (!bPast) walkers.push(bb.walkTo("B", targets.B, { tol: 8, timeout: 4600 }).catch(() => {}));
    await Promise.all(walkers);
  }
  const st = await bb.state();
  if (!(st.players[fi].tx > past && st.players[bi].tx > past)) {
    throw new Error(`${name}: both robots never crossed (F ${st.players[fi].tx.toFixed(1)}, B ${st.players[bi].tx.toFixed(1)})`);
  }
}

// B holds the sustained beam on ice door `iceIdx` from `standTile` until it
// melts (2.2s of exposure vs the 6s battery); drained batteries recharge doused
// and the herd-style attempt loop retries — melts are monotonic (never drain).
async function meltIce(bb, iceIdx, standTile) {
  const bi = bb.idx("B");
  const kB = bb.keysFor("B");
  for (let attempt = 0; attempt < 6; attempt++) {
    let st = await bb.state();
    if (st.icedoors[iceIdx]?.open) return;
    if (st.players[bi].dead) { await bb.awaitRespawn("B"); continue; }
    await bb.walkTo("B", standTile, { tol: 5, timeout: 9000 }).catch(() => {});
    await bb.face("B", "right");
    await bb.down(kB.act);
    let open = false;
    try {
      await bb.waitFor((s) => s.players[bi].beamOn, 1500, "beam ignites").catch(() => {});
      open = await bb.waitFor((s) => s.icedoors[iceIdx]?.open, 4500, "ice melted")
        .then(() => true).catch(() => false);
    } finally {
      await bb.up(kB.act);
    }
    if (open) return;
    // battery drained mid-melt — douse and let it recharge (melt progress keeps)
    await bb.waitFor((s) => s.players[bi].beamMs > 4000, 12000, "battery recharged").catch(() => {});
  }
  await bb.waitFor((s) => s.icedoors[iceIdx]?.open, 2000, `ice door ${iceIdx} open`);
}

// The bed crossings, reusable (each returns immediately when both robots are
// already past its field). Gate steps re-run their bed's crossing FIRST so a
// melter whose death respawned it WEST of a live field never bare-walks back
// through the sweeps — the retry path always re-freezes.
const bed1Cross = (bb) => crossField(bb, {
  name: "bed 1",
  laserIdx: 0,
  parks: { F: 10.9, B: 11.8 },   // outside the sweep's 245px head-height reach
  targets: { F: 30.8, B: 31.3 }, // past the lane's contact reach (tx 30.4)
  past: 30.9,
});
const twinCross = (bb) => crossField(bb, {
  name: "bed 2 twin blooms",
  laserIdx: 1,
  parks: { F: 34.1, B: 34.9 },   // at the x34 checkpoint, outside sweeper reach
  targets: { F: 52.6, B: 53.3 }, // the attested-safe pocket past both blooms
  past: 53.0,
});
const laneCross = (bb) => crossField(bb, {
  name: "bed 2 lane",
  laserIdx: null,                // no sweeper over this lane — a statue cast
  parks: { F: 52.6, B: 53.3 },
  targets: { F: 60.5, B: 61.1 }, // past the lane's contact reach (tx 60.4)
  past: 60.7,
});
const bed3Cross = (bb) => crossField(bb, {
  name: "bed 3 compound",
  laserIdx: 3,
  maxDeg: 50,                    // this bloom sweeps faster (50 deg/s)
  parks: { F: 66.5, B: 67.3 },   // outside the sweep's reach (kill band tx 68.4+)
  targets: { F: 79.0, B: 79.7 }, // past lane reach (tx 76.4) and sweep reach (tx 78.6)
  past: 79.1,
});

export default [
  {
    name: "equip skills -> gate opens",
    fn: async (bb) => {
      await bb.equip("F", 3);
      await bb.equip("B", 6);
      await bb.waitFor((s) => s.doors.find((d) => d.id === "gate")?.open, 5000, "gate open");
      // both to the x11 checkpoint (arms the garden-side respawn)
      await bb.walkTo("F", 11, { tol: 10, timeout: 8000 });
      await bb.walkTo("B", 12, { tol: 10, timeout: 8000 });
    },
  },
  {
    name: "bed 1: freeze the bloom on its safe end; both cross sweeper + lane (key 1 + core 0)",
    fn: async (bb) => {
      // one 5s hold covers the whole bed: sweeper zone (x13-23), then the
      // statued Ticker lane (x25-29) — key 1 (x27) and core 0 (x28) sit ON the
      // walk line, so the first crosser sweeps them up.
      await bed1Cross(bb);
      await bb.waitFor(
        (s) => s.keysHeld >= 1 || s.doors.find((d) => d.id === "lock1")?.open,
        3000, "key 1 collected");
    },
  },
  {
    name: "gate 1: B melts ice1 with the sustained beam; the key turns lock1",
    fn: async (bb) => {
      await bed1Cross(bb); // no-op unless a death dropped someone back west
      await meltIce(bb, 0, 30.6); // beam stance: cone-aligned with the sheet's face
      // the carried key is consumed on approach — lock1 opens and never re-closes
      await bb.waitFor((s) => s.doors.find((d) => d.id === "lock1")?.open, 6000, "lock1 open");
      // both through to the x34 checkpoint
      await bb.walkTo("B", 34.9, { tol: 8, timeout: 10000 });
      await bb.walkTo("F", 34.1, { tol: 8, timeout: 10000 });
    },
  },
  {
    name: "bed 2: ONE cast parks the mirrored twin blooms; both cross the dark to the pocket",
    fn: async (bb) => {
      // the twins run mirrored (a1+a2=180): when sweeper 1 falls through ~52deg
      // its twin climbs through ~128 — BOTH outside the lethal band on the same
      // instant. One deliberate cast, both parked high, the dark floor walkable.
      await twinCross(bb);
    },
  },
  {
    name: "bed 2 lane: wait out the freeze budget in the pocket; second cast statues the Ticker (key 2)",
    fn: async (bb) => {
      // the pocket (x52.3-54.3) is outside the twins' reach AND the lane's —
      // the team idles there while the ~13s cooldown ring refills (the freeze-
      // budget beat), then one lane cast covers key 2 (x57) and the crossing.
      await twinCross(bb); // self-heal: a lane death respawns WEST of the twins
      await laneCross(bb);
      await bb.waitFor(
        (s) => s.keysHeld >= 1 || s.doors.find((d) => d.id === "lock2")?.open,
        3000, "key 2 collected");
    },
  },
  {
    name: "gate 2: B melts ice2; lock2 turns; both to the x65 checkpoint",
    fn: async (bb) => {
      await twinCross(bb);
      await laneCross(bb);
      await meltIce(bb, 1, 60.5);
      await bb.waitFor((s) => s.doors.find((d) => d.id === "lock2")?.open, 6000, "lock2 open");
      await bb.walkTo("B", 64.9, { tol: 8, timeout: 10000 });
      await bb.walkTo("F", 64.3, { tol: 8, timeout: 10000 });
    },
  },
  {
    name: "bed 3 (compound): one cast freezes the overhead sweep SAFE and statues the key's guard",
    fn: async (bb) => {
      // the twist's thesis: the sweeper hangs directly over the Ticker's lane
      // and the key — the SAME cast must catch the laser's safe pose and statue
      // the guard. Key 3 (x74) + core 2 (x76) sit on the walk line through it.
      await bed3Cross(bb);
      await bb.waitFor(
        (s) => s.keysHeld >= 1 || s.doors.find((d) => d.id === "lock3")?.open,
        3000, "key 3 collected");
    },
  },
  {
    name: "gate 3: B melts ice3; lock3 turns; both walk to the exit",
    fn: async (bb) => {
      const fi = bb.idx("F");
      const bi = bb.idx("B");
      await bed3Cross(bb); // self-heal: a melt-stance death respawns west of the fan
      await meltIce(bb, 2, 79.6);
      await bb.waitFor((s) => s.doors.find((d) => d.id === "lock3")?.open, 6000, "lock3 open");
      // both through cp4 (x84) into the exit zone
      await bb.walkTo("B", 85.5, { tol: 10, timeout: 10000 }).catch(() => {});
      await bb.walkTo("F", 85.5, { tol: 10, timeout: 10000 }).catch(() => {});
      let st = await bb.state();
      if (st.players[fi].dead) { await bb.awaitRespawn("F"); await bb.walkTo("F", 85.5, { tol: 10, timeout: 10000 }); }
      if (st.players[bi].dead) { await bb.awaitRespawn("B"); await bb.walkTo("B", 85.5, { tol: 10, timeout: 10000 }); }
      await bb.waitFor((s) => s.complete, 5000, "level complete");
    },
  },
];

// --- 100%-core variant (beat --full) -----------------------------------------
// All three cores sit ON the mandatory walk line, each inside its bed's freeze
// hold (coreprobe-style: no detours, no FL-T3 trap):
//   core0 (28,13) — bed 1's lane floor (the hold-crossing walks over it)
//   core1 (44,13) — the dark floor between the twin blooms (crossed under cast 1)
//   core2 (76,13) — the compound lane floor (crossed under bed 3's single cast)
// The base route sweeps all three, so the core variant adds no extra steps —
// the pre-exit assertion does the checking.
export const coreSteps = [];

// Shared with the softlock prober (tools/softlock/scenarios/world4.mjs): the
// same input-only primitives the matrix uses, so scenario staging/recovery is
// as deterministic as the matrix itself.
export const helpers = { freezeWhenSafe, crossField, meltIce, bed1Cross, twinCross, laneCross, bed3Cross };
