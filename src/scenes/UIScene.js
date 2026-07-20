import Phaser from "phaser";
import { COLORS, WORLD_THEMES, FONT, FONT_DISPLAY, FS, TEXT } from "../constants.js";
import { LEVELS } from "../levels/registry.js";
import { sfx, installMute, duckMusic, playForText, stopVO } from "../audio.js";
import { uxTextSpeed } from "../ux.js";
import { pads } from "../pad.js";
import { drawIris, irisMaxR } from "../ui/kit.js";
import { MOTION } from "../anim/motion.js";
import { ringGlow, glassPanel, sheen, GLASS_HI } from "../ui/paint.js";


const SKILL_ICON = { grapple: "icon_grapple", heavy: "icon_heavy", phase: "icon_phase", tiny: "icon_tiny" };

// player-color css strings for HUD text (mirrors COLORS.beep / COLORS.boop)
const P_HEX = ["#4dc9ff", "#ffa14d"];
const P_COL = [COLORS.beep, COLORS.boop];

// P9: KOBI mood → ring / border-pulse colour. Gloating magenta (his default
// smug), angry red (a plan backfired), defeated grey-blue (he deflates).
const KOBI_RING = { gloating: 0xff4dd2, angry: 0xff3b30, defeated: 0x7d8fb8 };

// GFX4 F3 (3a): KOBI portrait 2.0 — mood tag → baked expression texture. Covers
// EXACTLY the mood strings that flow through the bb:blip queue (catalogued from
// barks.js + every GameScene emit + level defs): gloating (the queue default for
// tagless/bark lines) → smug; angry/scared → alarmed; happy → glee; defeated →
// defeated. Any unknown/absent tag falls back to neutral.
const KOBI_FACE = {
  gloating: "kobi_face_smug",
  angry: "kobi_face_alarmed",
  scared: "kobi_face_alarmed",
  happy: "kobi_face_glee",
  defeated: "kobi_face_defeated",
};
const kobiFace = (mood) => KOBI_FACE[mood] || "kobi_face_neutral";

// pointy-top hexagon outline, centred on (0,0) — precomputed once, reused for
// every core pip so nothing is allocated per frame / per redraw.
const HEX = [];
for (let i = 0; i < 6; i++) {
  const a = (Math.PI / 180) * (60 * i - 90);
  HEX.push(new Phaser.Geom.Point(11 * Math.cos(a), 11 * Math.sin(a)));
}
// GFX2 "Lumen Lab": a smaller, upward-shifted hex used as the gem's lit top facet
// (same HEX geometry, scaled — keeps the frozen pip footprint identical).
const HEX_IN = HEX.map((p) => new Phaser.Geom.Point(p.x * 0.58, p.y * 0.58 - 1.6));

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
    // GFX2 "Lumen Lab" glass plates: translucent fill + sheen + top-edge lip.
    glassPanel(plateBg, { x: W / 2 - tw / 2 - 16, y: 9, w: tw + 32, h: 26, r: 9, accent: theme.accent, fillA: 0.72, borderW: 1, borderA: 0.42, glow: false });
    const plateUnderline = this.add.rectangle(W / 2, 38, tw + 10, 3, theme.accent, 0.9);
    // GFX4 F2 (2d): the top-center level pill collides with the GameScene intro
    // banner (which slides in over the same top-center strip). Group the pill's
    // pieces so the banner's lifecycle can fade them out while it's on screen and
    // back in when it finishes/skips (see the `introbanner` handler below).
    this.levelPillParts = [plateBg, this.plateText, plateUnderline];

    // --- core pip tray + key chip ---------------------------------------------
    const trayW = 92;
    const tray = this.add.graphics();
    glassPanel(tray, { x: W / 2 - trayW / 2, y: 50, w: trayW, h: 26, r: 8, accent: theme.accent, fillA: 0.7, borderW: 1, borderA: 0.42, glow: false });
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
    glassPanel(this.keyChip, { x: W / 2 + 52, y: 50, w: 56, h: 26, r: 8, accent: 0xffd94d, fillA: 0.74, borderW: 1, borderA: 0.62, glow: false });
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
    // GFX2 "Lumen Lab" glass clear-panel: frosted fill + diagonal sheen + top-edge
    // lip, keeping its strong accent border and soft outer glow ring.
    pg.fillStyle(COLORS.panel, 0.9).fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 18);
    sheen(pg, { x: -pw / 2, y: -ph / 2, w: pw, h: ph, a: 0.05 });
    pg.lineStyle(1.5, GLASS_HI, 0.1).lineBetween(-pw / 2 + 18, -ph / 2 + 1.5, pw / 2 - 18, -ph / 2 + 1.5);
    pg.lineStyle(7, this.accent, 0.16).strokeRoundedRect(-pw / 2 - 4, -ph / 2 - 4, pw + 8, ph + 8, 21);
    pg.lineStyle(3, this.accent, 1).strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 18);
    // P8: soft top-light gradient over the clear panel — a gentle key light from
    // above (inset clear of the rounded corners; cheap non-additive cached image).
    const winTopLight = this.add.image(0, -ph / 2 + 6, "toplight")
      .setOrigin(0.5, 0).setDisplaySize(pw - 64, ph * 0.5).setAlpha(0.1);
    this.winTitle = this.add.text(0, -108, "CHAMBER CLEAR!", {
      fontFamily: FONT_DISPLAY, fontSize: FS.h2, fontStyle: "bold", color: TEXT.good,
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
        const bark = typeof payload === "object" && !!payload.bark;
        // T1 queue discipline. BARKS are droppable live-commentary: if a line is
        // already showing OR anything is queued, a bark is discarded rather than
        // piling up (D2 — one event could otherwise force ~12s of forced KOBI).
        if (bark && (this.blipActive || this.blipQueue.length)) return;
        // Hard cap of 3 for scripted lines: drop the NEWEST beyond the cap, but
        // NEVER drop a defeated finale line (it must always land).
        if (this.blipQueue.length >= 3 && mood !== "defeated") return;
        this.blipQueue.push({ text, mood });
      },
      complete: (info) => {
        this.completed = info; // set synchronously (before animation) — continue stays instant
        const tut = !!info.tutorial; // Sprint 10: tutorial variant — no save, back to Title
        this.overlay.setVisible(true);
        // W3W4 L43: the finale's overlay is the SAME clear flow (stats/cores/
        // records/continue all identical — the finishLevel contract holds),
        // only the headline changes; continueFromClear routes to the Epilogue.
        this.winTitle.setText(info.finale ? "BOLT RESCUED!" : tut ? "ORIENTATION COMPLETE!" : "CHAMBER CLEAR!");
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
      // GFX4 F2 (2d): fade the top-center level pill out while the GameScene intro
      // banner is on screen, and back in when it finishes OR is skipped (both run
      // through the banner's guarded finish()). Visual-only; no timers of our own.
      introbanner: (on) => {
        if (!this.levelPillParts) return;
        this.tweens.add({ targets: this.levelPillParts, alpha: on ? 0 : 1, duration: 200, ease: "sine.out" });
      },
    };
    Object.entries(this.h).forEach(([k, fn]) => E.on(`bb:${k}`, fn));
    // The banner is created during GameScene.create — BEFORE this UI scene's
    // create runs — so its "banner up" emit is missed. Seed the initial state
    // here: if the banner is still on screen, start the pill hidden (it fades
    // back when the banner's finish() emits `bb:introbanner` false).
    {
      const G = this.scene.get("Game");
      if (G && G.introBanner && !G._introDone) this.levelPillParts.forEach((o) => o.setAlpha(0));
    }
    this.events.once("shutdown", () => {
      Object.entries(this.h).forEach(([k, fn]) => E.off(`bb:${k}`, fn));
      stopVO(); // never let a spoken line bleed across a scene swap
      duckMusic(false); // never leave the bus ducked after the HUD is gone
      if (typeof window !== "undefined" && window.__BB) window.__BB.textbox = null;
    });

    // T1: ENTER is the universal "next text" key for the blip bar (poll it in
    // update via JustDown so the clear-overlay keydown handler below still owns
    // ENTER while this.completed is set). Pad START advances too (see update()).
    this.enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

    // T1 probe surface (tools/playtest_textbox.mjs): the live blip text (or null),
    // the pending queue length, and skip() == one ENTER press.
    const self = this;
    if (typeof window !== "undefined") {
      window.__BB = window.__BB || {};
      window.__BB.textbox = {
        get active() { return self.blipActive ? self.blipActive.text : null; },
        get queueLen() { return self.blipQueue.length; },
        skip: () => self.skipBlip(),
      };
    }

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
      // W3W4 L43: the campaign finale (4-3) continues into the Epilogue scene
      // (playground + credits) instead of the hub — the tutorial's custom
      // post-complete routing, applied to the ending.
      if (this.completed.finale) this.scene.start("Epilogue");
      else if (tut && this.completed.returnToHub) this.scene.start("Hub");
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
      // GFX2 "Lumen Lab": smoother bolt + gear confetti — soft-shaded pieces with
      // a top-light sheen and a warm rim, so the burst reads as tumbling metal.
      // frame 0 — hex bolt head (0..16)
      const bx = 8, by = 8, br = 6;
      const hex = (cx, cy, rr) => {
        cg.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + k * Math.PI / 3;
          const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
          if (k === 0) cg.moveTo(x, y); else cg.lineTo(x, y);
        }
        cg.closePath(); cg.fillPath();
      };
      cg.fillStyle(0xe89a2c, 1); hex(bx, by, br);           // under-shade
      cg.fillStyle(0xffd24d, 1); hex(bx, by - 0.7, br - 0.7); // lit cap
      cg.fillStyle(0xffe9a8, 0.7); hex(bx, by - 1.6, br * 0.5); // top sheen
      cg.fillStyle(0x241704, 1).fillCircle(bx, by, 2);
      cg.fillStyle(0xfff4cf, 0.8).fillCircle(bx - 0.8, by - 0.8, 0.7); // spec pip
      // frame 1 — little gear (16..32): rounded teeth + soft-shaded hub
      const gx = 24, gy = 8;
      cg.fillStyle(0xe08f2f, 1);
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        cg.fillCircle(gx + Math.cos(a) * 5.4, gy + Math.sin(a) * 5.4, 1.7); // rounded teeth
      }
      cg.fillStyle(0xffb347, 1).fillCircle(gx, gy, 4.8);   // hub base
      cg.fillStyle(0xffcf7a, 0.9).fillCircle(gx - 0.6, gy - 0.9, 3.2); // top-light
      cg.fillStyle(0x241704, 1).fillCircle(gx, gy, 1.8);   // bore
      cg.fillStyle(0xfff4cf, 0.8).fillCircle(gx - 1.4, gy - 1.4, 0.8); // spec pip
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
    // GFX2 "Lumen Lab" glass plate: translucent fill + sheen + top-edge lip +
    // player-colour border with a soft outer glow.
    glassPanel(g, { x, y, w, h, r: 11, accent: col, fillA: 0.82, borderA: 0.9, glowA: 0.16 });

    // skill-icon chip (glassy recessed square with its own top-edge lip)
    const chipX = left ? x + 8 : x + w - 8 - 30;
    g.fillStyle(0x141d33, 0.9).fillRoundedRect(chipX, y + 9, 30, 30, 7);
    g.lineStyle(1, 0xffffff, 0.1).lineBetween(chipX + 6, y + 10.5, chipX + 24, y + 10.5);
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
    g.fillStyle(0xffffff, 0.08).fillRoundedRect(x + 2, y + 2, w - 4, h * 0.4, 4); // glass top gloss
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
      // GFX2 "Lumen Lab" gem pip (same HEX footprint): soft glow → hex body →
      // a lighter upper facet → a bright specular pip → crisp white rim.
      g.fillStyle(this.accent, 0.18).fillCircle(0, 0, 13);
      g.fillStyle(this.accent, 1).fillPoints(HEX, true);
      g.fillStyle(0xffffff, 0.24).fillPoints(HEX_IN, true); // lit top facet
      g.fillStyle(0xffffff, 0.9).fillCircle(-3, -4, 1.8);   // specular
      g.lineStyle(2, 0xffffff, 0.85).strokePoints(HEX, true, true);
    } else {
      g.fillStyle(0x161f36, 0.7).fillPoints(HEX, true);
      g.fillStyle(0xffffff, 0.05).fillPoints(HEX_IN, true); // faint glass facet
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
    // GFX2 "Lumen Lab" glass blip bar (same geometry): frosted fill + sheen +
    // top-edge lip + magenta border. The mood glow ring (blipGlow) rides on top.
    glassPanel(bg, { x: x0, y: y0, w, h, r: 10, accent: COLORS.magenta, fillA: 0.86, borderA: 0.7, glow: false });

    // pulsing border glow (only while a blip is on screen). Colour follows KOBI's
    // mood — recoloured in applyKobiMood; stored geometry keeps it alloc-free.
    this.blipGlow = this.add.graphics().setAlpha(0);
    this._blipRect = { x0, y0, w, h };

    // KOBI avatar — layered so the iris can wander/snap, the ring can recolour to
    // his mood, and a defeated eyelid can droop, all without per-frame allocations.
    const ax = x0 + 42, ay = y0 + h / 2;
    this._avx = ax; this._avy = ay;
    const avBase = this.add.graphics();
    // GFX2 "Lumen Lab": glassier sclera + a soft magenta housing glow seam.
    avBase.fillStyle(0x1a1020, 1).fillCircle(ax, ay, 22);   // socket
    ringGlow(avBase, { x: ax, y: ay, r: 20, color: COLORS.magenta, width: 1.5 });
    avBase.fillStyle(0xf6f0ff, 1).fillCircle(ax, ay, 17);   // glassy sclera
    avBase.fillStyle(0xffffff, 0.5).fillEllipse(ax - 5, ay - 6, 10, 5); // top-left sheen
    this.avRing = this.add.graphics();                       // mood ring (recoloured)
    this.avIris = this.add.graphics();                       // iris — wanders / snaps
    this.avIris.fillStyle(COLORS.magenta, 0.28).fillCircle(ax, ay, 11); // deep magenta iris glow
    this.avIris.fillStyle(COLORS.magenta, 1).fillCircle(ax, ay, 8);     // magenta iris
    this.avIris.fillStyle(0x2a0a1e, 1).fillCircle(ax, ay, 3.5);         // pupil
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
    this.blipName = name;
    this.blipText = this.add.text(x0 + 72, y0 + 26, "", {
      fontFamily: FONT, fontSize: FS.large, color: "#ffd7f4", wordWrap: { width: 806 },
    });

    // T1 slim-bar support: the avatar assembly is grouped so a slim (1-line) bar
    // can shift the whole eye DOWN to the shorter bar's centre with one .y set,
    // instead of redrawing every baked avatar layer. Baked at the FULL geometry
    // (ay = y0 + h/2); layoutBlipBar() nudges the group for the slim variant.
    this.avatarGroup = this.add.container(0, 0);
    this.avatarGroup.add([avBase, this.avRing, this.avIris, this.avSquint, this.avFlare, this.avBlink, this.avLid]);
    // GFX4 F3 (3a): the baked KOBI portrait rides ON TOP of the (untouched) avatar
    // machinery — a texture-swap face at the exact socket centre, so all the P9/A11
    // mood state (kobiMood, irisPos, avLid/avSquint/avFlare/avBlink) keeps working
    // for the contracts/probes while the PORTRAIT is what the player sees. The mouth
    // overlay sits over the baked mouth region; it flutters open/closed while typing.
    this.avPortrait = this.add.image(ax, ay, "kobi_face_neutral");
    this.avMouth = this.add.image(ax, ay + 11, "kobi_mouth").setVisible(false);
    this.avatarGroup.add([this.avPortrait, this.avMouth]);
    this.blipBg = bg;                 // redrawn per line (slim vs full) — see layoutBlipBar
    this._barX = { x0, w };           // x-geometry is fixed; only y0/h change per line

    // T1 "↵" affordance chip: a dim keycap at the bar's right gutter (right of the
    // 806px text wrap, so it never overlaps the caption), vertically centred and
    // styled like the buildHints keycaps. Drawn once; it lives inside blipBar so it
    // toggles with the bar, and layoutBlipBar() shifts its .y for the slim variant.
    const chipKw = 30, chipH = 20;
    const chipX = x0 + w - 8 - chipKw;   // right of text (x0+72+806 = x0+878; chip at x0+882)
    const chipCy = y0 + h / 2;           // full-bar centre; +12 for slim (layoutBlipBar)
    const chipG = this.add.graphics();
    this.drawKeycap(chipG, chipX, chipCy - chipH / 2, chipKw, chipH, 0x5a6a99, 0.7);
    const chipT = this.add.text(chipX + chipKw / 2, chipCy, "↵", { fontFamily: FONT, fontSize: FS.mini, fontStyle: "bold", color: "#9fb0da" }).setOrigin(0.5);
    this.enterChip = this.add.container(0, 0);
    this.enterChip.add([chipG, chipT]);

    this.blipBar.add([this.blipGlow, bg, this.avatarGroup, name, this.blipText, this.enterChip]);

    this.blipGlowTween = this.tweens.add({
      targets: this.blipGlow, alpha: { from: 0.15, to: 0.85 },
      duration: 620, yoyo: true, repeat: -1, ease: "sine.inOut", paused: true,
    });
    this.applyKobiMood("gloating"); // draw the initial ring + border-glow colour
    this.layoutBlipBar(false);      // seed geometry (_blipRect) at the full variant
  }

  // T1: does the post-wrap caption fit ONE line at the bar's 806px wrap width?
  // (Measured on the live blipText object so its style/wrap is the authority.)
  blipTextFits1Line(text) {
    return this.blipText.getWrappedText(text).length <= 1;
  }

  // T1: lay the bar out for the current line. Full = h80 @ y0=H-92; slim (1-line
  // caption) = h56 @ y0=H-92+24 so the BOTTOM edge stays put (H-12) and only the
  // top moves down. The bg is cleared+redrawn (like Epilogue's paintPlate); the
  // avatar group + "↵" chip shift to the shorter bar's centre; name/text recentre.
  // _blipRect is updated so applyKobiMood() traces the border glow on the new rect.
  layoutBlipBar(slim) {
    const { x0, w } = this._barX;
    const H = this.scale.height;
    const y0 = slim ? (H - 92 + 24) : (H - 92);
    const h = slim ? 56 : 80;
    this.blipBg.clear();
    glassPanel(this.blipBg, { x: x0, y: y0, w, h, r: 10, accent: COLORS.magenta, fillA: 0.86, borderA: 0.7, glow: false });
    this._blipRect = { x0, y0, w, h };
    // avatar + chip were baked at the full-bar centre (H-52); nudge to slim centre.
    const shift = slim ? 12 : 0;
    this.avatarGroup.y = shift;
    this.enterChip.y = shift;
    // name label + caption: slim recentre the single line inside the shorter bar.
    this.blipName.setY(slim ? y0 + 6 : y0 + 7);
    this.blipText.setY(slim ? y0 + 24 : y0 + 26);
    this._blipSlim = slim;
  }

  // T1: ENTER / pad-START handler for the active blip. Press 1 while typing ->
  // complete the typewriter instantly; press again (or a press once fully typed)
  // -> dismiss the line and advance the queue. No-op when nothing is showing.
  skipBlip() {
    const b = this.blipActive;
    if (!b) return;
    if (b.shown < b.text.length) {
      b.shown = b.text.length;
      this.blipText.setText(b.text);
    } else {
      this.dismissBlip();
    }
  }

  // T1: retire the active line. When the queue empties, hide the bar and release
  // the music duck (per-line release: dismiss-via-ENTER + auto-hold both land here).
  dismissBlip() {
    this.blipActive = null;
    if (!this.blipQueue.length) {
      this.blipBar.setVisible(false);
      this.blipText.setText("");
      this.blipGlowTween.pause();
      this.blipGlow.setAlpha(0);
      duckMusic(false);
    }
  }

  // P9: recolour KOBI's mood ring + the blip-bar border pulse, and droop the
  // eyelid on defeat. Called on each new blip; cheap redraw, no allocation.
  applyKobiMood(mood) {
    this.kobiMood = mood;
    // GFX4 F3 (3a): swap the portrait to the mood's baked expression (texture swap
    // only — geometry/position untouched). Unknown/absent mood → neutral.
    if (this.avPortrait) this.avPortrait.setTexture(kobiFace(mood));
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

    // T1 universal dismiss: ENTER (keyboard) or pad START advance the active blip
    // — press 1 completes the typewriter, press 2 (or a press once fully typed)
    // dismisses. The clear overlay owns ENTER while this.completed is set (its
    // keydown/pad path wins), so the blip skip is gated on !this.completed. Pad
    // START is B_START/pauseJust; GameScene skips its pause-toggle while a blip is
    // up (see GameScene update) so the same press never both dismisses AND pauses.
    const skipPressed = Phaser.Input.Keyboard.JustDown(this.enterKey)
      || pads.p(0).pauseJust || pads.p(1).pauseJust;
    if (skipPressed && !this.completed && this.blipActive) this.skipBlip();

    // typewriter blips
    if (!this.blipActive && this.blipQueue.length) {
      const item = this.blipQueue.shift();
      // T1 length-scaled hold (D1): TEXT SPEED now also shortens the on-screen hold
      // (uxTextSpeed is a chars/tick MULTIPLIER — bigger = faster typing — so we
      // DIVIDE by it). clamp(1200, 28ms/char, 2600).
      const hold = Math.max(1200, Math.min(2600, 28 * item.text.length / uxTextSpeed()));
      this.blipActive = { text: item.text, mood: item.mood || "gloating", shown: 0, hold };
      this.blipBar.setVisible(true);
      this.avMouth.setVisible(false); // F3 (3a): start with the mouth settled closed
      this.blipText.setText("");
      this.layoutBlipBar(this.blipTextFits1Line(item.text)); // slim bar for 1-line captions
      this.applyKobiMood(this.blipActive.mood); // ring + border pulse + eyelid follow mood
      this.blipGlow.setAlpha(0.15);
      this.blipGlowTween.restart();
      duckMusic(true); // duck the music bus while KOBI types
      // VO: speak the matching pre-generated line (if one exists) over the caption.
      // No-op when VOICE is muted or no clip matches — the caption always shows.
      playForText(this.blipActive.text);
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
        // GFX4 F3 (3a): mouth flutter — piggybacks THIS typing step (no new timer/
        // loop; only advances while typing). ~120ms open/closed cadence.
        b._mouthAcc = (b._mouthAcc || 0) + delta;
        if (b._mouthAcc >= 120) { b._mouthAcc -= 120; this.avMouth.setVisible(!this.avMouth.visible); }
      } else {
        if (this.avMouth.visible) this.avMouth.setVisible(false); // typing ended → mouth closed
        b.hold -= delta;
        if (b.hold <= 0) this.dismissBlip(); // auto-clear (same path as ENTER dismiss)
      }
    }
  }
}
