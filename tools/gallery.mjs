// UI Sprint 11 — full gallery capture.
//   node tools/gallery.mjs        (dev server on :5173)
// Drops title / hub(fresh+progressed) / six levels (start + mid-action) into
// tools/shots/gallery/. Purely a screenshot tool — never asserts.
//
// Uses a FRESH BROWSER per chunk (title+hubs, then one browser per level): the
// single-browser title->hub->level path reliably wedges the headless WebGL
// context (documented in playtest_w2.mjs), so each level gets its own context.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const SHOTS = (process.env.BB_SHOTS || "tools/shots") + "/gallery";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
mkdirSync(SHOTS, { recursive: true });

async function withPage(fn) {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
    page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERROR:", m.text()); });
    await page.goto(URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(1400);
    const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
    const scene = (f, ...a) => page.evaluate(f, ...a);
    const sleep = (ms) => page.waitForTimeout(ms);
    await fn({ page, shot, scene, sleep });
  } finally {
    await browser.close();
  }
}

// --- chunk 1: title + hub (fresh) + hub (progressed) ------------------------
await withPage(async ({ shot, scene, sleep }) => {
  await scene(() => { const m = window.__BB.game.scene; ["UI","Game","Hub"].forEach(k=>m.stop(k)); m.start("Title"); });
  await sleep(1200);
  await shot("00-title");

  await scene(() => {
    localStorage.setItem("bolt-buddies-save-v1", JSON.stringify({ unlocked: 1, cores: {} }));
    const m = window.__BB.game.scene; ["UI","Game","Title","Hub"].forEach(k=>m.stop(k));
    m.start("Hub", { sel: 0 });
  });
  await sleep(750);
  await shot("01-hub-fresh");

  await scene(() => {
    localStorage.setItem("bolt-buddies-save-v1", JSON.stringify({
      unlocked: 6,
      cores: {
        "1-1": [true,true,true], "1-2": [true,true,false], "1-3": [true,false,false],
        "2-1": [true,true,false], "2-2": [true,false,false],
      },
    }));
    const m = window.__BB.game.scene; ["UI","Game","Title","Hub"].forEach(k=>m.stop(k));
    m.start("Hub", { sel: 5 });
  });
  await sleep(750);
  await shot("02-hub-progressed");
});

// --- one browser per level: start (banner) + mid-action (running from spawn) -
const LV = [
  { i: 0, id: "1-1" }, { i: 1, id: "1-2" }, { i: 2, id: "1-3" },
  { i: 3, id: "2-1" }, { i: 4, id: "2-2" }, { i: 5, id: "2-3" },
];
for (const { i, id } of LV) {
  try {
    await withPage(async ({ page, shot, scene, sleep }) => {
      await scene((i) => { const m = window.__BB.game.scene; ["UI","Title","Hub","Game"].forEach(k=>m.stop(k)); m.start("Game", { levelIndex: i }); }, i);
      await sleep(1300);            // banner slid in and holding + HUD up
      await shot(`${id}-start`);
      await sleep(2400);            // banner leaves, KOBI blip typing
      // mid-action: run both robots off the spawn (dust + parallax + blip bar).
      // Pure keyboard — no teleport, to steer clear of the WebGL-wedge window.
      await page.keyboard.down("KeyD");
      await page.keyboard.down("ArrowRight");
      await sleep(360);
      await page.keyboard.down("KeyW");
      await page.keyboard.down("ArrowUp");
      await sleep(140);
      await page.keyboard.up("KeyW");
      await page.keyboard.up("ArrowUp");
      await sleep(120);
      await shot(`${id}-action`);
      await page.keyboard.up("KeyD");
      await page.keyboard.up("ArrowRight");
    });
    console.log(`captured ${id}`);
  } catch (e) {
    console.log(`level ${id} chunk failed:`, e.message);
  }
}

console.log("gallery captured ->", SHOTS);
