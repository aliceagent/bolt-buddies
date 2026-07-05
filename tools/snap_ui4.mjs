// Sprint 4 gadget-art review shots. Dev server on :5173, Canvas renderer.
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => { const t = m.text(); if (/error/i.test(t)) console.log("CONSOLE:", t); });
await page.goto("http://localhost:5173/?canvas=1", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

await page.evaluate(() => {
  const m = window.__BB.game.scene;
  m.stop("UI"); m.stop("Title"); m.stop("Hub");
  m.start("Game", { levelIndex: 0 });
});
await page.waitForTimeout(1700);
await page.screenshot({ path: "tools/shots/ui4-1-1-start.png" });

const frame = async (a, b, c, d, tag, wait = 900) => {
  await page.evaluate(([x1, y1, x2, y2]) => {
    const s = window.__BB.scene;
    s.players[0].body.reset(x1 * 48 + 24, y1 * 48 + 24);
    s.players[1].body.reset(x2 * 48 + 24, y2 * 48 + 24);
  }, [a, b, c, d]);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `tools/shots/${tag}.png` });
};

// key door area: door1 (x38, red lamp) + gold key (x33)
await frame(34, 13, 36, 13, "ui4-key-door");
// lift: both aboard (weight 2 of 3) so pips light 2/3
await frame(45, 13, 46, 13, "ui4-lift");
// checkpoint inactive (grey), off the x40 pad
await frame(36, 13, 37, 13, "ui4-checkpoint-before");
// checkpoint activation: step p0 onto x40 -> green lamp + ring burst + cone
await page.evaluate(() => {
  window.__BB.scene.players[0].body.reset(40 * 48 + 24, 13 * 48 + 24);
});
await page.waitForTimeout(160);
await page.screenshot({ path: "tools/shots/ui4-checkpoint-after.png" });

await browser.close();
console.log("ui4 snapped");
