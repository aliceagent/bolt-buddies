# GFX2 — "Lumen Lab" Full Visual Overhaul (Plan of Record)

Direction locked by the director: **Style A (sleek smooth vector) + Style B's
neon-glass glow on machinery & UI + a richer, more artistic color language**
(fuller per-world palettes; tasteful, kid-warm, NOT psychedelic). Working name
for the look: **Lumen Lab** — soft-shaded rounded forms, glowing machine
accents, glassy UI, deeper atmosphere.

Companion doc (MANDATORY reading for every sprint): `docs/GFX2_INVENTORY.md`
— the complete texture inventory, hard constraints, animation contract, and
test couplings. THE PRIME RULE: **same keys, same canvas dims, same origins,
same feature anchor positions** (or lockstep code updates per the contract).
Physics-critical: robot frames stay 44×48 with the body silhouette centered.

## 1. Style language

**Form.** Rounded silhouettes everywhere: fillRoundedRect/fillCircle/fillEllipse
compositions, no naked hard-corner rects on visible surfaces. Chunky bevel
squares → soft capsule/pebble forms. Detail via shape, not pixel noise.

**Shading recipe (Canvas-safe — no tint, no fillGradientStyle):** every solid
form gets 3–5 baked tones: base fill → darker under-shade (bottom third, alpha
strips or a darker rounded shape) → lighter top-light (top third) → a thin
near-white specular highlight (small rounded stroke/ellipse, alpha .5-.8) → a
1.5-2px darker outline of the same hue family (NOT black) to keep forms crisp
on busy backgrounds. Fake-radial = 3-4 concentric alpha steps (existing hub
node trick — now standard).

**Glow recipe (machinery/UI accents):** functional/energetic elements (lenses,
LEDs, coils, vents, cores, lamps, screens, rails' cling strips) get a 2-3 layer
baked halo: accent stroke at alpha .9 → same shape inflated 2-3px at alpha .25
→ inflated 5-6px at alpha .10. Runtime ADD-blend pools (addLightPool) stay and
gain per-object placements where cheap. Glow color = the object's functional
accent, not always cyan (see palette).

**Glass recipe (UI):** panels become "frosted glass": fill COLORS.panel at
alpha .78-.88 (down from .92-.97), 1.5px inner top-edge highlight stroke
(white alpha .10), 2px accent border, soft outer glow ring (existing), and a
subtle baked sheen band (diagonal light rectangle alpha .05). Implemented once
in ui/kit.js `neonPanel` + MuteScene/UIScene panel painters so it cascades.

**Color expansion (the "more colorful" directive).** New WORLD_THEMES values
(same keys/fields, richer values) + 2 new fields used only by new art
(`accent3`, `warmth`) — additive so existing reads never break:
- W1 Assembly: warm amber + coral + teal steel; sunrise-orange gradient top.
- W2 Tunnels: teal/steam-green + violet shadow + brass pipes.
- W3 Magnet Works: electric violet + gold + magenta arcs; deep plum floor.
- W4 Dark Core: indigo night + cyan/white neon + candle-warm accents.
COLORS gains new entries (never renames): coral, brass, plum, mint, indigo,
glassHi. Values of existing COLORS entries may be gently enriched ONLY where
no test asserts them (tests assert text/coords, not colors — verified).
Characters get colored rim-light: Beep cyan-on-blue w/ mint rim, Boop
amber-on-orange w/ coral rim. Decision noted: FONT stays 'Courier New' (its
techy-typewriter voice is part of the game's identity; changing it would
ripple through every measured layout).

## 2. Object treatment specs (by sprint)

### V0 — Foundation (new module + kit upgrade)
- NEW `src/ui/paint.js`: shared recipes — `softBody(g,spec)` (rounded form +
  4-tone shading), `glowShape(g,spec)` (halo layers), `specular(g,...)`,
  `fakeRadial(g,...)`, `sheen(g,...)`, `ringGlow(g,...)`. Pure-draw helpers
  usable inside ANY bake callback (BootScene make(), ensure*(), scene draws).
- constants.js: palette expansion per §1 (additive; existing keys keep working).
- ui/kit.js `neonPanel` → glass recipe (all consumers upgrade for free).
- QA: build + full playtest quick pass + before/after Title & Pause shots
  (panels visibly glassy; nothing else changed).

### V1 — Terrain, backdrops, doors (keys per inventory family "Tiles/terrain",
"Backdrops", plus door/exit/checkpoint from machines family)
- tile1-4: rounded-plate look — soft top-light strip, deep under-shade, hue
  from new world palettes (W1 warm steel, W2 teal plate, W3 plum+gold hatch,
  W4 indigo+cyan seams); rivets → small glowing dots on W3/W4. Keep 48×48
  seamless (edges must meet: test by 2×2 tiling in the bake comment).
- crack/hazard/bridgetile/belt: same forms, smoothed + glow (hazard red halo,
  bridge holo-teal glow lines, belt chevrons glow amber).
- bgGradient1-4: re-bake with richer 6-8 stop ramps (new theme values).
- propStrip1-4/labskyline/conveyor: smooth silhouettes + a few lit windows /
  glowing status dots; keep exact dims + horizontal tileability.
- fogBand/dustShaft/glowBlob/lightpool/vignEdge: retune alphas to the new
  palette (subtle).
- door/door_exit: glass-and-steel panel w/ glowing edge seam + lens lamp glow
  (lamp_red/green re-baked w/ halo); checkpoint(_on): rounded lamp post, soft
  green glow when lit; decals (oil/scuff/chevron/vent/poster): smooth vector
  redraw, poster keeps KOBI eye motif.
- QA: beat 1-1 + 4-1 (dark tiles), screenshots of each world's start.

### V2 — Characters (families "Player robots" + bolt_pup + KOBI everywhere)
- robot_b/o (+_blink,_carry): rounded capsule body, soft 4-tone shading, big
  friendly visor with baked eyes EXACTLY at (17,23)/(28,23), antenna tip at
  (22,3), tread band centered y44.5, blink lids at y=24 — anchors 1-3,7 of the
  contract. Colored rim-light (mint/coral). Same silhouette envelope (physics).
- tread0-3: smooth belt + round wheels, 4-phase offsets preserved.
- pupils/anttip/arm_glyph/equipflash/dp_* death chunks: matched restyle (pupil
  lens spacing 11px preserved).
- bolt_pup: smoother pup silhouette (50×36), warm belly shading, gold collar
  glow. Title/Epilogue/Reward drawn Bolt + KOBI helpers (scene code) upgraded
  with the same recipes (makeBolt/makeKobi in Epilogue/Reward; Title buildBolt;
  Hub ticker eye; UIScene avatar) — one shared visual identity.
- kobi_housing/iris(_dead)/lid + hub/HUD/onboard avatars: glassy sclera,
  deep-glow magenta iris, armored housing w/ glow seams; crane cabin eye keeps
  socket at tex(66,28) (anchor 10).
- QA: anim contact sheet (walk/jump/carry/blink/death via snap_p2_a* tools),
  beat 1-1 both roles, screenshots.

### V3 — Machinery & devices, glow treatment (family "Interactables/machines"
+ lifts/fans/nozzles/ducts + W3 machines + W4 devices)
- Everything gets the glow recipe on its functional element: anchor (cyan hub),
  lever+handle (magenta knob glow), key+glint (gold glow), core (neon hex,
  brighter halo), plate(_on) (LED strip glow), pedestal+holobeam+beamband
  (richer beam), drum/liftcable/liftplat (amber edge), crusher (red-hot piston
  vents), fan/vent3 (mint air glow), duct(+hint), nozzle, magswitch(_on) (arc
  glow), crate3/railtile (amber cling strip glow), rothub/rotseg/laseremit
  (hot lens), icetile/icepanel (cool glow), sockets/fuse set/storm set (all
  lit-state glows), keycap (glass key).
- Anchors: crusher vent y+22 (17), lift overlay dims (19).
- QA: beat 2-2 + 3-1 (devices heavy), screenshots per machine group.

### V4 — Enemies & bosses (families "Enemies", W3/W4 enemies, "Finale")
- bug family (+_w2, steps, splat, glow, shard): rounded glossy carapace, cute
  eyes; feeler bases stay under shell top (±5,-8) (anchor 12); 3 leg frames
  same dims.
- roller(+parts): rounded cab, big lens eye at (0,-5), wheels ±9,+11 (anchors
  8-9); klaxon glow.
- warden(_defeat): soft-armored tower, visor slit glowing across x-1..15@y-12
  (anchor 11).
- jelly/chomper/gloomy/ticker (+parts): per anchors 13-16; jellies get inner
  glow, gloomies soft shadow gradients, tickers brass shine.
- crane(+_dead,trolley,plates,pods,rings,shockring): smooth industrial forms,
  glowing plate cores, eye socket anchor 10.
- kobiheart set (housing/iris/lid/vents/cores/turbines/cage): the finale boss
  gets the richest treatment — glass sclera, magenta bloom iris, amber core
  glow, turbine hot tips.
- QA: beat 1-3 (crane) + 4-3 (finale) both roles, screenshots.

### V5 — Items, pickups, icons (icons family + reticle + collectibles already
partly in V3; this sprint = the HUD-facing set)
- icon_{phase,tiny,grapple,heavy,magnet,bubble,freeze,beam}: redraw as glowing
  glyphs in each skill's SKILL_INFO color, glassy chip backing (26×26).
- reticle, excl, star, ring, fxring, cpsweep, bbConfetti: smooth + glow.
- QA: HUD screenshots each world, playtest quick.

### V6 — HUD & overlays (UIScene + MuteScene)
- Player plates/level plate/core tray/key chip: glass recipe, player-color
  glow borders, smoother pips (hex → rounded gem look, same HEX geometry).
- Blip bar + KOBI avatar: glass bar, avatar per V2 identity; mood ring glow.
- Clear overlay: glass panel + toplight + confetti (keep texts EXACTLY).
- MuteScene: glass panel + glowing slider knobs (coords/probe FROZEN).
- Intro banner/item cards/coach bubbles/stuck UI/glyph caps (GameScene drawn
  UI): glass + glow, same geometry/texts.
- QA: playtest_audio 29/29 + snap_p2_mute + HUD screenshots.

### V7 — Menus (Title/Hub/Settings/Pause/Onboard/Walkthrough)
- Title: neon logo refined (smoother bloom), skyline richer dusk palette,
  menu buttons glass, cast per V2, KOBI corner per V2.
- Hub: sector map as glowing glass panels, corridors as light-tubes, nodes as
  glowing gems, richer wing palettes; ticker per V2. (Text/probe/coords FROZEN.)
- Settings/Pause/Onboard/Walkthrough: kit cascade + row-select glow polish.
- QA: campaign menu leg (title->hub->enter), snap_walkthrough, screenshots.

### V8 — Ending scenes (Epilogue pages, Reward acts, finale overlay)
- Storybook pages get the full palette treatment (dusk/dawn/night hues); cast
  via V2 helpers; Reward medal/album/share polished glass+glow. NEW
  tools/snap_reward.mjs (screenshot coverage gap). Strand-proof untouched.
- QA: softlock 4-3-epilogue-cant-strand + snap_reward + screenshots.

### V9 — FX coherence + full visual audit
- Particle palettes (PARTICLES families) aligned to new hues; light pools
  placed on any still-flat machine; leftover chunky-art sweep: audit EVERY key
  in GFX2_INVENTORY.md against the new recipes (checklist tick-off); regenerate
  full after-gallery; Fable visual review vs before-gallery; fix findings.
- QA: gallery diff review + spot beats.

### V10 — Full test kit + promote + report
- build · playtest suite · beat --full · softlock all · campaign to 2-clean ·
  audio/VO suites · finale video re-record. Fix all red. Promote dev→main.
  Final report w/ decision log.

## 3. QA protocol (every sprint)
1. Opus implements (reads this plan + inventory; edits only its sprint's files).
2. Build green + sprint's targeted tests green (listed per sprint above).
3. Screenshots: sprint-relevant before/after set.
4. Fable QA agent: reviews the diff + screenshots against this plan (style
   adherence, contract adherence, coupling checklist) → verdict + fix list.
5. Fixes applied (Opus follow-up), re-verify, commit + push dev.
Rules: never commit red; one sprint in flight at a time; decisions that deviate
from this plan get a DECISION NOTE in docs/GFX2_DECISIONS.md.

## 4. Working agreements
- Dev server on :5173 for all harnesses. Canvas renderer is the reference
  (?canvas=1); WebGL-only niceties (tint/ADD variance) must degrade safely.
- Never rename a texture key, change a canvas size, change an origin, move a
  contract anchor, or alter probe surfaces/asserted texts/click coords.
- The inventory doc is the completeness checklist: V9 ticks every key.
