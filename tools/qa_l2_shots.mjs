// GFX6 L2 QA shots -> tools/shots/gfx6/. Per world one WebGL frame on a lamp SPILL
// (with any flickering pool in view), a W2 Canvas control (spill baked-colour, no
// tint), and a 2-frame flicker diff (two shots ~2s apart of the SAME flickering
// pool, with its scene-object alpha read at each). Asserts zero page errors.
//   node tools/qa_l2_shots.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = "tools/shots/gfx6";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// world -> level index with both spill + flicker visible
const PICKS = [ { w: 1, idx: 1 }, { w: 2, idx: 5 }, { w: 3, idx: 7 }, { w: 4, idx: 10 } ];
const browser = await chromium.launch({ executablePath: CHROMIUM });
let errors = 0;

async function loadLevel(page, idx) {
  await page.evaluate((i) => {
    localStorage.clear();
    const m = window.__BB.game.scene;
    ["UI", "Title", "Hub", "Game", "Epilogue"].forEach((k) => m.stop(k));
    m.start("Game", { levelIndex: i });
  }, idx);
  await sleep(1800);
}
// freeze camera on a chosen world-point, zoom in
async function frameOn(page, kind) {
  return page.evaluate((k) => {
    const g = window.__BB.scene;
    if (!g._camFrozen) { g._camFrozen = true; g.updateCamera = () => {}; }
    const world = g.def.world;
    let tx, ty;
    if (k === "spill") {
      const s = g.children.list.find((o) => o.texture && o.texture.key === `spill${world}` && o.visible);
      tx = s ? s.x : g.worldW * 0.5; ty = s ? s.y : g.worldH * 0.5;
    } else {
      const p = (g._flickCandidates || []).find((o) => o._flickering && o.visible && o.alpha > 0)
             || (g._flickCandidates || []).find((o) => o._flickering);
      tx = p ? p.x : g.worldW * 0.5; ty = p ? p.y : g.worldH * 0.5;
    }
    const cam = g.cameras.main;
    cam.setZoom(1.4);
    cam.centerOn(tx, ty - 40);
    const spills = g.children.list.filter((o) => o.texture && o.texture.key === `spill${world}`).length;
    return { spills, flick: g._flickCount, framed: [Math.round(tx), Math.round(ty)] };
  }, kind);
}

// --- WebGL per-world lamp-spill frames ---
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => { console.log("PAGE ERROR (webgl):", e.message); errors++; });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await sleep(1000);
for (const { w, idx } of PICKS) {
  await loadLevel(page, idx);
  const info = await frameOn(page, "spill");
  await sleep(400);
  const name = `${SHOTS}/l2-w${w}.png`;
  await page.screenshot({ path: name });
  console.log(`${name}  spills=${info.spills} flicker=${info.flick} framedOn=${info.framed}`);
}
await ctx.close();

// --- Canvas control (W2, 2-3) ---
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  p.on("pageerror", (e) => { console.log("PAGE ERROR (canvas):", e.message); errors++; });
  await p.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
  await sleep(1000);
  await loadLevel(p, 5);
  const info = await frameOn(p, "spill");
  await sleep(400);
  await p.screenshot({ path: `${SHOTS}/l2-w2-canvas.png` });
  console.log(`${SHOTS}/l2-w2-canvas.png  spills=${info.spills} (Canvas: baked colour, no setTint)`);
  await c.close();
}

// --- Flicker 2-frame diff (4-2, most flickering pools) ---
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  p.on("pageerror", (e) => { console.log("PAGE ERROR (flicker):", e.message); errors++; });
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await sleep(1000);
  await loadLevel(p, 10);
  const info = await frameOn(p, "flicker");
  // tag the framed flickering pool so we read the SAME object twice
  const readA = await p.evaluate(() => {
    const g = window.__BB.scene;
    const p = (g._flickCandidates || []).find((o) => o._flickering && o.visible && o.alpha > 0)
           || (g._flickCandidates || []).find((o) => o._flickering);
    g.__flickWatch = p;
    return p ? +p.alpha.toFixed(4) : null;
  });
  await sleep(300);
  await p.screenshot({ path: `${SHOTS}/l2-flicker-a.png` });
  await sleep(2000);
  const readB = await p.evaluate(() => {
    const g = window.__BB.scene; const p = g.__flickWatch;
    return p ? +p.alpha.toFixed(4) : null;
  });
  await p.screenshot({ path: `${SHOTS}/l2-flicker-b.png` });
  console.log(`${SHOTS}/l2-flicker-{a,b}.png  flickeringPools=${info.flick}  alpha A=${readA} B=${readB}  |dA|=${readA!=null&&readB!=null?Math.abs(readA-readB).toFixed(4):"n/a"}`);
  await c.close();
}

await browser.close();
console.log(errors ? `DONE with ${errors} page error(s)` : "DONE clean (0 page errors)");
process.exit(errors ? 1 : 0);
