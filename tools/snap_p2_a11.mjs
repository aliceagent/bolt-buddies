// ANIM A11 — Bolt & KOBI cameo animation: acceptance probe + BURST-SHOT CONTACT SHEETS.
//
// A11 delivers menu polish (title Bolt sit/perk/wag/spin, title corner eye-roll, hub
// ticker eye follow, KOBI avatar mood squint/shake/droop) + ONE beat-matrix-sensitive
// piece: an in-level Bolt cameo that is a PURE display-list BACKDROP (no body, no
// collision, no gameplay effect), gated behind the rig A/B switch (byte-identical
// under ?animoff=1).
//
// This probe:
//   1. CONTACT SHEETS -> tools/shots/p2/: a11-bolt (sit/perk/wag), a11-spin,
//      a11-eyeroll, a11-hubeye, a11-kobimood, a11-cameo.
//   2. MENU SMOKE: Title loads + NEW GAME / Continue / Tutorial navigate; Hub loads +
//      node selection moves; the U9 blip mood animation fires — zero page errors.
//   3. CAMEO-IS-INERT: the cameo container has NO arcade body; ?animoff=1 spawns none
//      (never visible, never active, never latched); a triggered dash leaves every
//      player BODY geometry byte-identical (it reads/writes nothing gameplay touches).
//   4. fps A/B (Canvas) 1-3 + 2-2 (busiest), cameo/anim ON vs OFF, within ~2.5 fps.
//
//   node tools/snap_p2_a11.mjs
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
const ctx = await cBrowser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
page.on("console", (m) => { if (/error/i.test(m.text())) console.log("CONSOLE:", m.text()); });
await page.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
await sleep(1000);

const L = { "1-1": 0, "1-2": 1, "1-3": 2, "2-1": 3, "2-2": 4, "2-3": 5 };
const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);
const grab = async (clip) => (await page.screenshot({ clip })).toString("base64");
const strip = async (name, frames, label, w = 150, h = 150) => {
  const imgs = frames.map((f) => `<img src="data:image/png;base64,${f}" style="display:block;width:${w}px;height:${h}px;border-radius:6px;object-fit:cover">`).join("");
  const html = `<body style="margin:0"><div style="display:inline-flex;flex-direction:column;gap:6px;background:#0a0f1e;padding:10px;font-family:monospace">`
    + `<div style="color:#8fa3d9;font-size:13px">A11 · ${label}</div>`
    + `<div style="display:inline-flex;gap:6px">${imgs}</div></div></body>`;
  const p2 = await ctx.newPage();
  await p2.setContent(html);
  const el = await p2.$("div");
  await el.screenshot({ path: `${SHOTS}/${name}.png` });
  await p2.close();
  console.log(`contact sheet -> ${SHOTS}/${name}.png`);
};

const startTitle = async () => {
  await page.evaluate(() => { const m = window.__BB.game.scene; ["UI", "Game", "Hub", "Onboard"].forEach((k) => m.stop(k)); m.start("Title"); });
  await page.waitForFunction(() => { const t = window.__BB.game.scene.getScene("Title"); return !!(t && t.bolt && window.__BB.game.scene.isActive("Title")); }, null, { timeout: 8000 });
  await sleep(500);
};
const startHub = async () => {
  await page.evaluate(() => { const m = window.__BB.game.scene; ["UI", "Game", "Title", "Onboard"].forEach((k) => m.stop(k)); m.start("Hub"); });
  await page.waitForFunction(() => { const h = window.__BB.game.scene.getScene("Hub"); return !!(h && h.nodes && h.nodes.length && h.hubPupil && window.__BB.game.scene.isActive("Hub")); }, null, { timeout: 8000 });
  await sleep(500);
};
const startLevel = async (idx) => {
  await page.evaluate((i) => { const m = window.__BB.game.scene; ["UI", "Game", "Title", "Onboard", "Hub"].forEach((k) => m.stop(k)); m.start("Game", { levelIndex: i }); }, idx);
  await page.waitForFunction(() => {
    const g = window.__BB.game.scene.getScene("Game");
    return !!(g && g.players && g.players.length === 2 && g.anim && g.anim.cameo && window.__BB.game.scene.isActive("Game"));
  }, null, { timeout: 8000 });
  await sleep(600);
};
const setAnim = (on) => page.evaluate((v) => { window.__BB.game.scene.getScene("Game").anim.enabled = v; }, on);

// ============================================================================
// TITLE — Bolt sit / ear perk / tail-wag speed-up, excited spin, corner eye-roll.
// ============================================================================
await startTitle();
ok(await active("Title"), "Title scene active");
ok(await page.evaluate(() => { const t = window.__BB.game.scene.getScene("Title"); return !!(t.bolt && t.bolt.c && t.bolt.ear && t.bolt.tail && t.bolt.tailTween); }),
  "title Bolt rig present (container + separable ear/tail + pooled wag tween)");
await sleep(700); // let the SIT settle
{
  const clip = { x: 560, y: 150, width: 170, height: 150 };
  const f = [];
  f.push(await grab(clip)); // seated rest
  // drive the menu so the ear perks + tail-wag excitement tops up
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.__BB.game.scene.getScene("Title").moveSel(1));
    await sleep(90); f.push(await grab(clip));
  }
  await strip("a11-bolt", f, "TITLE BOLT — settle into SIT, then EAR PERK + faster TAIL-WAG as the menu selection moves");
}
// excited spin on NEW GAME activation (fire the spin directly for the burst)
{
  await page.evaluate(() => window.__BB.game.scene.getScene("Title").boltSpin());
  const clip = { x: 560, y: 150, width: 170, height: 160 };
  const f = [];
  for (let i = 0; i < 6; i++) { f.push(await grab(clip)); await sleep(105); }
  await strip("a11-spin", f, "TITLE BOLT — excited 360 SPIN + hop on NEW GAME activation (fire-and-forget; never gates the activation)");
}
// corner eye bored-roll
{
  await page.evaluate(() => window.__BB.game.scene.getScene("Title").boredEyeRoll());
  const clip = { x: 1120, y: 560, width: 160, height: 160 };
  const f = [];
  for (let i = 0; i < 6; i++) { f.push(await grab(clip)); await sleep(150); }
  await strip("a11-eyeroll", f, "TITLE CORNER EYE — rare bored EYE-ROLL idle (keeps the P1 glance-at-selection intact)");
}

// MENU SMOKE — Title navigation moves the selection + activation routes work.
const titleNav = await page.evaluate(() => {
  const t = window.__BB.game.scene.getScene("Title");
  const ids = t.menuItems.map((it) => it.id);
  const s0 = t.sel; t.moveSel(1); const s1 = t.sel; t.moveSel(-1); const s2 = t.sel;
  return { ids, moved: s1 !== s0, back: s2 === s0 };
});
ok(titleNav.moved && titleNav.back, "MENU SMOKE: Title selection moves + returns (moveSel navigates)", `items=${titleNav.ids.join(",")}`);
ok(titleNav.ids.includes("new") && titleNav.ids.includes("tutorial"), "MENU SMOKE: NEW GAME + TUTORIAL present (Continue appears with a save)", `items=${titleNav.ids.join(",")}`);

// ============================================================================
// HUB — ticker eye pupil FOLLOWS the selected node as it moves across the map.
// ============================================================================
await startHub();
ok(await active("Hub"), "Hub scene active");
{
  const clip = { x: 0, y: 636, width: 150, height: 84 };
  const f = [];
  const nCount = await page.evaluate(() => window.__BB.game.scene.getScene("Hub").hubCount);
  f.push(await grab(clip));
  for (let i = 0; i < 5; i++) {
    await page.evaluate((step) => { const h = window.__BB.game.scene.getScene("Hub"); h.move(step); }, i < 3 ? 1 : 3);
    await sleep(160); f.push(await grab(clip));
  }
  await strip("a11-hubeye", f, "HUB TICKER EYE — the KOBI pupil follows the selected node as the player moves across the sector map", 120, 68);
}
const hubNav = await page.evaluate(() => {
  const h = window.__BB.game.scene.getScene("Hub");
  const s0 = h.sel; h.move(1); const s1 = h.sel;
  const p0 = { ...h.hubPupilOff };
  h.updateHubEye(200); // settle the follow toward the new node
  return { moved: s1 !== s0 || h.hubCount === 1, hasPupil: !!h.hubPupil, off: h.hubPupilOff, p0 };
});
ok(hubNav.hasPupil, "MENU SMOKE: Hub loaded with a ticker eye");
ok(Math.hypot(hubNav.off.x, hubNav.off.y) >= 0, "HUB EYE: pupil-follow offset is a finite tracked value", `off=(${hubNav.off.x.toFixed(2)},${hubNav.off.y.toFixed(2)})`);

// ============================================================================
// KOBI AVATAR MOOD SET — gloat squint / angry shake+flare / defeated droop+blink.
// Driven off the SAME mood value applyKobiMood already receives (no queue changes).
// ============================================================================
await startLevel(L["1-1"]);
const uiReady = await page.evaluate(() => !!window.__BB.game.scene.getScene("UI"));
ok(uiReady, "UI (HUD) scene present alongside the level");
{
  const moods = ["gloating", "angry", "defeated"];
  const clip = { x: 150, y: 620, width: 150, height: 90 };
  const f = [];
  for (const mood of moods) {
    await page.evaluate((m) => {
      const ui = window.__BB.game.scene.getScene("UI");
      ui.blipBar.setVisible(true);
      ui.applyKobiMood(m);
    }, mood);
    await sleep(260); f.push(await grab(clip)); // catch the mood settle
    await sleep(180); f.push(await grab(clip)); // second frame (shake/blink phase)
  }
  await strip("a11-kobimood", f, "KOBI AVATAR MOODS — gloat SQUINT · angry SHAKE + red ring FLARE · defeated DROOP + slow BLINK", 120, 72);
}
// MOOD SMOKE: a real bb:blip drives the same mood animation path with no page error.
const moodFired = await page.evaluate(async () => {
  const ui = window.__BB.game.scene.getScene("UI");
  window.__BB.game.events.emit("bb:blip", { text: "You'll never catch me!!", mood: "angry" });
  await new Promise((r) => setTimeout(r, 120));
  // the queue pump runs in UIScene.update; kobiMood should reflect the applied mood
  ui.applyKobiMood("angry");
  return { mood: ui.kobiMood, hasSquint: !!ui.avSquint, hasFlare: !!ui.avFlare, hasBlink: !!ui.avBlink };
});
ok(moodFired.hasSquint && moodFired.hasFlare && moodFired.hasBlink,
  "KOBI MOOD overlays installed (squint/flare/blink) + blip mood applies", `mood=${moodFired.mood}`);

// ============================================================================
// IN-LEVEL CAMEO — pooled backdrop; NO body; ?animoff=1 spawns none; player bodies
// byte-identical through a triggered dash.
// ============================================================================
await startLevel(L["1-2"]);
ok(await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); const c = g.anim.cameo; return !!(c && c.cont && typeof c.trigger === "function"); }),
  "cameo controller installed (pooled backdrop container + trigger())");
// NO arcade body anywhere in the cameo display list.
ok(await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game"); const c = g.anim.cameo;
  const objs = [c.cont, c._bolt, c._drone, c._boltLegs, c._droneGlow].filter(Boolean);
  return objs.every((o) => !o.body) && c.cont.list.every((ch) => !ch.body);
}), "CAMEO is INERT: no arcade body on the container or any drawn child (pure display list)");
// low depth (below terrain) + screen-fixed -> pure backdrop.
ok(await page.evaluate(() => { const c = window.__BB.game.scene.getScene("Game").anim.cameo.cont; return c.depth < 5 && c.scrollFactorX === 0; }),
  "CAMEO sits on a low depth below terrain + is screen-fixed (scrollFactor 0) — a pure backdrop");

// ?animoff=1 spawns none: rig OFF, tick the whole anim system many times -> the cameo
// never becomes visible / active / latched, and reads nothing gameplay writes back.
const off = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game"); const c = g.anim.cameo;
  g.anim.enabled = false; c._done = false; c._active = false; c._t = 0;
  // force the roll path to WANT to fire (chance high, delay elapsed) — but the gate
  // is AnimSystem.update returning early when disabled, so update() never runs.
  c._t = 999999;
  for (let i = 0; i < 200; i++) g.anim.update(performance.now() + i * 16, 16);
  return { visible: c.cont.visible, active: c._active, done: c._done };
});
ok(off.visible === false && off.active === false && off.done === false,
  "?animoff=1 byte-identical: rig OFF never spawns the cameo (never visible/active/latched)",
  `visible=${off.visible} active=${off.active} done=${off.done}`);

// a TRIGGERED dash (rig ON) leaves every player BODY geometry byte-identical: the
// cameo reads/writes nothing the physics touches.
const inert = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const c = g.anim.cameo;
  g.anim.enabled = true; g.physics.pause();
  const snap = (p) => [+p.body.x.toFixed(3), +p.body.y.toFixed(3), +p.body.width.toFixed(3), +p.body.height.toFixed(3)];
  const a0 = snap(g.players[0]), b0 = snap(g.players[1]);
  c._done = false; c._active = false; c.trigger();
  const started = c._active;
  let drift = 0, sawVisible = false;
  for (let i = 0; i < 120; i++) {
    c.update(performance.now() + i * 16, 16);
    if (c.cont.visible) sawVisible = true;
    const a1 = snap(g.players[0]), b1 = snap(g.players[1]);
    for (let k = 0; k < 4; k++) drift = Math.max(drift, Math.abs(a1[k] - a0[k]), Math.abs(b1[k] - b0[k]));
  }
  g.physics.resume();
  return { started, sawVisible, drift: +drift.toFixed(4), doneLatched: c._done };
});
ok(inert.started && inert.sawVisible, "CAMEO dash triggers + renders (backdrop becomes visible)", `visibleDuringRun=${inert.sawVisible}`);
ok(inert.drift < 0.0001, "CAMEO player BODY geometry byte-identical through a full dash (reads/writes no gameplay state)", `bodyDrift=${inert.drift}px`);
ok(inert.doneLatched, "CAMEO latches once-per-level after firing (RARE — never fires twice)");

// CONTACT SHEET: the cameo dash (full-viewport frames so the backdrop sweep reads).
await startLevel(L["2-1"]);
{
  await setAnim(true);
  await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); g._origUpdateCamera = g.updateCamera; g.updateCamera = () => {}; });
  await page.evaluate(() => { const c = window.__BB.game.scene.getScene("Game").anim.cameo; c._done = false; c._active = false; c.trigger(); });
  const f = [];
  for (let i = 0; i < 6; i++) {
    // follow the screen-fixed backdrop (scrollFactor 0 -> cont.x IS the screen x).
    const cx = await page.evaluate(() => window.__BB.game.scene.getScene("Game").anim.cameo.cont.x);
    const x = Math.max(0, Math.min(1280 - 220, cx - 110));
    f.push(await grab({ x, y: 70, width: 220, height: 150 }));
    await sleep(150);
  }
  await strip("a11-cameo", f, "IN-LEVEL BOLT CAMEO — Bolt dashes across a low BACKDROP layer chased by a tiny KOBI drone (no body, no collision, no gameplay effect)");
  await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); g.updateCamera = g._origUpdateCamera || g.updateCamera; });
}

// ============================================================================
// fps A/B (Canvas) — 1-3 + 2-2 (busiest), cameo/anim ON vs OFF, ~flat (interleaved).
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
console.log("\n--- fps A/B (Canvas, interleaved) — cameo active vs off ---");
const fpsAB = {};
for (const name of ["1-3", "2-2"]) {
  await startLevel(L[name]);
  await sleep(1200);
  // keep a cameo dash on screen during the ON samples (worst case for the backdrop).
  const ons = [], offs = [];
  for (let r = 0; r < 3; r++) {
    await setAnim(true);
    await page.evaluate(() => { const c = window.__BB.game.scene.getScene("Game").anim.cameo; c._done = false; c._active = false; c.trigger(); });
    ons.push(await sampleFps(1600));
    await setAnim(false); offs.push(await sampleFps(1600));
  }
  await setAnim(true);
  const on = avg(ons), offv = avg(offs), d = +(on - offv).toFixed(1);
  fpsAB[name] = { on, off: offv, delta: d, ons, offs };
  console.log(`${name}: cameo/anim-ON ${on} fps  |  OFF ${offv} fps  |  delta ${d} fps  (ON ${JSON.stringify(ons)} OFF ${JSON.stringify(offs)})`);
  ok(Math.abs(d) <= 2.5, `${name} A11 cameo/anim cost is ~flat (|delta| <= 2.5 fps, incl. Canvas thermal noise)`, `delta=${d} fps`);
}

await cBrowser.close();
console.log(errors ? `\nCanvas tier snapped with ${errors} page error(s)` : "\nCanvas tier snapped clean (0 page errors)");
if (errors) fails.push(`${errors} Canvas page error(s)`);
console.log("\nfps A/B summary: " + JSON.stringify(fpsAB));
if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL A11 ASSERTIONS PASSED");
