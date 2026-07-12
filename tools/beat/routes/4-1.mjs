// 4-1 "Lights Out" — role-parametric walkthrough (W3W4 L41).
// Roles: F = time-freeze, B = light-beam. Input-only, closed-loop (same contract
// as every route: reads state to time REAL key presses, never mutates the scene).
//
// Beats: equip -> B REVEALS the ghost run with the beam (the teach assertion) ->
// both hop the three invisible platforms over the dark pit -> B herds the Gloomy
// off plate pl1 with the beam and stands the freed plate (gd1 latches open) ->
// F freezes the rotating bridge flat on a near-level pose, both cross inside the
// 5s hold -> the lonely dark corridor (B leads, beam lit, past the roaming
// gloomy) -> F freezes the Ticker's dash lane, both walk to the exit.
const TILE = 48;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();
const deg = (r) => ((r * 180) / Math.PI);
// the rotating bridge is "near flat" when its bar sits within 12deg of level
const nearFlat = (angle) => {
  const a = ((deg(angle) % 180) + 180) % 180;
  return a < 12 || a > 168;
};

// One drift-hop: standing jump at the current spot, drift toward `dir`, release
// the drift once past `releaseX` (world px) so the lander settles on the 2-wide
// tread instead of sailing into the next gap. Returns once grounded/dead/timeout.
async function driftHop(bb, role, releaseX, jumpHold = 320, dir = "right") {
  const i = bb.idx(role);
  const k = bb.keysFor(role);
  const dKey = dir === "right" ? k.right : k.left;
  const past = (x) => (dir === "right" ? x >= releaseX : x <= releaseX);
  const t0 = now();
  await bb.down(k.jump);
  await sleep(160);
  await bb.down(dKey);
  let jumpUp = false;
  let drifting = true;
  const end = now() + 1600;
  try {
    while (now() < end) {
      if (!jumpUp && now() - t0 > jumpHold) { await bb.up(k.jump); jumpUp = true; }
      const p = (await bb.state()).players[i];
      if (p.dead) break;
      if (drifting && past(p.x)) { await bb.up(dKey); drifting = false; }
      // landed (on target OR short back on the same tread): stop — the caller's
      // closed loop re-reads the position, so a short hop is simply re-issued
      // instead of drift-walking off the tread edge into the pit
      if (jumpUp && p.grounded && now() - t0 > jumpHold + 200) break;
      await sleep(30);
    }
  } finally {
    await bb.up(k.jump);
    await bb.up(dKey);
  }
  await sleep(120);
}
const hopRight = (bb, role, releaseX, jumpHold = 320) => driftHop(bb, role, releaseX, jumpHold, "right");

// Mount the 1-tile plate podium at x36 (walkTo's auto-hop can OVERFLY a lone
// stub — its arrival check fires mid-air over the target). Closed-loop: square
// up on whichever side the robot stands, standing-jump + drift onto the top.
async function mountPodium(bb, role) {
  const i = bb.idx(role);
  for (let m = 0; m < 6; m++) {
    const p = (await bb.state()).players[i];
    if (p.dead) { await bb.awaitRespawn(role); continue; }
    if (p.grounded && p.ty < 13.1 && Math.abs(p.tx - 36.5) < 0.75) return true; // on top
    if (p.tx < 36.5) {
      await bb.walkTo(role, 35.3, { tol: 6, timeout: 5000 }).catch(() => {});
      await driftHop(bb, role, 36.2 * TILE, 300, "right");
    } else {
      await bb.walkTo(role, 37.7, { tol: 6, timeout: 5000 }).catch(() => {});
      await driftHop(bb, role, 36.8 * TILE, 300, "left");
    }
  }
  return false;
}

// Cross the unlit ghost run (pit x16-24; treads at x17-18/ty~12.5, x20-21/
// ty~11.5, x23-24/ty~12.5). Closed-loop by live position: each pass looks at
// where the robot stands and issues the next hop; a pit death respawns at the
// x11 checkpoint and the loop walks back in.
async function crossGhostRun(bb, role) {
  const i = bb.idx(role);
  for (let pass = 0; pass < 24; pass++) {
    const st = await bb.state();
    const p = st.players[i];
    if (p.dead) { await bb.awaitRespawn(role); continue; }
    if (p.tx > 25.2 && p.ty > 12.8 && p.grounded) return; // across, on solid ground
    if (!p.grounded) { await sleep(150); continue; }
    if (p.ty > 12.8 && p.tx < 16) {
      // west floor: square up on the pit lip, hop to tread 1 (release over x17.5)
      await bb.walkTo(role, 15, { tol: 5, timeout: 8000 }).catch(() => {});
      const q = (await bb.state()).players[i];
      if (q.dead || q.tx < 14.5 || q.tx > 15.6) continue;
      await hopRight(bb, role, 17.5 * TILE);
    } else if (p.ty > 12 && p.ty < 13 && p.tx < 19.4) {
      // tread 1: hop up to tread 2 (release over x20.5)
      await bb.walkTo(role, 18, { tol: 6, timeout: 4000 }).catch(() => {});
      await hopRight(bb, role, 20.5 * TILE, 360);
    } else if (p.ty < 12 && p.tx < 22.4) {
      // tread 2 (core 0 overhead): hop down to tread 3 (release over x23.5)
      await bb.walkTo(role, 21, { tol: 6, timeout: 4000 }).catch(() => {});
      await hopRight(bb, role, 23.5 * TILE, 260);
    } else if (p.ty > 12 && p.ty < 13 && p.tx >= 22.4) {
      // tread 3: hop off to the east floor
      await bb.walkTo(role, 24, { tol: 6, timeout: 4000 }).catch(() => {});
      await hopRight(bb, role, 25.5 * TILE, 260);
    } else {
      // odd spot (edge lip / mid-slide): nudge toward the run and re-read
      await bb.walkTo(role, Math.min(24, Math.round(p.tx) + 1), { tol: 8, timeout: 3000 }).catch(() => {});
    }
  }
  throw new Error(`${role} never crossed the ghost run`);
}

// Wait until the freeze skill is ready, a near-flat bridge pose arrives, then
// cast. Returns true once the world is frozen.
async function freezeOnFlat(bb, fRole) {
  const fi = bb.idx(fRole);
  const kF = bb.keysFor(fRole);
  await bb.waitFor((s) => s.players[fi].freezeCd <= 0, 16000, "freeze cooldown ready");
  await bb.waitFor((s) => nearFlat(s.rotbridges[0].angle), 16000, "bridge near flat");
  await bb.tap(kF.act);
  return bb.waitFor((s) => s.frozen, 1500, "world frozen").then(() => true).catch(() => false);
}

export default [
  {
    name: "equip skills -> gate opens",
    fn: async (bb) => {
      await bb.equip("F", 3);
      await bb.equip("B", 6);
      await bb.waitFor((s) => s.doors.find((d) => d.id === "gate")?.open, 5000, "gate open");
      // both to the x11 checkpoint (arms the pit-side respawn)
      await bb.walkTo("F", 11, { tol: 10, timeout: 8000 });
      await bb.walkTo("B", 12, { tol: 10, timeout: 8000 });
    },
  },
  {
    name: "B reveals the ghost run with the beam (teach station 1)",
    fn: async (bb) => {
      const bi = bb.idx("B");
      const kB = bb.keysFor("B");
      // stand on the pit lip, shine right: the treads materialize in the cone
      await bb.walkTo("B", 14.6, { tol: 6, timeout: 8000 });
      await bb.face("B", "right");
      await bb.down(kB.act);
      try {
        await bb.waitFor((s) => s.players[bi].beamOn, 1500, "beam ignites");
        await bb.waitFor((s) => s.ghosts[0].lit > 0 && s.ghosts[0].alpha > 0.5, 2500, "tread 1 revealed by the cone");
      } finally {
        await bb.up(kB.act);
      }
    },
  },
  {
    name: "both hop the invisible platforms over the dark pit",
    fn: async (bb) => {
      // B is already on the lip; it crosses first (sweeps core 0's tread line),
      // then F follows the same closed-loop hop chain.
      await crossGhostRun(bb, "B");
      await crossGhostRun(bb, "F");
      // both to the x28 checkpoint
      await bb.walkTo("B", 28, { tol: 10, timeout: 8000 });
      await bb.walkTo("F", 28, { tol: 10, timeout: 8000 });
    },
  },
  {
    name: "B herds the Gloomy off the switch; plate opens gd1 (latched)",
    fn: async (bb) => {
      const bi = bb.idx("B");
      const kB = bb.keysFor("B");
      // F waits at the checkpoint, out of the dark
      await bb.walkTo("F", 28, { tol: 10, timeout: 6000 }).catch(() => {});
      for (let attempt = 0; attempt < 6; attempt++) {
        const st = await bb.state();
        if (st.doors.find((d) => d.id === "gd1")?.open) break;
        if (st.players[bi].dead) { await bb.awaitRespawn("B"); continue; }
        // stand west of the podium (x33: cone reach 310px covers the x36 post,
        // gap > glow radius so the seated guard stays put until beamed)
        await bb.walkTo("B", 33, { tol: 6, timeout: 8000 }).catch(() => {});
        await bb.face("B", "right");
        await bb.down(kB.act);
        let herded = false;
        try {
          // drive the blob a FULL cone-length off its post before advancing
          herded = await bb.waitFor(
            (s) => Math.abs(s.gloomies[0].x - s.gloomies[0].homeX) > 180,
            5000, "gloomy herded well off the plate").then(() => true).catch(() => false);
          if (herded) {
            // advance to the podium base WITH the beam still lit — anything
            // drifting back into the cone gets the fast 175px/s flee
            await bb.walkTo("B", 35.3, { tol: 6, timeout: 5000 }).catch(() => {});
          }
        } finally {
          await bb.up(kB.act);
        }
        if (!herded) {
          // battery may be drained — douse and let it recharge
          await bb.waitFor((s) => s.players[bi].beamMs > 3500, 10000, "battery recharged").catch(() => {});
          continue;
        }
        // stand the freed plate (deterministic podium mount) — the robot's own
        // glow then blocks the blob's return
        await mountPodium(bb, "B");
        await bb.waitFor((s) => s.plates.find((p) => p.id === "pl1")?.active, 4000, "plate pressed").catch(() => {});
      }
      await bb.waitFor((s) => s.doors.find((d) => d.id === "gd1")?.open, 3000, "gd1 open (latched)");
      // both through to the x43 checkpoint (gd1 is latched — order-free)
      await bb.walkTo("B", 43, { tol: 10, timeout: 10000 });
      await bb.walkTo("F", 43, { tol: 10, timeout: 12000 });
    },
  },
  {
    name: "F freezes the rotating bridge flat; both cross",
    fn: async (bb) => {
      const fi = bb.idx("F");
      const bi = bb.idx("B");
      for (let attempt = 0; attempt < 5; attempt++) {
        let st = await bb.state();
        if (st.players[fi].dead) { await bb.awaitRespawn("F"); continue; }
        if (st.players[bi].dead) { await bb.awaitRespawn("B"); continue; }
        const fEast = st.players[fi].tx > 50.5;
        const bEast = st.players[bi].tx > 50.5;
        if (fEast && bEast) break;
        // park every west-side robot at the bridge lip (bar west end overlaps
        // the x45 ground tile; the pit starts at x46)
        if (!fEast) await bb.walkTo("F", 44.6, { tol: 6, timeout: 8000 }).catch(() => {});
        if (!bEast) await bb.walkTo("B", 43.6, { tol: 6, timeout: 8000 }).catch(() => {});
        const froze = await freezeOnFlat(bb, "F");
        if (!froze) continue;
        // cross inside the 5s hold (walkTo's auto-hop mounts the 30px bar lip);
        // stragglers get another freeze next attempt
        const walkers = [];
        if (!fEast) walkers.push(bb.walkTo("F", 52, { tol: 8, timeout: 4600 }).catch(() => {}));
        if (!bEast) walkers.push(bb.walkTo("B", 52, { tol: 8, timeout: 4600 }).catch(() => {}));
        await Promise.all(walkers);
      }
      const st = await bb.state();
      if (!(st.players[fi].tx > 50.5 && st.players[bi].tx > 50.5)) {
        throw new Error("both robots never crossed the frozen bridge");
      }
      // arm the x52 checkpoint
      await bb.walkTo("F", 52, { tol: 8, timeout: 6000 }).catch(() => {});
      await bb.walkTo("B", 52, { tol: 8, timeout: 6000 }).catch(() => {});
    },
  },
  {
    name: "the lonely corridor: B leads with the beam past the roaming gloomy",
    fn: async (bb) => {
      const bi = bb.idx("B");
      const kB = bb.keysFor("B");
      // B walks the dark corridor with the cone lit (sweeps core 2 at x57; the
      // roaming gloomy hovers over the path and shies off the glow — the beam
      // keeps it dazzled and clear even if it drifts low)
      await bb.face("B", "right");
      await bb.down(kB.act);
      try {
        await bb.walkTo("B", 62.8, { tol: 6, timeout: 12000 });
      } finally {
        await bb.up(kB.act);
      }
      let p = (await bb.state()).players[bi];
      if (p.dead) { await bb.awaitRespawn("B"); await bb.walkTo("B", 62.8, { tol: 6, timeout: 12000 }); }
      // F follows (its own glow repels the unseated blob)
      await bb.walkTo("F", 61.8, { tol: 6, timeout: 12000 });
      const fi = bb.idx("F");
      p = (await bb.state()).players[fi];
      if (p.dead) { await bb.awaitRespawn("F"); await bb.walkTo("F", 61.8, { tol: 6, timeout: 12000 }); }
    },
  },
  {
    name: "F freezes the Ticker's lane; both walk to the exit",
    fn: async (bb) => {
      const fi = bb.idx("F");
      const bi = bb.idx("B");
      const kF = bb.keysFor("F");
      for (let attempt = 0; attempt < 5; attempt++) {
        let st = await bb.state();
        if (st.complete) return;
        if (st.players[fi].dead) { await bb.awaitRespawn("F"); }
        if (st.players[bi].dead) { await bb.awaitRespawn("B"); }
        // stage both just west of the dash lane (patrol min x65 + 34px reach)
        await bb.walkTo("B", 62.8, { tol: 6, timeout: 10000 }).catch(() => {});
        await bb.walkTo("F", 61.8, { tol: 6, timeout: 10000 }).catch(() => {});
        st = await bb.state();
        if (st.players[fi].dead || st.players[bi].dead) continue;
        await bb.waitFor((s) => s.players[fi].freezeCd <= 0, 16000, "freeze ready at the lane").catch(() => {});
        await bb.tap(kF.act);
        const froze = await bb.waitFor((s) => s.frozen, 1500, "lane frozen").then(() => true).catch(() => false);
        if (!froze) continue;
        // the statue is SAFE — both hurry through the lane into the exit zone
        await Promise.all([
          bb.walkTo("F", 73, { tol: 10, timeout: 4600 }).catch(() => {}),
          bb.walkTo("B", 73, { tol: 10, timeout: 4600 }).catch(() => {}),
        ]);
        const done = await bb.waitFor((s) => s.complete, 2500, "level complete").then(() => true).catch(() => false);
        if (done) return;
        // a straggler at thaw: anyone short of the exit zone but PAST the lane
        // (x71+) is out of patrol reach and just finishes the walk
        st = await bb.state();
        if (st.players[fi].tx > 70.8 && st.players[bi].tx > 70.8) {
          await bb.walkTo("F", 73, { tol: 8, timeout: 5000 }).catch(() => {});
          await bb.walkTo("B", 73, { tol: 8, timeout: 5000 }).catch(() => {});
          const ok = await bb.waitFor((s) => s.complete, 3000, "level complete").then(() => true).catch(() => false);
          if (ok) return;
        }
      }
      await bb.waitFor((s) => s.complete, 4000, "level complete");
    },
  },
];

// --- 100%-core variant (beat --full) -----------------------------------------
// All three cores sit ON the taught lanes, each gated by its skill beat:
//   core0 (20,11) — over the middle ghost tread (the hop chain lands on it)
//   core1 (32,13) — on the dark floor of the gloomy station (walked through)
//   core2 (57,13) — on the corridor floor past the bridge (walked through)
// The base route sweeps all three (coreprobe-style: no detours needed), so the
// core variant adds no extra steps — the pre-exit assertion does the checking.
export const coreSteps = [];
