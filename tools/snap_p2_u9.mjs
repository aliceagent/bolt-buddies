// U9 (F16/F17) KOBI reactive-dialogue acceptance probe.
//
// Verifies the DIALOGUE-ONLY re-scope of U9 (no motion): KOBI's death-streak line
// and his all-cores respect line, plus the rate limiting.
//
//   (a) 1-1, kill one robot 3x on the FIRST checkpoint segment -> a streak line
//       appears in the KOBI blip bar (screenshot u9-streak.png).
//   (b) 3 MORE deaths on the SAME segment -> the line does NOT fire again
//       (once-per-segment rate limit).
//   (c) crossing a NEW checkpoint resets the segment counter; 3 deaths there ->
//       the streak fires again, with a DIFFERENT line (session no-repeat).
//   (d) collect all 3 cores and finish 1-1 -> the greedy-respect line is layered
//       into the clear flow (screenshot u9-allcores.png).
//
// All reactive lines are DISPLAY-ONLY (queued blips) — they never touch game
// state or timing. Probe rule honored: no page.evaluate within ~1s of a
// both-players reposition. 0 page errors required.
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
let errors = 0;
const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`); if (!cond) fails.push(msg); };
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
page.on("console", (m) => { const t = m.text(); if (/error/i.test(t)) console.log("CONSOLE:", t); });

await page.goto("http://localhost:5173/?canvas=1", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

const shot = (tag) => page.screenshot({ path: `tools/shots/p2/${tag}.png` });
const strip = (s) => (s || "").replace(/^\s*KOBI:\s*/i, "");

const load = async (idx) => {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Title"); m.stop("Hub"); m.stop("Game");
    m.start("Game", { levelIndex: i });
  }, idx);
  await page.waitForTimeout(1800); // let the intro banner slide before we drive
};

// Kill ONE robot once via the REAL killPlayer path (the streak trigger lives
// there). Clears the death/invuln guards first so the kill lands deterministically,
// then waits out the 900ms respawn so the next kill is on a live robot.
const killOnce = async (idx) => {
  await page.evaluate((i) => {
    const s = window.__BB.scene;
    const p = s.players[i];
    p.invuln = 0; p.dead = false; // clear guards so killPlayer proceeds
    s.killPlayer(p);
  }, idx);
  await page.waitForTimeout(1000); // 900ms respawn + margin
};
const killN = async (idx, n) => { for (let k = 0; k < n; k++) await killOnce(idx); };

// Wait until the streak line KOBI just fired is the ACTIVE blip on the bar.
const waitStreakActive = async () => {
  await page.waitForFunction(() => {
    const s = window.__BB.scene;
    const ui = window.__BB.game.scene.getScene("UI");
    if (!s._u9LastStreak) return false;
    const want = s._u9LastStreak.replace(/^\s*KOBI:\s*/i, "");
    return ui.blipActive && ui.blipActive.text === want;
  }, null, { timeout: 9000 });
};

// ============================ (a) segment-1 streak ============================
await load(0); // 1-1
await killN(0, 3);
let s1 = await page.evaluate(() => {
  const s = window.__BB.scene;
  return { count: s._u9StreakCount, last: s._u9LastStreak, seg: s._segDeaths, fired: s._segStreakFired };
});
console.log("SEG1 after 3 kills:", JSON.stringify(s1));
ok(s1.count === 1, `streak fired exactly once on segment 1 (count=${s1.count})`);
ok(typeof s1.last === "string" && s1.last.length > 0, `a streak line was chosen ("${s1.last}")`);
await waitStreakActive();
await page.waitForTimeout(500); // a few chars typed in for the shot
await shot("u9-streak");
const seg1Line = s1.last;

// ============================ (b) same-segment rate limit ====================
await killN(0, 3); // 3 MORE deaths, still on segment 1 (no checkpoint crossed)
let s2 = await page.evaluate(() => window.__BB.scene._u9StreakCount);
console.log("SEG1 after 3 MORE kills, streak count:", s2);
ok(s2 === 1, `no re-fire on the same segment after 3 more deaths (count still ${s2})`);

// ============================ (c) new segment resets =========================
// Cross the first mid-level checkpoint by dropping ONE robot onto it. This is a
// single-player reposition, so the "no evaluate within ~1s of a BOTH-player
// reposition" rule does not apply; we still wait for the activation frame.
await page.evaluate(() => {
  const s = window.__BB.scene;
  const cp = s.checkpoints[0];
  const p = s.players[0];
  p.invuln = 999999; p.dead = false; // parked & safe while it lands on the lamp
  p.body.reset(cp.x, cp.y - 8);
  p.setVelocity(0, 0);
});
await page.waitForFunction(() => window.__BB.scene.checkpoints[0].active, null, { timeout: 4000 });
let sc = await page.evaluate(() => {
  const s = window.__BB.scene;
  return { active: s.checkpoints[0].active, seg: s._segDeaths, fired: s._segStreakFired };
});
console.log("after crossing checkpoint:", JSON.stringify(sc));
ok(sc.active === true, "first mid-level checkpoint activated");
ok(sc.seg === 0 && sc.fired === false, "segment counter + streak guard reset on the new checkpoint");

await killN(0, 3); // 3 deaths on the NEW segment
let s3 = await page.evaluate(() => {
  const s = window.__BB.scene;
  return { count: s._u9StreakCount, last: s._u9LastStreak };
});
console.log("SEG2 after 3 kills:", JSON.stringify(s3));
ok(s3.count === 2, `streak fires again on the new segment (count=${s3.count})`);
ok(s3.last && s3.last !== seg1Line, `a DIFFERENT line fired (session no-repeat): "${s3.last}"`);
await waitStreakActive();
await page.waitForTimeout(500);
await shot("u9-streak-seg2");

// ============================ (d) all-cores respect line =====================
await load(0); // fresh 1-1
// Mark all 3 cores collected, force the exit, and drop BOTH robots into it. This
// is a both-player reposition -> no evaluate for >1s afterward.
await page.evaluate(() => {
  const s = window.__BB.scene;
  s.coresGot = [true, true, true];
  const ex = s.exitDoor;
  ex.open = true;
  const cx = ex.zone.centerX, cy = ex.zone.centerY;
  for (const p of s.players) { p.body.reset(cx, cy); p.setVelocity(0, 0); }
});
await page.waitForTimeout(1400); // >1s gap before the next evaluate (rule)
await page.waitForFunction(() => window.__BB.scene.complete, null, { timeout: 6000 });
const allCoresLine = await page.evaluate(() => window.__BB.scene._u9AllCores);
console.log("all-cores line:", allCoresLine);
ok(typeof allCoresLine === "string" && allCoresLine.length > 0, `all-cores respect line fired ("${allCoresLine}")`);
// wait for it to become the active blip (queues behind the clear blip), then shoot
await page.waitForFunction(() => {
  const s = window.__BB.scene;
  const ui = window.__BB.game.scene.getScene("UI");
  if (!s._u9AllCores) return false;
  const want = s._u9AllCores.replace(/^\s*KOBI:\s*/i, "");
  return ui.blipActive && ui.blipActive.text === want;
}, null, { timeout: 12000 });
await page.waitForTimeout(500);
await shot("u9-allcores");

// ============================ page-error gate ================================
ok(errors === 0, `0 page errors (saw ${errors})`);

console.log(`\n${fails.length ? "FAILURES:\n  " + fails.join("\n  ") : "ALL U9 CHECKS PASSED"}`);
await browser.close();
process.exit(fails.length ? 1 : 0);
