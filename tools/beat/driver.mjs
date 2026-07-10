// Bolt Buddies — Beat Kit driver.
//
// INPUT-ONLY contract: this driver may READ `window.__BB.scene` state to decide
// timing and targets, but it may only ACT through real Playwright keyboard
// events — the same keys a human presses. The ONLY evaluate() calls it makes are
// pure reads (a state snapshot + read-only helpers) plus scene orchestration
// (starting a level, clearing localStorage). No body.reset, no setSkill, no
// state mutation of any kind during a run.
//
// Everything is closed-loop: primitives read the live scene ~30 Hz and steer
// with held keys, so they self-heal against belt drift, deaths/respawns, and
// camera zoom (we work purely in world coordinates).

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

export const TILE = 48;
export const FAIL_DIR = "tools/beat/failures";

// Playwright key codes per player index. P1 = A/D/W/E, P2 = arrows/L.
export const KEYS = [
  { left: "KeyA", right: "KeyD", jump: "KeyW", act: "KeyE", down: "KeyS" },
  { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp", act: "KeyL", down: "ArrowDown" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();

// Thrown by primitives on unrecoverable failure; the runner turns it into a
// FAIL + failure artifact.
export class BeatError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = "BeatError";
    this.extra = extra;
  }
}

export class Driver {
  constructor(page) {
    this.page = page;
    this.roles = { G: 0, H: 1 }; // set per run by the runner
    this.held = new Set(); // keys currently physically held down
    this.stepLog = []; // executed step / primitive trace (for artifacts)
    this.deaths = 0; // deaths this run (all steps)
    this.stepDeaths = 0; // deaths in the current step (budget = 3)
    this.deathBudget = 3;
  }

  // --- role plumbing ---------------------------------------------------------
  setRoles(roles) {
    this.roles = { ...roles };
  }
  idx(role) {
    const i = this.roles[role];
    if (i !== 0 && i !== 1) throw new BeatError(`unknown role ${role}`);
    return i;
  }
  keysFor(role) {
    return KEYS[this.idx(role)];
  }

  log(entry) {
    const line = typeof entry === "string" ? entry : JSON.stringify(entry);
    this.stepLog.push(`[${new Date().toISOString().slice(11, 23)}] ${line}`);
    if (this.stepLog.length > 4000) this.stepLog.shift();
  }

  // --- raw input -------------------------------------------------------------
  async down(key) {
    if (this.held.has(key)) return;
    this.held.add(key);
    await this.page.keyboard.down(key);
  }
  async up(key) {
    if (!this.held.has(key)) return;
    this.held.delete(key);
    await this.page.keyboard.up(key);
  }
  // Phaser's Key.onUp clears JustDown, so an instant down+up between frames is
  // invisible — every tap must hold ~70ms.
  async tap(key, ms = 80) {
    await this.page.keyboard.down(key);
    await sleep(ms);
    await this.page.keyboard.up(key);
  }
  async releaseAll() {
    for (const key of [...this.held]) await this.up(key);
  }

  // --- reads (pure) ----------------------------------------------------------
  async state() {
    return this.page.evaluate(() => {
      const s = window.__BB.scene;
      if (!s) return null;
      const T = 48;
      const pj = (p) => ({
        x: p.x, y: p.y, tx: p.x / T, ty: p.y / T,
        dead: p.dead, skill: p.skill, grounded: p.grounded,
        invuln: p.invuln, facing: p.facing,
        zip: p.zip ? { arrived: !!p.zip.arrived, x: p.zip.x, y: p.zip.y } : null,
        reeled: !!p.reeled, carrying: !!p.carrying, carriedBy: !!p.carriedBy,
        // W3W4 L31: magnet/bubble state (0/false on W1-W2 levels — pure reads)
        bubbleT: p.bubbleT || 0, bubbleCd: p.bubbleCd || 0,
        magCling: !!p.magCling, magCrate: !!p.magCrate,
        inWater: !!p.inWater, airMs: p.airMs || 0,
        blocked: {
          left: p.body.blocked.left, right: p.body.blocked.right,
          down: p.body.blocked.down, up: p.body.blocked.up,
        },
      });
      return {
        id: s.def.id,
        complete: s.complete,
        keysHeld: s.keysHeld,
        coresGot: s.coresGot ? [...s.coresGot] : [],
        craneDefeated: !!s.craneDefeated,
        bugs: s.bugs ? s.bugs.countActive(true) : 0,
        players: s.players.map(pj),
        doors: s.doors.map((d) => ({ id: d.id, open: d.open })),
        levers: s.levers.map((l) => ({ id: l.id, on: l.on })),
        bridges: s.bridges.map((b) => ({ id: b.id, open: b.open })),
        lifts: s.lifts.map((l) => ({ y: l.img.y, topY: l.topY, botY: l.botY })),
        rollers: s.rollers.map((r) => ({
          x: r.img.x, tx: r.img.x / T, dir: r.dir, state: r.state,
          beam: r.beamRect ? { x: r.beamRect.x, w: r.beamRect.width } : null,
        })),
        wardens: s.wardens.map((w) => ({ id: w.id, defeated: w.defeated, x: w.img.x, tx: w.img.x / T })),
        jets: s.jets.map((j) => ({ tx: j.x / T, active: !!j.active, period: j.period, on: j.on })),
        crane: s.crane
          ? {
              state: s.crane.state, x: s.crane.body.x, y: s.crane.body.y,
              podsStomped: s.crane.podsStomped,
              plates: s.crane.plates.filter((p) => p.attached).map((p) => ({ x: p.img.x, y: p.img.y })),
            }
          : null,
        pods: s.pods ? s.pods.filter((p) => p.active).map((p) => ({ x: p.x, y: p.y })) : [],
        plates: s.plates.map((p) => ({ id: p.id, active: p.active })),
        // W3W4 L31: world-3 entity reads (empty arrays on W1-W2 levels)
        crates: (s.crates || []).map((c) => ({ x: c.img.x, y: c.img.y, tx: c.img.x / T, held: !!c.heldBy })),
        jellies: (s.jellies || []).map((j) => ({ x: j.img.x, y: j.img.y, tx: j.img.x / T, state: j.state })),
        sockets: (s.sockets || []).map((k) => ({ id: k.id, filled: k.filled })),
        chompers: (s.chompers || []).map((c) => ({ x: c.img.x, tx: c.img.x / T, state: c.state, defanged: c.defanged })),
        // W3W4 L33: scrap-storm reads (empty/null everywhere but 3-3 — pure reads)
        fusecores: (s.fuseCores || []).map((c) => ({
          x: c.img.x, y: c.img.y, tx: c.img.x / T, ty: c.img.y / T,
          state: c.state, carrier: c.carrier ? c.carrier.idx : -1,
        })),
        fusesockets: (s.fuseSockets || []).map((k) => ({ id: k.id, filled: k.filled })),
        shield: s.stormShield
          ? {
              state: s.stormShield.state, heldBy: s.stormShield.heldBy ? s.stormShield.heldBy.idx : -1,
              cd: Math.max(0, s.stormShield.cd | 0), holdMs: Math.max(0, s.stormShield.holdMs | 0),
              x: s.stormShield.img.x, y: s.stormShield.img.y, tx: s.stormShield.img.x / T,
            }
          : null,
        lanes: (s.stormLanes || []).map((l) => ({
          active: l.active, row: l.row, x1: l.x1 / T, x2: l.x2 / T, dir: l.dir, speed: l.speed,
          chunks: l.chunks.map((c) => +(c.x / T).toFixed(2)),
        })),
      };
    });
  }

  async player(role) {
    const st = await this.state();
    return st.players[this.idx(role)];
  }

  // Read-only: does this grapple role currently have `kind` as its best target?
  async grappleTarget(role) {
    const i = this.idx(role);
    return this.page.evaluate((i) => {
      const s = window.__BB.scene;
      const t = s.findGrappleTarget(s.players[i]);
      return t ? { kind: t.kind, x: t.x, y: t.y } : null;
    }, i);
  }

  // --- death recovery --------------------------------------------------------
  // Wait for a dead player to respawn. Counts against the per-step death budget.
  async awaitRespawn(role, timeout = 4000) {
    const i = this.idx(role);
    this.deaths++;
    this.stepDeaths++;
    this.log(`death: role ${role} (idx ${i}) — respawning (step deaths ${this.stepDeaths})`);
    if (this.stepDeaths > this.deathBudget) {
      throw new BeatError(`role ${role} exceeded death budget (${this.deathBudget}) in step`);
    }
    await this.releaseAll();
    const end = now() + timeout;
    while (now() < end) {
      const st = await this.state();
      if (!st.players[i].dead) {
        await sleep(250); // let invuln/settle begin
        return;
      }
      await sleep(60);
    }
    throw new BeatError(`role ${role} did not respawn within ${timeout}ms`);
  }

  // --- waitFor ---------------------------------------------------------------
  async waitFor(pred, timeout = 8000, desc = "condition") {
    const end = now() + timeout;
    let last = null;
    while (now() < end) {
      last = await this.state();
      try {
        if (pred(last)) return last;
      } catch { /* predicate touched missing field; keep polling */ }
      await sleep(50);
    }
    throw new BeatError(`waitFor timed out: ${desc}`, { state: last });
  }

  // --- walkTo (closed-loop, auto-hop) ----------------------------------------
  // Hold the role's left/right key toward tileX. If body.blocked in the travel
  // direction persists > ~150ms, tap jump (clears steps up to ~2 tiles). Tolerant
  // of deaths (re-approaches after respawn), belt drift, and moving platforms.
  async walkTo(role, tileX, opts = {}) {
    const i = this.idx(role);
    const targetX = tileX * TILE + 24;
    const tol = opts.tol ?? 14;
    const timeout = opts.timeout ?? 8000;
    // full-height hop by default so a heavy body clears 2-tile ledges/steps (a
    // short hop is cut by variable-jump-height and only clears ~half a tile).
    const hopHold = opts.hopHold ?? 240;
    const k = this.keysFor(role);
    this.log(`walkTo ${role} -> tile ${tileX} (x=${targetX})`);
    const end = now() + timeout;
    let blockedSince = 0;
    let lastHopAt = 0;
    let lastX = null;
    let stallSince = 0;
    let hopN = 0;
    // Two mount techniques, alternated: (0) jump while holding the direction —
    // fine for lips and lone 2-tile ledges; (1) standing jump, then drift in at
    // the apex — the only way up staircases of 2-tile risers with 1-tile treads
    // (holding the direction pins the jumper into the NEXT riser mid-air).
    const hop = async (dirKey) => {
      if (hopN++ % 2 === 0) {
        await this.tap(k.jump, hopHold);
      } else {
        await this.up(dirKey);
        await this.down(k.jump);
        await sleep(150);
        await this.down(dirKey);
        await sleep(Math.max(0, hopHold - 150));
        await this.up(k.jump);
      }
    };
    while (now() < end) {
      const st = await this.state();
      if (st.complete) { // level finished mid-walk (physics paused); nothing more to do
        await this.up(k.left); await this.up(k.right);
        return true;
      }
      const p = st.players[i];
      if (p.dead) {
        await this.awaitRespawn(role);
        blockedSince = 0;
        lastX = null;
        continue;
      }
      const dx = targetX - p.x;
      if (Math.abs(dx) <= tol) {
        await this.up(k.left);
        await this.up(k.right);
        this.log(`walkTo ${role} arrived tile ${(p.x / TILE).toFixed(2)}`);
        await sleep(60);
        return true;
      }
      const dir = dx > 0 ? "right" : "left";
      const dirKey = dir === "right" ? k.right : k.left;
      const offKey = dir === "right" ? k.left : k.right;
      await this.up(offKey);
      await this.down(dirKey);

      // auto-hop when pressed against a wall/step in the travel direction
      const pressing = dir === "right" ? p.blocked.right : p.blocked.left;
      const t = now();
      if (pressing) {
        if (!blockedSince) blockedSince = t;
        if (t - blockedSince > 150 && t - lastHopAt > 500) {
          await hop(dirKey);
          lastHopAt = t;
          blockedSince = 0;
        }
      } else {
        blockedSince = 0;
      }

      // generic stall detection (stuck but not "blocked", e.g. lip) -> hop
      if (lastX !== null && Math.abs(p.x - lastX) < 1.2) {
        if (!stallSince) stallSince = t;
        else if (t - stallSince > 400 && t - lastHopAt > 500) {
          await hop(dirKey);
          lastHopAt = t;
          stallSince = 0;
        }
      } else {
        stallSince = 0;
      }
      lastX = p.x;
      await sleep(33);
    }
    await this.up(k.left);
    await this.up(k.right);
    throw new BeatError(`walkTo ${role} -> tile ${tileX} timed out`, {
      state: await this.state(),
    });
  }

  // --- runJump (deliberate gap jump) -----------------------------------------
  // opts.runup (tiles): start this far back and hold the direction across, so the
  // jumper reaches full ground speed before the edge (heavy needs the run-up to
  // clear ~3-tile gaps like the lift->terrace hop).
  async runJump(role, fromTileX, dir, opts = {}) {
    const i = this.idx(role);
    const k = this.keysFor(role);
    const landTile = opts.landTile ?? (dir === "right" ? fromTileX + 3 : fromTileX - 3);
    const retries = opts.retries ?? 3;
    const runup = opts.runup ?? 0;
    // Hold jump long enough to get the FULL arc — a short hold triggers the
    // variable-jump-height cut and falls short of wide gaps (e.g. lift->terrace).
    const jumpHold = opts.jumpHold ?? 300;
    this.log(`runJump ${role} from ${fromTileX} ${dir} -> land ${landTile} (runup ${runup}, hold ${jumpHold})`);
    const dirSign = dir === "right" ? 1 : -1;
    for (let attempt = 0; attempt < retries; attempt++) {
      const dirKey = dir === "right" ? k.right : k.left;
      const offKey = dir === "right" ? k.left : k.right;
      if (runup > 0) {
        await this.walkTo(role, fromTileX - dirSign * runup, { tol: 16, timeout: 6000 });
        await this.up(offKey);
        await this.down(dirKey);
        // hold the direction and jump when we cross the takeoff point at speed
        // (opts.edgeX lets a caller delay the takeoff to the very edge of a short
        // platform to squeeze out more run-up speed, e.g. the lift).
        const edgeX = opts.edgeX ?? fromTileX * TILE + 24;
        const runEnd = now() + 2500;
        while (now() < runEnd) {
          const p = (await this.state()).players[i];
          if ((dirSign > 0 && p.x >= edgeX) || (dirSign < 0 && p.x <= edgeX)) break;
          await sleep(20);
        }
        await this.tap(k.jump, jumpHold);
      } else {
        await this.walkTo(role, fromTileX, { tol: 20, timeout: 6000 });
        await this.up(offKey);
        await this.down(dirKey);
        await sleep(90);
        await this.tap(k.jump, jumpHold); // commit the jump while running
      }
      // hold direction until we land (grounded) or time out
      const end = now() + 2600;
      let landed = false;
      while (now() < end) {
        const p = (await this.state()).players[i];
        if (p.dead) break;
        if (p.grounded && p.y < 15 * TILE) {
          landed = true;
          break;
        }
        await sleep(33);
      }
      await this.up(dirKey);
      const p = (await this.state()).players[i];
      if (p.dead) {
        await this.awaitRespawn(role);
        continue;
      }
      const okDir = dir === "right" ? p.x >= landTile * TILE - 10 : p.x <= (landTile + 1) * TILE + 10;
      if (landed && okDir) {
        this.log(`runJump ${role} landed tile ${(p.x / TILE).toFixed(2)}`);
        return true;
      }
      this.log(`runJump ${role} attempt ${attempt + 1} short (tile ${(p.x / TILE).toFixed(2)}), retry`);
    }
    throw new BeatError(`runJump ${role} from ${fromTileX} ${dir} failed`, {
      state: await this.state(),
    });
  }

  // --- mountLedge ------------------------------------------------------------
  // Run-up jump onto a 2-tile-high ledge. A standing hop jams a tall body against
  // the ledge face, so we back off to `fromTile`, build speed, and jump with a
  // full arc. If opts.stayTile is given, release the direction once the jumper is
  // over that tile so it settles ON the ledge (instead of running past it).
  async mountLedge(role, fromTile, dir, opts = {}) {
    const i = this.idx(role);
    const k = this.keysFor(role);
    const dirKey = dir === "right" ? k.right : k.left;
    const offKey = dir === "right" ? k.left : k.right;
    const targetTy = opts.ledgeTy ?? 12.6; // must end above this row to count as mounted
    const stayTile = opts.stayTile;
    const runupMs = opts.runupMs ?? 240;
    const retries = opts.retries ?? 4;
    this.log(`mountLedge ${role} from ${fromTile} ${dir}${stayTile != null ? ` stay ${stayTile}` : ""}`);
    for (let attempt = 0; attempt < retries; attempt++) {
      await this.walkTo(role, fromTile, { tol: 12, timeout: 5000 }).catch(() => {});
      await this.up(offKey);
      await this.down(dirKey);
      await sleep(runupMs); // build run-up speed
      await this.tap(k.jump, 320);
      // hold the direction into the ledge; optionally release over stayTile
      const end = now() + 1600;
      while (now() < end) {
        const p = (await this.state()).players[i];
        if (stayTile != null) {
          const past = dir === "right" ? p.x >= stayTile * TILE + 24 : p.x <= stayTile * TILE + 24;
          if (past && p.ty < targetTy) { await this.up(dirKey); break; }
        }
        if (p.grounded && p.ty < targetTy) break; // landed on the ledge
        await sleep(30);
      }
      await sleep(350);
      await this.up(dirKey);
      const p = (await this.state()).players[i];
      if (p.ty < targetTy) {
        this.log(`mountLedge ${role} on ledge tile ${(p.x / TILE).toFixed(2)} ty ${p.ty.toFixed(2)}`);
        return true;
      }
      this.log(`mountLedge ${role} attempt ${attempt + 1} missed (ty ${p.ty.toFixed(2)}), retry`);
    }
    throw new BeatError(`mountLedge ${role} from ${fromTile} ${dir} failed`);
  }

  // --- act -------------------------------------------------------------------
  async act(role) {
    await this.tap(this.keysFor(role).act);
    this.log(`act ${role}`);
    await sleep(120);
  }

  // --- face ------------------------------------------------------------------
  // Set a role's facing by briefly holding a direction key (~50ms = a few frames
  // — enough for Player.update to flip `facing` — without meaningful movement).
  // Partner-targeting skills only fire at the buddy when the grappler AIMS at it,
  // so routes call this toward the buddy before a reel `act`.
  async face(role, dir) {
    const k = this.keysFor(role);
    const key = dir === "right" ? k.right : k.left;
    await this.up(dir === "right" ? k.left : k.right);
    await this.tap(key, 50);
    this.log(`face ${role} ${dir}`);
    await sleep(80);
  }

  // Face the grappler toward its partner based on live x positions.
  async faceBuddy(role, partnerRole) {
    const st = await this.state();
    const p = st.players[this.idx(role)];
    const q = st.players[this.idx(partnerRole)];
    await this.face(role, q.x < p.x ? "left" : "right");
  }

  // --- equip -----------------------------------------------------------------
  async equip(role, pedestalTileX) {
    this.log(`equip ${role} @ pedestal ${pedestalTileX}`);
    await this.walkTo(role, pedestalTileX, { tol: 12, timeout: 6000 });
    const i = this.idx(role);
    for (let tries = 0; tries < 4; tries++) {
      await this.act(role);
      await sleep(150);
      const p = (await this.state()).players[i];
      if (p.skill) {
        this.log(`equip ${role} -> ${p.skill}`);
        return p.skill;
      }
      // nudge onto the pedestal and retry
      await this.walkTo(role, pedestalTileX, { tol: 10, timeout: 3000 });
    }
    throw new BeatError(`equip ${role} @ ${pedestalTileX} did not set a skill`);
  }

  // --- grapple: zip to an anchor and release ---------------------------------
  // Presses act; the scene's findGrappleTarget picks the anchor. Waits until the
  // hang arrives, optionally chains to further anchors, then releases with a tap.
  async zipTo(role, opts = {}) {
    const i = this.idx(role);
    const timeout = opts.timeout ?? 3500;
    const k = this.keysFor(role);
    if (opts.up) await this.down(k.jump); // UP+ACTION: zip to the anchor above
    await this.act(role); // fire grapple
    if (opts.up) await this.up(k.jump);
    await this.waitFor(
      (s) => s.players[i].zip && s.players[i].zip.arrived,
      timeout,
      `${role} zip arrived`
    );
    this.log(`zipTo ${role} hanging @ ${JSON.stringify((await this.player(role)).zip)}`);
  }

  // Release from a hang: "jump" (straight up then fall), "left", or "right".
  async zipRelease(role, dir) {
    const k = this.keysFor(role);
    const key = dir === "left" ? k.left : dir === "right" ? k.right : k.jump;
    await this.tap(key, 90);
    this.log(`zipRelease ${role} ${dir}`);
    await sleep(200);
  }

  // Grounded grapple reels the partner across a gap: just act (target = partner).
  async reelPartner(role, opts = {}) {
    const i = this.idx(role);
    const partnerRole = opts.partnerRole;
    const retries = opts.retries ?? 3;
    this.log(`reelPartner ${role}`);
    const k = this.keysFor(role);
    for (let attempt = 0; attempt < retries; attempt++) {
      // an airborne chord zips the grappler TO the buddy — the grappler must be
      // TRULY settled before the chord fires (a grounded DOWN+ACTION can only
      // reel or no-op; it can never zip). The old guard swallowed its timeout
      // and fired anyway; and a zip left hanging by a flaky release keeps
      // `grounded` false forever, so pop that first.
      let settled = false;
      for (let g = 0; g < 3 && !settled; g++) {
        const cur = (await this.state()).players[i];
        if (cur.zip) {
          this.log(`reelPartner ${role}: still on a zip line — releasing it`);
          await this.tap(k.jump, 90);
        }
        await this.waitFor((s) => s.players[i].grounded && !s.players[i].zip, 2500, `${role} grounded for reel`).catch(() => {});
        const a = (await this.state()).players[i];
        await sleep(130);
        const b = (await this.state()).players[i];
        settled = a.grounded && b.grounded && !b.zip && Math.hypot(b.x - a.x, b.y - a.y) < 3;
      }
      if (partnerRole) {
        const pj = this.idx(partnerRole);
        await this.waitFor((s) => s.players[pj].grounded, 2500, `${partnerRole} settled for reel`).catch(() => {});
      }
      // FL-001 rev2: DOWN+ACTION is the buddy-rope chord. Hold DOWN a beat
      // longer — a race where act lands before DOWN registers turns the press
      // into a plain zip and strands the grappler.
      const before = (await this.state()).players[i];
      await this.down(k.down);
      await sleep(150);
      await this.act(role);
      await this.up(k.down);
      const after = (await this.state()).players[i];
      if (Math.hypot(after.x - before.x, after.y - before.y) > 40 || after.zip) {
        if (attempt === retries - 1) {
          throw new BeatError(`reelPartner ${role}: grappler moved/zipped instead of reeling (chord race?)`);
        }
        // recoverable: let the stray zip finish, drop off it, settle, and walk
        // back to the reel stance before the next attempt
        this.log(`reelPartner ${role}: chord mis-fired (moved/zipped); recovering to stance`);
        await this.waitFor((s) => !s.players[i].zip || s.players[i].zip.arrived, 3500, "stray zip over").catch(() => {});
        if ((await this.state()).players[i].zip) await this.tap(k.jump, 90);
        await this.waitFor((s) => s.players[i].grounded && !s.players[i].zip, 4000, `${role} back on ground`).catch(() => {});
        await this.walkTo(role, before.tx, { tol: 8, timeout: 6000 }).catch(() => {});
        continue;
      }
      if (!partnerRole) {
        await sleep(200);
        return;
      }
      const j = this.idx(partnerRole);
      const took = await this.waitFor((s) => s.players[j].reeled, 700, "reel took")
        .then(() => true)
        .catch(() => false);
      if (took || attempt === retries - 1) {
        // wait until the partner is done being reeled (clears near arrival)
        const end = now() + 3500;
        while (now() < end) {
          const st = await this.state();
          if (!st.players[j].reeled) break;
          await sleep(60);
        }
        await sleep(250);
        return;
      }
      this.log(`reelPartner ${role} attempt ${attempt + 1} didn't take; retrying`);
      await sleep(300);
    }
  }

  // --- world 2 primitives ------------------------------------------------------

  // Walk two robots to targetTile together, keeping them inside hand-holding
  // range (< 78px) so the shimmer-wall escort collider lets the buddy through.
  // The buddy always presses toward the target (it just stalls at a wall when
  // alone); the escorter throttles when it gets more than a hand-hold ahead.
  async escortTogether(escorterRole, buddyRole, targetTile, opts = {}) {
    const ei = this.idx(escorterRole);
    const bi = this.idx(buddyRole);
    const ke = this.keysFor(escorterRole);
    const kb = this.keysFor(buddyRole);
    const targetX = targetTile * TILE + 24;
    const timeout = opts.timeout ?? 25000;
    const tol = opts.tol ?? 16;
    const gap = opts.gap ?? 56;
    this.log(`escortTogether ${escorterRole}+${buddyRole} -> tile ${targetTile}`);
    const end = now() + timeout;
    const rel = async () => {
      for (const k of [ke.left, ke.right, kb.left, kb.right]) await this.up(k);
    };
    while (now() < end) {
      const st = await this.state();
      if (st.complete) { // level finished mid-escort (physics pauses) — success
        await rel();
        return true;
      }
      const E = st.players[ei];
      const B = st.players[bi];
      if (E.dead || B.dead) {
        await rel();
        await this.awaitRespawn(E.dead ? escorterRole : buddyRole);
        continue;
      }
      const eLeft = targetX - E.x;
      const bLeft = targetX - B.x;
      if (Math.abs(eLeft) <= tol && Math.abs(bLeft) <= tol) {
        await rel();
        await sleep(100);
        return true;
      }
      const dirKey = (k, dx) => (dx > 0 ? k.right : k.left);
      const offKey = (k, dx) => (dx > 0 ? k.left : k.right);
      if (Math.abs(bLeft) > tol) {
        await this.up(offKey(kb, bLeft));
        await this.down(dirKey(kb, bLeft));
      } else {
        await this.up(kb.left);
        await this.up(kb.right);
      }
      // escorter holds up if it's a hand-hold ahead of the buddy toward the target
      const ahead = Math.abs(E.x - B.x) > gap && Math.abs(eLeft) < Math.abs(bLeft);
      if (Math.abs(eLeft) > tol && !ahead) {
        await this.up(offKey(ke, eLeft));
        await this.down(dirKey(ke, eLeft));
      } else {
        await this.up(ke.left);
        await this.up(ke.right);
      }
      await sleep(45);
    }
    await rel();
    throw new BeatError(`escortTogether ${escorterRole}+${buddyRole}: timeout to tile ${targetTile}`);
  }

  // Wait until roller #idx can't catch a dash entered from `fromTile`'s side:
  // patrolling (not alert) with its beam facing AWAY from that side.
  async waitRollerSafe(idx, fromTile, opts = {}) {
    const fromX = fromTile * TILE + 24;
    this.log(`waitRollerSafe roller ${idx} (approach from tile ${fromTile})`);
    await this.waitFor((s) => {
      const r = s.rollers[idx];
      return !!r && r.state === "patrol" && Math.sign(fromX - r.x) !== r.dir;
    }, opts.timeout ?? 15000, `roller ${idx} safe`);
  }

  // Cross a timed steam jet: wait for a FRESH off-window (an active->inactive
  // transition), then hurry to `toTile` (which must be past the jet).
  async dashPastJet(role, jetIdx, toTile, opts = {}) {
    this.log(`dashPastJet ${role} jet ${jetIdx} -> tile ${toTile}`);
    await this.waitFor((s) => s.jets[jetIdx]?.active === true, opts.armTimeout ?? 8000, `jet ${jetIdx} on`).catch(() => {});
    await this.waitFor((s) => s.jets[jetIdx]?.active === false, opts.timeout ?? 8000, `jet ${jetIdx} off`);
    await this.walkTo(role, toTile, { tol: opts.tol ?? 10, timeout: opts.dashTimeout ?? 3000 });
  }

  // Read the x of the live bug nearest a given player index.
  async nearestBugX(i) {
    return this.page.evaluate((i) => {
      const s = window.__BB.scene;
      let best = null, bd = Infinity;
      s.bugs.children.each((b) => {
        if (!b.active) return;
        const d = Math.abs(b.x - s.players[i].x);
        if (d < bd) { bd = d; best = b.x; }
      });
      return best;
    }, i);
  }

  // --- stompBugs (heavy) -----------------------------------------------------
  // Clear n scuttlebugs. heavyImpact kills every bug within a ~2-tile radius of a
  // stomp. Two modes:
  //  - opts.anchors=[tileX,...]: stand on the nearest safe anchor tile and pounce
  //    STRAIGHT UP when a bug wanders into radius. The stomp x == the anchor, so
  //    the blast never drifts into a cracked lid (used in 1-1). Deterministic.
  //  - default: walk onto the nearest bug and stomp (used where no lid is nearby).
  async stompBugs(role, n, opts = {}) {
    const i = this.idx(role);
    const k = this.keysFor(role);
    const anchors = opts.anchors || null;
    const timeout = opts.timeout ?? 30000;
    this.log(`stompBugs ${role} x${n}${anchors ? ` anchors ${anchors}` : ""}`);
    const end = now() + timeout;
    let cleared = 0;
    const startCount = (await this.state()).bugs;
    while (cleared < n && now() < end) {
      const st = await this.state();
      const p = st.players[i];
      if (p.dead) { await this.awaitRespawn(role); continue; }
      const before = st.bugs;
      if (before === 0) break;
      const bugX = await this.nearestBugX(i);
      if (bugX == null) break;
      const bugTile = bugX / TILE;

      if (anchors) {
        // stand on the safe anchor nearest this bug, wait for it to enter radius
        const anchor = anchors.reduce((a, b) => Math.abs(b - bugTile) < Math.abs(a - bugTile) ? b : a);
        await this.walkTo(role, anchor, { tol: 10, timeout: 6000 });
        const anchorX = anchor * TILE + 24;
        const waitEnd = now() + 8000;
        let bx = await this.nearestBugX(i);
        while (bx != null && Math.abs(bx - anchorX) > 58 && now() < waitEnd) {
          await sleep(60);
          // hold position (re-center if shoved)
          const pp = (await this.state()).players[i];
          if (Math.abs(pp.x - anchorX) > 16) {
            const dir = pp.x < anchorX ? k.right : k.left;
            await this.up(dir === k.right ? k.left : k.right);
            await this.down(dir);
          } else { await this.up(k.left); await this.up(k.right); }
          bx = await this.nearestBugX(i);
        }
        await this.up(k.left); await this.up(k.right);
        if (bx == null) break;
        // pounce straight up (no horizontal): stomp x stays on the safe anchor
        await this.tap(k.jump, 120);
        await sleep(130);
        await this.tap(k.act, 80);
        await sleep(750);
      } else {
        await this.walkTo(role, Math.round(bugTile), { tol: 30, timeout: 6000 }).catch(() => {});
        const bx = await this.nearestBugX(i);
        if (bx == null) break;
        const p2 = (await this.state()).players[i];
        const dirKey = bx - p2.x > 0 ? k.right : k.left;
        await this.down(dirKey);
        await this.tap(k.jump, 120);
        await sleep(120);
        await this.tap(k.act, 80);
        await sleep(700);
        await this.up(dirKey);
      }
      const after = (await this.state()).bugs;
      if (after < before) {
        cleared += before - after;
        this.log(`stompBugs ${role}: ${before} -> ${after} (cleared ${cleared}/${n})`);
      }
    }
    const finalCount = (await this.state()).bugs;
    if (cleared < n && finalCount > Math.max(0, startCount - n)) {
      throw new BeatError(`stompBugs ${role} only cleared ${cleared}/${n} (bugs left ${finalCount})`);
    }
    return cleared;
  }

  // --- crane dodge (single tick) ---------------------------------------------
  // If the crane is telegraphing/slamming near a player, step them away. Returns
  // true if it issued a dodge (caller should not fight this tick).
  async craneDodgeTick(st) {
    const c = st.crane;
    if (!c) return false;
    if (c.state !== "telegraph" && c.state !== "slam") return false;
    let dodged = false;
    for (const role of ["G", "H"]) {
      const i = this.idx(role);
      const p = st.players[i];
      if (p.dead) continue;
      if (Math.abs(c.x - p.x) < 110) {
        const k = this.keysFor(role);
        // run away from the crane, toward open floor (clamp inside arena)
        const away = c.x > p.x ? "left" : "right";
        await this.up(away === "left" ? k.right : k.left);
        await this.down(away === "left" ? k.left : k.right);
        dodged = true;
      }
    }
    return dodged;
  }

  // --- full crane fight (1-3) ------------------------------------------------
  // Closed loop: on each crane "rest", G yanks a plate (H parked >=6 tiles away
  // so the partner never outranks the plate target); pods are stomped by H any
  // time. Dodges telegraph/slam between rests. Up to `maxCycles` rests.
  async fightCrane(opts = {}) {
    const gi = this.idx("G");
    const hi = this.idx("H");
    const kG = this.keysFor("G");
    const kH = this.keysFor("H");
    const maxCycles = opts.maxCycles ?? 8;
    const timeout = opts.timeout ?? 150000;
    const end = now() + timeout;
    this.log("fightCrane: begin");
    let cycles = 0;
    while (now() < end) {
      let st = await this.state();
      if (st.craneDefeated) {
        await this.releaseAll();
        this.log("fightCrane: crane defeated");
        return true;
      }
      // recover from any death
      if (st.players[gi].dead) { await this.awaitRespawn("G"); continue; }
      if (st.players[hi].dead) { await this.awaitRespawn("H"); continue; }

      // Always keep stomping available pods (decoupled from crane state).
      if (st.pods.length) {
        const pod = st.pods.reduce((a, b) =>
          Math.abs(b.x - st.players[hi].x) < Math.abs(a.x - st.players[hi].x) ? b : a);
        const podTile = pod.x / TILE;
        // approach + stomp, dodging as we go
        const podEnd = now() + 6000;
        let stomped = false;
        const beforePods = st.podsStomped ?? st.crane.podsStomped;
        while (now() < podEnd) {
          const s2 = await this.state();
          if (s2.craneDefeated) { stomped = true; break; }
          if (s2.players[hi].dead) { await this.awaitRespawn("H"); break; }
          if (!s2.pods.length) { stomped = true; break; }
          // dodge for both while approaching
          const dodged = await this.craneDodgeTick(s2);
          const ph = s2.players[hi];
          const curPod = s2.pods.reduce((a, b) =>
            Math.abs(b.x - ph.x) < Math.abs(a.x - ph.x) ? b : a);
          const dxp = curPod.x - ph.x;
          if (!dodged) {
            if (Math.abs(dxp) > 34) {
              const dk = dxp > 0 ? kH.right : kH.left;
              await this.up(dxp > 0 ? kH.left : kH.right);
              await this.down(dk);
            } else {
              await this.up(kH.left); await this.up(kH.right);
              await this.tap(kH.jump, 120);
              await sleep(110);
              await this.tap(kH.act, 80); // stomp
              await sleep(500);
            }
          }
          await sleep(33);
        }
        await this.up(kH.left); await this.up(kH.right);
        if (stomped) this.log(`fightCrane: pod stomped (podsStomped now ${(await this.state()).crane?.podsStomped})`);
        continue;
      }

      // No pods out: we need a fresh yank. Dodge until the crane rests.
      if (st.crane.state !== "rest") {
        await this.craneDodgeTick(st);
        await sleep(33);
        continue;
      }

      // Crane is resting: park H far from G, then G walks under the crane & yanks.
      cycles++;
      if (cycles > maxCycles) {
        throw new BeatError(`fightCrane exceeded ${maxCycles} cycles (pods ${st.crane.podsStomped})`);
      }
      this.log(`fightCrane: rest cycle ${cycles}, crane.x tile ${(st.crane.x / TILE).toFixed(1)}`);
      const craneTile = st.crane.x / TILE;
      // Park H at least 8 tiles from the crane so it can't be the grapple target.
      const parkTile = craneTile > 20 ? Math.max(2, Math.round(craneTile) - 10) : Math.min(37, Math.round(craneTile) + 10);
      // Move H toward the park spot (best-effort, short) while dodging.
      {
        const ph = st.players[hi];
        if (Math.abs(ph.x / TILE - parkTile) > 2) {
          const dir = parkTile > ph.x / TILE ? "right" : "left";
          await this.up(dir === "right" ? kH.left : kH.right);
          await this.down(dir === "right" ? kH.right : kH.left);
        }
      }
      // G approaches crane.x and yanks while it still rests.
      const yankEnd = now() + 2400;
      let yanked = false;
      const platesBefore = st.pods.length;
      while (now() < yankEnd) {
        const s2 = await this.state();
        if (!s2.crane || s2.crane.state !== "rest") break;
        const pg = s2.players[gi];
        if (pg.dead) { await this.awaitRespawn("G"); break; }
        // Stand ~1 tile to the side of the nearest attached plate: right under it
        // the plate is within 30px and gets excluded from grapple targeting.
        const plates = s2.crane.plates || [];
        const plateX = plates.length
          ? plates.reduce((a, b) => Math.abs(b.x - pg.x) < Math.abs(a.x - pg.x) ? b : a).x
          : s2.crane.x;
        const standX = plateX - 50; // just left of the plate, ~50px away
        const dxg = standX - pg.x;
        if (Math.abs(dxg) > 12) {
          const dk = dxg > 0 ? kG.right : kG.left;
          await this.up(dxg > 0 ? kG.left : kG.right);
          await this.down(dk);
        } else {
          await this.up(kG.left); await this.up(kG.right);
          const tgt = await this.grappleTarget("G");
          if (tgt && tgt.kind === "plate") {
            await this.tap(kG.act, 80);
            await sleep(300);
            if ((await this.state()).pods.length > platesBefore) { yanked = true; break; }
          } else {
            await sleep(60);
          }
        }
        await sleep(33);
      }
      await this.up(kG.left); await this.up(kG.right);
      await this.up(kH.left); await this.up(kH.right);
      if (yanked) this.log("fightCrane: plate yanked -> pod spawned");
      else this.log("fightCrane: yank window closed without a pod, retrying");
    }
    throw new BeatError("fightCrane timed out", { state: await this.state() });
  }

  // --- failure artifacts -----------------------------------------------------
  async writeFailure(runLabel, stepName, err) {
    mkdirSync(FAIL_DIR, { recursive: true });
    const safe = `${runLabel}__${stepName}`.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 120);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = `${safe}__${stamp}`;
    let state = err?.extra?.state;
    try { if (!state) state = await this.state(); } catch { /* page may be gone */ }
    try {
      await this.page.screenshot({ path: join(FAIL_DIR, `${base}.png`) });
    } catch (e) { this.log(`screenshot failed: ${e.message}`); }
    try {
      writeFileSync(join(FAIL_DIR, `${base}.state.json`), JSON.stringify(state, null, 2));
    } catch { /* ignore */ }
    try {
      writeFileSync(
        join(FAIL_DIR, `${base}.log.txt`),
        [
          `run: ${runLabel}`,
          `step: ${stepName}`,
          `error: ${err?.message || err}`,
          `roles: ${JSON.stringify(this.roles)}`,
          `deaths(run): ${this.deaths}`,
          "",
          "--- step log ---",
          ...this.stepLog,
        ].join("\n")
      );
    } catch { /* ignore */ }
    return base;
  }
}
