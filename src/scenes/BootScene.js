import Phaser from "phaser";
import { COLORS, WORLD_THEMES } from "../constants.js";

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
    make("tile", 48, 48, (g) => {
      // Quiet two-tone bevel: lighter top-left edge, darker bottom-right edge.
      g.fillStyle(COLORS.steel).fillRect(0, 0, 48, 48);
      g.fillStyle(COLORS.steelHi);
      g.fillRect(0, 0, 48, 2); // top highlight
      g.fillRect(0, 0, 2, 48); // left highlight
      g.fillStyle(COLORS.steelLo);
      g.fillRect(0, 46, 48, 2); // bottom shade
      g.fillRect(46, 0, 2, 48); // right shade
      // faint inner panel line
      g.lineStyle(1, COLORS.steelEdge, 0.5).strokeRect(7, 7, 34, 34);
      // corner rivets
      g.fillStyle(COLORS.steelEdge);
      [7, 41].forEach((x) => [7, 41].forEach((y) => g.fillCircle(x, y, 1.6)));
    });
    make("crack", 48, 48, (g) => {
      g.fillStyle(0x2a2436).fillRect(0, 0, 48, 48);
      g.lineStyle(2, 0x4a3f5c).strokeRect(1, 1, 46, 46);
      // hairline glow behind the cracks (accent, low alpha) so kids read it as special
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
    });
    make("belt", 48, 48, (g) => {
      g.fillStyle(0x151b2c).fillRect(0, 0, 48, 48);
      g.lineStyle(2, 0x3a4a72).strokeRect(1, 1, 46, 46);
      // end rollers (metal wheels at the tile edges)
      g.fillStyle(0x2a3350);
      g.fillCircle(3, 24, 6); g.fillCircle(45, 24, 6);
      g.fillStyle(0x5a6aa0);
      g.fillCircle(3, 24, 2.6); g.fillCircle(45, 24, 2.6);
      // brighter chevrons pointing right
      g.fillStyle(COLORS.amber, 1);
      [4, 20, 36].forEach((x) => {
        g.beginPath();
        g.moveTo(x, 14); g.lineTo(x + 10, 24); g.lineTo(x, 34); g.lineTo(x + 4, 24);
        g.closePath();
        g.fillPath();
      });
    });
    make("hazard", 48, 48, (g) => {
      g.fillStyle(0x1a0f18).fillRect(0, 24, 48, 24);
      g.lineStyle(3, COLORS.hazard);
      g.beginPath();
      g.moveTo(0, 40);
      for (let x = 0; x <= 48; x += 8) g.lineTo(x, x % 16 === 0 ? 30 : 44);
      g.strokePath();
      g.fillStyle(COLORS.hazard, 0.5).fillRect(0, 24, 48, 4);
    });
    make("bridgetile", 48, 48, (g) => {
      g.fillStyle(0x123a44).fillRect(0, 4, 48, 40);
      // holo scanline stripes
      g.fillStyle(COLORS.neon, 0.16);
      for (let y = 8; y < 44; y += 6) g.fillRect(3, y, 42, 2);
      // brighter holo border
      g.lineStyle(2, COLORS.neon, 1).strokeRect(1, 5, 46, 38);
      g.lineStyle(1, COLORS.neon, 0.45);
      g.lineBetween(0, 24, 48, 24);
    });
    make("liftplat", 48, 20, (g) => {
      g.fillStyle(0x2a3350).fillRect(0, 0, 48, 20);
      g.lineStyle(2, COLORS.amber, 0.9).strokeRect(1, 1, 46, 18);
      g.fillStyle(COLORS.amber, 0.5).fillRect(4, 4, 40, 3);
    });
    make("bggrid", 96, 96, (g) => {
      g.lineStyle(1, 0x16203a, 0.55);
      for (let i = 0; i <= 96; i += 24) {
        g.lineBetween(i, 0, i, 96);
        g.lineBetween(0, i, 96, i);
      }
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
    };
    // Soft radial glow: concentric circles of rising alpha toward the centre.
    const blob = (color) => (g) => {
      for (let r = 128; r > 0; r -= 3) {
        g.fillStyle(color, 0.035 * (1 - r / 128));
        g.fillCircle(128, 128, r);
      }
    };
    // generic white versions (tintable under WebGL) + colour-baked world variants
    make("bgGradient", 64, 720, gradient(0xffffff, 0x000000));
    make("glowBlob", 256, 256, blob(0xffffff));
    for (const w of Object.keys(WORLD_THEMES)) {
      const t = WORLD_THEMES[w];
      make(`bgGradient${w}`, 64, 720, gradient(t.bgTop, t.bgBottom));
      make(`glowBlob${w}`, 256, 256, blob(t.glow));
    }

    // --- robots ------------------------------------------------------------
    // Multiply a colour by a factor to make canvas-safe lighter/darker shades
    // (setTint / fillGradientStyle no-op under the Canvas renderer, so the whole
    // two-tone body gradient is baked in with interpolated horizontal strips).
    const shade = (hex, f) => {
      const c = Phaser.Display.Color.IntegerToColor(hex);
      const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
      return Phaser.Display.Color.GetColor(cl(c.red * f), cl(c.green * f), cl(c.blue * f));
    };
    // color: body base, dark: visor/stripe, rim: rim-light on one side.
    // blink=true draws the visor with eyes closed for the _blink texture.
    const robot = (color, dark, rim, blink) => (g) => {
      // chunkier treads: wider, taller base with four wheel bumps + top rim line
      g.fillStyle(0x0c1019).fillRect(2, 40, 40, 9);
      g.fillStyle(0x2a3247);
      [8, 17, 26, 35].forEach((x) => g.fillCircle(x, 44.5, 3.9));
      g.fillStyle(0x151b2b).fillRect(2, 39, 40, 2);
      // body: vertical two-tone gradient, baked as interpolated strips inside the
      // rounded silhouette. The rounded rect underneath supplies the soft corners.
      const top = Phaser.Display.Color.IntegerToColor(shade(color, 1.28));
      const bot = Phaser.Display.Color.IntegerToColor(shade(color, 0.68));
      g.fillStyle(shade(color, 0.68)).fillRoundedRect(4, 12, 36, 30, 7);
      const bands = 9;
      for (let i = 0; i < bands; i++) {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bot, bands - 1, i);
        g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
        g.fillRect(6, 14 + (i * 26) / bands, 32, 26 / bands + 1);
      }
      // colored rim-light running down the left edge of the body
      g.fillStyle(rim, 0.85).fillRect(5.5, 15, 2.6, 24);
      g.lineStyle(1.5, shade(color, 1.45), 0.55).strokeRoundedRect(4, 12, 36, 30, 7);
      // visor
      g.fillStyle(dark, 1).fillRoundedRect(9, 17, 26, 13, 5);
      if (blink) {
        // eyes closed — two short horizontal lids
        g.lineStyle(2.4, 0xffffff, 0.92);
        g.lineBetween(13, 24, 21, 24);
        g.lineBetween(24, 24, 32, 24);
      } else {
        g.fillStyle(0xffffff);
        g.fillCircle(17, 23, 3.4); g.fillCircle(28, 23, 3.4); // eyes
        g.fillStyle(0xbfeaff, 0.95); // glossy specular dots
        g.fillCircle(15.8, 21.4, 1.2); g.fillCircle(26.8, 21.4, 1.2);
      }
      // glossy visor sweep — thin white specular streak across the top of the glass
      g.fillStyle(0xffffff, 0.16).fillRoundedRect(10, 18, 24, 2.6, 1);
      // antenna
      g.lineStyle(2, shade(color, 1.28)).lineBetween(22, 12, 22, 4);
      g.fillStyle(0xffffff).fillCircle(22, 3, 2.6);
      g.fillStyle(dark).fillRect(12, 34, 20, 3); // chest stripe
    };
    make("robot_b", 44, 48, robot(COLORS.beep, 0x0c2f44, 0xbfeaff, false));
    make("robot_o", 44, 48, robot(COLORS.boop, 0x4a2a08, 0xffe0a8, false));
    make("robot_b_blink", 44, 48, robot(COLORS.beep, 0x0c2f44, 0xbfeaff, true));
    make("robot_o_blink", 44, 48, robot(COLORS.boop, 0x4a2a08, 0xffe0a8, true));

    // --- interactables -----------------------------------------------------
    make("anchor", 32, 32, (g) => {
      g.lineStyle(4, COLORS.neon).strokeCircle(16, 16, 11);
      g.fillStyle(COLORS.neon).fillCircle(16, 16, 3.5);
      g.lineStyle(2, COLORS.neon, 0.4).strokeCircle(16, 16, 15);
    });
    // Lever base plate + glowing pivot hub. The stick/knob is a SEPARATE
    // `lever_handle` image (origin at its base pivot) so a flip is a rotation
    // tween rather than a texture flipX — see GameScene.pullLever.
    make("lever", 36, 40, (g) => {
      g.fillStyle(0x1c2742).fillRoundedRect(2, 28, 32, 12, 4);
      g.lineStyle(2, 0x44548c).strokeRoundedRect(2, 28, 32, 12, 4);
      g.fillStyle(COLORS.neon, 0.22).fillCircle(18, 31, 9); // pivot glow
      g.fillStyle(0x2a3350).fillCircle(18, 31, 5.5);
      g.fillStyle(0x8fa3d9).fillCircle(18, 31, 2.6);
    });
    // Drawn handle, pivot at bottom-centre (originY≈1). Bigger glowing knob.
    make("lever_handle", 22, 42, (g) => {
      g.lineStyle(5, 0x8fa3d9).lineBetween(11, 40, 11, 15);
      g.fillStyle(COLORS.magenta, 0.3).fillCircle(11, 11, 10.5); // knob glow
      g.fillStyle(COLORS.magenta).fillCircle(11, 11, 7);
      g.fillStyle(0xffd0f2, 0.9).fillCircle(9, 9, 2.4); // specular
    });
    // Gold key with a fuller body + rim highlight; a sweeping glint is drawn as a
    // separate `glint` streak animated over it in GameScene.
    make("key", 30, 30, (g) => {
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
      }
    });
    make("core", 30, 30, (g) => {
      g.fillStyle(COLORS.neon, 0.25).fillCircle(15, 15, 14);
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        pts.push({ x: 15 + Math.cos(a) * 10, y: 15 + Math.sin(a) * 10 });
      }
      g.fillStyle(COLORS.neon).fillPoints(pts, true);
      g.fillStyle(0xffffff).fillCircle(15, 15, 3.4);
    });
    // Sliding door PANEL only — the frame (side rails + top light bar) and the
    // red/green status lamp are separate objects built per-door in GameScene, so
    // the lamp colour reads under the Canvas renderer (setTint no-ops there).
    make("door", 48, 144, (g) => {
      g.fillStyle(0x222c4c).fillRect(2, 0, 44, 144);
      g.lineStyle(2, 0x44548c).strokeRect(3, 1, 42, 142);
      g.lineStyle(2, 0x44548c);
      for (let y = 18; y < 144; y += 24) g.lineBetween(6, y, 42, y);
      g.fillStyle(0x2f3f6e);
      g.fillCircle(24, 12, 2.4); g.fillCircle(24, 132, 2.4); // bolts
    });
    // Exit door panel: green-baked so it reads as the goal under Canvas.
    make("door_exit", 48, 144, (g) => {
      g.fillStyle(0x1c4a38).fillRect(2, 0, 44, 144);
      g.lineStyle(2, 0x59ff9c, 0.9).strokeRect(3, 1, 42, 142);
      g.lineStyle(2, 0x2f8f5c);
      for (let y = 18; y < 144; y += 24) g.lineBetween(6, y, 42, y);
    });
    // Door status lamps (swapped via setTexture: red = closed, green = opening).
    const lamp = (glow, lens, hi) => (g) => {
      g.fillStyle(0x2a3350).fillRoundedRect(0, 0, 20, 14, 4);
      g.lineStyle(1, 0x44548c).strokeRoundedRect(0, 0, 20, 14, 4);
      g.fillStyle(glow, 0.32).fillCircle(10, 7, 6.5);
      g.fillStyle(lens).fillCircle(10, 7, 3.6);
      g.fillStyle(hi, 0.9).fillCircle(8.6, 5.6, 1.2);
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
      g.fillStyle(COLORS.green, 0.4).fillRect(7, 3, 34, 5); // lit glow
      g.fillStyle(COLORS.green).fillRect(9, 4, 30, 2); // lit LED strip
    });
    // Holo-pillar pedestal column.
    make("pedestal", 48, 46, (g) => {
      g.fillStyle(0x222c4c).fillRect(14, 14, 20, 32);
      g.lineStyle(1, 0x44548c).strokeRect(14, 14, 20, 32);
      g.fillStyle(0x2f3f6e).fillRect(8, 40, 32, 6);
      g.fillStyle(0x2f3f6e).fillRect(10, 8, 28, 8);
      g.fillStyle(COLORS.neon, 0.3).fillCircle(24, 8, 10);
      g.fillStyle(COLORS.neon, 0.85).fillCircle(24, 8, 6.5);
    });
    // Checkpoint lamp housing: dim grey (inactive) + lit green (active).
    make("checkpoint", 26, 66, (g) => {
      g.fillStyle(0x2a3350).fillRect(11, 20, 4, 42);
      g.fillStyle(0x2f3f6e).fillRect(4, 60, 18, 6);
      g.fillStyle(0x39415e).fillRoundedRect(3, 2, 20, 18, 5);
      g.lineStyle(2, 0x5a6aa0).strokeRoundedRect(3, 2, 20, 18, 5);
      g.fillStyle(0x4a5578).fillCircle(13, 11, 5.5);
      g.fillStyle(0x6b78a8).fillCircle(13, 11, 3);
    });
    make("checkpoint_on", 26, 66, (g) => {
      g.fillStyle(0x2a3350).fillRect(11, 20, 4, 42);
      g.fillStyle(0x2f3f6e).fillRect(4, 60, 18, 6);
      g.fillStyle(0x39415e).fillRoundedRect(3, 2, 20, 18, 5);
      g.lineStyle(2, COLORS.green).strokeRoundedRect(3, 2, 20, 18, 5);
      g.fillStyle(COLORS.green, 0.32).fillCircle(13, 11, 9);
      g.fillStyle(0x0f4a2c).fillCircle(13, 11, 5.5);
      g.fillStyle(COLORS.green).fillCircle(13, 11, 3.6);
      g.fillStyle(0xdfffe8, 0.9).fillCircle(11.6, 9.6, 1.3);
    });
    // Expanding ring (checkpoint activation burst) + mini-robot weight pips.
    make("ring", 48, 48, (g) => g.lineStyle(4, COLORS.green).strokeCircle(24, 24, 20));
    make("pip_off", 16, 18, (g) => {
      g.fillStyle(0x39415e).fillRoundedRect(3, 3, 10, 10, 3);
      g.fillStyle(0x2b3450).fillRect(3, 12, 10, 3);
      g.fillStyle(0x2a3350).fillRect(5, 6, 6, 3);
    });
    make("pip_on", 16, 18, (g) => {
      g.fillStyle(COLORS.amber).fillRoundedRect(3, 3, 10, 10, 3);
      g.fillStyle(0x8a5a10).fillRect(3, 12, 10, 3);
      g.fillStyle(0xfff2b0).fillRect(5, 6, 6, 3);
    });

    // --- enemies & set pieces ----------------------------------------------
    // Scuttlebug: shell sheen highlight (static) + two leg frames swapped in
    // GameScene for a wiggle. `legs` picks the leg x-splay; glow pass is a
    // separate additive overlay (eyes brighten near a player) drawn in-game.
    const bug = (legs) => (g) => {
      g.fillStyle(0x6d3fa8).fillRoundedRect(2, 4, 40, 20, { tl: 18, tr: 18, bl: 4, br: 4 });
      g.lineStyle(2, 0x9a6fd4).strokeRoundedRect(2, 4, 40, 20, { tl: 18, tr: 18, bl: 4, br: 4 });
      g.lineStyle(2, 0x9a6fd4).lineBetween(22, 4, 22, 22);
      // shell sheen: soft highlight arc on the top-left of the carapace
      g.fillStyle(0xb79ae0, 0.5).fillEllipse(15, 11, 16, 7);
      g.fillStyle(0xe4d6f7, 0.8).fillEllipse(13, 9.5, 6, 3);
      g.fillStyle(0xffe066);
      g.fillCircle(10, 14, 3); g.fillCircle(34, 14, 3); // eyes
      g.fillStyle(0x2a1840);
      legs.forEach((x) => g.fillRect(x, 24, 4, 4)); // legs
    };
    make("bug", 44, 28, bug([8, 16, 28, 36]));
    make("bug_step", 44, 28, bug([6, 18, 26, 38]));
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
      g.fillStyle(0x4a5578).fillRect(2, 12, 80, 40);
      g.lineStyle(2, 0x6b78a8).strokeRect(3, 13, 78, 38);
      g.fillStyle(COLORS.amber);
      for (let x = 4; x < 80; x += 16) {
        g.beginPath();
        g.moveTo(x, 52); g.lineTo(x + 8, 60); g.lineTo(x + 16, 52);
        g.closePath();
        g.fillPath();
      }
    });
    const craneBody = (dead) => (g) => {
      g.fillStyle(dead ? 0x3a3d49 : 0x39415e).fillRoundedRect(6, 6, 120, 44, 8);
      g.lineStyle(3, dead ? 0x555a6a : 0x6b78a8).strokeRoundedRect(6, 6, 120, 44, 8);
      if (dead) {
        // powered-down: dim grey eye with an X (reads without tint under Canvas)
        g.fillStyle(0x4a4d5c).fillCircle(66, 28, 13);
        g.lineStyle(3, 0x22242c);
        g.lineBetween(60, 22, 72, 34);
        g.lineBetween(72, 22, 60, 34);
        g.lineStyle(5, 0x3f434f);
      } else {
        g.fillStyle(COLORS.hazard).fillCircle(66, 28, 13); // eye
        g.fillStyle(0xffffff).fillCircle(66, 28, 5);
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
      g.lineStyle(2, 0x6b78a8).strokeRoundedRect(4, 6, 32, 12, 4);
      g.fillStyle(COLORS.amber, 0.85).fillRect(10, 9, 20, 3);
    });
    // magenta pulse glow behind a yankable crane plate (rest state) — baked
    // colour, alpha-pulsed in-game (tint no-ops on Canvas).
    make("plate_glow", 56, 56, (g) => {
      for (let r = 28; r > 0; r -= 2) {
        g.fillStyle(COLORS.magenta, 0.06 * (1 - r / 28));
        g.fillCircle(28, 28, r);
      }
    });
    // concentric pulse ring for exposed core pods (orange, expands+fades in-game)
    make("pod_ring", 48, 48, (g) => {
      g.lineStyle(3, 0xff8855).strokeCircle(24, 24, 20);
      g.lineStyle(1.5, 0xffd9a0, 0.7).strokeCircle(24, 24, 16);
    });
    // white shockwave ring for the crane slam impact (scale+fade pooled image)
    make("shockring", 72, 72, (g) => {
      g.lineStyle(5, 0xffffff, 0.95).strokeCircle(36, 36, 30);
      g.lineStyle(2, 0xffd9a0, 0.8).strokeCircle(36, 36, 24);
    });
    make("crane_plate", 40, 40, (g) => {
      g.fillStyle(0x8892b8).fillRoundedRect(3, 3, 34, 34, 8);
      g.lineStyle(3, COLORS.magenta).strokeRoundedRect(3, 3, 34, 34, 8);
      g.fillStyle(COLORS.magenta).fillCircle(20, 20, 5);
    });
    make("pod", 36, 40, (g) => {
      g.fillStyle(0x2a3350).fillRect(6, 32, 24, 8);
      g.fillStyle(0xff8855).fillCircle(18, 20, 13);
      g.fillStyle(0xffd9a0).fillCircle(18, 20, 6);
    });
    make("rail", 48, 10, (g) => {
      g.fillStyle(0x39415e).fillRect(0, 2, 48, 6);
      g.fillStyle(0x161d30).fillRect(0, 4, 48, 2);
    });

    // --- world 2 -------------------------------------------------------------
    make("phasewall", 48, 48, (g) => {
      g.fillStyle(0x3a2a5e, 0.75).fillRect(0, 0, 48, 48);
      g.lineStyle(2, 0xc39dff, 0.8).strokeRect(2, 2, 44, 44);
      g.lineStyle(1, 0xc39dff, 0.45);
      for (let y = 8; y < 48; y += 10) g.lineBetween(4, y, 44, y - 4);
    });
    // Drifting inner pattern for phase-walls: diagonal energy stripes that tile
    // vertically. Scrolled via tilePositionY in GameScene so the shimmer flows.
    make("phaseflow", 48, 48, (g) => {
      g.lineStyle(3, 0xd7bbff, 0.5);
      for (let i = -48; i < 96; i += 16) g.lineBetween(i, 48, i + 48, 0);
    });
    make("duct", 48, 20, (g) => {
      g.fillStyle(0x232c48).fillRect(0, 0, 48, 20);
      // darker interior slot under the lip
      g.fillStyle(0x121829).fillRect(3, 9, 42, 9);
      g.lineStyle(2, 0x44548c).strokeRect(1, 1, 46, 18); // lip frame
      // tiny fan-slit lines across the slot
      g.lineStyle(1, 0x2f4066, 0.85);
      for (let x = 7; x < 46; x += 7) g.lineBetween(x, 10, x, 17);
    });
    make("fan", 48, 22, (g) => {
      g.fillStyle(0x2a3350).fillRect(0, 10, 48, 12);
      g.lineStyle(2, 0x59ff9c, 0.9).strokeRect(1, 11, 46, 10);
      g.fillStyle(0x59ff9c, 0.9);
      g.fillTriangle(24, 0, 16, 12, 32, 12);
    });
    // Roller: `alert` bakes a red eye/shell flush so the alert state reads under
    // Canvas (tint no-ops). The pupil is a SEPARATE `roller_pupil` overlay that
    // slides toward the patrol direction, and the wheels get `roller_wheel`
    // spoke-dot overlays that spin — so the base eye here has no baked pupil.
    const roller = (alert) => (g) => {
      g.fillStyle(alert ? 0xa83a2e : 0x8a4a3a).fillRoundedRect(3, 2, 36, 22, 9);
      g.lineStyle(2, alert ? 0xff6a52 : 0xc4705a).strokeRoundedRect(3, 2, 36, 22, 9);
      if (alert) {
        g.fillStyle(COLORS.hazard, 0.4).fillCircle(32, 12, 9); // red alarm glow
        g.fillStyle(0xff5566).fillCircle(32, 12, 6);
      } else {
        g.fillStyle(0xffe066).fillCircle(32, 12, 6); // big scanning eye
      }
      g.fillStyle(0x1a1420);
      g.fillCircle(12, 28, 5.5); g.fillCircle(30, 28, 5.5); // wheel hubs
    };
    make("roller", 42, 34, roller(false));
    make("roller_alert", 42, 34, roller(true));
    make("roller_pupil", 8, 8, (g) => {
      g.fillStyle(0x2a1810).fillCircle(4, 4, 2.6);
      g.fillStyle(0x6a4030, 0.7).fillCircle(3.2, 3.2, 1);
    });
    // spoke-dot wheel overlay: off-centre dots so rotation reads as rolling
    make("roller_wheel", 14, 14, (g) => {
      g.fillStyle(0x3a2a24).fillCircle(7, 7, 6);
      g.fillStyle(0xc4705a);
      g.fillCircle(7, 2.5, 1.6); g.fillCircle(7, 11.5, 1.6);
      g.fillCircle(2.5, 7, 1.6); g.fillCircle(11.5, 7, 1.6);
      g.fillStyle(0x8a4a3a).fillCircle(7, 7, 1.8);
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
      g.fillStyle(0xffe066).fillPoints(pts, true);
      g.fillStyle(0xfff6c2).fillCircle(10, 10, 2);
    });
    make("warden", 42, 62, (g) => {
      g.fillStyle(0x3a5e46).fillRoundedRect(5, 8, 32, 50, 7);
      g.lineStyle(2, 0x59a06e).strokeRoundedRect(5, 8, 32, 50, 7);
      g.fillStyle(0x142018).fillRoundedRect(20, 14, 16, 10, 4); // visor faces right
      g.fillStyle(0xffe066).fillCircle(31, 19, 3);
      g.fillStyle(0x59a06e).fillRect(9, 34, 24, 3);
      g.fillStyle(0x1a2a20).fillRect(8, 58, 26, 4);
    });
    make("nozzle", 26, 16, (g) => {
      g.fillStyle(0x4a5578).fillRect(2, 0, 22, 10);
      g.fillStyle(0x8892b8).fillRect(7, 10, 12, 6);
    });
    make("icon_phase", 26, 26, (g) => {
      g.fillStyle(0xc39dff, 0.5).fillRect(2, 2, 10, 22);
      g.fillStyle(0xc39dff).fillCircle(17, 10, 6);
      g.fillStyle(0xc39dff).fillRect(13, 14, 8, 9);
    });
    make("icon_tiny", 26, 26, (g) => {
      g.fillStyle(0x9dffc4).fillRoundedRect(7, 12, 12, 10, 3);
      g.fillStyle(0x142018).fillRect(9, 15, 8, 4);
      g.lineStyle(2, 0x9dffc4).strokeRect(2, 2, 22, 22);
    });

    // --- misc --------------------------------------------------------------
    make("reticle", 44, 44, (g) => {
      g.lineStyle(3, 0xffffff, 0.95).strokeCircle(22, 22, 15);
      g.lineStyle(3, 0xffffff, 0.95);
      [[22, 0, 22, 9], [22, 35, 22, 44], [0, 22, 9, 22], [35, 22, 44, 22]].forEach(([a, b, c, d]) => g.lineBetween(a, b, c, d));
    });
    make("px", 6, 6, (g) => g.fillStyle(0xffffff).fillRect(0, 0, 6, 6));
    make("icon_grapple", 26, 26, (g) => {
      g.lineStyle(3, COLORS.neon).lineBetween(4, 4, 17, 17);
      g.lineStyle(3, COLORS.neon).strokeCircle(18, 18, 6);
      g.fillStyle(COLORS.neon).fillCircle(4, 4, 3);
    });
    make("icon_heavy", 26, 26, (g) => {
      g.fillStyle(COLORS.amber).fillRect(3, 10, 20, 12);
      g.fillStyle(COLORS.amber).fillRect(8, 4, 10, 8);
      g.lineStyle(2, 0x8a5a10).strokeRect(3, 10, 20, 12);
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

    this.scene.start("Title");
  }
}
