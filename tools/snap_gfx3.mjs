// GFX3 G3 — WebGL vs Canvas side-by-side + the 4-3 dark-hall player glow.
//
// One settled in-level shot per world (levelIndex 1/4/7/10 == W1/W2/W3/W4) on
// the plain URL (WebGL tier) and on ?canvas=1 (the reference tier), plus one 4-3
// WebGL shot with both buddies parked inside a dark zone so the additive
// personal glow is visible. Saved to tools/shots/gfx3/. Reads renderer.type on
// each tier and fails on ANY page error.
//
//   node tools/snap_gfx3.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = process.env.BB_SHOTS || "tools/shots/gfx3";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: CHROMIUM });
let errors = 0;

// [levelIndex, worldNumber]
const WORLDS = [[1, 1], [4, 2], [7, 3], [10, 4]];

const startLevel = (page, idx) => page.evaluate((i) => {
  localStorage.clear();
  const m = window.__BB.game.scene;
  ["UI", "Game", "Title", "Hub", "Epilogue"].forEach((k) => m.stop(k));
  m.start("Game", { levelIndex: i });
}, idx);

const rendererType = (page) => page.evaluate(() => window.__BB.game.renderer.type);

async function tierPass(tierName, query) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log(`PAGE ERROR [${tierName}]:`, e.message); errors++; });
  await page.goto(`${BASE}/${query}`, { waitUntil: "networkidle" });
  await sleep(1500);
  console.log(`${tierName}: renderer.type = ${await rendererType(page)} (2 == WEBGL)`);
  for (const [idx, wn] of WORLDS) {
    await startLevel(page, idx);
    await sleep(2600); // intro banner clears + backdrop/devices settle
    const path = `${SHOTS}/g3-w${wn}-${tierName}.png`;
    await page.screenshot({ path });
    console.log(`shot -> ${path}`);
  }
  await ctx.close();
}

await tierPass("webgl", "");
await tierPass("canvas", "?canvas=1");

// --- 4-3 dark-hall player glow (WebGL only) ----------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log("PAGE ERROR [darkglow]:", e.message); errors++; });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await sleep(1500);
  await startLevel(page, 11); // 4-3 "KOBI's Heart" — the dark hall
  await sleep(2800);
  // Park both buddies inside the first dark zone, freeze the camera on them, and
  // let the glow ramp (0.15/frame ease toward ~0.5). Read-only staging teleport.
  const framed = await page.evaluate(() => {
    const g = window.__BB.scene;
    if (!g.darkZones || !g.darkZones.length) return null;
    const r = g.darkZones[0].rect;
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    g.players.forEach((p, i) => { p.body.reset(cx - 30 + i * 60, cy); p.dead = false; });
    if (!g._camFrozen) { g._camFrozen = true; g.updateCamera = () => {}; }
    g.cameras.main.setZoom(1.4);
    g.cameras.main.centerOn(cx, cy);
    return { cx, cy };
  });
  console.log("dark zone framed at:", JSON.stringify(framed));
  await sleep(1200); // let the additive glow ease up to full with the darkness factor
  const path = `${SHOTS}/g3-w4-l43-darkglow-webgl.png`;
  await page.screenshot({ path });
  console.log(`shot -> ${path}`);
  const alphas = await page.evaluate(() => (window.__BB.scene._darkGlows || []).map((g) => +g.alpha.toFixed(2)));
  console.log("buddy dark-glow alphas:", JSON.stringify(alphas));
  await ctx.close();
}

await browser.close();
console.log(errors ? `snapped with ${errors} page error(s)` : "snapped clean (0 page errors)");
process.exit(errors ? 1 : 0);
