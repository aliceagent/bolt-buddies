// 3-1 "Attract Mode" — role-parametric walkthrough (W3W4 L31).
// Roles: M = magnet, B = bubble. Input-only, closed-loop (same contract as every
// route: reads state to time REAL key presses, never mutates the scene).
//
// Beats: equip -> M defangs the yard chomper -> M drags 2 crates into a stair
// over the plate wall (both climb it) -> the electric run (M rail-clings the
// steel ceiling, B bubble-rolls the floor) -> the far-switch interleave (M flips
// the magswitch from the floor, B rides the vent updraft to the high power
// lever) -> B boops the zap-jelly into the power socket (opens the exit) -> M
// defangs the doorstep chomper -> both through.
const TILE = 48;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// hold a direction until pred(state) or timeout; releases the key after
async function holdUntil(bb, key, pred, timeout, desc) {
  await bb.down(key);
  try {
    await bb.waitFor(pred, timeout, desc);
  } finally {
    await bb.up(key);
  }
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
    name: "M yanks the yard chomper's teeth (defang #1)",
    fn: async (bb) => {
      const mi = bb.idx("M");
      // B waits by the checkpoint, clear of the lunge range
      await bb.walkTo("B", 10, { tol: 12, timeout: 8000 });
      for (let i = 0; i < 8; i++) {
        const st = await bb.state();
        if (st.chompers[0].defanged) break;
        if (st.players[mi].dead) { await bb.awaitRespawn("M"); continue; }
        // stand inside yank range (210px) of the chomper's live position
        const target = st.chompers[0].tx - 3;
        await bb.walkTo("M", target, { tol: 10, timeout: 6000 }).catch(() => {});
        await bb.act("M");
        await sleep(300);
      }
      await bb.waitFor((s) => s.chompers[0].defanged, 2000, "yard chomper defanged");
    },
  },
  {
    name: "M drags the crates into a stair; both climb the plate wall",
    fn: async (bb) => {
      // latch the LEFT crate by its LIVE position (the defang walk body-pushes
      // the crates around the yard); the right one gets shoved to the wall base
      for (let i = 0; i < 5; i++) {
        const st = await bb.state();
        if (st.crates.some((c) => c.held)) break;
        const left = st.crates.slice().sort((a, b) => a.x - b.x)[0];
        await bb.walkTo("M", left.tx - 0.7, { tol: 6, timeout: 8000 }).catch(() => {});
        await bb.face("M", "right");
        await bb.act("M");
        await bb.waitFor((s) => s.crates.some((c) => c.held), 1200, "latched").catch(() => {});
      }
      await bb.waitFor((s) => s.crates.some((c) => c.held), 2000, "crate latched");
      // walk to the wall base: the free crate is shoved to the wall face while
      // the latched one hovers at head height behind the glove
      await bb.walkTo("M", 18, { tol: 8, timeout: 10000 });
      await bb.face("M", "right");
      await sleep(900); // hover settles over the pushed crate
      await bb.act("M"); // release -> the held crate drops onto the pushed one
      await sleep(1200);
      // verify a usable 2-stack near the wall base (dy one crate, roughly aligned)
      await bb.waitFor((s) => {
        if (s.crates.length < 2 || s.crates.some((c) => c.held)) return false;
        const [a, b] = s.crates.slice().sort((p, q) => q.y - p.y);
        return (a.y - b.y) > 30 && Math.abs(a.x - b.x) < 20 && a.tx > 17;
      }, 3000, "2-crate stair stacked at the wall");
      // both climb: walkTo's auto-hop chains stack -> wall top (core 0) -> steps
      await bb.walkTo("M", 24, { tol: 10, timeout: 25000 });
      await bb.walkTo("B", 24, { tol: 10, timeout: 25000 }); // arms the checkpoint
    },
  },
  {
    name: "electric run: M rail-clings the steel ceiling across",
    fn: async (bb) => {
      const mi = bb.idx("M");
      const kM = bb.keysFor("M");
      // park B out of pickup radius (58px): a mount act pressed a hair short of
      // the rail column would otherwise PICK UP an adjacent buddy (drive-found)
      await bb.walkTo("B", 23, { tol: 6, timeout: 8000 }).catch(() => {});
      for (let attempt = 0; attempt < 4; attempt++) {
        // mount at tile 25 (x~1224): body clear of the col-26 hazard edge
        // (x1250) AND under the rail run (cols 25-35) — the mount probe reads
        // the tile straight overhead
        await bb.walkTo("M", 25, { tol: 5, timeout: 8000 });
        if ((await bb.state()).players[mi].tx < 25.05) continue;
        await bb.act("M");
        const clung = await bb.waitFor((s) => s.players[mi].magCling, 1500, "cling latched")
          .then(() => true).catch(() => false);
        if (!clung) continue;
        // traverse to the rail's far end; drop only past x35.4 so the falling
        // body's LEFT edge clears the tile-34 hazard zone (right edge x1678)
        await holdUntil(bb, kM.right, (s) => s.players[mi].x >= 35 * TILE + 20, 12000, "rail traversed");
        await bb.tap(kM.jump, 90); // drop off the rail
        await bb.waitFor((s) => !s.players[mi].magCling && s.players[mi].grounded, 3000, "dropped clear");
        const p = (await bb.state()).players[mi];
        if (!p.dead && p.tx > 34.8) return;
        if (p.dead) await bb.awaitRespawn("M");
      }
      throw new Error("M never crossed the rail");
    },
  },
  {
    name: "B bubble-rolls the electric floor",
    fn: async (bb) => {
      const bi = bb.idx("B");
      const kB = bb.keysFor("B");
      for (let attempt = 0; attempt < 3; attempt++) {
        await bb.walkTo("B", 24, { tol: 8, timeout: 8000 });
        await bb.waitFor((s) => s.players[bi].bubbleCd <= 0, 6000, "bubble ready");
        await bb.tap(kB.act);
        const up = await bb.waitFor((s) => s.players[bi].bubbleT > 0, 1500, "bubbled")
          .then(() => true).catch(() => false);
        if (!up) continue;
        // 11 tiles at roll speed ~2.2s, well inside the 6s bubble
        await bb.walkTo("B", 36, { tol: 8, timeout: 9000 }).catch(() => {});
        const p = (await bb.state()).players[bi];
        if (!p.dead && p.tx > 34.5) return;
        if (p.dead) await bb.awaitRespawn("B");
      }
      throw new Error("B never crossed the electric floor");
    },
  },
  {
    name: "far switch interleave: M flips the magswitch, B rides the vent to the high lever",
    fn: async (bb) => {
      const bi = bb.idx("B");
      const kB = bb.keysFor("B");
      // M: stand past the rail end (x36 — an ACTION under the rail would re-cling)
      await bb.walkTo("M", 36, { tol: 6, timeout: 8000 });
      for (let i = 0; i < 5; i++) {
        if ((await bb.state()).levers.find((l) => l.id === "msA")?.on) break;
        await bb.face("M", "right");
        await bb.act("M");
        await sleep(300);
      }
      await bb.waitFor((s) => s.levers.find((l) => l.id === "msA")?.on, 2000, "magswitch flipped");
      // M stays put at x36 (west of the vent; the pair never collides)

      // B: wait out the roll bubble, then a FRESH bubble for the full ride
      await bb.waitFor((s) => s.players[bi].bubbleT <= 0 && s.players[bi].bubbleCd <= 0, 12000, "bubble recycled");
      for (let attempt = 0; attempt < 3; attempt++) {
        await bb.walkTo("B", 38, { tol: 4, timeout: 8000 });
        await bb.tap(kB.act);
        const up = await bb.waitFor((s) => s.players[bi].bubbleT > 0, 1500, "bubbled for the ride")
          .then(() => true).catch(() => false);
        if (!up) { await bb.waitFor((s) => s.players[bi].bubbleCd <= 0, 6000, "cd").catch(() => {}); continue; }
        // ride the column; once above the deck top, drift right OUT of the
        // draft (capped at the deck's near half so the arc can't overfly it)
        let onDeck = false;
        const end = Date.now() + 9000;
        while (Date.now() < end) {
          const p = (await bb.state()).players[bi];
          if (p.dead) break;
          if (p.y < 8 * TILE - 4 && p.x < 39.3 * TILE) await bb.down(kB.right);
          else await bb.up(kB.right);
          if (p.grounded && p.y < 8.6 * TILE && p.tx > 38.6 && p.tx < 42.5) { onDeck = true; break; }
          await sleep(50);
        }
        await bb.up(kB.right);
        if (onDeck) break;
        const p = (await bb.state()).players[bi];
        if (p.dead) await bb.awaitRespawn("B");
        // pop a lingering bubble so the next mount starts grounded
        if (p.bubbleT > 0) { await bb.tap(kB.act); await sleep(300); }
        await bb.waitFor((s) => s.players[bi].bubbleCd <= 0, 6000, "cd for retry").catch(() => {});
        if (attempt === 2) throw new Error("B never landed on the coil deck");
      }
      // deck run: core 2 on the way to the power lever
      await bb.walkTo("B", 40, { tol: 6, timeout: 8000 });
      for (let i = 0; i < 4; i++) {
        if ((await bb.state()).levers.find((l) => l.id === "lvA")?.on) break;
        await bb.act("B");
        await sleep(250);
        await bb.walkTo("B", 40, { tol: 5, timeout: 3000 }).catch(() => {});
      }
      await bb.waitFor((s) => s.levers.find((l) => l.id === "lvA")?.on, 2000, "high power lever pulled");
      await bb.waitFor((s) => s.doors.find((d) => d.id === "g2")?.open, 4000, "g2 open");
      // both through the gate to the yard checkpoint
      await bb.walkTo("B", 45, { tol: 10, timeout: 12000 });
      await bb.walkTo("M", 45, { tol: 10, timeout: 12000 });
    },
  },
  {
    name: "B boops the zap-jelly into the power socket (exit powered)",
    fn: async (bb) => {
      const bi = bb.idx("B");
      const kB = bb.keysFor("B");
      const sockX = 55 * TILE + 24;
      // M parks at the checkpoint, outside the jelly patrol
      await bb.walkTo("M", 44, { tol: 8, timeout: 6000 }).catch(() => {});
      let socketed = false;
      for (let i = 0; i < 12 && !socketed; i++) {
        let st = await bb.state();
        if (st.sockets[0].filled) { socketed = true; break; }
        if (st.players[bi].dead) { await bb.awaitRespawn("B"); continue; }
        // always bubbled BEFORE approaching the patrol (bare contact = zap)
        if (st.players[bi].bubbleT <= 0) {
          const clear = st.players[bi].tx < 46.5;
          if (!clear) await bb.walkTo("B", 46, { tol: 8, timeout: 5000 }).catch(() => {});
          await bb.waitFor((s) => s.players[bi].bubbleCd <= 0, 6000, "bubble ready").catch(() => {});
          await bb.tap(kB.act);
          const got = await bb.waitFor((s) => s.players[bi].bubbleT > 0, 1500, "bubbled")
            .then(() => true).catch(() => false);
          if (!got) continue;
        }
        st = await bb.state();
        const j = st.jellies[0];
        if (j.state === "socketed") { socketed = true; break; }
        // approach from the side OPPOSITE the socket and jump-drift INTO the
        // jelly: the boop knocks it the way the booper moves — socket-ward
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
      await bb.waitFor((s) => s.sockets[0].filled, 2000, "jelly locked in the socket");
      await bb.waitFor((s) => s.doors.find((d) => d.id === "exit")?.open, 4000, "exit powered open");
    },
  },
  {
    name: "M defangs the doorstep chomper; both finish",
    fn: async (bb) => {
      const mi = bb.idx("M");
      for (let i = 0; i < 8; i++) {
        const st = await bb.state();
        if (st.chompers[1].defanged) break;
        if (st.players[mi].dead) { await bb.awaitRespawn("M"); continue; }
        await bb.walkTo("M", st.chompers[1].tx - 3, { tol: 10, timeout: 8000 }).catch(() => {});
        await bb.act("M");
        await sleep(300);
      }
      await bb.waitFor((s) => s.chompers[1].defanged, 2000, "doorstep chomper defanged");
      await bb.walkTo("M", 61, { tol: 10, timeout: 12000 });
      await bb.walkTo("B", 61, { tol: 10, timeout: 15000 });
      await bb.waitFor((s) => s.complete, 6000, "level complete");
    },
  },
];

// --- 100%-core variant (beat --full) -----------------------------------------
// All three cores sit ON the taught lanes, each gated by its skill beat:
//   core0 (20,9)  — over the plate-wall top (the crate-stair climb crosses it)
//   core1 (30,12) — mid-rail under the cling line (rail traverse / bubble roll)
//   core2 (39,7)  — on the coil deck (the updraft ride's landing run)
// The base route sweeps all three (coreprobe-style: no detours needed), so the
// core variant adds no extra steps — the pre-exit assertion does the checking.
export const coreSteps = [];
