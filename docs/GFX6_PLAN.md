# GFX6 "Chiaroscuro" — lighting, shadow, reflection & surface round: plan of record

Round goal (user's words): better lighting effects, shades, shadows,
reflections, surfaces. Art/lighting only: zero gameplay/physics/input changes.

Protocol: identical to GFX3-GFX5. Opus builds each sprint; Fable QAs (diff
review + both-tier screenshots + targeted suites) in a build↔QA loop until the
sprint passes, then pushes; full kit at L4 gates promotion. Sprint agents
commit AND push on landing. Decisions appended here, append-only.

## Verified groundwork this round builds on

- Light pools (P8) under lamps/checkpoints; G3 additive halos + light cones +
  4-3 dark-zone per-buddy glow; G4/G5 vignette, weather, 3-band parallax.
- Contact shadows: robots carry a soft blob `shadow`; devices/platforms mostly
  do NOT cast anything — nothing grounds them to surfaces.
- Tiles carry baked spec dabs (S1/S2) but speculars are not angle-consistent;
  no concave-corner ambient occlusion; no under-ledge shading.
- No reflections anywhere. The dark-zone mask system (W4) exists and works.
- Two-tier contract (R1) and the whole R-rule set from GFX5 carry over
  verbatim, including the seam contract and comfort settings.

## Global rules

R1-R9: carried verbatim from docs/GFX5_PLAN.md (Canvas invariance with
measured exceptions, comfort settings, no per-frame allocation, procedural
only + deterministic layout, DEPTH constants, untouchable contracts, push on
landing, decisions logged, readability first).
R10 (this round): LIGHT DIRECTION is a per-world constant — add `lightDir`
to WORLD_THEMES (unit-ish {x,y}, e.g. upper-left sun for W1). EVERY shadow
offset, specular hotspot, and spill gradient this round derives from it. No
per-object ad-hoc directions: one world, one light.

## L1 — Shadows & grounding (both tiers where measured-cheap)

The single biggest realism lever: things touch surfaces.
- Device/platform drop shadows: a shared `castShadow(scene, x, y, w)` helper
  places a soft baked shadow strip on the SURFACE beneath static devices
  (levers, pedestals, checkpoints, doors' bases, crates, turret bases),
  offset along theme.lightDir, alpha ~0.22, never on hazards (readability).
  Static Images placed at level build; skip when the device floats.
- Under-ledge shading: every platform/run casts a soft dark gradient band
  down the wall/space beneath its lip (baked 48xN gradient strip tiled along
  the run's underside, alpha ~0.18) — instantly grounds the architecture.
- Concave-corner AO: at wall-meets-floor inner corners, stamp a small baked
  AO corner gradient (24x24, alpha ~0.2). Detect corners from the same grid
  data terrain build already walks. Both tiers if the 2-2 Canvas fps A/B
  shows <=2fps delta (G4 precedent), else WebGL-gate; log numbers.
- Height-responsive entity shadows: the existing robot blob shadow scales
  down + fades with height off ground if it does not already (check first —
  P6 may have shipped it; if so log "already present" and skip).
- QA loop: per-world screenshots (device shadows consistent with lightDir,
  no shadow on hazard glow), fps A/B numbers, suites + one beat run.

## L2 — Light sources 2.0 (mixed tier)

- Lamp spill: each lamp/emitter light-pool gains a baked warm SPILL gradient
  on the wall behind it (static Image, world temperature tint, alpha ~0.12,
  direction from lightDir) — both tiers if measured-cheap, else gated.
- Flicker personality (WebGL): 1-in-N lamps per level (seeded) get a subtle
  slow alpha waver tween (sine + phase offset, +-0.04, 3-6s) — labs feel
  powered, not painted. Scaled by uxFlashScale; skipped at 0 (R2).
- Temperature audit: sweep existing pools/cones/halos per world — W1 warm
  amber, W2 aqua-green, W3 gold-violet, W4 cold blue — adjust outliers to
  the world temperature (bake/tint tweaks only; log each change).
- QA loop: WebGL + Canvas shots per world, flicker visible in a 2-frame
  diff, gating audit, suites.

## L3 — Reflections & surfaces (WebGL tier)

The flashy one; everything here behind isWebGL.
- Polished-floor robot reflections: on floor runs flagged "polished" (seeded
  subset per world, or all caps in W4's datacenter), each buddy gets ONE
  pooled flipped ghost image (flipY, squash ~0.55, alpha ~0.10-0.14,
  additive, masked to the run's cap line) positioned in the SAME existing
  per-player update pass the dark-glow uses (no new loops). Cap: 2 ghosts
  (one per buddy). Emissive devices on polished runs get a static baked
  reflection smear instead (cheap, no per-frame work).
- Moving sheen glint: the S2 cap strips gain an occasional traveling glint
  (one pooled additive band per level, tween x across a seeded cap run every
  9-14s, alpha <=0.15, uxFlashScale-scaled).
- Specular consistency: re-bake device/tile spec dabs to sit on the
  lightDir side (bake-time change, both tiers, part of the one-light rule).
- QA loop: WebGL shots (reflection reads as polish, not a duplicate robot),
  Canvas byte-identity audit, fps note, suites + textbox suite (UI depth
  untouched but verify), one beat run.

## L4 — Full gate & promote (Fable)

- Full kit: all suites, beat 24-run matrix, softlock suite, campaign 2-clean
  (flake ledger applies).
- Canvas fps guardrail A/B vs pre-GFX6 main on 2-2 + 4-3.
- Both-tier contact sheet per world.
- Regenerate the 11 walkthrough videos ONCE here (covers GFX5+GFX6 — the
  GFX5 gate deliberately deferred its regen to avoid a double ~35-min pass;
  logged in both plans).
- Promote dev → main, final report, close decisions.

## Decision appendix (append-only)

- L0-D1: video regen consolidated into L4 (GFX5's S5 promotes without it);
  one regen covers both rounds.
- L0-D2: R10 one-light-per-world added — all new shadows/speculars/spills
  derive from theme.lightDir; prevents the "every object lit differently"
  incoherence that plagues piecemeal shadow work.
