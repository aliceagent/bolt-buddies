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
  DEATH_FADE: Object.freeze({ dur: 600, ease: "linear", delay: 240 }), // orphaned parts fade (after a hold) if no respawn follows
  DEATH_REASSEMBLE: tok(360, "back.in"), // respawn beam pulls the parts back + snaps

  // --- player locomotion + idle envelope spans (A2/A3, hoisted in A12) ------
  // A12 sweep: these were module-local named consts in player_anim.js; hoisted here
  // so the single MOTION table is the source of truth (byte-identical values).
  TREAD_GAIN: Object.freeze({ k: 0.0007 }), // px belt travel per (px/s * ms), vx-matched (was SCROLL_K)
  // whole-beat fidget/wait ENVELOPE spans (ms) — the out-and-back / two-beat windows
  // that wrap each beat's MOTION tempo/ease (was the local FIDGET_DUR table).
  FIDGET_ENV: Object.freeze({
    look: 900,     // glance out, hold, return
    twitch: 340,   // two quick antenna flicks
    shuffle: 620,  // little tread shuffle in place
    twirl: 980,    // grapple twirls the hook glyph twice
    tap: 720,      // heavy's two cosmetic knuckle-crack taps
    flicker: 780,  // phase flickers + a startle in the middle
    hop: 760,      // tiny's two little hops
    partner: 1200, // the partner turn-and-look one-shot
  }),

  // --- enemy: scuttlebug (A5) ----------------------------------------------
  // Every one is a VISUAL overlay on the SACRED patrol/squish logic (never touches
  // the bug body/velocity/hitbox — rear-up/stumble are rotation-only, AABB-safe).
  // `stride`(px |vx|/leg-frame), `range`(alarm px), `tilt`(rear-up rad), `ease`(rear
  // smoothing rate/s), `flare`(feeler alarm splay), `amp`(twitch/stumble rock) hoisted
  // in A12 from module-local consts (byte-identical) so the whole beat lives in one place.
  BUG_SCUTTLE: Object.freeze({ dur: 120, ease: "linear", stride: 7 }), // reference cadence; 3-leg cycle is |vx|-driven (LEG_STRIDE px/frame)
  BUG_FEELER: Object.freeze({ dur: 360, ease: "sine.inOut", amp: 0.5 }), // antenna-feeler twitch (fired by the shared scheduler)
  BUG_REARUP: Object.freeze({ dur: 240, ease: "quad.out", range: 160, tilt: 0.20, rate: 6, flare: 0.5 }), // alarm rear-up (~160px radius, ~11° nose-up)
  BUG_STUMBLE: Object.freeze({ dur: 260, ease: "back.out", amp: 0.16 }), // bonk-turn stumble wobble at a patrol reversal

  // --- enemy: patrol roller (A6) -------------------------------------------
  // Every one is a VISUAL overlay on the SACRED patrol/beam/alert/zap logic (never
  // touches the roller body/velocity or the beam geometry — head-tilt + recoil are
  // host-rotation-only, which the Arcade AABB ignores and the beam origin never reads).
  // `amp` is the rotation amplitude in radians (added beside dur/ease).
  // A12 sweep: `degPerPx`(wheel roll), the pupil `slide/track/aimX/aimY/dilate/dilateEase`
  // and klaxon `spin`(deg/s) hoisted from module-local consts (byte-identical).
  ROLLER_WHEEL: Object.freeze({ dur: 120, ease: "linear", degPerPx: 8 }), // reference cadence; wheel roll is |vx|-driven (~8°/px)
  ROLLER_PUPIL: Object.freeze({ dur: 180, ease: "sine.out", slide: 14, track: 9, aimX: 13, aimY: 5, dilate: 1.55, dilateEase: 12 }), // pupil track/snap/dilate (px + ease rates/s)
  ROLLER_KLAXON: Object.freeze({ dur: 475, ease: "linear", spin: 760 }), // klaxon beacon sweep period while alerted (spin deg/s)
  ROLLER_HMM: Object.freeze({ dur: 1000, ease: "sine.inOut", amp: 0.20, squint: 0.45 }), // LOS-break head-tilt + question-squint depth
  ROLLER_RECOIL: Object.freeze({ dur: 340, ease: "back.out", amp: 0.24 }), // zap kickback rock

  // --- enemy: wall-warden (A7) ---------------------------------------------
  // Every one is a VISUAL overlay on the SACRED shove/defeat logic (never touches
  // the warden body/hitbox, the shove push/cd/timing, or the defeat trigger — the
  // idle sway + shove lunge/recoil are host-rotation-only, which the Arcade static
  // AABB ignores and the shove/defeat detection [reads img.x/img.y] never sees; the
  // stance-widen is a body-invariant sprite scale [the static body never follows it]).
  WARDEN_SWAY: Object.freeze({ dur: 3200, ease: "sine.inOut", amp: 0.0349 }), // ±2° idle sway (full period)
  // A12 sweep: glint slit-sweep geometry (`x0/x1/y` host-local px) + stance `range/dy/sx/
  // sy/ease` hoisted from module-local consts (byte-identical).
  WARDEN_GLINT: Object.freeze({ dur: 650, ease: "sine.inOut", x0: -1, x1: 15, y: -12 }), // visor scan-sweep glint (~every 5s)
  WARDEN_STANCE: Object.freeze({ dur: 160, ease: "quad.out", range: 3 * 48, dy: 72, sx: 1.12, sy: 1.06, rate: 8 }),  // alert stance-widen (feet spread + slight grow); range=144px, rate=ease/s
  WARDEN_LUNGE: Object.freeze({ dur: 360, ease: "back.out", amp: 0.22 }), // shove lunge-into-contact + recoil rock
  WARDEN_TOPPLE: tok(600, "bounce.out"), // defeat topple gains a bounce as it settles
  WARDEN_TWITCH: tok(90, "quad.out"),   // settled body twitches once ~2s later (comedy beat)

  // --- boss: crane (A8) ----------------------------------------------------
  // Every one is a VISUAL overlay on the SACRED crane fight state machine + timings
  // (never touches c.state / c.timer / c.podsStomped, the trolley path, the slam
  // positions/hitbox [reads b.x/b.y], or the plate yank hitbox [reads pl.img.x/y] —
  // the shudder/flinch are host-ROTATION-only, the squash/defiant-shudder are body-
  // invariant SCALE, the cable sag/swing is a drawn-catenary control-point offset,
  // and the eye pupil/lid/glow are pooled overlays that only READ robot positions).
  // `amp` (radians for rotation tokens) rides beside dur/ease where a beat needs it.
  CRANE_CABLE: Object.freeze({ stiff: 62, damp: 8.5, swingMax: 22, sagK: 0.28, sagMax: 14 }), // pendulum sag+swing-lag spring
  CRANE_EYE: Object.freeze({ range: 3.2, ease: 9 }), // KOBI pupil track range (px) + follow-ease rate
  CRANE_BLINK: tok(150, "linear"), // occasional KOBI blink (fired by the shared scheduler)
  CRANE_WOBBLE: Object.freeze({ dur: 900, ease: "sine.inOut", amp: 0.055 }), // rest-state plate invite-wobble (rotation)
  CRANE_SHUDDER: Object.freeze({ freq: 42, amp: 0.03 }), // telegraph building shudder (rotation, ramps to slam)
  CRANE_SQUASH: Object.freeze({ dur: 420, ease: "quad.out", sx: 0.16, sy: 0.20 }), // slam impact squash + rebound (scale)
  CRANE_FLINCH: Object.freeze({ dur: 360, ease: "back.out", amp: 0.09 }), // per-plate-yank flinch (rotation kick)
  CRANE_DEFEAT: Object.freeze({ lampDur: 520, defiantAt: 640, defiantDur: 300, defiantAmp: 0.05 }), // staged power-down beats (ms + scale)

  // --- devices: living lab / device personality (A9) ------------------------
  // Every one is a VISUAL overlay on the SACRED device LOGIC (crusher slam timing/
  // hitbox, pedestal equip, checkpoint activation + respawn point, exit finishLevel
  // trigger, lift movement/threshold/y-positions — ALL byte-identical). The quiver is
  // host ROTATION only (the slam hitbox reads img.x/img.y — never rotation); the sigh
  // is a POOLED, budgeted steam puff; the pedestal lean is a cosmetic icon-container
  // transform + orbit-tween timeScale (the equip reads ped.x/ped.y, never the icon);
  // the checkpoint wake + lift bounce are body-invariant SCALE (origin-centred: img.x/
  // img.y and the arcade body are unmoved); the exit impatience only bumps the marquee
  // PHASE (cosmetic dots; finishLevel reads zone containment, never the phase).
  CRUSH_QUIVER: Object.freeze({ dur: 320, amp: 0.05, freq: 46 }), // wind-up servo quiver: window(ms) + rotation amp(rad) + osc freq
  CRUSH_SIGH: Object.freeze({ count: 10, life: 640 }),            // relieved steam puff after impact (pooled + budgeted)
  PED_ORBIT: Object.freeze({ range: 150, maxScale: 2.6, lean: 6, tilt: 8, ease: 6 }), // orbit speed-up + lean toward an approaching unskilled robot (px/deg)
  CHECK_WAKE: Object.freeze({ dur: 440, range: 92, sx: 0.14, sy: 0.20 }), // wake-up stretch blink on first approach (scale)
  EXIT_IMPATIENCE: Object.freeze({ boost: 0.018, ease: 5 }),     // marquee extra phase/ms while exactly one buddy waits
  LIFT_BOUNCE: Object.freeze({ dur: 460, sx: 0.10, sy: 0.16 }),  // suspension settle bounce at each travel end (scale)

  // --- social & co-op moments (A10) ----------------------------------------
  // Every one is a pure VISUAL overlay on the SACRED co-op LOGIC (carry/detach,
  // reel/zip, escort/shimmer, respawn, exit-zone detection + finishLevel — ALL
  // byte-identical). The high-five is a fire-and-forget tween REACTION started off
  // the completion state (finishLevel already fired; it never gates/ delays it) that
  // rides the TweenManager through the existing ~500ms finish gap; the reel-catch,
  // carry-wave and respawn-notice are cosmetic host-ROTATION + pooled-PUPIL/ANTENNA
  // offsets written AFTER the rig each frame (never a body/velocity/threshold); the
  // escort spark is a POOLED, budgeted particle drifting between escorting buddies.
  HIFIVE: Object.freeze({ dur: 820, ease: "sine.inOut", lean: 15, sparks: 14, slapAt: 0.5, flashDur: 300, flashEase: "cubic.out" }), // exit high-five (<=900ms): turn + lean + spark-slap in the finish gap
  REEL_CATCH: Object.freeze({ dur: 380, lean: 9, look: 3.0, sparks: 6, ease: 12 }), // reeler "caught you" brace + catch pose on buddy arrival
  ESCORT_SPARK: Object.freeze({ range: 78, gap: 85, count: 2, life: 620, maxAlive: 10 }), // hand-hold spark drifting between escorting buddies inside shimmer
  CARRY_WAVE: Object.freeze({ after: 2000, period: 640, antAmp: 5, lookAmp: 2.0, ease: 10 }), // carried buddy waves at the camera after 2s
  RESPAWN_NOTICE: Object.freeze({ dur: 750, range: 3.2, ease: 9 }), // surviving partner's pupils track the respawn beam

  // --- W3W4 M3: World-3 skill action overlays + enemy sets -------------------
  // Every one is a pure VISUAL overlay on the SACRED W3 logic (magnet latch/
  // cling/flip, bubble grant/pop, jelly patrol/knock/socket, chomper state
  // machine — all owned by GameScene and byte-identical with the rig off).
  MAG_ACT: tok(360, "cubic.out"),    // magnet glove action flash (arc pulse at the hand)
  BUBBLE_ACT: tok(340, "cubic.out"), // bubble blow ring at the mouth
  JELLY_SWAY: Object.freeze({ dur: 900, ease: "sine.inOut", amp: 0.32 }),  // tentacle wave period + rad amplitude
  JELLY_KNOCK: Object.freeze({ freqMul: 2.6, ampMul: 1.7 }),               // frantic tentacles while knocked
  JELLY_SOCK: Object.freeze({ ampMul: 0.35 }),                             // relaxed tentacles once socketed
  JELLY_WOBBLE: Object.freeze({ dur: 700, ease: "sine.inOut", amp: 0.06 }), // gentle patrol dome wobble (host rotation)
  CHOMP_IDLE: Object.freeze({ dur: 1200, ease: "sine.inOut", open: 0.22 }), // lazy idle chomp cycle (jaw rad)
  CHOMP_TELE: Object.freeze({ open: 0.6, quiver: 0.05, freq: 34 }),         // telegraph: jaw agape + quiver
  CHOMP_LUNGE: Object.freeze({ dur: 130, ease: "quad.out", open: 0.75 }),   // snapping fast during the lunge
  CHOMP_DOZER: Object.freeze({ dur: 1700, ease: "sine.inOut", open: 0.3 }), // defanged contented panting
  CHOMP_TILT: Object.freeze({ amp: 0.09 }),                                 // anticipation/lunge body tilt (rad)

  // --- W3W4 M4: World-4 skill action overlays + enemy sets -------------------
  // Every one is a pure VISUAL overlay on the SACRED W4 logic (freeze cast/gate,
  // beam hold/battery, gloomy drift/flee, ticker wind/dash — all owned by
  // GameScene and byte-identical with the rig off).
  FREEZE_ACT: tok(420, "cubic.out"),  // freeze cast flash (expanding frost star at the hand)
  BEAM_ACT: tok(300, "cubic.out"),    // beam ignite flash (warm ring at the lamp hand)
  GLOOM_BOB: Object.freeze({ dur: 1400, ease: "sine.inOut", amp: 0.07 }),  // lurking dome bob (host rotation)
  GLOOM_WISP: Object.freeze({ dur: 1100, ease: "sine.inOut", amp: 0.3 }),  // trailing wisp sway (feeler channel)
  GLOOM_FLEE: Object.freeze({ freqMul: 2.8, ampMul: 1.9 }),                // frantic wisps while dazzled/fleeing
  TICKER_KEY: Object.freeze({ dur: 900, ease: "linear", spin: 240 }),      // back-key spin (deg/s, |vx|-scaled on a dash)
  TICKER_WIND: Object.freeze({ freq: 26, amp: 0.05 }),                     // wind-up telegraph quiver (host rotation)

  // --- Bolt & KOBI cameo animation (A11) -----------------------------------
  // Menu polish (#1-#4) extends the existing Title/Hub/UI scene code directly; the
  // in-level cameo (#5) is a pure display-list BACKDROP with NO body/collision/timing
  // effect, gated behind the rig A/B switch (byte-identical under ?animoff=1).
  //
  // TITLE BOLT (extends the existing buildBolt body-sway + tail-wag tweens):
  BOLT_TAIL: Object.freeze({ slow: 300, fast: 120, decay: 2600 }), // wag period: idle(slow ms)->excited(fast ms), eased back over decay ms after menu moves
  BOLT_PERK: Object.freeze({ dur: 260, ease: "back.out", rise: 5, tilt: 10 }), // ear perk (px lift + deg) when the selection moves
  BOLT_SIT: Object.freeze({ dur: 420, ease: "back.out", drop: 4, squash: 0.08 }), // settle into a sit pose (cosmetic body drop + squash)
  BOLT_SPIN: Object.freeze({ dur: 620, ease: "cubic.inOut", hop: 14 }), // excited 360 spin + hop on NEW GAME activation
  // TITLE CORNER EYE (keeps glanceAtSelection from P1; adds a rare bored roll):
  EYE_ROLL: Object.freeze({ dur: 900, ease: "sine.inOut", r: 7, minGap: 9000, jitter: 8000 }), // rare bored eye-roll idle (full loop of the iris)
  // HUB TICKER EYE (pupil follows the selected node):
  HUB_EYE: Object.freeze({ ease: 10, range: 4.5 }), // fps-independent pupil-follow lerp rate + max offset (px)
  // KOBI AVATAR MOOD SET (pairs with U9; driven off the SAME existing mood value):
  KOBI_GLOAT: Object.freeze({ dur: 240, ease: "sine.inOut", squint: 0.42 }), // gloat squint (avatar sclera scaleY pinch)
  KOBI_ANGRY: Object.freeze({ dur: 360, shakes: 5, amp: 2.4, flare: 0.5 }), // angry shake (px) + red ring flare (extra alpha pulse)
  KOBI_DEFEAT: Object.freeze({ blink: 1700, lidHold: 260 }), // defeated slow-blink period (ms) over the drooped eyelid
  // IN-LEVEL CAMEO (#5) — pure backdrop, NO body, NO collision, NO gameplay effect:
  CAMEO: Object.freeze({ yFrac: 0.16, dur: 1600, gap: 40, bob: 3.2, gallop: 8.5, droneBob: 4, minDelay: 7000, rollGap: 5000, chance: 0.14, scale: 0.7 }),
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
