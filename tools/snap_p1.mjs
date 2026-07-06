// P1 title-screen cinematic snapshots: full frame + logo detail at BOTH
// colour-cycle extremes (cyan phase t=0, magenta phase t=1).
import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.goto("http://localhost:5173/?canvas=1", { waitUntil: "networkidle" });
await page.waitForTimeout(2200); // let flicker-on settle
const tag = process.env.SNAP_TAG || "p1-title";

// pin a cycle extreme: stop the tone tween and apply t directly
const pinTone = (t) => page.evaluate((t) => {
  const s = window.__BB.game.scene.getScene("Title");
  s.tweens.killTweensOf(s.neonTone);
  s.applyNeonTone(t);
}, t);

await pinTone(0); // cyan extreme
await page.waitForTimeout(250);
await page.screenshot({ path: `tools/shots/p2/${tag}.png` });
await page.screenshot({ path: `tools/shots/p2/p1-logo-detail.png`, clip: { x: 240, y: 40, width: 800, height: 150 } });

await pinTone(1); // magenta extreme
await page.waitForTimeout(250);
await page.screenshot({ path: `tools/shots/p2/p1-logo-detail-magenta.png`, clip: { x: 240, y: 40, width: 800, height: 150 } });

console.log("snapped", tag);
await browser.close();
