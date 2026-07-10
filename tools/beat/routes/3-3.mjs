// 3-3 "The Scrap Storm" — role-parametric walkthrough (W3W4 L33).
// Roles: M = magnet, B = bubble. Input-only, closed-loop (reads state to time
// REAL key presses, never mutates the scene).
//
// Beats: equip -> the HUDDLE ferry of fuse-core A (M catches a flying chunk —
// the scrap SHIELD — and B walks the core across tucked behind the plate; a
// scrap pop drops the core where it fell and the loop re-fetches it) -> M
// solo-shields across lane 1 and defangs the chomper camping fc2 -> core B
// huddle-ferried to fc2 -> core C huddle-ferried through the double gauntlet
// (regrouping in the calm mid pocket) to fc3 — the storm ends -> B boops the
// zap-jelly into the exit socket -> both out.
//
// STORM-CRAFT (drive-derived, FL-005 spirit — deterministic lanes, no
// pixel-perfect demands):
//  * the huddle IS the mechanic: the held shield absorbs every chunk reaching
//    its column, so a buddy walking BEHIND the magnet crosses untouched. A
//    solo bubbled ferry survives exactly ONE hit (pop + mercy invuln) — the
//    encounter rate in a live lane is higher than the re-bubble cycle, so the
//    route never strides a live band without the plate (nor should a kid).
//  * every crossing is a closed loop in short slices: shield/positions are
//    re-read continuously; a lost shield mid-band retreats to the nearest calm
//    pocket, waits out the catch cooldown, re-catches, re-crosses.
//  * deaths are recoveries, not failures: a killed carrier DROPS its core on
//    the spot; the ferry loop fetches it from where it fell (huddling again if
//    it fell inside a band).
const TILE = 48;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();

// Keep a role bubbled (insurance for the ferry): taps ACT when the bubble is
// down and the cooldown is ready. Never waits.
export async function ensureBubble(bb, role) {
  const i = bb.idx(role);
  const p = (await bb.state()).players[i];
  if (p.dead || p.bubbleT > 0) return p.bubbleT > 0;
  if (p.bubbleCd > 0) return false;
  await bb.tap(bb.keysFor(role).act);
  await sleep(150);
  return (await bb.state()).players[i].bubbleT > 0;
}

// Nearest calm tile from a list (the level's pocket geometry).
const nearestSafe = (tiles, tx) =>
  tiles.reduce((a, b) => (Math.abs(b - tx) < Math.abs(a - tx) ? b : a));

// first ACTIVE ground lane whose band lies between a and b (upper lanes only
// threaten jumpers — ground travel ignores them)
const bandBetween = (s, a, b) => s.lanes.find((l) => l.active && l.row >= 12 &&
  Math.min(a, b) < l.x2 + 0.9 && Math.max(a, b) > l.x1 - 0.9);

// One catch attempt: M stands at `lipTile` (1.6 tiles clear of the band — no
// chunk can reach him there, every passing chunk enters the 150px glove range)
// and ACTs when one comes close. Returns true once the shield is held.
export async function tryCatch(bb, lipTile) {
  const mi = bb.idx("M");
  const kM = bb.keysFor("M");
  await bb.walkTo("M", lipTile, { tol: 7, timeout: 6000 }).catch(() => {});
  const s = await bb.state();
  const p = s.players[mi];
  if (p.dead) { await bb.awaitRespawn("M"); return false; }
  if (s.shield.cd > 0) {
    await bb.waitFor((st) => st.shield.cd <= 0, 5000, "catch cooldown").catch(() => {});
    return false;
  }
  const near = s.lanes.some((l) => l.active &&
    l.chunks.some((cx) => Math.abs(cx * TILE - p.x) < 120 && Math.abs(l.row * TILE + 24 - (p.y - 8)) < 90));
  if (!near) { await sleep(90); return false; }
  await bb.tap(kM.act);
  await sleep(180);
  return (await bb.state()).shield.state === "held";
}

// M's SOLO storm move: walk to tileX, catching a scrap shield for every live
// band on the way (works both directions — walking downwind he simply
// rear-ends the slower chunks with the plate). Returns the number of catches.
export async function shieldWalk(bb, tileX, opts = {}) {
  const mi = bb.idx("M");
  const safeTiles = opts.safeTiles || [11, 24, 49, 61, 73];
  const end = now() + (opts.timeout ?? 90000);
  let caught = 0;
  while (now() < end) {
    const s = await bb.state();
    if (s.complete) return caught;
    const p = s.players[mi];
    if (p.dead) { await bb.awaitRespawn("M"); continue; }
    if (Math.abs(p.tx - tileX - 0.5) < 0.7 && p.grounded) return caught;
    const lane = bandBetween(s, p.tx, tileX);
    if (!lane) {
      await bb.walkTo("M", tileX, { tol: 10, timeout: 15000 });
      continue;
    }
    const sh = s.shield;
    if (sh.state === "held" && sh.heldBy === mi) {
      // freshness guard: never START a crossing on a stale hold — expire it at
      // the lip and re-catch fresh (an expiry mid-band is a bare stranding)
      const outsideBand = p.tx < lane.x1 - 1.2 || p.tx > lane.x2 + 1.2;
      if (outsideBand && sh.holdMs < 4500) { await sleep(sh.holdMs + 150); continue; }
      await bb.walkTo("M", tileX, { tol: 10, timeout: 2200 }).catch(() => {});
      continue;
    }
    if (sh.state === "planted") { await sleep(400); continue; } // let the step expire
    if (sh.cd > 0) {
      await bb.walkTo("M", nearestSafe(safeTiles, p.tx), { tol: 12, timeout: 4000 }).catch(() => {});
      await bb.waitFor((st) => st.shield.cd <= 0, 5000, "catch cooldown").catch(() => {});
      continue;
    }
    const dirTo = Math.sign(tileX - p.tx) || 1;
    // lip as a walkTo TILE INDEX: the robot's centre ends 1.6 tiles clear of
    // the band edge (outside every chunk's reach, inside the 150px glove range)
    const lip = dirTo > 0 ? lane.x1 - 2.1 : lane.x2 + 1.1;
    if (await tryCatch(bb, lip)) caught++;
  }
  throw new Error(`shieldWalk M -> ${tileX} timed out (caught ${caught})`);
}

// THE HUDDLE: move BOTH robots to toTile, band by band — M catches at the lip,
// B tucks in behind the plate, and the pair escorts across together (the
// shield absorbs everything that reaches its column, so the buddy crosses
// untouched). Regroups after any death; returns the number of catches.
export async function huddleCross(bb, toTile, opts = {}) {
  const mi = bb.idx("M");
  const bi = bb.idx("B");
  const safeTiles = opts.safeTiles || [11, 24, 49, 61, 73];
  const end = now() + (opts.timeout ?? 100000);
  let caught = 0;
  while (now() < end) {
    const s = await bb.state();
    if (s.complete) return caught;
    if (opts.until && opts.until(s)) return caught;
    const M = s.players[mi];
    const B = s.players[bi];
    if (M.dead) { await bb.awaitRespawn("M"); continue; }
    if (B.dead) { await bb.awaitRespawn("B"); continue; }
    if (Math.abs(M.tx - toTile - 0.5) < 0.9 && Math.abs(B.tx - toTile - 0.5) < 1.8) return caught;
    // regroup: the pair must travel together (a respawn can split them)
    if (Math.abs(M.tx - B.tx) > 3.2) {
      if (bandBetween(s, M.tx, B.tx)) caught += await shieldWalk(bb, B.tx + 1, { safeTiles, timeout: 40000 });
      else await bb.walkTo("M", B.tx + 1, { tol: 24, timeout: 8000 }).catch(() => {});
      continue;
    }
    const lane = bandBetween(s, M.tx, toTile);
    if (!lane) {
      // calm stretch: plain lockstep walk
      await bb.walkTo("M", toTile, { tol: 12, timeout: 4000 }).catch(() => {});
      await bb.walkTo("B", toTile, { tol: 18, timeout: 6000 }).catch(() => {});
      continue;
    }
    const dirTo = Math.sign(toTile - M.tx) || 1;
    const sh = s.shield;
    if (!(sh.state === "held" && sh.heldBy === mi)) {
      if (sh.state === "planted") { await sleep(400); continue; }
      if (sh.cd > 0) {
        const safe = nearestSafe(safeTiles, M.tx);
        await bb.walkTo("M", safe, { tol: 12, timeout: 4000 }).catch(() => {});
        await bb.walkTo("B", safe - dirTo * 0.8, { tol: 14, timeout: 4000 }).catch(() => {});
        await bb.waitFor((st) => st.shield.cd <= 0, 5000, "catch cooldown").catch(() => {});
        continue;
      }
      const lip = dirTo > 0 ? lane.x1 - 2.1 : lane.x2 + 1.1;
      await bb.walkTo("B", lip - dirTo * 1.1, { tol: 10, timeout: 6000 }).catch(() => {});
      if (await tryCatch(bb, lip)) caught++;
      continue;
    }
    // freshness guard (see shieldWalk): only enter a band on a young hold
    const outsideBand = M.tx < lane.x1 - 1.2 || M.tx > lane.x2 + 1.2;
    if (outsideBand && sh.holdMs < 4500) { await sleep(sh.holdMs + 150); continue; }
    // shield up: B takes a bubble as insurance (no wait), then escort across
    // this band to its far lip (or the target if nearer) in short slices
    if (B.bubbleT <= 0 && B.bubbleCd <= 0) { await bb.tap(bb.keysFor("B").act); await sleep(120); }
    const segTarget = dirTo > 0 ? Math.min(toTile, lane.x2 + 2) : Math.max(toTile, lane.x1 - 2);
    await bb.escortTogether("M", "B", segTarget, { gap: 60, tol: 18, timeout: 2000 }).catch(() => {});
  }
  throw new Error(`huddleCross -> ${toTile} timed out (caught ${caught})`);
}

// The FERRY: get fuse-core `coreIdx` into socket `sockId`. Whoever holds the
// core is the ferry (M shoulder-picking a core mid-cross is fine — the plate
// covers him); a resting core is fetched by B, huddling if it rests in-band.
export async function ferryCore(bb, coreIdx, sockId, sockTile, opts = {}) {
  const safeTiles = opts.safeTiles || [11, 24, 49, 61, 73];
  const end = now() + (opts.timeout ?? 150000);
  let caught = 0;
  const filled = (s) => s.fusesockets.find((x) => x.id === sockId)?.filled === true;
  while (now() < end) {
    const s = await bb.state();
    if (filled(s)) return caught;
    const core = s.fusecores[coreIdx];
    if (core.state === "socketed") return caught;
    if (core.state === "carried" && bb.roles.M === core.carrier) {
      // M carries: deliver behind his own plate
      caught += await shieldWalk(bb, sockTile, { safeTiles, timeout: 40000 });
      await sleep(100);
      continue;
    }
    if (core.state === "carried") {
      // B carries: huddle the pair to the socket
      caught += await huddleCross(bb, sockTile, { safeTiles, timeout: 60000, until: filled });
      await sleep(100);
      continue;
    }
    // resting: fetch it (huddle if it lies inside a live band)
    const bi = bb.idx("B");
    const B = s.players[bi];
    if (B.dead) { await bb.awaitRespawn("B"); continue; }
    const pickTx = core.tx - 0.5; // px position -> walkTo tile-index convention
    const grabbed = (st) => st.fusecores[coreIdx].state !== "rest" || filled(st);
    if (bandBetween(s, B.tx, core.tx) || bandBetween(s, core.tx - 0.5, core.tx + 0.5)) {
      caught += await huddleCross(bb, pickTx, { safeTiles, timeout: 60000, until: grabbed });
    } else {
      await bb.walkTo("B", pickTx, { tol: 6, timeout: 4000 }).catch(() => {});
    }
    await sleep(80);
  }
  throw new Error(`ferryCore ${coreIdx} -> ${sockId} timed out`);
}

export default [
  {
    name: "equip skills -> gate opens",
    fn: async (bb) => {
      await bb.equip("M", 3);
      await bb.equip("B", 6);
      await bb.waitFor((s) => s.doors.find((d) => d.id === "gate")?.open, 5000, "gate open");
    },
  },
  {
    name: "huddle ferry: core A behind M's caught scrap -> fc1 (lane 0 calms)",
    fn: async (bb) => {
      // B collects core A on the calm west side, then the pair huddles across
      const caught = await ferryCore(bb, 0, "fc1", 23, { safeTiles: [11, 24] });
      if (caught < 1) throw new Error("fc1 ferried without a single scrap catch (the huddle never formed)");
      await bb.waitFor((s) => !s.lanes[0].active, 4000, "teaching lane de-energized");
      await bb.walkTo("B", 24, { tol: 10, timeout: 15000 }); // arms the checkpoint
      await bb.walkTo("M", 24, { tol: 12, timeout: 15000 });
    },
  },
  {
    name: "M solo-shields across lane 1 and defangs the fc2 guard",
    fn: async (bb) => {
      const mi = bb.idx("M");
      // B parks on the x24 checkpoint, clear of the lane
      await bb.walkTo("B", 24, { tol: 8, timeout: 8000 }).catch(() => {});
      await shieldWalk(bb, 41.6, { safeTiles: [25] });
      // defang the socket guard from the lane's east lip — the yank stance is
      // CLAMPED east of the band (drive-found: chasing the chomper's live
      // position followed its lunge back INTO the live lane), and the chomper
      // walks itself into the 210px yank range when it comes for M
      for (let i = 0; i < 10; i++) {
        const st = await bb.state();
        if (st.chompers[0].defanged) break;
        if (st.players[mi].dead) {
          await bb.awaitRespawn("M");
          await shieldWalk(bb, 41.6, { safeTiles: [25] });
          continue;
        }
        const stand = Math.max(41.6, st.chompers[0].tx - 3);
        await bb.walkTo("M", stand, { tol: 10, timeout: 4000 }).catch(() => {});
        await bb.act("M");
        await sleep(300);
      }
      await bb.waitFor((s) => s.chompers[0].defanged, 2000, "fc2 guard defanged");
    },
  },
  {
    name: "fuse-core B huddle-ferried to fc2 (lane 1 calms); both to the x49 checkpoint",
    fn: async (bb) => {
      await ferryCore(bb, 1, "fc2", 48, { safeTiles: [24, 49] });
      await bb.waitFor((s) => !s.lanes[1].active, 4000, "lane 1 de-energized");
      await bb.walkTo("B", 49, { tol: 10, timeout: 20000 });
      await bb.walkTo("M", 49, { tol: 12, timeout: 15000 });
    },
  },
  {
    name: "fuse-core C huddle-ferried through the double gauntlet to fc3 — the storm ends",
    fn: async (bb) => {
      // the huddle regroups in the calm mid pocket (x60 checkpoint) between the
      // two stacked lane pairs — the mid-gauntlet retry kindness, exercised
      await ferryCore(bb, 2, "fc3", 72, { safeTiles: [49, 61, 73] });
      await bb.waitFor((s) => s.lanes.every((l) => !l.active), 5000, "every lane de-energized");
      await bb.walkTo("B", 73, { tol: 10, timeout: 25000 });
      await bb.walkTo("M", 73, { tol: 12, timeout: 15000 });
    },
  },
  {
    name: "B boops the zap-jelly into the exit socket",
    fn: async (bb) => {
      const bi = bb.idx("B");
      const kB = bb.keysFor("B");
      const sockX = 82 * TILE + 24;
      // M parks at the x73 checkpoint, outside the jelly patrol
      await bb.walkTo("M", 73, { tol: 8, timeout: 6000 }).catch(() => {});
      let socketed = false;
      for (let i = 0; i < 12 && !socketed; i++) {
        let st = await bb.state();
        if (st.sockets[0].filled) { socketed = true; break; }
        if (st.players[bi].dead) { await bb.awaitRespawn("B"); continue; }
        if (st.players[bi].bubbleT <= 0) {
          if (st.players[bi].tx > 74.5) await bb.walkTo("B", 73, { tol: 8, timeout: 5000 }).catch(() => {});
          await bb.waitFor((s) => s.players[bi].bubbleCd <= 0, 6000, "bubble ready").catch(() => {});
          await bb.tap(kB.act);
          const got = await bb.waitFor((s) => s.players[bi].bubbleT > 0, 1500, "bubbled")
            .then(() => true).catch(() => false);
          if (!got) continue;
        }
        st = await bb.state();
        const j = st.jellies[0];
        if (j.state === "socketed") { socketed = true; break; }
        // approach from the side OPPOSITE the socket; the boop knocks it the
        // way the booper moves — socket-ward (the 3-1-proven pattern)
        const fromLeft = j.x < sockX;
        const standX = fromLeft ? j.x - 70 : j.x + 70;
        await bb.walkTo("B", (standX - 24) / TILE, { tol: 8, timeout: 5000 }).catch(() => {});
        const driftKey = fromLeft ? kB.right : kB.left;
        await bb.down(driftKey);
        await bb.tap(kB.jump, 140);
        await sleep(600);
        await bb.up(driftKey);
        socketed = await bb.waitFor((s) => s.sockets[0].filled, 2500, "socketed")
          .then(() => true).catch(() => false);
      }
      await bb.waitFor((s) => s.sockets[0].filled, 2000, "jelly locked in the exit socket");
      await bb.waitFor((s) => s.doors.find((d) => d.id === "exit")?.open, 4000, "exit open");
    },
  },
  {
    name: "both robots walk out of the calmed yard",
    fn: async (bb) => {
      await bb.walkTo("M", 85, { tol: 10, timeout: 15000 });
      await bb.walkTo("B", 85, { tol: 10, timeout: 15000 });
      await bb.waitFor((s) => s.complete, 6000, "level complete");
    },
  },
];

// --- 100%-core variant (beat --full) -----------------------------------------
// core0 (17,11) — a hop through the calmed teaching lane's flight band;
// core1 (34,10) — the PLANTED-shield step onto the lane-1 shelf (scrap borrowed
//                 from the still-live gauntlet once lane 1 is calm);
// core2 (55,15) — the storm-duck dip, swept after the yard falls calm.
export const coreSteps = [
  {
    after: "huddle ferry: core A behind M's caught scrap -> fc1 (lane 0 calms)",
    steps: [{
      name: "detour: B hops core 0 out of the calmed flight band",
      fn: async (bb) => {
        const kB = bb.keysFor("B");
        for (let i = 0; i < 6; i++) {
          if ((await bb.state()).coresGot[0]) break;
          await bb.walkTo("B", 17, { tol: 5, timeout: 6000 }).catch(() => {});
          await bb.tap(kB.jump, 320);
          await sleep(700);
        }
        await bb.waitFor((s) => s.coresGot[0], 2000, "core 0 collected");
        await bb.walkTo("B", 24, { tol: 10, timeout: 10000 });
      },
    }],
  },
  {
    after: "fuse-core B huddle-ferried to fc2 (lane 1 calms); both to the x49 checkpoint",
    steps: [{
      name: "detour: M borrows gauntlet scrap, plants a step and climbs the shelf for core 1",
      fn: async (bb) => {
        const mi = bb.idx("M");
        const kM = bb.keysFor("M");
        for (let attempt = 0; attempt < 6; attempt++) {
          let st = await bb.state();
          if (st.coresGot[1]) break;
          if (st.players[mi].dead) { await bb.awaitRespawn("M"); continue; }
          // catch a chunk at the gauntlet's west lip (lane 1 is calm now — the
          // gauntlet is the only live scrap source), then carry it back west
          if (!(st.shield.state === "held" && st.shield.heldBy === mi)) {
            if (st.shield.cd > 0 || st.shield.state === "planted") { await sleep(500); continue; }
            if (!(await tryCatch(bb, 48.9))) continue;
          }
          // walk the CALM lane-1 yard to the shelf's east side; the shield
          // hovers ahead (facing left) — plant it as the climbing step
          await bb.walkTo("M", 37.5, { tol: 5, timeout: 8000 }).catch(() => {});
          await bb.face("M", "left");
          await sleep(500); // hover settles beside the shelf
          st = await bb.state();
          if (!(st.shield.state === "held" && st.shield.heldBy === mi)) continue;
          await bb.act("M"); // PLANT
          await sleep(250);
          if ((await bb.state()).shield.state !== "planted") continue;
          // mount the step (auto-hop), then jump left onto the shelf
          await bb.walkTo("M", 36.4, { tol: 5, timeout: 4000 }).catch(() => {});
          await bb.down(kM.left);
          await bb.tap(kM.jump, 320);
          await sleep(750);
          await bb.up(kM.left);
          const got = await bb.waitFor((s) => s.coresGot[1], 3000, "core 1")
            .then(() => true).catch(() => false);
          if (got) break;
        }
        await bb.waitFor((s) => s.coresGot[1], 2000, "core 1 collected");
        await bb.walkTo("M", 49, { tol: 10, timeout: 15000 }); // back to the calm checkpoint
      },
    }],
  },
  {
    after: "fuse-core C huddle-ferried through the double gauntlet to fc3 — the storm ends",
    steps: [{
      name: "detour: M ducks the dip for core 2 (yard already calm)",
      fn: async (bb) => {
        await bb.walkTo("M", 55, { tol: 5, timeout: 10000 });
        await bb.waitFor((s) => s.coresGot[2], 3000, "core 2 collected");
        await bb.walkTo("M", 73, { tol: 10, timeout: 15000 });
      },
    }],
  },
];
