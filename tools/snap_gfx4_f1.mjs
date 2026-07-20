// GFX4 F1 — display-font (Fredoka) verification sweep.
//
// Captures every switched scene on BOTH tiers (plain == WebGL, ?canvas=1 ==
// reference): Title, Hub, Settings, Pause (start a level + press P), one intro
// banner mid-hold, two clear overlays (CHAMBER CLEAR! + the widest tutorial
// title ORIENTATION COMPLETE!), the Mute dropdown open, and the Walkthroughs
// grid. Also a font-BLOCK boot test: route-block the woff2 and confirm the game
// still boots to Title (mono fallback) with no page errors. Fails on ANY error.
//
//   node tools/snap_gfx4_f1.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const SHOTS = process.env.BB_SHOTS || "tools/shots/gfx4";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const browser = await chromium.launch({ executablePath: CHROMIUM });
let errors = 0;

const rendererType = (page) => page.evaluate(() => window.__BB.game.renderer.type);
const stopAll = (page) => page.evaluate(() => {
  const m = window.__BB.game.scene;
  ["UI", "Game", "Title", "Hub", "Settings", "Pause", "Epilogue", "Reward", "Walkthroughs"].forEach((k) => m.stop(k));
});
const startLevel = (page, idx) => page.evaluate((i) => {
  const m = window.__BB.game.scene;
  ["UI", "Game", "Title", "Hub", "Epilogue"].forEach((k) => m.stop(k));
  m.start("Game", { levelIndex: i });
}, idx);

async function tierPass(tierName, query) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log(`PAGE ERROR [${tierName}]:`, e.message); errors++; });
  await page.goto(`${BASE}/${query}`, { waitUntil: "networkidle" });
  await sleep(1600);
  console.log(`${tierName}: renderer.type = ${await rendererType(page)} (2 == WEBGL)`);

  // Title (default boot)
  await page.evaluate(() => { localStorage.clear(); const m = window.__BB.game.scene; ["UI","Game","Hub","Settings"].forEach((k)=>m.stop(k)); if(!m.isActive("Title")) m.start("Title"); });
  await sleep(1400);
  await page.screenshot({ path: `${SHOTS}/f1-title-${tierName}.png` });
  console.log(`shot -> f1-title-${tierName}.png`);

  // Hub (cleared save: W1 online, W2-4 sealed — exercises both panel states)
  await page.evaluate(() => { const m = window.__BB.game.scene; ["Title","UI","Game"].forEach((k)=>m.stop(k)); m.start("Hub"); });
  await sleep(1400);
  await page.screenshot({ path: `${SHOTS}/f1-hub-${tierName}.png` });
  console.log(`shot -> f1-hub-${tierName}.png`);

  // Settings
  await page.evaluate(() => { const m = window.__BB.game.scene; ["Hub","Title"].forEach((k)=>m.stop(k)); m.start("Settings", { returnTo: "Title" }); });
  await sleep(900);
  await page.screenshot({ path: `${SHOTS}/f1-settings-${tierName}.png` });
  console.log(`shot -> f1-settings-${tierName}.png`);

  // Walkthroughs grid
  await page.evaluate(() => { const m = window.__BB.game.scene; ["Settings","Title"].forEach((k)=>m.stop(k)); m.start("Walkthroughs"); });
  await sleep(1800);
  await page.screenshot({ path: `${SHOTS}/f1-walkthroughs-${tierName}.png` });
  console.log(`shot -> f1-walkthroughs-${tierName}.png`);

  // Intro banner mid-hold — start 1-1 and grab it while the banner is parked
  await startLevel(page, 0);
  await sleep(700);
  await page.screenshot({ path: `${SHOTS}/f1-intro-banner-${tierName}.png` });
  console.log(`shot -> f1-intro-banner-${tierName}.png`);

  // Pause — press P on the running level
  await sleep(1600); // let the banner clear
  await page.keyboard.press("p");
  await sleep(700);
  const paused = await page.evaluate(() => window.__BB.game.scene.isActive("Pause"));
  await page.screenshot({ path: `${SHOTS}/f1-pause-${tierName}.png` });
  console.log(`shot -> f1-pause-${tierName}.png (Pause active=${paused})`);

  // Clear overlay — emit bb:complete against the live UIScene (normal + tutorial
  // widest-title). Faithful path: same event finishLevel fires.
  await page.evaluate(() => {
    const m = window.__BB.game.scene;
    if (m.isActive("Pause")) m.stop("Pause");
    const g = window.__BB.game;
    g.events.emit("bb:complete", { index: 0, id: "1-1", name: "Bring the Bridge", cores: [true, false, true], newlyUnlocked: true, tutorial: false, stats: { timeStr: "1:23.4", deaths: 2, coresCount: 2, grade: "KOBI: acceptable. Barely." } });
  });
  await sleep(1200);
  await page.screenshot({ path: `${SHOTS}/f1-clear-chamber-${tierName}.png` });
  console.log(`shot -> f1-clear-chamber-${tierName}.png`);

  await page.evaluate(() => {
    const g = window.__BB.game;
    g.events.emit("bb:complete", { index: 0, id: "tut", name: "Orientation", cores: [], newlyUnlocked: false, tutorial: true, stats: { timeStr: "2:05.0", deaths: 0, grade: "KOBI: you may proceed." } });
  });
  await sleep(1000);
  await page.screenshot({ path: `${SHOTS}/f1-clear-tutorial-${tierName}.png` });
  console.log(`shot -> f1-clear-tutorial-${tierName}.png (widest title fit check)`);

  await ctx.close();
}

await tierPass("webgl", "");
await tierPass("canvas", "?canvas=1");

// --- Mute dropdown open (Title, WebGL) — verify AUDIO header + row labels -----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log("PAGE ERROR [mute]:", e.message); errors++; });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await sleep(1600);
  await page.evaluate(() => { const m = window.__BB.game.scene; const mute = m.getScene("Mute"); mute.setOpen(true); });
  await sleep(500);
  await page.screenshot({ path: `${SHOTS}/f1-mute-dropdown.png` });
  console.log("shot -> f1-mute-dropdown.png");
  await ctx.close();
}

// --- Font-BLOCK boot test: block the woff2, confirm the game still boots ------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  let blockErrors = 0;
  page.on("pageerror", (e) => { console.log("PAGE ERROR [fontblock]:", e.message); blockErrors++; });
  await page.route("**/fonts/fredoka-latin.woff2", (route) => route.abort());
  const t0 = Date.now();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  // wait for boot regardless of the (blocked, timing-out) font race
  await page.waitForFunction(() => window.__BB && window.__BB.game && window.__BB.game.scene.isActive("Title"), { timeout: 8000 });
  const bootMs = Date.now() - t0;
  await sleep(800);
  const onTitle = await page.evaluate(() => window.__BB.game.scene.isActive("Title"));
  await page.screenshot({ path: `${SHOTS}/f1-fontblock-title.png` });
  console.log(`FONT-BLOCK: booted to Title=${onTitle} in ~${bootMs}ms, pageErrors=${blockErrors} (mono fallback expected)`);
  if (!onTitle || blockErrors > 0) errors++;
  await ctx.close();
}

await browser.close();
console.log(errors === 0 ? "\nF1 SNAP OK — zero page errors" : `\nF1 SNAP had ${errors} error(s)`);
process.exit(errors === 0 ? 0 : 1);
