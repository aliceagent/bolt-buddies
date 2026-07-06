// U7 (F13) gamepad acceptance probe. Headless Chromium has no real pad, so we
// inject a Gamepad-API mock via addInitScript BEFORE the game boots, then drive
// it from the test. src/pad.js reads navigator.getGamepads() directly, so a
// well-formed mock (standard mapping, bumped timestamp) exercises the real code.
//
// Shots -> tools/shots/p2/: u7-pad-move, u7-pad-pause, u7-pad-menu, u7-pad-toast.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
page.on("console", (m) => { const t = m.text(); if (/error/i.test(t)) console.log("CONSOLE:", t); });

// --- inject a settable standard-mapping gamepad, initially DISCONNECTED so the
// connection toast can be timed by the test. ---------------------------------
await page.addInitScript(() => {
  const mkButtons = (n) => {
    const a = [];
    for (let i = 0; i < n; i++) a.push({ pressed: false, touched: false, value: 0 });
    return a;
  };
  const pad = {
    id: "Mock Standard Controller (U7)",
    index: 0,
    connected: false,
    mapping: "standard",
    axes: [0, 0, 0, 0],
    buttons: mkButtons(17),
    timestamp: performance.now(),
  };
  const slots = [null, null, null, null];
  window.__mock = { pad, slots };
  navigator.getGamepads = () => slots;
  window.__pad = {
    // NB: we deliberately do NOT dispatch a 'gamepadconnected' DOM event — Phaser's
    // gamepad plugin reads event.gamepad.index off it and a synthetic Event has no
    // .gamepad. src/pad.js detects the pad on its next navigator.getGamepads() poll
    // instead (the sanctioned direct-read path), which fires the toast all the same.
    connect() { pad.connected = true; slots[0] = pad; pad.timestamp = performance.now(); },
    setAxis(i, v) { pad.axes[i] = v; pad.timestamp = performance.now(); },
    press(i) { pad.buttons[i] = { pressed: true, touched: true, value: 1 }; pad.timestamp = performance.now(); },
    release(i) { pad.buttons[i] = { pressed: false, touched: false, value: 0 }; pad.timestamp = performance.now(); },
  };
});

await page.goto("http://localhost:5173/?canvas=1", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const shot = (tag) => page.screenshot({ path: `tools/shots/p2/${tag}.png` });
const load = async (i) => {
  await page.evaluate((idx) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Title"); m.stop("Hub"); m.stop("Game");
    m.start("Game", { levelIndex: idx });
  }, i);
  await page.waitForTimeout(1800); // let the intro banner slide through
};

// Button indices (standard mapping): A=0 (jump/confirm), START=9, DDOWN=13.
// (Inlined inside page.evaluate bodies — Node consts aren't visible in-page.)

// ---------------------------------------------------------------------------
// 1) MOVE — P1 (Beep) driven right by the left stick (~2 tiles), then a jump.
// ---------------------------------------------------------------------------
await load(0); // level 1-1
// freeze P2 so only P1's displacement is the story
await page.evaluate(() => { const b = window.__BB.scene.players[1]; b.body.moves = false; });
const x0 = await page.evaluate(() => window.__BB.scene.players[0].x);

// connect the pad now, so the detection toast fires on the next poll
await page.evaluate(() => window.__pad.connect());
await page.waitForTimeout(250);
await shot("u7-pad-toast");
const toasted = await page.evaluate(() => {
  const s = window.__BB.game.scene.getScene("UI");
  return !!(s && s._padToast && s._padToast.visible && s._padToast.alpha > 0.2 && s._padToast.text);
});
console.log("TOAST:", toasted ? `visible "${await page.evaluate(() => window.__BB.game.scene.getScene("UI")._padToast.text)}"` : "NOT visible");

// hold right ~700ms
await page.evaluate(() => window.__pad.setAxis(0, 1));
await page.waitForTimeout(700);
await page.evaluate(() => window.__pad.setAxis(0, 0));
await page.waitForTimeout(120);
const x1 = await page.evaluate(() => window.__BB.scene.players[0].x);
await shot("u7-pad-move");
console.log(`MOVE: P1 x ${x0.toFixed(0)} -> ${x1.toFixed(0)} (dx=${(x1 - x0).toFixed(0)}px, ~${((x1 - x0) / 48).toFixed(1)} tiles)`);

// jump (A=0) from the ground; sample peak upward velocity
await page.evaluate(() => window.__pad.press(0));
const vy = await page.evaluate(async () => {
  let best = 0;
  for (let i = 0; i < 20; i++) {
    best = Math.min(best, window.__BB.scene.players[0].body.velocity.y);
    await new Promise((r) => requestAnimationFrame(r));
  }
  return best;
});
await page.evaluate(() => window.__pad.release(0));
console.log(`JUMP: A pressed, peak vy=${vy.toFixed(0)} (negative = up; expect <-400)`);

// ---------------------------------------------------------------------------
// 2) PAUSE — Start button (9) pops the pause panel.
// ---------------------------------------------------------------------------
await page.evaluate(() => window.__pad.press(9));
await page.waitForTimeout(150);
await page.evaluate(() => window.__pad.release(9));
await page.waitForTimeout(300);
const paused = await page.evaluate(() => {
  const s = window.__BB.scene;
  return { paused: !!s.paused, pauseActive: window.__BB.game.scene.isActive("Pause") };
});
await shot("u7-pad-pause");
console.log("PAUSE:", JSON.stringify(paused));

// ---------------------------------------------------------------------------
// 3) TITLE MENU — d-pad down moves the selection; A confirms (logged).
// ---------------------------------------------------------------------------
await page.evaluate(() => {
  const m = window.__BB.game.scene;
  m.stop("Pause"); m.stop("UI"); m.stop("Game"); m.stop("Hub");
  m.start("Title");
});
await page.waitForTimeout(900);
const sel0 = await page.evaluate(() => window.__BB.menu.sel);
await page.evaluate(() => window.__pad.press(13)); // d-pad down
await page.waitForTimeout(150);
await page.evaluate(() => window.__pad.release(13));
await page.waitForTimeout(200);
const sel1 = await page.evaluate(() => window.__BB.menu.sel);
await shot("u7-pad-menu");
console.log(`MENU: title sel ${sel0} -> ${sel1} (d-pad down moved selection: ${sel0 !== sel1})`);

// confirm with A (0) and observe the scene change (proves activate fires)
await page.evaluate(() => window.__pad.press(0));
await page.waitForTimeout(120);
await page.evaluate(() => window.__pad.release(0));
await page.waitForTimeout(700);
const after = await page.evaluate(() => {
  const g = window.__BB.game.scene;
  return { title: g.isActive("Title"), hub: g.isActive("Hub"), game: g.isActive("Game") };
});
console.log("MENU CONFIRM: active scenes after A =", JSON.stringify(after));

await browser.close();
console.log(errors ? `u7 snapped with ${errors} page error(s)` : "u7 snapped clean");
