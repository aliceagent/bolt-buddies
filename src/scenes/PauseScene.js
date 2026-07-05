import Phaser from "phaser";
import { COLORS } from "../constants.js";
import { sfx, installMute, pauseDuck } from "../audio.js";

const FONT = "'Courier New', monospace";

// In-game pause overlay (Sound Sprint S4). Launched ON TOP of the still-active
// (but physics-paused) GameScene + UIScene, so it renders unzoomed with its own
// dim + panel. GameScene owns the P key and the physics.pause()/resume() calls;
// this scene only draws the menu and drives RESUME / SETTINGS / EXIT TO MAP.
//
// While this scene is up the music keeps playing at 0.5x (GameScene set
// pauseDuck(true) when it launched us). ESC here just resumes — GameScene's
// ESC-exits-to-hub contract is untouched because GameScene.update early-returns
// while paused, so it never sees ESC during a pause.
export default class PauseScene extends Phaser.Scene {
  constructor() {
    super("Pause");
  }

  init(data) {
    this.levelIndex = data && typeof data.levelIndex === "number" ? data.levelIndex : 0;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.add.rectangle(W / 2, H / 2, W, H, 0x02040a, 0.72).setDepth(0);
    const pw = 460, ph = 320;
    const px = W / 2 - pw / 2, py = H / 2 - ph / 2;
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.panel, 0.97).fillRoundedRect(px, py, pw, ph, 16);
    panel.lineStyle(3, COLORS.neon).strokeRoundedRect(px, py, pw, ph, 16);

    this.add.text(W / 2, py + 48, "PAUSED", {
      fontFamily: FONT, fontSize: "44px", fontStyle: "bold", color: "#35f0ff",
    }).setOrigin(0.5);

    this.sel = 0;
    const labels = ["RESUME", "SETTINGS", "EXIT TO MAP"];
    const startY = py + 130;
    this.items = labels.map((t, i) => this.add.text(W / 2, startY + i * 52, t, {
      fontFamily: FONT, fontSize: "26px", fontStyle: "bold", color: "#c6d2f2",
    }).setOrigin(0.5));

    this.add.text(W / 2, py + ph - 28,
      "W/S select · SPACE/ENTER choose · P or ESC resume", {
      fontFamily: FONT, fontSize: "13px", color: "#5a6a94",
    }).setOrigin(0.5);

    this.render();
    installMute(this, { icon: false }); // M still works while paused; no 2nd icon

    this.input.keyboard.addCapture("SPACE");
    this.input.keyboard.on("keydown", (ev) => {
      const c = ev.code;
      if (c === "KeyW" || c === "ArrowUp") this.moveSel(-1);
      else if (c === "KeyS" || c === "ArrowDown") this.moveSel(1);
      else if (["Space", "KeyE", "KeyL", "Enter"].includes(c)) this.activate();
      else if (c === "Escape") this.resume();
      // NB: the P key is handled by GameScene (it owns pause state) — pressing P
      // here reaches GameScene.update, which toggles the pause off for us.
    });
  }

  moveSel(d) {
    const next = Phaser.Math.Clamp(this.sel + d, 0, this.items.length - 1);
    if (next !== this.sel) {
      this.sel = next;
      sfx.menuMove();
      this.render();
    }
  }

  render() {
    this.items.forEach((it, i) => {
      const on = i === this.sel;
      it.setColor(on ? "#59ff9c" : "#c6d2f2");
      it.setText((on ? "> " : "  ") + it.text.replace(/^[>\s]+/, ""));
    });
  }

  activate() {
    sfx.menuSelect();
    if (this.sel === 0) this.resume();
    else if (this.sel === 1) {
      // open settings; game stays frozen. Settings returns us here on BACK.
      this.scene.launch("Settings", { returnTo: "pause", levelIndex: this.levelIndex });
      this.scene.stop();
    } else if (this.sel === 2) {
      this.exitToMap();
    }
  }

  resume() {
    const game = this.scene.get("Game");
    if (game && typeof game.resumeGame === "function") game.resumeGame();
    else this.scene.stop();
  }

  exitToMap() {
    pauseDuck(false);
    this.scene.stop("UI");
    this.scene.stop("Game");
    this.scene.start("Hub", { sel: this.levelIndex });
  }
}
