// 4-3 "KOBI's Heart" — role-parametric walkthrough (W3W4 L43, the FINALE).
// Roles: F = time-freeze, B = light-beam. Input-only, closed-loop (same
// contract as every route: reads state to time REAL key presses, never
// mutates the scene) — plus the campaign-close assertions: completion fires,
// the save's campaign-complete state persists, and the epilogue + credits are
// reached and EXITED (the "always exitable" proof, driven).
//
// Beats: equip -> the last dark hall (one freeze statues the Ticker; both
// cross; core 0 swept) -> the HEART ARENA ×3:
//   BLIND — B mounts the west perch (tiles 42-43: the stance geometry that
//     puts the hovering eye inside the cone's 24° half-angle) and HOLDS the
//     beam on the eye. While lit the eye cannot AIM (its glare cycle holds in
//     cool/aim — an in-flight lock/strike still finishes, so the helper waits
//     for a clear window first). 2.6s of light -> the station's vent blows:
//     the core is exposed PERMANENTLY.
//   REACH — F parks just outside the station's turbine flank, casts on a
//     clear window, and runs the frozen gauntlet to TOUCH the core. That
//     station's turbines die forever; deaths are the standard cp30 respawn
//     and every attempt is repeatable (freeze/battery always recharge).
// Glare facts the dodges rest on: the strike column is 104px wide, clamped to
// tiles 34-72, telegraphed by 2.3s of following stripes + a 0.75s lock before
// the 0.5s strike — the closed-loop walker clears any lock within ~0.3s.
// Then: power-down mid-tantrum -> Bolt bounds out -> heartResolved -> exit
// opens -> both through -> finishLevel (standard contract) -> the clear
// overlay -> continue -> EPILOGUE (story -> credits -> end -> Title).
import { KEYS } from "../driver.mjs";

const TILE = 48;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PERCH = 42.6;          // the west blind-perch stance (on top of the podium)
const PARKS = [55, 60, 66];  // freeze+run park per station (outside every live flank)
const CORES = [58, 63, 71];  // station core tiles (the touch targets)

// Is the glare threatening x? A locked/striking column within 170px, or an
// AIM column parked within 90px that is about to lock (preemptive dodge —
// the lock+strike leave ~1.25s, so we start moving before it commits).
function glareThreat(s, x) {
  const H = s.heart;
  if (!H || H.state !== "fight") return null;
  const g = H.glare;
  if ((g.state === "lock" || g.state === "strike") && Math.abs(g.lockX - x) < 170) return g.lockX;
  if (g.state === "aim" && g.t < 700 && Math.abs(g.x - x) < 90) return g.x;
  return null;
}

// Closed-loop walk that DODGES the glare: while a lock/strike column sits
// within 140px, clear it (west-biased — west of every park is attested-safe
// dead-station ground) before resuming toward the target. Auto-hops the
// 1-tile perch lips. Deaths respawn (cp30) and the walk simply resumes.
async function glareSafeWalk(bb, role, tileX, opts = {}) {
  const i = bb.idx(role);
  const k = bb.keysFor(role);
  const targetX = tileX * TILE + 24;
  const tol = opts.tol ?? 8;
  const end = Date.now() + (opts.timeout ?? 35000);
  let lastHop = 0;
  while (Date.now() < end) {
    const s = await bb.state();
    if (s.complete) break;
    const p = s.players[i];
    if (p.dead) { await bb.awaitRespawn(role); continue; }
    let want = targetX;
    const threatX = glareThreat(s, p.x);
    if (threatX != null) {
      want = p.x <= threatX + 30 ? threatX - 160 : threatX + 160; // west-biased flee
    } else if (Math.abs(targetX - p.x) <= tol) {
      await bb.up(k.left); await bb.up(k.right);
      await sleep(60);
      return true;
    }
    const dx = want - p.x;
    const dirKey = dx > 0 ? k.right : k.left;
    await bb.up(dx > 0 ? k.left : k.right);
    await bb.down(dirKey);
    const pressing = dx > 0 ? p.blocked.right : p.blocked.left;
    if (pressing && Date.now() - lastHop > 600) { await bb.tap(k.jump, 240); lastHop = Date.now(); }
    await sleep(45);
  }
  await bb.up(k.left); await bb.up(k.right);
  const st = await bb.state();
  if (Math.abs(st.players[i].x - targetX) <= tol + 10) return true;
  throw new Error(`glareSafeWalk ${role} -> tile ${tileX} timed out (at ${st.players[i].tx.toFixed(1)})`);
}

// B blinds the eye for station `n`: mount the perch and IGNITE THE MOMENT the
// battery can carry the blind — a LIT eye cannot aim (its glare cycle holds),
// so being lit IS the safety; the only dangerous time on the perch is unlit.
// Exposure is PERMANENT: a drained battery or a death just means recharge /
// respawn and re-hold (dazzle decays at 0.35x, never resets in one beat).
async function blindEye(bb, n) {
  const bi = bb.idx("B");
  const kB = bb.keysFor("B");
  for (let att = 0; att < 10; att++) {
    let s = await bb.state();
    if (s.heart.stations[n].exposed) return;
    if (s.players[bi].dead) { await bb.awaitRespawn("B"); continue; }
    await glareSafeWalk(bb, "B", PERCH, { tol: 7 });
    await bb.face("B", "right"); // the eye hovers east of the perch
    // recharge wait, DODGING: an unlit eye keeps aiming while we wait, so a
    // forming column near the perch is fled (west-biased) and re-mounted
    const rechargeEnd = Date.now() + 16000;
    while (Date.now() < rechargeEnd) {
      s = await bb.state();
      if (s.players[bi].dead || s.players[bi].beamMs > 2800) break;
      if (glareThreat(s, s.players[bi].x) != null) {
        await glareSafeWalk(bb, "B", PERCH, { tol: 7, timeout: 8000 }).catch(() => {});
        await bb.face("B", "right");
      }
      await sleep(100);
    }
    s = await bb.state();
    if (s.players[bi].dead) { await bb.awaitRespawn("B"); continue; }
    // an in-flight lock/strike near the perch must land before we plant; a
    // mere threatening AIM is fine — igniting HOLDS it before it can lock
    const th = glareThreat(s, s.players[bi].x);
    if (th != null && s.heart.glare.state !== "aim") { await sleep(350); continue; }
    await bb.down(kB.act);
    let exposed = false;
    try {
      exposed = await bb.waitFor((st) => st.heart.stations[n].exposed || st.players[bi].dead, 7000, "core exposed")
        .then((st) => st.heart.stations[n].exposed).catch(() => false);
    } finally {
      await bb.up(kB.act);
    }
    if (exposed) return;
  }
  await bb.waitFor((st) => st.heart.stations[n].exposed, 2000, `station ${n} exposed`);
}

// F unplugs exposed station `n`: park outside the turbine flank, cast on a
// clear window, run the FROZEN gauntlet, touch the core (turbines die with
// it, so a late thaw can no longer bite the runner on that station).
async function takeRun(bb, n) {
  const fi = bb.idx("F");
  const kF = bb.keysFor("F");
  for (let att = 0; att < 8; att++) {
    let s = await bb.state();
    if (s.heart.stations[n].taken) return;
    if (s.players[fi].dead) { await bb.awaitRespawn("F"); continue; }
    await glareSafeWalk(bb, "F", PARKS[n], { tol: 7 });
    // cooldown wait, DODGING: the eye resumes attacks 4s after the expose
    const cdEnd = Date.now() + 20000;
    while (Date.now() < cdEnd) {
      s = await bb.state();
      if (s.players[fi].dead) break;
      if (s.players[fi].freezeCd <= 0 && !s.frozen) break;
      if (glareThreat(s, s.players[fi].x) != null) {
        await glareSafeWalk(bb, "F", PARKS[n], { tol: 8, timeout: 8000 }).catch(() => {});
      }
      await sleep(100);
    }
    s = await bb.state();
    if (s.players[fi].dead) { await bb.awaitRespawn("F"); continue; }
    if (glareThreat(s, s.players[fi].x) != null) { await sleep(350); continue; }
    await bb.tap(kF.act);
    const froze = await bb.waitFor((st) => st.frozen, 1500, "world frozen").then(() => true).catch(() => false);
    if (!froze) continue;
    await bb.walkTo("F", CORES[n], { tol: 7, timeout: 4600 }).catch(() => {});
    const took = await bb.waitFor((st) => st.heart.stations[n].taken, 1500, "core unplugged")
      .then(() => true).catch(() => false);
    if (took) return;
  }
  await bb.waitFor((st) => st.heart.stations[n].taken, 2000, `station ${n} taken`);
}

// One full station. Staging discipline: while B blinds, F waits on the SAFE
// WEST WING (x31 — outside the glare clamp's 104px column reach), then rides
// the 4s reeling window (no attacks) toward the park; B retreats to the wing
// over the same window. Self-heals across deaths at every stage.
async function unplugStation(bb, n) {
  await glareSafeWalk(bb, "F", 31, { tol: 12 }).catch(() => {});
  await blindEye(bb, n);
  const retreat = glareSafeWalk(bb, "B", 31.8, { tol: 14 }).catch(() => {});
  await takeRun(bb, n);
  await retreat;
}

// The dark hall: one freeze statues the Ticker lane, both cross to the x26
// checkpoint (core 0 at x21 sits ON the lane floor — swept by the crossing).
async function crossHall(bb) {
  const fi = bb.idx("F");
  const bi = bb.idx("B");
  for (let att = 0; att < 6; att++) {
    let s = await bb.state();
    const fPast = s.players[fi].tx > 24.5;
    const bPast = s.players[bi].tx > 24.5;
    if (fPast && bPast) return;
    if (s.players[fi].dead) { await bb.awaitRespawn("F"); continue; }
    if (s.players[bi].dead) { await bb.awaitRespawn("B"); continue; }
    if (!fPast) await bb.walkTo("F", 14.2, { tol: 6, timeout: 9000 }).catch(() => {});
    if (!bPast) await bb.walkTo("B", 15.2, { tol: 6, timeout: 9000 }).catch(() => {});
    s = await bb.state();
    if (s.players[fi].dead || s.players[bi].dead) continue;
    await bb.waitFor((st) => st.players[fi].freezeCd <= 0, 18000, "freeze ready").catch(() => {});
    await bb.tap(bb.keysFor("F").act);
    const froze = await bb.waitFor((st) => st.frozen, 1500, "hall frozen").then(() => true).catch(() => false);
    if (!froze) continue;
    const walkers = [];
    if (!fPast) walkers.push(bb.walkTo("F", 26.2, { tol: 8, timeout: 4600 }).catch(() => {}));
    if (!bPast) walkers.push(bb.walkTo("B", 27.0, { tol: 8, timeout: 4600 }).catch(() => {}));
    await Promise.all(walkers);
  }
  const st = await bb.state();
  if (!(st.players[fi].tx > 24.5 && st.players[bi].tx > 24.5)) {
    throw new Error(`hall: both robots never crossed (F ${st.players[fi].tx.toFixed(1)}, B ${st.players[bi].tx.toFixed(1)})`);
  }
}

export default [
  {
    name: "equip skills -> gate opens",
    fn: async (bb) => {
      await bb.equip("F", 3);
      await bb.equip("B", 6);
      await bb.waitFor((s) => s.doors.find((d) => d.id === "gate")?.open, 5000, "gate open");
      await bb.walkTo("F", 11, { tol: 10, timeout: 8000 });
      await bb.walkTo("B", 12, { tol: 10, timeout: 8000 });
    },
  },
  {
    name: "the last dark hall: freeze statues the guard; both cross (core 0 swept)",
    fn: async (bb) => {
      await crossHall(bb);
      // both to the arena checkpoint (arms the fight-side respawn)
      await bb.walkTo("F", 30, { tol: 9, timeout: 9000 });
      await bb.walkTo("B", 31, { tol: 9, timeout: 9000 });
    },
  },
  {
    name: "core 1: blind from the perch -> freeze the flank -> unplug (station 1 dies)",
    fn: async (bb) => {
      await unplugStation(bb, 0);
      await bb.waitFor((s) => s.heart.coresTaken >= 1, 2000, "coresTaken 1");
    },
  },
  {
    name: "core 2: the deeper gauntlet under a faster glare (station 2 dies)",
    fn: async (bb) => {
      await unplugStation(bb, 1);
      await bb.waitFor((s) => s.heart.coresTaken >= 2, 2000, "coresTaken 2");
    },
  },
  {
    name: "core 3: the deepest run — three turbines, the fastest glare (KOBI unplugged)",
    fn: async (bb) => {
      await unplugStation(bb, 2);
      await bb.waitFor((s) => s.heartDefeated, 3000, "heart powered down");
    },
  },
  {
    name: "power-down mid-tantrum -> Bolt bounds out -> the exit opens",
    fn: async (bb) => {
      // the staged, non-violent resolution: tantrum cut -> deflation -> the
      // cage pops (boltFree) -> Bolt reaches the buddies (heartResolved) ->
      // the exit's needs.heart opens. All attacks are already over. (The
      // timeline is freeze-gated like everything else: a take landing early
      // in the 5s hold delays the cage pop by the hold's remainder.)
      await bb.waitFor((s) => s.heart.boltFree, 40000, "Bolt is out of the cage");
      await bb.waitFor((s) => s.heartResolved, 60000, "Bolt home -> resolved");
      await bb.waitFor((s) => s.doors.find((d) => d.id === "exit")?.open, 4000, "exit open");
    },
  },
  {
    name: "both through the exit — the finale completes; campaign-complete persists",
    fn: async (bb) => {
      await bb.walkTo("B", 75.4, { tol: 9, timeout: 14000 });
      await bb.walkTo("F", 74.8, { tol: 9, timeout: 14000 });
      const fi = bb.idx("F"), bi = bb.idx("B");
      let st = await bb.state();
      if (st.players[fi].dead) { await bb.awaitRespawn("F"); await bb.walkTo("F", 74.8, { tol: 9, timeout: 14000 }); }
      if (st.players[bi].dead) { await bb.awaitRespawn("B"); await bb.walkTo("B", 75.4, { tol: 9, timeout: 14000 }); }
      await bb.waitFor((s) => s.complete, 6000, "level complete");
      // the campaign-complete assertion: the save's unlocked counter (the
      // documented completion signal — no new field) reads 13 = 12/12 cleared
      const save = await bb.page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem("bolt-buddies-save-v1")); } catch { return null; }
      });
      if (!save || !(save.unlocked >= 13)) {
        throw new Error(`campaign-complete state missing (save.unlocked=${save && save.unlocked})`);
      }
    },
  },
  {
    name: "epilogue: continue -> storybook -> credits -> end -> Title (always exitable)",
    fn: async (bb) => {
      // the clear overlay's continue is armed the moment bb:complete lands
      await bb.page.waitForFunction(() => {
        const ui = window.__BB.game.scene.getScene("UI");
        return !!(ui && ui.completed);
      }, null, { timeout: 6000 });
      await sleep(400);
      await bb.tap("Space"); // continue -> Epilogue (the finale routing)
      await bb.page.waitForFunction(() => window.__BB.game.scene.isActive("Epilogue"), null, { timeout: 6000 });
      await bb.page.waitForFunction(() => window.__BB.epilogue && window.__BB.epilogue.phase === "story", null, { timeout: 4000 });
      await sleep(700); // let the fade-in settle
      // PAGE-COUNT-AGNOSTIC walk: any key advances every beat/phase, so tap
      // forward until the Title lands, bounded so a strand fails loudly
      let atTitle = false;
      for (let i = 0; i < 30 && !atTitle; i++) {
        atTitle = await bb.page.evaluate(() => window.__BB.game.scene.isActive("Title"));
        if (atTitle) break;
        await bb.tap("Enter");
        await sleep(450);
      }
      await bb.page.waitForFunction(() => window.__BB.game.scene.isActive("Title"), null, { timeout: 6000 });
    },
  },
];

// --- 100%-core variant (beat --full) -----------------------------------------
// All three cores sit ON the mandatory walk line (coreprobe: no detours):
//   core0 (21,13) — the hall's ticker lane (the frozen crossing walks over it)
//   core1 (46,13) — the arena floor between the perch and the east parks
//   core2 (60,13) — station 2's park tile itself
// The base route sweeps all three; the pre-exit assertion does the checking.
export const coreSteps = [];

// Shared with the softlock prober (tools/softlock/scenarios/world4.mjs).
export const helpers = { glareSafeWalk, glareThreat, blindEye, takeRun, unplugStation, crossHall, PERCH, PARKS, CORES };
export { KEYS };
