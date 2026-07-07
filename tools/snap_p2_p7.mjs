// GFX P7 (Enemy character 2.0 — RE-SCOPED TO STATIC ART ONLY) acceptance probe.
//
// P7 draws STATIC enemy art + STATE-DRIVEN texture swaps only; NO continuous
// motion (feeler twitch, wheel spin, lamp spin, warden sway, crane iris tracking
// and dynamic cable sag/swing all belong to ANIM A5-A8 and are NOT implemented).
// This probe snaps one shot per enemy (and the key states) on the Canvas tier:
//   p7-scuttlebug.png    (1-1: W2 hex-shell shell variant)
//   p7-scuttle-splat.png (1-1: squish leaves a pooled splat decal, fades ~2s)
//   p7-roller.png        (2-1: KOBI single-eye cab decal + warning lamp + wheels)
//   p7-warden.png        (2-3: riveted face-plate + visor glow + chest badge #)
//   p7-warden-defeat.png (2-3: cross-eye X defeat pose, swapped by the defeat state)
//   p7-crane.png         (1-3: cabin KOBI eye + catenary cable/hook + pristine plates)
//   p7-crane-cracked.png (1-3: later-stage deepened plate cracks via stage swap)
//
//   node tools/snap_p2_p7.mjs
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

// Centre the camera on a point WITHOUT moving the players onto it (used for the
// warden/crane so players never trigger a shove/defeat/slam before the photo).
const camTo = async (page, x, y, zoom = 1.0) => {
  await page.evaluate(({ x, y, zoom }) => {
    const g = window.__BB.game.scene.getScene("Game");
    g.camPos.x = x; g.camPos.y = y; g.camPos.zoom = zoom;
  }, { x, y, zoom });
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
// 1-1 — SCUTTLEBUG W2 hex-shell variant + squish SPLAT decal
// =====================================================================
await startLevel(page, 0);
ok(await active("Game"), "1-1 Game scene active");
ok(await active("UI"), "1-1 HUD (UI scene) active over the robots");

const tex = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const keys = ["bug_w2", "bug_w2_step", "bug_splat", "roller_lamp", "roller_lamp_lit",
    "warden", "warden_defeat", "crane", "crane_plate", "crane_plate_c1", "crane_plate_c2",
    "pod_ring", "pod_ring_c1", "pod_ring_c2"];
  return {
    webgl: g.game.renderer.type === 2,
    all: keys.every((k) => g.textures.exists(k)),
    missing: keys.filter((k) => !g.textures.exists(k)),
    splatPool: g.splatPool ? g.splatPool.length : 0,
  };
});
ok(!tex.webgl, "running on the Canvas tier (?canvas=1)");
ok(tex.all, "all P7 static art baked at boot", tex.missing.length ? "missing: " + tex.missing.join(",") : "");
ok(tex.splatPool >= 4, "splat decals are pooled (fixed ring, no per-event alloc)", `pool=${tex.splatPool}`);

// force a live scuttlebug to the W2 variant (no W2-world level ships bugs yet;
// the variant is selected by def.world in GameScene) and frame on it.
const bugPos = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const bug = g.bugs.getChildren().find((b) => b.active);
  bug._texBase = "bug_w2"; bug._texStep = "bug_w2_step"; bug._lf = null;
  bug.setTexture("bug_w2"); bug.setVelocityX(0);
  return { x: Math.round(bug.x), y: Math.round(bug.y) };
});
await frameAt(page, bugPos.x, bugPos.y - 8, 1.7);
const bs = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const bug = g.bugs.getChildren().find((b) => b.active);
  return { texKey: bug.texture.key, vis: bug.visible, players: g.players.every((p) => p.visible) };
});
ok(/^bug_w2/.test(bs.texKey), "scuttlebug shows the darker W2 hex-shell variant", bs.texKey);
ok(bs.vis, "scuttlebug visible");
ok(bs.players, "both robots visible");
await shot("p7-scuttlebug");

// squish it -> a pooled splat decal is stamped at the ground and starts opaque
const splat = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const bug = g.bugs.getChildren().find((b) => b.active);
  g.squishBug(bug);
  const s = g.splatPool.find((sp) => sp.visible);
  return { any: !!s, alpha: s ? +s.alpha.toFixed(2) : 0, depth: s ? s.depth : null };
});
ok(splat.any, "a squish stamps a visible splat decal");
ok(splat.alpha >= 0.5, "splat decal starts opaque (then fades over ~2s)", `a=${splat.alpha}`);
await sleep(120);
await shot("p7-scuttle-splat");

// =====================================================================
// 2-1 — PATROL ROLLER: KOBI single-eye cab decal + warning lamp + wheels
// =====================================================================
await startLevel(page, 3);
ok(await active("Game"), "2-1 Game scene active");
ok(await active("UI"), "2-1 HUD (UI scene) active");
const rPos = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const r = g.rollers[0];
  // keep the posed robots from being zapped by the vision beam during the shot
  g.players.forEach((p) => { p.invuln = 999999; });
  return { x: Math.round(r.img.x), y: Math.round(r.img.y) };
});
await frameAt(page, rPos.x, rPos.y - 4, 1.9);
const rs = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const r = g.rollers[0];
  return {
    baseTex: r.img.texture.key,
    lampTex: r.lamp.texture.key,
    lampVis: r.lamp.visible,
    pupilVis: r.pupil.visible,
    wheels: r.wheels.length,
    lampAbove: r.lamp.y < r.img.y,
    players: g.players.every((p) => p.visible),
  };
});
ok(/^roller/.test(rs.baseTex), "roller cab shows the KOBI single-eye decal art", rs.baseTex);
ok(rs.lampVis && /^roller_lamp/.test(rs.lampTex), "warning-lamp ART mounted on the cab", rs.lampTex);
ok(rs.lampAbove, "lamp sits on the cab roof (above the body)");
ok(rs.pupilVis && rs.wheels === 2, "cab detail present (sliding pupil + two wheels)");
ok(rs.players, "both robots visible");
await shot("p7-roller");

// =====================================================================
// 2-3 — WALL-WARDEN: face-plate + visor glow + badge, and the defeat pose
// =====================================================================
await startLevel(page, 5);
ok(await active("Game"), "2-3 Game scene active");
const wPos = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const w = g.wardens[0];
  // park both robots well clear (in front, on the facing side, > shove range) so
  // they never shove/defeat the warden before the photo; then centre the camera.
  g.players.forEach((p, i) => { p.setVelocity(0, 0); p.setPosition(w.img.x + 92 + i * 40, w.img.y); });
  return { x: Math.round(w.img.x), y: Math.round(w.img.y), id: w.id };
});
await camTo(page, wPos.x + 40, wPos.y - 6, 1.5);
await sleep(1300); // wedge-safe settle after repositioning both players
const ws = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const w = g.wardens[0];
  return {
    tex: w.img.texture.key,
    badge: w.badge ? w.badge.text : null,
    badgeVis: w.badge ? w.badge.visible : false,
    defeated: w.defeated,
    players: g.players.every((p) => p.visible),
  };
});
ok(ws.tex === "warden", "warden shows the riveted face-plate + visor-glow art");
ok(ws.badgeVis && !!ws.badge, "badge-number stencil on the chest", `#${ws.badge}`);
ok(!ws.defeated, "warden still upright for the intact-art shot");
ok(ws.players, "both robots visible");
await shot("p7-warden");

// defeat it via the REAL path: put a phase robot behind it (opposite the facing
// side) so the existing defeat state fires and swaps to the cross-eye pose.
await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const w = g.wardens[0];
  const p = g.players[0];
  p.setSkill("phase");
  p.setPosition(w.img.x - w.facing * 26, w.img.y); // behind the warden
  p.setVelocity(0, 0);
});
await sleep(500); // let updateWorld2 register the "through the wall" defeat
const wd = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const w = g.wardens[0];
  return { tex: w.img.texture.key, defeated: w.defeated, badgeVis: w.badge ? w.badge.visible : false };
});
ok(wd.defeated, "warden entered the defeat state (shoved from behind)");
ok(wd.tex === "warden_defeat", "defeat state swaps to the cross-eye X pose texture", wd.tex);
await shot("p7-warden-defeat");

// =====================================================================
// 1-3 — CRANE BOSS: cabin KOBI eye + catenary cable/hook + staged plate cracks
// =====================================================================
await startLevel(page, 2);
ok(await active("Game"), "1-3 Game scene active");
ok(await active("UI"), "1-3 HUD (UI scene) active over the crane fight");
const cInfo = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const c = g.crane;
  // probe-only staging: park the body at hover in the readable REST pose so the
  // cabin/cable/plates photograph cleanly. This poses the body position only;
  // the fight state machine + timings are otherwise untouched by shipped code.
  c.state = "rest"; c.timer = 999999; c.body.y = c.hoverY; c.body.clearTint();
  // park both robots (gravity off) just below the hovering crane so the follow
  // camera frames the cabin + cable + plates instead of chasing them to the floor.
  g.players.forEach((p, i) => {
    p.body.setAllowGravity(false); p.setVelocity(0, 0);
    p.setPosition(c.body.x + (i ? 60 : -60), c.hoverY + 150);
  });
  return { x: Math.round(c.body.x), y: Math.round(c.body.y), plates: c.plates.length };
});
await sleep(1300); // wedge-safe settle after repositioning both players + camera lerp
const cs = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const c = g.crane;
  return {
    bodyTex: c.body.texture.key,
    plateTex: c.plates.filter((p) => p.attached).map((p) => p.img.texture.key),
    podsStomped: c.podsStomped,
    cableDrawn: g.craneGfx.commandBuffer.length > 0,
    players: g.players.every((p) => p.visible),
  };
});
ok(cs.bodyTex === "crane", "crane cabin shows KOBI's eye art (alive body)", cs.bodyTex);
ok(cs.cableDrawn, "catenary cable + hook drawn into the crane graphics");
ok(cs.plateTex.every((t) => t === "crane_plate"), "plates pristine at stage 0 (bolt heads, no cracks)", cs.plateTex.join(","));
ok(cs.podsStomped === 0, "fight still at stage 0 (podsStomped=0)");
ok(cs.players, "both robots visible");
await shot("p7-crane");

// advance the STAGE the texture swap READS (probe-only: shipped swap reads this,
// never writes it; kept < 3 so no defeat fires) and confirm the cracks deepen.
await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  g.crane.podsStomped = 2;
});
await sleep(220); // let updateCrane swap the plate textures on the next frames
const cc = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const c = g.crane;
  return {
    plateTex: c.plates.filter((p) => p.attached).map((p) => p.img.texture.key),
    podsStomped: c.podsStomped,
    dead: c.state === "dead",
  };
});
ok(cc.plateTex.every((t) => t === "crane_plate_c2"), "plates deepen to stage-2 cracks via the state read", cc.plateTex.join(","));
ok(!cc.dead, "stage read did NOT trigger crane death (fight logic intact)");
await shot("p7-crane-cracked");

await cBrowser.close();
console.log(errors ? `Canvas tier snapped with ${errors} page error(s)` : "Canvas tier snapped clean (0 page errors)");
if (errors) fails.push(`${errors} Canvas page error(s)`);

if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL ASSERTIONS PASSED");
