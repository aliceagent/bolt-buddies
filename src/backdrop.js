import Phaser from "phaser";
import { DEPTH } from "./constants.js";

// Shared layered-background helpers so the Title, Hub and Game screens all wear
// the same procedural depth treatment. Everything sits below `DEPTH.terrain` and
// is created once (no per-frame allocation).

// Fixed vertical gradient, sized 2x the viewport and centred so camera zoom-out
// never reveals an edge. The `bgGradient` texture is a white->transparent alpha
// ramp; tinting it `theme.bgTop` over a `theme.bgBottom` camera background gives
// a real two-colour gradient per world (any uncovered area is bgBottom too).
export function addGradient(scene, theme) {
  const W = scene.scale.width;
  const H = scene.scale.height;
  scene.cameras.main.setBackgroundColor(theme.bgBottom);
  return scene.add
    .image(W / 2, H / 2, "bgGradient")
    .setDisplaySize(W * 2, H * 2)
    .setScrollFactor(0)
    .setTint(theme.bgTop)
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
      tint,
      blendMode: Phaser.BlendModes.ADD,
    })
    .setScrollFactor(0)
    .setDepth(DEPTH.bg - 6);
}
