import Phaser from "phaser";
import { WORLD_THEMES, FONT, FS, TEXT } from "../constants.js";
import {
  initAudio, sfx, installMute,
  getAudioSettings, setMusicVolume, setSfxVolume, toggleMute,
  toggleVoiceMuted, isVoiceMuted,
} from "../audio.js";
import { pads, showPadToast } from "../pad.js";
import { getUxOptions, setUxOption } from "../ux.js";
import { menuBackdrop, neonPanel, drawRowSelect, chipRow, hexStr } from "../ui/kit.js";

const ACCENT = WORLD_THEMES[1].accent; // amber — matches the title-screen standard

// U11 comfort rows: 3-way / 2-way value cycles (defaults = current behavior).
const SHAKE_VALS = ["full", "soft", "off"];
const FLASH_VALS = ["full", "soft"];
const SPEED_VALS = ["normal", "fast"];

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

    // GFX P10: rebuilt to the title-screen standard (shared ui-kit) — layered
    // gradient + motes + silhouette strip, a panel with an accent header bar and
    // soft glow, selected-row chevron + glow, and key-cap value hints. The ROWS
    // themselves (data + behaviour, incl. U11's four comfort rows) are untouched.
    menuBackdrop(this, 1);

    // panel + accent header bar (drawn once)
    const px = W / 2 - 340, py = 138, pw = 680, ph = 470;
    const panel = this.add.graphics();
    neonPanel(panel, px, py, pw, ph, { accent: ACCENT, radius: 16 });
    // header caption riding the accent bar
    this.add.text(W / 2, 96, "SETTINGS", {
      fontFamily: FONT, fontSize: FS.h1, fontStyle: "bold", color: TEXT.neon,
      stroke: "#0b3a44", strokeThickness: 8,
    }).setOrigin(0.5);
    this.add.text(px + 22, py + 22, "AUDIO & COMFORT", {
      fontFamily: FONT, fontSize: FS.mini, fontStyle: "bold", color: hexStr(ACCENT),
    }).setOrigin(0, 0.5).setAlpha(0.9);

    // rows: 0 music, 1 sfx, 2 mute, 3 VOICE (KOBI/narrator speech on/off), then
    // U11 comfort rows (4 shake, 5 flash, 6 hints, 7 text speed), 8 back
    this.sel = 0;
    const rowY = [190, 238, 286, 334, 382, 430, 478, 526, 574];
    const labelX = W / 2 - 296;
    const valueX = W / 2 + 44;
    this._rowW = pw - 44;

    this.rows = rowY.map((y, i) => {
      const bg = this.add.graphics(); // selected-row chevron + glow (drawn in render)
      const label = this.add.text(labelX, y, "", {
        fontFamily: FONT, fontSize: FS.head, fontStyle: "bold", color: TEXT.body,
      }).setOrigin(0, 0.5);
      const value = this.add.text(valueX, y, "", {
        fontFamily: FONT, fontSize: FS.head, color: TEXT.bright,
      }).setOrigin(0, 0.5);
      return { y, bg, label, value };
    });
    this.rows[0].label.setText("MUSIC VOLUME");
    this.rows[1].label.setText("SFX VOLUME");
    this.rows[2].label.setText("MUTE ALL");
    this.rows[3].label.setText("VOICE");
    this.rows[4].label.setText("SCREEN SHAKE");
    this.rows[5].label.setText("FLASH EFFECTS");
    this.rows[6].label.setText("HINTS");
    this.rows[7].label.setText("TEXT SPEED");
    this.rows[8].label.setText("BACK");

    // key-cap value hints below the panel (shared chip row)
    chipRow(this, W / 2, py + ph + 28, [
      { k: "W" }, { k: "S" }, { t: "move" }, { k: "A" }, { k: "D" }, { t: "adjust" },
      { k: "SPACE" }, { t: "toggle" }, { k: "ESC" }, { t: "back" },
    ], ACCENT, hexStr(ACCENT));

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

  // U7: pad1 drives the settings rows 1:1 with the keyboard handler — up/down
  // select, left/right adjust, A confirm/toggle, B back.
  update(time) {
    pads.poll(time);
    const p = pads.p(0);
    if (pads.anyButtonJust()) initAudio();
    const conn = pads.consumeConnected();
    if (conn) conn.forEach((idx) => showPadToast(this, idx));
    if (p.upJust) this.moveSel(-1);
    else if (p.downJust) this.moveSel(1);
    if (p.leftJust) this.adjust(-1);
    else if (p.rightJust) this.adjust(1);
    if (p.confirmJust) this.activate();
    else if (p.backJust) this.back();
  }

  moveSel(d) {
    const next = Phaser.Math.Clamp(this.sel + d, 0, this.rows.length - 1);
    if (next !== this.sel) {
      this.sel = next;
      sfx.menuMove();
      this.render();
    }
  }

  // A/D on the volume rows steps 10% and ticks at the new level; on MUTE/HINTS
  // it flips the toggle; the U11 value rows cycle their options; BACK ignores
  // adjust.
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
    } else if (this.sel === 3) {
      this.toggleVoice();
    } else if (this.sel === 4) {
      this.cycleOpt("shake", SHAKE_VALS, d);
    } else if (this.sel === 5) {
      this.cycleOpt("flash", FLASH_VALS, d);
    } else if (this.sel === 6) {
      this.toggleHints();
    } else if (this.sel === 7) {
      this.cycleOpt("textSpeed", SPEED_VALS, d);
    }
  }

  activate() {
    if (this.sel === 2) this.toggleMute();
    else if (this.sel === 3) this.toggleVoice();
    else if (this.sel === 4) this.cycleOpt("shake", SHAKE_VALS, 1);
    else if (this.sel === 5) this.cycleOpt("flash", FLASH_VALS, 1);
    else if (this.sel === 6) this.toggleHints();
    else if (this.sel === 7) this.cycleOpt("textSpeed", SPEED_VALS, 1);
    else if (this.sel === 8) this.back();
    else { sfx.settingsTick(); } // SPACE on a volume row is a harmless confirm tick
  }

  // VOICE on/off — flips the spoken-VO mute (a separate opt-out from music/sfx).
  // "ON" in the UI means voice is ENABLED (voiceMuted === false).
  toggleVoice() {
    toggleVoiceMuted();
    sfx.settingsTick();
    this.render();
  }

  // U11: step a persisted ux-v1 option through its value list (wraps both ways).
  // setUxOption is a read-modify-write, so records/tutorialDone always survive.
  cycleOpt(key, vals, d) {
    const cur = getUxOptions()[key];
    const i = Math.max(0, vals.indexOf(cur));
    const v = vals[(i + d + vals.length) % vals.length];
    if (v !== cur) { setUxOption(key, v); sfx.settingsTick(); }
    this.render();
  }

  toggleHints() {
    setUxOption("hints", !getUxOptions().hints);
    sfx.settingsTick();
    this.render();
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
    const o = getUxOptions();
    const cx = this.scale.width / 2;
    this.rows.forEach((r, i) => {
      const on = i === this.sel;
      drawRowSelect(r.bg, cx, r.y, this._rowW, 42, ACCENT, on);
      r.label.setColor(on ? TEXT.bright : TEXT.body);
    });
    this.rows[0].value.setText(this.bar(s.music));
    this.rows[1].value.setText(this.bar(s.sfx));
    this.rows[2].value.setText(s.muted ? "[ ON ]" : "[ off ]");
    this.rows[2].value.setColor(s.muted ? "#ff8a99" : TEXT.bright);
    // VOICE: ON = speech enabled (not muted). Green-ish when on, dim when off.
    const voiceOn = !isVoiceMuted();
    this.rows[3].value.setText(voiceOn ? "[ ON ]" : "[ off ]");
    this.rows[3].value.setColor(voiceOn ? TEXT.bright : TEXT.dim);
    this.rows[4].value.setText(this.opt(o.shake));
    this.rows[5].value.setText(this.opt(o.flash));
    this.rows[6].value.setText(o.hints ? "[ ON ]" : "[ off ]");
    this.rows[6].value.setColor(o.hints ? TEXT.bright : TEXT.dim);
    this.rows[7].value.setText(this.opt(o.textSpeed));
    this.rows[8].value.setText("");
  }

  opt(v) {
    return `< ${v.toUpperCase()} >`;
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
