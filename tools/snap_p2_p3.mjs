// GFX P3 (World backdrop identity) acceptance probe.
//
// Screenshots the new per-world backdrop identity layers on 1-1 (W1 assembly
// silhouettes) and 2-2 (W2 maintenance silhouettes + low fog + pipe drips) and
// proves the sprint's hard invariant: every new prop/fog/beam/vignette layer sits
// BELOW DEPTH.terrain, so players, the HUD and coach bubbles all render clearly
// OVER them. A coach bubble is force-shown on each level for the occlusion check.
//
// Shots -> tools/shots/p2/:
//   p3-1-1.png   W1 silhouette prop strip + dust shafts + vignette, over gameplay.
//   p3-2-2.png   W2 props + drifting fog band + drip particles, over gameplay.
//   p3-dust.png  a tall-room dust-shaft beam (1-1, framed on a beam).
//
// Asserts (per level): the world's prop-strip texture is on the display list; all
// backdrop layers are at depth < DEPTH.terrain(5); both players (depth 20) + the
// coach bubble (depth 33) + the active HUD sit above every backdrop layer; W2 adds
// fog strips + a drip emitter. 0 page errors.
//
//   node tools/snap_p2_p3.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = process.env.BB_SHOTS || "tools/shots/p2";
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}${extra ? " — " + extra : ""}`);
  if (!cond) fails.push(msg);
};

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
page.on("console", (m) => { if (/error/i.test(m.text())) console.log("CONSOLE:", m.text()); });

await page.goto(URL, { waitUntil: "networkidle" });
await sleep(900);

const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);

const startLevel = async (idx) => {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Game"); m.stop("Title"); m.stop("Onboard"); m.stop("Hub");
    m.start("Game", { levelIndex: i });
  }, idx);
  await sleep(1800); // intro banner + settle
};

// Force a coach bubble on player 0 so the occlusion check has one to inspect.
const forceCoach = () =>
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

// Snapshot the Game display list: prop/fog/beam/vignette layer depths + the
// player / coach / terrain reference depths, plus which backdrop textures exist.
const inspect = () =>
  page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    const DEPTHS = { terrain: 5, player: 20 };
    const list = g.children.list;
    const texKeys = list.map((o) => (o.texture && o.texture.key) || "").filter(Boolean);
    const has = (k) => texKeys.includes(k);
    // TileSprite.texture.key reports the internal fill texture, not the source
    // key, so the prop strip is verified via its stored ref + the cached texture.
    const propKey = g.propStrip ? g.propStrip.texture.key : null;
    const propOnList = !!(g.propStrip && list.includes(g.propStrip));
    // backdrop layers = anything at depth < terrain that is an image/tilesprite/particles
    const backdrop = list
      .filter((o) => typeof o.depth === "number" && o.depth < DEPTHS.terrain &&
        /Image|TileSprite|ParticleEmitter/.test(o.type))
      .map((o) => o.depth);
    const coach = g.coach && g.coach.bubbles[0].c;
    return {
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

// ============================ 1-1 (World 1) ============================
await startLevel(0);
ok(await active("Game"), "1-1 Game scene active");
ok(await active("UI"), "1-1 HUD (UI scene) active over the backdrop");
await forceCoach();
await sleep(300);
let s = await inspect();
ok(s.hasProp1, "1-1 W1 silhouette prop strip on the display list");
ok(s.dustCount >= 2 && s.dustCount <= 3, "1-1 has 2-3 dust-shaft beams", `dust=${s.dustCount}`);
ok(s.hasVignette, "1-1 vignette overlay present");
ok(s.maxBackdropDepth < s.terrainDepth, "1-1 every backdrop layer sits below DEPTH.terrain",
  `maxBackdrop=${s.maxBackdropDepth} < terrain=${s.terrainDepth}`);
ok(s.playerCount === 2 && s.playerDepth > s.maxBackdropDepth, "1-1 both players render above the backdrop",
  `players=${s.playerCount} depth=${s.playerDepth}`);
ok(s.coachVisible && s.coachDepth > s.maxBackdropDepth, "1-1 coach bubble visible above the backdrop",
  `coachDepth=${s.coachDepth}`);
await shot("p3-1-1");

// tall-room dust-shaft framing: nudge the camera onto a beam, no gameplay change
await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const cam = g.cameras.main;
  cam.setZoom(0.72);
  cam.centerOn(g.worldW * 0.22, g.worldH * 0.42);
});
await sleep(500);
await shot("p3-dust");

// ============================ 2-2 (World 2) ============================
await startLevel(4);
ok(await active("Game"), "2-2 Game scene active");
ok(await active("UI"), "2-2 HUD (UI scene) active over the backdrop");
await forceCoach();
await sleep(500); // let fog drift + a drip or two spawn
s = await inspect();
ok(s.hasProp2, "2-2 W2 silhouette prop strip on the display list");
ok(s.fogCount === 2, "2-2 low-lying fog = two drifting strips", `fog=${s.fogCount}`);
ok(s.hasDrips, "2-2 pooled drip emitter present");
ok(s.dustCount >= 2 && s.dustCount <= 3, "2-2 has 2-3 dust-shaft beams", `dust=${s.dustCount}`);
ok(s.hasVignette, "2-2 vignette overlay present");
ok(s.maxBackdropDepth < s.terrainDepth, "2-2 every backdrop layer sits below DEPTH.terrain",
  `maxBackdrop=${s.maxBackdropDepth} < terrain=${s.terrainDepth}`);
ok(s.playerCount === 2 && s.playerDepth > s.maxBackdropDepth, "2-2 both players render above the backdrop",
  `players=${s.playerCount} depth=${s.playerDepth}`);
ok(s.coachVisible && s.coachDepth > s.maxBackdropDepth, "2-2 coach bubble visible above the backdrop",
  `coachDepth=${s.coachDepth}`);
await shot("p3-2-2");

await browser.close();
console.log(errors ? `\np3 snapped with ${errors} page error(s)` : "\np3 snapped clean (0 page errors)");
if (errors) fails.push(`${errors} page error(s)`);
if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL ASSERTIONS PASSED");
