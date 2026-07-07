// GFX P6 (Robot life — RE-SCOPED TO STATIC ART ONLY) acceptance probe.
//
// P6 is static art + basic placement only (per the binding ANIM re-scope): NO
// character motion/rigging. This sprint draws & places three things:
//   1. SHADOW BLOB: a soft drawn ellipse pinned under each robot on the ground,
//      shrinking as the robot lifts off it, hidden while the buddy is carried.
//      Depth below the robot, above terrain.
//   2. PHASE AFTERIMAGE: while a phase robot is mid-phase (in a wall / moving),
//      3 position-lagged ghost copies (alpha 0.2/0.12/0.06) fed from a pooled,
//      fixed-length pose ring buffer, plus a violet edge-shimmer overlay while
//      inPhaseWall (additive glow WebGL-gated; baked-violet art on Canvas).
//   3. CARRIED-POSE ART: a carried buddy swaps to an "arms-up" pose texture so
//      it reads as being held overhead.
//
// Shots -> tools/shots/p2/:
//   p6-shadow.png       (1-1: both robots grounded, shadow blobs under them)
//   p6-shadow-jump.png  (1-1: one robot mid-jump, its shadow shrunk on the ground)
//   p6-carried.png      (1-1: carrier holding buddy in arms-up pose; carrier
//                        shadow present, carried buddy's shadow hidden)
//   p6-phase.png        (2-3: phase robot mid-phase — 3 lagged ghosts + edge shimmer)
//   p6-phase-webgl.png  (2-3 on the deploy renderer: additive edge-glow)
//
//   node tools/snap_p2_p6.mjs
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
  await page.waitForFunction(() => {
    const g = window.__BB.game.scene.getScene("Game");
    return !!(g && g.def && g.players && g.players.length === 2 &&
      window.__BB.game.scene.isActive("Game"));
  }, null, { timeout: 8000 });
  await sleep(1500); // intro banner + settle
};

// Park both players on a chosen world point + centre the follow camera there.
const frameAt = async (page, x, y, zoom = 1.0) => {
  await page.evaluate(({ x, y, zoom }) => {
    const g = window.__BB.game.scene.getScene("Game");
    g.players.forEach((p, i) => { p.setVelocity(0, 0); p.setPosition(x + (i ? 46 : -46), y); });
    g.camPos.x = x; g.camPos.y = y; g.camPos.zoom = zoom;
  }, { x, y, zoom });
  await sleep(1300); // > 1s: honour the renderer-wedge rule before any shot/eval
};

const cBrowser = await chromium.launch({ executablePath: CHROMIUM });
const page = await cBrowser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
page.on("console", (m) => { if (/error/i.test(m.text())) console.log("CONSOLE:", m.text()); });
await page.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
await sleep(900);
const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

// =====================================================================
// 1-1 — SHADOW BLOB (grounded + mid-jump shrink) and CARRIED POSE
// =====================================================================
await startLevel(page, 0);
ok(await active("Game"), "1-1 Game scene active");
ok(await active("UI"), "1-1 HUD (UI scene) active over the robots");

let s = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  return {
    webgl: g.game.renderer.type === 2,
    texturesOk: ["shadow", "phaseedge", "robot_b_carry", "robot_o_carry"].every((k) => g.textures.exists(k)),
    shadowDepth: g.players[0].shadow.depth,
    terrainDepth: 5,
    playerDepth: g.players[0].depth,
    ghostN: g.players[0].phaseGhosts.length,
    ringN: g.players[0]._poseRing.length,
    hints: g.actionHints ? g.actionHints.length : 0,
  };
});
ok(!s.webgl, "running on the Canvas tier (?canvas=1)");
ok(s.texturesOk, "P6 art baked (shadow / phaseedge / robot_*_carry)");
ok(s.shadowDepth > s.terrainDepth && s.shadowDepth < s.playerDepth,
  "shadow depth sits above terrain and below the robot", `shadow=${s.shadowDepth} player=${s.playerDepth}`);
ok(s.ghostN === 3, "each robot owns 3 pooled phase-ghost copies", `n=${s.ghostN}`);
ok(s.ringN >= 12, "pose ring buffer is preallocated (fixed length, no per-frame alloc)", `len=${s.ringN}`);

// grounded: both robots on the start floor, shadows under them
await frameAt(page, 300, 648, 1.0);
let g0 = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  return g.players.map((p) => ({
    vis: p.visible,
    sVis: p.shadow.visible,
    sScaleX: +p.shadow.scaleX.toFixed(3),
    baseSX: +p.baseScaleX.toFixed(3),
    grounded: p.grounded,
    sy: Math.round(p.shadow.y),
    groundY: Math.round(p._groundY),
  }));
});
ok(g0.every((p) => p.vis), "both robots visible");
ok(g0.every((p) => p.sVis), "both robots have a visible shadow blob on the ground");
ok(g0.every((p) => Math.abs(p.sScaleX - p.baseSX) < 0.05),
  "grounded shadow is at (near) full size", `sx=${g0.map((p) => p.sScaleX)}`);
ok(g0.every((p) => Math.abs(p.sy - p.groundY) < 6), "shadow sits on the ground line", `sy=${g0.map((p) => p.sy)}`);
await shot("p6-shadow");

// mid-jump: lift player 0 clear of the ground (gravity paused so the frame holds
// a real airborne pose — the variable-jump cut would otherwise clamp a keyless
// hop to ~24px). Its shadow must stay on the ground line and shrink with height.
await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0];
  p.body.setAllowGravity(false);
  p.setVelocity(0, 0);
  p.setPosition(p.x, p._groundY - 132); // feet ~132px off the ground
});
await sleep(150);
let gj = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0];
  return {
    lift: Math.round(p._groundY - p.body.bottom),
    sScaleX: +p.shadow.scaleX.toFixed(3),
    baseSX: +p.baseScaleX.toFixed(3),
    sy: Math.round(p.shadow.y),
    groundY: Math.round(p._groundY),
    sVis: p.shadow.visible,
  };
});
ok(gj.lift > 90, "player 0 is airborne (well off the ground)", `lift=${gj.lift}px`);
ok(gj.sScaleX < gj.baseSX - 0.2, "airborne shadow has visibly shrunk", `sx=${gj.sScaleX} base=${gj.baseSX}`);
ok(Math.abs(gj.sy - gj.groundY) < 6 && gj.sVis, "airborne shadow stays pinned to the ground", `sy=${gj.sy} groundY=${gj.groundY}`);
await shot("p6-shadow-jump");
// restore gravity so the carry sequence starts from a clean grounded state
await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  g.players[0].body.setAllowGravity(true);
});

// CARRIED POSE: settle on the ground, then have player 0 pick up player 1.
await frameAt(page, 300, 648, 1.05);
await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  g.pickupPartner(g.players[0], g.players[1]);
});
await sleep(500); // carry pose applies + carried buddy snaps overhead
let cs = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const carrier = g.players[0], carried = g.players[1];
  return {
    carriedTex: carried.texture.key,
    carrierTex: carrier.texture.key,
    carriedShadowVis: carried.shadow.visible,
    carrierShadowVis: carrier.shadow.visible,
    carriedVis: carried.visible,
    held: carried.carriedBy === carrier && carrier.carrying === carried,
  };
});
ok(cs.held, "player 0 is carrying player 1");
ok(/_carry$/.test(cs.carriedTex), "carried buddy shows the arms-up carry pose texture", cs.carriedTex);
ok(!/_carry$/.test(cs.carrierTex), "carrier keeps its normal pose", cs.carrierTex);
ok(cs.carriedVis, "carried buddy is visible");
ok(cs.carrierShadowVis, "carrier still casts its shadow");
ok(!cs.carriedShadowVis, "carried buddy's shadow is HIDDEN while held");
await shot("p6-carried");

// =====================================================================
// 2-3 — PHASE AFTERIMAGE (3 lagged ghosts) + EDGE SHIMMER
// =====================================================================
await startLevel(page, 5);
// give player 0 the phase skill and stand it in the twin shimmer columns at
// tiles x9/x10 (a 2-tile-wide phase-wall run on the tunnel floor, row 13).
const SHIM_Y = 13 * 48 + 24; // row 13 feet line
await page.evaluate((y) => {
  const g = window.__BB.game.scene.getScene("Game");
  g.players[0].setSkill("phase");
  g.players[1].setPosition(9 * 48 + 24 - 200, y); // partner well out of the way
  g.players[1].setVelocity(0, 0);
  g.players[0].setPosition(9 * 48 + 24, y);
  g.players[0].setVelocity(0, 0);
  g.camPos.x = (9.5 * 48) + 24; g.camPos.y = y - 20; g.camPos.zoom = 1.15;
}, SHIM_Y);
await sleep(1300); // wedge-safe settle after repositioning both players

// walk player 0 rightward THROUGH the shimmer columns, feeding the pose ring so
// the 3 ghost copies spread out behind it. Only ONE player moves here.
for (let i = 0; i < 16; i++) {
  await page.evaluate(({ i, y }) => {
    const g = window.__BB.game.scene.getScene("Game");
    const p = g.players[0];
    p.setPosition(9 * 48 + 12 + i * 5, y); // 444 -> 519, all inside the x9/x10 shimmer
    p.setFlipX(false); p.facing = 1;
    p.body.velocity.x = 90; // "moving" for the ghost gate; damped by physics anyway
  }, { i, y: SHIM_Y });
  await sleep(45);
}
await sleep(60);
let ph = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0];
  return {
    skill: p.skill,
    inWall: p.inPhaseWall,
    ghostsVisible: p.phaseGhosts.filter((gh) => gh.visible).length,
    ghostAlphas: p.phaseGhosts.map((gh) => (gh.visible ? +gh.alpha.toFixed(2) : null)),
    ghostXs: p.phaseGhosts.map((gh) => (gh.visible ? Math.round(gh.x) : null)),
    edgeVis: p.phaseEdge.visible,
    ghostDepth: p.phaseGhosts[0].depth,
    playerDepth: p.depth,
    poseCount: p._poseCount,
  };
});
ok(ph.skill === "phase", "player 0 is a phase-walker");
ok(ph.inWall, "player 0 is inside a phase-wall (mid-phase)");
ok(ph.ghostsVisible === 3, "all 3 lagged ghost copies are rendered", `visible=${ph.ghostsVisible}`);
ok(JSON.stringify(ph.ghostAlphas) === JSON.stringify([0.2, 0.12, 0.06]),
  "ghost copies fade 0.2 / 0.12 / 0.06", `alphas=${ph.ghostAlphas}`);
ok(ph.ghostXs[0] !== ph.ghostXs[2], "ghost copies are position-lagged (spread apart)", `xs=${ph.ghostXs}`);
ok(ph.ghostDepth < ph.playerDepth, "ghosts render behind the robot", `ghost=${ph.ghostDepth} player=${ph.playerDepth}`);
ok(ph.edgeVis, "edge-shimmer overlay is showing while inPhaseWall");
await shot("p6-phase");

await cBrowser.close();
console.log(errors ? `Canvas tier snapped with ${errors} page error(s)` : "Canvas tier snapped clean (0 page errors)");
if (errors) fails.push(`${errors} Canvas page error(s)`);

// =====================================================================
// WEBGL TIER — the additive edge-shimmer glow lives here.
// =====================================================================
console.log("\n--- WebGL tier (phase edge-shimmer glow) ---");
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
    await wpage.evaluate(() => {
      const m = window.__BB.game.scene;
      m.stop("UI"); m.stop("Game"); m.stop("Title"); m.stop("Onboard"); m.stop("Hub");
      m.start("Game", { levelIndex: 5 });
    });
    await sleep(2200);
    const SY = 13 * 48 + 24;
    await wpage.evaluate((y) => {
      const g = window.__BB.game.scene.getScene("Game");
      g.players[0].setSkill("phase");
      g.players[1].setPosition(9 * 48 + 24 - 200, y);
      g.players[0].setPosition(9 * 48 + 24, y);
      g.camPos.x = (9.5 * 48) + 24; g.camPos.y = y - 20; g.camPos.zoom = 1.15;
    }, SY);
    await sleep(1300);
    for (let i = 0; i < 16; i++) {
      await wpage.evaluate(({ i, y }) => {
        const g = window.__BB.game.scene.getScene("Game");
        const p = g.players[0];
        p.setPosition(9 * 48 + 12 + i * 5, y);
        p.setFlipX(false); p.facing = 1; p.body.velocity.x = 90;
      }, { i, y: SY });
      await sleep(45);
    }
    await sleep(60);
    const w = await wpage.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      const p = g.players[0];
      return {
        webgl: g.game.renderer.type === 2,
        edgeVis: p.phaseEdge.visible,
        edgeAdditive: p.phaseEdge.blendMode === Phaser.BlendModes.ADD,
        ghostsVisible: p.phaseGhosts.filter((gh) => gh.visible).length,
      };
    });
    ok(w.webgl, "WebGL tier active on the deploy renderer");
    ok(w.edgeVis, "WebGL edge-shimmer overlay showing");
    ok(w.edgeAdditive, "WebGL edge-shimmer uses ADD blend (glow gated to WebGL)");
    ok(w.ghostsVisible === 3, "WebGL: 3 ghost copies render", `visible=${w.ghostsVisible}`);
    await wpage.screenshot({ path: `${SHOTS}/p6-phase-webgl.png` });
    console.log(`WebGL phase shot -> ${SHOTS}/p6-phase-webgl.png`);
  }
  if (werrors) fails.push(`${werrors} WebGL page error(s)`);
} catch (e) {
  ok(false, "WebGL tier screenshot captured", `WebGL headless unavailable on this box: ${e.message}`);
} finally {
  if (wBrowser) await wBrowser.close();
}

if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL ASSERTIONS PASSED");
