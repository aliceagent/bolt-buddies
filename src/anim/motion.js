// Bolt Buddies — MOTION tokens (Animation Sprint A1).
//
// The single source of truth for every animation's duration + ease. A2+ sprints
// reference these named tokens instead of sprinkling magic numbers across the
// codebase (the A12 audit's job is to prove no stray durations survive). Each
// token is a frozen `{ dur, ease }` pair; `ease` strings are Phaser ease names
// (passed straight to `scene.tweens.add`). Seeded here with the full vocabulary
// A2 (locomotion) and A3 (idle/waiting tiers) will need so the table is defined
// once and only extended, never reshaped.
//
// Nothing in A1 PLAYS these — this sprint only defines the vocabulary and wires
// the rig invisibly. Keep this file allocation-free at runtime: it is a static
// table, read by reference, never rebuilt.

const tok = (dur, ease) => Object.freeze({ dur, ease });

export const MOTION = Object.freeze({
  // --- locomotion (A2) -----------------------------------------------------
  WALK_BOB: tok(360, "sine.inOut"), // 2px body bob synced to the tread period
  WALK_LEAN: tok(120, "quad.out"), // forward lean easing in/out of a walk
  TREAD_SCROLL: tok(300, "linear"), // tread-overlay scroll cycle (period, vx-scaled)
  SKID: tok(180, "quad.out"), // reverse-above-60% skid pose + dust

  // --- jump / air / land (A2) ----------------------------------------------
  JUMP_SQUAT: tok(90, "quad.out"), // 2-frame anticipation squat on takeoff
  JUMP_RISE: tok(220, "back.out"), // rising pose settle (pupils up, antenna trail)
  APEX_FLOAT: tok(260, "sine.inOut"), // brief hang pose at the top of the arc
  FALL: tok(200, "quad.in"), // falling pose (pupils down)
  LAND_RECOVER: tok(90, "quad.out"), // landing recovery blending into the P3 squash

  // --- idle tier 0 (A3, always on) -----------------------------------------
  IDLE_BREATHE: tok(2600, "sine.inOut"), // slow breathing bob
  BLINK: tok(120, "linear"), // eyes-closed hold (retimes the existing P6 blink)

  // --- fidget tier 1 (A3, ~4s idle) ----------------------------------------
  FIDGET_LOOK: tok(520, "sine.inOut"), // glance left/right (pupils + slight body turn)
  FIDGET_TWITCH: tok(160, "quad.out"), // antenna twitch
  FIDGET_SHUFFLE: tok(300, "sine.inOut"), // little tread shuffle in place

  // --- waiting tier 2 (A3, ~8s idle, per-skill signature beats) ------------
  WAIT_TWIRL: tok(480, "sine.inOut"), // grapple twirls its hook glyph
  WAIT_STOMP: tok(260, "quad.out"), // heavy knuckle-crack tap-tap stomp
  WAIT_FLICKER: tok(180, "linear"), // phase flickers half-transparent + startles
  WAIT_HOP: tok(320, "quad.out"), // tiny two-hop in place
  WAIT_GLANCE: tok(600, "sine.inOut"), // partner-aware turn-and-look at each other

  // --- reactions / generic action envelope (A4) ----------------------------
  HURT_SHAKE: tok(220, "quad.out"), // brief recoil shudder on taking a hit
  ACT_WINDUP: tok(140, "quad.out"), // generic action anticipation (zip/stomp/throw)
  ACT_FOLLOW: tok(220, "back.out"), // generic action follow-through / recoil

  // --- action set (A4, per-action envelopes) -------------------------------
  // Every one is a VISUAL overlay on instant game logic (physics untouched).
  THROW_ACT: tok(360, "back.out"), // throw windup->follow-through (high-toss squat)
  STOMP_SPLAY: tok(520, "quad.out"), // heavy impact splay + antenna boing (damped)
  EQUIP_POSE: tok(520, "back.out"), // pedestal "tries on the skill" one-beat pose
  EQUIP_POP: tok(300, "back.out"), // badge pops onto the head
  EQUIP_FLASH: tok(360, "cubic.out"), // head flash ring on equip
  // death/respawn: pure visual overlay on the SACRED death->respawn timing.
  DEATH_SCATTER: tok(520, "cubic.out"), // drawn parts fly out with the boom
  DEATH_FADE: tok(600, "linear"), // orphaned parts fade if no respawn follows
  DEATH_REASSEMBLE: tok(360, "back.in"), // respawn beam pulls the parts back + snaps
});

// Idle-tier + fidget-scheduler timing (ms). Kept beside the motion tokens so the
// whole "when + how long" vocabulary lives in one file. The shared fidget
// scheduler (src/anim/fidget.js) reads these.
export const TIMING = Object.freeze({
  IDLE_TIER1: 4000, // idle time before tier-1 fidgets may fire
  IDLE_TIER2: 8000, // idle time before the tier-2 "waiting" set may fire
  FIDGET_GAP: 3200, // minimum gap between two fidgets on the same character
  FIDGET_JITTER: 1800, // random extra added to the gap (desync)
  FIDGET_STAGGER: 900, // per-character phase offset so fidgets never fire in sync
  FIDGET_TICK: 250, // the shared scheduler's poll interval (ms)
  PARTNER_RANGE: 6 * 48, // A3 partner-aware "both idle within 6 tiles" distance
});
