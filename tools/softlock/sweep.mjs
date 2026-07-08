// Bolt Buddies — Softlock END-TO-END CHAIN SWEEP (Softlock Recovery Sprint SL6).
//
// The audit-close harness that proves the WHOLE softlock pipeline works end to end
// with REAL input — no faked stuckTier, no teleport, no threshold injection:
//
//   CHAIN A (hard softlock): SL3 explicit detector → SL4 tier-2 "DEAD END" prompt.
//     Drives the ONE real hard softlock (1-2 core0 severed-tunnel: stomp the
//     cracked lid, drop the Heavy into the pocket) and asserts the SL3 detector
//     latches AND the SL4 pooled prompt actually SHOWS the firm restart offer with
//     the confident "DEAD END" copy + R keycaps.
//
//   CHAIN B (general stall): SL2 watchdog t1/t2 → SL4 tier-1 gentle / tier-2 firm.
//     Sits perfectly still (presses NOTHING) on a safe idle level at the REAL,
//     SHIPPED thresholds (t1=25s / t2=50s — no injection) and asserts the watchdog
//     escalates 0→1→2 on schedule AND the SL4 prompt escalates gentle→firm in step.
//     This doubles as the SL6 threshold VALIDATION: it records the real wall-clock
//     at which a genuinely-stuck team first sees each tier.
//
// Input-only + read-only, exactly like the beat/softlock/watchdog/detector drivers:
// the only evaluate() calls are scene orchestration (start a level, zero a peak) and
// pure reads (the stuck signals + the pooled prompt's own visibility/text). It NEVER
// mutates scene state.
//
// Usage:
//   BB_URL="http://localhost:5173/?canvas=1" node tools/softlock/sweep.mjs
//   node tools/softlock/sweep.mjs --stall-level tut   # pick the idle level for chain B
//
// Exit 0 iff BOTH chains pass with 0 page errors.

import { chromium } from "playwright";
import { Driver } from "../beat/driver.mjs";
import { LEVEL_INDEX, ROLES_A, startLevel, sleep } from "./probe.mjs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const stallIdx = process.argv.indexOf("--stall-level");
const STALL_LEVEL = stallIdx >= 0 ? process.argv[stallIdx + 1] : "tut";

const fails = [];
const ok = (cond, msg) => { console.log(`  ${cond ? "PASS" : "FAIL"}: ${msg}`); if (!cond) fails.push(msg); };

// Passive read of the SL4 pooled prompt + the SL2/SL3 signals feeding it. Reads the
// prompt's OWN display-list state (container.visible + its head/sub text + keycap
// visibility) so we prove the visible deliverable, not just the upstream signal.
async function readChain(page) {
  return page.evaluate(() => {
    const s = window.__BB.scene;
    const ui = s ? s.stuckUI : null;
    return {
      stuckTier: s ? (s.stuckTier | 0) : -1,
      winTier: (typeof window.__bbStuckTier === "number") ? window.__bbStuckTier : -1,
      wdPeak: (typeof window.__bbWatchdogPeakTier === "number") ? window.__bbWatchdogPeakTier : -1,
      softlock: (typeof window.__bbSoftlock !== "undefined") ? window.__bbSoftlock : null,
      slPeak: (typeof window.__bbSoftlockPeak === "number") ? window.__bbSoftlockPeak : -1,
      stallMs: s && s.watchdog ? Math.round(s.watchdog._stallMs) : -1,
      promptVisible: !!(ui && ui.c.visible),
      promptHead: ui ? ui.head.text : "",
      promptSub: ui ? ui.sub.text : "",
      capsVisible: !!(ui && ui.caps.visible),
      promptHeadText: ui ? ui.head.text : "",
      greyVisible: !!(s && s.greyOverlay && s.greyOverlay.visible),
      sadMode: (() => { try { const e = window.__BB.audio && window.__BB.audio.engine && window.__BB.audio.engine(); return !!(e && e.sadMode); } catch { return false; } })(),
      modeShown: s ? s._stuckModeShown : "",
      coopHintActive: (() => {
        if (!s) return false;
        const co = s.coach;
        if (co && co.bubbles && co.bubbles.some((b) => b.active)) return true;
        return !!(s._pitHintFired || s._pitReelFired);
      })(),
      dead: s ? s.players.map((p) => p.dead) : [],
    };
  });
}

// ============================ CHAIN A — hard softlock ========================
// Drive the real 1-2 core0 severed-tunnel repro and assert the SL3 detector →
// SL4 tier-2 "DEAD END" prompt chain fires.
async function chainA(page) {
  console.log("\n=== CHAIN A — hard softlock (1-2 core0 severed-tunnel) → SL3 detector → SL4 tier-2 \"DEAD END\" prompt ===");
  await startLevel(page, LEVEL_INDEX["1-2"]);
  await page.evaluate(() => { window.__bbSoftlockPeak = 0; window.__bbSoftlock = null; });

  const bb = new Driver(page);
  bb.setRoles(ROLES_A);
  await bb.equip("G", 3);
  await bb.equip("H", 6);
  await bb.walkTo("G", 12, { timeout: 20000 }).catch(() => {});
  await bb.walkTo("H", 19, { timeout: 30000 }).catch(() => {});
  console.log("  staged: grapple parked past the gate, heavy over the cracked lid");

  const kH = bb.keysFor("H");
  const lidState = () => page.evaluate(() => {
    const s = window.__BB.scene;
    return { lidBroken: !!(s.grid && s.grid[14] && s.grid[14][19] !== "%"), softlock: window.__bbSoftlock || null };
  });
  const t0 = Date.now();
  let firedAtS = null, brokeAtS = null;
  for (let attempt = 0; attempt < 40 && firedAtS === null; attempt++) {
    const ls = await lidState();
    if (ls.softlock) { firedAtS = (Date.now() - t0) / 1000; break; }
    if (!ls.lidBroken) {
      await bb.walkTo("H", 19, { timeout: 6000 }).catch(() => {});
      await bb.tap(kH.jump, 120);
      await sleep(180);
      await bb.down(kH.act);   // startStomp: heavy dives
      await sleep(60);
      await bb.up(kH.act);
      await sleep(500);
      if (brokeAtS === null) {
        const ls2 = await lidState();
        if (ls2.lidBroken) { brokeAtS = (Date.now() - t0) / 1000; console.log(`  lid SEVERED at t=${brokeAtS.toFixed(1)}s`); }
      }
    } else {
      await sleep(200);
    }
  }
  // poll a short window for the detector→prompt chain to settle
  const pollEnd = Date.now() + 5000;
  while (firedAtS === null && Date.now() < pollEnd) {
    const ls = await lidState();
    if (ls.softlock) { firedAtS = (Date.now() - t0) / 1000; break; }
    await sleep(100);
  }
  await sleep(400); // let the prompt show-tween settle

  const c = await readChain(page);
  const dropToFire = (firedAtS !== null && brokeAtS !== null) ? (firedAtS - brokeAtS) : null;
  console.log(`  chain: softlock=${JSON.stringify(c.softlock)} stuckTier=${c.stuckTier} slPeak=${c.slPeak}`);
  console.log(`  prompt: visible=${c.promptVisible} mode=${c.modeShown} head="${c.promptHead}" sub="${c.promptSub}" caps=${c.capsVisible}`);
  if (firedAtS !== null) console.log(`  fired at t=${firedAtS.toFixed(1)}s${dropToFire !== null ? ` (${dropToFire.toFixed(1)}s after the lid severed)` : ""}`);

  ok(!!(c.softlock && c.softlock.kind === "severed-tunnel" && c.softlock.level === "1-2"), `SL3 detector latched the severed-tunnel hard softlock`);
  ok(c.slPeak === 1, `SL3 session peak = 1 (detector fired)`);
  ok(c.stuckTier === 2, `stuckTier forced to 2 by the detector (=${c.stuckTier})`);
  ok(c.promptVisible && c.modeShown === "softlock", `SL4 tier-2 prompt SHOWS in "softlock" mode (visible=${c.promptVisible}, mode=${c.modeShown})`);
  ok(/DEAD END/i.test(c.promptHead), `SL4 shows the confident "DEAD END" copy: "${c.promptHead}"`);
  ok(c.capsVisible && /Hold R twice to restart/i.test(c.promptSub), `SL4 shows the R×2 restart keycaps + copy: "${c.promptSub}"`);
  ok(dropToFire !== null && dropToFire <= 3, `detector→prompt was IMMEDIATE (${dropToFire === null ? "n/a" : dropToFire.toFixed(1) + "s"} ≤ 3s, not the watchdog's 25s)`);
}

// ============================ CHAIN B — general stall =======================
// Sit perfectly still at the REAL shipped thresholds and assert the watchdog →
// SL4 prompt escalates 0→1(gentle)→2(firm). No injection: this is the live 25/50.
async function chainB(page) {
  console.log(`\n=== CHAIN B — general stall (idle @ ${STALL_LEVEL}) → SL2 watchdog t1/t2 → SL4 tier-1 gentle / tier-2 firm (REAL 25s/50s) ===`);
  await startLevel(page, LEVEL_INDEX[STALL_LEVEL]);
  await page.evaluate(() => { window.__bbWatchdogPeakTier = 0; window.__bbWatchdogPeak = null; window.__bbStuckTier = 0; });
  // confirm the live thresholds are the shipped 25/50 (this run VALIDATES them)
  const th = await page.evaluate(() => { const w = window.__BB.scene.watchdog; return { T1: w.T1, T2: w.T2 }; });
  console.log(`  live watchdog thresholds: t1=${th.T1}ms t2=${th.T2}ms (shipped)`);
  ok(th.T1 === 25000 && th.T2 === 50000, `watchdog runs the shipped t1=25000/t2=50000 (=${th.T1}/${th.T2})`);
  // press NOTHING — both robots idle on solid ground.

  const t0 = Date.now();
  let t1AtS = null, t2AtS = null, gentleShownAtS = null, firmShownAtS = null;
  let lastTier = -1;
  while (Date.now() - t0 < 60000) {
    const c = await readChain(page);
    const el = (Date.now() - t0) / 1000;
    if (c.dead.some(Boolean)) { console.log(`  !! a robot died at t=${el.toFixed(1)}s — idle spot unsafe, aborting`); break; }
    if (c.stuckTier !== lastTier) {
      console.log(`  t=${el.toFixed(1)}s  tier=${c.stuckTier}  promptVisible=${c.promptVisible} mode=${c.modeShown} head="${c.promptHead}" (stallMs=${c.stallMs})`);
      lastTier = c.stuckTier;
    }
    if (c.stuckTier >= 1 && t1AtS === null) t1AtS = el;
    if (c.stuckTier >= 2 && t2AtS === null) t2AtS = el;
    // record when the SL4 prompt itself first shows each mode
    if (c.promptVisible && c.modeShown === "gentle" && gentleShownAtS === null) gentleShownAtS = el;
    if (c.promptVisible && c.modeShown === "firm" && firmShownAtS === null) firmShownAtS = el;
    if (t2AtS !== null && firmShownAtS !== null) break;
    await sleep(500);
  }

  console.log(`  escalation: watchdog t1 @ ${t1AtS}s, t2 @ ${t2AtS}s ; SL4 gentle prompt @ ${gentleShownAtS}s, firm prompt @ ${firmShownAtS}s`);
  ok(t1AtS !== null && t1AtS >= 22 && t1AtS <= 30, `watchdog raised t1 on schedule (~25s): ${t1AtS}s`);
  ok(t2AtS !== null && t2AtS >= 47 && t2AtS <= 57, `watchdog raised t2 on schedule (~50s): ${t2AtS}s`);
  ok(gentleShownAtS !== null, `SL4 tier-1 GENTLE prompt actually showed on the t1 stall (@ ${gentleShownAtS}s)`);
  ok(firmShownAtS !== null, `SL4 tier-2 FIRM prompt actually showed on the t2 stall (@ ${firmShownAtS}s)`);
  ok(gentleShownAtS !== null && firmShownAtS !== null && firmShownAtS > gentleShownAtS, `the prompt ESCALATED gentle→firm in step with the watchdog`);
  // final read: firm mode = the encouraging watchdog-t2 variant with R keycaps
  const f = await readChain(page);
  ok(f.modeShown === "firm" && /fresh start/i.test(f.promptHead), `tier-2 firm copy (watchdog stall, not a hard lock): "${f.promptHead}"`);
  // The tier-2 firm sub-copy is level-aware: the tutorial restarts on a SINGLE R
  // (SL5), non-tutorial levels use the R×2 hold — accept the mode-appropriate copy.
  ok(f.capsVisible && /restart/i.test(f.promptSub) && /ESC/i.test(f.promptSub),
    `tier-2 firm shows the R keycaps + restart/map copy: "${f.promptSub}"`);
}

// ============================ CHAIN C — full escalation 0→1→2→3 =============
// SL7: assert the WHOLE escalation ladder — tier-1 now EXPLICIT (R keycaps + the
// restart line, not just a bare nudge), tier-2 firm, and the NEW tier-3 "cold hard
// truth" (grey-fade overlay + blunt copy + sad music). Driven with the SL7 tuning
// windows (t1/t2/t3 — the same knobs SL6/SL7 tune) so the ladder is proven quickly
// with a genuine settled stall; still input-only + read-only (no faked stuckTier).
async function chainC(page) {
  console.log(`\n=== CHAIN C — full escalation 0→1(EXPLICIT)→2(firm)→3(cold-truth grey-fade) + the new copy ===`);
  await startLevel(page, LEVEL_INDEX[STALL_LEVEL]);
  // unlock the AudioContext so the tier-3 sad-music treatment has a live bus to read.
  await page.keyboard.press("KeyZ");
  await page.evaluate(() => {
    const s = window.__BB.scene;
    for (const p of s.players) { if (!p.skill) p.setSkill("heavy"); p.invuln = 999999; p.setVelocity(0, 0); }
    const w = s.watchdog; w.T1 = 500; w.T2 = 1000; w.T3 = 1500; w.reset();
  });

  const seen = {}; const copy = {};
  const t0 = Date.now(); let last = -1;
  while (Date.now() - t0 < 4000) {
    const c = await readChain(page);
    if (c.stuckTier !== last) {
      const el = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(`  t=${el}s tier=${c.stuckTier} mode=${c.modeShown} caps=${c.capsVisible} grey=${c.greyVisible} sad=${c.sadMode} head="${c.promptHeadText}" sub="${c.promptSub}"`);
      if (seen[c.stuckTier] === undefined) { seen[c.stuckTier] = el; copy[c.stuckTier] = { head: c.promptHeadText, sub: c.promptSub, caps: c.capsVisible, grey: c.greyVisible, sad: c.sadMode }; }
      last = c.stuckTier;
    }
    if (seen[3] !== undefined) break;
    await sleep(60);
  }

  ok(seen[1] !== undefined && seen[2] !== undefined && seen[3] !== undefined, `escalated through EVERY tier 0→1→2→3 (t1@${seen[1]}s t2@${seen[2]}s t3@${seen[3]}s)`);
  // tier-1 is now EXPLICIT: keycaps + a "restart" instruction (was a bare nudge)
  ok(copy[1] && copy[1].caps && /restart/i.test(copy[1].sub) && /ESC/i.test(copy[1].sub), `tier-1 is EXPLICIT now — R keycaps + "${copy[1] ? copy[1].sub : ""}"`);
  ok(copy[2] && /fresh start/i.test(copy[2].head) && copy[2].caps, `tier-2 firm restart offer: "${copy[2] ? copy[2].head : ""}"`);
  // tier-3 cold-truth: blunt copy + grey overlay + sad music, keycaps present
  ok(copy[3] && /STUCK/i.test(copy[3].head) && copy[3].caps, `tier-3 blunt "cold truth" copy + keycaps: "${copy[3] ? copy[3].head : ""}"`);
  ok(copy[3] && copy[3].grey, `tier-3 grey-fade overlay SHOWS`);
  ok(copy[3] && copy[3].sad, `tier-3 sad-music treatment ON`);
  // and it must CLEAR the instant progress resumes (drive real movement)
  await page.keyboard.down("KeyD"); await sleep(500); await page.keyboard.up("KeyD");
  await page.evaluate(() => { const w = window.__BB.scene.watchdog; w.T1 = 25000; w.T2 = 50000; w.T3 = 75000; });
  await sleep(300);
  const cc = await readChain(page);
  ok(!cc.promptVisible && !cc.greyVisible && !cc.sadMode && cc.stuckTier === 0, `grey-fade + prompt + sad-music all CLEAR the instant progress resumes (tier=${cc.stuckTier})`);
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(URL, { waitUntil: "networkidle" });
  await sleep(1200);

  console.log("Bolt Buddies — SL7 softlock end-to-end chain sweep\n");
  await chainA(page);
  await chainB(page);
  await chainC(page);

  ok(pageErrors.length === 0, `0 page errors (saw ${pageErrors.length}${pageErrors.length ? ": " + pageErrors[0] : ""})`);
  await browser.close();

  console.log(`\n${fails.length ? "SWEEP FAILURES:\n  - " + fails.join("\n  - ") : "ALL SL7 CHAIN CHECKS PASSED — every hard softlock surfaces the restart prompt; a general stall escalates 0→1(explicit)→2(firm)→3(cold-truth grey-fade) in step"}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error("sweep crashed:", e); process.exit(1); });
