// Bolt Buddies — SCUTTLEBUG ANIMATION SET (Animation Sprint A5).
//
// A5 turns the A1 rig VISIBLE for the scuttlebug enemy. Everything here is a pure
// VISUAL OVERLAY on the SACRED patrol/squish logic (GameScene owns velocity, turn
// points, aggro semantics, the squish/kill hitbox + timing — all untouched):
//   * 3-FRAME LEG SCUTTLE CYCLE — cheap host-texture swap between the baked base /
//     step / step2 leg-splay frames, cadence advanced by accumulated |vx| travel
//     (faster patrol => faster scuttle; frozen while reared). Direction reads on the
//     existing flipX. Replaces P7's 2-frame wiggle (moved off GameScene into the rig
//     so `?animoff=1` renders a truly static bug — the A/B contract).
//   * ANTENNA FEELERS — two pooled drawn parts rising from the shell, twitched by the
//     ONE shared fidget scheduler (staggered per bug; no per-bug timer).
//   * ALARM REAR-UP — when the nearest player enters ~160px the bug tilts its FRONT
//     up (host ROTATION only — Arcade AABB ignores rotation, so x/y/hitbox are byte-
//     identical) and its feelers flare; the scuttle visually pauses. The body keeps
//     patrolling at its real velocity, so the beat routes step on it identically.
//   * BONK-TURN STUMBLE — a decaying wobble when patrol velocity reverses (cosmetic).
//   * The W2 hex-shell variant inherits ALL of this (same rig; only the baked leg
//     frames differ, selected from the host's _texBase/_texStep/_texStep2 keys).
//
// GROUND RULES honoured: PHYSICS IS SACRED (rotation/feelers only, never the body);
// ZERO per-frame allocation (all scratch is preallocated on the rig; the player-
// distance scan is a bare loop); pooled parts; CANVAS-SAFE (drawn/texture frames).

import { MOTION } from "./motion.js";
import { DEPTH } from "../constants.js";

// leg-cycle / alarm params come from MOTION (A12 sweep): BUG_SCUTTLE.stride px of |vx|
// travel per leg-frame; BUG_REARUP.range (~160px alarm radius) + .tilt (~11° nose-up,
// rotation-only). At the 60px/s patrol speed the scuttle reads as a lively ~8 frames/s.
const mod3 = (n) => ((n % 3) + 3) % 3;

// One antenna feeler, baked ONCE into a Graphics (canvas-safe): a near-vertical
// stalk with a lit sensor tip. Its base pivots at (0,0); the splay/twitch is a
// rotation about that base (see Part's `feeler` branch).
function drawFeeler(g) {
  g.lineStyle(2, 0x2a1840, 1);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, -7);
  g.lineTo(1.5, -11);
  g.strokePath();
  g.fillStyle(0xffe066, 1);
  g.fillCircle(1.5, -11, 1.7); // glowing sensor knob (matches the eyes)
}

// Install the visible scuttlebug set on one BUG rig. Called once per bug from
// AnimSystem.registerBug. Hangs the two pooled feeler parts + wires the pose-machine
// update hook + the shared-scheduler feeler-twitch trigger.
export function installBugAnim(rig, scene) {
  const host = rig.host;

  // --- pooled feeler parts (created ONCE) ----------------------------------
  // Sit just BEHIND the carapace (bases hidden under the shell, tips poke above the
  // top edge). base = the resting V-splay; side flips the shared bend per feeler.
  const fL = rig.addPart("feelerL", drawFeeler, { x: -5, y: -8 }, { feeler: { base: -0.20, side: -1 } });
  const fR = rig.addPart("feelerR", drawFeeler, { x: 5, y: -8 }, { feeler: { base: 0.20, side: 1 } });
  for (const p of [fL, fR]) {
    p.obj.setDepth(DEPTH.entity - 1);
    p.obj.setVisible(false); // hidden until the rig places them (so ?animoff=1 is clean)
  }
  rig._feelerL = fL; rig._feelerR = fR;

  // --- preallocated per-bug scratch (ZERO per-frame allocation) -------------
  rig._legTravel = 0;   // accumulated |vx| travel driving the leg-frame index
  rig._lf = -1;         // last leg-frame index shown (skip redundant setTexture)
  rig._rear = 0;        // smoothed alarm rear-up amount 0..1
  rig._lastVx = host.body ? host.body.velocity.x : 0; // for bonk-turn reversal detect
  rig._stumbleT = 0;    // stumble wobble timer (ms)
  rig._twitchT = 0; rig._twitchDur = 0; // feeler-twitch timer (fired by the scheduler)

  // the shared scheduler treats an active fidget as a busy descriptor with a stop();
  // for the bug that is the feeler twitch (cleared by the hook when it elapses).
  rig._twitchDesc = { stop() { rig._twitchT = 0; rig._twitchDur = 0; } };

  // shared-fidget-scheduler hook: fire a feeler twitch (staggered per bug by the
  // scheduler's register() offset). `tier` is ignored — a bug only ever twitches.
  rig.startAnimFidget = () => {
    rig._twitchT = 0;
    rig._twitchDur = MOTION.BUG_FEELER.dur;
    rig.activeFidget = rig._twitchDesc; // mark busy so the scheduler waits for the gap
  };

  // hide the feelers when the host is squished (rig.update early-returns once the host
  // is destroyed, so they'd otherwise freeze visible). Called from GameScene.squishBug.
  rig.onHostRemoved = () => {
    if (rig._feelerL) rig._feelerL.obj.setVisible(false);
    if (rig._feelerR) rig._feelerR.obj.setVisible(false);
  };

  rig.machine.hooks = {
    update(pose, status, dt) {
      const h = rig.host;
      if (!h || !h.body) return;
      const vx = status.vx, avx = vx < 0 ? -vx : vx;
      const face = pose.face || 1;

      // --- ALARM REAR-UP: read the existing proximity state (nearest live player).
      // Bare loop over the two players — no allocation.
      let nd = Infinity;
      const ps = scene.players;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (!p || p.dead) continue;
        const dx = p.x - h.x, dy = p.y - h.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < nd) nd = d;
      }
      const R = MOTION.BUG_REARUP;
      const rearTarget = nd < R.range ? 1 : 0;
      rig._rear += (rearTarget - rig._rear) * Math.min(1, (dt / 1000) * R.rate); // smooth ease
      const reared = rig._rear > 0.5;

      // --- 3-FRAME LEG SCUTTLE CYCLE ∝ |vx| (visually PAUSED while reared) -----
      if (!reared) rig._legTravel += avx * dt / 1000;
      const idx = mod3(Math.floor(rig._legTravel / MOTION.BUG_SCUTTLE.stride));
      if (idx !== rig._lf) {
        rig._lf = idx;
        const key = idx === 0 ? h._texBase : idx === 1 ? h._texStep : h._texStep2;
        if (key) h.setTexture(key); // cheap texture swap (body-safe; same 44x28 frame)
      }

      // --- BONK-TURN STUMBLE: a decaying wobble the frame patrol velocity reverses.
      const lv = rig._lastVx;
      if (avx > 5 && (vx > 0) !== (lv > 0) && (lv > 5 || lv < -5)) rig._stumbleT = MOTION.BUG_STUMBLE.dur;
      rig._lastVx = vx;
      let stumble = 0;
      if (rig._stumbleT > 0) {
        rig._stumbleT -= dt;
        const sp = 1 - rig._stumbleT / MOTION.BUG_STUMBLE.dur;
        stumble = Math.sin(sp * Math.PI * 3) * (1 - sp) * MOTION.BUG_STUMBLE.amp; // damped rock
      }

      // --- FEELER TWITCH (fired by the shared scheduler) -----------------------
      let twitch = 0;
      if (rig._twitchDur > 0) {
        rig._twitchT += dt;
        const tp = rig._twitchT / rig._twitchDur;
        if (tp >= 1) { rig._twitchDur = 0; rig.activeFidget = null; } // free for the next
        else twitch = Math.sin(tp * Math.PI * 5) * (1 - tp) * MOTION.BUG_FEELER.amp; // decaying flick
      }

      // --- COMPOSE (no body writes) --------------------------------------------
      // rear-up tilts the FRONT (travel direction) up; stumble adds a wobble. Both
      // ride host.rotation, which the Arcade AABB ignores — hitbox stays byte-exact.
      h.rotation = -face * rig._rear * R.tilt + stumble;
      // feelers: base V-splay + shared bend (twitch scissor + alarm flare-apart).
      pose.feelerBend = twitch + rig._rear * R.flare;
    },
  };
}
