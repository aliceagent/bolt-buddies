// U2 lock & timer feedback staging screenshots. Teleporting + key-pinning is
// STAGING-only (the real detection paths are exercised: we set the actual push
// key and let the >400ms timer fire). Each scenario reloads for a fresh session.
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

// (1) BUMP LEVER — 2-3 (idx 5), tDoorB (needs lvA1, never opened) closed. Phase
// pushes right into it on the tunnel floor → lever icon + arrow toward lvA1.
await startLevel(5);
await page.evaluate(() => {
  const s = window.__BB.scene;
  s.players[0].setSkill("phase"); s.players[1].setSkill("tiny");
  const d = s.doors.find((x) => x.id === "tDoorB");
  const p = s.players[0];
  p.body.setAllowGravity(false); // STAGING pin: hold the pusher flush to the door
  p.body.reset(d.zone.centerX - 26, d.zone.y + d.zone.height - 24);
  p.setVelocity(0, 0);
  p.keys.right.isDown = true; // sustained push
}, TILE);
await sleep(900);
await page.screenshot({ path: "tools/shots/p2/u2-bump-lever.png" });
console.log("bump-lever: active =", await page.evaluate(() => window.__BB.scene.coach.bubbles.some((b) => b.active && b.key === "bump")));

// (2) BUMP KEY — 1-1 (idx 0), door1 (needs keys:1) closed, no key held → key
// icon + "FIND THE KEY".
await startLevel(0);
await page.evaluate((T) => {
  const s = window.__BB.scene;
  s.players[0].setSkill("grapple"); s.players[1].setSkill("heavy");
  const d = s.doors.find((x) => x.id === "door1");
  const p = s.players[0];
  // door1 sits over a gap with bugs to its left; approach from the solid
  // lift-approach floor on the RIGHT and push LEFT into it instead.
  p.body.reset(d.zone.centerX + 26, 13 * T + 10);
  p.setVelocity(0, 0);
  p.keys.left.isDown = true;
}, TILE);
await sleep(900);
await page.screenshot({ path: "tools/shots/p2/u2-bump-key.png" });
console.log("bump-key: active =", await page.evaluate(() => window.__BB.scene.coach.bubbles.some((b) => b.active && b.key === "bump")));

// (3) BUMP PLATE — tutorial (idx 12), td1 (needs plates:[tpl]) closed, plate
// empty → plate icon + weight pips (0 of 2) + "NEEDS WEIGHT".
await startLevel(12);
await sleep(2200); // let the intro banner slide out for a clean frame
await page.evaluate(() => {
  const s = window.__BB.scene;
  s.actionHints.forEach((h) => h && h.destroy()); s.actionHints = [null, null];
  const d = s.doors.find((x) => x.id === "td1");
  const p = s.players[0], q = s.players[1];
  p.body.setAllowGravity(false);
  p.body.reset(d.zone.centerX - 22, d.zone.y + d.zone.height - 24); // right of the plate's edge
  p.setVelocity(0, 0);
  p.keys.right.isDown = true;
  q.body.reset(d.zone.centerX + 70, d.zone.y + d.zone.height - 24); // partner nearby → tight camera
  q.setVelocity(0, 0);
}, TILE);
await sleep(900);
await page.screenshot({ path: "tools/shots/p2/u2-bump-plate.png" });
console.log("bump-plate: active =", await page.evaluate(() => window.__BB.scene.coach.bubbles.some((b) => b.active && b.key === "bump")));

// (4) TIMED RING — 2-3 (idx 5), tDoorA opened by lvB1: draining ring around the
// door lamp AND the driving lever, mid-drain. Both players staged on the slab
// top so the camera frames the door (above) and the tunnel lever (below).
await startLevel(5);
await sleep(2200); // let the intro banner slide out
await page.evaluate((T) => {
  const s = window.__BB.scene;
  s.actionHints.forEach((h) => h && h.destroy()); s.actionHints = [null, null];
  s.players[0].setSkill("tiny"); s.players[1].setSkill("phase");
  s.players[0].body.reset(25 * T + 24, 8 * T + 24);
  s.players[1].body.reset(26 * T + 24, 8 * T + 24);
  const lv = s.levers.find((l) => l.id === "lvB1");
  lv.on = true; // drives tDoorA open
}, TILE);
await sleep(400); // let the door open + set its closeAt
await page.evaluate(() => {
  const s = window.__BB.scene;
  const d = s.doors.find((x) => x.id === "tDoorA");
  d.closeAt = s.time.now + 3300; // pin to ~50% drain for the shot
});
await sleep(150);
await page.screenshot({ path: "tools/shots/p2/u2-timed-ring.png" });
console.log("timed-ring: open =", await page.evaluate(() => window.__BB.scene.doors.find((x) => x.id === "tDoorA").open),
  "ring visible =", await page.evaluate(() => window.__BB.scene.doors.find((x) => x.id === "tDoorA")._ring.visible));

// (5) PLATE FLASH — tutorial (idx 12), a single (weight-1) robot on tpl (needs
// 2) → the pips flash "1 of 2". Captured just after the flash begins.
await startLevel(12);
await sleep(2200); // let the intro banner slide out
await page.evaluate((T) => {
  const s = window.__BB.scene;
  s.actionHints.forEach((h) => h && h.destroy()); s.actionHints = [null, null];
  const pl = s.plates.find((x) => x.id === "tpl");
  const p = s.players[0]; // grapple = weight 1
  p.body.reset(pl.rect.centerX, 13 * T + 10);
  p.setVelocity(0, 0);
  const q = s.players[1];
  q.body.reset(pl.rect.centerX + 90, 13 * T + 10); // partner nearby → tight camera, off the plate
  q.setVelocity(0, 0);
}, TILE);
await sleep(600); // robot lands, weight>0<threshold → flashPlatePips fires
await page.evaluate(() => {
  const s = window.__BB.scene;
  const pl = s.plates.find((x) => x.id === "tpl");
  s.flashPlatePips(pl, pl._weight || 1, s.time.now); // re-arm the flash for a clean captured beat
});
await sleep(40); // capture near the flash's peak brightness
await page.screenshot({ path: "tools/shots/p2/u2-plate-flash.png" });
console.log("plate-flash: pips visible =", await page.evaluate(() => window.__BB.scene.plates.find((x) => x.id === "tpl").pipCont.visible));

await browser.close();
console.log("u2 snapped");
