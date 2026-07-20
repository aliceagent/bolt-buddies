// GFX4 F4 verification shots -> tools/shots/gfx4/
//   - f4-hub-panels-{canvas,webgl}.png : world preview strips (lit) + locked (dim)
//   - f4-iris-mid.png                  : a mid-wipe capture (timer during hub->level)
//   - f4-crisp-{before,after}.png      : the top-center pill at res=1 vs res=2 (crop)
//   node tools/qa_f4_shots.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const OUT = "tools/shots/gfx4";
mkdirSync(OUT, { recursive: true });
const SAVE_KEY = "bolt-buddies-save-v1";
const UX_KEY = "bolt-buddies-ux-v1";

const seed = (page) => page.evaluate(({ SAVE_KEY, UX_KEY }) => {
  // unlocked=4 -> worlds 1&2 online (lit preview), worlds 3&4 sealed (dim preview)
  localStorage.setItem(SAVE_KEY, JSON.stringify({ unlocked: 4, cores: { "1-1": [true, true, false], "1-2": [true, false, false] } }));
  // a couple of best-time records so the hub records-row chips render (crispened)
  localStorage.setItem(UX_KEY, JSON.stringify({ records: { "1-1": { bestTime: 41200, bestDeaths: 0 }, "1-2": { bestTime: 63400, bestDeaths: 1 }, "2-1": { bestTime: 52100, bestDeaths: 0 } } }));
}, { SAVE_KEY, UX_KEY });

let errors = 0;
async function run(tier, q) {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log(`[${tier}] PAGE ERROR:`, e.message); errors++; });
  await page.goto(`${BASE}/${q}`, { waitUntil: "networkidle" });
  await new Promise((r) => setTimeout(r, 800));
  await seed(page);
  // Hub panels shot
  await page.evaluate(() => { const m = window.__BB.game.scene; ["UI", "Title", "Game", "Epilogue"].forEach((k) => m.stop(k)); m.start("Hub", {}); });
  await new Promise((r) => setTimeout(r, 1200)); // let the arrival iris finish
  await page.screenshot({ path: `${OUT}/f4-hub-panels-${tier}.png` });

  if (tier === "canvas") {
    // Crisp before/after crops FIRST (clean level, no pending transition): the
    // top-center pill at res=1 vs res=2.
    await page.evaluate(() => { const m = window.__BB.game.scene; ["UI", "Title", "Hub", "Epilogue"].forEach((k) => m.stop(k)); m.start("Game", { levelIndex: 0 }); });
    await new Promise((r) => setTimeout(r, 2400));
    const clip = { x: 470, y: 2, width: 340, height: 46 };
    await page.evaluate(() => { const ui = window.__BB.game.scene.getScene("UI"); if (ui && ui.plateText) ui.plateText.setResolution(1); });
    await new Promise((r) => setTimeout(r, 350));
    await page.screenshot({ path: `${OUT}/f4-crisp-before.png`, clip });
    await page.evaluate(() => { const ui = window.__BB.game.scene.getScene("UI"); if (ui && ui.plateText) ui.plateText.setResolution(2); });
    await new Promise((r) => setTimeout(r, 350));
    await page.screenshot({ path: `${OUT}/f4-crisp-after.png`, clip });

    // Mid-wipe capture LAST: back to the Hub, let the arrival iris finish, then
    // press enter to run the hub->level iris close and screenshot ~120ms in.
    await page.evaluate(() => { const m = window.__BB.game.scene; ["UI", "Title", "Game", "Epilogue"].forEach((k) => m.stop(k)); m.start("Hub", {}); });
    await new Promise((r) => setTimeout(r, 1200));
    await page.evaluate(() => window.__BB.game.scene.getScene("Hub").enter());
    await new Promise((r) => setTimeout(r, 120));
    await page.screenshot({ path: `${OUT}/f4-iris-mid.png` });
  }
  await browser.close();
}

await run("canvas", "?canvas=1");
await run("webgl", "");
console.log(errors ? `DONE with ${errors} page errors` : "DONE — zero page errors");
process.exit(errors ? 1 : 0);
