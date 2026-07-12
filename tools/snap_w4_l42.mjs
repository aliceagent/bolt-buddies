// W3W4 L42 — level 4-2 "The Laser Garden" screenshot + fps tool.
//
// Canvas tier. Shoots the intro card, the pedestals, bed 1's sweeper LIVE
// mid-sweep and then the SAME field FROZEN in its safe pose (driven cast), the
// beam MELTING an ice door (progress fill visible), the dark twin blooms, the
// compound bed's Ticker FROZEN mid-patrol under its parked sweep, the exit and
// a wide "minimap" shot to tools/shots/w4/ (l42-*.png), then samples fps on 4-2
// twice (same method as snap_w4_l41 — the lasers + the dark overlay are the
// cost centers). The freeze/beam in the shots are DRIVEN (real keys via the
// beat Driver); page.evaluate is used only for reads, station-setup teleports
// and camera framing — never to perform a mechanic.
//
//   node tools/snap_w4_l42.mjs
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
  m.start("Game", { levelIndex: 10 });
});
// intro card: catch the banner while it holds (slides in ~240ms, holds 1.6s)
await sleep(900);
await page.screenshot({ path: `${SHOTS}/l42-intro.png` });
console.log(`shot -> ${SHOTS}/l42-intro.png`);
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
await shoot("l42-pedestals", 6 * T, 11.5 * T, 1.35);

// station 1: bed 1's sweeper LIVE mid-sweep (the constant-visible telegraph),
// robots parked on the safe stance west of its reach
await port(0, 11, 13); await port(1, 12, 13);
await page.waitForFunction(() => {
  const g = window.__BB.scene;
  if (!g.lasers.length) return false;
  const a = (g.lasers[0].angle * 180) / Math.PI;
  return a > 70 && a < 110; // mid-sweep: the beam rakes the walk line
}, null, { timeout: 15000 }).catch(() => {});
await shoot("l42-sweep-live", 18 * T, 10.5 * T, 1.25);

// the SAME field FROZEN in a SAFE pose: wait (read-only) for the parked-low
// window, then cast with a real key — the beam repaints ice-blue, hung high
const kF = bb.keysFor("F");
await page.waitForFunction(() => {
  const g = window.__BB.scene;
  if (!g.lasers.length || g.players[0].freezeCd > 0 || g.frozen) return false;
  const a = (g.lasers[0].angle * 180) / Math.PI;
  return a <= 52 && g.lasers[0].dir === -1;
}, null, { timeout: 25000 }).catch(() => {});
await bb.tap(kF.act);
await sleep(350);
await shoot("l42-sweep-frozen", 18 * T, 10.5 * T, 1.25);
await page.waitForFunction(() => !window.__BB.scene.frozen, null, { timeout: 8000 }).catch(() => {});

// station 2: the beam MELTING ice door 1 (progress fill + drips, DRIVEN hold)
await port(0, 29.5, 13); await port(1, 30.6, 13);
await sleep(300);
const kB = bb.keysFor("B");
await bb.face("B", "right");
await bb.down(kB.act);
await sleep(1100); // mid-melt: the fill bar reads ~50%
await shoot("l42-ice-melting", 31.5 * T, 11.5 * T, 1.45);
await bb.up(kB.act);

// station 3: the dark twin blooms (bed 2) — the robots' glow + the mirrored
// sweeps under the darkness mask
await port(0, 34.5, 13); await port(1, 35.5, 13);
await sleep(400);
await shoot("l42-dark-twins", 44 * T, 10 * T, 1.05);

// station 4: the compound bed — wait for the guard's DASH, then a driven
// freeze: Ticker statued mid-patrol under its parked sweep, key behind it
await port(0, 67, 13); await port(1, 68, 13);
await sleep(300);
await page.waitForFunction(() => {
  const g = window.__BB.scene;
  const t = g.tickers[2];
  if (!t || g.frozen || g.players[0].freezeCd > 0) return false;
  const a = (g.lasers[3].angle * 180) / Math.PI;
  return t.state === "dash" && a <= 60 && g.lasers[3].dir === -1;
}, null, { timeout: 30000 }).catch(() => {});
await bb.tap(kF.act);
await sleep(350);
await shoot("l42-ticker-frozen", 73 * T, 11 * T, 1.3);
await page.waitForFunction(() => !window.__BB.scene.frozen, null, { timeout: 8000 }).catch(() => {});

// exit yard (gate 3 + cp4 + exit)
await port(0, 83, 13); await port(1, 84, 13);
await sleep(400);
await shoot("l42-exit", 83 * T, 11.5 * T, 1.1);
// full-level wide (minimap-ish)
await shoot("l42-wide", 44 * T, 9 * T, 0.33);

// fps on 4-2 (same sampling as snap_w4_l41): 2 passes of 5s
await page.evaluate(() => { const g = window.__BB.scene; g._camFrozen = false; delete g.updateCamera; });
const sampleFps = async () => {
  await page.evaluate(() => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Title"); m.stop("Hub"); m.stop("Game");
    m.start("Game", { levelIndex: 10 });
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
console.log('fps on 4-2 (dev build, Canvas tier):', JSON.stringify(fps));

await browser.close();
console.log(errors ? `snapped with ${errors} page error(s)` : "snapped clean (0 page errors)");
process.exit(errors ? 1 : 0);
