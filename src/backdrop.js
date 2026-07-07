import Phaser from "phaser";
import { DEPTH, WORLD_THEMES } from "./constants.js";

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
  const key = world === 2 ? "propStrip2" : "propStrip1"; // unknown worlds inherit W1
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
  for (const b of layout) {
    const img = scene.add
      .image(b.fx * scene.worldW, scene.worldH * 0.4, "dustShaft")
      .setScrollFactor(0.3)
      .setAngle(b.angle)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(world === 2 ? 0.06 : 0.09)
      .setDepth(DEPTH.bg - 2);
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
