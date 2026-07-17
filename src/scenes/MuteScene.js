import Phaser from "phaser";
import { COLORS, FONT, FS, TEXT } from "../constants.js";
import {
  initAudio, sfx, getMuteState, getAudioSettings,
  setMusicVolume, setSfxVolume, setVoiceVolume, toggleMute,
} from "../audio.js";

// Global audio dropdown (always-on-top overlay scene).
//
// A speaker glyph in the top-center-right slot opens a small panel with a
// VOLUME SLIDER per channel — MUSIC, SOUND FX and VOICE — each draggable /
// click-to-set 0-100%, plus a MUTE ALL toggle at the bottom. Pointer-only (no
// keyboard handlers, so it never eats gameplay/menu keys); the 'M' key stays the
// quick master-mute and this scene syncs to the shared `bb:mute` event. Launched
// once at boot, kept on top every frame so it also draws over the Pause overlay.
const GLYPH = { x: 864, y: 26, w: 44, h: 32 };
const PANEL = { x: 716, y: 46, w: 236, h: 214, r: 10 };
// slider channels + the mute-all toggle, laid out down the panel
const TRACK = { lx: PANEL.x + 68, rx: PANEL.x + PANEL.w - 54 }; // 784 .. 898
TRACK.w = TRACK.rx - TRACK.lx;
const ROWS = [
  { id: "music", label: "MUSIC", y: 100, kind: "slider", get: (s) => s.music, set: setMusicVolume },
  { id: "sfx", label: "SFX", y: 134, kind: "slider", get: (s) => s.sfx, set: setSfxVolume },
  { id: "voice", label: "VOICE", y: 168, kind: "slider", get: (s) => s.voice, set: setVoiceVolume },
  { id: "all", label: "MUTE ALL", y: 202, kind: "toggle" },
];

export default class MuteScene extends Phaser.Scene {
  constructor() { super("Mute"); }

  create() {
    this.open = false;
    this.drag = null; // id of the slider currently being dragged

    // outside-click catcher (interactive only while open)
    this.catcher = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.001)
      .setOrigin(0).setDepth(900).setVisible(false);
    this.catcher.on("pointerdown", () => this.setOpen(false));

    // glyph
    this.glyphGfx = this.add.graphics().setDepth(1002);
    this.glyphHit = this.add.rectangle(GLYPH.x, GLYPH.y, GLYPH.w + 6, GLYPH.h + 8, 0x000000, 0.001)
      .setDepth(1003).setInteractive({ useHandCursor: true });
    this.glyphHit.on("pointerup", () => { initAudio(); this.setOpen(!this.open); sfx.menuMove(); });

    // dropdown panel (pooled, built once, toggled visible)
    this.panelGfx = this.add.graphics().setDepth(1000).setVisible(false);
    this.panelGfx.fillStyle(COLORS.panel, 0.97).fillRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, PANEL.r);
    this.panelGfx.lineStyle(2, COLORS.panelEdge, 1).strokeRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, PANEL.r);
    this.panelGfx.lineStyle(6, COLORS.neon, 0.12).strokeRoundedRect(PANEL.x - 3, PANEL.y - 3, PANEL.w + 6, PANEL.h + 6, PANEL.r + 3);

    this.title = this.add.text(PANEL.x + PANEL.w / 2, PANEL.y + 16, "AUDIO", {
      fontFamily: FONT, fontSize: FS.mini, fontStyle: "bold", color: TEXT.neon,
    }).setOrigin(0.5).setDepth(1001).setVisible(false);

    // the slider fills / knobs are drawn on one pooled graphics, redrawn on change
    this.sliderGfx = this.add.graphics().setDepth(1001).setVisible(false);

    this.rowObjs = ROWS.map((row) => {
      const label = this.add.text(PANEL.x + 14, row.y, row.label, {
        fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: TEXT.body,
      }).setOrigin(0, 0.5).setDepth(1001).setVisible(false);
      const value = this.add.text(PANEL.x + PANEL.w - 12, row.y, "", {
        fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: TEXT.good,
      }).setOrigin(1, 0.5).setDepth(1002).setVisible(false);
      // a generous hit strip for the whole row (easy to grab / tap)
      const hit = this.add.rectangle(PANEL.x + PANEL.w / 2, row.y, PANEL.w - 8, 28, 0x000000, 0.001)
        .setDepth(1002).setVisible(false);
      if (row.kind === "toggle") {
        hit.on("pointerup", () => this.toggleAll());
      } else {
        hit.on("pointerdown", (p) => { initAudio(); this.drag = row.id; this.setVolFromX(row, p.x); });
      }
      return { ...row, label, value, hit };
    });

    // dragging a slider updates while the pointer is held; release ends the drag
    this.input.on("pointermove", (p) => {
      if (!this.drag) return;
      const row = this.rowObjs.find((r) => r.id === this.drag);
      if (row) this.setVolFromX(row, p.x);
    });
    this.input.on("pointerup", () => { this.drag = null; });

    this.scene.bringToTop();
    this.game.events.on("bb:mute", this.refresh, this);
    this.events.once("shutdown", () => this.game.events.off("bb:mute", this.refresh, this));

    // probe surface (kept shape-compatible: state / open / glyph / rows[{id,x,y}])
    window.__BB = window.__BB || {};
    window.__BB.mute = {
      state: () => getMuteState(),
      settings: () => getAudioSettings(),
      get open() { return this.__s.open; },
      glyph: { x: GLYPH.x, y: GLYPH.y },
      rows: ROWS.map((r) => ({ id: r.id, x: PANEL.x + PANEL.w / 2, y: r.y })),
      // test helpers: set a channel volume 0..1 directly, or read it back
      setVol: (id, v) => { const r = ROWS.find((x) => x.id === id); if (r && r.set) { r.set(v); } },
      vol: (id) => { const r = ROWS.find((x) => x.id === id); return r && r.get ? r.get(getAudioSettings()) : null; },
      __s: this,
    };

    this.refresh();
  }

  setOpen(v) {
    this.open = v;
    if (!v) this.drag = null;
    this.catcher.setVisible(v);
    if (v) this.catcher.setInteractive(); else this.catcher.disableInteractive();
    this.panelGfx.setVisible(v);
    this.title.setVisible(v);
    this.sliderGfx.setVisible(v);
    this.rowObjs.forEach((r) => {
      r.label.setVisible(v);
      r.value.setVisible(v);
      r.hit.setVisible(v);
      if (v) r.hit.setInteractive({ useHandCursor: true }); else r.hit.disableInteractive();
    });
    if (v) this.refresh();
  }

  // set a slider's channel volume from a pointer x (clamped to the track), with a
  // tick only when the rounded 0-100 step changes (so a drag isn't a tick machine-gun)
  setVolFromX(row, px) {
    const frac = Phaser.Math.Clamp((px - TRACK.lx) / TRACK.w, 0, 1);
    const prev = Math.round(row.get(getAudioSettings()) * 100);
    row.set(frac);
    const now = Math.round(frac * 100);
    if (now !== prev) sfx.settingsTick();
    this.refresh();
  }

  toggleAll() {
    initAudio();
    const wasMuted = getAudioSettings().muted;
    if (wasMuted) { toggleMute(); sfx.muteChirp(false); }
    else { sfx.muteChirp(true); toggleMute(); }
    this.game.events.emit("bb:mute");
    this.refresh();
  }

  refresh() {
    const s = getAudioSettings();
    this.drawGlyph(s);
    if (!this.rowObjs) return;
    // draw the slider tracks + fills + knobs
    const g = this.sliderGfx;
    g.clear();
    for (const r of this.rowObjs) {
      if (r.kind !== "slider") continue;
      const frac = Phaser.Math.Clamp(r.get(s), 0, 1);
      const y = r.y;
      const muted = s.muted || frac <= 0;
      // track
      g.fillStyle(0x0c1424, 1).fillRoundedRect(TRACK.lx, y - 4, TRACK.w, 8, 4);
      g.lineStyle(1.5, COLORS.panelEdge, 0.9).strokeRoundedRect(TRACK.lx, y - 4, TRACK.w, 8, 4);
      // fill
      const fw = Math.max(0, frac * TRACK.w);
      if (fw > 1) {
        g.fillStyle(muted ? COLORS.amber : COLORS.neon, muted ? 0.5 : 0.95).fillRoundedRect(TRACK.lx, y - 4, fw, 8, 4);
      }
      // knob
      const kx = TRACK.lx + fw;
      g.fillStyle(0xffffff, 1).fillCircle(kx, y, 6);
      g.lineStyle(2, muted ? COLORS.amber : COLORS.neon, 1).strokeCircle(kx, y, 6);
      // value %
      r.value.setText(Math.round(frac * 100) + "%");
      r.value.setColor(muted ? "#ff8a99" : TEXT.good);
    }
    // mute-all toggle text
    const allRow = this.rowObjs.find((r) => r.id === "all");
    if (allRow) {
      allRow.value.setText(s.muted ? "[ MUTED ]" : "[ off ]");
      allRow.value.setColor(s.muted ? "#ff8a99" : TEXT.dim);
    }
  }

  // Speaker glyph. States: full / reduced (a channel low/off) / all-muted (slash).
  drawGlyph(s) {
    const g = this.glyphGfx;
    const cx = GLYPH.x, cy = GLYPH.y;
    const all = s.muted;
    const musicOff = s.musicMuted || s.music <= 0;
    const sfxOff = s.sfxMuted || s.sfx <= 0;
    g.clear();
    const border = all ? COLORS.hazard : (musicOff || sfxOff) ? COLORS.amber : COLORS.neon;
    g.fillStyle(COLORS.hudBg, 0.82).fillRoundedRect(cx - GLYPH.w / 2, cy - GLYPH.h / 2, GLYPH.w, GLYPH.h, 8);
    g.lineStyle(2, border, 0.95).strokeRoundedRect(cx - GLYPH.w / 2, cy - GLYPH.h / 2, GLYPH.w, GLYPH.h, 8);

    const sx = cx - 12;
    g.fillStyle(all ? 0x8a94ad : 0xdfe7ff, 1);
    g.fillRect(sx - 4, cy - 4, 5, 8);
    g.fillTriangle(sx + 1, cy - 8, sx + 1, cy + 8, sx + 9, cy);

    if (!all) {
      if (sfxOff) {
        g.lineStyle(2, 0x6b7590, 0.6);
        g.beginPath(); g.arc(sx + 11, cy, 5, -0.9, 0.9); g.strokePath();
        g.lineStyle(3, COLORS.hazard, 1).lineBetween(sx + 7, cy - 7, sx + 16, cy + 7);
      } else {
        g.lineStyle(2, 0x9fe8ff, 0.95);
        g.beginPath(); g.arc(sx + 11, cy, 5, -0.9, 0.9); g.strokePath();
        g.beginPath(); g.arc(sx + 11, cy, 9, -0.8, 0.8); g.strokePath();
      }
      const nx = cx + 12, ny = cy - 5;
      g.fillStyle(musicOff ? 0x8a94ad : COLORS.green, 1);
      g.fillEllipse(nx, ny + 6, 5, 4);
      g.fillRect(nx + 2, ny - 5, 1.6, 11);
      g.fillRect(nx + 2, ny - 5, 5, 2);
      if (musicOff) g.lineStyle(2.5, COLORS.hazard, 1).lineBetween(nx - 4, ny - 4, nx + 8, ny + 9);
    } else {
      g.lineStyle(3.5, COLORS.hazard, 1).lineBetween(sx + 5, cy - 9, sx + 20, cy + 9);
    }
  }

  update() {
    const list = this.scene.manager.scenes;
    for (let i = list.length - 1; i >= 0; i--) {
      const sys = list[i].sys;
      if (sys.isActive() && sys.isVisible()) {
        if (sys.settings.key !== "Mute") this.scene.bringToTop();
        break;
      }
    }
  }
}
