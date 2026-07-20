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
