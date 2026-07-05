import Phaser from "phaser";
import { COLORS, WORLD_THEMES } from "../constants.js";
import { addGradient, addMotes } from "../backdrop.js";
import {
  initAudio, sfx, installMute,
  getAudioSettings, setMusicVolume, setSfxVolume, toggleMute,
} from "../audio.js";

const FONT = "'Courier New', monospace";

// Keyboard-driven settings page (Sound Sprint S4). Matches the game's menu look:
// Courier, the COLORS panel, and the gradient + motes backdrop shared by Title
// and Hub. Whatever track was already playing keeps playing underneath, so the
// music-volume rows give live feedback.
//
// Opened from:
//   Title — S key           (returnTo: "Title")
//   Hub   — O key            (returnTo: "Hub"; S is taken by world navigation)
//   Pause — SETTINGS item    (returnTo: "pause" + levelIndex; game stays paused)
export default class SettingsScene extends Phaser.Scene {
  constructor() {
    super("Settings");
  }

  init(data) {
    this.returnTo = (data && data.returnTo) || "Title";
    this.levelIndex = data && typeof data.levelIndex === "number" ? data.levelIndex : 0;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    initAudio(); // ensure the ctx is live (also starts any pending track)

    addGradient(this, 1);
    this.add.tileSprite(0, 0, W, H, "bggrid").setOrigin(0).setAlpha(0.22).setDepth(-8);
    addMotes(this, WORLD_THEMES[1].accent2);

    this.add.text(W / 2, 120, "SOUND SETTINGS", {
      fontFamily: FONT, fontSize: "52px", fontStyle: "bold", color: "#35f0ff",
      stroke: "#0b3a44", strokeThickness: 8,
    }).setOrigin(0.5);

    // panel
    const px = W / 2 - 340, py = 210, pw = 680, ph = 320;
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.panel, 0.92).fillRoundedRect(px, py, pw, ph, 14);
    panel.lineStyle(2, COLORS.panelEdge).strokeRoundedRect(px, py, pw, ph, 14);

    // rows: 0 music, 1 sfx, 2 mute, 3 back
    this.sel = 0;
    const rowY = [270, 340, 410, 490];
    const labelX = W / 2 - 300;
    const valueX = W / 2 + 40;

    this.rows = rowY.map((y, i) => {
      const cursor = this.add.text(labelX - 34, y, "", {
        fontFamily: FONT, fontSize: "22px", fontStyle: "bold", color: "#59ff9c",
      }).setOrigin(0.5, 0.5);
      const label = this.add.text(labelX, y, "", {
        fontFamily: FONT, fontSize: "22px", fontStyle: "bold", color: "#c6d2f2",
      }).setOrigin(0, 0.5);
      const value = this.add.text(valueX, y, "", {
        fontFamily: FONT, fontSize: "22px", color: "#eaf2ff",
      }).setOrigin(0, 0.5);
      return { y, cursor, label, value };
    });
    this.rows[0].label.setText("MUSIC VOLUME");
    this.rows[1].label.setText("SFX VOLUME");
    this.rows[2].label.setText("MUTE ALL");
    this.rows[3].label.setText("BACK");

    this.add.text(W / 2, py + ph - 26,
      "W/S or up/down: select   ·   A/D or left/right: adjust   ·   SPACE/ENTER: toggle   ·   ESC: back", {
      fontFamily: FONT, fontSize: "13px", color: "#5a6a94",
    }).setOrigin(0.5);

    this.render();
    installMute(this);

    this.input.keyboard.addCapture("SPACE");
    this.input.keyboard.on("keydown", (ev) => {
      initAudio();
      const c = ev.code;
      if (c === "KeyW" || c === "ArrowUp") this.moveSel(-1);
      else if (c === "KeyS" || c === "ArrowDown") this.moveSel(1);
      else if (c === "KeyA" || c === "ArrowLeft") this.adjust(-1);
      else if (c === "KeyD" || c === "ArrowRight") this.adjust(1);
      else if (["Space", "KeyE", "KeyL", "Enter"].includes(c)) this.activate();
      else if (c === "Escape") this.back();
    });
  }

  moveSel(d) {
    const next = Phaser.Math.Clamp(this.sel + d, 0, this.rows.length - 1);
    if (next !== this.sel) {
      this.sel = next;
      sfx.menuMove();
      this.render();
    }
  }

  // A/D on the volume rows steps 10% and ticks at the new level; on MUTE it flips
  // the mute; BACK ignores adjust.
  adjust(d) {
    const s = getAudioSettings();
    if (this.sel === 0) {
      const v = Phaser.Math.Clamp(Math.round((s.music + d * 0.1) * 10) / 10, 0, 1);
      if (v !== s.music) { setMusicVolume(v); sfx.settingsTick(); }
      this.render();
    } else if (this.sel === 1) {
      const v = Phaser.Math.Clamp(Math.round((s.sfx + d * 0.1) * 10) / 10, 0, 1);
      if (v !== s.sfx) { setSfxVolume(v); sfx.settingsTick(); }
      this.render();
    } else if (this.sel === 2) {
      this.toggleMute();
    }
  }

  activate() {
    if (this.sel === 2) this.toggleMute();
    else if (this.sel === 3) this.back();
    else { sfx.settingsTick(); } // SPACE on a volume row is a harmless confirm tick
  }

  // Mirror mute.js so the chirp is audible either way, then refresh every scene's
  // corner icon via the shared bb:mute event.
  toggleMute() {
    const wasMuted = getAudioSettings().muted;
    if (wasMuted) { toggleMute(); sfx.muteChirp(false); }
    else { sfx.muteChirp(true); toggleMute(); }
    this.game.events.emit("bb:mute");
    this.render();
  }

  render() {
    const s = getAudioSettings();
    this.rows.forEach((r, i) => {
      const on = i === this.sel;
      r.cursor.setText(on ? ">" : "");
      r.label.setColor(on ? "#59ff9c" : "#c6d2f2");
    });
    this.rows[0].value.setText(this.bar(s.music));
    this.rows[1].value.setText(this.bar(s.sfx));
    this.rows[2].value.setText(s.muted ? "[ ON ]" : "[ off ]");
    this.rows[2].value.setColor(s.muted ? "#ff8a99" : "#eaf2ff");
    this.rows[3].value.setText("");
  }

  bar(v) {
    const filled = Math.round(v * 10);
    const pct = String(Math.round(v * 100)).padStart(3, " ");
    return "< " + "█".repeat(filled) + "░".repeat(10 - filled) + " >  " + pct + "%";
  }

  back() {
    sfx.menuSelect();
    if (this.returnTo === "pause") {
      // came from the in-game pause menu — game is still frozen underneath;
      // hand back to the pause overlay without ever unpausing.
      this.scene.launch("Pause", { levelIndex: this.levelIndex });
      this.scene.stop();
    } else {
      this.scene.start(this.returnTo);
    }
  }
}
