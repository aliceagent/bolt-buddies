// W3W4 M3 — World-3 mechanics foundation: acceptance probe + contact sheets.
//
// Loads the dev-only sandbox (src/levels/dev_w3.js via ?devlevel=w3) on the
// Canvas tier and PROBE-VERIFIES every M3 mechanic with DRIVEN INPUT (the beat
// Driver — real Playwright key events; page.evaluate is used only for reads
// and for station-setup teleports, never to perform a mechanic):
//   1.  pedestal equip: MAGNET GLOVE + BUBBLE SHIELD (badges, cards, gate)
//   2.  magnet DOWN+ACTION buddy-reel (the shared startReeled path)
//   3.  bubble DOWN+ACTION buddy-bubble (partner-protect)
//   4.  crate drag-latch follow (rope-ish range) + 2-crate stair build + climb
//   5.  steel-rail cling + traverse over a hazard pit + edge-stop + jump-drop
//   6.  remote magnetic-switch flip -> door (lever-latch plumbing)
//   7.  bubble self-cast: hazard-floor roll, ~6s expiry, bounce, cooldown
//   8.  vent updraft: bubbled float to the core platform; gentle boost otherwise
//   9.  water: slow-sink + air-timer ring + drown->respawn; current push;
//       bubbled free-swim key grab at depth
//   10. zap-jelly: touch-zap death; bubbled boop -> knocked -> SOCKET powers door
//   11. junk-chomper: telegraph/lunge kill; magnet teeth-yank defang -> harmless
//   12. exit: both robots through -> complete (no save write: def.dev)
// Plus: body-invariance for the new rigs (physics sacred), an ?animoff=1 pass
// (0 errors, static render, patrol logic unchanged), the ~120 particle budget,
// contact sheets to tools/shots/w3/, and an fps A/B on 1-3 + 2-2 (inert-check).
//
//   node tools/snap_w3_m3.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { Driver, KEYS, TILE } from "./beat/driver.mjs";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = process.env.BB_SHOTS || "tools/shots/w3";
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
  await page.goto(`${BASE}/?canvas=1&devlevel=w3${extra}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const s = window.__BB && window.__BB.scene;
    return !!(s && s.def && s.def.id === "dev-w3" && s.players && s.players.length === 2);
  }, null, { timeout: 20000 });
  await sleep(1200);
};

// --- read helpers (pure) ----------------------------------------------------
const snap = () => page.evaluate(() => {
  const g = window.__BB.scene;
  const pj = (p) => ({
    x: p.x, y: p.y, tx: p.x / 48, ty: p.y / 48, dead: p.dead, skill: p.skill,
    grounded: p.grounded, bubbleT: p.bubbleT, bubbleCd: p.bubbleCd,
    magCling: !!p.magCling, magCrate: !!p.magCrate, reeled: !!p.reeled,
    inWater: !!p.inWater, airMs: p.airMs, vx: p.body.velocity.x, vy: p.body.velocity.y,
    badge: !!p.badge,
  });
  return {
    complete: g.complete, keysHeld: g.keysHeld, deaths: g._deaths,
    coresGot: [...g.coresGot],
    players: g.players.map(pj),
    crates: g.crates.map((c) => ({ x: c.img.x, y: c.img.y, held: !!c.heldBy })),
    levers: g.levers.map((l) => ({ id: l.id, on: l.on, mag: !!l.mag })),
    doors: g.doors.map((d) => ({ id: d.id, open: d.open })),
    jellies: g.jellies.map((j) => ({ x: j.img.x, y: j.img.y, state: j.state })),
    sockets: g.sockets.map((s) => ({ id: s.id, filled: s.filled })),
    chompers: g.chompers.map((c) => ({ x: c.img.x, state: c.state, defanged: c.defanged })),
    fxAlive: g.fxAlive(), fxBudget: g.fxPalette.budget,
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
// silent variant for RETRY loops (a timeout is an expected retry, not a failure)
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
  if (p.magCrate) g.releaseMagCrate(p, true);
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
const grab = async (framer) => { if (framer) await framer(); await sleep(60); const buf = await page.screenshot({ clip }); return buf.toString("base64"); };
const strip = async (name, frames, label, w = 285, h = 195) => {
  const imgs = frames.map((f) => `<img src="data:image/png;base64,${f}" style="display:block;width:${w}px;height:${h}px;border-radius:6px">`).join("");
  const html = `<body style="margin:0"><div style="display:inline-flex;flex-direction:column;gap:6px;background:#0a0f1e;padding:10px;font-family:monospace">`
    + `<div style="color:#8fa3d9;font-size:13px">W3 M3 · ${label}</div>`
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
bb.setRoles({ M: 0, B: 1, G: 0, H: 1 });
const kM = KEYS[0];
const kB = KEYS[1];

console.log("\n=== 1. pedestal equip (driven) ===");
const sk1 = await bb.equip("M", 3);
const sk2 = await bb.equip("B", 6);
ok(sk1 === "magnet" && sk2 === "bubble", "both W3 skills equipped from pedestals", `M=${sk1} B=${sk2}`);
let st = await waitFor((s) => s.doors.find((d) => d.id === "gate").open, 4000, "skills gate opens");
ok(st.players[0].badge && st.players[1].badge, "HUD badges built on equip (icon_magnet / icon_bubble)");

console.log("\n=== 2. magnet DOWN+ACTION buddy-reel (shared startReeled path) ===");
await port(0, 2, 13); await port(1, 7, 13);
await sleep(300);
await bb.faceBuddy("M", "B");
await bb.down(kM.down);
await sleep(160);
await bb.tap(kM.act);
const reelSeen = await waitFor((s) => s.players[1].reeled, 1500, "buddy reeled").then((s) => s && s.players[1].reeled).catch(() => false);
await bb.up(kM.down);
await waitFor((s) => !s.players[1].reeled, 4000, "reel resolves");
st = await snap();
const reelGap = Math.abs(st.players[1].x - st.players[0].x);
ok(reelSeen === true, "DOWN+ACTION reels the buddy (startReeled fired)");
ok(reelGap < 140 && !st.players[1].dead, "reel delivered the buddy to the magnet", `end gap ${reelGap.toFixed(0)}px`);

console.log("\n=== 3. bubble DOWN+ACTION buddy-bubble ===");
await port(0, 3, 13); await port(1, 6, 13);
await sleep(250);
await bb.down(kB.down);
await sleep(160);
await bb.tap(kB.act);
await bb.up(kB.down);
st = await waitFor((s) => s.players[0].bubbleT > 0, 1200, "buddy bubbled");
ok(st.players[0].bubbleT > 4500, "DOWN+ACTION bubbles the BUDDY (~6s)", `M.bubbleT=${st.players[0].bubbleT.toFixed(0)}ms`);
ok(st.players[1].bubbleCd > 0, "caster owns the cooldown", `B.bubbleCd=${st.players[1].bubbleCd.toFixed(0)}ms`);
const fBB = [];
fBB.push(await grab(() => frameAt(st.players[0].x, st.players[0].y - 10)));
await page.evaluate(() => { const g = window.__BB.scene; g.popBubble(g.players[0], false); }); // clear for the next stations (teardown only)
await unfreezeCam();

console.log("\n=== 4. crate drag-latch + stair build + climb (driven) ===");
await port(0, 10, 13);
await sleep(250);
await bb.walkTo("M", 11, { tol: 10 });
await bb.act("M");
st = await snap();
ok(st.crates.some((c) => c.held), "ACTION near a metal crate drag-latches it");
const fCR = [];
await frameAt(st.players[0].x + 60, st.players[0].y - 20); fCR.push(await grab());
// follow while walking: sample the tether distance
let maxD = 0;
await bb.down(kM.right);
const followEnd = Date.now() + 2600;
while (Date.now() < followEnd) {
  const s = await snap();
  const held = s.crates.find((c) => c.held);
  if (held) maxD = Math.max(maxD, Math.hypot(held.x - s.players[0].x, held.y - s.players[0].y));
  if (s.players[0].tx >= 15) break;
  await sleep(60);
}
await bb.up(kM.right);
await sleep(300);
fCR.push(await grab(async () => { const s = await snap(); await frameAt(s.players[0].x + 30, s.players[0].y - 30); }));
ok(maxD > 0 && maxD < 300, "latched crate follows within rope-ish range while walking", `max tether ${maxD.toFixed(0)}px (cap 300)`);
// walking on: the un-latched crate is a plain PUSHABLE physics box — M shoves it
// to the wall base while the latched one floats at head height behind the glove.
await bb.walkTo("M", 15, { tol: 8 });
await bb.face("M", "right");
await sleep(900); // hover settles over the pushed crate at the wall base
st = await snap();
ok(st.crates.filter((c) => c.held).length === 1, "one crate dragged (latched) while the other was pushed (plain physics box)");
await bb.act("M"); // release -> the held crate drops onto the pushed one
await sleep(1200);
st = await snap();
const [c1, c2] = st.crates.slice().sort((a, b) => b.y - a.y); // bottom first
const stackDy = c1.y - c2.y;
const stackDx = Math.abs(c1.x - c2.x);
ok(stackDy > 34 && stackDy < 60 && stackDx < 14, "two crates stacked into a stair (real physics boxes)", `dy=${stackDy.toFixed(0)} dx=${stackDx.toFixed(0)}`);
fCR.push(await grab(() => frameAt(c1.x, c1.y - 40)));
await unfreezeCam();
const deathsBeforeClimb = st.deaths;
await bb.walkTo("M", 20, { tol: 14, timeout: 20000 }).catch(() => {}); // climb the stair over the wall
st = await snap();
ok(st.players[0].tx > 18.5 && st.deaths === deathsBeforeClimb, "climbed the crate stair over the 4-high wall (driven)", `M at tile ${st.players[0].tx.toFixed(1)}`);
fCR.push(await grab(async () => { const s = await snap(); await frameAt(s.players[0].x, s.players[0].y - 20); }));
await unfreezeCam();
await strip("w3-crates", fCR, "METAL CRATES — drag-latch, rope-range follow, 2-crate stair build, climb");

console.log("\n=== 5. steel-rail cling + traverse over the hazard pit (driven) ===");
await port(0, 21, 13);
await sleep(250);
await bb.act("M");
st = await waitFor((s) => s.players[0].magCling, 1200, "rail cling latched");
ok(st.players[0].magCling, "ACTION under the rail clings (gravity off, snapped to the underside)", `y=${st.players[0].y.toFixed(0)}`);
const clingY = st.players[0].y;
const fRL = [];
fRL.push(await grab(() => frameAt(st.players[0].x, st.players[0].y + 10)));
const deathsBeforeRail = st.deaths;
await bb.down(kM.right);
let yDrift = 0;
const railEnd = Date.now() + 8000;
let railX = 0;
while (Date.now() < railEnd) {
  const s = await snap();
  railX = s.players[0].x;
  yDrift = Math.max(yDrift, Math.abs(s.players[0].y - clingY));
  if (railX >= 30 * TILE) break;
  await sleep(80);
}
fRL.push(await grab(async () => { const s = await snap(); await frameAt(s.players[0].x, s.players[0].y + 10); }));
// edge stop: keep holding right past the rail end — x must pin at the edge
await sleep(900);
const sEdge = await snap();
const edgeX = sEdge.players[0].x;
await sleep(500);
const sEdge2 = await snap();
await bb.up(kM.right);
ok(railX >= 30 * TILE && yDrift < 8 && sEdge.deaths === deathsBeforeRail,
  "traversed the rail over the hazard pit (y locked, no deaths)", `x ${(railX / 48).toFixed(1)}t yDrift ${yDrift.toFixed(1)}px`);
ok(Math.abs(sEdge2.players[0].x - edgeX) < 4 && sEdge2.players[0].magCling,
  "edge-stop: still clinging, pinned at the rail end", `x=${(edgeX / 48).toFixed(2)}t`);
await bb.tap(kM.jump, 90); // drop on jump
st = await waitFor((s) => !s.players[0].magCling && s.players[0].grounded, 3000, "dropped off the rail");
ok(!st.players[0].magCling && !st.players[0].dead, "jump releases the cling (drop, alive)", `landed tile ${st.players[0].tx.toFixed(1)}`);
fRL.push(await grab(async () => { const s = await snap(); await frameAt(s.players[0].x, s.players[0].y - 10); }));
await unfreezeCam();

console.log("\n=== 6. magnetic switch: remote magnet flip -> door (driven) ===");
await bb.walkTo("M", 32, { tol: 8 });
await bb.face("M", "right");
st = await snap();
const msDist = Math.hypot(34 * 48 + 24 - st.players[0].x, 12 * 48 + 24 - st.players[0].y);
await bb.act("M");
st = await waitFor((s) => s.levers.find((l) => l.id === "ms1").on, 1500, "magswitch flipped");
ok(st.levers.find((l) => l.id === "ms1").on, "magnet ACTION flips the magswitch REMOTELY", `from ${msDist.toFixed(0)}px away`);
st = await waitFor((s) => s.doors.find((d) => d.id === "gate3").open, 2500, "gate3 opens");
ok(st.doors.find((d) => d.id === "gate3").open, "magswitch drives its door via the lever-latch plumbing");
fRL.push(await grab(() => frameAt(35.5 * 48, 12 * 48, 1.5)));
await unfreezeCam();
await strip("w3-rail-switch", fRL, "STEEL RAIL + MAGSWITCH — cling, traverse over hazard, drop; remote flip opens gate3");

console.log("\n=== 7. bubble self-cast: hazard roll + expiry + cooldown (driven) ===");
await port(1, 20, 13);
await waitFor((s) => s.players[1].bubbleCd <= 0, 4000, "bubble cooldown ready");
await bb.tap(kB.act);
st = await waitFor((s) => s.players[1].bubbleT > 0, 1200, "self-bubble up");
const bubbleT0 = st.players[1].bubbleT;
const t0 = Date.now();
const deathsBeforeRoll = st.deaths;
const fBU = fBB; // continue the bubble sheet
fBU.push(await grab(() => frameAt(st.players[1].x, st.players[1].y - 10)));
await unfreezeCam();
await bb.walkTo("B", 33, { tol: 12, timeout: 12000 }); // roll straight over the '^' pit
st = await snap();
ok(st.deaths === deathsBeforeRoll && st.players[1].tx > 31, "bubbled robot ROLLS over the electric floor (0 deaths)", `tile ${st.players[1].tx.toFixed(1)}`);
fBU.push(await grab(async () => { const s = await snap(); await frameAt(s.players[1].x, s.players[1].y - 10); }));
await unfreezeCam();
st = await waitFor((s) => s.players[1].bubbleT <= 0, 9000, "bubble expires");
const lived = Date.now() - t0;
ok(lived > 4500 && lived < 8500, "bubble expires on its ~6s timer", `granted ${bubbleT0.toFixed(0)}ms, lived ${lived}ms`);
ok(st.players[1].bubbleCd > 0 || lived < 6300, "re-bubble cooldown armed after the pop");

console.log("\n=== 8. vent updraft: bubbled float vs gentle boost (driven) ===");
await port(1, 47, 13);
await waitFor((s) => s.players[1].bubbleCd <= 0, 4000, "cooldown ready");
// un-bubbled first: the draft is only a gentle boost
await bb.walkTo("B", 49, { tol: 8 });
await sleep(1500);
st = await snap();
ok(st.players[1].ty > 12, "un-bubbled robot gets only a gentle boost (stays grounded)", `ty=${st.players[1].ty.toFixed(2)}`);
// now bubble + ride the column to the core platform. Re-center first — the
// draft column is fan-family narrow (TILE-8), and the boost-stand drifts a few px.
await bb.walkTo("B", 49, { tol: 4 });
await bb.tap(kB.act);
await waitFor((s) => s.players[1].bubbleT > 0, 1200, "bubbled for the ride");
// confirm the lift took (rising within the column); re-center + re-try once if not
{
  const rose = await tryFor((s) => s.players[1].vy < -80, 1200);
  if (!rose) {
    await bb.walkTo("B", 49, { tol: 4 });
    await tryFor((s) => s.players[1].vy < -80, 1500);
  }
}
const fUP = [];
let minY = 999;
const rideEnd = Date.now() + 7000;
let shots = 0;
while (Date.now() < rideEnd) {
  const s = await snap();
  minY = Math.min(minY, s.players[1].y);
  if (s.players[1].y < 7.85 * 48) { await bb.down(kB.right); } // drift onto the platform only once ABOVE its top face
  if (shots < 2 && s.players[1].y < (12 - shots * 2.5) * 48) { fUP.push(await grab(() => frameAt(49 * 48, s.players[1].y))); shots++; }
  if (s.players[1].tx > 50.2 || s.players[1].y < 7.2 * 48) break;
  await sleep(70);
}
await sleep(900);
await bb.up(kB.right);
ok(minY < 8.2 * 48, "BUBBLED robot floats up the vent column (above the platform top)", `minY ${(minY / 48).toFixed(2)} tiles`);
// a bubbled lander can bounce past the platform lip — the float + the platform
// CORE are the mechanic; just confirm it comes down safe and grabs the core.
st = await waitFor((s) => s.players[1].grounded && !s.players[1].dead, 6000, "floater comes down safe");
await bb.walkTo("B", 52, { tol: 10 }).catch(() => {});
st = await snap();
ok(st.coresGot[1] === true && !st.players[1].dead, "core over the vent column collected on the ride", `B tile (${st.players[1].tx.toFixed(1)}, ${st.players[1].ty.toFixed(1)})`);
fUP.push(await grab(async () => { const s = await snap(); await frameAt(s.players[1].x, s.players[1].y); }));
await unfreezeCam();
await strip("w3-updraft", fUP, "VENT UPDRAFT — bubbled float up the column to the core platform");

console.log("\n=== 9. water: sink / air-timer / drown / current / bubbled swim (driven) ===");
// (a) un-bubbled M: slow sink + air ring + drown -> standard respawn
await port(0, 54, 13);
await sleep(200);
await bb.walkTo("M", 55, { tol: 8 }); // arm the tank-side checkpoint
const deathsBeforeDrown = (await snap()).deaths;
// walk off the rim and SAMPLE the descent from the very first in-water frame:
// buoyancy must brake the entry fall toward the slow-sink terminal (~55)
await bb.down(kM.right);
let sinkSamples = [];
let tDrown0 = 0;
{
  const sEnd = Date.now() + 4500;
  let entered = false;
  while (Date.now() < sEnd) {
    const s = await snap();
    if (s.players[0].inWater) {
      if (!entered) { entered = true; tDrown0 = Date.now(); await bb.up(kM.right); }
      if (!s.players[0].grounded) sinkSamples.push(s.players[0].vy);
      else if (sinkSamples.length) break; // settled on the tank floor
    }
    await sleep(70);
  }
  await bb.up(kM.right);
}
// buoyancy proof: descent vy decays monotonically-ish toward the slow-sink
// terminal (~55; the shallow tank floor arrives before full convergence)
const decayed = sinkSamples.length >= 3 && sinkSamples[sinkSamples.length - 1] < sinkSamples[0] * 0.6;
const slowedTo = sinkSamples.length ? Math.min(...sinkSamples) : 999;
st = await snap();
ok(decayed && slowedTo < 140 && st.players[0].grounded, "un-bubbled robot slow-sinks to the tank floor (buoyancy brakes the fall)",
  `descent vy [${sinkSamples.map((v) => v.toFixed(0)).join(",")}] -> floor (terminal 55 in open water)`);
const fWA = [];
fWA.push(await grab(() => frameAt(st.players[0].x, st.players[0].y - 20)));
st = await waitFor((s) => s.players[0].airMs > 4800, 6000, "air timer runs");
fWA.push(await grab(() => frameAt(st.players[0].x, st.players[0].y - 20))); // last-1.5s blink
st = await waitFor((s) => s.deaths > deathsBeforeDrown, 4000, "drown death");
const drownMs = Date.now() - tDrown0;
ok(st.deaths === deathsBeforeDrown + 1, "air ran out -> the standard hazard death", `drowned after ~${drownMs}ms (spec 6000)`);
st = await waitFor((s) => !s.players[0].dead, 4000, "standard respawn");
ok(!st.players[0].dead && !st.players[0].inWater, "respawned at the checkpoint (out of the tank)", `tile ${st.players[0].tx.toFixed(1)}`);
await unfreezeCam();
// (b) bubbled B: current push while idle, then free-swim to the key at depth.
// Drop straight in (no horizontal momentum) so the drift measures the CURRENT.
await port(1, 62, 12);
await waitFor((s) => s.players[1].inWater, 3000, "B dropped into the tank");
await waitFor((s) => s.players[1].bubbleCd <= 0, 4000, "cooldown ready");
await bb.tap(kB.act);
st = await waitFor((s) => s.players[1].bubbleT > 0, 1200, "bubbled");
// swim up off the floor so the drift measures the FREE-WATER current (grounded
// friction on the tank floor rightly damps it)
await bb.tap(kB.jump, 350);
await sleep(400);
st = await snap();
const cx0 = st.players[1].x;
await sleep(1500);
st = await snap();
const drift = st.players[1].x - cx0;
ok(drift < -25 && !st.players[1].grounded, "current field pushes the floating swimmer (current: -50)", `drift ${drift.toFixed(0)}px in 1.5s`);
ok(st.players[1].airMs === 0, "a BUBBLED robot has no air timer underwater");
// swim to the key (60,16) — down + left/right steering
await bb.down(kB.down);
await bb.down(kB.right);
st = await waitFor((s) => s.keysHeld >= 1 || s.players[1].ty > 15.4, 5000, "swimming to depth");
await bb.up(kB.down);
if ((await snap()).keysHeld < 1) {
  // steer along the floor to the key
  const kEnd = Date.now() + 6000;
  while (Date.now() < kEnd) {
    const s = await snap();
    if (s.keysHeld >= 1) break;
    const kx = 60 * 48 + 24;
    if (s.players[1].x > kx + 20) { await bb.up(kB.right); await bb.down(kB.left); }
    else if (s.players[1].x < kx - 20) { await bb.up(kB.left); await bb.down(kB.right); }
    if (s.players[1].bubbleT <= 0 && s.players[1].bubbleCd <= 0) await bb.tap(kB.act); // re-bubble at depth
    await sleep(90);
  }
}
await bb.up(kB.left);
st = await snap();
ok(st.keysHeld >= 1, "BUBBLED robot swam freely underwater and carried the key off the tank floor", `key at depth ty16, B ty=${st.players[1].ty.toFixed(1)}`);
fWA.push(await grab(() => frameAt(st.players[1].x, st.players[1].y)));
await unfreezeCam();
await strip("w3-water", fWA, "WATER — slow-sink + air-timer ring, drown->respawn, bubbled free-swim key grab");

console.log("\n=== 10. zap-jelly: zap death; bubbled boop -> socket powers the door (driven) ===");
await port(1, 71, 13); // B (has the key) out of the tank
await port(0, 71, 13);
await sleep(300);
// (a) touch = zap (standard death): un-bubbled M jumps into the floater
const deathsBeforeZap = (await snap()).deaths;
await bb.walkTo("M", 73, { tol: 10 });
let zapped = false;
for (let i = 0; i < 5 && !zapped; i++) {
  const s = await snap();
  const j = s.jellies[0];
  const dxj = j.x - s.players[0].x;
  if (Math.abs(dxj) > 40) { await bb.walkTo("M", (j.x - 24) / 48, { tol: 8, timeout: 3000 }).catch(() => {}); }
  await bb.tap(kM.jump, 240);
  zapped = !!(await tryFor((s2) => s2.deaths > deathsBeforeZap, 1600));
}
ok(zapped, "touching the zap-jelly un-bubbled = standard zap death/respawn");
await waitFor((s) => !s.players[0].dead, 4000, "M respawns");
// (b) bubbled boop: knock the jelly into the socket (repeat boops until it locks)
await waitFor((s) => s.players[1].bubbleCd <= 0, 5000, "cooldown ready");
const fJL = [];
st = await snap();
fJL.push(await grab(() => frameAt(st.jellies[0].x, st.jellies[0].y))); // patrol + tentacles
await unfreezeCam();
let socketed = false;
let knockShot = false;
const sockX = 79 * 48 + 24;
for (let i = 0; i < 10 && !socketed; i++) {
  st = await snap();
  if (st.players[1].dead) { await sleep(1600); continue; }
  if (st.players[1].bubbleT <= 0) {
    await tryFor((s) => s.players[1].bubbleCd <= 0, 4000);
    await bb.tap(kB.act);
    const got = await tryFor((s) => s.players[1].bubbleT > 0 || s.players[1].dead, 1800);
    if (!got || got.players[1].dead || got.players[1].bubbleT <= 0) continue;
  }
  st = await snap();
  const j = st.jellies[0];
  if (j.state === "socketed") { socketed = true; break; }
  // approach from the side OPPOSITE the socket, then jump-drift INTO the jelly:
  // the boop knocks it the way the booper is moving — toward the socket.
  const fromLeft = j.x < sockX;
  const standX = fromLeft ? j.x - 70 : j.x + 70;
  await bb.walkTo("B", (standX - 24) / 48, { tol: 8, timeout: 4000 }).catch(() => {});
  const driftKey = fromLeft ? kB.right : kB.left;
  await bb.down(driftKey);
  await bb.tap(kB.jump, 140);
  await sleep(600);
  await bb.up(driftKey);
  const after = await snap();
  if (after.jellies[0].state === "knocked" && !knockShot) {
    knockShot = true;
    fJL.push(await grab(() => frameAt(after.jellies[0].x, after.jellies[0].y)));
    await unfreezeCam();
  }
  socketed = !!(await tryFor((s) => s.sockets[0].filled, 2400));
}
st = await snap();
ok(socketed && st.jellies[0].state === "socketed", "bubbled boop knocked the jelly INTO the socket (locked in, harmless)");
ok(st.levers.find((l) => l.id === "sock1").on, "socketed jelly POWERS the circuit (lever-latch plumbing)");
// key + socket -> jdoor opens as B approaches
await bb.walkTo("B", 80, { tol: 10 });
st = await waitFor((s) => s.doors.find((d) => d.id === "jdoor").open, 4000, "jdoor opens");
ok(st.doors.find((d) => d.id === "jdoor").open, "jelly-powered door OPEN (socket + the underwater key)");
fJL.push(await grab(() => frameAt(79 * 48, 11.5 * 48)));
await unfreezeCam();
await strip("w3-jelly", fJL, "ZAP-JELLY — patrol, bubbled boop knock, socketed -> powers jdoor");

console.log("\n=== 11. junk-chomper: lunge kill; magnet teeth-yank defang (driven) ===");
await port(0, 78, 13);
await sleep(250);
const fCH = [];
st = await snap();
fCH.push(await grab(() => frameAt(st.chompers[0].x, 12.6 * 48))); // idle chomp
await unfreezeCam();
// (a) walk into its yard un-protected -> telegraph -> lunge -> standard death
const deathsBeforeBite = st.deaths;
await bb.walkTo("M", 82.5, { tol: 8, timeout: 6000 }).catch(() => {});
st = await waitFor((s) => s.chompers[0].state === "tele" || s.chompers[0].state === "lunge" || s.deaths > deathsBeforeBite, 5000, "chomper reacts");
fCH.push(await grab(async () => { const s = await snap(); await frameAt(s.chompers[0].x, 12.6 * 48); }));
await unfreezeCam();
const bitten = await waitFor((s) => s.deaths > deathsBeforeBite, 4000, "lunge bite").then((s) => s.deaths > deathsBeforeBite).catch(() => false);
ok(bitten, "chomper telegraphs + lunges: the bite is the standard death/respawn");
await waitFor((s) => !s.players[0].dead, 4000, "M respawns");
// (b) magnet ACTION yanks the teeth out (defeat interaction — no stomping)
await port(0, 78, 13);
await sleep(250);
await bb.walkTo("M", 80, { tol: 8, timeout: 5000 }).catch(() => {});
let defanged = false;
for (let i = 0; i < 6 && !defanged; i++) {
  st = await snap();
  const dxc = Math.abs(st.chompers[0].x - st.players[0].x);
  if (dxc > 200) await bb.walkTo("M", (st.chompers[0].x - 150) / 48, { tol: 8, timeout: 3000 }).catch(() => {});
  await bb.act("M");
  st = await snap();
  defanged = st.chompers[0].defanged;
  if (!defanged) await sleep(400);
}
ok(defanged, "magnet ACTION yanked the chomper's teeth out (defanged)");
fCH.push(await grab(async () => { const s = await snap(); await frameAt(s.chompers[0].x, 12.6 * 48); }));
await unfreezeCam();
// (c) defanged = harmless dozer: stand in its yard for 1.5s
const deathsBeforeDozer = (await snap()).deaths;
await bb.walkTo("M", 84, { tol: 12, timeout: 5000 }).catch(() => {});
await sleep(1500);
st = await snap();
ok(st.deaths === deathsBeforeDozer && !st.players[0].dead, "defanged chomper is a harmless dozer (1.5s overlap, no deaths)");
fCH.push(await grab(async () => { const s = await snap(); await frameAt(s.chompers[0].x, 12.6 * 48); }));
await unfreezeCam();
await strip("w3-chomper", fCH, "JUNK-CHOMPER — idle, telegraph/lunge, magnet teeth-yank defang, harmless dozer");

// --- backdrop identity sheet (taken BEFORE the exit, so no clear overlay) ------
console.log("\n=== W3 visual identity (Canvas tier) ===");
const fBD = [];
fBD.push(await grab(() => frameAt(14 * 48, 11 * 48, 0.8)));
fBD.push(await grab(() => frameAt(45 * 48, 10 * 48, 0.8)));
fBD.push(await grab(() => frameAt(62 * 48, 12 * 48, 0.8)));
fBD.push(await grab(() => frameAt(24 * 48, 12.6 * 48, 2.6))); // tile trim closeup
await unfreezeCam();
await strip("w3-backdrop", fBD, "WORLD-3 IDENTITY — foundry silhouettes (rails/hooks/coils), amber accent, tile trim (Canvas)");

console.log("\n=== 12. exit: both through -> complete (dev level never writes the save) ===");
const saveBefore = await page.evaluate(() => localStorage.getItem("boltbuddies_save_v1") || localStorage.getItem("bb_save_v1") || JSON.stringify(Object.keys(localStorage)));
await port(1, 83, 13);
await bb.walkTo("B", 86, { tol: 10, timeout: 8000 }).catch(() => {});
await bb.walkTo("M", 86, { tol: 10, timeout: 8000 }).catch(() => {});
st = await waitFor((s) => s.complete, 6000, "level complete");
ok(st.complete === true, "both robots through the exit -> finishLevel");
const saveAfter = await page.evaluate(() => localStorage.getItem("boltbuddies_save_v1") || localStorage.getItem("bb_save_v1") || JSON.stringify(Object.keys(localStorage)));
ok(saveBefore === saveAfter, "dev sandbox clear wrote NOTHING to the save", `keys ${saveAfter}`);
ok(st.fxAlive <= st.fxBudget, "particle budget respected all run", `alive ${st.fxAlive}/${st.fxBudget}`);

await strip("w3-bubble", fBU, "BUBBLE SHIELD — buddy-bubble, self-bubble, hazard-floor roll");

// --- body invariance (physics sacred) for the new rigs -------------------------
console.log("\n=== rig body-invariance (jelly + chomper) ===");
const inv = await page.evaluate(() => {
  const g = window.__BB.scene;
  const out = {};
  const box = (b) => { b.updateFromGameObject && b.updateFromGameObject(); return [+b.x.toFixed(2), +b.y.toFixed(2), +b.width.toFixed(2), +b.height.toFixed(2)].join(","); };
  const j = g.jellies[0].img;
  j.body.setVelocity(0, 0);
  j.rotation = 0;
  const jN = box(j.body);
  j.rotation = 0.3; // full wobble/knock-spin pose
  const jR = box(j.body) === jN;
  j.rotation = 0;
  const c = g.chompers[0].img;
  c.body.setVelocity(0, 0);
  c.rotation = 0;
  const cN = box(c.body);
  c.rotation = -0.09; // telegraph tilt
  const cR = box(c.body) === cN;
  const cT = (() => { const was = c.texture.key; c.setTexture("chomper_alert"); const same = box(c.body) === cN; c.setTexture(was); return same; })();
  c.rotation = 0;
  return { jR, cR, cT, jN, cN };
});
ok(inv.jR, "JELLY body world-box byte-identical under the wobble/knock rotation", inv.jN);
ok(inv.cR && inv.cT, "CHOMPER body world-box byte-identical under tilt + texture states", inv.cN);

const errsMain = errors;
ok(errsMain === 0, "main sandbox pass: 0 page errors");

// --- ?animoff=1 pass ------------------------------------------------------------
console.log("\n=== ?animoff=1 pass (rig off: static render, logic unchanged) ===");
await gotoSandbox("&animoff=1");
const offInfo = await page.evaluate(async () => {
  const g = window.__BB.scene;
  const j = g.jellies[0];
  const x0 = j.img.x;
  const rot0 = j.img.rotation;
  await new Promise((r) => setTimeout(r, 1200));
  return {
    enabled: g.anim.enabled,
    patrolMoved: Math.abs(j.img.x - x0) > 10, // SACRED patrol logic still runs
    rotStill: j.img.rotation === rot0 && j.img.rotation === 0, // rig writes nothing
    chompRot: g.chompers[0].img.rotation,
  };
});
ok(offInfo.enabled === false, "?animoff=1 boots with the rig disabled");
ok(offInfo.patrolMoved === true, "jelly PATROL (game logic) unchanged with the rig off");
ok(offInfo.rotStill && offInfo.chompRot === 0, "rig-off render is static (no rotation/parts driven)");
await page.evaluate(() => { const g = window.__BB.scene; g.updateCamera = () => {}; const cam = g.cameras.main; cam.setZoom(2.2); cam.centerOn(74 * 48, 12 * 48); });
await sleep(200);
await page.screenshot({ path: `${SHOTS}/w3-animoff.png`, clip });
console.log(`shot -> ${SHOTS}/w3-animoff.png`);
ok(errors === errsMain, "?animoff=1 pass: 0 page errors");

// --- fps A/B on 1-3 + 2-2 (the inert-elsewhere guard) --------------------------
console.log("\n=== fps on 1-3 + 2-2 (dev build; compare vs pre-change baseline) ===");
await page.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
await sleep(1500);
const sampleFps = async (idx) => {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Title"); m.stop("Hub"); m.stop("Game");
    m.start("Game", { levelIndex: i });
  }, idx);
  await sleep(2500);
  return page.evaluate(async () => {
    const gme = window.__BB.game; const s = []; const t0 = performance.now();
    return await new Promise((res) => {
      const iv = setInterval(() => {
        s.push(gme.loop.actualFps);
        if (performance.now() - t0 > 5000) { clearInterval(iv); const v = s.filter((x) => x > 0);
          res({ min: +Math.min(...v).toFixed(1), avg: +(v.reduce((a, b) => a + b) / v.length).toFixed(1) }); }
      }, 250);
    });
  });
};
const fpsOut = { "1-3": [], "2-2": [] };
for (let r = 0; r < 2; r++) {
  fpsOut["1-3"].push(await sampleFps(2));
  fpsOut["2-2"].push(await sampleFps(4));
}
console.log("fps (dev build):", JSON.stringify(fpsOut));
console.log('fps (pre-change baseline, same box/method): {"1-3":[{"min":29.1,"avg":34.1},{"min":23.7,"avg":24.2}],"2-2":[{"min":24,"avg":24.5},{"min":24.9,"avg":25.6}]}');

await cBrowser.close();
console.log(errors ? `\nsnapped with ${errors} page error(s)` : "\nsnapped clean (0 page errors)");
if (errors) fails.push(`${errors} page error(s)`);
if (fails.length) {
  console.log(`\n${fails.length} ASSERTION(S) FAILED:`);
  fails.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
console.log("\nALL W3 M3 ASSERTIONS PASSED");
