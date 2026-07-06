// U3 kid-proof destructive inputs: staging screenshots + a scripted proof that
// a SINGLE R does not restart while a DOUBLE R (within the 2.5s window) does.
// Real code paths only — we press the actual ESC/R keys and read scene state.
import { chromium } from "playwright";

const TILE = 48;
const URL = "http://localhost:5173/?canvas=1";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

const sleep = (ms) => page.waitForTimeout(ms);
async function startLevel(idx) {
  await page.goto(URL, { waitUntil: "networkidle" });
  await sleep(1400);
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Game"); m.stop("Hub"); m.stop("Title");
    m.start("Game", { levelIndex: i });
  }, idx);
  await sleep(1500);
}
const confirmState = () => page.evaluate(() => {
  const s = window.__BB.scene;
  return { kind: s.confirm && s.confirm.kind, visible: s.confirmUI.c.visible };
});

// move both robots off the spawn pedestals so the pedestal skill-cards don't
// clutter the acceptance frame (staging only — the confirm itself is real).
const clearPedestals = () => page.evaluate((T) => {
  const s = window.__BB.scene;
  s.players[0].body.reset(16 * T + 24, 13 * T + 10);
  s.players[1].body.reset(18 * T + 24, 13 * T + 10);
  s.players.forEach((p) => p.setVelocity(0, 0));
}, TILE);

// (1) RESTART CONFIRM — 1-1 (idx 0). One R press -> toast + shrinking bar.
await startLevel(0);
await sleep(2200); // let the intro banner slide out for a clean frame
await clearPedestals();
await sleep(500);
await page.keyboard.press("KeyR");
await sleep(280); // bar mid-drain
await page.screenshot({ path: "tools/shots/p2/u3-restart-confirm.png" });
console.log("restart-confirm:", JSON.stringify(await confirmState()));

// (2) MAP CONFIRM — 1-1. One ESC press -> "press ESC again for the map".
await startLevel(0);
await sleep(2200);
await clearPedestals();
await sleep(500);
await page.keyboard.press("Escape");
await sleep(280);
await page.screenshot({ path: "tools/shots/p2/u3-esc-confirm.png" });
console.log("esc-confirm:", JSON.stringify(await confirmState()));

// (3) PROOF: single R does NOT restart, double does. scene.restart() reuses the
// Scene INSTANCE (a marker on the scene survives), but create() rebuilds
// this.players from scratch — so a stamp on the player OBJECT is the reliable
// restart signal (a mere respawn body.reset keeps the same player object).
await startLevel(0);
await sleep(600);
await page.evaluate((T) => {
  const p = window.__BB.scene.players[0];
  p.__u3 = 42; // stamp the live player object
  p.body.reset(9 * T + 24, 13 * T + 10);
  p.setVelocity(0, 0);
}, TILE);
await sleep(120);

// --- single press, then let the window expire ---
await page.keyboard.press("KeyR");
await sleep(2800); // > 2.5s window -> confirm expires, no restart
const afterSingle = await page.evaluate(() => ({
  stamp: window.__BB.scene.players[0].__u3,
  confirm: !!window.__BB.scene.confirm,
}));
const singleHeld = afterSingle.stamp === 42 && !afterSingle.confirm;
console.log("SINGLE R -> no restart:", singleHeld, JSON.stringify(afterSingle));

// --- double press within the window -> restart (fade ~250ms + rebuild) ---
await page.evaluate(() => { window.__BB.scene.players[0].__u3 = 42; }); // re-stamp (fresh window)
await page.keyboard.press("KeyR");
await sleep(150);
await page.keyboard.press("KeyR");
await sleep(1400); // fade out + scene.restart + rebuild
const afterDouble = await page.evaluate(() => ({ stamp: window.__BB.scene.players[0].__u3 }));
const doubleRestarted = afterDouble.stamp === undefined; // fresh player object after restart
console.log("DOUBLE R -> restart:", doubleRestarted, JSON.stringify(afterDouble));

// (4) TUTORIAL EXEMPT: single R restarts immediately (no confirm toast).
await startLevel(12);
await sleep(1600);
await page.evaluate(() => { window.__BB.scene.players[0].__u3 = 7; });
const tutConfirmBefore = await page.evaluate(() => !!window.__BB.scene.confirm);
await page.keyboard.press("KeyR");
await sleep(60);
const tutConfirmAfter = await page.evaluate(() => !!window.__BB.scene.confirm);
await sleep(1200);
const tut = await page.evaluate(() => ({ stamp: window.__BB.scene.players[0].__u3 }));
const tutOk = tut.stamp === undefined && !tutConfirmBefore && !tutConfirmAfter;
console.log("TUTORIAL single R -> restart, no confirm:", tutOk, JSON.stringify(tut));

await browser.close();
const ok = singleHeld && doubleRestarted && tutOk;
console.log(ok ? "u3 snapped + PROOF PASS" : "u3 PROOF FAIL");
process.exit(ok ? 0 : 1);
