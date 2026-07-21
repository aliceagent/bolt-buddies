import { chromium } from "playwright";
const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newContext({ viewport: { width: 900, height: 600 } }).then((c) => c.newPage());
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await sleep(900);
const out = [];
for (let i = 0; i < 12; i++) {
  await page.evaluate((idx) => {
    localStorage.clear();
    const m = window.__BB.game.scene;
    ["UI", "Title", "Hub", "Game", "Epilogue"].forEach((k) => m.stop(k));
    m.start("Game", { levelIndex: idx });
  }, i);
  await sleep(1400);
  const r = await page.evaluate(() => {
    const g = window.__BB.scene;
    // count total capped runs too, to show the ~1/3 ratio
    return { id: g.def.id, world: g.def.world, polished: (g._polishedRuns || []).length,
             smears: g.children.list.filter((o) => o.texture && o.texture.key === "refsmear").length };
  });
  out.push(r);
  console.log(`${r.id} (W${r.world}): polishedRuns=${r.polished} smears=${r.smears}`);
}
await browser.close();
