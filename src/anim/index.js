// Bolt Buddies — AnimSystem (Animation Sprint A1 entry point).
//
// Owns every CharRig plus the ONE shared FidgetScheduler, and exposes per-kind
// register helpers + the per-kind state PROBES. GameScene creates one of these
// in create(), registers the players + all enemies once the level is built, and
// calls `anim.update(time, delta)` ONCE at the end of its update() — after all
// game logic — so the rig is a pure visual OVERLAY (logic first, motion after).
//
// A1 is INVISIBLE: rigs are wired, the pose machine tracks state, the scheduler
// runs, but no part is added and no fidget motion plays, so the game renders and
// plays byte-identically. `enabled` is the A/B switch (see the fps/invisibility
// probe, tools/snap_p2_a1.mjs): ?animoff=1 boots with the rig off, and the probe
// flips `anim.enabled` at runtime to measure zero fps cost.

import { CharRig } from "./rig.js";
import { FidgetScheduler } from "./fidget.js";
import { DEPTH } from "../constants.js";

// --- per-kind PROBES: write the host's ALREADY-RESOLVED state into a preallocated
// status bag. Never allocate; never write to the host/body. -------------------

function playerHasInput(p) {
  const k = p.keys, pad = p.pad;
  if (k && (k.left.isDown || k.right.isDown || k.jump.isDown || (k.act && k.act.isDown) || (k.down && k.down.isDown))) return true;
  if (pad && (pad.left.isDown || pad.right.isDown || pad.jump.isDown)) return true;
  return false;
}

function probePlayer(host, out) {
  const b = host.body;
  out.dead = !!host.dead;
  out.hurt = host.invuln > 0 && !host.dead;
  out.carrying = !!host.carrying || !!host.carriedBy;
  // zip/reel are scripted traversal, not free-fall; don't read them as "airborne"
  out.airborne = !host.grounded && !host.zip && !host.reeled && !host.carriedBy;
  out.vx = b ? b.velocity.x : 0;
  out.vy = b ? b.velocity.y : 0;
  out.face = host.facing || 1;
  out.input = playerHasInput(host);
}

export class AnimSystem {
  constructor(scene) {
    this.scene = scene;
    this.rigs = [];
    this.byHost = new Map(); // host GameObject -> its rig
    this.fidget = new FidgetScheduler(scene);
    // rig-off A/B switch. ?animoff=1 boots disabled; the probe flips this live.
    this.enabled = !new URLSearchParams(location.search).has("animoff");
  }

  _add(host, opts) {
    const rig = new CharRig(this.scene, host, opts);
    this.rigs.push(rig);
    this.byHost.set(host, rig);
    this.fidget.register(rig, this.scene.time.now);
    return rig;
  }

  rigFor(host) { return this.byHost.get(host); }

  registerPlayer(p) {
    return this._add(p, { kind: "player", probe: probePlayer, depth: DEPTH.player + 2 });
  }

  registerBug(bug) {
    return this._add(bug, {
      kind: "bug", depth: DEPTH.entity + 2,
      probe: (h, out) => {
        const b = h.body;
        out.dead = !h.active;
        out.hurt = false; out.carrying = false;
        out.airborne = b ? !(b.blocked.down || b.touching.down) : false;
        out.vx = b ? b.velocity.x : 0;
        out.vy = b ? b.velocity.y : 0;
        out.face = b && b.velocity.x < 0 ? -1 : 1;
        out.input = false;
      },
    });
  }

  registerRoller(r) {
    return this._add(r.img, {
      kind: "roller", depth: DEPTH.entity + 2,
      probe: (h, out) => {
        const b = h.body;
        out.dead = false; out.hurt = false; out.carrying = false;
        out.airborne = false;
        out.vx = b ? b.velocity.x : 0;
        out.vy = 0;
        out.face = r.dir || (h.flipX ? -1 : 1);
        out.input = false;
      },
    });
  }

  registerWarden(w) {
    return this._add(w.img, {
      kind: "warden", depth: DEPTH.entity + 2,
      probe: (h, out) => {
        out.dead = !!w.defeated; out.hurt = false; out.carrying = false;
        out.airborne = false; out.vx = 0; out.vy = 0;
        out.face = w.facing || 1; out.input = false;
      },
    });
  }

  registerCrane(c) {
    return this._add(c.body, {
      kind: "crane", depth: DEPTH.entity + 2,
      probe: (h, out) => {
        out.dead = !!this.scene.craneDefeated;
        out.hurt = false; out.carrying = false; out.airborne = false;
        out.vx = 0; out.vy = 0; out.face = 1; out.input = false;
      },
    });
  }

  // Register the whole cast once the level is built (called from create()).
  registerLevel() {
    const s = this.scene;
    s.players.forEach((p) => this.registerPlayer(p));
    if (s.bugs) s.bugs.getChildren().forEach((b) => { if (b.active) this.registerBug(b); });
    if (s.rollers) s.rollers.forEach((r) => this.registerRoller(r));
    if (s.wardens) s.wardens.forEach((w) => this.registerWarden(w));
    if (s.crane) this.registerCrane(s.crane);
  }

  // One frame. Runs AFTER all game logic. When disabled (A/B rig-off) it returns
  // immediately — the whole point of the enabler is that this costs ~0.
  update(time, delta) {
    if (!this.enabled) return;
    for (let i = 0; i < this.rigs.length; i++) this.rigs[i].update(time, delta);
    this.fidget.update(time, delta);
  }

  destroy() {
    for (let i = 0; i < this.rigs.length; i++) this.rigs[i].destroy();
    this.rigs.length = 0;
    this.byHost.clear();
  }
}
