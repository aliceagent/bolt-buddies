// SL4 — "Stuck?" escalating recovery prompt — visual + behavioural acceptance.
//
// The pooled, NON-BLOCKING recovery prompt that makes the EXISTING R×2 restart /
// ESC×2 map discoverable. It only READS the SL2 watchdog tier (this.stuckTier) and
// the SL3 explicit softlock (this.softlock) and OFFERS restart — it never blocks
// input, never auto-restarts, never seizes control, and tier-1 DEFERS to any
// contextual co-op hint (never stacks).
//
// Screenshots (tools/shots/p2/):
//   (a) sl4-tier1-gentle  — the tier-1 gentle nudge on a real watchdog t1 stall
//   (b) sl4-tier1-defer   — the tutorial pit: the U13 co-op reel hint shows, the
//                           stuck prompt DEFERS (not stacked)
//   (c) sl4-tier2-firm    — the tier-2 firm restart offer + R keycaps (watchdog t2)
//   (d) sl4-tier2-softlock— the tier-2 firm prompt fired by the SL3 1-2 core0 hard
//                           softlock (driven lid-break repro)
// Proofs (real driven input):
//   (e) never-blocks-input: with the prompt up, movement still moves + clears the
//       prompt the instant progress resumes; R×2 still restarts the room.
//   0 page errors required.
//
// The watchdog tiers are induced by lowering the tracker's OWN t1/t2 windows (the
// exact knobs SL6 tunes) and letting the REAL watchdog accumulate a genuine stall —
// no faked stuckTier. The softlock is the real input-driven stomp repro.

import { chromium } from "playwright";
import { Driver } from "./beat/driver.mjs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const T = 48;

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`); if (!cond) fails.push(msg); };
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
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

// passive read of the SL4 prompt + the signals feeding it
const promptState = () => page.evaluate(() => {
  const s = window.__BB.scene;
  const ui = s.stuckUI;
  return {
    stuckTier: s.stuckTier | 0,
    softlock: s.softlock || null,
    visible: !!(ui && ui.c.visible),
    head: ui ? ui.head.text : "",
    sub: ui ? ui.sub.text : "",
    capsVisible: !!(ui && ui.caps.visible),
    modeShown: s._stuckModeShown,
    coopHintActive: (() => {
      const co = s.coach;
      if (co && co.bubbles && co.bubbles.some((b) => b.active)) return true;
      return !!(s._pitHintFired || s._pitReelFired);
    })(),
  };
});

// ===================== (a) TIER-1 gentle on a real watchdog t1 stall =========
// 1-1, both robots settled + still at spawn (no grapple skill => no idle co-op
// hint), watchdog t1 window dropped so the REAL stall crosses it in ~0.5s.
await load(0);
await page.evaluate(() => {
  const s = window.__BB.scene;
  for (const p of s.players) { p.setSkill("heavy"); p.invuln = 999999; p.setVelocity(0, 0); }
  s.watchdog.T1 = 300; s.watchdog.T2 = 999999; // t1 only — keep it in the gentle tier
  s.watchdog.reset();
});
await sleep(1600); // let the REAL watchdog accumulate a genuine settled stall
let a = await promptState();
ok(a.stuckTier === 1, `watchdog raised t1 (stuckTier=${a.stuckTier})`);
ok(a.visible && a.modeShown === "gentle", `tier-1 gentle nudge shown (${JSON.stringify({ visible: a.visible, mode: a.modeShown })})`);
ok(/fresh start/i.test(a.head), `gentle KOBI copy: "${a.head}"`);
ok(!a.capsVisible, "tier-1 shows NO R keycaps (gentle only)");
await shot("sl4-tier1-gentle");

// ===================== (b) TIER-1 DEFERS to the U13 pit co-op hint ============
// tutorial pit: drop BOTH robots into the Station-4 pit -> U13 reel hint fires.
// The watchdog t1 window is ALSO dropped so it would raise t1 — but tier-1 must
// DEFER to the active co-op hint and NOT stack the stuck prompt.
await load(12);
await page.evaluate(() => {
  const s = window.__BB.scene; const T = 48;
  s.players[0].setSkill("grapple"); s.players[1].setSkill("heavy");
  for (const p of s.players) { p.invuln = 999999; p.dead = false; }
  s.players[0].body.reset(36 * T + 10, 16 * T + 24); s.players[0].setVelocity(0, 0);
  s.players[1].body.reset(36 * T + 34, 16 * T + 24); s.players[1].setVelocity(0, 0);
  s.watchdog.T1 = 300; s.watchdog.T2 = 999999; // watchdog WOULD raise t1
});
await sleep(1600); // >1s renderer-wedge settle, and past the pit debounce start
await sleep(3000); // clear the U13 both-stuck debounce (~2.2s)
let b = await promptState();
const bPit = await page.evaluate(() => {
  const s = window.__BB.scene;
  const bb = s.coach.bubbles.find((x) => x.active && x.key === "pithint");
  return { bubble: !!bb, visible: bb ? bb.c.visible : false, fired: !!s._pitHintFired };
});
ok(bPit.bubble && bPit.visible, `U13 pit co-op hint IS showing (${JSON.stringify(bPit)})`);
ok(b.coopHintActive, "a contextual co-op hint is active/applicable");
ok(b.stuckTier === 1, `watchdog would raise t1 here (stuckTier=${b.stuckTier})`);
ok(!b.visible && b.modeShown === "", "the stuck prompt DEFERS — NOT stacked on the co-op hint");
await shot("sl4-tier1-defer");

// ===================== (c) TIER-2 firm restart offer (watchdog t2) ============
await load(0);
await page.evaluate(() => {
  const s = window.__BB.scene;
  for (const p of s.players) { p.setSkill("heavy"); p.invuln = 999999; p.setVelocity(0, 0); }
  s.watchdog.T1 = 150; s.watchdog.T2 = 350; // cross into the firm tier
  s.watchdog.reset();
});
await sleep(1600);
let c = await promptState();
ok(c.stuckTier === 2, `watchdog raised t2 (stuckTier=${c.stuckTier})`);
ok(c.visible && c.modeShown === "firm", `tier-2 firm prompt shown (${JSON.stringify({ visible: c.visible, mode: c.modeShown })})`);
ok(c.capsVisible, "tier-2 shows the R keycaps");
ok(/Hold R twice to restart/i.test(c.sub), `firm restart copy: "${c.sub}"`);
await shot("sl4-tier2-firm");

// ===================== (d) TIER-2 fired by the SL3 core0 hard softlock ========
// Drive the REAL 1-2 lid-break repro (stomp the cracked lid, drop Heavy into the
// severed-tunnel pocket) -> SL3 detector latches this.softlock -> tier-2 firm.
await page.evaluate(() => {
  const m = window.__BB.game.scene;
  ["UI", "Game", "Title", "Hub"].forEach((k) => m.stop(k));
  localStorage.clear();
  m.start("Game", { levelIndex: 1 });
});
await sleep(1800);
await page.evaluate(() => { window.__bbSoftlock = null; window.__bbSoftlockPeak = 0; });
{
  const bb = new Driver(page);
  bb.setRoles({ G: 0, H: 1, P: 0, T: 1 });
  await bb.equip("G", 3);
  await bb.equip("H", 6);
  await bb.walkTo("G", 12, { timeout: 20000 }).catch(() => {});
  await bb.walkTo("H", 19, { timeout: 30000 }).catch(() => {});
  const kH = bb.keysFor("H");
  const read = () => page.evaluate(() => ({
    softlock: window.__bbSoftlock || null,
    lidBroken: (() => { const s = window.__BB.scene; return !!(s.grid && s.grid[14] && s.grid[14][19] !== "%"); })(),
  }));
  let fired = null;
  for (let attempt = 0; attempt < 40 && !fired; attempt++) {
    const s = await read();
    if (s.softlock) { fired = s.softlock; break; }
    if (!s.lidBroken) {
      await bb.walkTo("H", 19, { timeout: 6000 }).catch(() => {});
      await bb.tap(kH.jump, 120);
      await sleep(180);
      await bb.down(kH.act);
      await sleep(60);
      await bb.up(kH.act);
      await sleep(500);
    } else {
      await sleep(200);
    }
  }
  const pollEnd = Date.now() + 4000;
  while (!fired && Date.now() < pollEnd) { const s = await read(); if (s.softlock) fired = s.softlock; await sleep(120); }
}
await sleep(400); // let the prompt's show-tween settle for the shot
let d = await promptState();
ok(d.softlock && d.softlock.kind === "severed-tunnel", `SL3 hard softlock latched (${JSON.stringify(d.softlock)})`);
ok(d.stuckTier === 2, `stuckTier forced to 2 by the detector (${d.stuckTier})`);
ok(d.visible && d.modeShown === "softlock", `tier-2 firm prompt shown w/ confident copy (${JSON.stringify({ visible: d.visible, mode: d.modeShown, head: d.head })})`);
ok(d.capsVisible, "softlock prompt shows the R keycaps");
await shot("sl4-tier2-softlock");

// ===================== (e) NEVER BLOCKS INPUT ================================
// e1 — with the tier-2 prompt UP, real movement still moves the robot AND clears
//      the prompt the instant progress resumes.
await load(0);
await page.evaluate(() => {
  const s = window.__BB.scene;
  for (const p of s.players) { p.setSkill("heavy"); p.invuln = 999999; p.setVelocity(0, 0); }
  s.watchdog.T1 = 150; s.watchdog.T2 = 350;
  s.watchdog.reset();
});
await sleep(1400);
let e1a = await promptState();
ok(e1a.visible && e1a.stuckTier === 2, `prompt up before the movement proof (tier=${e1a.stuckTier}, visible=${e1a.visible})`);
const x0 = await page.evaluate(() => window.__BB.scene.players[0].x);
await page.keyboard.down("KeyD"); await sleep(650); await page.keyboard.up("KeyD");
// restore realistic watchdog windows so the (now-progressed) team does not RE-stall
// during the read — the point is that resuming progress CLEARED the tier-2 prompt.
await page.evaluate(() => { const w = window.__BB.scene.watchdog; w.T1 = 25000; w.T2 = 50000; });
await sleep(300);
const x1 = await page.evaluate(() => window.__BB.scene.players[0].x);
ok(x1 - x0 > 30, `movement input still moves the robot while the prompt shows (Δx=${(x1 - x0).toFixed(1)}px)`);
let e1b = await promptState();
ok(!e1b.visible && e1b.stuckTier === 0, `prompt CLEARS the instant progress resumes (tier=${e1b.stuckTier}, visible=${e1b.visible})`);

// e2 — with the prompt UP, the EXISTING R×2 restart still fires and clears it.
await page.evaluate(() => {
  const s = window.__BB.scene;
  for (const p of s.players) { p.setSkill("heavy"); p.invuln = 999999; p.setVelocity(0, 0); }
  s.watchdog.T1 = 150; s.watchdog.T2 = 350;
  s.watchdog.reset();
});
await sleep(1400);
let e2a = await promptState();
ok(e2a.visible && e2a.stuckTier === 2, `prompt up before the R×2 proof (tier=${e2a.stuckTier}, visible=${e2a.visible})`);
const before = await page.evaluate(() => window.__BB.scene._elapsedMs | 0);
await page.keyboard.press("KeyR"); // 1st R -> U3 confirm toast
await sleep(400);
const confirming = await page.evaluate(() => !!(window.__BB.scene.confirm));
ok(confirming, "1st R armed the existing U3 restart confirm (R×2 mechanism intact)");
await page.keyboard.press("KeyR"); // 2nd R -> doRestart
await sleep(1400); // fade + scene.restart re-runs create()
let e2b = await promptState();
const after = await page.evaluate(() => window.__BB.scene._elapsedMs | 0);
ok(after < before, `R×2 restarted the room (elapsedMs ${before} -> ${after})`);
ok(!e2b.visible && e2b.stuckTier === 0, `prompt cleared on restart (tier=${e2b.stuckTier}, visible=${e2b.visible})`);

ok(errors === 0, `0 page errors (saw ${errors})`);
console.log(`\n${fails.length ? "FAILURES:\n  " + fails.join("\n  ") : "ALL SL4 CHECKS PASSED"}`);
await browser.close();
process.exit(fails.length || errors ? 1 : 0);
