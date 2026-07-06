import Phaser from "phaser";
import { COLORS, FONT, FS, TEXT } from "../constants.js";
import { sfx, installMute, pauseDuck } from "../audio.js";
import { pads, showPadToast } from "../pad.js";


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
      fontFamily: FONT, fontSize: FS.h2, fontStyle: "bold", color: TEXT.neon,
    }).setOrigin(0.5);

    this.sel = 0;
    const labels = ["RESUME", "SETTINGS", "EXIT TO MAP"];
    const startY = py + 130;
    this.items = labels.map((t, i) => this.add.text(W / 2, startY + i * 52, t, {
      fontFamily: FONT, fontSize: FS.title, fontStyle: "bold", color: TEXT.body,
    }).setOrigin(0.5));

    this.add.text(W / 2, py + ph - 28,
      "W/S select · SPACE/ENTER choose · P or ESC resume", {
      fontFamily: FONT, fontSize: FS.mini, color: TEXT.faint,
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

  // U7: pad1 drives the pause menu 1:1 with the keyboard handler — up/down select,
  // A choose, B resume. (Start toggles pause off via GameScene, mirroring P.)
  update(time) {
    pads.poll(time);
    const p = pads.p(0);
    const conn = pads.consumeConnected();
    if (conn) conn.forEach((idx) => showPadToast(this, idx));
    if (p.upJust) this.moveSel(-1);
    else if (p.downJust) this.moveSel(1);
    if (p.confirmJust) this.activate();
    else if (p.backJust) this.resume();
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
      it.setColor(on ? TEXT.good : TEXT.body);
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
