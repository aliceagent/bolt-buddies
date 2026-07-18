# GFX2 V9 — Full Visual Audit (completeness tick-off)

Every texture KEY in `GFX2_INVENTORY.md`'s family lists, verified in code against
the Lumen-Lab recipes (paint.js `softBody`/`glowShape`/`fakeRadial`/`ringGlow`/
`sheen`/`glassPanel`/`iconChip`/`iconGlow`, or a hand-rolled equivalent that
follows the same shading/glow language). Format:

`key — <sprint that restyled it>` | or | `key — kept: <why it is deliberately fine as-is>`

"kept" is reserved for FUNCTIONAL alpha ramps / erase masks / tiny single-purpose
particles where the correct art *is* a plain gradient or dot — restyling would
break the effect. Bake sites: BootScene.js (boot), GameScene ensureW3/Storm/W4/
Heart (lazy), UIScene (bbConfetti). Verified: 2026-07-17.

RESULT: 208 keys accounted for. 0 missed stragglers (every key already carries a
V1–V8 restyle or a justified keep). PARTICLES reviewed — already palette-coherent,
no change. See the report at the bottom.

---

## Player robots (V2) — BootScene
- robot_b — V2: rounded capsule, softBody 4-tone, glass visor, mint rim, eyes(17,23)/(28,23), ant(22,3), tread y44.5
- robot_o — V2: same recipe, coral rim (Boop)
- robot_b_blink — V2: eyes-closed lids at y=24 (anchor 7)
- robot_o_blink — V2
- robot_b_carry — V2: arms-up carried pose variant
- robot_o_carry — V2
- shadow — V2: softened contact-shadow (20 fainter stacked rings) | kept-form: functional radial, no hard art to restyle
- phaseedge — V2: violet silhouette outline hugging the r=9 capsule + tread halo
- tread0 / tread1 / tread2 / tread3 — V2: smooth belt + round wheels, 4-phase march (== baked robot tread palette)
- pupils — V2: dark lenses at 3/14 (11px apart, anchor 1) + iris warmth + catchlights
- anttip — V2: glowing tip ball (halo + spec) riding baked antenna tip
- arm_glyph — V3-set (drawn in V2 char pass): forearm + neon claw glow, origin 0.12,0.5
- equipflash — V2: bright expanding ring + spokes
- dp_visor_b / dp_visor_o — V2: mini visor chunk, accent-lit
- dp_ant_b / dp_ant_o — V2: antenna chunk + accent tip glow
- dp_tread_b / dp_tread_o — V2: tread chunk
- dp_plate_b / dp_plate_o — V2: body-plate chunk, accent rim
- dp_bolt_b / dp_bolt_o — V2: bolt chunk, accent glow

## Tiles / terrain (V1) — BootScene
- tile1 — V1: warm-steel rounded plate (softBody), warm glaze + steel rivets, seamless inset
- tile2 — V1: teal plate, pipe-seams + brass bolts
- tile3 — V1: plum plate, gold hazard hatch + glowing gold dots
- tile4 — V1: indigo-night plate, cyan seam + glowing cyan dots
- tile — V1: back-compat alias (== W1 tile1)
- crack — V1: fractured rounded plate, neon hairline glow behind the crack polyline
- belt — V1: smooth conveyor body + edge rollers + glowing amber chevrons (seamless)
- hazard — V1: glowing red-halo sawtooth (2-layer halo + white-hot tips), tiling polyline preserved
- bridgetile — V1: holo-teal slab, neon scan stripes + glowing edge rails (x-constant, seamless)
- liftplat — V1: deck + amber glowing top edge (x-constant bands, seamless)
- dripstain — V1: smooth rust-seep streak + hanging bead
- decal_oil — V1: layered oil slick + cool sheen + drip bead
- decal_scuff — V1: tapered curved scrape arcs + lit rub-marks
- decal_chevron — V1: rounded backing + glowing amber flow chevrons
- decal_vent — V1: rounded steel vent (softBody) + shaded louvers + screws
- decal_poster — V1: rounded "NO PETS" sign, barred-dog motif + baked KOBI neon eye
- rail — V1: smooth steel rail, top-light lip + dark channel (x-constant, seamless)

## Backdrops (V1) — BootScene
- bggrid — V1: fine 16px sub-grid + soft 48px main grid + intersection nodes (96 seamless)
- bgGradient — kept: white tintable base strip (functional gradient); world variants below carry the palette
- bgGradient1 / bgGradient2 / bgGradient3 / bgGradient4 — V1: re-baked from enriched WORLD_THEMES bgTop/bgBottom
- glowBlob — kept: white tintable base radial (functional); world variants below carry the palette
- glowBlob1 / glowBlob2 / glowBlob3 / glowBlob4 — V1: re-baked from enriched WORLD_THEMES.glow
- lightpool — kept: functional quadratic-falloff radial (P8 ambient pool); alpha≤0.3, palette-neutral by design
- toplight — kept: functional white top-light gradient strip (key-light wash over banners/panels)
- propStrip1 — V1: W1 assembly silhouette + WARM status lights & lit vat windows (Lumen glow accents)
- propStrip2 — V1: W2 tunnels silhouette + cool-mint valve pilots + brass pilot flames
- fogBand — V1: softened alphas + warmer neutral haze (whole-cycle sine, seamless)
- dustShaft — V1: softer/subtler light shaft
- vignEdge — kept: functional black vignette gradient (four border bands, alpha≤0.22)
- labskyline — V1: dusk skyline silhouettes + deterministically-lit WARM windows (Lumen glow)
- conveyor — V1: title conveyor + warm status dots (edge-clear, seamless 220px)

## Machines / interactables (V3) — BootScene
- anchor — V3: fakeRadial hub glow + ringGlow cling ring + hot centre spec
- lever — V3: shaded base plate (softBody) + fakeRadial magenta pivot glow
- lever_handle — V3: haloCircle magenta knob + spec, base-pivot
- key — V3: fuller gold body + fakeRadial bow glow + rim highlight
- glint — kept: functional white diagonal sweep streak over the key (light glint, not an object)
- holobeam — V3: richer neon beam (tapered bloom + hot core streak)
- core — V3: fakeRadial bloom + glowShape hex rim + hot white core
- door — V3: glass-and-steel panel (softBody) + glowing centre seam + sheen + bolts
- door_exit — V3: green steel + green glow seam + warm inviting candle wash
- lamp_red — V3: glass lens + baked red halo glow (softBody housing)
- lamp_green — V3: glass lens + baked green halo glow
- plate — V3: dark/off pressure plate + unlit LED strip (intentionally flat off-state)
- plate_on — V3: LED strip glow (stacked halo bands + hot core line)
- pedestal — V3: column + richer holo emitter lens (fakeRadial bloom + hot core + spec)
- beamband — V3: enriched twin light-bands (edge-0 falloff preserved → vertical-tiling seamless)
- pedglyph — V3: neon data-mote (diamond + soft glow + centre dot)
- drum — V3: spoked wheel + amber edge glow + warm cable-rim lip
- liftcable — V3: steel line + warm amber sheen (full-height, vertical-tiling)
- marqueedot — kept: functional white marquee dot (tinted per world on WebGL; additive glow gated to WebGL)
- checkpoint — V1/V3: rounded lamp-post (softBody) + glass lens head, dim inactive
- checkpoint_on — V1/V3: lit rim + soft green glow halo + hot lens + spec
- ring — V3: glowing green halo ring (3-layer), checkpoint burst
- pip_off — V6: dim glass gem (softBody) + faint idle sheen
- pip_on — V6: lit halo + glowing amber gem + hot top-light + spec
- keycap — V6: frosted-glass body (sheen + top-edge highlight + gloss), player border drawn in-game

## Enemies & set pieces (V4) — BootScene
- bug / bug_step / bug_step2 — V4: glossy rounded carapace (under-shade+top-light+spec+rim), cute amber eyes, 3 leg frames
- bug_w2 / bug_w2_step / bug_w2_step2 — V4: darker plum sub-species, hex inlays, same silhouette
- bug_splat — V4: purple ichor smear + flung droplets + wet highlight
- bug_glow — kept: functional additive amber eye-glow blob (proximity brighten, baked yellow)
- shard — V4: purple shell shard (two-tone triangle)
- crusher — V4: softBody body + red-hot amber teeth wrapped in danger-red heat bloom
- crane — V4: smooth industrial cab (softBody) + KOBI cyan eye in cabin window, socket(66,28)
- crane_dead — V4: grey powered-down cab + X eye (swap on defeat)
- crane_plate / crane_plate_c1 / crane_plate_c2 — V4: bolt-head plate + haloed magenta core, cracks deepen per stage
- trolley — V4: rail wheels + top-light + amber status strip glow
- plate_glow — kept: functional magenta pulse radial (baked color, alpha-pulsed in-game)
- pod — V4: exposed core, layered amber bloom → hot body → white-hot centre + spec
- pod_ring / pod_ring_c1 / pod_ring_c2 — V4: per-state escalating pulse rings (hue by cores crunched)
- shockring — V4: white slam bloom + amber inner ring
- phasewall — V4(P4): violet energy curtain, bands Y-constant (seamless stacks), haloed centre seam
- phaseflow — V4: drifting rising sine-band glow + haloed filaments (whole-cycle vertical tile)
- shimspark — V4: violet rising mote (bloom + core)
- duct — V3: steel frame + darker slot + faint mint intake breath + top-light lip
- duct_hint — V3: green squeeze-in chevrons + glow + inward air-lines
- fan — V3: mint updraft glow (haloed grille rim + blooming air-arrow + hot core)
- roller — V4: rounded cab (manual 4-tone) + glass lens eye (cyan rest), rivets, wheel hubs
- roller_alert — V4: red-flushed shell + hot-red lens + angry brow
- roller_pupil — V4: sliding dark pupil overlay + catchlight
- roller_wheel — V4: rubber tire + tread notches + bolted hub (spoke read)
- roller_lamp — V4: unlit amber roof dome
- roller_lamp_lit — V4: lit red dome + halo
- excl — V4: "!" popup, hazard-bordered glass card
- star — V4: 4/8-point sparkle + bloom + hot core
- warden — V4: soft-armored tower (softBody) + riveted face-plate + glowing visor slit (anchor 11)
- warden_defeat — V4: knocked-out cross-eye X pose (swap)
- nozzle — V3: softBody muzzle + cool steam breath + hot jet mouth (PARTICLES.steam)

## UI icons (V5/V6) — BootScene + GameScene ensure*
- icon_phase — V5/V6: iconChip + glowing violet ghost phasing through a shimmer band
- icon_tiny — V5/V6: iconChip + glowing green mini-robot
- icon_grapple — V5/V6: iconChip + neon rope + glowing hook claw
- icon_heavy — V5/V6: iconChip + soft-shaded amber kettlebell + glowing handle
- icon_magnet — V5/V6 (W3): iconChip + glowing amber horseshoe + pole tips + arc sparks
- icon_bubble — V5/V6 (W3): iconChip + translucent cyan shield bubble + catchlight
- icon_freeze — V5/V6 (W4): iconChip + glowing six-armed frost star
- icon_beam — V5/V6 (W4): iconChip + light cone + soft-shaded flashlight + hot lens
- reticle — V5/V6: soft targeting glow ring + crosshair ticks

## FX (P11 family, GFX2 palette-aligned in V1–V6) — BootScene
- hazspark — V1: hot pink-white ember (electric family: 0xff5566 + 0xffe0e6)
- px — kept: functional 6×6 white particle pixel (impact/debris base)
- hookhead — V3-set: claw + shaft (cool white), grapple rope end
- streak — kept: functional white additive speed-line
- bolt — V2-set: steel hex-nut debris + glint
- beamcol — V-FX: respawn light column (blue-white core, soft edges)
- drip — V3-FX: soft blue-white steam teardrop (steam family)
- fxdot0 / fxdot1 — V2/P11: per-player trail dots (beep cyan / boop amber), pre-coloured
- fxring — V4-FX: respawn ground ring (PARTICLES.steam body/core)
- cpsweep — V-FX: checkpoint light-sweep (PARTICLES.celebration gold)
- fanair — V3-FX: fan updraft streak (PARTICLES.steam)
- bbConfetti — V8 (UIScene): soft-shaded hex + gear frames (2-frame), palette tints

## W3 — GameScene.ensureW3Textures (V3 machines / V4 enemies)
- railtile — V3: powered I-beam + amber cling-strip glow (x-constant underside, seamless)
- crate3 — V3: plated box + X brace + amber magnet-dot corner glows
- magswitch / magswitch_on — V3: horseshoe coil + haloed status lamp + energised amber field/arcs
- vent3 — V3: amber updraft grille (fan family in W3 hue)
- bubbleshell — V4/V3: translucent glass dome (baked), twin glint arcs + specs
- jelly / jelly_happy — V4: inner-glow translucent dome (fakeRadial trick) + electric fringe, skirt y≈10
- jelly_glow — kept: functional additive yellow glow ellipse
- jelly_tent — V4: soft dangling tentacle ribbon (rig part), origin 0.5,0.08
- socket / socket_on — V3: powered cradle + green glow + energised arcs
- chomper / chomper_alert / chomper_dozer — V4: softBody snout + glass eye + metal teeth / happy grin
- tooth — V4: steel tooth + glint
- chomper_jaw — V4: jaw overlay (rig part), origin 0.06,0.4
- propStrip3 — V3/W3: foundry/scrapyard silhouette (crane rails, scrap hooks, coil stacks), seamless 512×864

## Storm 3-3 — GameScene.ensureStormTextures (V4)
- scrap1 / scrap2 / scrap3 — V4: jagged plate / gear / pipe-elbow, hot magenta polarity fringe glow
- scrapshield — V4: riveted plate wrapped in amber magnet-field bloom
- fusecore_item — V4: amber energy cell + cyan poles + hot filament
- fusesock / fusesock_on — V4: empty cradle → seated glowing core + lit contacts + arcs
- stormvent / stormvent_off — V4: polarity nozzle, live magenta muzzle bloom + arcs / dark
- stormchev — V4: magenta lane-direction chevron + glow

## W4 — GameScene.ensureW4Textures (V3 devices / V4 enemies)
- darkpx — kept: functional black darkness stamp (RT scales it over dark zones)
- glowmask — kept: functional white→transparent radial ERASE stamp (RT hole depth)
- conemask — kept: functional white beam-cone ERASE wedge (RT reveal)
- conelight — V4: VISIBLE warm beam cone (baked translucency) + bright core streak
- ghosttile — V4: holo circuit plate + cyan trace glow + node halos (visibility beam-driven)
- rothub — V4: spoked drum + violet rim glow + cyan hub core glow
- rotseg — V4: plated segment + neon violet walking face
- laseremit — V4: turret + hot red lens (bloom → core → white-hot pinpoint)
- icetile — V4: glacial block + cool inner bloom (edge-uniform, seamless stacks) + cracks + sheen
- icepanel — V4: frost overlay panel (baked translucency) + frost ferns + centre bloom
- gloomy / gloomy_scared — V4: shadow-gradient dome + moon-eye glow / wide-eyed wail (skirt y≈11)
- gloom_wisp — V4: trailing shadow ribbon (rig part), origin 0.5,0.1
- ticker / ticker_wind — V4: brass clockwork body (softBody-style) + clock face, amber flush on wind
- ticker_key — V4: brass wind-up key (rig part), origin 0.5,0.82
- icon_freeze — V5/V6: see UI icons above
- icon_beam — V5/V6: see UI icons above
- propStrip4 — V3/W4: near-black datacenter void — server racks, neon seams, the Core arch, seamless 512×864

## Finale 4-3 — GameScene.ensureHeartTextures (V4)
- kobi_housing — V4: armored glass casing (softBody + glowShape seams) + glassy sclera + ringGlow mood ring + vents
- kobi_iris — V4: deep-magenta bloom iris (rim → bloom → hot glow → pupil → catchlight)
- kobi_iris_dead — V4: flat grey powered-down iris (swap)
- kobi_lid — V4: housing-toned dome cap + violet glow seam + lash bolts
- heart_vent — V4: armored louver hatch + violet glow seam + magenta pilot halo + rivets
- heart_core — V4: warm amber heart-plug (layered bloom + under-shade + spec + heartbeat tick)
- heart_core_dead — V4: unplugged empty cradle, light off (swap)
- turbine — V4: base column + pole top-light + red pilot lamp halo + rotor seat
- turbine_rotor — V4: three blades + hot-tipped bloom + hub glow
- turbine_rotor_dead — V4: grey blades, light off (swap)
- bolt_cage — V4: barred cage + Bolt's amber tail-light halo through the bars
- bolt_cage_open — V4: flung-open gate + green lock lamp
- bolt_pup — V2/V4: smoother pup silhouette, warm cream belly, gold collar glow + tail-light

## Animation baked-Graphics rig parts (*_anim.js draw fns) — audited, no clash
- bug feelers (bug_anim drawFeeler) — leg-tone stalk + amber sensor knob (matches bug eyes) — coherent
- roller klaxon (roller_anim drawKlaxon) — hazard red + hot pip — coherent
- crane pupil/lid/glow (crane_anim) — cyan glow 0x39d7ff + steel lid + catchlight — matches crane eye — coherent
- player hook (player_anim drawHook) — neon cyan claw + pale knuckle — matches arm_glyph — coherent
- warden glint (warden_anim drawGlint) — warm gold + white — matches visor slit — coherent
- w3/w4 skill flashes (magArc amber, frostStar frost-blue, skill rings) — match SKILL_INFO hues — coherent
- Bolt cameo (cameo_anim) — magenta collar/eye + steel body — matches bolt_pup/KOBI identity — coherent
(All small, all palette-coherent; none restyled — no visual clash present.)

---

## PARTICLES (constants.js) — reviewed, coherent, no change
The P11 particle system is already one coherent family and its hues sit inside the
Lumen palette — no clashing hex found, so no additive tweak was needed:
- impact { core 0xffffff, accent 0xffd9a0 (warmth-cream), debris 0xc7d0e6 (steel) } — neutral/warm, reads on every world
- electric { core 0xffe0e6, glow 0xff5566 } — glow == COLORS.hazard exactly
- steam { core 0xeef4ff, body 0xcdd8ff, dust 0xc2ccdf, smoke 0x9aa6c0 } — cool cyan-white air family
- celebration { core 0xfff6c2, body 0xffe066, spark 0xffd94d } — amber-gold, matches COLORS.amber family

## Findings
- Stragglers found & fixed: 0. Every inventory key already carries a V1–V8 Lumen
  restyle. V0–V8 were exhaustive; this pass is a clean tick-off.
- Keys "kept" (deliberately fine as functional alpha ramps / erase masks / single
  particles): 15 — bgGradient(base), glowBlob(base), lightpool, toplight, vignEdge,
  marqueedot, glint, streak, px, darkpx, glowmask, conemask, plate_glow, bug_glow,
  jelly_glow. (Plus `shadow` whose radial is functional but was still softened in V2.)
- PARTICLES: 0 changes (already coherent).
