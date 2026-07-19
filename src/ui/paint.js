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

// --- glassPanel ---------------------------------------------------------------
// The shared HUD/overlay "frosted glass" recipe as a pure-draw helper: a
// translucent fill → a baked diagonal sheen glaze → a 1.5px near-white top-edge
// highlight lip → an optional soft outer accent glow ring → the accent border on
// top (so it stays crisp). Geometry only — the caller owns any text/children.
// Mirrors ui/kit.js neonPanel but WITHOUT a header bar, so HUD plates, the mute
// panel and GameScene's drawn cards all share one glass language. Defaults lean
// on the dark HUD backing (COLORS.hudBg) since these plates sit over gameplay.
export function glassPanel(g, spec) {
  const {
    x, y, w, h, r = 10, fill = COLORS.hudBg, fillA = 0.82,
    accent = COLORS.neon, borderW = 2, borderA = 0.9,
    glow = true, glowW = 6, glowA = 0.16, glowInf = 3,
    highlight = true, sheenA = 0.05,
  } = spec;
  g.fillStyle(fill, fillA).fillRoundedRect(x, y, w, h, r);
  if (sheenA > 0) sheen(g, { x, y, w, h, a: sheenA });
  if (highlight) g.lineStyle(1.5, GLASS_HI, 0.1).lineBetween(x + r, y + 1.5, x + w - r, y + 1.5);
  if (glow) g.lineStyle(glowW, accent, glowA).strokeRoundedRect(x - glowInf, y - glowInf, w + glowInf * 2, h + glowInf * 2, r + glowInf);
  g.lineStyle(borderW, accent, borderA).strokeRoundedRect(x, y, w, h, r);
}

// --- iconChip -----------------------------------------------------------------
// The subtle frosted-glass backing behind a 26×26 skill glyph (V5 HUD icons): a
// dark translucent rounded chip → a diagonal sheen glaze → a thin top-edge lip →
// a thin same-accent border, so the small glowing glyph reads on any background
// while staying crisp at HUD size. Draw the glyph (with its own glow) on top.
export function iconChip(g, accent, opts = {}) {
  const { s = 26, r = 6, m = 1.5, fillA = 0.42, borderA = 0.55 } = opts;
  const iw = s - m * 2;
  g.fillStyle(0x0c1220, fillA).fillRoundedRect(m, m, iw, iw, r);
  sheen(g, { x: m, y: m, w: iw, h: iw, a: 0.06 });
  g.lineStyle(1, GLASS_HI, 0.12).lineBetween(m + r, m + 1, s - m - r, m + 1);
  g.lineStyle(1.5, accent, borderA).strokeRoundedRect(m, m, iw, iw, r);
}

// A small soft radial glow behind a glyph feature (fakeRadial tuned for the tiny
// 26px icons — one call, low centre alpha so it lifts the glyph without haze).
export function iconGlow(g, x, y, r, color, a = 0.22) {
  fakeRadial(g, { x, y, r, color, steps: 4, aCenter: a, aEdge: 0 });
}

// --- ditherRect ---------------------------------------------------------------
// GFX3 G2: sparse mono de-banding speckle, stamped OVER a finished soft-gradient
// fill inside a bake step. 1×1px dots, ~1 per 24px² of area, exactly half white /
// half black at alpha ~0.03, scattered uniformly. Math.random is fine here —
// every caller is a boot-once texture bake (generateTexture), so this is
// visual-only and NEVER runs per frame (R3). Turns Canvas-2D gradient banding
// into grain that must stay INVISIBLE as texture at 100% zoom: tune the density
// or alpha DOWN before up if a screenshot shows the speckle as noise.
export function ditherRect(g, w, h) {
  const n = Math.round((w * h) / 24);
  for (let i = 0; i < n; i++) {
    g.fillStyle(i & 1 ? 0xffffff : 0x000000, 0.03);
    g.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, 1, 1);
  }
}

// Re-export the near-white glass highlight tone so kit/paint consumers share it.
export const GLASS_HI = COLORS.glassHi != null ? COLORS.glassHi : 0xffffff;
