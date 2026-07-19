// SL7 — stuck-UX clarity + text-bubble fit audit — visual + behavioural acceptance.
//
// Deliverables (tools/shots/p2/):
//   sl7-tier1.png            — tier-1 gentle nudge, now EXPLICIT (R keycaps + "Hold
//                              R twice to restart" line; calm cyan edge)
//   sl7-tier2.png            — tier-2 firm restart offer
//   sl7-tier3-greyfade.png   — tier-3 "cold hard truth": full-screen grey-fade over
//                              the play area + blunt KOBI copy + R keycaps + sad music
//   sl7-softlock.png         — the SL3 hard-softlock "DEAD END" prompt
//   sl7-bubble-itemcard.png  — pedestal item cards (sized to text)
//   sl7-bubble-banner.png    — chamber intro banner (longest name, sized to head)
//   sl7-bubble-confirm.png   — U3 restart confirm toast (sized to label)
//   sl7-bubble-blip.png      — KOBI blip bar (long 2-line line fits, no overflow)
//
// Proofs (real driven input, read-only asserts):
//   * tier-3 grey-fade is NON-BLOCKING: movement still moves through it; R×2 still
//     restarts; the grey overlay + prompt + sad-music all CLEAR on progress/restart.
//   * sad-music: engine sadMode ON at tier-3 (bus dipped, lowpass closed), reverts
//     fully on clear; honors music-mute (stays silent when muted).
//   * does-fire timeline 0→1→2→3 escalates in step with the copy + grey overlay.
//   0 page errors required.
//
// Tiers are induced by lowering the watchdog's OWN t1/t2/t3 windows (the SL6/SL7
// tuning knobs) and letting the REAL watchdog accumulate a genuine settled stall —
// no faked stuckTier. The softlock is the real input-driven stomp repro.

import { chromium } from "playwright";
import { Driver } from "./beat/driver.mjs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`); if (!cond) fails.push(msg); };
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
// unlock the AudioContext at the title so the sad-music treatment has a live bus.
await page.keyboard.press("KeyZ");
await page.waitForTimeout(200);
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

const promptState = () => page.evaluate(() => {
  const s = window.__BB.scene;
  const ui = s.stuckUI;
  const eng = (window.__BB.audio && window.__BB.audio.engine) ? window.__BB.audio.engine() : {};
  return {
    stuckTier: s.stuckTier | 0,
    softlock: s.softlock || null,
    visible: !!(ui && ui.c.visible),
    head: ui ? ui.head.text : "",
    sub: ui ? ui.sub.text : "",
    capsVisible: !!(ui && ui.caps.visible),
    modeShown: s._stuckModeShown,
    greyVisible: !!(s.greyOverlay && s.greyOverlay.visible),
    greyAlpha: s.greyOverlay ? +s.greyOverlay.alpha.toFixed(2) : -1,
    sadMode: !!eng.sadMode,
    musicLP: eng.musicLP != null ? Math.round(eng.musicLP) : -1,
    musicBus: eng.musicBus != null ? +eng.musicBus.toFixed(4) : -1,
  };
});

// T4: the SL4 panel now applies a +10s READING GRACE per shown tier, so the VISIBLE
// firm / cold-truth panel LAGS the raw watchdog tier by ~10s / ~20s of stall (the raw
// stuckTier still crosses on the compressed windows — the panel just reads slower, on
// purpose). Poll for the panel to actually reach a mode instead of a fixed sleep.
const waitMode = async (mode, timeoutMs = 24000) => {
  const t0 = Date.now();
  let last = await promptState();
  while (Date.now() - t0 < timeoutMs) {
    last = await promptState();
    if (last.visible && last.modeShown === mode) return last;
    await sleep(200);
  }
  return last;
};

// ============ (1) TIER-1 — now EXPLICIT (keycaps + restart line) ==============
await load(0);
await page.evaluate(() => {
  const s = window.__BB.scene;
  for (const p of s.players) { p.setSkill("heavy"); p.invuln = 999999; p.setVelocity(0, 0); }
  s.watchdog.T1 = 300; s.watchdog.T2 = 999999; s.watchdog.T3 = 999999; // gentle only
  s.watchdog.reset();
});
await sleep(1600);
let a = await promptState();
ok(a.stuckTier === 1 && a.modeShown === "gentle", `tier-1 gentle shown (tier=${a.stuckTier}, mode=${a.modeShown})`);
ok(a.capsVisible, "tier-1 NOW shows the R keycaps (explicit)");
ok(/restart/i.test(a.sub) && /ESC/i.test(a.sub), `tier-1 explicit instruction: "${a.sub}"`);
ok(!a.greyVisible, "tier-1 does NOT show the grey overlay");
await shot("sl7-tier1");

// ============ (2) TIER-2 — firm restart offer ================================
await load(0);
await page.evaluate(() => {
  const s = window.__BB.scene;
  for (const p of s.players) { p.setSkill("heavy"); p.invuln = 999999; p.setVelocity(0, 0); }
  s.watchdog.T1 = 150; s.watchdog.T2 = 350; s.watchdog.T3 = 999999; // firm, not cold
  s.watchdog.reset();
});
let b = await waitMode("firm"); // T4: firm panel lands ~10s after gentle (reading grace)
ok(b.stuckTier === 2 && b.modeShown === "firm", `tier-2 firm shown (tier=${b.stuckTier}, mode=${b.modeShown})`);
ok(b.capsVisible && /Hold R twice to restart/i.test(b.sub), `tier-2 R keycaps + copy: "${b.sub}"`);
ok(!b.greyVisible && !b.sadMode, "tier-2 does NOT show grey overlay / sad music");
await shot("sl7-tier2");

// ============ (3) TIER-3 — cold-truth grey-fade + sad music ==================
await load(0);
await page.evaluate(() => {
  const s = window.__BB.scene;
  for (const p of s.players) { p.setSkill("heavy"); p.invuln = 999999; p.setVelocity(0, 0); }
  s.watchdog.T1 = 150; s.watchdog.T2 = 300; s.watchdog.T3 = 500; // climb to cold-truth
  s.watchdog.reset();
});
let c = await waitMode("coldtruth"); // T4: cold-truth panel lands ~20s in (firm+cold reading grace)
await sleep(500); c = await promptState(); // let the grey fade-in tween + sad-music lowpass ramp settle
ok(c.stuckTier === 3 && c.modeShown === "coldtruth", `tier-3 cold-truth (tier=${c.stuckTier}, mode=${c.modeShown})`);
ok(c.greyVisible && c.greyAlpha > 0.4, `grey-fade overlay UP (visible=${c.greyVisible}, alpha=${c.greyAlpha})`);
ok(/STUCK/i.test(c.head), `blunt KOBI head: "${c.head}"`);
ok(c.capsVisible && /Hold R twice to restart/i.test(c.sub), `tier-3 R keycaps + copy: "${c.sub}"`);
ok(c.sadMode && c.musicLP < 2000 && c.musicLP > 0, `sad music ON (sadMode=${c.sadMode}, lowpass=${c.musicLP}Hz)`);
await shot("sl7-tier3-greyfade");

// ---- (3b) NON-BLOCKING: movement still moves + clears grey/prompt/sad ----
const x0 = await page.evaluate(() => window.__BB.scene.players[0].x);
await page.keyboard.down("KeyD"); await sleep(650); await page.keyboard.up("KeyD");
await page.evaluate(() => { const w = window.__BB.scene.watchdog; w.T1 = 25000; w.T2 = 50000; w.T3 = 75000; });
await sleep(300);
const x1 = await page.evaluate(() => window.__BB.scene.players[0].x);
ok(x1 - x0 > 30, `movement input STILL moves the robot through the grey-fade (Δx=${(x1 - x0).toFixed(1)}px)`);
let c2 = await promptState();
ok(!c2.visible && !c2.greyVisible && c2.stuckTier === 0, `grey-fade + prompt CLEAR the instant progress resumes (tier=${c2.stuckTier})`);
ok(!c2.sadMode && c2.musicLP > 15000, `sad music reverted fully on clear (sadMode=${c2.sadMode}, lowpass=${c2.musicLP}Hz)`);

// ---- (3c) R×2 restart works with the grey-fade UP ----
await page.evaluate(() => {
  const s = window.__BB.scene;
  for (const p of s.players) { p.setSkill("heavy"); p.invuln = 999999; p.setVelocity(0, 0); }
  s.watchdog.T1 = 150; s.watchdog.T2 = 300; s.watchdog.T3 = 500;
  s.watchdog.reset();
});
let c3 = await waitMode("coldtruth"); // T4: wait out the firm+cold reading grace
ok(c3.stuckTier === 3 && c3.greyVisible, `tier-3 grey-fade up before the R×2 proof (tier=${c3.stuckTier})`);
const before = await page.evaluate(() => window.__BB.scene._elapsedMs | 0);
await page.keyboard.press("KeyR");
await sleep(400);
const confirming = await page.evaluate(() => !!(window.__BB.scene.confirm));
ok(confirming, "1st R armed the U3 restart confirm THROUGH the grey overlay (input not eaten)");
await page.keyboard.press("KeyR");
await sleep(1500);
let c4 = await promptState();
const after = await page.evaluate(() => window.__BB.scene._elapsedMs | 0);
ok(after < before, `R×2 restarted the room (elapsedMs ${before} -> ${after})`);
ok(!c4.greyVisible && !c4.visible && !c4.sadMode, `grey-fade + prompt + sad-music all cleared on restart`);

// ---- (3d) mute respect: sad music stays silent when music is muted ----
await load(0);
await page.keyboard.press("KeyM"); // master mute (mutes the music bus)
await sleep(200);
await page.evaluate(() => {
  const s = window.__BB.scene;
  for (const p of s.players) { p.setSkill("heavy"); p.invuln = 999999; p.setVelocity(0, 0); }
  s.watchdog.T1 = 150; s.watchdog.T2 = 300; s.watchdog.T3 = 500;
  s.watchdog.reset();
});
let cm = await waitMode("coldtruth"); // T4: wait out the firm+cold reading grace
ok(cm.stuckTier === 3 && cm.sadMode, `tier-3 sad-mode toggled even while muted (sadMode=${cm.sadMode})`);
ok(cm.musicBus < 0.001, `music stays SILENT under mute (musicBus=${cm.musicBus}) — no forced audio`);
await page.keyboard.press("KeyM"); // unmute for the rest of the run
await sleep(200);

// ============ (4) SOFTLOCK — SL3 hard-lock "DEAD END" =========================
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
      await bb.tap(kH.jump, 120); await sleep(180);
      await bb.down(kH.act); await sleep(60); await bb.up(kH.act); await sleep(500);
    } else { await sleep(200); }
  }
  const pollEnd = Date.now() + 4000;
  while (!fired && Date.now() < pollEnd) { const s = await read(); if (s.softlock) fired = s.softlock; await sleep(120); }
}
await sleep(500);
let d = await promptState();
ok(d.softlock && d.softlock.kind === "severed-tunnel", `SL3 hard softlock latched (${JSON.stringify(d.softlock)})`);
ok(d.visible && d.modeShown === "softlock" && /DEAD END/i.test(d.head), `"DEAD END" prompt shown: "${d.head}"`);
ok(d.capsVisible && /Hold R twice to restart/i.test(d.sub), `softlock R keycaps + copy: "${d.sub}"`);
await shot("sl7-softlock");

// ============ (5) BUBBLE-FIT shots ===========================================
// (5a) item cards + intro banner — captured at spawn (2-1: longest chamber name).
await load(3); // 2-1 Maintenance Tunnels
await sleep(200);
await shot("sl7-bubble-banner");   // banner still up (~1.6s window) + item cards
await page.evaluate(() => {
  // measure the freshly-built cards so the shot has hard numbers behind it
  const s = window.__BB.scene;
  window.__cardDims = (s.pedestals || []).map((p) => p.card ? { w: Math.round(p.cardG.width || 0) } : null);
});
await shot("sl7-bubble-itemcard");
// (5b) confirm toast — arm the ESC confirm (the wider label) and shoot it.
await load(0);
await page.keyboard.press("Escape");
await sleep(350);
let cf = await page.evaluate(() => {
  const s = window.__BB.scene;
  return { pending: !!s.confirm, label: s.confirmUI ? s.confirmUI.label.text : "", visible: !!(s.confirmUI && s.confirmUI.c.visible) };
});
ok(cf.pending && cf.visible, `U3 confirm toast shown (label="${cf.label}")`);
await shot("sl7-bubble-confirm");
// (5c) blip bar — push the longest KOBI line and let it fully type out.
await load(0);
await page.evaluate(() => {
  const ui = window.__BB.game.scene.getScene("UI");
  ui.game.events.emit("bb:blip", "KOBI: And if you're ever truly WEDGED — hold R twice to restart the room. It is FINE. A little sad, but FINE. ESC bails you back to the map.");
});
await sleep(4200); // let the typewriter finish the 2-line line
let blip = await page.evaluate(() => {
  const ui = window.__BB.game.scene.getScene("UI");
  const bt = ui.blipText, r = ui._blipRect;
  return { textBottom: Math.round(bt.y + bt.height), barBottom: r.y0 + r.h, h: Math.round(bt.height), w: Math.round(bt.width) };
});
ok(blip.textBottom <= blip.barBottom, `blip 2-line text fits inside the bar (textBottom=${blip.textBottom} <= barBottom=${blip.barBottom}, h=${blip.h})`);
await shot("sl7-bubble-blip");

// ============ (6) DOES-FIRE TIMELINE 0→1→2→3 =================================
console.log("\n-- does-fire timeline (induced windows: t1=400 t2=800 t3=1200) --");
await load(0);
await page.evaluate(() => {
  const s = window.__BB.scene;
  for (const p of s.players) { p.setSkill("heavy"); p.invuln = 999999; p.setVelocity(0, 0); }
  s.watchdog.T1 = 400; s.watchdog.T2 = 800; s.watchdog.T3 = 1200;
  s.watchdog.reset();
});
const seen = {};
const tStart = Date.now();
let last = -1;
while (Date.now() - tStart < 2600) {
  const st = await promptState();
  if (st.stuckTier !== last) {
    const el = ((Date.now() - tStart) / 1000).toFixed(2);
    console.log(`  t=${el}s  tier=${st.stuckTier} mode=${st.modeShown} grey=${st.greyVisible} sad=${st.sadMode} head="${st.head}"`);
    if (seen[st.stuckTier] === undefined) seen[st.stuckTier] = el;
    last = st.stuckTier;
  }
  await sleep(80);
}
ok(seen[1] !== undefined && seen[2] !== undefined && seen[3] !== undefined,
  `timeline reached every tier 0→1→2→3 (t1@${seen[1]}s t2@${seen[2]}s t3@${seen[3]}s)`);

ok(errors === 0, `0 page errors (saw ${errors})`);
console.log(`\n${fails.length ? "FAILURES:\n  " + fails.join("\n  ") : "ALL SL7 CHECKS PASSED"}`);
await browser.close();
process.exit(fails.length || errors ? 1 : 0);
