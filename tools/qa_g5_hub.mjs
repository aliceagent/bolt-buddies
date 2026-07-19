// GFX3 G5 QA (new file; tools/ originals untouched per R6). Hub route-line shots
// (route visible completed->current, then re-targeted after moving the cursor)
// plus a NORMAL-level (1-1) sanity: no letterbox bars, __BB probes intact.
//
//   node tools/qa_g5_hub.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = process.env.BB_SHOTS || "tools/shots/gfx3";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });

// --- HUB: seed a save with 4 chambers cleared so a route line has a start ----
await page.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
await sleep(1200);
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("bolt-buddies-save-v1", JSON.stringify({
    unlocked: 4, cores: { "1-1": [true, true, false], "1-2": [true, false, false], "1-3": [false, true, true] },
  }));
  const m = window.__BB.game.scene;
  ["UI", "Game", "Title", "Hub", "Epilogue"].forEach((k) => m.stop(k));
  m.start("Hub", { sel: 3 });
});
await sleep(1400);
await page.screenshot({ path: `${SHOTS}/g5-hub-route.png` });
console.log(`shot -> ${SHOTS}/g5-hub-route.png`);
const routeInfo1 = await page.evaluate(() => {
  const h = window.__BB.game.scene.getScene("Hub");
  return { sel: h.sel, visibleDots: h._routeDots.filter((d) => d.visible).length };
});
console.log("route @ sel", JSON.stringify(routeInfo1));

// move selection right once -> route re-targets
await page.evaluate(() => { const h = window.__BB.game.scene.getScene("Hub"); h.move(1); });
await sleep(900);
await page.screenshot({ path: `${SHOTS}/g5-hub-route2.png` });
console.log(`shot -> ${SHOTS}/g5-hub-route2.png`);
const routeInfo2 = await page.evaluate(() => {
  const h = window.__BB.game.scene.getScene("Hub");
  return { sel: h.sel, visibleDots: h._routeDots.filter((d) => d.visible).length };
});
console.log("route @ sel (after move)", JSON.stringify(routeInfo2));

// --- SANITY: a NORMAL level (1-1) has NO bars + intact __BB probes -----------
await page.evaluate(() => {
  const m = window.__BB.game.scene;
  ["UI", "Game", "Title", "Hub", "Epilogue"].forEach((k) => m.stop(k));
  m.start("Game", { levelIndex: 0 });
});
await sleep(3200);
const sanity = await page.evaluate(() => {
  const g = window.__BB.scene;
  return {
    hasBB: !!window.__BB && !!window.__BB.scene,
    letterboxOn: g.letterboxOn,
    barsVisible: !!(g._lbTop && g._lbTop.visible) || !!(g._lbBot && g._lbBot.visible),
    camCine: g.camCine,
    hasPlayers: Array.isArray(g.players) && g.players.length === 2,
  };
});
console.log("1-1 sanity:", JSON.stringify(sanity));
await page.screenshot({ path: `${SHOTS}/g5-normal-1-1.png` });
console.log(`shot -> ${SHOTS}/g5-normal-1-1.png`);

await browser.close();
const bad = errors || sanity.barsVisible || sanity.letterboxOn || !sanity.hasBB || !sanity.hasPlayers;
console.log(errors ? `done with ${errors} page error(s)` : "done clean (0 page errors)");
process.exit(bad ? 1 : 0);
