// Sprint 2 review snapshots: terrain/tile art pass on 1-1 and 2-1.
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.goto("http://localhost:5173/?canvas=1", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

async function shotLevel(idx, tag) {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI");
    m.stop("Game");
    m.stop("Hub");
    m.stop("Title");
    m.start("Game", { levelIndex: i });
  }, idx);
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    const s = window.__BB.scene;
    s.players[0].setSkill(s.def.skills[0]);
    s.players[1].setSkill(s.def.skills[1]);
  });
  // capture two frames ~500ms apart so the hazard pulse / shimmer differ
  await page.waitForTimeout(300);
  await page.screenshot({ path: `tools/shots/ui2-${tag}-a.png` });
  await page.waitForTimeout(560);
  await page.screenshot({ path: `tools/shots/ui2-${tag}-b.png` });
}

await shotLevel(0, "1-1");
await shotLevel(3, "2-1");
await browser.close();
console.log("ui2 snapped");
