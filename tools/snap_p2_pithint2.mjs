// U13b — ASYMMETRIC deep-pit reel-out hint acceptance probe (tutorial-only).
//
// The common playtester soft-lock: ONE robot falls into the Station-4 grapple pit
// while its GRAPPLE partner stands OUT on the edge holding the hook. The stuck
// buddy can't self-exit; the partner should REEL it out (DOWN+ACTION). The old U13
// hint only fired when BOTH were stuck. This probe covers the asymmetric case that
// complements it.
//
// Checks:
//   (a) tutorial — HEAVY stuck in the pit, GRAPPLE partner OUT on the edge within
//       reel range -> after the debounce a REEL-OUT coach bubble (key "pitreel")
//       shows ON THE GRAPPLE player: down-arrow + that player's DOWN + ACTION
//       keycaps + "REEL YOUR BUDDY OUT" caption + the KOBI reel blip. shot below.
//   (b) BOTH stuck -> the U13 zip-up hint (key "pithint") still fires (regression).
//   (c) partner OUT of reel range / no LOS -> the reel hint NEVER fires; and it
//       never fires in a NON-tutorial level (no def.pitHint). Bonus: a non-grapple
//       partner out (heavy can't reel) also stays silent.
//   (d) the stuck buddy is reeled/climbs out -> the reel hint CLEARS + re-arms.
//   0 page errors. Honors the renderer-wedge rule: no page.evaluate within ~1s of
//   a BOTH-player reposition (every reposition is followed by a >1s settle).
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`); if (!cond) fails.push(msg); };
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });

await page.goto("http://localhost:5173/?canvas=1", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
const T = 48;
const sleep = (ms) => page.waitForTimeout(ms);

const load = async (idx) => {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Title"); m.stop("Hub"); m.stop("Game");
    m.start("Game", { levelIndex: i });
  }, idx);
  await sleep(1800);
};

// reel-out coach-bubble state (passive read of the scene pool + probe meta)
const reelState = () => page.evaluate(() => {
  const s = window.__BB.scene;
  const b = s.coach.bubbles.find((bb) => bb.active && bb.key === "pitreel");
  const texts = b ? b.texts.filter((t) => t.visible).map((t) => t.text) : [];
  return {
    bubble: !!b, visible: b ? b.c.visible : false,
    idx: b ? s.coach.bubbles.indexOf(b) : -1,
    fired: !!s._pitReelFired, meta: s._pitReelMeta, texts,
  };
});
// zip-up (both-stuck) bubble state — the existing U13 hint
const zipState = () => page.evaluate(() => {
  const s = window.__BB.scene;
  const b = s.coach.bubbles.find((bb) => bb.active && bb.key === "pithint");
  return { bubble: !!b, visible: b ? b.c.visible : false, fired: !!s._pitHintFired };
});
const blipHas = (frag) => page.evaluate((frag) => {
  const ui = window.__BB.game.scene.getScene("UI");
  const inActive = ui.blipActive && ui.blipActive.text.includes(frag);
  const inQueue = ui.blipQueue.some((q) => q.text.includes(frag));
  return !!(inActive || inQueue);
}, frag);

// ===== (a) HEAVY stuck, GRAPPLE partner out on the edge -> reel-out hint ======
await load(12); // tutorial
await page.evaluate(() => {
  const s = window.__BB.scene; const T = 48;
  s.players[0].setSkill("grapple"); // P1 = grapple (the OUT partner)
  s.players[1].setSkill("heavy");   // P2 = heavy (stuck in the pit)
  for (const p of s.players) { p.invuln = 999999; p.dead = false; }
  // heavy at the pit bottom (x-band 34..38, below the floor line row 15)
  s.players[1].body.reset(36 * T + 10, 16 * T + 24); s.players[1].setVelocity(0, 0);
  // grapple OUT on the solid left lip (x33 top, above the floor line) — within
  // reel range of the stuck heavy, clear line down into the pit.
  s.players[0].body.reset(33 * T + 24, 13 * T + 24); s.players[0].setVelocity(0, 0);
});
await sleep(1600); // settle >1s (renderer-wedge rule)
await sleep(2600); // wait out the ~1.6s debounce (+ margin)
let a = await reelState();
ok(a.bubble && a.visible, `reel-out bubble visible after debounce (${JSON.stringify({ b: a.bubble, v: a.visible, idx: a.idx })})`);
ok(a.idx === 0, `reel-out bubble is on the GRAPPLE player (idx=${a.idx})`);
ok(a.texts.includes("REEL YOUR BUDDY OUT"), `caption present (${JSON.stringify(a.texts)})`);
ok(a.texts.includes("SPACE") && a.texts.includes("S"), `P1 DOWN(S) + ACTION(SPACE) keycaps shown (${JSON.stringify(a.texts)})`);
ok(a.meta && a.meta.idx === 0 && a.meta.actCap === "SPACE" && a.meta.downCap === "S",
  `meta: down-arrow + S + SPACE on grapple (${JSON.stringify(a.meta)})`);
ok(a.fired === true, "reel hint marked fired for this episode");
ok(await blipHas("REEL them out"), "KOBI reel-out blip queued/active");
await page.screenshot({ path: "tools/shots/p2/pithint-reel.png" });

// ===== (d) the stuck buddy climbs out -> reel hint clears + re-arms ===========
await page.evaluate(() => {
  const s = window.__BB.scene; const T = 48;
  for (const p of s.players) { p.invuln = 999999; p.dead = false; }
  // both back on solid ground above the pit (buddy reeled/escaped)
  s.players[0].body.reset(33 * T + 24, 13 * T + 24); s.players[0].setVelocity(0, 0);
  s.players[1].body.reset(41 * T + 24, 13 * T + 24); s.players[1].setVelocity(0, 0);
});
await sleep(1400); // >1s before reads; lets the clear tick run
let d = await reelState();
ok(!d.bubble, `reel hint cleared after escape (${JSON.stringify({ b: d.bubble })})`);
ok(d.fired === false, "reel episode re-armed after the pit emptied");

// ===== (b) BOTH stuck -> zip-up hint still fires (U13 regression) =============
await load(12); // fresh latches
await page.evaluate(() => {
  const s = window.__BB.scene; const T = 48;
  s.players[0].setSkill("grapple");
  s.players[1].setSkill("heavy");
  for (const p of s.players) { p.invuln = 999999; p.dead = false; }
  s.players[0].body.reset(36 * T + 10, 16 * T + 24); s.players[0].setVelocity(0, 0);
  s.players[1].body.reset(36 * T + 34, 16 * T + 24); s.players[1].setVelocity(0, 0);
});
await sleep(1600); // settle >1s
await sleep(3000); // past the 2.2s both-stuck debounce
let bz = await zipState();
let br = await reelState();
ok(bz.bubble && bz.visible, `both-stuck zip-up hint still fires (${JSON.stringify(bz)})`);
ok(!br.bubble, "reel-out hint does NOT double-fire while both are stuck");
ok(await blipHas("zip UP, then REEL"), "U13 two-step teamwork blip present");

// ===== (c1) partner OUT of reel range -> no reel hint =========================
await load(12);
await page.evaluate(() => {
  const s = window.__BB.scene; const T = 48;
  s.players[0].setSkill("grapple");
  s.players[1].setSkill("heavy");
  for (const p of s.players) { p.invuln = 999999; p.dead = false; }
  s.players[1].body.reset(36 * T + 10, 16 * T + 24); s.players[1].setVelocity(0, 0); // stuck heavy
  s.players[0].body.reset(4 * T + 24, 13 * T + 24); s.players[0].setVelocity(0, 0);   // grapple FAR away (>grappleRange)
});
await sleep(1600); // settle
await sleep(2600); // past debounce
let c1 = await reelState();
ok(!c1.bubble && c1.fired === false, `no reel hint when the partner is out of reel range (${JSON.stringify({ b: c1.bubble, f: c1.fired })})`);

// ===== (c2) NON-grapple partner out (heavy can't reel) -> no reel hint ========
await load(12);
await page.evaluate(() => {
  const s = window.__BB.scene; const T = 48;
  s.players[0].setSkill("heavy");   // P1 = heavy OUT (can't reel)
  s.players[1].setSkill("grapple"); // P2 = grapple, stuck in the pit
  for (const p of s.players) { p.invuln = 999999; p.dead = false; }
  s.players[1].body.reset(36 * T + 10, 16 * T + 24); s.players[1].setVelocity(0, 0); // stuck grapple
  s.players[0].body.reset(33 * T + 24, 13 * T + 24); s.players[0].setVelocity(0, 0);  // heavy on the lip
});
await sleep(1600);
await sleep(2600);
let c2 = await reelState();
ok(!c2.bubble && c2.fired === false, `no reel hint when the OUT partner is non-grapple (${JSON.stringify({ b: c2.bubble, f: c2.fired })})`);

// ===== (c3) non-tutorial level -> never fires ================================
await load(0); // 1-1 (no def.pitHint)
await page.evaluate(() => {
  const s = window.__BB.scene;
  for (const p of s.players) { p.invuln = 999999; p.dead = false; p.setVelocity(0, 0); }
  const px = s.players[0].x, py = s.players[0].y;
  s.players[0].body.reset(px, py); s.players[1].body.reset(px + 200, py);
});
await sleep(1400);
await sleep(2600);
let c3 = await page.evaluate(() => {
  const s = window.__BB.scene;
  return { hasPitHint: !!s.def.pitHint, bubble: s.coach.bubbles.some((bb) => bb.active && bb.key === "pitreel") };
});
ok(c3.hasPitHint === false, "1-1 does NOT declare def.pitHint (campaign-safe)");
ok(c3.bubble === false, "no reel-out bubble in the non-tutorial level");

ok(errors === 0, `0 page errors (saw ${errors})`);
console.log(`\n${fails.length ? "FAILURES:\n  " + fails.join("\n  ") : "ALL U13b REEL-OUT CHECKS PASSED"}`);
await browser.close();
process.exit(fails.length || errors ? 1 : 0);
