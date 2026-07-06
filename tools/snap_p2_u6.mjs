// U6 review shots + throw-arc accuracy check. Dev server on :5173, Canvas.
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
page.on("console", (m) => { const t = m.text(); if (/error/i.test(t)) console.log("CONSOLE:", t); });
await page.goto("http://localhost:5173/?canvas=1", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const load = async (idx) => {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Title"); m.stop("Hub"); m.stop("Game");
    m.start("Game", { levelIndex: i });
  }, idx);
  await page.waitForTimeout(1400);
};
const shot = (tag) => page.screenshot({ path: `tools/shots/p2/${tag}.png` });

// --- 1: normal throw arc (carrier heavy, carrying grapple, facing right) -----
// Hover the pair in open sky so the full dotted arc is visible (the throw flings
// the buddy far; on the ground it would plunge into terrain off-frame).
const poseCarry = async (jump) => {
  await page.evaluate((jump) => {
    const s = window.__BB.scene, a = s.players[0], b = s.players[1];
    a.setSkill("heavy"); b.setSkill("grapple");
    a.facing = 1; a.setFlipX(false);
    a.body.reset(360, 250); a.body.setVelocity(0, 0); a.body.allowGravity = false;
    a.carrying = b; b.carriedBy = a; b.body.enable = false;
    a.keys.jump.isDown = !!jump;
    s.cameras.main.stopFollow();
    s.cameras.main.centerOn(560, 300);
  }, jump);
  await page.waitForTimeout(2600); // let the intro card + start blip fade
};
await load(0);
await poseCarry(false);
await shot("u6-arc");

// --- 2: high-toss arc (carrier holds jump -> tossY variant) ------------------
await page.evaluate(() => {
  const s = window.__BB.scene; s.cameras.main.centerOn(430, 430);
  s.players[0].keys.jump.isDown = true;
});
await page.waitForTimeout(400);
await shot("u6-arc-hightoss");
await page.evaluate(() => { window.__BB.scene.players[0].keys.jump.isDown = false; });

// --- 3: rope tether (grapple grounded + idle, buddy reelable) ----------------
await load(0);
await page.evaluate(() => {
  const s = window.__BB.scene, a = s.players[0], b = s.players[1];
  a.setSkill("grapple"); b.setSkill("heavy");
  a.carrying = null; b.carriedBy = null; b.body.enable = true;
  b.body.reset(a.x + 150, a.y); // ~150px away, same ground, clear LOS
});
await page.waitForTimeout(1400); // let _tetherIdle accumulate past 1s
const reelable = await page.evaluate(() => {
  const s = window.__BB.scene;
  return s.coachBuddyReelable(s.players[0]);
});
await shot("u6-tether");
console.log("tether: coachBuddyReelable =", reelable);

// --- 4: accuracy — predicted arc vs a REAL thrown buddy ----------------------
// The carrier hovers (gravity off) for a stable origin; the buddy is thrown with
// a real ACTION keypress so throwPartner fires inside the game loop exactly as in
// play, then we record its actual airborne path and geometrically compare it to
// the preview dots (closest-point distance — timing-independent).
await load(0);
await page.mouse.click(640, 360); // focus canvas for the keypress
await page.evaluate(() => {
  const s = window.__BB.scene, a = s.players[0], b = s.players[1];
  a.setSkill("heavy"); b.setSkill("grapple");
  a.facing = 1; a.setFlipX(false);
  a.body.reset(500, 150); a.body.setVelocity(0, 0); a.body.allowGravity = false;
  a.carrying = b; b.carriedBy = a; b.body.enable = false;
  a.keys.jump.isDown = false;
});
await page.waitForTimeout(400); // warm frames
const pred = await page.evaluate(() => {
  const s = window.__BB.scene, a = s.players[0], b = s.players[1];
  const ox = a.x + a.facing * 10, oy = a.y - a.displayHeight / 2 - 20;
  const p = [[ox, oy]];
  for (let i = 0; i < s._arcPts.length; i += 2) p.push([s._arcPts[i], s._arcPts[i + 1]]);
  window.__real = []; window.__on = true;
  const loop = () => { if (!window.__on) return; if (!b.carriedBy && b.body.enable) window.__real.push([b.x, b.y, b.grounded]); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return p;
});
await page.keyboard.press("Space"); // real throw inside the loop
await page.waitForTimeout(900);
const real = await page.evaluate(() => { window.__on = false; return window.__real; });
const seg = (p, a, b) => {
  const vx = b[0] - a[0], vy = b[1] - a[1], wx = p[0] - a[0], wy = p[1] - a[1];
  const L = vx * vx + vy * vy || 1; let t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / L));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
};
let maxDev = 0, n = 0, endDev = 0;
for (const r of real) {
  if (r[2]) break; // stop at first ground contact
  let md = Infinity;
  for (let i = 1; i < pred.length; i++) md = Math.min(md, seg(r, pred[i - 1], pred[i]));
  maxDev = Math.max(maxDev, md); endDev = md; n++;
}
const landReal = real.filter((r) => !r[2]).slice(-1)[0];
const landPred = pred[pred.length - 1];
console.log(`ARC ACCURACY: ${n} airborne samples, maxDev=${maxDev.toFixed(1)}px along-arc, TILE=48 (within a tile: ${maxDev < 48})`);
if (landReal) console.log(`  real last-air (${landReal[0].toFixed(0)},${landReal[1].toFixed(0)}) vs pred end (${landPred[0].toFixed(0)},${landPred[1].toFixed(0)})`);

await browser.close();
console.log(errors ? `u6 snapped with ${errors} page error(s)` : "u6 snapped clean");
