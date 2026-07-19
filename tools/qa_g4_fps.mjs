// GFX3 G4 QA: Canvas-tier fps A/B on 2-2 (levelIndex 4, the heaviest W2 level).
// Two 5s samples (same sampling pattern as snap_w4_l43.mjs). Used to decide
// whether the always-on foreground occlusion strips stay on BOTH tiers or get
// gated behind isWebGL for Canvas fps. Read-only probe; no mechanics driven.
//
//   node tools/qa_g4_fps.mjs
import { chromium } from "playwright";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const LEVEL = 4; // 2-2

const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
await page.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
await new Promise((r) => setTimeout(r, 1500));

const sampleFps = async () => {
  await page.evaluate((lvl) => {
    localStorage.clear();
    const m = window.__BB.game.scene;
    ["UI", "Title", "Hub", "Game", "Epilogue"].forEach((k) => m.stop(k));
    m.start("Game", { levelIndex: lvl });
  }, LEVEL);
  await new Promise((r) => setTimeout(r, 2500));
  return page.evaluate(async () => {
    const gme = window.__BB.game; const s = []; const t0 = performance.now();
    return await new Promise((res) => {
      const iv = setInterval(() => {
        s.push(gme.loop.actualFps);
        if (performance.now() - t0 > 5000) {
          clearInterval(iv); const v = s.filter((x) => x > 0);
          res({ min: +Math.min(...v).toFixed(1), avg: +(v.reduce((a, b) => a + b) / v.length).toFixed(1), n: v.length });
        }
      }, 250);
    });
  });
};

const fps = [await sampleFps(), await sampleFps()];
console.log("fps on 2-2 (Canvas tier):", JSON.stringify(fps));
await browser.close();
process.exit(errors ? 1 : 0);
