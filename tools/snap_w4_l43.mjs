// W3W4 L43 — level 4-3 "KOBI's Heart" (the FINALE) screenshot + fps tool.
//
// Canvas tier. Shoots the intro card, the fight opener (the hovering eye +
// turbine gauntlets), the eye BLINDED mid-beam (dazzle bar + squint), the
// exposed core with its warning rings, the FROZEN turbine run (frost panels +
// the partner at the core), the KOBI power-down, the Bolt rescue bound, the
// "BOLT RESCUED!" clear overlay, the epilogue playground and the credits roll
// to tools/shots/w4/ (l43-*.png), then samples fps on 4-3 twice (the turbines
// + the eye + the hall dark zone are the cost centers). Every mechanic in the
// shots is DRIVEN (real keys via the beat Driver + the 4-3 route helpers);
// page.evaluate is used only for reads, station-setup teleports and camera
// framing — never to perform a mechanic.
//
//   node tools/snap_w4_l43.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { Driver } from "./beat/driver.mjs";
import route43, { helpers as h } from "./beat/routes/4-3.mjs";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = process.env.BB_SHOTS || "tools/shots/w4";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
await page.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
await sleep(1500);
await page.evaluate(() => {
  localStorage.clear();
  const m = window.__BB.game.scene;
  ["UI", "Game", "Title", "Hub", "Epilogue"].forEach((k) => m.stop(k));
  m.start("Game", { levelIndex: 11 });
});
// intro card: catch the banner while it holds (slides in ~240ms, holds 1.6s)
await sleep(900);
await page.screenshot({ path: `${SHOTS}/l43-intro.png` });
console.log(`shot -> ${SHOTS}/l43-intro.png`);
await sleep(2200); // banner gone, KOBI start blip typing

const bb = new Driver(page);
bb.setRoles({ F: 0, B: 1 });
bb.deathBudget = 6; // photography run: generous retry headroom per staged beat
const T = 48;
const frameAt = (x, y, z = 1.3) => page.evaluate(([x, y, z]) => {
  const g = window.__BB.scene;
  if (!g._camFrozen) { g._camFrozen = true; g.updateCamera = () => {}; }
  const cam = g.cameras.main;
  cam.setZoom(z);
  cam.centerOn(x, y);
}, [x, y, z]);
const shoot = async (name, x, y, z) => {
  await frameAt(x, y, z);
  await sleep(250);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  console.log(`shot -> ${SHOTS}/${name}.png`);
};

// --- stage on real input: equip + the dark hall (route steps 0-1) -----------
for (let i = 0; i <= 1; i++) { bb.stepDeaths = 0; await route43[i].fn(bb); }

// fight opener: the buddies at the arena mouth, the hovering eye, gauntlets
await shoot("l43-arena", 45 * T, 10 * T, 0.72);

// --- the BLIND, driven, with a mid-hold shot ---------------------------------
// B mounts the west perch and holds the beam ON the eye: shot at ~60% dazzle
// (bar + squint + lit cone), then the exposed core with its warning rings.
const kB = bb.keysFor("B");
await h.glareSafeWalk(bb, "B", h.PERCH, { tol: 7 });
await bb.face("B", "right");
await bb.waitFor((s) => s.players[bb.idx("B")].beamMs > 3400, 16000, "battery").catch(() => {});
await bb.down(kB.act);
await page.waitForFunction(() => {
  const g = window.__BB.scene;
  return g.heart.dazzle > 1300;
}, null, { timeout: 9000 }).catch(() => {});
await shoot("l43-eye-blinded", 45.5 * T, 11 * T, 1.25);
await bb.waitFor((s) => s.heart.stations[0].exposed, 6000, "core exposed").catch(() => {});
await bb.up(kB.act);
// self-heal: if the photographed hold flaked (a death mid-hold), the route's
// own idempotent blind helper finishes the expose before the next beat
for (let att = 0; att < 3; att++) {
  try { bb.stepDeaths = 0; await h.blindEye(bb, 0); break; } catch (e) { console.log(`retry blind: ${e.message}`); }
}
await shoot("l43-core-exposed", 57 * T, 11.5 * T, 1.3);

// --- the FROZEN RUN, driven: freeze -> frost panels -> partner at the core ---
const kF = bb.keysFor("F");
await h.glareSafeWalk(bb, "F", h.PARKS[0], { tol: 7 });
await bb.waitFor((s) => s.players[bb.idx("F")].freezeCd <= 0 && !s.frozen, 20000, "freeze ready").catch(() => {});
await bb.tap(kF.act);
await bb.waitFor((s) => s.frozen, 1500, "frozen").catch(() => {});
await bb.walkTo("F", 57.8, { tol: 5, timeout: 3200 }).catch(() => {});
await shoot("l43-turbines-frozen", 57.5 * T, 11.5 * T, 1.35);
await bb.walkTo("F", h.CORES[0], { tol: 7, timeout: 3600 }).catch(() => {});
await bb.waitFor((s) => s.heart.stations[0].taken, 3000, "core 1 unplugged").catch(() => {});
// the route's staging discipline: B retreats off the perch to the safe wing,
// and the idempotent takeRun self-heals the staged take if a death spoiled it
await h.glareSafeWalk(bb, "B", 31.8, { tol: 14 }).catch(() => {});
// finish the fight on the route's own (idempotent) helpers — with photography
// retries: a flaked stage leg is just re-driven, progress is monotonic
const drive = async (label, fn) => {
  for (let att = 0; att < 3; att++) {
    try { bb.stepDeaths = 0; await fn(); return; } catch (e) { console.log(`retry ${label}: ${e.message}`); }
  }
  throw new Error(`${label} did not land after 3 driven attempts`);
};
await drive("take station 1", () => h.takeRun(bb, 0));
await drive("station 2", () => h.unplugStation(bb, 1));
await drive("station 3", () => h.unplugStation(bb, 2));
await bb.waitFor((s) => s.heartDefeated, 4000, "powered down");

// KOBI power-down: lid drooping shut, smoke, the tantrum blip on the bar
await sleep(1400);
await shoot("l43-powerdown", 48 * T, 10.5 * T, 1.15);

// the Bolt rescue: cage popped, Bolt mid-bound toward the buddies
await bb.waitFor((s) => s.heart.boltFree, 14000, "Bolt out");
await sleep(900);
{
  const bx = await page.evaluate(() => window.__BB.scene.heart.bolt ? window.__BB.scene.heart.bolt.x : 48 * 48);
  await shoot("l43-bolt-rescue", bx, 12 * T, 1.2);
}
await bb.waitFor((s) => s.heartResolved, 20000, "Bolt home");
await shoot("l43-resolved", 34 * T, 11.5 * T, 1.05);

// --- through the exit: the finale clear overlay ("BOLT RESCUED!") ------------
await page.evaluate(() => { const g = window.__BB.scene; g._camFrozen = false; delete g.updateCamera; });
await bb.walkTo("B", 75.4, { tol: 9, timeout: 16000 });
await bb.walkTo("F", 74.8, { tol: 9, timeout: 16000 });
await bb.waitFor((s) => s.complete, 6000, "level complete");
await page.waitForFunction(() => {
  const ui = window.__BB.game.scene.getScene("UI");
  return !!(ui && ui.completed);
}, null, { timeout: 6000 });
await sleep(1900); // panel pop + core reveal + saved tag
await page.screenshot({ path: `${SHOTS}/l43-clear.png` });
console.log(`shot -> ${SHOTS}/l43-clear.png`);

// --- the epilogue playground + the credits roll -------------------------------
await bb.tap("Space");
await page.waitForFunction(() => window.__BB.game.scene.isActive("Epilogue"), null, { timeout: 6000 });
await sleep(1600); // fade-in + first caption
await page.screenshot({ path: `${SHOTS}/l43-epilogue.png` });
console.log(`shot -> ${SHOTS}/l43-epilogue.png`);
for (let i = 0; i < 4; i++) { await bb.tap("Enter"); await sleep(420); }
await page.waitForFunction(() => window.__BB.epilogue.phase === "credits", null, { timeout: 5000 });
await sleep(5200); // mid-scroll
await page.screenshot({ path: `${SHOTS}/l43-credits.png` });
console.log(`shot -> ${SHOTS}/l43-credits.png`);
// exit cleanly to the Title so nothing lingers
await bb.tap("Enter");
await sleep(400);
await bb.tap("Enter");
await sleep(900);

// --- fps on 4-3 (same sampling as snap_w4_l41/l42): 2 passes of 5s -----------
const sampleFps = async () => {
  await page.evaluate(() => {
    const m = window.__BB.game.scene;
    ["UI", "Title", "Hub", "Game", "Epilogue"].forEach((k) => m.stop(k));
    m.start("Game", { levelIndex: 11 });
  });
  await sleep(2500);
  return page.evaluate(async () => {
    const gme = window.__BB.game; const s = []; const t0 = performance.now();
    return await new Promise((res) => {
      const iv = setInterval(() => {
        s.push(gme.loop.actualFps);
        if (performance.now() - t0 > 5000) {
          clearInterval(iv); const v = s.filter((x) => x > 0);
          res({ min: +Math.min(...v).toFixed(1), avg: +(v.reduce((a, b) => a + b) / v.length).toFixed(1) });
        }
      }, 250);
    });
  });
};
const fps = [await sampleFps(), await sampleFps()];
console.log('fps on 4-3 (dev build, Canvas tier):', JSON.stringify(fps));

await browser.close();
console.log(errors ? `snapped with ${errors} page error(s)` : "snapped clean (0 page errors)");
process.exit(errors ? 1 : 0);
