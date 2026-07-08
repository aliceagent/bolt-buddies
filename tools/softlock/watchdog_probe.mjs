// Bolt Buddies — Progress Watchdog DOES-FIRE probe (SL2).
//
// Proves the SL2 watchdog actually escalates on a genuine stall. It starts a
// level, then drives a scripted "both robots sit perfectly still" input (i.e. it
// presses NOTHING) in a safe spot and polls window.__bbStuckTier, recording the
// wall-clock at which the tier crosses 0->1 and 1->2. A correct watchdog reaches
// t1 at ~25s and t2 at ~50s of continuous idle.
//
// It is input-only + read-only, exactly like the beat/softlock drivers: the only
// evaluate() calls are scene orchestration (start a level, zero the peak) and
// pure reads (the stuck tier + a small state snapshot). It NEVER mutates scene
// state.
//
// Usage:
//   BB_URL="http://localhost:5173/?canvas=1" node tools/softlock/watchdog_probe.mjs
//   BB_URL="..." node tools/softlock/watchdog_probe.mjs tut   # pick the idle level

import { chromium } from "playwright";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// tutorial (index 12) has the safest idle spot — both robots stand on solid
// ground at spawn with nothing that can kill them while idle.
const LEVEL_INDEX = { "1-1": 0, "1-2": 1, "1-3": 2, "2-1": 3, "2-2": 4, "2-3": 5, tut: 12 };
const which = process.argv.find((a) => LEVEL_INDEX[a] !== undefined) || "tut";

async function startLevel(page, levelIndex) {
  await page.evaluate((i) => {
    localStorage.clear();
    const m = window.__BB.game.scene;
    ["UI", "Game", "Title", "Hub"].forEach((k) => m.stop(k));
    m.start("Game", { levelIndex: i });
  }, levelIndex);
  await sleep(1800);
}

async function readTier(page) {
  return page.evaluate(() => {
    const s = window.__BB.scene;
    return {
      tier: s ? (s.stuckTier | 0) : -1,
      winTier: (typeof window.__bbStuckTier === "number") ? window.__bbStuckTier : -1,
      peak: (typeof window.__bbWatchdogPeakTier === "number") ? window.__bbWatchdogPeakTier : -1,
      stallMs: s && s.watchdog ? Math.round(s.watchdog._stallMs) : -1,
      dead: s ? s.players.map((p) => p.dead) : [],
      complete: s ? s.complete : false,
    };
  });
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(URL, { waitUntil: "networkidle" });
  await sleep(1200);

  console.log(`[watchdog does-fire] level=${which} — driving a scripted SIT-STILL stall\n`);
  await startLevel(page, LEVEL_INDEX[which]);
  // zero the session peak so this run's escalation is measured cleanly
  await page.evaluate(() => { window.__bbWatchdogPeakTier = 0; window.__bbWatchdogPeak = null; });
  // press nothing at all — both robots idle on solid ground.

  const t0 = Date.now();
  let firstT1 = null, firstT2 = null;
  const timeline = [];
  let lastTier = -1;
  // poll for up to 58s of idle (T2 is 50s of accumulated stall)
  while (Date.now() - t0 < 58000) {
    const r = await readTier(page);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    if (r.tier !== lastTier) {
      timeline.push({ atS: +elapsed, tier: r.tier, stallMs: r.stallMs });
      console.log(`  t=${elapsed}s  tier=${r.tier}  (stallMs=${r.stallMs}, peak=${r.peak})`);
      if (r.tier >= 1 && firstT1 === null) firstT1 = +elapsed;
      if (r.tier >= 2 && firstT2 === null) firstT2 = +elapsed;
      lastTier = r.tier;
    }
    if (r.dead.some(Boolean)) {
      console.log(`  !! a robot died at t=${elapsed}s (idle spot not safe) — aborting`);
      break;
    }
    if (firstT2 !== null) break; // reached t2 — done
    await sleep(500);
  }

  const finalPeak = await page.evaluate(() => window.__bbWatchdogPeakTier | 0);
  console.log(`\n  escalation: t1 at ${firstT1}s, t2 at ${firstT2}s  (session peak tier = ${finalPeak})`);
  const ok = firstT1 !== null && firstT2 !== null &&
    firstT1 >= 22 && firstT1 <= 30 && firstT2 >= 47 && firstT2 <= 56;
  console.log(ok ? "  RESULT: PASS — watchdog escalated 0->1->2 on schedule" :
    "  RESULT: FAIL — did not escalate on the expected schedule");
  if (pageErrors.length) console.log(`  page errors: ${pageErrors.length} (first: ${pageErrors[0]})`);

  await browser.close();
  process.exit(ok && !pageErrors.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
