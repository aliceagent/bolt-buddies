// GFX P12 — full final gallery capture (regen of tools/gallery.mjs + the states
// shipped since: SL4 "Stuck?" prompt, the global mute dropdown, tutorial, pause,
// settings, clear overlay, and representative animation frames).
// W3W4 X1 extends it to the FULL 12-level game: 3-1…4-3 start+action, the
// finale's "BOLT RESCUED!" clear overlay, the epilogue (story/credits/end)
// and the campaign-complete Title/Hub chips. (The deep DRIVEN finale-fight
// beats — blinded eye, frozen turbine run, Bolt rescue — stay with
// tools/snap_w4_l43.mjs, which stages them with real input.)
//   node tools/gallery2.mjs        (dev server on :5173)
// Drops everything into tools/shots/gallery2/. Purely a screenshot tool — it never
// asserts. Uses a FRESH BROWSER per chunk (menus together, then one browser per
// level, then one per extra state): the single-browser title->hub->level path
// reliably wedges the headless WebGL context (documented in playtest_w2.mjs), so
// each level and each Game-backed state gets its own context.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const SHOTS = (process.env.BB_SHOTS || "tools/shots") + "/gallery2";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const T = 48;
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

// Click a GAME coordinate via a real pointer (handles canvas scale/offset).
async function clickGame(page, gx, gy) {
  const p = await page.evaluate(([gx, gy]) => {
    const c = window.__BB.game.canvas;
    const r = c.getBoundingClientRect();
    return { x: r.left + gx * (r.width / 1280), y: r.top + gy * (r.height / 720) };
  }, [gx, gy]);
  await page.mouse.click(p.x, p.y);
}

// --- chunk 1: menus — title + hub(fresh) + hub(progressed) + settings -------
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

  await scene(() => {
    const m = window.__BB.game.scene; ["UI","Game","Title","Hub","Settings"].forEach(k=>m.stop(k));
    m.start("Settings", { returnTo: "Title" });
  });
  await sleep(700);
  await shot("03-settings");
});

// --- one browser per level: start (banner) + mid-action (running from spawn) -
const LV = [
  { i: 0, id: "1-1" }, { i: 1, id: "1-2" }, { i: 2, id: "1-3" },
  { i: 3, id: "2-1" }, { i: 4, id: "2-2" }, { i: 5, id: "2-3" },
  { i: 6, id: "3-1" }, { i: 7, id: "3-2" }, { i: 8, id: "3-3" },
  { i: 9, id: "4-1" }, { i: 10, id: "4-2" }, { i: 11, id: "4-3" },
];
for (const { i, id } of LV) {
  try {
    await withPage(async ({ page, shot, scene, sleep }) => {
      await scene((i) => { const m = window.__BB.game.scene; ["UI","Title","Hub","Game"].forEach(k=>m.stop(k)); m.start("Game", { levelIndex: i }); }, i);
      await sleep(1300);            // banner slid in and holding + HUD up
      await shot(`${id}-start`);
      await sleep(2400);            // banner leaves, KOBI blip typing
      // mid-action: run both robots off the spawn (dust + parallax + blip bar).
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

// --- tutorial (Orientation Day) ×2: intro + a mid station --------------------
try {
  await withPage(async ({ page, shot, scene, sleep }) => {
    await scene(() => { const m = window.__BB.game.scene; ["UI","Title","Hub","Game"].forEach(k=>m.stop(k)); localStorage.clear(); m.start("Game", { levelIndex: 12 }); });
    await sleep(1600);
    await shot("tut-01-intro");
    // walk to the gadget pedestals / plate station for a second, in-lesson frame
    await page.keyboard.down("KeyD");
    await page.keyboard.down("ArrowRight");
    await sleep(1500);
    await page.keyboard.up("KeyD");
    await page.keyboard.up("ArrowRight");
    await sleep(500);
    await shot("tut-02-stations");
  });
  console.log("captured tutorial");
} catch (e) { console.log("tutorial chunk failed:", e.message); }

// --- pause overlay + clear overlay (Game-backed) ----------------------------
try {
  await withPage(async ({ page, shot, scene, sleep }) => {
    await scene(() => { const m = window.__BB.game.scene; ["UI","Title","Hub","Game"].forEach(k=>m.stop(k)); m.start("Game", { levelIndex: 0 }); });
    await sleep(1800);
    await page.keyboard.press("KeyP");
    await sleep(400);
    await shot("50-pause");
    await page.keyboard.press("KeyP"); // resume
    await sleep(500);
    // clear overlay + confetti
    await scene(() => {
      window.__BB.game.events.emit("bb:complete", {
        index: 0, name: "FIRST DAY ON THE JOB", tutorial: false,
        cores: [true, true, false], newlyUnlocked: true,
        stats: { timeStr: "0:42.0", deaths: 1, coresCount: 2, grade: "KOBI: ...not bad. FOR PESTS." },
      });
    });
    await sleep(520);
    await shot("51-clear");
  });
  console.log("captured pause + clear");
} catch (e) { console.log("pause/clear chunk failed:", e.message); }

// --- SL4 "Stuck?" prompt: tier-1 gentle / tier-2 firm / softlock DEAD END ----
try {
  await withPage(async ({ page, shot, scene, sleep }) => {
    const loadL0 = async () => {
      await scene(() => { const m = window.__BB.game.scene; ["UI","Title","Hub","Game"].forEach(k=>m.stop(k)); m.start("Game", { levelIndex: 0 }); });
      await sleep(1700);
    };
    // tier-1 gentle: real watchdog t1 stall, both robots settled heavy at spawn
    await loadL0();
    await scene(() => {
      const s = window.__BB.scene;
      for (const p of s.players) { p.setSkill("heavy"); p.invuln = 999999; p.setVelocity(0, 0); }
      s.watchdog.T1 = 300; s.watchdog.T2 = 999999; s.watchdog.reset();
    });
    await sleep(1600);
    await shot("60-sl4-tier1-gentle");

    // tier-2 firm: watchdog t2 stall
    await loadL0();
    await scene(() => {
      const s = window.__BB.scene;
      for (const p of s.players) { p.setSkill("heavy"); p.invuln = 999999; p.setVelocity(0, 0); }
      s.watchdog.T1 = 150; s.watchdog.T2 = 350; s.watchdog.reset();
    });
    await sleep(1600);
    await shot("61-sl4-tier2-firm");

    // softlock "DEAD END": latch a confirmed hard softlock so the confident copy
    // renders (capture-only — updateStuckPrompt reads this.softlock read-only).
    await loadL0();
    await scene(() => {
      const s = window.__BB.scene;
      for (const p of s.players) { p.setSkill("heavy"); p.invuln = 999999; p.setVelocity(0, 0); }
      s.watchdog.T1 = 999999; s.watchdog.T2 = 999999; s.watchdog.reset();
      s.softlock = { kind: "severed-tunnel" };
    });
    await sleep(700);
    await shot("62-sl4-softlock-deadend");
  });
  console.log("captured SL4 prompts");
} catch (e) { console.log("sl4 chunk failed:", e.message); }

// --- global mute dropdown (MuteScene overlay) -------------------------------
try {
  await withPage(async ({ page, shot, scene, sleep }) => {
    await scene(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await sleep(1100);
    await page.keyboard.press("KeyZ"); // unlock AudioContext
    await sleep(250);
    // open the dropdown over the Title screen via a real click on the glyph
    const g = await page.evaluate(() => window.__BB.mute.glyph);
    await clickGame(page, g.x, g.y);
    await sleep(300);
    await shot("70-mute-dropdown");
    // toggle music off so the glyph + row reflect a muted state
    const r = await page.evaluate(() => window.__BB.mute.rows.find((x) => x.id === "music"));
    await clickGame(page, r.x, r.y);
    await sleep(300);
    await shot("71-mute-music-off");
  });
  console.log("captured mute dropdown");
} catch (e) { console.log("mute chunk failed:", e.message); }

// --- representative animation frames (running dust / crusher hazard) ---------
try {
  await withPage(async ({ page, shot, scene, sleep }) => {
    // 1-2 crusher line — drive both robots to kick dust + catch the crusher cycle
    await scene(() => { const m = window.__BB.game.scene; ["UI","Title","Hub","Game"].forEach(k=>m.stop(k)); m.start("Game", { levelIndex: 1 }); });
    await sleep(3800); // past the banner, into live gameplay
    await page.keyboard.down("KeyD");
    await page.keyboard.down("ArrowRight");
    await sleep(700);
    await shot("80-anim-run-dust");
    await sleep(700);
    await shot("81-anim-crusher");
    await page.keyboard.up("KeyD");
    await page.keyboard.up("ArrowRight");
  });
  console.log("captured animation frames");
} catch (e) { console.log("anim chunk failed:", e.message); }

// --- W3W4 X1: the FINALE clear overlay ("BOLT RESCUED!") ---------------------
try {
  await withPage(async ({ page, shot, scene, sleep }) => {
    await scene(() => { const m = window.__BB.game.scene; ["UI","Title","Hub","Game","Epilogue"].forEach(k=>m.stop(k)); m.start("Game", { levelIndex: 11 }); });
    await sleep(1800);
    await scene(() => {
      window.__BB.game.events.emit("bb:complete", {
        index: 11, name: "KOBI'S HEART", tutorial: false, finale: true,
        cores: [true, true, true], newlyUnlocked: true,
        stats: { timeStr: "9:41.0", deaths: 3, coresCount: 3, grade: "KOBI: ...you may keep the dog." },
      });
    });
    await sleep(1900); // panel pop + core reveal + saved tag
    await shot("90-finale-clear-bolt-rescued");
  });
  console.log("captured finale clear overlay");
} catch (e) { console.log("finale clear chunk failed:", e.message); }

// --- W3W4 X1: epilogue playground -> credits -> end (key-advanced) -----------
try {
  await withPage(async ({ page, shot, scene, sleep }) => {
    await scene(() => { const m = window.__BB.game.scene; ["UI","Title","Hub","Game","Epilogue"].forEach(k=>m.stop(k)); m.start("Epilogue"); });
    await sleep(1700); // fade-in + first caption beat
    await shot("91-epilogue-story");
    for (let i = 0; i < 4; i++) { await page.keyboard.press("Enter"); await sleep(430); }
    await sleep(4800); // mid-scroll through the credits roll
    await shot("92-epilogue-credits");
    await page.keyboard.press("Enter"); // skip the scroll -> "end"
    await sleep(900);
    await shot("93-epilogue-end");
  });
  console.log("captured epilogue + credits");
} catch (e) { console.log("epilogue chunk failed:", e.message); }

// --- W3W4 X1: campaign-complete acknowledgements (Title + Hub chips) ---------
try {
  await withPage(async ({ shot, scene, sleep }) => {
    await scene(() => {
      const cores = {};
      for (const id of ["1-1","1-2","1-3","2-1","2-2","2-3","3-1","3-2","3-3","4-1","4-2","4-3"]) cores[id] = [true, true, true];
      cores["1-1"] = [true, false, true]; cores["1-2"] = [false, true, true]; // FL-T3-A/B uncollectable cores stay honest
      localStorage.setItem("bolt-buddies-save-v1", JSON.stringify({ unlocked: 13, cores }));
      const m = window.__BB.game.scene; ["UI","Game","Hub","Epilogue"].forEach(k=>m.stop(k));
      m.stop("Title"); m.start("Title");
    });
    await sleep(1700); // chip fades in over ~1.1s
    await shot("94-title-complete-chip");
    await scene(() => {
      const m = window.__BB.game.scene; ["UI","Game","Title","Hub"].forEach(k=>m.stop(k));
      m.start("Hub", { sel: 11 });
    });
    await sleep(900);
    await shot("95-hub-complete-chip");
  });
  console.log("captured completion chips");
} catch (e) { console.log("completion chips chunk failed:", e.message); }

console.log("gallery2 captured ->", SHOTS);
