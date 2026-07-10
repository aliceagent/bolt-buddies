// Bolt Buddies — ZAP-JELLY ANIMATION SET (W3W4 sprint M3).
//
// Turns the A1 rig VISIBLE for the World-3 zap-jelly. Every beat is a pure
// VISUAL OVERLAY on the SACRED patrol/knock/socket logic, which
// GameScene.updateWorld3 owns and which stays BYTE-IDENTICAL (probes read
// j.state / j.img.x / the contact distances — none of them are touched here):
//   * TENTACLE WAVE — four pooled drawn tentacle parts dangle under the dome on
//     the A5 `feeler` part channel (base splay ± the shared pose.feelerBend), so
//     they scissor-sway on a sine. The wave goes FRANTIC while the jelly is
//     knocked flying and settles to a contented drift once socketed.
//   * DOME WOBBLE — a gentle host-ROTATION wobble while patrolling (the Arcade
//     AABB ignores rotation; contact checks read img.x/img.y, never rotation).
//   * KNOCK SPIN — a decaying spin kick the instant the jelly is knocked
//     (state edge-detected read-only), righting itself as the knock decays.
//
// GROUND RULES honoured: ENEMY LOGIC SACRED (reads j.state only; writes parts +
// host rotation), ZERO per-frame allocation (phases/scratch preallocated),
// pooled parts created ONCE, CANVAS-SAFE drawn art, `?animoff=1` renders the
// jelly static with a byte-identical body (the A5/A6 A/B contract).

import { MOTION } from "./motion.js";

// Install the visible zap-jelly set on one JELLY rig. `jelly` is the GameScene
// jelly record (owns the SACRED state we READ: state / dir / minX / maxX).
export function installJellyAnim(rig, scene, jelly) {
  // --- pooled tentacle parts (created ONCE, feeler channel) -----------------
  // base = each tentacle's resting splay; side alternates so the shared bend
  // scissors neighbours against each other (reads as a rippling skirt).
  const layout = [
    { x: -12, base: 0.22, side: 1 },
    { x: -4, base: 0.07, side: -1 },
    { x: 4, base: -0.07, side: 1 },
    { x: 12, base: -0.22, side: -1 },
  ];
  layout.forEach((L, i) => {
    const part = rig.addPart(`tent${i}`, "jelly_tent", { x: L.x, y: 10 }, {
      feeler: { base: L.base, side: L.side },
    });
    part.obj.setOrigin(0.5, 0.08); // hinge at the skirt so rotation reads as sway
  });

  // --- preallocated scratch (ZERO per-frame allocation) ---------------------
  rig._t = ((jelly.minX * 13 + jelly.maxX * 7) % 628) / 100; // deterministic phase (s)
  rig._prevState = jelly.state;
  rig._spin = 0; // decaying knock-spin velocity (rad/s)

  rig.machine.hooks = {
    update(pose, status, dt) {
      const h = rig.host;
      if (!h || !h.body) return;
      const dts = dt / 1000;
      rig._t += dts;

      // edge-detect the SACRED patrol->knocked transition (read-only)
      if (rig._prevState !== "knocked" && jelly.state === "knocked") {
        rig._spin = (h.body.velocity.x >= 0 ? 1 : -1) * 6; // kick with the knock
      }
      rig._prevState = jelly.state;

      // dome wobble / knock spin — host ROTATION only (AABB-safe)
      if (jelly.state === "patrol") {
        const W = MOTION.JELLY_WOBBLE;
        h.rotation = Math.sin(((rig._t * 1000) / W.dur) * Math.PI * 2) * W.amp;
      } else if (jelly.state === "knocked") {
        rig._spin *= Math.max(0, 1 - dts * 3.2); // decay toward upright
        h.rotation = h.rotation * Math.max(0, 1 - dts * 2.4) + rig._spin * dts;
      } else if (h.rotation !== 0) {
        h.rotation *= Math.max(0, 1 - dts * 6); // socketed: settle upright
        if (Math.abs(h.rotation) < 0.005) h.rotation = 0;
      }

      // tentacle wave: shared feeler bend, rate/amp by state
      const S = MOTION.JELLY_SWAY;
      const freq = (Math.PI * 2 * 1000) / S.dur *
        (jelly.state === "knocked" ? MOTION.JELLY_KNOCK.freqMul : 1);
      const amp = S.amp *
        (jelly.state === "knocked" ? MOTION.JELLY_KNOCK.ampMul
          : jelly.state === "socketed" ? MOTION.JELLY_SOCK.ampMul : 1);
      pose.feelerBend = Math.sin(rig._t * freq) * amp;
    },
  };
}
