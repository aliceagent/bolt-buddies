// Bolt Buddies — WALL-WARDEN ANIMATION SET (Animation Sprint A7).
//
// A7 turns the A1 rig VISIBLE for the Wall-Warden. Every beat here is a pure VISUAL
// OVERLAY on the SACRED shove + defeat logic (GameScene.updateWorld2 owns the shove
// hitbox/push force/cooldown/timing, the alert-proximity semantics, the defeat
// trigger and the static collision body — ALL byte-identical; the 12-run 2-3 beat
// matrix reads w.img.x / w.img.y / w.facing / w.defeated, none of them touched here):
//   * IDLE SWAY — the P7 ±2° sway, RETIMED onto the MOTION token and MOVED off the
//     GameScene tween into the rig, so `?animoff=1` renders a truly static warden
//     (the A5/A6 A/B contract). Host ROTATION only — the Arcade static AABB ignores
//     rotation and the shove/defeat detection reads img.x/img.y, so the body + hitbox
//     are unmoved. Each warden gets an x-derived phase so the trio never sway in sync.
//   * VISOR SCAN-SWEEP GLINT — a pooled bright streak sweeps across the visor slit
//     ~every 5s, fired by the ONE shared fidget scheduler (staggered per warden; no
//     per-warden timer). Rides the host rotation + scale so it stays glued to the visor.
//   * ALERT STANCE-WIDEN — when a player is in FRONT within 3 tiles the warden spreads
//     its feet + grows slightly. A body-INVARIANT sprite SCALE: the static Arcade body
//     never follows a sprite's scale, and the shove/defeat detection reads img.x/img.y
//     (the origin, which scaling never moves) — so the collision box + shove geometry
//     are byte-identical (proven by the probe). Eased in/out; snapped off on defeat.
//   * SHOVE LUNGE + RECOIL — on the shove EDGE (read from the existing shoveCd going up)
//     the warden drives a forward lunge into CONTACT (synced with the t=0 "HMPH" the
//     shove already plays) then a damped follow-through recoil. Host ROTATION only, so
//     the shove push (p.setVelocity), the 500ms cooldown and the hitbox are untouched.
//   * DEFEAT — the topple BOUNCE + the ~2s-later comedy TWITCH are cosmetic overlays on
//     the existing GameScene topple tween (post-collision-disable). The rig hands the
//     host rotation back to that tween the frame w.defeated flips (returns early), after
//     snapping any stance-widen scale back to rest so the topple reads clean.
//
// GROUND RULES honoured: ENEMY LOGIC SACRED (this module only READS w.shoveCd /
// w.facing / w.defeated + player positions and writes the host ROTATION + a body-
// invariant SCALE + its OWN glint overlay — never the body/velocity/shove); ZERO
// per-frame allocation (all scratch preallocated on the rig; the player scan is a
// bare loop); pooled; CANVAS-SAFE (a drawn glint streak, not a tint state).

import { MOTION } from "./motion.js";
import { DEPTH } from "../constants.js";

const DEG = Math.PI / 180;
// A12 sweep: stance-widen + visor-glint params now come from MOTION (byte-identical):
//   WARDEN_STANCE.range/dy — alert trigger (player in FRONT within 3 tiles = 144px; 72px band).
//   WARDEN_STANCE.sx/sy    — widened scaleX (feet spread) + scaleY (slight grow).
//   WARDEN_STANCE.rate     — stance ease rate (per second).
//   WARDEN_GLINT.x0/x1/y   — visor-slit sweep start/end (host-local x, facing-mirrored) + vertical centre.

// One visor glint streak, baked ONCE (canvas-safe): a soft bright vertical bar with a
// hot core that reads as a highlight sweeping across the slit. Pivots at (0,0).
function drawGlint(g) {
  g.fillStyle(0xfff3b0, 0.85);
  g.fillRoundedRect(-2.5, -6, 5, 12, 2); // soft outer streak
  g.fillStyle(0xffffff, 0.9);
  g.fillRoundedRect(-1, -5, 2, 10, 1);   // hot core
}

// Install the visible Wall-Warden set on one WARDEN rig. Called once per warden from
// AnimSystem.registerWarden. `warden` is the GameScene warden record (owns the SACRED
// state we READ: shoveCd / facing / defeated).
export function installWardenAnim(rig, scene, warden) {
  const host = rig.host; // === warden.img

  // --- pooled visor glint (created ONCE; hidden until a scan-sweep fires) ------
  const glint = scene.add.graphics();
  drawGlint(glint);
  glint.setDepth(DEPTH.entity + 2);
  glint.setVisible(false);
  rig._glint = glint;

  // --- preallocated per-warden scratch (ZERO per-frame allocation) ------------
  rig._baseSX = host.scaleX < 0 ? -host.scaleX : host.scaleX; // baseline scale (1)
  rig._baseSY = host.scaleY < 0 ? -host.scaleY : host.scaleY;
  rig._swayT = host.x * 3;   // x-derived phase so the trio never sway in lockstep
  rig._stance = 0;           // smoothed stance-widen amount 0..1
  rig._prevCd = warden.shoveCd || 0; // shove-edge detector (shoveCd jumps up on a shove)
  rig._lungeT = 0;           // shove lunge/recoil timer (ms), counts down
  rig._glintT = 0; rig._glintDur = 0; // visor glint timer (fired by the shared scheduler)
  rig._lastSc = -1;          // cached applied scale (skip redundant setScale writes)
  rig._defeatDone = false;   // one-shot latch for the defeat hand-off

  // the shared scheduler treats an active fidget as a busy descriptor with a stop();
  // for the warden that is the visor glint (cleared by the hook when it elapses).
  rig._glintDesc = { stop() { rig._glintT = 0; rig._glintDur = 0; glint.setVisible(false); } };

  // shared-fidget-scheduler hook: fire a visor scan-sweep glint (staggered per warden
  // by the scheduler's register() offset). `tier` is ignored — a warden only glints.
  rig.startAnimFidget = () => {
    if (warden.defeated) return;
    rig._glintT = 0;
    rig._glintDur = MOTION.WARDEN_GLINT.dur;
    rig.activeFidget = rig._glintDesc; // mark busy so the scheduler waits for the gap
  };

  rig.machine.hooks = {
    update(pose, status, dt) {
      const h = rig.host;
      if (!h || !h.body) return;
      const w = warden;
      const dts = dt / 1000;

      // --- DEFEAT HAND-OFF: post-collision-disable, the GameScene topple tween owns
      // the host rotation (topple bounce + the ~2s twitch). Snap the stance-widen scale
      // back to rest ONCE so the topple reads clean, then stop writing rotation/scale.
      if (w.defeated) {
        if (!rig._defeatDone) {
          rig._defeatDone = true;
          h.setScale(rig._baseSX, rig._baseSY);
          rig._lastSc = -1;
          rig._lungeT = 0;
          glint.setVisible(false);
        }
        return;
      }

      // --- SHOVE LUNGE + RECOIL — edge-detect the SACRED shove (shoveCd jumps to 500).
      const cd = w.shoveCd || 0;
      if (cd > rig._prevCd + 0.5) rig._lungeT = MOTION.WARDEN_LUNGE.dur; // a shove just fired
      rig._prevCd = cd;
      let lunge = 0;
      if (rig._lungeT > 0) {
        rig._lungeT -= dt;
        const p = 1 - rig._lungeT / MOTION.WARDEN_LUNGE.dur; // 0..1 over the envelope
        // forward lunge into CONTACT (peak just after t=0 — synced with the shove's HMPH),
        // then a damped follow-through recoil rocking back to rest. Forward = w.facing.
        lunge = w.facing * MOTION.WARDEN_LUNGE.amp * Math.sin(p * Math.PI * 3) * (1 - p);
      }

      // --- IDLE SWAY (retimed onto the MOTION token) -------------------------
      rig._swayT += dt;
      const sway = MOTION.WARDEN_SWAY.amp *
        Math.sin((rig._swayT / MOTION.WARDEN_SWAY.dur) * Math.PI * 2);

      // rotation = idle sway + shove lunge/recoil. Host rotation only — the Arcade
      // static AABB ignores it and the shove/defeat detection reads img.x/img.y.
      h.rotation = sway + lunge;

      // --- ALERT STANCE-WIDEN — player in FRONT within 3 tiles => feet spread + grow.
      // Bare loop over the two players (no allocation). Body-invariant SCALE.
      let widen = 0;
      const ps = scene.players;
      const ST = MOTION.WARDEN_STANCE;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (!p || p.dead || p.carriedBy) continue;
        const dx = p.x - h.x, dy = p.y - h.y;
        if (Math.sign(dx) === w.facing && (dx < 0 ? -dx : dx) <= ST.range && (dy < 0 ? -dy : dy) <= ST.dy) {
          widen = 1; break;
        }
      }
      rig._stance += (widen - rig._stance) * Math.min(1, dts * ST.rate);
      const sx = rig._baseSX * (1 + (ST.sx - 1) * rig._stance);
      const sy = rig._baseSY * (1 + (ST.sy - 1) * rig._stance);
      if (sx !== rig._lastSc) { h.setScale(sx, sy); rig._lastSc = sx; } // skip redundant writes
      const sc = sx < 0 ? -sx : sx; // live scale magnitude for the glint offsets

      // --- VISOR GLINT — sweep the streak across the slit while a glint is active.
      if (rig._glintDur > 0) {
        rig._glintT += dt;
        const gp = rig._glintT / rig._glintDur;
        if (gp >= 1) { rig._glintDur = 0; rig.activeFidget = null; glint.setVisible(false); }
        else {
          const face = w.facing || 1;
          const G = MOTION.WARDEN_GLINT;
          const env = Math.sin(gp * Math.PI); // fade in across the slit, fade out
          const lx = (G.x0 + (G.x1 - G.x0) * gp) * face * sc;
          const ly = G.y * sc;
          const rot = h.rotation;
          const c = Math.cos(rot), s = Math.sin(rot);
          glint.x = h.x + lx * c - ly * s;
          glint.y = h.y + lx * s + ly * c;
          glint.rotation = rot;
          glint.setScale(sc, sc);
          glint.setAlpha(0.9 * env);
          if (!glint.visible) glint.setVisible(true);
        }
      }
    },
  };
}
