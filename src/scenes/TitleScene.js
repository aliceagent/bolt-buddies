import Phaser from "phaser";
import { COLORS, WORLD_THEMES, FONT, FONT_DISPLAY, FS, TEXT } from "../constants.js";
import { addGradient, addMotes } from "../backdrop.js";
import { LEVELS } from "../levels/registry.js";
import { loadSave, storeSave, totalCores, campaignComplete } from "../save.js";
import { initAudio, sfx, playTrack, installMute } from "../audio.js";
import { pads, showPadToast } from "../pad.js";
import { tutorialDone, uxFlashScale } from "../ux.js";
import { keyCap as kitKeyCap, chipRow as kitChipRow, neonPanel, addSkyline, springFocus, runIris, irisMaxR } from "../ui/kit.js";
import { MOTION } from "../anim/motion.js";
import { ringGlow, specular, glassPanel } from "../ui/paint.js";

const ACCENT = WORLD_THEMES[1].accent; // world-1 amber accent for buttons
const hexStr = (n) => "#" + (n & 0xffffff).toString(16).padStart(6, "0");
// local channel-scale (darken f<1 / lighten f>1, clamped) for soft shading
const shade = (hex, f) => {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
};

// Neon two-tone endpoints for the wordmark colour cycle (cyan <-> magenta).
const TONE_A = [53, 240, 255];
const TONE_B = [255, 77, 210];
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const mixTone = (t) => [lerp(TONE_A[0], TONE_B[0], t), lerp(TONE_A[1], TONE_B[1], t), lerp(TONE_A[2], TONE_B[2], t)];
const rgbCss = (c, f = 1) => `rgb(${Math.round(c[0] * f)},${Math.round(c[1] * f)},${Math.round(c[2] * f)})`;

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super("Title");
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    addGradient(this, 1);
    this.add.tileSprite(0, 0, W, H, "bggrid").setOrigin(0).setAlpha(0.22).setDepth(-8);
    addMotes(this, WORLD_THEMES[1].accent2);
    this.cameras.main.fadeIn(250, 4, 6, 20); // 250ms fade-in on entry
    this.leaving = false; // guards the fade-out so a second Enter can't double-start

    this.buildSkyline(W);   // distant silhouette strip + conveyor (behind the cast)
    this.buildLogo(W, 86);
    this.buildSubtitle(W, 140);
    this.buildCast(W);
    this.buildStory(W, 306);
    this.buildMenu(W, H);
    this.buildFooter(W, H);
    this.buildKobiCorner(W, H);

    // title music: requested now, actually starts on the first keydown once the
    // AudioContext is unlocked — autoplay-safe.
    playTrack("title");
    installMute(this);

    this.input.keyboard.addCapture("SPACE"); // keep Space from scrolling the page
    this.input.keyboard.on("keydown", (ev) => {
      initAudio();
      const c = ev.code;
      if (c === "KeyS") {
        sfx.menuSelect();
        this.scene.start("Settings", { returnTo: "Title" });
      } else if (c === "KeyW" || c === "ArrowUp") {
        this.moveSel(-1);
      } else if (c === "ArrowDown") {
        this.moveSel(1);
      } else if (["Space", "KeyE", "KeyL", "Enter"].includes(c)) {
        this.activate();
      }
    });

    this.events.once("shutdown", () => {
      if (this.eraseTimer) this.eraseTimer.remove();
      if (this.flickerTimer) this.flickerTimer.remove();
      if (this.eyeRollTimer) this.eyeRollTimer.remove();
    });
  }

  // U7: pad1 drives the menu 1:1 with the keyboard handler — up/down select,
  // A/confirm activates. Any pad button counts for the audio unlock, and a fresh
  // connection pops the per-session detection toast.
  update(time, delta) {
    pads.poll(time);
    const p = pads.p(0);
    if (pads.anyButtonJust()) initAudio();
    const conn = pads.consumeConnected();
    if (conn) conn.forEach((idx) => showPadToast(this, idx));
    if (p.upJust) this.moveSel(-1);
    else if (p.downJust) this.moveSel(1);
    if (p.confirmJust) this.activate();
    this.updateBoltWag(delta || 16); // A11: decay the tail-wag excitement toward idle
  }

  // A11: the tail wags FASTER the more actively the player moves through the menu.
  // `excite` (topped to 1 by boltMenuReact) decays linearly back to 0 over BOLT_TAIL.decay
  // ms (frame-rate-independent — uses delta), driving the reused wag tween's timeScale.
  // No allocation; a pure timeScale nudge on the existing pooled tween.
  updateBoltWag(delta) {
    const b = this.bolt; if (!b || !b.tailTween) return;
    if (b.excite > 0) {
      b.excite = Math.max(0, b.excite - delta / MOTION.BOLT_TAIL.decay);
    }
    const maxScale = MOTION.BOLT_TAIL.slow / MOTION.BOLT_TAIL.fast; // idle:1 -> excited:2.5x
    b.tailTween.timeScale = 1 + b.excite * (maxScale - 1);
  }

  // --- distant lab skyline + a scrolling conveyor line ------------------------
  buildSkyline(W) {
    // silhouette strip sits behind the cast; buildings/cranes bleed down behind
    // the menu so the mid-screen band is no longer an empty gradient. (Shared
    // skyline helper — Settings/Pause wear the same strip.)
    addSkyline(this, { y: 470, alpha: 0.55 });

    // antenna-tip blink lights (texture coords [x, ty]; skyline baseline y=280,
    // placed with its bottom at 470 => worldY = 470 - (300 - ty)).
    const tips = [[210, 64, 0xff6a52], [720, 50, 0xffc24d], [1060, 84, 0xff6a52]];
    tips.forEach(([tx, ty, col], i) => {
      const wx = tx; // image is 1280 wide, centred on W/2 => texX maps 1:1
      const wy = 470 - (300 - ty);
      const dot = this.add.graphics({ x: wx, y: wy }).setDepth(-4);
      dot.fillStyle(col, 0.9).fillCircle(0, 0, 2.4);
      dot.fillStyle(col, 0.25).fillCircle(0, 0, 5);
      dot.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2);
      this.tweens.add({
        targets: dot, alpha: { from: 0.2, to: 1 }, duration: 620 + i * 140,
        yoyo: true, repeat: -1, hold: 120, repeatDelay: 300 + i * 260, ease: "sine.inOut",
      });
    });

    // conveyor carrying tiny silhouette parts, under the cast's floor shadows
    const belt = this.add.tileSprite(W / 2, 232, W, 58, "conveyor")
      .setOrigin(0.5, 0).setDepth(-4).setAlpha(0.92);
    this.tweens.add({ targets: belt, tilePositionX: 220, duration: 5200, repeat: -1, ease: "linear" });
  }

  // --- neon logo: per-letter tube (glow + tube + core) + colour cycle ---------
  buildLogo(W, cy) {
    const text = "BOLT BUDDIES";
    const style = { fontFamily: FONT, fontSize: FS.hero, fontStyle: "bold" };

    // measure each glyph so per-letter copies can be centred exactly
    const widths = [];
    let total = 0;
    for (const ch of text) {
      const probe = this.add.text(0, 0, ch, style).setVisible(false);
      widths.push(probe.width);
      total += probe.width;
      probe.destroy();
    }

    const fill0 = rgbCss(TONE_A);
    const stroke0 = rgbCss(TONE_A, 0.32);
    this.neon = [];
    let x = W / 2 - total / 2;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const cx = x + widths[i] / 2;
      x += widths[i];
      if (ch === " ") continue;

      const cont = this.add.container(cx, cy).setDepth(0);
      // GFX2 "Lumen Lab" (V7): a THREE-layer additive bloom (widest+faintest first)
      // on a softer alpha ramp so the wordmark glows out gently instead of stepping.
      const glow3 = this.add.text(0, 0, ch, { ...style, color: fill0 })
        .setOrigin(0.5).setScale(1.52).setAlpha(0.16).setBlendMode(Phaser.BlendModes.ADD);
      const glow2 = this.add.text(0, 0, ch, { ...style, color: fill0 })
        .setOrigin(0.5).setScale(1.32).setAlpha(0.26).setBlendMode(Phaser.BlendModes.ADD);
      const glow1 = this.add.text(0, 0, ch, { ...style, color: fill0 })
        .setOrigin(0.5).setScale(1.16).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);
      // glass tube: the glyph BODY is the full saturated cycle tone, rimmed by a
      // darker stroke of the same hue
      const tube = this.add.text(0, 0, ch, { ...style, color: fill0, stroke: stroke0, strokeThickness: 8 })
        .setOrigin(0.5);
      // hot filament core: a small near-white centre kept well INSIDE the tube
      // body so the saturated colour dominates the glyph (0.9 was a wash-out)
      const core = this.add.text(0, 0, ch, { ...style, color: "#f4ffff" })
        .setOrigin(0.5).setScale(0.68);
      cont.add([glow3, glow2, glow1, tube, core]);
      cont.setAlpha(0); // flicker-on below

      this.neon.push({ cont, glow1, glow2, glow3, tube });

      // flicker-on: a couple of quick blinks, then settle lit.
      // U11 FLASH soft: same power-on beat count, less contrast, slower ramp.
      // GFX4 F1-QA: the yoyo tween ENDS at its dark `from` value and relied solely
      // on onComplete to relight — under a slow first-seconds renderer that
      // callback can be skipped, stranding letters dark. Settle on complete AND
      // stop, plus an absolute per-letter backstop so the wordmark can never
      // stay dark regardless of frame pacing.
      const settleLit = () => cont.active && cont.setAlpha(1);
      this.time.delayedCall(Math.random() * 700, () => {
        if (!cont.active) return;
        const fs = uxFlashScale();
        this.tweens.add({
          targets: cont, alpha: { from: fs < 1 ? 0.55 : 0, to: 1 }, duration: 90 / fs, repeat: 2, yoyo: true,
          onComplete: settleLit, onStop: settleLit,
        });
      });
      this.time.delayedCall(1600, settleLit); // hard backstop: lit by 1.6s, always
    }

    // slow two-tone colour cycle across the whole wordmark (bucketed so text
    // re-renders only ~20 times per half-cycle, never per frame)
    this.neonTone = { t: 0, bucket: -1 };
    this.tweens.add({
      targets: this.neonTone, t: 1, duration: 4600, yoyo: true, repeat: -1, ease: "sine.inOut",
      onUpdate: () => {
        const b = Math.round(this.neonTone.t * 20);
        if (b === this.neonTone.bucket) return;
        this.neonTone.bucket = b;
        this.applyNeonTone(this.neonTone.t);
      },
    });

    // occasional single-letter flicker after the initial flicker-on settles
    this.time.delayedCall(2600, () => this.scheduleFlicker());
  }

  // Apply a cycle tone t (0 = cyan, 1 = magenta) to the whole wordmark. Split
  // out from the tween so review tooling can pin either extreme for screenshots.
  applyNeonTone(t) {
    const c = mixTone(t);
    const fill = rgbCss(c);
    const stroke = rgbCss(c, 0.32);
    for (const L of this.neon) {
      L.tube.setColor(fill); L.tube.setStroke(stroke, 8);
      L.glow1.setColor(fill); L.glow2.setColor(fill); L.glow3.setColor(fill);
    }
  }

  scheduleFlicker() {
    const lit = (this.neon || []).filter((L) => L.cont.active);
    if (lit.length) {
      const L = Phaser.Utils.Array.GetRandom(lit);
      // U11 FLASH soft: the ambient neon flicker burst dims less and ramps slower.
      // GFX4 F1-QA: same settle guarantee as the flicker-on — a skipped
      // onComplete must never strand a letter dim (see buildLogo).
      const fs = uxFlashScale();
      const relight = () => L.cont.active && L.cont.setAlpha(1);
      this.tweens.add({
        targets: L.cont, alpha: { from: 1, to: fs < 1 ? 0.6 : 0.25 }, duration: 65 / fs, yoyo: true, repeat: 1,
        onComplete: relight, onStop: relight,
      });
      this.time.delayedCall(600, relight); // backstop: a flicker burst is <=260ms
    }
    this.flickerTimer = this.time.delayedCall(1800 + Math.random() * 3200, () => this.scheduleFlicker());
  }

  buildSubtitle(W, cy) {
    const sub = this.add.text(W / 2, cy, "a 2-player rescue mission", {
      fontFamily: FONT_DISPLAY, fontSize: FS.head, fontStyle: "600", color: TEXT.dim,
    }).setOrigin(0.5);
    // slow hue shimmer: sweep the colour around the wheel (setColor works under
    // canvas — it is a CSS string, not a WebGL tint).
    const hue = { h: 200 };
    this.tweens.add({
      targets: hue, h: 340, duration: 4200, yoyo: true, repeat: -1, ease: "sine.inOut",
      onUpdate: () => {
        const c = Phaser.Display.Color.HSVToRGB(hue.h / 360, 0.45, 1);
        sub.setColor(Phaser.Display.Color.RGBToString(c.r, c.g, c.b));
      },
    });
  }

  // --- robots + a robo-puppy Bolt, all on floor-shadow ellipses ---------------
  buildCast(W) {
    const y = 208;
    const shadow = this.add.graphics().setDepth(-1);
    [-130, 0, 130].forEach((dx) => {
      shadow.fillStyle(0x000000, 0.32).fillEllipse(W / 2 + dx, y + 44, 74, 16);
    });

    const beep = this.add.image(W / 2 - 130, y, "robot_b").setScale(1.6);
    const boop = this.add.image(W / 2 + 130, y, "robot_o").setScale(1.6);
    // gentle bob (shared) + a tiny per-robot tread-shuffle x jitter
    this.tweens.add({ targets: [beep, boop], y: "-=10", duration: 900, yoyo: true, repeat: -1, ease: "sine.inOut" });
    this.tweens.add({ targets: beep, x: beep.x + 2.5, duration: 150, yoyo: true, repeat: -1, ease: "sine.inOut" });
    this.tweens.add({ targets: boop, x: boop.x - 2.5, duration: 165, yoyo: true, repeat: -1, ease: "sine.inOut" });
    // occasional blink via the _blink textures
    this.robotBlink(beep, "robot_b");
    this.robotBlink(boop, "robot_o");

    this.buildBolt(W / 2, y + 10);

    // W3W4 L43: campaign complete (read from the save's unlocked counter) —
    // Bolt sits WITH the robots for good, so the title acknowledges it with a
    // small warm chip under the cast + a permanently delighted tail.
    if (campaignComplete()) {
      const chip = this.add.container(W / 2, y + 66).setDepth(1);
      const label = this.add.text(0, 0, "♥ BOLT IS HOME — thanks for playing!", {
        fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: "#ffd9a0",
      }).setOrigin(0.5);
      const cg = this.add.graphics();
      cg.fillStyle(COLORS.hudBg, 0.85).fillRoundedRect(-label.width / 2 - 14, -13, label.width + 28, 26, 9);
      cg.lineStyle(1.5, ACCENT, 0.7).strokeRoundedRect(-label.width / 2 - 14, -13, label.width + 28, 26, 9);
      chip.add([cg, label]);
      chip.setAlpha(0);
      this.tweens.add({ targets: chip, alpha: 1, duration: 600, delay: 500 });
      // the wag never fully settles once he's home (tops the excitement up)
      this.time.addEvent({ delay: 2600, loop: true, callback: () => { if (this.bolt) this.bolt.excite = Math.max(this.bolt.excite, 0.5); } });
    }
  }

  robotBlink(img, base) {
    const blink = () => {
      if (!img.active) return;
      img.setTexture(base + "_blink");
      this.time.delayedCall(130, () => img.active && img.setTexture(base));
      this.time.delayedCall(2200 + Math.random() * 2800, blink);
    };
    this.time.delayedCall(1500 + Math.random() * 2200, blink);
  }

  // Bolt the robo-puppy: body + stub legs, head with snout + ear flaps, an eye
  // with a catchlight, and a stub tail that wags. Faces right (toward BOOP).
  //
  // A11 extends this ORIGINAL rig (does NOT rebuild it): the parts now hang off a
  // container so Bolt can SIT (settle drop + squash), the EAR is its own object so it
  // can PERK when the menu selection moves, the tail-wag SPEED scales with how
  // actively the player is moving through the menu, and an excited SPIN plays on NEW
  // GAME activation. All pooled (parts + one wag tween reused; the perk/spin are
  // one-shot tweens on menu EVENTS), and all skippable — none of this ever gates or
  // delays menu input/navigation (moveSel/activate act first, motion after).
  buildBolt(cx, cy) {
    const body = 0xd9dee8, dark = 0x8b93a8, collar = ACCENT, eyec = 0x243046;
    // container holds the whole dog so SIT/SPIN/HOP transform it as one (the body
    // sway rides on the body graphic, the wag on the tail — they compose cleanly).
    const c = this.add.container(cx, cy).setDepth(0);
    const g = this.add.graphics().setDepth(0);
    // GFX2 "Lumen Lab": smoother soft-shaded pup + a warm glow ring behind the head.
    // stub legs
    g.fillStyle(dark);
    [-16, -4, 12, 22].forEach((lx) => g.fillRoundedRect(lx, 8, 7, 9, 3));
    // body — base + under-shade + top-light (soft 3-tone) for a rounder read
    g.fillStyle(shade(body, 0.82)).fillRoundedRect(-22, -10, 46, 20, 10);
    g.fillStyle(body).fillRoundedRect(-22, -10, 44, 16, 9);
    g.fillStyle(0xeef1f7, 0.5).fillRoundedRect(-18, -8, 38, 5, 3); // top highlight
    // amber collar just behind the head (with a soft glow)
    g.fillStyle(collar, 0.28).fillRect(11, -12, 6, 24);
    g.fillStyle(collar).fillRect(12, -10, 4, 20);
    g.fillStyle(0xffe0a8, 0.9).fillCircle(14, 2, 2);
    // hind haunch
    g.fillStyle(shade(body, 0.82)).fillCircle(-18, 1, 11);
    g.fillStyle(body).fillCircle(-18, 0, 10.5);
    // warm glow ring behind the head — reads him as friendly/robotic
    ringGlow(g, { x: 24, y: -14, r: 15, color: ACCENT, width: 2 });
    // head
    g.fillStyle(shade(body, 0.82)).fillCircle(24, -13, 13);
    g.fillStyle(body).fillCircle(24, -14, 12.5);
    g.fillStyle(0xeef1f7, 0.45).fillCircle(21, -18, 5.5); // head sheen
    specular(g, { x: 20, y: -19, w: 4, h: 2.4, a: 0.6 }); // glossy dab
    // snout
    g.fillStyle(body).fillRoundedRect(30, -12, 14, 11, 5);
    g.fillStyle(dark).fillCircle(43, -8, 2.6); // nose
    g.fillStyle(0xffffff, 0.6).fillCircle(42.2, -8.8, 0.9); // nose gloss
    g.fillStyle(0x11151f).fillRect(34, -3, 9, 1.6); // mouth line
    // eye + catchlight
    g.fillStyle(eyec).fillCircle(27, -15, 3.6);
    g.fillStyle(0xffffff, 0.95).fillCircle(28.2, -16.2, 1.3);
    // little antenna nub so he reads as robotic (glowing tip)
    g.lineStyle(2, dark).lineBetween(20, -26, 20, -32);
    g.fillStyle(ACCENT, 0.35).fillCircle(20, -33, 4);
    g.fillStyle(ACCENT).fillCircle(20, -33, 2.4);
    // gentle body sway (unchanged — rides on the body graphic inside the container)
    this.tweens.add({ targets: g, angle: { from: -3, to: 3 }, duration: 520, yoyo: true, repeat: -1, ease: "sine.inOut" });

    // ear flap — now its OWN graphic pivoting at its base near the head so it can
    // PERK (lift + tilt back) when the menu selection changes. Same floppy shape,
    // drawn relative to the pivot at (18, -10).
    const ear = this.add.graphics({ x: 18, y: -10 }).setDepth(0);
    ear.fillStyle(dark).fillTriangle(-2, -12, 6, -16, 2, 2);
    ear.fillStyle(0x6c7488).fillTriangle(-1, -11, 4, -13, 2, -2);
    this._boltEarRest = 0; // resting ear angle

    // stub tail (separate graphic so it can wag around its base at the rump)
    const tail = this.add.graphics({ x: -20, y: -4 }).setDepth(0);
    tail.fillStyle(body).fillRoundedRect(-3, -16, 6, 18, 3);
    tail.fillStyle(ACCENT).fillCircle(0, -16, 3.5); // amber tail-tip light
    tail.setAngle(30);
    const tailTween = this.tweens.add({ targets: tail, angle: { from: 18, to: 52 }, duration: 210, yoyo: true, repeat: -1, ease: "sine.inOut" });

    c.add([g, ear, tail]);
    // A11 Bolt state: pooled refs + the wag-excitement value (decays each frame).
    this.bolt = { c, g, ear, tail, tailTween, baseY: cy, restY: cy, excite: 0, spinning: false };

    // settle into a SIT a beat after the title arrives (cosmetic; held as the rest
    // pose). The spin stands him up briefly and returns here.
    this.time.delayedCall(900, () => this.boltSit());
  }

  // A11 SIT — ease into a seated pose: body drops a touch + a gentle squash, held as
  // the resting transform. Cosmetic only (the container has no body).
  boltSit() {
    const b = this.bolt; if (!b || !b.c.active || b.spinning) return;
    const S = MOTION.BOLT_SIT;
    b.restY = b.baseY + S.drop;
    this.tweens.add({
      targets: b.c, y: b.restY, scaleX: 1 + S.squash, scaleY: 1 - S.squash,
      duration: S.dur, ease: S.ease,
    });
  }

  // A11 EAR PERK — a quick lift + tilt-back of the ear when the selection moves,
  // easing back to rest. Reuses the one ear graphic (one-shot tween on the event).
  boltPerk() {
    const b = this.bolt; if (!b || !b.ear.active) return;
    const P = MOTION.BOLT_PERK;
    this.tweens.killTweensOf(b.ear);
    b.ear.setAngle(this._boltEarRest).setPosition(18, -10);
    this.tweens.add({
      targets: b.ear, angle: this._boltEarRest - P.tilt, y: -10 - P.rise,
      duration: P.dur, ease: P.ease, yoyo: true,
      onComplete: () => b.ear.active && b.ear.setAngle(this._boltEarRest).setPosition(18, -10),
    });
  }

  // A11 EXCITED SPIN — a full 360 spin + a little hop on NEW GAME activation, then a
  // clean return to the sit rest pose. Fire-and-forget; never gates the activation.
  boltSpin() {
    const b = this.bolt; if (!b || !b.c.active || b.spinning) return;
    const S = MOTION.BOLT_SPIN;
    b.spinning = true;
    b.excite = 1; // whip the tail up too
    b.c.setAngle(0);
    this.tweens.add({ targets: b.c, angle: 360, duration: S.dur, ease: S.ease,
      onComplete: () => { if (b.c.active) { b.c.setAngle(0); b.spinning = false; } } });
    this.tweens.add({ targets: b.c, y: b.restY - S.hop, duration: S.dur / 2, ease: "quad.out", yoyo: true });
  }

  buildStory(W, cy) {
    this.add.text(W / 2, cy,
      'K.O.B.I. grabbed your robo-puppy BOLT. "NO PETS ALLOWED."\nChase him through the lab — neither of you can do it alone.',
      { fontFamily: FONT, fontSize: FS.body, color: TEXT.body, align: "center", lineSpacing: 6 }
    ).setOrigin(0.5);
  }

  // --- vertical keyboard-driven button stack ----------------------------------
  buildMenu(W, H) {
    const save = loadSave();
    const hasSave = save.unlocked > 1 || totalCores(save) > 0;
    this.hasSave = hasSave;

    const items = [];
    if (hasSave) items.push({ id: "continue", label: "CONTINUE" });
    items.push({ id: "new", label: "NEW GAME" });
    items.push({ id: "tutorial", label: "TUTORIAL" });
    // WALKTHROUGHS: appended LAST so the default cursor position and every
    // existing key-tap sequence (playtest/tut_sanity/campaign) stay valid.
    items.push({ id: "walkthroughs", label: "WALKTHROUGHS" });
    this.menuItems = items;
    this.sel = 0; // CONTINUE when present, else NEW GAME — both default to index 0

    // 4 items (CONTINUE present + WALKTHROUGHS) compact slightly so the stack
    // still clears the footer panel at y540; the 3-item layout is unchanged.
    const compact = items.length > 3;
    const bw = 380, bh = compact ? 44 : 50, gap = compact ? 8 : 12;
    const top = compact ? 354 : 360; // raised ~24px from the old 388; compact clears the footer
    this.menuTop = top;
    this.menuStep = bh + gap;
    items.forEach((it, i) => {
      const y = top + i * (bh + gap);
      const cont = this.add.container(W / 2, y);
      const g = this.add.graphics();
      const label = this.add.text(0, 0, it.label, {
        fontFamily: FONT_DISPLAY, fontSize: FS.title, fontStyle: "bold", color: TEXT.bright,
      }).setOrigin(0.5);
      const chev = this.add.text(-bw / 2 + 26, 0, "▶", {
        fontFamily: FONT, fontSize: FS.lead, color: TEXT.bright,
      }).setOrigin(0.5).setVisible(false);
      cont.add([g, label, chev]);
      it.cont = cont; it.g = g; it.labelObj = label; it.chev = chev; it.bw = bw; it.bh = bh;

      // Mouse/touch: hover highlights the button, click activates it (keyboard +
      // pad still work identically). initAudio() rides the pointer gesture so a
      // mouse-only player also unlocks sound.
      cont.setInteractive({
        hitArea: new Phaser.Geom.Rectangle(-bw / 2, -bh / 2, bw, bh),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true,
      });
      cont.on("pointerover", () => { if (this.sel !== i) { sfx.menuMove(); this.selectIndex(i); } });
      cont.on("pointerup", () => { initAudio(); this.selectIndex(i); this.activate(); });

      // U10 (F6): a small "new!" pip on the TUTORIAL button, shown until the
      // tutorial has been completed ONCE ever (ux-v1 flag). Sits just right of
      // the label; rides inside the container so it scales with selection.
      if (it.id === "tutorial" && !tutorialDone()) {
        const pip = this.add.container(label.width / 2 + 30, -1);
        const pg = this.add.graphics();
        pg.fillStyle(COLORS.magenta, 0.95).fillRoundedRect(-24, -12, 48, 22, 8);
        pg.lineStyle(1.5, 0xffffff, 0.6).strokeRoundedRect(-24, -12, 48, 22, 8);
        const pt = this.add.text(0, -1, "new!", {
          fontFamily: FONT, fontSize: FS.mini, fontStyle: "bold", color: "#fff2d8",
        }).setOrigin(0.5);
        pip.add([pg, pt]);
        cont.add(pip);
        it.pip = pip;
        this.tweens.add({ targets: pip, scale: { from: 0.9, to: 1.08 }, duration: 700, yoyo: true, repeat: -1, ease: "sine.inOut" });
      }
    });

    this.updateMenu();
    this._menuBuilt = true; // GFX3 G2: arm the focus spring only after first paint

    // playtest / introspection surface
    window.__BB = window.__BB || {};
    window.__BB.menu = {
      items: items.map((it) => ({ id: it.id, label: it.label })),
      get sel() { return this._scene.sel; },
      _scene: this,
      select: (i) => this.selectIndex(i),
      activate: () => this.activate(),
      // U10 (F6): is the TUTORIAL "new!" pip currently shown? (probe surface)
      tutorialPip: () => !!this.menuItems.find((x) => x.id === "tutorial")?.pip?.visible,
    };
  }

  // GFX2 "Lumen Lab" (V7): menu buttons are frosted glass. Draw-only (same dims +
  // hit-areas). Selected = warm amber glass + amber glow ring; unselected = cool
  // cyan-rimmed frosted glass. glassPanel supplies fill+sheen+top-lip+border(+glow).
  drawButton(it, selected) {
    const g = it.g;
    const hw = it.bw / 2, hh = it.bh / 2;
    g.clear();
    if (selected) {
      glassPanel(g, {
        x: -hw, y: -hh, w: it.bw, h: it.bh, r: 12,
        fill: 0x2a2010, fillA: 0.92, accent: ACCENT, borderW: 3, borderA: 1,
        glow: true, glowW: 6, glowA: 0.2, glowInf: 4,
      });
    } else {
      glassPanel(g, {
        x: -hw, y: -hh, w: it.bw, h: it.bh, r: 12,
        fill: COLORS.panel, fillA: 0.72, accent: COLORS.neon, borderW: 2, borderA: 0.4,
        glow: false,
      });
    }
  }

  updateMenu() {
    this.menuItems.forEach((it, i) => {
      const on = i === this.sel;
      this.drawButton(it, on);
      this.tweens.killTweensOf(it.cont); // clear any in-flight focus spring
      it.cont.setScale(on ? 1.05 : 1);
      it.chev.setVisible(on);
      it.labelObj.setColor(on ? "#fff2d8" : "#9fb0d6");
    });
    // GFX3 G2: focus spring on the newly selected button — both mouse hover
    // (pointerover → selectIndex) and keyboard/pad (moveSel) land here, so the
    // ONE springFocus drives both. Skipped on the initial build so the menu
    // doesn't pop on load. Base is the selected rest scale (1.05), not 1.
    if (this._menuBuilt) {
      const it = this.menuItems[this.sel];
      if (it) springFocus(this, it.cont);
    }
  }

  // KOBI's corner eye glances toward the currently selected button
  glanceAtSelection() {
    this.kobiGlance(this.scale.width / 2, this.menuTop + this.sel * this.menuStep);
  }

  moveSel(d) {
    const n = this.menuItems.length;
    this.sel = (this.sel + d + n) % n;
    sfx.menuMove();
    this.resetErase();
    this.updateMenu();
    this.glanceAtSelection();
    this.boltMenuReact(); // A11: ear perk + tail-wag speed-up (cosmetic, never gates nav)
  }

  selectIndex(i) {
    if (i < 0 || i >= this.menuItems.length) return;
    this.sel = i;
    this.resetErase();
    this.updateMenu();
    this.glanceAtSelection();
    this.boltMenuReact();
  }

  // A11: Bolt reacts to menu movement — the ear perks and the tail-wag EXCITEMENT
  // is topped up (it decays back to idle in update()). Cosmetic + skippable.
  boltMenuReact() {
    if (this.bolt) this.bolt.excite = 1;
    this.boltPerk();
  }

  resetErase() {
    if (this.eraseTimer) { this.eraseTimer.remove(); this.eraseTimer = null; }
    const ng = this.menuItems.find((it) => it.id === "new");
    if (ng && this.eraseArmed) {
      ng.labelObj.setText("NEW GAME");
      this.eraseArmed = false;
    }
  }

  // Guarded transition to the Hub. GFX4 F4b: routed through the KOBI iris (both
  // tiers — measured to hold >=40fps on Canvas) instead of the plain fade. SAME
  // 250ms duration and the SAME scene.start hand-off (fired on the iris close's
  // completion) so any timing observer sees an identical transition.
  gotoHub() {
    if (this.leaving) return;
    this.leaving = true;
    const cx = this.scale.width / 2, cy = this.scale.height / 2;
    runIris(this, {
      cx, cy, from: irisMaxR(this, cx, cy), to: 0, duration: 250, ease: "sine.in",
      onComplete: () => this.scene.start("Hub"),
    });
  }

  activate() {
    if (this.leaving) return;
    const it = this.menuItems[this.sel];
    if (!it) return;
    if (it.id === "continue") {
      sfx.menuSelect();
      this.gotoHub();
    } else if (it.id === "new") {
      if (!this.hasSave) {
        // U10 (F6): fresh save — route through the KOBI onboarding interstitial
        // BEFORE the hub. (A save that already exists skips this entirely: the
        // erase-confirm branch below still fades straight to the hub.)
        sfx.menuSelect();
        this.boltSpin(); // A11: excited spin on NEW GAME activation (fire-and-forget)
        if (this.leaving) return;
        this.leaving = true;
        this.cameras.main.fadeOut(250, 4, 6, 20);
        this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Onboard"));
        return;
      }
      if (!this.eraseArmed) {
        // first press: arm the kid-proof confirm for 3s
        sfx.menuDeny();
        it.labelObj.setText("erase everything? press again!");
        this.eraseArmed = true;
        this.eraseTimer = this.time.delayedCall(3000, () => {
          it.labelObj.setText("NEW GAME");
          this.eraseArmed = false;
          this.eraseTimer = null;
        });
      } else {
        // second press: wipe and start fresh
        sfx.menuSelect();
        this.boltSpin(); // A11: excited spin on NEW GAME activation (fire-and-forget)
        this.resetErase();
        storeSave({ unlocked: 1, cores: {} });
        this.gotoHub();
      }
    } else if (it.id === "walkthroughs") {
      // WALKTHROUGHS: the manifest-driven level-video grid. No fade guard
      // needed — mirrors the Settings hand-off (scene.start, music keeps going).
      sfx.menuSelect();
      this.scene.start("Walkthroughs");
    } else if (it.id === "tutorial") {
      // Sprint 10: launch the hidden tutorial chamber ("Orientation Day").
      sfx.menuSelect();
      this.leaving = true;
      this.cameras.main.fadeOut(250, 4, 6, 20);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.start("Game", { levelIndex: LEVELS.findIndex((l) => l.tutorial) });
      });
    }
  }

  showToast(msg) {
    if (!this.toast) {
      this.toast = this.add.text(this.scale.width / 2, 690, "", {
        fontFamily: FONT, fontSize: FS.body, fontStyle: "italic", color: TEXT.warn,
      }).setOrigin(0.5).setDepth(5);
    }
    this.toast.setText(msg).setAlpha(1);
    if (this.toastTween) this.toastTween.remove();
    this.toastTween = this.tweens.add({ targets: this.toast, alpha: 0, delay: 2600, duration: 600 });
  }

  // Key-cap chip + centred chip row now live in the shared ui-kit (Settings/Pause
  // hint rows use the exact same chips); these thin wrappers keep the call sites.
  keyCap(x, y, label, colNum, colStr) {
    return kitKeyCap(this, x, y, label, colNum, colStr);
  }

  chipRow(cx, y, items, colNum, colStr) {
    return kitChipRow(this, cx, y, items, colNum, colStr);
  }

  // --- controls footer: key-cap chips + top accent bar ------------------------
  buildFooter(W, H) {
    const pw = 724, ph = 132, px = W / 2 - pw / 2, py = 540;
    const panel = this.add.graphics();
    // shared menu-panel look (accent header bar + soft glow ring)
    neonPanel(panel, px, py, pw, ph, { accent: ACCENT, radius: 12, fillAlpha: 0.82, headerH: 5 });
    // centre divider between the two player columns
    panel.lineStyle(2, COLORS.panelEdge, 0.7).lineBetween(W / 2, py + 20, W / 2, py + 60);

    const beepN = COLORS.beep, beepS = "#4dc9ff";
    const boopN = COLORS.boop, boopS = "#ffa14d";
    const cLeft = px + pw / 4, cRight = px + (pw * 3) / 4;

    this.add.text(cLeft, py + 22, "P1 · BEEP", { fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: beepS }).setOrigin(0.5);
    this.add.text(cRight, py + 22, "P2 · BOOP", { fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: boopS }).setOrigin(0.5);

    this.chipRow(cLeft, py + 52, [
      { k: "A" }, { k: "D" }, { t: "move" }, { k: "W" }, { t: "jump" }, { k: "SPACE" }, { t: "act" },
    ], beepN, beepS);
    this.chipRow(cRight, py + 52, [
      { k: "←" }, { k: "→" }, { t: "move" }, { k: "↑" }, { t: "jump" }, { k: "L" }, { t: "act" },
    ], boopN, boopS);

    // menu navigation hints across the bottom
    this.chipRow(W / 2, py + 86, [
      { k: "↑" }, { k: "↓" }, { t: "move" }, { k: "SPACE" }, { k: "E" }, { k: "L" }, { k: "↵" }, { t: "select" }, { k: "S" }, { t: "settings" },
    ], ACCENT, hexStr(ACCENT));

    // U7 (F13): gamepad-support line — a small drawn pad glyph (Courier can't
    // render 🎮) + label, in the footer's established caption style.
    this.buildGamepadLine(W / 2, py + 114);
  }

  // A tiny controller glyph (rounded body + d-pad cross + two face buttons) drawn
  // to the left of a "GAMEPADS SUPPORTED" caption, centred on (cx, cy).
  buildGamepadLine(cx, cy) {
    const label = "GAMEPADS SUPPORTED";
    const glyphW = 22, gap = 8;
    const txt = this.add.text(0, 0, label, {
      fontFamily: FONT, fontSize: FS.mini, fontStyle: "bold", color: hexStr(ACCENT),
    }).setOrigin(0, 0.5).setAlpha(0.9);
    const total = glyphW + gap + txt.width;
    const gx = cx - total / 2;
    txt.setPosition(gx + glyphW + gap, cy);

    const g = this.add.graphics();
    const bx = gx, by = cy - 7, bw = glyphW, bh = 14;
    g.fillStyle(0x1a2338, 0.95).fillRoundedRect(bx, by, bw, bh, 5);
    g.lineStyle(1.5, ACCENT, 0.9).strokeRoundedRect(bx, by, bw, bh, 5);
    // d-pad cross (left)
    g.fillStyle(ACCENT, 0.9);
    g.fillRect(bx + 5, cy - 1.4, 5, 2.8);
    g.fillRect(bx + 6.3, cy - 2.7, 2.4, 5.4);
    // two face buttons (right)
    g.fillCircle(bx + bw - 7, cy - 2.4, 1.7);
    g.fillCircle(bx + bw - 4, cy + 1.6, 1.7);
  }

  // --- KOBI corner eye: wandering iris that glances at the selected button -----
  buildKobiCorner(W, H) {
    const ex = W - 66, ey = H - 60;
    this.kobiEye = { x: ex, y: ey };
    const eye = this.add.container(ex, ey).setDepth(4);
    const sclera = this.add.graphics();
    // GFX2 "Lumen Lab": armoured housing + magenta glow seam, glassier sclera.
    sclera.fillStyle(0x1a1024, 0.95).fillCircle(0, 0, 26);
    ringGlow(sclera, { x: 0, y: 0, r: 26, color: COLORS.magenta, width: 2 });
    sclera.fillStyle(0xf6f0ff, 0.95).fillCircle(0, 0, 16); // glassy sclera
    sclera.fillStyle(0xffffff, 0.5).fillEllipse(-5, -6, 10, 5); // top-left glass sheen
    // iris as its own container so it can wander / glance within the sclera
    const iris = this.add.container(0, 0);
    const ig = this.add.graphics();
    ig.fillStyle(0xff4dd2, 0.28).fillCircle(0, 0, 11); // deep magenta iris glow
    ig.fillStyle(0xff4dd2, 1).fillCircle(0, 0, 8);
    ig.fillStyle(0x2a0a1e, 1).fillCircle(0, 0, 4);
    ig.fillStyle(0xffffff, 0.9).fillCircle(-2, -3, 2);
    iris.add(ig);
    const lid = this.add.graphics();
    eye.add([sclera, iris, lid]);
    this.kobiIris = iris;
    this.kobiGlancing = false;

    // idle wander: drift the iris to random points inside the sclera
    const wander = () => {
      if (!this.kobiIris) return;
      if (this.kobiGlancing) { this.time.delayedCall(500, wander); return; }
      const a = Math.random() * Math.PI * 2, r = Math.random() * 7;
      this.tweens.add({
        targets: iris, x: Math.cos(a) * r, y: Math.sin(a) * r, duration: 900, ease: "sine.inOut",
        onComplete: () => this.time.delayedCall(500 + Math.random() * 1000, wander),
      });
    };
    this.time.delayedCall(900, wander);

    // blink using an eyelid wipe
    const blink = () => {
      this.tweens.add({
        targets: { h: 0 }, h: 27, duration: 90, yoyo: true,
        onUpdate: (tw, tgt) => {
          lid.clear();
          lid.fillStyle(0x1a1024, 1).fillRect(-27, -27, 54, tgt.h);
          lid.fillRect(-27, 27 - tgt.h, 54, tgt.h);
        },
        onComplete: () => lid.clear(),
      });
      this.time.delayedCall(1600 + Math.random() * 2600, blink);
    };
    this.time.delayedCall(1200 + Math.random() * 1500, blink);

    // A11: a RARE bored eye-roll idle — the iris rolls a full lazy loop (KOBI is
    // unimpressed you haven't picked yet). Keeps the P1 glance-at-selection intact;
    // this only fires while idle (not mid-glance) on a long, jittered cadence.
    this._eyeRoll = { a: 0 };
    const E = MOTION.EYE_ROLL;
    const scheduleRoll = () => {
      this.eyeRollTimer = this.time.delayedCall(E.minGap + Math.random() * E.jitter, () => {
        if (this.kobiIris && !this.kobiGlancing) this.boredEyeRoll();
        scheduleRoll();
      });
    };
    scheduleRoll();

    this.add.text(ex - 40, ey - 40, "K.O.B.I.\nKeeper Of\nBuilding Integrity", {
      fontFamily: FONT, fontSize: FS.tiny, fontStyle: "italic", color: "#c98fd9", align: "right",
    }).setOrigin(1, 0.5);
  }

  // A11: bored eye-roll — the iris sweeps one lazy full circle inside the sclera,
  // then settles back to centre and resumes wandering. Blocks the wander/glance for
  // its duration via kobiGlancing (cosmetic; never touches menu logic).
  boredEyeRoll() {
    if (!this.kobiIris) return;
    const E = MOTION.EYE_ROLL;
    this.kobiGlancing = true;
    this.tweens.killTweensOf(this.kobiIris);
    this._eyeRoll.a = -Math.PI / 2; // start at the top
    this.tweens.add({
      targets: this._eyeRoll, a: -Math.PI / 2 + Math.PI * 2, duration: E.dur, ease: E.ease,
      onUpdate: () => {
        if (!this.kobiIris) return;
        this.kobiIris.x = Math.cos(this._eyeRoll.a) * E.r;
        this.kobiIris.y = Math.sin(this._eyeRoll.a) * E.r;
      },
      onComplete: () => {
        if (!this.kobiIris) return;
        this.tweens.add({
          targets: this.kobiIris, x: 0, y: 0, duration: 220, ease: "sine.inOut",
          onComplete: () => this.time.delayedCall(300, () => { this.kobiGlancing = false; }),
        });
      },
    });
  }

  // Snap the iris toward a world point for a beat, then resume wandering.
  kobiGlance(tx, ty) {
    if (!this.kobiIris) return;
    const dx = tx - this.kobiEye.x, dy = ty - this.kobiEye.y;
    const d = Math.hypot(dx, dy) || 1;
    const r = 8;
    this.kobiGlancing = true;
    this.tweens.add({
      targets: this.kobiIris, x: (dx / d) * r, y: (dy / d) * r, duration: 180, ease: "back.out",
      onComplete: () => this.time.delayedCall(650, () => { this.kobiGlancing = false; }),
    });
  }
}
