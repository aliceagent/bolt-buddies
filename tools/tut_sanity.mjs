// Bolt Buddies — tutorial sanity pass (Sprint 10).
//
// INPUT-ONLY: launches the tutorial from the TITLE menu's TUTORIAL button with
// real keys, drives BOTH robots through all 7 stations (reusing the Beat-Kit
// Driver's closed-loop primitives), confirms the level completes, and that the
// clear overlay's continue returns to the TITLE menu (not the Hub). Also drops
// three ui10-* screenshots into tools/shots/. Non-zero exit on any failure.
//
//   node tools/tut_sanity.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { Driver } from "./beat/driver.mjs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = process.env.BB_SHOTS || "tools/shots";
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
await page.goto(URL, { waitUntil: "networkidle" });
await sleep(1200);

const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);
const sceneState = () => page.evaluate(() => {
  const s = window.__BB.scene;
  return s ? { id: s.def.id, tutorial: !!s.def.tutorial, complete: s.complete,
    triggers: s.triggers.length, glyphs: s.children ? undefined : undefined } : null;
});

const bb = new Driver(page);
bb.setRoles({ G: 0, H: 1 }); // P1 = grapple, P2 = heavy

// --- reach the tutorial from the TITLE menu (real keys) ----------------------
// fresh menu: clear the save so the menu is [NEW GAME, TUTORIAL] (no CONTINUE),
// reload, then arrow down to TUTORIAL and press SPACE.
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await sleep(1000);
check("title scene active", await active("Title"));
await bb.tap("ArrowDown"); // NEW GAME -> TUTORIAL
await sleep(200);
const menuSel = await page.evaluate(() => window.__BB.menu.items[window.__BB.menu.sel].id);
check("TUTORIAL selected on menu", menuSel === "tutorial", `sel=${menuSel}`);
await bb.tap("Space"); // activate
await sleep(1200);
check("tutorial Game scene active", await active("Game"));
const s0 = await sceneState();
check("tutorial def loaded (tutorial flag + trigger zones)", !!s0 && s0.tutorial && s0.id === "tut", JSON.stringify(s0));
await sleep(600);
await shot("ui10-station1"); // spawn + key-glyph prompts

// --- driving helpers ---------------------------------------------------------
const advance = async (tile, opts = {}) => {
  await bb.walkTo("G", tile, { timeout: 14000, ...opts });
  await bb.walkTo("H", tile, { timeout: 14000, ...opts });
};

try {
  // === Station 1: move & jump — hop the step and the gap =====================
  await bb.runJump("G", 8, "right", { landTile: 12, runup: 2, jumpHold: 300, retries: 4 }).catch(() => {});
  await bb.walkTo("G", 14, { timeout: 14000 });
  await bb.runJump("H", 8, "right", { landTile: 12, runup: 2, jumpHold: 320, retries: 4 }).catch(() => {});
  await bb.walkTo("H", 14, { timeout: 14000 });
  check("station 1 crossed (both past the gap)", true);

  // === Station 2: hazards & respawn — hop the sparky pit =====================
  await bb.runJump("G", 15, "right", { landTile: 18, jumpHold: 220, runup: 2, retries: 4 });
  await bb.runJump("H", 15, "right", { landTile: 18, jumpHold: 240, runup: 2, retries: 4 });
  await advance(20);
  check("station 2 crossed (past the sparky floor)", true);

  // === Station 3: action & pedestals — equip both, gate opens ================
  const gskill = await bb.equip("G", 23);
  const hskill = await bb.equip("H", 26);
  check("P1 equipped grapple", gskill === "grapple", gskill);
  check("P2 equipped heavy", hskill === "heavy", hskill);
  const gateOpen = await bb.waitFor((s) => s.doors.find((d) => d.id === "gate")?.open, 5000, "gate open")
    .then(() => true).catch(() => false);
  check("skills gate opened", gateOpen);
  await advance(29);

  // === Station 4: use your gadget — heavy stomps lever, bridge drops =========
  await bb.walkTo("H", 31, { timeout: 9000 });
  const cracksBefore = await page.evaluate(() => window.__BB.scene.crackies.countActive(true));
  await bb.tap("ArrowUp", 120); // heavy hop
  await sleep(120);
  await bb.tap("KeyL", 80); // stomp mid-air
  await sleep(900);
  const cracksAfter = await page.evaluate(() => window.__BB.scene.crackies.countActive(true));
  check("heavy stomped the cracked lid", cracksAfter < cracksBefore, `${cracksBefore} -> ${cracksAfter}`);
  // pull the lever inside the pocket, then wait for the bridge to materialise
  await bb.walkTo("H", 31, { timeout: 6000 }).catch(() => {});
  await bb.act("H");
  const bridgeDown = await bb.waitFor((s) => s.bridges.find((b) => b.id === "tbr")?.open, 5000, "bridge down")
    .then(() => true).catch(() => false);
  check("pocket lever dropped the bridge", bridgeDown);
  await shot("ui10-station4"); // the split mini-course
  // grapple zips the gap (fall back to the bridge if the zip is fussy); heavy
  // climbs out and walks the bridge
  await bb.walkTo("H", 33, { timeout: 8000 }).catch(() => {});
  try {
    await bb.walkTo("G", 33, { timeout: 8000 });
    await bb.zipTo("G", { timeout: 3500 });
    await bb.zipRelease("G", "right");
    await sleep(400);
  } catch { /* fall through to walking the bridge */ }
  await advance(40);
  check("station 4 crossed (both on the far side)", true);

  // === Station 5: carry & throw (joy-core ledge) ============================
  await advance(43);
  try { // light carry/throw demo — not required for progression
    await bb.walkTo("G", 43, { timeout: 5000 });
    await bb.walkTo("H", 42, { timeout: 5000 });
    await bb.act("H"); // heavy picks up the buddy
    await sleep(200);
    await bb.act("H"); // ...and throws
    await sleep(500);
  } catch { /* optional */ }
  await advance(47);
  check("station 5 traversed", true);

  // === Station 6: plates & teamwork — you first, then me ====================
  await bb.walkTo("H", 48, { timeout: 8000 }); // heavy holds the weight-2 plate
  const plateOn = await bb.waitFor((s) => s.plates.find((p) => p.id === "tpl")?.active, 5000, "plate active")
    .then(() => true).catch(() => false);
  check("heavy activates the weight-2 plate", plateOn);
  const doorOpen = await bb.waitFor((s) => s.doors.find((d) => d.id === "td1")?.open, 4000, "td1 open")
    .then(() => true).catch(() => false);
  check("plate holds the teamwork door open", doorOpen);
  await bb.walkTo("G", 51, { timeout: 9000 }); // buddy slips through to the far lever
  await bb.act("G"); // frees the plate-holder (latches td1)
  const leverOn = await bb.waitFor((s) => s.levers.find((l) => l.id === "tlv2")?.on, 4000, "tlv2 on")
    .then(() => true).catch(() => false);
  check("buddy pulled the release lever", leverOn);
  await bb.walkTo("H", 52, { timeout: 9000 }); // heavy leaves the plate; door stays latched
  const stillOpen = await page.evaluate(() => window.__BB.scene.doors.find((d) => d.id === "td1").open);
  check("door latched open after heavy left the plate", stillOpen === true);
  await advance(52); // both wait just short of the exit zone (x53-55)

  // === Station 7: exit — no one left behind =================================
  await bb.walkTo("H", 51, { timeout: 6000 }); // hold the heavy back, outside the zone
  await bb.walkTo("G", 54, { timeout: 9000 }); // one robot enters the exit alone
  await sleep(500);
  const waited = !(await page.evaluate(() => window.__BB.scene.complete));
  check("exit waits for the buddy (one robot alone)", waited);
  await bb.walkTo("H", 54, { timeout: 9000 });
  const done = await bb.waitFor((s) => s.complete, 6000, "level complete")
    .then(() => true).catch(() => false);
  check("both exited — ORIENTATION COMPLETE", done);
} catch (e) {
  check("tutorial run completed without error", false, e?.message || String(e));
  await bb.releaseAll().catch(() => {});
  await shot("ui10-error");
}

await bb.releaseAll().catch(() => {});

// --- completion overlay + return to Title ------------------------------------
await sleep(900);
await shot("ui10-complete"); // the ORIENTATION COMPLETE! overlay
// no save must have been written
const save = await page.evaluate(() => localStorage.getItem("bolt-buddies-save-v1"));
check("tutorial did NOT write a save (unlocked untouched)", save === null, `save=${save}`);
// continue returns to the TITLE menu, not the Hub
await bb.tap("Space");
await sleep(1200);
check("continue returned to TITLE (not Hub)", (await active("Title")) && !(await active("Hub")));

const wdPeak = await page.evaluate(() => (typeof window.__bbWatchdogPeakTier === "number" ? window.__bbWatchdogPeakTier : 0)).catch(() => 0);
await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
console.log(`SL2 watchdog peak tier during tut_sanity: ${wdPeak} (0 = never raised)`);
if (pageErrors.length) console.log(`page errors: ${pageErrors.length} (first: ${pageErrors[0]})`);
process.exit(fails.length || pageErrors.length ? 1 : 0);
