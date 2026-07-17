// Reward scene screenshotter (V8 coverage gap — the medal/album/share suite had
// only the finale-video recorder; this is a fast, pure-screenshot tool).
//
// Boots with a SEEDED save (unlocked:13 so the finale reads as cleared, plus a
// MIXED completion: every core of worlds 1+2, none of 3/4 -> photos on wings 1-2,
// the "you missed N" sticky on 3-4, a non-gold BOLT MEDAL). Scene-starts "Reward"
// so computeData() reads the seed, then walks the three acts on the __BB.reward
// probe (act/page): act 1 the medal, act 2 mid-album (a wing spread), act 3 the
// share card. Canvas tier (?canvas=1), same executablePath as the other snaps.
//
//   node tools/snap_reward.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = process.env.BB_SHOTS || "tools/shots/gfx2";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
await page.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
await sleep(1200);

// --- seed a mixed-completion save, then boot straight into the Reward scene ----
await page.evaluate(() => {
  localStorage.clear();
  const cores = {};
  // worlds 1 + 2: every core (all 3 levels x 3 cores) -> bonus Bolt photo earned
  for (const w of [1, 2]) for (const lvl of [1, 2, 3]) cores[`${w}-${lvl}`] = [true, true, true];
  // worlds 3 + 4: left empty -> the "you missed 9. I counted." sticky notes
  // unlocked:13 (> 12 real levels) makes campaignComplete() read true, like the
  // finish handler's completeLevel(11, ...) would have written.
  localStorage.setItem("bolt-buddies-save-v1", JSON.stringify({ unlocked: 13, cores }));
  const m = window.__BB.game.scene;
  ["UI", "Game", "Title", "Hub", "Epilogue", "Reward"].forEach((k) => m.stop(k));
  m.start("Reward");
});
await page.waitForFunction(() => window.__BB.game.scene.isActive("Reward"), null, { timeout: 8000 });
await page.waitForFunction(() => window.__BB.reward && window.__BB.reward.act === "medal", null, { timeout: 8000 });

// --- ACT 1: the medal ceremony (fade-in + medal back.out pop + confetti) -------
await sleep(1900);
await page.screenshot({ path: `${SHOTS}/v8-medal.png` });
console.log(`shot -> ${SHOTS}/v8-medal.png`);

// --- ACT 2: mid-album — tap Enter into the book, land on a wing spread ----------
const tap = async (n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press("Enter"); await sleep(320); } };
await tap(1); // medal -> album (page 0, the title card)
await page.waitForFunction(() => window.__BB.reward.act === "album", null, { timeout: 5000 });
await tap(2); // -> wing 1 -> wing 2 (a collected spread: color polaroid + gold star stickers)
await page.waitForFunction(() => window.__BB.reward.act === "album" && window.__BB.reward.page >= 2, null, { timeout: 5000 }).catch(() => {});
await sleep(500);
await page.screenshot({ path: `${SHOTS}/v8-album.png` });
console.log(`shot -> ${SHOTS}/v8-album.png (act=${await page.evaluate(() => window.__BB.reward.page)})`);

// --- ACT 3: the share card ------------------------------------------------------
for (let i = 0; i < 12 && !(await page.evaluate(() => window.__BB.reward.act === "share")); i++) await tap(1);
await page.waitForFunction(() => window.__BB.reward.act === "share", null, { timeout: 6000 });
await sleep(1400); // the card settles into its bob
await page.screenshot({ path: `${SHOTS}/v8-share.png` });
console.log(`shot -> ${SHOTS}/v8-share.png`);

await browser.close();
console.log(errors ? `snapped with ${errors} page error(s)` : "snapped clean (0 page errors)");
process.exit(errors ? 1 : 0);
