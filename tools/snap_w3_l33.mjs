// W3W4 L33 — level 3-3 "The Scrap Storm" screenshot + fps tool.
//
// Canvas tier. Shoots the intro card, the storm yard with flying scrap, the
// scrap-catch shield moment (a REAL key-driven ACTION catch), the bubbled
// fuse-core ferry mid-lane, the socket relief (fc1 seated + its lane calmed),
// the calmed exit yard, and a full-level wide "minimap" shot to
// tools/shots/w3/ (l33-*.png), then samples fps on 3-3 twice plus 2-2 and 1-3
// once each for the A/B family comparison (same method as snap_w3_l31/l32).
// page.evaluate is used ONLY for reads, station-setup teleports/skill grants
// and camera framing — every MECHANIC in a shot (the catch, the bubble, the
// carry) is performed with real key presses.
//
//   node tools/snap_w3_l33.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = process.env.BB_SHOTS || "tools/shots/w3";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
await page.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
await sleep(1500);
await page.evaluate(() => {
  localStorage.clear();
  const m = window.__BB.game.scene;
  ["UI", "Game", "Title", "Hub"].forEach((k) => m.stop(k));
  m.start("Game", { levelIndex: 8 });
});
// intro card: catch the banner while it holds (slides in ~240ms, holds 1.6s)
await sleep(900);
await page.screenshot({ path: `${SHOTS}/l33-intro.png` });
console.log(`shot -> ${SHOTS}/l33-intro.png`);
await sleep(2500); // banner gone, KOBI start blip typing

// station-setup: skills on (P1 = magnet catcher, P2 = bubble ferry) + the HUD
// skill events so the panels read the equipped gadgets in the shots
await page.evaluate(() => {
  const g = window.__BB.scene;
  g.players[0].setSkill("magnet");
  g.players[1].setSkill("bubble");
  g.game.events.emit("bb:skill", { idx: 0, skill: "magnet", name: "MAGNET GLOVE" });
  g.game.events.emit("bb:skill", { idx: 1, skill: "bubble", name: "BUBBLE SHIELD" });
});
const T = 48;
const port = (i, tx, ty) => page.evaluate(([i, tx, ty]) => {
  const g = window.__BB.scene;
  const p = g.players[i];
  if (p.magCrate) g.releaseMagCrate(p, true);
  p.clearStates();
  p.body.reset(tx * 48 + 24, ty * 48 + 24);
  p.setVelocity(0, 0);
  p.invuln = Math.max(p.invuln, 900);
}, [i, tx, ty]);
const frameAt = (x, y, z = 1.6) => page.evaluate(([x, y, z]) => {
  const g = window.__BB.scene;
  if (!g._camFrozen) { g._camFrozen = true; g.updateCamera = () => {}; }
  const cam = g.cameras.main;
  cam.setZoom(z);
  cam.centerOn(x, y);
}, [x, y, z]);
const shoot = async (name, x, y, z) => {
  await frameAt(x, y, z);
  await sleep(250);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  console.log(`shot -> ${SHOTS}/${name}.png`);
};
// real-key self-bubble for P2 (the ferry's raincoat) — input, not evaluate
const bubbleP2 = async () => {
  await page.keyboard.down("KeyL");
  await sleep(90);
  await page.keyboard.up("KeyL");
  await sleep(200);
};

// station 1: the storm yard — the teaching lane's flying scrap + emitter +
// chevrons, both robots watching from the calm west side (both parked clear
// of fuse-core A's 40px pickup radius — the ferry station needs it untouched)
await port(0, 9.6, 13); await port(1, 8.6, 13);
await sleep(600);
await shoot("l33-storm", 15 * T, 12 * T, 1.15);

// station 2: THE FERRY — P2 bubbled, carrying fuse-core A into the live lane
// (walk it in with real keys so the carry offset + bubble read together).
// Runs BEFORE the catch station so M can't shoulder-pick the core.
await port(0, 8, 13); // M well clear of the core's pickup radius
await port(1, 10.5, 13);
await sleep(300);
await page.keyboard.down("ArrowRight");
await sleep(450); // touches the core at x11 — the pickup chime fires
await page.keyboard.up("ArrowRight");
await bubbleP2();
await frameAt(13.5 * T, 12.5 * T, 1.4);
await page.keyboard.down("ArrowRight");
await sleep(380); // bubbled carry entering the band — shot mid-stride
await page.screenshot({ path: `${SHOTS}/l33-ferry.png` });
await sleep(150);
await page.keyboard.up("ArrowRight");
console.log(`shot -> ${SHOTS}/l33-ferry.png`);
const ferryState = await page.evaluate(() => ({
  carried: window.__BB.scene.fuseCores[0].state,
  carrier: window.__BB.scene.fuseCores[0].carrier ? window.__BB.scene.fuseCores[0].carrier.idx : -1,
  bubbled: window.__BB.scene.players[1].bubbleT > 0,
}));
console.log("ferry state:", JSON.stringify(ferryState));

// station 3: THE SCRAP CATCH — M at the lane lip fires a REAL ACTION when a
// chunk flies into glove range; shot with the shield held + tether visible
await port(1, 10, 13); // B parks clear of the lane
await port(0, 11.4, 13);
let caught = false;
for (let i = 0; i < 40 && !caught; i++) {
  const near = await page.evaluate(() => {
    const g = window.__BB.scene;
    const p = g.players[0];
    return g.stormLanes.some((l) => l.active &&
      l.chunks.some((c) => c.wait <= 0 && Math.abs(c.x - p.x) < 120));
  });
  if (near) {
    await page.keyboard.down("KeyE");
    await sleep(80);
    await page.keyboard.up("KeyE");
    await sleep(150);
    caught = await page.evaluate(() => window.__BB.scene.stormShield.state === "held");
  } else {
    await sleep(100);
  }
}
console.log("scrap catch (real ACTION):", caught);
await shoot("l33-catch", 14 * T, 12.5 * T, 1.5);

// station 4: SOCKET RELIEF — station-setup teleports finish the ferry (the
// REAL input delivery is the beat route's job; this is framing): carrier to
// the core, then carrier to the socket — the proximity pickup/seat do the rest
for (let i = 0; i < 12; i++) {
  const st = await page.evaluate(() => {
    const g = window.__BB.scene;
    const fc = g.fuseCores[0];
    return {
      filled: g.fuseSockets[0].filled,
      core: fc.state,
      carrierIdx: fc.carrier ? fc.carrier.idx : -1,
      carrierDead: fc.carrier ? fc.carrier.dead : false,
      bDead: g.players[1].dead,
      coreTx: fc.img.x / 48 - 0.5,
    };
  });
  if (st.filled) break;
  if (st.core === "carried" && !st.carrierDead) { await port(st.carrierIdx, 22.4, 13); await sleep(450); continue; }
  if (st.bDead) { await sleep(1400); continue; }
  if (st.core === "rest") { await port(1, st.coreTx, 13); await sleep(450); }
}
const relief = await page.evaluate(() => ({
  fc1: window.__BB.scene.fuseSockets[0].filled,
  lane0: window.__BB.scene.stormLanes[0].active,
}));
console.log("relief state:", JSON.stringify(relief));
await sleep(900); // the calm tweens play out
await shoot("l33-relief", 21 * T, 12.5 * T, 1.25);

// station 5: the planted step + shelf (the scrap-as-platform beat, staged wide)
await port(0, 36, 13); await port(1, 34, 13);
await shoot("l33-shelf", 34 * T, 11 * T, 1.2);

// station 6: the calmed exit yard — jelly, exit socket, exit door
await port(0, 78, 13); await port(1, 75, 13);
await shoot("l33-exit", 80 * T, 11.5 * T, 1.1);

// full-level wide (minimap-ish)
await shoot("l33-wide", 44 * T, 10 * T, 0.29);

// fps sampling: 3-3 twice + the family baselines 2-2 and 1-3 once each
await page.evaluate(() => { const g = window.__BB.scene; g._camFrozen = false; delete g.updateCamera; });
const sampleFps = async (levelIndex) => {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Title"); m.stop("Hub"); m.stop("Game");
    m.start("Game", { levelIndex: i });
  }, levelIndex);
  await sleep(2500);
  return page.evaluate(async () => {
    const gme = window.__BB.game; const s = []; const t0 = performance.now();
    return await new Promise((res) => {
      const iv = setInterval(() => {
        s.push(gme.loop.actualFps);
        if (performance.now() - t0 > 5000) {
          clearInterval(iv); const v = s.filter((x) => x > 0);
          res({ min: +Math.min(...v).toFixed(1), avg: +(v.reduce((a, b) => a + b) / v.length).toFixed(1) });
        }
      }, 250);
    });
  });
};
const fps33 = [await sampleFps(8), await sampleFps(8)];
console.log("fps on 3-3 (dev build, Canvas tier):", JSON.stringify(fps33));
const fps22 = await sampleFps(4);
console.log("fps on 2-2 (family baseline):", JSON.stringify(fps22));
const fps13 = await sampleFps(2);
console.log("fps on 1-3 (family baseline):", JSON.stringify(fps13));

await browser.close();
console.log(errors ? `snapped with ${errors} page error(s)` : "snapped clean (0 page errors)");
process.exit(errors ? 1 : 0);
