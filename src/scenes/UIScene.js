import Phaser from "phaser";
import { COLORS, WORLD_THEMES, FONT, FS, TEXT } from "../constants.js";
import { LEVELS } from "../levels/registry.js";
import { sfx, installMute, duckMusic } from "../audio.js";
import { uxTextSpeed } from "../ux.js";
import { pads } from "../pad.js";
import { drawIris, irisMaxR } from "../ui/kit.js";
import { MOTION } from "../anim/motion.js";


const SKILL_ICON = { grapple: "icon_grapple", heavy: "icon_heavy", phase: "icon_phase", tiny: "icon_tiny" };

// player-color css strings for HUD text (mirrors COLORS.beep / COLORS.boop)
const P_HEX = ["#4dc9ff", "#ffa14d"];
const P_COL = [COLORS.beep, COLORS.boop];

// P9: KOBI mood → ring / border-pulse colour. Gloating magenta (his default
// smug), angry red (a plan backfired), defeated grey-blue (he deflates).
const KOBI_RING = { gloating: 0xff4dd2, angry: 0xff3b30, defeated: 0x7d8fb8 };

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
    // P9: idle soft glimmer — every ~6s each COLLECTED pip gives a gentle scale
    // shine, staggered. One shared timer; tweens are one-shot on the tick (never
    // per-frame). Empty tick when no pip is filled (yet).
    this.time.addEvent({
      delay: 6000, loop: true, callback: () => {
        this.corePips.forEach((g, i) => {
          if (!this.coreState[i]) return;
          this.tweens.add({
            targets: g, scale: { from: 1, to: 1.16 }, duration: 260,
            yoyo: true, ease: "sine.inOut", delay: i * 130,
          });
        });
      },
    });
    // key chip (hidden until at least one key is held)
    this.keyChip = this.add.graphics().setVisible(false);
    this.keyChip.fillStyle(COLORS.hudBg, 0.72).fillRoundedRect(W / 2 + 52, 50, 56, 26, 8);
    this.keyChip.lineStyle(1, 0xffd94d, 0.6).strokeRoundedRect(W / 2 + 52, 50, 56, 26, 8);
    this.keyIcon = this.add.image(W / 2 + 68, 63, "key").setScale(0.6).setVisible(false);
    this.keyText = this.add.text(W / 2 + 82, 55, "", { fontFamily: FONT, fontSize: FS.body, fontStyle: "bold", color: "#ffd94d" }).setVisible(false);
    this._keysPrev = 0; // P9: track 0→>0 so the chip only bounce-spins on first collect

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
    // P8: soft top-light gradient over the clear panel — a gentle key light from
    // above (inset clear of the rounded corners; cheap non-additive cached image).
    const winTopLight = this.add.image(0, -ph / 2 + 6, "toplight")
      .setOrigin(0.5, 0).setDisplaySize(pw - 64, ph * 0.5).setAlpha(0.1);
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
    this.winPanel = this.add.container(W / 2, H / 2, [pg, winTopLight, this.winTitle, this.winSub, slots, ...this.winCoreQ, ...this.winCores, this.savedTag, this.statsText, this.gradeText, this.recordBurst, this.winPrompt]);
    // P10: bolt-and-gear confetti burst BEHIND the panel. ONE pooled emitter,
    // manual bursts only. The additive glow is WebGL-only (gated per the renderer
    // note); Canvas gets a cheaper, smaller, non-additive burst.
    this._webgl = this.game.renderer.type === Phaser.WEBGL;
    this.buildConfetti();
    this.overlay.add([this.winDim, this.confetti, this.winPanel]);
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
        // P9: bounce-in + spin the moment the first key lands (0 → held).
        if (on && this._keysPrev === 0) {
          this.tweens.killTweensOf(this.keyIcon);
          this.keyIcon.setScale(0).setAngle(0);
          this.tweens.add({ targets: this.keyIcon, scale: 0.6, duration: 440, ease: "back.out" });
          this.tweens.add({ targets: this.keyIcon, angle: 360, duration: 520, ease: "cubic.out" });
          this.keyText.setAlpha(0);
          this.tweens.add({ targets: this.keyText, alpha: 1, duration: 300, delay: 130 });
        }
        this._keysPrev = n;
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
        // P10: celebratory bolt/gear confetti fanning up from behind the panel
        this.time.delayedCall(150, () => this.burstConfetti());
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
    const swap = () => {
      this.scene.stop("Game");
      // U10 (F6): a tutorial launched from the first-run interstitial returns to
      // the HUB, not Title (returnToHub set on the Game scene). Menu-launched
      // tutorials keep returning to Title (this.completed.returnToHub is false).
      if (tut && this.completed.returnToHub) this.scene.start("Hub");
      else if (tut) this.scene.start("Title");
      else this.scene.start("Hub", { sel: next, unlock, iris: true });
      this.scene.stop();
    };
    // P10: KOBI iris-wipe for the normal game->hub clear — a black iris closing on
    // the exit door (Hub opens it on the destination node). WebGL only; the
    // suites run Canvas and take the byte-identical 250ms fade below, so the
    // transition timing / scene-key sequence they observe is unchanged. Tutorial
    // (->Title/Hub) also keeps the plain fade.
    if (this._webgl && !tut) {
      this.irisCloseToDoor(swap);
    } else {
      // the UI camera fade paints fullscreen black over both scenes (UI renders
      // above Game), so this reads as a clean 250ms fade to the next screen.
      this.cameras.main.fadeOut(250, 4, 6, 20);
      this.cameras.main.once("camerafadeoutcomplete", swap);
    }
  }

  // P10: build the pooled bolt-and-gear confetti emitter (ONE emitter, manual
  // bursts). The two-frame texture is baked once. Gold on Canvas; WebGL adds
  // per-particle tint variety + an additive glow.
  buildConfetti() {
    if (!this.textures.exists("bbConfetti")) {
      const cg = this.make.graphics({ x: 0, y: 0, add: false });
      // frame 0 — hex bolt head (0..16)
      const bx = 8, by = 8, br = 6;
      cg.fillStyle(0xffd24d, 1).beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + k * Math.PI / 3;
        const x = bx + Math.cos(a) * br, y = by + Math.sin(a) * br;
        if (k === 0) cg.moveTo(x, y); else cg.lineTo(x, y);
      }
      cg.closePath(); cg.fillPath();
      cg.fillStyle(0x241704, 1).fillCircle(bx, by, 2);
      // frame 1 — little gear (16..32)
      const gx = 24, gy = 8;
      cg.fillStyle(0xffb347, 1);
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        cg.fillRect(gx + Math.cos(a) * 5 - 1.4, gy + Math.sin(a) * 5 - 1.4, 2.8, 2.8);
      }
      cg.fillCircle(gx, gy, 4.6);
      cg.fillStyle(0x241704, 1).fillCircle(gx, gy, 1.8);
      cg.generateTexture("bbConfetti", 32, 16);
      cg.destroy();
      const tex = this.textures.get("bbConfetti");
      tex.add(0, 0, 0, 0, 16, 16);
      tex.add(1, 0, 16, 0, 16, 16);
    }
    this.confetti = this.add.particles(0, 0, "bbConfetti", {
      frame: [0, 1],
      lifespan: 1300,
      speed: { min: 150, max: 430 },
      angle: { min: 202, max: 338 }, // up-and-out fan
      gravityY: 640,
      rotate: { start: 0, end: 360 },
      scale: { min: 0.7, max: 1.25 },
      alpha: { start: 1, end: 0 },
      tint: this._webgl ? [0xffd24d, 0xffb347, 0x35f0ff, 0xff4dd2, 0xffffff] : undefined,
      frequency: -1, // manual emitParticleAt only
      maxAliveParticles: this._webgl ? 60 : 32,
      emitting: false,
    });
    if (this._webgl) this.confetti.setBlendMode(Phaser.BlendModes.ADD);
  }

  burstConfetti() {
    if (!this.confetti) return;
    const W = this.scale.width, H = this.scale.height;
    // erupt from the panel's top edge so the fan clears the panel and rains down
    // its sides (the burst reads "behind the panel" while staying visible).
    this.confetti.emitParticleAt(W / 2, H / 2 - 150, this._webgl ? 54 : 32);
  }

  // P10: iris close on the exit-door screen position (game->hub clear, WebGL).
  // Maskless single thick ring (see ui-kit drawIris) — cheap, ≤300ms.
  irisCloseToDoor(done) {
    const W = this.scale.width, H = this.scale.height;
    let cx = W / 2, cy = H / 2;
    const G = this.scene.get("Game");
    if (G && G.exitDoor && G.exitDoor.zone && G.cameras && G.cameras.main) {
      const cam = G.cameras.main;
      cx = Phaser.Math.Clamp((G.exitDoor.zone.centerX - cam.worldView.x) * cam.zoom, 0, W);
      cy = Phaser.Math.Clamp((G.exitDoor.baseY - cam.worldView.y) * cam.zoom, 0, H);
    }
    const g = this.add.graphics().setDepth(999).setScrollFactor(0);
    const st = { r: irisMaxR(this, cx, cy) };
    drawIris(g, cx, cy, st.r);
    this.tweens.add({
      targets: st, r: 0, duration: 300, ease: "sine.in",
      onUpdate: () => drawIris(g, cx, cy, st.r),
      onComplete: done,
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
    // SL7 bubble-fit: the long KOBI lines wrap to TWO rows of FS.large; at the old
    // h=66 the 2nd row ended ~2px off the bar's bottom edge (touching). Grow the bar
    // to h=80 so a 2-line blip clears the floor with ~16px of breathing room, and
    // recenter the avatar to the new mid-line. Top edge (y0=H-92) is UNCHANGED, so
    // the U3 confirm-toast + SL4 stuck-prompt clamps (which key off the bar top) hold.
    const x0 = W / 2 - 460, y0 = H - 92, w = 920, h = 80;
    this.blipBar = this.add.container(0, 0).setVisible(false);

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.hudBg, 0.88).fillRoundedRect(x0, y0, w, h, 10);
    bg.lineStyle(2, COLORS.magenta, 0.7).strokeRoundedRect(x0, y0, w, h, 10);

    // pulsing border glow (only while a blip is on screen). Colour follows KOBI's
    // mood — recoloured in applyKobiMood; stored geometry keeps it alloc-free.
    this.blipGlow = this.add.graphics().setAlpha(0);
    this._blipRect = { x0, y0, w, h };

    // KOBI avatar — layered so the iris can wander/snap, the ring can recolour to
    // his mood, and a defeated eyelid can droop, all without per-frame allocations.
    const ax = x0 + 42, ay = y0 + h / 2;
    this._avx = ax; this._avy = ay;
    const avBase = this.add.graphics();
    avBase.fillStyle(0x1a1020, 1).fillCircle(ax, ay, 22);   // socket
    avBase.fillStyle(0xf6f0ff, 1).fillCircle(ax, ay, 17);   // sclera
    this.avRing = this.add.graphics();                       // mood ring (recoloured)
    this.avIris = this.add.graphics();                       // iris — wanders / snaps
    this.avIris.fillStyle(0xff3b30, 1).fillCircle(ax, ay, 8);      // red iris
    this.avIris.fillStyle(0x120306, 1).fillCircle(ax, ay, 3.5);    // pupil
    this.avIris.fillStyle(0xffffff, 0.9).fillCircle(ax - 3, ay - 3, 2); // catchlight
    this.irisPos = { x: 0, y: 0 };
    // defeated eyelid: a filled upper-half cap over the sclera (drawn once, toggled)
    this.avLid = this.add.graphics().setVisible(false);
    const lidPts = [];
    for (let a = 180; a <= 360; a += 12) lidPts.push(new Phaser.Geom.Point(ax + 17 * Math.cos(a * Math.PI / 180), ay + 17 * Math.sin(a * Math.PI / 180)));
    this.avLid.fillStyle(0x180b13, 0.97).fillPoints(lidPts, true);
    this.avLid.lineStyle(2, 0x2a1420, 1).lineBetween(ax - 17, ay, ax + 17, ay);

    // A11 KOBI AVATAR MOOD SET — pooled overlays that ANIMATE the avatar to match the
    // SAME mood value applyKobiMood already receives (no change to the blip queue/text/
    // timing). gloat SQUINT (a smug top+bottom lid slit), angry SHAKE + red ring FLARE,
    // defeated DROOP (avLid, above) + a SLOW BLINK. Drawn once; toggled/tweened per mood.
    this.avSquint = this.add.graphics().setVisible(false); // smug narrow-slit lids
    this.avSquint.fillStyle(0x1a1020, 1);
    this.avSquint.fillRect(ax - 17, ay - 17, 34, 15); // top lid (down to ay-2)
    this.avSquint.fillRect(ax - 17, ay + 3, 34, 14);  // bottom lid (up to ay+3) -> ~5px slit
    this.avFlare = this.add.graphics().setVisible(false).setAlpha(0); // angry red ring flare
    this.avFlare.lineStyle(4, KOBI_RING.angry, 1).strokeCircle(ax, ay, 22);
    if (this.game.renderer.type === Phaser.WEBGL) this.avFlare.setBlendMode(Phaser.BlendModes.ADD);
    this.avBlink = this.add.graphics().setVisible(false).setAlpha(0); // defeated slow-blink cap
    this.avBlink.fillStyle(0x180b13, 1).fillCircle(ax, ay, 17);
    this._avShakeX = 0;      // angry shake offset folded into the iris each frame
    this._avBlinkTween = null; // defeated slow-blink loop (started/stopped by mood)

    const name = this.add.text(x0 + 72, y0 + 7, "KOBI", { fontFamily: FONT, fontSize: FS.mini, fontStyle: "bold", color: "#ff8ae0" });
    this.blipText = this.add.text(x0 + 72, y0 + 26, "", {
      fontFamily: FONT, fontSize: FS.large, color: "#ffd7f4", wordWrap: { width: 806 },
    });

    this.blipBar.add([this.blipGlow, bg, avBase, this.avRing, this.avIris, this.avSquint, this.avFlare, this.avBlink, this.avLid, name, this.blipText]);

    this.blipGlowTween = this.tweens.add({
      targets: this.blipGlow, alpha: { from: 0.15, to: 0.85 },
      duration: 620, yoyo: true, repeat: -1, ease: "sine.inOut", paused: true,
    });
    this.applyKobiMood("gloating"); // draw the initial ring + border-glow colour
  }

  // P9: recolour KOBI's mood ring + the blip-bar border pulse, and droop the
  // eyelid on defeat. Called on each new blip; cheap redraw, no allocation.
  applyKobiMood(mood) {
    this.kobiMood = mood;
    const ring = KOBI_RING[mood] || KOBI_RING.gloating;
    this.avRing.clear();
    this.avRing.lineStyle(3, ring, 0.95).strokeCircle(this._avx, this._avy, 22);
    const r = this._blipRect;
    this.blipGlow.clear();
    this.blipGlow.lineStyle(3, ring, 0.9).strokeRoundedRect(r.x0 - 2, r.y0 - 2, r.w + 4, r.h + 4, 12);
    const defeated = mood === "defeated";
    this.avLid.setVisible(defeated);
    if (defeated) {
      this.tweens.killTweensOf(this.avLid);
      this.avLid.setAlpha(0);
      this.tweens.add({ targets: this.avLid, alpha: 1, duration: 220, ease: "sine.out" });
    }
    this.animateKobiMood(mood); // A11: play the matching avatar mood animation
  }

  // A11: animate the avatar to match KOBI's mood — driven off the SAME `mood` value
  // applyKobiMood already has. gloat SQUINT (smug slit), angry SHAKE + ring FLARE,
  // defeated SLOW BLINK (over the existing droop). Idempotent per call: it clears the
  // other moods' persistent state so switching moods never leaves a stuck overlay.
  // Cosmetic overlays + tweens only — nothing here touches the blip queue/text/timing.
  animateKobiMood(mood) {
    const G = MOTION.KOBI_GLOAT, A = MOTION.KOBI_ANGRY, D = MOTION.KOBI_DEFEAT;
    // --- GLOAT: fade the smug narrow-slit lids in (out for any other mood) --------
    this.tweens.killTweensOf(this.avSquint);
    if (mood === "gloating") {
      this.avSquint.setVisible(true);
      this.tweens.add({ targets: this.avSquint, alpha: { from: this.avSquint.alpha, to: 1 }, duration: G.dur, ease: G.ease });
    } else if (this.avSquint.visible) {
      this.tweens.add({ targets: this.avSquint, alpha: 0, duration: G.dur, ease: G.ease, onComplete: () => this.avSquint.setVisible(false) });
    }
    // --- ANGRY: a short horizontal shake + a red ring flare (one-shot on entry) ---
    this.tweens.killTweensOf(this.avFlare);
    this.tweens.killTweensOf(this._avShakeState || (this._avShakeState = { x: 0 }));
    if (mood === "angry") {
      this._avShakeState.x = 0;
      this.tweens.add({
        targets: this._avShakeState, x: A.amp, duration: A.dur / (A.shakes * 2),
        yoyo: true, repeat: A.shakes * 2 - 1, ease: "sine.inOut",
        onUpdate: () => { this._avShakeX = this._avShakeState.x; },
        onComplete: () => { this._avShakeX = 0; this._avShakeState.x = 0; },
      });
      this.avFlare.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.avFlare, alpha: { from: A.flare, to: 0 }, duration: A.dur, ease: "cubic.out", repeat: 1, onComplete: () => this.avFlare.setVisible(false) });
    } else {
      this._avShakeX = 0;
    }
    // --- DEFEATED: a slow full blink loop over the drooped lid --------------------
    if (this._avBlinkTween) { this._avBlinkTween.remove(); this._avBlinkTween = null; }
    if (mood === "defeated") {
      this.avBlink.setVisible(true).setAlpha(0);
      this._avBlinkTween = this.tweens.add({
        targets: this.avBlink, alpha: { from: 0, to: 0.95 }, duration: 300,
        hold: D.lidHold, yoyo: true, repeat: -1, repeatDelay: D.blink, ease: "sine.inOut",
      });
    } else {
      this.avBlink.setVisible(false).setAlpha(0);
    }
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
      this.applyKobiMood(this.blipActive.mood); // ring + border pulse + eyelid follow mood
      this.blipGlow.setAlpha(0.15);
      this.blipGlowTween.restart();
      duckMusic(true); // duck the music bus while KOBI types
    }
    const b = this.blipActive;
    // P9: KOBI's iris wanders while idle, snaps toward the text while he types.
    // Deterministic sine wander (no per-frame random / alloc); only while visible.
    if (this.blipBar.visible) {
      const typing = b && b.shown < b.text.length;
      const tx = typing ? 5 : Math.cos(time / 680) * 4;
      const ty = typing ? 1.5 : Math.sin(time / 1020) * 3;
      const k = typing ? 0.35 : 0.12;
      this.irisPos.x += (tx - this.irisPos.x) * k;
      this.irisPos.y += (ty - this.irisPos.y) * k;
      // A11: fold the angry-shake offset (0 unless the angry mood is mid-shake) into
      // the iris placement so the eye twitches without a competing per-frame tween.
      this.avIris.setPosition(this.irisPos.x + this._avShakeX, this.irisPos.y);
    }
    if (b) {
      if (b.shown < b.text.length) {
        // U11: TEXT SPEED fast doubles chars/tick (cached getter — no parse here)
        b.shown = Math.min(b.text.length, b.shown + delta * 0.055 * uxTextSpeed());
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
