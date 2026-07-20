import Phaser from "phaser";
import { COLORS, FONT, FONT_DISPLAY, FS, TEXT } from "../constants.js";
import { sfx, installMute, pauseDuck } from "../audio.js";
import { pads, showPadToast } from "../pad.js";
import { addMotes } from "../backdrop.js";
import { neonPanel, drawRowSelect, chipRow, addSkyline, hexStr, springFocus } from "../ui/kit.js";


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

    // GFX P10: rebuilt to the title-screen standard (shared ui-kit) — a strong
    // dim over the frozen level, drifting motes + a low silhouette strip, and a
    // panel with an accent header bar + soft glow. RESUME/SETTINGS/EXIT logic and
    // the pause contract are untouched; only the LOOK is rebuilt.
    this.add.rectangle(W / 2, H / 2, W, H, 0x02040a, 0.82).setDepth(0);
    // motes + skyline sit ABOVE the dim (depth 0, inserted before the panel) so
    // they read over the darkened level, matching the title-screen backdrop.
    addMotes(this, COLORS.neon).setDepth(0);
    addSkyline(this, { y: H - 34, alpha: 0.3, depth: 0 });

    const pw = 460, ph = 344;
    const px = W / 2 - pw / 2, py = H / 2 - ph / 2;
    const panel = this.add.graphics();
    neonPanel(panel, px, py, pw, ph, { accent: COLORS.neon, radius: 16 });
    this._rowW = pw - 56;

    this.add.text(W / 2, py + 46, "PAUSED", {
      fontFamily: FONT_DISPLAY, fontSize: FS.h2, fontStyle: "bold", color: TEXT.neon,
    }).setOrigin(0.5);

    this.sel = 0;
    const labels = ["RESUME", "SETTINGS", "EXIT TO MAP"];
    const startY = py + 140;
    this._itemY = [];
    this.itemBg = [];
    this.items = labels.map((t, i) => {
      const cy = startY + i * 54;
      this._itemY.push(cy);
      this.itemBg.push(this.add.graphics());
      return this.add.text(W / 2, cy, t, {
        fontFamily: FONT_DISPLAY, fontSize: FS.title, fontStyle: "bold", color: TEXT.body,
      }).setOrigin(0.5);
    });

    // key-cap hint row
    chipRow(this, W / 2, py + ph - 26, [
      { k: "W" }, { k: "S" }, { t: "select" }, { k: "SPACE" }, { t: "choose" }, { k: "ESC" }, { t: "resume" },
    ], COLORS.neon, hexStr(COLORS.neon));

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
      // GFX3 G2: focus spring on the newly selected item (keyboard + pad both
      // reach moveSel). Items are centre-origin text, so the pop is symmetric.
      springFocus(this, this.items[this.sel]);
    }
  }

  render() {
    const cx = this.scale.width / 2;
    this.items.forEach((it, i) => {
      const on = i === this.sel;
      drawRowSelect(this.itemBg[i], cx, this._itemY[i], this._rowW, 44, COLORS.neon, on);
      it.setColor(on ? TEXT.bright : TEXT.body);
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
