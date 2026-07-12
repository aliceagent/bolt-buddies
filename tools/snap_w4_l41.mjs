// W3W4 L41 — level 4-1 "Lights Out" screenshot + fps tool.
//
// Canvas tier. Shoots the intro card, each teach station (the beam-REVEAL over
// the ghost run, the gloomy on its switch, the rotating bridge spinning AND
// frozen flat), the lonely corridor, the ticker doorstep + exit, and a wide
// "minimap" shot to tools/shots/w4/ (l41-*.png), then samples fps on 4-1 twice
// (same method as snap_w3_l31 — the dark-zone overlay is the cost center).
// The beam/freeze in the shots are DRIVEN (real keys via the beat Driver);
// page.evaluate is used only for reads, station-setup teleports and camera
// framing — never to perform a mechanic.
//
//   node tools/snap_w4_l41.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { Driver } from "./beat/driver.mjs";

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
  ["UI", "Game", "Title", "Hub"].forEach((k) => m.stop(k));
  m.start("Game", { levelIndex: 9 });
});
// intro card: catch the banner while it holds (slides in ~240ms, holds 1.6s)
await sleep(900);
await page.screenshot({ path: `${SHOTS}/l41-intro.png` });
console.log(`shot -> ${SHOTS}/l41-intro.png`);
await sleep(2500); // banner gone, KOBI start blip typing

const bb = new Driver(page);
bb.setRoles({ F: 0, B: 1 });
const port = (i, tx, ty) => page.evaluate(([i, tx, ty]) => {
  const g = window.__BB.scene;
  const p = g.players[i];
  p.clearStates();
  p.body.reset(tx * 48 + 24, ty * 48 + 24);
  p.setVelocity(0, 0);
  p.invuln = Math.max(p.invuln, 600);
}, [i, tx, ty]);
const frameAt = (x, y, z = 1.6) => page.evaluate(([x, y, z]) => {
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

const T = 48;
// equip both skills with REAL input (badges/cards in every later shot)
await bb.equip("F", 3);
await bb.equip("B", 6);
await shoot("l41-pedestals", 6 * T, 11.5 * T, 1.35);

// station 1: the unlit crossing — dark, then the DRIVEN beam reveal
await port(0, 13, 13); await port(1, 14, 13);
await sleep(400);
await shoot("l41-dark-unlit", 18 * T, 11 * T, 1.25);
const kB = bb.keysFor("B");
await bb.face("B", "right");
await bb.down(kB.act); // hold: the cone cuts the dark, the ghost treads materialize
await sleep(700);
await shoot("l41-beam-reveal", 18 * T, 11 * T, 1.25);
await bb.up(kB.act);

// station 2: the gloomy jamming its switch, then DRIVEN herd + freed plate
await port(0, 30, 13); await port(1, 32, 13);
await sleep(600); // guard settles on its post
await shoot("l41-gloomy-switch", 36 * T, 11.5 * T, 1.35);
await bb.face("B", "right");
await bb.down(kB.act);
await sleep(900); // dazzled: the blob flees the cone
await shoot("l41-gloomy-herded", 37 * T, 11.5 * T, 1.35);
await bb.up(kB.act);

// station 3: the rotating bridge — spinning, then DRIVEN freeze holds it flat
await port(0, 44, 13); await port(1, 43, 13);
await sleep(400);
await shoot("l41-bridge-spinning", 47.5 * T, 12 * T, 1.35);
const kF = bb.keysFor("F");
// wait (read-only) for a near-flat pose, then cast with a real key
await page.waitForFunction(() => {
  const g = window.__BB.scene;
  if (!g.rotBridges.length || g.players[0].freezeCd > 0) return false;
  const a = ((g.rotBridges[0].angle * 180 / Math.PI) % 180 + 180) % 180;
  return a < 12 || a > 168;
}, null, { timeout: 20000 }).catch(() => {});
await bb.tap(kF.act);
await sleep(350);
await shoot("l41-bridge-frozen", 47.5 * T, 12 * T, 1.35);
await page.waitForFunction(() => !window.__BB.scene.frozen, null, { timeout: 8000 }).catch(() => {});

// station 4: the lonely corridor (roaming gloomy overhead) + ticker doorstep
await port(0, 56, 13); await port(1, 58, 13);
await sleep(400);
await shoot("l41-corridor", 59 * T, 11 * T, 1.25);
await port(0, 62, 13); await port(1, 63, 13);
await shoot("l41-exit", 70 * T, 11.5 * T, 1.1);
// full-level wide (minimap-ish)
await shoot("l41-wide", 38 * T, 9 * T, 0.36);

// fps on 4-1 (same sampling as snap_w3_l31): 2 passes of 5s
await page.evaluate(() => { const g = window.__BB.scene; g._camFrozen = false; delete g.updateCamera; });
const sampleFps = async () => {
  await page.evaluate(() => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Title"); m.stop("Hub"); m.stop("Game");
    m.start("Game", { levelIndex: 9 });
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
console.log('fps on 4-1 (dev build, Canvas tier):', JSON.stringify(fps));

await browser.close();
console.log(errors ? `snapped with ${errors} page error(s)` : "snapped clean (0 page errors)");
process.exit(errors ? 1 : 0);
