import Phaser from "phaser";
import { COLORS, WORLD_THEMES, FONT, FS, TEXT } from "../constants.js";
import { addGradient, addMotes } from "../backdrop.js";
import { LEVELS } from "../levels/registry.js";
import { initAudio, sfx } from "../audio.js";
import { pads, showPadToast } from "../pad.js";

const ACCENT = WORLD_THEMES[1].accent; // world-1 amber, matching the title menu

// U10 (F6): First-run onboarding interstitial. Fresh save + NEW GAME lands here
// BEFORE the hub: one KOBI panel — "First shift? Orientation is MANDATORY." —
// with two picks, [ORIENTATION] / [SKIP — I'm BRAVE]. One press to choose.
// Keyboard reuses the title's select/confirm keys; pad reuses U7's pad1 nav +
// confirm/back mapping. Title-screen visual language (tokens, panel, keycaps).
// The interstitial is ONLY ever reached from the fresh-save path — a save that
// already exists never routes here (see TitleScene.activate).
export default class OnboardScene extends Phaser.Scene {
  constructor() {
    super("Onboard");
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    addGradient(this, 1);
    this.add.tileSprite(0, 0, W, H, "bggrid").setOrigin(0).setAlpha(0.22).setDepth(-8);
    addMotes(this, WORLD_THEMES[1].accent2);
    this.cameras.main.fadeIn(250, 4, 6, 20);
    this.leaving = false;

    this.buildPanel(W, H);

    this.input.keyboard.addCapture("SPACE");
    this.input.keyboard.on("keydown", (ev) => {
      initAudio();
      const c = ev.code;
      if (c === "KeyW" || c === "ArrowUp") this.moveSel(-1);
      else if (c === "KeyS" || c === "ArrowDown") this.moveSel(1);
      else if (["Space", "KeyE", "KeyL", "Enter"].includes(c)) this.activate();
    });

    // playtest / introspection surface (mirrors window.__BB.menu shape)
    window.__BB = window.__BB || {};
    window.__BB.onboard = {
      options: this.options.map((o) => ({ id: o.id, label: o.label })),
      get sel() { return this._scene.sel; },
      _scene: this,
      select: (i) => this.selectIndex(i),
      activate: () => this.activate(),
    };

    this.events.once("shutdown", () => {
      if (window.__BB) window.__BB.onboard = null;
    });
  }

  // U7: pad1 drives the interstitial 1:1 with the keyboard — up/down select,
  // A/confirm chooses, B/back picks SKIP (the "no thanks" answer). Any button
  // counts for the audio unlock; a fresh connection pops the detection toast.
  update(time) {
    pads.poll(time);
    const p = pads.p(0);
    if (pads.anyButtonJust()) initAudio();
    const conn = pads.consumeConnected();
    if (conn) conn.forEach((idx) => showPadToast(this, idx));
    if (p.upJust) this.moveSel(-1);
    else if (p.downJust) this.moveSel(1);
    if (p.confirmJust) this.activate();
    else if (p.backJust) this.selectIndex(1, true); // B = "skip, I'm brave"
  }

  buildPanel(W, H) {
    const cx = W / 2;
    // --- KOBI panel: title-screen panel tokens + magenta KOBI rim ------------
    const pw = 620, ph = 300, px = cx - pw / 2, py = 168;
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.panel, 0.9).fillRoundedRect(px, py, pw, ph, 16);
    panel.lineStyle(2, COLORS.magenta, 0.75).strokeRoundedRect(px, py, pw, ph, 16);
    panel.fillStyle(COLORS.magenta, 0.85).fillRoundedRect(px, py, pw, 5, { tl: 16, tr: 16, bl: 0, br: 0 });

    this.buildKobiAvatar(cx, py + 74);

    this.add.text(cx, py + 150, "First shift? Orientation is MANDATORY.", {
      fontFamily: FONT, fontSize: FS.head, fontStyle: "bold", color: TEXT.bright, align: "center",
    }).setOrigin(0.5);
    this.add.text(cx, py + 180, "— K.O.B.I., Keeper Of Building Integrity", {
      fontFamily: FONT, fontSize: FS.mini, fontStyle: "italic", color: "#ff8ae0",
    }).setOrigin(0.5);

    // --- two picks -----------------------------------------------------------
    this.options = [
      { id: "orientation", label: "ORIENTATION" },
      { id: "skip", label: "SKIP — I'm BRAVE" },
    ];
    this.sel = 0;

    const bw = 320, bh = 46, gap = 14;
    const top = py + 214;
    this.btnTop = top;
    this.btnStep = bh + gap;
    this.options.forEach((o, i) => {
      const y = top + i * (bh + gap);
      const cont = this.add.container(cx, y);
      const g = this.add.graphics();
      const label = this.add.text(0, 0, o.label, {
        fontFamily: FONT, fontSize: FS.head, fontStyle: "bold", color: TEXT.bright,
      }).setOrigin(0.5);
      const chev = this.add.text(-bw / 2 + 24, 0, "▶", {
        fontFamily: FONT, fontSize: FS.body, color: TEXT.bright,
      }).setOrigin(0.5).setVisible(false);
      cont.add([g, label, chev]);
      o.cont = cont; o.g = g; o.labelObj = label; o.chev = chev; o.bw = bw; o.bh = bh;
    });

    // footer hint row: which keys pick (title footer style)
    this.add.text(cx, top + 2 * (bh + gap) + 6,
      "↑ ↓ move    SPACE / E / L / ↵ choose", {
      fontFamily: FONT, fontSize: FS.mini, color: TEXT.dim,
    }).setOrigin(0.5);

    this.updateButtons();
  }

  // KOBI avatar: the same round eye + red iris the blip bar uses, scaled up.
  buildKobiAvatar(cx, cy) {
    const av = this.add.graphics();
    av.fillStyle(0x1a1020, 1).fillCircle(cx, cy, 34);
    av.lineStyle(2.5, COLORS.magenta, 0.85).strokeCircle(cx, cy, 34);
    av.fillStyle(0xf6f0ff, 1).fillCircle(cx, cy, 26);      // sclera
    av.fillStyle(0xff3b30, 1).fillCircle(cx, cy, 12);       // red iris
    av.fillStyle(0x120306, 1).fillCircle(cx, cy, 5.5);      // pupil
    av.fillStyle(0xffffff, 0.9).fillCircle(cx - 4, cy - 5, 3); // catchlight
    // a soft magenta bloom ring
    const glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.3);
    glow.lineStyle(4, COLORS.magenta, 0.5).strokeCircle(cx, cy, 37);
    this.tweens.add({ targets: glow, alpha: { from: 0.15, to: 0.4 }, duration: 1200, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  drawButton(o, selected) {
    const g = o.g;
    const hw = o.bw / 2, hh = o.bh / 2;
    g.clear();
    if (selected) {
      g.fillStyle(0x2a2010, 0.92).fillRoundedRect(-hw, -hh, o.bw, o.bh, 12);
      g.lineStyle(3, ACCENT, 1).strokeRoundedRect(-hw, -hh, o.bw, o.bh, 12);
      g.lineStyle(6, ACCENT, 0.18).strokeRoundedRect(-hw - 4, -hh - 4, o.bw + 8, o.bh + 8, 14);
    } else {
      g.fillStyle(COLORS.panel, 0.72).fillRoundedRect(-hw, -hh, o.bw, o.bh, 12);
      g.lineStyle(2, ACCENT, 0.4).strokeRoundedRect(-hw, -hh, o.bw, o.bh, 12);
    }
  }

  updateButtons() {
    this.options.forEach((o, i) => {
      const on = i === this.sel;
      this.drawButton(o, on);
      o.cont.setScale(on ? 1.05 : 1);
      o.chev.setVisible(on);
      o.labelObj.setColor(on ? "#fff2d8" : "#9fb0d6");
    });
  }

  moveSel(d) {
    const n = this.options.length;
    this.sel = (this.sel + d + n) % n;
    sfx.menuMove();
    this.updateButtons();
  }

  selectIndex(i, activate = false) {
    if (i < 0 || i >= this.options.length) return;
    this.sel = i;
    this.updateButtons();
    if (activate) this.activate();
  }

  activate() {
    if (this.leaving) return;
    const o = this.options[this.sel];
    if (!o) return;
    this.leaving = true;
    sfx.menuSelect();
    this.cameras.main.fadeOut(250, 4, 6, 20);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      if (o.id === "orientation") {
        // run the tutorial, then return to the HUB (not Title) in THIS flow.
        this.scene.start("Game", {
          levelIndex: LEVELS.findIndex((l) => l.tutorial),
          returnToHub: true,
        });
      } else {
        this.scene.start("Hub"); // SKIP — straight to the hub, as today
      }
    });
  }
}
