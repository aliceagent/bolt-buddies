// Bolt Buddies — U11 (Comfort & readability options, F14 / F7-adjacent)
// acceptance probe. Fresh profile throughout; 0 page errors required.
//
//  (a) Title -> S -> Settings: the four new rows exist with defaults
//      (SHAKE full / FLASH full / HINTS on / TEXT SPEED normal)   -> u11-settings.png
//  (b) keyboard-toggle every new row; assert `bolt-buddies-ux-v1` updated AND
//      the seeded records/tutorialDone riders preserved (read-modify-write).
//      Pad1 (U7 mock) then changes a new row too (d-pad nav + right).
//  (c) SHAKE off: control run first (defaults -> heavy stomp -> the funneled
//      camShake resolves to amplitude > 0 via the passive `_lastShakeAmp`
//      observability field + zoomKick rises); then shake=off -> same stomp
//      breaks tiles but `_lastShakeAmp` === 0 and zoomKick stays 0. A hazard
//      death is also driven (input-only) — deaths never shook pre-U11, so the
//      assertion is that `_lastShakeAmp` stays 0 (no new shake sneaks in).
//  (d) TEXT SPEED fast: same blip typed on both settings; chars/sec measured
//      over a fixed in-page window via the blip bar's public state ~2x faster.
//  (e) HINTS off: carry a buddy in 1-1 -> no throw-arc dots (hintGfx has zero
//      commands + the passive `_hintDrawn` flag stays false); hints on -> arc
//      draws (positive control).
//
//   node tools/snap_p2_u11.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = "tools/shots/p2"; // NOTE: p2 subdir exactly (U10 missed this)
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

// Seeded riders that MUST survive every option write (U8 records + U10 flag).
const RIDERS = { records: { "1-1": { bestTime: 61234, bestDeaths: 2 } }, tutorialDone: true };

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// U7-pattern gamepad mock, injected before boot (pad.js polls navigator.getGamepads()).
await page.addInitScript(() => {
  const mkButtons = (n) => Array.from({ length: n }, () => ({ pressed: false, touched: false, value: 0 }));
  const pad = { id: "Mock Standard Controller (U11)", index: 0, connected: false, mapping: "standard", axes: [0, 0, 0, 0], buttons: mkButtons(17), timestamp: performance.now() };
  const slots = [null, null, null, null];
  navigator.getGamepads = () => slots;
  window.__pad = {
    connect() { pad.connected = true; slots[0] = pad; pad.timestamp = performance.now(); },
    press(i) { pad.buttons[i] = { pressed: true, touched: true, value: 1 }; pad.timestamp = performance.now(); },
    release(i) { pad.buttons[i] = { pressed: false, touched: false, value: 0 }; pad.timestamp = performance.now(); },
  };
});

const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);
const ux = async () => JSON.parse(await page.evaluate(() => localStorage.getItem("bolt-buddies-ux-v1")) || "{}");
const tap = async (code, ms = 90) => { await page.keyboard.down(code); await sleep(ms); await page.keyboard.up(code); await sleep(70); };
const padTap = async (i) => { await page.evaluate((i) => window.__pad.press(i), i); await sleep(160); await page.evaluate((i) => window.__pad.release(i), i); await sleep(160); };
const ridersOk = (o) => o.tutorialDone === true && o.records && o.records["1-1"] && o.records["1-1"].bestTime === 61234 && o.records["1-1"].bestDeaths === 2;

// Relaunch with a given ux-v1 blob (riders always included) — a reload both
// resets the level state and drops ux.js's module option cache.
const boot = async (opts = {}) => {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.evaluate((blob) => { localStorage.clear(); localStorage.setItem("bolt-buddies-ux-v1", JSON.stringify(blob)); },
    { ...RIDERS, ...opts });
  await page.reload({ waitUntil: "networkidle" });
  await sleep(1100);
};

// Start a level directly (U7 pattern) and let the intro banner pass.
const load = async (i) => {
  await page.evaluate((idx) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Settings"); m.stop("Title"); m.stop("Hub"); m.stop("Game");
    m.start("Game", { levelIndex: idx });
  }, i);
  await sleep(1900);
};

// Teleport a player (playtest.mjs pattern), then settle >1s before any further
// evaluate (repositioning rule).
const tp = async (i, tx, ty) => {
  await page.evaluate(([i, tx, ty]) => {
    const s = window.__BB.scene;
    const p = s.players[i];
    if (p.carriedBy) s.detachCarry(p.carriedBy, p, false);
    if (p.carrying) s.detachCarry(p, p.carrying, false);
    p.clearStates();
    p.body.reset(tx * 48 + 24, ty * 48 + 24 - 8);
    p.setVelocity(0, 0);
  }, [i, tx, ty]);
  await sleep(1100);
};

// Equip heavy on P2 at 1-1's pedestal, then stomp on the cracked floor at x31.
// Returns { crackedBroken, lastShakeAmp, maxZoomKick } — the shake evidence.
const stompRun = async () => {
  await load(0);
  await tp(1, 8, 12);
  await tap("KeyL"); // equip heavy (input)
  await sleep(300);
  const skill = await page.evaluate(() => window.__BB.scene.players[1].skill);
  await tp(1, 31, 12);
  const before = await page.evaluate(() => window.__BB.scene.crackies.countActive(true));
  await tap("ArrowUp", 120); // jump (input)
  await sleep(200);
  await page.keyboard.down("KeyL"); // stomp chord mid-air (input)
  await sleep(90);
  await page.keyboard.up("KeyL");
  // watch the landing window for the zoom kick (65 frames ≈ 1.1s)
  const maxZoomKick = await page.evaluate(async () => {
    let mx = 0;
    for (let i = 0; i < 65; i++) {
      mx = Math.max(mx, window.__BB.scene.zoomKick);
      await new Promise((r) => requestAnimationFrame(r));
    }
    return mx;
  });
  const after = await page.evaluate(() => window.__BB.scene.crackies.countActive(true));
  const lastShakeAmp = await page.evaluate(() => window.__BB.scene._lastShakeAmp);
  return { skill, crackedBroken: after < before, lastShakeAmp, maxZoomKick };
};

// Measure the KOBI typewriter rate (chars/sec) via the blip bar's public state.
const typeRate = async () => {
  await load(0);
  await page.evaluate(() => window.__BB.game.events.emit("bb:blip", "KOBI: " + "TESTING THE TYPEWRITER SPEED. ".repeat(8)));
  await sleep(450); // let the blip activate and start typing
  return page.evaluate(async () => {
    const ui = window.__BB.game.scene.getScene("UI");
    if (!ui.blipActive) return -1;
    const t0 = performance.now(), c0 = ui.blipActive.shown;
    await new Promise((r) => setTimeout(r, 1000));
    const t1 = performance.now(), c1 = ui.blipActive.shown;
    return (c1 - c0) / ((t1 - t0) / 1000);
  });
};

// Carry a buddy (P2 heavy picks up P1) and sample the U6 preview observability.
const carryProbe = async () => {
  await load(0);
  await tp(1, 8, 12);
  await tap("KeyL"); // equip heavy
  await sleep(300);
  await tp(0, 40, 13);
  await tp(1, 41, 13);
  await tap("KeyL"); // pickup (input)
  await sleep(400);
  return page.evaluate(async () => {
    const s = window.__BB.scene;
    let drawn = false, cmds = 0;
    for (let i = 0; i < 30; i++) { // sample ~0.5s of frames
      drawn = drawn || !!s._hintDrawn;
      const g = s.hintGfx;
      cmds = Math.max(cmds, (g.commands || g.commandBuffer || []).length);
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { carrying: !!s.players[1].carrying, drawn, cmds };
  });
};

// ============================================================================
// (a) fresh profile (+ seeded riders): Settings rows + defaults
// ============================================================================
await boot();
check("title scene active (fresh)", await active("Title"));
await tap("KeyS");
await sleep(400);
check("(a) S opens Settings", await active("Settings"));
const rows = await page.evaluate(() => {
  const s = window.__BB.game.scene.getScene("Settings");
  return s.rows.map((r) => ({ label: r.label.text, value: r.value.text }));
});
check("(a) 8 rows (3 audio + 4 comfort + back)", rows.length === 8, JSON.stringify(rows.map((r) => r.label)));
check("(a) SCREEN SHAKE row defaults FULL", rows[3]?.label === "SCREEN SHAKE" && rows[3]?.value === "< FULL >", JSON.stringify(rows[3]));
check("(a) FLASH EFFECTS row defaults FULL", rows[4]?.label === "FLASH EFFECTS" && rows[4]?.value === "< FULL >", JSON.stringify(rows[4]));
check("(a) HINTS row defaults ON", rows[5]?.label === "HINTS" && rows[5]?.value === "[ ON ]", JSON.stringify(rows[5]));
check("(a) TEXT SPEED row defaults NORMAL", rows[6]?.label === "TEXT SPEED" && rows[6]?.value === "< NORMAL >", JSON.stringify(rows[6]));
check("(a) row labels are kid-short (≤60 chars)", rows.every((r) => r.label.length <= 60 && r.value.length <= 60));
await shot("u11-settings");

// ============================================================================
// (b) keyboard toggles persist + riders preserved; pad1 changes a new row
// ============================================================================
await tap("KeyS"); await tap("KeyS"); await tap("KeyS"); // sel 0 -> 3 SCREEN SHAKE
await tap("KeyD"); // full -> soft
let o = await ux();
check("(b) SHAKE -> soft persisted", o.shake === "soft", JSON.stringify(o));
check("(b) riders preserved after first write", ridersOk(o), JSON.stringify(o));
await tap("KeyS"); await tap("KeyD"); // FLASH full -> soft
await tap("KeyS"); await tap("KeyD"); // HINTS on -> off
await tap("KeyS"); await tap("KeyD"); // TEXT SPEED normal -> fast
o = await ux();
check("(b) all four options persisted", o.shake === "soft" && o.flash === "soft" && o.hints === false && o.textSpeed === "fast", JSON.stringify(o));
check("(b) riders preserved after all writes", ridersOk(o), JSON.stringify(o));
const vals = await page.evaluate(() => {
  const s = window.__BB.game.scene.getScene("Settings");
  return s.rows.map((r) => r.value.text);
});
check("(b) rows render the toggled values", vals[3] === "< SOFT >" && vals[4] === "< SOFT >" && vals[5] === "[ off ]" && vals[6] === "< FAST >", JSON.stringify(vals.slice(3, 7)));
await shot("u11-settings-toggled");

// pad1 (U7 mock): d-pad up x3 -> SCREEN SHAKE row, d-pad right -> soft -> off
await page.evaluate(() => window.__pad.connect());
await sleep(400); // pad detection poll + toast
await padTap(12); await padTap(12); await padTap(12); // up: sel 6 -> 3
const padSel = await page.evaluate(() => window.__BB.game.scene.getScene("Settings").sel);
check("(b) pad d-pad navigates to a new row", padSel === 3, `sel=${padSel}`);
await padTap(15); // right: soft -> off
o = await ux();
check("(b) pad changes SCREEN SHAKE (soft -> off)", o.shake === "off", JSON.stringify(o));
check("(b) riders preserved after pad write", ridersOk(o), JSON.stringify(o));

// ============================================================================
// (c) SHAKE: control (full) shakes; off resolves every shake to amplitude 0
// ============================================================================
await boot(); // defaults (shake full)
const ctl = await stompRun();
check("(c) control: P2 equipped heavy", ctl.skill === "heavy", ctl.skill);
check("(c) control: stomp broke cracked tiles", ctl.crackedBroken);
check("(c) control: camShake resolved amplitude > 0", ctl.lastShakeAmp > 0, `amp=${ctl.lastShakeAmp}`);
check("(c) control: zoom kick fired", ctl.maxZoomKick > 0.01, `max=${ctl.maxZoomKick}`);

await boot({ shake: "off" });
const off = await stompRun();
check("(c) shake off: stomp still broke cracked tiles", off.crackedBroken);
check("(c) shake off: camShake resolved amplitude === 0", off.lastShakeAmp === 0, `amp=${off.lastShakeAmp}`);
check("(c) shake off: zoom kick stayed 0", off.maxZoomKick === 0, `max=${off.maxZoomKick}`);
await shot("u11-shake-off-stomp");
// hazard death (input/physics only — deaths never shook pre-U11; assert none appears)
const deathsBefore = await page.evaluate(() => window.__BB.scene._deaths);
await tp(0, 16, 16); // electric pit (tp settles >1s, so the respawn may already be done)
await sleep(500);
const deathsAfter = await page.evaluate(() => window.__BB.scene._deaths);
check("(c) hazard killed P1", deathsAfter === deathsBefore + 1, `deaths ${deathsBefore} -> ${deathsAfter}`);
const ampAfterDeath = await page.evaluate(() => window.__BB.scene._lastShakeAmp);
check("(c) death produced no shake (amp still 0)", ampAfterDeath === 0, `amp=${ampAfterDeath}`);

// ============================================================================
// (d) TEXT SPEED: fast types ~2x the chars over the same window
// ============================================================================
await boot(); // normal
const rNormal = await typeRate();
await boot({ textSpeed: "fast" });
const rFast = await typeRate();
const ratio = rNormal > 0 ? rFast / rNormal : 0;
check("(d) typewriter measured on both settings", rNormal > 20 && rFast > 20, `normal=${rNormal.toFixed(1)} fast=${rFast.toFixed(1)} chars/s`);
check("(d) fast ≈ 2x normal (1.7–2.3)", ratio > 1.7 && ratio < 2.3, `ratio=${ratio.toFixed(2)}`);
await shot("u11-text-fast");

// ============================================================================
// (e) HINTS off: carrying draws NO arc dots; on: arc draws (positive control)
// ============================================================================
await boot({ hints: false });
const hOff = await carryProbe();
check("(e) hints off: buddy is carried", hOff.carrying);
check("(e) hints off: no arc dots (hintGfx 0 commands, _hintDrawn false)", !hOff.drawn && hOff.cmds === 0, JSON.stringify(hOff));
await shot("u11-hints-off");
await boot(); // hints on (default)
const hOn = await carryProbe();
check("(e) hints on: arc draws while carrying", hOn.carrying && hOn.drawn && hOn.cmds > 0, JSON.stringify(hOn));
await shot("u11-hints-on");

await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (pageErrors.length) console.log(`page errors: ${pageErrors.length} (first: ${pageErrors[0]})`);
process.exit(fails.length || pageErrors.length ? 1 : 0);
