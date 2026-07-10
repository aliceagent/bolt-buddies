// Bolt Buddies — JUNK-CHOMPER ANIMATION SET (W3W4 sprint M3).
//
// Turns the A1 rig VISIBLE for the World-3 junk-chomper. Every beat is a pure
// VISUAL OVERLAY on the SACRED idle/telegraph/lunge/rest/defang state machine,
// which GameScene.updateWorld3 owns and which stays BYTE-IDENTICAL (the probe
// reads ch.state / ch.img.x / the contact distances — none touched here):
//   * JAW CHOMP — a pooled drawn lower-jaw overlay hinged at the mouth's back
//     corner (positioned by this module each frame, like the roller's klaxon —
//     NOT a host-rotation-inheriting part): a lazy idle chomp cycle, held
//     AGAPE + quivering during the telegraph, snapping fast during the lunge,
//     and hidden once defanged (the toothless dozer texture carries that read).
//   * BODY TILT — anticipation crouch-back during the telegraph and a forward
//     lean during the lunge, on host ROTATION only (Arcade AABB ignores it;
//     the lunge hitbox reads img.x/img.y which rotation never moves).
//
// GROUND RULES honoured: ENEMY LOGIC SACRED (reads ch.state/ch.dir/ch.defanged
// only; writes the pooled jaw overlay + host rotation), ZERO per-frame
// allocation, CANVAS-SAFE drawn art, `?animoff=1` renders the chomper static
// with a byte-identical body (the A5/A6 A/B contract).

import { MOTION } from "./motion.js";
import { DEPTH } from "../constants.js";

// Install the visible junk-chomper set on one CHOMPER rig. `ch` is the
// GameScene chomper record (owns the SACRED state we READ: state / dir / defanged).
export function installChomperAnim(rig, scene, ch) {
  // --- pooled jaw overlay (created ONCE; self-positioned each frame) --------
  const jaw = scene.add.image(rig.host.x, rig.host.y, "chomper_jaw")
    .setDepth(DEPTH.entity + 2);
  jaw.setOrigin(0.06, 0.4); // hinge at the back corner so rotation opens the mouth
  rig._jaw = jaw;

  // --- preallocated scratch (ZERO per-frame allocation) ---------------------
  rig._t = ((ch.homeX | 0) % 700) / 350; // deterministic phase (s)
  rig._open = 0; // smoothed jaw opening (rad)

  rig.machine.hooks = {
    update(pose, status, dt) {
      const h = rig.host;
      if (!h || !h.body) { jaw.setVisible(false); return; }
      const dts = dt / 1000;
      rig._t += dts;
      const face = ch.dir || 1;

      if (ch.defanged) {
        // the toothless dozer texture carries the defanged read; jaw retires
        if (jaw.visible) jaw.setVisible(false);
        if (h.rotation !== 0) {
          h.rotation *= Math.max(0, 1 - dts * 6);
          if (Math.abs(h.rotation) < 0.005) h.rotation = 0;
        }
        return;
      }

      // target jaw opening + body tilt by SACRED state (read-only)
      let open = 0;
      let tilt = 0;
      if (ch.state === "tele") {
        const T = MOTION.CHOMP_TELE;
        open = T.open + Math.sin(rig._t * T.freq) * T.quiver;
        tilt = -face * MOTION.CHOMP_TILT.amp; // crouch back before the pounce
      } else if (ch.state === "lunge") {
        const L = MOTION.CHOMP_LUNGE;
        open = L.open * Math.abs(Math.sin(((rig._t * 1000) / L.dur) * Math.PI)); // snap-snap
        tilt = face * MOTION.CHOMP_TILT.amp;
      } else { // idle / rest: lazy chomp cycle
        const I = MOTION.CHOMP_IDLE;
        open = I.open * (0.5 + 0.5 * Math.sin(((rig._t * 1000) / I.dur) * Math.PI * 2));
      }

      // smooth toward the target (frame-rate independent ease) + place the jaw
      rig._open += (open - rig._open) * Math.min(1, dts * 14);
      h.rotation = tilt; // host rotation only — AABB/lunge hitbox unaffected
      const flip = face < 0;
      if (jaw.flipX !== flip) jaw.setFlipX(flip);
      // hinge sits at the mouth's back corner, mirrored by facing
      const hx = h.x + face * -20;
      const hy = h.y + 6;
      const c = Math.cos(h.rotation), s = Math.sin(h.rotation);
      const lx = hx - h.x, ly = hy - h.y;
      jaw.setPosition(h.x + lx * c - ly * s, h.y + lx * s + ly * c);
      jaw.rotation = h.rotation + face * rig._open;
      if (!jaw.visible) jaw.setVisible(true);
    },
  };

  // hide the pooled overlay if the host ever goes away (parity with A5's guard)
  rig.onHostRemoved = () => jaw.setVisible(false);
}
