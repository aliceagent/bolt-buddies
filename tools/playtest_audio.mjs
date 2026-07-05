// Automated audio playtest (Sound Sprint S1). Headless WebAudio runs in
// Chromium; we assert engine STATE, not sound. Same PASS/FAIL / N/N style as
// tools/playtest.mjs. Implements the roadmap "Test plan" checks 1 and 4.
//
// Run `npm run dev` first (or set BB_URL). S2+ extend this file with the rest
// of the test plan (music-per-scene, jingles, tension layer, rate limiter).
import { chromium } from "playwright";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch({
  executablePath: process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE ERROR:", m.text());
  if (m.type() === "warning" && /audiocontext/i.test(m.text())) console.log("AUDIO WARN:", m.text());
});
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const scene = (fn, ...args) => page.evaluate(fn, ...args);
const audio = () => scene(() => window.__BB.audio.engine());
const active = (key) => scene((k) => window.__BB.game.scene.isActive(k), key);
const hold = async (key, ms) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
};
const tap = (key) => hold(key, 70);

// --- pre-gesture: nothing may have created an AudioContext yet ---------------
check("title scene active", await active("Title"));
const pre = await audio();
check("no AudioContext before first keydown (autoplay-safe)", pre.state === "none", `state=${pre.state}`);

// --- check 1: after a keypress, __BB.audio exists + context is running -------
// KeyZ triggers the title's keydown->initAudio() without navigating away.
await tap("KeyZ");
await page.waitForTimeout(200);
const hasSurface = await scene(() => !!(window.__BB.audio && window.__BB.audio.engine && window.__BB.audio.music));
check("__BB.audio test surface exists", hasSurface);
const a1 = await audio();
check("AudioContext running after keypress", a1.state === "running", `state=${a1.state}`);
check("masterGain up (unmuted) after keypress", a1.muted === false && a1.masterGain > 0.9, `muted=${a1.muted} master=${a1.masterGain}`);

// title proof track requested + playing
const m1 = await scene(() => window.__BB.audio.music);
check("title track is current + playing", m1.current === "title" && m1.playing === true, JSON.stringify(m1));

// --- check 4: M toggles muted + masterGain 0/restored ------------------------
await tap("KeyM");
await page.waitForTimeout(220);
const a2 = await audio();
check("M mutes: muted=true", a2.muted === true, `muted=${a2.muted}`);
check("M mutes: masterGain -> 0", a2.masterGain < 0.05, `master=${a2.masterGain}`);

await tap("KeyM");
await page.waitForTimeout(220);
const a3 = await audio();
check("M unmutes: muted=false", a3.muted === false, `muted=${a3.muted}`);
check("M unmutes: masterGain restored", a3.masterGain > 0.9, `master=${a3.masterGain}`);

const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
await browser.close();
process.exit(fails.length ? 1 : 0);
