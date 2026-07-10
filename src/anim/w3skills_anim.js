// Bolt Buddies — WORLD-3 SKILL ACTION OVERLAYS (W3W4 sprint M3).
//
// Hangs the MAGNET GLOVE / BUBBLE SHIELD action poses on a PLAYER rig, layered
// OVER the A2-A4 player set (installW3SkillAnim wraps the machine hook that
// installPlayerAnim installed, calls it first, then adds the W3 channels).
// Every beat is a pure VISUAL overlay on the instant W3 game logic that already
// ran (latch/cling/flip/bubble are resolved in GameScene.handleAction):
//   * ACTION FLASH — `rig.startW3Action(kind, dir)` plays a short one-shot at
//     the glove: an expanding magnet-arc pulse (magnet) or a blow-ring at the
//     mouth (bubble). Pooled objects, created ONCE, hidden at rest.
//   * CLING / DRAG POSE — while the host hangs from a steel rail the A4 arm
//     glyph reaches straight UP to the rail; while a crate is drag-latched it
//     reaches out AT the crate (pure pose channels; stepPlayerAction zeroes
//     them each frame, we re-aim after — parts are placed after the hook).
//
// GROUND RULES honoured: PHYSICS SACRED (pose channels + own pooled objects
// only — the body is untouched; the arm glyph is the proven A4 body-invariant
// part), ZERO per-frame allocation, CANVAS-SAFE drawn art, byte-identical
// under `?animoff=1` (the rig never updates, the overlays never show).

import { MOTION } from "./motion.js";

// The magnet action ARC, baked ONCE (canvas-safe): three nested field arcs.
function drawMagArc(g) {
  g.lineStyle(2.5, 0xff9e3d, 0.95);
  g.beginPath(); g.arc(0, 0, 6, -Math.PI / 3, Math.PI / 3); g.strokePath();
  g.lineStyle(2, 0xffb347, 0.75);
  g.beginPath(); g.arc(0, 0, 11, -Math.PI / 3.4, Math.PI / 3.4); g.strokePath();
  g.lineStyle(1.5, 0xffe0a8, 0.55);
  g.beginPath(); g.arc(0, 0, 16, -Math.PI / 3.8, Math.PI / 3.8); g.strokePath();
}

// Install on one PLAYER rig, AFTER installPlayerAnim (wraps its machine hook).
export function installW3SkillAnim(rig, scene) {
  const host = rig.host;

  // --- pooled one-shot overlays (created ONCE, hidden at rest) --------------
  const arc = scene.add.graphics();
  drawMagArc(arc);
  arc.setDepth(rig.depth + 1).setVisible(false);
  const ring = scene.add.graphics();
  ring.lineStyle(2.5, 0x9fe0ff, 0.9).strokeCircle(0, 0, 10);
  ring.lineStyle(1.2, 0xffffff, 0.8).strokeCircle(0, 0, 6);
  ring.setDepth(rig.depth + 1).setVisible(false);

  // single reused action descriptor (zero per-frame alloc)
  rig._w3act = { kind: "", t: 0, dur: 0, dir: 1, active: false };
  rig.startW3Action = (kind, dir) => {
    const a = rig._w3act;
    a.kind = kind;
    a.t = 0;
    a.dur = kind === "bubble" ? MOTION.BUBBLE_ACT.dur : MOTION.MAG_ACT.dur;
    a.dir = dir || host.facing || 1;
    a.active = true;
  };

  const base = rig.machine.hooks; // the A2-A4 player hook set — runs first
  rig.machine.hooks = {
    enter: base.enter,
    update(pose, status, dt) {
      base.update(pose, status, dt);

      // CLING / DRAG POSE: re-aim the A4 arm glyph (pose channels only; parts
      // are placed after this hook, so the re-aim wins for the frame).
      if (host.magCling) {
        pose.armA = 1;
        pose.armAng = -Math.PI / 2; // reach straight up to the rail
        pose.armLen = 1.15;
      } else if (host.magCrate) {
        const c = host.magCrate.img;
        pose.armA = 1;
        pose.armAng = Math.atan2(c.y - host.y, c.x - host.x); // reach at the crate
        pose.armLen = 1.3;
      }

      // one-shot ACTION FLASH envelopes
      const a = rig._w3act;
      if (!a.active) return;
      a.t += dt;
      const p = Math.min(1, a.t / a.dur);
      if (a.kind === "magnet") {
        arc.setVisible(true)
          .setPosition(host.x + a.dir * 16, host.y - 6)
          .setScale((0.6 + 0.9 * p) * (a.dir < 0 ? -1 : 1), 0.6 + 0.9 * p)
          .setAlpha(0.9 * (1 - p));
      } else {
        ring.setVisible(true)
          .setPosition(host.x + a.dir * 10, host.y - 10)
          .setScale(0.4 + 1.6 * p)
          .setAlpha(0.85 * (1 - p));
      }
      if (a.t >= a.dur) {
        a.active = false;
        arc.setVisible(false);
        ring.setVisible(false);
      }
    },
  };
}
