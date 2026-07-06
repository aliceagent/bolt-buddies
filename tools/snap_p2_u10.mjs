// Bolt Buddies — U10 (First-run onboarding, F6) acceptance probe.
//
// Fresh profile:
//  (a) NEW GAME -> the KOBI onboarding interstitial appears  -> u10-interstitial.png
//  (b) choose ORIENTATION -> the tutorial runs; complete it (cribs the
//      tut_sanity driving pattern) -> land on the HUB (not Title) -> u10-tut-to-hub.png
//      + assert ux-v1 carries the completion flag and the tutorial wrote NO save.
//  (c) relaunch WITH an existing save -> drive NEW GAME (erase-confirm) -> assert
//      NO interstitial (straight to the hub).
//  (d) the TUTORIAL "new!" pip shows BEFORE completion (u10-pip.png) and is gone
//      AFTER completion.
// 0 page errors required.
//
//   node tools/snap_p2_u10.mjs
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
const lsGet = (k) => page.evaluate((k) => localStorage.getItem(k), k);

const bb = new Driver(page);
bb.setRoles({ G: 0, H: 1 }); // P1 = grapple, P2 = heavy

// ============================================================================
// (a) + (d-before): fresh profile — pip shown, NEW GAME -> interstitial
// ============================================================================
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await sleep(1000);
check("title scene active (fresh)", await active("Title"));
const pipBefore = await page.evaluate(() => window.__BB.menu.tutorialPip());
check("(d) TUTORIAL 'new!' pip shown before completion", pipBefore === true);
await shot("u10-pip"); // before-state
const saveFresh = await lsGet("bolt-buddies-save-v1");
check("no save on a fresh profile", saveFresh === null, `save=${saveFresh}`);

// sel 0 == NEW GAME on a fresh profile (no CONTINUE row)
const sel0 = await page.evaluate(() => window.__BB.menu.items[window.__BB.menu.sel].id);
check("NEW GAME selected on fresh menu", sel0 === "new", `sel=${sel0}`);
await bb.tap("KeyE"); // activate NEW GAME
await sleep(900);
check("(a) onboarding interstitial appeared", await active("Onboard") && !(await active("Hub")));
const opts = await page.evaluate(() => window.__BB.onboard.options.map((o) => o.id));
check("interstitial offers ORIENTATION + SKIP", JSON.stringify(opts) === '["orientation","skip"]', JSON.stringify(opts));
const onbSel0 = await page.evaluate(() => window.__BB.onboard.options[window.__BB.onboard.sel].id);
check("cursor defaults to ORIENTATION (F6 nudge)", onbSel0 === "orientation", `sel=${onbSel0}`);
await sleep(300);
await shot("u10-interstitial");

// ============================================================================
// (b): choose ORIENTATION -> tutorial runs -> completes -> HUB (not Title)
// ============================================================================
await bb.tap("Space"); // confirm ORIENTATION (default cursor)
await sleep(1300);
check("(b) tutorial Game scene active", await active("Game"));
const s0 = await page.evaluate(() => {
  const s = window.__BB.scene;
  return s ? { id: s.def.id, tutorial: !!s.def.tutorial, returnToHub: !!s.returnToHub } : null;
});
check("tutorial def loaded with returnToHub", !!s0 && s0.tutorial && s0.returnToHub, JSON.stringify(s0));

// --- drive the 7 stations (cribbed from tools/tut_sanity.mjs) ----------------
const advance = async (tile, opts = {}) => {
  await bb.walkTo("G", tile, { timeout: 14000, ...opts });
  await bb.walkTo("H", tile, { timeout: 14000, ...opts });
};
try {
  // Station 1
  await bb.runJump("G", 8, "right", { landTile: 12, runup: 2, jumpHold: 300, retries: 4 }).catch(() => {});
  await bb.walkTo("G", 14, { timeout: 14000 });
  await bb.runJump("H", 8, "right", { landTile: 12, runup: 2, jumpHold: 320, retries: 4 }).catch(() => {});
  await bb.walkTo("H", 14, { timeout: 14000 });
  // Station 2
  await bb.runJump("G", 15, "right", { landTile: 18, jumpHold: 220, runup: 2, retries: 4 });
  await bb.runJump("H", 15, "right", { landTile: 18, jumpHold: 240, runup: 2, retries: 4 });
  await advance(20);
  // Station 3
  const gskill = await bb.equip("G", 23);
  const hskill = await bb.equip("H", 26);
  check("P1 equipped grapple", gskill === "grapple", gskill);
  check("P2 equipped heavy", hskill === "heavy", hskill);
  await bb.waitFor((s) => s.doors.find((d) => d.id === "gate")?.open, 5000, "gate open").catch(() => {});
  await advance(29);
  // Station 4
  await bb.walkTo("H", 31, { timeout: 9000 });
  await bb.tap("ArrowUp", 120);
  await sleep(120);
  await bb.tap("KeyL", 80);
  await sleep(900);
  await bb.walkTo("H", 31, { timeout: 6000 }).catch(() => {});
  await bb.act("H");
  await bb.waitFor((s) => s.bridges.find((b) => b.id === "tbr")?.open, 5000, "bridge down").catch(() => {});
  await bb.walkTo("H", 33, { timeout: 8000 }).catch(() => {});
  try {
    await bb.walkTo("G", 33, { timeout: 8000 });
    await bb.zipTo("G", { timeout: 3500 });
    await bb.zipRelease("G", "right");
    await sleep(400);
  } catch { /* fall through to walking the bridge */ }
  await advance(40);
  // Station 5
  await advance(43);
  try {
    await bb.walkTo("G", 43, { timeout: 5000 });
    await bb.walkTo("H", 42, { timeout: 5000 });
    await bb.act("H");
    await sleep(200);
    await bb.act("H");
    await sleep(500);
  } catch { /* optional */ }
  await advance(47);
  // Station 6
  await bb.walkTo("H", 48, { timeout: 8000 });
  await bb.waitFor((s) => s.plates.find((p) => p.id === "tpl")?.active, 5000, "plate active").catch(() => {});
  await bb.waitFor((s) => s.doors.find((d) => d.id === "td1")?.open, 4000, "td1 open").catch(() => {});
  await bb.walkTo("G", 51, { timeout: 9000 });
  await bb.act("G");
  await bb.waitFor((s) => s.levers.find((l) => l.id === "tlv2")?.on, 4000, "tlv2 on").catch(() => {});
  await bb.walkTo("H", 52, { timeout: 9000 });
  await advance(52);
  // Station 7
  await bb.walkTo("H", 51, { timeout: 6000 });
  await bb.walkTo("G", 54, { timeout: 9000 });
  await sleep(500);
  await bb.walkTo("H", 54, { timeout: 9000 });
  const done = await bb.waitFor((s) => s.complete, 6000, "level complete").then(() => true).catch(() => false);
  check("both exited — ORIENTATION COMPLETE", done);
} catch (e) {
  check("tutorial run completed without error", false, e?.message || String(e));
  await bb.releaseAll().catch(() => {});
  await shot("u10-error");
}
await bb.releaseAll().catch(() => {});
await sleep(900);

// save-purity: the tutorial itself must not write the save key
const saveAfterTut = await lsGet("bolt-buddies-save-v1");
check("tutorial did NOT write a save", saveAfterTut === null, `save=${saveAfterTut}`);

// continue from the clear overlay -> HUB (this flow), not Title
await bb.tap("Space");
await sleep(1300);
check("(b) ORIENTATION flow returned to HUB (not Title)", (await active("Hub")) && !(await active("Title")));
await shot("u10-tut-to-hub");

// ux-v1 completion flag set (the tutorial's ONLY persistence)
const uxBlob = await lsGet("bolt-buddies-ux-v1");
let uxFlag = false;
try { uxFlag = !!JSON.parse(uxBlob)?.tutorialDone; } catch { /* */ }
check("ux-v1 carries tutorialDone flag", uxFlag === true, `ux=${uxBlob}`);

// ============================================================================
// (d-after): relaunch title -> pip is gone once tutorial completed
// ============================================================================
await page.reload({ waitUntil: "networkidle" });
await sleep(1000);
check("title scene active (post-tutorial)", await active("Title"));
const pipAfter = await page.evaluate(() => window.__BB.menu.tutorialPip());
check("(d) TUTORIAL 'new!' pip gone after completion", pipAfter === false);

// ============================================================================
// (c): existing save -> NEW GAME -> NO interstitial (straight to hub)
// ============================================================================
await page.evaluate(() => localStorage.setItem("bolt-buddies-save-v1",
  JSON.stringify({ unlocked: 3, cores: { "1-1": [true, false, false] } })));
await page.reload({ waitUntil: "networkidle" });
await sleep(1000);
const items = await page.evaluate(() => window.__BB.menu.items.map((i) => i.id));
check("(c) CONTINUE present with an existing save", items[0] === "continue", JSON.stringify(items));
// select NEW GAME and drive the kid-proof erase-confirm (two presses)
await page.evaluate(() => window.__BB.menu.select(window.__BB.menu.items.findIndex((i) => i.id === "new")));
await sleep(150);
await bb.tap("KeyE"); // first press: arms "erase everything?"
await sleep(300);
await bb.tap("KeyE"); // second press: wipes + goes to hub
await sleep(1000);
check("(c) NEW GAME with existing save skipped the interstitial",
  (await active("Hub")) && !(await active("Onboard")), `hub=${await active("Hub")} onboard=${await active("Onboard")}`);

await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (pageErrors.length) console.log(`page errors: ${pageErrors.length} (first: ${pageErrors[0]})`);
process.exit(fails.length || pageErrors.length ? 1 : 0);
