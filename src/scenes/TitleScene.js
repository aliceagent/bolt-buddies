import Phaser from "phaser";
import { COLORS, WORLD_THEMES, FONT, FS, TEXT } from "../constants.js";
import { addGradient, addMotes } from "../backdrop.js";
import { LEVELS } from "../levels/registry.js";
import { loadSave, storeSave, totalCores } from "../save.js";
import { initAudio, sfx, playTrack, installMute } from "../audio.js";

const ACCENT = WORLD_THEMES[1].accent; // world-1 amber accent for buttons
const hexStr = (n) => "#" + (n & 0xffffff).toString(16).padStart(6, "0");

// Neon two-tone endpoints for the wordmark colour cycle (cyan <-> magenta).
const TONE_A = [53, 240, 255];
const TONE_B = [255, 77, 210];
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const mixTone = (t) => [lerp(TONE_A[0], TONE_B[0], t), lerp(TONE_A[1], TONE_B[1], t), lerp(TONE_A[2], TONE_B[2], t)];
const rgbCss = (c, f = 1) => `rgb(${Math.round(c[0] * f)},${Math.round(c[1] * f)},${Math.round(c[2] * f)})`;

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
    this.cameras.main.fadeIn(250, 4, 6, 20); // 250ms fade-in on entry
    this.leaving = false; // guards the fade-out so a second Enter can't double-start

    this.buildSkyline(W);   // distant silhouette strip + conveyor (behind the cast)
    this.buildLogo(W, 86);
    this.buildSubtitle(W, 140);
    this.buildCast(W);
    this.buildStory(W, 306);
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
      if (this.flickerTimer) this.flickerTimer.remove();
    });
  }

  // --- distant lab skyline + a scrolling conveyor line ------------------------
  buildSkyline(W) {
    // silhouette strip sits behind the cast; buildings/cranes bleed down behind
    // the menu so the mid-screen band is no longer an empty gradient.
    this.add.image(W / 2, 470, "labskyline").setOrigin(0.5, 1).setDepth(-5).setAlpha(0.55);

    // antenna-tip blink lights (texture coords [x, ty]; skyline baseline y=280,
    // placed with its bottom at 470 => worldY = 470 - (300 - ty)).
    const tips = [[210, 64, 0xff6a52], [720, 50, 0xffc24d], [1060, 84, 0xff6a52]];
    tips.forEach(([tx, ty, col], i) => {
      const wx = tx; // image is 1280 wide, centred on W/2 => texX maps 1:1
      const wy = 470 - (300 - ty);
      const dot = this.add.graphics({ x: wx, y: wy }).setDepth(-4);
      dot.fillStyle(col, 0.9).fillCircle(0, 0, 2.4);
      dot.fillStyle(col, 0.25).fillCircle(0, 0, 5);
      dot.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2);
      this.tweens.add({
        targets: dot, alpha: { from: 0.2, to: 1 }, duration: 620 + i * 140,
        yoyo: true, repeat: -1, hold: 120, repeatDelay: 300 + i * 260, ease: "sine.inOut",
      });
    });

    // conveyor carrying tiny silhouette parts, under the cast's floor shadows
    const belt = this.add.tileSprite(W / 2, 232, W, 58, "conveyor")
      .setOrigin(0.5, 0).setDepth(-4).setAlpha(0.92);
    this.tweens.add({ targets: belt, tilePositionX: 220, duration: 5200, repeat: -1, ease: "linear" });
  }

  // --- neon logo: per-letter tube (glow + tube + core) + colour cycle ---------
  buildLogo(W, cy) {
    const text = "BOLT BUDDIES";
    const style = { fontFamily: FONT, fontSize: FS.hero, fontStyle: "bold" };

    // measure each glyph so per-letter copies can be centred exactly
    const widths = [];
    let total = 0;
    for (const ch of text) {
      const probe = this.add.text(0, 0, ch, style).setVisible(false);
      widths.push(probe.width);
      total += probe.width;
      probe.destroy();
    }

    const fill0 = rgbCss(TONE_A);
    const stroke0 = rgbCss(TONE_A, 0.32);
    this.neon = [];
    let x = W / 2 - total / 2;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const cx = x + widths[i] / 2;
      x += widths[i];
      if (ch === " ") continue;

      const cont = this.add.container(cx, cy).setDepth(0);
      // additive bloom copies (enlarged from centre) — actually visible on Canvas
      const glow2 = this.add.text(0, 0, ch, { ...style, color: fill0 })
        .setOrigin(0.5).setScale(1.34).setAlpha(0.32).setBlendMode(Phaser.BlendModes.ADD);
      const glow1 = this.add.text(0, 0, ch, { ...style, color: fill0 })
        .setOrigin(0.5).setScale(1.16).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD);
      // glass tube: the glyph BODY is the full saturated cycle tone, rimmed by a
      // darker stroke of the same hue
      const tube = this.add.text(0, 0, ch, { ...style, color: fill0, stroke: stroke0, strokeThickness: 8 })
        .setOrigin(0.5);
      // hot filament core: a small near-white centre kept well INSIDE the tube
      // body so the saturated colour dominates the glyph (0.9 was a wash-out)
      const core = this.add.text(0, 0, ch, { ...style, color: "#f4ffff" })
        .setOrigin(0.5).setScale(0.68);
      cont.add([glow2, glow1, tube, core]);
      cont.setAlpha(0); // flicker-on below

      this.neon.push({ cont, glow1, glow2, tube });

      // flicker-on: a couple of quick blinks, then settle lit
      this.time.delayedCall(Math.random() * 700, () => {
        if (!cont.active) return;
        this.tweens.add({
          targets: cont, alpha: { from: 0, to: 1 }, duration: 90, repeat: 2, yoyo: true,
          onComplete: () => cont.active && cont.setAlpha(1),
        });
      });
    }

    // slow two-tone colour cycle across the whole wordmark (bucketed so text
    // re-renders only ~20 times per half-cycle, never per frame)
    this.neonTone = { t: 0, bucket: -1 };
    this.tweens.add({
      targets: this.neonTone, t: 1, duration: 4600, yoyo: true, repeat: -1, ease: "sine.inOut",
      onUpdate: () => {
        const b = Math.round(this.neonTone.t * 20);
        if (b === this.neonTone.bucket) return;
        this.neonTone.bucket = b;
        this.applyNeonTone(this.neonTone.t);
      },
    });

    // occasional single-letter flicker after the initial flicker-on settles
    this.time.delayedCall(2600, () => this.scheduleFlicker());
  }

  // Apply a cycle tone t (0 = cyan, 1 = magenta) to the whole wordmark. Split
  // out from the tween so review tooling can pin either extreme for screenshots.
  applyNeonTone(t) {
    const c = mixTone(t);
    const fill = rgbCss(c);
    const stroke = rgbCss(c, 0.32);
    for (const L of this.neon) {
      L.tube.setColor(fill); L.tube.setStroke(stroke, 8);
      L.glow1.setColor(fill); L.glow2.setColor(fill);
    }
  }

  scheduleFlicker() {
    const lit = (this.neon || []).filter((L) => L.cont.active);
    if (lit.length) {
      const L = Phaser.Utils.Array.GetRandom(lit);
      this.tweens.add({
        targets: L.cont, alpha: { from: 1, to: 0.25 }, duration: 65, yoyo: true, repeat: 1,
        onComplete: () => L.cont.active && L.cont.setAlpha(1),
      });
    }
    this.flickerTimer = this.time.delayedCall(1800 + Math.random() * 3200, () => this.scheduleFlicker());
  }

  buildSubtitle(W, cy) {
    const sub = this.add.text(W / 2, cy, "a 2-player rescue mission", {
      fontFamily: FONT, fontSize: FS.head, color: TEXT.dim,
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

  // --- robots + a robo-puppy Bolt, all on floor-shadow ellipses ---------------
  buildCast(W) {
    const y = 208;
    const shadow = this.add.graphics().setDepth(-1);
    [-130, 0, 130].forEach((dx) => {
      shadow.fillStyle(0x000000, 0.32).fillEllipse(W / 2 + dx, y + 44, 74, 16);
    });

    const beep = this.add.image(W / 2 - 130, y, "robot_b").setScale(1.6);
    const boop = this.add.image(W / 2 + 130, y, "robot_o").setScale(1.6);
    // gentle bob (shared) + a tiny per-robot tread-shuffle x jitter
    this.tweens.add({ targets: [beep, boop], y: "-=10", duration: 900, yoyo: true, repeat: -1, ease: "sine.inOut" });
    this.tweens.add({ targets: beep, x: beep.x + 2.5, duration: 150, yoyo: true, repeat: -1, ease: "sine.inOut" });
    this.tweens.add({ targets: boop, x: boop.x - 2.5, duration: 165, yoyo: true, repeat: -1, ease: "sine.inOut" });
    // occasional blink via the _blink textures
    this.robotBlink(beep, "robot_b");
    this.robotBlink(boop, "robot_o");

    this.buildBolt(W / 2, y + 10);
  }

  robotBlink(img, base) {
    const blink = () => {
      if (!img.active) return;
      img.setTexture(base + "_blink");
      this.time.delayedCall(130, () => img.active && img.setTexture(base));
      this.time.delayedCall(2200 + Math.random() * 2800, blink);
    };
    this.time.delayedCall(1500 + Math.random() * 2200, blink);
  }

  // Bolt the robo-puppy: body + stub legs, head with snout + ear flaps, an eye
  // with a catchlight, and a stub tail that wags. Faces right (toward BOOP).
  buildBolt(cx, cy) {
    const body = 0xd9dee8, dark = 0x8b93a8, collar = ACCENT, eyec = 0x243046;
    const g = this.add.graphics({ x: cx, y: cy }).setDepth(0);
    // stub legs
    g.fillStyle(dark);
    [-16, -4, 12, 22].forEach((lx) => g.fillRoundedRect(lx, 8, 7, 9, 2));
    // body
    g.fillStyle(body).fillRoundedRect(-22, -10, 46, 20, 9);
    g.fillStyle(0xeef1f7, 0.5).fillRoundedRect(-18, -8, 38, 5, 3); // top highlight
    // amber collar just behind the head
    g.fillStyle(collar).fillRect(12, -10, 4, 20);
    g.fillStyle(0xffe0a8, 0.9).fillCircle(14, 2, 2);
    // hind haunch
    g.fillStyle(body).fillCircle(-18, 0, 11);
    // head
    g.fillStyle(body).fillCircle(24, -14, 13);
    g.fillStyle(0xeef1f7, 0.4).fillCircle(21, -18, 5); // head sheen
    // snout
    g.fillStyle(body).fillRoundedRect(30, -12, 14, 11, 4);
    g.fillStyle(dark).fillCircle(43, -8, 2.6); // nose
    g.fillStyle(0x11151f).fillRect(34, -3, 9, 1.6); // mouth line
    // ear flap (floppy, hanging back off the head)
    g.fillStyle(dark).fillTriangle(16, -22, 24, -26, 20, -8);
    g.fillStyle(0x6c7488).fillTriangle(17, -21, 22, -23, 20, -12);
    // eye + catchlight
    g.fillStyle(eyec).fillCircle(27, -15, 3.4);
    g.fillStyle(0xffffff, 0.95).fillCircle(28.2, -16.2, 1.2);
    // little antenna nub so he reads as robotic
    g.lineStyle(2, dark).lineBetween(20, -26, 20, -32);
    g.fillStyle(ACCENT).fillCircle(20, -33, 2.4);
    // gentle body sway
    this.tweens.add({ targets: g, angle: { from: -3, to: 3 }, duration: 520, yoyo: true, repeat: -1, ease: "sine.inOut" });

    // stub tail (separate graphics so it can wag around its base at the rump)
    const tail = this.add.graphics({ x: cx - 20, y: cy - 4 }).setDepth(0);
    tail.fillStyle(body).fillRoundedRect(-3, -16, 6, 18, 3);
    tail.fillStyle(ACCENT).fillCircle(0, -16, 3.5); // amber tail-tip light
    tail.setAngle(30);
    this.tweens.add({ targets: tail, angle: { from: 18, to: 52 }, duration: 210, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  buildStory(W, cy) {
    this.add.text(W / 2, cy,
      'K.O.B.I. grabbed your robo-puppy BOLT. "NO PETS ALLOWED."\nChase him through the lab — neither of you can do it alone.',
      { fontFamily: FONT, fontSize: FS.body, color: TEXT.body, align: "center", lineSpacing: 6 }
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
    const top = 360; // raised ~24px from the old 388
    this.menuTop = top;
    this.menuStep = bh + gap;
    items.forEach((it, i) => {
      const y = top + i * (bh + gap);
      const cont = this.add.container(W / 2, y);
      const g = this.add.graphics();
      const label = this.add.text(0, 0, it.label, {
        fontFamily: FONT, fontSize: FS.title, fontStyle: "bold", color: TEXT.bright,
      }).setOrigin(0.5);
      const chev = this.add.text(-bw / 2 + 26, 0, "▶", {
        fontFamily: FONT, fontSize: FS.lead, color: TEXT.bright,
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

  // KOBI's corner eye glances toward the currently selected button
  glanceAtSelection() {
    this.kobiGlance(this.scale.width / 2, this.menuTop + this.sel * this.menuStep);
  }

  moveSel(d) {
    const n = this.menuItems.length;
    this.sel = (this.sel + d + n) % n;
    sfx.menuMove();
    this.resetErase();
    this.updateMenu();
    this.glanceAtSelection();
  }

  selectIndex(i) {
    if (i < 0 || i >= this.menuItems.length) return;
    this.sel = i;
    this.resetErase();
    this.updateMenu();
    this.glanceAtSelection();
  }

  resetErase() {
    if (this.eraseTimer) { this.eraseTimer.remove(); this.eraseTimer = null; }
    const ng = this.menuItems.find((it) => it.id === "new");
    if (ng && this.eraseArmed) {
      ng.labelObj.setText("NEW GAME");
      this.eraseArmed = false;
    }
  }

  // Guarded fade-out to the Hub (250ms), matching every other scene transition.
  gotoHub() {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(250, 4, 6, 20);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Hub"));
  }

  activate() {
    if (this.leaving) return;
    const it = this.menuItems[this.sel];
    if (!it) return;
    if (it.id === "continue") {
      sfx.menuSelect();
      this.gotoHub();
    } else if (it.id === "new") {
      if (!this.hasSave) {
        sfx.menuSelect();
        this.gotoHub();
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
        this.gotoHub();
      }
    } else if (it.id === "tutorial") {
      // Sprint 10: launch the hidden tutorial chamber ("Orientation Day").
      sfx.menuSelect();
      this.leaving = true;
      this.cameras.main.fadeOut(250, 4, 6, 20);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.start("Game", { levelIndex: LEVELS.findIndex((l) => l.tutorial) });
      });
    }
  }

  showToast(msg) {
    if (!this.toast) {
      this.toast = this.add.text(this.scale.width / 2, 690, "", {
        fontFamily: FONT, fontSize: FS.body, fontStyle: "italic", color: TEXT.warn,
      }).setOrigin(0.5).setDepth(5);
    }
    this.toast.setText(msg).setAlpha(1);
    if (this.toastTween) this.toastTween.remove();
    this.toastTween = this.tweens.add({ targets: this.toast, alpha: 0, delay: 2600, duration: 600 });
  }

  // A rounded key-cap chip: reuses the `keycap` texture for single glyphs, and a
  // matching drawn wide cap for word keys. Coloured border + letter per player.
  keyCap(x, y, label, colNum, colStr) {
    const cont = this.add.container(x, y);
    if (label.length <= 1) {
      const cap = this.add.image(0, 0, "keycap");
      const bdr = this.add.graphics();
      bdr.lineStyle(2.5, colNum, 1).strokeRoundedRect(-17, -17, 34, 34, 8);
      const t = this.add.text(0, -1, label, {
        fontFamily: FONT, fontSize: FS.head, fontStyle: "bold", color: colStr,
      }).setOrigin(0.5);
      cont.add([cap, bdr, t]);
      cont.capW = 34;
    } else {
      const w = 18 + label.length * 9;
      const g = this.add.graphics();
      g.fillStyle(0x0a0f1e, 0.96).fillRoundedRect(-w / 2, -17, w, 34, 8);
      g.fillStyle(0x1a2338, 0.95).fillRoundedRect(-w / 2 + 2, -16, w - 4, 26, 7);
      g.fillStyle(0xffffff, 0.08).fillRoundedRect(-w / 2 + 4, -14, w - 8, 8, 4);
      g.lineStyle(2.5, colNum, 1).strokeRoundedRect(-w / 2, -17, w, 34, 8);
      const t = this.add.text(0, -1, label, {
        fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: colStr,
      }).setOrigin(0.5);
      cont.add([g, t]);
      cont.capW = w;
    }
    return cont;
  }

  // Lay out a centred row mixing key-cap chips ({k}) and small labels ({t}).
  chipRow(cx, y, items, colNum, colStr) {
    const GAP = 6;
    const parts = items.map((it) => ({
      ...it, w: it.t ? it.t.length * 7 + 6 : (it.k.length > 1 ? 18 + it.k.length * 9 : 34),
    }));
    const total = parts.reduce((s, p) => s + p.w, 0) + GAP * (parts.length - 1);
    let x = cx - total / 2;
    for (const p of parts) {
      const mid = x + p.w / 2;
      if (p.t) {
        this.add.text(mid, y, p.t, { fontFamily: FONT, fontSize: FS.mini, color: TEXT.dim }).setOrigin(0.5);
      } else {
        this.keyCap(mid, y, p.k, colNum, colStr);
      }
      x += p.w + GAP;
    }
  }

  // --- controls footer: key-cap chips + top accent bar ------------------------
  buildFooter(W, H) {
    const pw = 724, ph = 106, px = W / 2 - pw / 2, py = 548;
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.panel, 0.82).fillRoundedRect(px, py, pw, ph, 12);
    panel.lineStyle(2, COLORS.panelEdge).strokeRoundedRect(px, py, pw, ph, 12);
    // subtle top accent bar
    panel.fillStyle(ACCENT, 0.85).fillRoundedRect(px, py, pw, 5, { tl: 12, tr: 12, bl: 0, br: 0 });
    // centre divider between the two player columns
    panel.lineStyle(2, COLORS.panelEdge, 0.7).lineBetween(W / 2, py + 20, W / 2, py + 60);

    const beepN = COLORS.beep, beepS = "#4dc9ff";
    const boopN = COLORS.boop, boopS = "#ffa14d";
    const cLeft = px + pw / 4, cRight = px + (pw * 3) / 4;

    this.add.text(cLeft, py + 22, "P1 · BEEP", { fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: beepS }).setOrigin(0.5);
    this.add.text(cRight, py + 22, "P2 · BOOP", { fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: boopS }).setOrigin(0.5);

    this.chipRow(cLeft, py + 52, [
      { k: "A" }, { k: "D" }, { t: "move" }, { k: "W" }, { t: "jump" }, { k: "SPACE" }, { t: "act" },
    ], beepN, beepS);
    this.chipRow(cRight, py + 52, [
      { k: "←" }, { k: "→" }, { t: "move" }, { k: "↑" }, { t: "jump" }, { k: "L" }, { t: "act" },
    ], boopN, boopS);

    // menu navigation hints across the bottom
    this.chipRow(W / 2, py + 86, [
      { k: "↑" }, { k: "↓" }, { t: "move" }, { k: "SPACE" }, { k: "E" }, { k: "L" }, { k: "↵" }, { t: "select" }, { k: "S" }, { t: "settings" },
    ], ACCENT, hexStr(ACCENT));
  }

  // --- KOBI corner eye: wandering iris that glances at the selected button -----
  buildKobiCorner(W, H) {
    const ex = W - 66, ey = H - 60;
    this.kobiEye = { x: ex, y: ey };
    const eye = this.add.container(ex, ey).setDepth(4);
    const sclera = this.add.graphics();
    sclera.fillStyle(0x1a1024, 0.95).fillCircle(0, 0, 26);
    sclera.lineStyle(2, COLORS.magenta, 0.8).strokeCircle(0, 0, 26);
    sclera.fillStyle(0xffffff, 0.92).fillCircle(0, 0, 16);
    // iris as its own container so it can wander / glance within the sclera
    const iris = this.add.container(0, 0);
    const ig = this.add.graphics();
    ig.fillStyle(0xff4dd2, 1).fillCircle(0, 0, 8);
    ig.fillStyle(0x2a0a1e, 1).fillCircle(0, 0, 4);
    ig.fillStyle(0xffffff, 0.9).fillCircle(-2, -3, 2);
    iris.add(ig);
    const lid = this.add.graphics();
    eye.add([sclera, iris, lid]);
    this.kobiIris = iris;
    this.kobiGlancing = false;

    // idle wander: drift the iris to random points inside the sclera
    const wander = () => {
      if (!this.kobiIris) return;
      if (this.kobiGlancing) { this.time.delayedCall(500, wander); return; }
      const a = Math.random() * Math.PI * 2, r = Math.random() * 7;
      this.tweens.add({
        targets: iris, x: Math.cos(a) * r, y: Math.sin(a) * r, duration: 900, ease: "sine.inOut",
        onComplete: () => this.time.delayedCall(500 + Math.random() * 1000, wander),
      });
    };
    this.time.delayedCall(900, wander);

    // blink using an eyelid wipe
    const blink = () => {
      this.tweens.add({
        targets: { h: 0 }, h: 27, duration: 90, yoyo: true,
        onUpdate: (tw, tgt) => {
          lid.clear();
          lid.fillStyle(0x1a1024, 1).fillRect(-27, -27, 54, tgt.h);
          lid.fillRect(-27, 27 - tgt.h, 54, tgt.h);
        },
        onComplete: () => lid.clear(),
      });
      this.time.delayedCall(1600 + Math.random() * 2600, blink);
    };
    this.time.delayedCall(1200 + Math.random() * 1500, blink);

    this.add.text(ex - 40, ey - 40, "K.O.B.I.\nKeeper Of\nBuilding Integrity", {
      fontFamily: FONT, fontSize: FS.tiny, fontStyle: "italic", color: "#c98fd9", align: "right",
    }).setOrigin(1, 0.5);
  }

  // Snap the iris toward a world point for a beat, then resume wandering.
  kobiGlance(tx, ty) {
    if (!this.kobiIris) return;
    const dx = tx - this.kobiEye.x, dy = ty - this.kobiEye.y;
    const d = Math.hypot(dx, dy) || 1;
    const r = 8;
    this.kobiGlancing = true;
    this.tweens.add({
      targets: this.kobiIris, x: (dx / d) * r, y: (dy / d) * r, duration: 180, ease: "back.out",
      onComplete: () => this.time.delayedCall(650, () => { this.kobiGlancing = false; }),
    });
  }
}
