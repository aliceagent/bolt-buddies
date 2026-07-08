// ANIM A9 — Living lab (device personality): acceptance probe + BURST-SHOT CONTACT SHEETS.
//
// A9 gives the level DEVICES personality. Every beat is a pure VISUAL overlay on the SACRED
// device LOGIC (crusher slam timing/hitbox, pedestal equip, checkpoint activation + respawn
// point, exit finishLevel trigger, lift movement/threshold/y-positions — ALL byte-identical):
//   CRUSHER    — servo QUIVER (rotation) across the wind-up + a relieved steam SIGH (pooled,
//                budgeted) after impact. Slam timing/hitbox (reads img.x/img.y) untouched.
//   PEDESTAL   — the skill-icon ORBIT speeds up + LEANS toward an approaching unskilled robot.
//                Cosmetic (icon container transform + orbit-tween timeScale); equip untouched.
//   CHECKPOINT — a wake-up stretch BLINK the first time a robot approaches (body-invariant scale).
//   EXIT DOOR  — the P5 marquee chase speeds up IMPATIENTLY while exactly one buddy waits (bumps
//                the cosmetic phase only; finishLevel reads zone containment, never the phase).
//   LIFT       — a suspension BOUNCE at each travel end (body-invariant platform scale; img.y fixed).
//
// This probe:
//   1. CONTACT SHEETS -> tools/shots/p2/: a9-crusher a9-pedestal a9-checkpoint a9-exit a9-lift.
//   2. CRITICAL byte-identical: crusher slam hitbox (img.x/img.y) under the quiver-rotation
//      extreme; lift resting-y (img.y + body.top) at both ends under the bounce-scale extreme;
//      checkpoint + exit positions under the wake/impatience animations. Physics/hitboxes SACRED.
//   3. Device STATE/TIMING identical anim ON vs OFF: crusher hold->slam->rest->rise cadence;
//      lift bottom->top travel + resting y; exit finishLevel trigger.
//   4. The steam SIGH is pooled + budgeted (in scene._budgetEmitters; clamped by fxBudget).
//   5. 0 page errors, Canvas tier.
//   6. fps A/B (Canvas) 1-1 + 1-2, anim ON vs OFF, within ~2 fps (interleaved).
//
//   node tools/snap_p2_a9.mjs
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

const DEV_LEVEL = 0;   // 1-1 — lift + pedestals + checkpoints + exit door
const CRUSH_LEVEL = 1; // 1-2 — the slam-cycle crushers

const startLevel = async (idx) => {
  await page.evaluate((i) => {
    const m = window.__BB.game.scene;
    m.stop("UI"); m.stop("Game"); m.stop("Title"); m.stop("Onboard"); m.stop("Hub");
    m.start("Game", { levelIndex: i });
  }, idx);
  await page.waitForFunction(() => {
    const g = window.__BB.game.scene.getScene("Game");
    return !!(g && g.def && g.players && g.players.length === 2 && g.anim && g.anim.device &&
      window.__BB.game.scene.isActive("Game"));
  }, null, { timeout: 8000 });
  await sleep(900);
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game");
    g._origUpdateCamera = g.updateCamera;
    g.updateCamera = () => {}; // freeze the camera so our framing sticks during a burst
  });
};
const active = (k) => page.evaluate((k) => window.__BB.game.scene.isActive(k), k);
const setAnim = (on) => page.evaluate((v) => { window.__BB.game.scene.getScene("Game").anim.enabled = v; }, on);
// park both players far away + un-hittable (calm device shots)
const playersAway = () => page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  g.players.forEach((p) => { p.invuln = 999999; p.setPosition(40, 40); p.setVelocity(0, 0); });
});

const frameAt = (x, y, z) => page.evaluate(([x, y, z]) => {
  const cam = window.__BB.game.scene.getScene("Game").cameras.main;
  cam.setZoom(z); cam.centerOn(x, y);
}, [x, y, z]);
const clip = { x: 640 - 150, y: 360 - 150, width: 300, height: 300 };
const grab = async () => (await page.screenshot({ clip })).toString("base64");
const strip = async (name, frames, label, w = 150, h = 150) => {
  const imgs = frames.map((f) => `<img src="data:image/png;base64,${f}" style="display:block;width:${w}px;height:${h}px;border-radius:6px">`).join("");
  const html = `<body style="margin:0"><div style="display:inline-flex;flex-direction:column;gap:6px;background:#0a0f1e;padding:10px;font-family:monospace">`
    + `<div style="color:#8fa3d9;font-size:13px">A9 · ${label}</div>`
    + `<div style="display:inline-flex;gap:6px">${imgs}</div></div></body>`;
  const p2 = await ctx.newPage();
  await p2.setContent(html);
  const el = await p2.$("div");
  await el.screenshot({ path: `${SHOTS}/${name}.png` });
  await p2.close();
  console.log(`contact sheet -> ${SHOTS}/${name}.png`);
};

// ============================================================================
// CONTACT SHEET: CRUSHER — quiver wind-up -> slam -> steam sigh.
// ============================================================================
await startLevel(CRUSH_LEVEL);
ok(await active("Game"), "1-2 Game scene active");
ok(!(await page.evaluate(() => window.__BB.game.renderer.type === 2)), "running on the Canvas tier (?canvas=1)");
ok(await page.evaluate(() => {
  const g = window.__BB.game.scene.getScene("Game");
  return !!(g.anim.device && typeof g.anim.device.update === "function" && g.anim.device.sigh &&
    g._budgetEmitters.indexOf(g.anim.device.sigh) >= 0);
}), "device controller installed: update hook + pooled steam SIGH registered in the fxBudget guard");
ok(await page.evaluate(() => (window.__BB.game.scene.getScene("Game").crushers || []).length >= 1),
  "1-2 has crushers");
{
  await setAnim(true);
  await playersAway();
  const cx = await page.evaluate(() => window.__BB.game.scene.getScene("Game").crushers[0].img.x);
  const f = [];
  // QUIVER: hold with a small timer so the wind-up ramp is live; step it down twice.
  for (const tmr of [260, 140]) {
    await page.evaluate((t) => { const c = window.__BB.game.scene.getScene("Game").crushers[0]; c.state = "hold"; c.timer = t; }, tmr);
    const cy = await page.evaluate(() => window.__BB.game.scene.getScene("Game").crushers[0].img.y);
    await frameAt(cx, cy + 20, 2.6);
    await sleep(50); f.push(await grab());
  }
  // SLAM: stage the head mid-fall (a real slam moves too fast to frame) then let it finish.
  await page.evaluate(() => { const c = window.__BB.game.scene.getScene("Game").crushers[0]; c.img.y = c.restY + (c.botY - c.restY) * 0.5; c.img.body.reset(c.img.x, c.img.y); c.state = "slam"; });
  {
    const cy = await page.evaluate(() => window.__BB.game.scene.getScene("Game").crushers[0].img.y);
    await frameAt(cx, cy + 20, 2.6); f.push(await grab());
  }
  // SIGH: wait for the slam->rest impact edge, capture the pooled steam puff at the base.
  await page.waitForFunction(() => window.__BB.game.scene.getScene("Game").crushers[0].state === "rest", null, { timeout: 3000 }).catch(() => {});
  const cyRest = await page.evaluate(() => window.__BB.game.scene.getScene("Game").crushers[0].img.y);
  await frameAt(cx, cyRest + 26, 2.6);
  await sleep(45); f.push(await grab());
  await sleep(120); f.push(await grab());
  await strip("a9-crusher", f, "CRUSHER — servo QUIVER wind-up (rotation, ramps) -> SLAM -> relieved steam SIGH (pooled, budgeted) after impact");
}

// QUIVER assertions: it ramps during the wind-up (rotation) and never moves the slam hitbox.
// Ramp is measured with the rig LIVE (holding the crusher in the wind-up window); the hitbox
// invariance is proved by holding the crusher STILL, rig OFF, and driving the rotation to an
// extreme by hand (isolating rotation from the crusher's own slam/rise motion — as in A8).
const quiver = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const cr = g.crushers[0]; const img = cr.img;
  g.players.forEach((p) => { p.invuln = 999999; p.setPosition(40, 40); });
  g.anim.enabled = true;
  const read = (tmr) => new Promise((res) => {
    let t = 0, peak = 0;
    const iv = setInterval(() => {
      cr.state = "hold"; cr.timer = tmr; img.y = cr.restY; img.body.reset(img.x, cr.restY); // pin in the wind-up window
      const r = Math.abs(img.rotation); if (r > peak) peak = r;
      if (++t > 14) { clearInterval(iv); res(+peak.toFixed(4)); }
    }, 16);
  });
  const early = await read(300); // early wind-up (small ramp)
  const late = await read(90);   // late wind-up (near slam — bigger ramp)
  // hitbox invariance: rig OFF, crusher frozen, drive rotation to the quiver extreme by hand.
  g.anim.enabled = false;
  cr.state = "hold"; cr.timer = 99999; img.y = cr.restY; img.body.reset(img.x, cr.restY); img.rotation = 0;
  const nf = () => new Promise((r) => requestAnimationFrame(() => r()));
  await nf();
  const x0 = +img.x.toFixed(3), y0 = +img.y.toFixed(3), top0 = +img.body.top.toFixed(3);
  img.rotation = 0.05; await nf();
  const drift = Math.max(Math.abs(img.x - x0), Math.abs(img.y - y0), Math.abs(img.body.top - top0));
  img.rotation = 0; g.anim.enabled = true;
  return { early, late, drift: +drift.toFixed(4) };
});
ok(quiver.late > quiver.early && quiver.late > 0.01,
  "CRUSHER quiver amplitude RAMPS across the wind-up (late window > early window)", `early=${quiver.early} late=${quiver.late} rad`);
ok(quiver.drift < 0.0001,
  "CRUSHER quiver never moves the slam hitbox (img.x/img.y + body.top byte-identical — rotation only)", `drift=${quiver.drift}px`);

// SIGH assertions: pooled + budgeted (routes through fxBudget; alive count grows on impact).
const sigh = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const cr = g.crushers[0]; const sighEm = g.anim.device.sigh;
  g.players.forEach((p) => { p.invuln = 999999; p.setPosition(40, 40); });
  const before = sighEm.getAliveParticleCount();
  // drive a REAL slam from the rest height so it falls over several frames (slam persists),
  // then hits the floor -> rest edge (fires the sigh). Reset to restY first.
  cr.img.y = cr.restY; cr.img.body.reset(cr.img.x, cr.restY); cr.state = "slam";
  let peak = 0, sawRest = false;
  await new Promise((res) => { let t = 0; const iv = setInterval(() => { const a = sighEm.getAliveParticleCount(); if (a > peak) peak = a; if (cr.state === "rest") { sawRest = true; if (++t > 8) { clearInterval(iv); res(); } } if (t > 240) { clearInterval(iv); res(); } }, 16); });
  return { before, peak, sawRest, budgeted: g._budgetEmitters.indexOf(sighEm) >= 0, cap: g.fxPalette.budget };
});
ok(sigh.peak > 0, "CRUSHER steam SIGH emits pooled particles on the slam->rest impact", `peakAlive=${sigh.peak}`);
ok(sigh.budgeted && sigh.peak <= sigh.cap, "CRUSHER SIGH is pooled + BUDGETED (in the fxBudget guard list; within the ~120 cap)", `peak=${sigh.peak} cap=${sigh.cap}`);

// CRUSHER STATE/TIMING identical anim ON vs OFF (the anim reads the slam cadence; never gates it).
const measureCrusher = async () => page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const cr = g.crushers[0];
  g.players.forEach((p) => { p.invuln = 999999; p.setPosition(40, 40); p.setVelocity(0, 0); });
  cr.state = "hold"; cr.timer = 200; cr.img.y = cr.restY;
  const marks = []; let prev = cr.state; const t0 = performance.now();
  await new Promise((res) => {
    const iv = setInterval(() => {
      if (cr.state !== prev) { marks.push({ to: cr.state, t: performance.now() - t0 }); prev = cr.state; }
      if (performance.now() - t0 > 4200 || marks.length >= 5) { clearInterval(iv); res(); }
    }, 8);
  });
  const restY = +cr.restY.toFixed(2), botY = +cr.botY.toFixed(2);
  return { seq: marks.map((m) => m.to).join(">"), restY, botY };
});
await startLevel(CRUSH_LEVEL); await setAnim(true); const crOn = await measureCrusher();
await startLevel(CRUSH_LEVEL); await setAnim(false); const crOff = await measureCrusher();
await setAnim(true);
const seqPrefixEq = (a, b) => { const A = a.split(">"), B = b.split(">"); const n = Math.min(A.length, B.length); return A.slice(0, n).join(">") === B.slice(0, n).join(">"); };
ok(seqPrefixEq(crOn.seq, crOff.seq) && /slam>rest>rise/.test(crOn.seq),
  "CRUSHER slam cadence (slam>rest>rise>hold...) identical anim ON vs OFF (common transition prefix)", `on=${crOn.seq} off=${crOff.seq}`);
ok(crOn.restY === crOff.restY && crOn.botY === crOff.botY,
  "CRUSHER rest/bottom Y positions byte-identical anim ON vs OFF", `on=${crOn.restY}/${crOn.botY} off=${crOff.restY}/${crOff.botY}`);

// ============================================================================
// CONTACT SHEET: PEDESTAL — orbit speed-up + lean toward an approaching unskilled robot.
// ============================================================================
await startLevel(DEV_LEVEL);
ok(await page.evaluate(() => (window.__BB.game.scene.getScene("Game").pedestals || []).length >= 1),
  "1-1 has pedestals");
{
  await setAnim(true);
  const p = await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game"); const ped = g.pedestals[0];
    g.players.forEach((pp, i) => { pp.invuln = 999999; if (i === 1) pp.setPosition(40, 40); });
    return { px: ped.x, py: ped.y };
  });
  await frameAt(p.px, p.py - 40, 3.1);
  const f = [];
  // robot far (calm orbit) -> approaching (orbit speeds up + leans toward it).
  await page.evaluate(([px, py]) => { const g = window.__BB.game.scene.getScene("Game"); const p = g.players[0]; p.skill = null; p.dead = false; p.invuln = 999999; p.setPosition(px + 300, py); p.setVelocity(0, 0); }, [p.px, p.py]);
  await sleep(300); f.push(await grab());
  for (const off of [180, 120, 92, 92]) {
    await page.evaluate(([px, py, o]) => { const g = window.__BB.game.scene.getScene("Game"); const p = g.players[0]; p.skill = null; p.setPosition(px + o, py); p.setVelocity(0, 0); }, [p.px, p.py, off]);
    await sleep(220); f.push(await grab());
  }
  await strip("a9-pedestal", f, "PEDESTAL — skill-icon ORBIT speeds up + LEANS toward an APPROACHING unskilled robot (orbit timeScale + icon lean; equip untouched)");
}
const ped = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const ped = g.pedestals[0];
  const dev = g.anim.device; const p = g.players[0]; const tw = dev._pedTween[0];
  g.players[1].setPosition(40, 40);
  const baseX = dev._pedBaseX[0];
  const settle = (sx) => new Promise((res) => { let t = 0; const iv = setInterval(() => { p.skill = null; p.dead = false; p.invuln = 999999; p.setPosition(ped.x + sx, ped.y); p.setVelocity(0, 0); if (++t > 26) { clearInterval(iv); res({ ts: tw ? +tw.timeScale.toFixed(2) : null, leanX: +(ped.icon.x - baseX).toFixed(2), pedX: +ped.x.toFixed(3), pedY: +ped.y.toFixed(3) }); } }, 16); });
  const far = await new Promise((res) => { let t = 0; const iv = setInterval(() => { p.skill = null; p.setPosition(ped.x + 400, ped.y); p.setVelocity(0, 0); if (++t > 26) { clearInterval(iv); res({ ts: tw ? +tw.timeScale.toFixed(2) : null }); } }, 16); });
  const right = await settle(100);   // approaching from the right
  const pedX0 = right.pedX, pedY0 = right.pedY;
  const left = await settle(-100);   // approaching from the left
  return { far, right, left, pedX0, pedY0, hasTween: !!tw };
});
ok(ped.hasTween && ped.right.ts > ped.far.ts + 0.3,
  "PEDESTAL orbit SPEEDS UP for an approaching unskilled robot (timeScale rises)", `far=${ped.far.ts} near=${ped.right.ts}`);
ok(ped.right.leanX > 1 && ped.left.leanX < -1,
  "PEDESTAL icon LEANS toward the robot (right -> +x, left -> -x)", `leanRight=${ped.right.leanX} leanLeft=${ped.left.leanX}px`);
ok(ped.right.pedX === ped.pedX0 && ped.right.pedY === ped.pedY0,
  "PEDESTAL equip anchor (ped.x/ped.y) byte-identical during the lean (cosmetic icon transform only)", `ped=${ped.pedX0},${ped.pedY0}`);

// ============================================================================
// CONTACT SHEET: CHECKPOINT — wake-up stretch blink on first approach.
// ============================================================================
await startLevel(DEV_LEVEL);
ok(await page.evaluate(() => (window.__BB.game.scene.getScene("Game").checkpoints || []).length >= 1),
  "1-1 has checkpoints");
{
  await setAnim(true);
  const c = await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game"); const cp = g.checkpoints[0];
    g.players.forEach((pp, i) => { pp.invuln = 999999; if (i === 1) pp.setPosition(40, 40); pp.setPosition(cp.x - 400, cp.y); });
    return { x: cp.x, y: cp.y };
  });
  await frameAt(c.x, c.y - 12, 3.6);
  const f = [];
  f.push(await grab()); // asleep (baseline)
  // walk a robot up to it -> wake-up stretch blink fires once.
  await page.evaluate(([x, y]) => { const g = window.__BB.game.scene.getScene("Game"); const p = g.players[0]; p.dead = false; p.invuln = 999999; p.setPosition(x - 60, y); p.setVelocity(0, 0); }, [c.x, c.y]);
  for (let i = 0; i < 4; i++) { await sleep(70); f.push(await grab()); }
  await strip("a9-checkpoint", f, "CHECKPOINT — wake-up stretch BLINK the first time a robot approaches (body-invariant scale; img.x/y + cp.x/y fixed)");
}
// FRESH level: the wake blink is a one-shot latch consumed by the contact sheet above.
await startLevel(DEV_LEVEL); await setAnim(true);
await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); const cp = g.checkpoints[0]; g.players.forEach((p, i) => { p.invuln = 999999; p.setPosition(cp.x - 400, cp.y - 400); }); });
await sleep(120);
const cpBlink = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const cp = g.checkpoints[0]; const img = cp.img;
  const x0 = +img.x.toFixed(3), y0 = +img.y.toFixed(3), cx0 = +cp.x.toFixed(3), cy0 = +cp.y.toFixed(3);
  const p = g.players[0]; p.dead = false; p.invuln = 999999;
  let peakSY = 1, drift = 0;
  await new Promise((res) => { let t = 0; const iv = setInterval(() => { p.setPosition(cp.x - 50, cp.y); p.setVelocity(0, 0); if (img.scaleY > peakSY) peakSY = img.scaleY; const d = Math.max(Math.abs(img.x - x0), Math.abs(img.y - y0)); if (d > drift) drift = d; if (++t > 40) { clearInterval(iv); res(); } }, 16); });
  const settled = +img.scaleY.toFixed(3);
  return { peakSY: +peakSY.toFixed(3), settled, drift: +drift.toFixed(4), cpMoved: +(Math.max(Math.abs(cp.x - cx0), Math.abs(cp.y - cy0))).toFixed(4) };
});
ok(cpBlink.peakSY > 1.05, "CHECKPOINT wake-blink STRETCHES the lamp on approach (scaleY peaks > 1)", `peakScaleY=${cpBlink.peakSY}`);
ok(Math.abs(cpBlink.settled - 1) < 0.001, "CHECKPOINT lamp settles back to scale 1 (no residue)", `settledScaleY=${cpBlink.settled}`);
ok(cpBlink.drift < 0.0001 && cpBlink.cpMoved < 0.0001,
  "CHECKPOINT position byte-identical during the blink (img.x/y + cp.x/y unmoved — origin-centred scale)", `imgDrift=${cpBlink.drift} cpDrift=${cpBlink.cpMoved}px`);

// ============================================================================
// CONTACT SHEET: EXIT DOOR — marquee impatient speed-up with exactly one buddy waiting.
// ============================================================================
await startLevel(DEV_LEVEL);
ok(await page.evaluate(() => !!window.__BB.game.scene.getScene("Game").exitDoor),
  "1-1 has an exit door");
{
  await setAnim(true);
  const z = await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game"); const d = g.exitDoor;
    d.needs = {}; d.open = true; // satisfy needs so the door STAYS open, and open the marquee
    const zc = d.zone; return { cx: zc.centerX, cy: zc.centerY };
  });
  await frameAt(z.cx, z.cy, 2.4);
  const f = [];
  // exactly ONE buddy in the exit zone -> impatient marquee; park the other far away.
  await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game"); const d = g.exitDoor;
    g.players[0].invuln = 999999; g.players[0].dead = false; g.players[0].setPosition(d.zone.centerX, d.zone.centerY); g.players[0].setVelocity(0, 0);
    g.players[1].invuln = 999999; g.players[1].setPosition(40, 40);
  });
  for (let i = 0; i < 5; i++) { await sleep(120); f.push(await grab()); }
  await strip("a9-exit", f, "EXIT DOOR — the P5 marquee chase speeds up IMPATIENTLY while exactly one buddy waits (bumps the cosmetic phase; finishLevel untouched)");
}
// impatient rate > base rate; the phase is cosmetic (finishLevel reads zone containment).
const exitRate = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const d = g.exitDoor; d.needs = {}; d.open = true;
  const N = d.marquee.dots.length;
  const measure = (oneWaiting) => new Promise((res) => {
    // set occupancy: one waiting => player0 in-zone, player1 away; none => both away.
    g.players[0].invuln = 999999; g.players[0].dead = false;
    g.players[1].invuln = 999999; g.players[1].setPosition(40, 40);
    if (oneWaiting) g.players[0].setPosition(d.zone.centerX, d.zone.centerY);
    else g.players[0].setPosition(40, 60);
    let t = 0, adv = 0, prev = d.marquee.phase;
    const iv = setInterval(() => {
      if (oneWaiting) g.players[0].setPosition(d.zone.centerX, d.zone.centerY);
      let dd = d.marquee.phase - prev; if (dd < 0) dd += N; adv += dd; prev = d.marquee.phase;
      if (++t > 40) { clearInterval(iv); res(+adv.toFixed(2)); }
    }, 16);
  });
  const idle = await measure(false);
  await new Promise((r) => setTimeout(r, 250)); // let urgency ease in
  const impatient = await measure(true);
  return { idle, impatient };
});
ok(exitRate.impatient > exitRate.idle * 1.25,
  "EXIT marquee speeds up IMPATIENTLY while exactly one buddy waits (phase advances faster)", `idle=${exitRate.idle} impatient=${exitRate.impatient}`);

// EXIT finishLevel trigger identical anim ON vs OFF (the anim only reads the occupancy).
const measureExit = async () => page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const d = g.exitDoor; d.needs = {}; d.open = true;
  let finished = false; const orig = g.finishLevel.bind(g);
  g.finishLevel = () => { finished = true; };
  // both buddies in the zone -> finishLevel must fire.
  g.players.forEach((p) => { p.dead = false; p.invuln = 999999; p.setPosition(d.zone.centerX, d.zone.centerY); p.setVelocity(0, 0); });
  await new Promise((res) => { let t = 0; const iv = setInterval(() => { g.players.forEach((p) => p.setPosition(d.zone.centerX, d.zone.centerY)); if (finished || ++t > 30) { clearInterval(iv); res(); } }, 16); });
  g.finishLevel = orig;
  return { finished, zone: { x: +d.zone.x.toFixed(2), y: +d.zone.y.toFixed(2), w: +d.zone.width.toFixed(2), h: +d.zone.height.toFixed(2) } };
});
await startLevel(DEV_LEVEL); await setAnim(true); const exOn = await measureExit();
await startLevel(DEV_LEVEL); await setAnim(false); const exOff = await measureExit();
await setAnim(true);
ok(exOn.finished && exOff.finished, "EXIT finishLevel fires when BOTH buddies are in the zone (anim ON and OFF)");
ok(JSON.stringify(exOn.zone) === JSON.stringify(exOff.zone),
  "EXIT zone geometry byte-identical anim ON vs OFF", `on=${JSON.stringify(exOn.zone)}`);

// ============================================================================
// CONTACT SHEET: LIFT — suspension bounce at a travel end.
// ============================================================================
await startLevel(DEV_LEVEL);
ok(await page.evaluate(() => (window.__BB.game.scene.getScene("Game").lifts || []).length >= 1),
  "1-1 has a lift");
{
  await setAnim(true);
  await playersAway();
  await sleep(200);
  // park the lift SETTLED at the top end (held), then fire a fresh bounce and burst-capture
  // the squash/stretch settle (the overlay carries it; the body-owning platform stays rigid).
  const lp = await page.evaluate(() => {
    const g = window.__BB.game.scene.getScene("Game"); const lf = g.lifts[0];
    lf.holdTimer = 999999; lf.label.setAlpha(0);
    lf.img.y = lf.topY; lf.img.body.reset(lf.img.x, lf.topY); lf.img.body.setVelocityY(0);
    return { x: lf.img.x, y: lf.img.y };
  });
  await frameAt(lp.x, lp.y, 3.4);
  await page.evaluate(() => { const dev = window.__BB.game.scene.getScene("Game").anim.device; dev._lfBounceT[0] = 460; dev._lfPrevMoving[0] = false; });
  const f = [];
  for (let i = 0; i < 5; i++) { f.push(await grab()); await sleep(70); }
  await strip("a9-lift", f, "LIFT — suspension BOUNCE settle at a travel end (pooled overlay carries the squash; resting img.y + arcade body.top fixed)");
}
const lift = await page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const lf = g.lifts[0]; const img = lf.img;
  const dev = g.anim.device; const ov = dev._lfOverlay[0];
  g.players.forEach((p) => { p.invuln = 999999; p.setPosition(40, 40); });
  const nf = () => new Promise((r) => requestAnimationFrame(() => r()));
  // PARK the lift at the bottom end, at rest (no travel) — isolate the bounce from the lift's
  // real vertical motion. Fire a live bounce; the flex plays on the pooled OVERLAY while the
  // body-owning platform's img.y + arcade body.top must stay byte-identical THROUGH the bounce.
  lf.holdTimer = 0; img.y = lf.botY; img.body.reset(img.x, lf.botY); img.body.setVelocityY(0); img.setScale(1, 1);
  g.anim.enabled = true; await nf();
  const yRest = +img.y.toFixed(3), topRest = +img.body.top.toFixed(3);
  dev._lfBounceT[0] = 460; dev._lfPrevMoving[0] = false;
  let ovMinSY = 1, ovMaxSX = 1, yDrift = 0, topDrift = 0, ovShown = false;
  await new Promise((res) => { let t = 0; const iv = setInterval(() => {
    img.body.setVelocityY(0);
    if (ov.visible) ovShown = true;
    if (ov.scaleY < ovMinSY) ovMinSY = ov.scaleY; if (ov.scaleX > ovMaxSX) ovMaxSX = ov.scaleX;
    const yd = Math.abs(img.y - yRest); if (yd > yDrift) yDrift = yd;
    const td = Math.abs(img.body.top - topRest); if (td > topDrift) topDrift = td;
    if (++t > 40) { clearInterval(iv); res(); }
  }, 16); });
  return { ovMinSY: +ovMinSY.toFixed(3), ovMaxSX: +ovMaxSX.toFixed(3), ovShown, settledVisible: ov.visible, platScaleY: +img.scaleY.toFixed(3), yDrift: +yDrift.toFixed(4), topDrift: +topDrift.toFixed(4) };
});
ok(lift.ovShown && lift.ovMinSY < 0.97 && lift.ovMaxSX > 1.02,
  "LIFT suspension bounce flexes the pooled OVERLAY (scaleY compresses + scaleX widens)", `ovMinSY=${lift.ovMinSY} ovMaxSX=${lift.ovMaxSX}`);
ok(!lift.settledVisible && Math.abs(lift.platScaleY - 1) < 0.001,
  "LIFT overlay hides + the body-owning platform stays at scale 1 after the bounce", `overlayVisible=${lift.settledVisible} platScaleY=${lift.platScaleY}`);
ok(lift.yDrift < 0.0001 && lift.topDrift < 0.0001,
  "LIFT resting-y byte-identical THROUGH the bounce (platform img.y + arcade body.top unmoved — the overlay carries the motion)", `imgYDrift=${lift.yDrift} bodyTopDrift=${lift.topDrift}px`);

// LIFT travel + resting-y identical anim ON vs OFF (the anim reads the lift; never moves it).
const measureLift = async () => page.evaluate(async () => {
  const g = window.__BB.game.scene.getScene("Game"); const lf = g.lifts[0]; const img = lf.img;
  g.players.forEach((p) => { p.invuln = 999999; p.setPosition(40, 40); p.setVelocity(0, 0); });
  // reset to bottom, drive up, time the travel + capture both resting ends.
  img.y = lf.botY; img.body.reset(img.x, lf.botY);
  const botRest = +img.y.toFixed(2);
  lf.holdTimer = 999999; lf.label.setAlpha(0);
  const t0 = performance.now();
  await new Promise((res) => { const iv = setInterval(() => { if (Math.abs(img.y - lf.topY) < 3 && Math.abs(img.body.velocity.y) < 1) { clearInterval(iv); res(); } if (performance.now() - t0 > 6000) { clearInterval(iv); res(); } }, 16); });
  const travelMs = +(performance.now() - t0).toFixed(0);
  const topRest = +img.y.toFixed(2);
  return { botRest, topRest, travelMs };
});
await startLevel(DEV_LEVEL); await setAnim(true); const lfOn = await measureLift();
await startLevel(DEV_LEVEL); await setAnim(false); const lfOff = await measureLift();
await setAnim(true);
ok(Math.abs(lfOn.botRest - lfOff.botRest) <= 3 && Math.abs(lfOn.topRest - lfOff.topRest) <= 3,
  "LIFT resting-y at BOTH ends identical anim ON vs OFF within the physics stop band (the anim never writes img.y)", `on=${lfOn.botRest}/${lfOn.topRest} off=${lfOff.botRest}/${lfOff.topRest}`);
ok(Math.abs(lfOn.travelMs - lfOff.travelMs) <= 80,
  "LIFT bottom->top travel time identical anim ON vs OFF (anim never gates the lift)", `on=${lfOn.travelMs}ms off=${lfOff.travelMs}ms`);

// ============================================================================
// fps A/B (Canvas) — 1-1 + 1-2, anim ON vs OFF, ~flat (interleaved).
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
const avg = (a) => +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log("\n--- fps A/B (Canvas, interleaved) ---");
const fpsAB = {};
for (const [name, idx] of [["1-1", DEV_LEVEL], ["1-2", CRUSH_LEVEL]]) {
  await startLevel(idx);
  await page.evaluate(() => { const g = window.__BB.game.scene.getScene("Game"); g.updateCamera = g._origUpdateCamera || g.updateCamera; });
  await sleep(1400);
  const ons = [], offs = [];
  for (let r = 0; r < 3; r++) {
    await setAnim(true); ons.push(await sampleFps(1600));
    await setAnim(false); offs.push(await sampleFps(1600));
  }
  await setAnim(true);
  const on = avg(ons), off = avg(offs), d = +(on - off).toFixed(1);
  fpsAB[name] = { on, off, delta: d, ons, offs };
  console.log(`${name}: anim-ON ${on} fps  |  anim-OFF ${off} fps  |  delta ${d} fps  (ON ${JSON.stringify(ons)} OFF ${JSON.stringify(offs)})`);
  ok(Math.abs(d) <= 2.5, `${name} A9 device-anim cost is ~flat (|delta| <= 2.5 fps, incl. Canvas thermal noise)`, `delta=${d} fps`);
}

await cBrowser.close();
console.log(errors ? `\nCanvas tier snapped with ${errors} page error(s)` : "\nCanvas tier snapped clean (0 page errors)");
if (errors) fails.push(`${errors} Canvas page error(s)`);
console.log("\nfps A/B summary: " + JSON.stringify(fpsAB));
if (fails.length) { console.log(`\n${fails.length} ASSERTION(S) FAILED:`); fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("\nALL A9 ASSERTIONS PASSED");
