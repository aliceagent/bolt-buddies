// Bolt Buddies — TICKER ANIMATION SET (W3W4 sprint M4).
//
// Turns the A1 rig VISIBLE for the World-4 ticker. Every beat is a pure
// VISUAL OVERLAY on the SACRED wind/dash state machine, which
// GameScene.updateWorld4 owns and which stays BYTE-IDENTICAL (the logic reads
// t.state / t.timer / t.img.x — none of them are touched here):
//   * BACK-KEY SPIN — one pooled drawn wind-up key part on the ticker's back
//     (the classic clockwork read). It winds FAST during the wind-up telegraph
//     and unwinds |vx|-scaled during the dash — motion budget spent where the
//     meaning is.
//   * WIND-UP QUIVER — a small host-ROTATION quiver during the telegraph (the
//     Arcade AABB ignores rotation; contact checks read img.x/img.y only).
//   * FREEZE HOLD — while the scene is frozen the rig writes NOTHING: the
//     frozen ticker (the design's key interaction) is a perfect statue.
//
// GROUND RULES honoured: ENEMY LOGIC SACRED (reads t.state only; writes the key
// part + host rotation), ZERO per-frame allocation, pooled part created ONCE,
// CANVAS-SAFE drawn art, `?animoff=1` renders the ticker static with a
// byte-identical body (the A5/A6 A/B contract).

import { MOTION } from "./motion.js";

// Install the visible ticker set on one TICKER rig. `ticker` is the GameScene
// ticker record (owns the SACRED state we READ: state / dir / minX / maxX).
export function installTickerAnim(rig, scene, ticker) {
  // --- the pooled back key (created ONCE) ------------------------------------
  // Rides the FEELER channel (base 0, side 1) so its rotation comes from the
  // shared pose.feelerBend — which this hook drives with the wind angle. (A
  // plain part re-inherits host rotation every place(), so the free-spinning
  // key needs a self-rotating channel; feeler is exactly that.)
  const key = rig.addPart("key", "ticker_key", { x: -14, y: -6 }, {
    feeler: { base: 0, side: 1 },
  });
  key.obj.setOrigin(0.5, 0.82); // hinge near the stem so the spin reads at the bow

  // --- preallocated scratch (ZERO per-frame allocation) ----------------------
  rig._t = ((ticker.minX * 7 + ticker.maxX * 13) % 628) / 100; // deterministic phase (s)
  rig._keyAngle = 0;

  rig.machine.hooks = {
    update(pose, status, dt) {
      const h = rig.host;
      if (!h || !h.body) return;
      // FREEZE HOLD: the frozen ticker is a statue — the rig writes nothing
      // (visual only; the state machine is already gated in updateWorld4).
      if (scene.frozen) return;
      const dts = dt / 1000;
      rig._t += dts;

      const K = MOTION.TICKER_KEY;
      if (ticker.state === "wind") {
        // telegraph: the key winds fast + the body quivers (host rotation only)
        rig._keyAngle += K.spin * 2.2 * dts;
        const Q = MOTION.TICKER_WIND;
        h.rotation = Math.sin(rig._t * Q.freq) * Q.amp;
      } else {
        // dash: the key unwinds, |vx|-scaled (clockwork spending its spring)
        const vx = Math.abs(h.body.velocity.x);
        rig._keyAngle -= K.spin * (0.4 + vx / 240) * dts;
        // settle upright quickly out of the quiver
        h.rotation *= Math.max(0, 1 - dts * 8);
        if (Math.abs(h.rotation) < 0.004) h.rotation = 0;
      }
      // the key part reads this as its own rotation (feeler channel, rad)
      pose.feelerBend = (rig._keyAngle * Math.PI) / 180;
    },
  };
}
