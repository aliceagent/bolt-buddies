// SPACE-key smoke test: Space must start the game from the title, enter a level
// from the hub, and fire P1's action (equip at a pedestal) in-game. E must still
// work as the silent fallback.
import { chromium } from "playwright";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  ok ? passed++ : failed++;
};

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(URL, { waitUntil: "networkidle" });
await sleep(2500);

const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);
const tap = async (code, ms = 90) => { await page.keyboard.down(code); await sleep(ms); await page.keyboard.up(code); };

// 1. Space starts from title
check("title active", await active("Title"));
await tap("Space");
await sleep(800);
check("Space advances title -> hub", await active("Hub"));

// 2. Space enters the selected level from the hub
await tap("Space");
await sleep(2000);
check("Space enters level from hub", await active("Game"));

// 3. Space fires P1 action: walk P1 to the grapple pedestal (tile 5) and equip
await page.evaluate(() => { localStorage.clear(); });
const walkP1To = async (tileX, timeout = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const x = await page.evaluate(() => window.__BB.scene.players[0].x);
    const dx = tileX * 48 + 24 - x;
    if (Math.abs(dx) <= 14) { await page.keyboard.up("KeyA"); await page.keyboard.up("KeyD"); return true; }
    await page.keyboard.up(dx > 0 ? "KeyA" : "KeyD");
    await page.keyboard.down(dx > 0 ? "KeyD" : "KeyA");
    await sleep(33);
  }
  await page.keyboard.up("KeyA"); await page.keyboard.up("KeyD");
  return false;
};
await walkP1To(5);
await tap("Space");
await sleep(500);
let skill = await page.evaluate(() => window.__BB.scene.players[0].skill);
check("Space equips at pedestal (P1 action)", skill === "grapple", `skill=${skill}`);

// 4. E fallback still fires P1 action: restart scene, equip with E
await page.evaluate(() => {
  const m = window.__BB.game.scene;
  ["UI", "Game"].forEach((k) => m.stop(k));
  m.start("Game", { levelIndex: 0 });
});
await sleep(1600);
await walkP1To(5);
await tap("KeyE");
await sleep(500);
skill = await page.evaluate(() => window.__BB.scene.players[0].skill);
check("E fallback equips at pedestal", skill === "grapple", `skill=${skill}`);

// 5. P1 action hint reads SPACE
await page.evaluate(() => {
  const m = window.__BB.game.scene;
  ["UI", "Game"].forEach((k) => m.stop(k));
  m.start("Game", { levelIndex: 0 });
});
await sleep(1600);
const hint = await page.evaluate(() => {
  const c = window.__BB.scene.actionHints?.[0];
  const t = c?.list?.find((o) => o.text !== undefined);
  return t?.text || null;
});
check("P1 floating hint says SPACE = ACTION", hint === "SPACE = ACTION", `hint=${hint}`);

await browser.close();
console.log(`\n${passed}/${passed + failed} smoke checks passed`);
process.exit(failed ? 1 : 0);
