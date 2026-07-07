import Phaser from "phaser";
import { COLORS, FONT, FS, TEXT } from "../constants.js";
import {
  initAudio, sfx,
  getMuteState, toggleMusicMuted, toggleSfxMuted, toggleMute, getAudioSettings,
} from "../audio.js";

// Global mute dropdown (always-on-top overlay scene).
//
// A tiny speaker glyph lives in a CONSISTENT top-center-right slot — the clear
// band between the HUD's centre cluster (level plate + core tray + key chip,
// which end by ~x776) and the P1/P2 player plates (P2 starts at x996). That band
// is empty in every scene: Title/Settings/Onboard headlines sit at y>=70, the
// Pause / clear-overlay panels are centred, and in-game nothing HUD is drawn
// there. Tapping the glyph opens a small dropdown with three pointer toggles:
// MUSIC, SOUND FX and MUTE ALL. The glyph redraws to reflect state (full speaker
// / music-off / sfx-off / all-muted with a slash).
//
// INPUT ISOLATION: this scene only registers POINTER handlers on its own glyph /
// dropdown hit-zones — it adds NO keyboard handlers, so it never consumes the
// gameplay/menu keys (movement, Space/L action, arrows, R/Esc/P). The existing
// 'M' key (installMute, per scene) stays the quick master-mute; this scene just
// listens to the shared `bb:mute` event to keep its glyph in sync. Launched once
// at boot and kept on top every frame (allocation-free) so it also draws over
// the Pause overlay.
const GLYPH = { x: 864, y: 26, w: 44, h: 32 };
const PANEL = { x: 778, y: 46, w: 172, h: 150, r: 10 };
const ROWS = [
  { id: "music", label: "MUSIC", y: 82 },
  { id: "sfx", label: "SOUND FX", y: 118 },
  { id: "all", label: "MUTE ALL", y: 154 },
];

export default class MuteScene extends Phaser.Scene {
  constructor() {
    super("Mute");
  }

  create() {
    this.open = false;

    // --- outside-click catcher (interactive only while the dropdown is open) ---
    this.catcher = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.001)
      .setOrigin(0).setDepth(900).setVisible(false);
    this.catcher.on("pointerdown", () => this.setOpen(false));

    // --- glyph ---------------------------------------------------------------
    this.glyphGfx = this.add.graphics().setDepth(1002);
    this.glyphHit = this.add.rectangle(GLYPH.x, GLYPH.y, GLYPH.w + 6, GLYPH.h + 8, 0x000000, 0.001)
      .setDepth(1003).setInteractive({ useHandCursor: true });
    this.glyphHit.on("pointerup", () => {
      initAudio(); // pointer is a user gesture — unlock the ctx if it is not yet
      this.setOpen(!this.open);
      sfx.menuMove();
    });

    // --- dropdown panel (pooled, built once, toggled visible) ----------------
    this.panelGfx = this.add.graphics().setDepth(1000).setVisible(false);
    this.panelGfx.fillStyle(COLORS.panel, 0.97).fillRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, PANEL.r);
    this.panelGfx.lineStyle(2, COLORS.panelEdge, 1).strokeRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, PANEL.r);
    this.panelGfx.lineStyle(6, COLORS.neon, 0.12).strokeRoundedRect(PANEL.x - 3, PANEL.y - 3, PANEL.w + 6, PANEL.h + 6, PANEL.r + 3);

    this.title = this.add.text(PANEL.x + PANEL.w / 2, PANEL.y + 16, "AUDIO", {
      fontFamily: FONT, fontSize: FS.mini, fontStyle: "bold", color: TEXT.neon,
    }).setOrigin(0.5).setDepth(1001).setVisible(false);

    this.rowObjs = ROWS.map((row) => {
      const label = this.add.text(PANEL.x + 16, row.y, row.label, {
        fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: TEXT.body,
      }).setOrigin(0, 0.5).setDepth(1001).setVisible(false);
      const value = this.add.text(PANEL.x + PANEL.w - 16, row.y, "", {
        fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: TEXT.good,
      }).setOrigin(1, 0.5).setDepth(1001).setVisible(false);
      const hit = this.add.rectangle(PANEL.x + PANEL.w / 2, row.y, PANEL.w - 8, 30, 0x000000, 0.001)
        .setDepth(1001).setVisible(false);
      hit.on("pointerup", () => this.toggleRow(row.id));
      return { ...row, label, value, hit };
    });

    // keep the glyph on top of whatever scene is active (incl. the Pause
    // overlay). Zero-alloc: walk the live scene list from the top.
    this.scene.bringToTop();

    // stay in sync with the 'M' key / Settings "MUTE ALL" row.
    this.game.events.on("bb:mute", this.refresh, this);
    this.events.once("shutdown", () => this.game.events.off("bb:mute", this.refresh, this));

    // probe/introspection surface (mirrors the other __BB.* shapes)
    window.__BB = window.__BB || {};
    window.__BB.mute = {
      state: () => getMuteState(),
      get open() { return this.__s.open; },
      glyph: { x: GLYPH.x, y: GLYPH.y },
      rows: ROWS.map((r) => ({ id: r.id, x: PANEL.x + PANEL.w / 2, y: r.y })),
      __s: this,
    };

    this.refresh();
  }

  setOpen(v) {
    this.open = v;
    this.catcher.setVisible(v);
    if (v) this.catcher.setInteractive(); else this.catcher.disableInteractive();
    this.panelGfx.setVisible(v);
    this.title.setVisible(v);
    this.rowObjs.forEach((r) => {
      r.label.setVisible(v);
      r.value.setVisible(v);
      r.hit.setVisible(v);
      if (v) r.hit.setInteractive({ useHandCursor: true }); else r.hit.disableInteractive();
    });
  }

  toggleRow(id) {
    initAudio();
    if (id === "music") {
      toggleMusicMuted();
      sfx.settingsTick();
    } else if (id === "sfx") {
      // tick BEFORE muting so it is audible on the way in (sfx bus about to zero)
      if (!getMuteState().sfxMuted) sfx.settingsTick();
      toggleSfxMuted();
      if (!getMuteState().sfxMuted) sfx.settingsTick();
    } else {
      // MUTE ALL — mirror mute.js's audible-chirp ordering
      const wasMuted = getAudioSettings().muted;
      if (wasMuted) { toggleMute(); sfx.muteChirp(false); }
      else { sfx.muteChirp(true); toggleMute(); }
    }
    this.game.events.emit("bb:mute"); // refresh every scene's corner icon + this glyph
    this.refresh();
  }

  refresh() {
    const s = getMuteState();
    this.drawGlyph(s);
    if (this.rowObjs) {
      const set = (r, muted) => {
        r.value.setText(muted ? "MUTED" : "ON");
        r.value.setColor(muted ? "#ff8a99" : TEXT.good);
      };
      set(this.rowObjs[0], s.musicMuted);
      set(this.rowObjs[1], s.sfxMuted);
      set(this.rowObjs[2], s.muted);
    }
  }

  // Speaker glyph in the GLYPH slot. Canvas-safe drawn shapes only (no tint-only
  // meaning). States: full / music-off / sfx-off / all-muted (bold slash).
  drawGlyph(s) {
    const g = this.glyphGfx;
    const cx = GLYPH.x, cy = GLYPH.y;
    const all = s.muted; // both buses muted
    g.clear();
    // rounded backdrop; border colour hints overall state
    const border = all ? COLORS.hazard : (s.musicMuted || s.sfxMuted) ? COLORS.amber : COLORS.neon;
    g.fillStyle(COLORS.hudBg, 0.82).fillRoundedRect(cx - GLYPH.w / 2, cy - GLYPH.h / 2, GLYPH.w, GLYPH.h, 8);
    g.lineStyle(2, border, 0.95).strokeRoundedRect(cx - GLYPH.w / 2, cy - GLYPH.h / 2, GLYPH.w, GLYPH.h, 8);

    // speaker (sits on the left half of the glyph)
    const sx = cx - 12;
    g.fillStyle(all ? 0x8a94ad : 0xdfe7ff, 1);
    g.fillRect(sx - 4, cy - 4, 5, 8);        // back box
    g.fillTriangle(sx + 1, cy - 8, sx + 1, cy + 8, sx + 9, cy); // cone

    // sound waves (sfx side) OR a slash on them when sfx-only muted
    if (!all) {
      if (s.sfxMuted) {
        // faint waves + red slash
        g.lineStyle(2, 0x6b7590, 0.6);
        g.beginPath(); g.arc(sx + 11, cy, 5, -0.9, 0.9); g.strokePath();
        g.lineStyle(3, COLORS.hazard, 1).lineBetween(sx + 7, cy - 7, sx + 16, cy + 7);
      } else {
        g.lineStyle(2, 0x9fe8ff, 0.95);
        g.beginPath(); g.arc(sx + 11, cy, 5, -0.9, 0.9); g.strokePath();
        g.beginPath(); g.arc(sx + 11, cy, 9, -0.8, 0.8); g.strokePath();
      }
      // music note (top-right), green when on, red slash when music-only muted
      const nx = cx + 12, ny = cy - 5;
      g.fillStyle(s.musicMuted ? 0x8a94ad : COLORS.green, 1);
      g.fillEllipse(nx, ny + 6, 5, 4);        // note head
      g.fillRect(nx + 2, ny - 5, 1.6, 11);    // stem
      g.fillRect(nx + 2, ny - 5, 5, 2);       // flag
      if (s.musicMuted) {
        g.lineStyle(2.5, COLORS.hazard, 1).lineBetween(nx - 4, ny - 4, nx + 8, ny + 9);
      }
    } else {
      // all muted — one bold slash across the whole glyph
      g.lineStyle(3.5, COLORS.hazard, 1).lineBetween(sx + 5, cy - 9, sx + 20, cy + 9);
    }
  }

  update() {
    // Keep the overlay on top of the currently active/visible scene (e.g. after
    // GameScene brings the Pause overlay to top). Zero-alloc: iterate the live
    // scene list from the end; only re-top when we're not already on top.
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
