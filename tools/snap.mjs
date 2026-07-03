// Quick review snapshots: title, hub, and given level indexes.
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.goto("http://localhost:5173/?canvas=1", { waitUntil: "networkidle" });
await page.waitForTimeout(1800);
const tag = process.env.SNAP_TAG || "review";
await page.screenshot({ path: `tools/shots/${tag}-title.png` });
await page.keyboard.down("KeyE");
await page.waitForTimeout(80);
await page.keyboard.up("KeyE");
await page.waitForTimeout(700);
await page.screenshot({ path: `tools/shots/${tag}-hub.png` });
for (const idx of (process.env.SNAP_LEVELS || "0,4").split(",").map(Number)) {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI");
    m.stop("Game");
    m.stop("Hub");
    m.stop("Title");
    m.start("Game", { levelIndex: i });
  }, idx);
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const s = window.__BB.scene;
    s.players[0].setSkill(s.def.skills[0]);
    s.players[1].setSkill(s.def.skills[1]);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `tools/shots/${tag}-level${idx}.png` });
}
await browser.close();
console.log("snapped");
