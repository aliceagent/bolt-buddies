// W3W4 L32 — level 3-2 "The Flooded Tank" screenshot + fps tool.
//
// Canvas tier. Shoots the intro card, the teaching pool, the great tank's
// asymmetric relay (bubbled swimmer below / magnet walker on the deck), the
// baffle-1 switch moment, the underwater jelly socket, the winch reel (a REAL
// key-driven DOWN+ACTION mid-pull), the exit ledge, and a full-level wide
// "minimap" shot to tools/shots/w3/ (l32-*.png), then samples fps on 3-2
// twice (same method as snap_w3_l31). page.evaluate is used ONLY for reads,
// station-setup teleports/skill grants and camera framing — every MECHANIC in
// a shot (the bubble, the reel) is performed with real key presses.
//
//   node tools/snap_w3_l32.mjs
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
  m.start("Game", { levelIndex: 7 });
});
// intro card: catch the banner while it holds (slides in ~240ms, holds 1.6s)
await sleep(900);
await page.screenshot({ path: `${SHOTS}/l32-intro.png` });
console.log(`shot -> ${SHOTS}/l32-intro.png`);
await sleep(2500); // banner gone, KOBI start blip typing

// station-setup: skills on (P1 = magnet deck-walker, P2 = bubble swimmer) +
// the HUD skill events so the panels read the equipped gadgets in the shots
await page.evaluate(() => {
  const g = window.__BB.scene;
  g.players[0].setSkill("magnet");
  g.players[1].setSkill("bubble");
  g.game.events.emit("bb:skill", { idx: 0, skill: "magnet", name: "MAGNET GLOVE" });
  g.game.events.emit("bb:skill", { idx: 1, skill: "bubble", name: "BUBBLE SHIELD" });
});
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
// real-key self-bubble for P2 (the swimmer's dive suit) — input, not evaluate
const bubbleP2 = async () => {
  await page.keyboard.down("KeyL");
  await sleep(90);
  await page.keyboard.up("KeyL");
  await sleep(200);
};

const T = 48;
// station 1: the teaching pool — both robots wading, air ring visible
await port(0, 13, 14); await port(1, 14, 15);
await sleep(2200); // let the submerged air ring start drawing
await shoot("l32-pool", 14 * T, 13 * T, 1.5);
// station 2: the great tank relay — bubbled swimmer below, walker on the deck
await port(0, 33, 6); await port(1, 30, 11);
await bubbleP2();
await shoot("l32-tank", 31 * T, 9 * T, 1.05);
// station 3: baffle 1 + magswitch ms1 + the section-B current beyond
await port(0, 37, 6); await port(1, 38, 11);
await bubbleP2();
await shoot("l32-baffle", 40 * T, 9.5 * T, 1.05);
// station 4: the underwater jelly socket (section C). M parks WEST of the
// chomper's 190px aggro (drive-found: parked at 64 it got bitten and the
// respawn wrecked the winch staging).
await port(0, 56, 6); await port(1, 59, 12);
await bubbleP2();
await shoot("l32-socket", 62 * T, 11.5 * T, 1.2);
// station 5: THE WINCH REEL — real DOWN+ACTION chord, shot mid-pull
await port(0, 74.5, 10); await port(1, 70, 15);
await sleep(900); // settle grounded on the ledge
const mAlive = await page.evaluate(() => !window.__BB.scene.players[0].dead);
if (!mAlive) { await sleep(1600); await port(0, 74.5, 10); await sleep(900); }
await frameAt(72 * T, 12.5 * T, 1.15);
await page.keyboard.down("KeyS");
await sleep(160);
await page.keyboard.down("KeyE");
await sleep(80);
await page.keyboard.up("KeyE");
await sleep(100); // mid-pull: rope + reeled swimmer in flight
await page.screenshot({ path: `${SHOTS}/l32-reel.png` });
console.log(`shot -> ${SHOTS}/l32-reel.png`);
await page.keyboard.up("KeyS");
await sleep(1200);
// station 6: the exit ledge
await port(0, 76, 11); await port(1, 77, 11);
await shoot("l32-exit", 77 * T, 10 * T, 1.35);
// full-level wide (minimap-ish)
await shoot("l32-wide", 41 * T, 10 * T, 0.31);

// fps on 3-2 (same sampling as snap_w3_l31): 2 passes of 5s
await page.evaluate(() => { const g = window.__BB.scene; g._camFrozen = false; delete g.updateCamera; });
const sampleFps = async () => {
  await page.evaluate(() => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Title"); m.stop("Hub"); m.stop("Game");
    m.start("Game", { levelIndex: 7 });
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
console.log('fps on 3-2 (dev build, Canvas tier):', JSON.stringify(fps));

await browser.close();
console.log(errors ? `snapped with ${errors} page error(s)` : "snapped clean (0 page errors)");
process.exit(errors ? 1 : 0);
