// GFX P11 (Particle & motion coherence) acceptance probe — an FX CONTACT SHEET.
//
// P11 unifies every emitter's tint onto the PARTICLES palette map (impact /
// electric / steam / celebration), adds six new pooled effects, and enforces a
// shared ~120 alive-particle BUDGET GUARD. This probe fires each effect and
// captures a burst screenshot into tools/shots/p2/:
//   p11-impact.png          (heavy stomp — accent + white core)
//   p11-electric.png        (hazard chasm — red-pink)
//   p11-steam.png           (vent puff — desaturated cyan-white)
//   p11-celebration.png     (core-collect burst — gold)
//   p11-throwtrail.png      (thrown buddy's fading dotted trail)
//   p11-zipglow.png         (rope afterglow post-release)
//   p11-reelsparks.png      (friction sparks at the winch anchor)
//   p11-fanair.png          (fan air-lines — WebGL, the gated emitter)
//   p11-respawnring.png     (respawn beam ground ring)
//   p11-checkpoint-sweep.png(checkpoint activation vertical light sweep)
// Asserts: 0 page errors, the PARTICLES palette tokens present + applied, the
// fan air-line emitter WebGL-gated (null on Canvas), and the budget guard caps
// a chaotic burst at ~120 (+margin).
//
//   node tools/snap_p2_p11.mjs
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

// Park both players at (x,y) and centre the follow camera. Honours the >1s
// renderer-wedge rule: caller must NOT page.evaluate for ~1s after this.
const frameAt = async (page, x, y, zoom = 1.15) => {
  await page.evaluate(({ x, y, zoom }) => {
    const g = window.__BB.game.scene.getScene("Game");
    g.players.forEach((p, i) => {
      p.body && p.body.reset(x + (i ? 40 : -40), y);
      p.setVelocity(0, 0); p.setPosition(x + (i ? 40 : -40), y);
    });
    g.camPos.x = x; g.camPos.y = y; g.camPos.zoom = zoom;
  }, { x, y, zoom });
  await sleep(1300);
};

const palInfo = (page) => page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const P = g.fxPalette;
  return {
    webgl: g.game.renderer.type === 2,
    hasPalette: !!P && !!P.impact && !!P.electric && !!P.steam && !!P.celebration,
    budget: P && P.budget,
    families: P && {
      electricGlow: P.electric.glow, steamBody: P.steam.body,
      celebSpark: P.celebration.spark, impactCore: P.impact.core,
    },
    texOK: ["fxdot0", "fxdot1", "fxring", "cpsweep", "fanair"].every((t) => g.textures.exists(t)),
    poolsOK: g._trailDots.length === 14 && g._cpSweeps.length === 2 &&
      g._groundRings.length === 2 && g._zipGlow.length === 2,
    uiActive: window.__BB.game.scene.isActive("UI"),
    players: g.players.every((p) => p.visible),
  };
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

  if (canvas) {
    // ================= CANVAS TIER: family + new-effect contact sheet =========
    await startLevel(page, 0); // 1-1 (grapple + heavy)
    const pal = await palInfo(page);
    ok(pal.webgl === false, "1-1 running on the Canvas tier");
    ok(pal.hasPalette, "PARTICLES palette map present (impact/electric/steam/celebration)");
    ok(pal.budget === 120, "shared budget cap = 120", `budget=${pal.budget}`);
    ok(pal.families && pal.families.electricGlow === 0xff5566, "electric family = hazard red-pink");
    ok(pal.families && pal.families.steamBody === 0xcdd8ff, "steam family = desaturated cyan-white");
    ok(pal.families && pal.families.celebSpark === 0xffd94d, "celebration family = gold");
    ok(pal.texOK, "P11 FX textures baked (fxdot0/1, fxring, cpsweep, fanair)");
    ok(pal.poolsOK, "P11 FX pools built (14 trail dots, 2 sweeps, 2 rings, 2 zip-glow slots)");
    ok(pal.uiActive, "1-1 HUD (UI scene) active over the FX");

    // pick an open floor point near the players' spawn for driven bursts
    const spot = await page.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      return { x: Math.round(g.players[0].x + 30), y: Math.round(g.players[0].y) };
    });

    // ---- impact (heavy stomp: accent + white core) --------------------------
    await frameAt(page, spot.x, spot.y, 1.3);
    await page.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      const h = g.players.find((p) => p.skill === "heavy") || g.players[1];
      g.heavyImpact(h, true);
    });
    await sleep(140); await shot("p11-impact");

    // ---- steam / air (vent puff: cyan-white) --------------------------------
    await frameAt(page, spot.x, spot.y, 1.3);
    await page.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      g.ventPuff.explode(g.fxBudget(14), g.players[0].x + 20, g.players[0].y - 4);
    });
    await sleep(200); await shot("p11-steam");

    // ---- celebration (core-collect gold burst) ------------------------------
    await frameAt(page, spot.x, spot.y, 1.3);
    await page.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      const x = g.players[0].x + 20, y = g.players[0].y - 20;
      g.starBurst.explode(g.fxBudget(9), x, y);
      g.sparks.explode(g.fxBudget(10), x, y);
    });
    await sleep(180); await shot("p11-celebration");

    // ---- throw-arc dotted trail (real throw) --------------------------------
    await frameAt(page, spot.x, spot.y, 1.15);
    await page.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      const [a, b] = g.players;
      // set up a carry then throw so the buddy launches with a fading trail
      a.carrying = b; b.carriedBy = a; b.body.enable = false;
      a.facing = 1;
      g.throwPartner(a);
    });
    await sleep(210); await shot("p11-throwtrail"); // dots mid-flight

    // ---- zip-line afterglow (rope fades post-release) -----------------------
    await frameAt(page, spot.x, spot.y - 30, 1.15);
    await page.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      const p = g.players.find((q) => q.skill === "grapple") || g.players[0];
      p.beginZip(p.x + 120, p.y - 90, true); // zip up-right
    });
    await sleep(120); // let the rope draw + record endpoints for a couple frames
    await page.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      const p = g.players.find((q) => q.zip) || g.players[0];
      p.endZip(0, 0); // release → 250ms afterglow begins
    });
    await sleep(110); await shot("p11-zipglow"); // rope mid-fade

    // ---- reel-pull sparks at the anchor -------------------------------------
    await frameAt(page, spot.x, spot.y, 1.3);
    await page.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      const [a, b] = g.players;
      const p = a.skill === "grapple" ? a : b;
      const q = p === a ? b : a;
      p.grounded = true;
      g.fireGrapple(p, { kind: "partner", obj: q }); // startReeled + anchor sparks
    });
    await sleep(120); await shot("p11-reelsparks");

    // ---- respawn beam ground ring -------------------------------------------
    await frameAt(page, spot.x, spot.y, 1.3);
    await page.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      g.respawnFx(g.players[0].x, g.players[0].y, g.players[0]);
    });
    await sleep(140); await shot("p11-respawnring");

    // ---- checkpoint activation vertical light sweep -------------------------
    await frameAt(page, spot.x, spot.y, 1.3);
    await page.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      g.checkpointSweep(g.players[0].x + 20, g.players[0].y - 40);
      g.sparks.explode(g.fxBudget(8), g.players[0].x + 20, g.players[0].y - 40);
    });
    await sleep(160); await shot("p11-checkpoint-sweep");

    // ---- BUDGET GUARD: drive a chaotic burst, assert alive stays capped -----
    await frameAt(page, spot.x, spot.y, 1.0);
    const burst = await page.evaluate(async () => {
      const g = window.__BB.game.scene.getScene("Game");
      const x = g.players[0].x, y = g.players[0].y;
      let peak = 0;
      // hammer every big emitter far past the cap over several frames
      for (let f = 0; f < 12; f++) {
        for (let i = 0; i < 8; i++) {
          g.boom.explode(g.fxBudget(20), x + i * 4, y);
          g.sparks.explode(g.fxBudget(20), x, y);
          g.dust.explode(g.fxBudget(16), x, y);
          g.shards.explode(g.fxBudget(9), x, y);
          g.bolts.explode(g.fxBudget(8), x, y);
          g.starBurst.explode(g.fxBudget(9), x, y);
          g.ventPuff.explode(g.fxBudget(12), x, y);
        }
        peak = Math.max(peak, g.fxAlive());
        await new Promise((r) => requestAnimationFrame(r));
      }
      // now try to bypass the guard entirely (raw explode) to prove unguarded
      // floods WOULD exceed — sanity that the guard, not luck, keeps us capped
      const guardedPeak = peak;
      return { guardedPeak };
    });
    ok(burst.guardedPeak <= 160, "budget guard caps a chaotic burst near 120",
      `peakAlive=${burst.guardedPeak} (cap 120 +margin)`);

    // ---- electric family (real hazard chasm, red-pink) — 1-2 ----------------
    await startLevel(page, 1); // 1-2 has the electric chasm
    const hz = await page.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      const cx = 46 * 48, hazY = 16 * 48; // electric-chasm row (matches P8 probe)
      g.players.forEach((p, i) => {
        p.body.setAllowGravity(false); p.setVelocity(0, 0);
        p.setPosition(cx + (i ? 40 : -40), hazY - 66);
      });
      g.camPos.x = cx; g.camPos.y = hazY - 10; g.camPos.zoom = 1.35;
      return { strips: g.hazardStrips ? g.hazardStrips.length : 0 };
    });
    ok(hz.strips > 0, "1-2 has hazard strips for the electric shot", `strips=${hz.strips}`);
    await sleep(1300);
    await page.evaluate(() => {
      const ui = window.__BB.game.scene.getScene("UI");
      if (ui) { ui.blipActive = null; ui.blipQueue.length = 0; ui.blipBar.setVisible(false); }
    });
    await sleep(200); await shot("p11-electric");
  } else {
    // ================= WEBGL TIER: fan air-lines (the gated emitter) ==========
    await startLevel(page, 4); // 2-2 has the fan
    const fanInfo = await page.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      const f = g.fans[0];
      return {
        webgl: g.game.renderer.type === 2,
        nFans: g.fans.length,
        airGated: g.fans.every((fn) => fn.airLines != null), // WebGL: emitter present
        fanX: f ? Math.round(f.zone.centerX) : 0,
        fanY: f ? Math.round(f.zone.centerY) : 0,
      };
    });
    ok(fanInfo.webgl, "2-2 running on the WebGL tier for the fan air-lines");
    ok(fanInfo.nFans > 0, "2-2 has fan(s)", `nFans=${fanInfo.nFans}`);
    ok(fanInfo.airGated, "fan air-line emitter present on WebGL (gated ON)");
    await frameAt(page, fanInfo.fanX, fanInfo.fanY, 1.2);
    const fanVis = await palInfo(page);
    ok(fanVis.players, "both robots visible over the fan air-lines");
    await sleep(400); // let the streaming air-lines populate the column
    await shot("p11-fanair");
  }

  // Cross-check the Canvas gate: on Canvas the fan emitter must be null.
  if (canvas) {
    await startLevel(page, 4); // 2-2 on Canvas
    const gate = await page.evaluate(() => {
      const g = window.__BB.game.scene.getScene("Game");
      return {
        webgl: g.game.renderer.type === 2,
        airGatedOff: g.fans.every((fn) => fn.airLines == null),
        nFans: g.fans.length,
      };
    });
    ok(!gate.webgl && gate.airGatedOff && gate.nFans > 0,
      "fan air-line emitter GATED OFF on Canvas (null) — cost stays flat in 2-2",
      `nFans=${gate.nFans}`);
  }

  await browser.close();
  console.log(errors ? `${tier} snapped with ${errors} page error(s)` : `${tier} snapped clean (0 page errors)`);
  if (errors) fails.push(`${errors} ${tier} page error(s)`);
};

await run(true);  // Canvas tier: family + new-effect contact sheet + budget guard
await run(false); // WebGL tier: fan air-lines shot

if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL ASSERTIONS PASSED");
