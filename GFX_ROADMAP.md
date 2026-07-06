# Bolt Buddies — Graphics Polish 2 ("every graphic, meticulously")

A second, deeper visual pass over EVERY graphic in the game. Polish Pass 1
(UI_ROADMAP sprints 1–11) took the game from programmer art to coherent; this
pass takes it from coherent to *really polished* — the bar is "screenshot looks
like a finished indie game," judged element by element.

## Ground rules (binding for every sprint — same regime as UI_ROADMAP)

1. **All art stays procedural** in BootScene / Graphics. No assets, no CDNs.
2. **Gameplay frozen.** Physics, geometry, entity logic, input, save format,
   scene flow unchanged. Playtest contract (`window.__BB.*`) intact.
3. **Full stack green on every sprint**: `npm run playtest` — W1 42, W2 30,
   audio 29, tutorial 21, beat matrix 12/12. The matrix is the drift guard.
4. **Canvas renderer is truth**: `setTint` is a WebGL-only no-op under
   `?canvas=1` — every meaning-bearing state must be drawn/textured/alpha.
5. **60 fps**: pooled emitters, shared Graphics, no per-frame allocations;
   fps A/B against baseline when a sprint adds ambient layers.
6. **Tokens**: FONT/FS/TEXT/COLORS/WORLD_THEMES from constants — extend with
   named tokens, never inline literals.
7. **Screenshots reviewed on every sprint** (before/after of each touched
   element into tools/shots/p2/).

## Critique inventory (what is wrong TODAY, per element)

**Title screen** — logo glow copies are invisible (letters read as flat text
with a heavy dark stroke); huge dead band between the menu stack and the
footer; background is an empty gradient (no silhouette interest, no motion);
Bolt reads as a bathtub duck, not a puppy; robot idle is a plain bob; footer
controls panel is a bare box; KOBI corner eye is charming but isolated.

**Hub** — world-panel badges are OS-font emoji (inconsistent across
platforms, clashes with the drawn art); locked panels are large dull voids;
node circles are plain strokes; the cores counter is bare text; the bottom
third under the panels is empty; no ambient motion beyond motes.

**In-level backdrops** — W1/W2 are a gradient + grid + glow blobs: no
world-specific silhouette props (W1 should read "assembly wing": distant
crane arms, conveyor silhouettes; W2 "maintenance tunnels": pipe runs,
valve wheels, hanging cables, drips, low fog); large single-color voids
(the 2-2 upper half is flat green); no vignette, so frames feel edge-less.

**Terrain** — bevel tiles are good but visually identical across worlds
except tint; ceilings look identical to floors (no orientation cue); no
grime/wear decals; no ambient-occlusion shadow under platform undersides;
shimmer walls are crosshatch rectangles that read as debug art; duct crawl
slots lack a "crawl here" affordance; hazard strips lack animated arcing.

**Devices** — levers/plates/doors improved in Pass 1 but nothing shows
*causality*: no visible conduit from a lever/plate to the door/bridge it
drives; lift cable/track is bare; pedestal beam is a static gradient;
exit doors deserve marquee lights.

**Robots** — treads never animate while driving; eyes never look anywhere;
no shadow blob under robots (they float visually); carried pose is a tilt
only; phase afterimage subtle to invisible on canvas; skill chips fine.

**Enemies** — scuttlebug shells identical in both worlds; roller has no
personality on the cab (perfect spot for a KOBI decal); warden face is
plain; crane cabin has no occupant (KOBI's eye belongs there), plates are
plain rounded squares, chain/cable is a straight line with no sag.

**FX** — good coverage from Pass 1, but palettes are inconsistent
(white/blue/purple sparks mixed arbitrarily); the steam plume is nearly
invisible; throw arcs leave no trail; zip line vanishes instantly;
checkpoint activation is modest.

**HUD & dialog** — KOBI avatar iris is static; blip border pulse doesn't
change with mood; item cards at spawn OVERLAP each other and the action
hint (visible in 2-2: three panels z-fighting); key chip pops in with no
motion; intro banner is a flat rect.

**Menus/overlays** — Settings and Pause are flat panels on plain dims,
noticeably below the title screen's new standard; scene fades are plain
black; clear overlay could celebrate more (bolt confetti).

## The sprints (P1–P12)

### P1 — Title screen cinematic
Rebuild the logo as real neon: per-letter tube (rounded stroke outline +
inner bright core + additive halo drawn as offset blurred copies that are
actually visible), slow 2-tone color cycle, occasional single-letter flicker
after load. Fill the dead band: raise the menu 24px, add a distant lab
skyline silhouette strip (drawn once: crane arms, vats, blinking antenna
lights) behind the cast, and a slow conveyor line under the robots' floor
shadows carrying tiny silhouette parts. Redraw Bolt as an actual robo-puppy
(head+snout, ear flaps, stub tail wag tween, eye). Robots gain tread-shuffle
idle and occasional blink (reuse _blink). Footer: key-cap chips (reuse
keycap texture) instead of plain text; panel gets a subtle top accent bar.
KOBI corner eye gains a wandering iris (looks at the selected button).
Accept: before/after shots; menu API + first-press-to-Hub contract intact.

### P2 — Hub map 2.0
Replace emoji badges with drawn world icons (wrench, spiral vent, magnet,
dark core — 28px Graphics glyphs, one per world, tinted per accent —
DRAWN, not tint). Locked panels get a "static" treatment: dim blueprint
grid + big drawn padlock + "SIGNAL LOST" flicker line so they look
intentional. Nodes: inner fill gets a subtle radial shade; completed
checkmark gets a tiny green chip badge. Cores counter becomes a chip with
a mini core icon + animated count-up on entry. Bottom band: add a low
silhouette skyline + the existing ticker; ticker eye blinks. Accept:
fresh + progressed shots; hub keyboard contract untouched.

### P3 — World backdrop identity
Per-world silhouette prop layer (scrollFactor ~0.55, alpha ~0.35, drawn
once into a texture strip and tiled): W1 = assembly arms, hanging hooks,
vats, conveyor gantries; W2 = pipe runs with elbows/valve wheels, hanging
cables, wall vents. W2 additionally gets a low-lying fog band (two additive
translucent strips drifting at different speeds) and occasional drip
particles from pipe joints (pooled, ≤8 alive). Both worlds get a soft
vignette overlay (scrollFactor 0, drawn radial darkening, alpha ≤0.22) and
2–3 slow "dust shaft" light beams in tall rooms. Tutorial inherits W1 set.
Accept: 1-1/2-2 before/after; fps A/B within 2fps of baseline.

### P4 — Terrain identity & wear
Per-world tile trim: W1 keeps rivets; W2 tiles get hex-bolt corners +
faint pipe-seam lines so the worlds differ up close. Ceiling/underside
cue: undersides of any run get a 4px darker AO strip + drip stains in W2.
Grime pass: a `decal` stamp set (oil stain, scuff, hazard chevron, vent
grill, KOBI "NO PETS" poster) scattered deterministically (seeded by level
id) on large wall runs — 6-10 per level, alpha ≤0.5. Shimmer walls
redrawn: vertical energy curtain (two drifting sine-banded gradients +
sparse rising sparkles) instead of crosshatch — must still read as "wall
you can phase through," distinct from hazards. Duct slots get animated
inward air-lines + a small arrow glyph. Hazard strips gain arcing spark
jumps (pooled, 1-2 concurrent per strip). Accept: per-world side-by-side;
suite geometry untouched (visual only).

### P5 — Causality wiring & machine detail
Draw conduit lines from every lever/plate to the device it drives (path:
simple L-shaped polyline along tile edges, computed at spawn from entity
positions; dim base, lights up in accent + travel pulse when triggered —
the pulse runs lever→device over ~400ms, then the device reacts). Doors:
add hinge caps + a small ID plate; exit doors get marquee dot-lights
chasing around the frame while open. Lift: rail groove + cable drum that
rotates while moving; pips panel gets a tiny frame. Pedestal beam becomes
animated (two counter-scrolling alpha bands) with rising glyph particles.
Bridges: materialize tick gets a light that sweeps tile by tile. Accept:
shots of each device pair; evalNeeds/lift/plate logic byte-identical.

### P6 — Robot life
Tread animation: scroll a 2-frame tread texture (or tilePosition offset)
while |vx|>20 and grounded, direction-matched. Pupils: eyes track movement
direction and look up during jumps/zips (small pupil offset inside the
visor, drawn). Shadow blob: soft ellipse under each robot, scales with
height off ground, hidden while carried. Carried buddy: arms-up pose
overlay + slight sway. Phase-walking: strengthen the afterimage (3 ghost
copies, alpha 0.2/0.12/0.06, position-lagged) and add edge shimmer while
inPhaseWall. Heavy: landing screen-shake already exists — add tread dust
when starting/stopping. Tiny: squeak-hop micro squash on each step crest.
CRITICAL: visuals only — never touch body size/offset (UI3 lesson; matrix
guards). Accept: burst shots walking/jumping/carrying/phasing.

### P7 — Enemy character 2.0
Scuttlebug: W2 variant shell pattern (darker, hex spots); antenna feelers
that twitch; squish leaves a brief splat decal (fades 2s). Roller: KOBI
single-eye decal on the cab + tiny warning lamp that spins while alert;
wheels get visible rotation (spoke offset animation); beam gains dust
motes drifting in it. Warden: riveted face plate + visor slit glow,
badge-number stencil on the chest (W1/W2 numbering); shove impact star
gets a small "HMPH" text pop (drawn, pooled); dizzy stars orbit + cross-eye
X pupils on defeat. Crane: cabin window with KOBI's eye INSIDE (iris
follows the nearest robot), cable drawn with catenary sag + hook detail,
plates get bolt heads + hairline cracks that deepen as the fight
progresses (texture swap per stage), pod pulse rings tinted per state.
Accept: one shot per enemy state; crane fight state machine untouched
(matrix 1-3 run is the guard).

### P8 — Light & atmosphere
A tiny "light pool" helper (additive radial texture, tinted, alpha ≤0.3):
placed under every lamp, lit door lamp, checkpoint (active), pedestal,
exit marquee, and roller alert lamp. Hazard strips get a flickering glow
pool. W2: light pools are dimmer + fog interacts (fog band brightens near
pools). Per-level vignette from P3 tuned per world (W2 darker corners).
Intro banner and clear overlay pick up a soft top-light gradient. Strict
pooling: pools are static images created at spawn, ≤40 per level; flicker
via 2-3 shared tweens, not per-pool timers. Accept: night-feel shots of
1-2 crusher hall + 2-3 tunnel; fps A/B within 2fps.

### P9 — HUD & dialog micro-motion
KOBI avatar: iris wanders while idle, snaps toward the text while typing,
mood-colored ring (gloating magenta / angry red / defeated grey-blue) +
eyelid half-close on defeated. Blip bar border pulse color follows mood.
Item cards: fix the spawn overlap — stagger both axes and clamp cards to
never cover the action-hint bubbles or each other (measure, then offset);
cards get a 150ms slide-in. Key chip: bounce-in + spin on collect. Core
pips: idle soft glimmer every ~6s. Intro banner: brushed texture bands +
world icon (from P2) beside the chamber name. Exit-waiting bubble: buddy
icon does a tiny beckoning wave loop. The overlap audit ALSO covers U1's
coach bubbles and U7's controller-connected toast (seen overlapping the
intro card in u7-pad-toast.png — offset the toast below the card region).
Accept: spawn shot proving zero overlaps at every level's spawn (script
sweeps all 6 + tutorial).

### P10 — Menus, overlays & transitions
Settings + Pause rebuilt to title-screen standard: gradient + motes +
silhouette strip, panel with accent header bar, key-cap value hints,
selected-row chevron + glow (shared drawing helpers with TitleScene —
extract a small ui-kit module so all three screens stay in lockstep).
Scene transitions: keep the 250ms fades but add a KOBI iris-wipe variant
for game→hub-after-clear (circle mask closing on the exit door, opening
on the hub node — pure camera/mask, ≤350ms, input-guarded, suites-safe
timing per Sprint 9 rules). Clear overlay: bolt-and-gear confetti burst
behind the panel (pooled, one emitter). Unlock animation on the hub gains
a light-pool flash. Accept: settings/pause/clear shots; suite timing
checks (they wait ≤1000ms) still pass.

### P11 — Particle & motion coherence
Unify FX palette per family: impacts = world accent + white core; electric
= hazard red-pink; steam/air = desaturated cyan-white; celebration = gold.
Sweep every emitter onto the palette map (a PARTICLES token table in
constants). Add: throw arc dotted trail (fades 400ms), zip line afterglow
(rope fades over 250ms after release instead of vanishing), reel pull
sparks at the anchor point, fan column gets streaming air-line particles,
respawn beam gains ground ring, checkpoint activation fires a vertical
light sweep. Cap total alive particles (~120) with a shared budget guard.
Accept: FX contact-sheet (scripted burst screenshots), fps A/B.

### P12 — Meticulous final audit 2
Regenerate the full gallery (title, hub ×2, settings, pause, all 6 levels
start + action, tutorial ×2, clear overlay) into tools/shots/gallery2/.
Diff every shot against the old gallery; list every remaining defect and
fix all of them (alignment, contrast, overlap, inconsistent radii/border
widths, stray old-palette colors). Verify every meaning-bearing state
renders under canvas. Full fps sweep (all 6 levels + title + hub). README
"Current state" line updated. Accept: gallery reviewed shot by shot; full
stack green; zero known visual defects list at the end of this file.

## Review protocol
Same as Pass 1: each sprint implemented by an Opus agent on buddies dev,
reviewed by Fable (screenshots + independent full-stack run), accepted →
buddies main (auto-deploy), rejected → precise fixes. Matrix red = binding
beat-failure protocol.
