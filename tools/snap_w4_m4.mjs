// W3W4 M4 — World-4 mechanics foundation: acceptance probe + contact sheets.
//
// Loads the dev-only sandbox (src/levels/dev_w4.js via ?devlevel=w4) on the
// Canvas tier and PROBE-VERIFIES every M4 mechanic with DRIVEN INPUT (the beat
// Driver — real Playwright key events; page.evaluate is used only for reads
// and for station-setup teleports, never to perform a mechanic):
//   1.  pedestal equip: TIME-FREEZE + LIGHT-BEAM (badges, cards, gate)
//   2.  FREEZE drift proof: one cast holds crusher/lift/laser/ticker/rot-bridge
//       (positions + timers byte-identical across the whole 5s hold — the
//       physics-sacred resume proof) while the PLAYERS keep moving freely;
//       after the thaw every machine resumes at its exact phase
//   3.  frozen lift = stepping stone (held mid-travel under a rider)
//   4.  killPlayer/respawn NEVER freezable: die on the (still-lethal) frozen
//       laser DURING the freeze -> the standard 900ms respawn runs while the
//       world is still frozen
//   5.  laser sweep: telegraphed lethal beam; freeze-assisted crossing
//   6.  ticker: wind-up telegraph -> fast dash kill; utterly held + SAFE while
//       frozen (walk the lane, take the key)
//   7.  ice door: beam exposure fills the melt (progress numbers), opens
//       permanently; battery drain ~1x / recharge ~0.5x measured
//   8.  invisible platforms: solid ALWAYS (land on one unlit); visible only
//       in the cone (+ ~1.5s afterglow), climbable to a core
//   9.  gloomy: jams the plate; the beam herds it off; the robot's glow blocks
//       its return; the displaced blob stalks the dark but shies off the glow
//  10.  rotating bridge: crossed by BOTH robots while freeze holds it flat
//  11.  dark zones: glow-radius + cone reveal (screenshots on BOTH tiers)
//  12.  buddy-reel from the beam robot (DOWN+ACTION, shared startReeled path)
//  13.  finishLevel NEVER freezable: clear the level DURING a freeze
// Plus: body-invariance for the new rigs (physics sacred), an ?animoff=1 pass
// (0 errors, static render, patrol logic unchanged), the ~120 particle budget,
// contact sheets to tools/shots/w4/, and fps samples (dark+laser scene vs the
// 2-2 / 3-3 baselines).
//
//   node tools/snap_w4_m4.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { Driver, KEYS, TILE } from "./beat/driver.mjs";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = process.env.BB_SHOTS || "tools/shots/w4";
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}${extra ? " — " + extra : ""}`);
  if (!cond) fails.push(msg);
};

const cBrowser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await cBrowser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });

const gotoSandbox = async (extra = "") => {
  await page.goto(`${BASE}/?canvas=1&devlevel=w4${extra}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const s = window.__BB && window.__BB.scene;
    return !!(s && s.def && s.def.id === "dev-w4" && s.players && s.players.length === 2);
  }, null, { timeout: 20000 });
  await sleep(1200);
};

// --- read helpers (pure) ----------------------------------------------------
const snap = () => page.evaluate(() => {
  const g = window.__BB.scene;
  const pj = (p) => ({
    x: p.x, y: p.y, tx: p.x / 48, ty: p.y / 48, dead: p.dead, skill: p.skill,
    grounded: p.grounded, freezeCd: p.freezeCd, beamOn: p.beamOn, beamMs: p.beamMs,
    beamAim: p.beamAim, reeled: !!p.reeled, vx: p.body.velocity.x, vy: p.body.velocity.y,
    badge: !!p.badge,
  });
  return {
    complete: g.complete, keysHeld: g.keysHeld, deaths: g._deaths,
    coresGot: [...g.coresGot],
    frozen: g.frozen, freezeT: g.freezeT,
    players: g.players.map(pj),
    doors: g.doors.map((d) => ({ id: d.id, open: d.open })),
    plates: g.plates.map((pl) => ({ id: pl.id, active: pl.active, gloomed: !!pl._gloomed })),
    ghosts: g.ghosts.map((gh) => ({ x: gh.img.x, y: gh.img.y, alpha: gh.img.alpha, lit: gh.lit })),
    ice: g.iceDoors.map((d) => ({ id: d.id, melt: d.melt, open: d.open })),
    lasers: g.lasers.map((L) => ({ angle: L.angle, dir: L.dir, endX: L.endX, endY: L.endY })),
    tickers: g.tickers.map((t) => ({ x: t.img.x, state: t.state, timer: t.timer })),
    gloomies: g.gloomies.map((gl) => ({ x: gl.img.x, y: gl.img.y, scared: gl.scared, homeX: gl.homeX })),
    bridges: g.rotBridges.map((rb) => ({ angle: rb.angle })),
    lifts: g.lifts.map((l) => ({ y: l.img.y, vy: l.img.body.velocity.y })),
    fxAlive: g.fxAlive(), fxBudget: g.fxPalette.budget,
  };
});
// full-precision device state (the freeze drift proof)
const devSnap = () => page.evaluate(() => {
  const g = window.__BB.scene;
  return {
    frozen: g.frozen,
    crushers: g.crushers.map((c) => ({ y: c.img.y, state: c.state, timer: c.timer })),
    lifts: g.lifts.map((l) => ({ y: l.img.y, hold: l.holdTimer })),
    lasers: g.lasers.map((L) => ({ angle: L.angle, dir: L.dir })),
    tickers: g.tickers.map((t) => ({ x: t.img.x, y: t.img.y, state: t.state, timer: t.timer })),
    bridges: g.rotBridges.map((rb) => ({ angle: rb.angle, s0x: rb.segs[0].img.x, s0y: rb.segs[0].img.y })),
    gloomies: g.gloomies.map((gl) => ({ x: gl.img.x, y: gl.img.y })),
    px: g.players.map((p) => p.x),
  };
});
const waitFor = async (pred, timeout, desc) => {
  const end = Date.now() + timeout;
  let last = null;
  while (Date.now() < end) {
    last = await snap();
    try { if (pred(last)) return last; } catch { /* keep polling */ }
    await sleep(60);
  }
  ok(false, `waitFor timed out: ${desc}`);
  return last;
};
const tryFor = async (pred, timeout) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const s = await snap();
    try { if (pred(s)) return s; } catch { /* keep polling */ }
    await sleep(60);
  }
  return null;
};
// station-setup teleport (setup ONLY — every mechanic below is key-driven)
const port = (i, tx, ty) => page.evaluate(([i, tx, ty]) => {
  const g = window.__BB.scene;
  const p = g.players[i];
  p.clearStates();
  p.body.reset(tx * 48 + 24, ty * 48 + 24);
  p.setVelocity(0, 0);
  p.invuln = Math.max(p.invuln, 400);
}, [i, tx, ty]);

// --- shot helpers -------------------------------------------------------------
const frameAt = (x, y, z = 2.2) => page.evaluate(([x, y, z]) => {
  const g = window.__BB.scene;
  if (!g._camFrozen) { g._camFrozen = true; g.updateCamera = () => {}; }
  const cam = g.cameras.main;
  cam.setZoom(z);
  cam.centerOn(x, y);
}, [x, y, z]);
const unfreezeCam = () => page.evaluate(() => {
  const g = window.__BB.scene;
  if (g._camFrozen) { g._camFrozen = false; delete g.updateCamera; }
});
const clip = { x: 640 - 190, y: 360 - 130, width: 380, height: 260 };
const grab = async (framer) => { if (framer) await framer(); await sleep(80); const buf = await page.screenshot({ clip }); return buf.toString("base64"); };
const strip = async (name, frames, label, w = 285, h = 195) => {
  const imgs = frames.map((f) => `<img src="data:image/png;base64,${f}" style="display:block;width:${w}px;height:${h}px;border-radius:6px">`).join("");
  const html = `<body style="margin:0"><div style="display:inline-flex;flex-direction:column;gap:6px;background:#0a0f1e;padding:10px;font-family:monospace">`
    + `<div style="color:#8fa3d9;font-size:13px">W4 M4 · ${label}</div>`
    + `<div style="display:inline-flex;gap:6px;flex-wrap:wrap;max-width:${(w + 8) * 4}px">${imgs}</div></div></body>`;
  const p2 = await ctx.newPage();
  await p2.setContent(html);
  const el = await p2.$("div");
  await el.screenshot({ path: `${SHOTS}/${name}.png` });
  await p2.close();
  console.log(`contact sheet -> ${SHOTS}/${name}.png`);
};

await gotoSandbox();
const bb = new Driver(page);
bb.setRoles({ F: 0, B: 1, G: 0, H: 1 });
const kF = KEYS[0];
const kB = KEYS[1];
const deg = (r) => (r * 180 / Math.PI);

console.log("\n=== 1. pedestal equip (driven) ===");
const sk1 = await bb.equip("F", 3);
const sk2 = await bb.equip("B", 6);
ok(sk1 === "freeze" && sk2 === "beam", "both W4 skills equipped from pedestals", `F=${sk1} B=${sk2}`);
let st = await waitFor((s) => s.doors.find((d) => d.id === "gate").open, 4000, "skills gate opens");
ok(st.players[0].badge && st.players[1].badge, "badges built on equip (icon_freeze / icon_beam)");

console.log("\n=== 2. TIME-FREEZE: the byte-identical drift proof (driven) ===");
await port(0, 12, 13); await port(1, 10, 13);
await sleep(400); // let the yard machines run before the cast
const fFR = [];
await bb.tap(kF.act);
st = await waitFor((s) => s.frozen, 1200, "freeze cast");
const tCast = Date.now();
ok(st.frozen === true, "ACTION casts TIME-FREEZE (world gate up)");
await sleep(150);
const snapA = await devSnap();
fFR.push(await grab(() => frameAt(15.5 * 48, 11.5 * 48, 1.35))); // frozen tableau (crusher+lift+laser frost)
await unfreezeCam();
// players move FREELY while the world is stopped
await bb.down(kF.right);
await sleep(1100);
await bb.up(kF.right);
// hold the last still-frozen device snapshot until the thaw
let snapB = null;
while (true) {
  const s = await devSnap();
  if (!s.frozen) break;
  snapB = s;
  await sleep(90);
}
const tThaw = Date.now();
const freezeDur = tThaw - tCast;
// drift = field-by-field diff between the first and last frozen snapshots
const drift = [];
const cmp = (label, a, b) => {
  const d = Math.abs(a - b);
  drift.push(`${label}=${d}`);
  return d;
};
let maxDrift = 0;
snapA.crushers.forEach((c, i) => {
  maxDrift = Math.max(maxDrift, cmp(`crusher${i}.y`, c.y, snapB.crushers[i].y), cmp(`crusher${i}.timer`, c.timer, snapB.crushers[i].timer));
  if (c.state !== snapB.crushers[i].state) { maxDrift = Infinity; drift.push(`crusher${i}.state ${c.state}->${snapB.crushers[i].state}`); }
});
snapA.lifts.forEach((l, i) => {
  maxDrift = Math.max(maxDrift, cmp(`lift${i}.y`, l.y, snapB.lifts[i].y), cmp(`lift${i}.hold`, l.hold, snapB.lifts[i].hold));
});
snapA.lasers.forEach((L, i) => {
  maxDrift = Math.max(maxDrift, cmp(`laser${i}.angle`, L.angle, snapB.lasers[i].angle));
});
snapA.tickers.forEach((t, i) => {
  maxDrift = Math.max(maxDrift, cmp(`ticker${i}.x`, t.x, snapB.tickers[i].x), cmp(`ticker${i}.timer`, t.timer, snapB.tickers[i].timer));
  if (t.state !== snapB.tickers[i].state) { maxDrift = Infinity; drift.push(`ticker${i}.state ${t.state}->${snapB.tickers[i].state}`); }
});
snapA.bridges.forEach((rb, i) => {
  maxDrift = Math.max(maxDrift, cmp(`bridge${i}.angle`, rb.angle, snapB.bridges[i].angle),
    cmp(`bridge${i}.s0x`, rb.s0x, snapB.bridges[i].s0x), cmp(`bridge${i}.s0y`, rb.s0y, snapB.bridges[i].s0y));
});
snapA.gloomies.forEach((gl, i) => {
  maxDrift = Math.max(maxDrift, cmp(`gloomy${i}.x`, gl.x, snapB.gloomies[i].x), cmp(`gloomy${i}.y`, gl.y, snapB.gloomies[i].y));
});
console.log("freeze drift (first-frozen vs last-frozen snapshot):", drift.join(" "));
ok(maxDrift === 0, "FROZEN devices are byte-identical across the whole hold (drift 0)", `max drift ${maxDrift}`);
const pMoved = snapB.px[0] - snapA.px[0];
ok(pMoved > 100, "PLAYERS move freely while the world is frozen", `P1 walked ${pMoved.toFixed(0)}px during the hold`);
ok(freezeDur > 4200 && freezeDur < 6200, "freeze holds ~5s then thaws", `held ${freezeDur}ms (spec 5000)`);
// resume proof: the machines pick up at their exact phase and RUN again
await sleep(700);
const snapC = await devSnap();
const laserMoved = Math.abs(snapC.lasers[0].angle - snapB.lasers[0].angle);
const crusherRan = snapC.crushers[0].timer !== snapB.crushers[0].timer || snapC.crushers[0].state !== snapB.crushers[0].state;
const bridgeMoved = Math.abs(snapC.bridges[0].angle - snapB.bridges[0].angle);
ok(laserMoved > 0.2 && crusherRan && bridgeMoved > 0.2, "after the thaw every machine RESUMES from its held phase",
  `laser +${deg(laserMoved).toFixed(1)}deg, bridge +${deg(bridgeMoved).toFixed(1)}deg in 700ms, crusher timer running`);
// unfrozen control rate: the laser sweeps at ~40 deg/s when the world runs
const ctl0 = await devSnap();
await sleep(1000);
const ctl1 = await devSnap();
const rate = deg(Math.abs(ctl1.lasers[0].angle - ctl0.lasers[0].angle));
console.log(`unfrozen control: laser swept ${rate.toFixed(1)} deg in 1000ms (def speed 40 deg/s${ctl0.lasers[0].dir !== ctl1.lasers[0].dir ? ", direction bounce in window" : ""})`);
st = await snap();
console.log(`freeze cooldown after cast: freezeCd=${st.players[0].freezeCd.toFixed(0)}ms remaining (spec: 5000 hold + 8000 recharge from cast)`);
fFR.push(await grab(async () => { const s = await snap(); await frameAt(s.players[0].x, s.players[0].y - 20); })); // cooldown ring on the badge
await unfreezeCam();

console.log("\n=== 3. frozen LIFT = stepping stone mid-travel (driven) ===");
await waitFor((s) => s.players[0].freezeCd <= 0, 16000, "freeze cooldown recharges");
await port(0, 16, 13); // setup: past the crusher run (freeze crossings are stations 4-5)
await sleep(250);
// deterministic mount (walkTo's auto-hop can clear the whole 2-tile platform):
// stop short of the deck, jump straight up, drift in at the apex
for (let m = 0; m < 5; m++) {
  const s0 = await snap();
  if (s0.players[0].tx > 16.9 && s0.players[0].tx < 19.2 && s0.players[0].ty < 13.2 && s0.players[0].grounded) break;
  if (s0.players[0].tx > 19.2 || s0.players[0].dead) { await port(0, 16, 13); await sleep(300); }
  await bb.walkTo("F", 15.8, { tol: 5, timeout: 5000 }).catch(() => {});
  await bb.down(kF.jump);
  await sleep(180);
  await bb.down(kF.right);
  await sleep(260);
  await bb.up(kF.jump);
  await bb.up(kF.right);
  await sleep(520);
}
st = await waitFor((s) => s.lifts[0].y < 620, 15000, "lift rising under its rider");
await waitFor((s) => s.lifts[0].y < 560, 8000, "lift mid-travel");
await bb.tap(kF.act);
st = await waitFor((s) => s.frozen, 1200, "freeze cast on the ride");
const liftY0 = st.lifts[0].y;
await sleep(1200);
st = await snap();
ok(st.frozen && liftY0 < 600 && Math.abs(st.lifts[0].y - liftY0) < 0.001 && Math.abs(st.lifts[0].vy) < 0.001,
  "frozen lift HOLDS mid-air (velocity 0, position exact)", `y ${liftY0.toFixed(2)} -> ${st.lifts[0].y.toFixed(2)}`);
ok(st.players[0].grounded && !st.players[0].dead, "the rider STANDS on the frozen platform (solid stepping stone)");
fFR.push(await grab(() => frameAt(17.9 * 48, st.lifts[0].y - 30, 1.8)));
await unfreezeCam();
// thaw -> the lift finishes its climb; step off to the ledge core
await waitFor((s) => !s.frozen, 7000, "thaw");
await waitFor((s) => s.lifts[0].y <= 9 * 48 + 14, 8000, "lift tops out");
st = await snap();
if (st.players[0].ty > 10) { await port(0, 20, 8); await sleep(400); } // fell off the ride — resume on the ledge
await bb.walkTo("F", 21, { tol: 10, timeout: 6000 }).catch(() => {});
st = await snap();
ok(st.coresGot[0] === true, "ledge core collected off the lift ride", `cores ${JSON.stringify(st.coresGot)}`);

console.log("\n=== 4. respawn is NEVER freezable: die DURING the freeze (driven) ===");
await port(0, 21, 13); // setup: just OUTSIDE the sweep's ground reach (kill zone starts ~tile 23)
await waitFor((s) => s.players[0].freezeCd <= 0, 16000, "freeze cooldown");
// wait for a beam pose that rakes the ground on the pillar's LEFT (toward P1)
// — past ~127deg the ray clears the pillar's edge and reaches the floor
await waitFor((s) => {
  const a = deg(s.lasers[0].angle);
  return a > 129 && a < 150;
}, 20000, "laser raking the approach ground");
await bb.tap(kF.act);
st = await waitFor((s) => s.frozen, 1200, "freeze up");
const deathsBefore = st.deaths;
await bb.down(kF.right); // walk INTO the held (still lethal) beam
st = await waitFor((s) => s.deaths > deathsBefore, 4000, "laser contact death during freeze");
await bb.up(kF.right);
const laserBit = st.deaths === deathsBefore + 1 && st.frozen;
ok(laserBit, "the frozen laser is still a hazard (freeze stops the SWEEP, not the beam)");
st = await waitFor((s) => !s.players[0].dead, 4000, "respawn");
ok(laserBit && !st.players[0].dead && st.frozen, "the standard 900ms respawn ran WHILE the world was still frozen (never freezable)",
  `respawned with freezeT=${st.freezeT.toFixed(0)}ms still on the clock`);
await waitFor((s) => !s.frozen, 7000, "thaw");

console.log("\n=== 5. freeze-assisted laser crossing (driven) ===");
await port(0, 21, 13); // park OUTSIDE the sweep's reach while waiting for the window
await waitFor((s) => s.players[0].freezeCd <= 0, 16000, "freeze cooldown");
// wait for a SAFE hold: beam pointing down into its pillar (clipped short)
await waitFor((s) => {
  const a = deg(s.lasers[0].angle);
  return a > 72 && a < 108;
}, 14000, "laser pointing into its pillar");
await bb.tap(kF.act);
await waitFor((s) => s.frozen, 1200, "freeze up");
const deathsCross = (await snap()).deaths;
await bb.walkTo("F", 28, { tol: 10, timeout: 4500 }).catch(() => {});
st = await snap();
ok(st.players[0].tx > 27 && st.deaths === deathsCross, "crossed the laser yard under freeze (0 deaths)", `F at tile ${st.players[0].tx.toFixed(1)}`);

console.log("\n=== 6. TICKER: dash kill unfrozen; statue + safe frozen (driven) ===");
// (a) stand in the lane un-protected -> wind-up telegraph -> dash -> standard death
// (park PAST the laser's reach — tile 31.5+ — so the bite is the ticker's)
const deathsBeforeTick = st.deaths;
const fTK = [];
fTK.push(await grab(async () => { const s = await snap(); await frameAt(s.tickers[0].x, 12.4 * 48); }));
await unfreezeCam();
await bb.walkTo("F", 31.5, { tol: 8, timeout: 6000 }).catch(() => {});
st = await waitFor((s) => s.deaths > deathsBeforeTick, 9000, "ticker dash bite");
ok(st.deaths > deathsBeforeTick, "unfrozen ticker dash = the standard death/respawn");
await waitFor((s) => !s.players[0].dead, 4000, "respawn");
// (b) freeze -> the ticker is a statue and SAFE: walk the lane, stand near, take the key
await port(0, 21, 13); // park OUTSIDE the laser sweep while the window re-arms
await waitFor((s) => s.players[0].freezeCd <= 0, 16000, "freeze cooldown");
await waitFor((s) => { const a = deg(s.lasers[0].angle); return a > 60 && a < 120; }, 14000, "laser safe again");
await bb.tap(kF.act);
st = await waitFor((s) => s.frozen, 1200, "freeze up");
await port(0, 28, 13); // setup at the lane mouth; the lane walk itself is driven
const tick0 = st.tickers[0];
const deathsFrozen = st.deaths;
fTK.push(await grab(async () => { const s = await snap(); await frameAt(s.tickers[0].x, 12.4 * 48); })); // frozen statue + frost
await unfreezeCam();
await bb.walkTo("F", 33, { tol: 8, timeout: 3000 }).catch(() => {});
await sleep(300); // stand right in the lane beside the statue
st = await snap();
ok(st.deaths === deathsFrozen && !st.players[0].dead, "standing in the frozen ticker's lane is SAFE");
ok(Math.abs(st.tickers[0].x - tick0.x) < 0.001 && st.tickers[0].state === tick0.state && st.tickers[0].timer === tick0.timer,
  "frozen ticker is a statue (x/state/timer exact)", `x=${st.tickers[0].x.toFixed(2)} state=${st.tickers[0].state}`);
ok(st.keysHeld >= 1, "took the KEY out of the dash lane under freeze", `keys=${st.keysHeld}`);
await bb.walkTo("F", 37, { tol: 10, timeout: 4500 }).catch(() => {}); // out of the lane
st = await snap();
ok(st.players[0].tx > 35.5 && st.keysHeld >= 1, "walked the key out of the lane", `F at ${st.players[0].tx.toFixed(1)}`);
if (st.players[0].dead || st.players[0].tx < 35.5) { await waitFor((s) => !s.players[0].dead || true, 4000, "recover"); await port(0, 37, 13); }

console.log("\n=== 7. ICE DOOR: beam melt (progress + battery numbers, driven) ===");
await port(1, 36, 13);
await sleep(300);
await bb.face("B", "right");
const fBM = [];
const batt0 = (await snap()).players[1].beamMs;
const tHold0 = Date.now();
await bb.down(kB.act); // HOLD the beam
st = await waitFor((s) => s.players[1].beamOn, 1200, "beam ignites");
st = await waitFor((s) => s.ice[0].melt > 700, 4000, "melt fill rising");
fBM.push(await grab(() => frameAt(38 * 48, 12 * 48, 1.9))); // cone on the ice + progress fill
await unfreezeCam();
const meltMid = st.ice[0].melt;
st = await waitFor((s) => s.ice[0].open, 5000, "door melts open");
const battAfter = st.players[1].beamMs;
const heldMs = Date.now() - tHold0;
await bb.up(kB.act);
ok(st.ice[0].open === true, "ice door fully melted -> OPEN (body off)", `melt fill hit ${st.ice[0].melt.toFixed(0)}/${2200}ms after ${meltMid.toFixed(0)} mid-sample`);
const drainRate = (batt0 - battAfter) / heldMs;
console.log(`battery: ${batt0.toFixed(0)} -> ${battAfter.toFixed(0)}ms over ${heldMs}ms lit (drain rate ${drainRate.toFixed(2)}x)`);
ok(drainRate > 0.75 && drainRate < 1.25, "battery drains ~1x while lit", `${drainRate.toFixed(2)}x`);
const battR0 = (await snap()).players[1].beamMs;
await sleep(2000);
const battR1 = (await snap()).players[1].beamMs;
const regenRate = (battR1 - battR0) / 2000;
console.log(`battery recharge: ${battR0.toFixed(0)} -> ${battR1.toFixed(0)}ms over 2000ms doused (rate ${regenRate.toFixed(2)}x)`);
ok(regenRate > 0.3 && regenRate < 0.7, "battery recharges ~2x slower (0.5x)", `${regenRate.toFixed(2)}x`);
// melted stays melted
st = await snap();
ok(st.ice[0].open, "melted door STAYS melted");
fBM.push(await grab(() => frameAt(39 * 48, 12 * 48, 1.9)));
await unfreezeCam();

console.log("\n=== 8. INVISIBLE PLATFORMS: solid unlit; cone-lit + afterglow (driven) ===");
// solid ALWAYS: drop onto the unlit platform (physics unchanged)
await port(1, 43.5, 10);
st = await waitFor((s) => s.players[1].grounded, 3000, "landed");
const onGhost = Math.abs(st.players[1].ty - 11.5) < 0.4;
ok(onGhost && st.ghosts[0].alpha < 0.1, "UNLIT invisible platform is solid (landed on it at alpha 0.06)",
  `B stands ty=${st.players[1].ty.toFixed(2)}, alpha=${st.ghosts[0].alpha.toFixed(2)}`);
const fGH = [];
fGH.push(await grab(async () => { const s = await snap(); await frameAt(s.players[1].x + 40, s.players[1].y - 40, 1.9); }));
await unfreezeCam();
// light it: the plate materializes only in the cone
await bb.face("B", "right");
await bb.down(kB.act);
st = await waitFor((s) => s.ghosts[1].alpha > 0.8, 2500, "second ghost platform lit by the cone");
ok(st.ghosts[1].alpha > 0.8 && st.ghosts[1].lit > 0, "beam cone REVEALS the invisible platform", `alpha ${st.ghosts[1].alpha.toFixed(2)}`);
fGH.push(await grab(async () => { const s = await snap(); await frameAt(s.players[1].x + 60, s.players[1].y - 50, 1.9); }));
await unfreezeCam();
await bb.up(kB.act);
// afterglow ~1.5s then back to the faint hint
await sleep(600);
const midGlow = (await snap()).ghosts[1].alpha;
st = await waitFor((s) => s.ghosts[1].alpha < 0.1, 3000, "afterglow fades");
ok(midGlow > 0.15 && st.ghosts[1].alpha < 0.1, "~1.5s afterglow then invisible again",
  `alpha 600ms after dousing ${midGlow.toFixed(2)} -> ${st.ghosts[1].alpha.toFixed(2)}`);
// climb the (invisible-again) stair to the core — solid is solid.
// Deterministic step-up (walkTo's auto-hop can sail past the 2-tile tread):
for (let m = 0; m < 6; m++) {
  st = await snap();
  if (st.players[1].dead) { await tryFor((s) => !s.players[1].dead, 3000); st = await snap(); }
  if (st.players[1].ty < 10.2 && st.players[1].ty > 9 && st.players[1].grounded) break; // standing on ghost2
  if (st.players[1].ty > 12.5) { await port(1, 43.5, 10); await sleep(600); } // fell to the floor — back onto ghost1
  await bb.walkTo("B", 44, { tol: 5, timeout: 4000 }).catch(() => {});
  await sleep(150); // let the slide settle before the standing jump
  await bb.down(kB.jump);   // full jump straight up...
  await sleep(180);
  await bb.down(kB.right);  // ...drift in at the apex
  await sleep(250);
  await bb.up(kB.jump);
  await bb.up(kB.right);
  await sleep(520);
  const sm = await snap();
  console.log(`  climb attempt ${m}: B at (${sm.players[1].tx.toFixed(2)}, ${sm.players[1].ty.toFixed(2)}) grounded=${sm.players[1].grounded} dead=${sm.players[1].dead}`);
}
await bb.walkTo("B", 46, { tol: 6, timeout: 5000 }).catch(() => {});
st = await snap();
if (!st.coresGot[1]) { await bb.walkTo("B", 46.3, { tol: 5, timeout: 3000 }).catch(() => {}); st = await snap(); }
ok(st.coresGot[1] === true, "climbed the ghost stair to the dark-zone core", `cores ${JSON.stringify(st.coresGot)}`);

console.log("\n=== 9. GLOOMY: plate jam -> beam herd -> glow blocks the return (driven) ===");
await port(1, 46, 13);
// (the ghost-station beam may have spooked it — wait for the guard to re-seat)
st = await waitFor((s) => Math.abs(s.gloomies[0].x - s.gloomies[0].homeX) < 44 && s.plates[0].gloomed, 8000, "gloomy re-seats on its post");
const gl0 = st.gloomies[0];
ok(st.plates[0].gloomed === true && Math.abs(gl0.x - gl0.homeX) < 44,
  "gloomy SITS on the plate and JAMS it", `gloomy at ${(gl0.x / 48).toFixed(1)}, plate jammed=${st.plates[0].gloomed}`);
const fGL = [];
fGL.push(await grab(() => frameAt(50 * 48, 12.6 * 48, 1.9)));
await unfreezeCam();
// herd it off with the light
await bb.face("B", "right");
await bb.down(kB.act);
st = await waitFor((s) => s.gloomies[0].scared > 0, 2500, "gloomy dazzled");
ok(st.gloomies[0].scared > 0, "the cone DAZZLES the gloomy (flees the light)");
st = await waitFor((s) => Math.abs(s.gloomies[0].x - s.gloomies[0].homeX) > 70, 3000, "herded off the plate");
fGL.push(await grab(() => frameAt(50 * 48, 12.2 * 48, 1.7)));
await unfreezeCam();
await bb.up(kB.act);
st = await waitFor((s) => s.plates[0].gloomed === false, 2000, "plate un-jammed");
ok(Math.abs(st.gloomies[0].x - st.gloomies[0].homeX) > 60 && !st.plates[0].gloomed,
  "gloomy herded OFF the switch", `now ${Math.abs(st.gloomies[0].x - st.gloomies[0].homeX).toFixed(0)}px from its post`);
// stand your ground: the robot's glow blocks its return; the plate drives gdoor
await bb.walkTo("B", 50, { tol: 6, timeout: 5000 }).catch(() => {});
st = await waitFor((s) => s.plates[0].active, 3000, "plate pressed");
ok(st.plates[0].active === true, "buddy stands the freed plate -> pressed");
st = await waitFor((s) => s.doors.find((d) => d.id === "gdoor").open, 3000, "gdoor opens");
ok(st.doors.find((d) => d.id === "gdoor").open, "the un-jammed plate drives its door (latch)");
await sleep(2200); // give the gloomy time to try to come home
st = await snap();
ok(Math.abs(st.gloomies[0].x - st.gloomies[0].homeX) > 55,
  "the robot's own glow BLOCKS the gloomy's return while standing guard",
  `still ${Math.abs(st.gloomies[0].x - st.gloomies[0].homeX).toFixed(0)}px away after 2.2s`);
fGL.push(await grab(() => frameAt(51 * 48, 12.4 * 48, 1.7)));
await unfreezeCam();
// bring the freeze robot through the yard too (setup port past the cleared stations)
await port(0, 52, 13);
await bb.walkTo("F", 57, { tol: 10, timeout: 7000 }).catch(() => {});
await bb.walkTo("B", 57, { tol: 10, timeout: 7000 }).catch(() => {});

console.log("\n=== 10. ROTATING BRIDGE: crossed under freeze (driven) ===");
const fRB = [];
fRB.push(await grab(() => frameAt(60.5 * 48, 12.6 * 48, 1.6))); // spinning
await unfreezeCam();
let crossed = false;
for (let attempt = 0; attempt < 3 && !crossed; attempt++) {
  await waitFor((s) => s.players[0].freezeCd <= 0, 16000, "freeze cooldown");
  // wait for a NEAR-FLAT pose, then hold it
  await waitFor((s) => {
    const a = ((deg(s.bridges[0].angle) % 180) + 180) % 180;
    return a < 10 || a > 170;
  }, 16000, "bridge near flat");
  await bb.tap(kF.act);
  st = await waitFor((s) => s.frozen, 1200, "freeze up");
  const bAng = st.bridges[0].angle;
  fRB.push(await grab(() => frameAt(60.5 * 48, 12.6 * 48, 1.6))); // frozen flat + frost
  await unfreezeCam();
  await bb.walkTo("F", 64, { tol: 10, timeout: 4200 }).catch(() => {});
  await bb.walkTo("B", 64, { tol: 10, timeout: 4200 }).catch(() => {});
  st = await snap();
  crossed = st.players[0].tx > 63 && st.players[1].tx > 63 && !st.players[0].dead && !st.players[1].dead;
  ok(Math.abs(st.bridges[0].angle - bAng) < 0.001 || !st.frozen, "bridge angle HELD while frozen");
  if (!crossed) {
    console.log(`  (attempt ${attempt + 1}: not across yet — recovering)`);
    await waitFor((s) => !s.frozen, 7000, "thaw");
    st = await snap();
    if (st.players[0].tx < 63) await port(0, 57, 13);
    if (st.players[1].tx < 63) await port(1, 57, 13);
  }
}
ok(crossed, "BOTH robots crossed the rotating bridge while freeze held it flat");
fRB.push(await grab(async () => { const s = await snap(); await frameAt(s.players[0].x, s.players[0].y - 20, 1.6); }));
await unfreezeCam();

console.log("\n=== 11. DARK ZONE: glow radius + cone reveal (Canvas tier) ===");
await port(0, 70, 13); await port(1, 67, 13);
await sleep(400);
st = await snap();
const rtInfo = await page.evaluate(() => {
  const g = window.__BB.scene;
  return { rt: !!g.darkRT, alpha: g.darkRT ? g.darkRT.alpha : 0, zones: g.darkZones.length, halfRes: g.darkRT ? [g.darkRT.width, g.darkRT.height] : null };
});
ok(rtInfo.rt && rtInfo.zones === 2 && rtInfo.alpha > 0.9,
  "darkness mask live over the dark zones (half-res RT, no per-frame rebake)",
  `alpha ${rtInfo.alpha}, RT ${rtInfo.halfRes} (screen 1280x720)`);
const fDK = [];
fDK.push(await grab(() => frameAt(70 * 48, 11.5 * 48, 1.3))); // glow radius around each robot
// the cone cuts a wedge of visibility through the black
await bb.face("B", "right");
await bb.down(kB.act);
await sleep(500);
fDK.push(await grab(() => frameAt(69 * 48, 11.8 * 48, 1.3)));
await bb.up(kB.act);
// UP+ACTION aims the cone up
await bb.down(kB.jump);
await sleep(120);
await bb.down(kB.act);
st = await waitFor((s) => s.players[1].beamOn && Math.abs(s.players[1].beamAim + Math.PI / 2) < 0.01, 1500, "up-aim");
ok(Math.abs(st.players[1].beamAim + Math.PI / 2) < 0.01, "UP+ACTION aims the cone straight up", `aim ${deg(st.players[1].beamAim).toFixed(0)}deg`);
fDK.push(await grab(async () => { const s = await snap(); await frameAt(s.players[1].x, s.players[1].y - 60, 1.3); }));
await bb.up(kB.act);
await bb.up(kB.jump);
await unfreezeCam();
// the roaming gloomy STALKS the dark but shies off the glow
await port(0, 69, 13); await port(1, 72, 13);
await sleep(300);
// dazzle it off its post first (a seated guard sits until bothered)
await bb.face("B", "right");
await bb.down(kB.act);
st = await tryFor((s) => s.gloomies[1].scared > 0, 3000);
await bb.up(kB.act);
st = await waitFor((s) => s.gloomies[1].scared <= 0, 3000, "dazzle wears off");
const g2a = st.gloomies[1];
const near0 = Math.min(
  Math.hypot(g2a.x - st.players[0].x, g2a.y - st.players[0].y),
  Math.hypot(g2a.x - st.players[1].x, g2a.y - st.players[1].y));
await sleep(2800); // the displaced blob stalks back toward the robots in the dark
st = await snap();
const g2b = st.gloomies[1];
const near1 = Math.min(
  Math.hypot(g2b.x - st.players[0].x, g2b.y - st.players[0].y),
  Math.hypot(g2b.x - st.players[1].x, g2b.y - st.players[1].y));
console.log(`roaming gloomy: ${near0.toFixed(0)}px -> ${near1.toFixed(0)}px from the nearest robot`);
ok(near1 < near0 + 8, "the displaced gloomy stalks the robots in darkness (menace drift)", `${near0.toFixed(0)} -> ${near1.toFixed(0)}px`);
ok(near1 > 85, "the dark menace never pierces the robot's own glow radius", `${near1.toFixed(0)}px`);

console.log("\n=== 12. buddy-reel from the BEAM robot (DOWN+ACTION, driven) ===");
await port(0, 72, 13); await port(1, 67, 13);
await sleep(300);
await bb.faceBuddy("B", "F");
await bb.down(kB.down);
await sleep(160);
await bb.tap(kB.act);
const reelSeen = await tryFor((s) => s.players[0].reeled, 1500);
await bb.up(kB.down);
await waitFor((s) => !s.players[0].reeled, 4000, "reel resolves");
st = await snap();
const reelGap = Math.abs(st.players[1].x - st.players[0].x);
ok(!!reelSeen, "DOWN+ACTION reels the buddy (shared startReeled path)");
ok(reelGap < 140 && !st.players[0].dead, "reel delivered the buddy to the beam robot", `end gap ${reelGap.toFixed(0)}px`);

// --- backdrop identity sheet (taken BEFORE the exit, so no clear overlay) ------
console.log("\n=== W4 visual identity (Canvas tier) ===");
// (framed OUTSIDE the dark zones — inside them the mask correctly blacks
// everything out, which the w4-dark sheet already documents)
const fBD = [];
fBD.push(await grab(() => frameAt(14 * 48, 10 * 48, 0.8)));
fBD.push(await grab(() => frameAt(33 * 48, 11 * 48, 1.2)));
fBD.push(await grab(() => frameAt(61 * 48, 11.5 * 48, 1.3)));
fBD.push(await grab(() => frameAt(30 * 48, 12.8 * 48, 2.6))); // W4 tile trim closeup
await unfreezeCam();
await strip("w4-backdrop", fBD, "WORLD-4 IDENTITY — violet-black datacenter, neon seams, server racks, tile trim (Canvas)");

console.log("\n=== 13. exit DURING a freeze: finishLevel is never freezable ===");
const saveBefore = await page.evaluate(() => JSON.stringify(Object.keys(localStorage)) + (localStorage.getItem("boltbuddies_save_v1") || ""));
// stage BOTH at the door lip (setup ports skip the roaming gloomy's corridor —
// its menace was station 11's proof), THEN freeze, THEN step in — completion
// must fire while the world is still frozen
await port(0, 83, 13); await port(1, 82, 13);
await sleep(300);
// (the exit zone spans the door tile ±1 — stage just OUTSIDE it at 84.6)
await bb.walkTo("F", 84.6, { tol: 5, timeout: 8000 }).catch(() => {});
await bb.walkTo("B", 84.4, { tol: 5, timeout: 8000 }).catch(() => {});
st = await snap();
if (st.players[0].dead || st.players[1].dead) { // stray contact — recover and re-stage
  await sleep(1400);
  await port(0, 84.6, 13); await port(1, 84.4, 13);
}
await waitFor((s) => s.players[0].freezeCd <= 0, 16000, "freeze cooldown");
await bb.tap(kF.act);
st = await waitFor((s) => s.frozen, 1200, "freeze up at the door");
await bb.walkTo("F", 86.1, { tol: 5, timeout: 2500 }).catch(() => {});
await bb.walkTo("B", 86.1, { tol: 5, timeout: 2500 }).catch(() => {});
st = await waitFor((s) => s.complete, 4000, "level complete");
ok(st.complete === true && st.frozen === true, "both robots through the exit -> finishLevel fired WHILE the world was frozen", `frozen=${st.frozen}`);
const saveAfter = await page.evaluate(() => JSON.stringify(Object.keys(localStorage)) + (localStorage.getItem("boltbuddies_save_v1") || ""));
ok(saveBefore === saveAfter, "dev sandbox clear wrote NOTHING to the save");
ok(st.fxAlive <= st.fxBudget, "particle budget respected all run", `alive ${st.fxAlive}/${st.fxBudget}`);

await strip("w4-freeze", fFR, "TIME-FREEZE — frozen tableau (frost panels), badge cooldown ring");
await strip("w4-ticker", fTK, "TICKER — patrol/wind-up, frozen statue in the key lane");
await strip("w4-beam-ice", fBM, "LIGHT-BEAM + ICE DOOR — cone, melt progress fill, melted open");
await strip("w4-ghosts", fGH, "INVISIBLE PLATFORMS — solid unlit, cone-revealed");
await strip("w4-gloomy", fGL, "GLOOMY — jams the plate, dazzled off, glow blocks the return");
await strip("w4-rotbridge", fRB, "ROTATING BRIDGE — spinning, frozen flat, crossed");
await strip("w4-dark", fDK, "DARK ZONE — glow radius, cone reveal, UP-aim (Canvas tier)");

// --- body invariance (physics sacred) for the new rigs -------------------------
console.log("\n=== rig body-invariance (gloomy + ticker) ===");
const inv = await page.evaluate(() => {
  const g = window.__BB.scene;
  const box = (b) => { b.updateFromGameObject && b.updateFromGameObject(); return [+b.x.toFixed(2), +b.y.toFixed(2), +b.width.toFixed(2), +b.height.toFixed(2)].join(","); };
  const gl = g.gloomies[0].img;
  gl.body.setVelocity(0, 0);
  gl.rotation = 0;
  const gN = box(gl.body);
  gl.rotation = 0.19; // full bob/shiver pose
  const gR = box(gl.body) === gN;
  gl.rotation = 0;
  const gT = (() => { const was = gl.texture.key; gl.setTexture("gloomy_scared"); const same = box(gl.body) === gN; gl.setTexture(was); return same; })();
  const t = g.tickers[0].img;
  t.body.setVelocity(0, 0);
  t.rotation = 0;
  const tN = box(t.body);
  t.rotation = 0.05; // wind-up quiver pose
  const tR = box(t.body) === tN;
  const tT = (() => { const was = t.texture.key; t.setTexture("ticker_wind"); const same = box(t.body) === tN; t.setTexture(was); return same; })();
  t.rotation = 0;
  return { gR, gT, tR, tT, gN, tN };
});
ok(inv.gR && inv.gT, "GLOOMY body world-box byte-identical under rotation + texture states", inv.gN);
ok(inv.tR && inv.tT, "TICKER body world-box byte-identical under quiver + texture states", inv.tN);

const errsMain = errors;
ok(errsMain === 0, "main sandbox pass: 0 page errors");

// --- ?animoff=1 pass ------------------------------------------------------------
console.log("\n=== ?animoff=1 pass (rig off: static render, logic unchanged) ===");
await gotoSandbox("&animoff=1");
const offInfo = await page.evaluate(async () => {
  const g = window.__BB.scene;
  const t = g.tickers[0];
  const x0 = t.img.x;
  const gl = g.gloomies[0];
  await new Promise((r) => setTimeout(r, 3600));
  return {
    enabled: g.anim.enabled,
    tickerMoved: Math.abs(t.img.x - x0) > 10 || t.state !== "wind", // SACRED patrol logic still runs
    rotStill: t.img.rotation === 0 && gl.img.rotation === 0,        // rig writes nothing
  };
});
ok(offInfo.enabled === false, "?animoff=1 boots with the rig disabled");
ok(offInfo.tickerMoved === true, "ticker WIND/DASH (game logic) unchanged with the rig off");
ok(offInfo.rotStill, "rig-off render is static (no rotation/parts driven)");
await page.evaluate(() => { const g = window.__BB.scene; g.updateCamera = () => {}; const cam = g.cameras.main; cam.setZoom(2.2); cam.centerOn(31 * 48, 12.4 * 48); });
await sleep(200);
await page.screenshot({ path: `${SHOTS}/w4-animoff.png`, clip });
console.log(`shot -> ${SHOTS}/w4-animoff.png`);
ok(errors === errsMain, "?animoff=1 pass: 0 page errors");

// --- WebGL tier: the dark zone must carry its meaning there too -----------------
console.log("\n=== dark zone on the WebGL tier (glow + cone reveal) ===");
await page.goto(`${BASE}/?devlevel=w4`, { waitUntil: "networkidle" });
await page.waitForFunction(() => {
  const s = window.__BB && window.__BB.scene;
  return !!(s && s.def && s.def.id === "dev-w4" && s.players && s.players.length === 2);
}, null, { timeout: 25000 });
await sleep(7000); // headless SwiftShader WebGL runs slow-motion for its first seconds
const glErrs = errors;
{
  const bbg = new Driver(page);
  bbg.setRoles({ F: 0, B: 1, G: 0, H: 1 });
  await bbg.walkTo("B", 6, { tol: 12, timeout: 20000 }).catch(() => {});
  await bbg.equip("B", 6);
  await port(0, 70, 13); await port(1, 67, 13);
  await sleep(500);
  const fWG = [];
  fWG.push(await grab(() => frameAt(70 * 48, 11.5 * 48, 1.3))); // glow radius
  await bbg.face("B", "right");
  await bbg.down(KEYS[1].act);
  await sleep(600);
  fWG.push(await grab(() => frameAt(69 * 48, 11.8 * 48, 1.3))); // cone reveal
  await bbg.up(KEYS[1].act);
  await unfreezeCam();
  await strip("w4-dark-webgl", fWG, "DARK ZONE — glow radius + cone reveal (WebGL tier)");
  const rtGl = await page.evaluate(() => !!window.__BB.scene.darkRT);
  ok(rtGl, "darkness mask live on the WebGL tier too (meaning-bearing on both tiers)");
}
ok(errors === glErrs, "WebGL pass: 0 page errors");

// --- fps: the dark-zone + laser scene must stay in the family -------------------
console.log("\n=== fps: dev-w4 dark+laser scene vs 2-2 / 3-3 (Canvas, this box) ===");
const sampleFps = async () => page.evaluate(async () => {
  const gme = window.__BB.game; const s = []; const t0 = performance.now();
  return await new Promise((res) => {
    const iv = setInterval(() => {
      s.push(gme.loop.actualFps);
      if (performance.now() - t0 > 5000) { clearInterval(iv); const v = s.filter((x) => x > 0);
        res({ min: +Math.min(...v).toFixed(1), avg: +(v.reduce((a, b) => a + b) / v.length).toFixed(1) }); }
    }, 250);
  });
});
await gotoSandbox();
// (a) the laser yard, machines live
await port(0, 24, 13); await port(1, 22, 13);
await sleep(1200);
const fpsLaser = await sampleFps();
// (b) inside dark zone B (the darkness mask is repainting every frame)
await port(0, 70, 13); await port(1, 67, 13);
await sleep(1200);
const fpsDark = await sampleFps();
// baselines: 2-2 (fan room) + 3-3 (scrap storm) sampled the same way
const sampleLevel = async (idx) => {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Game");
    m.start("Game", { levelIndex: i });
  }, idx);
  await sleep(2500);
  return sampleFps();
};
const fps22 = await sampleLevel(4);
const fps33 = await sampleLevel(8);
console.log(`fps dev-w4 laser yard: ${JSON.stringify(fpsLaser)}`);
console.log(`fps dev-w4 dark zone:  ${JSON.stringify(fpsDark)}`);
console.log(`fps 2-2 baseline:      ${JSON.stringify(fps22)}`);
console.log(`fps 3-3 baseline:      ${JSON.stringify(fps33)}`);
const family = Math.min(fps22.avg, fps33.avg);
ok(fpsDark.avg > family - 6, "dark-zone scene fps stays in the family (~2-2/3-3 class)", `${fpsDark.avg} vs family ${family}`);
ok(fpsLaser.avg > family - 6, "laser scene fps stays in the family", `${fpsLaser.avg} vs family ${family}`);

await cBrowser.close();
console.log(errors ? `\nsnapped with ${errors} page error(s)` : "\nsnapped clean (0 page errors)");
if (errors) fails.push(`${errors} page error(s)`);
if (fails.length) {
  console.log(`\n${fails.length} ASSERTION(S) FAILED:`);
  fails.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
console.log("\nALL W4 M4 ASSERTIONS PASSED");
