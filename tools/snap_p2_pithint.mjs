// U13 — co-op deep-pit rescue hint acceptance probe (tutorial-only).
//
// The tutorial's Station-4 grapple gap is a 4-tile-deep pit floored by the world
// bottom: BOTH robots can stand stuck at the bottom (jump can't clear 4 tiles).
// When both sit stuck ~2.2s we teach the verified co-op escape — the GRAPPLE zips
// UP to the anchor, then REELS its buddy up.
//
// Checks:
//   (a) both stuck in the pit for the debounce -> pit coach bubble (key "pithint")
//       is visible AND the KOBI teamwork blip is queued/active. shot pithint.png
//   (b) escape (both back on solid ground) -> the hint CLEARS and does NOT
//       immediately re-fire.
//   (c) only ONE robot in the pit -> the hint NEVER fires.
//   (d) a NON-tutorial level (1-1) with both robots in a pit-like spot -> no such
//       hint (only the tutorial declares def.pitHint).
//   0 page errors required. Honors the renderer-wedge rule: no page.evaluate
//   within ~1s of a BOTH-player reposition.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`); if (!cond) fails.push(msg); };
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });

await page.goto("http://localhost:5173/?canvas=1", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
const T = 48;
const shot = (tag) => page.screenshot({ path: `tools/shots/p2/${tag}.png` });
const sleep = (ms) => page.waitForTimeout(ms);

const load = async (idx) => {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Title"); m.stop("Hub"); m.stop("Game");
    m.start("Game", { levelIndex: i });
  }, idx);
  await sleep(1800);
};

// pit coach-bubble state (passive read of the scene pool)
const pitState = () => page.evaluate(() => {
  const s = window.__BB.scene;
  const b = s.coach.bubbles.find((bb) => bb.active && bb.key === "pithint");
  return { bubble: !!b, visible: b ? b.c.visible : false, fired: !!s._pitHintFired };
});
// is the teamwork blip queued or active?
const blipHas = (frag) => page.evaluate((frag) => {
  const ui = window.__BB.game.scene.getScene("UI");
  const inActive = ui.blipActive && ui.blipActive.text.includes(frag);
  const inQueue = ui.blipQueue.some((q) => q.text.includes(frag));
  return !!(inActive || inQueue);
}, frag);

// ===================== (a) both stuck -> hint fires ==========================
await load(12); // tutorial (registry index 12)
await page.evaluate(() => {
  const s = window.__BB.scene; const T = 48;
  s.players[0].setSkill("grapple");
  s.players[1].setSkill("heavy");
  for (const p of s.players) { p.invuln = 999999; p.dead = false; }
  s.players[0].body.reset(36 * T + 10, 16 * T + 24); s.players[0].setVelocity(0, 0);
  s.players[1].body.reset(36 * T + 34, 16 * T + 24); s.players[1].setVelocity(0, 0);
});
await sleep(1600); // settle >1s (renderer-wedge rule)
// keep them parked (re-pin once, still >1s before reads) then wait out the debounce
await sleep(3000);
let a = await pitState();
ok(a.bubble && a.visible, `pit coach bubble visible after debounce (${JSON.stringify(a)})`);
ok(a.fired === true, "pit hint marked fired for this episode");
const blipA = await blipHas("REEL your buddy");
ok(blipA, "KOBI teamwork blip queued/active");
await shot("pithint");

// ===================== (b) escape -> clears, no re-fire ======================
// simulate the escape: put BOTH robots back on solid ground above the pit.
await page.evaluate(() => {
  const s = window.__BB.scene; const T = 48;
  for (const p of s.players) { p.invuln = 999999; p.dead = false; }
  s.players[0].body.reset(33 * T + 24, 13 * T + 24); s.players[0].setVelocity(0, 0);
  s.players[1].body.reset(41 * T + 24, 13 * T + 24); s.players[1].setVelocity(0, 0);
});
await sleep(1400); // >1s before reads (rule) — also lets the clear tick run
let b = await pitState();
ok(!b.bubble, `pit hint cleared after escape (${JSON.stringify(b)})`);
ok(b.fired === false, "episode re-armed after both left the pit");
await sleep(1200); // give it time to (not) re-fire while they stand safe
let b2 = await pitState();
ok(!b2.bubble, "pit hint does NOT re-fire while both stand safe above the pit");

// ===================== (c) only ONE in the pit -> no fire ====================
await page.evaluate(() => {
  const s = window.__BB.scene; const T = 48;
  for (const p of s.players) { p.invuln = 999999; p.dead = false; }
  s.players[0].body.reset(36 * T + 10, 16 * T + 24); s.players[0].setVelocity(0, 0); // in pit
  s.players[1].body.reset(41 * T + 24, 13 * T + 24); s.players[1].setVelocity(0, 0); // safe on floor
});
await sleep(1400); // >1s before reads
await sleep(3000); // well past the debounce
let c = await pitState();
ok(!c.bubble && c.fired === false, `no hint with only ONE robot in the pit (${JSON.stringify(c)})`);

// ===================== (d) non-tutorial level -> never fires =================
await load(0); // 1-1 (no def.pitHint)
await page.evaluate(() => {
  const s = window.__BB.scene; const T = 48;
  // drop both into a low pit-like spot (1-1 has floor gaps); pin them still.
  for (const p of s.players) { p.invuln = 999999; p.dead = false; p.setVelocity(0, 0); }
  const px = s.players[0].x, py = s.players[0].y;
  s.players[0].body.reset(px, py); s.players[1].body.reset(px + 40, py);
});
await sleep(1400); // >1s before reads
await sleep(2600);
let d = await page.evaluate(() => {
  const s = window.__BB.scene;
  return { hasPitHint: !!s.def.pitHint, bubble: s.coach.bubbles.some((bb) => bb.active && bb.key === "pithint") };
});
ok(d.hasPitHint === false, "1-1 does NOT declare def.pitHint (campaign-safe)");
ok(d.bubble === false, "no pit hint bubble in the non-tutorial level");

ok(errors === 0, `0 page errors (saw ${errors})`);
console.log(`\n${fails.length ? "FAILURES:\n  " + fails.join("\n  ") : "ALL U13 PIT-HINT CHECKS PASSED"}`);
await browser.close();
process.exit(fails.length || errors ? 1 : 0);
