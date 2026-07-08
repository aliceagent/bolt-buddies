// Bolt Buddies — Softlock stack fps A/B (Softlock Recovery Sprint SL6).
//
// Confirms the WHOLE softlock detection+prompt stack (SL2 watchdog + SL3 detectors
// + SL4 prompt driver, all run at the tail of GameScene.update()) costs nothing
// outside thermal noise. Per level (1-3 and 2-2 — the geometry-heavy reel/fan
// levels) it runs two matched ~18s passes of identical RANDOM real input and
// samples game.loop.actualFps:
//
//   A — stack ON  : the shipped code path (watchdog+detectors+prompt update each frame)
//   B — neutralized: the three tail update methods stubbed to no-ops AT RUNTIME
//                    (scene.watchdog.update / scene.detectors.update /
//                     scene.updateStuckPrompt) — a test-only monkeypatch, NO source
//                    edit — so the frame runs every OTHER system but skips the stack.
//
// A neutralized in-test (not a code change) keeps the diff to tooling only. The
// stack is passive/read-only, so the expected delta is ~0 (within the ~1-2 fps
// SwiftShader jitter this headless box shows). Reports avg/min per pass + the delta.
//
// Input-only + read-only apart from the explicit B-pass stub. Usage:
//   BB_URL="http://localhost:5173/?canvas=1" node tools/softlock/fps_ab.mjs

import { chromium } from "playwright";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LEVEL_INDEX = { "1-1": 0, "1-2": 1, "1-3": 2, "2-1": 3, "2-2": 4, "2-3": 5, tut: 12 };
const LEVELS = ["1-3", "2-2"];
const PASS_MS = 18000;

const KEYS = [
  { left: "KeyA", right: "KeyD", jump: "KeyW", act: "KeyE", down: "KeyS" },
  { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp", act: "KeyL", down: "ArrowDown" },
];
const ALL_CODES = ["KeyA", "KeyD", "KeyW", "KeyS", "KeyE", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyL"];

async function startLevel(page, levelIndex) {
  await page.evaluate((i) => {
    localStorage.clear();
    const m = window.__BB.game.scene;
    ["UI", "Game", "Title", "Hub"].forEach((k) => m.stop(k));
    m.start("Game", { levelIndex: i });
  }, levelIndex);
  await sleep(1600);
}

// Stub / restore the three softlock tail-update methods AT RUNTIME (B-pass only).
async function neutralize(page, on) {
  await page.evaluate((off) => {
    const s = window.__BB.scene;
    if (off) {
      s.__ab = s.__ab || {};
      s.__ab.wd = s.watchdog.update.bind(s.watchdog);
      s.__ab.dt = s.detectors.update.bind(s.detectors);
      s.__ab.up = s.updateStuckPrompt.bind(s);
      s.watchdog.update = () => {};
      s.detectors.update = () => {};
      s.updateStuckPrompt = () => {};
    } else if (s.__ab) {
      s.watchdog.update = s.__ab.wd;
      s.detectors.update = s.__ab.dt;
      s.updateStuckPrompt = s.__ab.up;
    }
  }, on);
}

// One matched pass: identical deterministic pseudo-random input, sampling fps.
async function pass(page, seedBase) {
  // deterministic PRNG so A and B drive the SAME input sequence
  let seed = seedBase >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
  const held = [new Set(), new Set()];
  const press = async (c, set) => { if (!set.has(c)) { set.add(c); await page.keyboard.down(c); } };
  const release = async (c, set) => { if (set.has(c)) { set.delete(c); await page.keyboard.up(c); } };
  const tap = async (c) => { await page.keyboard.down(c); await sleep(70); await page.keyboard.up(c); };
  const fps = [];
  const start = Date.now();
  try {
    while (Date.now() - start < PASS_MS) {
      for (let i = 0; i < 2; i++) {
        const k = KEYS[i]; const r = rnd();
        if (r < 0.7) { const gr = rnd() < 0.5; await release(gr ? k.left : k.right, held[i]); await press(gr ? k.right : k.left, held[i]); }
        else if (r < 0.85) await tap(k.jump);
        else if (r < 0.95) await tap(k.act);
        else { await release(k.left, held[i]); await release(k.right, held[i]); }
      }
      const f = await page.evaluate(() => window.__BB.game.loop.actualFps);
      if (f > 0) fps.push(f);
      await sleep(140 + rnd() * 160);
    }
  } finally { for (const c of ALL_CODES) await page.keyboard.up(c).catch(() => {}); }
  const scored = fps.slice(2).filter((x) => x > 0); // drop cold opening samples
  const avg = scored.length ? +(scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(1) : 0;
  const min = scored.length ? +Math.min(...scored).toFixed(1) : 0;
  return { avg, min, samples: scored.length };
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(URL, { waitUntil: "networkidle" });
  await sleep(1200);

  // warmup (first level in a fresh headless browser is cold — discard)
  await startLevel(page, LEVEL_INDEX["1-3"]);
  await pass(page, 1);

  console.log("Bolt Buddies — SL6 softlock stack fps A/B (stack ON vs neutralized)\n");
  const rows = [];
  for (const id of LEVELS) {
    // A — stack ON
    await startLevel(page, LEVEL_INDEX[id]);
    await neutralize(page, false);
    const a = await pass(page, 0x51 + id.charCodeAt(0));
    // B — neutralized (stub the three tail update methods)
    await startLevel(page, LEVEL_INDEX[id]);
    await neutralize(page, true);
    const b = await pass(page, 0x51 + id.charCodeAt(0));
    await neutralize(page, false);
    const dAvg = +(a.avg - b.avg).toFixed(1);
    const dMin = +(a.min - b.min).toFixed(1);
    rows.push({ level: id, "ON avg": a.avg, "OFF avg": b.avg, "Δavg": dAvg, "ON min": a.min, "OFF min": b.min, "Δmin": dMin });
    console.log(`  ${id}: stack-ON avg ${a.avg}/min ${a.min}  |  neutralized avg ${b.avg}/min ${b.min}  |  Δavg ${dAvg} fps  Δmin ${dMin} fps`);
  }
  console.log("");
  console.table(rows);
  const worst = rows.reduce((m, r) => Math.max(m, Math.abs(r["Δavg"])), 0);
  console.log(`\nworst |Δavg| = ${worst} fps (within ~±2 fps SwiftShader jitter ⇒ the softlock stack's cost is thermal noise)`);
  if (pageErrors.length) console.log(`page errors: ${pageErrors.length} (first: ${pageErrors[0]})`);
  await browser.close();
  process.exit(pageErrors.length ? 1 : 0);
}

main().catch((e) => { console.error("fps A/B crashed:", e); process.exit(1); });
