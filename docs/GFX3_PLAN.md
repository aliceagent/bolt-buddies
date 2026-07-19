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
