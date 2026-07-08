// SL5 — Tutorial getting-stuck & restart lesson — visual acceptance.
//
// A dedicated Orientation-Day teaching beat that introduces RESTART as a normal
// tool, placed AFTER the pit stations (Station 4's co-op reel escape) so it reads
// as the universal fallback. It reuses the existing tutorial plumbing only:
//   - a one-shot, NON-SOLID `trigger` zone in the single free column (x46) between
//     the `s5` zone (x41-45) and Station 6's trigger (x47-49); on entry it fires a
//     blame-free KOBI blip about R×2 restart + ESC-to-map.
//   - a static R / R / ESC key-glyph (def.glyphs) floating above the joy-core ledge,
//     clear of the driven route along the floor.
//
// This drives the tutorial to the beat and screenshots the KOBI blip + the glyph
// rendering in place. Display-only: no save, no geometry change (tut_sanity stays
// 21/21). 0 page errors required.
//
//   node tools/snap_p2_sl5.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const T = 48;
mkdirSync("tools/shots/p2", { recursive: true });

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`); if (!cond) fails.push(msg); };
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });

await page.goto(URL, { waitUntil: "networkidle" });
const sleep = (ms) => page.waitForTimeout(ms);
await sleep(1000);

// --- launch the hidden tutorial chamber directly (levelIndex 12 — same target as
// the TITLE menu's TUTORIAL button; matches tools/snap_p2_sl4.mjs's load(12)).
await page.evaluate(() => {
  const m = window.__BB.game.scene;
  ["UI", "Title", "Hub", "Game"].forEach((k) => m.stop(k));
  m.start("Game", { levelIndex: 12 });
});
await sleep(1800);

const s0 = await page.evaluate(() => {
  const s = window.__BB.scene;
  return { id: s.def.id, tutorial: !!s.def.tutorial, triggers: s.triggers.length,
    glyphDefs: (s.def.glyphs || []).length };
});
ok(s0.id === "tut" && s0.tutorial, `tutorial chamber loaded (${JSON.stringify(s0)})`);
ok(s0.triggers === 7, `7 trigger zones incl. the new restart beat (${s0.triggers})`);

// the restart lesson's static R/R/ESC glyph exists in the def (x46, y7)
const glyphDef = await page.evaluate(() => {
  const g = (window.__BB.scene.def.glyphs || []).find((z) => z.x === 46 && z.y === 7);
  return g ? g.caps.map((c) => c.k || `gap${c.gap}`) : null;
});
ok(JSON.stringify(glyphDef) === JSON.stringify(["R", "R", "gap14", "ESC"]),
  `R / R / ESC key-glyph declared above the joy-core ledge (${JSON.stringify(glyphDef)})`);

// let the intro banner + start blip drain so the shot shows OUR blip cleanly
await sleep(5200);

// --- drive to the beat: place both robots in the x46 restart-lesson trigger zone
// (non-solid AABB, rows 12-14). Standing there fires the one-shot KOBI blip and
// centres the camera on Station 5 so the floating R/R/ESC glyph is in frame.
await page.evaluate(() => {
  const s = window.__BB.scene; const T = 48;
  for (const p of s.players) { p.invuln = 999999; p.dead = false; }
  s.players[0].body.reset(46 * T + 14, 13 * T + 24); s.players[0].setVelocity(0, 0);
  s.players[1].body.reset(46 * T + 34, 13 * T + 24); s.players[1].setVelocity(0, 0);
});
await sleep(700); // let the update loop's AABB check fire the trigger

const beat = await page.evaluate(() => {
  const s = window.__BB.scene;
  // the restart trigger is the non-`s5` zone whose rect starts at x=46
  const tr = s.triggers.find((t) => t.id !== "s5" && t.rect.x === 46 * 48);
  return {
    fired: !!(tr && tr.fired),
    blip: tr ? tr.blip : "",
    s5Fired: !!(s.triggers.find((t) => t.id === "s5") || {}).fired,
    save: localStorage.getItem("bolt-buddies-save-v1"),
  };
});
ok(beat.fired, "restart-lesson trigger fired on entry");
ok(/hold R twice to restart/i.test(beat.blip) && /ESC/i.test(beat.blip),
  `blame-free KOBI restart copy (R×2 + ESC): "${beat.blip}"`);
ok(beat.save === null, `tutorial wrote NO save (display-only) — save=${beat.save}`);

// give the blip bar its full typewriter time, then capture
await sleep(3600);
await page.screenshot({ path: "tools/shots/p2/sl5-restart-lesson.png" });
console.log("shot: tools/shots/p2/sl5-restart-lesson.png");

ok(errors === 0, `0 page errors (saw ${errors})`);
console.log(`\n${fails.length ? "FAILURES:\n  " + fails.join("\n  ") : "ALL SL5 CHECKS PASSED"}`);
await browser.close();
process.exit(fails.length || errors ? 1 : 0);
