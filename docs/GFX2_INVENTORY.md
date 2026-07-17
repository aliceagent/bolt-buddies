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
