// Procedural per-world emblem glyphs, drawn straight into a Phaser Graphics with
// primitive fills/strokes — canvas-safe (no setTint, which is a WebGL-only no-op
// under ?canvas=1). One glyph per world, coloured by the world accent:
//   1 Assembly Wing  → open-end wrench
//   2 Maintenance    → spiral vent
//   3 Magnet Works   → horseshoe magnet
//   4 The Dark Core  → eclipsed dark core
// Reused by the hub sector map (GFX P2) and the level intro banner (GFX P9), so
// it lives standalone: the caller supplies the Graphics + centre + size + colour;
// the helper sets its own line/fill styles and draws centred on (cx, cy).
export function drawWorldIcon(g, world, cx, cy, size, color) {
  const r = size / 2;
  const lw = Math.max(2, size * 0.12);
  switch (world) {
    case 1: return wrench(g, cx, cy, r, lw, color);
    case 2: return spiralVent(g, cx, cy, r, lw, color);
    case 3: return magnet(g, cx, cy, r, lw, color);
    default: return darkCore(g, cx, cy, r, lw, color);
  }
}

function wrench(g, cx, cy, r, lw, color) {
  g.lineStyle(lw, color, 1);
  // diagonal shaft (NE handle → SW head)
  g.lineBetween(cx - r * 0.5, cy + r * 0.5, cx + r * 0.28, cy - r * 0.28);
  // open C jaw at the head end (gap facing out, NE)
  g.beginPath();
  g.arc(cx + r * 0.46, cy - r * 0.46, r * 0.4, Math.PI * 0.12, Math.PI * 1.55, false);
  g.strokePath();
  // hanging hole at the handle end
  g.lineStyle(Math.max(1.5, lw * 0.7), color, 1);
  g.strokeCircle(cx - r * 0.55, cy + r * 0.55, r * 0.16);
}

function spiralVent(g, cx, cy, r, lw, color) {
  // vent rim
  g.lineStyle(Math.max(1.5, lw * 0.6), color, 0.85);
  g.strokeCircle(cx, cy, r * 0.92);
  // inward spiral (built once — ~2.6 turns)
  g.lineStyle(Math.max(2, lw * 0.8), color, 1);
  g.beginPath();
  const turns = 2.6, steps = 46;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * Math.PI * 2 * turns;
    const rr = (1 - t) * r * 0.78;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.strokePath();
}

function magnet(g, cx, cy, r, lw, color) {
  const t = lw * 1.4; // band thickness
  const R = r * 0.6;
  const topY = cy - r * 0.15;
  const botY = cy + r * 0.62;
  g.lineStyle(t, color, 1);
  // horseshoe arc — top half, open downward
  g.beginPath();
  g.arc(cx, topY, R, Math.PI, Math.PI * 2, false);
  g.strokePath();
  // legs
  g.lineBetween(cx - R, topY, cx - R, botY);
  g.lineBetween(cx + R, topY, cx + R, botY);
  // pole caps (bright tips)
  g.fillStyle(0xffffff, 0.9);
  g.fillRect(cx - R - t / 2, botY - 2, t, 5);
  g.fillRect(cx + R - t / 2, botY - 2, t, 5);
}

function darkCore(g, cx, cy, r, lw, color) {
  // soft corona glow
  g.fillStyle(color, 0.16).fillCircle(cx, cy, r * 0.95);
  // dark body
  g.fillStyle(0x0a0e1a, 1).fillCircle(cx, cy, r * 0.68);
  // bright accent rim
  g.lineStyle(Math.max(2, lw * 0.8), color, 1).strokeCircle(cx, cy, r * 0.68);
  // core spark
  g.fillStyle(color, 1).fillCircle(cx, cy, r * 0.16);
  // corona ticks
  g.lineStyle(Math.max(1.5, lw * 0.5), color, 0.9);
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i;
    g.lineBetween(
      cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78,
      cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95,
    );
  }
}
