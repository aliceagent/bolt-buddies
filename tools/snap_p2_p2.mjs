// GFX P2 (Hub map 2.0) acceptance probe.
//
// Screenshots the redesigned hub in two save states and proves the sprint's
// hard invariants hold — the keyboard contract (node count / nav / enter) is
// untouched and the U8 best-time clock chip still renders in the new layout.
//
// Shots -> tools/shots/p2/:
//   p2-hub-fresh.png      fresh profile: only 1-1 unlocked, 0 cores, worlds 2-4
//                         locked showing the SIGNAL LOST / static treatment.
//   p2-hub-progressed.png seeded save: several unlocked + cores + a ux-v1 record
//                         so a clock chip shows (proves U8 survives the redesign).
//
// Asserts: Hub active, node count unchanged (12), an arrow moves the selection
// index, SPACE enters a level, the U8 clock chip is drawn on the seeded profile.
// 0 page errors.
//
//   node tools/snap_p2_p2.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = process.env.BB_SHOTS || "tools/shots/p2";
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}${extra ? " — " + extra : ""}`);
  if (!cond) fails.push(msg);
};

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
page.on("console", (m) => { if (/error/i.test(m.text())) console.log("CONSOLE:", m.text()); });

await page.goto(URL, { waitUntil: "networkidle" });
await sleep(1000);

const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);
const hub = (fn) => page.evaluate(fn);
const startHub = async (sel) => {
  await page.evaluate((s) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Game"); m.stop("Title"); m.stop("Onboard"); m.stop("Hub");
    m.start("Hub", s === null ? {} : { sel: s });
  }, sel === undefined ? null : sel);
  await sleep(1000);
};
const tap = async (code, ms = 90) => { await page.keyboard.down(code); await sleep(ms); await page.keyboard.up(code); };

// ============================ FRESH PROFILE ============================
await page.evaluate(() => localStorage.clear());
await startHub();
ok(await active("Hub"), "hub scene active (fresh)");
const nCount = await hub(() => window.__BB.game.scene.getScene("Hub").nodes.length);
const hubCount = await hub(() => window.__BB.game.scene.getScene("Hub").hubCount);
ok(nCount === 12 && hubCount === 12, "node count unchanged (12)", `nodes=${nCount} hubCount=${hubCount}`);
const unlockedFresh = await hub(() => window.__BB.game.scene.getScene("Hub").nodes.filter((n) => n.unlocked).length);
ok(unlockedFresh === 1, "fresh profile: exactly 1 node unlocked (1-1)", `unlocked=${unlockedFresh}`);
await shot("p2-hub-fresh");

// keyboard nav still moves the selection index
const selA = await hub(() => window.__BB.game.scene.getScene("Hub").sel);
await tap("ArrowRight");
await sleep(200);
const selB = await hub(() => window.__BB.game.scene.getScene("Hub").sel);
ok(selB !== selA, "ArrowRight moves the selection index", `sel ${selA} -> ${selB}`);
await tap("ArrowLeft"); // back to 1-1
await sleep(150);
const selC = await hub(() => window.__BB.game.scene.getScene("Hub").sel);
ok(selC === selA, "ArrowLeft returns selection", `sel=${selC}`);

// SPACE enters the selected (unlocked) level
ok(selC === 0, "selection rests on 1-1 (idx 0) for the enter test", `sel=${selC}`);
await tap("Space");
await sleep(600); // 250ms fade-out + scene handoff
ok(await active("Game"), "SPACE enters a level from the hub");

// ============================ PROGRESSED PROFILE ============================
await page.evaluate(() => {
  localStorage.setItem("bolt-buddies-save-v1", JSON.stringify({
    unlocked: 5,
    cores: { "1-1": [true, true, false], "1-2": [true, false, false], "1-3": [true, true, true] },
  }));
  localStorage.setItem("bolt-buddies-ux-v1", JSON.stringify({
    records: { "1-1": { bestTime: 83400, bestDeaths: 2 } },
  }));
});
await startHub(0);
ok(await active("Hub"), "hub scene active (progressed)");
const nCount2 = await hub(() => window.__BB.game.scene.getScene("Hub").nodes.length);
ok(nCount2 === 12, "node count still 12 (progressed)", `nodes=${nCount2}`);
const unlocked2 = await hub(() => window.__BB.game.scene.getScene("Hub").nodes.filter((n) => n.unlocked).length);
ok(unlocked2 === 5, "progressed profile: 5 nodes unlocked", `unlocked=${unlocked2}`);
// U8 clock chip must still render in the new layout (one seeded record on 1-1)
const chips = await hub(() => window.__BB.game.scene.getScene("Hub")._u8ChipCount);
ok(chips >= 1, "U8 best-time clock chip renders in the new layout", `chips=${chips}`);
await shot("p2-hub-progressed");

await browser.close();
console.log(errors ? `\np2 snapped with ${errors} page error(s)` : "\np2 snapped clean (0 page errors)");
if (errors) fails.push(`${errors} page error(s)`);
if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL ASSERTIONS PASSED");
