// GFX4 F4b: MEASURE the maskless iris-wipe cost on the Canvas (?canvas=1) tier.
// The decision gate (per GFX4_PLAN F4): a wipe must hold >=40fps AVERAGE while it
// runs (~300-400ms). We sample gme.loop.actualFps under a SUSTAINED iris redraw
// (the exact drawIris per-frame thick-stroke work) so the smoothed fps settles to
// the wipe's true sustained cost, on the two scenes the widened iris would touch:
//   - Hub  (title->hub landing, level->hub landing)
//   - 2-2  (hub->level; the heaviest shipped W2 level = worst case)
// Read-only probe: it drives no mechanics, only draws an overlay graphic.
//
//   node tools/qa_f4_iris.mjs
import { chromium } from "playwright";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";

const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
await page.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
await new Promise((r) => setTimeout(r, 1500));

// Collect actualFps samples for `ms`, optionally while a sustained iris redraw runs.
const sample = (ms, withIris) => page.evaluate(({ ms, withIris }) => {
  const gme = window.__BB.game;
  // pick the top-most visible scene that has an add factory
  const scenes = gme.scene.getScenes(true);
  const scene = scenes[scenes.length - 1];
  const W = gme.scale.width, H = gme.scale.height;
  let g = null;
  const D = 1700; // matches ui/kit.js drawIris
  const drawIris = (cx, cy, r) => { g.clear(); g.lineStyle(D, 0x040614, 1); g.strokeCircle(cx, cy, Math.max(0, r) + D / 2); };
  if (withIris) { g = scene.add.graphics().setDepth(99999).setScrollFactor(0); }
  const rMax = Math.hypot(W, H) / 2 + 24;
  const s = [];
  const t0 = performance.now();
  return new Promise((res) => {
    let raf;
    const tick = () => {
      const t = performance.now() - t0;
      if (withIris) {
        // oscillate r across the full range every ~600ms so the per-frame thick
        // stroke work runs continuously (the sustained wipe cost).
        const phase = (t % 600) / 600;           // 0..1
        const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2; // 0..1..0
        drawIris(W / 2, H / 2, tri * rMax);
      }
      s.push(gme.loop.actualFps);
      if (t > ms) {
        if (g) g.destroy();
        const v = s.filter((x) => x > 0);
        res({ min: +Math.min(...v).toFixed(1), avg: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1), n: v.length });
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}, { ms, withIris });

const gotoScene = (key, data) => page.evaluate(({ key, data }) => {
  const m = window.__BB.game.scene;
  ["UI", "Title", "Hub", "Game", "Epilogue", "Onboard"].forEach((k) => m.stop(k));
  m.start(key, data);
}, { key, data });

const results = {};

// --- Hub -----------------------------------------------------------------------
await gotoScene("Hub", {});
await new Promise((r) => setTimeout(r, 2000));
results.hub_baseline = await sample(1800, false);
results.hub_iris = await sample(2500, true);

// --- 2-2 (levelIndex 4, heaviest W2 level) -------------------------------------
await gotoScene("Game", { levelIndex: 4 });
await new Promise((r) => setTimeout(r, 2500));
results.lvl22_baseline = await sample(1800, false);
results.lvl22_iris = await sample(2500, true);

console.log(JSON.stringify(results, null, 2));
console.log("\nGATE: iris avg must be >=40fps to widen to Canvas.");
console.log(`  hub:  baseline ${results.hub_baseline.avg}  iris ${results.hub_iris.avg} (min ${results.hub_iris.min})`);
console.log(`  2-2:  baseline ${results.lvl22_baseline.avg}  iris ${results.lvl22_iris.avg} (min ${results.lvl22_iris.min})`);
await browser.close();
process.exit(errors ? 1 : 0);
