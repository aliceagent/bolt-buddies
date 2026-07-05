// Sprint 5 enemy & crane-boss review shots. Dev server on :5173, Canvas renderer.
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
  await page.waitForTimeout(1500);
};
const tp = (i, tx, ty) => page.evaluate(([i, tx, ty]) => {
  window.__BB.scene.players[i].body.reset(tx * 48 + 24, ty * 48 + 24);
}, [i, tx, ty]);
const shot = (tag) => page.screenshot({ path: `tools/shots/${tag}.png` });

// --- 1-2 bug yard ------------------------------------------------------------
await load(1);
// stand among the bugs -> eyes glow. Reset + invuln in ONE step so bug contact
// on the landing frame neither kills nor bonks (screenshot only).
const holdInBugs = () => page.evaluate(() => {
  const s = window.__BB.scene;
  s.players[0].body.reset(33 * 48 + 24, 13 * 48 + 24);
  s.players[1].body.reset(35 * 48 + 24, 13 * 48 + 24);
  s.players.forEach((p) => { p.invuln = 9000; });
});
await holdInBugs();
for (let i = 0; i < 6; i++) { await page.waitForTimeout(150); await holdInBugs(); }
await shot("ui5-1-2-bugs");
await page.evaluate(() => {
  const s = window.__BB.scene;
  const b = s.bugs.getChildren().find((x) => x.active && Math.abs(x.x - s.players[0].x) < 200);
  if (b) s.squishBug(b);
});
await page.waitForTimeout(120);
await shot("ui5-1-2-squish");

// --- 2-1 roller yard with beam ----------------------------------------------
await load(3);
await tp(0, 49, 13); await tp(1, 51, 13); // beside the two patrol rollers
await page.waitForTimeout(1000);
await shot("ui5-2-1-beam"); // patrol wedge beams
// drive a roller into alert: drop the phase robot into its beam
await page.evaluate(() => {
  const s = window.__BB.scene, r = s.rollers[s.rollers.length - 1];
  s.players[0].body.reset(r.img.x + r.dir * 92, r.img.y);
});
await page.waitForTimeout(260);
await shot("ui5-2-1-alert"); // red flash + "!" popup

// --- 2-3 warden --------------------------------------------------------------
await load(5);
await tp(0, 21, 13); await tp(1, 23, 13); // centred on warden w1
await page.waitForTimeout(1000);
await shot("ui5-2-3-warden"); // visor glow + idle sway
await page.evaluate(() => {
  const s = window.__BB.scene, w = s.wardens[0];
  w.defeated = true; w.img.body.enable = false;
  if (w.sway) w.sway.stop();
  if (w.glow) { s.tweens.killTweensOf(w.glow); w.glow.setVisible(false); }
  s.tweens.add({ targets: w.img, angle: -w.facing * 84, alpha: 0.25, y: w.img.y + 18, duration: 500 });
  s.dizzyStars(w.img.x, w.img.y);
});
await page.waitForTimeout(520);
await shot("ui5-2-3-warden-down"); // dizzy stars circling

// --- 1-3 crane mid-fight + telegraph ----------------------------------------
await load(2);
await tp(0, 24, 13); await tp(1, 26, 13);
await page.evaluate(() => {
  const c = window.__BB.scene.crane;
  c.state = "telegraph"; c.timer = 8000; c.body.y = c.hoverY;
});
await page.waitForTimeout(200);
await shot("ui5-1-3-telegraph"); // trolley + cable + hazard stripe column
await page.evaluate(() => {
  const c = window.__BB.scene.crane;
  c.state = "rest"; c.timer = 9000; c.body.y = 10 * 48;
});
await page.waitForTimeout(200);
await shot("ui5-1-3-rest"); // magenta plate pulse + YANK A PLATE!

await browser.close();
console.log(errors ? `ui5 snapped with ${errors} page error(s)` : "ui5 snapped clean");
