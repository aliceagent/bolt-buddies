// GFX6 L3 QA shots -> tools/shots/gfx6/. WebGL: W4 (all-polished) with BOTH buddies
// teleported onto a polished run so their reflection ghosts ease in (alpha/pos read
// from the scene objects); a non-W4 world with a polished run + emissive smear; the
// cap glint mid-travel (force-fired via the scene handle). Canvas control (W4): the
// reflection/glint objects are never created, so the floor is bare. Also confirms
// reflections vanish airborne (drive a jump, read alpha mid-air). Zero page errors.
//   node tools/qa_l3_shots.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = "tools/shots/gfx6";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: CHROMIUM });
let errors = 0;

async function loadLevel(page, idx) {
  await page.evaluate((i) => {
    localStorage.clear();
    const m = window.__BB.game.scene;
    ["UI", "Title", "Hub", "Game", "Epilogue"].forEach((k) => m.stop(k));
    m.start("Game", { levelIndex: i });
  }, idx);
  await sleep(1800);
}
// freeze the camera so a teleport + screenshot is stable
async function freezeCam(page) {
  await page.evaluate(() => {
    const g = window.__BB.scene;
    if (!g._camFrozen) { g._camFrozen = true; g.updateCamera = () => {}; }
  });
}
// teleport BOTH buddies onto a polished run (feet ~ surface), center camera, settle
async function standOnRun(page, runIdx = 0) {
  return page.evaluate((ri) => {
    const g = window.__BB.scene;
    const runs = g._polishedRuns || [];
    if (!runs.length) return { runs: 0 };
    const r = runs[Math.min(ri, runs.length - 1)];
    const cx = (r.x1 + r.x2) / 2;
    g.players.forEach((p, i) => {
      const x = cx + (i === 0 ? -26 : 26);
      // place feet on the surface: body.reset sets top-left, so back off half-height
      p.body.reset(x, r.surfaceY - p.displayHeight / 2 - 2);
      p.setVelocity(0, 0);
      p.facing = i === 0 ? 1 : -1; p.setFlipX(i === 1);
    });
    const cam = g.cameras.main;
    cam.setZoom(1.5);
    cam.centerOn(cx, r.surfaceY - 30);
    return { runs: runs.length, run: r, cx: Math.round(cx) };
  }, runIdx);
}
async function readGhosts(page) {
  return page.evaluate(() => {
    const g = window.__BB.scene;
    const gh = g._reflectGhosts || [];
    return gh.map((o, i) => ({
      idx: i, alpha: +o.alpha.toFixed(4),
      x: Math.round(o.x), y: Math.round(o.y),
      flipX: o.flipX, flipY: o.flipY, sy: +o.scaleY.toFixed(3), visible: o.visible,
    }));
  });
}

// ---- W4 reflection (idx 9 = 4-1, all-polished) ----
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => { console.log("PAGE ERROR (webgl):", e.message); errors++; });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await sleep(1000);

await loadLevel(page, 9);
await freezeCam(page);
const w4info = await standOnRun(page, 0);
await sleep(1400); // let the per-player ease-in converge
const w4ghosts = await readGhosts(page);
await page.screenshot({ path: `${SHOTS}/l3-w4-reflect.png` });
console.log(`l3-w4-reflect.png  polishedRuns=${w4info.runs} run=${JSON.stringify(w4info.run)}`);
console.log(`  ghosts(grounded)=${JSON.stringify(w4ghosts)}`);

// ---- airborne check: hold both buddies 150px above the surface (physics paused
// so they can't fall back), let the alpha ease, read it — expect ~0 ----
await page.evaluate(() => {
  const g = window.__BB.scene;
  g.physics.world.pause();
  const r = (g._polishedRuns || [])[0];
  const cx = (r.x1 + r.x2) / 2;
  g.players.forEach((p, i) => { p.body.reset(cx + (i === 0 ? -26 : 26), r.surfaceY - p.displayHeight / 2 - 150); });
});
await sleep(1000);
const airGhosts = await readGhosts(page);
await page.evaluate(() => window.__BB.scene.physics.world.resume());
console.log(`  ghosts(airborne, feet ~150px up)=${JSON.stringify(airGhosts)}`);

// ---- cap glint mid-travel (force-fire via the scene handle) ----
await loadLevel(page, 9);
await freezeCam(page);
const glintInfo = await page.evaluate(() => {
  const g = window.__BB.scene;
  const runs = g._polishedRuns || [];
  const r = runs[0];
  const cx = (r.x1 + r.x2) / 2;
  const cam = g.cameras.main; cam.setZoom(1.6); cam.centerOn(cx, r.surfaceY - 20);
  // force the pooled glint to mid-run at peak alpha (what a live sweep looks like)
  g._capGlint.setPosition(cx, r.surfaceY + 3).setVisible(true).setAlpha(0.15);
  return { x: Math.round(cx), y: Math.round(r.surfaceY + 3), alpha: g._capGlint.alpha, key: g._capGlint.texture.key };
});
await sleep(300);
await page.screenshot({ path: `${SHOTS}/l3-glint.png` });
console.log(`l3-glint.png  glint=${JSON.stringify(glintInfo)}`);
await ctx.close();

// ---- non-W4 world with a polished run + smear ----
async function findSmearLevel(page) {
  // scan non-W4 levels for one with polished runs AND a refsmear object present
  for (const idx of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    await loadLevel(page, idx);
    const r = await page.evaluate(() => {
      const g = window.__BB.scene;
      const runs = (g._polishedRuns || []).length;
      const smears = g.children.list.filter((o) => o.texture && o.texture.key === "refsmear");
      return { world: g.def.world, id: g.def.id, runs, smears: smears.length,
               smear: smears[0] ? { x: Math.round(smears[0].x), y: Math.round(smears[0].y), tint: smears[0].tintTopLeft } : null };
    });
    if (r.runs > 0 && r.smears > 0) return { idx, ...r };
  }
  return null;
}
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  p.on("pageerror", (e) => { console.log("PAGE ERROR (webgl2):", e.message); errors++; });
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await sleep(1000);
  const found = await findSmearLevel(p);
  if (found) {
    await freezeCam(p);
    await p.evaluate((sm) => {
      const g = window.__BB.scene;
      const cam = g.cameras.main; cam.setZoom(1.6); cam.centerOn(sm.x, sm.y - 10);
      // stand a buddy on the same run so a ghost + the smear both read
      const run = (g._polishedRuns || []).find((r) => sm.x >= r.x1 && sm.x <= r.x2);
      if (run) { const pl = g.players[0]; pl.body.reset(sm.x, run.surfaceY - pl.displayHeight / 2 - 2); pl.setVelocity(0, 0); }
    }, found.smear);
    await sleep(700);
    const gh = await readGhosts(p);
    await p.screenshot({ path: `${SHOTS}/l3-w${found.world}.png` });
    console.log(`l3-w${found.world}.png  ${found.id} polishedRuns=${found.runs} smears=${found.smears} smear=${JSON.stringify(found.smear)}`);
    console.log(`  ghost=${JSON.stringify(gh[0])}`);
  } else {
    console.log("NO non-W4 level found with a polished run + smear (unexpected)");
  }
  await c.close();
}

// ---- Canvas control (W4): no reflection/glint objects exist ----
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  p.on("pageerror", (e) => { console.log("PAGE ERROR (canvas):", e.message); errors++; });
  await p.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
  await sleep(1000);
  await loadLevel(p, 9);
  await freezeCam(p);
  const info = await standOnRun(p, 0);
  await sleep(500);
  const audit = await p.evaluate(() => {
    const g = window.__BB.scene;
    return {
      reflectGhosts: g._reflectGhosts, capGlint: g._capGlint,
      refsmears: g.children.list.filter((o) => o.texture && o.texture.key === "refsmear").length,
      capglints: g.children.list.filter((o) => o.texture && o.texture.key === "capglint").length,
      polishedRuns: (g._polishedRuns || []).length,
    };
  });
  await p.screenshot({ path: `${SHOTS}/l3-w4-canvas.png` });
  console.log(`l3-w4-canvas.png  Canvas audit: reflectGhosts=${audit.reflectGhosts} capGlint=${audit.capGlint} refsmears=${audit.refsmears} capglints=${audit.capglints} polishedRuns=${audit.polishedRuns}`);
  await c.close();
}

await browser.close();
console.log(errors === 0 ? "OK: 0 page errors" : `FAIL: ${errors} page errors`);
process.exit(errors === 0 ? 0 : 1);
