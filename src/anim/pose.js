// Bolt Buddies — POSE object + POSE STATE MACHINE (Animation Sprint A1).
//
// A POSE is a lightweight, PREALLOCATED bag of visual-only numbers that the rig
// reads each frame to place its parts (pupils, tread overlay, antenna, arm
// glyphs) and to compute scale multipliers over the host's baseScale. A1 never
// writes non-neutral values into it (the game looks identical); A2+ animate it.
//
// GROUND RULES honoured here:
//   * PHYSICS IS SACRED — a pose carries scale MULTIPLIERS and pixel OFFSETS for
//     visual parts only. Nothing here ever touches a body's size/offset/velocity.
//   * ZERO per-frame allocation — poses are made ONCE per rig and mutated in
//     place; the machine transitions with primitives and interned state strings.
//   * CANCELABILITY — input is read first (the game already moved the character);
//     the machine is a pure OVERLAY that reads the resulting state. A fidget/wait
//     is cancelled the instant input is seen (see fidget.js + cancelFidget()).

// The neutral pose: everything multiplicative is 1, everything additive is 0.
// A rig at the neutral pose renders exactly as it does today.
export function makePose() {
  return {
    sx: 1, // scale-X multiplier over baseScaleX (visual squash/stretch)
    sy: 1, // scale-Y multiplier over baseScaleY
    ox: 0, // body pixel offset X (parts + body-lean overlay read this)
    oy: 0, // body pixel offset Y (breathing bob, jump squat lift)
    lean: 0, // extra lean in degrees (added to the host's existing tilt)
    face: 1, // facing (-1 / +1) mirrored from the host each frame
    lookX: 0, // pupil / eye look offset X (parts)
    lookY: 0, // pupil / eye look offset Y (parts)
    antenna: 0, // antenna tip bend, host-local px X (parts)
    antennaY: 0, // antenna tip lift/trail, host-local px Y (parts)
    tread: 0, // tread-overlay scroll offset, px (vx-accumulated; parts)
    // A3 idle/waiting: a free-spinning glyph part (grapple's twirled hook). A part
    // flagged `glyph` reads its OWN rotation + alpha from these channels instead of
    // inheriting the host transform, so the glyph can twirl while the body is still.
    glyphSpin: 0, // glyph part rotation (radians), independent of the host
    glyphA: 0, // glyph part alpha (0 => hidden; the resting state)
    // A4 reach-out arm glyph (zip): an `arm` part reads its OWN world-aimed angle +
    // length + alpha from these channels (like the glyph, it does not inherit the
    // host transform), so the arm can point at a zip anchor while the body stretches.
    armA: 0, // arm glyph alpha (0 => hidden; the resting state)
    armAng: 0, // arm glyph WORLD rotation (radians), aimed at the reach target
    armLen: 1, // arm glyph reach extension (scaleX multiplier)
    // A5 enemy feelers: a `feeler` part reads its OWN rotation from a base V-splay +
    // this shared bend channel (twitch + alarm flare), mirrored by facing. The bug
    // body pose (rear-up/stumble) is applied directly to the host, not through here.
    feelerBend: 0, // antenna-feeler bend (radians), added ±side per feeler part
    t: 0, // state-local elapsed time (ms) — reset on every state enter
  };
}

// Reset a pose to neutral WITHOUT allocating (mutate in place).
export function resetPose(p) {
  p.sx = 1; p.sy = 1; p.ox = 0; p.oy = 0; p.lean = 0;
  p.lookX = 0; p.lookY = 0; p.antenna = 0; p.antennaY = 0; p.tread = 0;
  p.glyphSpin = 0; p.glyphA = 0;
  p.armA = 0; p.armAng = 0; p.armLen = 1;
  p.feelerBend = 0;
  // p.face and p.t are managed by the machine, not cleared here.
}

// The eight canonical pose states (roadmap A1). Interned string constants so
// comparisons/assignments never allocate.
export const STATE = Object.freeze({
  IDLE: "idle",
  WALK: "walk",
  JUMP: "jump", // rising (airborne, moving up)
  FALL: "fall", // airborne, moving down
  LAND: "land", // transient recovery just after touchdown
  ACT: "act", // action overlay (zip/stomp/throw/equip) — event-driven
  CARRY: "carry", // carrying or being carried
  HURT: "hurt", // taking a hit (invuln flash)
});

// Velocity magnitude (px/s) above which a grounded character reads as WALKING.
const WALK_VX = 20;
// How long the transient LAND state holds before falling through to idle/walk.
const LAND_MS = 120;

// PoseMachine — one per rig. It READS a preallocated status object (written by
// the rig's probe each frame; never allocated here) and drives the current
// state, firing enter/exit hooks. In A1 the hooks are no-ops (motion is added in
// A2+), so this changes nothing on screen — it only computes and stores state.
export class PoseMachine {
  constructor(pose) {
    this.pose = pose;
    this.state = STATE.IDLE;
    this.prev = STATE.IDLE;
    this._landTimer = 0;
    this._wasAir = false;
    // ACT is event-driven and latches for a short overlay window (A4 sets the
    // real duration via a MOTION token; A1 just tracks the flag).
    this._actMs = 0;
    // Optional per-state hooks, installed by callers in later sprints. Shape:
    // { enter(pose, status), update(pose, status, dt), exit(pose, status) }.
    this.hooks = null;
  }

  // Derive the DESIRED state purely from the (already-resolved) character status.
  // Priority mirrors gameplay reality: death/hurt/carry dominate, then air state,
  // then ground locomotion. `act` is layered by trigger(), not derived here.
  _derive(s) {
    if (s.dead || s.hurt) return STATE.HURT;
    if (s.carrying) return STATE.CARRY;
    if (this._actMs > 0) return STATE.ACT;
    if (s.airborne) return s.vy < -20 ? STATE.JUMP : STATE.FALL;
    if (this._landTimer > 0) return STATE.LAND;
    return Math.abs(s.vx) > WALK_VX ? STATE.WALK : STATE.IDLE;
  }

  // Fire an action overlay (A4 wires the real anims). Latches ACT for `ms`.
  trigger(ms) {
    this._actMs = ms;
  }

  // Advance one frame. `status` is the rig's preallocated probe result — this
  // method NEVER allocates. Runs AFTER game logic each frame (motion is overlay).
  update(status, dt) {
    // land detection: airborne last frame, grounded now → open the recovery window
    if (this._wasAir && !status.airborne) this._landTimer = LAND_MS;
    this._wasAir = status.airborne;
    if (this._landTimer > 0) this._landTimer -= dt;
    if (this._actMs > 0) this._actMs -= dt;

    this.pose.face = status.face;

    const next = this._derive(status);
    if (next !== this.state) {
      this.prev = this.state;
      if (this.hooks && this.hooks.exit) this.hooks.exit(this.pose, status);
      this.state = next;
      this.pose.t = 0;
      if (this.hooks && this.hooks.enter) this.hooks.enter(this.pose, status);
    } else {
      this.pose.t += dt;
    }
    if (this.hooks && this.hooks.update) this.hooks.update(this.pose, status, dt);
    return this.state;
  }
}
