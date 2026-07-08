// ANIM A4 — Player action & death set: acceptance probe + BURST-SHOT CONTACT SHEETS.
//
// A4 adds the event-driven ACTION overlays + the death/respawn upgrade on the A1
// rig (A2 locomotion + A3 idle/wait underneath). Every action anim is a pure VISUAL
// overlay on instant game logic — logic first, motion after; physics + timing sacred:
//   ZIP    — reach-out arm glyph aimed at the anchor + body STRETCH; hang at arrival.
//   STOMP  — mid-air tuck windup, impact splay + antenna boing (on heavyImpact).
//   CARRY  — carrier leans back; carried buddy arms-up antenna wobble.
//   THROW  — windup lean -> follow-through; high-toss adds a squat.
//   EQUIP  — badge pops onto the head + a flash + a one-beat "tries on" pose.
//   PHASE  — horizontal shimmer elongation while inside a phase wall.
//   DEATH  — 5 pooled DRAWN parts scatter with the boom; the respawn beam pulls them
//            back to the checkpoint and snaps them in (parts pooled, <=2 deaths' worth).
//
// This probe:
//   1. CONTACT SHEETS -> tools/shots/p2/: a4-zip a4-stomp a4-carry a4-throw a4-equip
//      a4-phase a4-death a4-respawn.
//   2. DEATH/RESPAWN TIMING + POSITION unchanged vs baseline (anim ON == anim OFF ==
//      the checkpoint tile, ~900ms) — the beat guard.
//   3. DEATH PARTS pooled + capped: drive 2 real deaths + rapid scatter() calls,
//      assert alive parts <= cap.
//   4. VELOCITIES unchanged: zip/throw/stomp body velocity is identical anim ON vs OFF
//      (overlays never touch the body).
//   5. BODY WORLD-BOX byte-identical during the action scale poses (zip stretch, phase
//      elongation, stomp splay, throw squat) — physics sacred.
//   6. 0 page errors, Canvas tier.
//   7. fps A/B (Canvas) 1-1 + 2-2, anim ON vs OFF within ~2 fps.
//
//   node tools/snap_p2_a4.mjs
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

const startLevel = async (idx) => {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Game"); m.stop("Title"); m.stop("Onboard"); m.stop("Hub");
    m.start("Game", { levelIndex: i });
  }, idx);
  await page.waitForFunction(() => {
    const g = window.__BB.game.scene.getScene("Game");
    return !!(g && g.def && g.players && g.players.length === 2 && g.anim &&
      window.__BB.game.scene.isActive("Game"));
  }, null, { timeout: 8000 });
  await sleep(1400);
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    g._origUpdateCamera = g.updateCamera;
    g.updateCamera = () => {};
  });
};
const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);
const setAnim = (on) => page.evaluate((v) => { window.__BB.game.scene.getScene("Game").anim.enabled = v; }, on);
const setSched = (on) => page.evaluate((v) => { window.__BB.game.scene.getScene("Game").anim.fidget.enabled = v; }, on);
const setSkill0 = (s) => page.evaluate((s) => { window.__BB.game.scene.getScene("Game").players[0].setSkill(s); }, s);

const SOLID_X = 480;
const ZOOM = 2.4;
const settleP0 = (x = SOLID_X) => page.evaluate(async (x) => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0];
  ["left", "right", "jump", "act", "down"].forEach((k) => { if (p.keys[k]) p.keys[k].isDown = false; });
  p.invuln = 0; p.setPosition(x, p.y); p.setVelocity(0, 0);
  await new Promise((res) => { let n = 0; const iv = setInterval(() => { if (p.grounded || ++n > 70) { clearInterval(iv); res(); } }, 30); });
  await new Promise((r) => setTimeout(r, 300));
  return { grounded: p.grounded, y: Math.round(p.y) };
}, x);

const framePlayer = () => page.evaluate((z) => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0]; const cam = g.cameras.main;
  cam.setZoom(z); cam.centerOn(p.x, p.y - 8);
}, ZOOM);
const frameAt = (x, y, z) => page.evaluate(([x, y, z]) => {
  const cam = window.__BB.game.scene.getScene("Game").cameras.main;
  cam.setZoom(z); cam.centerOn(x, y);
}, [x, y, z]);
const framePair = (z) => page.evaluate((z) => {
  const g = window.__BB.game.scene.getScene("Game");
  const a = g.players[0], b = g.players[1]; const cam = g.cameras.main;
  cam.setZoom(z); cam.centerOn((a.x + b.x) / 2, (a.y + b.y) / 2 - 6);
}, z);
const soloClip = { x: 640 - 100, y: 360 - 130, width: 200, height: 260 };
const wideClip = { x: 640 - 150, y: 360 - 130, width: 300, height: 260 };
const grab = async (clip, framer) => { if (framer) await framer(); const buf = await page.screenshot({ clip }); return buf.toString("base64"); };
const strip = async (name, frames, label, w = 190, h = 220) => {
  const imgs = frames.map((f) => `<img src="data:image/png;base64,${f}" style="display:block;width:${w}px;height:${h}px;border-radius:6px">`).join("");
  const html = `<body style="margin:0"><div style="display:inline-flex;flex-direction:column;gap:6px;background:#0a0f1e;padding:10px;font-family:monospace">`
    + `<div style="color:#8fa3d9;font-size:13px">A4 · ${label}</div>`
    + `<div style="display:inline-flex;gap:6px">${imgs}</div></div></body>`;
  const p2 = await ctx.newPage();
  await p2.setContent(html);
  const el = await p2.$("div");
  await el.screenshot({ path: `${SHOTS}/${name}.png` });
  await p2.close();
  console.log(`contact sheet -> ${SHOTS}/${name}.png`);
};

// freeze a timed action (throw / stompland / equip) at progress `frac` for a clean frame.
const actHold = (type, frac, dir, hi) => page.evaluate(([type, frac, dir, hi]) => {
  const g = window.__BB.game.scene.getScene("Game");
  const rig = g.anim.rigFor(g.players[0]);
  const DUR = { throw: 360, stompland: 520, equip: 520 };
  const a = rig._act;
  a.type = type; a.dur = DUR[type]; a.t = frac * a.dur; a.dir = dir || 1; a.hi = !!hi; a.active = true;
}, [type, frac, dir, hi]);

await startLevel(0);
ok(await active("Game"), "1-1 Game scene active");
ok(!(await page.evaluate(() => window.__BB.game.renderer.type === 2)), "running on the Canvas tier (?canvas=1)");
await setSched(false); // deterministic: no idle fidget interference during captures

// ============================================================================
// CONTACT SHEET: ZIP — reach-out arm aimed at the anchor + body stretch; hang.
// ============================================================================
{
  await setSkill0("grapple");
  await settleP0();
  // real zip flight toward an open-air point above; updateZip drives the physics,
  // the rig reads host.zip and reaches/stretches. Then force the hang pose.
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const p = g.players[0];
    p.setPosition(480, p.y); p.invuln = 0;
    p.beginZip(480, p.y - 150, true); // anchor straight up
  });
  const f = [];
  for (let i = 0; i < 3; i++) { await sleep(80); f.push(await grab(soloClip, framePlayer)); } // flight (reach + stretch)
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const p = g.players[0];
    if (p.zip) { p.zip.arrived = true; p.setPosition(p.zip.x, p.zip.y + 44); p.setVelocity(0, 0); }
  });
  for (let i = 0; i < 2; i++) { await sleep(120); f.push(await grab(soloClip, framePlayer)); } // hang
  await page.evaluate(() => { const p = window.__BB.game.scene.getScene("Game").players[0]; p.endZip(); p.setVelocity(0, 0); });
  await strip("a4-zip", f, "ZIP — reach-out arm glyph at the anchor + body STRETCH (flight) -> hang");
}

// ============================================================================
// CONTACT SHEET: STOMP — mid-air tuck windup -> impact splay + antenna boing.
// ============================================================================
{
  await setSkill0("heavy");
  await settleP0();
  // tuck: airborne + stomping (startStomp drives the dive; rig reads p.stomping)
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const p = g.players[0];
    p.setPosition(480, p.y - 80); p.body.setAllowGravity(true); p.startStomp();
  });
  const f = [];
  for (let i = 0; i < 2; i++) { await sleep(70); f.push(await grab(soloClip, framePlayer)); } // tuck
  // splay + boing (grounded), frozen at rise/decay fracs
  await settleP0();
  for (const frac of [0.02, 0.1, 0.24, 0.5]) { await actHold("stompland", frac, 1); await sleep(45); f.push(await grab(soloClip, framePlayer)); }
  await strip("a4-stomp", f, "STOMP — mid-air tuck (x2) -> impact splay + antenna boing", 150, 220);
}

// ============================================================================
// CONTACT SHEET: CARRY — carrier leans back; carried buddy arms-up wobble.
// ============================================================================
{
  await page.evaluate(async () => {
    const g = window.__BB.game.scene.getScene("Game");
    const a = g.players[0], b = g.players[1];
    a.setSkill("heavy"); b.setSkill("tiny");
    a.invuln = 0; b.invuln = 0;
    a.setPosition(470, a.y); b.setPosition(470, a.y);
    [a, b].forEach((p) => { p.setVelocity(0, 0); ["left", "right", "jump"].forEach((k) => p.keys[k] && (p.keys[k].isDown = false)); });
    await new Promise((res) => { let n = 0; const iv = setInterval(() => { if (a.grounded || ++n > 70) { clearInterval(iv); res(); } }, 30); });
    await new Promise((r) => setTimeout(r, 300));
    a.setPosition(b.x, b.y); g.pickupPartner(a, b); // real pickup
  });
  const f = [];
  for (let i = 0; i < 4; i++) { await sleep(160); f.push(await grab(soloClip, framePlayer)); } // carrier framed; wobble over ~0.6s
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    if (g.players[0].carrying) g.detachCarry(g.players[0], g.players[0].carrying, false);
  });
  await strip("a4-carry", f, "CARRY — carrier (heavy) leans back; carried buddy (tiny) arms-up wobble");
}

// ============================================================================
// CONTACT SHEET: THROW — windup lean -> follow-through; + high-toss squat.
// ============================================================================
{
  await setSkill0("grapple");
  await settleP0();
  await page.evaluate(() => { const p = window.__BB.game.scene.getScene("Game").players[0]; p.facing = 1; p.setFlipX(false); });
  const f = [];
  await actHold("throw", 0.2, 1, true); await sleep(45); f.push(await grab(soloClip, framePlayer)); // high-toss squat
  for (const frac of [0.14, 0.34, 0.55, 0.78]) { await actHold("throw", frac, 1, false); await sleep(45); f.push(await grab(soloClip, framePlayer)); }
  await page.evaluate(() => { const rig = window.__BB.game.scene.getScene("Game").anim.rigFor(window.__BB.game.scene.getScene("Game").players[0]); rig._act.active = false; });
  await strip("a4-throw", f, "THROW — high-toss squat, then windup lean -> follow-through", 150, 220);
}

// ============================================================================
// CONTACT SHEET: EQUIP — badge pop + head flash + one-beat "tries on" pose.
// ============================================================================
{
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const p = g.players[0];
    p.skill = null; if (p.badge) { p.badge.destroy(); p.badge = null; }
    p.setPosition(480, p.y); p.invuln = 0;
  });
  await settleP0();
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const p = g.players[0];
    p.setSkill("phase"); const rig = g.anim.rigFor(p); rig.startEquip();
  });
  const f = [];
  for (let i = 0; i < 5; i++) { f.push(await grab(soloClip, framePlayer)); await sleep(85); } // flash + pop + pose, live
  await strip("a4-equip", f, "EQUIP — badge pop + head flash + one-beat 'tries on' pose");
}

// ============================================================================
// CONTACT SHEET: PHASE — horizontal shimmer elongation inside a phase wall.
// ============================================================================
{
  await setSkill0("phase");
  await settleP0();
  // scope a tileAt override to the player's own cell so update() naturally sets
  // p.inPhaseWall = true (the rig reads it and elongates). Restored right after.
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const p = g.players[0];
    g._origTileAt = g.tileAt.bind(g);
    g.tileAt = (x, y) => (Math.abs(x - p.x) < 30 && Math.abs(y - p.y) < 44) ? "~" : g._origTileAt(x, y);
  });
  const f = [];
  for (let i = 0; i < 4; i++) { await sleep(120); f.push(await grab(soloClip, framePlayer)); }
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    g.tileAt = g._origTileAt; const p = g.players[0]; p.inPhaseWall = false; p.setAlpha(1);
  });
  await strip("a4-phase", f, "PHASE — horizontal shimmer elongation while inside a phase wall");
}

// ============================================================================
// CONTACT SHEET: DEATH — pooled parts scatter with the boom.
// ============================================================================
await setAnim(true);
{
  await setSkill0("grapple");
  await settleP0();
  const dz = await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const p = g.players[0]; p.invuln = 0;
    g.killPlayer(p);
    return { x: p.x, y: p.y };
  });
  const f = [];
  for (const t of [110, 260, 430, 640]) { await frameAt(dz.x, dz.y - 8, ZOOM); const buf = await page.screenshot({ clip: soloClip }); f.push(buf.toString("base64")); await sleep(t - (f.length > 1 ? [110, 260, 430, 640][f.length - 2] : 0)); }
  await strip("a4-death", f, "DEATH — 5 pooled DRAWN parts (visor/antenna/tread/plate/bolt) scatter with the boom");
  await page.waitForFunction(() => !window.__BB.game.scene.getScene("Game").players[0].dead, null, { timeout: 3000 });
  await sleep(400);
}

// ============================================================================
// CONTACT SHEET: RESPAWN — the beam pulls the parts back + snaps them in.
// ============================================================================
{
  await settleP0();
  const cp = await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const p = g.players[0]; p.invuln = 0;
    const c = g.cpPos[p.idx];
    g.killPlayer(p);
    return { x: c.x, y: c.y };
  });
  await sleep(905); // respawn + reassemble fire at ~900ms
  const f = [];
  for (let i = 0; i < 4; i++) { await frameAt(cp.x, cp.y - 8, ZOOM); const buf = await page.screenshot({ clip: soloClip }); f.push(buf.toString("base64")); await sleep(90); }
  await strip("a4-respawn", f, "RESPAWN — the beam gathers the scattered parts to the checkpoint + snaps them in");
  await page.waitForFunction(() => !window.__BB.game.scene.getScene("Game").players[0].dead, null, { timeout: 3000 });
  await sleep(300);
}

// ============================================================================
// 2. DEATH/RESPAWN TIMING + POSITION unchanged vs baseline (the beat guard).
// ============================================================================
const measureDeath = async (withAnim) => {
  await setAnim(withAnim);
  await settleP0();
  return await page.evaluate(async () => {
    const g = window.__BB.game.scene.getScene("Game");
    const p = g.players[0]; p.invuln = 0;
    const cp = g.cpPos[p.idx];
    // measure in the SCENE clock (frame-stepped, the same clock the respawn's
    // delayedCall(900) uses) so the elapsed is immune to headless wall-clock jitter.
    const t0 = g.time.now;
    g.killPlayer(p);
    await new Promise((res) => { const iv = setInterval(() => { if (!p.dead) { clearInterval(iv); res(); } }, 8); });
    const elapsed = g.time.now - t0;
    // then let gravity settle the robot to its RESTING pose on the checkpoint tile —
    // the deterministic final position the beat routes land on.
    await new Promise((res) => { let n = 0; const iv = setInterval(() => { if (p.grounded || ++n > 70) { clearInterval(iv); res(); } }, 20); });
    await new Promise((r) => setTimeout(r, 250));
    return { elapsed: Math.round(elapsed), x: Math.round(p.x), y: Math.round(p.y), cpx: Math.round(cp.x) };
  });
};
const dOn = await measureDeath(true);
await page.waitForFunction(() => !window.__BB.game.scene.getScene("Game").players[0].dead, null, { timeout: 3000 }); await sleep(200);
const dOff = await measureDeath(false);
await page.waitForFunction(() => !window.__BB.game.scene.getScene("Game").players[0].dead, null, { timeout: 3000 }); await sleep(200);
await setAnim(true);
ok(Math.abs(dOn.elapsed - 900) <= 40 && Math.abs(dOff.elapsed - 900) <= 40,
  "respawn TIMING is ~900ms (scene clock) with anim ON and OFF (scatter/reassembly is timing-neutral)", `ON=${dOn.elapsed}ms OFF=${dOff.elapsed}ms`);
ok(dOn.x === dOff.x && dOn.y === dOff.y && dOn.x === dOn.cpx,
  "respawn RESTING POSITION is the checkpoint tile, identical anim ON vs OFF (the beat routes are safe)",
  `ON=(${dOn.x},${dOn.y}) OFF=(${dOff.x},${dOff.y}) cpx=${dOn.cpx}`);

// ============================================================================
// 3. DEATH PARTS pooled + capped (<= 2 deaths' worth alive).
// ============================================================================
const cap = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const ds = g.anim.deathScatter;
  const pool = ds.pool.length;
  // two REAL concurrent deaths (both buddies), then measure alive parts
  const a = g.players[0], b = g.players[1];
  a.invuln = 0; b.invuln = 0;
  g.killPlayer(a); g.killPlayer(b);
  await new Promise((r) => setTimeout(r, 60));
  const twoDeaths = ds.aliveCount();
  // hammer scatter() many times rapidly — the ring pool must still cap the alive set
  for (let i = 0; i < 6; i++) ds.scatter(a);
  const hammered = ds.aliveCount();
  return { pool, twoDeaths, hammered };
});
ok(cap.pool === 10, "death parts are POOLED (fixed pool = 5 parts x 2 deaths = 10)", `pool=${cap.pool}`);
ok(cap.twoDeaths > 0 && cap.twoDeaths <= cap.pool, "two concurrent deaths keep alive parts within the cap", `alive=${cap.twoDeaths}/${cap.pool}`);
ok(cap.hammered <= cap.pool, "rapid repeated scatters NEVER exceed the cap (ring pool recycles the oldest)", `alive=${cap.hammered}/${cap.pool}`);
await page.waitForFunction(() => { const g = window.__BB.game.scene.getScene("Game"); return !g.players[0].dead && !g.players[1].dead; }, null, { timeout: 4000 });
await sleep(300);

// ============================================================================
// 4. VELOCITIES unchanged: zip / throw / stomp are identical anim ON vs OFF.
// ============================================================================
const zipVel = async (withAnim) => { await setAnim(withAnim); return await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0]; p.clearStates(); p.setSkill("grapple"); p.invuln = 0; p.setPosition(480, 300); p.setVelocity(0, 0);
  p.beginZip(480, 120, true); // straight-up anchor, far (keeps flying)
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  const v = { vx: Math.round(p.body.velocity.x), vy: Math.round(p.body.velocity.y), spd: Math.round(Math.hypot(p.body.velocity.x, p.body.velocity.y)) };
  p.endZip(); p.setVelocity(0, 0);
  return v;
}); };
const zOn = await zipVel(true), zOff = await zipVel(false);
ok(zOn.spd === zOff.spd && zOn.vy === zOff.vy && zOn.spd > 0, "ZIP flight velocity is identical anim ON vs OFF (reach/stretch overlay never touches it)", `ON=${JSON.stringify(zOn)} OFF=${JSON.stringify(zOff)}`);

const stompVel = async (withAnim) => { await setAnim(withAnim); return await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0]; p.clearStates(); p.setSkill("heavy"); p.invuln = 0; p.setPosition(480, 260); p.setVelocity(30, 0);
  p.startStomp();
  const v = { vx: Math.round(p.body.velocity.x), vy: Math.round(p.body.velocity.y) };
  p.stomping = false; p.setVelocity(0, 0);
  return v;
}); };
const sOn = await stompVel(true), sOff = await stompVel(false);
ok(sOn.vy === sOff.vy && sOn.vx === sOff.vx && sOn.vy === 980, "STOMP dive velocity is identical anim ON vs OFF (tuck overlay never touches it)", `ON=${JSON.stringify(sOn)} OFF=${JSON.stringify(sOff)}`);

const throwVel = async (withAnim) => { await setAnim(withAnim); return await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const a = g.players[0], b = g.players[1];
  a.clearStates(); b.clearStates(); a.setSkill("grapple"); b.setSkill("tiny");
  a.invuln = 0; b.invuln = 0; a.facing = 1; a.setFlipX(false);
  a.setPosition(480, 300); b.setPosition(480, 300);
  await new Promise((res) => { let n = 0; const iv = setInterval(() => { if (a.grounded || ++n > 60) { clearInterval(iv); res(); } }, 30); });
  a.setPosition(b.x, b.y); g.pickupPartner(a, b);
  a.keys.jump.isDown = false; if (a.pad) a.pad.jump.isDown = false;
  g.throwPartner(a); // plain throw
  const v = { vx: Math.round(b.body.velocity.x), vy: Math.round(b.body.velocity.y) };
  return v;
}); };
const tOn = await throwVel(true), tOff = await throwVel(false);
await sleep(300);
ok(tOn.vx === tOff.vx && tOn.vy === tOff.vy && tOn.vx !== 0, "THROW launch velocity is identical anim ON vs OFF (windup/follow overlay never touches it)", `ON=${JSON.stringify(tOn)} OFF=${JSON.stringify(tOff)}`);
await setAnim(true);

// ============================================================================
// 5. BODY WORLD-BOX byte-identical during the action scale poses (physics sacred).
// ============================================================================
const invariance = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0]; const b = p.body;
  p.clearStates(); p.setSkill("heavy"); p.setVelocity(0, 0); if (p._sqTween) p._sqTween.stop(); p.sqX = 1; p.sqY = 1;
  const snap = () => { b.updateFromGameObject(); return { x: +b.x.toFixed(3), y: +b.y.toFixed(3), w: +b.width.toFixed(3), h: +b.height.toFixed(3), cx: +b.center.x.toFixed(3), cy: +b.center.y.toFixed(3) }; };
  p.applyLocomotion(0, 0, 1, 1); const N = snap();
  const cases = {
    zipStretch: [0, 8, 0.87, 1.17],   // reach flight stretch
    phaseElong: [0, 0, 1.16, 0.93],   // horizontal shimmer elongation
    stompSplay: [2.4, 0, 1.20, 0.83], // impact splay
    throwSquat: [4, -11, 1.09, 0.87], // high-toss squat + lean
  };
  const out = {};
  const same = (a, c) => a.x === c.x && a.y === c.y && a.w === c.w && a.h === c.h && a.cx === c.cx && a.cy === c.cy;
  for (const k in cases) { const [bob, lean, sx, sy] = cases[k]; p.applyLocomotion(bob, lean, sx, sy); out[k] = same(N, snap()); }
  p.applyLocomotion(0, 0, 1, 1);
  return { N, out };
});
for (const k of Object.keys(invariance.out)) {
  ok(invariance.out[k], `BODY WORLD-BOX byte-identical under the ${k} action scale pose (routed through applyLocomotion/_syncBody)`, `N=${JSON.stringify(invariance.N)}`);
}

// ============================================================================
// 7. fps A/B (Canvas) — 1-1 + 2-2, anim ON vs OFF, ~flat (interleaved windows).
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
for (const [name, idx] of [["1-1", 0], ["2-2", 4]]) {
  await startLevel(idx);
  await sleep(1500);
  const ons = [], offs = [];
  for (let r = 0; r < 3; r++) {
    await setAnim(true); ons.push(await sampleFps(1600));
    await setAnim(false); offs.push(await sampleFps(1600));
  }
  await setAnim(true);
  const on = avg(ons), off = avg(offs), d = +(on - off).toFixed(1);
  fpsAB[name] = { on, off, delta: d, ons, offs };
  console.log(`${name}: anim-ON ${on} fps  |  anim-OFF ${off} fps  |  delta ${d} fps  (ON ${JSON.stringify(ons)} OFF ${JSON.stringify(offs)})`);
  ok(Math.abs(d) <= 2.5, `${name} A4 anim cost is ~flat (|delta| <= 2.5 fps, incl. Canvas thermal noise)`, `delta=${d} fps`);
}

await cBrowser.close();
console.log(errors ? `\nCanvas tier snapped with ${errors} page error(s)` : "\nCanvas tier snapped clean (0 page errors)");
if (errors) fails.push(`${errors} Canvas page error(s)`);
console.log("\nfps A/B summary: " + JSON.stringify(fpsAB));
if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL A4 ASSERTIONS PASSED");
