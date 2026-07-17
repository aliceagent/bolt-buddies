import { COLORS } from "../constants.js";

// GFX2 "Lumen Lab" — shared drawing-recipe library.
//
// Pure draw helpers: every function paints into a Graphics `g` you already own
// and returns nothing. That makes them usable ANYWHERE a `g` exists — BootScene
// make() bake callbacks, GameScene ensure* lazy bakers, and live scene draws —
// so the same soft-shade / glow / glass recipes stay identical across sprites,
// terrain, machinery and UI. Canvas-safe by construction: no fillGradientStyle,
// no setTint, no masks. Shading is done with alpha strips and darker/lighter
// same-hue overlays so it reads the same under ?canvas=1 and WebGL.
//
// Dependency-free except COLORS (for tasteful highlight defaults).

// --- colour math (local, allocation-free) ------------------------------------
// Scale an 0xRRGGBB colour's channels by f (f<1 darkens, f>1 lightens+clamps).
function scale(hex, f) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}
// Blend an 0xRRGGBB colour toward white by t (0 = hue, 1 = white).
function toWhite(hex, t) {
  const r = Math.round(((hex >> 16) & 255) + (255 - ((hex >> 16) & 255)) * t);
  const g = Math.round(((hex >> 8) & 255) + (255 - ((hex >> 8) & 255)) * t);
  const b = Math.round((hex & 255) + (255 - (hex & 255)) * t);
  return (r << 16) | (g << 8) | b;
}

// --- softBody -----------------------------------------------------------------
// A rounded form with Canvas-safe 4-tone shading: base fill → darker under-shade
// hugging the bottom third → lighter top-light band → a thin same-hue outline
// (never black) to keep the form crisp on busy backgrounds. shadeLo/shadeHi are
// optional — derived from `base` if omitted. Draw specular()/glow on top after.
export function softBody(g, spec) {
  const {
    x, y, w, h, r = 8, base,
    shadeLo = scale(base, 0.62), // under-shade tone
    shadeHi = toWhite(base, 0.28), // top-light tone
    outline = scale(base, 0.5), // same-hue crisping edge
    outlineA = 0.9,
  } = spec;
  // 1) base fill
  g.fillStyle(base, 1).fillRoundedRect(x, y, w, h, r);
  // 2) bottom under-shade (bottom ~42%, bottom corners rounded, top edge square)
  const uh = h * 0.42;
  g.fillStyle(shadeLo, 0.55).fillRoundedRect(x, y + h - uh, w, uh, { tl: 0, tr: 0, bl: r, br: r });
  // 3) top light band (top ~34%, top corners rounded, low alpha so it's a sheen)
  const th = h * 0.34;
  g.fillStyle(shadeHi, 0.5).fillRoundedRect(x, y, w, th, { tl: r, tr: r, bl: 0, br: 0 });
  // 4) thin same-hue outline
  g.lineStyle(1.5, outline, outlineA).strokeRoundedRect(x, y, w, h, r);
}

// --- specular -----------------------------------------------------------------
// A small near-white highlight sitting on a soft form. Pass w/h for a filled
// ellipse (a glossy dab); pass r for a thin rounded-stroke glint. Keep it small.
export function specular(g, spec) {
  const { x, y, w, h, r, a = 0.7, color = 0xffffff } = spec;
  if (w != null && h != null) {
    g.fillStyle(color, a).fillEllipse(x, y, w, h);
  } else {
    g.lineStyle(1.5, color, a).strokeRoundedRect(x - (r || 4), y - (r || 4), (r || 4) * 2, (r || 4) * 2, r || 4);
  }
}

// --- fakeRadial ---------------------------------------------------------------
// A soft radial glow faked as concentric alpha steps (the hub-node trick, now
// standard). Alpha ramps from aEdge at radius r inward to aCenter at the middle.
export function fakeRadial(g, spec) {
  const { x, y, r, color, steps = 5, aCenter = 0.5, aEdge = 0.06 } = spec;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1); // 0 = outer ring, 1 = centre
    const rad = r * (1 - t);
    g.fillStyle(color, aEdge + (aCenter - aEdge) * t);
    g.fillCircle(x, y, rad);
  }
}

// --- glowShape / halo ---------------------------------------------------------
// The 2-3 layer baked halo: a bright core stroke + inflated low-alpha echoes, so
// lenses/LEDs/coils/lamps read as lit. Generic form takes your own draw closure;
// haloRect/haloCircle cover the common rounded-rect / circle cases. `layers` are
// [{ inflate, alpha }] outward echoes (default: the plan's 2-3px .25 / 5-6px .10).
export function glowShape(g, spec, drawFn) {
  const { color, coreWidth = 2, coreA = 0.9, layers = [{ inflate: 3, alpha: 0.25 }, { inflate: 6, alpha: 0.1 }] } = spec;
  // outward echoes first (widest, faintest), then the bright core on top
  for (let i = layers.length - 1; i >= 0; i--) {
    g.lineStyle(coreWidth + layers[i].inflate, color, layers[i].alpha);
    drawFn(g, layers[i].inflate);
  }
  g.lineStyle(coreWidth, color, coreA);
  drawFn(g, 0);
}

export function haloRect(g, spec) {
  const { x, y, w, h, r = 8 } = spec;
  glowShape(g, spec, (gg, inf) => gg.strokeRoundedRect(x - inf, y - inf, w + inf * 2, h + inf * 2, r + inf));
}

export function haloCircle(g, spec) {
  const { x, y, r } = spec;
  glowShape(g, spec, (gg, inf) => gg.strokeCircle(x, y, r + inf));
}

// --- sheen --------------------------------------------------------------------
// A subtle diagonal glass sheen band for a panel: a low-alpha white parallelogram
// sweeping from the top-left toward the middle. Approximated (no masks) as a
// slanted quad sized to sit inside the panel area {x,y,w,h}; `a` stays tiny (~.05)
// so it reads as a light glaze, not a stripe. Clipped by geometry, not a mask.
export function sheen(g, spec) {
  const { x, y, w, h, a = 0.05, color = 0xffffff } = spec;
  const bandW = w * 0.34; // width of the light band at the top edge
  const skew = h * 0.55; // horizontal run of the diagonal over the panel height
  const x0 = x + w * 0.1;
  g.fillStyle(color, a).fillPoints(
    [
      { x: x0, y: y },
      { x: x0 + bandW, y: y },
      { x: x0 + bandW - skew, y: y + h },
      { x: x0 - skew, y: y + h },
    ],
    true,
  );
}

// --- ringGlow -----------------------------------------------------------------
// A stroked accent ring plus two inflated low-alpha echoes — the halo tuned for
// circular rims (lenses, sockets, mood rings). `width` is the bright ring; echoes
// scale off it. Same recipe as haloCircle but framed around an existing ring.
export function ringGlow(g, spec) {
  const { x, y, r, color, width = 3 } = spec;
  g.lineStyle(width + 6, color, 0.08).strokeCircle(x, y, r);
  g.lineStyle(width + 3, color, 0.18).strokeCircle(x, y, r);
  g.lineStyle(width, color, 0.9).strokeCircle(x, y, r);
}

// Re-export the near-white glass highlight tone so kit/paint consumers share it.
export const GLASS_HI = COLORS.glassHi != null ? COLORS.glassHi : 0xffffff;
