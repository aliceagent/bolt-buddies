// ANIM A5 — Scuttlebug animation set: acceptance probe + BURST-SHOT CONTACT SHEETS.
//
// A5 turns the A1 rig VISIBLE for the scuttlebug enemy — every beat a pure VISUAL
// overlay on the SACRED patrol/squish logic (velocity, turn points, aggro semantics,
// the squish/kill hitbox + timing are byte-identical; the beat matrix is the guard):
//   SCUTTLE  — 3-frame leg cycle (base/step/step2 texture swap), cadence ∝ |vx|.
//   FEELERS  — two pooled drawn antennae, twitched by the ONE shared fidget scheduler.
//   REAR-UP  — nearest player within ~160px => the bug tilts its front up (host ROTATION
//              only; Arcade AABB ignores rotation) + feelers flare; the scuttle pauses.
//   BONK     — a decaying stumble wobble when patrol velocity reverses at an edge.
//   SQUISH   — keeps the pop; adds a rare (deterministic 1-in-4) legs-up ghost puff.
//   W2       — the hex-shell variant inherits ALL of it (same rig; only leg art differs).
//
// This probe:
//   1. CONTACT SHEETS -> tools/shots/p2/: a5-scuttle a5-rearup a5-bonk a5-squish a5-w2bug.
//   2. BODY WORLD-BOX byte-identical under the rear-up + scuttle poses (physics sacred).
//   3. REAR-UP does NOT change patrol velocity (still ±60) — the beat routes are safe.
//   4. SCUTTLE cadence tracks |vx| (more leg-frame travel at higher speed).
//   5. SQUISH ghost-puff is POOLED + within the ~120 particle budget.
//   6. FEELERS are pooled (2 parts, created once); 0 page errors, Canvas tier.
//   7. fps A/B (Canvas) 1-1 + 2-2, anim ON vs OFF within ~2 fps.
//
//   node tools/snap_p2_a5.mjs
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
    return !!(g && g.def && g.players && g.players.length === 2 && g.anim && g.bugs &&
      window.__BB.game.scene.isActive("Game"));
  }, null, { timeout: 8000 });
  await sleep(1300);
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    g._origUpdateCamera = g.updateCamera;
    g.updateCamera = () => {}; // freeze the camera so our framing sticks during a burst
  });
};
const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);
const setAnim = (on) => page.evaluate((v) => { window.__BB.game.scene.getScene("Game").anim.enabled = v; }, on);

// push both players far from the bugs so no rear-up interferes (scuttle/bonk shots).
const playersAway = () => page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  g.players.forEach((p) => { p.invuln = 999999; p.setPosition(80, p.y); p.setVelocity(0, 0); });
});
const firstBug = () => page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const b = g.bugs.getChildren().find((x) => x.active);
  return b ? { x: b.x, y: b.y } : null;
});

const ZOOM = 3.0;
const frameAt = (x, y, z = ZOOM) => page.evaluate(([x, y, z]) => {
  const cam = window.__BB.game.scene.getScene("Game").cameras.main;
  cam.setZoom(z); cam.centerOn(x, y);
}, [x, y, z]);
// centre on the (moving) first bug just before a grab
const frameBug = () => page.evaluate((z) => {
  const g = window.__BB.game.scene.getScene("Game");
  const b = g.bugs.getChildren().find((x) => x.active); if (!b) return;
  const cam = g.cameras.main; cam.setZoom(z); cam.centerOn(b.x, b.y - 4);
}, ZOOM);
const bugClip = { x: 640 - 110, y: 360 - 90, width: 220, height: 180 };
const grab = async (clip, framer) => { if (framer) await framer(); const buf = await page.screenshot({ clip }); return buf.toString("base64"); };
const strip = async (name, frames, label, w = 190, h = 155) => {
  const imgs = frames.map((f) => `<img src="data:image/png;base64,${f}" style="display:block;width:${w}px;height:${h}px;border-radius:6px">`).join("");
  const html = `<body style="margin:0"><div style="display:inline-flex;flex-direction:column;gap:6px;background:#0a0f1e;padding:10px;font-family:monospace">`
    + `<div style="color:#8fa3d9;font-size:13px">A5 · ${label}</div>`
    + `<div style="display:inline-flex;gap:6px">${imgs}</div></div></body>`;
  const p2 = await ctx.newPage();
  await p2.setContent(html);
  const el = await p2.$("div");
  await el.screenshot({ path: `${SHOTS}/${name}.png` });
  await p2.close();
  console.log(`contact sheet -> ${SHOTS}/${name}.png`);
};
// deterministically pin the leg-cycle to frame `i` (0/1/2) then let one tick apply it.
const legFrame = (i) => page.evaluate((i) => {
  const g = window.__BB.game.scene.getScene("Game");
  const b = g.bugs.getChildren().find((x) => x.active); if (!b) return;
  const rig = g.anim.rigFor(b); rig._legTravel = i * 7 + 0.5;
}, i);

await startLevel(0);
ok(await active("Game"), "1-1 Game scene active");
ok(!(await page.evaluate(() => window.__BB.game.renderer.type === 2)), "running on the Canvas tier (?canvas=1)");
ok(await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); const b = g.bugs.getChildren()[0]; const r = g.anim.rigFor(b); return r && r.parts.length === 2 && r.parts[0].name === "feelerL" && r.parts[1].name === "feelerR"; }),
  "feelers are POOLED rig parts (2, created once at registration)");

// ============================================================================
// CONTACT SHEET: SCUTTLE — 3-frame leg cycle while patrolling (cadence ∝ |vx|).
// ============================================================================
{
  await setAnim(true);
  await playersAway();
  const f = [];
  // show the 3 distinct leg frames, cycled by the real rig, then two live samples.
  for (const i of [0, 1, 2]) { await legFrame(i); await sleep(60); f.push(await grab(bugClip, frameBug)); }
  await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); const b = g.bugs.getChildren().find((x) => x.active); b.body.velocity.x = 120; });
  for (let i = 0; i < 2; i++) { await sleep(110); f.push(await grab(bugClip, frameBug)); }
  await strip("a5-scuttle", f, "SCUTTLE — 3-frame leg cycle (base/step/step2), cadence synced to |vx|");
}

// ============================================================================
// CONTACT SHEET: REAR-UP — player enters ~160px -> bug rears (front lifts) + feelers flare.
// ============================================================================
{
  await setAnim(true);
  await playersAway();
  // freeze the bug in place so the burst reads cleanly (velocity restored right after);
  // rear-up is driven by the REAL proximity scan, not a forced flag.
  const bpos = await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const b = g.bugs.getChildren().find((x) => x.active);
    b.setVelocity(0, 0); b.rotation = 0; const rig = g.anim.rigFor(b); rig._rear = 0;
    return { x: b.x, y: b.y };
  });
  const f = [];
  f.push(await grab(bugClip, () => frameAt(bpos.x, bpos.y - 4))); // baseline (calm)
  // bring player 0 within ~160px (but outside the 38px contact box) — bug reads it & rears
  await page.evaluate((bx) => {
    const g = window.__BB.game.scene.getScene("Game");
    const p = g.players[0]; p.invuln = 999999; p.setPosition(bx - 110, p.y); p.setVelocity(0, 0);
  }, bpos.x);
  for (let i = 0; i < 4; i++) { await sleep(90); f.push(await grab(bugClip, () => frameAt(bpos.x, bpos.y - 4))); }
  await strip("a5-rearup", f, "REAR-UP — calm, then a player enters ~160px: front lifts + feelers flare (rotation-only)");
}

// ============================================================================
// CONTACT SHEET: BONK — a stumble wobble when patrol velocity reverses at an edge.
// ============================================================================
{
  await setAnim(true);
  await playersAway();
  // shove the bug just past its patrol max so the NEXT patrol frame reverses it — the
  // rig detects the sign flip and plays the cosmetic stumble (logic/velocity untouched).
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const b = g.bugs.getChildren().find((x) => x.active);
    b.setPosition(b.maxX + 6, b.y); b.body.velocity.x = 60; const rig = g.anim.rigFor(b); rig._rear = 0; rig._lastVx = 60;
  });
  const f = [];
  for (let i = 0; i < 5; i++) { await sleep(55); f.push(await grab(bugClip, frameBug)); }
  await strip("a5-bonk", f, "BONK-TURN — stumble wobble as the bug reverses at the patrol edge");
}

// ============================================================================
// CONTACT SHEET: SQUISH — the pop + the rare legs-up GHOST-PUFF variant.
// ============================================================================
{
  await setAnim(true);
  await playersAway();
  const sp = await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const b = g.bugs.getChildren().find((x) => x.active);
    b.setVelocity(0, 0); b._squishGhost = true; // force the 1-in-4 variant for the shot
    const x = b.x, y = b.y; g.squishBug(b);
    return { x, y };
  });
  const f = [];
  for (const dt of [40, 120, 200, 260]) { await sleep(dt); f.push(await grab(bugClip, () => frameAt(sp.x, sp.y - 10))); }
  await strip("a5-squish", f, "SQUISH — purple pop + shell-shards + the rare rising legs-up GHOST PUFF");
}

// ============================================================================
// CONTACT SHEET: W2 — the hex-shell variant inherits ALL of the animation.
// ============================================================================
{
  await startLevel(3); // 2-1 (world 2). No W2 level ships a bug, so spawn one on the rig.
  await setAnim(true);
  const w2 = await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const px = g.players[0].x, py = g.players[0].y - 40;
    g.players.forEach((p) => { p.invuln = 999999; p.setPosition(px - 260, p.y); });
    const b = g.bugs.create(px, py, "bug_w2");
    b._texBase = "bug_w2"; b._texStep = "bug_w2_step"; b._texStep2 = "bug_w2_step2";
    b._squishGhost = false;
    b.setDepth(10); b.body.setSize(38, 22).setOffset(3, 4);
    b.setVelocityX(60); b.minX = px - 130; b.maxX = px + 130;
    b.glow = g.add.image(b.x, b.y, "bug_glow").setDepth(11).setBlendMode(1).setAlpha(0);
    g.anim.registerBug(b); // real registration -> installBugAnim (feelers + hooks)
    return { world: g.def.world, tex: b._texBase };
  });
  ok(w2.world === 2 && w2.tex === "bug_w2", "W2 hex-shell variant spawned on the rig (world 2, bug_w2 art)", `world=${w2.world} tex=${w2.tex}`);
  await sleep(700); // let it land + patrol
  const f = [];
  for (const i of [0, 1, 2]) { await legFrame(i); await sleep(60); f.push(await grab(bugClip, frameBug)); }
  // and a rear-up on the W2 variant (bring a player near)
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const b = g.bugs.getChildren().find((x) => x.active); b.setVelocity(0, 0);
    g.players[0].setPosition(b.x - 105, g.players[0].y);
  });
  for (let i = 0; i < 2; i++) { await sleep(110); f.push(await grab(bugClip, frameBug)); }
  await strip("a5-w2bug", f, "W2 SHELL VARIANT — same rig: 3-frame scuttle + feelers + rear-up on the hex shell");
}

// ============================================================================
// 2. BODY WORLD-BOX byte-identical under the rear-up + scuttle poses (physics sacred).
// ============================================================================
await startLevel(0);
await setAnim(true);
const invariance = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const b = g.bugs.getChildren().find((x) => x.active); const rig = g.anim.rigFor(b); const bd = b.body;
  b.setVelocity(0, 0); b.rotation = 0; b.setTexture(b._texBase); rig._rear = 0;
  const snap = () => { bd.updateFromGameObject(); return { x: +bd.x.toFixed(3), y: +bd.y.toFixed(3), w: +bd.width.toFixed(3), h: +bd.height.toFixed(3), cx: +bd.center.x.toFixed(3), cy: +bd.center.y.toFixed(3) }; };
  const N = snap();
  const same = (a) => a.x === N.x && a.y === N.y && a.w === N.w && a.h === N.h && a.cx === N.cx && a.cy === N.cy;
  const out = {};
  // scuttle: swap to each leg frame -> body must not move.
  b.setTexture(b._texStep); out.legStep = same(snap());
  b.setTexture(b._texStep2); out.legStep2 = same(snap());
  b.setTexture(b._texBase);
  // rear-up: full tilt + feeler flare -> body must not move (rotation is AABB-safe).
  b.rotation = -0.20; rig._rear = 1; out.rearUp = same(snap());
  // stumble wobble
  b.rotation = 0.16; out.stumble = same(snap());
  b.rotation = 0; rig._rear = 0;
  return { N, out };
});
for (const k of Object.keys(invariance.out)) {
  ok(invariance.out[k], `BODY WORLD-BOX byte-identical under the ${k} pose (rotation/texture-swap only — hitbox sacred)`, `N=${JSON.stringify(invariance.N)}`);
}

// ============================================================================
// 3. REAR-UP does NOT change patrol velocity (the beat routes stomp bugs on timing).
// ============================================================================
const rearVel = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const b = g.bugs.getChildren().find((x) => x.active); const rig = g.anim.rigFor(b);
  g.players.forEach((p) => { p.invuln = 999999; p.setPosition(80, p.y); });
  b.setPosition((b.minX + b.maxX) / 2, b.y); b.setVelocityX(60);
  await new Promise((r) => setTimeout(r, 120));
  const vFar = Math.round(b.body.velocity.x), rFar = +rig._rear.toFixed(2);
  // now bring a player within range -> the bug rears, but patrol velocity must persist
  g.players[0].setPosition(b.x - 100, g.players[0].y);
  await new Promise((r) => setTimeout(r, 350));
  const vNear = Math.round(b.body.velocity.x), rNear = +rig._rear.toFixed(2);
  return { vFar, rFar, vNear, rNear };
});
ok(Math.abs(rearVel.vNear) === 60 && Math.abs(rearVel.vFar) === 60 && rearVel.rNear > 0.5 && rearVel.rFar < 0.2,
  "REAR-UP is visual-only: patrol speed stays ±60 while the bug rears (rear 0→1, |vx| unchanged)",
  `far{v:${rearVel.vFar},rear:${rearVel.rFar}} near{v:${rearVel.vNear},rear:${rearVel.rNear}}`);

// ============================================================================
// 4. SCUTTLE cadence tracks |vx| (more leg-frame travel at higher speed).
// ============================================================================
const cad = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const b = g.bugs.getChildren().find((x) => x.active); const rig = g.anim.rigFor(b);
  g.players.forEach((p) => { p.invuln = 999999; p.setPosition(80, p.y); });
  const measure = (v) => new Promise((res) => {
    b.setPosition((b.minX + b.maxX) / 2, b.y); b.body.velocity.x = v; rig._rear = 0;
    const t0 = rig._legTravel;
    setTimeout(() => res(+(rig._legTravel - t0).toFixed(2)), 300);
  });
  const lo = await measure(20), hi = await measure(120);
  return { lo, hi };
});
ok(cad.hi > cad.lo * 2 && cad.lo >= 0, "SCUTTLE cadence tracks |vx| (leg-frame travel scales with speed)", `travel@20=${cad.lo} travel@120=${cad.hi}`);

// ============================================================================
// 5. SQUISH ghost-puff is POOLED + within the ~120 particle budget.
// ============================================================================
const budget = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const cap = g.fxPalette.budget;
  const alive = () => g._budgetEmitters.reduce((s, e) => s + (e.getAliveParticleCount ? e.getAliveParticleCount() : 0), 0);
  // squish every bug in the level back-to-back with the ghost variant forced on — the
  // fxBudget guard must keep the summed alive particle count within the cap.
  g.bugs.getChildren().slice().forEach((b) => { if (b.active) { b._squishGhost = true; g.squishBug(b); } });
  await new Promise((r) => setTimeout(r, 30));
  const peak = alive();
  return { cap, peak };
});
ok(budget.peak <= budget.cap, "SQUISH ghost-puff stays POOLED within the ~120 particle budget (fxBudget guard)", `peak=${budget.peak}/${budget.cap}`);

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
  ok(Math.abs(d) <= 2.5, `${name} A5 anim cost is ~flat (|delta| <= 2.5 fps, incl. Canvas thermal noise)`, `delta=${d} fps`);
}

await cBrowser.close();
console.log(errors ? `\nCanvas tier snapped with ${errors} page error(s)` : "\nCanvas tier snapped clean (0 page errors)");
if (errors) fails.push(`${errors} Canvas page error(s)`);
console.log("\nfps A/B summary: " + JSON.stringify(fpsAB));
if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL A5 ASSERTIONS PASSED");
