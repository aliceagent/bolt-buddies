// Sprint 8 game-feel FX review shots + a 5s FPS probe in 1-3. Dev server on
// :5173, Canvas renderer. Bursts: zip, stomp, core collect, respawn.
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
page.on("console", (m) => { const t = m.text(); if (/error/i.test(t)) console.log("CONSOLE:", t); });
await page.goto("http://localhost:5173/?canvas=1", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const load = async (idx) => {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Title"); m.stop("Hub"); m.stop("Game");
    m.start("Game", { levelIndex: i });
  }, idx);
  await page.waitForTimeout(1400);
};
const shot = (tag) => page.screenshot({ path: `tools/shots/${tag}.png` });

// --- zip: rope with catenary sag + hook head + speed-lines ------------------
await load(0);
await page.evaluate(() => {
  const s = window.__BB.scene;
  const p = s.players[0];
  p.skill = "grapple";
  p.zip = { x: p.x + 250, y: p.y - 140, hang: true, arrived: false, t: 0 };
  p.setVelocity(600, -260);
});
await page.waitForTimeout(120);
await shot("ui8-zip");

// --- stomp: shockwave ring + floor dust + zoom-punch ------------------------
await load(0);
await page.evaluate(() => {
  const s = window.__BB.scene;
  const p = s.players[1];
  p.skill = "heavy";
  s.heavyImpact(p, true);
});
await page.waitForTimeout(70);
await shot("ui8-stomp");

// --- core collect: radial star burst + fly-to-pip ---------------------------
await load(0);
await page.evaluate(() => {
  const s = window.__BB.scene;
  const c = s.coreItems.find((c) => c.active) || s.coreItems[0];
  const p = s.players[0];
  p.body.reset(c.x, c.y); // walk P1 onto the core so the real pickup fires
});
await page.waitForTimeout(160);
await shot("ui8-core");

// --- respawn: beam-in column + materialize blink ----------------------------
await load(0);
await page.evaluate(() => {
  const s = window.__BB.scene;
  s.killPlayer(s.players[0]);
});
await page.waitForTimeout(1000); // 900ms death delay, then beam-in
await shot("ui8-respawn");

// --- 5-second FPS probe in 1-3 (levelIndex 2), stomps stirring the pot ------
await load(2);
const fps = await page.evaluate(async () => {
  const g = window.__BB.game;
  const s = window.__BB.scene;
  const samples = [];
  const start = performance.now();
  return await new Promise((resolve) => {
    const iv = setInterval(() => {
      samples.push(g.loop.actualFps);
      // stir some FX: a heavy stomp every ~500ms to load the emitters
      const p = s.players && s.players[1];
      if (p) { p.skill = "heavy"; try { s.heavyImpact(p, true); } catch {} }
      if (performance.now() - start > 5000) {
        clearInterval(iv);
        const valid = samples.filter((v) => v > 0);
        const min = Math.min(...valid);
        const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
        resolve({ min: +min.toFixed(1), avg: +avg.toFixed(1), n: valid.length });
      }
    }, 250);
  });
});
console.log("FPS probe (1-3):", JSON.stringify(fps));

await browser.close();
console.log(errors ? `ui8 snapped with ${errors} page error(s)` : "ui8 snapped clean");
