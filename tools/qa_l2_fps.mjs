// GFX6 L2 QA: Canvas-tier fps A/B on 2-2 (levelIndex 4, the heaviest W2 level) to
// decide whether the lamp SPILL washes stay BOTH tiers or gate behind isWebGL.
// A = spill OFF (?canvas=1&nospill=1), B = spill ON (?canvas=1). The `?nospill=1`
// lever suppresses ONLY the spill (AO/ledge/flicker unchanged), so the delta is the
// spill alone. Two 5s samples each (the qa_g4_fps sampling pattern). Read-only.
//
//   node tools/qa_l2_fps.mjs
import { chromium } from "playwright";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const LEVEL = process.env.BB_LEVEL ? +process.env.BB_LEVEL : 4; // default 2-2 (idx4); 5 = 2-3

const browser = await chromium.launch({ executablePath: CHROMIUM });
let errors = 0;

const sampleFps = async (query) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
  await page.goto(`${BASE}/${query}`, { waitUntil: "networkidle" });
  await new Promise((r) => setTimeout(r, 1500));
  const run = async () => {
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
            res({ min: +Math.min(...v).toFixed(1), mean: +(v.reduce((a, b) => a + b) / v.length).toFixed(1) });
          }
        }, 250);
      });
    });
  };
  const s1 = await run();
  const spills = await page.evaluate(() => {
    const g = window.__BB.scene;
    const world = g.def.world;
    return g.children.list.filter((o) => o.texture && o.texture.key === `spill${world}`).length;
  });
  const r = [s1, await run()];
  await ctx.close();
  return { samples: r, spills };
};

const A = await sampleFps("?canvas=1&nospill=1"); // spill OFF
const B = await sampleFps("?canvas=1");           // spill ON
const meanOf = (o) => +((o.samples[0].mean + o.samples[1].mean) / 2).toFixed(2);
const aMean = meanOf(A), bMean = meanOf(B);
console.log("A (spill OFF):", JSON.stringify(A.samples), "spills=", A.spills);
console.log("B (spill ON) :", JSON.stringify(B.samples), "spills=", B.spills);
console.log(`A mean=${aMean}  B mean=${bMean}  delta(B-A)=${(bMean - aMean).toFixed(2)}fps  (<=2fps => BOTH tiers)`);
await browser.close();
process.exit(errors ? 1 : 0);
