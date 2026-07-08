// Bolt Buddies — DEATH SCATTER + RESPAWN REASSEMBLY (Animation Sprint A4).
//
// The headline of A4: on death, 4-5 DRAWN robot parts (visor, antenna, tread,
// body plate, bolt) scatter outward with the existing boom; the respawn beam
// pulls them back together at the checkpoint and snaps them into place.
//
// GROUND RULES honoured:
//   * PHYSICS / TIMING IS SACRED — this is a PURE VISUAL overlay on the existing
//     death->respawn timing. It reads the death position and the checkpoint the
//     respawn already lands on; it NEVER moves the player, changes the 900ms
//     respawn delay, or the respawn tile. scatter() is fired from killPlayer AFTER
//     the boom; reassemble() from the respawn callback AFTER the beam lands. If
//     the anim system is off (the A/B switch) neither runs — the baseline P6
//     boom-only death is byte-identical.
//   * POOLED + CAPPED — a FIXED pool of PARTS_PER_DEATH * MAX_DEATHS images is
//     created ONCE. scatter() claims the next PARTS_PER_DEATH slots round-robin,
//     so at most MAX_DEATHS deaths' worth of parts are ever alive (a 3rd rapid
//     death recycles the oldest). No per-death allocation.
//   * CANVAS-SAFE — real drawn Image parts + alpha, no tint-only meaning.

import { DEPTH } from "../constants.js";
import { MOTION } from "./motion.js";

const PARTS_PER_DEATH = 5;
const MAX_DEATHS = 2; // "<=2 concurrent deaths' worth of parts alive"
const POOL = PARTS_PER_DEATH * MAX_DEATHS; // 10

// per-player accent chunk sets (drawn in BootScene).
const SHAPES = {
  0: ["dp_visor_b", "dp_ant_b", "dp_tread_b", "dp_plate_b", "dp_bolt_b"],
  1: ["dp_visor_o", "dp_ant_o", "dp_tread_o", "dp_plate_o", "dp_bolt_o"],
};

export class DeathScatter {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this._head = 0;
    for (let i = 0; i < POOL; i++) {
      const img = scene.add.image(0, 0, "dp_plate_b")
        .setDepth(DEPTH.fx - 1).setVisible(false);
      // slot bookkeeping is all primitive (no per-frame/per-death alloc).
      this.pool.push({ img, active: false, idx: -1, ang: 0 });
    }
  }

  // On death: fling PARTS_PER_DEATH drawn chunks out from (p.x, p.y). Each slot is
  // claimed round-robin so the cap is structural. Parts hold their scattered rest
  // pose until reassemble() takes them, or fade if no respawn ever follows.
  scatter(p) {
    const shapes = SHAPES[p.idx] || SHAPES[0];
    for (let i = 0; i < PARTS_PER_DEATH; i++) {
      const slot = this.pool[this._head];
      this._head = (this._head + 1) % this.pool.length;
      const img = slot.img;
      this.scene.tweens.killTweensOf(img);
      const ang = (i / PARTS_PER_DEATH) * Math.PI * 2 + Math.random() * 0.7;
      const dist = 32 + Math.random() * 26;
      slot.active = true; slot.idx = p.idx; slot.ang = ang;
      img.setTexture(shapes[i]).setPosition(p.x, p.y).setScale(1).setAlpha(1)
        .setRotation(Math.random() * Math.PI * 2).setVisible(true);
      const tx = p.x + Math.cos(ang) * dist;
      const ty = p.y + Math.sin(ang) * dist - 12; // a little upward pop
      const spin = img.rotation + (Math.random() * 2 - 1) * 3;
      this.scene.tweens.add({
        targets: img, x: tx, y: ty, rotation: spin,
        duration: MOTION.DEATH_SCATTER.dur, ease: MOTION.DEATH_SCATTER.ease,
        // orphan fade: if no respawn reassembles this part (e.g. level ends during
        // the death window) it fades out on its own so nothing lingers on screen.
        onComplete: () => {
          this.scene.tweens.add({
            targets: img, alpha: 0, delay: 240, duration: MOTION.DEATH_FADE.dur,
            onComplete: () => { slot.active = false; img.setVisible(false); },
          });
        },
      });
    }
  }

  // On respawn: the beam gathers THIS player's still-alive scattered parts into a
  // tight ring around the respawn point (cx, cy) and snaps them inward, fading as
  // the robot materializes. Reads the checkpoint the respawn already chose — it
  // never moves the player or alters timing.
  reassemble(p, cx, cy) {
    for (let i = 0; i < this.pool.length; i++) {
      const slot = this.pool[i];
      if (!slot.active || slot.idx !== p.idx) continue;
      const img = slot.img;
      this.scene.tweens.killTweensOf(img);
      const r = 44;
      img.setPosition(cx + Math.cos(slot.ang) * r, cy + Math.sin(slot.ang) * r - 12)
        .setAlpha(0.95).setVisible(true);
      this.scene.tweens.add({
        targets: img, x: cx, y: cy - 14, rotation: 0, scale: 0.3, alpha: 0,
        duration: MOTION.DEATH_REASSEMBLE.dur, ease: MOTION.DEATH_REASSEMBLE.ease,
        onComplete: () => { slot.active = false; img.setVisible(false); },
      });
    }
  }

  // Test/telemetry: how many pooled parts are currently alive (cap = POOL).
  aliveCount() {
    let n = 0;
    for (let i = 0; i < this.pool.length; i++) if (this.pool[i].active) n++;
    return n;
  }

  destroy() {
    for (let i = 0; i < this.pool.length; i++) {
      this.scene.tweens.killTweensOf(this.pool[i].img);
      this.pool[i].img.destroy();
    }
    this.pool.length = 0;
  }
}
