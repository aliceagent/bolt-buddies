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
      g.fillStyle(COLORS.steel).fillRect(0, 0, 48, 48);
      g.lineStyle(2, COLORS.steelEdge).strokeRect(1, 1, 46, 46);
      g.fillStyle(COLORS.steelEdge);
      [6, 42].forEach((x) => [6, 42].forEach((y) => g.fillCircle(x, y, 1.6)));
    });
    make("crack", 48, 48, (g) => {
      g.fillStyle(0x2a2436).fillRect(0, 0, 48, 48);
      g.lineStyle(2, 0x4a3f5c).strokeRect(1, 1, 46, 46);
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
      g.fillStyle(COLORS.amber, 0.9);
      // chevrons pointing right
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
      g.lineStyle(2, COLORS.neon, 0.9).strokeRect(1, 5, 46, 38);
      g.lineStyle(1, COLORS.neon, 0.35);
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
    const robot = (color, dark) => (g) => {
      g.fillStyle(0x10141f).fillRect(4, 40, 36, 8); // treads
      g.fillStyle(0x2a3247);
      g.fillCircle(10, 44, 3.4); g.fillCircle(22, 44, 3.4); g.fillCircle(34, 44, 3.4);
      g.fillStyle(color).fillRoundedRect(4, 12, 36, 30, 7); // body
      g.fillStyle(dark, 1).fillRoundedRect(9, 17, 26, 13, 5); // visor
      g.fillStyle(0xffffff);
      g.fillCircle(17, 23, 3.2); g.fillCircle(28, 23, 3.2); // eyes
      g.lineStyle(2, color).lineBetween(22, 12, 22, 4); // antenna
      g.fillStyle(0xffffff).fillCircle(22, 3, 2.6);
      g.fillStyle(dark).fillRect(12, 34, 20, 3); // chest stripe
    };
    make("robot_b", 44, 48, robot(COLORS.beep, 0x0c2f44));
    make("robot_o", 44, 48, robot(COLORS.boop, 0x4a2a08));

    // --- interactables -----------------------------------------------------
    make("anchor", 32, 32, (g) => {
      g.lineStyle(4, COLORS.neon).strokeCircle(16, 16, 11);
      g.fillStyle(COLORS.neon).fillCircle(16, 16, 3.5);
      g.lineStyle(2, COLORS.neon, 0.4).strokeCircle(16, 16, 15);
    });
    make("lever", 36, 40, (g) => {
      g.fillStyle(0x2a3350).fillRoundedRect(4, 30, 28, 10, 3);
      g.lineStyle(4, 0x8fa3d9).lineBetween(18, 32, 6, 8);
      g.fillStyle(COLORS.magenta).fillCircle(6, 8, 5);
    });
    make("key", 30, 30, (g) => {
      g.lineStyle(4, 0xffd94d).strokeCircle(9, 10, 5.5);
      g.lineStyle(4, 0xffd94d).lineBetween(13, 14, 25, 26);
      g.lineBetween(20, 21, 25, 16);
      g.lineBetween(22, 26, 27, 21);
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
    make("door", 48, 144, (g) => {
      g.fillStyle(0x222c4c).fillRect(2, 0, 44, 144);
      g.lineStyle(2, 0x44548c).strokeRect(3, 1, 42, 142);
      g.lineStyle(2, 0x44548c);
      for (let y = 18; y < 144; y += 24) g.lineBetween(6, y, 42, y);
      g.fillStyle(COLORS.hazard).fillCircle(24, 72, 6);
    });
    make("plate", 48, 14, (g) => {
      g.fillStyle(0x2a3350).fillRect(0, 8, 48, 6);
      g.fillStyle(COLORS.green, 0.95).fillRoundedRect(4, 2, 40, 8, 3);
    });
    make("pedestal", 48, 46, (g) => {
      g.fillStyle(0x222c4c).fillRect(14, 14, 20, 32);
      g.fillStyle(0x2f3f6e).fillRect(8, 40, 32, 6);
      g.fillStyle(0x2f3f6e).fillRect(10, 8, 28, 8);
      g.fillStyle(COLORS.neon, 0.75).fillCircle(24, 8, 7);
    });
    make("checkpoint", 26, 66, (g) => {
      g.fillStyle(0x2a3350).fillRect(10, 8, 6, 54);
      g.fillStyle(0x2f3f6e).fillRect(4, 60, 18, 6);
      g.fillStyle(0x8fa3d9).fillCircle(13, 8, 7);
    });

    // --- enemies & set pieces ----------------------------------------------
    make("bug", 44, 28, (g) => {
      g.fillStyle(0x6d3fa8).fillRoundedRect(2, 4, 40, 20, { tl: 18, tr: 18, bl: 4, br: 4 });
      g.lineStyle(2, 0x9a6fd4).strokeRoundedRect(2, 4, 40, 20, { tl: 18, tr: 18, bl: 4, br: 4 });
      g.lineStyle(2, 0x9a6fd4).lineBetween(22, 4, 22, 22);
      g.fillStyle(0xffe066);
      g.fillCircle(10, 14, 3); g.fillCircle(34, 14, 3); // eyes
      g.fillStyle(0x2a1840);
      [8, 16, 28, 36].forEach((x) => g.fillRect(x, 24, 4, 4)); // legs
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
    make("crane", 132, 76, (g) => {
      g.fillStyle(0x39415e).fillRoundedRect(6, 6, 120, 44, 8);
      g.lineStyle(3, 0x6b78a8).strokeRoundedRect(6, 6, 120, 44, 8);
      g.fillStyle(COLORS.hazard).fillCircle(66, 28, 13); // eye
      g.fillStyle(0xffffff).fillCircle(66, 28, 5);
      g.lineStyle(5, 0x4a5578); // claw
      g.lineBetween(46, 50, 38, 72);
      g.lineBetween(86, 50, 94, 72);
      g.lineBetween(66, 50, 66, 70);
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
    make("duct", 48, 20, (g) => {
      g.fillStyle(0x232c48).fillRect(0, 0, 48, 20);
      g.lineStyle(2, 0x44548c).strokeRect(1, 1, 46, 18);
      g.lineStyle(2, 0x141b30);
      for (let x = 8; x < 48; x += 10) g.lineBetween(x, 4, x, 16);
    });
    make("fan", 48, 22, (g) => {
      g.fillStyle(0x2a3350).fillRect(0, 10, 48, 12);
      g.lineStyle(2, 0x59ff9c, 0.9).strokeRect(1, 11, 46, 10);
      g.fillStyle(0x59ff9c, 0.9);
      g.fillTriangle(24, 0, 16, 12, 32, 12);
    });
    make("roller", 42, 34, (g) => {
      g.fillStyle(0x8a4a3a).fillRoundedRect(3, 2, 36, 22, 9);
      g.lineStyle(2, 0xc4705a).strokeRoundedRect(3, 2, 36, 22, 9);
      g.fillStyle(0xffe066).fillCircle(32, 12, 6); // big scanning eye
      g.fillStyle(0x2a1810).fillCircle(34, 12, 2.6);
      g.fillStyle(0x1a1420);
      g.fillCircle(12, 28, 5.5); g.fillCircle(30, 28, 5.5); // wheels
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

    this.scene.start("Title");
  }
}
