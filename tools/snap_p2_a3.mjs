// ANIM A3 — Player idle & waiting tiers: acceptance probe + BURST-SHOT CONTACT SHEETS.
//
// A3 hangs the idle/waiting tiers off the A1 rig + the shared fidget scheduler:
//   TIER 0 (always, idle-grounded): breathing bob + the retimed blink (pupil
//     overlay hidden while the baked eyes-closed texture shows).
//   TIER 1 (~4s idle): staggered one-at-a-time fidgets — glance, antenna twitch,
//     tread shuffle.
//   TIER 2 (~8s idle, PER-SKILL): grapple twirls a hook glyph; heavy does a
//     cosmetic knuckle-crack tap-tap (NO real stomp); phase flickers + startles;
//     tiny does two little hops (VISUAL bob, NOT a physics jump).
//   PARTNER-AWARE: both idle within 6 tiles → turn and look, one beeps, one tilts.
//
// This probe:
//   1. CONTACT SHEETS (5-frame strips) -> tools/shots/p2/:
//        a3-idle.png a3-fidget.png a3-wait-grapple.png a3-wait-heavy.png
//        a3-wait-phase.png a3-wait-tiny.png a3-partner.png
//   2. CANCELABILITY — a wait is dropped the frame input arrives; input is honored
//      immediately (no lag): the player moves, the fidget is gone.
//   3. VISUAL-ONLY — the tiny hop + heavy tap leave the body WORLD BOX byte-identical
//      (updateFromGameObject snapshot) while the sprite moves; no jump velocity fires
//      and heavyImpact/stomp never runs during the tap.
//   4. TIERS escalate on the ~4s / ~8s idle timers (per-skill tier-2 signatures).
//   5. PARTNER look-at fires ONLY when both idle within 6 tiles; re-arms on separation.
//   6. 0 page errors, Canvas tier.
//   7. fps A/B (Canvas) 1-1 + 2-2, anim ON vs OFF within ~2 fps.
//
//   node tools/snap_p2_a3.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BB_BASE || "http://localhost:5173";
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = process.env.BB_SHOTS || "tools/shots/p2";
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}${extra ? " — " + extra : ""}`);
  if (!cond) fails.push(msg);
};

const cBrowser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await cBrowser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
let errors = 0;
page.on("pageerror", (e) => { console.log("PAGE ERROR:", e.message); errors++; });
page.on("console", (m) => { if (/error/i.test(m.text())) console.log("CONSOLE:", m.text()); });
await page.goto(`${BASE}/?canvas=1`, { waitUntil: "networkidle" });
await sleep(900);

const startLevel = async (idx) => {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Game"); m.stop("Title"); m.stop("Onboard"); m.stop("Hub");
    m.start("Game", { levelIndex: i });
  }, idx);
  await page.waitForFunction(() => {
    const g = window.__BB.game.scene.getScene("Game");
    return !!(g && g.def && g.players && g.players.length === 2 && g.anim &&
      window.__BB.game.scene.isActive("Game"));
  }, null, { timeout: 8000 });
  await sleep(1400);
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    g._origUpdateCamera = g.updateCamera;
    g.updateCamera = () => {};
  });
};
const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);

// 1-1 solid flat ground spans x≈400..570 (x≈592..688 is a conveyor, x>688 a pit),
// so every idle capture/measure pins the robot on solid ground at SOLID_X.
const SOLID_X = 480;
const PARK = 190; // the other buddy, parked near spawn well left of the centred clip
// settle player0 on the ground at x, keys released + invuln cleared (clean idle).
const settleP0 = (x = SOLID_X) => page.evaluate(async (x) => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0];
  ["left", "right", "jump", "act", "down"].forEach((k) => { if (p.keys[k]) p.keys[k].isDown = false; });
  p.invuln = 0; p.setPosition(x, p.y); p.setVelocity(0, 0);
  await new Promise((res) => { let n = 0; const iv = setInterval(() => { if (p.grounded || ++n > 70) { clearInterval(iv); res(); } }, 30); });
  await new Promise((r) => setTimeout(r, 350));
  return { grounded: p.grounded, y: Math.round(p.y) };
}, x);

// camera framing helpers
const ZOOM = 2.4;
const framePlayer = () => page.evaluate((z) => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0];
  const cam = g.cameras.main;
  cam.setZoom(z); cam.centerOn(p.x, p.y - 8);
}, ZOOM);
const frameBetween = (z) => page.evaluate((z) => {
  const g = window.__BB.game.scene.getScene("Game");
  const a = g.players[0], b = g.players[1];
  const cam = g.cameras.main;
  cam.setZoom(z); cam.centerOn((a.x + b.x) / 2, (a.y + b.y) / 2 - 6);
}, z);
const soloClip = { x: 640 - 100, y: 360 - 130, width: 200, height: 260 };
const pairClip = { x: 640 - 220, y: 360 - 120, width: 440, height: 240 };
const grab = async (clip, framer) => { if (framer) await framer(); const buf = await page.screenshot({ clip }); return buf.toString("base64"); };

const strip = async (name, frames, label, w = 200, h = 220) => {
  const imgs = frames.map((f) => `<img src="data:image/png;base64,${f}" style="display:block;width:${w}px;height:${h}px;border-radius:6px">`).join("");
  const html = `<body style="margin:0"><div style="display:inline-flex;flex-direction:column;gap:6px;background:#0a0f1e;padding:10px;font-family:monospace">`
    + `<div style="color:#8fa3d9;font-size:13px">A3 · ${label}</div>`
    + `<div style="display:inline-flex;gap:6px">${imgs}</div></div></body>`;
  const p2 = await ctx.newPage();
  await p2.setContent(html);
  const el = await p2.$("div");
  await el.screenshot({ path: `${SHOTS}/${name}.png` });
  await p2.close();
  console.log(`contact sheet -> ${SHOTS}/${name}.png`);
};

// in-page: disable the auto-scheduler so a forced beat isn't overridden mid-capture.
const setSched = (on) => page.evaluate((v) => { window.__BB.game.scene.getScene("Game").anim.fidget.enabled = v; }, on);
const setSkill0 = (s) => page.evaluate((s) => { window.__BB.game.scene.getScene("Game").players[0].setSkill(s); }, s);
// start a specific beat on player0 (tier 1 forces the round-robin cursor).
const startBeat0 = (tier, seq) => page.evaluate(([tier, seq]) => {
  const g = window.__BB.game.scene.getScene("Game");
  const rig = g.anim.rigFor(g.players[0]);
  if (typeof seq === "number") rig._fidgetSeq = seq;
  rig.idleMs = 9000;
  rig.startAnimFidget(tier);
  return rig._fidget.type;
}, [tier, seq]);
// deterministically hold the active beat at progress `frac` (0..0.9) for a clean frame.
const holdFrac = (frac) => page.evaluate((frac) => {
  const g = window.__BB.game.scene.getScene("Game");
  const rig = g.anim.rigFor(g.players[0]);
  const f = rig._fidget;
  f.active = true; rig.activeFidget = f; f.t = frac * f.dur;
}, frac);
const partTotal = () => page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  return g.anim.rigs.reduce((n, r) => n + r.parts.length, 0);
});

await startLevel(0);
ok(await active("Game"), "1-1 Game scene active");
ok(!(await page.evaluate(() => window.__BB.game.renderer.type === 2)), "running on the Canvas tier (?canvas=1)");

// ============================================================================
// CONTACT SHEET: TIER 0 — breathing bob + a blink (pupils hide on the blink).
// ============================================================================
{
  await setSched(false);
  await setSkill0("grapple");
  await settleP0();
  await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); g.anim.rigFor(g.players[0]).cancelFidget(); });
  const f = [];
  f.push(await grab(soloClip, framePlayer)); await sleep(320);
  f.push(await grab(soloClip, framePlayer)); await sleep(320);
  // force a blink for the middle frame
  await page.evaluate(() => { const p = window.__BB.game.scene.getScene("Game").players[0]; p.blinking = 200; p.setTexture(p.baseKey + "_blink"); });
  await sleep(40);
  f.push(await grab(soloClip, framePlayer)); await sleep(320);
  f.push(await grab(soloClip, framePlayer)); await sleep(320);
  f.push(await grab(soloClip, framePlayer));
  await strip("a3-idle", f, "TIER 0 — breathing bob + blink (pupils hidden on the blink)");
}

// ============================================================================
// CONTACT SHEET: TIER 1 — a look/glance fidget (pupils + slight body turn).
// ============================================================================
{
  await settleP0();
  const t = await startBeat0(1, 0); // seq 0 -> "look"
  ok(t === "look", "tier-1 forced beat is a look/glance", `type=${t}`);
  const f = [];
  for (const frac of [0.05, 0.22, 0.45, 0.68, 0.88]) { await holdFrac(frac); await sleep(45); f.push(await grab(soloClip, framePlayer)); }
  await strip("a3-fidget", f, "TIER 1 — glance left/right (pupils + slight body turn)");
}

// per-skill TIER 2 waiting signatures --------------------------------------
const waitSheet = async (skill, name, label, fracs) => {
  await setSkill0(skill);
  await settleP0();
  const t = await startBeat0(2);
  const f = [];
  for (const frac of fracs) { await holdFrac(frac); await sleep(45); f.push(await grab(soloClip, framePlayer)); }
  await strip(name, f, label);
  return t;
};
{
  const t = await waitSheet("grapple", "a3-wait-grapple", "TIER 2 · GRAPPLE — twirls a little hook glyph", [0.12, 0.3, 0.5, 0.7, 0.85]);
  ok(t === "twirl", "grapple tier-2 waiting beat is the hook twirl", `type=${t}`);
}
{
  const t = await waitSheet("heavy", "a3-wait-heavy", "TIER 2 · HEAVY — cosmetic knuckle-crack tap-tap (no real stomp)", [0.1, 0.24, 0.45, 0.62, 0.8]);
  ok(t === "tap", "heavy tier-2 waiting beat is the cosmetic tap-tap", `type=${t}`);
}
{
  const t = await waitSheet("phase", "a3-wait-phase", "TIER 2 · PHASE — flickers half-transparent + startles itself", [0.08, 0.3, 0.48, 0.62, 0.8]);
  ok(t === "flicker", "phase tier-2 waiting beat is the flicker/startle", `type=${t}`);
}
{
  const t = await waitSheet("tiny", "a3-wait-tiny", "TIER 2 · TINY — two little hops in place (visual, not a jump)", [0.12, 0.28, 0.5, 0.72, 0.9]);
  ok(t === "hop", "tiny tier-2 waiting beat is the two-hop", `type=${t}`);
}

// ============================================================================
// CONTACT SHEET: PARTNER — both idle within 6 tiles → turn and look.
// ============================================================================
{
  await setSkill0("grapple");
  await page.evaluate(async () => {
    const g = window.__BB.game.scene.getScene("Game");
    const a = g.players[0], b = g.players[1];
    a.setSkill("grapple"); b.setSkill("tiny");
    a.invuln = 0; b.invuln = 0;
    a.setPosition(440, a.y); b.setPosition(560, a.y); // both on solid ground, 2.5 tiles apart
    [a, b].forEach((p) => { p.setVelocity(0, 0); ["left", "right", "jump"].forEach((k) => p.keys[k] && (p.keys[k].isDown = false)); });
    await new Promise((res) => { let n = 0; const iv = setInterval(() => { if ((a.grounded && b.grounded) || ++n > 70) { clearInterval(iv); res(); } }, 30); });
    await new Promise((r) => setTimeout(r, 350));
    const ra = g.anim.rigFor(a), rb = g.anim.rigFor(b);
    ra.idleMs = 9000; rb.idleMs = 9000; g.anim._partnerFired = false;
    g.anim._updatePartner();
  });
  const holdBoth = (frac) => page.evaluate((frac) => {
    const g = window.__BB.game.scene.getScene("Game");
    [g.players[0], g.players[1]].forEach((p) => { const f = g.anim.rigFor(p)._fidget; f.active = true; g.anim.rigFor(p).activeFidget = f; f.t = frac * f.dur; });
  }, frac);
  const f = [];
  for (const frac of [0.15, 0.4, 0.6, 0.85]) { await holdBoth(frac); await sleep(45); f.push(await grab(pairClip, () => frameBetween(1.7))); }
  await strip("a3-partner", f, "PARTNER — both idle within 6 tiles: turn + look, one beeps, one tilts", 220, 150);
}

// re-enable the scheduler for the behavioural assertions
await setSched(true);

// ============================================================================
// POOLED — overlay part count stable (tread + pupils + antenna + hook glyph = 4/rig).
// ============================================================================
const pcount = await partTotal();
ok(pcount === 8, "overlay parts POOLED (4 per player rig: tread/pupils/antenna/hook glyph)", `total=${pcount}`);

// ============================================================================
// 2. CANCELABILITY — a wait is dropped the frame input arrives; input honored now.
// ============================================================================
const cancel = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0];
  const rig = g.anim.rigFor(p);
  p.invuln = 0; p.setSkill("tiny"); p.setPosition(480, p.y); p.setVelocity(0, 0);
  await new Promise((res) => { let n = 0; const iv = setInterval(() => { if (p.grounded || ++n > 70) { clearInterval(iv); res(); } }, 30); });
  await new Promise((r) => setTimeout(r, 200));
  rig.idleMs = 9000; rig.startAnimFidget(2); // a hop wait
  await new Promise((r) => setTimeout(r, 60));
  const before = { active: !!rig.activeFidget, type: rig._fidget.type };
  p.keys.left.isDown = true; // INPUT arrives
  await new Promise((r) => setTimeout(r, 120));
  const after = { active: !!rig.activeFidget, vx: Math.round(p.body.velocity.x), state: rig.machine.state };
  p.keys.left.isDown = false;
  return { before, after };
});
ok(cancel.before.active && cancel.before.type === "hop", "a tier-2 wait was active before input", JSON.stringify(cancel.before));
ok(!cancel.after.active, "the wait is DROPPED the instant input arrives (fidget cleared, no lag)", JSON.stringify(cancel.after));
ok(cancel.after.vx < -60, "input is honored immediately — the player moves that frame (input never eaten)", `vx=${cancel.after.vx}`);

// ============================================================================
// 3. VISUAL-ONLY — tiny hop + heavy tap: body WORLD BOX byte-identical, no jump
//    velocity, no stomp impact. Synchronous snapshot (updateFromGameObject) proves
//    the invariance; a live run proves no gameplay effect fires.
// ============================================================================
const invariance = await page.evaluate((skill) => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0];
  const b = p.body;
  p.setSkill(skill); p.setVelocity(0, 0); if (p._sqTween) p._sqTween.stop(); p.sqX = 1; p.sqY = 1;
  const snap = () => { b.updateFromGameObject(); return { x: +b.x.toFixed(3), y: +b.y.toFixed(3), w: +b.width.toFixed(3), h: +b.height.toFixed(3), cx: +b.center.x.toFixed(3), cy: +b.center.y.toFixed(3) }; };
  p.applyLocomotion(0, 0, 1, 1); const N = snap();
  const spriteN = +p.y.toFixed(2);
  // extreme hop pose (tiny): a big visual bob up + stretch
  p.applyLocomotion(-8, 0, 0.96, 1.06); const HOP = snap(); const spriteHop = +p.y.toFixed(2);
  // extreme tap pose (heavy): squash down + dip
  p.applyLocomotion(1.6, 0, 1.07, 0.89); const TAP = snap();
  p.applyLocomotion(0, 0, 1, 1);
  const same = (a, c) => a.x === c.x && a.y === c.y && a.w === c.w && a.h === c.h && a.cx === c.cx && a.cy === c.cy;
  return { N, HOP, TAP, hopSame: same(N, HOP), tapSame: same(N, TAP), spriteLift: +(spriteN - spriteHop).toFixed(2) };
}, "tiny");
ok(invariance.hopSame, "VISUAL-ONLY: tiny HOP leaves the body world box byte-identical (bob leaks nothing)",
  `N=${JSON.stringify(invariance.N)} HOP=${JSON.stringify(invariance.HOP)}`);
ok(invariance.tapSame, "VISUAL-ONLY: heavy TAP leaves the body world box byte-identical (squash counter-cancelled)",
  `N=${JSON.stringify(invariance.N)} TAP=${JSON.stringify(invariance.TAP)}`);
ok(invariance.spriteLift > 4, "the SPRITE visibly lifts under the hop while the body stays put (bob is real, ~8px)", `lift=${invariance.spriteLift}px`);

// live tiny hop — no jump velocity fired. Observe the forced beat in isolation
// (scheduler off so nothing else fires/cancels; its cancel path is proven above).
await setSched(false);
const liveHop = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0]; const rig = g.anim.rigFor(p);
  p.invuln = 0; p.setSkill("tiny"); p.setPosition(480, p.y); p.setVelocity(0, 0);
  await new Promise((res) => { let n = 0; const iv = setInterval(() => { if (p.grounded || ++n > 70) { clearInterval(iv); res(); } }, 30); });
  await new Promise((r) => setTimeout(r, 300));
  rig.idleMs = 9000; rig.startAnimFidget(2);
  // sample EVERY frame (rAF) over the whole hop so the min/max isn't aliased.
  let maxVy = 0, minY = Infinity, maxY = -Infinity; const t0 = performance.now();
  await new Promise((res) => { const step = () => { maxVy = Math.max(maxVy, Math.abs(p.body.velocity.y)); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); if (performance.now() - t0 > 800) res(); else requestAnimationFrame(step); }; requestAnimationFrame(step); });
  return { maxVy: Math.round(maxVy), spriteRange: +(maxY - minY).toFixed(1) };
});
ok(liveHop.maxVy < 40, "tiny HOP fires NO jump velocity (body vy stays ~0 — it's a visual bob)", `maxVy=${liveHop.maxVy} liftRange≈${liveHop.spriteRange}px`);

// live heavy tap — no stomp impact fires
const liveTap = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0]; const rig = g.anim.rigFor(p);
  p.invuln = 0; p.setSkill("heavy"); p.setPosition(480, p.y); p.setVelocity(0, 0);
  await new Promise((res) => { let n = 0; const iv = setInterval(() => { if (p.grounded || ++n > 70) { clearInterval(iv); res(); } }, 30); });
  await new Promise((r) => setTimeout(r, 300));
  let stompFired = false; const orig = g.heavyImpact; g.heavyImpact = (...a) => { stompFired = true; return orig.apply(g, a); };
  rig.idleMs = 9000; rig.startAnimFidget(2);
  let maxVy = 0;
  await new Promise((res) => { let n = 0; const iv = setInterval(() => { maxVy = Math.max(maxVy, Math.abs(p.body.velocity.y)); if (++n >= 18) { clearInterval(iv); res(); } }, 40); });
  g.heavyImpact = orig;
  return { stompFired, maxVy: Math.round(maxVy), stomping: p.stomping };
});
ok(!liveTap.stompFired && !liveTap.stomping, "heavy TAP triggers NO stomp mechanic (heavyImpact never fires, stomping stays false)", JSON.stringify(liveTap));
ok(liveTap.maxVy < 40, "heavy TAP writes NO body velocity (cosmetic squash only)", `maxVy=${liveTap.maxVy}`);

// ============================================================================
// 4. TIERS escalate on the ~4s / ~8s idle timers (per-skill tier-2 signatures).
// ============================================================================
const esc = await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  const p = g.players[0]; const rig = g.anim.rigFor(p);
  const now = g.time.now;
  const T1 = new Set(["look", "twitch", "shuffle"]);
  const probe = (idle, skill) => {
    p.skill = skill; if (rig.activeFidget) rig.cancelFidget();
    rig.idleMs = idle; rig.nextFidgetAt = 0;
    g.anim.fidget._consider(rig, now + 1);
    const t = rig.activeFidget ? rig._fidget.type : null;
    if (rig.activeFidget) rig.cancelFidget();
    return t;
  };
  return {
    below: probe(2500, "tiny"), // < 4s idle -> nothing
    tier1: probe(5000, "tiny"), // 4-8s -> a tier-1 fidget
    tier1IsT1: T1.has(probe(5200, "grapple")),
    tinyT2: probe(9000, "tiny"),
    grapT2: probe(9000, "grapple"),
    heavyT2: probe(9000, "heavy"),
    phaseT2: probe(9000, "phase"),
  };
});
ok(esc.below === null, "below ~4s idle: NO fidget fires (tier gate holds)", `got=${esc.below}`);
ok(esc.tier1IsT1 && ["look", "twitch", "shuffle"].includes(esc.tier1), "~4s idle escalates to a TIER-1 fidget", `got=${esc.tier1}`);
ok(esc.tinyT2 === "hop" && esc.grapT2 === "twirl" && esc.heavyT2 === "tap" && esc.phaseT2 === "flicker",
  "~8s idle escalates to the PER-SKILL tier-2 waiting beat", `tiny=${esc.tinyT2} grapple=${esc.grapT2} heavy=${esc.heavyT2} phase=${esc.phaseT2}`);

// ============================================================================
// 5. PARTNER look-at fires ONLY when both idle within 6 tiles; re-arms on separation.
// ============================================================================
await setSched(false); // deterministic — no auto-fidget interference on the two rigs
const partner = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game");
  const a = g.players[0], b = g.players[1];
  const ra = g.anim.rigFor(a), rb = g.anim.rigFor(b);
  a.setSkill("grapple"); b.setSkill("tiny");
  // settle BOTH idle on solid ground (x 440 & 560 — inside the flat span, 2.5 tiles apart)
  const settleBoth = async () => {
    if (ra.activeFidget) ra.cancelFidget();
    if (rb.activeFidget) rb.cancelFidget();
    [a, b].forEach((p) => { p.invuln = 0; p.setVelocity(0, 0); ["left", "right", "jump"].forEach((k) => p.keys[k] && (p.keys[k].isDown = false)); });
    a.setPosition(440, a.y); b.setPosition(560, a.y);
    await new Promise((res) => { let n = 0; const iv = setInterval(() => { if ((a.grounded && b.grounded) || ++n > 70) { clearInterval(iv); res(); } }, 30); });
    await new Promise((r) => setTimeout(r, 300));
    ra.idleMs = 9000; rb.idleMs = 9000;
  };
  // NEAR (within 6 tiles) — must fire, both turn to face, one beeps
  await settleBoth();
  g.anim._partnerFired = false; g.anim._updatePartner();
  const near = { fired: g.anim._partnerFired, aType: ra._fidget.type, bType: rb._fidget.type, aFace: a.facing, bFace: b.facing };
  // SEPARATE — teleport B far (synchronous; the idle state is still valid this frame)
  b.setPosition(b.x + 420, b.y); g.anim._updatePartner();
  const rearmed = !g.anim._partnerFired;
  // FAR fresh — re-settle NEAR then teleport far, must NOT fire (> 6 tiles gate)
  await settleBoth();
  b.setPosition(b.x + 420, b.y);
  g.anim._partnerFired = false; g.anim._updatePartner();
  const far = g.anim._partnerFired;
  return { far, near, rearmed };
});
ok(!partner.far, "partner look-at does NOT fire when the buddies are > 6 tiles apart", `fired=${partner.far}`);
ok(partner.near.fired && partner.near.aType === "partner" && partner.near.bType === "partner",
  "partner look-at FIRES when both idle within 6 tiles (both play the turn-and-look)", JSON.stringify(partner.near));
ok(partner.near.aFace === 1 && partner.near.bFace === -1, "they turn to FACE each other (A faces right toward B, B faces left)", `aFace=${partner.near.aFace} bFace=${partner.near.bFace}`);
ok(partner.rearmed, "the one-shot RE-ARMS once they separate", `rearmed=${partner.rearmed}`);

// ============================================================================
// 7. fps A/B (Canvas) — 1-1 + 2-2, anim ON vs OFF, ~flat (interleaved windows).
// ============================================================================
const sampleFps = (ms = 1600) => page.evaluate((ms) => {
  const gme = window.__BB.game; const s = []; const t0 = performance.now();
  return new Promise((resolve) => {
    const iv = setInterval(() => {
      s.push(gme.loop.actualFps);
      if (performance.now() - t0 > ms) { clearInterval(iv); const v = s.filter((x) => x > 0); resolve(+(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)); }
    }, 200);
  });
}, ms);
const setAnim = (on) => page.evaluate((v) => { window.__BB.game.scene.getScene("Game").anim.enabled = v; }, on);
const avg = (a) => +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log("\n--- fps A/B (Canvas, interleaved) — idle robots so the A3 tiers are live ---");
const fpsAB = {};
for (const [name, idx] of [["1-1", 0], ["2-2", 4]]) {
  await startLevel(idx);
  // leave the robots IDLE (no input) so tier-0/1/2 motion is the thing being measured
  await sleep(1500);
  const ons = [], offs = [];
  for (let r = 0; r < 3; r++) {
    await setAnim(true); ons.push(await sampleFps(1600));
    await setAnim(false); offs.push(await sampleFps(1600));
  }
  await setAnim(true);
  const on = avg(ons), off = avg(offs), d = +(on - off).toFixed(1);
  fpsAB[name] = { on, off, delta: d, ons, offs };
  console.log(`${name}: anim-ON ${on} fps  |  anim-OFF ${off} fps  |  delta ${d} fps  (ON ${JSON.stringify(ons)} OFF ${JSON.stringify(offs)})`);
  ok(Math.abs(d) <= 2.5, `${name} A3 idle-anim cost is ~flat (|delta| <= 2.5 fps, incl. Canvas thermal noise)`, `delta=${d} fps`);
}

await cBrowser.close();
console.log(errors ? `\nCanvas tier snapped with ${errors} page error(s)` : "\nCanvas tier snapped clean (0 page errors)");
if (errors) fails.push(`${errors} Canvas page error(s)`);
console.log("\nfps A/B summary: " + JSON.stringify(fpsAB));
if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL A3 ASSERTIONS PASSED");
