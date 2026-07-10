// W3W4 L31 — level 3-1 "Attract Mode" screenshot + fps tool.
//
// Canvas tier. Shoots the intro card, each teach station, the jelly-socket
// exit gate, the exit, and a full-level wide "minimap" shot to tools/shots/w3/
// (l31-*.png), then samples fps on 3-1 twice (same method as snap_w3_m3's A/B).
// page.evaluate is used ONLY for reads, station-setup teleports and camera
// framing — never to perform a mechanic.
//
//   node tools/snap_w3_l31.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = process.env.BB_SHOTS || "tools/shots/w3";
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
  m.start("Game", { levelIndex: 6 });
});
// intro card: catch the banner while it holds (slides in ~240ms, holds 1.6s)
await sleep(900);
await page.screenshot({ path: `${SHOTS}/l31-intro.png` });
console.log(`shot -> ${SHOTS}/l31-intro.png`);
await sleep(2500); // banner gone, KOBI start blip typing

const port = (i, tx, ty) => page.evaluate(([i, tx, ty]) => {
  const g = window.__BB.scene;
  const p = g.players[i];
  if (p.magCrate) g.releaseMagCrate(p, true);
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
// station 1: crate yard + chomper + updraft + plate wall
await port(0, 13, 13); await port(1, 11, 13);
await shoot("l31-crates", 16 * T, 11.5 * T, 1.35);
// station 2: electric run under the steel rail
await port(0, 25, 13); await port(1, 24, 13);
await shoot("l31-rail", 30 * T, 11.5 * T, 1.35);
// station 3: far switch — magswitch + vent updraft + coil deck lever + g2
await port(0, 36, 13); await port(1, 38, 13);
await shoot("l31-updraft", 40 * T, 10 * T, 1.25);
// station 4: jelly yard + the socket gate that powers the exit
await port(0, 46, 13); await port(1, 48, 13);
await shoot("l31-socket", 52 * T, 11.5 * T, 1.35);
// exit + doorstep chomper
await port(0, 56, 13); await port(1, 57, 13);
await shoot("l31-exit", 59 * T, 11.5 * T, 1.35);
// full-level wide (minimap-ish)
await shoot("l31-wide", 32 * T, 9 * T, 0.42);

// fps on 3-1 (same sampling as snap_w3_m3): 2 passes of 5s
await page.evaluate(() => { const g = window.__BB.scene; g._camFrozen = false; delete g.updateCamera; });
const sampleFps = async () => {
  await page.evaluate(() => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Title"); m.stop("Hub"); m.stop("Game");
    m.start("Game", { levelIndex: 6 });
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
console.log('fps on 3-1 (dev build, Canvas tier):', JSON.stringify(fps));

await browser.close();
console.log(errors ? `snapped with ${errors} page error(s)` : "snapped clean (0 page errors)");
process.exit(errors ? 1 : 0);
