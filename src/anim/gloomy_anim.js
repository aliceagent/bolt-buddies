// Bolt Buddies — GLOOMY ANIMATION SET (W3W4 sprint M4).
//
// Turns the A1 rig VISIBLE for the World-4 gloomy. Every beat is a pure
// VISUAL OVERLAY on the SACRED drift/flee/jam logic, which
// GameScene.updateWorld4 owns and which stays BYTE-IDENTICAL (the logic reads
// gl.scared / gl.img.x / the contact distances — none of them are touched here):
//   * WISP TRAIL — three pooled drawn shadow-wisp parts trail under the dome on
//     the A5 `feeler` part channel (base splay ± the shared pose.feelerBend), so
//     they billow on a sine. The billow goes FRANTIC while the gloomy is dazzled
//     (fleeing the light) and settles to a slow drift while lurking.
//   * LURK BOB — a gentle host-ROTATION sway while drifting (the Arcade AABB
//     ignores rotation; contact checks read img.x/img.y, never rotation).
//   * FLEE SHIVER — a fast decaying rotation shiver the instant the beam
//     dazzles it (state edge-detected read-only).
//   * FREEZE HOLD — while the scene is frozen the rig writes NOTHING (the whole
//     tableau stands still, matching the held device logic).
//
// GROUND RULES honoured: ENEMY LOGIC SACRED (reads gl.scared only; writes parts
// + host rotation), ZERO per-frame allocation, pooled parts created ONCE,
// CANVAS-SAFE drawn art, `?animoff=1` renders the gloomy static with a
// byte-identical body (the A5/A6 A/B contract).

import { MOTION } from "./motion.js";

// Install the visible gloomy set on one GLOOMY rig. `gloomy` is the GameScene
// gloomy record (owns the SACRED state we READ: scared / homeX / img).
export function installGloomyAnim(rig, scene, gloomy) {
  // --- pooled wisp parts (created ONCE, feeler channel) ----------------------
  const layout = [
    { x: -9, base: 0.24, side: 1 },
    { x: 0, base: 0, side: -1 },
    { x: 9, base: -0.24, side: 1 },
  ];
  layout.forEach((L, i) => {
    const part = rig.addPart(`wisp${i}`, "gloom_wisp", { x: L.x, y: 11 }, {
      feeler: { base: L.base, side: L.side },
    });
    part.obj.setOrigin(0.5, 0.1); // hinge at the skirt so rotation reads as billow
  });

  // --- preallocated scratch (ZERO per-frame allocation) ----------------------
  rig._t = ((gloomy.homeX * 17 + gloomy.homeY * 11) % 628) / 100; // deterministic phase (s)
  rig._wasScared = false;
  rig._shiver = 0; // decaying dazzle-shiver energy

  rig.machine.hooks = {
    update(pose, status, dt) {
      const h = rig.host;
      if (!h || !h.body) return;
      // FREEZE HOLD: a frozen world means a frozen gloomy — the rig writes
      // nothing so the tableau is perfectly still (visual only; logic is
      // already gated in updateWorld4).
      if (scene.frozen) return;
      const dts = dt / 1000;
      rig._t += dts;

      // edge-detect the SACRED lurk->dazzled transition (read-only)
      const scared = gloomy.scared > 0;
      if (scared && !rig._wasScared) rig._shiver = 1;
      rig._wasScared = scared;
      rig._shiver = Math.max(0, rig._shiver - dts * 2.4);

      // lurk bob / flee shiver — host ROTATION only (AABB-safe)
      const B = MOTION.GLOOM_BOB;
      const bob = Math.sin(((rig._t * 1000) / B.dur) * Math.PI * 2) * B.amp;
      const shiver = rig._shiver * Math.sin(rig._t * 46) * 0.12;
      h.rotation = bob + shiver;

      // wisp billow: shared feeler bend, rate/amp by state
      const W = MOTION.GLOOM_WISP;
      const freq = ((Math.PI * 2 * 1000) / W.dur) * (scared ? MOTION.GLOOM_FLEE.freqMul : 1);
      const amp = W.amp * (scared ? MOTION.GLOOM_FLEE.ampMul : 1);
      pose.feelerBend = Math.sin(rig._t * freq) * amp;
    },
  };
}
