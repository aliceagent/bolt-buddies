// ANIM A7 — Wall-Warden animation set: acceptance probe + BURST-SHOT CONTACT SHEETS.
//
// A7 turns the A1 rig VISIBLE for the Wall-Warden — every beat a pure VISUAL overlay on
// the SACRED shove + defeat logic (the shove hitbox/push force/500ms cooldown/timing, the
// alert-proximity semantics, the defeat trigger, and the STATIC collision body are byte-
// identical; the 2-3 beat matrix reads w.img.x / w.img.y / w.facing / w.defeated, none
// touched here):
//   SWAY    — the ±2° idle sway, retimed onto the MOTION token + owned by the rig (host
//             rotation), plus a visor scan-sweep GLINT ~every 5s (shared scheduler).
//   STANCE  — alert stance-WIDEN (feet spread + slight grow) when a player is in FRONT
//             within 3 tiles: a body-INVARIANT sprite scale (the static body never follows).
//   SHOVE   — a forward LUNGE into contact (synced with the t=0 "HMPH") + damped RECOIL,
//             overlaid on the existing shove. Host rotation only.
//   DEFEAT  — the topple gains a BOUNCE + the settled body TWITCHES once ~2s later.
//
// This probe:
//   1. CONTACT SHEETS -> tools/shots/p2/: a7-sway a7-stance a7-shove a7-defeat.
//   2. WARDEN BODY WORLD-BOX + SHOVE-DETECTION ORIGIN (img.x/img.y) byte-identical under
//      stance-widen / lunge / recoil / topple (physics + shove geometry SACRED — the scale
//      is body-invariant, rotation is AABB-safe).
//   3. SHOVE PUSH + TIMING + the HMPH gate read from existing state, identical anim ON vs
//      OFF (the animation READS the shove, never gates it).
//   4. DEFEAT twitch fires ~2s after the topple settles.
//   5. 0 page errors, Canvas tier.
//   6. fps A/B (Canvas) 1-1 + 2-3 (warden), anim ON vs OFF within ~2 fps.
//
//   node tools/snap_p2_a7.mjs
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

const WARDEN_LEVEL = 5; // 2-3 — three Wall-Wardens in the bottom/top maze lanes

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

// push both players far away + un-hittable (calm idle warden shots).
const playersAway = () => page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  g.players.forEach((p) => { p.invuln = 999999; p.setPosition(60, 60); p.setVelocity(0, 0); });
});

const ZOOM = 3.2;
const frameWarden = () => page.evaluate((z) => {
  const g = window.__BB.game.scene.getScene("Game");
  const w = g.wardens[0]; const cam = g.cameras.main;
  cam.setZoom(z); cam.centerOn(w.img.x, w.img.y - 4);
}, ZOOM);
const wardenClip = { x: 640 - 115, y: 360 - 120, width: 230, height: 240 };
const grab = async (framer) => { if (framer) await framer(); const buf = await page.screenshot({ clip: wardenClip }); return buf.toString("base64"); };
const strip = async (name, frames, label, w = 155, h = 162) => {
  const imgs = frames.map((f) => `<img src="data:image/png;base64,${f}" style="display:block;width:${w}px;height:${h}px;border-radius:6px">`).join("");
  const html = `<body style="margin:0"><div style="display:inline-flex;flex-direction:column;gap:6px;background:#0a0f1e;padding:10px;font-family:monospace">`
    + `<div style="color:#8fa3d9;font-size:13px">A7 · ${label}</div>`
    + `<div style="display:inline-flex;gap:6px">${imgs}</div></div></body>`;
  const p2 = await ctx.newPage();
  await p2.setContent(html);
  const el = await p2.$("div");
  await el.screenshot({ path: `${SHOTS}/${name}.png` });
  await p2.close();
  console.log(`contact sheet -> ${SHOTS}/${name}.png`);
};

// Pin player 0 next to warden 0 for `ms` (fights gravity so it holds in the band). dx>0
// is IN FRONT (wardens face +x). Returns after the hold. Player 1 is parked far away.
const pinPlayer = (dx, dy, ms) => page.evaluate(async ([dx, dy, ms]) => {
  const g = window.__BB.game.scene.getScene("Game");
  const w = g.wardens[0], p = g.players[0];
  g.players.forEach((q, i) => { if (i !== 0) { q.invuln = 999999; q.setPosition(60, 60); q.setVelocity(0, 0); } });
  p.invuln = 999999; p.dead = false; p.carriedBy = null;
  const t0 = performance.now();
  await new Promise((res) => {
    const iv = setInterval(() => {
      p.setPosition(w.img.x + dx, w.img.y + dy); p.setVelocity(0, 0);
      if (performance.now() - t0 > ms) { clearInterval(iv); res(); }
    }, 16);
  });
}, [dx, dy, ms]);

await startLevel(WARDEN_LEVEL);
ok(await active("Game"), "2-3 Game scene active");
ok(!(await page.evaluate(() => window.__BB.game.renderer.type === 2)), "running on the Canvas tier (?canvas=1)");
ok(await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const w = g.wardens[0]; const rig = g.anim.rigFor(w.img);
  return !!(rig && rig._glint && rig.machine.hooks && typeof rig.machine.hooks.update === "function" &&
    typeof rig.startAnimFidget === "function");
}), "warden rig installed: pooled visor glint + update hook + glint fidget wired");
ok(await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  return g.wardens.length === 3;
}), "2-3 has the three Wall-Wardens");

// ============================================================================
// CONTACT SHEET: SWAY — idle sway + a visor scan-sweep glint.
// ============================================================================
{
  await setAnim(true);
  await playersAway();
  // fire a glint on demand (the real shared-scheduler path) so the sweep is captured.
  await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); g.anim.rigFor(g.wardens[0].img).startAnimFidget(); });
  const f = [];
  for (let i = 0; i < 5; i++) { await sleep(140); f.push(await grab(frameWarden)); }
  await strip("a7-sway", f, "SWAY — ±2° idle sway (host rotation) + a visor GLINT sweeping across the slit (~5s, shared scheduler)");
}

// ============================================================================
// CONTACT SHEET: STANCE — alert stance-widen when a player is in front (3 tiles).
// ============================================================================
{
  await setAnim(true);
  await playersAway();
  const f = [];
  f.push(await grab(frameWarden)); // rest baseline (no one in front)
  // pin player 0 in FRONT within 3 tiles but OUTSIDE the 44px shove range (pure stance).
  const holdP = pinPlayer(100, 0, 900);
  await sleep(160); f.push(await grab(frameWarden));
  await sleep(220); f.push(await grab(frameWarden));
  await sleep(300); f.push(await grab(frameWarden));
  await holdP;
  await strip("a7-stance", f, "STANCE-WIDEN — player in FRONT within 3 tiles => feet spread + slight grow (body-invariant scale)");
}
// stance amount reached (read the rig scratch)
const stanceAmt = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const w = g.wardens[0], p = g.players[0];
  const rig = g.anim.rigFor(w.img);
  return await new Promise((res) => {
    const t0 = performance.now();
    const iv = setInterval(() => {
      p.invuln = 999999; p.dead = false; p.setPosition(w.img.x + 100, w.img.y); p.setVelocity(0, 0);
      if (performance.now() - t0 > 700) { clearInterval(iv); res(+rig._stance.toFixed(3)); }
    }, 16);
  });
});
ok(stanceAmt > 0.6, "STANCE-WIDEN engages when a player stands in front within 3 tiles", `stance=${stanceAmt}`);

// ============================================================================
// CONTACT SHEET: SHOVE — lunge anticipation -> contact/HMPH -> recoil.
// ============================================================================
await startLevel(WARDEN_LEVEL);
{
  await setAnim(true);
  await playersAway();
  const f = [];
  // trigger a GENUINE shove: player 0 in front within the 44px shove range, cd clear.
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const w = g.wardens[0], p = g.players[0];
    w.shoveCd = 0; p.invuln = 999999; p.dead = false; p.carriedBy = null;
    p.setPosition(w.img.x + 30, w.img.y); p.setVelocity(0, 0);
  });
  // wait until the shove actually fires (shoveCd jumps to 500), then burst the lunge.
  await page.waitForFunction(() => {
    const g = window.__BB.game.scene.getScene("Game");
    return (g.wardens[0].shoveCd || 0) > 400;
  }, null, { timeout: 2000 }).catch(() => {});
  for (let i = 0; i < 5; i++) { f.push(await grab(frameWarden)); await sleep(80); }
  await strip("a7-shove", f, "SHOVE — forward LUNGE into contact (synced with the t=0 HMPH) then damped RECOIL (host rotation)");
}

// ============================================================================
// CONTACT SHEET: DEFEAT — topple bounce + the ~2s-later twitch.
// ============================================================================
await startLevel(WARDEN_LEVEL);
{
  await setAnim(true);
  await playersAway();
  // trigger a GENUINE defeat: player 0 BEHIND the warden (dx<0) within the 48px gate.
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const w = g.wardens[0], p = g.players[0];
    p.invuln = 999999; p.dead = false; p.carriedBy = null;
    p.setPosition(w.img.x - 28, w.img.y); p.setVelocity(0, 0);
  });
  await page.waitForFunction(() => {
    const g = window.__BB.game.scene.getScene("Game");
    return !!g.wardens[0].defeated;
  }, null, { timeout: 2000 }).catch(() => {});
  await playersAway(); // clear the defeating robot so the toppled warden reads clean
  const f = [];
  for (let i = 0; i < 5; i++) { f.push(await grab(frameWarden)); await sleep(120); } // the ~600ms topple bounce
  await strip("a7-defeat", f, "DEFEAT — topple settles with a BOUNCE (bounce.out); the body then TWITCHES once ~2s later (comedy beat — asserted)");
}

// ============================================================================
// 2. WARDEN BODY WORLD-BOX + SHOVE-DETECTION ORIGIN byte-identical under every A7
//    pose (physics + shove geometry SACRED).
// ============================================================================
await startLevel(WARDEN_LEVEL);
const invariance = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  g.anim.enabled = false; // stop the rig writing rotation/scale so we can hold each extreme
  g.players.forEach((p) => { p.invuln = 999999; p.setPosition(60, 60); });
  const w = g.wardens[0], img = w.img, bd = img.body;
  const nextFrame = () => new Promise((res) => requestAnimationFrame(() => res()));
  const snap = () => ({
    // shove/defeat detection reads img.x/img.y (the origin) — scaling/rotation must not move it
    ix: +img.x.toFixed(3), iy: +img.y.toFixed(3),
    // the STATIC Arcade body (collider) must be byte-identical
    bx: +bd.x.toFixed(3), by: +bd.y.toFixed(3), bw: +bd.width.toFixed(3), bh: +bd.height.toFixed(3),
    cx: +bd.center.x.toFixed(3), cy: +bd.center.y.toFixed(3),
  });
  img.rotation = 0; img.setScale(1, 1); await nextFrame();
  const N = snap();
  const same = (a) => a.ix === N.ix && a.iy === N.iy && a.bx === N.bx && a.by === N.by &&
    a.bw === N.bw && a.bh === N.bh && a.cx === N.cx && a.cy === N.cy;
  const out = {};
  // stance-widen (body-invariant scale): the static body never follows a sprite scale.
  img.setScale(1.12, 1.06); await nextFrame(); out.stanceWiden = same(snap());
  img.setScale(1, 1);
  // shove lunge extreme (host rotation): AABB ignores rotation; detection uses x/y.
  img.rotation = 0.22; await nextFrame(); out.shoveLunge = same(snap());
  // shove recoil extreme (host rotation, opposite sign)
  img.rotation = -0.15; await nextFrame(); out.shoveRecoil = same(snap());
  // topple extreme (host rotation)
  img.rotation = -84 * Math.PI / 180; await nextFrame(); out.topple = same(snap());
  img.rotation = 0; img.setScale(1, 1); g.anim.enabled = true;
  return { N, out };
});
for (const k of Object.keys(invariance.out)) {
  ok(invariance.out[k], `WARDEN BODY WORLD-BOX + shove-detection origin byte-identical under the ${k} pose (scale is body-invariant / rotation is AABB-safe — hitbox SACRED)`, `N=${JSON.stringify(invariance.N)}`);
}

// ============================================================================
// 3. SHOVE PUSH + TIMING + the HMPH gate identical anim ON vs OFF (READS state).
// ============================================================================
// Capture the SACRED push DETERMINISTICALLY: freeze the player's gravity so the shove's
// vy is preserved for reading, and record the PEAK push across a short window (gravity/drag
// only shrink the set velocity — its true magnitude is the extreme). This removes the
// frame-lag artifact of a setInterval landing a frame or two after the fire.
const measureShove = async () => page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const w = g.wardens[0], img = w.img, p = g.players[0];
  w.shoveCd = 0; w.defeated = false;
  g.players.forEach((q, i) => { if (i !== 0) { q.invuln = 999999; q.setPosition(60, 60); } });
  p.invuln = 999999; p.dead = false; p.carriedBy = null;
  p.body.allowGravity = false; // freeze vy so the SACRED push is not decayed before we read it
  const t0 = performance.now();
  let fired = false, cd0 = 0, pvx = 0, pvy = 0, tFire = 0;
  return await new Promise((res) => {
    const iv = setInterval(() => {
      const cd = w.shoveCd || 0;
      if (cd > 400) {
        // fired: NEVER touch the velocity again — only read the peak push (drag/gravity
        // only shrink the set value, so its true magnitude is the extreme we capture).
        if (!fired) { fired = true; cd0 = cd; tFire = performance.now() - t0; }
        if (Math.abs(p.body.velocity.x) > Math.abs(pvx)) pvx = p.body.velocity.x;
        if (p.body.velocity.y < pvy) pvy = p.body.velocity.y;
      } else {
        p.setPosition(img.x + 30, img.y); p.setVelocity(0, 0); // hold in the shove band pre-fire
      }
      const done = (fired && performance.now() - t0 > tFire + 220) || performance.now() - t0 > 3000;
      if (done) { clearInterval(iv); p.body.allowGravity = true; res({ vx: +pvx.toFixed(1), vy: +pvy.toFixed(1), cd: +cd0.toFixed(0) }); }
    }, 8);
  });
});
await startLevel(WARDEN_LEVEL);
await setAnim(true); const shoveOn = await measureShove();
await startLevel(WARDEN_LEVEL);
await setAnim(false); const shoveOff = await measureShove();
await setAnim(true);
// vy is read exactly (gravity frozen for the read); vx is the SACRED 430 minus at most one
// frame of the PLAYER's own anim-independent air-decay (Player.js eases vx->0 at k=0.4 when
// airborne with no key ≈ -4.6/frame) — the async poll reads it one frame downstream.
ok(shoveOn.vy === -230 && shoveOn.vx >= 420 && shoveOn.vx <= 430, "SHOVE push is the SACRED (facing*430, -230) with anim ON (the anim does not alter the push; vx shown after ≤1 frame of the player's own air-decay)", `v=(${shoveOn.vx},${shoveOn.vy})`);
// vy is compared exactly (gravity frozen). vx is compared within one frame of the player's
// OWN air-decay (~4.6/frame) — the only source of variance is which frame the async poll
// samples the (identical) post-shove velocity, not the shove itself.
ok(shoveOn.vy === shoveOff.vy && Math.abs(shoveOn.vx - shoveOff.vx) <= 6,
  "SHOVE push force identical anim ON vs OFF (the HMPH/shove gate reads existing state, never the anim; vx equal within ≤1 sample-frame of the player's own air-decay)",
  `on=(${shoveOn.vx},${shoveOn.vy}) off=(${shoveOff.vx},${shoveOff.vy})`);
ok(shoveOn.cd >= 470 && shoveOff.cd >= 470,
  "SHOVE sets the SACRED 500ms cooldown in both runs (the anim does not gate/alter it)",
  `on cd=${shoveOn.cd} off cd=${shoveOff.cd}`);

// ============================================================================
// 4. DEFEAT twitch fires ~2s after the topple settles.
// ============================================================================
await startLevel(WARDEN_LEVEL);
const twitch = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const w = g.wardens[0], img = w.img, p = g.players[0];
  g.players.forEach((q, i) => { if (i !== 0) { q.invuln = 999999; q.setPosition(60, 60); } });
  p.invuln = 999999; p.dead = false; p.carriedBy = null;
  p.setPosition(img.x - 28, img.y); p.setVelocity(0, 0);
  // wait for the defeat + the topple to settle (~600ms bounce), then record the rest angle.
  await new Promise((r) => setTimeout(r, 900));
  const settleAngle = img.angle;
  const t0 = performance.now();
  let maxDev = 0, tPeak = -1;
  await new Promise((res) => {
    const iv = setInterval(() => {
      const dev = Math.abs(img.angle - settleAngle);
      if (dev > maxDev) { maxDev = dev; tPeak = performance.now() - t0; }
      if (performance.now() - t0 > 2800) { clearInterval(iv); res(); }
    }, 20);
  });
  return { defeated: !!w.defeated, settleAngle: +settleAngle.toFixed(2), maxDev: +maxDev.toFixed(2), tPeak: +tPeak.toFixed(0) };
});
ok(twitch.defeated, "DEFEAT triggers when a player passes BEHIND the warden (SACRED trigger)");
ok(twitch.maxDev > 3 && twitch.tPeak > 1500 && twitch.tPeak < 2600,
  "DEFEAT body TWITCHES once ~2s after the topple settles (comedy beat)",
  `peakDev=${twitch.maxDev}° at ${twitch.tPeak}ms after settle`);

// ============================================================================
// 6. fps A/B (Canvas) — 1-1 + 2-3 (warden), anim ON vs OFF, ~flat (interleaved).
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
for (const [name, idx] of [["1-1", 0], ["2-3", WARDEN_LEVEL]]) {
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
  ok(Math.abs(d) <= 2.5, `${name} A7 anim cost is ~flat (|delta| <= 2.5 fps, incl. Canvas thermal noise)`, `delta=${d} fps`);
}

await cBrowser.close();
console.log(errors ? `\nCanvas tier snapped with ${errors} page error(s)` : "\nCanvas tier snapped clean (0 page errors)");
if (errors) fails.push(`${errors} Canvas page error(s)`);
console.log("\nfps A/B summary: " + JSON.stringify(fpsAB));
if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL A7 ASSERTIONS PASSED");
