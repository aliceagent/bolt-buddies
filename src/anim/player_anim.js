// Bolt Buddies — PLAYER LOCOMOTION SET (Animation Sprint A2).
//
// Turns the A1 rig VISIBLE for the two player robots: a tread-scroll overlay
// matched to vx, a body bob synced to the tread period, a forward walk lean, a
// skid dig-in + dust when reversing, and the jump/apex/fall/land air poses
// (visor pupils + antenna trail). Everything is a pure visual OVERLAY on the A1
// pose machine — the jump/movement LOGIC is untouched in Player.js and fires
// instantly, so nothing here can delay or eat input (cancelability preserved).
//
// GROUND RULES honoured:
//   * PHYSICS IS SACRED — bob/lean/micro-squash are applied through
//     Player.applyLocomotion(), which composes them onto baseScale + the squash
//     tweens and lets Player._syncBody counter-correct the body so its size and
//     WORLD position are byte-identical to the un-animated frame. Body geometry
//     never drifts (the beat matrix + the A2 probe are the guards).
//   * ZERO per-frame allocation — parts are pooled (created ONCE here), the pose
//     channels are mutated in place, dust routes through the shared pooled emitter
//     under the P11 budget guard (scene.fxBudget). Only primitive math per frame.
//   * CANCELABLE — logic first (Player.preUpdate), motion after (this runs from the
//     rig at the end of the scene update). The jump squat is coordinated with the
//     existing jumpStretch; landing recovery defers scale to the existing
//     landSquash (never doubled).
//   * CANVAS-SAFE — a drawn TileSprite tread + drawn pupil/antenna overlays + pose
//     transforms; no tint-only states.

import { MOTION } from "./motion.js";

// framerate-independent approach toward a target (no allocation).
const approach = (a, b, f) => a + (b - a) * f;
const sign = Math.sign;

// tread scroll gain: px of belt travel per (px/s * ms). Tuned so the belt rolls
// at roughly ground speed (a frame swaps every ~2.5px -> ~1 phase/frame at full
// run speed), direction-matched to vx.
const SCROLL_K = 0.0007;

// Local-texture-px anchors on the 44x48 robot texture (origin = centre 22,24):
//   eyes baked at (17,23)/(28,23) -> midpoint local (+0.5,-1)
//   antenna tip baked at (22,3)   -> local (0,-21)
//   tread band centre ~ y 44.5    -> local y +20.5
const EYES = { x: 0.5, y: -1 };
const ANT = { x: 0, y: -21 };
const TREAD = { x: 0, y: 20.5 };
const TREAD_KEYS = ["tread0", "tread1", "tread2", "tread3"];

// Install the visible locomotion set on one PLAYER rig: hang the pooled overlay
// parts and wire the pose-machine hooks. Called once per player from AnimSystem.
export function installPlayerAnim(rig, scene) {
  const host = rig.host;

  // --- pooled overlay parts (created ONCE) ---------------------------------
  rig.addPart("tread", "tread0", { x: TREAD.x, y: TREAD.y }, { treadKeys: TREAD_KEYS });
  rig.addPart("pupils", "pupils", EYES, { look: true });
  rig.addPart("ant", "anttip", ANT, { antenna: true });

  // per-rig scratch for throttled dust (primitive counters, no alloc)
  rig._skidDustCd = 0;
  rig._transDustCd = 0;

  // small pooled dust burst at the feet through the shared P11 emitter + budget.
  const puff = (n, dx) => {
    if (!scene.dust || !host.body) return;
    scene.dust.emitParticleAt(host.x + dx, host.body.bottom - 2, scene.fxBudget(n));
  };

  rig.machine.hooks = {
    // START / STOP tread dust on the walk<->stand transitions (grounded only).
    enter(pose, status) {
      const st = rig.machine.state, prev = rig.machine.prev;
      if (status.airborne || rig._transDustCd > 0) return;
      const face = pose.face || 1;
      if (st === "walk" && (prev === "idle" || prev === "land")) {
        puff(4, -face * 6); // kick-off puff behind the lead foot
        rig._transDustCd = 160;
      } else if ((st === "idle" || st === "land") && prev === "walk") {
        puff(4, face * 6); // stop puff under the trailing foot
        rig._transDustCd = 160;
      }
    },

    // Per-frame pose: tread scroll, bob, lean, skid, air pupils/antenna. Ends by
    // pushing the body-transform channels through Player.applyLocomotion().
    update(pose, status, dt) {
      const skill = host.skill;
      const isHeavy = skill === "heavy", isTiny = skill === "tiny";
      const maxSpd = isHeavy ? 205 : isTiny ? 285 : 250;
      const vx = status.vx, avx = vx < 0 ? -vx : vx;
      const grounded = !status.airborne;
      const face = pose.face || 1;
      const st = rig.machine.state;

      if (rig._transDustCd > 0) rig._transDustCd -= dt;

      // tread scroll ∝ vx, direction-matched (only while gripping the ground)
      if (grounded) pose.tread += vx * dt * SCROLL_K;
      if (pose.tread > 1e6 || pose.tread < -1e6) pose.tread = pose.tread % 1000;

      // per-frame targets (default neutral)
      let bob = 0, lean = 0, sx = 1, sy = 1;
      let lookX = 0, lookY = 0, ant = 0, antY = 0;

      if (st === "walk") {
        // body bob: 2px sine synced to the tread period; heavier = slower & deeper,
        // tiny = quicker & shallower cadence. Scaled by how fast we're actually going.
        const period = MOTION.WALK_BOB.dur * (isHeavy ? 1.45 : isTiny ? 0.68 : 1);
        const amp = (isHeavy ? 3 : isTiny ? 1.4 : 2) * Math.min(1, avx / (maxSpd * 0.7));
        const ph = (pose.t / period) * Math.PI * 2;
        bob = -Math.abs(Math.sin(ph)) * amp; // two crests per stride, body lifts up
        // tiny: a crisp step-crest micro-squash as each foot plants (visual only)
        if (isTiny) sy = 1 - 0.05 * Math.max(0, -Math.sin(ph * 2));
        // pupils glance into travel; antenna trails the other way
        lookX = face * 1.1; ant = -face * 1.2;

        // SKID: input reversed vs. actual motion above ~60% speed -> dig-in back-lean
        // + a dust scuff (Player's forward walk-lean is overridden by this back-lean).
        if (vx !== 0 && sign(vx) !== face && avx > maxSpd * 0.6) {
          lean = -face * 12; sx = 1.05; sy = isTiny ? sy * 0.96 : 0.96;
          lookX = -face * 1.6;
          rig._skidDustCd -= dt;
          if (grounded && rig._skidDustCd <= 0) {
            puff(isHeavy ? 5 : 3, face * 8);
            rig._skidDustCd = 90;
          }
        }
      } else if (st === "jump") {
        // rising: pupils up, antenna trails down/back. Scale stays with jumpStretch.
        lookY = -1.8; ant = -face * 2.2; antY = 2.6;
        if (Math.abs(status.vy) < 130) lookY = -0.4; // easing into apex
      } else if (st === "fall") {
        if (Math.abs(status.vy) < 130) { // APEX float: brief hang, near-neutral gaze
          lookY = 0.6; antY = 0.6;
        } else { // falling: pupils down, antenna lifts
          lookY = 1.8; ant = face * 1.4; antY = -1.6;
        }
      } else if (st === "land") {
        // recovery: recenter the gaze; DO NOT touch scale (Player.landSquash owns it,
        // so the land squash is never doubled).
        lookY = 0.8;
      }

      // smooth the light overlays toward their targets (cheap, no pops on a state flip)
      const f = Math.min(1, (dt / 1000) * 16);
      pose.lookX = approach(pose.lookX, lookX, f);
      pose.lookY = approach(pose.lookY, lookY, f);
      pose.antenna = approach(pose.antenna, ant, f);
      pose.antennaY = approach(pose.antennaY, antY, f);

      // push the body-transform channels through the physics-safe applier. Bob/lean/
      // scale are visual only; Player._syncBody cancels them out of the body.
      if (host.applyLocomotion) host.applyLocomotion(bob, lean, sx, sy);
    },
  };
}
