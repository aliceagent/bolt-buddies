import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://localhost:5173/?canvas=1", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const m = window.__BB.game.scene;
  m.stop("UI"); m.stop("Title"); m.stop("Hub"); m.stop("Game");
  m.start("Game", { levelIndex: 2 });
});
await page.waitForTimeout(2000); // warmup / settle before sampling
const fps = await page.evaluate(async () => {
  const g = window.__BB.game;
  const samples = [];
  const start = performance.now();
  return await new Promise((resolve) => {
    const iv = setInterval(() => {
      samples.push(g.loop.actualFps);
      if (performance.now() - start > 5000) {
        clearInterval(iv);
        const v = samples.filter((x) => x > 0);
        resolve({ min: +Math.min(...v).toFixed(1), avg: +(v.reduce((a, b) => a + b) / v.length).toFixed(1), n: v.length });
      }
    }, 250);
  });
});
console.log(JSON.stringify(fps));
await browser.close();
