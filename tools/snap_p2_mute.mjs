// Bolt Buddies — Global Mute Dropdown acceptance probe.
// Fresh profile; 0 page errors required.
//
//  (a) the mute glyph (MuteScene) is active + visible over Title, Hub, a level
//      (UIScene), Settings, and Pause  -> mute-{title,hub,game,settings,pause}.png
//  (b) open the dropdown, toggle each option via a REAL pointer click; assert
//      `bolt-buddies-audio-v1` gets musicMuted / sfxMuted set, they PERSIST
//      across a reload, and the glyph reflects state -> mute-dropdown.png,
//      mute-music-off.png
//  (c) muting music zeros the music bus (sfx stays up) and muting sfx zeros the
//      sfx bus (music stays up) — read from the engine's live gains + flags
//  (d) `bolt-buddies-save-v1` and `bolt-buddies-ux-v1` are untouched by mutes
//
//   node tools/snap_p2_mute.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = "tools/shots/p2";
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);
const visible = (k) => page.evaluate((k) => window.__BB.game.scene.isVisible(k), k);
const audio = () => page.evaluate(() => window.__BB.audio.engine());
// Read the engine after the gain ramps settle: poll the target bus until it
// stops moving (setTargetAtTime is exponential, so a single fixed wait can catch
// it mid-ramp). Returns the last engine snapshot.
const settledAudio = async (bus) => {
  let last = await audio();
  for (let i = 0; i < 12; i++) {
    await sleep(120);
    const cur = await audio();
    if (Math.abs(cur[bus] - last[bus]) < 1e-4) return cur;
    last = cur;
  }
  return last;
};
const muteState = () => page.evaluate(() => window.__BB.mute.state());
const isOpen = () => page.evaluate(() => window.__BB.mute.open);
const store = (k) => page.evaluate((k) => localStorage.getItem(k), k);
const tap = async (code, ms = 80) => { await page.keyboard.down(code); await sleep(ms); await page.keyboard.up(code); await sleep(60); };

// Click a GAME coordinate via a real pointer (handles canvas scale/offset).
const clickGame = async (gx, gy) => {
  const p = await page.evaluate(([gx, gy]) => {
    const c = window.__BB.game.canvas;
    const r = c.getBoundingClientRect();
    return { x: r.left + gx * (r.width / 1280), y: r.top + gy * (r.height / 720) };
  }, [gx, gy]);
  await page.mouse.click(p.x, p.y);
  await sleep(160);
};
const clickGlyph = async () => {
  const g = await page.evaluate(() => window.__BB.mute.glyph);
  await clickGame(g.x, g.y);
};
const clickRow = async (id) => {
  const r = await page.evaluate((id) => window.__BB.mute.rows.find((x) => x.id === id), id);
  await clickGame(r.x, r.y);
};

// jump straight into a level (mirrors the audio suite's helper)
const startLevel = async (i) => {
  await page.evaluate((idx) => {
    const m = window.__BB.game.scene;
    ["UI", "Game", "Title", "Hub", "Settings", "Pause"].forEach((k) => m.stop(k));
    m.start("Game", { levelIndex: idx });
  }, i);
  await sleep(900);
};
const gotoScene = async (key, data) => {
  await page.evaluate(([key, data]) => {
    const m = window.__BB.game.scene;
    ["UI", "Game", "Title", "Hub", "Settings", "Pause"].forEach((k) => m.stop(k));
    m.start(key, data || {});
  }, [key, data]);
  await sleep(700);
};

// ============================================================================
// boot fresh
// ============================================================================
await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await sleep(1100);
await tap("KeyZ"); // unlock the AudioContext (title keydown)
await sleep(200);

// ============================================================================
// (a) glyph present + on top in every scene
// ============================================================================
check("Mute scene active at boot", await active("Mute"));
check("Mute scene visible at boot", await visible("Mute"));

check("(a) Title active", await active("Title"));
check("(a) Mute over Title", (await active("Mute")) && (await visible("Mute")));
await shot("mute-title");

await gotoScene("Hub");
check("(a) Hub active", await active("Hub"));
check("(a) Mute over Hub", (await active("Mute")) && (await visible("Mute")));
await shot("mute-hub");

await startLevel(0);
check("(a) UI (in-game HUD) active", await active("UI"));
check("(a) Mute over gameplay", (await active("Mute")) && (await visible("Mute")));
await shot("mute-game");

await gotoScene("Settings", { returnTo: "Title" });
check("(a) Settings active", await active("Settings"));
check("(a) Mute over Settings", (await active("Mute")) && (await visible("Mute")));
await shot("mute-settings");

// Pause: into a level, then P
await startLevel(0);
await tap("KeyP");
await sleep(250);
check("(a) Pause active", await active("Pause"));
check("(a) Mute over Pause overlay", (await active("Mute")) && (await visible("Mute")));
await shot("mute-pause");
await tap("KeyP"); // resume out
await sleep(200);

// ============================================================================
// (d) snapshot the OTHER stores before any mute action
// ============================================================================
await gotoScene("Title");
await tap("KeyZ");
const saveBefore = await store("bolt-buddies-save-v1");
const uxBefore = await store("bolt-buddies-ux-v1");

// ============================================================================
// (b) open the dropdown + toggle each option via pointer; persist across reload
// ============================================================================
await clickGlyph();
check("(b) glyph click opens the dropdown", await isOpen());
await shot("mute-dropdown");

// MUSIC -> muted
await clickRow("music");
let ms = await muteState();
check("(b) MUSIC row mutes music (musicMuted true)", ms.musicMuted === true, JSON.stringify(ms));
let a = await audio();
check("(b) audio-v1 in-memory has musicMuted flag", a.musicMuted === true, JSON.stringify({ musicMuted: a.musicMuted }));
await shot("mute-music-off");

// SOUND FX -> muted
await clickRow("sfx");
ms = await muteState();
check("(b) SOUND FX row mutes sfx (sfxMuted true)", ms.sfxMuted === true, JSON.stringify(ms));
check("(b) both muted -> derived master muted true", ms.muted === true, JSON.stringify(ms));

// persisted blob has both flags
const persisted = JSON.parse((await store("bolt-buddies-audio-v1")) || "{}");
check("(b) audio-v1 persists musicMuted + sfxMuted", persisted.musicMuted === true && persisted.sfxMuted === true, JSON.stringify(persisted));

// reload — flags survive, glyph reflects state
await page.reload({ waitUntil: "networkidle" });
await sleep(1000);
const afterReload = await muteState();
check("(b) mute flags persist across reload", afterReload.musicMuted === true && afterReload.sfxMuted === true, JSON.stringify(afterReload));
const engAfter = await audio();
check("(b) engine applied persisted mute (master muted)", engAfter.muted === true, JSON.stringify({ muted: engAfter.muted }));

// unmute both for the per-bus proof below
await tap("KeyZ"); // re-unlock ctx after reload
await clickGlyph();
await clickRow("all"); // MUTE ALL toggles both off (currently both muted)
let cleared = await muteState();
check("(b) MUTE ALL row unmutes both", cleared.musicMuted === false && cleared.sfxMuted === false && cleared.muted === false, JSON.stringify(cleared));

// ============================================================================
// (c) per-bus proof: music-only mute zeros music bus, sfx stays up (& vice-versa)
// ============================================================================
await clickRow("music"); // music only
let g = await settledAudio("musicBus");
check("(c) music muted: musicBus ~0", g.musicBus < 0.05, `musicBus=${g.musicBus}`);
check("(c) music muted: sfxBus stays audible", g.sfxBus > 0.1, `sfxBus=${g.sfxBus}`);
check("(c) music muted: sfxMuted false", g.sfxMuted === false, JSON.stringify({ sfxMuted: g.sfxMuted }));

await clickRow("music"); // music back on
await clickRow("sfx");   // sfx only
g = await settledAudio("sfxBus");
check("(c) sfx muted: sfxBus ~0", g.sfxBus < 0.05, `sfxBus=${g.sfxBus}`);
check("(c) sfx muted: musicBus stays audible", g.musicBus > 0.05, `musicBus=${g.musicBus}`);
check("(c) sfx muted: musicMuted false", g.musicMuted === false, JSON.stringify({ musicMuted: g.musicMuted }));
await clickRow("sfx"); // restore

// ============================================================================
// (d) the other stores are untouched by mute actions
// ============================================================================
const saveAfter = await store("bolt-buddies-save-v1");
const uxAfter = await store("bolt-buddies-ux-v1");
check("(d) save-v1 untouched by mute actions", saveAfter === saveBefore, `before=${saveBefore} after=${saveAfter}`);
check("(d) ux-v1 untouched by mute actions", uxAfter === uxBefore, `before=${uxBefore} after=${uxAfter}`);

await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (pageErrors.length) console.log(`page errors: ${pageErrors.length} (first: ${pageErrors[0]})`);
process.exit(fails.length || pageErrors.length ? 1 : 0);
