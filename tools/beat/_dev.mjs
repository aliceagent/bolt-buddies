// scratch dev harness — NOT a deliverable. Usage: node tools/beat/_dev.mjs <levelIndex> <G-idx>
import { chromium } from "playwright";
import { Driver } from "./driver.mjs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const levelIndex = parseInt(process.argv[2] ?? "0", 10);
const gIdx = parseInt(process.argv[3] ?? "0", 10);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERR:", m.text()); });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.evaluate(() => localStorage.clear());
await page.evaluate((i) => {
  const m = window.__BB.game.scene;
  ["UI", "Game", "Title", "Hub"].forEach((k) => m.stop(k));
  m.start("Game", { levelIndex: i });
}, levelIndex);
await page.waitForTimeout(1600);

const bb = new Driver(page);
bb.setRoles({ G: gIdx, H: 1 - gIdx });

const routeMod = await import(`./routes/${["1-1", "1-2", "1-3"][levelIndex]}.mjs`);
const steps = routeMod.default;
let ok = true;
for (const step of steps) {
  bb.stepDeaths = 0;
  const t0 = Date.now();
  try {
    console.log(`\n=== STEP: ${step.name} ===`);
    await step.fn(bb);
    console.log(`--- ok (${Date.now() - t0}ms) deaths=${bb.deaths}`);
  } catch (e) {
    ok = false;
    console.log(`!!! FAIL at "${step.name}": ${e.message}`);
    console.log(JSON.stringify((await bb.state()).players, null, 1));
    break;
  }
}
console.log(`\nDONE ok=${ok} complete=${(await bb.state()).complete} deaths=${bb.deaths}`);
await bb.releaseAll();
await browser.close();
process.exit(ok ? 0 : 1);
