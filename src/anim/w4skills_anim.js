// Bolt Buddies — WORLD-4 SKILL ACTION OVERLAYS (W3W4 sprint M4).
//
// Hangs the TIME-FREEZE / LIGHT-BEAM action poses on a PLAYER rig, layered
// OVER the A2-A4 player set (installW4SkillAnim wraps the machine hook that
// installPlayerAnim installed, calls it first, then adds the W4 channels).
// Every beat is a pure VISUAL overlay on the instant W4 game logic that already
// ran (castFreeze/setBeam are resolved in GameScene):
//   * ACTION FLASH — `rig.startW4Action(kind, dir)` plays a short one-shot at
//     the hand: an expanding frost star (freeze) or a warm ignition ring at the
//     lamp hand (beam). Pooled objects, created ONCE, hidden at rest.
//   * BEAM HOLD POSE — while the host's beam is lit the A4 arm glyph aims
//     ALONG the cone (facing or straight up) — the "holding the flashlight"
//     read (pure pose channels; the base hook zeroes them each frame, we
//     re-aim after — parts are placed after the hook).
//
// GROUND RULES honoured: PHYSICS SACRED (pose channels + own pooled objects
// only — the body is untouched; the arm glyph is the proven A4 body-invariant
// part), ZERO per-frame allocation, CANVAS-SAFE drawn art, byte-identical
// under `?animoff=1` (the rig never updates, the overlays never show).

import { MOTION } from "./motion.js";

// The freeze action FROST STAR, baked ONCE (canvas-safe): six ice arms.
function drawFrostStar(g) {
  g.lineStyle(2.5, 0x9fd8ff, 0.95);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.lineBetween(0, 0, Math.cos(a) * 12, Math.sin(a) * 12);
  }
  g.lineStyle(1.5, 0xe8f6ff, 0.8);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    g.lineBetween(Math.cos(a) * 5, Math.sin(a) * 5, Math.cos(a) * 9, Math.sin(a) * 9);
  }
}

// Install on one PLAYER rig, AFTER installPlayerAnim (wraps its machine hook).
export function installW4SkillAnim(rig, scene) {
  const host = rig.host;

  // --- pooled one-shot overlays (created ONCE, hidden at rest) --------------
  const star = scene.add.graphics();
  drawFrostStar(star);
  star.setDepth(rig.depth + 1).setVisible(false);
  const ring = scene.add.graphics();
  ring.lineStyle(2.5, 0xffe08a, 0.9).strokeCircle(0, 0, 10);
  ring.lineStyle(1.2, 0xfff6d8, 0.8).strokeCircle(0, 0, 6);
  ring.setDepth(rig.depth + 1).setVisible(false);

  // single reused action descriptor (zero per-frame alloc)
  rig._w4act = { kind: "", t: 0, dur: 0, dir: 1, active: false };
  rig.startW4Action = (kind, dir) => {
    const a = rig._w4act;
    a.kind = kind;
    a.t = 0;
    a.dur = kind === "freeze" ? MOTION.FREEZE_ACT.dur : MOTION.BEAM_ACT.dur;
    a.dir = dir || host.facing || 1;
    a.active = true;
  };

  const base = rig.machine.hooks; // the A2-A4 player hook set — runs first
  rig.machine.hooks = {
    enter: base.enter,
    update(pose, status, dt) {
      base.update(pose, status, dt);

      // BEAM HOLD POSE: aim the A4 arm glyph along the lit cone (pose channels
      // only; parts are placed after this hook, so the re-aim wins the frame).
      if (host.beamOn) {
        pose.armA = 1;
        pose.armAng = host.beamAim || 0;
        pose.armLen = 1.2;
      }

      // one-shot ACTION FLASH envelopes
      const a = rig._w4act;
      if (!a.active) return;
      a.t += dt;
      const p = Math.min(1, a.t / a.dur);
      if (a.kind === "freeze") {
        star.setVisible(true)
          .setPosition(host.x + a.dir * 14, host.y - 12)
          .setScale(0.5 + 1.7 * p)
          .setRotation(p * 1.2)
          .setAlpha(0.95 * (1 - p));
      } else {
        ring.setVisible(true)
          .setPosition(host.x + a.dir * 12, host.y - 10)
          .setScale(0.4 + 1.3 * p)
          .setAlpha(0.85 * (1 - p));
      }
      if (a.t >= a.dur) {
        a.active = false;
        star.setVisible(false);
        ring.setVisible(false);
      }
    },
  };
}
