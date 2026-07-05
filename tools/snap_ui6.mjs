// Sprint 6 HUD redesign review shots. Dev server on :5173, Canvas renderer.
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
const shot = (tag) => page.screenshot({ path: `tools/shots/${tag}.png` });

// --- 1: HUD in 1-1 before equips --------------------------------------------
await load(0);
await shot("ui6-hud-before");

// --- 2: HUD after equips (skills + a core + a key) --------------------------
await page.evaluate(() => {
  const E = window.__BB.game.events;
  E.emit("bb:skill", { idx: 0, skill: "grapple", name: "GRAPPLING HOOK" });
  E.emit("bb:skill", { idx: 1, skill: "heavy", name: "HEAVYWEIGHT" });
  E.emit("bb:cores", [true, false, false]);
  E.emit("bb:keys", 1);
});
await page.waitForTimeout(500); // let the pip pop tween settle
await shot("ui6-hud-equipped");

// --- 3: a KOBI blip mid-type ------------------------------------------------
await page.evaluate(() => {
  window.__BB.game.events.emit("bb:blip", {
    text: "KOBI: Welcome to my lobby. Touch NOTHING. Especially the things I built for you to touch.",
    mood: "gloating",
  });
});
await page.waitForTimeout(900); // typewriter part-way through + glow pulsing
await shot("ui6-blip");

// --- 4: exit-waiting bubble (one buddy at the open door) --------------------
await load(0);
await page.evaluate(() => {
  const s = window.__BB.scene;
  s.exitDoor.open = true;
  const z = s.exitDoor.zone;
  const cx = z.x + z.width / 2, cy = z.y + z.height - 40;
  s.players[0].body.reset(cx, cy);         // P1 waiting inside the exit
  s.players[1].body.reset(cx - 48 * 4, cy); // P2 still four tiles away
});
await page.waitForTimeout(700); // let update() raise the bubble + arrow pulse
await shot("ui6-exit-waiting");

await browser.close();
console.log(errors ? `ui6 snapped with ${errors} page error(s)` : "ui6 snapped clean");
