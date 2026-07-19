// Bolt Buddies — blip-bar text-box playtest (Sprint T1: BLIP BAR 2.0).
//
// Headless Chromium. Boots level 0 fresh, waits for the start blip to type, and
// asserts the T1 dismissal + pacing + queue-discipline contract via the new
// __BB.textbox probe ({ active, queueLen, skip() }) plus a direct read of the
// live UIScene.blipActive for the typewriter progress. Same PASS/FAIL / N/N
// style as tools/playtest_audio.mjs. Non-zero exit on any failure.
//
//   node tools/playtest_textbox.mjs
import { chromium } from "playwright";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// Real uncaught JS exceptions fail the run; console noise (e.g. an optional VO/
// mp3 asset 404 in dev) is logged but not fatal — matches tut_sanity's convention.
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

await page.goto(URL, { waitUntil: "networkidle" });
await sleep(1200);

// ---- helpers ----------------------------------------------------------------
const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);
const tapKey = async (key, ms = 90) => {
  await page.keyboard.down(key);
  await sleep(ms);
  await page.keyboard.up(key);
};
// One discrete ENTER press (down+up), then settle a frame so JustDown is consumed.
const pressEnter = async () => { await tapKey("Enter", 90); await sleep(90); };

// Live snapshot of the blip system: probe values + typewriter progress read
// straight off the UIScene instance (shown/full are not on the probe surface).
const snap = () => page.evaluate(() => {
  const ui = window.__BB.game.scene.getScene("UI");
  const b = ui && ui.blipActive;
  return {
    active: window.__BB.textbox.active,
    queueLen: window.__BB.textbox.queueLen,
    shown: b ? Math.floor(b.shown) : -1,
    full: b ? b.text.length : -1,
    hold: b ? Math.round(b.hold) : -1,
    slim: ui ? !!ui._blipSlim : null,
  };
});
const emitBlip = (payload) => page.evaluate((p) => window.__BB.game.events.emit("bb:blip", p), payload);

// Drain the queue + active line to a clean slate (skip completes then dismisses).
const clearBlips = async () => {
  for (let i = 0; i < 16; i++) {
    const a = await page.evaluate(() => window.__BB.textbox.active);
    if (a === null && (await page.evaluate(() => window.__BB.textbox.queueLen)) === 0) return;
    await page.evaluate(() => window.__BB.textbox.skip());
    await sleep(110);
  }
};
// Poll until predicate(snap) or timeout. Returns the last snapshot.
const waitFor = async (pred, timeout = 5000, step = 60) => {
  const t0 = Date.now();
  let s = await snap();
  while (!pred(s)) {
    if (Date.now() - t0 > timeout) return s;
    await sleep(step);
    s = await snap();
  }
  return s;
};

// ---- boot level 0 fresh -----------------------------------------------------
await tapKey("KeyZ", 70); // unlock the AudioContext on the title (duck/VO no-ops otherwise)
await sleep(150);
await page.evaluate(() => {
  const m = window.__BB.game.scene;
  ["UI", "Game", "Title", "Hub"].forEach((k) => m.stop(k));
  m.start("Game", { levelIndex: 0 });
});
await sleep(700);
check("level 0 booted (Game scene active)", await active("Game"));
check("UI HUD scene active", await active("UI"));

// wait for the scripted start blip to begin typing (active line, mid-typewriter)
const startSnap = await waitFor((s) => s.active !== null, 5000);
check("start blip begins typing", startSnap.active !== null, `active=${JSON.stringify(startSnap.active)}`);

// ---- (a) ENTER completes the typewriter -------------------------------------
// Make sure we're catching a line that is still typing (emit a long controlled
// line so the assertion is deterministic regardless of the start blip's length).
await clearBlips();
const LONG = "KOBI: This is a deliberately long calibration line so the typewriter is still busy when the test presses ENTER to complete it.";
await emitBlip(LONG);
const typing = await waitFor((s) => s.active !== null && s.shown > 0 && s.shown < s.full, 3000);
check("(pre-a) long line is mid-typewriter", typing.active !== null && typing.shown < typing.full, `shown=${typing.shown}/${typing.full}`);
await pressEnter();
const afterA = await snap();
check("(a) ENTER completes typing (shown == full)", afterA.active !== null && afterA.shown === afterA.full && afterA.full > 0, `shown=${afterA.shown}/${afterA.full} active=${afterA.active !== null}`);

// ---- (b) second ENTER dismisses the line ------------------------------------
await pressEnter();
const afterB = await snap();
check("(b) second ENTER dismisses (active null)", afterB.active === null, `active=${JSON.stringify(afterB.active)}`);

// ---- (c) queue cap: 5 emits -> queueLen <= 3 --------------------------------
await clearBlips();
// Emit 5 in one synchronous batch, then read the queue before the next update
// can shift one into `active` (proves the cap drops the overflow, not the tick).
const capLen = await page.evaluate(() => {
  const g = window.__BB.game;
  for (let i = 0; i < 5; i++) g.events.emit("bb:blip", "KOBI: queue cap probe line number " + i + " here.");
  return window.__BB.textbox.queueLen;
});
check("(c) queue cap: 5 emits -> queueLen <= 3", capLen <= 3 && capLen >= 1, `queueLen=${capLen}`);

// ---- (d) bark-drop: a bark while a line is active does not queue -------------
await clearBlips();
await emitBlip("KOBI: A scripted line is currently on screen and holding.");
await waitFor((s) => s.active !== null, 3000);
const qBefore = (await snap()).queueLen;
await emitBlip({ text: "KOBI: A droppable bark arriving mid-line.", bark: true });
await sleep(120);
const qAfter = (await snap()).queueLen;
check("(d) bark dropped while a line is active (queueLen unchanged)", qAfter === qBefore, `before=${qBefore} after=${qAfter}`);
// sanity: a NON-bark scripted line still queues behind the active one
await emitBlip("KOBI: A scripted follow-up line that must queue.");
await sleep(120);
const qScripted = (await snap()).queueLen;
check("(d2) scripted line still queues (queueLen grows)", qScripted === qBefore + 1, `before=${qBefore} after=${qScripted}`);

// ---- (e) hold scaling: a short line auto-clears < 2.5s after typing ----------
await clearBlips();
await emitBlip("KOBI: Short line."); // < 40 chars after prefix strip -> min 1200ms hold
const typed = await waitFor((s) => s.active !== null && s.shown === s.full && s.full > 0, 4000);
check("(pre-e) short line finished typing", typed.active !== null && typed.shown === typed.full, `shown=${typed.shown}/${typed.full} full=${typed.full}`);
check("(pre-e) short line uses slim bar (1 line)", typed.slim === true, `slim=${typed.slim}`);
const tTyped = Date.now();
const cleared = await waitFor((s) => s.active === null, 3000, 60);
const dtClear = Date.now() - tTyped;
check("(e) short line auto-clears < 2.5s after typing (no ENTER)", cleared.active === null && dtClear < 2500, `cleared=${cleared.active === null} dt=${dtClear}ms`);

// ---- (f) zero page errors (uncaught JS) -------------------------------------
check("(f) 0 page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

// ---- summary ----------------------------------------------------------------
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (consoleErrors.length) console.log(`(non-fatal console errors: ${consoleErrors.length}; first: ${consoleErrors[0]})`);
await browser.close();
process.exit(fails.length ? 1 : 0);
