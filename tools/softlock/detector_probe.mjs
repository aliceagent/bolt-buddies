// Bolt Buddies — Explicit Softlock Detector DOES-FIRE probe (SL3).
//
// Proves the SL3 explicit detector fires — immediately — in the ONE real hard
// softlock: the 1-2 core0 (FL-T3-B) severed-tunnel trap. It DRIVES the repro with
// real keyboard input (equip both, walk Heavy over the cracked lid, stomp it to
// sever the tunnel floor and drop into the pocket) and polls window.__bbSoftlock,
// recording the wall-clock at which the explicit signal is raised. A correct
// detector raises within ~1s of the Heavy settling in the pocket — NOT the
// watchdog's 25s+.
//
// Input-only + read-only, exactly like the beat/softlock/watchdog drivers: the
// only evaluate() calls are scene orchestration (start a level, zero the peak) and
// pure reads. It NEVER mutates scene state.
//
// Usage:
//   BB_URL="http://localhost:5173/?canvas=1" node tools/softlock/detector_probe.mjs

import { chromium } from "playwright";
import { Driver } from "../beat/driver.mjs";
import { LEVEL_INDEX, ROLES_A, startLevel, sleep } from "./probe.mjs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";

async function readSoftlock(page) {
  return page.evaluate(() => {
    const s = window.__BB.scene;
    return {
      softlock: window.__bbSoftlock || null,
      peak: (typeof window.__bbSoftlockPeak === "number") ? window.__bbSoftlockPeak : -1,
      stuckTier: s ? (s.stuckTier | 0) : -1,
      sceneSoftlock: s ? (s.softlock || null) : null,
      // is the lid actually broken? (grid cell over the pocket no longer "%")
      lidBroken: !!(s && s.grid && s.grid[14] && s.grid[14][19] !== "%"),
      heavy: s ? (() => {
        const h = s.players.find((p) => p.skill === "heavy");
        return h ? { tx: +(h.x / 48).toFixed(2), ty: +(h.y / 48).toFixed(2),
                     feetTy: +(h.body.bottom / 48).toFixed(2), grounded: h.grounded, dead: h.dead } : null;
      })() : null,
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

  console.log(`[detector does-fire] 1-2 core0 severed-tunnel trap — driving the real repro\n`);
  await startLevel(page, LEVEL_INDEX["1-2"]);
  await page.evaluate(() => { window.__bbSoftlockPeak = 0; window.__bbSoftlock = null; });

  const bb = new Driver(page);
  bb.setRoles(ROLES_A);

  // 1) equip both (opens the both-skills gate at x10)
  await bb.equip("G", 3);
  await bb.equip("H", 6);
  console.log("  equipped grapple@x3 + heavy@x6 (gate opens)");

  // 2) park Grapple out of the way past the gate; walk Heavy over the cracked lid
  await bb.walkTo("G", 12, { timeout: 20000 }).catch(() => {});
  await bb.walkTo("H", 19, { timeout: 30000 });
  let s = await readSoftlock(page);
  console.log(`  heavy staged over the lid: tx=${s.heavy?.tx} feetTy=${s.heavy?.feetTy} (lidBroken=${s.lidBroken})`);

  // 3) STOMP the lid: jump, then dive (act while airborne). Repeat until the lid
  //    severs and the Heavy drops into the pocket (the detector then confirms).
  const kH = bb.keysFor("H");
  const t0 = Date.now();
  let firedAtS = null, brokeAtS = null;
  for (let attempt = 0; attempt < 40 && firedAtS === null; attempt++) {
    s = await readSoftlock(page);
    if (s.softlock && firedAtS === null) { firedAtS = ((Date.now() - t0) / 1000); break; }
    if (!s.lidBroken) {
      // nudge back over the lid columns, then jump + stomp-dive
      await bb.walkTo("H", 19, { timeout: 6000 }).catch(() => {});
      await bb.tap(kH.jump, 120);
      await sleep(180);           // let it rise
      await bb.down(kH.act);      // startStomp: heavy dives
      await sleep(60);
      await bb.up(kH.act);
      await sleep(500);           // land + settle
      if (brokeAtS === null) {
        const s2 = await readSoftlock(page);
        if (s2.lidBroken) { brokeAtS = ((Date.now() - t0) / 1000); console.log(`  lid SEVERED at t=${brokeAtS.toFixed(1)}s (heavy feetTy=${s2.heavy?.feetTy})`); }
      }
    } else {
      // lid already broken — just wait for the detector's confirm dwell
      await sleep(200);
    }
  }

  // 4) poll for the explicit signal for a short window after the drop
  const pollEnd = Date.now() + 4000;
  while (firedAtS === null && Date.now() < pollEnd) {
    s = await readSoftlock(page);
    if (s.softlock) { firedAtS = ((Date.now() - t0) / 1000); break; }
    await sleep(100);
  }

  s = await readSoftlock(page);
  const dropToFire = (firedAtS !== null && brokeAtS !== null) ? (firedAtS - brokeAtS) : null;
  console.log(`\n  final: softlock=${JSON.stringify(s.softlock)}  stuckTier=${s.stuckTier}  peak=${s.peak}`);
  console.log(`  heavy at trap: tx=${s.heavy?.tx} feetTy=${s.heavy?.feetTy} grounded=${s.heavy?.grounded} dead=${s.heavy?.dead} lidBroken=${s.lidBroken}`);
  if (firedAtS !== null) console.log(`  FIRED at t=${firedAtS.toFixed(1)}s (${dropToFire !== null ? dropToFire.toFixed(1) + "s after the lid severed" : "timing n/a"})`);

  const ok = !!(s.softlock && s.softlock.kind === "severed-tunnel" && s.softlock.level === "1-2" &&
    s.stuckTier === 2 && s.peak === 1 && s.lidBroken && s.heavy && !s.heavy.dead &&
    dropToFire !== null && dropToFire <= 3);
  console.log(ok
    ? "\n  RESULT: PASS — explicit detector raised the firm softlock signal immediately in the real trap"
    : "\n  RESULT: FAIL — detector did not raise the expected immediate signal");
  if (pageErrors.length) console.log(`  page errors: ${pageErrors.length} (first: ${pageErrors[0]})`);

  await browser.close();
  process.exit(ok && !pageErrors.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
