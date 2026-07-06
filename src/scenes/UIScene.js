import Phaser from "phaser";
import { COLORS, WORLD_THEMES, FONT, FS, TEXT } from "../constants.js";
import { LEVELS } from "../levels/registry.js";
import { sfx, installMute, duckMusic } from "../audio.js";
import { pads } from "../pad.js";


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
    // tutorial has no chamber number ("tut"), so show just its name (matches the
    // intro banner); real levels keep the "<id> · <NAME>" plate.
    const plateStr = lvl.tutorial ? lvl.name.toUpperCase() : `${lvl.id} · ${lvl.name.toUpperCase()}`;
    const plateBg = this.add.graphics();
    this.plateText = this.add.text(W / 2, 13, plateStr, {
      fontFamily: FONT, fontSize: FS.body, fontStyle: "bold", color: "#cdd8f5",
    }).setOrigin(0.5, 0);
    const tw = this.plateText.width;
    plateBg.fillStyle(COLORS.hudBg, 0.7).fillRoundedRect(W / 2 - tw / 2 - 16, 9, tw + 32, 26, 9);
    plateBg.lineStyle(1, theme.accent, 0.35).strokeRoundedRect(W / 2 - tw / 2 - 16, 9, tw + 32, 26, 9);
    this.add.rectangle(W / 2, 38, tw + 10, 3, theme.accent, 0.9);

    // --- core pip tray + key chip ---------------------------------------------
    const trayW = 92;
    const tray = this.add.graphics();
    tray.fillStyle(COLORS.hudBg, 0.66).fillRoundedRect(W / 2 - trayW / 2, 50, trayW, 26, 8);
    tray.lineStyle(1, theme.accent, 0.35).strokeRoundedRect(W / 2 - trayW / 2, 50, trayW, 26, 8);
    this.coreState = [false, false, false];
    this.corePips = [0, 1, 2].map((i) => {
      const g = this.add.graphics().setPosition(W / 2 - 26 + i * 26, 63);
      this.drawPip(g, false);
      return g;
    });
    // key chip (hidden until at least one key is held)
    this.keyChip = this.add.graphics().setVisible(false);
    this.keyChip.fillStyle(COLORS.hudBg, 0.72).fillRoundedRect(W / 2 + 52, 50, 56, 26, 8);
    this.keyChip.lineStyle(1, 0xffd94d, 0.6).strokeRoundedRect(W / 2 + 52, 50, 56, 26, 8);
    this.keyIcon = this.add.image(W / 2 + 68, 63, "key").setScale(0.6).setVisible(false);
    this.keyText = this.add.text(W / 2 + 82, 55, "", { fontFamily: FONT, fontSize: FS.body, fontStyle: "bold", color: "#ffd94d" }).setVisible(false);

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

    // --- level-clear overlay (hidden until bb:complete) ------------------------
    // Redesigned: dark iris-in, world-accent panel that pops in, "CHAMBER CLEAR!"
    // headline pop, cores that reveal one-by-one, a "progress saved" tag and a
    // pulsing continue prompt. `this.completed` is still set synchronously in the
    // bb:complete handler (before any animation) so the continue keys stay instant.
    const accentHex = "#" + this.accent.toString(16).padStart(6, "0");
    this.overlay = this.add.container(0, 0).setVisible(false).setDepth(100);
    this.winDim = this.add.rectangle(W / 2, H / 2, W, H, 0x02040a, 0.85).setAlpha(0);
    const pw = 620, ph = 320;
    const pg = this.add.graphics();
    pg.fillStyle(COLORS.panel, 0.97).fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 18);
    pg.lineStyle(3, this.accent, 1).strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 18);
    pg.lineStyle(7, this.accent, 0.16).strokeRoundedRect(-pw / 2 - 4, -ph / 2 - 4, pw + 8, ph + 8, 21);
    this.winTitle = this.add.text(0, -108, "CHAMBER CLEAR!", {
      fontFamily: FONT, fontSize: FS.h2, fontStyle: "bold", color: TEXT.good,
    }).setOrigin(0.5);
    this.winSub = this.add.text(0, -58, "", { fontFamily: FONT, fontSize: FS.large, color: TEXT.body }).setOrigin(0.5);
    // three core slots: dim ring + "?" until revealed, then a core pops into place
    this.winCores = [];
    this.winCoreQ = [];
    const slots = this.add.graphics();
    this.winSlots = slots;
    [0, 1, 2].forEach((i) => {
      const cx = -80 + i * 80, cy = 4;
      slots.fillStyle(COLORS.hudBg, 0.6).fillCircle(cx, cy, 27);
      slots.lineStyle(2, this.accent, 0.4).strokeCircle(cx, cy, 27);
      const q = this.add.text(cx, cy, "?", { fontFamily: FONT, fontSize: FS.head, fontStyle: "bold", color: "#4a5578" }).setOrigin(0.5);
      const img = this.add.image(cx, cy, "core").setAlpha(0).setScale(0);
      this.winCoreQ.push(q);
      this.winCores.push(img);
    });
    this.savedTag = this.add.text(0, 74, "◇ PROGRESS SAVED", {
      fontFamily: FONT, fontSize: FS.body, fontStyle: "bold", color: accentHex,
    }).setOrigin(0.5).setAlpha(0);
    this.winPrompt = this.add.text(0, 116, "press SPACE or L to continue", {
      fontFamily: FONT, fontSize: FS.lead, color: TEXT.dim,
    }).setOrigin(0.5);
    // U8 (F15): stats row (TIME · DEATHS · CORES), a KOBI grade line, and a
    // pooled procedural "NEW RECORD!" starburst. Built ONCE here (no per-frame /
    // per-completion allocation); the complete handler only sets text + tweens.
    this.statsText = this.add.text(0, 40, "", {
      fontFamily: FONT, fontSize: FS.body, fontStyle: "bold", color: TEXT.bright,
    }).setOrigin(0.5);
    this.gradeText = this.add.text(0, 92, "", {
      fontFamily: FONT, fontSize: FS.small, fontStyle: "italic", color: "#ff9ae0",
    }).setOrigin(0.5);
    this.recordBurst = this.add.container(0, 40).setVisible(false);
    const rbg = this.add.graphics();
    this.drawStarburst(rbg, 0, 0, 12, 6, 8, COLORS.amber);
    const rlabel = this.add.text(13, 0, "NEW RECORD!", {
      fontFamily: FONT, fontSize: FS.tiny, fontStyle: "bold", color: "#ffd94d",
    }).setOrigin(0, 0.5);
    this.recordBurst.add([rbg, rlabel]);
    this.recordBurst.rbg = rbg;
    this.winPanel = this.add.container(W / 2, H / 2, [pg, this.winTitle, this.winSub, slots, ...this.winCoreQ, ...this.winCores, this.savedTag, this.statsText, this.gradeText, this.recordBurst, this.winPrompt]);
    this.overlay.add([this.winDim, this.winPanel]);
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
        const raw = typeof payload === "string" ? payload : payload.text;
        // The blip bar already draws a fixed "KOBI" name tag, so strip the
        // "KOBI: " speaker prefix the level strings carry (kept intact in the
        // data so the hub ticker / toasts still read as attributed lines).
        const text = raw.replace(/^\s*KOBI:\s*/i, "");
        const mood = (typeof payload === "object" && payload.mood) || moodForText(text);
        this.blipQueue.push({ text, mood });
      },
      complete: (info) => {
        this.completed = info; // set synchronously (before animation) — continue stays instant
        const tut = !!info.tutorial; // Sprint 10: tutorial variant — no save, back to Title
        this.overlay.setVisible(true);
        this.winTitle.setText(tut ? "ORIENTATION COMPLETE!" : "CHAMBER CLEAR!");
        this.winTitle.setFontSize(tut ? "38px" : "44px");
        this.winSub.setText(tut ? "You survived K.O.B.I.'s safety briefing." : `"${info.name}" — data-cores found:`);
        // tutorial hides the data-core reader + progress tag (nothing is saved)
        this.winSlots.setVisible(!tut);
        this.winCoreQ.forEach((q) => q.setVisible(!tut));
        this.winCores.forEach((img) => img.setVisible(!tut));
        this.savedTag.setVisible(!tut);
        // U8 stats row + KOBI grade. Tutorial has no cores, so its row is
        // TIME · DEATHS only (it still gets the counters — it just persists none).
        const st = info.stats || {};
        const coreSeg = tut ? "" : `   ·   CORES ${st.coresCount || 0}/3`;
        this.statsText.setText(`TIME ${st.timeStr || "0:00.0"}   ·   DEATHS ${st.deaths || 0}${coreSeg}`);
        this.gradeText.setText(st.grade || "");
        // NEW RECORD! starburst only when a PRIOR record was actually beaten
        // (a level's first-ever clear stores silently — no false celebration).
        const beat = !tut && (st.beatTime || st.beatDeaths);
        this.recordBurst.setVisible(!!beat);
        this.tweens.killTweensOf(this.recordBurst);
        this.tweens.killTweensOf(this.recordBurst.rbg);
        if (beat) {
          this.recordBurst.setPosition(this.statsText.width / 2 + 16, 40).setScale(0.2);
          this.recordBurst.rbg.setAngle(0);
          this.tweens.add({ targets: this.recordBurst, scale: 1, duration: 420, ease: "back.out", delay: 300 });
          this.tweens.add({ targets: this.recordBurst.rbg, angle: 360, duration: 5200, repeat: -1 });
        }
        // reset animation state
        this.winDim.setAlpha(0);
        this.winPanel.setScale(0.6).setAlpha(0);
        this.winTitle.setScale(0.2);
        this.savedTag.setAlpha(0);
        this.winCores.forEach((img, i) => { img.setAlpha(0).setScale(0); this.winCoreQ[i].setAlpha(1); });
        // dark iris-in + panel pop + headline pop
        this.tweens.add({ targets: this.winDim, alpha: 0.85, duration: 220 });
        this.tweens.add({ targets: this.winPanel, scale: 1, alpha: 1, duration: 260, ease: "back.out" });
        this.tweens.add({ targets: this.winTitle, scale: 1, duration: 340, ease: "back.out", delay: 120 });
        if (!tut) {
          // cores reveal one-by-one: collected pop + chime, uncollected stay dim "?"
          info.cores.forEach((got, i) => {
            this.time.delayedCall(420 + i * 240, () => {
              if (got) {
                this.winCoreQ[i].setAlpha(0);
                this.winCores[i].setAlpha(1).setScale(1.7);
                this.tweens.add({ targets: this.winCores[i], scale: 1, duration: 300, ease: "back.out" });
                sfx.core();
              }
            });
          });
          // "progress saved" tag after the last core, then the pulsing prompt
          this.time.delayedCall(420 + 3 * 240, () => { this.savedTag.setAlpha(1); sfx.saveTick(); });
        }
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

    this.continuing = false; // guards the fade so a second key can't double-start
    this.input.keyboard.on("keydown", (ev) => {
      if (this.completed && !this.continuing && ["Space", "KeyE", "KeyL", "Enter"].includes(ev.code)) {
        this.continueFromClear();
      }
    });
  }

  // Clear-overlay continue — shared by the keyboard handler and the U7 pad poll
  // (A/confirm). Guarded so a second press can't double-start the fade.
  continueFromClear() {
    if (!this.completed || this.continuing) return;
    this.continuing = true;
    const tut = !!this.completed.tutorial; // Sprint 10: tutorial returns to Title
    const next = this.completed.index + 1;
    const unlock = this.completed.newlyUnlocked;
    duckMusic(false); // drop any lingering blip duck on the way out
    // the UI camera fade paints fullscreen black over both scenes (UI renders
    // above Game), so this reads as a clean 250ms fade to the next screen.
    this.cameras.main.fadeOut(250, 4, 6, 20);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.stop("Game");
      if (tut) this.scene.start("Title");
      else this.scene.start("Hub", { sel: next, unlock });
      this.scene.stop();
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
    g.fillStyle(COLORS.hudBg, 0.72).fillRoundedRect(x, y, w, h, 11);
    g.lineStyle(2, col, 0.85).strokeRoundedRect(x, y, w, h, 11);

    // skill-icon chip
    const chipX = left ? x + 8 : x + w - 8 - 30;
    g.fillStyle(0x141d33, 0.9).fillRoundedRect(chipX, y + 9, 30, 30, 7);
    g.lineStyle(2, col, 0.7).strokeRoundedRect(chipX, y + 9, 30, 30, 7);
    const cCx = chipX + 15, cCy = y + 24;
    const icon = this.add.image(cCx, cCy, "core").setScale(0.86).setVisible(false);
    const qmark = this.add.text(cCx, cCy, "?", { fontFamily: FONT, fontSize: FS.large, fontStyle: "bold", color: hex }).setOrigin(0.5).setAlpha(0.6);

    // name + skill line
    const name = idx === 0 ? "P1 BEEP" : "P2 BOOP";
    const txX = left ? chipX + 38 : chipX - 8;
    const org = left ? 0 : 1;
    this.add.text(txX, y + 8, name, { fontFamily: FONT, fontSize: FS.body, fontStyle: "bold", color: hex }).setOrigin(org, 0);
    const skillText = this.add.text(txX, y + 27, "no gadget yet", { fontFamily: FONT, fontSize: FS.mini, color: TEXT.dim }).setOrigin(org, 0);

    // key-cap for the action key, tucked at the far edge
    const keyLabel = idx === 0 ? "SPACE" : "L";
    const kw = idx === 0 ? 58 : 30;
    const kx = left ? x + w - 10 - kw : x + 10;
    this.drawKeycap(g, kx, y + 14, kw, 22, col, 0.5);
    this.add.text(kx + kw / 2, y + 25, keyLabel, { fontFamily: FONT, fontSize: FS.mini, fontStyle: "bold", color: hex }).setOrigin(0.5);

    return { icon, qmark, skillText };
  }

  drawKeycap(g, x, y, w, h, col, alpha) {
    g.fillStyle(0x1a2338, 0.85).fillRoundedRect(x, y, w, h, 5);
    g.lineStyle(1.5, col, alpha).strokeRoundedRect(x, y, w, h, 5);
  }

  // U8: a spiky starburst polygon drawn into a Graphics (canvas-safe — fillPoints
  // works under the Canvas renderer, no tint dependency). Alternating outer/inner
  // radius over `spikes` points; gold fill + faint white outline.
  drawStarburst(g, cx, cy, outer, inner, spikes, color) {
    g.clear();
    const pts = [];
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (Math.PI * i) / spikes - Math.PI / 2;
      pts.push(new Phaser.Geom.Point(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
    g.fillStyle(color, 1).fillPoints(pts, true);
    g.lineStyle(1.5, 0xffffff, 0.85).strokePoints(pts, true, true);
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
    bg.fillStyle(COLORS.hudBg, 0.88).fillRoundedRect(x0, y0, w, h, 10);
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

    const name = this.add.text(x0 + 72, y0 + 7, "KOBI", { fontFamily: FONT, fontSize: FS.mini, fontStyle: "bold", color: "#ff8ae0" });
    this.blipText = this.add.text(x0 + 72, y0 + 26, "", {
      fontFamily: FONT, fontSize: FS.large, color: "#ffd7f4", wordWrap: { width: 806 },
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
    // U3: ESC/R are press-again-to-confirm, so the chips teach it with a "×2"
    // marker; P (pause) stays single-press.
    const segs = [
      { key: "ESC", label: "×2 map", kw: 40 },
      { key: "R", label: "×2 restart", kw: 22 },
      { key: "P", label: "pause", kw: 22 },
    ];
    let x = 16;
    segs.forEach((s) => {
      this.drawKeycap(g, x, y, s.kw, 20, 0x5a6a99, 0.7);
      this.add.text(x + s.kw / 2, y + 10, s.key, { fontFamily: FONT, fontSize: FS.mini, fontStyle: "bold", color: "#9fb0da" }).setOrigin(0.5);
      const lbl = this.add.text(x + s.kw + 6, y + 10, s.label, { fontFamily: FONT, fontSize: FS.mini, color: "#5a6688" }).setOrigin(0, 0.5);
      x += s.kw + 8 + lbl.width + 14;
    });
  }

  update(time, delta) {
    // U7: poll pads (idempotent within a frame — GameScene may have already
    // polled). A/confirm advances the clear overlay so pad-only players aren't
    // stranded there. Keyboard path untouched.
    pads.poll(time);
    if (this.completed && !this.continuing && (pads.p(0).confirmJust || pads.p(1).confirmJust)) {
      this.continueFromClear();
    }

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
