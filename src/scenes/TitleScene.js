import Phaser from "phaser";
import { COLORS, WORLD_THEMES } from "../constants.js";
import { addGradient, addMotes } from "../backdrop.js";
import { loadSave, storeSave, totalCores } from "../save.js";
import { initAudio, sfx, playTrack, installMute } from "../audio.js";

const FONT = "'Courier New', monospace";
const ACCENT = WORLD_THEMES[1].accent; // world-1 amber accent for buttons

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super("Title");
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    addGradient(this, 1);
    this.add.tileSprite(0, 0, W, H, "bggrid").setOrigin(0).setAlpha(0.22).setDepth(-8);
    addMotes(this, WORLD_THEMES[1].accent2);

    this.buildLogo(W, 92);
    this.buildSubtitle(W, 152);
    this.buildCast(W);
    this.buildStory(W, 322);
    this.buildMenu(W, H);
    this.buildFooter(W, H);
    this.buildKobiCorner(W, H);

    // title music: requested now, actually starts on the first keydown once the
    // AudioContext is unlocked — autoplay-safe.
    playTrack("title");
    installMute(this);

    this.input.keyboard.addCapture("SPACE"); // keep Space from scrolling the page
    this.input.keyboard.on("keydown", (ev) => {
      initAudio();
      const c = ev.code;
      if (c === "KeyS") {
        sfx.menuSelect();
        this.scene.start("Settings", { returnTo: "Title" });
      } else if (c === "KeyW" || c === "ArrowUp") {
        this.moveSel(-1);
      } else if (c === "ArrowDown") {
        this.moveSel(1);
      } else if (["Space", "KeyE", "KeyL", "Enter"].includes(c)) {
        this.activate();
      }
    });

    this.events.once("shutdown", () => {
      if (this.eraseTimer) this.eraseTimer.remove();
    });
  }

  // --- neon logo: layered glow copies + per-letter flicker-on -----------------
  buildLogo(W, cy) {
    const text = "BOLT BUDDIES";
    const style = { fontFamily: FONT, fontSize: "84px", fontStyle: "bold" };

    // measure each glyph so we can place per-letter copies for the flicker
    const widths = [];
    let total = 0;
    for (const ch of text) {
      const probe = this.add.text(0, 0, ch, style).setVisible(false);
      widths.push(probe.width);
      total += probe.width;
      probe.destroy();
    }

    // layered glow copies behind the crisp letters — aligned offset halos
    // (soft, additive, dim) so the neon bleeds without doubling the glyphs.
    const halo = [[0, 0, 0.26], [3, 3, 0.14], [-3, -3, 0.14], [4, -4, 0.1], [-4, 4, 0.1]];
    halo.forEach(([dx, dy, a]) => {
      this.add.text(W / 2 + dx, cy + dy, text, { ...style, color: "#35f0ff" })
        .setOrigin(0.5).setAlpha(a)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(-2);
    });

    // crisp per-letter copies (flicker in over ~1s)
    let x = W / 2 - total / 2;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const t = this.add.text(x, cy, ch, {
        ...style, color: "#8fe9ff", stroke: "#0b3a44", strokeThickness: 10,
      }).setOrigin(0, 0.5).setDepth(0).setAlpha(0);
      x += widths[i];
      if (ch === " ") { t.setAlpha(1); continue; }
      const delay = Math.random() * 700;
      // flicker: a couple of quick blinks then settle lit
      this.time.delayedCall(delay, () => {
        if (!t.active) return;
        this.tweens.add({
          targets: t, alpha: { from: 0, to: 1 }, duration: 90,
          repeat: 2, yoyo: true,
          onComplete: () => t.setAlpha(1),
        });
      });
    }
  }

  buildSubtitle(W, cy) {
    const sub = this.add.text(W / 2, cy, "a 2-player rescue mission", {
      fontFamily: FONT, fontSize: "24px", color: "#8fa3d9",
    }).setOrigin(0.5);
    // slow hue shimmer: sweep the colour around the wheel (setColor works under
    // canvas — it is a CSS string, not a WebGL tint).
    const hue = { h: 200 };
    this.tweens.add({
      targets: hue, h: 340, duration: 4200, yoyo: true, repeat: -1, ease: "sine.inOut",
      onUpdate: () => {
        const c = Phaser.Display.Color.HSVToRGB(hue.h / 360, 0.45, 1);
        sub.setColor(Phaser.Display.Color.RGBToString(c.r, c.g, c.b));
      },
    });
  }

  // --- robots + Bolt with floor shadow ellipses -------------------------------
  buildCast(W) {
    const y = 242;
    const shadow = this.add.graphics().setDepth(-1);
    [-130, 0, 130].forEach((dx) => {
      shadow.fillStyle(0x000000, 0.32).fillEllipse(W / 2 + dx, y + 44, 74, 16);
    });

    const beep = this.add.image(W / 2 - 130, y, "robot_b").setScale(1.6);
    const boop = this.add.image(W / 2 + 130, y, "robot_o").setScale(1.6);
    this.tweens.add({ targets: [beep, boop], y: "-=10", duration: 900, yoyo: true, repeat: -1, ease: "sine.inOut" });

    const bolt = this.add.graphics({ x: W / 2, y: y + 8 });
    bolt.fillStyle(0xd9dee8).fillRoundedRect(-22, -8, 44, 24, 10); // body
    bolt.fillStyle(0xd9dee8).fillCircle(20, -12, 13); // head
    bolt.fillStyle(0x333a4c).fillCircle(24, -14, 3); // eye
    bolt.fillStyle(0xd9dee8).fillTriangle(12, -22, 18, -26, 20, -18); // ear
    bolt.lineStyle(4, 0xd9dee8).lineBetween(-20, -4, -32, -16); // tail
    bolt.fillStyle(0xff9944).fillCircle(-32, -16, 4);
    this.tweens.add({ targets: bolt, angle: { from: -4, to: 4 }, duration: 500, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  buildStory(W, cy) {
    this.add.text(W / 2, cy,
      'K.O.B.I. grabbed your robo-puppy BOLT. "NO PETS ALLOWED."\nChase him through the lab — neither of you can do it alone.',
      { fontFamily: FONT, fontSize: "15px", color: "#c6d2f2", align: "center", lineSpacing: 6 }
    ).setOrigin(0.5);
  }

  // --- vertical keyboard-driven button stack ----------------------------------
  buildMenu(W, H) {
    const save = loadSave();
    const hasSave = save.unlocked > 1 || totalCores(save) > 0;
    this.hasSave = hasSave;

    const items = [];
    if (hasSave) items.push({ id: "continue", label: "CONTINUE" });
    items.push({ id: "new", label: "NEW GAME" });
    items.push({ id: "tutorial", label: "TUTORIAL" });
    this.menuItems = items;
    this.sel = 0; // CONTINUE when present, else NEW GAME — both default to index 0

    const bw = 380, bh = 50, gap = 12;
    const top = 388;
    items.forEach((it, i) => {
      const y = top + i * (bh + gap);
      const cont = this.add.container(W / 2, y);
      const g = this.add.graphics();
      const label = this.add.text(0, 0, it.label, {
        fontFamily: FONT, fontSize: "26px", fontStyle: "bold", color: "#eaf2ff",
      }).setOrigin(0.5);
      const chev = this.add.text(-bw / 2 + 26, 0, "▶", {
        fontFamily: FONT, fontSize: "20px", color: "#eaf2ff",
      }).setOrigin(0.5).setVisible(false);
      cont.add([g, label, chev]);
      it.cont = cont; it.g = g; it.labelObj = label; it.chev = chev; it.bw = bw; it.bh = bh;
    });

    this.updateMenu();

    // playtest / introspection surface
    window.__BB = window.__BB || {};
    window.__BB.menu = {
      items: items.map((it) => ({ id: it.id, label: it.label })),
      get sel() { return this._scene.sel; },
      _scene: this,
      select: (i) => this.selectIndex(i),
      activate: () => this.activate(),
    };
  }

  drawButton(it, selected) {
    const g = it.g;
    const hw = it.bw / 2, hh = it.bh / 2;
    g.clear();
    if (selected) {
      g.fillStyle(0x2a2010, 0.92).fillRoundedRect(-hw, -hh, it.bw, it.bh, 12);
      g.lineStyle(3, ACCENT, 1).strokeRoundedRect(-hw, -hh, it.bw, it.bh, 12);
      // soft outer glow ring
      g.lineStyle(6, ACCENT, 0.18).strokeRoundedRect(-hw - 4, -hh - 4, it.bw + 8, it.bh + 8, 14);
    } else {
      g.fillStyle(COLORS.panel, 0.72).fillRoundedRect(-hw, -hh, it.bw, it.bh, 12);
      g.lineStyle(2, ACCENT, 0.4).strokeRoundedRect(-hw, -hh, it.bw, it.bh, 12);
    }
  }

  updateMenu() {
    this.menuItems.forEach((it, i) => {
      const on = i === this.sel;
      this.drawButton(it, on);
      it.cont.setScale(on ? 1.05 : 1);
      it.chev.setVisible(on);
      it.labelObj.setColor(on ? "#fff2d8" : "#9fb0d6");
    });
  }

  moveSel(d) {
    const n = this.menuItems.length;
    this.sel = (this.sel + d + n) % n;
    sfx.menuMove();
    this.resetErase();
    this.updateMenu();
  }

  selectIndex(i) {
    if (i < 0 || i >= this.menuItems.length) return;
    this.sel = i;
    this.resetErase();
    this.updateMenu();
  }

  resetErase() {
    if (this.eraseTimer) { this.eraseTimer.remove(); this.eraseTimer = null; }
    const ng = this.menuItems.find((it) => it.id === "new");
    if (ng && this.eraseArmed) {
      ng.labelObj.setText("NEW GAME");
      this.eraseArmed = false;
    }
  }

  activate() {
    const it = this.menuItems[this.sel];
    if (!it) return;
    if (it.id === "continue") {
      sfx.menuSelect();
      this.scene.start("Hub");
    } else if (it.id === "new") {
      if (!this.hasSave) {
        sfx.menuSelect();
        this.scene.start("Hub");
        return;
      }
      if (!this.eraseArmed) {
        // first press: arm the kid-proof confirm for 3s
        sfx.menuDeny();
        it.labelObj.setText("erase everything? press again!");
        this.eraseArmed = true;
        this.eraseTimer = this.time.delayedCall(3000, () => {
          it.labelObj.setText("NEW GAME");
          this.eraseArmed = false;
          this.eraseTimer = null;
        });
      } else {
        // second press: wipe and start fresh
        sfx.menuSelect();
        this.resetErase();
        storeSave({ unlocked: 1, cores: {} });
        this.scene.start("Hub");
      }
    } else if (it.id === "tutorial") {
      // Sprint 10 replaces this toast with the real tutorial start.
      sfx.menuDeny();
      this.showToast("KOBI: Orientation is still being MOPPED. Come back soon.");
    }
  }

  showToast(msg) {
    if (!this.toast) {
      this.toast = this.add.text(this.scale.width / 2, 690, "", {
        fontFamily: FONT, fontSize: "16px", fontStyle: "italic", color: "#ff9daa",
      }).setOrigin(0.5).setDepth(5);
    }
    this.toast.setText(msg).setAlpha(1);
    if (this.toastTween) this.toastTween.remove();
    this.toastTween = this.tweens.add({ targets: this.toast, alpha: 0, delay: 2600, duration: 600 });
  }

  // --- compact two-column controls footer -------------------------------------
  buildFooter(W, H) {
    const y = 596;
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.panel, 0.8).fillRoundedRect(W / 2 - 300, y, 600, 62, 10);
    panel.lineStyle(2, COLORS.panelEdge).strokeRoundedRect(W / 2 - 300, y, 600, 62, 10);
    panel.lineStyle(2, COLORS.panelEdge, 0.7).lineBetween(W / 2, y + 8, W / 2, y + 54);
    this.add.text(W / 2 - 150, y + 14, "P1 — BEEP", { fontFamily: FONT, fontSize: "15px", fontStyle: "bold", color: "#4dc9ff" }).setOrigin(0.5);
    this.add.text(W / 2 - 150, y + 40, "A / D · jump W · SPACE", { fontFamily: FONT, fontSize: "14px", color: "#c6d2f2" }).setOrigin(0.5);
    this.add.text(W / 2 + 150, y + 14, "P2 — BOOP", { fontFamily: FONT, fontSize: "15px", fontStyle: "bold", color: "#ffa14d" }).setOrigin(0.5);
    this.add.text(W / 2 + 150, y + 40, "← / → · jump ↑ · L", { fontFamily: FONT, fontSize: "14px", color: "#c6d2f2" }).setOrigin(0.5);

    this.add.text(W / 2, y + 78, "W / ↑↓ move   ·   SPACE / E / L / Enter select   ·   S sound settings", {
      fontFamily: FONT, fontSize: "14px", color: "#8fa3d9",
    }).setOrigin(0.5);
  }

  // --- tiny blinking KOBI eye peeking from a corner + caption gag --------------
  buildKobiCorner(W, H) {
    const ex = W - 66, ey = H - 60;
    const eye = this.add.container(ex, ey).setDepth(4);
    const g = this.add.graphics();
    g.fillStyle(0x1a1024, 0.95).fillCircle(0, 0, 26);
    g.lineStyle(2, COLORS.magenta, 0.8).strokeCircle(0, 0, 26);
    g.fillStyle(0xffffff, 0.92).fillCircle(0, 0, 16);
    g.fillStyle(0xff4dd2, 1).fillCircle(3, 0, 8);
    g.fillStyle(0x2a0a1e, 1).fillCircle(4, 0, 4);
    g.fillStyle(0xffffff, 0.9).fillCircle(1, -3, 2);
    // eyelid used for blinking
    const lid = this.add.graphics();
    eye.add([g, lid]);
    const blink = () => {
      lid.clear();
      lid.fillStyle(0x1a1024, 1).fillRect(-27, -27, 54, 0);
      this.tweens.add({
        targets: { h: 0 }, h: 27, duration: 90, yoyo: true,
        onUpdate: (tw, tgt) => { lid.clear(); lid.fillStyle(0x1a1024, 1).fillRect(-27, -27, 54, tgt.h); lid.fillRect(-27, 27 - tgt.h, 54, tgt.h); },
        onComplete: () => lid.clear(),
      });
      this.time.delayedCall(1600 + Math.random() * 2600, blink);
    };
    this.time.delayedCall(1200 + Math.random() * 1500, blink);

    this.add.text(ex - 40, ey - 40, "K.O.B.I.\nKeeper Of\nBuilding Integrity", {
      fontFamily: FONT, fontSize: "11px", fontStyle: "italic", color: "#c98fd9", align: "right",
    }).setOrigin(1, 0.5);
  }
}
