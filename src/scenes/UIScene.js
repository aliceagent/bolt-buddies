import Phaser from "phaser";
import { COLORS } from "../constants.js";
import { LEVELS } from "../levels/registry.js";
import { sfx, installMute, duckMusic } from "../audio.js";

const FONT = "'Courier New', monospace";

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

    this.p1Text = this.add.text(16, 12, "P1 BEEP — action: SPACE", { fontFamily: FONT, fontSize: "17px", fontStyle: "bold", color: "#4dc9ff" });
    this.p2Text = this.add.text(W - 16, 12, "P2 BOOP — action: L", { fontFamily: FONT, fontSize: "17px", fontStyle: "bold", color: "#ffa14d" }).setOrigin(1, 0);
    this.add.text(W / 2, 14, `${lvl.id}  "${lvl.name.toUpperCase()}"`, { fontFamily: FONT, fontSize: "16px", color: "#8fa3d9" }).setOrigin(0.5, 0);

    this.corePips = [0, 1, 2].map((i) => this.add.image(W / 2 - 26 + i * 26, 48, "core").setScale(0.6).setAlpha(0.2));
    this.keyIcon = this.add.image(W / 2 + 62, 48, "key").setScale(0.7).setVisible(false);
    this.keyText = this.add.text(W / 2 + 78, 40, "", { fontFamily: FONT, fontSize: "15px", color: "#ffd94d" });

    // KOBI blip bar
    this.blipPanel = this.add.graphics().setVisible(false);
    this.blipPanel.fillStyle(0x0a0f1e, 0.88).fillRoundedRect(W / 2 - 460, H - 92, 920, 66, 10);
    this.blipPanel.lineStyle(2, COLORS.magenta, 0.7).strokeRoundedRect(W / 2 - 460, H - 92, 920, 66, 10);
    this.blipText = this.add.text(W / 2 - 440, H - 78, "", {
      fontFamily: FONT, fontSize: "17px", color: "#ffd7f4", wordWrap: { width: 880 },
    });
    this.blipQueue = [];
    this.blipActive = null;

    // level-complete overlay (hidden until bb:complete)
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

    // pause hint
    this.add.text(16, H - 24, "ESC map · R restart chamber", { fontFamily: FONT, fontSize: "13px", color: "#48547a" });

    const E = this.game.events;
    this.h = {
      skill: ({ idx, skill, name }) => {
        const t = idx === 0 ? this.p1Text : this.p2Text;
        t.setText(`${idx === 0 ? "P1 BEEP" : "P2 BOOP"} — ${name} (${idx === 0 ? "SPACE" : "L"})`);
      },
      cores: (got) => got.forEach((v, i) => this.corePips[i].setAlpha(v ? 1 : 0.2)),
      keys: (n) => {
        this.keyIcon.setVisible(n > 0);
        this.keyText.setText(n > 0 ? `x${n}` : "");
      },
      blip: (text) => {
        this.blipQueue.push(text);
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

  update(time, delta) {
    // typewriter blips
    if (!this.blipActive && this.blipQueue.length) {
      this.blipActive = { text: this.blipQueue.shift(), shown: 0, hold: 2600 };
      this.blipPanel.setVisible(true);
      this.blipText.setText("");
      duckMusic(true); // duck the music bus while KOBI types
    }
    const b = this.blipActive;
    if (b) {
      if (b.shown < b.text.length) {
        b.shown = Math.min(b.text.length, b.shown + delta * 0.055);
        const s = b.text.slice(0, Math.floor(b.shown));
        if (s.length !== this.blipText.text.length && s.length % 3 === 0) sfx.blip();
        this.blipText.setText(s);
      } else {
        b.hold -= delta;
        if (b.hold <= 0) {
          this.blipActive = null;
          if (!this.blipQueue.length) {
            this.blipPanel.setVisible(false);
            this.blipText.setText("");
            duckMusic(false); // blip cleared -> restore music level
          }
        }
      }
    }
  }
}
