// 3-2 "The Flooded Tank" — role-parametric walkthrough (W3W4 L32).
// Roles: M = magnet (the deck lane), B = bubble (the swimmer). Input-only,
// closed-loop (same contract as every route: reads state to time REAL key
// presses, never mutates the scene).
//
// The relay, beat by beat: equip -> both wade the teaching pool -> both climb
// to the tank deck -> B dives gap G1 and bubbles up (the dive suit) -> M flips
// ms1 (baffle 1 latches open) -> B rides section A's current through, dips for
// the KEY against section B's pumps -> M rail-clings over the electrified deck
// run and works the TIMED baffle 2 with B staged at the door (the squeeze) ->
// B boops the zap-jelly into the underwater socket -> B delivers the key to
// the tank-bottom lock and surfaces in the escape chamber -> M defangs the
// lifeguard chomper, flips the last switch (msD), drops to the winch ledge and
// DOWN+ACTION-reels B up the sheer ascent -> both through the exit.
const TILE = 48;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Closed-loop bubbled swim to a tile target. Keeps the swimmer ALIVE first
// (re-bubbles the moment the shield is down and the cooldown allows — the
// 2.2s cooldown always beats the 6s air timer), steers with held keys, and
// re-dives through `opts.dive` (a deck gap column) after a beach/respawn.
// Never presses ACT while bubbled (that would pop the suit).
// (exported: the 3-2 softlock scenarios drive the same swimmer primitives)
export async function swimTo(bb, role, txTile, tyTile, opts = {}) {
  const i = bb.idx(role);
  const k = bb.keysFor(role);
  const tx = txTile * TILE + 24;
  const ty = tyTile * TILE + 24;
  const tol = opts.tol ?? 26;
  const timeout = opts.timeout ?? 25000;
  const end = Date.now() + timeout;
  const rel = async () => { for (const key of [k.left, k.right, k.jump, k.down]) await bb.up(key); };
  while (Date.now() < end) {
    let st = await bb.state();
    if (st.complete) { await rel(); return true; }
    let p = st.players[i];
    if (p.dead) { await rel(); await bb.awaitRespawn(role); continue; }
    // beached (deck/ground, not in the water): bubble up if the walk crosses
    // the electric strip, then walk into the dive gap and fall in
    if (!p.inWater && p.grounded && p.ty < 8.5) {
      await rel();
      const dive = (opts.dive ?? (p.tx > 40 ? 43.5 : 27.5));
      if (p.tx > 47 && dive < 47) {
        // west past the electric run needs the rolling bubble
        if (p.bubbleT <= 0) {
          await bb.waitFor((s) => s.players[i].bubbleCd <= 0, 6000, "bubble ready for the roll").catch(() => {});
          await bb.tap(k.act);
          await sleep(250);
        }
      }
      await bb.walkTo(role, dive, { tol: 10, timeout: 12000 }).catch(() => {});
      await bb.waitFor((s) => s.players[i].inWater || s.players[i].dead, 5000, "splashed in").catch(() => {});
      continue;
    }
    // bubble upkeep (the dive suit)
    if (p.inWater && p.bubbleT <= 0) {
      if (p.bubbleCd <= 0) { await bb.tap(k.act); await sleep(120); continue; }
      // sinking on cooldown: hold position keys anyway; air (6s) >> cd (2.2s)
    }
    const dx = tx - p.x;
    const dy = ty - p.y;
    if (Math.abs(dx) <= tol && Math.abs(dy) <= 30) { await rel(); return true; }
    if (dx > tol) { await bb.up(k.left); await bb.down(k.right); }
    else if (dx < -tol) { await bb.up(k.right); await bb.down(k.left); }
    else { await bb.up(k.left); await bb.up(k.right); }
    // obstacle rise: pinned against a wall/ridge in the travel direction ->
    // swim UP over it (the water version of walkTo's auto-hop)
    const pinned = (dx > tol && p.blocked.right) || (dx < -tol && p.blocked.left);
    if (pinned) { await bb.up(k.down); await bb.down(k.jump); }
    else if (dy < -22) { await bb.up(k.down); await bb.down(k.jump); }
    else if (dy > 22) { await bb.up(k.jump); await bb.down(k.down); }
    else { await bb.up(k.jump); await bb.up(k.down); }
    await sleep(55);
  }
  await rel();
  throw new Error(`swimTo ${role} -> (${txTile},${tyTile}) timed out`);
}

// Pop a lingering bubble so the next mount/walk starts clean (act = release).
async function popIfBubbled(bb, role) {
  const i = bb.idx(role);
  const p = (await bb.state()).players[i];
  if (p.bubbleT > 0) { await bb.tap(bb.keysFor(role).act); await sleep(250); }
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
    name: "both wade the teaching pool to the stairs checkpoint",
    fn: async (bb) => {
      // the 2-deep pool: the air ring ticks, the steps walk you out (core 0 is
      // swept on the wade). walkTo's auto-hop handles the exit steps in water.
      await bb.walkTo("B", 17, { tol: 10, timeout: 20000 });
      await bb.walkTo("M", 17, { tol: 10, timeout: 20000 }); // arms the checkpoint
    },
  },
  {
    name: "both climb to the tank deck; M jumps the dive gap",
    fn: async (bb) => {
      // stairs: 2-rise blocks, auto-hop chains them to the deck (stand row 6)
      await bb.walkTo("M", 25, { tol: 8, timeout: 20000 });
      await bb.walkTo("B", 25, { tol: 8, timeout: 20000 });
      const mi = bb.idx("M");
      await bb.waitFor((s) => s.players[mi].ty < 7 && s.players[mi].grounded, 4000, "M on deck");
      // M leaps dive gap G1 (cols 27-28) — the swimmer's hole, the walker's jump
      await bb.runJump("M", 26, "right", { landTile: 29, runup: 2 });
    },
  },
  {
    name: "B dives gap G1, bubbles up and stages at baffle 1",
    fn: async (bb) => {
      const bi = bb.idx("B");
      // walk off the deck into G1 (27-28) — the splash is the commitment
      await bb.walkTo("B", 28, { tol: 20, timeout: 8000 }).catch(() => {});
      await bb.waitFor((s) => s.players[bi].inWater || s.players[bi].dead, 5000, "B in the tank").catch(() => {});
      // stage just west of the closed baffle 1 (col 40), mid-depth
      await swimTo(bb, "B", 38.5, 11, { dive: 27.5 });
    },
  },
  {
    name: "M flips ms1 — baffle 1 latches open",
    fn: async (bb) => {
      await bb.walkTo("M", 37, { tol: 6, timeout: 10000 });
      for (let i = 0; i < 5; i++) {
        if ((await bb.state()).levers.find((l) => l.id === "ms1")?.on) break;
        await bb.face("M", "right");
        await bb.act("M");
        await sleep(300);
      }
      await bb.waitFor((s) => s.levers.find((l) => l.id === "ms1")?.on, 2000, "ms1 flipped");
      await bb.waitFor((s) => s.doors.find((d) => d.id === "baf1")?.open, 4000, "baffle 1 open");
    },
  },
  {
    name: "B rides the current through baffle 1 and dives for the KEY",
    fn: async (bb) => {
      // through the opened baffle into section B (the pumps push back at -60;
      // the keyed swim overpowers them), then the deep dip to the key (48,15)
      await swimTo(bb, "B", 45, 11, { dive: 27.5, timeout: 30000 });
      for (let att = 0; att < 3; att++) {
        if ((await bb.state()).keysHeld > 0) break;
        await swimTo(bb, "B", 48, 14.6, { dive: 43.5, tol: 20, timeout: 25000 });
        const got = await bb.waitFor((s) => s.keysHeld > 0, 2500, "key grabbed")
          .then(() => true).catch(() => false);
        if (got) break;
      }
      await bb.waitFor((s) => s.keysHeld > 0, 2000, "the key is aboard");
      // stage at the timed baffle 2 (col 57), clear of its leaf
      await swimTo(bb, "B", 55, 11, { dive: 43.5, timeout: 25000 });
    },
  },
  {
    name: "M rail-clings over the electrified deck run",
    fn: async (bb) => {
      const mi = bb.idx("M");
      const kM = bb.keysFor("M");
      // park B under water, clear of anything M's act could target (it's 40+
      // tiles away — this is just the staging read)
      for (let attempt = 0; attempt < 4; attempt++) {
        // a death respawns M west of gap G2 — always re-approach via the jump,
        // never a blind walk (a walked G2 is a splash into section B)
        const at = (await bb.state()).players[mi];
        if (at.tx < 44.5) {
          await bb.walkTo("M", 42, { tol: 8, timeout: 15000 });
          await bb.runJump("M", 42, "right", { landTile: 45, runup: 2 }); // G2 (43-44)
        }
        // mount at col 47: under the rail run (47-54), 2 clean tiles west of
        // the 49-51 hazard strip; the mount probe reads the tiles overhead
        await bb.walkTo("M", 47, { tol: 5, timeout: 8000 });
        await bb.act("M");
        const clung = await bb.waitFor((s) => s.players[mi].magCling, 1500, "cling latched")
          .then(() => true).catch(() => false);
        if (!clung) continue;
        // traverse to the far end; drop only past x53 so the falling body
        // clears the tile-52 hazard zone
        await bb.down(kM.right);
        await bb.waitFor((s) => s.players[mi].x >= 53 * TILE + 20, 12000, "rail traversed").catch(() => {});
        await bb.up(kM.right);
        await bb.tap(kM.jump, 90); // drop off the rail
        await bb.waitFor((s) => !s.players[mi].magCling && s.players[mi].grounded, 3000, "dropped clear").catch(() => {});
        const p = (await bb.state()).players[mi];
        if (!p.dead && p.tx > 52.6) return;
        if (p.dead) await bb.awaitRespawn("M");
      }
      throw new Error("M never crossed the electrified deck run");
    },
  },
  {
    name: "the timed baffle 2 squeeze: M flips ms2, B slips through the window",
    fn: async (bb) => {
      const bi = bb.idx("B");
      const kB = bb.keysFor("B");
      await bb.walkTo("M", 55, { tol: 5, timeout: 8000 }); // arms cp3, ms2 at 56
      for (let attempt = 0; attempt < 5; attempt++) {
        let st = await bb.state();
        if (st.players[bi].tx > 58.5) break; // already through
        // stage B tight to the leaf so the dash is short
        await swimTo(bb, "B", 55.5, 11, { dive: 43.5, timeout: 15000 }).catch(() => {});
        // make sure B's suit won't pop mid-dash
        st = await bb.state();
        if (st.players[bi].bubbleT > 0 && st.players[bi].bubbleT < 1600) {
          await bb.waitFor((s) => s.players[bi].bubbleT <= 0, 3000, "worn bubble out").catch(() => {});
        }
        st = await bb.state();
        if (st.players[bi].inWater && st.players[bi].bubbleT <= 0) {
          await bb.waitFor((s) => s.players[bi].bubbleCd <= 0, 6000, "fresh bubble ready").catch(() => {});
          await bb.tap(kB.act);
          await sleep(200);
        }
        // flip (or re-flip — the timed switch pops back out after the window)
        const ms2 = (await bb.state()).levers.find((l) => l.id === "ms2");
        if (!ms2.on) {
          await bb.face("M", "right");
          await bb.act("M");
        }
        const open = await bb.waitFor((s) => s.doors.find((d) => d.id === "baf2")?.open, 3000, "baffle 2 open")
          .then(() => true).catch(() => false);
        if (!open) continue;
        // the dash: ~4 tiles through the doorway inside the 7s window
        await swimTo(bb, "B", 60, 11, { dive: 43.5, timeout: 6500 }).catch(() => {});
        if ((await bb.state()).players[bi].tx > 58.5) break;
        // missed the window — wait for the leaf to re-arm, then go again
        await bb.waitFor((s) => !s.doors.find((d) => d.id === "baf2")?.open && !s.levers.find((l) => l.id === "ms2")?.on,
          10000, "baffle 2 re-armed").catch(() => {});
        if (attempt === 4) throw new Error("B never got through the timed baffle");
      }
    },
  },
  {
    name: "B boops the zap-jelly into the underwater socket",
    fn: async (bb) => {
      const bi = bb.idx("B");
      const kB = bb.keysFor("B");
      for (let i = 0; i < 12; i++) {
        let st = await bb.state();
        if (st.sockets[0].filled) break;
        if (st.players[bi].dead) { await bb.awaitRespawn("B"); continue; }
        const p = st.players[bi];
        // never approach the patrol without a healthy suit (bare contact = zap)
        if (!p.inWater || p.bubbleT < 1400) {
          if (p.inWater && p.bubbleT > 0 && p.bubbleT < 1400) {
            // back off west and let it pop
            await swimTo(bb, "B", 58.5, 10, { dive: 43.5, timeout: 8000 }).catch(() => {});
            await bb.waitFor((s) => s.players[bi].bubbleT <= 0, 3500, "bubble worn out").catch(() => {});
          }
          await swimTo(bb, "B", 58.5, 10, { dive: 43.5, timeout: 15000 }).catch(() => {});
          continue; // swimTo's upkeep re-bubbles; loop re-reads
        }
        st = await bb.state();
        const j = st.jellies[0];
        if (j.state === "socketed") break;
        // approach from the WEST of the jelly and swim INTO it moving east —
        // the boop knocks it the way the booper moves, socket-ward (65,13)
        await swimTo(bb, "B", j.tx - 1.6, 12, { dive: 43.5, timeout: 8000, tol: 18 }).catch(() => {});
        await bb.down(kB.right);
        await sleep(650);
        await bb.up(kB.right);
        const filled = await bb.waitFor((s) => s.sockets[0].filled, 2500, "socketed")
          .then(() => true).catch(() => false);
        if (filled) break;
      }
      await bb.waitFor((s) => s.sockets[0].filled, 2000, "jelly locked in the socket");
    },
  },
  {
    name: "B delivers the key: the tank-bottom lock opens into the chamber",
    fn: async (bb) => {
      const bi = bb.idx("B");
      // swim into the lock's key zone (col 66, rows 14-16): the carried key
      // turns it (sock1 already powers it) and the door latches open
      await swimTo(bb, "B", 66, 15, { dive: 43.5, tol: 18, timeout: 25000 });
      await bb.waitFor((s) => s.doors.find((d) => d.id === "tanklock")?.open, 6000, "tanklock open");
      // through the doorway — B falls out of the water into the dry chamber
      const kB = bb.keysFor("B");
      await bb.down(kB.right);
      await bb.waitFor((s) => !s.players[bi].inWater && s.players[bi].tx > 67, 8000, "B in the chamber").catch(() => {});
      await bb.up(kB.right);
      await popIfBubbled(bb, "B"); // no bouncing off the chamber floor
      await bb.waitFor((s) => s.players[bi].grounded, 4000, "B down").catch(() => {});
      await bb.walkTo("B", 70, { tol: 8, timeout: 8000 }); // the reel stance (clear of the sump)
    },
  },
  {
    name: "M defangs the lifeguard chomper and flips the last switch",
    fn: async (bb) => {
      const mi = bb.idx("M");
      for (let i = 0; i < 8; i++) {
        const st = await bb.state();
        if (st.chompers[0].defanged) break;
        if (st.players[mi].dead) {
          await bb.awaitRespawn("M");
          // respawn is at cp3 (55,6) — already on the right side of the rail run
          continue;
        }
        // stand inside yank range (210px) of the chomper's live position
        await bb.walkTo("M", st.chompers[0].tx - 3, { tol: 10, timeout: 8000 }).catch(() => {});
        await bb.act("M");
        await sleep(300);
      }
      await bb.waitFor((s) => s.chompers[0].defanged, 2000, "lifeguard defanged");
      await bb.walkTo("M", 64, { tol: 6, timeout: 8000 });
      for (let i = 0; i < 5; i++) {
        if ((await bb.state()).levers.find((l) => l.id === "msD")?.on) break;
        await bb.face("M", "right");
        await bb.act("M");
        await sleep(300);
      }
      await bb.waitFor((s) => s.levers.find((l) => l.id === "msD")?.on, 2000, "msD flipped");
    },
  },
  {
    name: "the winch: M drops to the ledge and reels B up the ascent",
    fn: async (bb) => {
      const bi = bb.idx("B");
      const mi = bb.idx("M");
      // M walks off the deck's east end (col 73) and lands on the winch ledge
      await bb.walkTo("M", 75, { tol: 8, timeout: 12000 });
      await bb.waitFor((s) => s.players[mi].ty > 10 && s.players[mi].grounded, 4000, "M on the winch ledge");
      for (let attempt = 0; attempt < 5; attempt++) {
        const st = await bb.state();
        if (st.players[bi].ty < 12 && st.players[bi].grounded) break; // B already up
        if (st.players[bi].dead) { await bb.awaitRespawn("B"); }
        // recovery: M slid off the lip into the chamber — the designed escape
        // valve is the drain sump (72,16): stand in it, drown-respawn on the
        // deck checkpoint, walk back out and drop to the ledge again
        if (st.players[mi].ty > 13) {
          await bb.walkTo("M", 72, { tol: 5, timeout: 6000 }).catch(() => {});
          await bb.waitFor((s) => s.players[mi].dead, 9000, "M drowned in the sump");
          await bb.awaitRespawn("M");
          await bb.walkTo("M", 75, { tol: 8, timeout: 15000 }).catch(() => {});
          await bb.waitFor((s) => s.players[mi].ty > 10 && s.players[mi].grounded, 4000, "M back on the ledge").catch(() => {});
        }
        // stances: B at the chamber's col 70 (clear of the drain sump), M a
        // half-tile INSIDE the lip (drive-found: a stance ON the lip plus the
        // facing tap could slide the winch off the edge mid-chord — the chord
        // then fires airborne and denies). walkTo approaches from the east, so
        // M already faces its buddy; only tap the facing when it's wrong.
        await bb.walkTo("B", 70, { tol: 6, timeout: 8000 }).catch(() => {});
        await bb.walkTo("M", 74.6, { tol: 4, timeout: 6000 }).catch(() => {});
        const mNow = (await bb.state()).players[mi];
        if (mNow.facing !== -1) await bb.face("M", "left");
        try {
          await bb.reelPartner("M", { partnerRole: "B" });
        } catch (e) {
          if (attempt === 4) throw e;
          continue;
        }
        const up = await bb.waitFor((s) => s.players[bi].ty < 12 && s.players[bi].grounded, 5000, "B on the ledge")
          .then(() => true).catch(() => false);
        if (up) break;
        if (attempt === 4) throw new Error("the winch never landed B on the ledge");
      }
      await bb.waitFor((s) => s.players[bi].ty < 12 && s.players[bi].grounded, 2000, "B up the ascent");
    },
  },
  {
    name: "both through the exit",
    fn: async (bb) => {
      await bb.waitFor((s) => s.doors.find((d) => d.id === "exit")?.open, 5000, "exit open");
      await bb.walkTo("M", 78, { tol: 10, timeout: 10000 });
      await bb.walkTo("B", 78, { tol: 10, timeout: 10000 });
      await bb.waitFor((s) => s.complete, 6000, "level complete");
    },
  },
];

// --- 100%-core variant (beat --full) -----------------------------------------
// core 0 (13,15) is swept by the teaching-pool wade (both robots cross its
// tile). Cores 1 and 2 are genuinely optional detours — the twist tier earns
// them — so the full run splices in:
//   core 1 (33,16): the swimmer's deep dip between the tank-floor ridges.
//   core 2 (32,5):  the deck robot's optional rail-spur cling (30-35).
export const coreSteps = [
  {
    after: "B dives gap G1, bubbles up and stages at baffle 1",
    steps: [
      {
        name: "core detour: B dips between the floor ridges (core 1)",
        fn: async (bb) => {
          for (let att = 0; att < 3; att++) {
            if ((await bb.state()).coresGot[1]) break;
            // aim AT the core (33,16): the 42px pickup radius needs a tight stop
            await swimTo(bb, "B", 33, 15.5, { dive: 27.5, tol: 12, timeout: 15000 });
            const got = await bb.waitFor((s) => s.coresGot[1], 2500, "core 1")
              .then(() => true).catch(() => false);
            if (got) break;
            await swimTo(bb, "B", 34, 15.5, { dive: 27.5, tol: 12, timeout: 8000 }).catch(() => {}); // sweep the pocket
          }
          await bb.waitFor((s) => s.coresGot[1], 2000, "core 1 collected");
          await swimTo(bb, "B", 38.5, 11, { dive: 27.5 }); // back to the baffle stage
        },
      },
    ],
  },
  {
    after: "M flips ms1 — baffle 1 latches open",
    steps: [
      {
        name: "core detour: M clings the spur rail (core 2)",
        fn: async (bb) => {
          const mi = bb.idx("M");
          const kM = bb.keysFor("M");
          for (let att = 0; att < 4; att++) {
            if ((await bb.state()).coresGot[2]) break;
            await bb.walkTo("M", 32, { tol: 5, timeout: 8000 });
            await bb.act("M"); // latch the spur ('=' 30-35 overhead)
            const clung = await bb.waitFor((s) => s.players[mi].magCling, 1500, "spur latched")
              .then(() => true).catch(() => false);
            if (!clung) continue;
            await bb.waitFor((s) => s.coresGot[2], 2500, "core 2").catch(() => {});
            await bb.tap(kM.jump, 90); // drop back to the deck
            await bb.waitFor((s) => !s.players[mi].magCling && s.players[mi].grounded, 3000, "off the spur").catch(() => {});
          }
          await bb.waitFor((s) => s.coresGot[2], 2000, "core 2 collected");
          await bb.walkTo("M", 37, { tol: 8, timeout: 8000 }); // back to the relay
        },
      },
    ],
  },
];
