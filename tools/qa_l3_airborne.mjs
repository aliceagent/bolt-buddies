// GFX6 L3 focused check: confirm the polished-floor reflection ghost VANISHES when
// the buddy is airborne. Load 4-1 (all-polished), stand a buddy on a run (read the
// eased-in alpha), then hold it 150px above the surface (physics paused so it can't
// fall back) and read the alpha again — expect it to ease to ~0.
//   node tools/qa_l3_airborne.mjs
import { chromium } from "playwright";
const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newContext({ viewport: { width: 1280, height: 720 } }).then((c) => c.newPage());
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await sleep(1000);
await page.evaluate(() => {
  localStorage.clear();
  const m = window.__BB.game.scene;
  ["UI", "Title", "Hub", "Game", "Epilogue"].forEach((k) => m.stop(k));
  m.start("Game", { levelIndex: 9 });
});
await sleep(1800);
// stand on the run, let alpha ease in
await page.evaluate(() => {
  const g = window.__BB.scene;
  const r = g._polishedRuns[0];
  const cx = (r.x1 + r.x2) / 2;
  g.players.forEach((p, i) => { p.body.reset(cx + (i === 0 ? -26 : 26), r.surfaceY - p.displayHeight / 2 - 2); p.setVelocity(0, 0); });
});
await sleep(1400);
const grounded = await page.evaluate(() => window.__BB.scene._reflectGhosts.map((o) => +o.alpha.toFixed(4)));
console.log("grounded alpha:", JSON.stringify(grounded));
// hold 150px above surface with gravity OFF (scene loop keeps running full-speed
// so the ease can converge); let alpha ease out
await page.evaluate(() => {
  const g = window.__BB.scene;
  const r = g._polishedRuns[0];
  const cx = (r.x1 + r.x2) / 2;
  g.players.forEach((p, i) => {
    p.body.setAllowGravity(false); p.setVelocity(0, 0);
    p.body.reset(cx + (i === 0 ? -26 : 26), r.surfaceY - p.displayHeight / 2 - 150);
  });
});
await sleep(4000);
const airborne = await page.evaluate(() => {
  const g = window.__BB.scene;
  return { alpha: g._reflectGhosts.map((o) => +o.alpha.toFixed(4)), feetLift: g._polishedRuns[0].surfaceY - g.players[0].body.bottom };
});
console.log("airborne alpha:", JSON.stringify(airborne.alpha), " feetLift(px above surface):", Math.round(airborne.feetLift));
await browser.close();
console.log(errors === 0 ? "OK: 0 page errors" : `FAIL ${errors} errors`);
process.exit(0);
