// GFX5 S4 landmark-placement review — WebGL tier. For every SHIPPED level
// (excl. tutorial + 4-3) it loads the level, reads the placed landmark x
// positions (scene._landmarkX) + count (scene.landmarks), frames the camera
// wide on the landmark cluster and shoots tools/shots/gfx5s4/s4-<id>.png. For
// the tutorial + 4-3 it CONFIRMS EMPTY (no landmarks placed) and shoots a
// wide reference too. Read-only: page.evaluate only reads/freezes the camera —
// no mechanic is driven.
//
//   node tools/snap_gfx5_s4.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = process.env.BB_SHOTS || "tools/shots/gfx5s4";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// registry index -> level id (0-11 chambers, 12 tutorial)
const LV = [
  [0, "1-1"], [1, "1-2"], [2, "1-3"], [3, "2-1"], [4, "2-2"], [5, "2-3"],
  [6, "3-1"], [7, "3-2"], [8, "3-3"], [9, "4-1"], [10, "4-2"],
  [11, "4-3"], [12, "tut"], // last two: confirm-empty
];

const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
await page.goto(BASE, { waitUntil: "networkidle" }); // no ?canvas -> WebGL tier
await sleep(1500);

const summary = [];
for (const [idx, id] of LV) {
  await page.evaluate((lvl) => {
    localStorage.clear();
    const m = window.__BB.game.scene;
    ["UI", "Title", "Hub", "Game", "Epilogue"].forEach((k) => m.stop(k));
    m.start("Game", { levelIndex: lvl });
  }, idx);
  await sleep(2600); // let build + intro settle

  const info = await page.evaluate(() => {
    const g = window.__BB.scene;
    if (!g._camFrozen) { g._camFrozen = true; g.updateCamera = () => {}; }
    const xs = g._landmarkX || [];
    return { xs, count: (g.landmarks || []).length, worldW: g.worldW, worldH: g.worldH, webgl: g.game.renderer.type === 2 };
  });
  // frame: centre on the landmark cluster (or level middle when empty) and zoom
  // to fit the spread so BOTH landmarks show; single/empty -> a wide 0.85.
  const cx = info.xs.length ? info.xs.reduce((a, b) => a + b, 0) / info.xs.length : info.worldW / 2;
  const spread = info.xs.length > 1 ? Math.max(...info.xs) - Math.min(...info.xs) : 0;
  const z = Math.max(0.4, Math.min(0.85, 1280 / (spread + 760)));
  await page.evaluate(([x, y, z]) => {
    const cam = window.__BB.scene.cameras.main;
    cam.setZoom(z); cam.centerOn(x, y);
  }, [cx, info.worldH * 0.56, z]);
  await sleep(300);
  await page.screenshot({ path: `${SHOTS}/s4-${id}.png` });
  summary.push(`${id}: landmarks=${info.count} x=[${info.xs.join(",")}] webgl=${info.webgl}`);
  console.log(`shot -> ${SHOTS}/s4-${id}.png  (${summary[summary.length - 1]})`);
}

console.log("\n=== S4 landmark summary ===");
summary.forEach((s) => console.log(s));
await browser.close();
console.log(errors ? `\ndone with ${errors} page error(s)` : "\ndone clean (0 page errors)");
process.exit(errors ? 1 : 0);
