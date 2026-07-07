// U12 — Naive-player confusion sweep + spawn overlap audit.
//
// Phase 1 (sweep): for each level (1-1..2-3 + tutorial), a fresh-profile "naive
// player" is brought to first contact with every gate/mechanic/hazard type the
// level contains, and within 5s of that contact we assert VISIBLE teaching or
// feedback using only what a player could see: a KOBI blip (UIScene blip bar), a
// U1/U2 coach or icon bubble, a U5 lamp, the HUD key chip, lift/plate weight
// pips, a timed-door drain ring, a roller "!" alert, glyph clusters, item cards.
//
// Staging discipline (mirrors snap_u2 + the beat kit): teleports (body.reset)
// only STAGE the approach; the contact itself is driven by real Playwright
// keyboard input, and every assertion is a PASSIVE read of public display state
// (textures, .visible, text) — nothing display-side is mutated. Per the harness
// rule, no evaluate runs within ~1s of repositioning players. Where a probe
// waits longer than 5s, the extra window only covers the HAZARD's own patrol
// travel toward the staged robot — the asserted feedback still lands within 5s
// of actual first contact.
//
// Phase 2 (overlap audit): at each level's spawn, with the item cards up, the
// gate bump bubble fired (real push input) and a KOBI blip on the bar, dump the
// bounding rects of: item cards, coach bubbles, the blip bar, the HUD plates and
// U8's stats-row region — and assert no pairwise overlap between VISIBLE pairs.
// (The U7 controller toast vs intro card overlap is GFX P9's — out of scope.)
//
//   node tools/ux_sweep.mjs               # full sweep + audit
//   node tools/ux_sweep.mjs 1-1 2-3       # subset of levels
//   node tools/ux_sweep.mjs --audit-only  # overlap audit only
//   node tools/ux_sweep.mjs --sweep-only  # confusion sweep only
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";

const URL = process.env.BB_URL || "http://localhost:5173/?canvas=1";
const SHOTS = "tools/shots/p2";
mkdirSync(SHOTS, { recursive: true });
const T = 48;

// level id -> registry index (tutorial is APPENDED last: index 12)
const LEVEL_INDEX = { "1-1": 0, "1-2": 1, "1-3": 2, "2-1": 3, "2-2": 4, "2-3": 5, tut: 12 };
const ALL = ["1-1", "1-2", "1-3", "2-1", "2-2", "2-3", "tut"];
const argv = process.argv.slice(2);
const AUDIT_ONLY = argv.includes("--audit-only");
const SWEEP_ONLY = argv.includes("--sweep-only");
const picked = argv.filter((a) => LEVEL_INDEX[a] !== undefined);
const levels = picked.length ? picked : ALL;

// Playwright key codes per player index (P1 = A/D/W/S/E, P2 = arrows/L).
const KEYS = [
  { left: "KeyA", right: "KeyD", jump: "KeyW", down: "KeyS", act: "KeyE" },
  { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp", down: "ArrowDown", act: "KeyL" },
];

const browser = await chromium.launch({ executablePath: process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on("pageerror", (e) => { pageErrors.push(e.message); console.log("PAGE ERROR:", e.message); });

const sleep = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);

// full reload per level: fresh profile (localStorage cleared) AND fresh session
// latches (throw-hint once-per-session, U9 line pools)
async function startLevel(idx) {
  await page.goto(URL, { waitUntil: "networkidle" });
  await sleep(1200);
  await page.evaluate((i) => {
    localStorage.clear();
    const m = window.__BB.game.scene;
    ["UI", "Game", "Title", "Hub"].forEach((k) => m.stop(k));
    m.start("Game", { levelIndex: i });
  }, idx);
  await sleep(2100); // scene warm-up; intro banner on its way out
}

// A dead player's pending respawn callback would yank a freshly-teleported
// corpse back to its checkpoint (0.9s + 1.5s invuln) — wait out the respawn
// before staging so probes always place a LIVE, vulnerable robot.
async function ensureAlive(i) {
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    const ok = await page.evaluate((k) => {
      const p = window.__BB.scene.players[k];
      return !p.dead && p.invuln <= 0;
    }, i);
    if (ok) return;
    await sleep(150);
  }
}

// STAGING teleport (tile coords). Sleeps >1s after the reposition so no
// evaluate lands inside the forbidden window.
async function tp(i, tx, ty) {
  await ensureAlive(i);
  await page.evaluate(([i, x, y]) => {
    const s = window.__BB.scene, p = s.players[i];
    if (p.carriedBy) s.detachCarry(p.carriedBy, p, false);
    if (p.carrying) s.detachCarry(p, p.carrying, false);
    p.clearStates();
    p.body.reset(x, y);
    p.setVelocity(0, 0);
  }, [i, tx * T + 24, ty * T + 24 - 8]);
  await sleep(1100);
}

async function hold(key, ms) { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); }
const tap = (key) => hold(key, 90);

// poll `fn` (an evaluate) every `step` ms until truthy or `timeout`; returns
// the truthy value or null.
async function waitFor(fn, timeout = 5000, step = 120) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await ev(fn);
    if (v) return v;
    await sleep(step);
  }
  return null;
}

// --- passive display-state reads --------------------------------------------
const readBubbles = () => ev(() => window.__BB.scene.coach.bubbles.map((b) => ({
  active: b.active, key: b.key,
  texts: b.texts.filter((t) => t.visible).map((t) => t.text),
})));
const readBlips = () => ev(() => {
  const ui = window.__BB.game.scene.getScene("UI");
  return {
    visible: ui.blipBar.visible, text: ui.blipText.text,
    active: ui.blipActive ? ui.blipActive.text : "",
    queued: ui.blipQueue.map((q) => q.text),
  };
});
async function blipSeen(substr, timeout = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const b = await readBlips();
    const all = [b.text, b.active, ...b.queued].join(" | ");
    if (all.includes(substr)) return `blip bar: "${substr}" ${b.visible ? "(bar visible)" : "(queued)"}`;
    await sleep(150);
  }
  return null;
}
async function bubbleSeen(key, timeout = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const bs = await readBubbles();
    const hit = bs.find((b) => b.active && b.key === key);
    if (hit) return `bubble[${key}]: ${hit.texts.join(" ")}`;
    await sleep(120);
  }
  return null;
}

// --- input-driven motions ------------------------------------------------------
// closed-loop walk: hold left/right until |x - targetX| < 22 (or timeout)
async function walkTo(i, targetX, timeout = 6000) {
  const t0 = Date.now();
  let key = null;
  while (Date.now() - t0 < timeout) {
    const x = await ev((i) => window.__BB.scene.players[i].x, i);
    const dx = targetX - x;
    if (Math.abs(dx) < 22) break;
    const want = dx > 0 ? KEYS[i].right : KEYS[i].left;
    if (key !== want) {
      if (key) await page.keyboard.up(key);
      key = want;
      await page.keyboard.down(key);
    }
    await sleep(90);
  }
  if (key) await page.keyboard.up(key);
}

// walk both robots to their pedestals and equip with the ACTION key (input-only)
async function equipBoth() {
  for (const i of [0, 1]) {
    const pedX = await ev((i) => window.__BB.scene.pedestals[i].x, i);
    await walkTo(i, pedX);
    await tap(KEYS[i].act);
    await sleep(250);
  }
  return ev(() => window.__BB.scene.players.map((p) => p.skill));
}

// stage a player in front of a door and PUSH into it with a real held key
async function bumpDoor(i, doorId, side = -1, pushMs = 1700) {
  const d = await ev((id) => {
    const dd = window.__BB.scene.doors.find((x) => x.id === id);
    return { cx: dd.zone.centerX, y: dd.zone.y, h: dd.zone.height };
  }, doorId);
  await ensureAlive(i);
  await page.evaluate(([i, x, y]) => {
    const s = window.__BB.scene, p = s.players[i];
    p.clearStates();
    p.body.reset(x, y);
    p.setVelocity(0, 0);
  }, [i, d.cx + side * 70, d.y + d.h - 26]);
  await sleep(1100);
  // freshness guard: a bump bubble from the PREVIOUS probe lives up to 3s —
  // wait until the pool is clear so this probe can't read a stale bubble
  await waitFor(() => (window.__BB.scene.coach.bubbles.some((b) => b.active && b.key === "bump") ? null : true), 4000, 150);
  const dir = side < 0 ? KEYS[i].right : KEYS[i].left;
  await page.keyboard.down(dir);
  const seen = await bubbleSeen("bump", pushMs + 3400);
  await page.keyboard.up(dir);
  return seen;
}

// --- result collection ----------------------------------------------------------
const results = [];
let shotCount = 0;
async function probe(level, mechanic, fn) {
  let status = "MISS", evidence = "";
  try {
    const r = await fn();
    if (r) { status = "PASS"; evidence = typeof r === "string" ? r : JSON.stringify(r); }
    else evidence = "no visible teaching/feedback within 5s of first contact";
  } catch (e) {
    evidence = `probe error: ${e.message}`;
  }
  results.push({ level, mechanic, status, evidence });
  console.log(`  ${status}  [${level}] ${mechanic} — ${evidence}`);
  return status === "PASS";
}
async function shot(name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  shotCount++;
  console.log(`        shot -> ${SHOTS}/${name}.png`);
}

// --- shared probes ---------------------------------------------------------------
async function probeSpawnTeaching(id) {
  await probe(id, "spawn: item cards + action hints", async () => {
    const r = await ev(() => {
      const s = window.__BB.scene;
      return {
        cards: s.pedestals.filter((pd) => !pd.taken && pd.card && pd.card.visible).length,
        hints: s.actionHints.filter((h) => h && h.visible).length,
        glyphs: s.children.list.filter((o) => o.type === "Container" && o.list &&
          o.list.some((c) => c.texture && c.texture.key === "keycap")).length,
      };
    });
    if (id === "tut") return r.glyphs >= 2 && r.hints === 2 ? `key glyph clusters=${r.glyphs}, action hints=${r.hints}` : null;
    return r.cards === 2 && r.hints === 2 ? `item cards=${r.cards}, action hints=${r.hints}` : null;
  });
}

async function probeGateBump(id) {
  const ok = await probe(id, "gate (needs: skills) bump", () => bumpDoor(0, "gate"));
  if (ok) await shot(`u12-${id}-gate-bump`);
}

async function probeCheckpoint(id, tx, ty) {
  await probe(id, "checkpoint activation", async () => {
    await tp(0, tx, ty);
    return waitFor(() => {
      const cp = window.__BB.scene.checkpoints.find((c) => c.active);
      return cp && cp.img.texture.key === "checkpoint_on" && cp.cone.visible
        ? "green lamp texture + light cone on touch" : null;
    }, 4000);
  });
}

async function probeBugGlow(id) {
  await probe(id, "scuttlebug approach warning", async () => {
    // Stage the robot ~160px AHEAD of the first bug's travel so the bug walks
    // toward it: outside kill range at arrival (no blind-window death), inside
    // glow range (200px) within a second or two. The glow ramp itself is the
    // asserted at-contact feedback; re-stage once if the bug flipped direction
    // in the same instant we read it.
    for (let attempt = 0; attempt < 2; attempt++) {
      const b = await ev(() => {
        let out = null;
        window.__BB.scene.bugs.children.each((bug) => {
          if (!out && bug.active) out = { x: bug.x, y: bug.y, vx: bug.body.velocity.x };
        });
        return out;
      });
      if (!b) return null;
      const dir = b.vx >= 0 ? 1 : -1;
      await ensureAlive(0);
      await page.evaluate(([x, y]) => {
        const s = window.__BB.scene, p = s.players[0];
        p.clearStates(); p.body.reset(x, y); p.setVelocity(0, 0);
      }, [b.x + dir * 160, b.y - 20]);
      await sleep(1100);
      const seen = await waitFor(() => {
        const s = window.__BB.scene;
        let best = 0;
        s.bugs.children.each((bug) => { if (bug.active && bug.glow) best = Math.max(best, bug.glow.alpha); });
        return best > 0.15 ? `eye-glow ramps up near player (alpha ${best.toFixed(2)})` : null;
      }, 8000, 80);
      if (seen) return seen;
    }
    return null;
  });
}

async function probeRoller(id, idx, i, tx, ty, window_ = 5000) {
  await probe(id, "roller vision beam + alert", async () => {
    const beam = await ev((k) => {
      const r = window.__BB.scene.rollers[k];
      return r && r.beamRect ? r.beamRect.width : 0;
    }, idx);
    await tp(i, tx, ty);
    const alert = await waitFor(() => {
      const s = window.__BB.scene;
      const r = s.rollers.find((r) => r.state === "alert" || r.excl.visible);
      return r ? "spotted: red strobe + '!' popup before zap" : null;
    }, window_, 90);
    return alert ? `beam wedge drawn (${Math.round(beam)}px) + ${alert}` : null;
  });
}

async function probeHandhold(id, i, tx, ty, dirKey) {
  await probe(id, "shimmer wall (solo non-phase) hand-hold hint", async () => {
    await tp(i, tx, ty);
    await page.keyboard.down(dirKey);
    const seen = await bubbleSeen("handhold", 4500);
    await page.keyboard.up(dirKey);
    return seen;
  });
}

async function probeDuct(id, i, tx, ty, dirKey) {
  const ok = await probe(id, "vent pinch (wrong robot) hint", async () => {
    await tp(i, tx, ty);
    await page.keyboard.down(dirKey);
    const seen = await bubbleSeen("duct", 4500);
    await page.keyboard.up(dirKey);
    return seen;
  });
  if (ok) await shot(`u12-${id}-duct-hint`);
}

// --- per-level probe scripts -----------------------------------------------------
const SCRIPTS = {
  "1-1": async () => {
    await probeSpawnTeaching("1-1");
    await probeGateBump("1-1");
    await probe("1-1", "pedestal equip (input)", async () => {
      const skills = await equipBoth();
      const hud = await ev(() => {
        const ui = window.__BB.game.scene.getScene("UI");
        return ui.pInfo.map((x) => x.icon.visible);
      });
      return skills[0] === "grapple" && skills[1] === "heavy" && hud.every(Boolean)
        ? `skills=${skills.join("/")} + HUD icons lit + cards shrink to tags` : null;
    });
    await probe("1-1", "U1 rope-chord hint", async () => {
      await tp(0, 21, 13); await tp(1, 24, 13);
      return bubbleSeen("rope", 6000);
    });
    await probe("1-1", "U1 first-pickup throw hint", async () => {
      // (31,32): clear of 1-1's bug patrols (24-29 / 34-37) AND of lv1 (x21) so
      // P2's ACTION press can only be a pickup
      await tp(0, 31, 13); await tp(1, 32, 13);
      // heavy picks up its buddy — re-tap if a frame stall ate the press
      for (let k = 0; k < 3; k++) {
        await tap(KEYS[1].act);
        await sleep(250);
        if (await ev(() => !!window.__BB.scene.players[1].carrying)) break;
      }
      const seen = await bubbleSeen("throw", 4000);
      await tap(KEYS[1].act); // throw to clean up
      return seen;
    });
    await probe("1-1", "lever -> bridge feedback", async () => {
      await tp(0, 21, 13);
      await tap(KEYS[0].act);
      return waitFor(() => {
        const s = window.__BB.scene;
        const lv = s.levers.find((l) => l.id === "lv1");
        const br = s.bridges.find((b) => b.id === "br1");
        return lv.on && br.open && br.tiles[0].alpha > 0.9
          ? "handle flips + ghost bridge tiles turn solid" : null;
      }, 4000);
    });
    await probe("1-1", "U1 up-zip hint", async () => {
      // stand on the now-open bridge under anchor (17,9) — clear LOS over the pit
      await tp(0, 16, 13); await tp(1, 20, 13);
      return bubbleSeen("upzip", 6000);
    });
    await probe("1-1", "key door bump (no key)", () => bumpDoor(0, "door1", 1));
    await probe("1-1", "key pickup -> HUD key chip", async () => {
      await tp(0, 31, 16);
      await page.keyboard.down(KEYS[0].right);
      const seen = await waitFor(() => {
        const ui = window.__BB.game.scene.getScene("UI");
        return ui.keyChip.visible && ui.keyText.visible ? `key chip "${ui.keyText.text}" on the HUD` : null;
      }, 4000);
      await page.keyboard.up(KEYS[0].right);
      return seen;
    });
    await probe("1-1", "U4 pit trigger blip", async () => {
      await tp(0, 50, 13);
      return blipSeen("pit is NOT a feature");
    });
    await probe("1-1", "lift weight pips", async () => {
      await tp(0, 47, 13);
      return waitFor(() => {
        const lf = window.__BB.scene.lifts[0];
        const on = lf.pips.filter((p) => p.texture.key === "pip_on").length;
        const off = lf.pips.filter((p) => p.texture.key === "pip_off").length;
        return on >= 1 && off >= 1 ? `weight pips read ${on} of ${on + off} — needs more weight` : null;
      }, 4000);
    });
    const ok = await probe("1-1", "exit bump (needs: opened door1)", () => bumpDoor(1, "exit", 1));
    if (ok) await shot("u12-1-1-exit-bump");
    await probeBugGlow("1-1");
    await probeCheckpoint("1-1", 23, 13);
  },

  "1-2": async () => {
    await probeSpawnTeaching("1-2");
    await probeGateBump("1-2");
    await equipBoth();
    await probe("1-2", "crusher cycle telegraph", async () => {
      await tp(0, 11, 13);
      const t0 = Date.now();
      let lo = Infinity, hi = -Infinity;
      while (Date.now() - t0 < 5000) {
        const y = await ev(() => window.__BB.scene.crushers[0].img.y);
        lo = Math.min(lo, y); hi = Math.max(hi, y);
        if (hi - lo > 80) break;
        await sleep(150);
      }
      return hi - lo > 80 ? `crusher demonstrates its slam cycle (${Math.round(hi - lo)}px travel) in view` : null;
    });
    await probe("1-2", "plate w/ too little weight -> pips", async () => {
      await tp(0, 15, 13); // grapple (weight 1) on threshold-2 plate
      return waitFor(() => {
        const pl = window.__BB.scene.plates.find((p) => p.id === "plA");
        return pl.pipCont.visible ? "weight pips flash: 1 lit of 2" : null;
      }, 4500);
    });
    await probe("1-2", "plate door bump", () => bumpDoor(0, "b1", -1));
    await probe("1-2", "latch door bump (lever+plate)", () => bumpDoor(1, "d2", -1));
    const ok = await probe("1-2", "exit bump (needs: opened d2)", async () => {
      // the exit at x62 sits right of d2 (x60) — stage between them, push right
      return bumpDoor(1, "exit", -1);
    });
    if (ok) await shot("u12-1-2-exit-bump");
    await probeBugGlow("1-2");
    await probeCheckpoint("1-2", 27, 13);
  },

  "1-3": async () => {
    await probeSpawnTeaching("1-3");
    await probeGateBump("1-3");
    await equipBoth();
    await probe("1-3", "crane telegraph + YANK prompt", async () => {
      await tp(0, 11, 13); await tp(1, 12, 13);
      return waitFor(() => {
        const s = window.__BB.scene, c = s.crane;
        if (!c) return null;
        if (c.hpText.text) return `crane rest shows "${c.hpText.text}" + plate glow`;
        if (c.state === "telegraph" || c.state === "slam") return "hazard-stripe slam telegraph column drawn";
        return null;
      }, 7000, 120);
    });
    const ok = await probe("1-3", "tower door bump (needs: crane)", async () => {
      // stage LEFT of the door on the crane arena's right lip, outside slam range
      return bumpDoor(1, "towerDoor", -1);
    });
    if (ok) await shot("u12-1-3-towerdoor-bump");
    const ok2 = await probe("1-3", "exit bump (needs: opened towerDoor)", async () => {
      await tp(0, 51, 2); // tower top floor
      return bumpDoor(0, "exit", -1);
    });
    if (ok2) await shot("u12-1-3-exit-bump");
    await probeBugGlow("1-3");
    await probeCheckpoint("1-3", 10, 13);
  },

  "2-1": async () => {
    await probeSpawnTeaching("2-1");
    await probeGateBump("2-1");
    await equipBoth(); // P1 = phase, P2 = tiny
    await probeDuct("2-1", 0, 13, 13, KEYS[0].right); // phase pushes the tunnel pinch
    await probe("2-1", "tunnel door bump (lever in other lane)", () => bumpDoor(1, "dT1", -1));
    await probe("2-1", "slab door bump (lever in other lane)", async () => {
      // phase walks the slab top (its lane); the driving lever is in the tunnel
      return bumpDoor(0, "dP1", -1);
    });
    await probe("2-1", "U5 yard-entrance trigger blip", async () => {
      await tp(1, 45, 13);
      return blipSeen("TEAM exercise");
    });
    await probeHandhold("2-1", 1, 48, 13, KEYS[1].right); // solo tiny vs yard pillar
    await probe("2-1", "exit bump (lever inside pillar)", () => bumpDoor(1, "exit", -1));
    // x45 is OUTSIDE roller 1's patrol span (47-52) but inside its 140px beam
    await probeRoller("2-1", 0, 0, 45, 13, 12000);
    await probeCheckpoint("2-1", 46, 13);
  },

  "2-2": async () => {
    await probeSpawnTeaching("2-2");
    await probeGateBump("2-2");
    await equipBoth(); // P1 = phase, P2 = tiny
    await probeHandhold("2-2", 1, 10, 13, KEYS[1].right); // solo tiny vs escort wall
    await probe("2-2", "fan updraft column visible", async () => {
      await tp(1, 13, 13);
      return waitFor(() => {
        const f = window.__BB.scene.fans[0];
        return f && f.col && f.col.alpha > 0.03 ? "green updraft column + puff particles at the fan" : null;
      }, 3000);
    });
    await probe("2-2", "timed deck jets cycle visibly", async () => {
      await tp(1, 16, 3);
      const t0 = Date.now();
      let onSeen = false, offSeen = false;
      while (Date.now() - t0 < 5200 && !(onSeen && offSeen)) {
        const a = await ev(() => window.__BB.scene.jets.slice(0, 3).map((j) => j.active));
        if (a.some(Boolean)) onSeen = true;
        if (a.some((x) => !x)) offSeen = true;
        await sleep(200);
      }
      return onSeen && offSeen ? "steam plumes pulse on/off on their timers (dodgeable rhythm)" : null;
    });
    await probe("2-2", "corridor jets + U5 vent lamp red", async () => {
      return ev(() => {
        const s = window.__BB.scene;
        const constant = s.jets.filter((j) => j.disabledBy === "lvV1");
        const lamp = s.ventLamps[0];
        return constant.every((j) => j.active) && lamp.lamp.texture.key === "lamp_red"
          ? "corridor steam constant + red lamp at Phase's waiting spot" : null;
      });
    });
    await probe("2-2", "valve -> all-clear moment", async () => {
      await tp(1, 36, 3);
      await tap(KEYS[1].act);
      const lamp = await waitFor(() => {
        const s = window.__BB.scene;
        return s.ventLamps[0].lamp.texture.key === "lamp_green" ? "lamp flips green" : null;
      }, 4000);
      const blip = await blipSeen("Steam's off", 4000);
      return lamp && blip ? `${lamp} + ${blip}` : null;
    });
    await probe("2-2", "plate (threshold met) activates", async () => {
      await tp(0, 50, 13);
      return waitFor(() => {
        const pl = window.__BB.scene.plates.find((p) => p.id === "pl1");
        return pl.active ? "plate depresses + stays lit under one robot" : null;
      }, 4000);
    });
    await probe("2-2", "exit bump (lever+plate)", () => bumpDoor(1, "exit", -1));
    // x39 is OUTSIDE the roller's patrol span (40-47) but inside its 130px beam;
    // the window covers a full ~11.9s patrol cycle before first eye contact
    await probeRoller("2-2", 0, 0, 39, 13, 15000);
    await probeCheckpoint("2-2", 17, 13);
  },

  "2-3": async () => {
    await probeSpawnTeaching("2-3");
    await probeGateBump("2-3");
    await equipBoth(); // P1 = phase, P2 = tiny
    await probeHandhold("2-3", 1, 7, 13, KEYS[1].right); // solo tiny vs stair shimmer
    await probeDuct("2-3", 0, 14, 8, KEYS[0].right); // phase pushes a top-lane pinch
    await probe("2-3", "timed door drain ring (door + lever)", async () => {
      await tp(0, 23, 13);
      await tap(KEYS[0].act); // pull lvB1 -> tDoorA opens on its 6.5s timer
      return waitFor(() => {
        const d = window.__BB.scene.doors.find((x) => x.id === "tDoorA");
        return d.open && d._ring && d._ring.visible
          ? "draining countdown ring on the door lamp AND the driving lever" : null;
      }, 4000);
    });
    await probe("2-3", "re-armed timed door bump -> TOO SLOW", async () => {
      // wait out the 6.5s window, then bump the re-closed door
      await waitFor(() => !window.__BB.scene.doors.find((x) => x.id === "tDoorA").open, 8000, 300);
      return bumpDoor(1, "tDoorA", -1);
    });
    await probe("2-3", "timed door bump (lever in other lane)", () => bumpDoor(0, "tDoorB", -1));
    await probe("2-3", "warden front shove feedback", async () => {
      await tp(0, 23, 13); // right of w1 (x21, facing +x)
      await page.keyboard.down(KEYS[0].left);
      const seen = await waitFor(() => {
        const w = window.__BB.scene.wardens.find((x) => x.id === "w1");
        return w.shoveCd > 0 ? "firm shove + impact star (front is a no-go)" : null;
      }, 4000, 90);
      await page.keyboard.up(KEYS[0].left);
      return seen;
    });
    const ok = await probe("2-3", "exit bump (needs: opened br1)", () => bumpDoor(1, "exit", 1));
    if (ok) await shot("u12-2-3-exit-bump");
    // stage just OUTSIDE the patrol span (x27; range is 18-26, beam 120px) so the
    // alert can't fire-and-zap inside the post-teleport blind second; the window
    // covers the roller's full ~13.5s patrol cycle before first eye contact
    await probeRoller("2-3", 0, 0, 27, 8, 16000);
    await probeCheckpoint("2-3", 47, 13);
  },

  tut: async () => {
    await probeSpawnTeaching("tut");
    await probe("tut", "station trigger blip (hazards)", async () => {
      await tp(0, 14, 13);
      return blipSeen("sparky floor");
    });
    await probe("tut", "station trigger blip (pedestals)", async () => {
      await tp(0, 22, 13);
      return blipSeen("pedestals hold your gadgets");
    });
    await probeGateBump("tut");
    await probe("tut", "plate w/ too little weight -> pips", async () => {
      await tp(0, 48, 13);
      return waitFor(() => {
        const pl = window.__BB.scene.plates.find((p) => p.id === "tpl");
        return pl.pipCont.visible ? "weight pips flash: 1 lit of 2" : null;
      }, 4500);
    });
    await probe("tut", "plate door bump", () => bumpDoor(0, "td1", -1));
    await probeCheckpoint("tut", 13, 13);
    await probe("tut", "exit waiting-for-buddy bubble", async () => {
      await tp(0, 54, 12);
      return waitFor(() => {
        const s = window.__BB.scene;
        return s.exitLabel && s.exitLabel.visible ? "buddy icon + pulsing arrow over the EXIT sign" : null;
      }, 4000);
    });
  },
};

// --- Phase 2: overlap audit -------------------------------------------------------
const overlaps = [];
async function auditLevel(id) {
  const idx = LEVEL_INDEX[id];
  await startLevel(idx);
  // organic KOBI blip: the start blip fires as the intro banner leaves; make
  // sure the bar is up before the snapshot
  let bar = await waitFor(() => window.__BB.game.scene.getScene("UI").blipBar.visible || null, 6000, 200);
  if (!bar) {
    await ev(() => window.__BB.game.events.emit("bb:blip", "KOBI: overlap audit blip. Ignore me. IGNORE ME."));
    bar = await waitFor(() => window.__BB.game.scene.getScene("UI").blipBar.visible || null, 3000, 150);
  }
  // representative coach bubble: the gate bump bubble, fired by a real push,
  // while both item cards are still up
  await bumpDoor(0, "gate");
  const rects = await ev(() => {
    const s = window.__BB.scene;
    const cam = s.cameras.main, wv = cam.worldView, z = cam.zoom || 1;
    const W = s.scale.width, H = s.scale.height;
    const w2s = (cx, cy, hw, hh) => ({ x: (cx - hw - wv.x) * z, y: (cy - hh - wv.y) * z, w: hw * 2 * z, h: hh * 2 * z });
    const out = [];
    s.pedestals.forEach((pd, i) => {
      if (!pd.taken && pd.card) out.push({ name: `itemCard${i}`, vis: pd.card.visible, ...w2s(pd.card.x, pd.card.y, 118, 45) });
    });
    s.coach.bubbles.forEach((b, i) => {
      if (b.active) out.push({ name: `coachBubble${i}`, vis: b.c.visible, ...w2s(b.c.x, b.c.y, b.halfW || 95, b.halfH) });
    });
    const ui = window.__BB.game.scene.getScene("UI");
    out.push({ name: "kobiBlipBar", vis: ui.blipBar.visible, x: W / 2 - 462, y: H - 94, w: 924, h: 70 });
    out.push({ name: "hudPanelP1", vis: true, x: 14, y: 10, w: 270, h: 48 });
    out.push({ name: "hudPanelP2", vis: true, x: W - 284, y: 10, w: 270, h: 48 });
    const tw = ui.plateText.width;
    out.push({ name: "hudLevelPlate", vis: true, x: W / 2 - tw / 2 - 16, y: 9, w: tw + 32, h: 31 });
    out.push({ name: "hudCoreTray", vis: true, x: W / 2 - 46, y: 50, w: 92, h: 26 });
    // U8 stats row region (lives on the clear overlay -> hidden at spawn)
    out.push({ name: "u8StatsRow", vis: ui.overlay.visible, x: W / 2 - 200, y: H / 2 + 28, w: 400, h: 24 });
    return out;
  });
  console.log(`  [${id}] rects:`);
  for (const r of rects) {
    console.log(`    ${r.vis ? "shown " : "hidden"} ${r.name.padEnd(14)} x=${r.x.toFixed(0)} y=${r.y.toFixed(0)} w=${r.w.toFixed(0)} h=${r.h.toFixed(0)}`);
  }
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  let bad = 0;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (!a.vis || !b.vis) continue;
      if (a.name.startsWith("hud") && b.name.startsWith("hud")) continue; // HUD internal layout, not audited pairs
      if (hit(a, b)) {
        bad++;
        overlaps.push({ level: id, a: a.name, b: b.name });
        console.log(`  OVERLAP [${id}] ${a.name} × ${b.name}`);
        await shot(`u12-overlap-${id}`);
      }
    }
  }
  if (!bad) console.log(`  [${id}] overlap audit clean (${rects.filter((r) => r.vis).length} visible elements)`);
}

// --- run ---------------------------------------------------------------------------
if (!AUDIT_ONLY) {
  console.log("=== U12 confusion sweep ===");
  for (const id of levels) {
    console.log(`\n--- ${id} (index ${LEVEL_INDEX[id]}) ---`);
    await startLevel(LEVEL_INDEX[id]);
    await SCRIPTS[id]();
  }
}
if (!SWEEP_ONLY) {
  console.log("\n=== U12 spawn overlap audit ===");
  for (const id of levels) {
    console.log(`\n--- ${id} spawn ---`);
    await auditLevel(id);
  }
}

await browser.close();

const misses = results.filter((r) => r.status === "MISS");
console.log(`\n=== U12 sweep summary ===`);
console.log(`${results.length - misses.length}/${results.length} checks PASS, ${misses.length} MISS, ${overlaps.length} overlaps, ${pageErrors.length} page errors, ${shotCount} shots`);
for (const m of misses) console.log(`MISS  [${m.level}] ${m.mechanic} — ${m.evidence}`);
for (const o of overlaps) console.log(`OVERLAP  [${o.level}] ${o.a} × ${o.b}`);
writeFileSync("tools/ux_sweep_report.json", JSON.stringify({
  when: new Date().toISOString(), levels, results, overlaps, pageErrors,
}, null, 2));
console.log("report -> tools/ux_sweep_report.json");
process.exit(misses.length || overlaps.length || pageErrors.length ? 1 : 0);
