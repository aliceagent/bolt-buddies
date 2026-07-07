// GFX P10 (Menus, overlays & transitions) acceptance probe.
//
// Captures the rebuilt Settings + Pause (title-screen standard via the shared
// ui-kit), the refactored Title (must still read as the accepted look), the
// clear overlay with bolt-and-gear confetti behind the panel, and a
// representative mid-frame of the KOBI iris-wipe. ASSERTS that Settings still
// carries U11's four comfort rows (SCREEN SHAKE / FLASH EFFECTS / HINTS / TEXT
// SPEED) plus the audio rows, that the global mute glyph renders over both
// Settings and Pause, and that the run is free of page errors.
//
//   node tools/snap_p2_p10.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = process.env.BB_SHOTS || "tools/shots/p2";
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}${extra ? " — " + extra : ""}`);
  if (!cond) fails.push(msg);
};

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
page.on("console", (m) => { if (/error/i.test(m.text())) console.log("CONSOLE:", m.text()); });

await page.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
await sleep(1000);
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const tap = async (key) => { await page.keyboard.down(key); await sleep(80); await page.keyboard.up(key); };
const active = (k) => page.evaluate((key) => window.__BB.game.scene.isActive(key), k);

// --- Title (refactored to the kit — should still read as the accepted look) ---
await sleep(400);
await shot("p10-title");
ok(await active("Title"), "Title still active after kit refactor");

// --- Settings (rebuilt) -------------------------------------------------------
await tap("KeyS"); // Title 'S' -> Settings
await page.waitForFunction(() => window.__BB.game.scene.isActive("Settings"), null, { timeout: 6000 });
await sleep(500);
await shot("p10-settings");

const settings = await page.evaluate(() => {
  const S = window.__BB.game.scene.getScene("Settings");
  const labels = S.rows.map((r) => r.label.text);
  const muteActive = window.__BB.game.scene.isActive("Mute");
  const glyph = window.__BB.mute && window.__BB.mute.glyph;
  return { labels, muteActive, glyph };
});
console.log("  Settings rows:", settings.labels.join(" | "));
const need = ["SCREEN SHAKE", "FLASH EFFECTS", "HINTS", "TEXT SPEED"];
ok(need.every((l) => settings.labels.includes(l)),
  "Settings preserves U11's four comfort rows", need.filter((l) => !settings.labels.includes(l)).join(",") || "all present");
ok(["MUSIC VOLUME", "SFX VOLUME", "MUTE ALL"].every((l) => settings.labels.includes(l)),
  "Settings preserves the audio rows");
ok(settings.muteActive && !!settings.glyph, "mute glyph renders over Settings",
  settings.glyph ? `glyph@${settings.glyph.x},${settings.glyph.y}` : "no glyph");

// --- Pause (rebuilt) ----------------------------------------------------------
await page.evaluate(() => {
  const m = window.__BB.game.scene;
  m.stop("Settings"); m.stop("Title"); m.stop("Hub");
  m.start("Game", { levelIndex: 0 });
});
await page.waitForFunction(() => {
  const g = window.__BB.game.scene.getScene("Game");
  return !!(g && g.players && g.players.length === 2 && window.__BB.game.scene.isActive("Game"));
}, null, { timeout: 8000 });
await sleep(1200);
await tap("KeyP"); // GameScene owns P -> launches the Pause overlay
await page.waitForFunction(() => window.__BB.game.scene.isActive("Pause"), null, { timeout: 6000 });
await sleep(400);
await shot("p10-pause");
const pause = await page.evaluate(() => ({
  items: window.__BB.game.scene.getScene("Pause").items.map((t) => t.text),
  muteActive: window.__BB.game.scene.isActive("Mute"),
}));
ok(pause.items.join(",") === "RESUME,SETTINGS,EXIT TO MAP", "Pause keeps RESUME/SETTINGS/EXIT", pause.items.join(","));
ok(pause.muteActive, "mute glyph renders over Pause");

// resume so the clear step runs on a clean game
await tap("KeyP");
await sleep(500);

// --- Clear overlay with confetti ---------------------------------------------
await page.evaluate(() => {
  window.__BB.game.events.emit("bb:complete", {
    index: 0, name: "TEST CHAMBER", tutorial: false,
    cores: [true, true, false], newlyUnlocked: false,
    stats: { timeStr: "0:42.0", deaths: 0, coresCount: 2, grade: "KOBI: ...not bad. FOR PESTS." },
  });
});
await sleep(480); // panel pop + confetti fan at full spread
await shot("p10-clear");
const clear = await page.evaluate(() => {
  const UI = window.__BB.game.scene.getScene("UI");
  return { overlay: !!(UI.overlay && UI.overlay.visible), confetti: !!UI.confetti };
});
ok(clear.overlay && clear.confetti, "clear overlay shown with pooled confetti emitter", JSON.stringify(clear));

// --- Iris-wipe representative mid-frame ---------------------------------------
// The live iris is WebGL-gated (suites run Canvas -> plain fade). Draw the exact
// ui-kit iris ring at a mid radius over the clear frame so the shot shows the
// closing iris shape regardless of renderer.
await page.evaluate(() => {
  const UI = window.__BB.game.scene.getScene("UI");
  const W = UI.scale.width, H = UI.scale.height;
  const cx = W * 0.5, cy = H * 0.6, D = 1700, r = 170;
  const g = UI.add.graphics().setDepth(1500).setScrollFactor(0);
  g.lineStyle(D, 0x040614, 1).strokeCircle(cx, cy, r + D / 2);
  UI.__irisPreview = g;
});
await sleep(150);
await shot("p10-iriswipe");
await page.evaluate(() => { const UI = window.__BB.game.scene.getScene("UI"); UI.__irisPreview && UI.__irisPreview.destroy(); });

await browser.close();
console.log(errors ? `\nsnapped with ${errors} page error(s)` : "\nsnapped clean (0 page errors)");
if (errors) fails.push(`${errors} page error(s)`);
if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL ASSERTIONS PASSED");
