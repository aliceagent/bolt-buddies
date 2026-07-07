// GFX P8 (Light & atmosphere) acceptance probe.
//
// P8 places STATIC additive light-pool images under every lamp / lit door lamp /
// active checkpoint / pedestal / exit marquee / roller alert lamp, plus a
// flickering pool over each hazard run. Additive glow is WebGL-gated; on the
// Canvas tier (this probe's default, ?canvas=1) pools fall back to a cheap
// non-additive neutral dot. Shots:
//   p8-1-2.png        (1-2 crusher hall — pools under lamps/devices, Canvas)
//   p8-hazard-glow.png(1-2 electric chasm — flickering hazard glow, Canvas)
//   p8-2-3.png        (2-3 tunnel — dimmer W2 pools, Canvas)
//   p8-webgl-1-2.png  (1-2 — FULL additive pools on the WebGL tier)
//
//   node tools/snap_p2_p8.mjs
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

// Snapshot of the light-pool system for a live Game scene.
const poolInfo = (page) => page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  return {
    webgl: g.game.renderer.type === 2,
    hasTex: g.textures.exists("lightpool") && g.textures.exists("toplight"),
    count: g.lightPools ? g.lightPools.length : -1,
    poolDim: g._poolDim,
    world: g.def.world,
    players: g.players.every((p) => p.visible),
    uiActive: window.__BB.game.scene.isActive("UI"),
    depthOK: g.lightPools && g.lightPools.every((p) => p.depth < 10), // below entities
  };
});

// A device with a pool to centre on (pedestal preferred, else exit door).
const devicePoint = (page) => page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.pedestals && g.pedestals[0];
  const pt = p ? { x: p.x, y: p.y } : { x: g.exitDoor.zone.centerX, y: g.exitDoor.baseY };
  return { x: Math.round(pt.x), y: Math.round(pt.y) };
});

const run = async (canvas) => {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  let errors = 0;
  page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
  page.on("console", (m) => { if (/error/i.test(m.text())) console.log("CONSOLE:", m.text()); });
  await page.goto(`${BASE}/${canvas ? "?canvas=1" : ""}`, { waitUntil: "networkidle" });
  await sleep(900);
  const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
  const tier = canvas ? "Canvas" : "WebGL";

  // ---- 1-2 : crusher hall with pools under lamps/devices --------------------
  await startLevel(page, 1);
  const i12 = await poolInfo(page);
  ok(i12.webgl === !canvas, `1-2 running on the ${tier} tier`);
  ok(i12.hasTex, "lightpool + toplight textures baked at boot");
  ok(i12.count > 0, "1-2 has light pools under its devices", `count=${i12.count}`);
  ok(i12.count <= 40, "1-2 pools within the ≤40/level cap", `count=${i12.count}`);
  ok(i12.depthOK, "pools sit BELOW gameplay entities (depth < 10)");
  ok(i12.uiActive, "1-2 HUD (UI scene) active over the lighting");
  const d12 = await devicePoint(page);
  await frameAt(page, d12.x, d12.y - 10, 1.25);
  const v12 = await poolInfo(page);
  ok(v12.players, "both robots clearly visible over the light pools");
  await shot(canvas ? "p8-1-2" : "p8-webgl-1-2");

  if (canvas) {
    // ---- 1-2 hazard chasm : flickering hazard glow pool ---------------------
    // electric chasm runs x=41..51 at row 16 (y*48). Hover the robots (gravity
    // off) just above it so the hazard pool photographs without a death.
    const hz = await page.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      const cx = 46 * 48, hazY = 16 * 48; // electric-chasm row
      g.players.forEach((p, i) => {
        p.body.setAllowGravity(false); p.setVelocity(0, 0);
        p.setPosition(cx + (i ? 40 : -40), hazY - 66); // hover above the chasm
      });
      // centre the chasm mid-frame (above the KOBI blip bar) so its red pool reads
      g.camPos.x = cx; g.camPos.y = hazY - 10; g.camPos.zoom = 1.35;
      // any hazard pool present?
      return { hazPools: g._flickBuckets.reduce((a, b) => a + b.length, 0) };
    });
    ok(hz.hazPools > 0, "1-2 hazard chasm has a flickering glow pool", `hazPools=${hz.hazPools}`);
    await sleep(1300);
    // hush the transient level-start KOBI blip so it doesn't overlap the low chasm
    await page.evaluate(() => {
      const ui = window.__BB.game.scene.getScene("UI");
      ui.blipActive = null; ui.blipQueue.length = 0; ui.blipBar.setVisible(false);
    });
    await sleep(200);
    await shot("p8-hazard-glow");

    // ---- 2-3 : W2 tunnel, dimmer pools --------------------------------------
    await startLevel(page, 5);
    const i23 = await poolInfo(page);
    ok(i23.world === 2, "2-3 is a World-2 level");
    ok(i23.count > 0 && i23.count <= 40, "2-3 pools present and within cap", `count=${i23.count}`);
    ok(i23.poolDim < 0.7, "W2 light pools are dimmer (_poolDim < 0.7)", `poolDim=${i23.poolDim}`);
    const d23 = await devicePoint(page);
    await frameAt(page, d23.x, d23.y - 10, 1.25);
    const v23 = await poolInfo(page);
    ok(v23.players, "2-3 both robots visible over the dimmer pools");
    await shot("p8-2-3");
  }

  await browser.close();
  console.log(errors ? `${tier} snapped with ${errors} page error(s)` : `${tier} snapped clean (0 page errors)`);
  if (errors) fails.push(`${errors} ${tier} page error(s)`);
};

await run(true);  // Canvas tier: main shots + cheap fallback pools
await run(false); // WebGL tier: full additive pools

if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL ASSERTIONS PASSED");
