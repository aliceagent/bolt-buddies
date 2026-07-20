// GFX4 F4c: isolate the Canvas fps cost of setResolution(2) on the top-center
// level pill. Interleaved A/B on ONE warmed 2-2 page (levelIndex 4) so thermal /
// scheduler drift cancels: alternate res=2 (kept) and res=1 (reverted) samples,
// average each. Decision gate: keep setResolution(2) if the cost is <2fps.
//   node tools/qa_f4_setres.mjs
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

await page.evaluate(() => {
  const m = window.__BB.game.scene;
  localStorage.clear();
  ["UI", "Title", "Hub", "Game", "Epilogue"].forEach((k) => m.stop(k));
  m.start("Game", { levelIndex: 4 });
});
await new Promise((r) => setTimeout(r, 2800));

const setRes = (res) => page.evaluate((res) => {
  const ui = window.__BB.game.scene.getScene("UI");
  if (ui && ui.plateText) ui.plateText.setResolution(res);
}, res);

const sample = (ms) => page.evaluate((ms) => {
  const gme = window.__BB.game; const s = []; const t0 = performance.now();
  return new Promise((res) => {
    const iv = setInterval(() => {
      s.push(gme.loop.actualFps);
      if (performance.now() - t0 > ms) {
        clearInterval(iv); const v = s.filter((x) => x > 0);
        res(+(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2));
      }
    }, 200);
  });
}, ms);

const res2 = [], res1 = [];
for (let i = 0; i < 4; i++) {
  await setRes(2); res2.push(await sample(2500));
  await setRes(1); res1.push(await sample(2500));
}
const avg = (a) => +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
const a2 = avg(res2), a1 = avg(res1);
console.log("res=2 (setResolution kept):", res2, "-> avg", a2);
console.log("res=1 (reverted):          ", res1, "-> avg", a1);
console.log(`cost of setResolution(2) = ${(a1 - a2).toFixed(2)} fps  (gate: keep if <2fps)`);
await browser.close();
process.exit(errors ? 1 : 0);
