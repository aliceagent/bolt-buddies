// Bolt Buddies — PATROL ROLLER ANIMATION SET (Animation Sprint A6).
//
// A6 turns the A1 rig VISIBLE for the Patrol Roller. Every beat here is a pure
// VISUAL OVERLAY on the SACRED patrol + detection-beam + alert/zap logic, which
// GameScene.updateWorld2 owns and which stays BYTE-IDENTICAL (the 12-run beat
// matrix reads r.img.x / r.dir / r.state / r.beamRect — none of them touched here):
//   * WHEEL SPIN — the P7 spoke-dot wheels rotate at a rate matched to the roller's
//     real velocity (direction + speed): faster patrol => faster roll, a stopped
//     roller's wheels freeze. Rotation on the separate wheel overlays is AABB-safe.
//   * PUPIL TRACK / SNAP / DILATE — the P7 sliding pupil now SMOOTHLY eases toward the
//     patrol direction while patrolling, and SNAPS to aim at the spotted player the
//     instant the roller is alert (reads the beam's resolved target, cached as r._seen).
//     The iris DILATES (pupil overlay scales up) on alert. All on the pupil overlay —
//     never the body.
//   * KLAXON SWEEP — a pooled rotating beacon light over the cab lamp spins while the
//     roller is alerted (visual-only; the P7 lamp lit/unlit texture swap stays in
//     GameScene as the meaning-bearing telegraph). Hidden when not alert.
//   * "HMM?" HEAD-TILT + SQUINT — when the roller loses line of sight (the alert->patrol
//     transition) it cocks its cab and squints its pupil for ~1s. The tilt rides the
//     HOST rotation, which the Arcade AABB ignores, and the beam origin is (img.x, img.y)
//     which rotation never moves — so the body + beam are unaffected (proven by the probe).
//   * ZAP RECOIL — when the roller discharges (the alert->cool transition, i.e. right
//     after the zap fires) the cab kicks back with a damped rock that returns to rest.
//     Rotation-only, so the zap hitbox/timing and beam geometry are untouched.
//
// GROUND RULES honoured: ENEMY LOGIC + BEAM SACRED (this module only READS r.state /
// r.dir / r._seen and writes to the wheel/pupil/lamp OVERLAYS + host ROTATION, never
// the body/velocity/beam); ZERO per-frame allocation (all scratch preallocated on the
// rig; the beacon graphics is baked ONCE); pooled; CANVAS-SAFE (drawn/texture parts).

import { MOTION } from "./motion.js";
import { DEPTH } from "../constants.js";

const DEG = Math.PI / 180;
// wheel roll: degrees turned per px of body travel. ~8°/px reads as a true roll at
// the 58px/s patrol speed (a lively ~460°/s) and clearly scales with |vx|.
const ROLL_DEG_PER_PX = 8;
const PUPIL_SLIDE = 14;     // patrol pupil x-offset the eye eases toward (matches P7)
const PUPIL_TRACK = 9;      // pupil ease rate (per second) toward the patrol target
const PUPIL_AIM_X = 13;     // max pupil x reach when snapping to a spotted player
const PUPIL_AIM_Y = 5;      // max pupil y reach (sclera is short — clamp tight)
const DILATE_ALERT = 1.55;  // iris dilation (pupil scale) on alert
const DILATE_EASE = 12;     // dilation ease rate (per second)
const KLAXON_SPIN = 760;    // klaxon beacon sweep speed (deg/s) while alerted

// One klaxon beacon sweep, baked ONCE (canvas-safe): a bright twin light-bar that
// reads as a rotating warning beacon when spun. Pivots at its centre (0,0).
function drawKlaxon(g) {
  g.fillStyle(0xff5566, 0.9);
  g.fillTriangle(0, 0, 9, -3, 9, 3);   // one sweep lobe
  g.fillTriangle(0, 0, -9, -3, -9, 3); // the opposing lobe
  g.fillStyle(0xffd0d0, 1);
  g.fillCircle(0, 0, 2);               // hot core
}

// Install the visible Patrol Roller set on one ROLLER rig. Called once per roller
// from AnimSystem.registerRoller. `roller` is the GameScene roller record (owns the
// SACRED state we READ: state / dir / pupil / wheels / lamp / _seen).
export function installRollerAnim(rig, scene, roller) {
  const host = rig.host; // === roller.img

  // --- pooled klaxon beacon (created ONCE; hidden until an alert) -------------
  const klax = scene.add.graphics();
  drawKlaxon(klax);
  klax.setDepth(DEPTH.entity + 2);
  klax.setVisible(false);
  rig._klax = klax;

  // --- preallocated per-roller scratch (ZERO per-frame allocation) -----------
  rig._wheelDeg = 0;    // wheel roll accumulator (deg), ∝ body travel
  rig._pupilX = roller.dir * PUPIL_SLIDE; // smoothed pupil offset (start at rest slide)
  rig._pupilY = 0;
  rig._dilate = 1;      // smoothed iris dilation
  rig._klaxDeg = 0;     // klaxon sweep angle (deg) while alerted
  rig._prevState = roller.state; // for edge-detecting LOS-break / zap transitions
  rig._hmmT = 0;        // "hmm?" head-tilt + squint timer (ms), counts down
  rig._recoilT = 0;     // zap recoil timer (ms), counts down

  rig.machine.hooks = {
    update(pose, status, dt) {
      const h = rig.host;
      if (!h || !h.body) return;
      const r = roller;
      const dts = dt / 1000;
      const vx = status.vx;
      const alert = r.state === "alert";

      // --- EDGE-DETECT the SACRED transitions (read-only) ---------------------
      const prev = rig._prevState;
      if (prev === "alert" && r.state === "patrol") rig._hmmT = MOTION.ROLLER_HMM.dur;   // LOS break
      if (prev === "alert" && r.state === "cool") rig._recoilT = MOTION.ROLLER_RECOIL.dur; // zapped
      rig._prevState = r.state;

      // --- WHEEL SPIN ∝ velocity (direction + speed) -------------------------
      rig._wheelDeg += vx * ROLL_DEG_PER_PX * dts;
      if (rig._wheelDeg >= 360 || rig._wheelDeg <= -360) rig._wheelDeg %= 360;
      r.wheels[0].setAngle(rig._wheelDeg);
      r.wheels[1].setAngle(rig._wheelDeg);

      // --- "HMM?" HEAD-TILT + ZAP RECOIL (host rotation — AABB/beam-safe) -----
      let tilt = 0, squint = 1;
      if (rig._hmmT > 0) {
        rig._hmmT -= dt;
        const p = 1 - rig._hmmT / MOTION.ROLLER_HMM.dur; // 0..1 over the hold
        // ease in, hold cocked, ease out; a curious cock toward the lost bearing.
        const env = Math.sin(Math.min(1, p * 1.35) * Math.PI); // rise-hold-fall
        tilt += -r.dir * MOTION.ROLLER_HMM.amp * env;
        squint = 1 - 0.45 * env; // question-squint (pupil vertical pinch)
      }
      if (rig._recoilT > 0) {
        rig._recoilT -= dt;
        const p = 1 - rig._recoilT / MOTION.ROLLER_RECOIL.dur;
        // damped rock: sharp kick back off the discharge, settling to rest.
        tilt += r.dir * MOTION.ROLLER_RECOIL.amp * Math.sin(p * Math.PI * 3) * (1 - p);
      }
      h.rotation = tilt; // host rotation only — Arcade AABB ignores it; beam uses x/y

      // --- PUPIL TRACK / SNAP / DILATE (pupil overlay only) ------------------
      if (alert && r._seen) {
        // SNAP: aim the pupil straight at the spotted player (immediate, not eased).
        const dx = r._seen.x - h.x, dy = r._seen.y - (h.y - 5);
        const inv = 1 / Math.max(1, Math.sqrt(dx * dx + dy * dy));
        rig._pupilX = dx * inv * PUPIL_AIM_X;
        rig._pupilY = dy * inv * PUPIL_AIM_Y;
      } else {
        // TRACK: smoothly ease toward the patrol-direction rest offset.
        const k = Math.min(1, dts * PUPIL_TRACK);
        rig._pupilX += (r.dir * PUPIL_SLIDE - rig._pupilX) * k;
        rig._pupilY += (0 - rig._pupilY) * k;
      }
      const dilTarget = alert ? DILATE_ALERT : 1;
      rig._dilate += (dilTarget - rig._dilate) * Math.min(1, dts * DILATE_EASE);
      // place the pupil at the eye centre + its offset, rotated by the head-tilt so
      // it stays glued to the tilting KOBI sclera (baked into the host texture).
      const c = Math.cos(h.rotation), s = Math.sin(h.rotation);
      const ox = rig._pupilX, oy = rig._pupilY - 5; // -5: eye sits above the body centre
      r.pupil.setPosition(h.x + ox * c - oy * s, h.y + ox * s + oy * c);
      r.pupil.setScale(rig._dilate, rig._dilate * squint);
      r.pupil.setRotation(h.rotation);

      // --- KLAXON SWEEP — spins over the cab lamp while alerted ---------------
      if (alert) {
        rig._klaxDeg += KLAXON_SPIN * dts;
        if (rig._klaxDeg >= 360) rig._klaxDeg %= 360;
        klax.setPosition(h.x, h.y - 21).setAngle(rig._klaxDeg);
        if (!klax.visible) klax.setVisible(true);
      } else if (klax.visible) {
        klax.setVisible(false);
      }
    },
  };
}
