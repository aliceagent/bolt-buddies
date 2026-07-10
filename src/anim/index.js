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
import { DeathScatter } from "./death.js";
import { installPlayerAnim } from "./player_anim.js";
import { installBugAnim } from "./bug_anim.js";
import { installRollerAnim } from "./roller_anim.js";
import { installWardenAnim } from "./warden_anim.js";
import { installCraneAnim } from "./crane_anim.js";
import { installJellyAnim } from "./jelly_anim.js";
import { installChomperAnim } from "./chomper_anim.js";
import { installW3SkillAnim } from "./w3skills_anim.js";
import { installGloomyAnim } from "./gloomy_anim.js";
import { installTickerAnim } from "./ticker_anim.js";
import { installW4SkillAnim } from "./w4skills_anim.js";
import { installDeviceAnim } from "./device_anim.js";
import { installSocialAnim } from "./social_anim.js";
import { installCameoAnim } from "./cameo_anim.js";
import { TIMING } from "./motion.js";
import { DEPTH } from "../constants.js";
import { sfx } from "../audio.js";

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
    // A4: the pooled death-part scatter + respawn reassembly (a pure visual overlay
    // on the SACRED death->respawn timing; fired from GameScene.killPlayer/respawn).
    this.deathScatter = new DeathScatter(scene);
    // A3: the scheduler's per-rig eligibility hook dispatches to the rig's own
    // fidget starter (installed on players by installPlayerAnim; enemies have none,
    // so their fidget path stays a no-op until their A-sprint wires one).
    this.fidget.pickFidget = (rig, tier) => {
      if (rig.startAnimFidget) rig.startAnimFidget(tier);
    };
    this._partnerFired = false; // A3 partner one-shot latch (re-arms on separate/move)
    // A9: the living-lab device-personality controller (crusher/pedestal/checkpoint/
    // exit/lift). Created in registerLevel() once the devices exist; a pure overlay on
    // the SACRED device logic, updated LAST + gated by `enabled` (byte-identical when off).
    this.device = null;
    // A10: the social & co-op moments controller (exit high-five / reel catch-pose /
    // escort hand-hold spark / carried-buddy wave / respawn partner-notices). Created
    // in registerLevel() once the players + rigs exist; a pure overlay on the SACRED
    // co-op logic, updated LAST + gated by `enabled` (byte-identical when off).
    this.social = null;
    // A11: the in-level Bolt cameo (once-per-level RARE backdrop — Bolt dashes across
    // chased by a tiny KOBI drone). A PURE display-list backdrop with NO body/collision/
    // timing effect; created in registerLevel(), updated LAST of all + gated by `enabled`
    // (under ?animoff=1 update() never runs, so the cameo never spawns and reads nothing).
    this.cameo = null;
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
    const rig = this._add(p, { kind: "player", probe: probePlayer, depth: DEPTH.player + 2 });
    // A2: hang the visible locomotion set (tread/pupils/antenna parts + pose hooks)
    installPlayerAnim(rig, this.scene);
    // W3W4 M3: layer the magnet/bubble action-pose overlay ONLY on levels whose
    // skill pair includes a W3 skill (wraps the A2-A4 hook; shipped levels never
    // install it, so the player rig stays byte-identical there).
    const sk = this.scene.def && this.scene.def.skills;
    if (sk && (sk.includes("magnet") || sk.includes("bubble"))) installW3SkillAnim(rig, this.scene);
    // W3W4 M4: same gate for the World-4 pair (freeze/beam action overlays)
    if (sk && (sk.includes("freeze") || sk.includes("beam"))) installW4SkillAnim(rig, this.scene);
    return rig;
  }

  // W3W4 M4: the gloomy rig (wisp billow + lurk bob + dazzle shiver).
  registerGloomy(gl) {
    const rig = this._add(gl.img, {
      kind: "gloomy", depth: DEPTH.entity + 2,
      probe: (h, out) => {
        const b = h.body;
        out.dead = false; out.hurt = false; out.carrying = false;
        out.airborne = true;
        out.vx = b ? b.velocity.x : 0;
        out.vy = b ? b.velocity.y : 0;
        out.face = 1;
        out.input = false;
      },
    });
    installGloomyAnim(rig, this.scene, gl);
    return rig;
  }

  // W3W4 M4: the ticker rig (wind-up key spin + telegraph quiver).
  registerTicker(t) {
    const rig = this._add(t.img, {
      kind: "ticker", depth: DEPTH.entity + 2,
      probe: (h, out) => {
        const b = h.body;
        out.dead = false; out.hurt = false; out.carrying = false;
        out.airborne = false;
        out.vx = b ? b.velocity.x : 0;
        out.vy = 0;
        out.face = t.dir || 1;
        out.input = false;
      },
    });
    installTickerAnim(rig, this.scene, t);
    return rig;
  }

  // W3W4 M3: the zap-jelly rig (tentacle wave + dome wobble + knock spin).
  registerJelly(j) {
    const rig = this._add(j.img, {
      kind: "jelly", depth: DEPTH.entity + 2,
      probe: (h, out) => {
        const b = h.body;
        out.dead = false; out.hurt = false; out.carrying = false;
        out.airborne = true;
        out.vx = b ? b.velocity.x : 0;
        out.vy = b ? b.velocity.y : 0;
        out.face = j.dir || 1;
        out.input = false;
      },
    });
    installJellyAnim(rig, this.scene, j);
    return rig;
  }

  // W3W4 M3: the junk-chomper rig (jaw chomp + telegraph/lunge body tilt).
  registerChomper(c) {
    const rig = this._add(c.img, {
      kind: "chomper", depth: DEPTH.entity + 2,
      probe: (h, out) => {
        const b = h.body;
        out.dead = !!c.defanged; out.hurt = false; out.carrying = false;
        out.airborne = false;
        out.vx = b ? b.velocity.x : 0;
        out.vy = 0;
        out.face = c.dir || 1;
        out.input = false;
      },
    });
    installChomperAnim(rig, this.scene, c);
    return rig;
  }

  registerBug(bug) {
    const rig = this._add(bug, {
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
    // A5: hang the visible scuttle set (feelers + leg cycle + rear-up + stumble).
    installBugAnim(rig, this.scene);
    return rig;
  }

  registerRoller(r) {
    const rig = this._add(r.img, {
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
    // A6: hang the visible roller set (wheel spin + pupil track/snap/dilate +
    // klaxon sweep + hmm head-tilt + zap recoil) as a pure overlay on the beam logic.
    installRollerAnim(rig, this.scene, r);
    return rig;
  }

  registerWarden(w) {
    const rig = this._add(w.img, {
      kind: "warden", depth: DEPTH.entity + 2,
      probe: (h, out) => {
        out.dead = !!w.defeated; out.hurt = false; out.carrying = false;
        out.airborne = false; out.vx = 0; out.vy = 0;
        out.face = w.facing || 1; out.input = false;
      },
    });
    // A7: hang the visible wall-warden set (idle sway + visor glint + alert stance-
    // widen + shove lunge/recoil) as a pure overlay on the shove/defeat logic.
    installWardenAnim(rig, this.scene, w);
    return rig;
  }

  registerCrane(c) {
    const rig = this._add(c.body, {
      kind: "crane", depth: DEPTH.entity + 2,
      probe: (h, out) => {
        out.dead = !!this.scene.craneDefeated;
        out.hurt = false; out.carrying = false; out.airborne = false;
        out.vx = 0; out.vy = 0; out.face = 1; out.input = false;
      },
    });
    // A8: hang the visible crane boss set (cable sag+swing-lag / KOBI eye track+blink /
    // plate invite-wobble / telegraph shudder / slam squash / plate-yank flinch / staged
    // defeat power-down) as a pure overlay on the SACRED fight state machine + timings.
    installCraneAnim(rig, this.scene, c);
    return rig;
  }

  // Register the whole cast once the level is built (called from create()).
  registerLevel() {
    const s = this.scene;
    s.players.forEach((p) => this.registerPlayer(p));
    if (s.bugs) s.bugs.getChildren().forEach((b) => { if (b.active) this.registerBug(b); });
    if (s.rollers) s.rollers.forEach((r) => this.registerRoller(r));
    if (s.wardens) s.wardens.forEach((w) => this.registerWarden(w));
    if (s.crane) this.registerCrane(s.crane);
    // W3W4 M3: the World-3 enemy cast (empty arrays in every shipped level)
    if (s.jellies) s.jellies.forEach((j) => this.registerJelly(j));
    if (s.chompers) s.chompers.forEach((c) => this.registerChomper(c));
    // W3W4 M4: the World-4 enemy cast (empty arrays in every shipped level)
    if (s.gloomies) s.gloomies.forEach((gl) => this.registerGloomy(gl));
    if (s.tickers) s.tickers.forEach((t) => this.registerTicker(t));
    // A9: wire the device-personality overlays now that every device record exists.
    this.device = installDeviceAnim(s);
    // A10: wire the social & co-op moment overlays now that both player rigs exist.
    this.social = installSocialAnim(s, this);
    // A11: wire the in-level Bolt cameo backdrop (pooled, hidden until it dashes).
    this.cameo = installCameoAnim(s);
  }

  // One frame. Runs AFTER all game logic. When disabled (A/B rig-off) it returns
  // immediately — the whole point of the enabler is that this costs ~0.
  update(time, delta) {
    if (!this.enabled) return;
    for (let i = 0; i < this.rigs.length; i++) this.rigs[i].update(time, delta);
    this.fidget.update(time, delta);
    this._updatePartner();
    // A9: drive the device-personality overlays last (after every rig + game logic).
    if (this.device) this.device.update(time, delta);
    // A10: drive the social & co-op moment overlays last of all (after the rigs, so
    // the cosmetic pupil/antenna offsets ride cleanly on top of this frame's placement).
    if (this.social) this.social.update(time, delta);
    // A11: drive the in-level Bolt cameo backdrop LAST — it reads nothing from gameplay
    // (only the viewport size + clock) and writes only to its own screen-fixed sprite.
    if (this.cameo) this.cameo.update(time, delta);
  }

  // A3 PARTNER-AWARE moment: when BOTH players have been idle within 6 tiles of
  // each other, they turn and look at one another — one beeps, the other tilts.
  // One-shot; re-arms once they separate or either one moves. Cheap (two rigs).
  _updatePartner() {
    const ps = this.scene.players;
    if (!ps || ps.length < 2) return;
    const a = ps[0], b = ps[1];
    const ra = this.byHost.get(a), rb = this.byHost.get(b);
    if (!ra || !rb) return;
    const bothIdle =
      ra.machine.state === "idle" && rb.machine.state === "idle" &&
      !ra.status.input && !rb.status.input &&
      ra.idleMs >= TIMING.IDLE_TIER1 && rb.idleMs >= TIMING.IDLE_TIER1 &&
      !a.carrying && !b.carrying && !a.carriedBy && !b.carriedBy &&
      !a.dead && !b.dead;
    const dx = a.x - b.x, dy = a.y - b.y;
    const near = dx * dx + dy * dy <= TIMING.PARTNER_RANGE * TIMING.PARTNER_RANGE;
    if (bothIdle && near) {
      if (!this._partnerFired) {
        this._partnerFired = true;
        const dirA = Math.sign(b.x - a.x) || 1; // A faces toward B; B faces back
        ra.startPartnerLook(dirA, 0); // player 0 beeps
        rb.startPartnerLook(-dirA, 7); // player 1 gives the head-cock tilt
        sfx.buddyBeep();
      }
    } else {
      this._partnerFired = false; // separated or moving — re-arm
    }
  }

  destroy() {
    for (let i = 0; i < this.rigs.length; i++) this.rigs[i].destroy();
    this.rigs.length = 0;
    this.byHost.clear();
    if (this.deathScatter) this.deathScatter.destroy();
    if (this.device) { this.device.destroy(); this.device = null; }
    if (this.social) { this.social.destroy(); this.social = null; }
    if (this.cameo) { this.cameo.destroy(); this.cameo = null; }
  }
}
