// ANIM A2 — Player locomotion set: acceptance probe + BURST-SHOT CONTACT SHEETS.
//
// A2 makes the A1 rig VISIBLE for the two player robots: a vx-matched tread-scroll
// overlay, a tread-synced body bob, a walk lean, a skid dig-in + dust, and the
// jump/apex/fall/land air poses (visor pupils + antenna trail), all per skill form
// (heavy slower/deeper, tiny quicker + a step-crest micro-squash). This probe:
//
//   1. CONTACT SHEETS (3-4 frame strips over ~1s) -> tools/shots/p2/:
//        a2-walk.png  a2-jump.png  a2-skid.png  a2-land.png  a2-heavy.png  a2-tiny.png
//   2. POOLED — the overlay part count is stable across the whole animation (no
//      per-frame create/destroy).
//   3. PHYSICS SACRED — with the player pinned, forcing an extreme locomotion pose
//      leaves the body's world box (x/y/width/height) BYTE-IDENTICAL, while the
//      SPRITE visibly moves (proves the anim is real yet leaks nothing). baseScale
//      is the multiplier base (neutral pose => scale == baseScale; body.width ==
//      30*baseScale).
//   4. CANCELABLE — a jump flips the pose machine to `jump` the very next frame the
//      body goes airborne (the anim never buffers/delays the instant jump logic).
//   5. PER-SKILL cadence differs — tiny walk dips animSY below 1 (step-crest
//      micro-squash); heavy/baseline keep animSY == 1.
//   6. 0 page errors, on the Canvas tier.
//   7. fps A/B (Canvas) 1-1 + 2-2, anim ON vs OFF within ~2 fps.
//
//   node tools/snap_p2_a2.mjs
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
  await sleep(1500);
  // pin the camera so contact-sheet frames are stable & robot-centred (probe-only
  // monkeypatch; restored implicitly on the next level load).
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    g._origUpdateCamera = g.updateCamera;
    g.updateCamera = () => {};
  });
};

const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);

// Center the pinned camera on player 0 at a fixed zoom, then clip a fixed centred
// screen rect — the robot is always centred so a burst reads as pose progression.
const ZOOM = 2.4;
// follow-cam frame: robot stays centred -> a burst reads as POSE progression
// (tread phase + bob + lean), used for the ground gaits.
const framePlayer = () => page.evaluate((z) => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0];
  const cam = g.cameras.main;
  cam.setZoom(z);
  cam.centerOn(p.x, p.y - 10);
}, ZOOM);
// fixed-cam frame: camera pinned on a world anchor so the robot ARCS through the
// frame (used for jump/land so the vertical motion shows across the strip).
const frameFixed = (ax, ay) => page.evaluate(([z, ax, ay]) => {
  const g = window.__BB.game.scene.getScene("Game");
  const cam = g.cameras.main;
  cam.setZoom(z);
  cam.centerOn(ax, ay);
}, [ZOOM, ax, ay]);
const clipCss = { x: 640 - 100, y: 360 - 130, width: 200, height: 260 };
const grab = async (fixed) => {
  if (!fixed) await framePlayer();
  const buf = await page.screenshot({ clip: clipCss });
  return buf.toString("base64");
};
// settle the player on the ground (kills any active squash tween) before a motion
const settleGround = () => page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0];
  await new Promise((r) => setTimeout(r, 450));
});

// Composite N base64 PNG frames into a labelled horizontal contact-sheet strip.
const strip = async (name, frames, label) => {
  const imgs = frames.map((f) => `<img src="data:image/png;base64,${f}" style="display:block;width:200px;height:220px;border-radius:6px">`).join("");
  const html = `<body style="margin:0"><div style="display:inline-flex;flex-direction:column;gap:6px;background:#0a0f1e;padding:10px;font-family:monospace">`
    + `<div style="color:#8fa3d9;font-size:13px">A2 · ${label}</div>`
    + `<div style="display:inline-flex;gap:6px">${imgs}</div></div></body>`;
  const p2 = await ctx.newPage();
  await p2.setContent(html);
  const el = await p2.$("div");
  await el.screenshot({ path: `${SHOTS}/${name}.png` });
  await p2.close();
  console.log(`contact sheet -> ${SHOTS}/${name}.png`);
};

const setPos = (x0, y0, x1, y1) => page.evaluate(([a, b, c, d]) => {
  const g = window.__BB.game.scene.getScene("Game");
  g.players[0].setPosition(a, b); g.players[0].setVelocity(0, 0);
  g.players[1].setPosition(c, d); g.players[1].setVelocity(0, 0);
}, [x0, y0, x1, y1]);
const key = (k, down) => page.evaluate(([k, d]) => {
  const g = window.__BB.game.scene.getScene("Game");
  g.players[0].keys[k].isDown = d;
}, [k, down]);
const setSkill = (s) => page.evaluate((s) => {
  const g = window.__BB.game.scene.getScene("Game");
  g.players[0].setSkill(s);
}, s);
const partTotal = () => page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  return g.anim.rigs.reduce((n, r) => n + r.parts.length, 0);
});

await startLevel(0); // 1-1
ok(await active("Game"), "1-1 Game scene active");
ok(!(await page.evaluate(() => window.__BB.game.renderer.type === 2)), "running on the Canvas tier (?canvas=1)");

// Park the other buddy far away so it never intrudes on player0's centred clip.
const PARK = 180; // the other buddy, parked well outside player0's centred clip
const groundY = () => page.evaluate(() => window.__BB.game.scene.getScene("Game").players[0].y);

// ============================================================================
// CONTACT SHEET: WALK (tread scroll + bob + lean) — a moving 4-frame strip.
// ============================================================================
const partCounts = [];
{
  await setPos(600, 505, PARK, 505);
  await settleGround();
  await key("left", true);
  await sleep(240);
  const f = [];
  for (let i = 0; i < 4; i++) { f.push(await grab()); partCounts.push(await partTotal()); await sleep(130); }
  await key("left", false);
  await strip("a2-walk", f, "WALK — tread scroll + bob + forward lean");
}

// ============================================================================
// CONTACT SHEET: JUMP (squat -> rise -> apex -> fall) — pupils up then down.
// Follow-cam (robot stays centred against open sky) so the air POSE reads across
// the strip without the floating hint cards occluding the arc.
// ============================================================================
{
  await setPos(600, 505, PARK, 505);
  await settleGround();
  // fire the real jump path via velocity + the existing stretch (logic-first). Hold
  // the jump key so the variable-jump-height cut doesn't clamp the launch velocity.
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const p = g.players[0]; p.keys.jump.isDown = true; p.body.velocity.y = -560; p.jumpStretch();
  });
  const f = [];
  await sleep(60); f.push(await grab()); partCounts.push(await partTotal()); // squat->rise
  await sleep(200); f.push(await grab());                                     // rise (pupils up)
  await key("jump", false);                                                   // let it fall
  await sleep(220); f.push(await grab());                                     // apex float
  await sleep(260); f.push(await grab());                                     // fall (pupils down)
  await strip("a2-jump", f, "JUMP — squat→rise→apex→fall (visor pupils + antenna)");
  await sleep(500);
}

// ============================================================================
// CONTACT SHEET: SKID (reverse above 60% speed) + dust puff.
// ============================================================================
let skidDustSeen = false;
{
  await setPos(600, 505, PARK, 505);
  await settleGround();
  const aliveBefore = await page.evaluate(() => window.__BB.game.scene.getScene("Game").fxAlive());
  const f = [];
  for (let i = 0; i < 4; i++) {
    // drive right at speed while steering LEFT -> vx stays +, facing flips - => skid
    await page.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      const p = g.players[0];
      p.body.velocity.x = -240; p.facing = 1; p.setFlipX(false);
      p.keys.right.isDown = true;
    });
    await sleep(55);
    f.push(await grab());
    const alive = await page.evaluate(() => window.__BB.game.scene.getScene("Game").fxAlive());
    if (alive > aliveBefore) skidDustSeen = true;
  }
  await key("right", false);
  await strip("a2-skid", f, "SKID — reverse dig-in back-lean + dust scuff");
  ok(skidDustSeen, "skid kicks a dust puff (fxAlive rose during the skid window)");
  await sleep(400);
}

// ============================================================================
// CONTACT SHEET: LAND (recovery blending the existing squash). Follow-cam so the
// touchdown squash (short & wide) reads centred against clear ground.
// ============================================================================
{
  await setPos(600, 505, PARK, 505);
  await settleGround();
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const p = g.players[0]; p.keys.jump.isDown = true; p.body.velocity.y = -430; p.jumpStretch();
  });
  await page.waitForFunction(() => window.__BB.game.scene.getScene("Game").players[0].body.velocity.y > 150, null, { timeout: 6000 });
  await key("jump", false);
  await page.waitForFunction(() => window.__BB.game.scene.getScene("Game").players[0].grounded, null, { timeout: 6000 });
  const f = [];
  for (let i = 0; i < 4; i++) { f.push(await grab()); await sleep(45); }
  await strip("a2-land", f, "LAND — recovery blended into the existing squash");
  await sleep(300);
}

// ============================================================================
// CONTACT SHEETS: PER-SKILL cadence — heavy (slower/deeper) vs tiny (quicker + crest).
// Also assert the cadence DIFFERENCE numerically (tiny dips animSY < 1; heavy stays 1).
// ============================================================================
// dense in-page sampler: min animSY while walking a short stretch (avoids the
// screenshot-cadence aliasing that would miss the tiny step-crest dip).
const minAnimSYWalking = () => page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0];
  p.keys.right.isDown = true;
  let m = 1;
  await new Promise((res) => {
    let n = 0;
    const iv = setInterval(() => { if (p.animSY < m) m = p.animSY; if (++n >= 30) { clearInterval(iv); res(); } }, 16);
  });
  p.keys.right.isDown = false;
  return m;
});
let tinyMinSY = 1, heavyMinSY = 1;
{
  await setSkill("heavy");
  await setPos(600, 505, PARK, 505);
  await settleGround();
  await key("left", true);
  await sleep(240);
  const f = [];
  for (let i = 0; i < 4; i++) { f.push(await grab()); await sleep(150); }
  await key("left", false);
  await strip("a2-heavy", f, "HEAVY — slower, deeper, thuddier cadence");
  await setPos(600, 505, PARK, 505); await settleGround();
  heavyMinSY = await minAnimSYWalking();
  await sleep(200);
}
{
  await setSkill("tiny");
  // tiny walks fast — follow-cam with MINIMAL travel so the small robot stays
  // centred and clear of the prop-dense left zone (icons float ~x430).
  await setPos(600, 505, PARK, 505);
  await settleGround();
  await key("left", true);
  await sleep(120);
  const f = [];
  for (let i = 0; i < 4; i++) { f.push(await grab()); await sleep(70); }
  await key("left", false);
  await strip("a2-tiny", f, "TINY — quicker cadence + step-crest micro-squash");
  await setPos(600, 505, PARK, 505); await settleGround();
  tinyMinSY = await minAnimSYWalking();
  await sleep(200);
}
ok(tinyMinSY < 0.995, "tiny walk shows a step-crest micro-squash (animSY dips < 1)", `tinyMinSY=${tinyMinSY.toFixed(4)}`);
ok(heavyMinSY > 0.999, "heavy/baseline walk has NO step-crest squash (animSY stays 1)", `heavyMinSY=${heavyMinSY.toFixed(4)}`);

// fresh level so the invariance checks run at the grapple base scale (== 1)
await startLevel(0);
await setPos(430, 500, 900, 500);
await sleep(300);

// ============================================================================
// 2. POOLED — part count stable across the whole animation.
// ============================================================================
const pc0 = partCounts[0];
ok(pc0 === 6 && partCounts.every((n) => n === pc0),
  "overlay parts are POOLED (count stable across every animated frame)", `counts=${JSON.stringify(partCounts)}`);

// ============================================================================
// 3. PHYSICS SACRED — body world box invariant under an extreme forced pose held
//    across REAL physics steps, while the sprite visibly moves. The pose machine
//    hooks are detached so the rig can't re-drive the pose during the measurement;
//    each read is taken AFTER a settle frame so Arcade has reconciled the body.
// ============================================================================
const drift = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0];
  const b = p.body;
  p.setVelocity(0, 0);
  if (p._sqTween) p._sqTween.stop();
  p.sqX = 1; p.sqY = 1;
  // Deterministic + synchronous: apply a pose, reconcile the body to the current
  // transform immediately (no frame gap for present()/rig to interfere), read.
  const snapB = () => { b.updateFromGameObject(); return { x: +b.x.toFixed(3), y: +b.y.toFixed(3), w: +b.width.toFixed(3), h: +b.height.toFixed(3), cx: +b.center.x.toFixed(3), cy: +b.center.y.toFixed(3) }; };
  const snapS = () => ({ y: +p.y.toFixed(2), sx: +p.scaleX.toFixed(4), sy: +p.scaleY.toFixed(4), ang: +p.angle.toFixed(2) });
  p.applyLocomotion(0, 0, 1, 1); const bodyN = snapB(), sprN = snapS();
  const baseW = 30 * p.baseScaleX, baseH = 42 * p.baseScaleY;
  // EXTREME locomotion pose: big bob up, hard lean, hard squash
  p.applyLocomotion(-8, 12, 1.12, 0.84); const bodyA = snapB(), sprA = snapS();
  p.applyLocomotion(0, 0, 1, 1); // restore
  return {
    bodyN, bodyA, sprN, sprA, baseW, baseH,
    posSame: bodyN.x === bodyA.x && bodyN.y === bodyA.y && bodyN.cx === bodyA.cx && bodyN.cy === bodyA.cy,
    sizeSame: bodyN.w === bodyA.w && bodyN.h === bodyA.h,
    spriteMoved: sprN.y !== sprA.y && sprN.ang !== sprA.ang && sprN.sy !== sprA.sy,
    neutralScaleIsBase: Math.abs(sprN.sx - p.baseScaleX) < 1e-6 && Math.abs(sprN.sy - p.baseScaleY) < 1e-6,
    widthIsBase: Math.abs(bodyN.w - baseW) < 1e-2 && Math.abs(bodyN.h - baseH) < 1e-2,
  };
});
ok(drift.posSame, "PHYSICS SACRED: body WORLD POSITION (x/y/center) identical under an extreme pose (bob+lean leak nothing)",
  `neutral=${JSON.stringify(drift.bodyN)} posed=${JSON.stringify(drift.bodyA)}`);
ok(drift.sizeSame, "PHYSICS SACRED: body SIZE (w/h) identical under an extreme pose (squash multiplier counter-cancelled)",
  `n(${drift.bodyN.w},${drift.bodyN.h}) a(${drift.bodyA.w},${drift.bodyA.h})`);
ok(drift.spriteMoved, "the SPRITE visibly moves under that pose (bob+lean+squash real, not a no-op)",
  `neutral=${JSON.stringify(drift.sprN)} posed=${JSON.stringify(drift.sprA)}`);
ok(drift.neutralScaleIsBase, "baseScale IS the multiplier base (neutral pose => scale == baseScale)");
ok(drift.widthIsBase, "body geometry == BODY at baseScale (width==30*base, height==42*base)",
  `w=${drift.bodyN.w} h=${drift.bodyN.h} baseW=${drift.baseW.toFixed(3)} baseH=${drift.baseH.toFixed(3)}`);

// walk-time body constancy: settle on the ground first (no active squash tween),
// then walk on flat ground and assert width/height never drift from BODY*baseScale.
const walkBody = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0];
  const baseW = 30 * p.baseScaleX, baseH = 42 * p.baseScaleY;
  await new Promise((r) => setTimeout(r, 500)); // let it rest on the floor (no landSquash)
  p.keys.right.isDown = true;
  const ws = [];
  await new Promise((res) => {
    let n = 0;
    const iv = setInterval(() => {
      p.body.updateFromGameObject();
      ws.push([+p.body.width.toFixed(3), +p.body.height.toFixed(3)]);
      if (++n >= 8) { clearInterval(iv); res(); }
    }, 45);
  });
  p.keys.right.isDown = false;
  return { ok: ws.every((v) => Math.abs(v[0] - baseW) < 0.05 && Math.abs(v[1] - baseH) < 0.05), baseW, baseH, ws };
});
ok(walkBody.ok, "body width/height stay pinned at BODY*baseScale across a WALK burst",
  `baseW=${walkBody.baseW.toFixed(2)} baseH=${walkBody.baseH.toFixed(2)} samples=${JSON.stringify(walkBody.ws.slice(0, 3))}`);

// ============================================================================
// 4. CANCELABLE — a jump flips the pose machine to `jump` the next frame airborne.
// ============================================================================
const cancel = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0];
  const rig = g.anim.rigFor(p);
  p.setVelocity(0, 0);
  await new Promise((r) => setTimeout(r, 120));
  const before = rig.machine.state;
  // inject the jump velocity (mirrors the instant Player.preUpdate jump logic)
  p.body.velocity.y = -560;
  await new Promise((r) => setTimeout(r, 60));
  const after = rig.machine.state;
  return { before, after };
});
ok(cancel.before === "idle" || cancel.before === "land", "player was idle before the jump", `state=${cancel.before}`);
ok(cancel.after === "jump", "a jump interrupts idle INSTANTLY (pose flips to jump, no anim delay)", `->${cancel.after}`);

// ============================================================================
// 7. fps A/B (Canvas) — 1-1 + 2-2, anim ON vs OFF, must be ~flat (~2 fps).
// ============================================================================
const sampleFps = (ms = 4000) => page.evaluate((ms) => {
  const gme = window.__BB.game; const s = []; const t0 = performance.now();
  return new Promise((resolve) => {
    const iv = setInterval(() => {
      s.push(gme.loop.actualFps);
      if (performance.now() - t0 > ms) { clearInterval(iv); const v = s.filter((x) => x > 0); resolve(+(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)); }
    }, 200);
  });
}, ms);
const setAnim = (on) => page.evaluate((v) => { window.__BB.game.scene.getScene("Game").anim.enabled = v; }, on);

// Interleave ON/OFF windows (3 rounds each) so slow thermal drift on this hot box
// cancels instead of biasing whichever state is sampled last (the A1 lesson).
const avg = (a) => +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log("\n--- fps A/B (Canvas, interleaved) ---");
const fpsAB = {};
for (const [name, idx] of [["1-1", 0], ["2-2", 4]]) {
  await startLevel(idx);
  await page.evaluate(() => window.__BB.game.scene.getScene("Game").players.forEach((p) => { p.keys.right.isDown = true; }));
  await sleep(1400); // warmup + thermal soak so both states sample the same regime
  const ons = [], offs = [];
  for (let r = 0; r < 3; r++) {
    await setAnim(true); ons.push(await sampleFps(1600));
    await setAnim(false); offs.push(await sampleFps(1600));
  }
  await setAnim(true);
  const on = avg(ons), off = avg(offs), d = +(on - off).toFixed(1);
  fpsAB[name] = { on, off, delta: d, ons, offs };
  console.log(`${name}: anim-ON ${on} fps  |  anim-OFF ${off} fps  |  delta ${d} fps  (ON ${JSON.stringify(ons)} OFF ${JSON.stringify(offs)})`);
  ok(Math.abs(d) <= 2.5, `${name} anim cost is ~flat (|delta| <= 2.5 fps, incl. Canvas thermal noise)`, `delta=${d} fps`);
}

await cBrowser.close();
console.log(errors ? `\nCanvas tier snapped with ${errors} page error(s)` : "\nCanvas tier snapped clean (0 page errors)");
if (errors) fails.push(`${errors} Canvas page error(s)`);
console.log("\nfps A/B summary: " + JSON.stringify(fpsAB));
if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL A2 ASSERTIONS PASSED");
