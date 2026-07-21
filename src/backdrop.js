import Phaser from "phaser";
import { DEPTH, WORLD_THEMES } from "./constants.js";
import { isWebGL } from "./ui/paint.js";

// Shared layered-background helpers so the Title, Hub and Game screens all wear
// the same procedural depth treatment. Everything sits below `DEPTH.terrain` and
// is created once (no per-frame allocation).

// Fixed vertical gradient, sized 2x the viewport and centred so camera zoom-out
// never reveals an edge. Uses the colour-baked `bgGradient<world>` texture
// (setTint is WebGL-only and no-ops under ?canvas=1, so the world colours are
// baked in at BootScene time); the camera background is set to the matching
// bgBottom so anything beyond the oversized image blends seamlessly.
export function addGradient(scene, world) {
  const key = WORLD_THEMES[world] ? world : 1;
  const theme = WORLD_THEMES[key];
  const W = scene.scale.width;
  const H = scene.scale.height;
  scene.cameras.main.setBackgroundColor(theme.bgBottom);
  return scene.add
    .image(W / 2, H / 2, `bgGradient${key}`)
    .setDisplaySize(W * 2, H * 2)
    .setScrollFactor(0)
    .setDepth(DEPTH.bg - 10);
}

// A slow ambient drift of dust motes. Screen-fixed (scrollFactor 0) with a
// generously oversized spawn box so motes stay visible at any zoom. Capped alive
// count keeps it cheap; additive blend makes them read as faint floating light.
export function addMotes(scene, tint) {
  const W = scene.scale.width;
  const H = scene.scale.height;
  return scene.add
    .particles(0, 0, "px", {
      x: { min: -W * 0.5, max: W * 1.5 },
      y: { min: -H * 0.5, max: H * 1.5 },
      speedY: { min: -18, max: -4 },
      speedX: { min: -10, max: 10 },
      scale: { min: 0.12, max: 0.34 },
      alpha: { min: 0.04, max: 0.16 },
      lifespan: 9000,
      frequency: 260,
      quantity: 1,
      maxAliveParticles: 40,
      tint, // WebGL only — under Canvas the motes render as soft white specks
      blendMode: Phaser.BlendModes.ADD,
    })
    .setScrollFactor(0)
    .setDepth(DEPTH.bg - 6);
}

// --- P3: world-backdrop identity ---------------------------------------------
// Every layer below sits at/below the backdrop depth band (DEPTH.bg-5 .. bg-1),
// strictly under DEPTH.terrain(5) — so props/fog/beams/vignette never occlude
// terrain, players, HUD or coach bubbles. Textures are pre-baked in BootScene;
// these helpers only add cached images/tileSprites (zero per-frame allocation).

// Per-world silhouette prop strip: one cached texture tiled horizontally at a
// mild parallax. Its height matches the texture so it never repeats vertically.
export function addPropStrip(scene, world) {
  // W3 (Magnet Works) / W4 (The Dark Core) get their own silhouette strips,
  // baked lazily by GameScene.ensureW3Textures()/ensureW4Textures() before
  // buildBackground runs (so the shipped W1/W2 boot path bakes nothing new).
  // Unknown worlds inherit W1.
  const key = world === 4 && scene.textures.exists("propStrip4") ? "propStrip4"
    : world === 3 && scene.textures.exists("propStrip3") ? "propStrip3"
    : world === 2 ? "propStrip2" : "propStrip1";
  const W = scene.scale.width;
  // Height clipped to the top band (0..560): the floor vats/gantry mostly hide
  // behind terrain anyway, and a shorter strip cuts the per-frame fill it costs
  // the software Canvas renderer. Width covers the parallaxed viewport.
  return scene.add
    .tileSprite(-W, 0, scene.worldW + 2 * W, 560, key)
    .setOrigin(0, 0)
    .setScrollFactor(0.55)
    .setAlpha(0.35)
    .setDepth(DEPTH.bg - 5);
}

// --- GFX5 S3: three-band parallax depth (WebGL only) -------------------------
// The single silhouette prop strip (addPropStrip above) becomes the MID band.
// These add the FAR and NEAR bands + a drifting atmosphere layer. ALL are gated
// to WebGL at the call site (GameScene.buildBackground) — the Canvas reference
// tier keeps only the single mid strip, byte-identical to today. Textures are
// pre-baked (BootScene W1/W2, GameScene.ensureW3/W4Textures W3/W4); these helpers
// only add cached tileSprites/images (zero per-frame allocation, R3).

// FAR band: the darkest hulking mega-silhouettes, farthest back. scrollFactor
// ~0.18 (moves least), depth just above the gradient and BELOW the parallax
// grids — the most distant plane. Full world height (864) so it never repeats
// vertically; width covers the parallaxed viewport.
export function addFarStrip(scene, world) {
  const key = scene.textures.exists(`propfar${world}`) ? `propfar${world}` : "propfar1";
  if (!scene.textures.exists(key)) return null;
  const W = scene.scale.width;
  return scene.add
    .tileSprite(-W, 0, scene.worldW + 2 * W, 864, key)
    .setOrigin(0, 0)
    .setScrollFactor(0.18)
    .setAlpha(0.55)
    .setDepth(DEPTH.bg - 9.5); // above gradient (bg-10), below the far grid (bg-9)
}

// NEAR band: larger, sparser structures with accent-lit windows. scrollFactor
// ~0.72 (moves most of the three bands), depth ABOVE the mid strip (bg-5) and
// BELOW the fog band (bg-4) / terrain. S3-QA: 0.6 sat only 0.05 above the mid
// band (pinned at today's 0.55 by Canvas invariance), so near and mid moved in
// near-lockstep; 0.72 gives the near band its own visible rate.
export function addNearStrip(scene, world) {
  const key = scene.textures.exists(`propnear${world}`) ? `propnear${world}` : "propnear1";
  if (!scene.textures.exists(key)) return null;
  const W = scene.scale.width;
  return scene.add
    .tileSprite(-W, 0, scene.worldW + 2 * W, 864, key)
    .setOrigin(0, 0)
    .setScrollFactor(0.72)
    .setAlpha(0.42)
    .setDepth(DEPTH.bg - 4.5);
}

// Drifting atmosphere: ONE per-world tinted wisp band (256×140 texture) at
// scrollFactor ~0.25, alpha ≤0.10, with a very slow tilePositionX tween (60-90s
// full loop, repeat -1) created ONCE at build — the only new animation this
// sprint, no update-loop work (R3). Additive only where it reads better per
// world (W4 void stays NORMAL blend so the near-black datacenter doesn't glow).
export function addAtmo(scene, world) {
  const key = scene.textures.exists(`atmo${world}`) ? `atmo${world}` : "atmo1";
  if (!scene.textures.exists(key)) return null;
  const cfg = {
    1: { alpha: 0.09, additive: true, loopMs: 78000 },  // warm haze
    2: { alpha: 0.07, additive: true, loopMs: 82000 },  // steam
    3: { alpha: 0.09, additive: true, loopMs: 72000 },  // spore mist
    4: { alpha: 0.10, additive: false, loopMs: 88000 }, // void wisps (normal blend, dark world)
  }[world] || { alpha: 0.09, additive: true, loopMs: 78000 };
  const W = scene.scale.width;
  const H = scene.scale.height;
  const bandH = Math.round(H * 0.62); // upper band; behind terrain, so only shows in backdrop gaps
  const TW = 256; // atmo texture width == the seamless drift period
  const ts = scene.add
    .tileSprite(-W, 0, scene.worldW + 2 * W, bandH, key)
    .setOrigin(0, 0)
    .setTileScale(1, bandH / 140) // stretch vertically to the band (no vertical repeat); X period stays 256
    .setScrollFactor(0.25)
    .setAlpha(cfg.alpha)
    .setDepth(DEPTH.bg - 6.5); // behind the mid strip + near band, in front of the glow blobs
  if (cfg.additive) ts.setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: ts,
    tilePositionX: TW, // one texture width → seamless wrap; linear, no yoyo
    duration: cfg.loopMs,
    ease: "linear",
    repeat: -1,
  });
  return ts;
}

// GFX3 G4: sparse near-camera FOREGROUND occlusion silhouettes (BOTH tiers —
// cached dark images, no per-frame work). At DEPTH.foreground (above players)
// so they pass IN FRONT of the buddies for a depth read.
//
// Readability is enforced geometrically, not just by depth:
//  - Ceiling props (cable/pipe/vent) parallax horizontally (scrollFactorX
//    1.12-1.18) but are PINNED to the top screen band (scrollFactorY 0), so the
//    0.62-1.06 dynamic zoom + vertical camera-follow can never drop them into
//    the center action band — they live in the top ~third at worst.
//  - Density <=1 prop per ~600px of level width; `keepOut` is a list of world-x
//    ranges ([lo,hi]) around spawns/exits/stations/checkpoints — any ceiling
//    prop whose world-x falls inside one is dropped. Callers skip this entirely
//    for the tutorial and the 4-3 boss arena (no props there at all).
// NOTE (G4-D4): the plan's "occasional floor-corner posts" were cut. A floor
// post lives in the BOTTOM band where the buddies stand, so it can only be safe
// if screen-fixed at the extreme edge — but a screen-fixed post cannot honour a
// world-x keep-out (screenshot review caught one landing on a spawn's robots +
// skill pedestals), and a world-anchored bottom post sweeps through the players
// at center-bottom under parallax. Neither satisfies "fix via keep-out, never
// accept", so the ceiling silhouettes carry the foreground identity alone.
// Deterministic layout: a level-id-seeded PRNG (never Math.random) so every load
// draws the identical set.
export function addForegroundStrip(scene, world, keepOut = []) {
  const worldW = scene.worldW;
  const budget = Math.floor(worldW / 600); // <=1 prop per ~600px of width
  if (budget <= 0) return [];
  const theme = WORLD_THEMES[world] || WORLD_THEMES[1];
  const webgl = isWebGL(scene);
  // level-id-seeded PRNG (deterministic, allocation-free)
  const id = (scene.def && scene.def.id) || "lvl";
  let s = 0; for (let i = 0; i < id.length; i++) s = (Math.imul(s, 31) + id.charCodeAt(i)) | 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const inKeepOut = (x) => keepOut.some((r) => x >= r[0] && x <= r[1]);
  const made = [];
  const ceilKeys = ["fgCable", "fgPipe", "fgVent"];
  // Ceiling props: one per width band, jittered, dropped if it lands in a
  // keep-out range. Pinned to the top band via scrollFactorY 0.
  const ceilBudget = budget;
  for (let i = 0; i < ceilBudget; i++) {
    const bandLo = (i / ceilBudget) * worldW;
    const bandW = worldW / ceilBudget;
    const x = bandLo + bandW * (0.25 + rnd() * 0.5);
    if (inKeepOut(x)) continue;
    const key = ceilKeys[(rnd() * ceilKeys.length) | 0];
    const img = scene.add
      .image(x, 2 + rnd() * 10, key)
      .setOrigin(0.5, 0)
      .setScrollFactor(1.12 + rnd() * 0.06, 0) // X: foreground parallax; Y: top-band pinned
      .setDepth(DEPTH.foreground)
      .setAlpha(0.92);
    if (webgl) img.setTint(theme.accent); // enhance-only under WebGL (no-op Canvas)
    made.push(img);
  }
  return made;
}

// GFX3 G4: per-world WEATHER identity — ONE drifting element IN the playfield
// (scrollFactor ~0.9, so it parallaxes WITH the world, unlike the screen-fixed
// addMotes ambience). WebGL-gated at the call site (R1); Canvas keeps only the
// screen-fixed motes. Reuses the "px" particle texture, <=24 alive, created ONCE
// at level build with NO update-loop work (R3). The spawn box spans the whole
// level so a handful drift through the viewport wherever the camera is; the
// per-world tint/motion carries the identity:
//   W1 warm dust drift (slow, sparse, warmth-tinted)
//   W2 rare rising ember sparks (approximated level-wide — vent positions aren't
//      known here; warm, rising, low cap)
//   W3 plum/mint spore twinkles (fade-in/out via short life = the twinkle)
//   W4 indigo motes
// No W4 storm/snow level exists (checked the level defs: only 3-3 is storm, and
// it is World 3 scrap, not W4 snow), so no snow-streak variant ships.
export function addWeather(scene, world) {
  const theme = WORLD_THEMES[world] || WORLD_THEMES[1];
  const worldW = scene.worldW;
  const worldH = scene.worldH;
  const cfg = {
    1: { tint: theme.warmth, cap: 20, freq: 420, life: 9000, sx: [-8, 8], sy: [-6, -2], scale: [0.1, 0.3], alpha: { min: 0.05, max: 0.18 } },
    2: { tint: 0xffb347, cap: 12, freq: 620, life: 2600, sx: [-6, 6], sy: [-46, -20], scale: { start: 0.24, end: 0.05 }, alpha: { start: 0.5, end: 0 } },
    3: { tint: 0x8affc9, cap: 24, freq: 360, life: 2200, sx: [-5, 5], sy: [-7, 3], scale: { start: 0.06, end: 0.24 }, alpha: { start: 0, end: 0 }, twinkle: true },
    4: { tint: theme.accent, cap: 22, freq: 400, life: 9000, sx: [-7, 7], sy: [-5, 3], scale: [0.1, 0.28], alpha: { min: 0.06, max: 0.2 } },
  }[world] || {};
  const em = scene.add
    .particles(0, 0, "px", {
      x: { min: 0, max: worldW },
      y: { min: 0, max: worldH },
      speedX: { min: cfg.sx[0], max: cfg.sx[1] },
      speedY: { min: cfg.sy[0], max: cfg.sy[1] },
      // W3 spores twinkle: alpha rises then falls across a short life (two-stop
      // ramp), everything else uses the cfg alpha as-is.
      scale: cfg.scale,
      alpha: cfg.twinkle ? { values: [0, 0.5, 0], interpolation: "linear" } : cfg.alpha,
      lifespan: cfg.life,
      frequency: cfg.freq,
      quantity: 1,
      maxAliveParticles: cfg.cap,
      tint: cfg.tint,
      blendMode: Phaser.BlendModes.ADD,
    })
    .setScrollFactor(0.9)
    .setDepth(DEPTH.entity - 1);
  return em;
}

// W2 low-lying fog: two additive strips drifting at different speeds, screen-fixed
// to a short bottom band. IMPORTANT: they drift by translating the whole sprite's
// x (wrapped by the texture width) — NOT by tilePositionX, which under the Canvas
// renderer would regenerate the strip's fill canvas EVERY frame (a big, sustained
// cost that measurably destabilised the fps-sensitive beat routes). Translating a
// cached tileSprite is just a transform. The `fogBand` texture tiles seamlessly
// (whole sine cycles), so wrapping x by its width is invisible. Each sprite is
// `_fogSpeed` px/s; the scene advances `x` in its W2 update (pooled, no realloc).
export function addFogBand(scene) {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const TW = 512; // fogBand texture width == the seamless wrap period
  const mk = (yOff, alpha, speed) => {
    const ts = scene.add
      .tileSprite(0, H - 96 + yOff, W + TW, 96, "fogBand")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(alpha)
      .setDepth(DEPTH.bg - 4);
    ts._fogSpeed = speed;
    ts._fogOff = 0;
    ts._fogWrap = TW;
    return ts;
  };
  return [mk(18, 0.42, 7), mk(0, 0.36, -12)];
}

// W2 drips from ceiling pipe joints: one pooled emitter, capped at 8 alive. Emit
// points are fixed world positions (deterministic) fed in the scene's W2 update.
export function addDrips(scene) {
  const em = scene.add
    .particles(0, 0, "px", {
      speedX: { min: -4, max: 4 },
      speedY: { min: 20, max: 40 },
      gravityY: 520,
      scale: { start: 0.5, end: 0.18 },
      alpha: { start: 0.5, end: 0 },
      lifespan: 900,
      quantity: 1,
      frequency: -1, // manual emitParticleAt only
      maxAliveParticles: 8,
      tint: 0x8fd8ff,
      blendMode: Phaser.BlendModes.ADD,
    })
    .setDepth(DEPTH.bg - 3);
  return em;
}

// 2-3 slow dust-shaft light beams for tall rooms. Angled, additive, very low
// alpha, gentle drift via a shared-per-beam tween (no per-frame work).
export function addDustShafts(scene, world) {
  const beams = [];
  const layout = [
    { fx: 0.28, angle: 16 },
    { fx: 0.68, angle: -13 },
  ];
  // GFX6 L2 temperature audit: the dust-shaft beams + cones baked NEUTRAL white read
  // slightly cold against every world's ambient temperature. Tint them to the world
  // LIGHT TEMPERATURE (W1 warm amber, W2 aqua-green, W3 gold, W4 cold blue) so the
  // raw light shafts cohere with the world. WebGL-only (addDustShafts is only called
  // on the WebGL tier), so the Canvas reference tier is byte-identical (R1).
  const LIGHT_TEMP = { 1: 0xffcf8f, 2: 0x8fe8d0, 3: 0xffe088, 4: 0xbcd0ff };
  const temp = LIGHT_TEMP[world] || 0xffffff;
  for (const b of layout) {
    const img = scene.add
      .image(b.fx * scene.worldW, scene.worldH * 0.4, "dustShaft")
      .setScrollFactor(0.3)
      .setAngle(b.angle)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(world === 2 ? 0.06 : 0.09)
      .setDepth(DEPTH.bg - 2);
    if (isWebGL(scene)) img.setTint(temp); // world light-temperature (WebGL only)
    scene.tweens.add({
      targets: img,
      x: img.x + 26,
      alpha: img.alpha * 0.55,
      duration: 5200 + b.fx * 1800,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });
    beams.push(img);
    // GFX3 G3: a static soft light cone under each shaft source — narrow apex at
    // the beam origin, fanning downward. WebGL-gated (R1) and only when the bake
    // ran; additive, alpha 0.05-0.12, below terrain (DEPTH.bg-2, with the shaft).
    if (isWebGL(scene) && scene.textures.exists("lightCone")) {
      scene.add
        .image(img.x, scene.worldH * 0.4 - 120, "lightCone")
        .setOrigin(0.5, 0)
        .setScrollFactor(0.3)
        .setAngle(b.angle)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.09)
        .setTint(temp) // GFX6 L2: world light-temperature (this branch is already WebGL-gated)
        .setDepth(DEPTH.bg - 2);
    }
  }
  return beams;
}

// Soft vignette framing the backdrop edges, built from four thin border bands
// (top/bottom/left/right) of the 1-D `vignEdge` gradient rather than one full
// quad — so it composites only the darkened border, not a mostly-transparent
// full screen (a real Canvas fill-rate win). Screen-fixed, alpha capped at 0.22,
// depth bg-1: darkens the backdrop edges, never the players/HUD/bubbles above.
export function addVignette(scene) {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const A = 0.22;
  const bw = Math.round(Math.max(W, H) * 0.16); // band depth (fraction of the long edge)
  const over = 1.35; // length overscan so a zoom-out never reveals a gap along an edge
  const mk = (x, y, ox, oy, len, angle) =>
    scene.add
      .image(x, y, "vignEdge")
      .setOrigin(ox, oy)
      .setAngle(angle)
      .setDisplaySize(len, bw)
      .setScrollFactor(0)
      .setAlpha(A)
      .setDepth(DEPTH.bg - 1);
  // top & bottom span the width; left & right span the height (rotated). The
  // gradient's opaque edge (texture y=0, origin along that edge) hugs the screen
  // border; corners overlap and darken a touch more, as a vignette should.
  return [
    mk(W / 2, 0, 0.5, 0, W * over, 0),        // top: opaque at screen top
    mk(W / 2, H, 0.5, 0, W * over, 180),      // bottom: rotate 180 so opaque hugs bottom
    mk(0, H / 2, 0.5, 0, H * over, 90),        // left: rotate 90, opaque hugs left
    mk(W, H / 2, 0.5, 0, H * over, -90),       // right: opaque hugs right
  ];
}
