// ANIM A10 — Social & co-op moments: acceptance probe + BURST-SHOT CONTACT SHEETS.
//
// A10 gives the TWO player robots relationship beats. Every beat is a pure VISUAL
// overlay on the SACRED co-op LOGIC (carry/detach, reel/zip, escort/shimmer, respawn,
// exit-zone detection + finishLevel — ALL byte-identical):
//   HIGH-FIVE  — both robots reach the exit + the level COMPLETES -> turn, lean, and a
//                pooled spark-slap, in the existing ~500ms finish gap. finishLevel
//                fires exactly as today (the reaction reads scene.complete AFTER it set,
//                never gates bothIn, adds no delay). Rides the TweenManager through the
//                gap (physics paused + update() early-returns on complete).
//   REEL CATCH — reeler "caught you" brace (host rotation) + catch glance (pupils) on a
//                reeled buddy's arrival. Cosmetic pose; reel logic untouched.
//   ESCORT     — soft pooled+budgeted hand-hold spark drifts between a phase buddy + its
//                non-phase partner while escorting inside a shimmer wall.
//   CARRY WAVE — a buddy carried >2s waves at the camera (antenna sway + look; cosmetic).
//   RESPAWN    — the surviving partner's pupils track the respawn beam (cosmetic pupils).
//
// This probe:
//   1. CONTACT SHEETS -> tools/shots/p2/: a10-highfive a10-reelcatch a10-escort
//      a10-carrywave a10-respawn.
//   2. CRITICAL byte-identical: player BODY geometry (x/y/w/h) through the high-five
//      reaction (rotation-only); reeler BODY unmoved through the catch brace; both
//      bodies unmoved through the respawn glance. Physics/bodies SACRED.
//   3. finishLevel fires at the SAME elapsed anim ON vs OFF (the high-five never gates
//      completion); the high-five one-shot only latches AFTER complete.
//   4. The escort spark is pooled + BUDGETED (in scene._budgetEmitters; clamped by fxBudget).
//   5. ?animoff=1 byte-identical: with the rig OFF none of the five beats run (no pupil
//      offset, no spark, no high-five).
//   6. 0 page errors, Canvas tier.
//   7. fps A/B (Canvas) 1-3 + 2-2 (busiest), anim ON vs OFF, within ~2 fps (interleaved).
//
//   node tools/snap_p2_a10.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = process.env.BB_SHOTS || "tools/shots/p2";
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}${extra ? " — " + extra : ""}`);
  if (!cond) fails.push(msg);
};

const cBrowser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await cBrowser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
page.on("console", (m) => { if (/error/i.test(m.text())) console.log("CONSOLE:", m.text()); });
await page.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
await sleep(900);

const L = { "1-1": 0, "1-2": 1, "1-3": 2, "2-1": 3, "2-2": 4, "2-3": 5 };

const startLevel = async (idx) => {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Game"); m.stop("Title"); m.stop("Onboard"); m.stop("Hub");
    m.start("Game", { levelIndex: i });
  }, idx);
  await page.waitForFunction(() => {
    const g = window.__BB.game.scene.getScene("Game");
    return !!(g && g.def && g.players && g.players.length === 2 && g.anim && g.anim.social &&
      window.__BB.game.scene.isActive("Game"));
  }, null, { timeout: 8000 });
  await sleep(700);
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    g._origUpdateCamera = g.updateCamera;
    g.updateCamera = () => {}; // freeze the camera so our framing sticks during a burst
  });
};
const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);
const setAnim = (on) => page.evaluate((v) => { window.__BB.game.scene.getScene("Game").anim.enabled = v; }, on);
// hide the U1/U2/U5 coach hint bubbles + their reshow clones so they never crowd a
// framed burst (they are a separate UX system; nothing to do with A10).
const hideCoach = () => page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  (g.actionHints || []).forEach((h) => { if (h) h.setVisible(false); }); // "SPACE/L = ACTION" floaters
  const co = g.coach; if (!co) return;
  (co.bubbles || []).forEach((b) => { if (b && b.c) b.c.setVisible(false); });
  (co.reshow || []).forEach((r) => { if (r) r.setVisible(false); });
});

const frameAtP = (pg, x, y, z) => pg.evaluate(([x, y, z]) => {
  const cam = window.__BB.game.scene.getScene("Game").cameras.main;
  cam.setZoom(z); cam.centerOn(x, y);
}, [x, y, z]);
const frameAt = (x, y, z) => frameAtP(page, x, y, z);
const clip = { x: 640 - 150, y: 360 - 150, width: 300, height: 300 };
const grabP = async (pg) => (await pg.screenshot({ clip })).toString("base64");
const grab = async () => grabP(page);
const strip = async (name, frames, label, w = 150, h = 150) => {
  const imgs = frames.map((f) => `<img src="data:image/png;base64,${f}" style="display:block;width:${w}px;height:${h}px;border-radius:6px">`).join("");
  const html = `<body style="margin:0"><div style="display:inline-flex;flex-direction:column;gap:6px;background:#0a0f1e;padding:10px;font-family:monospace">`
    + `<div style="color:#8fa3d9;font-size:13px">A10 · ${label}</div>`
    + `<div style="display:inline-flex;gap:6px">${imgs}</div></div></body>`;
  const p2 = await ctx.newPage();
  await p2.setContent(html);
  const el = await p2.$("div");
  await el.screenshot({ path: `${SHOTS}/${name}.png` });
  await p2.close();
  console.log(`contact sheet -> ${SHOTS}/${name}.png`);
};

// ============================================================================
// CONTACT SHEET: EXIT HIGH-FIVE — turn -> lean -> spark-slap in the finish gap.
// ============================================================================
await startLevel(L["1-1"]);
ok(await active("Game"), "1-1 Game scene active");
ok(!(await page.evaluate(() => window.__BB.game.renderer.type === 2)), "running on the Canvas tier (?canvas=1)");
ok(await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  // escort spark is WebGL-only (like the game's shimmerSparks) -> null on the Canvas tier;
  // its budget registration is verified on the WebGL page below.
  return !!(g.anim.social && typeof g.anim.social.update === "function" && g.anim.social.escortSpark === null);
}), "social controller installed: update hook present; escort spark WebGL-only (null on Canvas -> zero Canvas cost)");
{
  await setAnim(true);
  const c = await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const a = g.players[0], b = g.players[1];
    a.invuln = 999999; b.invuln = 999999;
    // stand them side by side (as at the exit) and freeze the game the way finishLevel
    // does (complete + physics paused), then fire the reaction in isolation.
    const gy = a.y;
    a.setVelocity(0, 0); b.setVelocity(0, 0);
    a.setPosition(a.x, gy); b.setPosition(a.x + 40, gy);
    g.complete = true; g.physics.pause();
    g.anim.social._fireHighFive();
    return { mx: (a.x + b.x) / 2, my: gy - 12 };
  });
  await frameAt(c.mx, c.my, 3.0);
  const f = [];
  for (let i = 0; i < 6; i++) { f.push(await grab()); await sleep(130); }
  await strip("a10-highfive", f, "EXIT HIGH-FIVE — turn toward each other -> lean in -> pooled spark-SLAP (<=900ms reaction in the finish gap; finishLevel untouched)");
}

// HIGH-FIVE byte-identical: the reaction is rotation + a pooled spark ONLY — player
// BODY geometry (x/y/w/h) must stay byte-identical through the whole tween.
await startLevel(L["1-1"]);
const hiBody = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const a = g.players[0], b = g.players[1];
  a.invuln = 999999; b.invuln = 999999; a.setVelocity(0, 0); b.setVelocity(0, 0);
  b.setPosition(a.x + 40, a.y);
  g.complete = true; g.physics.pause();
  const snap = (p) => [+p.body.x.toFixed(3), +p.body.y.toFixed(3), +p.body.width.toFixed(3), +p.body.height.toFixed(3)];
  const a0 = snap(a), b0 = snap(b);
  g.anim.social._fireHighFive();
  let drift = 0;
  await new Promise((res) => { let t = 0; const iv = setInterval(() => {
    const a1 = snap(a), b1 = snap(b);
    for (let k = 0; k < 4; k++) { drift = Math.max(drift, Math.abs(a1[k] - a0[k]), Math.abs(b1[k] - b0[k])); }
    if (++t > 60) { clearInterval(iv); res(); }
  }, 16); });
  const leaned = Math.abs(a.angle) > 3 || Math.abs(b.angle) > 3; // caught the lean at some tick? (best-effort)
  return { drift: +drift.toFixed(4), aAngle: +a.angle.toFixed(2), bAngle: +b.angle.toFixed(2) };
});
ok(hiBody.drift < 0.0001, "HIGH-FIVE player BODY geometry byte-identical through the reaction (rotation + pooled spark only)", `bodyDrift=${hiBody.drift}px`);

// HIGH-FIVE timing: finishLevel fires at the SAME elapsed after both enter the zone,
// anim ON vs OFF (the reaction NEVER gates bothIn / adds delay). A recorder-only stub
// captures the fire elapsed WITHOUT running completion side effects (as A9's exit test).
const measureFinish = async (animOn) => page.evaluate(async (on) => {
  const g = window.__BB.game.scene.getScene("Game");
  g.anim.enabled = on;
  g.complete = false; g.anim.social._prevComplete = false; g.anim.social._hiFired = false;
  const d = g.exitDoor; d.needs = {}; d.open = true;
  const orig = g.finishLevel.bind(g);
  let firedAt = -1; const t0 = performance.now();
  g.finishLevel = () => { if (firedAt < 0) firedAt = performance.now() - t0; }; // record only
  g.players.forEach((p) => { p.dead = false; p.invuln = 999999; p.setPosition(d.zone.centerX, d.zone.centerY); p.setVelocity(0, 0); });
  await new Promise((res) => { let t = 0; const iv = setInterval(() => {
    g.players.forEach((p) => p.setPosition(d.zone.centerX, d.zone.centerY));
    if (firedAt >= 0 || ++t > 40) { clearInterval(iv); res(); }
  }, 16); });
  g.finishLevel = orig;
  return { firedAt: +firedAt.toFixed(1) };
}, animOn);
await startLevel(L["1-1"]); const finOn = await measureFinish(true);
await startLevel(L["1-1"]); const finOff = await measureFinish(false);
ok(finOn.firedAt >= 0 && finOff.firedAt >= 0 && Math.abs(finOn.firedAt - finOff.firedAt) <= 20,
  "HIGH-FIVE: finishLevel fires at the SAME elapsed anim ON vs OFF (never gates/delays completion)",
  `on=${finOn.firedAt}ms off=${finOff.firedAt}ms`);

// HIGH-FIVE one-shot is DOWNSTREAM of completion: it stays un-latched while !complete
// and only latches once scene.complete is true (which the real finishLevel sets). Proves
// the reaction reads the completion STATE — it never intercepts or gates finishLevel.
const latch = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game"); const s = g.anim.social;
  g.anim.enabled = true; g.complete = false; s._prevComplete = false; s._hiFired = false;
  s._updateHighFive(); const before = s._hiFired;      // !complete -> must NOT latch
  g.complete = true; s._updateHighFive(); const after = s._hiFired; // complete -> latches
  g.complete = false; s._updateHighFive();             // re-arm
  return { before, after };
});
ok(latch.before === false && latch.after === true,
  "HIGH-FIVE one-shot latches ONLY when scene.complete is set (downstream of finishLevel, not an interceptor)",
  `beforeComplete=${latch.before} afterComplete=${latch.after}`);

// ============================================================================
// CONTACT SHEET: REEL CATCH — reeler "caught you" brace + catch glance.
// ============================================================================
await startLevel(L["1-1"]);
{
  await setAnim(true);
  const c = await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const reeler = g.players[0], buddy = g.players[1];
    reeler.invuln = 999999; buddy.invuln = 999999;
    reeler.setVelocity(0, 0); buddy.setVelocity(0, 0);
    buddy.setPosition(reeler.x + 46, reeler.y); // arrived just beside the reeler
    // fire the catch envelope directly (as the arrival edge would).
    g.anim.social._catchT[0] = 380; g.anim.social._catchBuddy[0] = buddy;
    return { x: reeler.x + 10, y: reeler.y - 6 };
  });
  await frameAt(c.x, c.y, 3.4);
  const f = [];
  for (let i = 0; i < 5; i++) { f.push(await grab()); await sleep(70); }
  await strip("a10-reelcatch", f, "REEL CATCH — reeler 'caught you' brace (host rotation lean-back) + catch glance (pupils toward the caught buddy) + a pooled catch spark");
}
// REEL CATCH: fires on the arrival edge (reeled non-null -> null, both alive); the
// reeler BODY stays byte-identical through the brace (rotation + pupil offset only).
const reel = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const s = g.anim.social;
  const reeler = g.players[0], buddy = g.players[1];
  // ISOLATE the social writer (as A9 isolated the crusher-quiver rotation): rig OFF +
  // physics paused, driving social.update() by hand. Reset the reeler angle to 0 each
  // frame to mimic the rig's per-frame base (in-game the rig re-writes angle before
  // social each frame). Any body change is then attributable to A10 alone — must be zero.
  g.anim.enabled = false; g.physics.pause();
  reeler.invuln = 999999; buddy.invuln = 999999; reeler.setVelocity(0, 0); buddy.setVelocity(0, 0);
  buddy.setPosition(reeler.x + 46, reeler.y);
  s._catchT[0] = 0; s._prevReeler[0] = null; s._prevReeler[1] = null;
  const tick = () => { reeler.setAngle(0); s.update(performance.now(), 16); };
  buddy.reeled = reeler; tick();                 // prev now = reeler
  const armedBefore = s._catchT[0];
  buddy.reeled = null; tick();                   // edge: arrival -> catch armed
  const armedAfter = s._catchT[0];
  const bx0 = +reeler.body.x.toFixed(3), by0 = +reeler.body.y.toFixed(3),
        bw0 = +reeler.body.width.toFixed(3), bh0 = +reeler.body.height.toFixed(3);
  let drift = 0, sawAngle = 0;
  for (let i = 0; i < 24; i++) {
    tick();
    sawAngle = Math.max(sawAngle, Math.abs(reeler.angle));
    drift = Math.max(drift, Math.abs(reeler.body.x - bx0), Math.abs(reeler.body.y - by0),
      Math.abs(reeler.body.width - bw0), Math.abs(reeler.body.height - bh0));
  }
  g.anim.enabled = true; g.physics.resume();
  return { armedBefore, armedAfter, drift: +drift.toFixed(4), sawAngle: +sawAngle.toFixed(3), reelLink: buddy.reeled };
});
ok(reel.armedBefore === 0 && reel.armedAfter > 0,
  "REEL CATCH arms on the arrival edge (reeled non-null -> null, both alive)", `armedAfter=${reel.armedAfter}ms`);
ok(reel.sawAngle > 0.01, "REEL CATCH brace tilts the reeler (host rotation)", `peakAngle=${reel.sawAngle}deg`);
ok(reel.drift < 0.0001, "REEL CATCH reeler BODY byte-identical through the brace (rotation + pupil offset only)", `bodyDrift=${reel.drift}px`);

// ============================================================================
// CONTACT SHEET + assertions: ESCORT HAND-HOLD SPARK — WebGL-only (like the game's
// shimmerSparks). On the Canvas tier the escort spark is null by design (zero Canvas
// cost — this is what keeps A10 off the fps-sensitive beat path), so it is snapped +
// asserted on a dedicated WebGL page (headless chromium provides WebGL).
// ============================================================================
{
  const wpage = await ctx.newPage();
  wpage.on("pageerror", (e) => { console.log("WEBGL PAGE ERROR:", e.message); errors++; });
  await wpage.goto(`${BASE}/`, { waitUntil: "networkidle" }); // NO ?canvas=1 -> WebGL tier
  await sleep(700);
  ok(await wpage.evaluate(() => window.__BB.game.renderer.type === 2),
    "escort verified on the WebGL tier (renderer.type === WEBGL)");
  await wpage.evaluate((i) => { const m = window.__BB.game.scene; m.stop("UI"); m.stop("Game"); m.stop("Title"); m.stop("Onboard"); m.stop("Hub"); m.start("Game", { levelIndex: i }); }, L["2-2"]);
  await wpage.waitForFunction(() => { const g = window.__BB.game.scene.getScene("Game"); return !!(g && g.players && g.players.length === 2 && g.anim && g.anim.social && window.__BB.game.scene.isActive("Game")); }, null, { timeout: 8000 });
  await sleep(700);
  await wpage.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); g.updateCamera = () => {}; });
  ok(await wpage.evaluate(() => (window.__BB.game.scene.getScene("Game").shimmerPts || []).length >= 1),
    "2-2 has shimmer walls (WebGL)");
  ok(await wpage.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); const em = g.anim.social.escortSpark; return !!(em && g._budgetEmitters.indexOf(em) >= 0); }),
    "ESCORT spark exists on WebGL + registered in the fxBudget guard");
  const c = await wpage.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game"); const pt = g.shimmerPts[0];
    let phase = g.players.find((p) => p.skill === "phase") || g.players[0]; phase.skill = "phase";
    const other = phase.partner; phase.invuln = 999999; other.invuln = 999999;
    phase.setPosition(pt.x, pt.y); phase.setVelocity(0, 0); phase.inPhaseWall = true;
    other.setPosition(pt.x + 34, pt.y); other.setVelocity(0, 0);
    return { x: (pt.x + pt.x + 34) / 2, y: pt.y - 6 };
  });
  await frameAtP(wpage, c.x, c.y, 3.2);
  const f = [];
  for (let i = 0; i < 6; i++) {
    await wpage.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      const phase = g.players.find((p) => p.skill === "phase"); if (phase) phase.inPhaseWall = true;
      (g.actionHints || []).forEach((h) => { if (h) h.setVisible(false); });
      const co = g.coach; if (co) { (co.bubbles || []).forEach((b) => b && b.c && b.c.setVisible(false)); (co.reshow || []).forEach((r) => r && r.setVisible(false)); }
    });
    f.push(await grabP(wpage)); await sleep(90);
  }
  await strip("a10-escort", f, "ESCORT HAND-HOLD SPARK — a soft pooled+budgeted WebGL light drifts between a phase buddy + its non-phase partner while escorting inside the shimmer field");
  const escort = await wpage.evaluate(async () => {
    const g = window.__BB.game.scene.getScene("Game"); const s = g.anim.social; const em = s.escortSpark;
    const pt = g.shimmerPts[0];
    let phase = g.players.find((p) => p.skill === "phase") || g.players[0]; phase.skill = "phase";
    const other = phase.partner; phase.invuln = 999999; other.invuln = 999999;
    phase.setPosition(pt.x, pt.y); other.setPosition(pt.x + 34, pt.y);
    g.anim.enabled = true;
    const before = em.getAliveParticleCount();
    let peak = 0;
    await new Promise((res) => { let t = 0; const iv = setInterval(() => {
      phase.inPhaseWall = true; phase.setPosition(pt.x, pt.y); other.setPosition(pt.x + 34, pt.y);
      s.update(performance.now(), 24);
      const a = em.getAliveParticleCount(); if (a > peak) peak = a;
      if (++t > 60) { clearInterval(iv); res(); }
    }, 16); });
    return { before, peak, budgeted: g._budgetEmitters.indexOf(em) >= 0, cap: g.fxPalette.budget, maxAlive: em.maxAliveParticles };
  });
  ok(escort.peak > 0, "ESCORT spark emits pooled particles while escorting inside the shimmer (WebGL)", `peakAlive=${escort.peak}`);
  ok(escort.budgeted && escort.peak <= escort.cap && escort.peak <= escort.maxAlive,
    "ESCORT spark is pooled + BUDGETED (in the fxBudget guard; within the ~120 cap + its own maxAlive)",
    `peak=${escort.peak} maxAlive=${escort.maxAlive} cap=${escort.cap}`);
  await wpage.close();
}

// ============================================================================
// CONTACT SHEET: CARRIED BUDDY WAVE — a carried buddy waves at the camera after 2s.
// ============================================================================
await startLevel(L["1-1"]);
{
  await setAnim(true);
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const carrier = g.players[0], carried = g.players[1];
    carrier.invuln = 999999; carried.invuln = 999999; carrier.setVelocity(0, 0); carried.setVelocity(0, 0);
    carrier.carrying = carried; carried.carriedBy = carrier;
  });
  await sleep(250); // let the carried buddy settle into the ride-above pose (preUpdate places it)
  const c = await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const carried = g.players[1];
    g.anim.social._carryT[1] = 2100; // already carried >2s -> waving
    return { x: carried.x, y: carried.y - 6 }; // frame on the CARRIED buddy's head (rides above the carrier)
  });
  await frameAt(c.x, c.y, 3.6);
  const f = [];
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); g.anim.social._carryT[1] = 2100; });
    await hideCoach();
    f.push(await grab()); await sleep(110);
  }
  await strip("a10-carrywave", f, "CARRIED BUDDY WAVE — a buddy carried >2s waves at the camera (antenna sway + look toward the viewer; cosmetic pooled part offsets)");
}
// CARRY WAVE: cosmetic only — the carry relationship + the carried body stay untouched.
const carry = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const s = g.anim.social;
  const carrier = g.players[0], carried = g.players[1];
  carrier.invuln = 999999; carried.invuln = 999999;
  carrier.carrying = carried; carried.carriedBy = carrier;
  g.anim.enabled = true; g.physics.pause();
  const antObj = s._rigs[1] && s._rigs[1]._ant ? s._rigs[1]._ant.obj : null;
  // FULL frames: the rig re-places the antenna each frame, social adds one frame's sway
  // (no accumulation — exactly as in-game). Sample the per-frame sway magnitude.
  let sway = 0;
  for (let i = 0; i < 40; i++) { s._carryT[1] = 2100; g.anim.update(performance.now() + i * 40, 24);
    if (antObj) sway = Math.max(sway, Math.abs(antObj.x - carried.x)); }
  g.physics.resume();
  return { link: carried.carriedBy === carrier && carrier.carrying === carried, hasAnt: !!antObj, sway: +sway.toFixed(2) };
});
ok(carry.link, "CARRY WAVE leaves the carry relationship intact (carriedBy/carrying untouched)");
ok(carry.hasAnt && carry.sway > 0, "CARRY WAVE sways the carried buddy's antenna part (cosmetic offset)", `antSway=${carry.sway}px`);

// ============================================================================
// CONTACT SHEET: RESPAWN PARTNER-NOTICES — surviving partner's pupils track the beam.
// ============================================================================
await startLevel(L["1-1"]);
{
  await setAnim(true);
  const c = await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const survivor = g.players[0], gone = g.players[1];
    survivor.invuln = 999999; survivor.setVelocity(0, 0);
    // stage the respawn beam beside the survivor and arm the notice edge.
    gone.dead = false; gone.invuln = 1500; gone.setPosition(survivor.x + 60, survivor.y - 10);
    g.respawnFx(gone.x, gone.y, gone);       // the beam column visual
    g.anim.social._prevDead[1] = true;        // edge: was dead
    g.anim.social.update(performance.now(), 16); // detect dead->alive -> arm survivor notice
    return { x: (survivor.x + gone.x) / 2, y: survivor.y - 8 };
  });
  await frameAt(c.x, c.y, 3.2);
  const f = [];
  for (let i = 0; i < 5; i++) { f.push(await grab()); await sleep(90); }
  await strip("a10-respawn", f, "RESPAWN PARTNER-NOTICES — the surviving partner's pupils track the respawn beam ('they notice each other'; cosmetic pupil transform only)");
}
// RESPAWN NOTICE: cosmetic pupil transform only — both player BODIES byte-identical.
const respawn = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const s = g.anim.social;
  const survivor = g.players[0], gone = g.players[1];
  survivor.invuln = 999999; survivor.setVelocity(0, 0);
  gone.dead = false; gone.setPosition(survivor.x + 60, survivor.y - 10);
  // ISOLATE the social writer from the rig (as A9 isolated the crusher-quiver rotation):
  // run the rig OFF + physics paused, then drive social.update() BY HAND. Any body change
  // is then attributable to the social notice alone — which must be exactly zero (it writes
  // only the pooled PUPIL part). (With the rig on, the idle-breathing A2 body-sync oscillates
  // the raw body.width property while the EFFECTIVE world body stays fixed — that's the rig,
  // not A10; isolating removes that confound.)
  g.anim.enabled = false; g.physics.pause();
  const pupObj = s._rigs[0] && s._rigs[0]._pupils ? s._rigs[0]._pupils.obj : null;
  const snap = (p) => [+p.body.x.toFixed(3), +p.body.y.toFixed(3), +p.body.width.toFixed(3), +p.body.height.toFixed(3)];
  const s0 = snap(survivor), g0 = snap(gone);
  s._prevDead[1] = true; s._noticeT[0] = 0;
  s.update(performance.now(), 16); // arm (dead->alive edge) — social writer, rig off
  const armed = s._noticeT[0];
  let drift = 0, look = 0;
  for (let i = 0; i < 30; i++) {
    s.update(performance.now() + i * 16, 16);
    const s1 = snap(survivor), g1 = snap(gone);
    for (let k = 0; k < 4; k++) drift = Math.max(drift, Math.abs(s1[k] - s0[k]), Math.abs(g1[k] - g0[k]));
    if (pupObj) look = Math.max(look, Math.abs(pupObj.x - survivor.x));
  }
  g.anim.enabled = true; g.physics.resume();
  return { armed: +armed.toFixed(1), drift: +drift.toFixed(4), sawLook: look > 0, hasPup: !!pupObj };
});
ok(respawn.armed > 0, "RESPAWN NOTICE arms the surviving partner on the respawn (dead->alive) edge", `armed=${respawn.armed}ms`);
ok(respawn.drift < 0.0001, "RESPAWN NOTICE both player BODIES byte-identical (cosmetic pupil transform only)", `bodyDrift=${respawn.drift}px`);

// ============================================================================
// ?animoff=1 byte-identical: with the rig OFF none of the five beats run.
// ============================================================================
const off = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const s = g.anim.social;
  g.anim.enabled = false; // AnimSystem.update returns early -> social.update never runs
  const a = g.players[0], b = g.players[1];
  a.invuln = 999999; b.invuln = 999999;
  const em = s.escortSpark; // null on Canvas (WebGL-only) -> treat as 0 alive
  const emBefore = em ? em.getAliveParticleCount() : 0;
  const aAng0 = a.angle, bAng0 = b.angle;
  // stage EVERY trigger, then tick the WHOLE anim system (which must no-op when off).
  b.carriedBy = a; a.carrying = b; s._carryT[1] = 9999;               // carry wave trigger
  const pt = g.shimmerPts && g.shimmerPts[0]; if (pt) { a.skill = "phase"; a.inPhaseWall = true; a.setPosition(pt.x, pt.y); b.setPosition(pt.x + 30, pt.y); } // escort
  s._noticeT[0] = 9999; s._catchT[0] = 9999;                          // notice + catch armed
  g.complete = true; s._prevComplete = false; s._hiFired = false;      // high-five edge
  for (let i = 0; i < 20; i++) g.anim.update(performance.now() + i * 16, 16); // system-level tick, OFF
  const emAfter = em ? em.getAliveParticleCount() : 0;
  g.complete = false;
  return { emBefore, emAfter, hiFired: s._hiFired, aMoved: Math.abs(a.angle - aAng0), bMoved: Math.abs(b.angle - bAng0) };
});
ok(off.emAfter === off.emBefore && off.hiFired === false && off.aMoved < 0.0001 && off.bMoved < 0.0001,
  "?animoff=1 byte-identical: rig OFF runs NONE of the five beats (no spark, no high-five, no rotation)",
  `spark ${off.emBefore}->${off.emAfter} hiFired=${off.hiFired} angleDrift=${Math.max(off.aMoved, off.bMoved).toFixed(4)}`);

// ============================================================================
// fps A/B (Canvas) — 1-3 + 2-2 (busiest), anim ON vs OFF, ~flat (interleaved).
// ============================================================================
const sampleFps = (ms = 1600) => page.evaluate((ms) => {
  const gme = window.__BB.game; const s = []; const t0 = performance.now();
  return new Promise((resolve) => {
    const iv = setInterval(() => {
      s.push(gme.loop.actualFps);
      if (performance.now() - t0 > ms) { clearInterval(iv); const v = s.filter((x) => x > 0); resolve(+(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)); }
    }, 200);
  });
}, ms);
const avg = (a) => +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log("\n--- fps A/B (Canvas, interleaved) ---");
const fpsAB = {};
for (const name of ["1-3", "2-2"]) {
  await startLevel(L[name]);
  await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); g.updateCamera = g._origUpdateCamera || g.updateCamera; });
  await sleep(1400);
  const ons = [], offs = [];
  for (let r = 0; r < 3; r++) {
    await setAnim(true); ons.push(await sampleFps(1600));
    await setAnim(false); offs.push(await sampleFps(1600));
  }
  await setAnim(true);
  const on = avg(ons), offv = avg(offs), d = +(on - offv).toFixed(1);
  fpsAB[name] = { on, off: offv, delta: d, ons, offs };
  console.log(`${name}: anim-ON ${on} fps  |  anim-OFF ${offv} fps  |  delta ${d} fps  (ON ${JSON.stringify(ons)} OFF ${JSON.stringify(offs)})`);
  ok(Math.abs(d) <= 2.5, `${name} A10 social-anim cost is ~flat (|delta| <= 2.5 fps, incl. Canvas thermal noise)`, `delta=${d} fps`);
}

await cBrowser.close();
console.log(errors ? `\nCanvas tier snapped with ${errors} page error(s)` : "\nCanvas tier snapped clean (0 page errors)");
if (errors) fails.push(`${errors} Canvas page error(s)`);
console.log("\nfps A/B summary: " + JSON.stringify(fpsAB));
if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL A10 ASSERTIONS PASSED");
