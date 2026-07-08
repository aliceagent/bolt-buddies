// ANIM A6 — Patrol Roller animation set: acceptance probe + BURST-SHOT CONTACT SHEETS.
//
// A6 turns the A1 rig VISIBLE for the Patrol Roller — every beat a pure VISUAL overlay
// on the SACRED patrol + detection-beam + alert/zap logic (velocity, beam geometry/range/
// timing, the alert->zap->cool state machine + the zap hitbox are byte-identical; the beat
// matrix reads r.img.x / r.dir / r.state / r.beamRect, all untouched):
//   ROLL   — the P7 spoke-dot wheels spin at a rate matched to the roller's real |vx|.
//   ALERT  — pupil SNAPS to aim at the spotted player + iris DILATES + klaxon beacon spins.
//   HMM    — a ~1s head-tilt + question-squint the frame the player breaks line of sight
//            (the alert->patrol transition). Host-rotation only (AABB/beam-safe).
//   ZAP    — a damped recoil rock when the roller discharges (the alert->cool transition).
//
// This probe:
//   1. CONTACT SHEETS -> tools/shots/p2/: a6-roll a6-alert a6-hmm a6-zap.
//   2. BODY WORLD-BOX + BEAM RECT byte-identical under wheel-spin/pupil/klaxon/head-tilt/
//      recoil (physics + beam SACRED — rotation is AABB-safe, beam origin uses x/y).
//   3. ALERT/ZAP TIMING unchanged with anim ON vs OFF (the animation READS state, never gates it).
//   4. WHEEL spin tracks |vx| (spins while patrolling, freezes when the roller stops).
//   5. 0 page errors, Canvas tier.
//   6. fps A/B (Canvas) 1-1 + 2-2, anim ON vs OFF within ~2 fps (2-2 has rollers + the fan).
//
//   node tools/snap_p2_a6.mjs
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
  await sleep(1200);
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    g._origUpdateCamera = g.updateCamera;
    g.updateCamera = () => {}; // freeze the camera so our framing sticks during a burst
  });
};
const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);
const setAnim = (on) => page.evaluate((v) => { window.__BB.game.scene.getScene("Game").anim.enabled = v; }, on);

// push both players far from the rollers + make them un-seeable (calm patrol shots).
const playersAway = () => page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  g.players.forEach((p) => { p.invuln = 999999; p.setPosition(60, 60); p.setVelocity(0, 0); });
});

const ZOOM = 3.0;
const frameRoller = () => page.evaluate((z) => {
  const g = window.__BB.game.scene.getScene("Game");
  const r = g.rollers[0]; const cam = g.cameras.main;
  cam.setZoom(z); cam.centerOn(r.img.x, r.img.y - 2);
}, ZOOM);
const rollerClip = { x: 640 - 130, y: 360 - 95, width: 260, height: 190 };
const grab = async (framer) => { if (framer) await framer(); const buf = await page.screenshot({ clip: rollerClip }); return buf.toString("base64"); };
const strip = async (name, frames, label, w = 210, h = 155) => {
  const imgs = frames.map((f) => `<img src="data:image/png;base64,${f}" style="display:block;width:${w}px;height:${h}px;border-radius:6px">`).join("");
  const html = `<body style="margin:0"><div style="display:inline-flex;flex-direction:column;gap:6px;background:#0a0f1e;padding:10px;font-family:monospace">`
    + `<div style="color:#8fa3d9;font-size:13px">A6 · ${label}</div>`
    + `<div style="display:inline-flex;gap:6px">${imgs}</div></div></body>`;
  const p2 = await ctx.newPage();
  await p2.setContent(html);
  const el = await p2.$("div");
  await el.screenshot({ path: `${SHOTS}/${name}.png` });
  await p2.close();
  console.log(`contact sheet -> ${SHOTS}/${name}.png`);
};

// Drive the FIRST roller into a real ALERT by placing player 0 in its beam (genuine
// detection — not a forced flag). Returns once r.state === "alert". `hold` inflates the
// alert timer so the alert persists across a burst without firing the zap.
const forceAlert = async (hold) => page.evaluate(async (hold) => {
  const g = window.__BB.game.scene.getScene("Game");
  const r = g.rollers[0], img = r.img, p = g.players[0];
  if (p.skill === "tiny") p.skill = "grapple"; // tiny robots are invisible to the beam
  r.state = "patrol"; r.timer = 0; // clean patrol so the beam can re-detect
  g.players.forEach((q) => { q.invuln = 999999; q.setPosition(60, 60); });
  await new Promise((res) => setTimeout(res, 120));
  r.dir = 1; img.setFlipX(false); p.invuln = 0; p.dead = false; p.carriedBy = null;
  const t0 = performance.now();
  return await new Promise((res) => {
    const iv = setInterval(() => {
      if (r.state === "patrol") { r.dir = 1; img.setFlipX(false); } // keep the beam facing +x
      p.setPosition(img.x + 70, img.y - 5); p.setVelocity(0, 0);
      if (r.state !== "alert") p.invuln = 0;
      if (r.state === "alert") { if (hold) r.timer = 999999; clearInterval(iv); res(true); }
      else if (performance.now() - t0 > 4000) { clearInterval(iv); res(false); }
    }, 16);
  });
}, hold);

await startLevel(3); // 2-1 (world 2) — two rollers in an open corridor
ok(await active("Game"), "2-1 Game scene active");
ok(!(await page.evaluate(() => window.__BB.game.renderer.type === 2)), "running on the Canvas tier (?canvas=1)");
ok(await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const r = g.rollers[0]; const rig = g.anim.rigFor(r.img);
  return !!(rig && rig._klax && rig.machine.hooks && typeof rig.machine.hooks.update === "function");
}), "roller rig installed: pooled klaxon beacon + update hook wired");

// ============================================================================
// CONTACT SHEET: ROLL — velocity-matched wheel spin while patrolling.
// ============================================================================
{
  await setAnim(true);
  await playersAway();
  const f = [];
  // pin the wheel to 3 distinct angles via the real rig, then two live patrol samples.
  for (const deg of [0, 120, 240]) {
    await page.evaluate((d) => { const g = window.__BB.game.scene.getScene("Game"); g.anim.rigFor(g.rollers[0].img)._wheelDeg = d; }, deg);
    await sleep(45); f.push(await grab(frameRoller));
  }
  for (let i = 0; i < 2; i++) { await sleep(110); f.push(await grab(frameRoller)); }
  await strip("a6-roll", f, "ROLL — spoke-dot wheels spin at a rate matched to the patrol |vx| (pupil eases along the patrol dir)");
}

// ============================================================================
// CONTACT SHEET: ALERT — pupil snaps to the player + iris dilates + klaxon spins.
// ============================================================================
{
  await setAnim(true);
  await playersAway();
  const alerted = await forceAlert(true);
  ok(alerted, "roller enters a genuine ALERT when player 0 is in the beam");
  const f = [];
  for (let i = 0; i < 5; i++) { await sleep(90); f.push(await grab(frameRoller)); }
  await strip("a6-alert", f, "ALERT — pupil SNAPS to aim at the player + iris DILATES + klaxon beacon SPINS (red flash + '!')");
}

// ============================================================================
// CONTACT SHEET: HMM — head-tilt + question-squint on a line-of-sight break.
// ============================================================================
{
  await setAnim(true);
  await playersAway();
  await forceAlert(true);
  const f = [];
  f.push(await grab(frameRoller)); // alert baseline
  // yank the player out of the beam -> next frame the beam loses sight -> alert->patrol -> HMM.
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    g.players.forEach((p) => { p.invuln = 999999; p.setPosition(60, 60); p.setVelocity(0, 0); });
    g.rollers[0].timer = 1; // let the (now unseen) alert lapse to patrol immediately
  });
  for (let i = 0; i < 4; i++) { await sleep(150); f.push(await grab(frameRoller)); }
  await strip("a6-hmm", f, "HMM? — LOS break: the cab cocks + the pupil squints for ~1s (host rotation — beam origin unmoved)");
}

// ============================================================================
// CONTACT SHEET: ZAP — recoil kickback when the roller discharges.
// ============================================================================
{
  await setAnim(true);
  await playersAway();
  await forceAlert(false); // do NOT inflate the timer — let the real 500ms zap fire
  const f = [];
  // wait for the discharge (state -> cool), then capture the recoil settling.
  await page.waitForFunction(() => {
    const g = window.__BB.game.scene.getScene("Game");
    return g.rollers[0].state === "cool";
  }, null, { timeout: 3000 }).catch(() => {});
  for (let i = 0; i < 4; i++) { f.push(await grab(frameRoller)); await sleep(70); }
  await strip("a6-zap", f, "ZAP RECOIL — the cab kicks back off the discharge and rocks to rest (rotation-only; hitbox unmoved)");
}

// ============================================================================
// 2. BODY WORLD-BOX + BEAM RECT byte-identical under every A6 pose (SACRED).
// ============================================================================
await startLevel(3);
const invariance = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  g.anim.enabled = false; // stop the rig writing rotation so we can hold each extreme
  const r = g.rollers[0], img = r.img, bd = img.body;
  g.players.forEach((p) => { p.invuln = 999999; p.setPosition(60, 60); });
  // FREEZE the roller (cool state => updateWorld2 holds velocity 0) so the ONLY thing
  // changing between snapshots is the pose we apply — not ongoing patrol travel.
  r.state = "cool"; r.timer = 1e9; img.body.setVelocity(0, 0);
  const nextFrame = () => new Promise((res) => requestAnimationFrame(() => res()));
  await nextFrame(); await nextFrame(); img.body.setVelocity(0, 0);
  const snap = () => {
    bd.updateFromGameObject();
    return {
      bx: +bd.x.toFixed(3), by: +bd.y.toFixed(3), bw: +bd.width.toFixed(3), bh: +bd.height.toFixed(3),
      cx: +bd.center.x.toFixed(3), cy: +bd.center.y.toFixed(3),
      beamx: r.beamRect ? +r.beamRect.x.toFixed(3) : 0, beamw: r.beamRect ? +r.beamRect.width.toFixed(3) : 0,
    };
  };
  img.rotation = 0; await nextFrame();
  const N = snap();
  const same = (a) => a.bx === N.bx && a.by === N.by && a.bw === N.bw && a.bh === N.bh &&
    a.cx === N.cx && a.cy === N.cy && a.beamx === N.beamx && a.beamw === N.beamw;
  const out = {};
  const rig = g.anim.rigFor(img);
  // wheel spin: separate overlays -> body/beam untouched
  rig._wheelDeg = 137; r.wheels[0].setAngle(137); r.wheels[1].setAngle(137); await nextFrame(); out.wheelSpin = same(snap());
  // pupil snap + dilate: separate overlay -> body/beam untouched
  r.pupil.setPosition(img.x + 13, img.y - 10).setScale(1.55); await nextFrame(); out.pupilDilate = same(snap());
  // klaxon beacon visible + rotated: separate overlay -> body/beam untouched
  rig._klax.setVisible(true).setPosition(img.x, img.y - 21).setAngle(200); await nextFrame(); out.klaxon = same(snap());
  // head-tilt extreme (host rotation): AABB ignores rotation; beam origin uses x/y
  img.rotation = 0.20; await nextFrame(); out.headTilt = same(snap());
  // recoil extreme (host rotation)
  img.rotation = -0.24; await nextFrame(); out.recoil = same(snap());
  img.rotation = 0; g.anim.enabled = true;
  return { N, out };
});
for (const k of Object.keys(invariance.out)) {
  ok(invariance.out[k], `BODY WORLD-BOX + BEAM RECT byte-identical under the ${k} pose (overlay/rotation only — hitbox + beam SACRED)`, `N=${JSON.stringify(invariance.N)}`);
}

// ============================================================================
// 3. ALERT/ZAP TIMING unchanged with anim ON vs OFF (animation READS state).
// ============================================================================
const measureZap = async () => page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const r = g.rollers[0], img = r.img, p = g.players[0];
  // reset the roller to a clean patrol
  r.state = "patrol"; r.timer = 0;
  g.players.forEach((q) => { q.invuln = 999999; q.setPosition(60, 60); q.dead = false; });
  if (p.skill === "tiny") p.skill = "grapple";
  await new Promise((res) => setTimeout(res, 120));
  r.dir = 1; img.setFlipX(false);
  p.invuln = 0; p.dead = false; p.carriedBy = null;
  const t0 = performance.now(); let tAlert = 0, tZap = 0;
  return await new Promise((res) => {
    const iv = setInterval(() => {
      if (!tZap) { p.setPosition(img.x + 70, img.y - 5); p.setVelocity(0, 0); if (!tAlert) p.invuln = 0; }
      if (r.state === "alert" && !tAlert) tAlert = performance.now();
      if (r.state === "cool" && tAlert && !tZap) { tZap = performance.now(); clearInterval(iv); res(+(tZap - tAlert).toFixed(0)); }
      if (performance.now() - t0 > 5000) { clearInterval(iv); res(-1); }
    }, 16);
  });
});
await startLevel(3);
await setAnim(true); const zapOn = await measureZap();
await setAnim(false); const zapOff = await measureZap();
await setAnim(true);
ok(zapOn > 300 && zapOn < 750, "ALERT->ZAP fires at the SACRED ~500ms with anim ON (animation does not gate the zap)", `${zapOn}ms`);
ok(Math.abs(zapOn - zapOff) <= 120, "ALERT->ZAP timing is identical anim ON vs OFF (visual overlay reads state, never gates it)", `on=${zapOn}ms off=${zapOff}ms`);

// ============================================================================
// 4. WHEEL spin tracks |vx| (spins while patrolling, freezes when the roller stops).
// ============================================================================
const wheelTrack = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const r = g.rollers[0]; const rig = g.anim.rigFor(r.img);
  g.players.forEach((p) => { p.invuln = 999999; p.setPosition(60, 60); });
  const sample = (ms) => new Promise((res) => { const a = rig._wheelDeg; setTimeout(() => res(Math.abs(rig._wheelDeg - a)), ms); });
  // patrolling: body moves at ±58 -> wheels turn
  r.state = "patrol";
  const moving = await sample(300);
  // stopped: alert/cool freezes velocity at 0 -> wheels freeze
  r.state = "cool"; r.timer = 999999;
  const stopped = await sample(300);
  r.state = "patrol"; r.timer = 0;
  return { moving: +moving.toFixed(2), stopped: +stopped.toFixed(2) };
});
ok(wheelTrack.moving > 20 && wheelTrack.stopped < 2, "WHEEL spin tracks |vx| (turns while patrolling, freezes when the roller is stopped)",
  `Δdeg moving=${wheelTrack.moving} stopped=${wheelTrack.stopped}`);

// ============================================================================
// 6. fps A/B (Canvas) — 1-1 + 2-2, anim ON vs OFF, ~flat (interleaved windows).
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
  ok(Math.abs(d) <= 2.5, `${name} A6 anim cost is ~flat (|delta| <= 2.5 fps, incl. Canvas thermal noise)`, `delta=${d} fps`);
}

await cBrowser.close();
console.log(errors ? `\nCanvas tier snapped with ${errors} page error(s)` : "\nCanvas tier snapped clean (0 page errors)");
if (errors) fails.push(`${errors} Canvas page error(s)`);
console.log("\nfps A/B summary: " + JSON.stringify(fpsAB));
if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL A6 ASSERTIONS PASSED");
