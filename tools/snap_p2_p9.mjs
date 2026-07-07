// GFX P9 (HUD & dialog micro-motion) acceptance probe.
//
// THE KEY ARTIFACT is a spawn OVERLAP-AUDIT sweep over all 6 chambers + the
// tutorial. At each spawn it collects the on-screen bounding rects of every
// spawn-time element — item cards, action-hint bubbles, U1 coach bubbles (if
// any), the U7 controller toast (force-fired), the HUD plates, the U8 stats
// region (only in the clear overlay — absent at spawn), the MuteScene glyph and
// the intro banner — and ASSERTS pairwise NO overlap between the item cards and
// any of them (and cards vs cards). It emits a per-level PASS/FAIL table and a
// spawn screenshot per level. It then captures KOBI mood rings/eyelid, the key
// chip, core-pip glimmer, the exit-waiting wave and the intro banner+world icon.
//
//   node tools/snap_p2_p9.mjs
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

const LEVELS = [
  { idx: 0, name: "1-1" }, { idx: 1, name: "1-2" }, { idx: 2, name: "1-3" },
  { idx: 3, name: "2-1" }, { idx: 4, name: "2-2" }, { idx: 5, name: "2-3" },
  { idx: 12, name: "tut" },
];

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
page.on("console", (m) => { if (/error/i.test(m.text())) console.log("CONSOLE:", m.text()); });

// U7 gamepad mock (same technique as snap_p2_u7): disconnected at boot so the
// toast fires exactly when we call __pad.connect() during the audit.
await page.addInitScript(() => {
  const mkButtons = (n) => { const a = []; for (let i = 0; i < n; i++) a.push({ pressed: false, touched: false, value: 0 }); return a; };
  const pad = { id: "Mock (P9)", index: 0, connected: false, mapping: "standard", axes: [0, 0, 0, 0], buttons: mkButtons(17), timestamp: performance.now() };
  const slots = [null, null, null, null];
  navigator.getGamepads = () => slots;
  window.__pad = {
    connect() { pad.connected = true; slots[0] = pad; pad.timestamp = performance.now(); },
    disconnect() { pad.connected = false; slots[0] = null; },
  };
});

await page.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
await sleep(900);
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

const startLevel = async (idx) => {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Game"); m.stop("Title"); m.stop("Onboard"); m.stop("Hub");
    m.start("Game", { levelIndex: i });
  }, idx);
  await page.waitForFunction(() => {
    const g = window.__BB.game.scene.getScene("Game");
    return !!(g && g.def && g.players && g.players.length === 2 && window.__BB.game.scene.isActive("Game"));
  }, null, { timeout: 8000 });
  await sleep(1500); // intro banner at rest + camera settle
};

// Dump the on-screen bounding rects of every spawn-time element. World-space
// Game objects go through the Game camera; scrollFactor-0 Game objects (the
// banner) through the same camera's zoom-about-centre; UI/Mute objects are
// already in 1280x720 screen space (those scenes never zoom).
const audit = (page) => page.evaluate(() => {
  const S = window.__BB.game.scene;
  const G = S.getScene("Game"); const UI = S.getScene("UI");
  const cam = G.cameras.main; const wv = cam.worldView; const z = cam.zoom;
  const W = G.scale.width, H = G.scale.height, cx = W / 2, cy = H / 2;
  const R = (x, y, w, h) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  const wRect = (o) => { const b = o.getBounds(); return R((b.x - wv.x) * z, (b.y - wv.y) * z, b.width * z, b.height * z); };
  const sf0Rect = (o) => { const b = o.getBounds(); return R(cx + (b.x - cx) * z, cy + (b.y - cy) * z, b.width * z, b.height * z); };
  const sRect = (o) => { const b = o.getBounds(); return R(b.x, b.y, b.width, b.height); };

  const cards = [];
  G.pedestals.forEach((p) => { if (p.card && p.card.visible) cards.push(wRect(p.card)); });
  const others = {};
  const hints = []; (G.actionHints || []).forEach((h) => { if (h && h.visible) hints.push(wRect(h)); });
  others.hints = hints;
  const coach = []; if (G.coach) G.coach.bubbles.forEach((b) => { if (b.active && b.c.visible) coach.push(wRect(b.c)); });
  others.coach = coach;
  others.toast = (UI && UI._padToast && UI._padToast.visible && UI._padToast.alpha > 0.2) ? [sRect(UI._padToast)] : [];
  others.banner = G.introBanner ? [sf0Rect(G.introBanner)] : [];
  // HUD plates + centre cluster (fixed UIScene geometry) + mute glyph.
  others.hud = [R(14, 10, 270, 48), R(W - 14 - 270, 10, 270, 48), R(cx - 110, 8, 220, 70)];
  const gl = window.__BB.mute && window.__BB.mute.glyph;
  others.mute = gl ? [R(gl.x - 25, gl.y - 19, 50, 38)] : [];
  // U8 stats region — only present in the clear overlay (never at spawn).
  others.stats = (UI && UI.overlay && UI.overlay.visible && UI.statsText) ? [sRect(UI.statsText)] : [];
  return { cards, others, cam: { z: +z.toFixed(3) } };
});

const overlaps = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);

for (const L of LEVELS) {
  await startLevel(L.idx);
  // force-fire the U7 controller toast. It edge-fires on the first connect
  // (level 1-1 — also the WORST case: 1-1's wide HEAVYWEIGHT card reaches
  // furthest into the toast's x-band, so a clean 1-1 proves the toast slot for
  // all levels). The banner is still at rest here, so it is audited every level.
  await page.evaluate(() => window.__pad.connect());
  await sleep(280);
  const a = await audit(page);
  await shot(`p9-spawn-${L.name}`);

  const cats = ["cards", ...Object.keys(a.others)];
  const hits = [];
  // cards vs cards
  for (let i = 0; i < a.cards.length; i++)
    for (let j = i + 1; j < a.cards.length; j++)
      if (overlaps(a.cards[i], a.cards[j])) hits.push(`card${i}×card${j}`);
  // cards vs every other category
  for (const [cat, rects] of Object.entries(a.others))
    for (let i = 0; i < a.cards.length; i++)
      for (let j = 0; j < rects.length; j++)
        if (overlaps(a.cards[i], rects[j])) hits.push(`card${i}×${cat}${j}`);

  const counts = Object.entries(a.others).map(([k, v]) => `${k}:${v.length}`).join(" ");
  ok(hits.length === 0, `${L.name} spawn: item cards clear of ALL spawn elements`,
    `cards:${a.cards.length} ${counts}${hits.length ? "  OVERLAPS=[" + hits.join(",") + "]" : ""}`);
}

// ---- KOBI mood rings + eyelid ------------------------------------------------
await startLevel(0);
const kobiBlip = async (mood, tag) => {
  await page.evaluate((m) => {
    const UI = window.__BB.game.scene.getScene("UI");
    UI.blipActive = null; UI.blipQueue.length = 0;
    const lines = { gloating: "You will NEVER escape my Assembly Wing.", angry: "How DARE you!! That is CHEATING!!", defeated: "Fine! FINE. You win. Go to the maintenance tunnels." };
    window.__BB.game.events.emit("bb:blip", { text: lines[m], mood: m });
  }, mood);
  await sleep(650); // let the typewriter start (iris snaps) + ring recolour
  return page.evaluate(() => {
    const UI = window.__BB.game.scene.getScene("UI");
    return { mood: UI.kobiMood, lid: UI.avLid.visible, glow: UI.blipGlow.visible !== false, iris: { x: +UI.irisPos.x.toFixed(2), y: +UI.irisPos.y.toFixed(2) } };
  });
};
const mg = await kobiBlip("gloating");
ok(mg.mood === "gloating" && !mg.lid, "KOBI gloating: magenta ring, no eyelid");
await shot("p9-kobi-gloating");
const ma = await kobiBlip("angry");
ok(ma.mood === "angry" && !ma.lid, "KOBI angry: red ring, no eyelid");
await shot("p9-kobi-angry");
const md = await kobiBlip("defeated");
ok(md.mood === "defeated" && md.lid, "KOBI defeated: grey-blue ring + eyelid droop", `lid=${md.lid}`);
await shot("p9-kobi-moods"); // defeated is the headline mood shot
ok(Math.abs(md.iris.x) > 1.5, "KOBI iris snapped toward the text while typing", `irisX=${md.iris.x}`);

// ---- key chip bounce+spin + core-pip glimmer ---------------------------------
await page.evaluate(() => {
  const E = window.__BB.game.events;
  E.emit("bb:keys", 1);
  E.emit("bb:cores", [true, true, false]);
});
await sleep(250);
const kc = await page.evaluate(() => {
  const UI = window.__BB.game.scene.getScene("UI");
  return { keyVis: UI.keyIcon.visible, cores: UI.coreState.filter(Boolean).length };
});
ok(kc.keyVis, "key chip visible + animating after collect");
ok(kc.cores === 2, "two core pips filled (glimmer targets)");
await shot("p9-keychip-cores");

// ---- exit-waiting beckoning wave (2-1 has an exit door) ----------------------
await startLevel(3);
const wave = await page.evaluate(() => {
  const G = window.__BB.game.scene.getScene("Game");
  if (!G.exitLabel) return { has: false };
  G.showExitWaiting(0);
  return { has: true, waveExists: !!G.exitLabel.wave, playing: G.exitLabel.wave && G.exitLabel.wave.isPlaying(), visible: G.exitLabel.visible };
});
ok(wave.has && wave.waveExists && wave.playing, "exit-waiting buddy icon runs a beckoning wave", JSON.stringify(wave));
await sleep(200);
await shot("p9-exit-wave");

// ---- intro banner + world icon (fresh spawn, banner at rest) -----------------
await startLevel(1);
await shot("p9-banner-icon");
const banner = await page.evaluate(() => {
  const G = window.__BB.game.scene.getScene("Game");
  return { present: !!G.introBanner, children: G.introBanner ? G.introBanner.length : 0 };
});
ok(banner.present, "intro banner present at spawn (brushed bands + world icon)", JSON.stringify(banner));

await browser.close();
console.log(errors ? `\nsnapped with ${errors} page error(s)` : "\nsnapped clean (0 page errors)");
if (errors) fails.push(`${errors} page error(s)`);
if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL ASSERTIONS PASSED");
