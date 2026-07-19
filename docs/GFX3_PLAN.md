# GFX3 "Deep Field" — visual polish round: plan of record

Round goal: take the shipped Lumen Lab look and add the layer that reads as
*production polish* — impact feel, de-banded surfaces, a WebGL-only light tier,
real depth (foreground + weather), and cinematic framing. Everything procedural
(no sprites, no imports), everything respecting the two-tier renderer contract.

Owner protocol (same as GFX2): each sprint is built by an Opus sub-agent from
the spec below, then QA'd by Fable (screenshots on BOTH tiers + targeted test
runs), fixed if needed, and pushed before the next sprint starts. Final full
gate (G6) runs the entire test kit and promotes dev → main.

## Verified facts this plan is built on (probed 2026-07-19)

- Players get **WebGL**: `main.js` uses `Phaser.AUTO`; only `?canvas=1` (the
  test tier) forces Canvas. Probe: container Chromium boots the game in WebGL
  (renderer.type=2, SwiftShader, ~46fps on Title) → the WebGL tier IS
  screenshot-QA-able in this environment.
- Every scene fade in the game is the same hardcoded navy `(4, 6, 20)`
  (GameScene 446/4391/4401, HubScene 47/562, OnboardScene 29, Epilogue 132/342).
- Comfort settings exist and MUST be respected: `uxShakeScale()` (full/soft/off)
  and `uxFlashScale()` in `src/ux.js`. Effect sites scale amplitude by these.
- There is **no hit-stop** anywhere today (camera shake only, GameScene 2573).
- The WebGL-gate pattern is established: `addVignette` (GameScene ~869, "WebGL
  tier only") and HubScene `_webglIris`. Backdrop props are gated for Canvas
  fps reasons (GameScene 848-868 comment) — precedent for gating new ambience.
- `backdrop.js` exports addGradient/addMotes/addPropStrip/addFogBand/addDrips/
  addDustShafts/addVignette; prop strips are background-only (below terrain).
- Bakes are Canvas-2D gradients → visible banding on large soft areas.
- Player squash/stretch, throw trails, belt scrolling, spark/dust/shard pools
  all exist — do not duplicate them.

## Global rules (binding for every sprint)

R1. **Canvas-tier invariance.** The `?canvas=1` tier is the test/reference
    tier. New always-on work must be cheap, deterministic, and safe there; new
    *ambience* (extra particles, halos, cones, weather) is WebGL-gated via one
    shared helper `isWebGL(scene)` (add to `src/ui/paint.js`, used everywhere —
    no ad-hoc renderer checks).
R2. **Comfort settings.** Any new camera motion (zoom punch, cinematic zoom)
    scales by `uxShakeScale()`; any new flash by `uxFlashScale()`. Hit-stop is
    skipped entirely when shake is "off".
R3. **No per-frame allocation.** Pool or pre-create everything; sine-breathe
    via tweens or the shared counters, never `new`/`add` in update().
R4. **Procedural only.** Reuse `paint.js` recipes (softBody/glowShape/
    fakeRadial/ringGlow/sheen/haloCircle) and the baked-texture `make()` flow.
    Canvas-safe drawing only in bakes (no fillGradientStyle, no setTint
    dependencies for correctness — tint may *enhance* under WebGL only).
R5. **Depth discipline.** Use `DEPTH` constants; new foreground layer gets a
    named constant, nothing hand-numbered.
R6. **Don't touch** `tools/` (except G6), test files, physics values, timings
    of existing tweens/fades (colors may change, durations may not), or the
    blip-bar/stuck-UX contracts from the TEXT-UX round.
R7. **Commit AND push on landing** (recycle protocol): each sprint agent
    commits its work to `dev` and pushes to the `buddies` remote itself,
    message prefix `GFX3 Gn:`. QA fixes land as follow-up commits.
R8. **Decisions logged.** Any spec deviation or judgment call → one-liner in
    the Decision appendix of this file (same commit).

## QA cycle (per sprint, run by Fable after the agent lands)

- `node tools/playtest.mjs` (must stay green).
- One beat run per affected world: `node tools/beat/runner.mjs --level <id>`
  (G1 runs one per world since it touches global feel).
- Screenshot pass on BOTH tiers: existing snap tools where they cover the
  ground (snap_w4_l43 covers the 4-3 cinematic end-to-end), plus ad-hoc
  Playwright shots for new surfaces; WebGL shots via plain URL (no ?canvas=1).
- Grep audit: every new ambience call site sits behind `isWebGL`.
- Full kit only at G6.

---

## G1 — Impact feel: world-colored transitions + hit-stop

**1a. World-colored fades.**
- `constants.js`: add `fade: 0xRRGGBB` to each `WORLD_THEMES` entry — the
  world's `bgBottom` pulled ~25% toward its `accent` (dark, moody, NOT bright).
  Export `FADE_NAVY = [4, 6, 20]` for neutral sites.
- Replace hardcoded `(4, 6, 20)` at: GameScene entry `fadeIn` → use the
  CURRENT level's world fade; GameScene exit fades (4391/4401) → hub-bound
  fade stays navy, next-level fade uses the DESTINATION world's fade;
  HubScene → level `fadeOut` (562) uses the target world's fade; HubScene
  entry fadeIn (47) and Onboard (29) stay navy; Epilogue keeps its own.
  Durations stay exactly 250ms (R6).
- Level clear: after `complete` and before the clear overlay settles, one warm
  pop `cam.flash(220, 255, 244, 214)` scaled by `uxFlashScale()` (skip at 0).

**1b. Hit-stop + zoom punch.**
- GameScene: `impactPunch(kind)` with kinds `light` (40ms stop, 1.5% zoom)
  and `heavy` (70ms stop, 3% zoom + the existing shake call site's amplitude).
- Stop mechanism: set `this.physics.world.isPaused = true`, restore via
  `this.time.delayedCall`; guard with `_hitStopUntil` (extend, never stack);
  NEVER trigger while `this.frozen` special-state logic would conflict — if
  `this.frozen` is active, skip the stop and keep only the zoom punch. Skip
  everything when `uxShakeScale() === 0`.
- Zoom punch must not fight `updateCamera`: add a `this.camPunch = 1`
  multiplier that `updateCamera` applies to its computed zoom; the punch
  tweens `camPunch` 1 → 1+k → 1 (90ms, yoyo, Quad.Out) where
  k = 0.015|0.03 × `uxShakeScale()`.
- Call sites: enemy stomp/squish kill (heavy), crane boss hit (heavy), heart
  station core pulled (heavy), core/gear pickup (light), lever flip (light).
  Find sites via the existing sfx/shake calls; wire, don't restructure.
- **Risk note:** the beat driver is state-driven (`waitFor`), so ≤70ms pauses
  should be absorbed — but this is exactly the kind of change that trips the
  documented reel-chord load race (D11, TEXT-UX). QA MUST run the tut softlock
  scenario plus one beat run per world before sign-off.

## G2 — Surface quality: de-banding dither + menu hover springs

**2a. Baked-gradient de-banding.**
- In the bake step for large soft-gradient textures — `bgGradient1..4`, the
  big glow-blob texture(s), the storm sky (if separately baked), the epilogue
  sky — stamp a sparse mono speckle AFTER the gradient fill: 1×1 px dots,
  ~1 per 24px² region, half lighten (white a≈0.03) half darken (black
  a≈0.03). Math.random at bake time is fine (bakes are boot-once, visual
  only). Result: banding dissolves into grain; must be *invisible as texture*
  at 100% zoom — tune down before tuning up.
**2b. Menu hover/focus springs.**
- `src/ui/kit.js`: shared `springFocus(scene, go, opts)` — kill existing
  tweens on the target, scale 1 → 1.06 → 1.0 with Back.Out ≈160ms, plus a
  glow/underline alpha bump where the widget has one. Mouse `pointerover` and
  keyboard focus-change route through the SAME function.
- Wire into: Title menu items, Hub level nodes, Settings rows, the audio
  sliders' focus, Mute dropdown entries, pause-menu items.
- Keyboard nav behavior (order, wrap, activation) must not change (R6).

## G3 — The WebGL Lumen tier (all behind `isWebGL`)

The single highest-leverage sprint: players see it, tests can't.
- **Machinery bloom:** additive-blend halo images (reuse existing halo/ringGlow
  textures where possible) behind emissive devices — lit levers, checkpoints,
  cores, beam turrets, active magnets, phase walls. Slow alpha breathing
  (sine, 1.4–2.2s, phase-offset per instance so they don't pulse in unison).
  Pre-created at level build, pooled, capped ≤40 halos per level.
- **Tinted depth:** the far parallax grid + motes get per-world `accent2`
  tints (near grid is already accent-tinted under WebGL). Subtle — alpha
  stays as-is, tint only.
- **Light cones:** bake one soft cone texture at boot (only when WebGL); place
  under lamp/dust-shaft sources at additive alpha 0.05–0.12, static.
- **Player dark-zone glow:** in dark-zone levels (4-3 hall), an additive
  radial glow image follows each buddy; alpha ramps 0 → ~0.5 with the local
  darkness factor the dark-zone system already computes.
- Depth: halos sit immediately below their device; cones below terrain
  where feasible; nothing above the UI.
- QA: side-by-side WebGL vs Canvas screenshots per world; a Canvas beat run
  must behave identically; grep audit for `isWebGL` gating (R1).

## G4 — Depth: foreground occlusion + in-playfield weather

**4a. Foreground occlusion strips** (BOTH tiers — dark baked shapes, cheap).
- `backdrop.js`: `addForegroundStrip(scene, world)` — sparse near-silhouette
  props at new `DEPTH.foreground` (above players), scrollFactor 1.12–1.18,
  near-black world-tinted fills, alpha ≈0.92.
- **Readability rules (hard):** ceiling-hung shapes only (cable loops, pipe
  stubs, vent lips) confined to the top ~22% of the screen, plus occasional
  floor-corner posts hugging the far left/right screen edges; density ≤1 prop
  per ~600px of level width; NONE in the tutorial, NONE in the 4-3 arena,
  none within 96px of spawns/exits/stations/checkpoints (positions are known
  at level build).
- Canvas fps guard: these are a handful of static images — measure Canvas fps
  on the heaviest W2 level before/after; if it moves >2fps, gate them WebGL.
**4b. Weather identity** (WebGL-gated, R1 — Canvas keeps today's motes).
- Per-world drifting element IN the playfield (scrollFactor 0.85–0.95, alive
  cap ≤24, tiny): W1 warm dust drift; W2 vent ember sparks (rare, rising);
  W3 plum/mint spore twinkles; W4 indigo motes, and in the storm levels
  diagonal snow streaks.
- Reuse the particle-texture family; no new managers in update().

## G5 — Cinematic framing + hub life

**5a. Letterboxing** for scripted beats.
- Helper (GameScene overlay, screen-fixed, above gameplay, below UIScene):
  two bars (each ~9% of H) slide in 300ms, out 250ms; plus a slow camera
  push 1.0 → 1.06 over the beat, scaled by `uxShakeScale()`, released on
  control return.
- Beats: the 4-3 fight opener (eye reveal), the KOBI power-down → Bolt rescue
  cinematic, and the crane-boss intro. The blip bar and the T-round skip
  contracts (ENTER/START) must keep working exactly as shipped (R6).
**5b. Hub life** (both tiers, cheap tweens).
- Current-level node: slow pulse (scale 1 → 1.05, glow alpha sine, ~1.6s).
- Route line from the last completed node to the current one: marching dashed
  dots (alpha-cycled pooled dots — no re-rasterising fills).
- Completed nodes: occasional tiny star glint (staggered, rare).
- QA: `snap_w4_l43.mjs` re-run covers 5a end-to-end (it drives the full 4-3
  cinematic); hub screenshots + a campaign smoke cover 5b.

## G6 — Full gate & promote (Fable, not an agent)

- Full kit: playtest, playtest_w2, playtest_audio, playtest_vo, tut_sanity,
  playtest_textbox, beat 24-run matrix, full softlock suite, campaign to
  2-clean.
- Canvas fps before/after on 4-3 and heaviest W2 (guardrail: no regression
  beyond documented container noise).
- Contact sheet: WebGL + Canvas screenshots of every world, Title, Hub,
  Epilogue.
- Promote dev → main (fast-forward), final report to the user, decision
  appendix closed out.
- Note for the report: walkthrough videos remain pre-Lumen-Lab; regenerating
  them is a separate approved-work item.

---

## Decision appendix (append-only)

- G0-D1: WebGL tier verified QA-able in-container (SwiftShader, type 2) —
  the G3 sprint ships with screenshot evidence, not just code review.
- G0-D2: weather + light tier WebGL-gated rather than both-tier, preserving
  Canvas-tier fps and test invariance (precedent: props/vignette gating).
- G0-D3: builders push to `buddies dev` themselves on landing (recycle
  protocol; a recycle this session destroyed local-only state again).
- G1-D1: the plan's stale exit-fade line numbers (4391/4401) resolve to the two
  live GameScene fadeOuts: doExit (→Hub) = the hub-bound one → FADE_NAVY;
  doRestart (→level reload) = the level-bound one → destination world's fade
  (destination == the same level's world).
- G1-D2: level-clear flash softened by multiplying the warm RGB by uxFlashScale()
  (255/244/214 × fs), fired right after physics.pause() in finishLevel, before
  the 500ms overlay delayedCall. uxFlashScale never returns 0, but the ×0 skip
  guard is kept as specified.
- G1-D3: impactPunch restore is a single self-rescheduling delayedCall — if a
  later call extended _hitStopUntil it re-arms for the remainder instead of
  unpausing early, and it refuses to unpause while frozen/paused/complete own
  physics (never clobbers a menu/clear/freeze pause).
- G1-D4: no separate "gear" pickup exists in the game; the light punch for
  "core/gear pickup" is wired at the single data-core pickup site (sfx.core).
- G1-D5: enemy-kill heavy punch wired inside squishBug (the one enemy-kill
  choke point, reached by both head-stomp and the heavy-stomp radius); crane
  boss hit wired at stompPod (the pod-crunch that damages the crane).
- G2-D1: the only large soft-gradient TEXTURE bakes are BootScene's `gradient()`
  (bgGradient + bgGradient1..4) and `blob()` (glowBlob + glowBlob1..4) helpers;
  the ONE shared `ditherRect(g,w,h)` (src/ui/paint.js) is called from both. No
  separate "storm sky" bake exists (the 3-3 "storm" is pooled scrap-chunk
  sprites, not a sky). The epilogue sky is a LIVE command-list graphics
  (this.add.graphics re-rendered every frame), not a generateTexture bake:
  stamping ~1/24px² speckle onto it would replay tens of thousands of fillRects
  per frame (R3 violation, worst on the Canvas tier), so it is intentionally NOT
  dithered — matching the plan's "epilogue sky IF baked" wording.
- G2-D2: Hub level nodes are NOT wired with springFocus. `updateSelection` already
  runs a continuous selection pulse (a repeat:-1 sine tween on a `proxy.s` whose
  onUpdate writes n.circle/n.label scale every frame); a one-shot spring on the
  same scale channel is clobbered each frame by that onUpdate, and R6 forbids
  changing the existing pulse's timing to make room. Fights → skipped per the 2b
  "keep existing treatment; skip if it fights" rule. The pulse + double reticle
  ring + KOBI glance remain the node's focus animation.
- G2-D3: springFocus springs relative to each widget's OWN rest scale (memoised on
  the object as `_springBase`), because the Title's selected button rests at 1.05,
  not 1 — springing to an absolute 1.06 would have SHRUNK it. Title routes both
  mouse (pointerover→selectIndex) and keyboard/pad (moveSel) through updateMenu,
  which kills any in-flight spring per item before re-setting base scale, so a
  deselected item can never be left enlarged by a lingering tween.
- G2-D4: Settings rows + Mute slider/toggle rows spring the row LABEL only (their
  highlight glow is redrawn into a per-row Graphics, not a discrete alpha object,
  and the rows aren't containerised). Left-origin labels grow a few px rightward;
  at 6% this reads as a gentle nudge. Pause items are centre-origin text (symmetric
  pop). Settings/Pause spring on moveSel (focus change) only — never on A/D value
  adjust; Mute (pointer-only) springs on a newly-added pointerover, additive to the
  existing click/drag handlers so activation is unchanged.
- G1-D6 (QA sign-off): first QA batch showed 6/8 beat + tut HARD; A/B against
  pre-G1 src under identical load showed the 2-2 fan-lift step failing once
  per batch on BOTH builds (varying assignment — the documented D7 contention
  flake) and the 1-2 reel + tut HARD unreproducible on HEAD (both RECOVERABLE
  round 2). G1 exonerated: failures environmental, not hit-stop. Signed off.
- G3-D1: `isWebGL(scene)` added to src/ui/paint.js is the ONE renderer gate for
  the whole sprint (R1). Every new halo/cone/tint/dark-glow object, bake and
  breathing tween routes through it; pre-existing ad-hoc `renderer.type` checks
  were left untouched (out of scope, R6). Under ?canvas=1 all of it early-returns
  or no-ops — zero new objects, byte-identical to pre-G3.
- G3-D2: machinery bloom = ONE pooled `addDeviceHalo()` (reuses the baked
  `glowBlob`, additive, per-world/-device tint) — NO new halo texture needed.
  Staggered sine breathing (1400-2200ms, per-index `delay` so no unison), depth =
  device depth − 1, hard cap ≤40 (`this.deviceHalos`). State-coupled halos
  (levers on/off, magswitches on/re-arm, active checkpoint) toggle `setVisible`
  at the EXISTING state sites (pullLever, the timed-door lever re-arm, the
  checkpoint activate/deactivate handler) — no per-frame polling. Constant halos:
  beam turrets (laseremit) + phase-wall shimmer tiles.
- G3-D3: cores were NOT given a new halo object — the core container already owns
  an additive `glowBlob` bloom child (baked, alpha 0.5). G3 just adds a WebGL-
  gated slow breathing tween to that existing child (Canvas keeps the static 0.5,
  and the child is additive on both tiers already, so Canvas is unchanged). The
  tween shares the coreImg/orbit-spin lifecycle (dies with the container on
  pickup). Not counted against the ≤40 cap (no new object).
- G3-D4: phase-wall halos are added in a POST-spawn pass (after buildConduits) so
  the discrete interactive devices (levers/checkpoints/turrets/magnets), which
  spawn earlier, claim the ≤40 cap first; the shimmer curtain takes the remainder
  (loop breaks the moment addDeviceHalo returns null). "Prioritise interactive
  over decor" honoured without a priority sort.
- G3-D5: tinted depth — the FAR parallax grid gets `accent2` `setTint` gated by
  isWebGL (mirrors the near grid, which was already tinted via an ungated setTint
  that no-ops on Canvas; the near grid was left as-is per R6). The motes were
  ALREADY accent2-tinted (buildBackground); the call is now `isWebGL ? accent2 :
  0xffffff` so the gate is explicit and Canvas renders the same white specks it
  always did. Alphas unchanged on both.
- G3-D6: light cones — one soft `lightCone` texture baked at boot ONLY under
  isWebGL (the bake itself is gated), placed additively (alpha 0.09) under each
  addDustShafts source, angle-matched, at DEPTH.bg−2 (below terrain, with the
  shaft). addDustShafts is already WebGL-only-called; the cone-add carries its
  own isWebGL + texture-exists guard as belt-and-suspenders. Lamp props were NOT
  individually coned (the dust-shaft sources are the meaningful light sources;
  per-status-lamp cones would multiply objects for little read).
- G4-D1: `DEPTH.foreground` = 26 (between rope:25 and fx:30). ABOVE player/entity so
  the silhouettes occlude the buddies for a depth read; BELOW the fx particle band and
  every `fx+N` screen-fixed pseudo-HUD (coach bubbles fx+3, action hints fx+40..60,
  intro banner fx+50) and the separate UIScene blip bar — never occludes UI/blips.
- G4-D2: foreground = ONE neutral near-black baked family (`fgCable`/`fgPipe`/`fgVent`),
  NOT per-world. The shapes are near-black so a world tint is imperceptible AND a neutral
  bake stays byte-identical on both tiers; per-world identity is a WebGL-only enhance
  `setTint(accent)` (no-ops on Canvas). Opaque in the texture, alpha 0.92 at add time.
- G4-D3: ceiling props use scrollFactorX 1.12-1.18 (foreground parallax) but
  scrollFactorY 0 (pinned to the top screen band) — the only way to guarantee "top ~22%
  of screen" independent of the 0.62-1.06 dynamic zoom + vertical camera-follow (they
  sit in the top ~third at worst, never the center action band). Density = floor(worldW/
  600); keep-out = a 96px world-x band around every spawn, door/exit, pedestal (skill
  station) and checkpoint (positions known once entities exist — the call runs late in
  create(), not in buildBackground). Skipped ENTIRELY for the tutorial + 4-3 arena
  (def.tutorial / def.finale) — asserted prop-free (foregroundProps.length 0).
- G4-D4: the plan's "occasional floor-corner posts" were CUT after screenshot review. A
  floor post lives in the BOTTOM band where the buddies stand: edge-safe only if
  screen-fixed, but a screen-fixed post cannot honour a world-x keep-out (a QA shot
  caught one sitting on 3-1's spawn robots + skill pedestals), and a world-anchored
  bottom post sweeps through the players at center-bottom under parallax. Neither
  satisfies "fix via keep-out, never accept", so the ceiling silhouettes carry the
  foreground identity alone (`fgPost` bake dropped too).
- G4-D5: Canvas fps A/B on 2-2 (heaviest W2, ?canvas=1, two 5s samples): BEFORE avg
  42.1 / 39.9, AFTER avg 46.5 / 40.9 — no drop beyond run-to-run noise (after marginally
  higher). The strips are a handful of cached static images, so they stay on BOTH tiers
  UNGATED; only the enhance-tint is WebGL-gated. (New QA scripts: tools/qa_g4_fps.mjs,
  tools/qa_g4_shots.mjs — new files, tools/ originals untouched per R6.)
- G4-D6: weather = per-world in-playfield drift — ONE `addWeather` emitter (reuses "px",
  scrollFactor 0.9 so it parallaxes WITH the world, DEPTH.entity-1, <=24 alive, created
  once, NO update loop). WebGL-gated at the call site (R1); Canvas keeps only the
  screen-fixed motes. W1 warm dust, W2 rare rising embers (approximated LEVEL-WIDE — vent
  x-positions aren't known at buildBackground), W3 plum/mint spore twinkle (fade in/out
  via a 3-stop alpha interpolation over a short life), W4 indigo motes. NO snow-streak
  variant: the level defs were checked — only 3-3 is a storm and it is World-3 scrap, so
  no W4 storm/snow level exists (hence no g4-storm shot).
- G4-D7 (QA): playtest 42/42; 2-2 beat matrix 1/2 GREEN then 2/2 GREEN on the re-run (the
  B:P1=H fail was the documented fan-lift "T down in the yard" flake — recovered, no NEW
  failure mode); per-world WebGL+Canvas shots (tools/shots/gfx3/g4-w{1..4}-{webgl,canvas})
  with 0 page errors; every shot eyeballed clear of player/station/hazard/pickup overlap.
- G3-D7: player dark-zone glow — the dark-zone system exposes a BOOLEAN `inDark()`
  (not a continuous factor). One additive `glowBlob` per buddy (WebGL only, dark-
  zone levels only) eases its alpha 0→~0.5 toward `inDark(p.x,p.y)` and back
  (0.15/frame lerp) and follows the buddy — riding the EXISTING per-player pass
  in the dark-mask update (the glow-erase loop), so NO new update loop. Canvas
  leaves `_darkGlows` unset, making that block a no-op. Verified: buddy glow
  alphas settle ~0.44 inside a 4-3 dark zone (screenshot g3-w4-l43-darkglow).
- G5-D1: letterbox = two screen-fixed `add.rectangle` bars (each 9% of H), built
  ONCE per create() (`buildLetterbox`, reset-on-restart is free) at new `DEPTH.cine`
  (=31): ABOVE the fx particle band (30) + foreground silhouettes (26) so bars frame
  edge FX/props, BELOW the fx+N pseudo-HUD band (skill card fx+2, coach bubbles fx+3,
  intro banner fx+50). The UIScene blip bar CANNOT be covered — UIScene is a separate
  scene launched by Game (`this.scene.launch("UI")`), so it renders above every Game
  object regardless of depth; verified in l43-bolt-rescue.png (KOBI blip sits on top of
  the bottom bar). `letterbox(on)` slides in 300ms / out 250ms, idempotent (guards
  `letterboxOn`). Bars are visual-only: no physics/input/probe touched.
- G5-D2: camera push = `camCine`, a SECOND rendered-zoom multiplier mirroring G1's
  camPunch — eased toward `_camCineTarget` in updateCamera (GameScene ~8410,
  `this.camCine += (target - camCine) * min(1, dt*0.6)`; a slow ~seconds push) and
  applied as `cam.setZoom((camPos.zoom + zoomKick) * camPunch * camCine)`. NEVER
  touches camPos.zoom (the world coords the beat kit + audio listener read). Target =
  `1 + 0.06 * uxShakeScale()` on IN (so shake=off → target 1 = no push, bars still
  show, R2), 1 on OUT. Inert when a snap tool stubs updateCamera (bars still slide;
  the snap frames the camera itself).
- G5-D3: beats wired — (1) fight opener: a ONE-TIME self-releasing pulse the first
  frame a live buddy stands in the eye's clamp band (updateHeart, guarded by
  `H._opened`), bars+push in, auto-lift ~2.4s later (release guarded by
  `!heartDefeated` so it can't cancel the power-down bars). Control is never suspended
  in the heart fight — this is framing only. (2) power-down → Bolt rescue: bars IN at
  `heartPowerDown()` (heartDefeated), OUT at BOTH `heartResolved = true` sites (the
  downStep-17 carry-settle AND the 40s hard fallback). Verified via snap_w4_l43:
  bars present in l43-powerdown/l43-bolt-rescue, ABSENT in l43-resolved/l43-clear.
- G5-D4: crane-boss intro letterbox SKIPPED (plan's explicit "do NOT invent one" rule).
  The crane lives in 1-3 and is created in state "patrol", stepped from update() at
  level entry — there is NO scripted beat that suspends player control (the `blips.start`
  "BEHOLD! My magnificent crane!" line is the ordinary non-blocking level-start blip, not
  a control-suspend cinematic). No suspend point → no bars.
- G5-D5: hub route line = a FIXED pool of 24 soft `hubdot` images (baked once,
  `textures.exists` guarded) each owning ONE persistent phase-shifted alpha-cycle tween
  (CYCLE 620ms, per-index delay `i*52`), so a bright crest MARCHES last-completed →
  selection. `retargetRoute()` (called from updateSelection, composes with the G2-D2
  selection pulse — separate objects) only repositions/toggles the pooled dots along the
  straight inset path; it NEVER rebuilds tweens, so cursor moves can't leak. Dot count
  scales with distance (`clamp(round(span/32), 2, 24)`); degenerate cases (no completed
  node, cursor on the start node, sealed endpoints, len<70) hide every dot. Verified:
  5 dots at the default selection, 10 after one move-right (g5-hub-route/route2.png).
- G5-D6: completed-node glints = ONE additive `star` image per completed unlocked node,
  a rare scale/fade twinkle (alpha 0→0.85, scale 0.3→0.95, 520ms yoyo, staggered
  `delay 0-8000ms` + `repeatDelay 6000-12000ms`). Selection-independent (built once in
  buildHubLife), both tiers (WebGL adds ADD-blend + mint tint; Canvas keeps the pre-baked
  alpha). No update loop.
- G5-D7 (QA): playtest 42/42 green (incl. the 1-3 crane level — letterbox inert there).
  snap_w4_l43 snapped clean (0 page errors), all heart.* probes intact, fps 4-3 Canvas
  ~41/36 avg (within documented container noise). Hub QA (new tools/qa_g5_hub.mjs) clean
  (0 page errors); 1-1 sanity confirms NO bars (letterboxOn=false, camCine=1) and __BB
  probes intact in normal play. New QA file only — tools/ originals untouched (R6).
