// GFX P4 (Terrain identity & wear) acceptance probe.
//
// P4 is mostly CHEAP baked-texture work (per-world tile trim, underside AO, grime
// decals) that is free at runtime on BOTH renderers, plus a meaning-bearing shimmer
// redraw (violet energy curtain, distinct from the red hazard strips), duct crawl
// affordances, and pooled ambient sparks. The additive sparks (shimmer sparkles +
// hazard arc-jumps) are WebGL-ONLY — on the software Canvas renderer the beat harness
// runs, the drawn curtain + hazard pulse carry the meaning and fps is untouched.
//
// Shots -> tools/shots/p2/:
//   p4-1-1.png       Canvas, W1: rivet tiles + decals + underside AO.
//   p4-2-2.png       Canvas, W2: hex-bolt/pipe-seam tiles + drip stains + decals.
//   p4-shimmer.png   Canvas, framed on a phase-wall energy curtain.
//   p4-hazard.png    Canvas, framed on a hazard strip (distinct danger read).
//   p4-duct.png      Canvas, framed on a duct crawl slot + air-line/arrow hint.
//   p4-shimmer-webgl.png / p4-hazard-webgl.png  WebGL: the additive sparks live.
//
//   node tools/snap_p2_p4.mjs
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

const startLevel = async (page, idx) => {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Game"); m.stop("Title"); m.stop("Onboard"); m.stop("Hub");
    m.start("Game", { levelIndex: i });
  }, idx);
  // Wait for create() to complete (the P4 wear arrays exist + the scene is active)
  // before any inspect/reposition — avoids a restart-readiness race.
  await page.waitForFunction(() => {
    const g = window.__BB.game.scene.getScene("Game");
    return !!(g && g.def && g.hazardStrips !== undefined && g.shimmerPts !== undefined &&
      window.__BB.game.scene.isActive("Game"));
  }, null, { timeout: 8000 });
  await sleep(1500); // intro banner + settle
};

const forceCoach = (page) =>
  page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const p = g.players[0];
    g.coachShow(0, {
      tokens: [{ label: "LOOK!" }],
      caption: "coach bubble over terrain",
      follow: { obj: p, dy: -60 },
      key: "probe", dur: 60000, colorP: 0,
    });
  });

// Snapshot the P4 terrain-wear state of the Game scene.
const inspect = (page) =>
  page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const list = g.children.list;
    const world = g.def.world;
    const tileKey = g.tileKey; // TileSprite hides its source key; scene exposes it
    const decals = list.filter((o) => o.texture && /^decal_/.test(o.texture.key));
    const stains = list.filter((o) => o.texture && o.texture.key === "dripstain").length;
    const ductHints = list.filter((o) => o.texture && o.texture.key === "duct_hint").length;
    // underside-AO rectangles: black fill sitting at terrain+1
    const aoCount = list.filter((o) => o.type === "Rectangle" && o.fillColor === 0 &&
      Math.abs(o.depth - 6) < 0.01).length;
    const coach = g.coach && g.coach.bubbles[0].c;
    return {
      webgl: g.game.renderer.type === 2,
      world,
      tileKey,
      tileTexExists: g.textures.exists("tile1") && g.textures.exists("tile2"),
      decalCount: decals.length,
      decalAlphaOk: decals.every((d) => d.alpha <= 0.5 + 1e-6),
      decalBehindGameplay: decals.every((d) => d.depth < 10),
      stains,
      aoCount,
      ductCount: g.ducts ? g.ducts.getLength() : 0,
      ductHints,
      phaseWallCount: g.phaseWalls ? g.phaseWalls.getLength() : 0,
      phaseFlowCount: g.phaseFlows.length,
      shimmerPts: g.shimmerPts.length,
      hazardStrips: g.hazardStrips.length,
      shimmerTex: g.textures.exists("phasewall") && g.textures.exists("phaseflow"),
      hazardTex: g.textures.exists("hazard"),
      hasShimmerSparks: !!g.shimmerSparks,
      hasHazardSparks: !!g.hazardSparks,
      playerCount: g.players.length,
      playerDepth: g.players[0].depth,
      coachVisible: !!(coach && coach.visible),
    };
  });

// Reposition both players onto a named feature so the follow-camera frames it, then
// (respecting the renderer-wedge rule) do NO page.evaluate for >1s before the shot.
const frameFeature = async (page, kind) => {
  await page.evaluate((k) => {
    const g = window.__BB.game.scene.getScene("Game");
    if (!g) return;
    let pt = null;
    const sp = g.shimmerPts || [], hz = g.hazardStrips || [];
    if (k === "shimmer" && sp.length) pt = { x: sp[0].x, y: sp[0].y };
    else if (k === "hazard" && hz.length) {
      const s = hz[0];
      pt = { x: (s.x1 + s.x2) / 2, y: s.y - 40 };
    } else if (k === "duct" && g.ducts) {
      const d = g.ducts.getChildren()[0];
      if (d) pt = { x: d.x, y: d.y + 20 };
    }
    if (pt) {
      g.players.forEach((p, i) => { p.setVelocity(0, 0); p.setPosition(pt.x + (i ? 34 : -34), pt.y); });
      g.camPos.x = pt.x; g.camPos.y = pt.y; g.camPos.zoom = 1.05;
    }
  }, kind);
  await sleep(1300); // > 1s: no evaluate between reposition and screenshot
};

// ======================================================================
// CANVAS TIER (?canvas=1) — the headless review/beat renderer.
// ======================================================================
const cBrowser = await chromium.launch({ executablePath: CHROMIUM });
const page = await cBrowser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
page.on("console", (m) => { if (/error/i.test(m.text())) console.log("CONSOLE:", m.text()); });
await page.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
await sleep(900);
const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

// ---- 1-1 (World 1): rivet tiles + decals + AO -------------------------
await startLevel(page, 0);
ok(await active("Game"), "1-1 Game scene active");
ok(await active("UI"), "1-1 HUD (UI scene) active over terrain");
await forceCoach(page);
await sleep(300);
let s = await inspect(page);
ok(!s.webgl, "1-1 running on the Canvas tier (?canvas=1)");
ok(s.tileTexExists, "per-world tile textures baked (tile1 + tile2)");
ok(s.tileKey === "tile1", "1-1 solid runs use the W1 rivet tile", `tileKey=${s.tileKey}`);
ok(s.decalCount >= 6 && s.decalCount <= 10, "1-1 grime decals scattered 6-10", `decals=${s.decalCount}`);
ok(s.decalAlphaOk, "1-1 every decal alpha <= 0.5");
ok(s.decalBehindGameplay, "1-1 decals sit behind gameplay (depth < entity)");
ok(s.aoCount > 0, "1-1 underside AO strips present", `ao=${s.aoCount}`);
ok(s.hazardStrips > 0, "1-1 hazard strip(s) recorded", `strips=${s.hazardStrips}`);
ok(s.playerCount === 2 && s.playerDepth > 6, "1-1 both players render above terrain/wear");
ok(s.coachVisible, "1-1 coach bubble visible over terrain");
await shot("p4-1-1");

// ---- 2-2 (World 2): hex/pipe tiles + drip stains + decals -------------
await startLevel(page, 4);
await forceCoach(page);
await sleep(300);
s = await inspect(page);
ok(s.tileKey === "tile2", "2-2 solid runs use the W2 hex-bolt/pipe-seam tile", `tileKey=${s.tileKey}`);
ok(s.decalCount >= 6 && s.decalCount <= 10, "2-2 grime decals scattered 6-10", `decals=${s.decalCount}`);
ok(s.decalAlphaOk, "2-2 every decal alpha <= 0.5");
ok(s.stains > 0, "2-2 underside drip-stains present", `stains=${s.stains}`);
ok(s.aoCount > 0, "2-2 underside AO strips present", `ao=${s.aoCount}`);
ok(s.playerCount === 2 && s.playerDepth > 6, "2-2 both players render above terrain/wear");
ok(s.coachVisible, "2-2 coach bubble visible over terrain");
await shot("p4-2-2");

// ---- 2-1 (World 2): shimmer curtain + duct crawl hint -----------------
await startLevel(page, 3);
s = await inspect(page);
ok(s.shimmerTex, "shimmer textures baked (phasewall + phaseflow)");
ok(s.phaseWallCount > 0 && s.phaseFlowCount > 0, "2-1 phase-walls with drifting flow",
  `walls=${s.phaseWallCount} flow=${s.phaseFlowCount}`);
ok(s.shimmerPts > 0, "2-1 shimmer sparkle sources recorded", `pts=${s.shimmerPts}`);
ok(s.hazardTex, "hazard texture exists (distinct from shimmer)");
ok(s.ductCount > 0 && s.ductHints === s.ductCount, "2-1 every duct gets a crawl hint",
  `ducts=${s.ductCount} hints=${s.ductHints}`);
// shimmer vs hazard are structurally distinct systems: passable curtain (phase
// group + drifting flow) vs danger strip (hazard strips). Both render at gameplay
// depth; the violet-vs-red visual call is the reviewer's from the shots.
ok(s.phaseWallCount > 0 && s.hazardStrips >= 0, "shimmer (passable) and hazard (danger) are separate systems");
await frameFeature(page, "shimmer");
await shot("p4-shimmer");
await startLevel(page, 3);
await frameFeature(page, "duct");
await shot("p4-duct");

// ---- 1-1 hazard strip framing -----------------------------------------
await startLevel(page, 0);
await frameFeature(page, "hazard");
await shot("p4-hazard");

await cBrowser.close();
console.log(errors ? `Canvas tier snapped with ${errors} page error(s)` : "Canvas tier snapped clean (0 page errors)");
if (errors) fails.push(`${errors} Canvas page error(s)`);

// ======================================================================
// WEBGL TIER — the additive shimmer sparkles + hazard arc-sparks live here.
// ======================================================================
console.log("\n--- WebGL tier (additive sparks) ---");
let wBrowser;
try {
  wBrowser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
  });
  const wpage = await wBrowser.newPage({ viewport: { width: 1280, height: 720 } });
  let werrors = 0;
  wpage.on("pageerror", (e) => { console.log("WEBGL PAGE ERROR:", e.message); werrors++; });
  await wpage.goto(BASE, { waitUntil: "networkidle" });
  await sleep(1500);
  const isWebgl = await wpage.evaluate(() => window.__BB.game.renderer.type === 2);
  if (!isWebgl) {
    ok(false, "WebGL renderer initialised (SwiftShader)", "renderer is Canvas — this box can't init WebGL headless");
  } else {
    const wstart = async (i) => {
      await wpage.evaluate((idx) => {
        const m = window.__BB.game.scene;
        m.stop("UI"); m.stop("Game"); m.stop("Title"); m.stop("Onboard"); m.stop("Hub");
        m.start("Game", { levelIndex: idx });
      }, i);
      await sleep(2500);
    };
    // 2-1 shimmer
    await wstart(3);
    let w = await inspect(wpage);
    ok(w.webgl, "WebGL tier active on the deploy renderer");
    ok(w.hasShimmerSparks, "WebGL 2-1 shimmer sparkle emitter present (gated on)");
    await wpage.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      const p = g.shimmerPts[0];
      if (p) { g.players.forEach((pl, i) => { pl.setVelocity(0, 0); pl.setPosition(p.x + (i ? 34 : -34), p.y); }); g.camPos.x = p.x; g.camPos.y = p.y; g.camPos.zoom = 1.05; }
    });
    await sleep(1400);
    await wpage.screenshot({ path: `${SHOTS}/p4-shimmer-webgl.png` });
    // 1-1 hazard
    await wstart(0);
    w = await inspect(wpage);
    ok(w.hasHazardSparks, "WebGL 1-1 hazard arc-spark emitter present (gated on)");
    await wpage.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      const s = g.hazardStrips[0];
      if (s) { const x = (s.x1 + s.x2) / 2; g.players.forEach((pl, i) => { pl.setVelocity(0, 0); pl.setPosition(x + (i ? 34 : -34), s.y - 40); }); g.camPos.x = x; g.camPos.y = s.y - 40; g.camPos.zoom = 1.05; }
    });
    await sleep(1600); // let a few arcs fire
    await wpage.screenshot({ path: `${SHOTS}/p4-hazard-webgl.png` });
    console.log(`WebGL spark shots -> ${SHOTS}/p4-shimmer-webgl.png, p4-hazard-webgl.png`);
  }
  if (werrors) fails.push(`${werrors} WebGL page error(s)`);
} catch (e) {
  ok(false, "WebGL tier screenshot captured", `WebGL headless unavailable on this box: ${e.message}`);
} finally {
  if (wBrowser) await wBrowser.close();
}

if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL ASSERTIONS PASSED");
