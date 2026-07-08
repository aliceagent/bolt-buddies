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
// S5: the unmuted master sits at the 0.8 ceiling (headroom), not 1.0.
check("masterGain up to the 0.8 ceiling (unmuted) after keypress", a1.muted === false && a1.masterGain > 0.7 && a1.masterGain < 0.85, `muted=${a1.muted} master=${a1.masterGain}`);

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
check("M unmutes: masterGain restored to 0.8 ceiling", a3.masterGain > 0.7 && a3.masterGain < 0.85, `master=${a3.masterGain}`);

// --- section-advance: the loop pointer must move over time (title still up) ----
const s0 = await scene(() => window.__BB.audio.music);
await page.waitForTimeout(3600); // > 1 bar at 90 BPM (~2.67s/bar)
const s1 = await scene(() => window.__BB.audio.music);
check(
  "section pointer advances over time (bar or section moves)",
  (s1.bar !== s0.bar || s1.section !== s0.section) && s1.bar >= 0,
  `from bar=${s0.bar}/sec=${s0.section} to bar=${s1.bar}/sec=${s1.section}`
);

// helper: jump straight into a level (ctx already unlocked above)
const startLevel = async (i) => {
  await scene((idx) => {
    const m = window.__BB.game.scene;
    ["UI", "Game", "Title", "Hub"].forEach((k) => m.stop(k));
    m.start("Game", { levelIndex: idx });
  }, i);
  await page.waitForTimeout(700);
};

// --- check 2: music is unique per scene/level --------------------------------
check("title scene plays `title`", (await scene(() => window.__BB.audio.music.current)) === "title");
await startLevel(0); // 1-1
check("entering 1-1 plays `w1l1`", (await scene(() => window.__BB.audio.music.current)) === "w1l1", await scene(() => window.__BB.audio.music.current));
await startLevel(4); // 2-2
check("entering 2-2 plays `w2l2`", (await scene(() => window.__BB.audio.music.current)) === "w2l2", await scene(() => window.__BB.audio.music.current));

// --- check 7: 1-3 crane defeat turns the `tension` layer off ------------------
await startLevel(2); // 1-3
check("1-3 plays `w1l3`", (await scene(() => window.__BB.audio.music.current)) === "w1l3", await scene(() => window.__BB.audio.music.current));
check("1-3 tension layer ON while crane lives", (await scene(() => window.__BB.audio.music.tension)) === true);
// drive the real crane-defeat code path (3rd pod stomp)
await scene(() => {
  const s = window.__BB.scene;
  const c = s.crane;
  c.podsStomped = 2;
  const pod = { active: true, x: c.body.x, y: c.floorY - 20, destroy() {} };
  s.pods.push(pod);
  s.stompPod(pod);
});
await page.waitForTimeout(150);
check("1-3 crane defeat turns tension layer OFF", (await scene(() => window.__BB.audio.music.tension)) === false, `tension=${await scene(() => window.__BB.audio.music.tension)}`);

// --- check 3: completing a level switches music to `jingle_clear` -------------
await startLevel(0); // fresh 1-1
await scene(() => window.__BB.scene.finishLevel());
await page.waitForTimeout(200);
check("finishLevel switches music to `jingle_clear`", (await scene(() => window.__BB.audio.music.current)) === "jingle_clear", await scene(() => window.__BB.audio.music.current));

// --- S3 SFX pass: rate limiter, voice library, KOBI moods --------------------
// The sfx test surface is global (window.__BB.audio.sfx) and independent of the
// active scene; the ctx was unlocked by the KeyZ tap at the top of this run.

// spot check A: the new voice library is exposed
const voices = await scene(() => Object.keys(window.__BB.audio.sfx.voices));
const need = ["squish", "craneYank", "fanFlutter", "coresFanfare", "rollerZap", "wardenTopple", "phaseIn", "hangLatch", "kobi"];
check(
  "sfx module exposes the new S3 voices",
  need.every((n) => voices.includes(n)),
  `missing: ${need.filter((n) => !voices.includes(n)).join(",") || "none"}`
);

// check 8: 20 rapid squish() calls schedule <= 5 actual plays (rate limiter)
const squishCount = await scene(() => {
  window.__BB.audio.sfx.reset();
  for (let i = 0; i < 20; i++) window.__BB.audio.sfx.voices.squish();
  return window.__BB.audio.sfx.counts.squish || 0;
});
check("rate limiter: 20 rapid squish calls -> <= 5 plays", squishCount >= 1 && squishCount <= 5, `plays=${squishCount}`);

// spot check B: a mood-tagged blip selects the matching KOBI voice
const moodCounts = await scene(() => {
  window.__BB.audio.sfx.reset();
  window.__BB.audio.sfx.kobi("angry");
  window.__BB.audio.sfx.kobi("defeated");
  window.__BB.audio.sfx.kobi("defeated");
  const c = window.__BB.audio.sfx.counts;
  return { angry: c.kobi_angry || 0, defeated: c.kobi_defeated || 0, gloating: c.kobi_gloating || 0 };
});
check(
  "KOBI mood router: angry/defeated tags hit the right voice",
  moodCounts.angry === 1 && moodCounts.defeated === 2 && moodCounts.gloating === 0,
  JSON.stringify(moodCounts)
);

// --- S5: positional stereo pan clamps to ±0.3 --------------------------------
// Deterministic: plant a listener at x=0 with a 640px half-width, then check the
// pan mapping. Off-screen-far saturates at the ±0.3 ceiling; centre is 0.
const panVals = await scene(() => {
  const s = window.__BB.audio.sfx;
  s.setListener(0, 0, 640, 360);
  return {
    center: s.panForX(0),
    right: s.panForX(320),
    farRight: s.panForX(99999),
    farLeft: s.panForX(-99999),
    nullX: s.panForX(null),
  };
});
check(
  "S5 stereo pan: clamps to ±0.3, centre 0, null centred",
  Math.abs(panVals.center) < 1e-6 &&
    Math.abs(panVals.right - 0.15) < 1e-6 &&
    Math.abs(panVals.farRight - 0.3) < 1e-6 &&
    Math.abs(panVals.farLeft + 0.3) < 1e-6 &&
    Math.abs(panVals.nullX) < 1e-6,
  JSON.stringify(panVals)
);

// --- check 5: Settings — open with S from title, arrow-adjust music volume,   -
// value changes AND persists after a page reload (localStorage) ---------------
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1000);
check("check5: title active after reload", await active("Title"));
await tap("KeyS"); // Title's S opens the settings page (also unlocks audio)
await page.waitForTimeout(300);
check("check5: S from title opens Settings", await active("Settings"));
const musBefore = await scene(() => window.__BB.audio.engine().music);
await tap("ArrowRight");
await tap("ArrowRight");
await page.waitForTimeout(120);
const musAfter = await scene(() => window.__BB.audio.engine().music);
check("check5: arrow adjusts music volume", musAfter !== musBefore, `before=${musBefore} after=${musAfter}`);
// reload: engine loads settings from localStorage at module-init, so the value
// survives even before the next keypress.
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(900);
const musPersist = await scene(() => window.__BB.audio.engine().music);
check("check5: music volume persists across reload", musPersist === musAfter, `reloaded=${musPersist} expected=${musAfter}`);

// --- check 6: Pause — P sets physics.world.isPaused true + panel visible, P    -
// resumes ---------------------------------------------------------------------
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(900);
await tap("KeyZ"); // unlock the AudioContext on the title
await startLevel(0); // into 1-1
await tap("KeyP");
await page.waitForTimeout(200);
const pausedState = await scene(() => window.__BB.scene.physics.world.isPaused);
check("check6: P sets physics.world.isPaused true", pausedState === true, `isPaused=${pausedState}`);
check("check6: pause panel visible (Pause scene active)", await active("Pause"));
await tap("KeyP");
await page.waitForTimeout(200);
const resumedState = await scene(() => window.__BB.scene.physics.world.isPaused);
check("check6: P resumes (isPaused false, panel gone)", resumedState === false && !(await active("Pause")), `isPaused=${resumedState}`);

const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
const wdPeak = await page.evaluate(() => (typeof window.__bbWatchdogPeakTier === "number" ? window.__bbWatchdogPeakTier : 0)).catch(() => 0);
console.log(`SL2 watchdog peak tier during audio playtest: ${wdPeak} (0 = never raised)`);
await browser.close();
process.exit(fails.length ? 1 : 0);
