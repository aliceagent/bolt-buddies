// GFX P5 (Causality wiring & machine detail) acceptance probe.
//
// P5 draws the WIRING that connects a lever/plate to the device it drives, plus
// richer per-device detail — all cosmetic overlays that READ the existing state
// and never gate/delay the byte-identical trigger logic.
//   - Conduit lines: dim static L-shaped polyline from every lever/plate to the
//     door/bridge it satisfies; on trigger it lights in the world accent + a
//     brief ~400ms travel pulse runs source→device (the logic still fires now).
//   - Doors: hinge caps + a small ID plate. Exit doors: marquee dot-lights
//     chasing the frame while open (additive glow WebGL-only, white on Canvas).
//   - Lift: rail grooves + a cable drum that rotates while moving; pips frame.
//   - Pedestal: two counter-scrolling alpha bands + rising glyph particles
//     (glyphs WebGL-only; the bands carry the read on Canvas).
//   - Bridge: a light sweeps tile-by-tile as the span solidifies.
//
// Shots -> tools/shots/p2/:
//   p5-lever-conduit.png / p5-lever-conduit-pulse.png  (2-1: lever→door, base + pulse)
//   p5-plate-conduit.png       (1-2: plate→door conduit)
//   p5-exit-marquee.png        (tutorial exit open, dot-lights chasing)
//   p5-lift.png                (1-1: rail groove + cable drum + pips frame)
//   p5-pedestal.png            (1-1: animated beam bands + glyphs)
//   p5-bridge-sweep.png        (1-1: bridge materialise sweep)
//
//   node tools/snap_p2_p5.mjs
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
    return !!(g && g.def && g.conduits !== undefined &&
      window.__BB.game.scene.isActive("Game"));
  }, null, { timeout: 8000 });
  await sleep(1500); // intro banner + settle
};

const inspect = (page) =>
  page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const c = g.conduits;
    return {
      webgl: g.game.renderer.type === 2,
      world: g.def.world,
      texturesOk: ["beamband", "pedglyph", "drum", "marqueedot"].every((k) => g.textures.exists(k)),
      conduitCount: c.length,
      conduitBehind: c.every((x) => x.base.depth < 10),
      conduits: c.map((x) => ({
        srcType: x.srcType, srcId: x.srcId, lit: x.lit,
        pN: { x: Math.round(x.pts[x.pts.length - 1].x), y: Math.round(x.pts[x.pts.length - 1].y) },
      })),
      marquee: !!(g.exitDoor && g.exitDoor.marquee),
      marqueeDots: g.exitDoor && g.exitDoor.marquee ? g.exitDoor.marquee.dots.length : 0,
      exitOpen: g.exitDoor ? g.exitDoor.open : null,
      liftHasDrum: g.lifts.length ? !!(g.lifts[0].drum && g.lifts[0].cable) : null,
      pedBands: g.pedestals.length ? (g.pedestals[0].bands ? g.pedestals[0].bands.length : 0) : 0,
      pedHasBeam: g.pedestals.length ? !!g.pedestals[0].beam : false,
      pedHasGlyph: g.pedestals.length ? !!g.pedestals[0].glyphEmit : false,
      playerCount: g.players.length,
      playerDepth: g.players[0].depth,
    };
  });

// Center the follow-camera on world coords and park both players there.
const frameAt = async (page, x, y, zoom = 1.05) => {
  await page.evaluate(({ x, y, zoom }) => {
    const g = window.__BB.game.scene.getScene("Game");
    g.players.forEach((p, i) => { p.setVelocity(0, 0); p.setPosition(x + (i ? 30 : -30), y); });
    g.camPos.x = x; g.camPos.y = y; g.camPos.zoom = zoom;
  }, { x, y, zoom });
  await sleep(1300); // > 1s: honour the renderer-wedge rule before the shot
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

// ---- 2-1: lever→door conduit (base + travel pulse) --------------------
await startLevel(page, 3);
ok(await active("Game"), "2-1 Game scene active");
ok(await active("UI"), "2-1 HUD (UI scene) active over wiring");
let s = await inspect(page);
ok(!s.webgl, "running on the Canvas tier (?canvas=1)");
ok(s.texturesOk, "P5 device textures baked (beamband/pedglyph/drum/marqueedot)");
ok(s.conduitCount >= 2, "2-1 conduits traced from levers to their doors", `n=${s.conduitCount}`);
ok(s.conduitBehind, "2-1 conduits sit behind devices (depth < entity)");
const has = (id) => s.conduits.find((x) => x.srcId === id);
ok(!!has("lvP1") && !!has("lvT1"), "2-1 lvP1 & lvT1 each drive a conduit");
// lvP1 drives door dT1 (tile x20,y10,h4 -> centre x=984, y=576); check endpoint.
const cP1 = has("lvP1");
ok(cP1 && Math.abs(cP1.pN.x - 984) < 8 && Math.abs(cP1.pN.y - 576) < 8,
  "2-1 lvP1's conduit terminates at door dT1's centre", cP1 ? `pN=${cP1.pN.x},${cP1.pN.y}` : "missing");
ok(s.playerCount === 2 && s.playerDepth > 8, "2-1 players render above the wiring");
// frame the lvP1 -> dT1 pair and capture the dim base line
const lp = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const l = g.levers.find((v) => v.id === "lvP1");
  const d = g.doors.find((x) => x.id === "dT1");
  return { lx: l.x, ly: l.y, dx: d.wireX, dy: d.wireY };
});
await frameAt(page, (lp.lx + lp.dx) / 2, (lp.ly + lp.dy) / 2 + 10, 0.95);
await shot("p5-lever-conduit");
// fire the lever (logic + cosmetic pulse); NO player reposition here, so the
// wedge rule is satisfied. Grab a frame mid-pulse (~180ms into the 400ms run).
await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  g.pullLever(g.levers.find((v) => v.id === "lvP1"));
});
await sleep(190);
await shot("p5-lever-conduit-pulse");
s = await inspect(page);
ok(!!has("lvP1"), "2-1 lvP1 conduit still present after trigger");
const litNow = (await inspect(page)).conduits.find((x) => x.srcId === "lvP1");
ok(litNow && litNow.lit, "2-1 lvP1 conduit lights on trigger (base redrawn to accent)");

// ---- 1-2: plate→door conduit ------------------------------------------
await startLevel(page, 1);
s = await inspect(page);
const has2 = (id) => s.conduits.find((x) => x.srcId === id);
ok(s.conduitCount >= 1, "1-2 conduits traced", `n=${s.conduitCount}`);
ok(!!has2("plA"), "1-2 plate plA drives a conduit to door b1");
ok(!!has2("pl2") && !!has2("lv2"), "1-2 door d2 wired from BOTH plate pl2 and lever lv2");
const pcoord = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const pl = g.plates.find((p) => p.id === "plA");
  const d = g.doors.find((x) => x.id === "b1");
  return { px: pl.rect.centerX, py: pl.rect.y, dx: d.wireX, dy: d.wireY };
});
await frameAt(page, (pcoord.px + pcoord.dx) / 2, (pcoord.py + pcoord.dy) / 2, 0.95);
// light the plate conduit cosmetically for the shot (same overlay call the plate
// makes on activation — does not touch the weight/eval logic)
await page.evaluate(() => window.__BB.game.scene.getScene("Game").fireConduits("plate", "plA"));
await sleep(150);
await shot("p5-plate-conduit");

// ---- tutorial: exit marquee chase -------------------------------------
await startLevel(page, 12);
s = await inspect(page);
ok(s.marquee, "tutorial exit door has a marquee");
ok(s.marqueeDots >= 8, "tutorial exit marquee has a ring of dots", `dots=${s.marqueeDots}`);
ok(s.exitOpen === true, "tutorial exit is open (marquee chasing)");
const ex = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  return { x: g.exitDoor.wireX, y: g.exitDoor.wireY };
});
// park players just LEFT of the exit zone (both < exitX-48) so framing the open
// door does not complete the level; the door still fills the right of frame.
await frameAt(page, ex.x - 95, ex.y, 1.0);
await shot("p5-exit-marquee");

// ---- 1-1: lift (rail + drum), pedestal (beam), bridge sweep -----------
await startLevel(page, 0);
s = await inspect(page);
ok(s.liftHasDrum, "1-1 lift has a cable drum + cable");
ok(s.pedHasBeam, "1-1 pedestal has an animated holo-beam");
ok(s.pedBands === 0 && !s.pedHasGlyph, "1-1 Canvas: bands/glyphs WebGL-gated (holo-beam is the Canvas read)", `bands=${s.pedBands}`);
const coords = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const lf = g.lifts[0];
  const pd = g.pedestals[0];
  const br = g.bridges[0];
  const lv = g.levers.find((v) => v.id === "lv1");
  return {
    lift: { x: lf.img.x, y: (lf.topY + lf.botY) / 2 },
    ped: { x: pd.x, y: pd.y - 40 },
    bridge: { x: br.wireX, y: br.wireY, lever: lv ? { x: lv.x, y: lv.y } : null },
  };
});
await frameAt(page, coords.lift.x, coords.lift.y, 1.0);
await shot("p5-lift");
await frameAt(page, coords.ped.x, coords.ped.y, 1.0);
await shot("p5-pedestal");
// bridge sweep: frame the span, then pull lv1 (opens the bridge) and grab a
// frame while the materialise light sweeps tile-by-tile.
await frameAt(page, coords.bridge.x, coords.bridge.y - 20, 0.9);
await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  g.pullLever(g.levers.find((v) => v.id === "lv1"));
});
await sleep(220);
await shot("p5-bridge-sweep");

await cBrowser.close();
console.log(errors ? `Canvas tier snapped with ${errors} page error(s)` : "Canvas tier snapped clean (0 page errors)");
if (errors) fails.push(`${errors} Canvas page error(s)`);

// ======================================================================
// WEBGL TIER — the pedestal beam bands + rising glyph particles live here.
// ======================================================================
console.log("\n--- WebGL tier (pedestal beam bands + glyphs) ---");
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
      m.start("Game", { levelIndex: 0 });
    });
    await sleep(2500);
    const w = await wpage.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      return {
        webgl: g.game.renderer.type === 2,
        pedBands: g.pedestals[0].bands.length,
        pedGlyph: !!g.pedestals[0].glyphEmit,
      };
    });
    ok(w.webgl, "WebGL tier active on the deploy renderer");
    ok(w.pedBands === 2, "WebGL pedestal has two counter-scrolling bands", `bands=${w.pedBands}`);
    ok(w.pedGlyph, "WebGL pedestal has the rising glyph emitter");
    await wpage.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      const pd = g.pedestals[0];
      g.players.forEach((p, i) => { p.setVelocity(0, 0); p.setPosition(pd.x + (i ? 30 : -30), pd.y); });
      g.camPos.x = pd.x; g.camPos.y = pd.y - 40; g.camPos.zoom = 1.05;
    });
    await sleep(1400);
    await wpage.screenshot({ path: `${SHOTS}/p5-pedestal-webgl.png` });
    console.log(`WebGL pedestal shot -> ${SHOTS}/p5-pedestal-webgl.png`);
  }
  if (werrors) fails.push(`${werrors} WebGL page error(s)`);
} catch (e) {
  ok(false, "WebGL tier screenshot captured", `WebGL headless unavailable on this box: ${e.message}`);
} finally {
  if (wBrowser) await wBrowser.close();
}

if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL ASSERTIONS PASSED");
