// U8 (F15) clear-screen stats & records acceptance probe.
//
// Completes 1-1 TWICE in one fresh browser profile:
//   run 1 — establishes the level record (3 deaths, some time), no starburst
//           (a first-ever record stores silently).
//   run 2 — beats it (0 deaths) -> "NEW RECORD!" starburst on the stats row.
// Then loads the Hub (best-time clock chip) and the tutorial (writes NOTHING).
//
// Shots -> tools/shots/p2/: u8-stats, u8-record, u8-hub-chip.
// Asserts: ux-v1 carries the level record fields; save-v1 is untouched by
// records (only completeLevel's unlock/cores change); audio-v1 untouched; the
// tutorial persists nothing.
//
// Completion is driven through the REAL exit->finishLevel path: we force the
// exit open and drop both robots into the exit zone. Per the probe rule we do
// NOT page.evaluate within ~1s of repositioning both players — we waitForTimeout
// first, then read.
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
const getLS = (k) => page.evaluate((key) => localStorage.getItem(key), k);
const KUX = "bolt-buddies-ux-v1", KSAVE = "bolt-buddies-save-v1", KAUD = "bolt-buddies-audio-v1";

// --- fresh-storage snapshot --------------------------------------------------
const save0 = await getLS(KSAVE), ux0 = await getLS(KUX), aud0 = await getLS(KAUD);
console.log("FRESH  save:", save0, " ux:", ux0, " audio:", aud0);
ok(!ux0 || !JSON.parse(ux0).records, "ux-v1 starts with no records");

const load = async (idx) => {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Title"); m.stop("Hub"); m.stop("Game");
    m.start("Game", { levelIndex: i });
  }, idx);
  await page.waitForTimeout(1800); // let the intro banner slide + the run clock accrue
};

const finishViaExit = async (deaths) => {
  await page.evaluate((d) => {
    const s = window.__BB.scene;
    s._deaths = d; // display-only counter; set deterministically for the record
    const ex = s.exitDoor;
    ex.open = true;
    const cx = ex.zone.centerX, cy = ex.zone.centerY;
    for (const p of s.players) { p.body.reset(cx, cy); p.setVelocity(0, 0); }
  }, deaths);
  // >1s gap before the next evaluate; finishLevel fires on the next update frames
  await page.waitForTimeout(1400);
  await page.waitForFunction(() => window.__BB.scene.complete, null, { timeout: 6000 });
  await page.waitForTimeout(1300); // overlay iris-in + stats/burst tweens settle
};

const uiState = () => page.evaluate(() => {
  const ui = window.__BB.game.scene.getScene("UI");
  return {
    stats: ui.statsText.text,
    grade: ui.gradeText.text,
    burst: !!(ui.recordBurst.visible && ui.recordBurst.scale > 0.5),
  };
});

// --- prove the death counter increments via the REAL path (one kill) ---------
await load(0); // 1-1
const dBefore = await page.evaluate(() => window.__BB.scene._deaths);
await page.evaluate(() => window.__BB.scene.killPlayer(window.__BB.scene.players[0]));
await page.waitForTimeout(150);
const dAfter = await page.evaluate(() => window.__BB.scene._deaths);
ok(dBefore === 0 && dAfter === 1, `killPlayer bumps the death counter (${dBefore} -> ${dAfter})`);

// ============================ RUN 1 — establish ============================
await load(0); // fresh scene (the sanity kill left a robot mid-respawn)
await finishViaExit(3);
let ui = await uiState();
console.log("RUN1 UI:", JSON.stringify(ui));
ok(/TIME \d+:\d\d\.\d\s+·\s+DEATHS 3\s+·\s+CORES \d\/3/.test(ui.stats), "run1 stats row: TIME · DEATHS 3 · CORES x/3");
ok(ui.grade.length > 0 && ui.grade.length <= 60, `run1 grade line present & <=60 ("${ui.grade}")`);
ok(ui.burst === false, "run1 shows NO starburst (first record stores silently)");
await shot("u8-stats");

let ux1 = JSON.parse(await getLS(KUX));
ok(ux1.records && ux1.records["1-1"] && typeof ux1.records["1-1"].bestTime === "number", "ux-v1 records['1-1'].bestTime is a number");
ok(ux1.records["1-1"].bestDeaths === 3, `ux-v1 records['1-1'].bestDeaths === 3 (got ${ux1.records["1-1"].bestDeaths})`);
const t1 = ux1.records["1-1"].bestTime;

// ============================ RUN 2 — beat ================================
await load(0);
await finishViaExit(0);
ui = await uiState();
console.log("RUN2 UI:", JSON.stringify(ui));
ok(/DEATHS 0/.test(ui.stats), "run2 stats row shows DEATHS 0");
ok(ui.grade === "SUSPICIOUSLY competent.", `run2 grade is the deaths-0 line ("${ui.grade}")`);
ok(ui.burst === true, "run2 shows the NEW RECORD! starburst");
await shot("u8-record");

let ux2 = JSON.parse(await getLS(KUX));
ok(ux2.records["1-1"].bestDeaths === 0, `ux-v1 bestDeaths beaten 3 -> 0 (got ${ux2.records["1-1"].bestDeaths})`);
ok(ux2.records["1-1"].bestTime <= t1, `ux-v1 bestTime is the min (${ux2.records["1-1"].bestTime} <= ${t1})`);

// ---- storage isolation: save-v1 changed ONLY by completeLevel ---------------
const saveA = JSON.parse(await getLS(KSAVE));
console.log("save-v1 after runs:", JSON.stringify(saveA));
ok(!("records" in saveA) && saveA.bestTime === undefined && saveA.bestDeaths === undefined, "save-v1 has NO record fields (records live only in ux-v1)");
ok(Object.keys(saveA).sort().join() === "cores,unlocked", "save-v1 keys are exactly {unlocked, cores}");
ok(saveA.unlocked === 2, `save-v1 unlocked bumped by completeLevel (=2, got ${saveA.unlocked})`);
const audA = await getLS(KAUD);
ok(audA === aud0, "audio-v1 untouched by U8");

// ================================ HUB CHIP ================================
await page.evaluate(() => {
  const m = window.__BB.game.scene;
  m.stop("UI"); m.stop("Game"); m.stop("Title");
  m.start("Hub", { sel: 0 });
});
await page.waitForTimeout(1200);
await shot("u8-hub-chip");
console.log("hub loaded with a stored 1-1 record -> clock chip drawn");

// =============================== TUTORIAL ================================
// completes but persists NOTHING (no record write, no save write).
await load(12); // tutorial (registry index 12, id "tut")
await finishViaExit(1);
const uxT = JSON.parse(await getLS(KUX));
ok(!uxT.records["tut"], "tutorial wrote NO record to ux-v1");
ok(Object.keys(uxT.records).sort().join() === "1-1", "ux-v1 records still only holds real levels (no 'tut')");
const saveT = await getLS(KSAVE);
ok(saveT === JSON.stringify(saveA), "tutorial left save-v1 unchanged");

await browser.close();
console.log(errors ? `\nu8 snapped with ${errors} page error(s)` : "\nu8 snapped clean (0 page errors)");
if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log(`\nALL ${"assertions"} PASSED`);
