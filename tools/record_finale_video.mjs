// Finale walkthrough recorder: drives the real 4-3 boss fight, then lets the
// power-down cinematic + storybook epilogue + reward auto-play at natural pace
// while Playwright records video. Output: tools/shots/video/finale-walkthrough.webm
// (video is silent — Playwright doesn't capture audio.)
import { chromium } from "playwright";
import { mkdirSync, renameSync, readdirSync } from "fs";
import { Driver } from "./beat/driver.mjs";
import route43 from "./beat/routes/4-3.mjs";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const VIDDIR = "tools/shots/video";
mkdirSync(VIDDIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: VIDDIR, size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
await sleep(1500);
await page.keyboard.press("Space"); // wake audio ctx (not recorded, but drives state)
await page.evaluate(() => {
  localStorage.clear();
  const m = window.__BB.game.scene;
  ["UI", "Game", "Title", "Hub", "Epilogue", "Reward"].forEach((k) => m.stop(k));
  m.start("Game", { levelIndex: 11 });
});
await sleep(3200); // intro card + KOBI start blip

const bb = new Driver(page);
bb.setRoles({ F: 0, B: 1 });
bb.deathBudget = 10;

// --- drive the boss fight via the proven route steps (all but the epilogue walk)
const drive = async (label, fn) => {
  for (let att = 0; att < 3; att++) {
    try { bb.stepDeaths = 0; await fn(); return; }
    catch (e) { console.log(`retry ${label}: ${e.message}`); }
  }
  console.log(`WARN ${label} did not land after 3 attempts — continuing`);
};
for (let i = 0; i < route43.length - 1; i++) {
  await drive(`route step ${i} (${route43[i].name})`, () => route43[i].fn(bb));
  console.log(`  ✓ step ${i}: ${route43[i].name}`);
}

// --- at the clear overlay: enter the epilogue, then LET IT AUTO-PLAY -----------
await page.waitForFunction(() => {
  const ui = window.__BB.game.scene.getScene("UI");
  return ui && ui.completed;
}, null, { timeout: 10000 }).catch(() => {});
await sleep(2600); // hold on the "BOLT RESCUED!" overlay
await bb.tap("Space"); // continue -> Epilogue
await page.waitForFunction(() => window.__BB.game.scene.isActive("Epilogue"), null, { timeout: 8000 });
console.log("  ✓ epilogue entered — auto-playing storybook");
// auto-advances story -> credits -> sting -> end (no taps: natural readable pace)
await page.waitForFunction(() => window.__BB.epilogue && window.__BB.epilogue.phase === "credits", null, { timeout: 120000 }).catch(() => {});
console.log("  ✓ credits rolling");
await page.waitForFunction(() => window.__BB.epilogue && window.__BB.epilogue.phase === "end", null, { timeout: 60000 }).catch(() => {});
console.log("  ✓ epilogue end card");
await sleep(2200);
await bb.tap("Enter"); // end -> Reward
await page.waitForFunction(() => window.__BB.game.scene.isActive("Reward"), null, { timeout: 10000 }).catch(() => {});
console.log("  ✓ reward — medal / album / share card auto-playing");
// reward auto-advances medal -> album -> share -> Title
await page.waitForFunction(() => window.__BB.game.scene.isActive("Title"), null, { timeout: 90000 }).catch(() => {});
console.log("  ✓ back at Title — walkthrough complete");
await sleep(2500);

const vid = page.video();
await ctx.close(); // finalizes the .webm
await browser.close();
try {
  const p = await vid.path();
  const dest = `${VIDDIR}/finale-walkthrough.webm`;
  renameSync(p, dest);
  console.log(`\nVIDEO -> ${dest}`);
} catch (e) {
  console.log("video files:", readdirSync(VIDDIR).join(", "));
}
