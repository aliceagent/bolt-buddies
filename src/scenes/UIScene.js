import Phaser from "phaser";
import { COLORS, WORLD_THEMES } from "../constants.js";
import { LEVELS } from "../levels/registry.js";
import { sfx, installMute, duckMusic } from "../audio.js";

const FONT = "'Courier New', monospace";

const SKILL_ICON = { grapple: "icon_grapple", heavy: "icon_heavy", phase: "icon_phase", tiny: "icon_tiny" };

// player-color css strings for HUD text (mirrors COLORS.beep / COLORS.boop)
const P_HEX = ["#4dc9ff", "#ffa14d"];
const P_COL = [COLORS.beep, COLORS.boop];

// pointy-top hexagon outline, centred on (0,0) — precomputed once, reused for
// every core pip so nothing is allocated per frame / per redraw.
const HEX = [];
for (let i = 0; i < 6; i++) {
  const a = (Math.PI / 180) * (60 * i - 90);
  HEX.push(new Phaser.Geom.Point(11 * Math.cos(a), 11 * Math.sin(a)));
}

// Default KOBI mood from the line's tone when a blip carries no explicit tag:
// he's smug (gloating) most of the time, spits when a plan backfires (angry),
// and deflates in defeat. Explicit { mood } on the event always wins.
function moodForText(t) {
  if (/fine!\s*fine|give up|you win|maintenance tunnels/i.test(t)) return "defeated";
  if (/!!|cheating|paycheck|how dare/i.test(t)) return "angry";
  return "gloating";
}

// HUD lives in its own scene so GameScene's camera zoom never touches it.
export default class UIScene extends Phaser.Scene {
  constructor() {
    super("UI");
  }

  init(data) {
    this.levelIndex = data.levelIndex;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const lvl = LEVELS[this.levelIndex];
    const theme = WORLD_THEMES[lvl.world] || WORLD_THEMES[1];
    this.accent = theme.accent;

    // --- top-bar player panels -------------------------------------------------
    this.pInfo = [this.buildPlayerPanel(0, W), this.buildPlayerPanel(1, W)];

    // --- centre level plate + world-accent underline ---------------------------
    const plateStr = `${lvl.id} · ${lvl.name.toUpperCase()}`;
    const plateBg = this.add.graphics();
    this.plateText = this.add.text(W / 2, 13, plateStr, {
      fontFamily: FONT, fontSize: "15px", fontStyle: "bold", color: "#cdd8f5",
    }).setOrigin(0.5, 0);
    const tw = this.plateText.width;
    plateBg.fillStyle(0x0a0f1e, 0.7).fillRoundedRect(W / 2 - tw / 2 - 16, 9, tw + 32, 26, 9);
    plateBg.lineStyle(1, theme.accent, 0.35).strokeRoundedRect(W / 2 - tw / 2 - 16, 9, tw + 32, 26, 9);
    this.add.rectangle(W / 2, 38, tw + 10, 3, theme.accent, 0.9);

    // --- core pip tray + key chip ---------------------------------------------
    const trayW = 92;
    const tray = this.add.graphics();
    tray.fillStyle(0x0a0f1e, 0.66).fillRoundedRect(W / 2 - trayW / 2, 50, trayW, 26, 8);
    tray.lineStyle(1, theme.accent, 0.35).strokeRoundedRect(W / 2 - trayW / 2, 50, trayW, 26, 8);
    this.coreState = [false, false, false];
    this.corePips = [0, 1, 2].map((i) => {
      const g = this.add.graphics().setPosition(W / 2 - 26 + i * 26, 63);
      this.drawPip(g, false);
      return g;
    });
    // key chip (hidden until at least one key is held)
    this.keyChip = this.add.graphics().setVisible(false);
    this.keyChip.fillStyle(0x0a0f1e, 0.72).fillRoundedRect(W / 2 + 52, 50, 56, 26, 8);
    this.keyChip.lineStyle(1, 0xffd94d, 0.6).strokeRoundedRect(W / 2 + 52, 50, 56, 26, 8);
    this.keyIcon = this.add.image(W / 2 + 68, 63, "key").setScale(0.6).setVisible(false);
    this.keyText = this.add.text(W / 2 + 82, 55, "", { fontFamily: FONT, fontSize: "15px", fontStyle: "bold", color: "#ffd94d" }).setVisible(false);

    // pooled stars that fly from a collected core's screen position into its pip
    this._flyHead = 0;
    this.flyStars = [];
    for (let i = 0; i < 4; i++) {
      this.flyStars.push(this.add.image(0, 0, "star").setDepth(50)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    }

    // --- KOBI blip bar ---------------------------------------------------------
    this.buildBlipBar(W, H);
    this.blipQueue = [];
    this.blipActive = null;

    // --- level-complete overlay (hidden until bb:complete) ---------------------
    this.overlay = this.add.container(0, 0).setVisible(false);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x02040a, 0.75);
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.panel, 0.97).fillRoundedRect(W / 2 - 300, H / 2 - 150, 600, 300, 16);
    panel.lineStyle(3, COLORS.neon).strokeRoundedRect(W / 2 - 300, H / 2 - 150, 600, 300, 16);
    this.winTitle = this.add.text(W / 2, H / 2 - 95, "CHAMBER CLEAR!", {
      fontFamily: FONT, fontSize: "44px", fontStyle: "bold", color: "#59ff9c",
    }).setOrigin(0.5);
    this.winSub = this.add.text(W / 2, H / 2 - 45, "", { fontFamily: FONT, fontSize: "18px", color: "#c6d2f2" }).setOrigin(0.5);
    this.winCores = [0, 1, 2].map((i) => this.add.image(W / 2 - 40 + i * 40, H / 2 + 15, "core").setAlpha(0.2));
    this.winPrompt = this.add.text(W / 2, H / 2 + 95, "press SPACE or L to continue", {
      fontFamily: FONT, fontSize: "20px", color: "#8fa3d9",
    }).setOrigin(0.5);
    this.overlay.add([dim, panel, this.winTitle, this.winSub, ...this.winCores, this.winPrompt]);
    this.completed = null;

    // --- bottom hint keycap chips (corner, subtle) -----------------------------
    this.buildHints(W, H);

    const E = this.game.events;
    this.h = {
      skill: ({ idx, skill, name }) => {
        const info = this.pInfo[idx];
        const tex = SKILL_ICON[skill];
        if (tex) { info.icon.setTexture(tex).setVisible(true); info.qmark.setVisible(false); }
        info.skillText.setText(name);
      },
      cores: (got) => got.forEach((v, i) => {
        if (v && !this.coreState[i]) {
          this.coreState[i] = true;
          this.drawPip(this.corePips[i], true);
          this.corePips[i].setScale(1.6);
          this.tweens.add({ targets: this.corePips[i], scale: 1, duration: 340, ease: "back.out" });
        } else if (!v && this.coreState[i]) {
          this.coreState[i] = false;
          this.drawPip(this.corePips[i], false);
          this.corePips[i].setScale(1);
        }
      }),
      keys: (n) => {
        const on = n > 0;
        this.keyChip.setVisible(on);
        this.keyIcon.setVisible(on);
        this.keyText.setVisible(on).setText(on ? `x${n}` : "");
      },
      // a star flies from the core's world->screen position into its HUD pip,
      // then pops the pip on arrival (bb:cores stays the fill authority).
      coreFly: ({ x, y, index }) => {
        const pip = this.corePips[index];
        if (!pip) return;
        const s = this.flyStars[this._flyHead];
        this._flyHead = (this._flyHead + 1) % this.flyStars.length;
        this.tweens.killTweensOf(s);
        s.setVisible(true).setPosition(x, y).setScale(1.3).setAlpha(1);
        this.tweens.add({
          targets: s, x: pip.x, y: pip.y, scale: 0.4, alpha: 0.9,
          duration: 460, ease: "cubic.in",
          onComplete: () => {
            s.setVisible(false);
            if (this.coreState[index]) { // re-pop the pip as the star lands
              pip.setScale(1.7);
              this.tweens.add({ targets: pip, scale: 1, duration: 260, ease: "back.out" });
            }
          },
        });
      },
      blip: (payload) => {
        const text = typeof payload === "string" ? payload : payload.text;
        const mood = (typeof payload === "object" && payload.mood) || moodForText(text);
        this.blipQueue.push({ text, mood });
      },
      complete: (info) => {
        this.completed = info;
        this.overlay.setVisible(true);
        this.winSub.setText(`"${info.name}" — data-cores found:`);
        info.cores.forEach((v, i) => this.winCores[i].setAlpha(v ? 1 : 0.2));
        this.tweens.add({ targets: this.winPrompt, alpha: 0.3, duration: 500, yoyo: true, repeat: -1 });
      },
    };
    Object.entries(this.h).forEach(([k, fn]) => E.on(`bb:${k}`, fn));
    this.events.once("shutdown", () => {
      Object.entries(this.h).forEach(([k, fn]) => E.off(`bb:${k}`, fn));
      duckMusic(false); // never leave the bus ducked after the HUD is gone
    });

    // global mute: the UI overlay owns the in-game M key + corner icon (drawn
    // here, not in GameScene, so the camera zoom never scales it)
    installMute(this);

    this.input.keyboard.on("keydown", (ev) => {
      if (this.completed && ["Space", "KeyE", "KeyL", "Enter"].includes(ev.code)) {
        const next = this.completed.index + 1;
        duckMusic(false); // drop any lingering blip duck on the way out
        this.scene.stop("Game");
        this.scene.start("Hub", { sel: next, unlock: this.completed.newlyUnlocked });
        this.scene.stop();
      }
    });
  }

  // One translucent player panel: skill-icon chip + name + skill line + key-cap.
  // side 0 = left (P1 BEEP), side 1 = right (P2 BOOP, mirrored).
  buildPlayerPanel(idx, W) {
    const w = 270, h = 48, y = 10;
    const left = idx === 0;
    const x = left ? 14 : W - 14 - w;
    const col = P_COL[idx];
    const hex = P_HEX[idx];

    const g = this.add.graphics();
    g.fillStyle(0x0a0f1e, 0.72).fillRoundedRect(x, y, w, h, 11);
    g.lineStyle(2, col, 0.85).strokeRoundedRect(x, y, w, h, 11);

    // skill-icon chip
    const chipX = left ? x + 8 : x + w - 8 - 30;
    g.fillStyle(0x141d33, 0.9).fillRoundedRect(chipX, y + 9, 30, 30, 7);
    g.lineStyle(2, col, 0.7).strokeRoundedRect(chipX, y + 9, 30, 30, 7);
    const cCx = chipX + 15, cCy = y + 24;
    const icon = this.add.image(cCx, cCy, "core").setScale(0.86).setVisible(false);
    const qmark = this.add.text(cCx, cCy, "?", { fontFamily: FONT, fontSize: "18px", fontStyle: "bold", color: hex }).setOrigin(0.5).setAlpha(0.6);

    // name + skill line
    const name = idx === 0 ? "P1 BEEP" : "P2 BOOP";
    const txX = left ? chipX + 38 : chipX - 8;
    const org = left ? 0 : 1;
    this.add.text(txX, y + 8, name, { fontFamily: FONT, fontSize: "15px", fontStyle: "bold", color: hex }).setOrigin(org, 0);
    const skillText = this.add.text(txX, y + 27, "no gadget yet", { fontFamily: FONT, fontSize: "12px", color: "#8fa3d9" }).setOrigin(org, 0);

    // key-cap for the action key, tucked at the far edge
    const keyLabel = idx === 0 ? "SPACE" : "L";
    const kw = idx === 0 ? 58 : 30;
    const kx = left ? x + w - 10 - kw : x + 10;
    this.drawKeycap(g, kx, y + 14, kw, 22, col, 0.5);
    this.add.text(kx + kw / 2, y + 25, keyLabel, { fontFamily: FONT, fontSize: "12px", fontStyle: "bold", color: hex }).setOrigin(0.5);

    return { icon, qmark, skillText };
  }

  drawKeycap(g, x, y, w, h, col, alpha) {
    g.fillStyle(0x1a2338, 0.85).fillRoundedRect(x, y, w, h, 5);
    g.lineStyle(1.5, col, alpha).strokeRoundedRect(x, y, w, h, 5);
  }

  drawPip(g, filled) {
    g.clear();
    if (filled) {
      g.fillStyle(this.accent, 1).fillPoints(HEX, true);
      g.lineStyle(2, 0xffffff, 0.85).strokePoints(HEX, true, true);
    } else {
      g.fillStyle(0x161f36, 0.7).fillPoints(HEX, true);
      g.lineStyle(2, this.accent, 0.45).strokePoints(HEX, true, true);
    }
  }

  buildBlipBar(W, H) {
    const x0 = W / 2 - 460, y0 = H - 92, w = 920, h = 66;
    this.blipBar = this.add.container(0, 0).setVisible(false);

    const bg = this.add.graphics();
    bg.fillStyle(0x0a0f1e, 0.88).fillRoundedRect(x0, y0, w, h, 10);
    bg.lineStyle(2, COLORS.magenta, 0.7).strokeRoundedRect(x0, y0, w, h, 10);

    // pulsing magenta border glow (only while a blip is on screen)
    this.blipGlow = this.add.graphics().setAlpha(0);
    this.blipGlow.lineStyle(3, COLORS.magenta, 0.9).strokeRoundedRect(x0 - 2, y0 - 2, w + 4, h + 4, 12);

    // KOBI avatar: round eye with red iris
    const ax = x0 + 42, ay = y0 + 33;
    const av = this.add.graphics();
    av.fillStyle(0x1a1020, 1).fillCircle(ax, ay, 22);
    av.lineStyle(2, COLORS.magenta, 0.8).strokeCircle(ax, ay, 22);
    av.fillStyle(0xf6f0ff, 1).fillCircle(ax, ay, 17);      // sclera
    av.fillStyle(0xff3b30, 1).fillCircle(ax, ay, 8);        // red iris
    av.fillStyle(0x120306, 1).fillCircle(ax, ay, 3.5);      // pupil
    av.fillStyle(0xffffff, 0.9).fillCircle(ax - 3, ay - 3, 2); // catchlight

    const name = this.add.text(x0 + 72, y0 + 7, "KOBI", { fontFamily: FONT, fontSize: "13px", fontStyle: "bold", color: "#ff8ae0" });
    this.blipText = this.add.text(x0 + 72, y0 + 26, "", {
      fontFamily: FONT, fontSize: "17px", color: "#ffd7f4", wordWrap: { width: 806 },
    });

    this.blipBar.add([this.blipGlow, bg, av, name, this.blipText]);

    this.blipGlowTween = this.tweens.add({
      targets: this.blipGlow, alpha: { from: 0.15, to: 0.85 },
      duration: 620, yoyo: true, repeat: -1, ease: "sine.inOut", paused: true,
    });
  }

  buildHints(W, H) {
    const y = H - 30;
    const g = this.add.graphics();
    const segs = [
      { key: "ESC", label: "map", kw: 40 },
      { key: "R", label: "restart", kw: 22 },
      { key: "P", label: "pause", kw: 22 },
    ];
    let x = 16;
    segs.forEach((s) => {
      this.drawKeycap(g, x, y, s.kw, 20, 0x5a6a99, 0.7);
      this.add.text(x + s.kw / 2, y + 10, s.key, { fontFamily: FONT, fontSize: "12px", fontStyle: "bold", color: "#9fb0da" }).setOrigin(0.5);
      const lbl = this.add.text(x + s.kw + 6, y + 10, s.label, { fontFamily: FONT, fontSize: "12px", color: "#5a6688" }).setOrigin(0, 0.5);
      x += s.kw + 8 + lbl.width + 14;
    });
  }

  update(time, delta) {
    // typewriter blips
    if (!this.blipActive && this.blipQueue.length) {
      const item = this.blipQueue.shift();
      this.blipActive = { text: item.text, mood: item.mood || "gloating", shown: 0, hold: 2600 };
      this.blipBar.setVisible(true);
      this.blipText.setText("");
      this.blipGlow.setAlpha(0.15);
      this.blipGlowTween.restart();
      duckMusic(true); // duck the music bus while KOBI types
    }
    const b = this.blipActive;
    if (b) {
      if (b.shown < b.text.length) {
        b.shown = Math.min(b.text.length, b.shown + delta * 0.055);
        const s = b.text.slice(0, Math.floor(b.shown));
        if (s.length !== this.blipText.text.length && s.length % 3 === 0) sfx.kobi(b.mood);
        this.blipText.setText(s);
      } else {
        b.hold -= delta;
        if (b.hold <= 0) {
          this.blipActive = null;
          if (!this.blipQueue.length) {
            this.blipBar.setVisible(false);
            this.blipText.setText("");
            this.blipGlowTween.pause();
            this.blipGlow.setAlpha(0);
            duckMusic(false); // blip cleared -> restore music level
          }
        }
      }
    }
  }
}
