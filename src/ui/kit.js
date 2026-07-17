import Phaser from "phaser";
import { COLORS, WORLD_THEMES, FONT, FS, TEXT } from "../constants.js";
import { addGradient, addMotes } from "../backdrop.js";
import { sheen, GLASS_HI } from "./paint.js";

// GFX P10 — shared menu / overlay drawing kit.
//
// Title, Settings and Pause all wear the same title-screen standard: the layered
// gradient + motes + silhouette-strip backdrop, panels with an accent header bar
// and a soft outer glow, key-cap value hints, and a selected-row chevron + glow.
// Those primitives live here so the three screens stay in lockstep (change once,
// all three follow). Everything is DRAWN/procedural, canvas-safe (no tint-only
// meaning), and allocation-free at rest (helpers build objects once at create).

export const hexStr = (n) => "#" + (n & 0xffffff).toString(16).padStart(6, "0");

// Scale an 0xRRGGBB colour's channels by f (used for the very-dark accent fill
// behind a selected row — a hued shadow of the accent, e.g. amber -> 0x2a2010).
export function mulColor(hex, f) {
  const r = Math.round(((hex >> 16) & 255) * f);
  const g = Math.round(((hex >> 8) & 255) * f);
  const b = Math.round((hex & 255) * f);
  return (r << 16) | (g << 8) | b;
}

// Distant lab-skyline silhouette strip (+ optional blinking antenna tips). The
// image baseline sits at `y` (origin bottom-centre); tips are given in the
// texture's own [x, yFromTop] space (baseline 300 tall) so they land on the
// building tips exactly as on the title screen.
export function addSkyline(scene, opts = {}) {
  const W = scene.scale.width;
  const { y = scene.scale.height - 70, alpha = 0.5, depth = -5, tips = [] } = opts;
  const img = scene.add.image(W / 2, y, "labskyline").setOrigin(0.5, 1).setDepth(depth).setAlpha(alpha);
  tips.forEach(([tx, ty, col], i) => {
    const wy = y - (300 - ty);
    const dot = scene.add.graphics({ x: tx, y: wy }).setDepth(depth + 1);
    dot.fillStyle(col, 0.9).fillCircle(0, 0, 2.4);
    dot.fillStyle(col, 0.25).fillCircle(0, 0, 5);
    dot.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2);
    scene.tweens.add({
      targets: dot, alpha: { from: 0.2, to: 1 }, duration: 620 + i * 140,
      yoyo: true, repeat: -1, hold: 120, repeatDelay: 300 + i * 260, ease: "sine.inOut",
    });
  });
  return img;
}

// Full title-standard backdrop: gradient + near grid + motes + skyline strip.
export function menuBackdrop(scene, world = 1) {
  const W = scene.scale.width;
  const H = scene.scale.height;
  addGradient(scene, world);
  scene.add.tileSprite(0, 0, W, H, "bggrid").setOrigin(0).setAlpha(0.22).setDepth(-8);
  addMotes(scene, WORLD_THEMES[world].accent2);
  addSkyline(scene, { y: H - 70, alpha: 0.42, tips: [[230, 64, 0xff6a52], [700, 50, 0xffc24d], [1050, 84, 0xff6a52]] });
}

// GFX2 "Lumen Lab" — frosted-glass panel (the shared menu-panel look). Draws into
// an existing Graphics `g` at top-left (x, y). Recipe: a lower-alpha COLORS.panel
// fill (glassy, not opaque) → a baked diagonal sheen band → a 1.5px inner white
// top-edge highlight (the glass lip catching the light) → the 2px accent border →
// the accent header bar → the soft outer glow ring. All canvas-safe. The signature
// and defaults stay compatible — every consumer (Title footer, Pause, Settings,
// Walkthrough) inherits the glass for free.
export function neonPanel(g, x, y, w, h, opts = {}) {
  const {
    accent = COLORS.amber, radius = 14, fillAlpha = 0.82,
    header = true, headerH = 6, glow = true, edge = COLORS.panelEdge,
  } = opts;
  // glassy fill
  g.fillStyle(COLORS.panel, fillAlpha).fillRoundedRect(x, y, w, h, radius);
  // baked diagonal glass sheen (very low alpha — a glaze, not a stripe)
  sheen(g, { x, y, w, h, a: 0.05 });
  // inner top-edge highlight: a 1.5px white lip just inside the top border
  g.lineStyle(1.5, GLASS_HI, 0.1).lineBetween(x + radius, y + 1.5, x + w - radius, y + 1.5);
  // accent border
  g.lineStyle(2, edge, 1).strokeRoundedRect(x, y, w, h, radius);
  if (header) {
    g.fillStyle(accent, 0.9).fillRoundedRect(x, y, w, headerH, { tl: radius, tr: radius, bl: 0, br: 0 });
  }
  if (glow) {
    g.lineStyle(7, accent, 0.14).strokeRoundedRect(x - 4, y - 4, w + 8, h + 8, radius + 3);
  }
}

// Selected-row treatment drawn into a per-row Graphics `g` (cleared each call):
// a hued-dark fill, accent border, soft glow ring, and a left chevron. Nothing is
// drawn for an unselected row (the row just reads on the backdrop). Canvas-safe.
export function drawRowSelect(g, cx, cy, w, h, accent, on, radius = 10) {
  g.clear();
  if (!on) return;
  const x = cx - w / 2, y = cy - h / 2;
  // GFX2 "Lumen Lab" glass polish (V7): warm hued-glass fill → a diagonal sheen
  // glaze → a 1.5px near-white top-edge lip, THEN the crisp accent border + soft
  // outer glow ring on top (glass under, frame over). Settings + Pause inherit.
  g.fillStyle(mulColor(accent, 0.16), 0.92).fillRoundedRect(x, y, w, h, radius);
  sheen(g, { x, y, w, h, a: 0.05 });
  g.lineStyle(1.5, GLASS_HI, 0.1).lineBetween(x + radius, y + 1.5, x + w - radius, y + 1.5);
  g.lineStyle(2, accent, 0.95).strokeRoundedRect(x, y, w, h, radius);
  g.lineStyle(6, accent, 0.16).strokeRoundedRect(x - 3, y - 3, w + 6, h + 6, radius + 2);
  // left-edge chevron
  const chx = x + 18;
  g.fillStyle(accent, 1).fillTriangle(chx - 5, cy - 6, chx - 5, cy + 6, chx + 5, cy);
}

// A rounded key-cap chip: reuses the `keycap` texture for single glyphs, and a
// matching drawn wide cap for word keys. Coloured border + letter. (Moved here
// from TitleScene so Settings/Pause hint rows share the exact chip.)
export function keyCap(scene, x, y, label, colNum, colStr) {
  const cont = scene.add.container(x, y);
  if (label.length <= 1) {
    const cap = scene.add.image(0, 0, "keycap");
    const bdr = scene.add.graphics();
    bdr.lineStyle(2.5, colNum, 1).strokeRoundedRect(-17, -17, 34, 34, 8);
    const t = scene.add.text(0, -1, label, {
      fontFamily: FONT, fontSize: FS.head, fontStyle: "bold", color: colStr,
    }).setOrigin(0.5);
    cont.add([cap, bdr, t]);
    cont.capW = 34;
  } else {
    const w = 18 + label.length * 9;
    const g = scene.add.graphics();
    g.fillStyle(0x0a0f1e, 0.96).fillRoundedRect(-w / 2, -17, w, 34, 8);
    g.fillStyle(0x1a2338, 0.95).fillRoundedRect(-w / 2 + 2, -16, w - 4, 26, 7);
    g.fillStyle(0xffffff, 0.08).fillRoundedRect(-w / 2 + 4, -14, w - 8, 8, 4);
    g.lineStyle(2.5, colNum, 1).strokeRoundedRect(-w / 2, -17, w, 34, 8);
    const t = scene.add.text(0, -1, label, {
      fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: colStr,
    }).setOrigin(0.5);
    cont.add([g, t]);
    cont.capW = w;
  }
  return cont;
}

// Lay out a centred row mixing key-cap chips ({k}) and small labels ({t}).
// (Moved here from TitleScene — shared by every menu footer/hint row.)
export function chipRow(scene, cx, y, items, colNum, colStr) {
  const GAP = 6;
  const parts = items.map((it) => ({
    ...it, w: it.t ? it.t.length * 7 + 6 : (it.k.length > 1 ? 18 + it.k.length * 9 : 34),
  }));
  const total = parts.reduce((s, p) => s + p.w, 0) + GAP * (parts.length - 1);
  let x = cx - total / 2;
  for (const p of parts) {
    const mid = x + p.w / 2;
    if (p.t) {
      scene.add.text(mid, y, p.t, { fontFamily: FONT, fontSize: FS.mini, color: TEXT.dim }).setOrigin(0.5);
    } else {
      keyCap(scene, mid, y, p.k, colNum, colStr);
    }
    x += p.w + GAP;
  }
}

// --- maskless iris wipe -------------------------------------------------------
// A KOBI iris transition drawn WITHOUT a mask: a single very-thick black ring
// whose inner radius is `r`. With a thickness larger than the screen diagonal the
// stroke fills everything OUTSIDE radius `r`, so shrinking `r` closes the iris to
// black and growing it opens back to the scene. Identical on Canvas + WebGL, one
// strokeCircle per frame (cheap), zero allocations after the Graphics is made.
export function drawIris(g, cx, cy, r) {
  const D = 1700; // > the 1280x720 diagonal (~1468): the stroke reaches every corner
  g.clear();
  g.lineStyle(D, 0x040614, 1);
  g.strokeCircle(cx, cy, Math.max(0, r) + D / 2);
}

// Radius that fully clears the screen from (cx, cy): the farthest corner + margin.
export function irisMaxR(scene, cx, cy) {
  const W = scene.scale.width, H = scene.scale.height;
  const dx = Math.max(cx, W - cx), dy = Math.max(cy, H - cy);
  return Math.hypot(dx, dy) + 24;
}
