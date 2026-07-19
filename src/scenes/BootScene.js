import Phaser from "phaser";
import { COLORS, WORLD_THEMES, PARTICLES } from "../constants.js";
import { softBody, specular, sheen, haloCircle, ringGlow, fakeRadial, glowShape, iconChip, iconGlow, ditherRect, isWebGL } from "../ui/paint.js";

// Every texture in the game is generated here with Graphics — zero asset files.
export default class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create() {
    const make = (key, w, h, draw) => {
      const g = this.make.graphics({ add: false });
      draw(g, w, h);
      g.generateTexture(key, w, h);
      g.destroy();
    };

    // --- terrain -----------------------------------------------------------
    // P4: per-world tile TRIM so worlds differ up close (geometry/collision are
    // untouched — this is a texture swap only; GameScene picks `tile<world>`).
    // Shared quiet two-tone bevel base + a per-world corner-fastener + seam pass.
    // A tiny hex-bolt helper (flat-top hexagon, dark seat + lit cap) for W2+.
    // GFX2 "Lumen Lab" rounded-plate terrain. Each 48×48 tile is a soft-shaded
    // rounded plate (softBody: base → deep under-shade → top-light strip → same-
    // hue outline) floating inside a uniform dark "mortar" gap. SEAMLESSNESS: the
    // plate is inset ~1.5px on every side, so every EDGE pixel (x=0/47, y=0/47) is
    // pure gap tone — identical on all four sides. Tiling in horizontal runs OR
    // vertical wall stacks therefore meets gap-to-gap with no discontinuity (the
    // grooves between plates are symmetric, ~3px). All interior detail is kept
    // ≥6px from the plate edge so nothing ever approaches a tile boundary.
    // Per-world palette from the enriched WORLD_THEMES (see plan §1).
    const TILE = {
      1: { base: 0x4c4a58, gap: 0x191822, warm: COLORS.warmth || 0xffcf8f }, // warm steel
      2: { base: 0x2c554e, gap: 0x0d211d },                                  // teal plate
      3: { base: 0x472f52, gap: 0x1a1322 },                                  // plum
      4: { base: 0x262a4c, gap: 0x0c0d1c },                                  // indigo night
    };
    // A plain steel rivet (dark seat + lit cap + tiny spec) for W1/W2 plates.
    const rivet = (g, x, y, cap, seat) => {
      g.fillStyle(seat, 0.85).fillCircle(x, y, 2.4);
      g.fillStyle(cap, 1).fillCircle(x, y, 1.4);
      g.fillStyle(0xffffff, 0.5).fillCircle(x - 0.6, y - 0.6, 0.7);
    };
    // A glowing energised dot (halo + hot core) for W3/W4 rivets.
    const glowDot = (g, x, y, color, r = 2) => {
      g.fillStyle(color, 0.14).fillCircle(x, y, r + 3.5);
      g.fillStyle(color, 0.34).fillCircle(x, y, r + 1.6);
      g.fillStyle(color, 1).fillCircle(x, y, r);
      g.fillStyle(0xffffff, 0.85).fillCircle(x - 0.5, y - 0.5, r * 0.45);
    };
    const tileTex = (world) => (g) => {
      const c = TILE[world];
      // uniform dark gap on every edge -> seamless tiling in any direction
      g.fillStyle(c.gap, 1).fillRect(0, 0, 48, 48);
      // rounded plate with baked 4-tone soft shading (inset 1.5px all round)
      softBody(g, { x: 1.5, y: 1.5, w: 45, h: 45, r: 7, base: c.base });
      // a small glassy top-left sheen dab — the Lumen "lit plate" read
      specular(g, { x: 15, y: 13, w: 12, h: 5, a: 0.16 });
      if (world === 1) {
        // warm steel: warm top glaze + four steel rivets
        g.fillStyle(c.warm, 0.08).fillRoundedRect(3, 3, 42, 12, { tl: 6, tr: 6, bl: 0, br: 0 });
        const cap = 0x6b6a7c, seat = 0x2a2935;
        [11, 37].forEach((x) => [11, 37].forEach((y) => rivet(g, x, y, cap, seat)));
      } else if (world === 2) {
        // teal maintenance plate: two faint vertical pipe-seams + brass corner bolts
        g.lineStyle(1, 0x173d38, 0.6).lineBetween(18, 8, 18, 40);
        g.lineStyle(1, 0x3c7a70, 0.4).lineBetween(19, 8, 19, 40);
        g.lineStyle(1, 0x173d38, 0.6).lineBetween(30, 8, 30, 40);
        g.lineStyle(1, 0x3c7a70, 0.4).lineBetween(31, 8, 31, 40);
        const brass = COLORS.brass, seat = 0x123029;
        [11, 37].forEach((x) => [11, 37].forEach((y) => rivet(g, x, y, brass, seat)));
      } else if (world === 3) {
        // plum plate: gold hazard hatch band across the middle + glowing gold dots
        const gold = 0xffd24d;
        g.lineStyle(2, gold, 0.5);
        for (let i = 10; i < 40; i += 7) g.lineBetween(i, 30, i + 6, 22);
        g.lineStyle(1, 0x2a1a33, 0.5);
        for (let i = 10; i < 40; i += 7) g.lineBetween(i + 3, 31, i + 9, 23);
        [11, 37].forEach((x) => [11, 37].forEach((y) => glowDot(g, x, y, gold, 1.8)));
      } else {
        // W4 indigo night: thin inset cyan seam + glowing cyan corner dots
        g.lineStyle(1, WORLD_THEMES[4].accent2, 0.32).strokeRoundedRect(8, 8, 32, 32, 5);
        [11, 37].forEach((x) => [11, 37].forEach((y) => glowDot(g, x, y, WORLD_THEMES[4].accent2, 1.7)));
      }
    };
    for (let w = 1; w <= 4; w++) make(`tile${w}`, 48, 48, tileTex(w));
    make("tile", 48, 48, tileTex(1)); // back-compat alias (== W1)
    // W2 underside drip-stain decal: a faint rust streak hanging from a ceiling
    // face (added deterministically under W2 platform undersides in GameScene).
    make("dripstain", 8, 18, (g) => {
      // smooth rust seep: pooled lip + tapering rounded streak + a hanging bead
      g.fillStyle(0x0a1410, 0.9).fillEllipse(4, 3, 7.5, 4.2); // pooled seep at the lip
      g.fillStyle(0x1a3a2c, 0.7).fillRoundedRect(3, 2, 2, 13, 1); // streak
      g.fillStyle(0x2c5a44, 0.4).fillRect(3.4, 3, 0.8, 10); // wet inner sheen
      g.fillStyle(0x0a1410, 0.7).fillCircle(4, 15.5, 1.8); // hanging bead / darker tail
    });
    // P4: grime/wear decal stamp set — scattered DETERMINISTICALLY on wall runs
    // by GameScene (seeded by level id). Baked opaque-ish; alpha (<=0.5) applied
    // at placement. All read as painted-on wear, never as interactive tiles.
    make("decal_oil", 44, 28, (g) => {
      // smooth oil slick: soft layered pool + cool sheen + a drip bead
      g.fillStyle(0x05070c, 1).fillEllipse(22, 17, 38, 17);
      g.fillStyle(0x070a12, 0.7).fillEllipse(11, 12, 16, 11).fillEllipse(35, 20, 14, 10);
      g.fillStyle(0x0b1120, 1).fillEllipse(24, 15, 21, 9); // inner sheen
      g.fillStyle(0x24365c, 0.45).fillEllipse(19, 12, 9, 3.4); // faint reflection
      g.fillStyle(0x35507e, 0.3).fillEllipse(17, 11, 4, 1.6); // bright glint
      g.fillStyle(0x05070c, 1).fillEllipse(21.5, 25, 3.4, 5); // rounded drip tail
    });
    make("decal_scuff", 40, 24, (g) => {
      // smooth curved scrape arcs (tapered) + a couple of lit rub-marks
      g.lineStyle(2.4, 0x090d16, 0.9);
      g.beginPath(); g.moveTo(4, 16); g.lineTo(12, 10); g.lineTo(21, 6); g.strokePath();
      g.lineStyle(2, 0x090d16, 0.85);
      g.beginPath(); g.moveTo(8, 19); g.lineTo(18, 13); g.lineTo(28, 9); g.strokePath();
      g.beginPath(); g.moveTo(13, 21); g.lineTo(24, 16); g.lineTo(34, 12); g.strokePath();
      g.lineStyle(1, 0x30436e, 0.4);
      g.beginPath(); g.moveTo(5, 15); g.lineTo(13, 9.5); g.lineTo(20, 6); g.strokePath();
      g.beginPath(); g.moveTo(15, 20); g.lineTo(25, 15); g.lineTo(33, 12); g.strokePath();
    });
    make("decal_chevron", 46, 22, (g) => {
      // rounded dark backing + glowing amber direction chevrons (meaning: flow dir)
      g.fillStyle(0x18130a, 0.85).fillRoundedRect(0, 0, 46, 22, 5);
      for (let x = -12; x < 46; x += 15) {
        // soft amber glow underlay
        g.fillStyle(COLORS.amber, 0.22);
        g.fillPoints([{ x: x - 1, y: 21 }, { x: x + 8, y: 1 }, { x: x + 14, y: 1 }, { x: x + 5, y: 21 }], true);
        g.fillStyle(COLORS.amber, 0.95);
        g.fillPoints([{ x: x, y: 20 }, { x: x + 8, y: 2 }, { x: x + 13, y: 2 }, { x: x + 5, y: 20 }], true);
        g.fillStyle(0xffe6bf, 0.6); // leading-edge highlight
        g.fillPoints([{ x: x + 8, y: 2 }, { x: x + 10, y: 2 }, { x: x + 5.5, y: 12 }, { x: x + 4, y: 12 }], true);
      }
      g.lineStyle(1, 0x0a0804, 0.6).strokeRoundedRect(0, 0, 46, 22, 5);
    });
    make("decal_vent", 40, 40, (g) => {
      // rounded steel vent frame + soft-shaded louver slats + corner screws
      softBody(g, { x: 2, y: 2, w: 36, h: 36, r: 6, base: 0x1a2438 });
      g.fillStyle(0x05080f, 1);
      for (let ly = 8; ly < 34; ly += 6) g.fillRoundedRect(7, ly, 26, 3, 1.5); // slat gaps
      g.fillStyle(0x2c3a58, 0.8);
      for (let ly = 8; ly < 34; ly += 6) g.fillRect(7, ly - 1.4, 26, 1.2); // lit slat lips
      g.fillStyle(0x2f3f66, 1);
      [8, 32].forEach((sx) => [8, 32].forEach((sy) => g.fillCircle(sx, sy, 1.8))); // corner screws
      g.fillStyle(0x8fa3d9, 0.5);
      [8, 32].forEach((sx) => [8, 32].forEach((sy) => g.fillCircle(sx - 0.5, sy - 0.5, 0.7)));
    });
    // KOBI "NO PETS" poster — a taped-up paper sign: red header band, a barred
    // dog silhouette, and KOBI's single cyan eye watching from the bottom.
    make("decal_poster", 34, 46, (g) => {
      // smooth taped paper sign: rounded card, red header, barred-dog motif, KOBI eye
      g.fillStyle(0xe8e2d0, 1).fillRoundedRect(1, 1, 32, 44, 3); // paper
      g.lineStyle(1, 0x8a8470, 1).strokeRoundedRect(1, 1, 32, 44, 3);
      g.fillStyle(0xc23a2e, 1).fillRoundedRect(1, 1, 32, 9, { tl: 3, tr: 3, bl: 0, br: 0 }); // red header
      g.fillStyle(0xe8e2d0, 1);
      for (let lx = 4; lx < 30; lx += 4) g.fillRoundedRect(lx, 4, 2, 4, 0.8); // "NO PETS" block letters
      // rounded dog silhouette (body + head + snout + legs + ear + tail)
      g.fillStyle(0x2a2a2a, 1);
      g.fillEllipse(16, 28, 15, 8.5); // body
      g.fillCircle(23, 24, 4.2); // head
      g.fillEllipse(26, 25, 4, 2.6); // snout
      g.fillTriangle(21, 20, 24, 21, 21.5, 24); // ear
      g.fillRoundedRect(8.5, 29, 3, 7, 1.4); g.fillRoundedRect(20.5, 29, 3, 7, 1.4); // legs
      g.fillTriangle(9, 26, 9, 30, 6, 25); // tail
      // red prohibition ring + slash
      g.lineStyle(3, 0xc23a2e, 1).strokeCircle(16, 28, 14);
      g.lineStyle(3, 0xc23a2e, 1).lineBetween(7, 19, 25, 37);
      // KOBI eye — baked neon halo glow watching from the bottom
      g.fillStyle(0x0b101f, 1).fillCircle(17, 41, 3);
      g.fillStyle(COLORS.neon, 0.22).fillCircle(17, 41, 4.5);
      g.fillStyle(COLORS.neon, 1).fillCircle(17, 41, 1.5);
      g.fillStyle(0xffffff, 0.85).fillCircle(16.4, 40.4, 0.6);
    });
    make("crack", 48, 48, (g) => {
      // GFX2: a fractured plate — same rounded-plate language as tiles (so it
      // reads as one of the floor) but split by glowing hairline cracks. The crack
      // POLYLINE is preserved exactly (it signals "breakable"). Dark gap edges keep
      // it seam-consistent with neighbouring plates.
      g.fillStyle(0x161022, 1).fillRect(0, 0, 48, 48);
      softBody(g, { x: 1.5, y: 1.5, w: 45, h: 45, r: 7, base: 0x352c46 });
      // hairline neon glow behind the cracks (accent) so kids read it as special
      g.lineStyle(4, COLORS.neon, 0.16);
      g.beginPath();
      g.moveTo(8, 6); g.lineTo(20, 20); g.lineTo(14, 34); g.lineTo(26, 44);
      g.moveTo(40, 4); g.lineTo(30, 18); g.lineTo(38, 30);
      g.moveTo(20, 20); g.lineTo(30, 18);
      g.strokePath();
      // dark crack lines on top
      g.lineStyle(2, 0x120e1c);
      g.beginPath();
      g.moveTo(8, 6); g.lineTo(20, 20); g.lineTo(14, 34); g.lineTo(26, 44);
      g.moveTo(40, 4); g.lineTo(30, 18); g.lineTo(38, 30);
      g.moveTo(20, 20); g.lineTo(30, 18);
      g.strokePath();
      // a few chipped flakes at the fracture nodes
      g.fillStyle(0x120e1c, 0.9).fillCircle(20, 20, 1.6).fillCircle(14, 34, 1.3).fillCircle(30, 18, 1.2);
    });
    make("belt", 48, 48, (g) => {
      // Smooth conveyor: full-width belt body + horizontal rails + edge-centred
      // rollers (a full roller forms at each tile boundary when tiled horizontally)
      // + glowing amber direction chevrons. All content is constant/mirror at the
      // vertical edges so horizontal runs tile with no seam.
      g.fillStyle(0x151b2c).fillRect(0, 0, 48, 48); // belt body
      g.fillStyle(0x0d1220).fillRect(0, 0, 48, 6).fillRect(0, 42, 48, 6); // top/bottom rail
      g.fillStyle(0x2a3550, 0.85).fillRect(0, 4.5, 48, 1.5); // rail lit lip
      g.fillStyle(0x090c16, 0.9).fillRect(0, 42, 48, 1.4); // rail under-shade
      // rollers centred on the tile boundary -> full wheel at each seam
      [0, 48].forEach((cx) => {
        g.fillStyle(0x232b45).fillCircle(cx, 24, 6.8);
        g.fillStyle(0x3a4568).fillCircle(cx, 24, 3.6);
        g.fillStyle(0x8fa3d9, 0.7).fillCircle(cx - 1.3, 22.6, 1.2);
      });
      // glowing amber chevrons pointing right (belt direction)
      [13, 30].forEach((x) => {
        g.fillStyle(COLORS.amber, 0.22);
        g.fillPoints([{ x: x - 1, y: 13 }, { x: x + 11, y: 24 }, { x: x - 1, y: 35 }, { x: x + 5, y: 24 }], true);
        g.fillStyle(COLORS.amber, 1);
        g.fillPoints([{ x, y: 14 }, { x: x + 10, y: 24 }, { x, y: 34 }, { x: x + 4, y: 24 }], true);
        g.fillStyle(0xffe6bf, 0.55);
        g.fillPoints([{ x: x + 4, y: 21 }, { x: x + 8, y: 24 }, { x: x + 4, y: 27 }, { x: x + 2.5, y: 24 }], true);
      });
    });
    make("hazard", 48, 48, (g) => {
      // Glowing red halo sawtooth (danger). The tooth POLYLINE (period 16px, 48 is
      // a multiple, endpoints equal at y=30) is preserved exactly so it tiles in
      // horizontal runs and keeps its "danger" read; a 2-layer red halo is baked
      // behind it and a hot top rim glows.
      g.fillStyle(0x1a0f18).fillRect(0, 24, 48, 24);
      const saw = (w, a) => {
        g.lineStyle(w, COLORS.hazard, a);
        g.beginPath();
        g.moveTo(0, 40);
        for (let x = 0; x <= 48; x += 8) g.lineTo(x, x % 16 === 0 ? 30 : 44);
        g.strokePath();
      };
      saw(9, 0.12); // outer halo
      saw(5, 0.22); // inner halo
      saw(3, 1); // hot core
      g.fillStyle(COLORS.hazard, 0.45).fillRect(0, 24, 48, 3); // hot top rim
      g.fillStyle(0xffd0d6, 0.7); // white-hot tips at the up-teeth
      for (let x = 0; x <= 48; x += 16) g.fillCircle(x, 30, 1.4);
    });
    // P4: hazard arc-spark (WebGL-only pooled emitter) — a hot pink-white ember
    // that ballistically jumps off a hazard strip. Additive at add time.
    make("hazspark", 8, 8, (g) => {
      g.fillStyle(0xff5566, 0.55).fillCircle(4, 4, 3.5);
      g.fillStyle(0xffe0e6, 0.95).fillCircle(4, 4, 1.6);
    });
    make("bridgetile", 48, 48, (g) => {
      // Holo-teal light bridge. ALL detail is horizontal (constant along x) so a
      // horizontal run tiles with no vertical seam. Translucent teal slab + neon
      // scan stripes + glowing top/bottom edge rails + a bright centre seam.
      g.fillStyle(0x0e2f38, 0.92).fillRect(0, 4, 48, 40); // teal holo slab
      g.fillStyle(COLORS.neon, 0.12);
      for (let y = 9; y < 44; y += 6) g.fillRect(0, y, 48, 2); // scan stripes (full width)
      // glowing top & bottom edge rails (halo layers, all full-width bands)
      [[5], [42]].forEach(([y]) => {
        g.fillStyle(COLORS.neon, 0.1).fillRect(0, y - 2, 48, 6);
        g.fillStyle(COLORS.neon, 0.28).fillRect(0, y - 1, 48, 4);
        g.fillStyle(COLORS.neon, 0.95).fillRect(0, y, 48, 2);
      });
      // bright central seam
      g.fillStyle(COLORS.neon, 0.5).fillRect(0, 23, 48, 2);
    });
    make("liftplat", 48, 20, (g) => {
      // Lift platform with an amber glowing top edge. Content is constant along x
      // (horizontal bands only) so it tiles horizontally with no seam.
      g.fillStyle(0x2a3350).fillRect(0, 0, 48, 20); // deck
      g.fillStyle(0x1b243c).fillRect(0, 13, 48, 7); // under-shade
      g.fillStyle(0x3a4568, 0.6).fillRect(0, 3, 48, 3); // top-light strip
      // amber glowing top edge (halo layers)
      g.fillStyle(COLORS.amber, 0.14).fillRect(0, 0, 48, 6);
      g.fillStyle(COLORS.amber, 0.32).fillRect(0, 0, 48, 3);
      g.fillStyle(COLORS.amber, 0.95).fillRect(0, 0, 48, 1.6);
      g.fillStyle(COLORS.amber, 0.4).fillRect(0, 18, 48, 2); // faint amber under-glow
    });
    make("bggrid", 96, 96, (g) => {
      // Finer, softer grid — a low-alpha 16px sub-grid under the 48px main lines,
      // with faint nodes at main intersections. Lines run 0..80 (the 96 line is
      // supplied by the next tile's 0) so the 96px period tiles with no doubling.
      g.lineStyle(1, 0x131c32, 0.26); // fine sub-grid
      for (let i = 0; i < 96; i += 16) {
        g.lineBetween(i, 0, i, 96);
        g.lineBetween(0, i, 96, i);
      }
      g.lineStyle(1, 0x1a2542, 0.42); // main grid
      for (let i = 0; i < 96; i += 48) {
        g.lineBetween(i, 0, i, 96);
        g.lineBetween(0, i, 96, i);
      }
      g.fillStyle(0x223056, 0.4); // soft nodes at main intersections
      for (let x = 0; x < 96; x += 48) for (let y = 0; y < 96; y += 48) g.fillCircle(x, y, 1.4);
    });
    // Vertical gradient strips + radial glow blobs for the layered backgrounds.
    // NOTE: drawn as manual strips/circles, NOT fillGradientStyle, and with the
    // world colours BAKED IN rather than applied via setTint — both gradient
    // fills and tint are WebGL-only features that silently no-op in the Canvas
    // renderer (?canvas=1), which the playtests and screenshots run under.
    const gradient = (top, bottom) => (g) => {
      const steps = 60;
      const strip = 720 / steps;
      const a = Phaser.Display.Color.IntegerToColor(top);
      const b = Phaser.Display.Color.IntegerToColor(bottom);
      for (let i = 0; i < steps; i++) {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, steps - 1, i);
        g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
        g.fillRect(0, Math.floor(i * strip), 64, Math.ceil(strip) + 1);
      }
      // GFX3 G2: de-band the large soft gradient with a bake-time mono speckle.
      ditherRect(g, 64, 720);
    };
    // Soft radial glow: concentric circles of rising alpha toward the centre.
    const blob = (color) => (g) => {
      for (let r = 128; r > 0; r -= 3) {
        g.fillStyle(color, 0.035 * (1 - r / 128));
        g.fillCircle(128, 128, r);
      }
      // GFX3 G2: de-band the soft radial falloff with a bake-time mono speckle.
      ditherRect(g, 256, 256);
    };
    // generic white versions (tintable under WebGL) + colour-baked world variants
    make("bgGradient", 64, 720, gradient(0xffffff, 0x000000));
    make("glowBlob", 256, 256, blob(0xffffff));
    for (const w of Object.keys(WORLD_THEMES)) {
      const t = WORLD_THEMES[w];
      make(`bgGradient${w}`, 64, 720, gradient(t.bgTop, t.bgBottom));
      make(`glowBlob${w}`, 256, 256, blob(t.glow));
    }

    // P8: light-pool — a soft radial with a quadratic falloff, baked white so the
    // per-device tint (WebGL) colours it and the Canvas tier still shows a faint
    // neutral pool. Denser core than glowBlob so the ≤0.3-alpha tint still reads.
    make("lightpool", 128, 128, (g) => {
      for (let r = 64; r > 0; r -= 2) {
        const t = 1 - r / 64; // 0 at the rim -> 1 at the centre
        g.fillStyle(0xffffff, 0.05 * t * t);
        g.fillCircle(64, 64, r);
      }
    });

    // P8: soft top-light gradient strip (white at the top edge, fading to clear).
    // Laid low-alpha over the intro banner + clear panel so a gentle key light
    // reads from above. Non-additive + cached image = canvas-cheap.
    make("toplight", 64, 128, (g) => {
      for (let i = 0; i < 128; i++) {
        const a = 0.5 * Math.pow(1 - i / 128, 1.7);
        g.fillStyle(0xffffff, a);
        g.fillRect(0, i, 64, 1);
      }
    });

    // --- robots ------------------------------------------------------------
    // Multiply a colour by a factor to make canvas-safe lighter/darker shades
    // (setTint / fillGradientStyle no-op under the Canvas renderer, so the whole
    // two-tone body gradient is baked in with interpolated horizontal strips).
    const shade = (hex, f) => {
      const c = Phaser.Display.Color.IntegerToColor(hex);
      const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
      return Phaser.Display.Color.GetColor(cl(c.red * f), cl(c.green * f), cl(c.blue * f));
    };

    // --- P3: world-backdrop identity textures ------------------------------
    // All generated ONCE here (cached in the texture manager) so GameScene only
    // ever adds cached images/tileSprites — no per-frame Graphics redraw. Layouts
    // are deterministic: a fixed-seed mulberry32 PRNG, never Math.random, so every
    // load draws the identical silhouette strip. Silhouettes are baked opaque in an
    // accent-darkened tone; the strip tileSprite dials the whole layer to alpha
    // ~0.35 at add time. Strip height 864 == every level's world height (18 rows),
    // so the tileSprite tiles horizontally only (no vertical repeat of props).
    const seeded = (s) => () => {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const STRIP_W = 512;
    const STRIP_H = 864;

    // W1 "Assembly Wing": ceiling hooks + jointed arms up top, vats + conveyor
    // gantries along the floor. Warm accent darkened to a silhouette brown.
    make("propStrip1", STRIP_W, STRIP_H, (g) => {
      const tone = shade(WORLD_THEMES[1].accent, 0.34);
      const edge = shade(WORLD_THEMES[1].accent, 0.52);
      const rnd = seeded(101);
      // an overhead gantry rail spanning the width, up in the open ceiling area,
      // so the assembly identity reads even where the floor props are occluded.
      const railY = 150;
      g.fillStyle(tone, 1).fillRect(0, railY, STRIP_W, 14);
      g.fillStyle(edge, 1).fillRect(0, railY, STRIP_W, 3);
      // ceiling: hanging hook rigs dropping from the rail into the mid-air
      [70, 200, 330, 452].forEach((x, i) => {
        const len = railY + 120 + Math.floor(rnd() * 120);
        g.fillStyle(tone, 1).fillRect(x - 3, railY, 6, len - railY); // drop rod
        g.fillStyle(edge, 1).fillCircle(x, railY, 8); // trolley on the rail
        g.fillStyle(edge, 1).fillCircle(x, len, 9); // pulley
        g.lineStyle(6, tone, 1).beginPath(); // hook curl
        g.arc(x, len + 17, 11, Math.PI * 0.15, Math.PI * 0.95, false).strokePath();
      });
      // jointed assembly arm reaching in from the top-left, elbowed
      g.lineStyle(12, tone, 1).beginPath();
      g.moveTo(120, 0); g.lineTo(175, 110); g.lineTo(300, 84); g.strokePath();
      g.fillStyle(edge, 1).fillCircle(175, 110, 11).fillCircle(300, 84, 9);
      g.fillStyle(tone, 1).fillRect(292, 84, 22, 30); // gripper claw block
      // floor: vats (rounded-top cylinders) — lower body hides behind terrain
      [60, 360].forEach((x, i) => {
        const w = 70 + i * 10;
        const topY = 560 + i * 8;
        g.fillStyle(tone, 1).fillRect(x, topY + 12, w, STRIP_H - topY);
        g.fillStyle(tone, 1).fillRoundedRect(x, topY, w, 44, 16); // domed top
        g.fillStyle(edge, 1).fillRect(x, topY + 36, w, 4); // rim band
        g.fillStyle(edge, 1).fillRect(x + w / 2 - 3, topY + 48, 6, STRIP_H - topY - 48);
      });
      // conveyor gantry: horizontal beam on two legs, with hanging tines
      const beamY = 610;
      g.fillStyle(tone, 1).fillRect(170, beamY, 300, 16);
      g.fillStyle(tone, 1).fillRect(180, beamY, 12, STRIP_H - beamY);
      g.fillStyle(tone, 1).fillRect(448, beamY, 12, STRIP_H - beamY);
      g.fillStyle(edge, 1);
      for (let x = 190; x < 460; x += 34) g.fillRect(x, beamY + 16, 8, 18 + Math.floor(rnd() * 14)); // tines
      // GFX2: subtle WARM status lights + lit vat windows (glow accents). Kept away
      // from the x=0/512 edges so the strip still tiles horizontally.
      const warmW1 = WORLD_THEMES[1].warmth;
      [[70, railY], [330, railY]].forEach(([x, y]) => {
        g.fillStyle(warmW1, 0.16).fillCircle(x, y + 1, 6);
        g.fillStyle(warmW1, 0.8).fillCircle(x, y + 1, 2.4); // trolley status light
      });
      g.fillStyle(warmW1, 0.6);
      [[78, 596], [96, 596], [372, 604], [392, 604]].forEach(([x, y]) => g.fillRect(x, y, 5, 8)); // lit vat windows
    });

    // W2 "Maintenance Tunnels": horizontal pipe runs with elbows + valve wheels,
    // sagging cables from the ceiling, and wall vents. Violet accent darkened.
    make("propStrip2", STRIP_W, STRIP_H, (g) => {
      const tone = shade(WORLD_THEMES[2].accent, 0.30);
      const edge = shade(WORLD_THEMES[2].accent, 0.46);
      const rnd = seeded(202);
      const pipe = (y, h) => {
        g.fillStyle(tone, 1).fillRect(0, y, STRIP_W, h);
        g.fillStyle(edge, 1).fillRect(0, y, STRIP_W, 3); // top seam highlight
      };
      // two pipe runs with a stepped elbow between them at mid-strip
      pipe(150, 16);
      g.fillStyle(tone, 1).fillRect(248, 150, 16, 120); // vertical elbow drop
      pipe(258, 16);
      pipe(470, 18);
      // flange bands along the pipes
      g.fillStyle(edge, 1);
      for (let x = 40; x < STRIP_W; x += 96) { g.fillRect(x, 148, 7, 20); g.fillRect(x + 20, 468, 7, 22); }
      // valve wheels at joints
      [120, 380].forEach((x) => {
        g.lineStyle(6, tone, 1).strokeCircle(x, 158, 20);
        g.lineStyle(5, edge, 1).beginPath();
        for (let a = 0; a < 6; a++) { g.moveTo(x, 158); g.lineTo(x + Math.cos((a / 6) * Math.PI * 2) * 20, 158 + Math.sin((a / 6) * Math.PI * 2) * 20); }
        g.strokePath();
        g.fillStyle(edge, 1).fillCircle(x, 158, 5);
      });
      // sagging cables from the ceiling
      g.lineStyle(3, tone, 1);
      [60, 200, 330, 470].forEach((x, i) => {
        const sag = 70 + Math.floor(rnd() * 50);
        g.beginPath(); g.moveTo(x, 0);
        for (let t = 0; t <= 1.001; t += 0.1) g.lineTo(x + t * 26, Math.sin(t * Math.PI) * sag + t * 150);
        g.strokePath();
      });
      // wall vents (louvered)
      [[36, 520], [430, 560]].forEach(([x, y]) => {
        g.fillStyle(tone, 1).fillRect(x, y, 52, 74);
        g.fillStyle(shade(WORLD_THEMES[2].bgBottom, 1), 1);
        for (let ly = y + 8; ly < y + 70; ly += 12) g.fillRect(x + 6, ly, 40, 6);
      });
      // GFX2: subtle cool-mint valve status lights + a warm pilot glow (glow accents)
      const mintW2 = WORLD_THEMES[2].warmth;
      [120, 380].forEach((x) => {
        g.fillStyle(mintW2, 0.16).fillCircle(x, 158, 6);
        g.fillStyle(mintW2, 0.85).fillCircle(x, 158, 2.4); // valve-hub pilot light
      });
      g.fillStyle(WORLD_THEMES[2].accent3, 0.5); // brass pilot flames along the low pipe
      for (let x = 60; x < STRIP_W - 40; x += 128) g.fillRect(x, 466, 4, 6);
    });

    // GFX3 G4: foreground occlusion silhouettes — ONE neutral near-black family
    // (not per-world; the shapes are near-black so a world tint is imperceptible,
    // and a neutral bake stays byte-identical on BOTH tiers — the faint per-world
    // setTint at add time only ENHANCES under WebGL, no-ops on Canvas). Opaque in
    // the texture; the placer dials the layer to alpha ~0.92. Ceiling props hang
    // from y=0 (origin top) so they read as top-of-frame silhouettes; the post is
    // rooted at its bottom. INK sits a touch above pure black so the form still
    // separates from the darkest backdrops.
    const INK = 0x070910;
    const INKE = 0x11141f; // a hair lighter for a thin rim so the silhouette has an edge
    // cable loop: two ceiling mounts with a drooping catenary + a small pulley
    make("fgCable", 220, 130, (g) => {
      g.fillStyle(INK, 1).fillRect(6, 0, 26, 16).fillRect(188, 0, 26, 16); // mounts
      g.lineStyle(7, INK, 1).beginPath();
      g.moveTo(19, 12);
      for (let t = 0; t <= 1.001; t += 0.08) g.lineTo(19 + t * 182, 12 + Math.sin(t * Math.PI) * 96); // droop
      g.strokePath();
      g.fillStyle(INK, 1).fillRect(104, 84, 12, 34).fillCircle(110, 120, 9); // hanging pulley
      g.lineStyle(2, INKE, 1).strokeCircle(110, 120, 9);
    });
    // pipe stub: a thick elbow dropping from the ceiling with a flange + valve nub
    make("fgPipe", 120, 128, (g) => {
      g.fillStyle(INK, 1).fillRect(0, 0, 120, 20); // ceiling pipe run
      g.fillStyle(INK, 1).fillRect(70, 12, 22, 116); // vertical drop
      g.fillStyle(INK, 1).fillRect(60, 40, 42, 12).fillRect(60, 92, 42, 12); // two flanges
      g.fillStyle(INK, 1).fillCircle(81, 116, 15); // valve nub
      g.lineStyle(2, INKE, 1).strokeCircle(81, 116, 15).strokeRect(0, 0, 120, 20);
    });
    // vent lip: a wide hood with louver teeth on its underside
    make("fgVent", 168, 86, (g) => {
      g.fillStyle(INK, 1).fillRect(0, 0, 168, 30); // hood body
      g.fillStyle(INK, 1).beginPath(); // slanted lip
      g.moveTo(0, 30); g.lineTo(168, 30); g.lineTo(150, 52); g.lineTo(18, 52); g.closePath(); g.fillPath();
      g.fillStyle(INK, 1);
      for (let x = 26; x < 148; x += 20) g.fillRect(x, 52, 8, 24 + ((x >> 3) & 3) * 4); // louver teeth
      g.lineStyle(2, INKE, 1).strokeRect(0, 0, 168, 30);
    });
    // Low-lying fog: a soft additive band with a sine-billowed top edge that
    // completes whole cycles across the width, so it tiles seamlessly AND its
    // horizontal drift is visible. Two of these are layered at different speeds.
    make("fogBand", STRIP_W, 220, (g) => {
      // GFX2: softened alphas + a slightly warmer neutral haze for the Lumen palette
      const bands = [
        { k: 2, amp: 26, base: 70, a: 0.13 },
        { k: 3, amp: 18, base: 110, a: 0.1 },
      ];
      for (const b of bands) {
        g.fillStyle(0xe6ebf7, b.a);
        for (let x = 0; x < STRIP_W; x += 4) {
          const topY = b.base + b.amp * Math.sin((b.k * x / STRIP_W) * Math.PI * 2);
          g.fillRect(x, topY, 5, 220 - topY);
        }
      }
    });

    // Dust shaft: a tall vertical soft-edged light beam (bright core fading to
    // transparent sides). Placed rotated + additive at very low alpha; drifts via
    // a slow tween, no per-frame work.
    make("dustShaft", 140, 660, (g) => {
      const half = 70;
      for (let dx = -half; dx <= half; dx++) {
        const f = 1 - Math.abs(dx) / half;
        g.fillStyle(0xeef1fb, 0.42 * f * f); // GFX2: softer, subtler light shaft
        g.fillRect(half + dx, 0, 1, 660);
      }
    });

    // GFX3 G3: soft downward light cone — narrow at the top apex, fanning wider and
    // dimmer toward the base, soft-edged both ways. Placed additively under lamp /
    // dust-shaft sources (backdrop.js), alpha 0.05-0.12. The BAKE ITSELF is gated
    // to WebGL (R1) — the Canvas reference tier never creates the texture and the
    // gated placement below never runs there. Canvas-safe per-row strips.
    if (isWebGL(this)) {
      make("lightCone", 128, 240, (g) => {
        const cx = 64;
        for (let y = 0; y < 240; y++) {
          const t = y / 240;                 // 0 apex -> 1 base
          const halfW = 5 + t * (cx - 5);    // narrow at the source, full at the base
          const vFade = 1 - t * 0.82;        // dimmer toward the base
          for (let dx = -halfW; dx <= halfW; dx++) {
            const f = 1 - Math.abs(dx) / halfW; // 0 edge -> 1 centre
            g.fillStyle(0xffffff, 0.06 * f * f * vFade);
            g.fillRect(Math.round(cx + dx), y, 1, 1);
          }
        }
      });
    }

    // Soft vignette edge: a 1-D gradient (opaque black at the outer edge -> clear
    // inward). Placed as four thin border bands (top/bottom/left/right) rather than
    // one full-screen image, so the vignette composites only the darkened border
    // region — a big Canvas fill-rate saving vs. a mostly-transparent full quad,
    // while looking identical (corners double up naturally). Capped to alpha <=0.22
    // at add time so it frames the backdrop without dimming players.
    make("vignEdge", 8, 128, (g) => {
      for (let y = 0; y < 128; y++) {
        g.fillStyle(0x000000, Math.pow(1 - y / 128, 1.7));
        g.fillRect(0, y, 8, 1);
      }
    });

    // GFX2 "Lumen Lab" player robot: a rounded-capsule Lumen body with soft 4-tone
    // shading (paint.js softBody/specular), a friendly glass visor, and a colored
    // rim-light (Beep: mint on cyan-blue; Boop: coral on amber-orange). CONTRACT
    // anchors (unmovable — the anim rig snaps overlays to them): eyes at (17,23) &
    // (28,23); antenna tip at (22,3); tread band centred y≈44.5; blink lids at y=24.
    // The 44×48 frame + centred silhouette drive Player.js BODY {w:30,h:42,ox:7,oy:6}.
    // color: body base, dark: visor/stripe, rim: colored rim-light + accent glints.
    // blink=true draws the visor with eyes closed for the _blink texture.
    const robot = (color, dark, rim, blink, arms) => (g) => {
      if (arms) {
        // P6 carried pose: two stubby arms raised overhead (gripping the carrier).
        // Drawn first so the shoulders tuck behind the body; hands read above it.
        g.lineStyle(5, shade(color, 0.9));
        g.lineBetween(9, 20, 13, 3);
        g.lineBetween(35, 20, 31, 3);
        g.fillStyle(shade(color, 1.15));
        g.fillCircle(13, 3, 3.4); g.fillCircle(31, 3, 3.4); // mitts
        g.fillStyle(rim, 0.7);
        g.fillCircle(12, 2.2, 1.3); g.fillCircle(30, 2.2, 1.3); // rim glints
      }
      // --- treads: smooth belt band + round wheels, centred at y≈44.5 (anchor 3) --
      g.fillStyle(0x0c1019, 1).fillRoundedRect(2, 40, 40, 9, 3.5); // belt base
      g.fillStyle(0x151b2b, 1).fillRoundedRect(2, 39.4, 40, 2.4, 1.2); // top rim line
      [8, 17, 26, 35].forEach((x) => {
        g.fillStyle(0x2a3247, 1).fillCircle(x, 44.5, 3.9);          // round wheel
        g.fillStyle(0x384360, 0.75).fillCircle(x - 1.2, 43.2, 1.1); // wheel spec
      });
      // --- body: rounded Lumen capsule with Canvas-safe 4-tone soft shading -------
      softBody(g, {
        x: 4, y: 12, w: 36, h: 30, r: 9, base: color,
        shadeLo: shade(color, 0.6), shadeHi: shade(color, 1.34),
        outline: shade(color, 1.4), outlineA: 0.5,
      });
      // colored rim-light running down the left edge of the body (+ soft halo)
      g.fillStyle(rim, 0.22).fillRoundedRect(4.4, 14, 3.6, 26, 1.8);
      g.fillStyle(rim, 0.85).fillRoundedRect(5.2, 15, 2.8, 24, 1.4);
      // a glossy top-left specular dab on the capsule
      specular(g, { x: 15, y: 17, w: 9, h: 3.2, a: 0.4 });
      // --- friendly glass visor ---------------------------------------------------
      g.fillStyle(dark, 1).fillRoundedRect(9, 17, 26, 13, 6);
      g.lineStyle(1.2, shade(color, 1.32), 0.4).strokeRoundedRect(9, 17, 26, 13, 6); // bezel
      if (blink) {
        // eyes closed — two short horizontal lids at contract y=24 (anchor 7)
        g.lineStyle(2.4, 0xffffff, 0.92);
        g.lineBetween(13, 24, 21, 24);
        g.lineBetween(24, 24, 32, 24);
      } else {
        // baked white eyes EXACTLY at (17,23) & (28,23) — 11px apart (anchor 1)
        g.fillStyle(0xffffff, 1);
        g.fillCircle(17, 23, 3.4); g.fillCircle(28, 23, 3.4);
        g.fillStyle(0xbfeaff, 0.95); // glossy specular dots
        g.fillCircle(15.8, 21.4, 1.2); g.fillCircle(26.8, 21.4, 1.2);
      }
      // glossy visor sweep — thin white specular streak across the top of the glass
      g.fillStyle(0xffffff, 0.18).fillRoundedRect(10.5, 18.2, 23, 2.4, 1.2);
      // --- antenna: stalk + glowing tip EXACTLY at (22,3) (anchor 2) --------------
      g.lineStyle(2, shade(color, 1.28)).lineBetween(22, 12, 22, 4);
      g.fillStyle(rim, 0.3).fillCircle(22, 3, 4);      // tip glow halo
      g.fillStyle(0xffffff, 1).fillCircle(22, 3, 2.6); // tip
      // --- chest accent stripe ----------------------------------------------------
      g.fillStyle(dark, 1).fillRoundedRect(12, 34, 20, 3, 1.5);
      g.fillStyle(rim, 0.45).fillRect(13, 34.4, 18, 1); // stripe glow line
    };
    make("robot_b", 44, 48, robot(COLORS.beep, 0x0c2f44, COLORS.mint, false));
    make("robot_o", 44, 48, robot(COLORS.boop, 0x4a2a08, COLORS.coral, false));
    make("robot_b_blink", 44, 48, robot(COLORS.beep, 0x0c2f44, COLORS.mint, true));
    make("robot_o_blink", 44, 48, robot(COLORS.boop, 0x4a2a08, COLORS.coral, true));
    // P6 carried-pose art: arms-up variant, texture-swapped onto a carried buddy
    // (drawn art, not a tint — reads under the Canvas renderer).
    make("robot_b_carry", 44, 48, robot(COLORS.beep, 0x0c2f44, COLORS.mint, false, true));
    make("robot_o_carry", 44, 48, robot(COLORS.boop, 0x4a2a08, COLORS.coral, false, true));

    // P6 shadow blob: a soft dark ellipse (stacked low-alpha rings — a Canvas-safe
    // fake radial gradient). One pooled instance rides under each robot, scaled
    // down as it lifts off the ground and hidden while carried. Alpha dialled at
    // placement (~0.35) so it grounds the robot without muddying the terrain.
    make("shadow", 64, 26, (g) => {
      // GFX2: softer contact shadow — more, fainter rings for a smoother falloff.
      for (let i = 20; i > 0; i--) {
        const t = i / 20;
        g.fillStyle(0x000000, 0.038);
        g.fillEllipse(32, 13, 60 * t, 22 * t);
      }
    });

    // P6 phase edge-shimmer: a violet outline that hugs the robot silhouette while
    // it is inside a phase-wall. Baked violet (reads on Canvas); the additive GLOW
    // is gated to WebGL by setting ADD blend only on that renderer (see Player.js).
    make("phaseedge", 44, 48, (g) => {
      // hugs the new r=9 capsule silhouette (body 4,12,36,30)
      g.lineStyle(4, 0xc39dff, 0.18).strokeRoundedRect(2.5, 10.5, 39, 33, 11);
      g.lineStyle(2, 0xe8d8ff, 0.5).strokeRoundedRect(4, 12, 36, 30, 9);
      g.lineStyle(2, 0xd7bbff, 0.4).lineBetween(22, 12, 22, 3);
      g.fillStyle(0xf2e8ff, 0.5).fillCircle(22, 3, 2.8);
      g.lineStyle(3, 0xc39dff, 0.16).strokeRoundedRect(2, 39.5, 40, 8.5, 3.5); // tread halo
    });

    // --- ANIM A2: player locomotion overlay parts (pooled, drawn art) -------
    // Tread-scroll cycle: 4 phase frames of the 40x9 belt (dark base + top rim +
    // wheel bumps stepped 2.5px each) drawn to match the baked robot tread palette.
    // The rig swaps between them by |vx| — a cheap CANVAS-friendly texture cycle
    // (no TileSprite pattern re-fill), giving visibly rolling treads at ~zero cost.
    for (let p = 0; p < 4; p++) {
      make(`tread${p}`, 40, 9, (g) => {
        g.fillStyle(0x0c1019).fillRoundedRect(0, 0, 40, 9, 3.5); // smooth belt (== baked)
        g.fillStyle(0x151b2b).fillRoundedRect(0, 0, 40, 2.2, 1.1); // top rim line
        for (let i = -1; i < 5; i++) {
          const x = i * 10 + p * 2.5;                     // round wheels march by phase
          g.fillStyle(0x2a3247).fillCircle(x, 5.3, 3.9);
          g.fillStyle(0x384360, 0.75).fillCircle(x - 1.3, 4.1, 1.1); // wheel spec
        }
      });
    }
    // Pupils overlay: BOTH dark lenses in one 16x8 image, sitting ON the baked
    // white eyes so the gaze can shift up/down/around (P6 baked the static white
    // eyes into the body; this moving overlay augments them, never fights them).
    // One merged part keeps the display list small (cheap on the Canvas tier).
    make("pupils", 16, 8, (g) => {
      // lens centres at x=3 & x=14 (11px apart) — MUST match the baked eyes (anchor 1)
      g.fillStyle(0x0a1626);
      g.fillCircle(3, 4, 2.2); g.fillCircle(14, 4, 2.2);   // L / R lenses
      g.fillStyle(0x1b3a5c, 0.9);
      g.fillCircle(3, 4.5, 1.3); g.fillCircle(14, 4.5, 1.3); // lower iris warmth
      g.fillStyle(0x9fd4ff, 0.9);
      g.fillCircle(2.3, 3.3, 0.85); g.fillCircle(13.3, 3.3, 0.85); // catch-lights
    });
    // Antenna tip accent: a tiny light ball that rides the baked antenna tip and
    // trails (leans back / lifts) with the rising/falling pose.
    make("anttip", 6, 6, (g) => {
      g.fillStyle(0xdfe8ff, 0.28).fillCircle(3, 3, 3);    // glowing tip halo
      g.fillStyle(0xeef4ff, 0.98).fillCircle(3, 3, 2);
      g.fillStyle(0xffffff, 0.95).fillCircle(2.3, 2.3, 0.85);
    });

    // --- ANIM A4: action + death set art (pooled, drawn, canvas-safe) -------
    // Reach-out ARM glyph for the grapple ZIP: a slim forearm ending in a claw,
    // ORIGIN at the shoulder (left edge) so the rig can stretch its reach with a
    // scaleX and aim it in world space at the zip anchor.
    make("arm_glyph", 18, 8, (g) => {
      // origin 0.12,0.5 (set by the rig) → pivot on the shoulder stud at x≈2
      g.fillStyle(0x223049, 1).fillRoundedRect(0, 2, 12, 4, 2); // rounded forearm
      g.fillStyle(0x2f4066, 0.85).fillRoundedRect(0, 2, 12, 1.6, 0.8); // top light
      g.fillStyle(0x35f0ff, 0.22).fillCircle(13.5, 4, 4.5); // claw glow
      g.lineStyle(2, 0x35f0ff, 0.9);
      g.strokeCircle(13.5, 4, 3); // claw ring
      g.lineBetween(12, 1.5, 15, 0); // upper prong
      g.lineBetween(12, 6.5, 15, 8); // lower prong
      g.fillStyle(0xbdf3ff, 1).fillCircle(2, 4, 2); // shoulder stud
    });
    // Equip FLASH: a bright expanding ring popped over the head on skill assignment.
    make("equipflash", 40, 40, (g) => {
      g.lineStyle(6, 0xbfeaff, 0.12).strokeCircle(20, 20, 15); // soft outer halo
      g.lineStyle(4, 0xffffff, 0.9).strokeCircle(20, 20, 12);
      g.lineStyle(2, 0xbfeaff, 0.7).strokeCircle(20, 20, 17);
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        g.fillStyle(0xffffff, 0.85).fillCircle(20 + Math.cos(a) * 14, 20 + Math.sin(a) * 14, 1.6);
      }
    });
    // Death-scatter CHUNKS: 5 drawn robot pieces (visor / antenna / tread / body
    // plate / bolt), one set per player accent colour. Pooled + flung on death,
    // pulled back together by the respawn beam (see src/anim/death.js).
    // GFX2: matched Lumen mini-pieces — rounder forms, soft top-light + accent glow.
    const chunk = {
      visor: (g, ac) => { g.fillStyle(0x0a1626, 1).fillRoundedRect(0, 2, 14, 6, 2.5); g.fillStyle(ac, 0.9).fillRoundedRect(2, 3, 10, 2, 1); g.fillStyle(0xffffff, 0.85).fillCircle(4, 4.2, 1); },
      ant: (g, ac) => { g.fillStyle(0x2a3247, 1).fillRoundedRect(3, 2, 2, 8, 1); g.fillStyle(ac, 0.3).fillCircle(4, 2, 3); g.fillStyle(0xeef4ff, 0.95).fillCircle(4, 2, 2.2); g.fillStyle(ac, 0.9).fillCircle(4, 2, 1.1); },
      tread: (g) => { g.fillStyle(0x0c1019, 1).fillRoundedRect(0, 1, 14, 6, 2.5); g.fillStyle(0x2a3247, 1).fillCircle(4, 4, 2.2); g.fillStyle(0x2a3247, 1).fillCircle(10, 4, 2.2); g.fillStyle(0x384360, 0.7).fillCircle(3.2, 3.2, 0.8); },
      plate: (g, ac) => { g.fillStyle(0x1a2740, 1).fillRoundedRect(0, 0, 12, 10, 3); g.fillStyle(0x2f4066, 0.6).fillRoundedRect(1, 1, 10, 3, 2); g.lineStyle(1.5, ac, 0.8).strokeRoundedRect(1, 1, 10, 8, 2.5); g.fillStyle(0x384360, 0.8).fillRoundedRect(3, 4, 6, 1.5, 0.7); },
      bolt: (g, ac) => { g.fillStyle(ac, 0.28).fillCircle(4, 4, 4); g.fillStyle(0x8fa3d9, 1).fillCircle(4, 4, 3.4); g.fillStyle(ac, 0.7).fillCircle(4, 4, 1.6); g.fillStyle(0xffffff, 0.7).fillCircle(3, 3, 0.8); },
    };
    for (const [key, ac] of [["b", COLORS.beep], ["o", COLORS.boop]]) {
      make(`dp_visor_${key}`, 14, 10, (g) => chunk.visor(g, ac));
      make(`dp_ant_${key}`, 8, 12, (g) => chunk.ant(g, ac));
      make(`dp_tread_${key}`, 14, 8, (g) => chunk.tread(g, ac));
      make(`dp_plate_${key}`, 12, 10, (g) => chunk.plate(g, ac));
      make(`dp_bolt_${key}`, 8, 8, (g) => chunk.bolt(g, ac));
    }

    // --- interactables -----------------------------------------------------
    make("anchor", 32, 32, (g) => {
      fakeRadial(g, { x: 16, y: 16, r: 15, color: COLORS.neon, steps: 5, aCenter: 0.28, aEdge: 0.04 }); // hub glow
      ringGlow(g, { x: 16, y: 16, r: 11, color: COLORS.neon, width: 4 }); // haloed cling ring
      g.fillStyle(COLORS.neon).fillCircle(16, 16, 3.5);
      g.fillStyle(0xffffff, 0.9).fillCircle(14.6, 14.6, 1.3); // hot centre specular
    });
    // Lever base plate + glowing pivot hub. The stick/knob is a SEPARATE
    // `lever_handle` image (origin at its base pivot) so a flip is a rotation
    // tween rather than a texture flipX — see GameScene.pullLever.
    make("lever", 36, 40, (g) => {
      softBody(g, { x: 2, y: 28, w: 32, h: 12, r: 4, base: 0x243052 }); // shaded base plate
      fakeRadial(g, { x: 18, y: 31, r: 9, color: COLORS.magenta, steps: 4, aCenter: 0.22, aEdge: 0.03 }); // pivot glow
      g.fillStyle(0x2a3350).fillCircle(18, 31, 5.5);
      g.fillStyle(COLORS.magenta, 0.85).fillCircle(18, 31, 2.6);
      g.fillStyle(0xffd0f2, 0.85).fillCircle(17, 30, 1); // socket spark
    });
    // Drawn handle, pivot at bottom-centre (originY≈1). Bigger glowing knob.
    make("lever_handle", 22, 42, (g) => {
      g.lineStyle(5, 0x8fa3d9).lineBetween(11, 40, 11, 15);
      haloCircle(g, { x: 11, y: 11, r: 7, color: COLORS.magenta }); // knob halo
      g.fillStyle(COLORS.magenta).fillCircle(11, 11, 7);
      g.fillStyle(0xffd0f2, 0.9).fillCircle(9, 9, 2.4); // specular
    });
    // Gold key with a fuller body + rim highlight; a sweeping glint is drawn as a
    // separate `glint` streak animated over it in GameScene.
    make("key", 30, 30, (g) => {
      fakeRadial(g, { x: 9, y: 10, r: 11, color: 0xffd94d, steps: 4, aCenter: 0.2, aEdge: 0.03 }); // gold bow glow
      g.lineStyle(9, 0xffd94d, 0.14).strokeCircle(9, 10, 5.5); // bit halo
      g.lineStyle(5, 0xffd94d).strokeCircle(9, 10, 5.5);
      g.fillStyle(0x3a2e08).fillCircle(9, 10, 2.2);
      g.lineStyle(5, 0xffd94d).lineBetween(12, 13, 25, 26);
      g.lineStyle(4, 0xffd94d);
      g.lineBetween(20, 21, 25, 16);
      g.lineBetween(22, 26, 27, 21);
      g.lineStyle(1.5, 0xfff2b0, 0.85).strokeCircle(9, 10, 5.5);
    });
    // Thin soft white streak swept diagonally across the key ~every 2s.
    make("glint", 12, 34, (g) => {
      g.fillStyle(0xffffff, 0.85).fillRect(4, 0, 3, 34);
      g.fillStyle(0xffffff, 0.32).fillRect(1, 0, 9, 34);
    });
    // Holo-pillar light beam rising from a pedestal base: bright/wide at the
    // bottom, tapering and fading toward the top. Additive-blended in GameScene.
    make("holobeam", 30, 132, (g) => {
      const steps = 30;
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1); // 0 = top
        const halfW = 3 + 10 * t;
        g.fillStyle(COLORS.neon, 0.04 + 0.26 * t);
        g.fillRect(15 - halfW, Math.floor(i * (132 / steps)), halfW * 2, 132 / steps + 1);
        // brighter hot core streak down the spine (richer beam)
        g.fillStyle(0xd8ffff, 0.12 + 0.4 * t);
        g.fillRect(14, Math.floor(i * (132 / steps)), 2, 132 / steps + 1);
      }
    });
    make("core", 30, 30, (g) => {
      // brighter halo for pickup readability: fake-radial bloom under the hex
      fakeRadial(g, { x: 15, y: 15, r: 15, color: COLORS.neon, steps: 6, aCenter: 0.42, aEdge: 0.05 });
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        pts.push({ x: 15 + Math.cos(a) * 10, y: 15 + Math.sin(a) * 10 });
      }
      // hex rim halo, then the solid neon hex + hot white core
      glowShape(g, { color: COLORS.neon }, (gg) => gg.strokePoints(pts, true, true));
      g.fillStyle(COLORS.neon).fillPoints(pts, true);
      g.lineStyle(1.5, 0xd8ffff, 0.8).strokePoints(pts, true, true);
      g.fillStyle(0xffffff).fillCircle(15, 15, 3.4);
    });
    // Sliding door PANEL only — the frame (side rails + top light bar) and the
    // red/green status lamp are separate objects built per-door in GameScene, so
    // the lamp colour reads under the Canvas renderer (setTint no-ops there).
    // Glass-and-steel sliding door PANEL. Steel body (soft-shaded) with a recessed
    // glass centre, horizontal panel seams, and a glowing vertical seam down the
    // middle (the sliding split). Frame rails + status lamp are separate objects
    // built per-door in GameScene. `seam` is the door's edge-glow accent hue.
    const doorPanel = (steel, glass, seam, seamHi, warm) => (g) => {
      softBody(g, { x: 2, y: 0, w: 44, h: 144, r: 4, base: steel });
      // recessed glass inner panel
      g.fillStyle(glass, 0.9).fillRoundedRect(6, 6, 36, 132, 4);
      g.lineStyle(1.5, seam, 0.5).strokeRoundedRect(6, 6, 36, 132, 4);
      // horizontal panel seams
      g.lineStyle(1, seam, 0.4);
      for (let y = 24; y < 138; y += 26) g.lineBetween(9, y, 39, y);
      // glowing vertical centre seam (the phase split) — halo layers
      g.fillStyle(seam, 0.08).fillRect(21, 5, 6, 134);
      g.fillStyle(seam, 0.2).fillRect(22.5, 5, 3, 134);
      g.fillStyle(seamHi, 0.55).fillRect(23.4, 5, 1.2, 134);
      if (warm) { // exit: a warm candle-glow wash so the goal feels inviting
        g.fillStyle(warm, 0.06).fillRoundedRect(6, 6, 36, 132, 4);
      }
      // glass sheen + corner bolts
      sheen(g, { x: 8, y: 8, w: 34, h: 130, a: 0.05 });
      g.fillStyle(steel);
      [10, 134].forEach((y) => [10, 38].forEach((x) => g.fillCircle(x, y, 1.8)));
    };
    make("door", 48, 144, doorPanel(0x2b3658, 0x1a2440, COLORS.neon, 0x9fd4ff));
    // Exit door: green steel + green glow seam + warm inviting wash (the goal).
    make("door_exit", 48, 144, doorPanel(0x1f4a3a, 0x123a2c, COLORS.green, 0xd6ffe6, WORLD_THEMES[1].warmth));
    // Door status lamps (swapped via setTexture: red = closed, green = opening).
    // Glass lens with a baked halo glow (the plan's glow recipe).
    const lamp = (glow, lens, hi) => (g) => {
      softBody(g, { x: 0, y: 0, w: 20, h: 14, r: 4, base: 0x2a3350 });
      g.fillStyle(glow, 0.12).fillCircle(10, 7, 8); // outer halo
      g.fillStyle(glow, 0.3).fillCircle(10, 7, 5.5); // inner halo
      g.fillStyle(lens).fillCircle(10, 7, 3.6); // lens
      g.fillStyle(hi, 0.9).fillCircle(8.6, 5.6, 1.3); // specular
    };
    make("lamp_red", 20, 14, lamp(COLORS.hazard, 0xff5566, 0xffc2ca));
    make("lamp_green", 20, 14, lamp(COLORS.green, 0x59ff9c, 0xd6ffe6));
    // Pressure plate: top face with an LED strip. `plate` = dark/off,
    // `plate_on` = lit accent — swapped by setTexture (Canvas-safe).
    make("plate", 48, 14, (g) => {
      g.fillStyle(0x2a3350).fillRect(0, 8, 48, 6);
      g.fillStyle(0x1c2742).fillRoundedRect(4, 2, 40, 8, 3);
      g.fillStyle(0x2f4066).fillRect(9, 4, 30, 2); // LED strip, unlit
    });
    make("plate_on", 48, 14, (g) => {
      g.fillStyle(0x2a3350).fillRect(0, 8, 48, 6);
      g.fillStyle(0x1c2742).fillRoundedRect(4, 2, 40, 8, 3);
      // LED strip glow: stacked low-alpha halo bands around the lit strip
      g.fillStyle(COLORS.green, 0.12).fillRect(5, 1, 38, 9);
      g.fillStyle(COLORS.green, 0.3).fillRect(7, 3, 34, 5);
      g.fillStyle(COLORS.green).fillRect(9, 4, 30, 2); // lit LED strip
      g.fillStyle(0xdfffe8, 0.9).fillRect(9, 4.4, 30, 0.8); // hot core line
    });
    // Holo-pillar pedestal column.
    make("pedestal", 48, 46, (g) => {
      g.fillStyle(0x222c4c).fillRect(14, 14, 20, 32);
      g.lineStyle(1, 0x44548c).strokeRect(14, 14, 20, 32);
      g.fillStyle(0x2f3f6e).fillRect(8, 40, 32, 6);
      g.fillStyle(0x2f3f6e).fillRect(10, 8, 28, 8);
      // richer holo emitter lens: fake-radial bloom + hot core + specular
      fakeRadial(g, { x: 24, y: 8, r: 11, color: COLORS.neon, steps: 5, aCenter: 0.4, aEdge: 0.05 });
      g.fillStyle(COLORS.neon, 0.9).fillCircle(24, 8, 6.5);
      g.fillStyle(0xd8ffff, 0.9).fillCircle(22.5, 6.5, 2); // specular
    });
    // P5 — Causality wiring & machine detail ------------------------------
    // Pedestal beam band: a short vertical strip with two soft horizontal
    // light bands on a transparent field. Two of these are tiled up the beam
    // and their tilePositionY is tweened in opposite directions (counter-
    // scrolling alpha bands). Neon-baked so it reads under Canvas (no tint).
    make("beamband", 24, 48, (g) => {
      for (let i = 0; i < 48; i++) {
        // two gaussian-ish bright bands centred at y=12 and y=36. Falloff rate
        // unchanged so the strip still reaches alpha 0 at both edges (y=0/47) and
        // tiles vertically seamlessly; only the brightness/width is enriched.
        const d1 = Math.abs(i - 12), d2 = Math.abs(i - 36);
        const a = Math.max(0, 0.5 - d1 * 0.05) + Math.max(0, 0.42 - d2 * 0.05);
        if (a <= 0.01) continue;
        const halfW = 5 + (a > 0.3 ? 4 : 0);
        g.fillStyle(COLORS.neon, Math.min(0.55, a));
        g.fillRect(12 - halfW, i, halfW * 2, 1);
        if (a > 0.55) { g.fillStyle(0xd8ffff, Math.min(0.5, a - 0.4)); g.fillRect(11, i, 2, 1); } // hot core
      }
    });
    // Rising pedestal glyph: a tiny neon data-mark (diamond + centre dot) that
    // floats up through the beam (pooled emitter, WebGL only — see GameScene).
    make("pedglyph", 10, 10, (g) => {
      g.fillStyle(COLORS.neon, 0.18).fillCircle(5, 5, 5); // soft data-mote glow
      g.fillStyle(COLORS.neon, 0.9);
      g.fillPoints([{ x: 5, y: 0 }, { x: 10, y: 5 }, { x: 5, y: 10 }, { x: 0, y: 5 }], true);
      g.fillStyle(0xffffff, 0.95).fillCircle(5, 5, 1.5);
    });
    // Cable drum / pulley for the lift: a spoked wheel that rotates while the
    // lift travels (rotation set from lift velocity in GameScene).
    make("drum", 26, 26, (g) => {
      g.fillStyle(0x1c2742).fillCircle(13, 13, 12);
      g.lineStyle(3, COLORS.amber, 0.14).strokeCircle(13, 13, 12); // amber edge glow
      g.lineStyle(2, 0x44548c).strokeCircle(13, 13, 12);
      g.lineStyle(1.5, COLORS.amber, 0.6).strokeCircle(13, 13, 12); // warm cable-rim lip
      g.fillStyle(0x2a3350).fillCircle(13, 13, 8);
      g.lineStyle(2, 0x5a6aa0);
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i;
        g.lineBetween(13, 13, 13 + Math.cos(a) * 11, 13 + Math.sin(a) * 11);
      }
      g.fillStyle(0x8fa3d9).fillCircle(13, 13, 3);
      g.fillStyle(0xffd9a0, 0.9).fillCircle(11.5, 11.5, 1.3);
    });
    // Lift cable: a thin steel line (baked grey so it reads under Canvas, where
    // setTint is a no-op) stretched between the drum and the platform.
    make("liftcable", 3, 8, (g) => {
      g.fillStyle(0x2a3350).fillRect(0, 0, 3, 8);
      g.fillStyle(0x5a6aa0).fillRect(1, 0, 1, 8);
      g.fillStyle(COLORS.amber, 0.4).fillRect(1, 0, 1, 8); // warm cable sheen (full-height: tiles vertically)
    });
    // Marquee dot for the exit-door frame chase (white; tinted per world on
    // WebGL, additive glow gated to WebGL — a plain white dot under Canvas).
    make("marqueedot", 10, 10, (g) => {
      g.fillStyle(0xffffff, 0.28).fillCircle(5, 5, 5);
      g.fillStyle(0xffffff, 1).fillCircle(5, 5, 2.6);
    });
    // Checkpoint lamp housing: dim grey (inactive) + lit green (active).
    // Rounded lamp-post checkpoint: soft-shaded post + base + a glass lens head.
    // `checkpoint` = dim/inactive, `checkpoint_on` = lit with a soft green glow.
    make("checkpoint", 26, 66, (g) => {
      softBody(g, { x: 10, y: 18, w: 6, h: 44, r: 3, base: 0x2a3350 }); // post
      g.fillStyle(0x2f3f6e).fillRoundedRect(4, 60, 18, 6, 2); // base
      softBody(g, { x: 3, y: 2, w: 20, h: 18, r: 6, base: 0x39415e }); // lamp head
      g.fillStyle(0x35405e).fillCircle(13, 11, 5.5); // dark lens
      g.fillStyle(0x4a5578).fillCircle(13, 11, 3);
      g.fillStyle(0x6b78a8, 0.7).fillCircle(11.8, 9.6, 1.1);
    });
    make("checkpoint_on", 26, 66, (g) => {
      softBody(g, { x: 10, y: 18, w: 6, h: 44, r: 3, base: 0x2a3350 }); // post
      g.fillStyle(0x2f3f6e).fillRoundedRect(4, 60, 18, 6, 2); // base
      softBody(g, { x: 3, y: 2, w: 20, h: 18, r: 6, base: 0x39415e }); // lamp head
      g.lineStyle(2, COLORS.green, 0.9).strokeRoundedRect(3, 2, 20, 18, 6); // lit rim
      // soft green glow halo around the lens
      g.fillStyle(COLORS.green, 0.14).fillCircle(13, 11, 11);
      g.fillStyle(COLORS.green, 0.3).fillCircle(13, 11, 7.5);
      g.fillStyle(0x0f4a2c).fillCircle(13, 11, 5.5);
      g.fillStyle(COLORS.green).fillCircle(13, 11, 3.6); // hot lens
      g.fillStyle(0xdfffe8, 0.9).fillCircle(11.6, 9.6, 1.3); // specular
    });
    // Expanding ring (checkpoint activation burst) — a glowing green halo ring.
    make("ring", 48, 48, (g) => {
      g.lineStyle(9, COLORS.green, 0.1).strokeCircle(24, 24, 20);
      g.lineStyle(6, COLORS.green, 0.22).strokeCircle(24, 24, 20);
      g.lineStyle(3.5, COLORS.green, 0.95).strokeCircle(24, 24, 20);
    });
    make("pip_off", 16, 18, (g) => {
      softBody(g, { x: 3, y: 3, w: 10, h: 10, r: 3, base: 0x39415e, shadeLo: 0x2b3450 }); // dim glass gem
      g.fillStyle(0x5a6488, 0.5).fillRect(5, 5.5, 6, 2); // faint idle sheen
    });
    make("pip_on", 16, 18, (g) => {
      g.fillStyle(COLORS.amber, 0.16).fillRoundedRect(1, 1, 14, 14, 5); // lit halo
      softBody(g, { x: 3, y: 3, w: 10, h: 10, r: 3, base: COLORS.amber, shadeLo: 0x8a5a10 }); // glowing gem
      g.fillStyle(0xfff2b0, 0.95).fillRect(5, 5.5, 6, 2.5); // hot top-light
      g.fillStyle(0xffffff, 0.85).fillCircle(6, 6, 1); // specular
    });

    // --- enemies & set pieces ----------------------------------------------
    // Scuttlebug: shell sheen highlight (static) + two leg frames swapped in
    // GameScene for a wiggle. `legs` picks the leg x-splay; glow pass is a
    // separate additive overlay (eyes brighten near a player) drawn in-game.
    const bug = (legs) => (g) => {
      // Lumen Lab: rounded glossy carapace — base dome + under-shade + top-light
      // band + hot specular + a same-hue crisp rim (never black). Dome corners
      // preserved (feeler bases baked at ±5,-8 under this top edge live in bug_anim).
      g.fillStyle(0x6d3fa8).fillRoundedRect(2, 4, 40, 20, { tl: 18, tr: 18, bl: 4, br: 4 });
      g.fillStyle(0x431f70, 0.5).fillRoundedRect(2, 15, 40, 9, { tl: 0, tr: 0, bl: 4, br: 4 }); // under-shade
      g.fillStyle(0x9a6fd4, 0.45).fillRoundedRect(4, 5, 36, 7, { tl: 16, tr: 16, bl: 0, br: 0 }); // top-light
      g.lineStyle(1.5, 0x8a5cc4).strokeRoundedRect(2, 4, 40, 20, { tl: 18, tr: 18, bl: 4, br: 4 });
      g.lineStyle(1.5, 0x8a5cc4, 0.7).lineBetween(22, 5, 22, 22); // carapace seam
      // glossy shell sheen (top-left arc + hot specular pip)
      g.fillStyle(0xb79ae0, 0.5).fillEllipse(15, 11, 16, 7);
      g.fillStyle(0xe4d6f7, 0.85).fillEllipse(13, 9.5, 6, 3);
      g.fillStyle(0xffffff, 0.9).fillCircle(11, 8.4, 1.3);
      // cute glossy amber eyes with a soft glow + catchlight (positions preserved)
      [10, 34].forEach((cx) => {
        g.fillStyle(0xffe066, 0.16).fillCircle(cx, 14, 5);
        g.fillStyle(0xffe066).fillCircle(cx, 14, 3);
        g.fillStyle(0x6a4a10).fillCircle(cx + 0.4, 14.6, 1.1); // pupil
        g.fillStyle(0xfff6c2, 0.95).fillCircle(cx - 0.9, 13, 0.9); // catchlight
      });
      g.fillStyle(0x2a1840);
      legs.forEach((x) => g.fillRoundedRect(x, 24, 4, 4, 1.5)); // legs
    };
    // A5: a 3-position leg-splay cycle (base -> step -> step2) cycled speed-synced by
    // the rig. base = neutral, step = splayed-out reach, step2 = tucked-in push.
    make("bug", 44, 28, bug([8, 16, 28, 36]));
    make("bug_step", 44, 28, bug([6, 18, 26, 38]));
    make("bug_step2", 44, 28, bug([10, 14, 30, 34]));
    // P7: World-2 scuttlebug variant — darker carapace with a hex-spot pattern so
    // it reads as a tougher sub-species. Same silhouette/leg frames as the W1 bug
    // (selected by world in GameScene); pure baked art, no motion added here.
    const bugW2 = (legs) => (g) => {
      // tougher sub-species: same glossy carapace recipe, darker plum shell + hex inlays
      g.fillStyle(0x3d2568).fillRoundedRect(2, 4, 40, 20, { tl: 18, tr: 18, bl: 4, br: 4 });
      g.fillStyle(0x241245, 0.55).fillRoundedRect(2, 15, 40, 9, { tl: 0, tr: 0, bl: 4, br: 4 }); // under-shade
      g.fillStyle(0x6a48a0, 0.4).fillRoundedRect(4, 5, 36, 7, { tl: 16, tr: 16, bl: 0, br: 0 }); // top-light
      g.lineStyle(1.5, 0x6a48a0).strokeRoundedRect(2, 4, 40, 20, { tl: 18, tr: 18, bl: 4, br: 4 });
      g.lineStyle(1.5, 0x6a48a0, 0.7).lineBetween(22, 5, 22, 22);
      // hex spots: dark inlays with a lit rim, scattered over the shell
      const hex = (cx, cy, r) => {
        const pts = [];
        for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 6; pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
        g.fillStyle(0x281545).fillPoints(pts, true);
        g.lineStyle(1, 0x8464c4, 0.85).strokePoints(pts, true, true);
      };
      hex(12, 12, 3.4); hex(32, 12, 3.4); hex(22, 16, 3.2); hex(13, 20, 2.5); hex(31, 20, 2.5);
      // cool glossy shell sheen + hot pip
      g.fillStyle(0x8f70c8, 0.4).fillEllipse(15, 10, 14, 6);
      g.fillStyle(0xd8c6f2, 0.78).fillEllipse(13, 9, 5, 2.4);
      g.fillStyle(0xffffff, 0.85).fillCircle(11, 8, 1.1);
      // cute glossy amber eyes (positions preserved)
      [10, 34].forEach((cx) => {
        g.fillStyle(0xffe066, 0.16).fillCircle(cx, 14, 5);
        g.fillStyle(0xffe066).fillCircle(cx, 14, 3);
        g.fillStyle(0x6a4a10).fillCircle(cx + 0.4, 14.6, 1.1);
        g.fillStyle(0xfff6c2, 0.95).fillCircle(cx - 0.9, 13, 0.9);
      });
      g.fillStyle(0x160c2c);
      legs.forEach((x) => g.fillRoundedRect(x, 24, 4, 4, 1.5)); // legs
    };
    make("bug_w2", 44, 28, bugW2([8, 16, 28, 36]));
    make("bug_w2_step", 44, 28, bugW2([6, 18, 26, 38]));
    make("bug_w2_step2", 44, 28, bugW2([10, 14, 30, 34])); // A5: W2 third leg frame
    // P7: pooled squish splat decal (purple ichor) — placed on a squish and faded
    // out over ~2s by a per-decal alpha tween in GameScene (event-driven, not a
    // per-frame animation). Pre-coloured so it reads under the Canvas renderer.
    make("bug_splat", 50, 26, (g) => {
      g.fillStyle(0x4a2870, 0.9).fillEllipse(25, 16, 34, 12);
      g.fillStyle(0x6d3fa8, 0.85).fillEllipse(25, 14, 28, 11);
      g.fillStyle(0x6d3fa8, 0.8).fillEllipse(15, 12, 12, 8); g.fillEllipse(35, 13, 12, 8);
      // flung droplets around the smear
      g.fillStyle(0x9a6fd4, 0.8);
      [[6, 9, 2.4], [44, 10, 2.2], [11, 22, 1.8], [40, 21, 2], [25, 5, 1.7], [31, 22, 1.6]].forEach(([x, y, r]) => g.fillCircle(x, y, r));
      // wet highlight
      g.fillStyle(0xc9aef0, 0.45).fillEllipse(20, 11, 9, 3);
    });
    // additive eye-glow overlay: brightens the scuttlebug's eyes when a player
    // is within ~200px (tint no-ops on Canvas, so this is a baked yellow blob).
    make("bug_glow", 48, 24, (g) => {
      [10, 34].forEach((cx) => {
        for (let r = 9; r > 0; r -= 1.5) {
          g.fillStyle(0xffe066, 0.09 * (1 - r / 9));
          g.fillCircle(cx + 2, 14, r);
        }
      });
    });
    // purple shell-shards flung when a scuttlebug is squished (pre-coloured so no
    // per-particle tint is needed under the Canvas renderer).
    make("shard", 10, 10, (g) => {
      g.fillStyle(0x9a6fd4).fillTriangle(1, 8, 5, 0, 9, 8);
      g.fillStyle(0x6d3fa8).fillTriangle(2, 9, 5, 3, 8, 9);
    });
    make("crusher", 84, 60, (g) => {
      g.fillStyle(0x39415e).fillRect(30, 0, 24, 14); // piston
      g.fillStyle(0x2a3350).fillRect(30, 0, 24, 3); // piston top-shade
      softBody(g, { x: 2, y: 12, w: 80, h: 40, r: 3, base: 0x4a5578, shadeLo: 0x2f3652, shadeHi: 0x6b78a8, outline: 0x6b78a8 });
      // red-hot crushing teeth: amber-hot metal wrapped in a danger-red halo
      for (let x = 4; x < 80; x += 16) {
        const cx = x + 8;
        g.fillStyle(COLORS.hazard, 0.16).fillCircle(cx, 54, 11); // heat bloom
        g.fillStyle(COLORS.hazard, 0.34);
        g.beginPath(); g.moveTo(x - 1, 51); g.lineTo(cx, 61); g.lineTo(x + 17, 51); g.closePath(); g.fillPath();
        g.fillStyle(COLORS.amber);
        g.beginPath(); g.moveTo(x, 52); g.lineTo(cx, 60); g.lineTo(x + 16, 52); g.closePath(); g.fillPath();
        g.fillStyle(0xfff2b0, 0.9);
        g.beginPath(); g.moveTo(x + 4, 52.5); g.lineTo(cx, 57.5); g.lineTo(x + 12, 52.5); g.closePath(); g.fillPath(); // white-hot tip
      }
    });
    const craneBody = (dead) => (g) => {
      // Lumen Lab: smooth industrial cab — base + under-shade + top-light + crisp rim
      const base = dead ? 0x3a3d49 : 0x39415e, rim = dead ? 0x555a6a : 0x6b78a8;
      g.fillStyle(base).fillRoundedRect(6, 6, 120, 44, 8);
      g.fillStyle(dead ? 0x2b2e38 : 0x2a3350, 0.5).fillRoundedRect(6, 30, 120, 20, { tl: 0, tr: 0, bl: 8, br: 8 }); // under-shade
      g.fillStyle(dead ? 0x4a4d5c : 0x59648f, 0.4).fillRoundedRect(8, 7, 116, 12, { tl: 7, tr: 7, bl: 0, br: 0 }); // top-light
      g.lineStyle(3, rim).strokeRoundedRect(6, 6, 120, 44, 8);
      // cabin-window housing (bezel + corner bolts) around KOBI's eye
      g.fillStyle(dead ? 0x2a2d37 : 0x232a42).fillRoundedRect(48, 12, 36, 32, 7);
      g.lineStyle(2.5, dead ? 0x4a4d5c : 0x8892b8).strokeRoundedRect(48, 12, 36, 32, 7);
      g.fillStyle(dead ? 0x555a6a : 0x9aa6cc);
      [[52, 16], [80, 16], [52, 40], [80, 40]].forEach(([x, y]) => g.fillCircle(x, y, 1.6));
      if (dead) {
        // powered-down: dim grey eye with an X (reads without tint under Canvas)
        g.fillStyle(0x4a4d5c).fillCircle(66, 28, 12);
        g.lineStyle(3, 0x22242c);
        g.lineBetween(60, 22, 72, 34);
        g.lineBetween(72, 22, 60, 34);
        g.lineStyle(5, 0x3f434f);
      } else {
        // KOBI's eye INSIDE the cabin window at socket (66,28): a haloed glowing
        // socket (glow read) + glassy sclera + cyan iris + catchlight. Sclera r10
        // stays within the lid's r10.5 coverage (anchor 10).
        g.fillStyle(COLORS.neon, 0.12).fillCircle(66, 28, 13); // socket bloom
        g.fillStyle(0x0a1420).fillCircle(66, 28, 12);   // socket
        g.fillStyle(0xf0f8ff).fillCircle(66, 28, 10);   // sclera
        g.lineStyle(3, COLORS.neon, 0.28).strokeCircle(66, 28, 9); // inner mood-ring glow
        g.fillStyle(COLORS.neon).fillCircle(66, 28, 6); // KOBI cyan iris
        g.fillStyle(0x0c1622).fillCircle(66, 28, 3);    // neutral forward pupil
        g.fillStyle(0xffffff, 0.9).fillCircle(63.5, 25.5, 1.8); // catchlight
        g.fillStyle(0xffffff, 0.1).fillTriangle(50, 13, 66, 13, 50, 30); // glass glare
        g.lineStyle(5, 0x4a5578);
      }
      // claw
      g.lineBetween(46, 50, 38, 72);
      g.lineBetween(86, 50, 94, 72);
      g.lineBetween(66, 50, 66, 70);
    };
    make("crane", 132, 76, craneBody(false));
    make("crane_dead", 132, 76, craneBody(true)); // grey-out swap on defeat
    // rail trolley the crane hangs from — clamped to the rail, cable drawn in-game
    make("trolley", 40, 20, (g) => {
      g.fillStyle(0x2a3350).fillCircle(9, 5, 4); g.fillCircle(31, 5, 4); // rail wheels
      g.fillStyle(0x39415e).fillRoundedRect(4, 6, 32, 12, 4);
      g.fillStyle(0x59648f, 0.4).fillRoundedRect(6, 7, 28, 4, { tl: 3, tr: 3, bl: 0, br: 0 }); // top-light
      g.lineStyle(2, 0x6b78a8).strokeRoundedRect(4, 6, 32, 12, 4);
      // amber status strip with a soft glow
      g.fillStyle(COLORS.amber, 0.14).fillRect(8, 8, 24, 5);
      g.fillStyle(COLORS.amber, 0.9).fillRect(10, 9, 20, 3);
      g.fillStyle(0xffe0a8, 0.9).fillRect(12, 9.4, 6, 1.2); // hot glint
    });
    // magenta pulse glow behind a yankable crane plate (rest state) — baked
    // colour, alpha-pulsed in-game (tint no-ops on Canvas).
    make("plate_glow", 56, 56, (g) => {
      for (let r = 28; r > 0; r -= 2) {
        g.fillStyle(COLORS.magenta, 0.06 * (1 - r / 28));
        g.fillCircle(28, 28, r);
      }
    });
    // concentric pulse ring for exposed core pods (orange, expands+fades in-game).
    // P7: three static per-state tints — the ring hue escalates with how many
    // cores have already been crunched (selected in GameScene at spawn; not
    // animated between tints). Canvas-safe pre-coloured art (setTint no-ops).
    const podRing = (c) => (g) => {
      const outer = c === 0 ? 0xff8855 : c === 1 ? 0xffb347 : 0xff5566;
      const inner = c === 0 ? 0xffd9a0 : c === 1 ? 0xffe9c0 : 0xffd0d0;
      g.lineStyle(3, outer).strokeCircle(24, 24, 20);
      g.lineStyle(1.5, inner, 0.7).strokeCircle(24, 24, 16);
    };
    make("pod_ring", 48, 48, podRing(0));
    make("pod_ring_c1", 48, 48, podRing(1));
    make("pod_ring_c2", 48, 48, podRing(2));
    // white shockwave ring for the crane slam impact (scale+fade pooled image)
    make("shockring", 72, 72, (g) => {
      g.lineStyle(10, 0xffffff, 0.1).strokeCircle(36, 36, 30); // slam-impact bloom
      g.lineStyle(5, 0xffffff, 0.95).strokeCircle(36, 36, 30);
      g.lineStyle(2, 0xffd9a0, 0.8).strokeCircle(36, 36, 24);
    });
    // P7: armour plate ART with corner bolt heads + hairline cracks that DEEPEN
    // per fight stage. GameScene swaps crane_plate -> _c1 -> _c2 by reading the
    // crane's podsStomped count (never writes it); the fight state machine and
    // timings are untouched. `crack` 0/1/2 = pristine / hairline / fracturing.
    const cranePlate = (crack) => (g) => {
      g.fillStyle(0x8892b8).fillRoundedRect(3, 3, 34, 34, 8);
      g.lineStyle(3, COLORS.magenta).strokeRoundedRect(3, 3, 34, 34, 8);
      // corner bolt heads (seated dark, lit cap)
      [[9, 9], [31, 9], [9, 31], [31, 31]].forEach(([x, y]) => {
        g.fillStyle(0x5a6488).fillCircle(x, y, 2.4);
        g.fillStyle(0x3a4160).fillCircle(x, y, 1);
      });
      // central core node with a haloed magenta glow (glow recipe)
      g.fillStyle(COLORS.magenta, 0.16).fillCircle(20, 20, 9);
      g.fillStyle(COLORS.magenta, 0.32).fillCircle(20, 20, 6.5);
      g.fillStyle(COLORS.magenta).fillCircle(20, 20, 5); // hot core
      g.fillStyle(0xffd0f4, 0.85).fillCircle(18.5, 18.5, 1.8); // specular
      if (crack >= 1) {
        g.lineStyle(1, 0x2a2f45, 0.85);
        g.lineBetween(20, 20, 8, 6); g.lineBetween(20, 20, 33, 14);
      }
      if (crack >= 2) {
        g.lineStyle(1.7, 0x161a2a, 0.95);
        g.lineBetween(20, 20, 6, 31); g.lineBetween(20, 20, 31, 34);
        g.lineStyle(1, 0x2a2f45, 0.8);
        g.lineBetween(8, 6, 4, 4); g.lineBetween(33, 14, 37, 12); // branching hairlines
      }
    };
    make("crane_plate", 40, 40, cranePlate(0));
    make("crane_plate_c1", 40, 40, cranePlate(1));
    make("crane_plate_c2", 40, 40, cranePlate(2));
    make("pod", 36, 40, (g) => {
      g.fillStyle(0x2a3350).fillRoundedRect(6, 32, 24, 8, 2); // socket base
      g.lineStyle(1.5, 0x44548c).strokeRoundedRect(6, 32, 24, 8, 2);
      // exposed core: layered amber bloom -> hot body -> white-hot centre + specular
      g.fillStyle(0xff8855, 0.16).fillCircle(18, 20, 17);
      g.fillStyle(0xff8855, 0.34).fillCircle(18, 20, 14.5);
      g.fillStyle(0xff8855).fillCircle(18, 20, 13);
      g.lineStyle(1.5, 0xffb37a, 0.8).strokeCircle(18, 20, 13);
      g.fillStyle(0xffd9a0).fillCircle(18, 20, 6);
      g.fillStyle(0xfff2d8, 0.95).fillCircle(15.5, 17.5, 2.2); // hot specular
    });
    make("rail", 48, 10, (g) => {
      // smooth steel rail — soft top-light + dark channel. All bands run full width
      // (constant along x) so it tiles cleanly along a horizontal run.
      g.fillStyle(0x39415e).fillRect(0, 2, 48, 6);
      g.fillStyle(0x4a5578, 0.7).fillRect(0, 2, 48, 1.4); // top-light lip
      g.fillStyle(0x161d30).fillRect(0, 4.4, 48, 1.6); // dark channel
      g.fillStyle(0x232a42).fillRect(0, 7, 48, 1); // under-shade
    });

    // --- world 2 -------------------------------------------------------------
    // P4: shimmer "~" walls redrawn as a vertical ENERGY CURTAIN (violet — the
    // phase-skill hue) so they read as "a wall you can phase through", visually
    // DISTINCT from the red jagged hazard strips. The base is soft vertical bands
    // with a bright central seam; the drifting `phaseflow` overlay adds rising
    // sine-banded energy. Bands are constant along Y so a stacked column tiles
    // seamlessly. Everything DRAWN (no tint) so it reads under the Canvas renderer.
    make("phasewall", 48, 48, (g) => {
      // translucent violet field so the wall region reads as filled
      g.fillStyle(0x2c1e4e, 0.62).fillRect(0, 0, 48, 48);
      // vertical energy bands: soft violet columns, brighter toward the centre seam
      for (let x = 0; x < 48; x++) {
        const d = 1 - Math.abs(x - 24) / 24; // 0 edges -> 1 centre
        const band = 0.5 + 0.5 * Math.sin((x / 48) * Math.PI * 6); // ripples across
        const a = 0.10 + 0.30 * d * (0.5 + 0.5 * band);
        g.fillStyle(0xc39dff, a).fillRect(x, 0, 1, 48);
      }
      // bright central seam (the "phase-through" spine) with a haloed glow — all
      // full-height rects so every band stays constant along Y and stacks tile.
      g.fillStyle(0xc39dff, 0.1).fillRect(19, 0, 10, 48); // wide seam bloom
      g.fillStyle(0xd7bbff, 0.22).fillRect(21, 0, 6, 48); // inner bloom
      g.fillStyle(0xe8d8ff, 0.6).fillRect(23, 0, 2, 48);
      g.fillStyle(0xffffff, 0.35).fillRect(23.5, 0, 1, 48);
      // soft violet frame edges (top/bottom kept faint so vertical stacks blend)
      g.fillStyle(0xc39dff, 0.5).fillRect(1, 0, 2, 48).fillRect(45, 0, 2, 48);
    });
    // Drifting rising energy for phase-walls: horizontal sine-banded glow that
    // tiles vertically (whole cycles over 48px) and is scrolled via tilePositionY
    // in GameScene so the curtain flows UPWARD. Additive at add time.
    make("phaseflow", 48, 48, (g) => {
      for (let y = 0; y < 48; y++) {
        const b = 0.5 + 0.5 * Math.sin((y / 48) * Math.PI * 2); // one full cycle
        g.fillStyle(0xd7bbff, 0.06 + 0.16 * b * b).fillRect(0, y, 48, 1);
      }
      // a couple of brighter drifting filaments, each wrapped in a soft glow
      // (full-height vertical rects — they don't affect the vertical sine tiling)
      [15, 34].forEach((x) => {
        g.fillStyle(0xd7bbff, 0.12).fillRect(x - 3, 0, 6, 48); // filament glow
        g.fillStyle(0xece0ff, 0.3).fillRect(x - 1, 0, 2, 48);
      });
    });
    // Rising shimmer sparkle (WebGL-only pooled emitter) — soft violet mote.
    make("shimspark", 10, 10, (g) => {
      g.fillStyle(0xd7bbff, 0.16).fillCircle(5, 5, 5); // outer bloom
      g.fillStyle(0xd7bbff, 0.5).fillCircle(5, 5, 4);
      g.fillStyle(0xf2e8ff, 0.95).fillCircle(5, 5, 1.8);
    });
    make("duct", 48, 20, (g) => {
      g.fillStyle(0x232c48).fillRect(0, 0, 48, 20);
      // darker interior slot under the lip
      g.fillStyle(0x121829).fillRect(3, 9, 42, 9);
      g.fillStyle(COLORS.mint, 0.08).fillRect(3, 9, 42, 4); // faint cool intake breath
      g.lineStyle(2, 0x44548c).strokeRect(1, 1, 46, 18); // lip frame
      g.lineStyle(1, 0x5a6aa0, 0.5).strokeRect(1, 1, 46, 2); // top-light lip
      // tiny fan-slit lines across the slot
      g.lineStyle(1, 0x2f4066, 0.85);
      for (let x = 7; x < 46; x += 7) g.lineBetween(x, 10, x, 17);
    });
    // P4: "squeeze through here" affordance for duct slots — a downward double
    // chevron (into the crawl gap) over short inward air-lines. Green (Tiny's
    // hue). Bobbed + alpha-pulsed by a shared per-duct tween in GameScene.
    make("duct_hint", 28, 28, (g) => {
      const c = 0x9dffc4;
      // soft green glow behind the "squeeze in here" chevrons (meaning preserved)
      g.lineStyle(7, c, 0.1);
      g.beginPath(); g.moveTo(8, 3); g.lineTo(14, 11); g.lineTo(20, 3); g.strokePath();
      g.beginPath(); g.moveTo(8, 9); g.lineTo(14, 17); g.lineTo(20, 9); g.strokePath();
      g.lineStyle(3, c, 0.95);
      g.beginPath(); g.moveTo(8, 3); g.lineTo(14, 11); g.lineTo(20, 3); g.strokePath();
      g.beginPath(); g.moveTo(8, 9); g.lineTo(14, 17); g.lineTo(20, 9); g.strokePath();
      // inward air-lines (short horizontal dashes converging under the arrow)
      g.lineStyle(2, c, 0.55);
      g.lineBetween(3, 23, 11, 23); g.lineBetween(17, 23, 25, 23);
    });
    make("fan", 48, 22, (g) => {
      g.fillStyle(0x2a3350).fillRect(0, 10, 48, 12);
      // mint updraft glow: haloed grille rim + a blooming air-arrow
      g.lineStyle(6, COLORS.mint, 0.12).strokeRect(1, 11, 46, 10);
      g.lineStyle(2, COLORS.mint, 0.95).strokeRect(1, 11, 46, 10);
      g.fillStyle(COLORS.mint, 0.18).fillTriangle(24, -3, 12, 13, 36, 13); // air bloom
      g.fillStyle(COLORS.mint, 0.95).fillTriangle(24, 0, 16, 12, 32, 12);
      g.fillStyle(0xeafff4, 0.9).fillTriangle(24, 3, 20, 11, 28, 11); // hot core
    });
    // Roller: `alert` bakes a red eye/shell flush so the alert state reads under
    // Canvas (tint no-ops). The pupil is a SEPARATE `roller_pupil` overlay that
    // slides toward the patrol direction, and the wheels get `roller_wheel`
    // spoke-dot overlays that spin — so the base eye here has no baked pupil.
    const roller = (alert) => (g) => {
      const body = alert ? 0xa83a2e : 0x8a4a3a;
      const rim = alert ? 0xff6a52 : 0xc4705a;
      // Lumen Lab: rounded cab — base + under-shade + top-light + crisp same-hue
      // rim (kept manual so the 36×22 silhouette + eye anchor at local(0,-5) hold).
      g.fillStyle(body).fillRoundedRect(3, 2, 36, 22, 9);
      g.fillStyle(alert ? 0x6f2419 : 0x5c3123, 0.5).fillRoundedRect(3, 14, 36, 10, { tl: 0, tr: 0, bl: 9, br: 9 }); // under-shade
      g.fillStyle(alert ? 0xc85643 : 0xb0705c, 0.4).fillRoundedRect(5, 3, 32, 7, { tl: 8, tr: 8, bl: 0, br: 0 }); // top-light
      g.lineStyle(2, rim).strokeRoundedRect(3, 2, 36, 22, 9);
      // riveted cab detail — corner rivets so the cab reads as plated metal
      g.fillStyle(alert ? 0x7c2a20 : 0x6d3a2d);
      [[7, 6], [7, 20], [35, 6], [35, 20]].forEach(([x, y]) => g.fillCircle(x, y, 1.3));
      // big glass lens eye (KOBI cyclops) at the (21,12) anchor: haloed glass rim
      // (cyan at rest / hot red alert) + sclera + curved glint. The sliding
      // roller_pupil overlay rides this sclera.
      const lensC = alert ? 0xff5566 : 0x33c2d4;
      g.fillStyle(lensC, alert ? 0.26 : 0.18).fillEllipse(21, 12, 34, 20); // lens glow bloom
      g.fillStyle(0xf2eefc).fillEllipse(21, 12, 30, 16);                    // sclera
      g.lineStyle(3, lensC, 0.22).strokeEllipse(21, 12, 32, 18);           // halo echo
      g.lineStyle(2, lensC).strokeEllipse(21, 12, 30, 16);                 // bright rim
      g.fillStyle(alert ? 0xffdcdc : 0xd8f6fb, 0.5).fillEllipse(15, 9, 10, 4); // sheen
      g.fillStyle(0xffffff, 0.85).fillCircle(13, 8, 1.4);                  // hot glass pip
      if (alert) { // angry brow when alerted
        g.lineStyle(2.5, 0x7c2a20).lineBetween(9, 5, 20, 7.5);
        g.lineStyle(2.5, 0x7c2a20).lineBetween(33, 5, 22, 7.5);
      }
      g.fillStyle(0x1a1420);
      g.fillCircle(12, 28, 5.5); g.fillCircle(30, 28, 5.5); // wheel hubs at ±9,+11
    };
    make("roller", 42, 34, roller(false));
    make("roller_alert", 42, 34, roller(true));
    make("roller_pupil", 8, 8, (g) => {
      g.fillStyle(0x141018).fillCircle(4, 4, 3);
      g.fillStyle(0xffffff, 0.85).fillCircle(3, 3, 1.1);
    });
    // spoke-dot wheel overlay: off-centre dots so rotation reads as rolling.
    // P7: fuller wheel ART — rubber tire + tread notches + a bolted hub.
    make("roller_wheel", 14, 14, (g) => {
      g.fillStyle(0x241a15).fillCircle(7, 7, 6.5);   // tire
      g.lineStyle(1, 0x120c0a).strokeCircle(7, 7, 6.5);
      g.fillStyle(0x120c0a);                          // tread notches
      for (let i = 0; i < 8; i++) { const a = (Math.PI / 4) * i; g.fillCircle(7 + Math.cos(a) * 6.4, 7 + Math.sin(a) * 6.4, 0.9); }
      g.fillStyle(0x8a4a3a).fillCircle(7, 7, 3.6);   // hub
      g.fillStyle(0xc4705a);                          // hub bolts (spoke read)
      g.fillCircle(7, 3.6, 1.3); g.fillCircle(7, 10.4, 1.3);
      g.fillCircle(3.6, 7, 1.3); g.fillCircle(10.4, 7, 1.3);
      g.fillStyle(0x3a2a24).fillCircle(7, 7, 1.5);   // axle
    });
    // P7: warning-lamp ART mounted on the cab roof — lit/unlit texture STATES
    // (swapped by roller state in GameScene). Static dome, NOT spinning (lamp
    // spin is A6, deliberately not implemented).
    make("roller_lamp", 14, 12, (g) => {
      g.fillStyle(0x2a1a16).fillRect(4, 8, 6, 4);            // mount
      g.fillStyle(0x6a3b20).fillRoundedRect(2, 1, 10, 8, 4); // unlit amber dome
      g.fillStyle(0x9a6a3a, 0.9).fillEllipse(6, 4, 5, 2.6);
      g.lineStyle(1, 0x3a2418).strokeRoundedRect(2, 1, 10, 8, 4);
    });
    make("roller_lamp_lit", 14, 12, (g) => {
      g.fillStyle(0xff5566, 0.4).fillCircle(7, 5, 6.5);      // lit halo (alpha, canvas-safe)
      g.fillStyle(0x2a1a16).fillRect(4, 8, 6, 4);            // mount
      g.fillStyle(0xff5566).fillRoundedRect(2, 1, 10, 8, 4); // lit red dome
      g.fillStyle(0xffd0d0, 0.95).fillEllipse(6, 4, 5, 2.6);
      g.lineStyle(1, 0xff8a8a).strokeRoundedRect(2, 1, 10, 8, 4);
    });
    // pooled "!" alert popup shown above an alerted roller (not per-frame alloc)
    make("excl", 22, 30, (g) => {
      g.fillStyle(0x1a0f14, 0.92).fillRoundedRect(1, 1, 20, 28, 6);
      g.lineStyle(2, COLORS.hazard).strokeRoundedRect(1, 1, 20, 28, 6);
      g.fillStyle(0xff5566).fillRoundedRect(9, 6, 4, 12, 2);
      g.fillCircle(11, 22, 2.6);
    });
    // 4-point sparkle: warden shove-impact star + dizzy stars circling a topple
    make("star", 20, 20, (g) => {
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i - Math.PI / 2;
        const rad = i % 2 === 0 ? 9 : 3.2;
        pts.push({ x: 10 + Math.cos(a) * rad, y: 10 + Math.sin(a) * rad });
      }
      g.fillStyle(0xffe066, 0.18).fillCircle(10, 10, 8); // sparkle bloom
      g.fillStyle(0xffe066).fillPoints(pts, true);
      g.fillStyle(0xfff6c2).fillCircle(10, 10, 2);
    });
    // P7: warden — riveted face-plate + a baked visor-slit glow, a chest plate
    // for the badge-number stencil (drawn per-warden in GameScene), and a
    // defeat-pose variant (cross-eye X pupils) the existing defeat state swaps to.
    // All static/baked: the topple sway is A7 and is not added here.
    const wardenBody = (defeat) => (g) => {
      // Lumen Lab: soft-armored tower — base + under-shade + top-light + crisp rim
      g.fillStyle(0x3a5e46).fillRoundedRect(5, 8, 32, 50, 7);
      g.fillStyle(0x244033, 0.5).fillRoundedRect(5, 38, 32, 20, { tl: 0, tr: 0, bl: 7, br: 7 }); // under-shade
      g.fillStyle(0x5a8a6c, 0.4).fillRoundedRect(7, 9, 28, 13, { tl: 6, tr: 6, bl: 0, br: 0 }); // top-light
      g.lineStyle(2, 0x59a06e).strokeRoundedRect(5, 8, 32, 50, 7);
      // riveted face-plate: raised head panel with corner rivets
      g.fillStyle(0x32523d).fillRoundedRect(8, 11, 26, 18, 5);
      g.lineStyle(1.5, 0x4a7d5b).strokeRoundedRect(8, 11, 26, 18, 5);
      g.fillStyle(0x6fbf8a);
      [[11, 14], [31, 14], [11, 26], [31, 26]].forEach(([x, y]) => g.fillCircle(x, y, 1.2));
      if (defeat) {
        // knocked-out pose: dark visor with two cross-eye X pupils
        g.fillStyle(0x0c1610).fillRoundedRect(10, 15, 22, 11, 4);
        g.lineStyle(2, 0xffe066);
        [16, 27].forEach((cx) => {
          g.lineBetween(cx - 2.6, 18, cx + 2.6, 23);
          g.lineBetween(cx + 2.6, 18, cx - 2.6, 23);
        });
      } else {
        // GLOWING visor slit at the anchor band (x-1..15,y-12 -> tex 20..36,y19):
        // layered halo bloom -> inner glow -> hot slit -> white-hot eye (Canvas-safe).
        g.fillStyle(0x142018).fillRoundedRect(20, 14, 16, 10, 4);      // visor faces right
        g.fillStyle(0xffe066, 0.12).fillRoundedRect(19, 13, 18, 12, 5); // wide glow halo
        g.fillStyle(0xffe066, 0.28).fillRoundedRect(22, 16, 13, 6, 3);  // inner glow
        g.fillStyle(0xffe066, 0.6).fillRect(23, 18, 11, 2);            // hot slit
        g.fillStyle(0xfff3b0).fillCircle(31, 19, 2.4);                 // hot eye
        g.fillStyle(0xffffff, 0.9).fillCircle(30.3, 18.3, 0.9);        // eye pip
      }
      g.fillStyle(0x59a06e).fillRect(9, 34, 24, 3); // belt
      // chest plate (the badge digit is drawn over this per-warden in GameScene)
      g.fillStyle(0x2c4a38).fillRoundedRect(12, 38, 18, 14, 3);
      g.lineStyle(1, 0x4a7d5b).strokeRoundedRect(12, 38, 18, 14, 3);
      g.fillStyle(0x6fbf8a, 0.35).fillRect(14, 40, 14, 2); // chest-plate sheen
      g.fillStyle(0x1a2a20).fillRect(8, 58, 26, 4); // feet
    };
    make("warden", 42, 62, wardenBody(false));
    make("warden_defeat", 42, 62, wardenBody(true));
    make("nozzle", 26, 16, (g) => {
      softBody(g, { x: 2, y: 0, w: 22, h: 10, r: 2, base: 0x4a5578, shadeHi: 0x8892b8 });
      g.fillStyle(0x8892b8).fillRect(7, 10, 12, 6); // muzzle
      g.fillStyle(PARTICLES.steam.body, 0.14).fillRect(6, 12, 14, 4); // cool steam breath
      g.fillStyle(PARTICLES.steam.core, 0.7).fillRect(11, 12, 4, 3); // hot jet mouth
    });
    // GFX2 "Lumen Lab" HUD skill icons: a subtle frosted-glass chip backing +
    // a glowing glyph in the skill's SKILL_INFO colour, readable at 26px badge
    // size. Glyph content is kept inside ~[3,23] so it never touches the chip rim.
    make("icon_phase", 26, 26, (g) => {
      const C = 0xc39dff;
      iconChip(g, C);
      // shimmer wall the ghost is stepping through (left band)
      g.fillStyle(C, 0.22).fillRoundedRect(4, 5, 5, 16, 2);
      g.fillStyle(C, 0.6).fillRect(6, 5, 1.5, 16);
      // ghost body — soft glow, then a bright rounded form phasing through
      iconGlow(g, 15, 13, 9, C, 0.24);
      g.fillStyle(0xefe6ff, 1).fillCircle(15, 11, 5);
      g.fillStyle(0xefe6ff, 1).fillRoundedRect(10, 11, 10, 9, { tl: 5, tr: 5, bl: 2, br: 2 });
      g.fillStyle(0x3a2a5c, 1).fillCircle(13.4, 11, 1.2).fillCircle(16.6, 11, 1.2);
    });
    make("icon_tiny", 26, 26, (g) => {
      const C = 0x9dffc4;
      iconChip(g, C);
      iconGlow(g, 13, 14, 8, C, 0.22);
      // little robot: antenna, rounded body, glowing visor
      g.lineStyle(1.5, C, 1).lineBetween(13, 11, 13, 7);
      g.fillStyle(0xeafff2, 1).fillCircle(13, 6.2, 1.5);
      g.fillStyle(C, 1).fillRoundedRect(8, 10, 10, 9, 3);
      g.fillStyle(0x0e2018, 1).fillRoundedRect(9.5, 12, 7, 4, 2);
      g.fillStyle(0xeafff2, 0.95).fillRect(10.6, 13, 2, 1.6);
    });

    // --- misc --------------------------------------------------------------
    make("reticle", 44, 44, (g) => {
      g.lineStyle(7, COLORS.neon, 0.12).strokeCircle(22, 22, 15); // soft targeting glow
      g.lineStyle(3, 0xffffff, 0.95).strokeCircle(22, 22, 15);
      g.lineStyle(3, 0xffffff, 0.95);
      [[22, 0, 22, 9], [22, 35, 22, 44], [0, 22, 9, 22], [35, 22, 44, 22]].forEach(([a, b, c, d]) => g.lineBetween(a, b, c, d));
    });
    make("px", 6, 6, (g) => g.fillStyle(0xffffff).fillRect(0, 0, 6, 6));
    // Rounded key-cap (Sprint 10 tutorial glyph prompts). Neutral body drawn here;
    // the coloured border + letter are drawn per-player in GameScene.addGlyphs
    // (setTint no-ops under Canvas, so the player colour is a drawn overlay).
    make("keycap", 36, 36, (g) => {
      g.fillStyle(0x0a0f1e, 0.9).fillRoundedRect(1, 1, 34, 34, 8); // frosted-glass body
      g.fillStyle(0x1a2338, 0.9).fillRoundedRect(3, 2, 30, 26, 7); // raised glass face
      g.lineStyle(1.5, 0xffffff, 0.1).strokeRoundedRect(3, 2, 30, 26, 7); // inner top-edge highlight
      sheen(g, { x: 3, y: 2, w: 30, h: 26, a: 0.05 }); // diagonal glass glaze
      g.fillStyle(0xffffff, 0.1).fillRoundedRect(5, 4, 26, 7, 4); // top gloss
    });
    make("icon_grapple", 26, 26, (g) => {
      const C = COLORS.neon;
      iconChip(g, C);
      // rope from anchor to hook — soft glow pass, then the crisp line
      g.lineStyle(4, C, 0.22).lineBetween(6, 6, 16, 16);
      g.lineStyle(2, C, 1).lineBetween(6, 6, 16, 16);
      g.fillStyle(0xd8fbff, 1).fillCircle(6, 6, 2.6); // anchor bolt
      // hook claw ring (glow + bright open curl)
      g.lineStyle(5, C, 0.22).strokeCircle(17, 17, 5.5);
      g.lineStyle(2.5, 0xd8fbff, 1);
      g.beginPath(); g.arc(17, 17, 5.5, Math.PI * 0.1, Math.PI * 1.2, false); g.strokePath();
    });
    make("icon_heavy", 26, 26, (g) => {
      const C = COLORS.amber;
      iconChip(g, C);
      iconGlow(g, 13, 15, 9, C, 0.2);
      // kettlebell weight — soft-shaded round body + a glowing handle
      g.lineStyle(2.5, 0xffd9a0, 1);
      g.beginPath(); g.arc(13, 12, 4, Math.PI * 0.85, Math.PI * 2.15, false); g.strokePath();
      softBody(g, { x: 6, y: 11, w: 14, h: 10, r: 4, base: C, shadeHi: 0xffd9a0 });
      g.fillStyle(0x7a4e12, 1).fillRoundedRect(9, 15, 8, 4, 2); // weight label plate
      g.fillStyle(0xffe9c4, 0.9).fillRect(10, 16, 6, 1.4);
    });

    // --- Sprint 8 game-feel FX textures ------------------------------------
    // Small hook head drawn at the far end of a grapple rope (claw + shaft).
    make("hookhead", 16, 16, (g) => {
      g.fillStyle(0xdfe8ff).fillRect(6, 1, 4, 7);        // shaft
      g.lineStyle(3, 0xdfe8ff, 1);
      g.beginPath();
      g.arc(8, 10, 5, Math.PI * 0.1, Math.PI * 0.9, false); // claw curl
      g.strokePath();
      g.fillStyle(0xffffff).fillCircle(8, 8, 2.4);        // bright knuckle
    });
    // Short speed-line streak flicked off a zipping grappler (additive white).
    make("streak", 16, 4, (g) => {
      g.fillStyle(0xffffff, 0.9).fillRect(0, 1, 16, 2);
      g.fillStyle(0xffffff, 0.5).fillRect(0, 0, 16, 4);
    });
    // Bolt/nut debris flung on death (small hex nut + glint).
    make("bolt", 10, 10, (g) => {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        pts.push({ x: 5 + Math.cos(a) * 4.5, y: 5 + Math.sin(a) * 4.5 });
      }
      g.fillStyle(0xc7d0e6).fillPoints(pts, true);
      g.fillStyle(0x54607f).fillCircle(5, 5, 1.8);
    });
    // --- P1 title-screen ambient layers ------------------------------------
    // Distant lab skyline silhouette (drawn ONCE): crane arms, storage vats,
    // antenna masts + building blocks with dim windows. Placed behind the title
    // cast; the antenna-tip blink lights are separate additive dots in
    // TitleScene at the tip coords recorded below (base y = 280):
    //   antenna tips (texture coords): [210,64] [720,50] [1060,84]
    make("labskyline", 1280, 300, (g) => {
      // TRANSPARENT background — silhouettes only, so buildings sit directly on
      // the page gradient. No full-width ground bar (a hard-edged bar read as a
      // seam band); instead every silhouette's foot is staggered a little below
      // BASE and a soft haze band (alpha fades in AND out) dissolves the
      // baselines so there is no shared hard edge anywhere.
      const BASE = 280;
      const back = 0x0b1526;  // far silhouette
      const front = 0x11203a; // nearer silhouette
      const seam = 0x1c3157;   // panel/rim lines
      const win = 0x2c4a7a;    // dim window glow
      // building blocks with faint window grids (feet staggered below BASE)
      [[30, 78, 96, back, 8], [150, 54, 150, front, 14], [330, 96, 82, back, 4],
       [900, 88, 110, back, 12], [1150, 84, 158, front, 6], [1000, 40, 60, front, 10]]
        .forEach(([x, w, h, col, foot]) => {
          g.fillStyle(col).fillRect(x, BASE - h, w, h + foot);
          // dim window grid + a FEW deterministically-lit WARM windows (Lumen glow)
          const warmWin = 0xffcf8f;
          for (let wy = BASE - h + 12; wy < BASE - 10; wy += 18)
            for (let wx = x + 9; wx < x + w - 7; wx += 16) {
              const lit = ((wx * 7 + wy * 3) % 11) < 2; // sparse, deterministic
              if (lit) {
                g.fillStyle(warmWin, 0.16).fillRect(wx - 2, wy - 2, 9, 12); // soft glow
                g.fillStyle(warmWin, 0.75).fillRect(wx, wy, 5, 8);
              } else {
                g.fillStyle(win, 0.5).fillRect(wx, wy, 5, 8);
              }
            }
        });
      // storage vats — cylinder body + domed top + band lines
      const vat = (x, w, h, foot) => {
        g.fillStyle(front).fillRect(x, BASE - h, w, h + foot);
        g.fillStyle(front).fillEllipse(x + w / 2, BASE - h, w, w * 0.55);
        g.lineStyle(2, seam, 0.85).strokeRect(x, BASE - h, w, h + foot);
        g.fillStyle(seam, 0.7);
        g.fillRect(x, BASE - h * 0.62, w, 3);
        g.fillRect(x, BASE - h * 0.3, w, 3);
      };
      vat(470, 52, 120, 9);
      vat(560, 40, 92, 5);
      vat(830, 56, 132, 13);
      // tower cranes — mast + long jib + short counter-arm + hanging hook line
      const crane = (x, mastH, jib, dir, foot) => {
        g.fillStyle(front).fillRect(x - 4, BASE - mastH, 8, mastH + foot);
        g.fillStyle(front).fillRect(dir > 0 ? x : x - jib, BASE - mastH - 4, jib, 7); // jib
        g.fillStyle(front).fillRect(dir > 0 ? x - 26 : x, BASE - mastH - 4, 26, 7); // counter-arm
        g.fillStyle(seam).fillRect(dir > 0 ? x - 30 : x + 26, BASE - mastH + 3, 8, 12); // counterweight
        const hx = dir > 0 ? x + jib - 20 : x - jib + 20;
        g.lineStyle(2, seam, 0.9).lineBetween(hx, BASE - mastH, hx, BASE - mastH * 0.55);
        g.fillStyle(seam).fillRect(hx - 4, BASE - mastH * 0.55, 8, 7); // hook block
        // lattice hint on the mast
        g.lineStyle(1, seam, 0.6);
        for (let ly = BASE - mastH + 10; ly < BASE - 10; ly += 22) g.lineBetween(x - 4, ly, x + 4, ly - 10);
      };
      crane(400, 210, 150, 1, 7);
      crane(1080, 232, 168, -1, 11);
      // antenna masts with cross-struts; tips carry blink lights (see coords above)
      const antenna = (x, ty, foot) => {
        const h = BASE - ty;
        g.lineStyle(3, front, 1).lineBetween(x, BASE + foot, x, ty);
        g.lineStyle(2, seam, 0.8);
        g.lineBetween(x, ty + h * 0.32, x - 12, ty + h * 0.32 + 16);
        g.lineBetween(x, ty + h * 0.32, x + 12, ty + h * 0.32 + 16);
        g.lineBetween(x, ty + h * 0.6, x - 9, ty + h * 0.6 + 12);
        g.lineBetween(x, ty + h * 0.6, x + 9, ty + h * 0.6 + 12);
      };
      antenna(210, 64, 6);
      antenna(720, 50, 10);
      antenna(1060, 84, 4);
      // soft haze band: dark strips whose alpha rises toward BASE and falls off
      // below it — swallows the staggered feet with no hard edge in either
      // direction (peak alpha 0.5 at BASE, gone by BASE-44 above / +20 below)
      for (let y = BASE - 44; y < BASE + 20; y += 2) {
        const d = y < BASE ? 1 - (BASE - y) / 44 : 1 - (y - BASE) / 20;
        g.fillStyle(0x0a1220, 0.5 * d).fillRect(0, y, 1280, 2);
      }
    });
    // Conveyor belt tile carrying tiny silhouette parts (gear / crate / canister).
    // Scrolled horizontally in TitleScene via a looping tilePositionX tween.
    make("conveyor", 220, 58, (g) => {
      const belt = 0x0b1424, part = 0x2a4570, edge = 0x3d608f;
      g.fillStyle(belt).fillRect(0, 30, 220, 16);
      g.fillStyle(edge, 0.85).fillRect(0, 30, 220, 2); // belt top rim
      // soft cast shadow below the belt so its bottom edge has no hard seam —
      // starts at the alpha that composites to the belt's own value (seamless)
      for (let y = 46; y < 58; y += 2) {
        g.fillStyle(0x05080f, 0.68 * (1 - (y - 46) / 12)).fillRect(0, y, 220, 2);
      }
      g.fillStyle(0x16294a, 0.8);
      for (let x = 8; x < 220; x += 20) g.fillCircle(x, 41, 2); // roller dots
      // gear part
      const gear = (cx, r) => {
        g.fillStyle(part).fillCircle(cx, 30 - r + 1, r);
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI / 4) * i;
          g.fillRect(cx + Math.cos(a) * r - 2, 30 - r + 1 + Math.sin(a) * r - 2, 4, 4);
        }
        g.fillStyle(belt).fillCircle(cx, 30 - r + 1, r * 0.42);
      };
      gear(48, 11);
      // crate part
      g.fillStyle(part).fillRect(102, 15, 24, 15);
      g.lineStyle(1.5, edge, 0.9).strokeRect(102, 15, 24, 15);
      g.lineBetween(102, 22.5, 126, 22.5);
      // canister part
      g.fillStyle(part).fillRoundedRect(170, 13, 18, 17, 5);
      g.fillStyle(edge, 0.8).fillRect(173, 16, 12, 2);
      // GFX2: a couple of warm status dots (glow accents) — kept clear of the
      // x=0/220 edges so the 220px horizontal period still tiles seamlessly.
      const warmC = 0xffcf8f;
      [[126, 18], [179, 17]].forEach(([x, y]) => {
        g.fillStyle(warmC, 0.18).fillCircle(x, y, 3.5);
        g.fillStyle(warmC, 0.85).fillCircle(x, y, 1.4);
      });
    });

    // Vertical light column for the respawn beam-in (bright core, soft edges).
    make("beamcol", 40, 160, (g) => {
      g.fillStyle(0x9fe8ff, 0.16).fillRect(4, 0, 32, 160);
      g.fillStyle(0xbfeeff, 0.28).fillRect(12, 0, 16, 160);
      g.fillStyle(0xffffff, 0.55).fillRect(18, 0, 4, 160);
    });
    // Steam-jet drip droplet at the nozzle (soft blue-white teardrop).
    make("drip", 6, 8, (g) => {
      g.fillStyle(0xdfe8ff, 0.85).fillCircle(3, 5, 2.4);
      g.fillStyle(0xffffff, 0.6).fillCircle(3, 4, 1.2);
    });

    // --- P11 particle & motion-coherence textures --------------------------
    // Soft radial dot for the thrown-buddy trail — PRE-COLOURED per player so the
    // fading trail reads its owner's colour under the Canvas renderer (where
    // setTint is a no-op). Additive when stamped. beep=cyan, boop=amber.
    const trailDot = (col) => (g) => {
      g.fillStyle(col, 0.28).fillCircle(6, 6, 6);
      g.fillStyle(col, 0.6).fillCircle(6, 6, 3.4);
      g.fillStyle(0xffffff, 0.85).fillCircle(6, 6, 1.4);
    };
    make("fxdot0", 12, 12, trailDot(COLORS.beep)); // player 1 (cyan)
    make("fxdot1", 12, 12, trailDot(COLORS.boop)); // player 2 (amber)
    // Respawn ground ring — a thin cyan-white halo that expands on the floor as a
    // robot beams in (steam/air family: the beam column itself is blue-white).
    make("fxring", 56, 56, (g) => {
      g.lineStyle(4, PARTICLES.steam.body, 0.85).strokeEllipse(28, 28, 50, 24);
      g.lineStyle(1.5, PARTICLES.steam.core, 0.9).strokeEllipse(28, 28, 42, 20);
    });
    // Checkpoint activation vertical light-sweep — a tall gold-white bar that
    // rises up the lamp on activation (celebration family). Bright hot core,
    // soft gold flanks, transparent top so the rise reads as a light wash.
    make("cpsweep", 20, 128, (g) => {
      for (let y = 0; y < 128; y += 2) {
        const a = 1 - y / 128; // brightest at the base, fades toward the top
        g.fillStyle(PARTICLES.celebration.body, 0.3 * a).fillRect(1, y, 18, 2);
        g.fillStyle(PARTICLES.celebration.core, 0.6 * a).fillRect(6, y, 8, 2);
        g.fillStyle(0xffffff, 0.9 * a).fillRect(8, y, 4, 2);
      }
    });
    // Fan streaming air-line — a thin vertical cyan-white streak that rides the
    // updraft (steam/air family). WebGL-only emitter (fps-gated in GameScene).
    make("fanair", 3, 20, (g) => {
      g.fillStyle(PARTICLES.steam.body, 0.5).fillRect(0, 0, 3, 20);
      g.fillStyle(PARTICLES.steam.core, 0.9).fillRect(1, 0, 1, 20);
    });

    this.scene.start("Title");
  }
}
