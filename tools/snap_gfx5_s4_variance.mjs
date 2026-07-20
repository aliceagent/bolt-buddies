// GFX5 S4 prop-strip variance before/after — Canvas tier (isolates the MID
// silhouette prop strip: the far/near parallax bands are WebGL-only, so on
// ?canvas=1 the propStrip<w> texture is the ONLY silhouette layer, cleanest for
// showing the bake-time instance variance on the repeated ceiling hook rigs +
// conveyor tines). Frames the W1 (1-1) ceiling band. Output path via BB_OUT.
//   BB_OUT=tools/shots/gfx5s4/s4-variance-after.png node tools/snap_gfx5_s4_variance.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { dirname } from "path";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const OUT = process.env.BB_OUT || "tools/shots/gfx5s4/s4-variance-after.png";
mkdirSync(dirname(OUT), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
await page.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
await sleep(1400);
await page.evaluate(() => {
  localStorage.clear();
  const m = window.__BB.game.scene;
  ["UI", "Title", "Hub", "Game", "Epilogue"].forEach((k) => m.stop(k));
  m.start("Game", { levelIndex: 0 }); // 1-1 (W1 assembly-wing prop strip)
});
await sleep(2600);
// frame the ceiling hook band: prop strip scrollFactor 0.55, hook rigs ~railY 150.
await page.evaluate(() => {
  const g = window.__BB.scene;
  if (!g._camFrozen) { g._camFrozen = true; g.updateCamera = () => {}; }
  const cam = g.cameras.main;
  cam.setZoom(0.62); cam.centerOn(g.worldW * 0.42, g.worldH * 0.24);
});
await sleep(300);
await page.screenshot({ path: OUT });
console.log(`shot -> ${OUT}`);
await browser.close();
process.exit(errors ? 1 : 0);
