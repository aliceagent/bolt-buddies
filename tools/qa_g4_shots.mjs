// GFX3 G4 QA: per-world WebGL + Canvas screenshots showing the new foreground
// occlusion silhouettes (both tiers) and the WebGL-only in-playfield weather.
// Frames the camera on a real ceiling prop so it is guaranteed in-shot. Also
// asserts zero page errors and that the tutorial + 4-3 arena carry NO foreground
// props. Shots -> tools/shots/gfx3/.
//
//   node tools/qa_g4_shots.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = "tools/shots/gfx3";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// world -> level index (registry order): W1 1-1=0, W2 2-2=4, W3 3-1=6, W4 4-2=10
const PICKS = [
  { w: 1, idx: 0 },
  { w: 2, idx: 4 },
  { w: 3, idx: 6 },
  { w: 4, idx: 10 },
];

const browser = await chromium.launch({ executablePath: CHROMIUM });
let errors = 0;

async function shotWorld(tier, query) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log(`PAGE ERROR (${tier}):`, e.message); errors++; });
  await page.goto(`${BASE}/${query}`, { waitUntil: "networkidle" });
  await sleep(1200);
  for (const { w, idx } of PICKS) {
    await page.evaluate((i) => {
      localStorage.clear();
      const m = window.__BB.game.scene;
      ["UI", "Title", "Hub", "Game", "Epilogue"].forEach((k) => m.stop(k));
      m.start("Game", { levelIndex: i });
    }, idx);
    await sleep(1800);
    // frame on a real ceiling foreground prop (scrollFactorX > 1 distinguishes a
    // ceiling prop from a screen-fixed corner post); bias the view upward so the
    // top-band silhouette is visible above the action.
    const info = await page.evaluate(() => {
      const g = window.__BB.scene;
      if (!g._camFrozen) { g._camFrozen = true; g.updateCamera = () => {}; }
      const props = g.foregroundProps || [];
      const ceil = props.find((p) => p.scrollFactorX > 1) || props[0];
      const cam = g.cameras.main;
      const zoom = 0.8;
      const fx = ceil ? ceil.x : g.worldW * 0.4;
      cam.setZoom(zoom);
      cam.centerOn(fx, g.worldH * 0.34);
      return { propCount: props.length, framedX: fx };
    });
    await sleep(500);
    const name = `${SHOTS}/g4-w${w}-${tier}.png`;
    await page.screenshot({ path: name });
    console.log(`shot -> ${name}  (props=${info.propCount}, framedX=${Math.round(info.framedX)})`);
  }
  await ctx.close();
}

await shotWorld("webgl", "");
await shotWorld("canvas", "?canvas=1");

// prop-free assertions: tutorial (idx 12) + 4-3 finale (idx 11)
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log("PAGE ERROR (assert):", e.message); errors++; });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await sleep(1000);
  for (const [label, i] of [["tutorial", 12], ["4-3 arena", 11]]) {
    const n = await page.evaluate((idx) => {
      const m = window.__BB.game.scene;
      ["UI", "Title", "Hub", "Game", "Epilogue"].forEach((k) => m.stop(k));
      m.start("Game", { levelIndex: idx });
      return new Promise((res) => setTimeout(() => {
        const g = window.__BB.scene;
        res((g.foregroundProps || []).length);
      }, 1600));
    }, i);
    console.log(`${label}: foreground props = ${n} ${n === 0 ? "(OK, prop-free)" : "(FAIL)"}`);
    if (n !== 0) errors++;
  }
  await ctx.close();
}

await browser.close();
console.log(errors ? `DONE with ${errors} error(s)` : "DONE clean (0 page errors, prop-free asserts OK)");
process.exit(errors ? 1 : 0);
