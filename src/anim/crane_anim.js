// Bolt Buddies — CRANE BOSS ANIMATION SET (Animation Sprint A8).
//
// A8 turns the A1 rig VISIBLE for the level 1-3 crane boss — the MOST timing-sensitive
// enemy in the game. Every beat here is a pure VISUAL OVERLAY on the SACRED crane fight
// STATE MACHINE + TIMINGS (GameScene.updateCrane owns c.state / c.timer / the telegraph
// (650ms)->slam->rest(2600ms)->rise->patrol(2000ms) cadence, the trolley path, the slam
// fall + its floor hitbox [reads b.x/b.y], the plate yank hitbox [findGrappleTarget reads
// pl.img.x/pl.img.y], the c.podsStomped 0/1/2/3 progression and the defeat trigger — ALL
// byte-identical; the 1-3 beat matrix is the drift guard). This module ONLY reads that
// state and writes to its OWN pooled overlays + the crane body's ROTATION / SCALE / the
// cable control-point OFFSET — never a position that any hitbox reads:
//
//   * CABLE SAG + SWING-LAG — the P7 static catenary is upgraded to a genuine pendulum:
//     a critically-ish damped spring tracks the trolley's mid-point so the drawn cable's
//     control point TRAILS the trolley velocity (lags + sways + settles). Pure visual —
//     computed here, written as c._cableSwingX / c._cableSagY offsets that updateCrane's
//     existing single cable draw adds (both default 0 => byte-identical to P7 when the
//     rig is OFF; ?animoff=1 never runs this, so the static P7 cable renders unchanged).
//   * CABIN KOBI EYE — the P7-baked cyan eye gets a pooled PUPIL that tracks the nearest
//     robot (eased), a metal LID that blinks occasionally (fired by the ONE shared fidget
//     scheduler, staggered), and a soft additive GLOW that dies on defeat. Overlays read
//     robot positions only; they ride the body rotation/scale so they stay in the socket.
//   * PLATE INVITE-WOBBLE — while the crane RESTS and a plate is still yankable it wobbles
//     invitingly. Host-local ROTATION on pl.img only (its x/y — the yank hitbox — is set
//     by updateCrane every frame and NEVER touched here), eased back to 0 when not resting.
//   * TELEGRAPH SHUDDER — a building shudder whose amplitude RAMPS across the existing
//     telegraph window (read from c.timer / 650) until the slam. Host ROTATION only, which
//     the slam hitbox (reads b.x/b.y) never sees. Reads the timing; never changes it.
//   * SLAM SQUASH + REBOUND — on the SACRED slam->rest impact edge, a damped squash/stretch
//     on the crane body. Body-invariant SCALE (origin-centred: b.x/b.y — the slam hitbox —
//     are unmoved), snaps back to rest.
//   * PLATE-YANK FLINCH — each time a plate detaches (podsStomped path) the crane FLINCHES:
//     a damped rotation kick (alternating sign). Host ROTATION only; the yank logic/hitbox
//     already ran (logic first, motion after).
//   * DEFEAT STAGED POWER-DOWN — an overlay on the existing defeat tween (which owns the
//     slump y + angle): the KOBI lamp/glow DIES (fades), one last DEFIANT shudder (a body-
//     invariant scale jitter — never fights the tween's rotation/position), then it settles.
//
// GROUND RULES honoured: FIGHT STATE MACHINE + TIMINGS SACRED (only READS c.state/c.timer/
// c.podsStomped/craneDefeated + robot positions; writes host rotation + body-invariant
// scale + the OWN eye overlays + the cable OFFSET — never the body position, the plate
// x/y, the slam hitbox, or any timer); ZERO per-frame allocation (all scratch preallocated;
// the nearest-robot scan is a bare loop); pooled; CANVAS-SAFE (drawn cable + drawn eye
// overlays + texture-free transforms, no tint-only states).

import Phaser from "phaser";
import { MOTION } from "./motion.js";
import { DEPTH } from "../constants.js";

// KOBI eye geometry, in crane-texture-local px relative to the body CENTRE (the crane
// texture is 132x76, origin centred; P7 bakes the eye socket at tex (66,28), so the eye
// centre sits 10px above the body centre). The pupil + lid + glow hang off this.
const EYE_LX = 0;
const EYE_LY = -10;

// One KOBI PUPIL, baked ONCE (canvas-safe): a dark pupil disc with a bright catchlight,
// matching the P7 baked eye. Pivots at (0,0) — the eye centre. Placed each frame.
function drawPupil(g) {
  g.fillStyle(0x0c1622, 1).fillCircle(0, 0, 3);        // pupil
  g.fillStyle(0xffffff, 0.9).fillCircle(-2.5, -2.5, 1.8); // catchlight (matches P7)
}
// One metal blink LID, baked ONCE: a socket-sized disc in the cabin-interior colour that
// scales vertically (0 = open, 1 = closed) over the eye to read as a quick shutter blink.
function drawLid(g) {
  g.fillStyle(0x232a42, 1).fillCircle(0, 0, 10.5);
  g.lineStyle(2, 0x4a5578, 1).strokeCircle(0, 0, 10.5);
}
// Soft additive KOBI eye GLOW, baked ONCE: a cyan halo that sits subtly over the iris and
// DIES on defeat (the "lamp goes out"). Additive so it reads as light under Canvas.
function drawGlow(g) {
  for (let r = 11; r > 0; r -= 2) g.fillStyle(0x39d7ff, 0.05 * (1 - r / 11)).fillCircle(0, 0, r);
}

// Install the visible crane set on the crane rig. `crane` is the GameScene crane record
// (owns the SACRED state we READ: state / timer / podsStomped / plates / trolley / body).
export function installCraneAnim(rig, scene, crane) {
  const b = rig.host; // === crane.body (the crane body Image, origin-centred, base scale 1)

  // --- pooled eye overlays (created ONCE) ------------------------------------
  const glow = scene.add.graphics(); drawGlow(glow);
  glow.setDepth(DEPTH.entity + 2).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  const pupil = scene.add.graphics(); drawPupil(pupil);
  pupil.setDepth(DEPTH.entity + 3).setVisible(false);
  const lid = scene.add.graphics(); drawLid(lid);
  lid.setDepth(DEPTH.entity + 4).setVisible(false);
  rig._eyeGlow = glow; rig._eyePupil = pupil; rig._eyeLid = lid;

  // --- preallocated per-crane scratch (ZERO per-frame allocation) ------------
  rig._cableX = crane.trolley.x;   // smoothed cable control-x (pendulum position)
  rig._cableV = 0;                 // cable control-x velocity (spring integrator)
  rig._lookX = 0; rig._lookY = 0;  // eased KOBI pupil offset (px)
  rig._blinkT = 0; rig._blinkDur = 0; // blink envelope (fired by the shared scheduler)
  rig._wobbleT = crane.body.x;     // plate-wobble phase seed (desync from crane x)
  rig._shudPhase = 0;              // telegraph shudder oscillator phase (ms)
  rig._prevState = crane.state;    // state-edge detector (slam->rest triggers the squash)
  rig._squashT = 0;                // slam squash envelope (ms, counts down)
  rig._flinchT = 0; rig._flinchDir = 1; // per-yank flinch envelope + alternating sign
  rig._prevAtt = crane.plates.length;   // attached-plate count (drop => a yank fired)
  rig._defeatMs = -1;              // staged power-down clock (ms since defeat; -1 = alive)
  rig._defeatDone = false;         // one-shot: hand rotation back to the defeat tween

  // seed the cable offsets so updateCrane reads a defined value on frame 0 (0 => P7 static)
  crane._cableSwingX = 0; crane._cableSagY = 0;

  // the shared scheduler treats an active fidget as a busy descriptor with a stop();
  // for the crane that is the KOBI blink (cleared by the hook when it elapses).
  rig._blinkDesc = { stop() { rig._blinkT = 0; rig._blinkDur = 0; lid.setVisible(false); } };

  // shared-fidget-scheduler hook: fire an occasional KOBI blink (staggered by register()).
  rig.startAnimFidget = () => {
    if (scene.craneDefeated) return;
    rig._blinkT = 0;
    rig._blinkDur = MOTION.CRANE_BLINK.dur;
    rig.activeFidget = rig._blinkDesc; // mark busy so the scheduler waits for the gap
  };

  rig.machine.hooks = {
    update(pose, status, dt) {
      const c = crane;
      const body = rig.host;
      if (!body || body.scene == null) return;
      const dts = dt / 1000;
      const st = c.state;
      const defeated = !!scene.craneDefeated;

      // =====================================================================
      // CABLE SAG + SWING-LAG — a damped spring tracks the trolley mid-point so the
      // drawn catenary control point TRAILS the trolley velocity (updateCrane draws it
      // next frame from c._cableSwingX / c._cableSagY; both 0 when the rig is off).
      // =====================================================================
      {
        const K = MOTION.CRANE_CABLE;
        const target = (c.trolley.x + body.x) / 2; // catenary mid-point x (matches updateCrane)
        // spring-damper integrate (stable at 60fps; zero alloc)
        rig._cableV += ((target - rig._cableX) * K.stiff - rig._cableV * K.damp) * dts;
        rig._cableX += rig._cableV * dts;
        let swing = rig._cableX - target;              // trailing lag/sway offset
        if (swing > K.swingMax) swing = K.swingMax; else if (swing < -K.swingMax) swing = -K.swingMax;
        c._cableSwingX = swing;
        let sag = (swing < 0 ? -swing : swing) * K.sagK; // the cable bows out while it sways
        if (sag > K.sagMax) sag = K.sagMax;
        c._cableSagY = sag;
      }

      // =====================================================================
      // DEFEAT STAGED POWER-DOWN — overlay on the existing defeat tween (owns b.y + b.angle).
      // Hand rotation back to the tween ONCE; then drive lamp-death + a body-invariant
      // defiant SCALE shudder + settle off a single clock. Never writes rotation/position.
      // =====================================================================
      if (defeated) {
        if (!rig._defeatDone) {
          rig._defeatDone = true;
          rig._defeatMs = 0;
          rig._flinchT = 0; rig._squashT = 0; // drop any live fight overlay so the topple reads clean
          pupil.setVisible(false); lid.setVisible(false);
          if (body.scaleX !== 1 || body.scaleY !== 1) body.setScale(1, 1); // clear any leftover squash (scale is tween-free)
          // NOTE: rotation is NOT reset — the defeat tween (created in stompPod BEFORE the rig
          // ran) owns b.angle now and interpolates from its own captured start to 8°.
        }
        rig._defeatMs += dt;
        const D = MOTION.CRANE_DEFEAT;
        // lamp dies: the KOBI glow fades out over the first beat
        const lampP = rig._defeatMs / D.lampDur;
        if (lampP < 1) { glow.setAlpha(1 - lampP); placeGlow(); }
        else if (glow.visible) glow.setVisible(false);
        // one last DEFIANT shudder — a body-invariant scale jitter (never touches the
        // tween's rotation/position), then settle to rest scale.
        const ds = rig._defeatMs - D.defiantAt;
        if (ds >= 0 && ds <= D.defiantDur) {
          const p = ds / D.defiantDur;
          const j = D.defiantAmp * Math.sin(p * Math.PI * 4) * (1 - p);
          body.setScale(1 + j, 1 - j);
        } else if (ds > D.defiantDur) {
          if (body.scaleX !== 1 || body.scaleY !== 1) body.setScale(1, 1); // settle
        }
        rig._prevState = st;
        rig._prevAtt = attachedCount(c);
        return;
      }

      // =====================================================================
      // KOBI EYE — pupil tracks the nearest robot (eased); a metal lid blinks; the glow
      // sits subtly over the iris. All ride the body rotation/scale to stay in the socket.
      // =====================================================================
      const eyeLive = st !== "dead";
      if (eyeLive) {
        // nearest alive robot to the eye (bare loop — no alloc)
        const ps = scene.players;
        const scMag = body.scaleX < 0 ? -body.scaleX : body.scaleX;
        const rot = body.rotation || 0, cr = Math.cos(rot), sr = Math.sin(rot);
        const exW = body.x + (EYE_LX * cr - EYE_LY * sr) * scMag;
        const eyW = body.y + (EYE_LX * sr + EYE_LY * cr) * scMag;
        let tx = 0, ty = 0, best = Infinity, found = false;
        for (let i = 0; i < ps.length; i++) {
          const p = ps[i];
          if (!p || p.dead) continue;
          const dx = p.x - exW, dy = p.y - eyW, d2 = dx * dx + dy * dy;
          if (d2 < best) { best = d2; tx = dx; ty = dy; found = true; }
        }
        let gx = 0, gy = 0;
        if (found) {
          const inv = 1 / Math.sqrt(best || 1);
          gx = tx * inv * MOTION.CRANE_EYE.range;
          gy = ty * inv * MOTION.CRANE_EYE.range;
        }
        const e = Math.min(1, dts * MOTION.CRANE_EYE.ease);
        rig._lookX += (gx - rig._lookX) * e;
        rig._lookY += (gy - rig._lookY) * e;
        // pupil world position = eye centre + eased look, riding rotation + scale
        const plx = (EYE_LX * scMag) + rig._lookX, ply = (EYE_LY * scMag) + rig._lookY;
        pupil.x = body.x + plx * cr - ply * sr;
        pupil.y = body.y + plx * sr + ply * cr;
        pupil.rotation = rot; pupil.setScale(scMag);
        pupil.setVisible(true);
        // glow anchored to the eye centre (no look offset — it's the socket light)
        placeGlow();
        if (!glow.visible) { glow.setAlpha(1); glow.setVisible(true); }

        // BLINK — the metal lid scales vertically over the eye while a blink is active.
        if (rig._blinkDur > 0) {
          rig._blinkT += dt;
          const bp = rig._blinkT / rig._blinkDur;
          if (bp >= 1) { rig._blinkDur = 0; rig.activeFidget = null; lid.setVisible(false); }
          else {
            const close = Math.sin(bp * Math.PI); // open -> shut -> open
            lid.x = pupil.x; lid.y = pupil.y; lid.rotation = rot;
            lid.setScale(scMag, scMag * close);
            lid.setVisible(true);
          }
        }
      } else {
        pupil.setVisible(false); lid.setVisible(false); glow.setVisible(false);
      }

      // helper: place the glow at the eye centre (defined here to close over locals)
      function placeGlow() {
        const scMag = body.scaleX < 0 ? -body.scaleX : body.scaleX;
        const rot = body.rotation || 0, cr = Math.cos(rot), sr = Math.sin(rot);
        const lx = EYE_LX * scMag, ly = EYE_LY * scMag;
        glow.x = body.x + lx * cr - ly * sr;
        glow.y = body.y + lx * sr + ly * cr;
        glow.rotation = rot; glow.setScale(scMag);
      }

      // =====================================================================
      // PLATE INVITE-WOBBLE — attached plates wobble while the crane RESTS. Rotation on
      // pl.img ONLY (its x/y — the yank hitbox — is set by updateCrane, never here).
      // =====================================================================
      rig._wobbleT += dt;
      {
        const W = MOTION.CRANE_WOBBLE;
        const plates = c.plates;
        for (let i = 0; i < plates.length; i++) {
          const pl = plates[i];
          if (!pl.attached || !pl.img || pl.img.scene == null) continue;
          let target = 0;
          if (st === "rest") {
            // per-plate phase (i offset) so the trio wobble out of sync
            target = W.amp * Math.sin((rig._wobbleT / W.dur) * Math.PI * 2 + i * 2.1);
          }
          // ease rotation toward the target (0 when not resting) — visual only
          pl.img.rotation += (target - pl.img.rotation) * Math.min(1, (dt / 1000) * 10);
        }
      }

      // =====================================================================
      // TELEGRAPH SHUDDER (ramps) + SLAM SQUASH + PLATE-YANK FLINCH — all compose onto the
      // crane BODY via ROTATION (shudder+flinch, AABB/slam-hitbox-safe) and body-invariant
      // SCALE (squash). The fight logic already ran this frame; this only reads its state.
      // =====================================================================
      rig._shudPhase += dt;

      // telegraph shudder: amplitude ramps as c.timer counts 650 -> 0 (reads the SACRED
      // telegraph duration; the telegraph enters with timer=650 so ramp = 1 - timer/650).
      let shudder = 0;
      if (st === "telegraph") {
        const S = MOTION.CRANE_SHUDDER;
        const ramp = Math.min(1, Math.max(0, 1 - c.timer / 650));
        shudder = S.amp * ramp * Math.sin(rig._shudPhase * S.freq / 1000 * Math.PI * 2);
      }

      // slam squash: fire on the slam->rest impact edge; damped compress -> rebound.
      if (rig._prevState === "slam" && st === "rest") rig._squashT = MOTION.CRANE_SQUASH.dur;
      let sqx = 1, sqy = 1;
      if (rig._squashT > 0) {
        rig._squashT -= dt;
        const Q = MOTION.CRANE_SQUASH;
        const p = 1 - rig._squashT / Q.dur;          // 0..1 over the envelope
        const env = Math.cos(p * Math.PI * 2) * (1 - p); // impact compress -> overshoot -> settle
        sqx = 1 + Q.sx * env;                         // wider on impact
        sqy = 1 - Q.sy * env;                         // shorter on impact
      }

      // plate-yank flinch: a plate detaching (attached count dropping) kicks a damped rock.
      const att = attachedCount(c);
      if (att < rig._prevAtt) { rig._flinchT = MOTION.CRANE_FLINCH.dur; rig._flinchDir = -rig._flinchDir; }
      rig._prevAtt = att;
      let flinch = 0;
      if (rig._flinchT > 0) {
        rig._flinchT -= dt;
        const F = MOTION.CRANE_FLINCH;
        const p = 1 - rig._flinchT / F.dur;
        flinch = rig._flinchDir * F.amp * Math.sin(p * Math.PI * 3) * (1 - p);
      }

      // compose: host ROTATION (shudder + flinch) leaves b.x/b.y untouched (slam + plate
      // hitboxes SACRED); body-invariant SCALE (squash) is origin-centred (b.x/b.y unmoved).
      body.rotation = shudder + flinch;
      if (body.scaleX !== sqx || body.scaleY !== sqy) body.setScale(sqx, sqy);

      rig._prevState = st;
    },
  };
}

// attached-plate count — a bare loop (no alloc), used for the flinch edge-detect.
function attachedCount(c) {
  let n = 0;
  const plates = c.plates;
  for (let i = 0; i < plates.length; i++) if (plates[i].attached) n++;
  return n;
}
