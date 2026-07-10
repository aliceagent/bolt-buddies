# Bolt Buddies — Character Animation & Liveliness Roadmap (A1–A12)

Every character — both player robots (in all four skill forms), every enemy,
the crane boss, and the mascots (Bolt, KOBI) — gets a real animation set:
idle/waiting tiers, locomotion, action, and reaction animations. The bar:
**nothing on screen ever sits perfectly still, and every behavior telegraphs
itself through motion.**

## Ground rules (every sprint)

1. **Physics is sacred.** Animations are visual-only. NEVER touch body
   size/offset/velocity from animation code (the UI Sprint 3 rejection is the
   cautionary tale — squash leaked into collision and the beat matrix caught
   it). All pose motion happens on attached visual parts, scale multipliers
   over baseScale, or offset containers. The 12-run matrix gates every sprint.
2. **Cancelability.** No animation ever delays or eats input. Fidgets/waits
   cancel the frame input arrives. Action anims are fire-and-forget overlays
   on instant game logic (logic first, motion after — same as today).
3. Pooled parts, shared tweens/timers, zero per-frame allocations; a global
   MOTION token table (durations + eases) added in A1 and used everywhere.
4. Canvas-safe (drawn parts, no tint-only states). Procedural art only.
5. Full stack green every sprint (42/30/29/21 + matrix 12/12). Burst-shot
   contact sheets (3–5 frames over ~1s) are the review artifact for motion.

## Conflict resolution with the other roadmaps (BINDING re-scopes)

This roadmap OWNS all character motion. To prevent double-implementation:
- **GFX P6 "Robot life" is re-scoped to static art only**: shadow blobs,
  stronger phase afterimage layers, carried-pose overlay art. Its animation
  bullets (tread animation, eye tracking, step squash, start/stop dust) MOVE
  here (A2/A3).
- **GFX P7 "Enemy character 2.0" is re-scoped to static art only**: shell
  patterns, splat decals, KOBI cab decal, face plates, cabin window art,
  plate cracks. Its animation bullets (feeler twitch, wheel spin, sway,
  crane eye tracking, cable sag) MOVE here (A5–A8).
- **UX U9 is re-scoped to KOBI reactive DIALOGUE only** (death-streak and
  all-cores lines, rate limiting). Its motion bullets (high-five, idle
  emotes) MOVE here (A3/A10).
- A-series runs AFTER the GFX static-art sprints so it animates final art.

## The sprints

### A1 — Animation micro-rig & motion tokens (enabler)
A small `src/anim/` module: (a) MOTION tokens (durations/eases); (b) a part
system — attach named visual parts (pupils, tread overlay, antenna, arm
glyphs) to a physics sprite, positioned each frame from a lightweight pose
object; (c) a pose state machine helper (idle/walk/jump/fall/land/act/carry
/hurt) with enter/exit hooks and input-cancel; (d) a shared fidget scheduler
(one timer serving all characters, staggered). Players and enemies register
with the rig; this sprint wires it invisibly (no behavior change) and proves
zero fps cost (A/B) + full stack green.

### A2 — Player locomotion set
Walk: tread-scroll overlay matched to vx, body bob (2px sine synced to
tread period), slight forward lean; skid pose + dust when reversing above
60% speed. Jump: 2-frame anticipation squat on takeoff; rising pose (visor
pupils up, antenna trails down), apex float pose, falling pose (pupils
down); landing recovery blends into the existing squash. Start/stop tread
dust puffs. All per skill form (heavy slower/thuddier, tiny quicker with a
step-crest micro-squash).

### A3 — Player idle & waiting tiers
Tier 0 (always): breathing bob + occasional blink (exists — retime via
MOTION). Tier 1 (~4s idle): fidgets — look left/right (pupils + slight body
turn), antenna twitch, tread shuffle. Tier 2 (~8s, the "waiting" set,
per-skill): grapple twirls a little hook glyph; heavy does a knuckle-crack
tap-tap stomp; phase flickers half-transparent and startles itself; tiny
hops in place twice. Partner-aware: if both idle within 6 tiles, they turn
and look at each other, one beeps (tiny note), the other tilts. Everything
cancels instantly on input.

### A4 — Player action & death set
Zip: reach-out arm glyph toward the anchor + body stretch during flight;
hang pose at arrival. Stomp: mid-air tuck windup, impact splay + antenna
boing. Carry: carrier leans back slightly, carried buddy arms-up wobble.
Throw: windup lean + follow-through; high-toss adds a squat. Pedestal
equip: the robot "tries on" the skill (badge pops onto the head with a
flash + one-beat pose). Phase transit: horizontal shimmer elongation.
Death/respawn upgrade: death scatters 4–5 drawn parts (visor, tread,
antenna) with the boom; the respawn beam pulls the parts back together and
snaps them into place (parts pooled, ≤2 concurrent deaths worth).

### A5 — Scuttlebug set
Multi-frame leg scuttle cycle (3 leg positions, speed-synced), antenna
feelers twitch at random, alarm rear-up when a player enters ~160px
(pause, lift front legs, then resume), bonk-turn stumble frame at patrol
edges, squish keeps the pop + adds a legs-up ghost puff variant (rare, 1
in 4). W2 shell variant inherits all (static art from P7).

### A6 — Patrol Roller set
Visible wheel rotation (spoke overlay spin matched to velocity), pupil
smoothly tracks patrol direction and SNAPS to a spotted player, iris
dilates on alert, klaxon lamp spins while alerted, "hmm?" head-tilt +
question-squint for 1s when a player breaks line of sight, zap recoil
kickback. Beam behavior untouched (matrix-guarded).

### A7 — Wall-Warden set
Idle sway (exists — retime) + a visor scan-sweep glint every ~5s; alert
stance widen (feet spread, slight grow) when a player is in front within
3 tiles; shove gets anticipation lunge + follow-through recoil; defeat
topple gains a bounce, settled body twitches once ~2s later (comedy beat);
the "HMPH" moment syncs with the lunge contact frame.

### A8 — Crane boss animation pass
Cable rendered with genuine 2-point sag + swing lag behind trolley motion;
cabin KOBI eye (art from P7) tracks the nearest robot and blinks; plates
wobble invitingly while yankable (rest state); telegraph adds a building
shudder (amplitude ramps until slam); slam impact squash + rebound on the
crane body; each yanked plate makes the crane "flinch"; defeat becomes a
staged power-down: slump, lamp dies, one last defiant shudder, settle.
State machine and timings byte-identical (1-3 matrix runs are the guard).

### A9 — Living lab (device personality)
Crusher: servo quiver anticipation before each slam, relieved steam sigh
after. Pedestal: skill icon orbit speeds up + leans toward an approaching
unskilled robot ("pick me!"). Checkpoint: lamp does a wake-up stretch blink
when first approached. Exit door: marquee chase speeds up impatiently while
exactly one buddy waits (pairs with the waiting bubble). Lift: settles with
a small suspension bounce at each end of travel.

### A10 — Social & co-op moments
Exit high-five (moved from U9): both robots in the zone within 1.5s → turn,
lean, spark-slap before the overlay (≤900ms, timing-guarded — finishLevel
fires exactly as today; suites unaffected). Reel arrival: reeler does a
"caught you" brace + catch pose. Escort: a soft hand-hold spark drifts
between buddies while escorting inside shimmer. Carried buddy waves at the
camera after 2s of being carried. Respawn: the surviving partner's pupils
track the respawn beam (they "notice" each other).

### A11 — Bolt & KOBI cameo animation
Title Bolt full set: sit, ear perk at menu movement, tail wag speeds with
selection changes, excited spin on NEW GAME activation. In-level Bolt
cameo: once per level (rare, background layer) Bolt dashes across chased
by a tiny KOBI drone — pure backdrop, no collision. KOBI avatar mood set
(pairs with U9 dialogue): gloat squint, angry shake + red ring flare,
defeated droop + slow blink; hub ticker eye follows node selection;
title corner eye keeps its glance-at-selection (from P1) plus a rare bored
eye-roll. All cameos pooled and skippable.

### A12 — Motion audit & contact sheets
Sweep every animation onto MOTION tokens (no stray magic durations);
cancelability audit (scripted: inject input mid-anim everywhere, assert
state machine yields instantly); fps A/B on 1-3 and 2-2 with maximum
concurrent motion; full contact sheets (scripted burst captures per
character per state) reviewed shot by shot; fix everything found; full
stack green + matrix twice. Findings table appended here.

## Pipeline order (single source of truth, supersedes earlier notes)

1. **GFX P1** (title cinematic) — in flight now.
2. **UX U1–U11** — clarity/fun priority (U4/U5 under full beat protocol).
3. **UX U12** — UX audit closes the U-series.
4. **GFX P2–P11** — P6/P7 re-scoped to static art (see above).
   Dependency notes: P2 must preserve U8's hub clock chips; P9's overlap
   fix must include U1's coach bubbles; P10 must preserve U11's new
   settings rows.
5. **ANIM A1–A11** — animates the final static art.
6. **A12 then GFX P12** — motion audit, then the global visual audit runs
   absolutely last.

## End-state (standing owner instruction)
After every sprint above: a **userland campaign loop** — `tools/campaign.mjs`
plays the WHOLE game in one continuous session with real input only (title
menu → NEW GAME → hub → 1-1…2-3 via real hub navigation and clear-overlay
continues, plus the tutorial from the menu), asserting save/unlock
progression and zero page errors. Failures triage per the beat-failure
protocol; fix; rerun; loop until two consecutive fully-clean campaigns, and
re-run after any subsequent change.

**Shipped (`npm run campaign`).** `tools/campaign.mjs` drives ONE continuous
Canvas browser context (title → NEW GAME → KOBI onboarding SKIP → hub → 1-1…2-3
via real hub navigation + SPACE-to-enter → the reused Beat-Kit routes to beat
each level → clear-overlay CONTINUE back to the hub → TUTORIAL from the Title
menu). Real Playwright keys only advance play; `evaluate()` is used solely to
READ state (scene id, save, ux records, hub cursor) and to zero the SL2/SL3
session peaks — exactly like the beat runner. Per level it asserts the save
`unlocked` count advanced in order (fresh → 2…7), the cores array + a ux-v1
best-time record persisted, and `__bbWatchdogPeakTier` (SL2) + `__bbSoftlockPeak`
(SL3) both stayed **0** (a real playthrough never trips the softlock guards —
the no-un-signalled-softlock proof). The tutorial asserts it returns to TITLE
and writes NO unlock. Canvas sidesteps the WebGL-context wedge that forces
`tools/gallery.mjs` to use a fresh browser per chunk, so a whole campaign runs
in one session with true save/unlock continuity; a level that fails to complete
is retried in place (ESC-ESC to the map, re-enter) to absorb the documented
2-2/1-3 thermal env flake, and only first-try passes count toward the two
consecutive CLEAN campaigns. Verified: two consecutive CLEAN campaigns, 0
flake-retries, 0 JS page errors, SL2/SL3 peak 0 on every level.

## A12 audit findings

The final sprint hardened the motion system: a token sweep, a scripted
cancelability audit, an fps A/B under max motion, and full contact sheets. It
added NO gameplay and changed NO value — a pure, byte-identical refactor
(`tools/snap_p2_a12.mjs` is the probe). Diff: `src/anim/*.js` (7 files,
+86/−75) + the probe (445 lines) + 26 `tools/shots/p2/a12-*.png`.

### 1. Token sweep — what was audited & found

Audited every `src/anim/*.js` module for stray animation durations / eases /
amplitudes not sourced from `MOTION`/`TIMING`. Finding: the discipline
**tightened across the sprint series**. The A8–A11 modules (crane, device,
social, cameo) were already the gold standard — every beat parameter already
lived in a `MOTION` token; the only strays there were three inline tween
literals. The A2–A7 modules (player, bug, roller, warden) sourced their
*tempo/ease* from tokens but kept beat-specific **amplitudes / rates / ranges**
as module-local `const`s. The sweep hoisted those into their tokens, bringing
the older modules up to the A8–A11 standard. Per that same standard, per-frame
**curve-shape math** (phase multipliers `Math.PI*N`, decay `(1-p)`, `Math.sin`
envelopes, smoothstep breakpoints) stays inline in the beat — it is the hand-
authored shape of a pose, not a tunable token (this is exactly how crane/device
were already written).

What was fixed (all byte-identical — 36 hoisted values verified `=== ` the
pre-A12 literal by the probe):

| Module | Was (module-local / inline) | Now (MOTION token field) |
|---|---|---|
| `social_anim` | `ease: "sine.inOut"`, `ease: "cubic.out"` inline in the high-five tweens | `HIFIVE.ease`, `HIFIVE.flashEase` |
| `death` | `delay: 240` inline in the orphan-fade tween | `DEATH_FADE.delay` |
| `player_anim` | `SCROLL_K = 0.0007`; `FIDGET_DUR` literal table (8 spans) | `TREAD_GAIN.k`; `FIDGET_ENV.{look,twitch,shuffle,twirl,tap,flicker,hop,partner}` |
| `bug_anim` | `LEG_STRIDE`, `REAR_RANGE`, `REAR_TILT`, rear-ease `6`, feeler-flare `0.5`, stumble `0.16`, twitch `0.5` | `BUG_SCUTTLE.stride`, `BUG_REARUP.{range,tilt,rate,flare}`, `BUG_STUMBLE.amp`, `BUG_FEELER.amp` |
| `roller_anim` | `ROLL_DEG_PER_PX`, `PUPIL_SLIDE/TRACK/AIM_X/AIM_Y`, `DILATE_ALERT/EASE`, `KLAXON_SPIN`, squint `0.45` | `ROLLER_WHEEL.degPerPx`, `ROLLER_PUPIL.{slide,track,aimX,aimY,dilate,dilateEase}`, `ROLLER_KLAXON.spin`, `ROLLER_HMM.squint` |
| `warden_anim` | `STANCE_RANGE/DY/SX/SY/EASE`, `GLINT_X0/X1/Y` | `WARDEN_STANCE.{range,dy,sx,sy,rate}`, `WARDEN_GLINT.{x0,x1,y}` |

Already clean (no change): `crane_anim`, `device_anim`, `cameo_anim`, `pose.js`,
`rig.js`, `fidget.js`, `index.js` — all beat parameters already tokenized.
(`DEG = Math.PI/180` is a pre-existing unused unit const in roller/warden, left
as-is; art-geometry anchors like `EYE_LX/LY`, `EYES/ANT/TREAD` and drawn-part
coordinates are static texture geometry, not motion tokens.)

### 2. Cancelability audit (scripted) — animation never eats/delays input

- **Player input latency** (the headline): frames from a real key press to the
  body responding, rig-OFF baseline vs rig-ON with a deep tier-2 *wait* fidget
  actively playing → **1 frame in both**. Anim never delays input.
- **Same-frame cancel**: every wait/fidget beat (twirl, tap, flicker, hop, look,
  twitch, shuffle) is dropped + the idle clock zeroed the frame an input is
  seen — 7/7.
- **Body-invariance** (the structural proof that anim *can't* eat control): for
  every enemy/crane rig, a reaction anim plays (visible rotation/scale) yet an
  isolated `rig.update()` moves the arcade BODY world-box + velocity by exactly
  **zero** (roller, bug, crane — all rigs). The device controller likewise moves
  no device logic position. Players: over real frames, the collision body
  POSITION (x,y) + WIDTH are byte-identical rig-ON vs rig-OFF, height within
  0.008px (a pre-existing sub-pixel wobble from Arcade's deferred scale→body
  sync vs the A3 breathe multiplier — present since A2, tolerated by the matrix,
  not introduced here).
- **Fixes**: none required — no place was found where an anim tween held a value
  that should yield to input. The A1 architecture (logic first in preUpdate, the
  rig as a pure post-logic overlay that never writes a body) already guarantees
  it; the probe proves it empirically.

### 3. fps A/B under MAX concurrent motion (Canvas, headless SwiftShader ~26fps)

All enemies forced to their busiest continuous reaction + cameo dashing + death-
scatter pool loaded + both players driven right, rig-ON vs rig-OFF:

| Level | rig-ON | rig-OFF | delta |
|---|---|---|---|
| 1-3 | ~26 fps | ~27 fps | −0.6 … −2.3 fps |
| 2-2 | ~25–26 fps | ~26–27 fps | −0.8 … −1.3 fps |

Within the ~2.5 fps bar (deltas are noisy on this thermally hot box; the rig
does real per-frame work so a small negative delta is expected).

### 4. Contact sheets

26 `tools/shots/p2/a12-*.png`: player idle/run/jump/fall/land/carry/hurt/death/
respawn; bug patrol/react/defeated; roller patrol/react/zap; warden patrol/
react/defeated; crane rest/telegraph/slam/defeated; device crusher/lift; social
high-five; cameo.

### 5. Full-stack verification

- Token values byte-identical: 36/36 `=== ` the pre-A12 literals (probe §1).
- `?animoff=1` byte-identical preserved (the whole rig-A/B contract holds; the
  refactor changed no value).
- **12-run beat matrix, run twice** (anim-ON, Canvas): pass 1 = **11/12**
  (only `2-2 [A:P1=G]` fan-lift flake); pass 2 = **12/12** (same run passed with
  zero code change). The 2-2 failure proven ENVIRONMENTAL by interleaved
  anim-ON/OFF ×3: with `?animoff=1` the rig (and every A12 change) is fully
  disabled, yet 2-2 flakes with **identical** failure signatures run-for-run
  (fan-lift + "T down in the yard" deck-timing) — the documented thermal flake,
  not the refactor.
