// Sprint 9 screenshots: intro banner, clear overlay, hub unlock moment.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const SHOTS = process.env.BB_SHOTS || "tools/shots";
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERROR:", m.text()); });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const scene = (fn, ...a) => page.evaluate(fn, ...a);
const sleep = (ms) => page.waitForTimeout(ms);

// --- intro banner (1-2 has a nice name) -------------------------------------
await scene(() => {
  const m = window.__BB.game.scene;
  ["UI", "Game", "Title", "Hub"].forEach((k) => m.stop(k));
  m.start("Game", { levelIndex: 1 });
});
await sleep(650); // banner has slid in and is holding
await shot("ui9-intro-banner");
console.log("intro banner: __BB.scene present =", await scene(() => !!window.__BB.scene));

// --- clear overlay (mixed cores so a "?" slot shows) ------------------------
await sleep(2200); // let the banner leave first
await scene(() => {
  const s = window.__BB.scene;
  s.coresGot = [true, true, false];
  s.finishLevel();
});
await sleep(1900); // bb:complete (500) + one-by-one reveal + saved tag
await shot("ui9-clear-overlay");

// --- hub unlock moment ------------------------------------------------------
await scene(() => {
  localStorage.setItem("bolt-buddies-save-v1", JSON.stringify({ unlocked: 3, cores: { "1-1": [true, true, false], "1-2": [true, false, false] } }));
  const m = window.__BB.game.scene;
  ["UI", "Game", "Title", "Hub"].forEach((k) => m.stop(k));
  m.start("Hub", { sel: 2, unlock: true });
});
await sleep(560); // unlock anim starts at ~300ms (lock fade + ring burst mid-flight)
await shot("ui9-hub-unlock");

await browser.close();
console.log("done");
