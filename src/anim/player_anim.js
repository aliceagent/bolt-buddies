// Bolt Buddies — PLAYER LOCOMOTION + IDLE/WAITING TIERS (Animation Sprints A2 + A3).
//
// A2 turned the A1 rig VISIBLE for the two player robots: a tread-scroll overlay
// matched to vx, a body bob synced to the tread period, a forward walk lean, a
// skid dig-in + dust, and the jump/apex/fall/land air poses (visor pupils +
// antenna trail). A3 hangs the IDLE / WAITING tiers off the same rig + the shared
// fidget scheduler:
//   * TIER 0 (always, idle-grounded): a slow breathing bob + the retimed blink
//     (the pupil overlay is hidden while the baked eyes-closed texture shows).
//   * TIER 1 (~4s idle): staggered one-at-a-time fidgets — glance left/right,
//     antenna twitch, tread shuffle.
//   * TIER 2 (~8s idle, PER-SKILL "waiting" beats): grapple twirls a little hook
//     glyph; heavy does a cosmetic knuckle-crack tap-tap (NO real stomp); phase
//     flickers half-transparent and startles itself; tiny does two little hops in
//     place (VISUAL bob, NOT a physics jump).
//   * PARTNER-AWARE: driven from AnimSystem — both idle within 6 tiles → turn and
//     look at each other, one beeps, the other tilts (one-shot, re-arms).
//
// GROUND RULES honoured:
//   * PHYSICS IS SACRED — every idle/wait beat is a scale multiplier over baseScale
//     and/or a VISUAL pixel bob, pushed through Player.applyLocomotion(), which
//     Player._syncBody counter-corrects so the collision AABB (size + world pos) is
//     byte-identical to the un-animated frame. The tiny "hop" and heavy "tap" NEVER
//     write body velocity and NEVER call jump/stomp — they are pure overlay.
//   * CANCELABLE — logic first (Player.preUpdate), motion after (the rig runs at the
//     end of the scene update). The idle branch drops any fidget and plays NOTHING
//     the frame input is seen (a hard same-frame guard), on top of the scheduler's
//     own input-cancel — so a fidget/wait can never eat or delay input.
//   * ZERO per-frame allocation — parts are pooled (created ONCE), a single scratch
//     bag (rig._fx) + a single fidget descriptor (rig._fidget) are reused in place.
//   * CANVAS-SAFE — drawn TileSprite tread + drawn pupil/antenna/hook glyph overlays
//     + pose transforms; the phase flicker rides alpha (not a tint-only state).

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
//   hook glyph twirls off the lead hand -> local (~+15,-3)
const EYES = { x: 0.5, y: -1 };
const ANT = { x: 0, y: -21 };
const TREAD = { x: 0, y: 20.5 };
const HOOK = { x: 15, y: -3 };
const TREAD_KEYS = ["tread0", "tread1", "tread2", "tread3"];

// A3 fidget/wait durations (ms). Every beat's ease/tempo is drawn from the MOTION
// tokens; these are the whole-beat envelopes (out-and-back / two-beat spans) that
// wrap the token tempo. Table is read by reference, never rebuilt.
const FIDGET_DUR = Object.freeze({
  look: 900, // glance out, hold, return
  twitch: 340, // two quick antenna flicks
  shuffle: 620, // little tread shuffle in place
  twirl: 980, // grapple twirls the hook glyph twice
  tap: 720, // heavy's two cosmetic knuckle-crack taps
  flicker: 780, // phase flickers + a startle in the middle
  hop: 760, // tiny's two little hops
  partner: 1200, // the partner turn-and-look one-shot
});
// tier-1 fidgets cycle through this set (staggered by the shared scheduler).
const TIER1 = ["look", "twitch", "shuffle"];

// a narrow gaussian tap pulse centred at `c` (0..1 progress) — the heavy tap crest.
const tapPulse = (p, c) => Math.exp(-((p - c) * (p - c)) / 0.0016);

// The grapple "waiting" hook glyph, baked ONCE into a Graphics (canvas-safe).
function drawHook(g) {
  g.lineStyle(2, 0x35f0ff, 1);
  g.beginPath();
  g.arc(0, 1, 5, Math.PI * 0.15, Math.PI * 1.55);
  g.strokePath();
  g.lineBetween(1, -4, 3, -7); // prong
  g.lineBetween(1, -4, -2, -6); // prong
  g.fillStyle(0xbdf3ff, 1);
  g.fillCircle(0, 1, 1.6); // shank stud
}

// Install the visible locomotion + idle/waiting sets on one PLAYER rig: hang the
// pooled overlay parts and wire the pose-machine hooks. Called once per player.
export function installPlayerAnim(rig, scene) {
  const host = rig.host;

  // --- pooled overlay parts (created ONCE) ---------------------------------
  rig.addPart("tread", "tread0", { x: TREAD.x, y: TREAD.y }, { treadKeys: TREAD_KEYS });
  rig.addPart("pupils", "pupils", EYES, { look: true });
  rig.addPart("ant", "anttip", ANT, { antenna: true });
  // the grapple waiting glyph — hung on EVERY player (skills are swapped at
  // runtime), invisible at rest (glyphA == 0), twirled only by the tier-2 wait.
  rig.addPart("hook", drawHook, { x: HOOK.x, y: HOOK.y }, { glyph: true });

  rig._pupils = rig.getPart("pupils");
  rig._ant = rig.getPart("ant");

  // per-rig scratch for throttled dust (primitive counters, no alloc)
  rig._skidDustCd = 0;
  rig._transDustCd = 0;

  // --- A3 idle/waiting state — all PREALLOCATED (zero per-frame alloc) ------
  rig._fidgetSeq = 0; // round-robin cursor through the tier-1 set
  // the single reused fidget descriptor. `stop()` is what CharRig.cancelFidget()
  // calls the frame input is seen — it cleans up (alpha/glyph restore) without
  // touching idleMs (the scheduler owns the idle clock).
  const fidget = {
    type: "", t: 0, dur: 0, dir: 1, tilt: 0, active: false, _tapped: false,
    stop() { cleanupFidget(rig, host); },
  };
  rig._fidget = fidget;
  // scratch bag the per-frame fidget stepper writes into (reused in place).
  rig._fx = {
    bob: 0, lean: 0, sx: 1, sy: 1, lookX: 0, lookY: 0, ant: 0, antY: 0,
    treadAdd: 0, glyphA: 0, spinRate: 0, alpha: 1, wantPuff: false,
  };

  // small pooled dust burst at the feet through the shared P11 emitter + budget.
  const puff = (n, dx) => {
    if (!scene.dust || !host.body) return;
    scene.dust.emitParticleAt(host.x + dx, host.body.bottom - 2, scene.fxBudget(n));
  };

  // Start a scheduled fidget (called by the shared scheduler's pickFidget hook).
  // tier 1 cycles the tier-1 set; tier 2 fires the per-skill "waiting" signature.
  rig.startAnimFidget = (tier) => {
    let type;
    if (tier >= 2) {
      const s = host.skill;
      type = s === "grapple" ? "twirl"
        : s === "heavy" ? "tap"
        : s === "phase" ? "flicker"
        : s === "tiny" ? "hop"
        : "look"; // no skill equipped yet — a gentle glance
    } else {
      type = TIER1[rig._fidgetSeq % TIER1.length];
      rig._fidgetSeq++;
    }
    beginFidget(rig, type, Math.random() < 0.5 ? -1 : 1, 0);
  };

  // Partner-aware turn-and-look (driven by AnimSystem when both buddies are idle
  // within range). Turns to face the partner; `tilt` is the head-cock for "the
  // other" one. Runs through the same fidget slot, so it cancels on input too.
  rig.startPartnerLook = (dir, tilt) => {
    beginFidget(rig, "partner", dir, tilt);
    host.facing = dir; // turn toward the partner
    if (host.setFlipX) host.setFlipX(dir < 0);
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

    // Per-frame pose: tread scroll, bob, lean, skid, air pupils/antenna, and the
    // idle/waiting tiers. Ends by pushing the body-transform channels through
    // Player.applyLocomotion() (physics-safe; _syncBody cancels them out of the body).
    update(pose, status, dt) {
      const skill = host.skill;
      const isHeavy = skill === "heavy", isTiny = skill === "tiny";
      const maxSpd = isHeavy ? 205 : isTiny ? 285 : 250;
      const vx = status.vx, avx = vx < 0 ? -vx : vx;
      const grounded = !status.airborne;
      const face = pose.face || 1;
      const st = rig.machine.state;

      // blink retimed onto MOTION.BLINK (see Player.present): hide the pupil overlay
      // while the baked eyes-closed texture shows, so the blink reads on the eyes.
      if (rig._pupils) rig._pupils.visible = host.blinking <= 0;

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
      } else if (st === "idle") {
        // ---- A3 IDLE / WAITING TIERS --------------------------------------
        // HARD cancelability guard: the frame ANY input (or a real motion state)
        // is present, play NOTHING and drop any fidget IMMEDIATELY — the pose
        // returns to the input-driven neutral that same frame (no lag).
        if (status.input || status.carrying || status.hurt || status.dead) {
          if (rig.activeFidget) rig.cancelFidget();
          pose.glyphA = 0;
        } else {
          // TIER 0: slow breathing bob + a subtle chest expand (always, idle-grounded).
          const bper = MOTION.IDLE_BREATHE.dur * (isHeavy ? 1.3 : isTiny ? 0.82 : 1);
          const bamp = isHeavy ? 1.6 : isTiny ? 0.9 : 1.2;
          const bph = (pose.t * Math.PI * 2) / bper;
          bob = Math.sin(bph) * bamp;
          sy = 1 + 0.02 * Math.sin(bph);

          // TIER 1/2: the active fidget/wait overlays ON TOP of the breath.
          if (rig.activeFidget) {
            const fx = rig._fx;
            fx.bob = 0; fx.lean = 0; fx.sx = 1; fx.sy = 1;
            fx.lookX = 0; fx.lookY = 0; fx.ant = 0; fx.antY = 0;
            fx.treadAdd = 0; fx.glyphA = 0; fx.spinRate = 0; fx.alpha = 1; fx.wantPuff = false;
            stepFidget(rig, host, fx, dt);
            bob += fx.bob; lean += fx.lean; sx *= fx.sx; sy *= fx.sy;
            lookX = fx.lookX; lookY = fx.lookY; ant = fx.ant; antY = fx.antY;
            if (fx.treadAdd) pose.tread += fx.treadAdd;
            pose.glyphA = fx.glyphA;
            pose.glyphSpin += fx.spinRate * dt;
            // phase flicker rides alpha (visual only); fade the overlay parts with it.
            if (fx.alpha < 1) {
              host.setAlpha(fx.alpha);
              if (rig._pupils) rig._pupils.obj.setAlpha(fx.alpha);
              if (rig._ant) rig._ant.obj.setAlpha(fx.alpha);
            }
            if (fx.wantPuff) puff(2, face * 5);
          } else {
            pose.glyphA = 0;
          }
        }
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

// Begin a fidget in the reused descriptor (called only when no fidget is active,
// or after the caller has cleaned up the previous one). No idleMs touch here.
function beginFidget(rig, type, dir, tilt) {
  if (rig.activeFidget) cleanupFidget(rig, rig.host);
  const f = rig._fidget;
  f.type = type;
  f.t = 0;
  f.dur = FIDGET_DUR[type] || 600;
  f.dir = dir || 1;
  f.tilt = tilt || 0;
  f._tapped = false;
  f.active = true;
  rig.activeFidget = f;
}

// Tear down the active fidget WITHOUT resetting idleMs (that's the scheduler's job):
// restore the flicker alpha + hide the glyph so nothing lingers on screen.
function cleanupFidget(rig, host) {
  const f = rig._fidget;
  f.active = false;
  rig.activeFidget = null;
  rig.pose.glyphA = 0;
  if (host && host.setAlpha) host.setAlpha(1);
  if (rig._pupils) rig._pupils.obj.setAlpha(1);
  if (rig._ant) rig._ant.obj.setAlpha(1);
}

// One frame of the active fidget/wait: fills the scratch bag `fx` with this beat's
// visual channels. Allocation-free; ends the beat (cleanup) when its span elapses.
function stepFidget(rig, host, fx, dt) {
  const f = rig._fidget;
  f.t += dt;
  const p = f.dur > 0 ? f.t / f.dur : 1; // 0..1 progress
  switch (f.type) {
    case "look": {
      // glance out (0..0.35), hold, return (0.7..1) — pupils + a slight body turn
      let out = p < 0.35 ? p / 0.35 : p > 0.7 ? Math.max(0, (1 - p) / 0.3) : 1;
      out = out * out * (3 - 2 * out); // smoothstep
      fx.lookX = f.dir * 2.6 * out;
      fx.lean = f.dir * 3.5 * out;
      fx.ant = -f.dir * 1.4 * out;
      break;
    }
    case "twitch": {
      const env = Math.max(0, 1 - p); // decay
      fx.ant = Math.sin(p * Math.PI * 4) * 3.2 * env * f.dir;
      fx.antY = -Math.abs(Math.sin(p * Math.PI * 4)) * 1.4 * env;
      break;
    }
    case "shuffle": {
      fx.lean = Math.sin(p * Math.PI * 3) * 3.0;
      fx.bob = -Math.abs(Math.sin(p * Math.PI * 2)) * 1.6;
      if (p < 0.85) fx.treadAdd = f.dir * dt * 0.05; // the belt shuffles in place
      break;
    }
    case "twirl": {
      // grapple twirls the little hook glyph (fades in, spins twice, fades out)
      const vis = p < 0.15 ? p / 0.15 : p > 0.85 ? Math.max(0, (1 - p) / 0.15) : 1;
      fx.glyphA = vis;
      fx.spinRate = 0.02; // rad/ms
      fx.lookX = f.dir * 1.6 * vis;
      fx.bob = -Math.abs(Math.sin(p * Math.PI * 2)) * 1.4;
      break;
    }
    case "tap": {
      // heavy's two cosmetic knuckle-crack taps — VISUAL squash only, NO real stomp
      const amt = Math.min(1, tapPulse(p, 0.24) + tapPulse(p, 0.62));
      fx.sy = 1 - 0.11 * amt;
      fx.sx = 1 + 0.07 * amt;
      fx.bob = 1.6 * amt; // body dips slightly (visual)
      fx.lookY = 0.6 * amt;
      if (amt > 0.8 && !f._tapped) { fx.wantPuff = true; f._tapped = true; }
      if (amt < 0.4) f._tapped = false;
      break;
    }
    case "flicker": {
      // phase flickers half-transparent + startles itself with a small jump-back
      const fl = 0.5 + 0.5 * Math.sin(p * Math.PI * 9);
      fx.alpha = 1 - 0.55 * fl;
      const st = Math.max(0, 1 - Math.abs(p - 0.5) / 0.16);
      fx.bob = -6 * st;
      fx.lean = -f.dir * 6 * st;
      fx.lookX = -f.dir * 2.2 * st;
      break;
    }
    case "hop": {
      // tiny's two little hops in place — VISUAL bob only, NOT a physics jump
      const local = p < 0.5 ? p / 0.5 : (p - 0.5) / 0.5;
      const h = Math.sin(local * Math.PI);
      fx.bob = -8 * h;
      fx.sy = 1 + 0.06 * h; // stretch at the top
      fx.sx = 1 - 0.04 * h;
      break;
    }
    case "partner": {
      // turn-and-look at the partner; `tilt` is the "other" one's head cock
      let out = p < 0.25 ? p / 0.25 : p > 0.8 ? Math.max(0, (1 - p) / 0.2) : 1;
      out = out * out * (3 - 2 * out);
      fx.lookX = f.dir * 2.8 * out;
      fx.lean = f.tilt * out;
      fx.ant = -f.dir * 1.2 * out;
      break;
    }
  }
  if (f.t >= f.dur) cleanupFidget(rig, host);
}
