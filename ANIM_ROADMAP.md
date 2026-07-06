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
