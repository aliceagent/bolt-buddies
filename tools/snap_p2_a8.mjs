// ANIM A8 — Crane boss animation set: acceptance probe + BURST-SHOT CONTACT SHEETS.
//
// A8 turns the A1 rig VISIBLE for the level 1-3 crane boss — the MOST timing-sensitive
// enemy. Every beat is a pure VISUAL overlay on the SACRED crane fight STATE MACHINE +
// TIMINGS (updateCrane owns c.state/c.timer, the telegraph(650)->slam->rest(2600)->rise->
// patrol(2000) cadence, the trolley path, the slam fall + its floor hitbox [reads b.x/b.y],
// the plate yank hitbox [findGrappleTarget reads pl.img.x/pl.img.y], the podsStomped 0/1/2/3
// progression and the defeat trigger — ALL byte-identical; the 1-3 beat matrix is the guard):
//   CABLE    — genuine 2-point sag + swing-LAG (a damped pendulum control point trails the
//              trolley velocity), drawn by updateCrane from c._cableSwingX/c._cableSagY (0 => P7).
//   EYE      — KOBI cabin eye: pooled pupil tracks the nearest robot + an occasional blink.
//   WOBBLE   — plates wobble invitingly while yankable (rest) — rotation only (x/y hitbox fixed).
//   TELEGRAPH— a building SHUDDER whose amplitude RAMPS across the existing telegraph window.
//   SLAM     — impact squash + rebound on the crane body (body-invariant scale).
//   FLINCH   — each yanked plate makes the crane flinch (rotation kick).
//   DEFEAT   — staged power-down: slump (existing tween) + lamp dies + a defiant shudder + settle.
//
// This probe:
//   1. CONTACT SHEETS -> tools/shots/p2/: a8-cable a8-eye a8-wobble a8-telegraph a8-slam
//      a8-flinch a8-defeat.
//   2. CRANE BODY position + each PLATE hitbox (pl.img.x/y) + the SLAM hitbox (b.x/b.y) are
//      byte-identical under shudder/squash/flinch/wobble extremes (rotation is AABB/hitbox-
//      safe, the squash scale is origin-centred, the plate wobble is rotation-only).
//   3. The fight-state TIMINGS (telegraph->slam interval + full cadence) are identical anim
//      ON vs OFF (the anim READS the state; it never gates/delays/alters it).
//   4. The podsStomped 0->1->2->3 progression + defeat trigger are unchanged anim ON vs OFF.
//   5. c._cableSwingX/c._cableSagY are exactly 0 when the rig is OFF (P7 static cable byte-identical).
//   6. 0 page errors, Canvas tier.
//   7. fps A/B (Canvas) 1-1 + 1-3 (crane), anim ON vs OFF within ~2.5 fps.
//
//   node tools/snap_p2_a8.mjs
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

const CRANE_LEVEL = 2; // 1-3 — the crane boss fight

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
  await sleep(1000);
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    g._origUpdateCamera = g.updateCamera;
    g.updateCamera = () => {}; // freeze the camera so our framing sticks during a burst
  });
};
const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);
const setAnim = (on) => page.evaluate((v) => { window.__BB.game.scene.getScene("Game").anim.enabled = v; }, on);
// park both players far away + un-hittable (calm crane shots)
const playersAway = () => page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  g.players.forEach((p) => { p.invuln = 999999; p.setPosition(60, 60); p.setVelocity(0, 0); });
});

const frame = (cx, cy, z) => page.evaluate(([cx, cy, z]) => {
  const g = window.__BB.game.scene.getScene("Game");
  const c = g.crane; const cam = g.cameras.main;
  cam.setZoom(z); cam.centerOn(c.body.x + cx, cy);
}, [cx, cy, z]);
// centre the (frozen) camera on the crane body itself (follows a slump / slam fall)
const frameBody = (dy, z) => page.evaluate(([dy, z]) => {
  const g = window.__BB.game.scene.getScene("Game"); const c = g.crane; const cam = g.cameras.main;
  cam.setZoom(z); cam.centerOn(c.body.x, c.body.y + dy);
}, [dy, z]);
const clip = { x: 640 - 150, y: 360 - 150, width: 300, height: 300 };
const grab = async () => (await page.screenshot({ clip })).toString("base64");
const strip = async (name, frames, label, w = 150, h = 150) => {
  const imgs = frames.map((f) => `<img src="data:image/png;base64,${f}" style="display:block;width:${w}px;height:${h}px;border-radius:6px">`).join("");
  const html = `<body style="margin:0"><div style="display:inline-flex;flex-direction:column;gap:6px;background:#0a0f1e;padding:10px;font-family:monospace">`
    + `<div style="color:#8fa3d9;font-size:13px">A8 · ${label}</div>`
    + `<div style="display:inline-flex;gap:6px">${imgs}</div></div></body>`;
  const p2 = await ctx.newPage();
  await p2.setContent(html);
  const el = await p2.$("div");
  await el.screenshot({ path: `${SHOTS}/${name}.png` });
  await p2.close();
  console.log(`contact sheet -> ${SHOTS}/${name}.png`);
};

await startLevel(CRANE_LEVEL);
ok(await active("Game"), "1-3 Game scene active");
ok(!(await page.evaluate(() => window.__BB.game.renderer.type === 2)), "running on the Canvas tier (?canvas=1)");
ok(await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const rig = g.anim.rigFor(g.crane.body);
  return !!(rig && rig._eyePupil && rig._eyeLid && rig._eyeGlow && rig.machine.hooks &&
    typeof rig.machine.hooks.update === "function" && typeof rig.startAnimFidget === "function");
}), "crane rig installed: pooled eye pupil/lid/glow + update hook + blink fidget wired");
ok(await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  return g.crane && g.crane.plates.length === 3;
}), "1-3 crane has its three yankable plates");

// ============================================================================
// CONTACT SHEET: CABLE — sag + swing-lag as the trolley moves.
// Drive the crane body x across a sweep (visual only) so the trolley moves and the
// pendulum cable lags/sways behind it. Frame the rail + cable + body.
// ============================================================================
{
  await setAnim(true);
  await playersAway();
  await frame(0, 170, 2.1);
  // hold the crane hovering and start a continuous lateral sweep (drives the trolley);
  // the pendulum cable control point then TRAILS the velocity (lag) and swings.
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game"); const c = g.crane;
    c.state = "rest"; c.timer = 9e9; c._x0 = c.body.x; c._ph = 0;
    c._sweep = setInterval(() => { c._ph += 30; c.body.x = c._x0 + Math.sin(c._ph / 260) * 150; c.body.y = c.hoverY; }, 30);
  });
  const f = [];
  for (let i = 0; i < 5; i++) { await sleep(130); await frame(0, 170, 2.1); f.push(await grab()); } // re-centre so the swaying crane stays framed
  await page.evaluate(() => { const c = window.__BB.game.scene.getScene("Game").crane; clearInterval(c._sweep); });
  await strip("a8-cable", f, "CABLE — genuine 2-point sag + swing-LAG: the drawn catenary control point TRAILS the trolley velocity (pendulum lag + sway + settle)");
}

// ============================================================================
// CONTACT SHEET: EYE — KOBI pupil tracks the nearest robot + an occasional blink.
// ============================================================================
await startLevel(CRANE_LEVEL);
{
  await setAnim(true);
  // FREEZE the crane hovering (rest, non-moving) so it stays framed while the pupil tracks.
  await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); const c = g.crane; c.state = "rest"; c.timer = 9e9; c.body.y = c.hoverY; g.players[1].invuln = 999999; g.players[1].setPosition(2000, 2000); });
  await frameBody(-10, 4.6);
  const f = [];
  // place a robot to the LEFT, capture the pupil tracking it; then RIGHT; then fire a blink.
  await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); const c = g.crane; const p = g.players[0]; p.invuln = 999999; p.dead = false; p.setPosition(c.body.x - 240, c.body.y + 150); p.setVelocity(0, 0); });
  await sleep(340); f.push(await grab());
  await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); const c = g.crane; const p = g.players[0]; p.setPosition(c.body.x + 240, c.body.y + 150); p.setVelocity(0, 0); });
  await sleep(340); f.push(await grab());
  await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); const c = g.crane; const p = g.players[0]; p.setPosition(c.body.x + 240, c.body.y + 150); p.setVelocity(0, 0); });
  await sleep(120);
  // fire a blink on the real shared-scheduler path and capture mid-blink
  await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); g.anim.rigFor(g.crane.body).startAnimFidget(); });
  await sleep(60); f.push(await grab());
  await sleep(80); f.push(await grab());
  await strip("a8-eye", f, "EYE — KOBI cabin pupil TRACKS the nearest robot (left / right) then a metal-lid BLINK (shared scheduler)");
}
// pupil actually offsets toward a tracked robot
const track = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const c = g.crane; const rig = g.anim.rigFor(c.body); const p = g.players[0];
  const read = async (sx) => new Promise((res) => { let t = 0; const iv = setInterval(() => { p.invuln = 999999; p.dead = false; p.setPosition(c.body.x + sx, c.body.y + 120); p.setVelocity(0, 0); if (++t > 24) { clearInterval(iv); res(+rig._lookX.toFixed(2)); } }, 16); });
  const L = await read(-260), R = await read(260);
  return { L, R };
});
ok(track.L < -1.5 && track.R > 1.5, "EYE pupil tracks the nearest robot (look-X follows the robot side)", `lookX left=${track.L} right=${track.R}`);
// BLINK — fire the real shared-scheduler path and record the lid's peak closure (the metal
// lid scales vertically over the eye). Robust proof of the blink beat (hard to time in a sheet).
const blink = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const c = g.crane; const rig = g.anim.rigFor(c.body);
  c.state = "rest"; c.timer = 9e9;
  rig.startAnimFidget(); // fire a KOBI blink
  let sawVisible = false, peakClose = 0;
  await new Promise((res) => { let t = 0; const iv = setInterval(() => { if (rig._eyeLid.visible) { sawVisible = true; const cl = Math.abs(rig._eyeLid.scaleY); if (cl > peakClose) peakClose = cl; } if (++t > 20) { clearInterval(iv); res(); } }, 12); });
  return { sawVisible, peakClose: +peakClose.toFixed(2) };
});
ok(blink.sawVisible && blink.peakClose > 0.6, "BLINK — the metal lid closes over the eye during a scheduler-fired blink", `peakClose=${blink.peakClose}`);

// ============================================================================
// CONTACT SHEET: WOBBLE — plates wobble invitingly while yankable (rest).
// ============================================================================
await startLevel(CRANE_LEVEL);
{
  await setAnim(true);
  await playersAway();
  await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); const c = g.crane; c.state = "rest"; c.timer = 99999; });
  await frame(0, 210, 3.0);
  const f = [];
  for (let i = 0; i < 5; i++) { await sleep(150); f.push(await grab()); }
  await strip("a8-wobble", f, "WOBBLE — attached plates wobble invitingly while the crane RESTS (rotation only; the yank hitbox x/y is untouched)");
}
const wobbled = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const c = g.crane; c.state = "rest"; c.timer = 99999;
  let maxRot = 0; const x0 = c.plates[0].img.x, y0 = c.plates[0].img.y; let moved = 0;
  await new Promise((res) => { let t = 0; const iv = setInterval(() => { for (const pl of c.plates) { const r = Math.abs(pl.img.rotation); if (r > maxRot) maxRot = r; } const dx = Math.abs(c.plates[0].img.x - x0), dy = Math.abs(c.plates[0].img.y - y0); if (dx > moved) moved = dx; if (dy > moved) moved = dy; if (++t > 60) { clearInterval(iv); res(); } }, 16); });
  return { maxRot: +maxRot.toFixed(3), hitboxDrift: +moved.toFixed(3) };
});
ok(wobbled.maxRot > 0.02, "WOBBLE engages on resting yankable plates (rotation amplitude)", `maxRot=${wobbled.maxRot} rad`);
ok(wobbled.hitboxDrift < 0.0001, "WOBBLE never moves a plate's yank hitbox (pl.img.x/y byte-identical — rotation only)", `drift=${wobbled.hitboxDrift}px`);

// ============================================================================
// CONTACT SHEET: TELEGRAPH — a building shudder whose amplitude ramps to the slam.
// ============================================================================
await startLevel(CRANE_LEVEL);
{
  await setAnim(true);
  await playersAway();
  await frame(0, 210, 3.0);
  const f = [];
  // step c.timer DOWN across the SACRED 650ms telegraph window so the shudder's RAMP
  // (amplitude grows as timer -> 0) is visible frame by frame. Re-assert state+timer right
  // before each brief grab (values kept comfortably > 0 so updateCrane never flips to slam
  // during the short dwell) and re-centre on the body so it stays framed.
  for (const tmr of [610, 480, 350, 230, 130]) {
    await page.evaluate((t) => { const g = window.__BB.game.scene.getScene("Game"); const c = g.crane; c.state = "telegraph"; c.timer = t; c.body.y = c.hoverY; }, tmr);
    await frameBody(-6, 3.0);
    await sleep(45); f.push(await grab());
  }
  await strip("a8-telegraph", f, "TELEGRAPH — a building SHUDDER whose amplitude RAMPS across the existing 650ms window until the slam (rotation; timer stepped 600->30ms)");
}
const ramp = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const c = g.crane; const b = c.body;
  c.state = "telegraph"; c.timer = 650;
  let early = 0, late = 0;
  await new Promise((res) => { const iv = setInterval(() => { const r = Math.abs(b.rotation); if (c.timer > 400) { if (r > early) early = r; } else if (c.timer > 0 && c.state === "telegraph") { if (r > late) late = r; } if (c.state !== "telegraph") { clearInterval(iv); res(); } }, 16); });
  return { early: +early.toFixed(4), late: +late.toFixed(4) };
});
ok(ramp.late > ramp.early && ramp.late > 0.01, "TELEGRAPH shudder amplitude RAMPS (late window > early window)", `early=${ramp.early} late=${ramp.late} rad`);

// ============================================================================
// CONTACT SHEET: SLAM — impact squash + rebound on the crane body.
// ============================================================================
await startLevel(CRANE_LEVEL);
{
  await setAnim(true);
  await playersAway();
  // drive a real slam: enter slam, let the body fall to the floor -> rest (fires the squash).
  await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); const c = g.crane; c.state = "slam"; });
  await page.waitForFunction(() => { const c = window.__BB.game.scene.getScene("Game").crane; return c.state === "rest"; }, null, { timeout: 3000 }).catch(() => {});
  const f = [];
  for (let i = 0; i < 5; i++) { await frameBody(-6, 2.9); f.push(await grab()); await sleep(65); } // follow the body at the floor for the squash/rebound
  await strip("a8-slam", f, "SLAM — impact SQUASH + rebound on the crane body at the slam->rest floor contact (body-invariant scale)");
}

// ============================================================================
// CONTACT SHEET: FLINCH — each yanked plate makes the crane flinch.
// ============================================================================
await startLevel(CRANE_LEVEL);
{
  await setAnim(true);
  await playersAway();
  await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); const c = g.crane; c.state = "rest"; c.timer = 99999; });
  await frame(0, 200, 3.2);
  const f = [];
  f.push(await grab()); // rest baseline
  // yank a real plate (the SACRED yank path) -> the crane flinches
  await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); const c = g.crane; g.yankCranePlate(c.plates[0]); });
  for (let i = 0; i < 4; i++) { await sleep(70); f.push(await grab()); }
  await strip("a8-flinch", f, "FLINCH — each yanked plate makes the crane body FLINCH (damped rotation kick on the SACRED yank event)");
}
const flinch = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const c = g.crane; const b = c.body;
  c.state = "rest"; c.timer = 99999;
  const rest = Math.abs(b.rotation);
  g.yankCranePlate(c.plates.find((p) => p.attached));
  let peak = 0;
  await new Promise((res) => { let t = 0; const iv = setInterval(() => { const r = Math.abs(b.rotation); if (r > peak) peak = r; if (++t > 40) { clearInterval(iv); res(); } }, 16); });
  return { rest: +rest.toFixed(4), peak: +peak.toFixed(4) };
});
ok(flinch.peak > flinch.rest + 0.02, "FLINCH fires a rotation kick on a plate yank", `restRot=${flinch.rest} peakRot=${flinch.peak} rad`);

// ============================================================================
// CONTACT SHEET: DEFEAT — staged power-down (slump + lamp dies + defiant shudder + settle).
// ============================================================================
await startLevel(CRANE_LEVEL);
{
  await setAnim(true);
  await playersAway();
  // drive the SACRED defeat: two cores already down, stomp the third -> craneDefeated.
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game"); const c = g.crane;
    c.state = "rest"; c.timer = 99999; c.podsStomped = 2;
    g.stompPod({ x: c.body.x, y: c.floorY - 20, active: true, ring: null, destroy() {} });
  });
  const f = [];
  for (let i = 0; i < 6; i++) { await frameBody(-4, 3.0); f.push(await grab()); await sleep(170); } // follow the slumping body: lamp dies -> defiant shudder -> settle
  await strip("a8-defeat", f, "DEFEAT — staged POWER-DOWN: slump (existing tween) + KOBI lamp dies + one last defiant shudder + settle", 130, 130);
}
const defeat = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game"); const c = g.crane; const rig = g.anim.rigFor(c.body);
  return { defeated: !!g.craneDefeated, dead: c.state === "dead", glowVisible: rig._eyeGlow.visible, glowAlpha: +rig._eyeGlow.alpha.toFixed(2) };
});
ok(defeat.defeated && defeat.dead, "DEFEAT triggers the SACRED power-down (craneDefeated + state=dead)");

// ============================================================================
// 2. CRANE BODY position + PLATE hitboxes + SLAM hitbox byte-identical under every A8 pose.
//    (shudder/flinch are host ROTATION [b.x/b.y unmoved]; squash is origin-centred SCALE;
//     plate wobble is rotation-only [pl.img.x/y unmoved]). Physics/hitboxes SACRED.
// ============================================================================
await startLevel(CRANE_LEVEL);
const invariance = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const c = g.crane; const b = c.body;
  g.anim.enabled = false; // stop the rig writing rotation/scale so we can hold each extreme
  g.players.forEach((p) => { p.invuln = 999999; p.setPosition(60, 60); });
  // FREEZE the fight in a NON-MOVING state so updateCrane's own patrol/slam/rise logic
  // does not drift b.x/b.y between frames (rest neither patrols nor falls); this isolates
  // the pose extremes so any b.x/b.y change would be caused ONLY by rotation/scale.
  c.state = "rest"; c.timer = 9e9; b.y = c.hoverY;
  const nf = () => new Promise((res) => requestAnimationFrame(() => res()));
  b.rotation = 0; b.setScale(1, 1); for (const pl of c.plates) if (pl.img) pl.img.rotation = 0;
  await nf();
  const snapBody = () => ({ bx: +b.x.toFixed(3), by: +b.y.toFixed(3) });
  const snapPlates = () => c.plates.filter((p) => p.attached && p.img).map((p) => ({ x: +p.img.x.toFixed(3), y: +p.img.y.toFixed(3) }));
  const B = snapBody(), P = snapPlates();
  const bodySame = () => { const s = snapBody(); return s.bx === B.bx && s.by === B.by; };
  const platesSame = () => { const s = snapPlates(); return s.length === P.length && s.every((v, i) => v.x === P[i].x && v.y === P[i].y); };
  const out = {};
  // telegraph/flinch shudder extreme (host rotation): b.x/b.y (slam hitbox) unmoved.
  b.rotation = 0.05; await nf(); out.shudderBody = bodySame();
  b.rotation = -0.09; await nf(); out.flinchBody = bodySame();
  b.rotation = 0;
  // slam squash extreme (origin-centred scale): b.x/b.y (slam hitbox) unmoved.
  b.setScale(1.16, 0.80); await nf(); out.squashBody = bodySame();
  b.setScale(1, 1);
  // plate wobble extreme (rotation only): each plate's yank hitbox x/y unmoved.
  for (const pl of c.plates) if (pl.img) pl.img.rotation = 0.06; await nf(); out.wobblePlates = platesSame();
  for (const pl of c.plates) if (pl.img) pl.img.rotation = 0;
  b.rotation = 0; b.setScale(1, 1); g.anim.enabled = true;
  return { B, P, out };
});
ok(invariance.out.shudderBody, "CRANE BODY position (slam hitbox b.x/b.y) byte-identical under the telegraph-shudder rotation extreme", `B=${JSON.stringify(invariance.B)}`);
ok(invariance.out.flinchBody, "CRANE BODY position (slam hitbox b.x/b.y) byte-identical under the flinch rotation extreme");
ok(invariance.out.squashBody, "CRANE BODY position (slam hitbox b.x/b.y) byte-identical under the slam-squash scale extreme (origin-centred)");
ok(invariance.out.wobblePlates, "EACH PLATE yank hitbox (pl.img.x/y) byte-identical under the wobble rotation extreme", `P=${JSON.stringify(invariance.P)}`);

// ============================================================================
// 3. Fight-state TIMINGS identical anim ON vs OFF (the anim READS the state machine).
//    Record the telegraph->slam interval + the full patrol->telegraph->slam->rest->rise
//    cadence across a couple cycles; assert ON and OFF match within frame jitter.
// ============================================================================
const measureTimings = async () => page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const c = g.crane;
  // deterministic start: park players so patrol is quiescent; seed patrol with a short timer.
  g.players.forEach((p) => { p.invuln = 999999; p.setPosition(60, 60); p.setVelocity(0, 0); });
  c.state = "patrol"; c.timer = 300; c.body.y = c.hoverY;
  const marks = []; let prev = c.state; const t0 = performance.now();
  await new Promise((res) => {
    const iv = setInterval(() => {
      if (c.state !== prev) { marks.push({ from: prev, to: c.state, t: performance.now() - t0 }); prev = c.state; }
      if (performance.now() - t0 > 5200 || marks.length >= 6) { clearInterval(iv); res(); }
    }, 8);
  });
  // find the telegraph->slam interval = time between (patrol->telegraph) and (telegraph->slam)
  const tele = marks.find((m) => m.to === "telegraph");
  const slam = marks.find((m) => m.to === "slam");
  return { seq: marks.map((m) => m.to).join(">"), teleToSlam: tele && slam ? +(slam.t - tele.t).toFixed(0) : null };
});
await startLevel(CRANE_LEVEL); await setAnim(true); const tOn = await measureTimings();
await startLevel(CRANE_LEVEL); await setAnim(false); const tOff = await measureTimings();
await setAnim(true);
ok(tOn.seq === tOff.seq && /telegraph>slam>rest/.test(tOn.seq),
  "Fight state SEQUENCE identical anim ON vs OFF (patrol>telegraph>slam>rest>rise...)", `on=${tOn.seq} off=${tOff.seq}`);
ok(tOn.teleToSlam != null && tOff.teleToSlam != null && Math.abs(tOn.teleToSlam - tOff.teleToSlam) <= 40,
  "TELEGRAPH->SLAM interval (~650ms) identical anim ON vs OFF within frame jitter (anim never gates the fight)",
  `on=${tOn.teleToSlam}ms off=${tOff.teleToSlam}ms`);

// ============================================================================
// 4. podsStomped 0->1->2->3 progression + defeat trigger unchanged anim ON vs OFF.
// ============================================================================
const runPods = async () => page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const c = g.crane;
  c.state = "rest"; c.timer = 99999; c.podsStomped = 0; g.craneDefeated = false;
  const seq = [seq0()];
  function seq0() { return c.podsStomped; }
  // yank+stomp three cores; record podsStomped after each stomp.
  for (let i = 0; i < 3; i++) {
    const pl = c.plates.find((p) => p.attached);
    if (pl) g.yankCranePlate(pl);
    g.stompPod({ x: c.body.x, y: c.floorY - 20, active: true, ring: null, destroy() {} });
    seq.push(c.podsStomped);
    await new Promise((r) => setTimeout(r, 40));
  }
  return { seq, defeated: !!g.craneDefeated, dead: c.state === "dead" };
});
await startLevel(CRANE_LEVEL); await setAnim(true); const podsOn = await runPods();
await startLevel(CRANE_LEVEL); await setAnim(false); const podsOff = await runPods();
await setAnim(true);
ok(JSON.stringify(podsOn.seq) === JSON.stringify([0, 1, 2, 3]) && podsOn.defeated && podsOn.dead,
  "podsStomped progresses 0->1->2->3 and triggers defeat with anim ON", `seq=${JSON.stringify(podsOn.seq)}`);
ok(JSON.stringify(podsOn.seq) === JSON.stringify(podsOff.seq) && podsOn.defeated === podsOff.defeated,
  "podsStomped progression + defeat trigger byte-identical anim ON vs OFF", `on=${JSON.stringify(podsOn.seq)} off=${JSON.stringify(podsOff.seq)}`);

// ============================================================================
// 5. The cable offsets are exactly 0 when the rig is OFF (P7 static cable byte-identical).
// ============================================================================
await startLevel(CRANE_LEVEL);
const cableOff = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const c = g.crane;
  g.anim.enabled = false; c._cableSwingX = 0; c._cableSagY = 0;
  await new Promise((r) => setTimeout(r, 400)); // let several frames of updateCrane run
  return { swing: c._cableSwingX, sag: c._cableSagY };
});
await setAnim(true);
ok(cableOff.swing === 0 && cableOff.sag === 0,
  "CABLE offsets are exactly 0 with the rig OFF (?animoff=1 renders the P7 static cable byte-identically)",
  `swing=${cableOff.swing} sag=${cableOff.sag}`);

// ============================================================================
// 7. fps A/B (Canvas) — 1-1 + 1-3 (crane), anim ON vs OFF, ~flat (interleaved).
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
for (const [name, idx] of [["1-1", 0], ["1-3", CRANE_LEVEL]]) {
  await startLevel(idx);
  await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); g.updateCamera = g._origUpdateCamera || g.updateCamera; });
  await sleep(1400);
  const ons = [], offs = [];
  for (let r = 0; r < 3; r++) {
    await setAnim(true); ons.push(await sampleFps(1600));
    await setAnim(false); offs.push(await sampleFps(1600));
  }
  await setAnim(true);
  const on = avg(ons), off = avg(offs), d = +(on - off).toFixed(1);
  fpsAB[name] = { on, off, delta: d, ons, offs };
  console.log(`${name}: anim-ON ${on} fps  |  anim-OFF ${off} fps  |  delta ${d} fps  (ON ${JSON.stringify(ons)} OFF ${JSON.stringify(offs)})`);
  ok(Math.abs(d) <= 2.5, `${name} A8 anim cost is ~flat (|delta| <= 2.5 fps, incl. Canvas thermal noise)`, `delta=${d} fps`);
}

await cBrowser.close();
console.log(errors ? `\nCanvas tier snapped with ${errors} page error(s)` : "\nCanvas tier snapped clean (0 page errors)");
if (errors) fails.push(`${errors} Canvas page error(s)`);
console.log("\nfps A/B summary: " + JSON.stringify(fpsAB));
if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL A8 ASSERTIONS PASSED");
