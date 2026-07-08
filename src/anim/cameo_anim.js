// Bolt Buddies — IN-LEVEL BOLT CAMEO (Animation Sprint A11 — "Bolt & KOBI cameo").
//
// A11 #5: once per level (RARE), on a BACKGROUND layer, Bolt dashes across the
// screen chased by a tiny KOBI drone — PURE BACKDROP. This is the ONLY beat-matrix-
// sensitive piece, so it is built to be provably inert:
//
//   * NO arcade body, NO collision, NO physics — the cameo is a plain display-list
//     Container of drawn Graphics. It never touches scene.players, tiles, colliders,
//     finishLevel, cores, deaths, or ANY level state. It only READS the viewport size
//     (scene.scale) to place itself and the frame clock to animate — nothing gameplay
//     reads back.
//   * It is a SCREEN-FIXED backdrop (setScrollFactor(0)) on a LOW depth (below terrain),
//     so the level tiles occlude it and it reads as a distant silhouette darting behind
//     the lab. It cannot occlude a sprite, a bubble, or the HUD.
//   * Gated by the rig A/B switch: AnimSystem owns this controller, creates it in
//     registerLevel(), and updates it LAST (after every rig + device + social overlay)
//     ONLY when `enabled`. Under ?animoff=1 update() never runs, so the cameo never
//     appears, never moves, and performs ZERO reads — byte-identical to a cameo-free
//     build. The pooled sprites exist hidden (like A9's sigh / A10's escort spark),
//     but with the rig off they stay invisible and inert.
//   * RARE: after an initial delay it rolls a small chance on a slow cadence, fires AT
//     MOST ONCE per level, then latches off. Pooled + zero per-frame allocation (the
//     dash reuses the same two Graphics; the run is driven by a scratch envelope).
//   * Canvas-safe + WebGL-adaptive: drawn parts only (no tint-only states); the drone's
//     glow uses ADD blend on WebGL only. Frame-rate-independent (progress = t/dur).
//
// GROUND RULES honoured: PHYSICS/LOGIC/TIMING SACRED (no body, no reads of gameplay
// state, no writes to anything the game reads); pooled + zero per-frame allocation;
// canvas-safe; gated by the A/B switch (byte-identical when off).

import Phaser from "phaser";
import { MOTION } from "./motion.js";
import { DEPTH } from "../constants.js";

export function installCameoAnim(scene) {
  return new CameoAnim(scene);
}

class CameoAnim {
  constructor(scene) {
    this.scene = scene;
    const webgl = scene.game.renderer.type === Phaser.WEBGL;
    this.webgl = webgl;

    // --- pooled, SCREEN-FIXED backdrop container (created ONCE, hidden) --------
    // Low depth (just above the parallax backdrop, BELOW terrain) so terrain tiles
    // occlude it — it reads as a distant silhouette behind the lab. scrollFactor(0)
    // makes it dash across the visible screen regardless of camera position, and
    // guarantees it never lines up with a world hitbox.
    const cont = scene.add.container(0, 0)
      .setScrollFactor(0).setDepth(DEPTH.bg + 2).setVisible(false);
    this.cont = cont;

    // Bolt (a small distant puppy silhouette + amber tail-light). Drawn once.
    const bolt = scene.add.graphics();
    this._drawBolt(bolt);
    // legs are a separate graphics so they can gallop (redrawn per active frame only).
    const legs = scene.add.graphics();
    this._boltLegs = legs;

    // KOBI drone thruster glow — WebGL-only ADD-blend halo, drawn on its OWN object
    // (a whole-Graphics blend mode can't be mixed with the opaque pod), rendered
    // behind the pod. Null on the Canvas tier (the pod carries a cheaper baked glow).
    const glow = webgl ? scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD) : null;
    if (glow) { glow.fillStyle(0xff4dd2, 0.5).fillCircle(-11, 1, 5.5); glow.fillStyle(0xff9ae0, 0.4).fillCircle(-9, 1, 3); }
    this._droneGlow = glow;

    // KOBI drone: a small dark pod with a magenta eye + a stubby rotor and a
    // baked thruster tail. Drawn once.
    const drone = scene.add.graphics();
    this._drawDrone(drone, webgl);

    cont.add(glow ? [glow, drone, bolt, legs] : [drone, bolt, legs]);
    this._bolt = bolt; this._drone = drone;

    // --- scratch state (zero per-frame allocation) ----------------------------
    this._done = false;    // fired once already this level -> never again
    this._active = false;  // a dash is currently on screen
    this._t = 0;           // ms accumulator before the first eligible roll
    this._rollT = 0;       // ms since the last rarity roll
    this._runT = 0;        // ms into the current dash
    this._dir = 1;         // travel direction (+1 = left->right)
    this._y = 0;           // screen-y band for this dash
    this._x0 = 0; this._x1 = 0; // dash start/end screen-x
  }

  // One frame. Called by AnimSystem.update() LAST and ONLY when the rig is enabled
  // (so ?animoff=1 never runs this — the cameo never spawns and reads nothing).
  update(time, delta) {
    const C = MOTION.CAMEO;
    if (this._active) { this._advance(time, delta); return; }
    if (this._done) return;
    // rare, at-most-once trigger: wait out the initial delay, then roll on a slow gap.
    this._t += delta;
    if (this._t < C.minDelay) return;
    this._rollT += delta;
    if (this._rollT >= C.rollGap) {
      this._rollT = 0;
      if (Math.random() < C.chance) this.trigger();
    }
  }

  // Start a dash NOW (also the tool/test entry point). Latches the once-per-level
  // guard. Pure display setup — touches nothing but the pooled backdrop container.
  trigger() {
    if (this._active) return;
    const C = MOTION.CAMEO;
    const W = this.scene.scale.width, H = this.scene.scale.height;
    this._done = true;
    this._active = true;
    this._runT = 0;
    this._dir = Math.random() < 0.5 ? 1 : -1;
    this._y = H * C.yFrac + (Math.random() * 24 - 12);
    const off = 90;
    this._x0 = this._dir > 0 ? -off : W + off;
    this._x1 = this._dir > 0 ? W + off : -off;
    this.cont.setVisible(true);
    this.cont.setScale(this._dir > 0 ? C.scale : -C.scale, C.scale); // flip to face travel
  }

  _advance(time, delta) {
    const C = MOTION.CAMEO;
    this._runT += delta;
    const p = this._runT / C.dur;
    if (p >= 1) { this._active = false; this.cont.setVisible(false); return; }
    const x = this._x0 + (this._x1 - this._x0) * p;
    const bob = Math.sin(time / 1000 * C.gallop) * C.bob; // gallop bounce
    this.cont.setPosition(x, this._y + bob);
    // gallop legs: redraw the leg pairs on a fast cycle (only while active).
    this._drawLegs(time);
    // the drone chases just BEHIND Bolt (trailing side), with its own bob phase.
    const dbob = Math.sin(time / 1000 * C.gallop * 0.8 + 1) * C.droneBob;
    // container is flipped to face travel, so "behind" in local space is always -X.
    this._drone.setPosition(-C.gap, dbob);
    if (this._droneGlow) this._droneGlow.setPosition(-C.gap, dbob);
    this._bolt.setPosition(0, 0);
    this._boltLegs.setPosition(0, 0);
  }

  // --- drawn parts (pooled; drawn once except the galloping legs) -------------
  _drawBolt(g) {
    // small distant robo-puppy silhouette, facing +X (right). Muted so it reads
    // as a backdrop, not a foreground actor. Mirrors the title Bolt's shapes at
    // ~half scale, minus the fine detail that would be lost at distance.
    const body = 0xb9c2d6, dark = 0x828ca6, collar = 0xffb454, eyec = 0x1a2334;
    g.clear();
    // body + hind haunch
    g.fillStyle(body).fillRoundedRect(-14, -6, 30, 13, 6);
    g.fillStyle(body).fillCircle(-12, 0, 7);
    // amber collar + head
    g.fillStyle(collar).fillRect(8, -6, 3, 13);
    g.fillStyle(body).fillCircle(16, -9, 8);
    // snout + nose
    g.fillStyle(body).fillRoundedRect(20, -8, 9, 7, 3);
    g.fillStyle(dark).fillCircle(28, -5, 1.6);
    // floppy ear + eye
    g.fillStyle(dark).fillTriangle(11, -15, 16, -17, 13, -5);
    g.fillStyle(eyec).fillCircle(18, -10, 2.2);
    // little antenna nub so he reads as robotic
    g.lineStyle(1.5, dark).lineBetween(13, -17, 13, -21);
    g.fillStyle(collar).fillCircle(13, -22, 1.6);
    // stub tail (baked; the whole silhouette is distant so a static wag reads fine)
    g.fillStyle(body).fillRoundedRect(-19, -13, 4, 11, 2);
    g.fillStyle(collar).fillCircle(-17, -13, 2.2);
  }

  // KOBI drone: a dark rounded pod, magenta eye, twin rotor stubs + a baked thruster
  // tail. Sits behind Bolt in local space (drawn at origin; positioned by _advance
  // each frame). The WebGL additive halo (this._droneGlow) rides behind this; the
  // pod itself stays a solid dark silhouette on either renderer.
  _drawDrone(g, webgl) {
    g.clear();
    // baked thruster tail (layered translucent magenta; canvas-safe, non-additive)
    g.fillStyle(0xff4dd2, webgl ? 0.18 : 0.3).fillCircle(-11, 1, 4.5);
    g.fillStyle(0xff9ae0, webgl ? 0.14 : 0.22).fillCircle(-8, 1, 2.6);
    // pod body
    g.fillStyle(0x241830, 1).fillRoundedRect(-8, -6, 16, 12, 5);
    g.lineStyle(1.5, 0x3a2647, 1).strokeRoundedRect(-8, -6, 16, 12, 5);
    // rotor stubs on top
    g.lineStyle(1.5, 0x59617c, 1).lineBetween(-5, -6, -7, -10);
    g.lineBetween(4, -6, 6, -10);
    g.fillStyle(0x59617c, 1).fillCircle(-7, -10, 1.4).fillCircle(6, -10, 1.4);
    // magenta eye + pupil (the only saturated read — clearly KOBI)
    g.fillStyle(0xffffff, 0.92).fillCircle(2, 0, 3.4);
    g.fillStyle(0xff4dd2, 1).fillCircle(3, 0, 2.2);
    g.fillStyle(0x2a0a1e, 1).fillCircle(3.6, 0, 1);
  }

  // galloping legs: two pairs whose vertical reach oscillates out of phase, redrawn
  // ONLY while a dash is active (pooled Graphics, cleared each time — no allocation).
  _drawLegs(time) {
    const g = this._boltLegs;
    const ph = time / 1000 * MOTION.CAMEO.gallop;
    g.clear();
    g.fillStyle(0x6e7690, 1);
    const legX = [-9, -3, 6, 11];
    for (let i = 0; i < legX.length; i++) {
      const reach = 5 + Math.sin(ph + i * 1.7) * 2.5; // 2.5..7.5 px stride
      g.fillRoundedRect(legX[i], 6, 3, reach, 1.5);
    }
  }

  destroy() {
    // the container owns all children (bolt/legs/drone/glow), so destroying it
    // (with its default destroyChildren=true) tears the whole cameo down.
    if (this.cont) { this.cont.destroy(); this.cont = null; }
    this._bolt = this._drone = this._boltLegs = this._droneGlow = null;
  }
}
