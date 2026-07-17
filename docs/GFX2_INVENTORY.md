# GFX2 — Restyle Inventory & Hard Constraints (source: deep code audit)

## Bake architecture
- All art is Graphics -> generateTexture via a `make(key,w,h,draw)` helper.
- Bake sites: BootScene.js:11 (~144 keys, every boot) + lazy: ensureW3Textures
  (GameScene:6748, guard "crate3"), ensureStormTextures (:7009, guard "scrap1"),
  ensureW4Textures (:7114, guard "gloomy"), ensureHeartTextures (:7368, guard
  "kobi_housing", finale only), bbConfetti (UIScene:398). ~208 keys total.
- Canvas-safe rules: NO setTint / fillGradientStyle (WebGL-only). Gradients =
  baked strips;色 variants = distinct textures; state changes = setTexture swaps.

## HARD CONSTRAINTS (restyle must preserve)
1. Every texture KEY keeps its name and canvas W×H.
2. Every runtime setTexture pair/cycle co-exists (see list): robot base/_carry/
   _blink; tread0..3; dp_* death chunks; bug/bug_step/bug_step2 (+_w2); magswitch(_on);
   crane(_dead); crane_plate(_c1,_c2); heart_core(_dead); turbine_rotor(_dead);
   kobi_iris(_dead); bolt_cage(_open); fxdot0/1; pip_off/on; checkpoint(_on);
   plate(_on); lamp_red/green; roller(_alert)+roller_lamp(_lit); warden(_defeat);
   jelly(_happy)+socket(_on); chomper(_alert,_dozer); fusesock(_on);
   stormvent(_off); gloomy(_scared); ticker(_wind); icon_* set.
3. Tileables stay seamless: bggrid(96), conveyor, liftplat, railtile, tile1-4,
   belt, phaseflow (vert, whole sine cycle/48px), beamband (vert pair), ghosttile,
   icetile (vert), propStrip1-4 (horiz, h=864), fogBand (512 wrap, whole sine
   cycles), phasewall (bands constant along Y so stacks tile).
4. PHYSICS-COUPLED DIMS: robot frames MUST stay 44×48 — Player.js BODY
   {w:30,h:42,ox:7,oy:6} is in unscaled texture px and derives from the frame;
   keep body silhouette centered as now. All other entities use hard-coded
   setSize independent of frame dims (art should still FILL those boxes:
   bug 38×22@3,4; chomper 50×32@3,6; etc.).
5. backdrop.js:64-66 falls back propStrip3/4 -> propStrip2/1 when not yet baked.

## Families (per-object restyle targets)
- Player robots: robot_b/o(+_blink,_carry), shadow, phaseedge, tread0-3, pupils,
  anttip, arm_glyph, equipflash, dp_{visor,ant,tread,plate,bolt}_{b,o}.
- Tiles/terrain: tile1-4(+tile alias), crack, belt, hazard, bridgetile, liftplat,
  dripstain, decal_{oil,scuff,chevron,vent,poster}, rail.
- Backdrops: bggrid, bgGradient(1-4), glowBlob(1-4), lightpool, toplight,
  propStrip1-2, fogBand, dustShaft, vignEdge, labskyline, conveyor.
- Machines/interactables: anchor, lever(+handle), key, glint, holobeam, core,
  door, door_exit, lamp_red/green, plate(_on), pedestal, beamband, pedglyph,
  drum, liftcable, marqueedot, checkpoint(_on), ring, pip_off/on, keycap.
- Enemies/set pieces: bug family(+_w2), bug_splat, bug_glow, shard, crusher,
  crane(_dead), trolley, plate_glow, crane_plate(+c1,c2), pod, pod_ring(+c1,c2),
  shockring, phasewall, phaseflow, shimspark, duct, duct_hint, fan,
  roller(+_alert,_pupil,_wheel,_lamp,_lamp_lit), excl, star, warden(_defeat), nozzle.
- UI icons: icon_{phase,tiny,grapple,heavy,magnet,bubble,freeze,beam}, reticle.
- FX: hazspark, px, hookhead, streak, bolt, beamcol, drip, fxdot0/1, fxring,
  cpsweep, fanair, bbConfetti(2 frames).
- W3: railtile, crate3, magswitch(_on), vent3, bubbleshell, jelly(+_happy,_glow,
  _tent), socket(_on), chomper(+_alert,_dozer,_jaw), tooth, icon_magnet,
  icon_bubble, propStrip3.
- Storm(3-3): scrap1-3, scrapshield, fusecore_item, fusesock(_on),
  stormvent(_off), stormchev.
- W4: darkpx, glowmask, conemask, conelight, ghosttile, rothub, rotseg,
  laseremit, icetile, icepanel, gloomy(_scared), gloom_wisp, ticker(_wind,_key),
  icon_freeze, icon_beam, propStrip4.
- Finale: kobi_housing, kobi_iris(_dead), kobi_lid, heart_vent, heart_core(_dead),
  turbine(+_rotor,_rotor_dead), bolt_cage(_open), bolt_pup.

## ANIMATION CONTRACT (source: deep anim audit)
Mechanism: NO sprite-sheets. (b) code transforms on hosts + (c) multi-part rig
(CharRig, rig.js:150) — pooled overlay Images/Graphics placed per-frame from a
pose bag. Only true frame cycles: tread0..3 (rig.js:133) and bug legs
(bug_anim.js:117) — hand-rolled setTexture swaps.

RESTYLE CONTRACT:
A. Keys unchanged. B. Canvas dims unchanged. C. Origins unchanged (arm_glyph
0.12,0.5; jelly_tent 0.5,0.08; gloom_wisp 0.5,0.1; ticker_key 0.5,0.82;
chomper_jaw 0.06,0.4; hosts centered). D. Feature ANCHORS stay put or update
code in lockstep:
 1 player eyes baked (17,23)/(28,23) — player_anim.js:51 EYES{0.5,-1} + pupils
   lens spacing BootScene:518 (11px apart)
 2 antenna tip (22,3) — ANT{0,-21}; 3 tread band y44.5 — TREAD{0,20.5}
 4 HOOK{15,-3}; 5 ARM{0,-4}; 7 blink lids y=24 (robot_*_blink)
 8 roller eye at local(0,-5) roller_anim:134 + GameScene:5418; wheels ±9,+11
 10 crane eye socket tex(66,28) -> EYE_LX=0,EYE_LY=-10 crane_anim:53; lid r10.5
 11 warden visor slit x-1..15,y-12 (motion.js:114)
 12 bug feelers (±5,-8) under shell top; 13 chomper hinge (-20,+6), origin .06,.4
 14 jelly skirt y≈10 (tentacles x -12/-4/4/12); 15 gloomy skirt y≈11 (x -9/0/9)
 16 ticker key mount (-14,-6); 17 crusher sigh vent img.y+22
 19 lift overlay = liftplat at platform w/h exactly
Baked-Graphics parts (feelers/klaxon/glint/hook/crane pupil-lid-glow/W3W4 skill
flashes/Bolt cameo) live in *_anim.js draw fns — restyle by editing those fns.
KOBI hub/HUD avatars + title Bolt + hub ticker eye + boss eye anims live in
TitleScene/HubScene/UIScene (not src/anim) — audit separately.

## DRAWN-SCENE / TEST-COUPLING NOTES (source: drawn-UI audit)
- ui/kit.js: neonPanel/drawRowSelect/keyCap(capW formula)/chipRow/addSkyline/
  menuBackdrop/drawIris — THE shared panel language; restyle here cascades.
- constants.js is the token surface: FONT('Courier New'), FS scale, TEXT, COLORS,
  WORLD_THEMES 1-4, PARTICLES(budget 120), DEPTH bands, SKILL_INFO colors.
- HARD test couplings to preserve: __BB.menu/onboard/wt/mute/epilogue/reward
  probes; Mute GLYPH(864,26)+PANEL(716,46,236,214)+row y100/134/168/202+TRACK
  784..898; Hub nameText "<id>  \"<name>\"" + toast lines; UIScene clear headline
  texts + this.completed sync + blip bar top y=H-92; menu order (WALKTHROUGHS
  last); Settings row order 0-8; footer y540.
- GameScene runtime draws: rope/hintGfx/beamGfx, intro banner(560w @132),
  item cards, glyph key-caps (drawn colors, no tint), heartGfx glare column
  (stripes+lock tracer+strike sheath, glareHalfW 52), dazzle meter, beam cones
  (conelight + conemask erase), darkRT half-res mask, freeze wash, icepanel
  overlays, coach need-bubbles, SL4 stuck UI (above blip bar).
- Screenshot tools: gallery2 (master, 45 shots), snap_p2_mute (clicks probe
  coords), snap_walkthrough, record_finale_video (only Reward coverage),
  snap_w4_l43 + w3/w4 snaps. Reward needs a snap tool (gap to fill in V8).
