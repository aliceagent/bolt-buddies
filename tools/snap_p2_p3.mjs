// GFX P3 (World backdrop identity) acceptance probe.
//
// P3 renders a RENDERER-ADAPTIVE backdrop identity set. The deploy path is WebGL,
// which gets the full ambiance (per-world silhouette prop strip, additive fog band,
// pipe drips, dust-shaft beams, vignette). The software Canvas renderer used by the
// headless review/beat harness gets a LIGHTER tier — the cheap cached prop strip
// plus the tiny pooled drips — with every full-viewport composite (vignette, additive
// fog, dust beams) dropped, so the fps-sensitive 2-2 fan / 1-3 & 2-2 reel routes keep
// their headroom (measured: props-off runs the matrix 12/12 here). Both tiers keep
// every layer BELOW DEPTH.terrain, so players, the HUD and coach bubbles always
// render clearly over them.
//
// This probe verifies BOTH tiers:
//   Canvas (?canvas=1): prop strip + (W2) drips present; vignette + fog + dust
//     ABSENT (gated to WebGL); players + coach bubble + HUD above every layer.
//   WebGL (SwiftShader headless): the full ambiance present (fog=2, dust>=2,
//     vignette) — a single static screenshot (fps irrelevant for one frame).
//
// Shots -> tools/shots/p2/:
//   p3-1-1.png         Canvas tier, W1: prop strip + vignette over gameplay.
//   p3-2-2.png         Canvas tier, W2: prop strip + drips + vignette over gameplay.
//   p3-2-2-webgl.png   WebGL tier, W2: full fog + dust + props ambiance.
//
//   node tools/snap_p2_p3.mjs
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
  await sleep(1800); // intro banner + settle
};

// Force a coach bubble on player 0 so the occlusion check has one to inspect.
const forceCoach = (page) =>
  page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const p = g.players[0];
    g.coachShow(0, {
      tokens: [{ label: "LOOK!" }],
      caption: "coach bubble over backdrop",
      follow: { obj: p, dy: -60 },
      key: "probe", dur: 60000, colorP: 0,
    });
  });

// Snapshot the Game display list: which backdrop layers exist + their depths vs the
// player / coach / terrain reference depths, plus the active renderer tier.
const inspect = (page) =>
  page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const DEPTHS = { terrain: 5, player: 20 };
    const list = g.children.list;
    const propKey = g.propStrip ? g.propStrip.texture.key : null; // TileSprite hides source key
    const propOnList = !!(g.propStrip && list.includes(g.propStrip));
    const backdrop = list
      .filter((o) => typeof o.depth === "number" && o.depth < DEPTHS.terrain &&
        /Image|TileSprite|ParticleEmitter/.test(o.type))
      .map((o) => o.depth);
    const coach = g.coach && g.coach.bubbles[0].c;
    return {
      webgl: g.game.renderer.type === 2, // Phaser.WEBGL === 2, CANVAS === 1
      hasProp1: propOnList && g.textures.exists("propStrip1") && propKey !== "propStrip2",
      hasProp2: propOnList && g.textures.exists("propStrip2") && propKey !== "propStrip1",
      fogCount: (g.fogStrips && g.fogStrips.length) || 0,
      hasDrips: !!g.drips,
      dustCount: list.filter((o) => o.texture && o.texture.key === "dustShaft").length,
      hasVignette: list.filter((o) => o.texture && o.texture.key === "vignEdge").length === 4,
      maxBackdropDepth: backdrop.length ? Math.max(...backdrop) : -999,
      playerCount: g.players.length,
      playerDepth: g.players[0].depth,
      coachVisible: !!(coach && coach.visible),
      coachDepth: coach ? coach.depth : -1,
      terrainDepth: DEPTHS.terrain,
    };
  });

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

// ---- 1-1 (World 1) ----
await startLevel(page, 0);
ok(await active("Game"), "1-1 Game scene active");
ok(await active("UI"), "1-1 HUD (UI scene) active over the backdrop");
await forceCoach(page);
await sleep(300);
let s = await inspect(page);
ok(!s.webgl, "1-1 running on the Canvas tier (?canvas=1)");
ok(s.hasProp1, "1-1 W1 silhouette prop strip present (Canvas tier)");
ok(!s.hasVignette, "1-1 full-frame vignette gated OFF on Canvas");
ok(s.dustCount === 0, "1-1 additive dust beams gated OFF on Canvas", `dust=${s.dustCount}`);
ok(s.maxBackdropDepth < s.terrainDepth, "1-1 every backdrop layer sits below DEPTH.terrain",
  `maxBackdrop=${s.maxBackdropDepth} < terrain=${s.terrainDepth}`);
ok(s.playerCount === 2 && s.playerDepth > s.maxBackdropDepth, "1-1 both players render above the backdrop",
  `players=${s.playerCount} depth=${s.playerDepth}`);
ok(s.coachVisible && s.coachDepth > s.maxBackdropDepth, "1-1 coach bubble visible above the backdrop",
  `coachDepth=${s.coachDepth}`);
await shot("p3-1-1");

// ---- 2-2 (World 2) ----
await startLevel(page, 4);
ok(await active("Game"), "2-2 Game scene active");
ok(await active("UI"), "2-2 HUD (UI scene) active over the backdrop");
await forceCoach(page);
await sleep(500);
s = await inspect(page);
ok(!s.webgl, "2-2 running on the Canvas tier (?canvas=1)");
ok(s.hasProp2, "2-2 W2 silhouette prop strip present (Canvas tier)");
ok(s.hasDrips, "2-2 pooled drip emitter present (Canvas tier)");
ok(!s.hasVignette, "2-2 full-frame vignette gated OFF on Canvas");
ok(s.fogCount === 0, "2-2 additive fog gated OFF on Canvas", `fog=${s.fogCount}`);
ok(s.dustCount === 0, "2-2 additive dust beams gated OFF on Canvas", `dust=${s.dustCount}`);
ok(s.maxBackdropDepth < s.terrainDepth, "2-2 every backdrop layer sits below DEPTH.terrain",
  `maxBackdrop=${s.maxBackdropDepth} < terrain=${s.terrainDepth}`);
ok(s.playerCount === 2 && s.playerDepth > s.maxBackdropDepth, "2-2 both players render above the backdrop",
  `players=${s.playerCount} depth=${s.playerDepth}`);
ok(s.coachVisible && s.coachDepth > s.maxBackdropDepth, "2-2 coach bubble visible above the backdrop",
  `coachDepth=${s.coachDepth}`);
await shot("p3-2-2");
await cBrowser.close();
console.log(errors ? `Canvas tier snapped with ${errors} page error(s)` : "Canvas tier snapped clean (0 page errors)");
if (errors) fails.push(`${errors} Canvas page error(s)`);

// ======================================================================
// WEBGL TIER (SwiftShader headless) — the deploy renderer. Single static
// screenshot: fps is irrelevant for one frame even though WebGL is slow here.
// ======================================================================
console.log("\n--- WebGL tier (full ambiance) ---");
let wBrowser;
try {
  wBrowser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
  });
  const wpage = await wBrowser.newPage({ viewport: { width: 1280, height: 720 } });
  let werrors = 0;
  wpage.on("pageerror", (e) => { console.log("WEBGL PAGE ERROR:", e.message); werrors++; });
  await wpage.goto(BASE, { waitUntil: "networkidle" }); // no ?canvas=1 -> Phaser.AUTO picks WebGL
  await sleep(1500);
  const isWebgl = await wpage.evaluate(() => window.__BB.game.renderer.type === 2);
  if (!isWebgl) {
    ok(false, "WebGL renderer initialised (SwiftShader)", "renderer is Canvas — this box can't init WebGL headless");
  } else {
    await startLevel(wpage, 4);
    await sleep(5000); // WebGL headless is slow; also lets the intro banner clear for a clean ambiance frame
    const w = await inspect(wpage);
    ok(w.webgl, "WebGL tier active on the deploy renderer");
    ok(w.hasProp2, "WebGL 2-2 W2 prop strip present");
    ok(w.fogCount === 2, "WebGL 2-2 full additive fog = two strips", `fog=${w.fogCount}`);
    ok(w.dustCount >= 2 && w.dustCount <= 3, "WebGL 2-2 dust-shaft beams present", `dust=${w.dustCount}`);
    ok(w.hasDrips, "WebGL 2-2 drips present");
    ok(w.hasVignette, "WebGL 2-2 vignette present");
    await wpage.screenshot({ path: `${SHOTS}/p3-2-2-webgl.png` });
    console.log(`WebGL ambiance shot -> ${SHOTS}/p3-2-2-webgl.png`);
  }
  if (werrors) fails.push(`${werrors} WebGL page error(s)`);
} catch (e) {
  ok(false, "WebGL tier screenshot captured", `WebGL headless unavailable on this box: ${e.message}`);
} finally {
  if (wBrowser) await wBrowser.close();
}

if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL ASSERTIONS PASSED");
