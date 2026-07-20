# GFX5 "Vista" — color, depth & texture-variety round: plan of record

Round goal (user's words): improve the colors, more parallax, better textures,
less repetitiveness. Art-only round: zero gameplay/physics/input changes.

Protocol: identical to GFX3/GFX4. Opus builds each sprint from the spec below;
Fable QAs (diff review + both-tier screenshots + targeted suites) and pushes
fixes; full kit at S5 gates promotion to main. Sprint agents commit AND push on
landing. Decisions appended here, append-only.

## Verified facts (probed 2026-07-20)

- Terrain = ONE 48×48 texture per world (`tile1..4`, BootScene tileTex), laid
  as tileSprites over whole runs (GameScene ~1043-1119: horizontal runs are
  tileSprite(w=run, h=48); walls the vertical equivalent). Every tile in a
  world is IDENTICAL — the root of the repetitive read. Because runs are
  tileSprites, variety is nearly FREE: a 192×48 four-variant STRIP texture
  cycles variants across a run with zero extra objects (48×192 for vertical).
- Tile recipe is already per-world colored (warm steel / teal / plum / indigo
  plates) with a shared near-black "mortar" gap; plates are inset 1.5px with
  all-edge gap tone (the seamless-tiling contract — MUST be preserved by any
  variant: edge pixels stay pure gap tone on all four sides).
- Backdrop stack (backdrop.js + GameScene buildBackground): gradient, far+near
  grids, glow blobs, ONE silhouette prop-strip band (bg-5), fog band, drips,
  dust shafts, motes, weather (G4, WebGL), foreground strips (G4). Depth reads
  as: one background band + one foreground band — a single parallax step.
- Canvas fps precedent (GameScene ~848-868): props/vignette were TRIMMED on the
  Canvas tier for fps — new ambience bands therefore ship WebGL-gated (isWebGL,
  R1) unless measured free; Canvas keeps today's exact layer set.
- WORLD_THEMES palette (constants ~91): accent/accent2/accent3/warmth/bgTop/
  bgBottom/glow/fade per world. P8 light pools + atmo exist; G3 halos/tints.
- Landmark/level identity: levels within a world currently share ALL background
  furniture — nothing anchors "which room am I in" visually.

## Global rules (binding; carried from GFX3/GFX4)

R1. Canvas (?canvas=1) is the test/reference tier. Baked TEXTURE swaps (tiles,
    decals, palette values) are both-tier by nature and allowed — they cost
    zero runtime. New LAYERS/objects/particles go behind `isWebGL` unless a
    measurement proves them free on Canvas (log numbers either way).
R2. Comfort settings respected for any new motion.
R3. No per-frame allocation; no new update loops.
R4. Procedural only; deterministic layout (seeded by level id / tile coords —
    NEVER Math.random for placement; Math.random inside boot-once texture
    bakes is fine, matching the dither precedent).
R5. Depth via DEPTH constants.
R6. Don't touch tools/ originals, physics, timings, text-box/stuck/banner/iris
    contracts, beat-kit probes. The tile SEAM contract (edge pixels = gap tone)
    is binding for every tile variant.
R7. Commit AND push on landing; message prefix "GFX5 Sn:".
R8. Deviations logged here (Sn-Dm).
R9. Readability first: gameplay-relevant objects (hazards, interactives,
    pickups, robots) must END the round MORE separated from the background
    than they started, never less. Any decal/landmark near the action path
    obeys the G4 keep-out discipline.

## S1 — Color script 2.0 (both tiers — palette + bake changes only)

Goal: each world reads as a place with its own light, not a hue-swap.
- constants.js WORLD_THEMES: widen each world's value range — push bgTop/
  bgBottom further apart (deeper dark, airier top), add `mortar` (a HUED dark
  for the tile gap — warm umber W1, deep sea-green W2, wine W3, void-blue W4)
  and `edgeLight` (the accent-tinted plate rim-light tone) per world.
- BootScene tileTex: use theme.mortar for the gap; add a 1px accent-tinted
  edge-light along each plate's TOP edge only (baked, subtle, a≈0.18) — floors
  catch the world's light. Preserve the seam contract exactly.
- Saturation hierarchy audit (the core of "better colors"): backgrounds sit at
  LOW saturation, gameplay surfaces mid, interactives/hazards high. Sweep the
  baked background textures (grids, blobs, prop strip fills, fog) and pull
  their saturation DOWN ~15-20% per world (bake-time adjustment) so the G3
  accents and gameplay objects pop against them. Do not touch entity textures.
- Gradient span: re-bake bgGradient1..4 with the widened bgTop/bgBottom.
- QA: before/after contact sheet per world (same camera positions), suites
  (playtest + one beat run), zero-diff check on entity/UI textures.

## S2 — Terrain variety (both tiers — texture-strip swap, zero object change)

- BootScene: bake per-world VARIANT STRIPS: `tilestrip<world>` 192×48 (4
  variants side by side) and `tilewall<world>` 48×192 (4 stacked). Variant
  recipe = the S1 base plate ± small differences: fastener layout, seam
  positions, a hairline crack, a worn/scuffed corner, one variant with the
  world's decal motif (W1 caution chevron, W2 pipe stub, W3 gold fleck, W4
  faint circuit trace). Differences stay ≥6px inside plate edges (seam
  contract); silhouette identical.
- GameScene terrain build: horizontal runs use `tilestrip<world>` (tileSprite
  wraps every 4 tiles); vertical walls use `tilewall<world>`. Offset each
  run's tilePositionX/Y by a coord-seeded phase (tx*48 % 192) so adjacent runs
  don't start on the same variant — variety without any new objects.
- Floor-top caps: a 48×6 `tilecap<world>` strip (accent edge-light + wear)
  laid as ONE tileSprite along the TOP surface of walkable runs (over the
  tiles, under entities) — floors read as floors, walls as walls (big
  repetition breaker). Skip where a run is < 2 tiles wide.
- Sparse decal overlays: 3-4 baked decals per world (vent grille, hazard
  plate, stain, poster/sign motif ~24-40px) stamped as static Images on wall
  faces, coord-seeded, density ≤1 per ~500px of run length, G4 keep-out list
  respected, none on floors the robots walk.
- QA: seam audit screenshot (long run + tall wall at 2x zoom — no visible
  seams/discontinuities), fps A/B on 2-2 Canvas (expect ~0: same object
  count), one beat run per world, suites.

## S3 — Parallax depth 2.0 (WebGL tier; Canvas keeps today's layers)

- Split the single silhouette band into THREE: far band (scrollFactor 0.18,
  darkest, mega-shapes), mid band (0.38, today's strip), near band (0.6,
  larger sparser shapes with accent-lit windows/dots). All baked strips,
  placed once, behind isWebGL (R1 precedent; Canvas keeps the current single
  band untouched).
- Drifting atmosphere layer per world: ONE slow tileSprite band (steam W2,
  warm haze W1, spore mist W3, void wisps W4) at scrollFactor ~0.25 with a
  very slow tilePositionX tween (60-90s loop), alpha ≤0.10, additive where it
  reads better. WebGL-gated.
- The G3 light cones + G4 weather stay as-is; verify composition (no additive
  stacking hot-spots — tune alphas down if the combined read glows).
- QA: WebGL screenshots per world showing 3 distinct band speeds during a
  slow camera pan (capture two frames apart and diff offsets); Canvas
  byte-identical layer audit (grep + screenshot); WebGL container fps note
  (SwiftShader numbers are informational only, per GFX4 F1-D6).

## S4 — Landmarks & set-pieces (both tiers where cheap, else WebGL)

Goal: every level recognizable at a glance ("the room with the...").
- Per-world landmark FAMILY (baked, big, 200-400px): W1 assembly arm + gantry
  crane silo; W2 boiler stack + giant fan ring; W3 magnet coil tower + crane
  claw idol; W4 server monolith + KOBI eye mural. Two per world.
- Per-level placement: exactly 1-2 landmarks per level, chosen + positioned by
  a level-id-seeded pick, at background depth (bg-4, above the far bands,
  below terrain), scrollFactor ~0.7, world-tinted dark so they read as
  silhouette furniture, not gameplay. G4 keep-out respected; none in the
  tutorial's teaching sightlines or the 4-3 arena (finale stays as authored).
- Instance variance on the EXISTING prop strip stamps: seeded flipX + scale
  0.9-1.15 + slight y-jitter where the strip helper stamps repeats (kills the
  photocopied look of repeated props).
- These are a handful of static images per level: measure Canvas fps on 2-2;
  ship both tiers if ≤2fps delta (G4 4a precedent), else gate (log numbers).
- QA: one screenshot per LEVEL (all 12 + tutorial) for the landmark placement
  review — eyeball occlusion/readability; fps numbers; suites + one beat run
  per world.

## S5 — Full gate & promote (Fable)

- Full kit: all six suites, beat 24-run matrix, softlock full suite, campaign
  to 2-clean. Known-flake ledger applies (1-2 chasm reel, 2-2 fan; re-run
  singles before judging).
- Canvas fps guardrail A/B vs pre-GFX5 main on 2-2 + 4-3.
- Both-tier contact sheet per world + hub/title.
- Regenerate the 11 walkthrough videos (terrain/background changes appear
  in-level everywhere — the set must match the shipped look).
- Promote dev → main, final report, close decisions.

## Decision appendix (append-only)

- S0-D1: tile variety via multi-variant STRIP textures (192×48 / 48×192)
  cycled by the existing tileSprites — zero new objects, zero fps cost, both
  tiers; chosen over per-tile Images (object explosion) and runtime texture
  swaps (R3).
- S0-D2: new parallax bands + atmosphere WebGL-gated by the Canvas fps
  precedent (props/vignette were already trimmed there); Canvas keeps today's
  exact layer set — test-tier invariance by construction.
- S1-D1: saturation hierarchy implemented as one shared bake-time helper
  `desat(hex, f)` in paint.js (pulls each channel toward the colour's own
  luminance; f=0 unchanged, 1 grey). Applied at f≈0.18 (~18%, inside the plan's
  15-20%) to the SIX pure-background bake sites — bggrid line/node tones, per-
  world `glowBlob<w>`, propStrip1/2 accent fills (Boot) + propStrip3/4 tone/seam
  fills (GameScene ensureW3/W4), and the fogBand haze. The generic white
  `glowBlob` (gameplay pool/pickup glows) and ALL entity/gadget/enemy/UI
  textures are untouched (R9). Chosen over per-site hand-tuned colours so the
  cut is uniform and one number tunes the whole hierarchy.
- S1-D2: tile-gap groove now reads `theme.mortar` (a HUED dark — warm umber W1 /
  deep sea-green W2 / wine W3 / void-blue W4) instead of the old per-tile cool
  near-black, and each plate gets a baked 1px accent-tinted TOP-edge rim-light
  (`theme.edgeLight`, a=0.18) drawn at y=2.5 over x∈[5,43]. Seam contract held
  exactly: every 48×48 edge pixel (x=0/47, y=0/47) stays pure mortar on all four
  sides; plate inset + silhouette unchanged. Verified at 2x zoom (s1-seams.png)
  — grooves read as clean lines, no edge discontinuities.
- S1-D3: WORLD_THEMES tonal range widened per world — bgTop lifted/aired-out,
  bgBottom deepened (identity hue kept; bgGradient<w> re-bakes automatically from
  the loop). GFX3 `fade` fields reviewed against the deepened bgBottom: all four
  authored transition tones still harmonize with the new palette, so NO fade
  values were changed. G3 accent/accent2 tints are unchanged constants and still
  read against the lower-saturation backdrops (they now pop MORE, per R9).
- S2-D1: ONE parameterized `plate(g,world,variant,ox,oy,wall)` recipe in BootScene
  is the single source of truth for `tile<w>` (variant 0, drawn by the same code
  path so it is S1-EXACT), the `tilestrip<w>` 192×48 4-variant strip, and the
  `tilewall<w>` 48×192 4-variant vertical strip. The silhouette (softBody +
  specular + S1 top rim-light) is identical across variants; only interior detail
  differs — v1 moved diamond fastener layout + a shifted seam, v2 hairline crack +
  scuffed corner (a vertical drip streak on WALL cells), v3 the world motif (W1
  amber caution chevron / W2 pipe stub / W3 gold fleck cluster / W4 faint cyan
  circuit trace). Every difference is kept ≥6px inside the plate and the whole
  strip is mortar-filled first, so every 48-cell's edge pixels stay pure mortar on
  all four sides — the seam contract holds cell-to-cell exactly as for `tile<w>`.
  Verified at 2× zoom (s2-seams/s2-wall/s2-variety-w<N>.png): variants read as
  clearly DIFFERENT but family-coherent, no discontinuity at the 4-tile (192px)
  wrap boundary.
- S2-D2: terrain wiring in GameScene.flush() — floor runs ≥2 tiles use
  `tilestrip<world>` (the tileSprite cycles the 4 variants across the run); a lone
  1-wide cell that is part of a vertical wall (solid directly above OR below) uses
  `tilewall<world>` (cycles DOWN the column); an ISOLATED 1-wide platform tile
  stays on the base `tile<world>` (variant 0). W3 `railtile` runs are LEFT on their
  own base I-beam texture — a distinct magnet-rail surface outside the plate
  variant family (out of S2 scope). De-repetition phase = ((tx*7 + ty*13) % 4)*48,
  set once as tilePositionX (floors) / tilePositionY (walls) so adjacent runs never
  start on the same variant — deterministic (R4, no Math.random), static one-time
  offset (no per-frame write, R3). `this.tileKey` still exposes `tile<world>` for
  the P4 probe. Zero new objects (the strip is a texture swap on the existing
  tileSprite).
- S2-D3: floor-top caps `tilecap<world>` 48×6 (S1 edge-light strengthened into a
  lit top SURFACE + tiny wear nicks, world-tinted) laid as ONE h=6 tileSprite along
  the TOP edge of each walkable run (≥2 tiles AND open air above); runs < 2 tiles
  skipped. Depth DEPTH.terrain+0.5 — above the plates but BELOW light pools (7) /
  shadow (8) / entities (10), so nothing overrides the light-pool stacking. Visual
  strip only: no physics body, zero collision impact. Horizontal fades span full
  width (seamless wrap); nicks kept in [6,45] so the 48px wrap edges match.
- S2-D4: sparse background-family decals baked per world (`s2vent`/`s2haz`/
  `s2stain`/`s2sign<world>`, ~24-34px, DESATURATED via paint.desat — quiet, NOT
  accent-hot, so gameplay objects still pop MORE per R9). Placed by
  GameScene.scatterWallDecals(ko) in create(), on exposed VERTICAL WALL FACES only
  (never a walkable floor top, never adjacent to an interactive/hazard tile),
  coord/level-seeded (R4), density ≤1 per ~500px of wall-face length, spaced apart.
  It REUSES the exact G4 keep-out band list (spawns/pedestals/checkpoints/doors)
  and sits inside the same `!tutorial && !finale` guard, so decals are skipped in
  the tutorial + 4-3 arena exactly like the foreground strip. Observed per-level
  counts: 1-2=3, 2-2=3, 3-2=4, 4-2=0 (open laser-garden arena — sparse by design).
  Static Images at depth terrain+0.5, alpha ≈0.42-0.54.
- S2-D5: fps A/B on 2-2 Canvas (snap_w4_l43 sampleFps pattern, 2×5s) — BEFORE
  (stash) avg 38.8/32.6, AFTER 38.8/31.8; combined delta ≈ -0.4 fps, inside the
  container's ~6 fps pass-to-pass noise floor (object count is unchanged for the
  strip/cap swap; caps add 1 tileSprite per qualifying run, decals a handful of
  Images). Well under the 2 fps budget, so caps + decals ship BOTH tiers with NO
  isWebGL gate. Suites: playtest 42/42 green; beat matrix 1-2/2-2/3-2/4-2 A+B =
  7/8 green, the single FAIL being the DOCUMENTED 2-2 fan-step container flake
  (T-down-in-the-yard) — 2-2 re-run alone came back 2/2 green, confirming the
  flake, not a new failure mode. Zero page errors across all runs.
- S3-D1: the single silhouette prop strip is split into THREE parallax bands, all
  WebGL-only. FAR = new baked `propfar<w>` 512×864 (darkest, hulking towers/silos/
  ducts — accent desat 0.55 then scale 0.15) at scrollFactor 0.18, depth bg-9.5
  (above the gradient, below the parallax grids), alpha 0.55. MID = today's
  existing `propStrip<w>` UNCHANGED (scrollFactor 0.55, depth bg-5, alpha 0.35) —
  it becomes the mid band, kept byte-exact per the sprint directive. NEAR = new
  baked `propnear<w>` 512×864 (larger, SPARSER structures with accent-lit window/
  indicator dots — desat fills, dots use theme.accent at a≈0.14 halo + 0.5 core)
  at scrollFactor 0.6, depth bg-4.5 (above mid, below fog/terrain), alpha 0.42.
  The three recipes are single-sourced as pure-draw helpers in paint.js
  (`farStrip`/`nearStrip`/`atmoBand`) so BOTH bake sites (W1/W2 in BootScene, W3/W4
  in ensureW3/W4Textures) stay identical; every bake AND every placement is gated
  by isWebGL (matching the G3 lightCone gated-bake precedent), so the Canvas
  reference tier never creates the textures nor the objects. Seam discipline held:
  all discrete shapes kept clear of the x=0/512 wrap edges, full-width elements
  constant along x — the strips tile horizontally seamlessly like propStrip<w>.
  NOTE: mid(0.55)→near(0.60) is only a 0.05 separation because mid was pinned to
  today's strip (the plan's intended mid 0.38 was overridden by "strip stays as-
  is"); FAR (0.18) supplies the dramatic depth step. Measured on W2 over a 400px
  camera pan (zoom 1): far 72px, mid 220px, near 240px on-screen — three distinct
  rates, far near-stationary while terrain sweeps the full 400px.
- S3-D2: drifting atmosphere — ONE `atmo<w>` band per world (baked 256×140 soft
  wisps, fully transparent at the left/right edges so the tileSprite drifts
  seamlessly), scrollFactor 0.25, depth bg-6.5 (behind mid+near, in front of the
  glow blobs), vertical band = 0.62·viewport via tileScaleY (no vertical repeat).
  Per-world tint: warm haze W1 (warmth), steam W2 (0xcfeee4), spore mist W3
  (accent2), void wisps W4 (accent). ONE slow tilePositionX tween per level,
  created at build (linear, repeat -1, no yoyo, one texture-width loop): W1 78s /
  W2 82s / W3 72s / W4 88s — the only new animation this sprint, no update-loop
  work (R3). Blend: ADD for W1/W2/W3; NORMAL for W4 (the near-black datacenter
  reads better as un-glowing haze than as additive light). Alpha ≤0.10 shipped:
  W1 0.09, W2 0.07, W3 0.09, W4 0.10.
- S3-D3: composition check — with G3 cones + G4 weather + the new far/near bands +
  atmo all on (WebGL), eyeballed all four per-world shots (tools/shots/gfx5s3):
  NO additive stacking hot-spots. W2 atmo was PRE-EMPTIVELY set lowest (0.07,
  vs 0.09 elsewhere) because W2 already stacks the most additive layers (fog band
  + drips + wider W2 light pools); with that cut the combined read stays clean, so
  no further alpha tuning was needed and the D2 values ship as-is.
- S3-D4: Canvas invariance by construction — because every bake and every
  placement is isWebGL-gated, the Canvas backdrop keeps ONLY today's layer set.
  Verified: on ?canvas=1 the far/near/atmo objects are absent (propFar/propNear/
  atmo all falsy) AND their textures were never created (propfar<w>/propnear<w>/
  atmo<w> exist=false), while the mid strip is present — s3-w2-canvas.png matches
  the pre-S3 look. Suites: playtest 42/42 green (Canvas — proves the gate); beat
  3-2 A+B 2/2 green. Zero page errors on both tiers.
- S3-D5 (QA): near-band scrollFactor 0.6 → 0.72 — the builder's honest caveat
  (mid pinned at 0.55 by Canvas invariance left mid/near in near-lockstep);
  0.72 restores a distinct third rate. WebGL-only object, freely tuned.
- S4-D1: per-world landmark FAMILY (two each) single-sourced as ONE pure-draw
  helper `landmark(g,world,v,w,h)` + a `LANDMARK_SIZES[world]=[[w,h],[w,h]]`
  table in paint.js, so the SAME recipe bakes identically at BOTH bake sites
  (W1/W2 in BootScene, W3/W4 lazily in GameScene.ensureW3/W4Textures). Keys
  `lm<world>a`/`lm<world>b`. Families: W1 assembly arm+gantry (300×300) / gantry-
  crane silo (260×400); W2 boiler stack (200×400) / giant fan ring, static blades
  (320×320); W3 magnet coil tower (220×400) / crane-claw idol (260×360); W4 server
  monolith (200×390) / KOBI eye mural (320×320). Tones follow the far/near-band
  recipe (scale·desat) so the S4 family sits at the very bottom of the S1
  value+saturation hierarchy — dark silhouette furniture, NOT gameplay (R9). Only
  a few small accent-lit indicator dots (halo a≈0.14 + core a≈0.62); no hot masses.
  Bakes are BOTH tiers (textures only, zero runtime cost — R1); the PLACEMENT
  decides the ship tier. QA (WebGL, tools/shots/gfx5s4/s4-<id>.png): the
  distinctive-shaped variants (fan ring, eye mural, coil tower+sphere, claw,
  assembly arm) read clearly as recognisable set-pieces; the boxy variants
  (boiler/monolith/silo) are quieter silhouette variety — the R9-correct side to
  err on. Chosen over per-site hand-drawn art so the two bake sites can't drift.
- S4-D2: placement = `GameScene.placeLandmarks(ko)`, called inside the SAME
  create() `!tutorial && !finale` guard as the G4 foreground strip + S2 wall
  decals (so the tutorial's teaching sightlines and the 4-3 finale arena stay
  landmark-free — verified 0 in s4-tut.png / s4-4-3.png). Deterministic: a level-
  id seeded PRNG `mulberry32(hashStr(def.id + ":s4landmarks"))` (never Math.random,
  R4) picks the count (1-2; wider levels lean to 2), the variant order (2-landmark
  levels use BOTH a+b for a distinct read) and the x positions by rejection
  sampling (48 tries: reject if the landmark's FULL body width intersects a G4
  keep-out band — the SAME `ko` list of spawns/pedestals/checkpoints/doors — or if
  within max(lw,320)px of an already-placed landmark). y = origin (0.5,1) on the
  level's ground line = world-y of the DOMINANT floor row in the lower band; the
  foot sinks a hair below so terrain (depth 5) occludes it → reads as furniture
  behind the back wall. scrollFactor 0.7, depth DEPTH.bg-4.2 (above near band
  bg-4.5, below fog bg-4/terrain), alpha 0.85. Per-level result (deterministic):
  1-1 1 [1424]; 1-2 2 [2208,1690]; 1-3 2 [847,1451]; 2-1 2 [1962,726]; 2-2 1
  [2420]; 2-3 1 [2668]; 3-1 2 [884,2478]; 3-2 2 [2380,1189]; 3-3 2 [2639,1649];
  4-1 2 [2750,3104]; 4-2 2 [2397,967]; 4-3 0; tut 0. Also inits this.landmarks/
  _landmarkX to [] before the guard so the reused scene instance stays empty on
  tutorial/4-3 across restarts.
- S4-D3: fps A/B on 2-2 Canvas (qa_g4_fps.mjs, 2×5s) — BEFORE (stash) avg
  38.4/33.3, AFTER avg 39.5/31.9; combined delta ≈ -0.15 fps, well inside the
  container's ~6 fps pass-to-pass noise (landmarks are 1-2 static Images/level;
  the prop-strip variance is bake-time, zero runtime). Under the 2 fps budget, so
  landmarks + variance ship BOTH tiers with NO isWebGL gate (G4 4a precedent).
  Suites: playtest 42/42 green; beat 1-2/2-2/3-2/4-2 A+B = 8/8 GREEN (wd/sl peak
  0; 4-2 A took 1 death but completed all 8 steps — normal laser-garden, no flake
  hit). Zero page errors across every screenshot + fps + playtest run.
- S4-D4 (variance): the plan's "instance variance on the existing prop-strip
  stamps" is applied as BAKE-TIME variance (not placement variance) — the strip
  repetition lives INSIDE the baked propStrip<w> texture (a tileSprite tiles it),
  so the fix is to jitter each stamped shape within the bake using the existing
  seeded rnd (deterministic, R4; static one-time bake, R3). Applied to the most
  photocopied repeated families per strip: W1 ceiling hook rigs (per-rig scale
  0.9-1.15 + x-jitter ±9 + mirrored hook curl) + conveyor tines (width + x-jitter);
  W2 flange bands (x-jitter + width) + valve wheels (scale + spoke phase); W3 scrap
  hooks (scale + x-jitter + mirrored curl + flipped chunk) + gantry tines; W4 server
  racks (seeded width + x-jitter). All jitter kept small so every shape stays clear
  of the x=0/512 wrap edges (the strip still tiles seamlessly). Before/after pair
  (Canvas tier, isolates the mid strip): tools/shots/gfx5s4/s4-variance-before.png
  vs s4-variance-after.png (byte-different; the four identical hook rigs now vary).
- S4-D5 (QA sign-off): the "black slab" flagged in the 4-2 landmark review is
  the level's INTENDED dark-zone rect (level4_2.js `t:"dark"`, pre-GFX5) — 
  confirmed by a landmarks-off probe + the level def. Landmarks themselves
  read correctly subtle at play framing. S4 accepted as landed.
- S5-D0: walkthrough-video regeneration DEFERRED to GFX6 L4 (one regen covers
  GFX5+GFX6; see docs/GFX6_PLAN.md L0-D1). S5 promotes without it.
