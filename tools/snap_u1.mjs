// U1 coach-bubble staging screenshots. Each scenario reloads the page (fresh
// session) so the once-per-session throw flag + per-level fired flags reset.
// Teleporting is STAGING-only; we wait well over the ~1s danger window after any
// reposition before screenshotting.
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

// (a) ROPE HINT — both buddies stand on the start floor ~96px apart (reelable),
// P1 has grapple, idle > 2s → bubble over the buddy.
await startLevel(0);
await page.evaluate(() => {
  const s = window.__BB.scene;
  s.players[0].setSkill("grapple");
  s.players[1].setSkill("heavy");
});
await sleep(3600); // pass the 2s idle gate + the 4Hz check
await page.screenshot({ path: "tools/shots/p2/u1-rope-hint.png" });
console.log("rope shot: bubble active =", await page.evaluate(() => window.__BB.scene.coach.bubbles[1].active || window.__BB.scene.coach.bubbles[0].active));

// (b) UP-ZIP HINT — P1 grapple stands on the core-1 ledge directly under
// anchor (9,6); buddy is teleported far away so the rope hint can't win.
await startLevel(0);
await page.evaluate((T) => {
  const s = window.__BB.scene;
  s.players[0].setSkill("grapple");
  s.players[1].setSkill("heavy");
  s.players[0].body.reset(9 * T + 24, 9 * T + 24);   // onto the (8..10,10) ledge, under anchor (9,6)
  s.players[1].body.reset(9 * T + 24 - 46, 9 * T + 24); // buddy within 72px = NOT reelable, keeps camera tight
}, TILE);
await sleep(3600);
await page.screenshot({ path: "tools/shots/p2/u1-upzip-hint.png" });
console.log("upzip shot: p0 bubble active =", await page.evaluate(() => window.__BB.scene.coach.bubbles[0].active), "key =", await page.evaluate(() => window.__BB.scene.coach.bubbles[0].key));

// (c) THROW HINT — first pickup of the session; bubble over the carrier.
await startLevel(0);
await page.evaluate((T) => {
  const s = window.__BB.scene;
  s.players[0].setSkill("grapple");
  s.players[1].setSkill("heavy");
  s.players[1].body.reset(s.players[0].x + 40, s.players[0].y); // adjacent buddy
}, TILE);
await sleep(1300); // > danger window before we act
await page.evaluate(() => {
  const s = window.__BB.scene;
  s.pickupPartner(s.players[0], s.players[1]); // first pickup -> throw hint
});
await sleep(500);
await page.screenshot({ path: "tools/shots/p2/u1-throw-hint.png" });
console.log("throw shot: p0 bubble key =", await page.evaluate(() => window.__BB.scene.coach.bubbles[0].key));

// (d) RE-SHOW — original action hint dismissed, then idle-adjacent to the buddy
// for > 20s without an action press → faint 30%-alpha hint returns.
await startLevel(0);
await page.evaluate((T) => {
  const s = window.__BB.scene;
  s.players[1].body.reset(s.players[0].x + 40, s.players[0].y); // buddy in pickup range = actionable
  if (s.actionHints[0]) { s.actionHints[0].destroy(); s.actionHints[0] = null; } // simulate first press
  s.players[0]._lastActPress = s.time.now - 21000; // 21s since last action
}, TILE);
await sleep(600); // let a 4Hz check fire the re-show
await page.screenshot({ path: "tools/shots/p2/u1-reshow.png" });
console.log("reshow shot: p0 reshow visible =", await page.evaluate(() => window.__BB.scene.coach.reshow[0].visible));

await browser.close();
console.log("u1 snapped");
