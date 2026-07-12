// Bolt Buddies — EPILOGUE + CREDITS (W3W4 L43, the campaign ending).
//
// GAME_DESIGN §4-3 / §6 Ending: "Bolt rescued, KOBI reformed and adopted.
// All-ages, reunion over punishment. Epilogue playground scene + credits."
// The narrative spine's close: the family takes BOTH robots home.
//
// A lightweight, self-contained scene in the TitleScene-cinematic mold: all
// art is DRAWN (Canvas-safe, no new boot textures beyond the robot sprites
// that already exist), all motion is pooled tweens. It is reached ONLY from
// the 4-3 clear overlay's continue (UIScene routes finale -> here), so the
// finishLevel timing contract is untouched.
//
// STRAND-PROOF BY CONSTRUCTION (softlock scenario 4-3-epilogue-cant-strand):
// three phases — "story" (timed caption beats), "credits" (auto-scroll),
// "end" ("press ACTION"). EVERY phase both AUTO-ADVANCES on its own timer and
// advances on ANY key / any pad button, and "end" exits to Title on any key —
// so the scene can never hold a player: at most 6 presses (or ~65s of
// patience) from any point reach the Title. Probe surface: __BB.epilogue.
import Phaser from "phaser";
import { COLORS, FONT, FS, TEXT } from "../constants.js";
import { initAudio, sfx, playTrack, installMute } from "../audio.js";
import { pads } from "../pad.js";

const CAPTIONS = [
  "The lab got very, very quiet after that.",
  "So the family took BOTH robots home.\n(Both. KOBI counted. Twice.)",
  "Bolt got a yard, a ball, and two robots who throw it.\nKOBI got a new job: NIGHT-LIGHT.",
  '"NO DARK ALLOWED. It is rule one.\nIt is the only rule I need now."',
];
const CAPTION_MS = 5200; // per caption beat before auto-advance

const CREDITS = [
  ["BOLT BUDDIES", "title"],
  ["a DYNACORE LABS rescue, in 12 chambers", "sub"],
  ["", ""],
  ["DESIGN", "THE FAMILY"],
  ["CODE", "BEEP & BOOP"],
  ["MUSIC", 'K.O.B.I. LABS — "Keeper Of Beautiful Instrumentals"'],
  ["LEVELS", "WINGS 1-4 BUILD CREW"],
  ["SECURITY", "K.O.B.I. (retired — adopted)"],
  ["PUPPY", "BOLT, as himself"],
  ["SPECIAL THANKS", "every toaster that believed"],
  ["PLAYED BY", "P1 & P2"],
  ["", ""],
  ["thanks for playing!", "sub"],
];
const CREDITS_MS = 16000; // full scroll duration (any key skips)

export default class EpilogueScene extends Phaser.Scene {
  constructor() {
    super("Epilogue");
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.phase = "story";
    this.capIdx = 0;
    this.leaving = false;
    this.cameras.main.fadeIn(600, 4, 6, 20);

    this.buildNight(W, H);      // sky / stars / moon / yard
    this.buildPlayground(W, H); // swing, slide, seesaw silhouettes
    this.buildHouse(W, H);      // the family's house + KOBI the night-light
    this.buildCast(W, H);       // Beep, Boop, Bolt at play

    // caption plate (bottom third, blip-bar styling)
    const cy = H - 96;
    const cg = this.add.graphics().setDepth(20);
    cg.fillStyle(COLORS.hudBg, 0.88).fillRoundedRect(W / 2 - 430, cy - 44, 860, 88, 10);
    cg.lineStyle(2, 0xffb347, 0.55).strokeRoundedRect(W / 2 - 430, cy - 44, 860, 88, 10);
    this.capPlate = cg;
    this.capText = this.add.text(W / 2, cy, "", {
      fontFamily: FONT, fontSize: FS.head, color: "#ffe9c9", align: "center", lineSpacing: 6,
    }).setOrigin(0.5).setDepth(21);
    this.hint = this.add.text(W / 2, H - 26, "any key: next  ·  it always leads home", {
      fontFamily: FONT, fontSize: FS.mini, color: TEXT.faint,
    }).setOrigin(0.5).setDepth(21);

    // credits roll container (hidden until the credits phase)
    this.buildCredits(W, H);

    // the gentle epilogue motif (crossfades from the clear-jingle silence)
    playTrack("epilogue");
    installMute(this);

    this.showCaption(0);
    this.capTimer = this.time.addEvent({ delay: CAPTION_MS, loop: true, callback: () => this.advance(true) });

    this.input.keyboard.on("keydown", () => { initAudio(); this.advance(false); });

    // probe surface (read-only; skip() mirrors one keypress)
    window.__BB = window.__BB || {};
    window.__BB.epilogue = {
      _scene: this,
      get phase() { return this._scene.phase; },
      get caption() { return this._scene.capIdx; },
    };
  }

  update(time, delta) {
    // U7: any pad button advances too — pad-only players are never stranded
    pads.poll(time);
    if (pads.anyButtonJust()) { initAudio(); this.advance(false); }
    // fireflies drift (cheap deterministic sines — no alloc)
    if (this.flies) {
      for (let i = 0; i < this.flies.length; i++) {
        const f = this.flies[i];
        f.img.setPosition(f.x + Math.sin(time / 900 + i * 2.1) * 26, f.y + Math.sin(time / 700 + i * 1.3) * 14);
        f.img.setAlpha(0.35 + 0.45 * Math.abs(Math.sin(time / 500 + i)));
      }
    }
  }

  // One advance step — from a timer (auto) or any key/button (skip). Every
  // phase progresses toward Title; nothing can loop or dead-end.
  advance(auto) {
    if (this.leaving) return;
    if (this.phase === "story") {
      if (this.capIdx < CAPTIONS.length - 1) {
        this.showCaption(this.capIdx + 1);
        if (!auto) sfx.menuMove();
        if (this.capTimer) this.capTimer.reset({ delay: CAPTION_MS, loop: true, callback: () => this.advance(true) });
      } else {
        this.startCredits();
      }
      return;
    }
    if (this.phase === "credits") {
      // a keypress skips the scroll to its end pose; the auto path arrives
      // there on its own tween-complete
      if (!auto) {
        this.tweens.killTweensOf(this.creditsCont);
        this.creditsCont.y = this.creditsEndY;
        this.endPhase();
      }
      return;
    }
    // phase "end": any key (auto never fires here) -> Title
    if (!auto) this.exitToTitle();
  }

  showCaption(i) {
    this.capIdx = i;
    this.capText.setText(CAPTIONS[i]);
    this.capText.setAlpha(0);
    this.tweens.add({ targets: this.capText, alpha: 1, duration: 420 });
  }

  startCredits() {
    this.phase = "credits";
    sfx.menuSelect();
    if (this.capTimer) { this.capTimer.remove(); this.capTimer = null; }
    this.capPlate.setVisible(false);
    this.capText.setVisible(false);
    // the skip hint moves to the corner so the roll never scrolls over it
    this.hint.setText("any key: skip").setPosition(110, this.scale.height - 26).setDepth(26);
    this.creditsCont.setVisible(true);
    this.tweens.add({
      targets: this.creditsCont, y: this.creditsEndY, duration: CREDITS_MS, ease: "linear",
      onComplete: () => this.endPhase(),
    });
  }

  endPhase() {
    if (this.phase === "end") return;
    this.phase = "end";
    this.hint.setText("");
    const W = this.scale.width, H = this.scale.height;
    this.endPrompt = this.add.text(W / 2, H - 60, "THE END  ·  press ACTION to head home", {
      fontFamily: FONT, fontSize: FS.lead, fontStyle: "bold", color: "#ffe9c9",
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: this.endPrompt, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
  }

  exitToTitle() {
    if (this.leaving) return;
    this.leaving = true;
    sfx.menuSelect();
    this.cameras.main.fadeOut(500, 4, 6, 20);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Title"));
  }

  // --- the playground night (all drawn, deterministic) ------------------------
  buildNight(W, H) {
    const g = this.add.graphics().setDepth(0);
    // dusk gradient: banded fills (canvas-safe fake gradient)
    const top = [0x0b1030, 0x141a44, 0x232156, 0x3a2a5e];
    top.forEach((c, i) => g.fillStyle(c, 1).fillRect(0, (H * 0.62 * i) / 4, W, (H * 0.62) / 4 + 2));
    g.fillStyle(0x4a3560, 1).fillRect(0, H * 0.62, W, H * 0.1); // horizon haze
    // stars (seeded)
    let seed = 43;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 70; i++) {
      g.fillStyle(0xeaf2ff, 0.25 + rnd() * 0.6).fillCircle(rnd() * W, rnd() * H * 0.5, rnd() < 0.15 ? 1.6 : 1);
    }
    // the moon
    g.fillStyle(0xfff3d0, 0.95).fillCircle(W - 180, 110, 34);
    g.fillStyle(0xe8d8ac, 0.5).fillCircle(W - 192, 102, 7).fillCircle(W - 168, 122, 5);
    // the yard: grass bands
    g.fillStyle(0x14351f, 1).fillRect(0, H * 0.7, W, H * 0.3);
    g.fillStyle(0x0e2917, 1).fillRect(0, H * 0.82, W, H * 0.18);
    // fireflies (drifted in update)
    this.flies = [];
    for (let i = 0; i < 6; i++) {
      const img = this.add.graphics({ x: 0, y: 0 }).setDepth(6);
      img.fillStyle(0xffe066, 0.9).fillCircle(0, 0, 2.2);
      img.fillStyle(0xffe066, 0.25).fillCircle(0, 0, 5);
      this.flies.push({ img, x: 120 + i * (W - 240) / 5, y: H * 0.6 + (i % 3) * 40 });
    }
  }

  buildPlayground(W, H) {
    const g = this.add.graphics().setDepth(2);
    const ink = 0x101a2e, edge = 0x2b3a63;
    const base = H * 0.74;
    // swing set (left)
    g.lineStyle(6, ink, 1);
    g.lineBetween(120, base, 170, base - 120);
    g.lineBetween(220, base, 170, base - 120);
    g.lineBetween(170, base - 120, 330, base - 120);
    g.lineBetween(330, base - 120, 300, base);
    g.lineBetween(330, base - 120, 380, base);
    g.lineStyle(2.5, edge, 1);
    g.lineBetween(230, base - 116, 230, base - 34);
    g.lineBetween(262, base - 116, 262, base - 34);
    g.fillStyle(ink, 1).fillRect(224, base - 34, 44, 7); // the seat
    // slide (right of the swing)
    g.fillStyle(ink, 1);
    g.fillRect(430, base - 86, 10, 86); // ladder post
    g.fillTriangle(440, base - 86, 560, base, 440, base); // the chute wedge
    g.lineStyle(2.5, edge, 1).lineBetween(440, base - 86, 560, base);
    for (let y = base - 76; y < base - 8; y += 14) g.lineStyle(2, edge, 0.8).lineBetween(430, y, 440, y);
    // seesaw
    g.fillStyle(ink, 1).fillTriangle(660, base, 700, base, 680, base - 26);
    g.lineStyle(5, ink, 1).lineBetween(610, base - 12, 750, base - 40);
  }

  buildHouse(W, H) {
    const g = this.add.graphics().setDepth(3);
    const base = H * 0.76;
    const hx = W - 340;
    // the house silhouette + warm windows
    g.fillStyle(0x131a30, 1).fillRect(hx, base - 170, 250, 170);
    g.fillStyle(0x0e1426, 1).fillTriangle(hx - 22, base - 170, hx + 272, base - 170, hx + 125, base - 240);
    g.fillStyle(0xffd9a0, 0.95).fillRect(hx + 34, base - 130, 40, 34);
    g.fillStyle(0xffc880, 0.9).fillRect(hx + 176, base - 130, 40, 34);
    g.lineStyle(2, 0x131a30).lineBetween(hx + 54, base - 130, hx + 54, base - 96);
    // the door + porch
    g.fillStyle(0x241a10, 1).fillRect(hx + 105, base - 74, 44, 74);
    g.fillStyle(0x1a2338, 1).fillRect(hx - 30, base, 310, 10);
    // KOBI, adopted: the little eye-bot on the porch — the NIGHT-LIGHT. His
    // side light glows warm now (magenta duty -> amber home).
    const kx = hx + 190, ky = base - 18;
    const k = this.add.graphics({ x: kx, y: ky }).setDepth(4);
    k.fillStyle(0x1a1024, 1).fillCircle(0, 0, 20);
    k.lineStyle(2.5, 0xffb347, 0.95).strokeCircle(0, 0, 20); // his ring, gone warm
    k.fillStyle(0xf6f0ff, 0.95).fillCircle(0, 0, 13);
    k.fillStyle(0xff4dd2, 1).fillCircle(2, 1, 6); // the iris — content, half-lidded
    k.fillStyle(0x1a1024, 1).fillRect(-14, -14, 28, 9); // sleepy lid
    k.fillStyle(0x2a3350, 1).fillRect(-10, 18, 20, 6); // his little base
    // the night-light pool he casts over the porch
    const pool = this.add.graphics({ x: kx, y: ky + 8 }).setDepth(3);
    pool.fillStyle(0xffd9a0, 0.13).fillEllipse(0, 16, 150, 40);
    pool.fillStyle(0xffd9a0, 0.1).fillCircle(0, 0, 34);
    this.tweens.add({ targets: pool, alpha: { from: 0.7, to: 1 }, duration: 1600, yoyo: true, repeat: -1, ease: "sine.inOut" });
    this.add.text(kx, ky - 44, "NIGHT-LIGHT\nON DUTY", {
      fontFamily: FONT, fontSize: FS.tiny, fontStyle: "italic", color: "#c98fd9", align: "center",
    }).setOrigin(0.5).setDepth(4);
  }

  buildCast(W, H) {
    const base = H * 0.76;
    // floor shadows
    const sh = this.add.graphics().setDepth(4);
    [[W * 0.28, 0], [W * 0.40, 0], [W * 0.345, 26]].forEach(([x, dy]) => {
      sh.fillStyle(0x000000, 0.35).fillEllipse(x, base + 6 + dy * 0, 64, 12);
    });
    // Beep & Boop (the boot sprites), playing fetch
    const beep = this.add.image(W * 0.28, base - 24, "robot_b").setScale(1.4).setDepth(5);
    const boop = this.add.image(W * 0.40, base - 24, "robot_o").setScale(1.4).setDepth(5).setFlipX(true);
    this.tweens.add({ targets: beep, y: base - 32, duration: 850, yoyo: true, repeat: -1, ease: "sine.inOut" });
    this.tweens.add({ targets: boop, y: base - 30, duration: 780, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 200 });
    // the ball, lobbed between them forever
    const ball = this.add.graphics({ x: W * 0.3, y: base - 60 }).setDepth(5);
    ball.fillStyle(0xffb347, 1).fillCircle(0, 0, 6);
    ball.fillStyle(0xfff6d8, 0.9).fillCircle(-2, -2, 2);
    const b0 = W * 0.295, b1 = W * 0.385;
    const arc = { t: 0 };
    this.tweens.add({
      targets: arc, t: 1, duration: 1300, yoyo: true, repeat: -1, ease: "linear",
      onUpdate: () => {
        ball.x = b0 + (b1 - b0) * arc.t;
        ball.y = base - 52 - Math.sin(arc.t * Math.PI) * 70;
      },
    });
    // Bolt, mid-chase under the ball — the finale's bolt_pup silhouette is a
    // GameScene texture (may not exist if the player deep-linked here), so he
    // is drawn (the title vocabulary), tail wagging
    const bolt = this.add.container(W * 0.345, base - 8).setDepth(5);
    const bg = this.add.graphics();
    const body = 0xd9dee8, dark = 0x8b93a8;
    bg.fillStyle(dark);
    [-14, -4, 8, 16].forEach((lx) => bg.fillRoundedRect(lx, 4, 6, 8, 2));
    bg.fillStyle(body).fillRoundedRect(-18, -10, 36, 16, 7);
    bg.fillStyle(body).fillCircle(-15, -4, 8);
    bg.fillStyle(body).fillCircle(20, -12, 9);
    bg.fillStyle(body).fillRoundedRect(26, -12, 11, 8, 3);
    bg.fillStyle(dark).fillCircle(37, -8, 2);
    bg.fillStyle(0x243046).fillCircle(23, -13, 2.4);
    bg.fillStyle(0xffb347).fillRect(10, -10, 3, 16);
    bg.fillStyle(dark).fillTriangle(14, -22, 20, -20, 17, -12);
    const tail = this.add.graphics({ x: -17, y: -6 });
    tail.fillStyle(body).fillRoundedRect(-2.5, -13, 5, 14, 2.5);
    tail.fillStyle(0xffb347).fillCircle(0, -13, 3);
    tail.setAngle(28);
    bolt.add([bg, tail]);
    this.tweens.add({ targets: tail, angle: { from: 16, to: 46 }, duration: 200, yoyo: true, repeat: -1, ease: "sine.inOut" });
    this.tweens.add({ targets: bolt, x: "+=46", duration: 1300, yoyo: true, repeat: -1, ease: "sine.inOut" });
    this.tweens.add({ targets: bolt, y: base - 16, duration: 320, yoyo: true, repeat: -1, ease: "quad.out" });
  }

  buildCredits(W, H) {
    const cont = this.add.container(0, H).setVisible(false).setDepth(25);
    const dim = this.add.rectangle(W / 2, H * 2, W, H * 4, 0x02040a, 0.55);
    cont.add(dim);
    let y = 40;
    for (const [a, b] of CREDITS) {
      if (a === "" && b === "") { y += 26; continue; }
      if (b === "title") {
        cont.add(this.add.text(W / 2, y, a, { fontFamily: FONT, fontSize: FS.h2, fontStyle: "bold", color: "#ffe9c9" }).setOrigin(0.5));
        y += 62;
      } else if (b === "sub") {
        cont.add(this.add.text(W / 2, y, a, { fontFamily: FONT, fontSize: FS.head, color: TEXT.dim }).setOrigin(0.5));
        y += 44;
      } else {
        cont.add(this.add.text(W / 2 - 20, y, a, { fontFamily: FONT, fontSize: FS.body, fontStyle: "bold", color: "#ffb347" }).setOrigin(1, 0.5));
        cont.add(this.add.text(W / 2 + 20, y, b, { fontFamily: FONT, fontSize: FS.body, color: TEXT.body }).setOrigin(0, 0.5));
        y += 34;
      }
    }
    cont.add(this.add.text(W / 2, y + 30, "♥", { fontFamily: FONT, fontSize: FS.h3, color: "#ff4dd2" }).setOrigin(0.5));
    this.creditsCont = cont;
    this.creditsH = y + 90;
    // the scroll parks with the tail block centred — the "end pose"
    this.creditsEndY = H / 2 - this.creditsH + 60;
  }
}
