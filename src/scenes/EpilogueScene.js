// Bolt Buddies — EPILOGUE + CREDITS (W3W4 L43, the campaign ending).
//
// GAME_DESIGN §4-3 / §6 Ending: "Bolt rescued, KOBI reformed and adopted.
// All-ages, reunion over punishment. Epilogue playground scene + credits."
// The narrative spine's close: the family takes BOTH robots home.
//
// FIN-B: a 7-page narrated STORYBOOK (FINALE_BIBLE END-01..END-18) told in two
// voices — a warm NARRATOR plate and KOBI's magenta duet lines — followed by
// the credits roll and a post-credits sting (END-19). Every caption is VO-wired
// through playForText (missing clip = silent; the caption always shows).
//
// A lightweight, self-contained scene in the TitleScene-cinematic mold: all
// art is DRAWN (Canvas-safe, no new boot textures beyond the robot sprites
// that already exist), all motion is pooled tweens. It is reached ONLY from
// the 4-3 clear overlay's continue (UIScene routes finale -> here), so the
// finishLevel timing contract is untouched.
//
// STRAND-PROOF BY CONSTRUCTION (softlock scenario 4-3-epilogue-cant-strand):
// three phases — "story" (7 timed storybook pages), "credits" (auto-scroll,
// then the timed post-credits sting), "end" ("press ACTION"). EVERY beat both
// AUTO-ADVANCES on its own timer and advances on ANY key / any pad button, and
// "end" exits to Title on any key — so the scene can never hold a player: a
// bounded number of presses (~21) or ~75s of patience reaches the Title from
// any point. Probe surface: __BB.epilogue ({phase, page, caption}).
import Phaser from "phaser";
import { COLORS, FONT, FS, TEXT } from "../constants.js";
import { initAudio, sfx, playTrack, installMute, playForText } from "../audio.js";
import { pads } from "../pad.js";
import { glassPanel, specular, fakeRadial, ringGlow } from "../ui/paint.js";

// The storybook. Seven pages, each a drawn scene plus its END- caption beats
// (FINALE_BIBLE "Epilogue pages" — lines verbatim; \n is layout only, the VO
// key normalizer collapses whitespace). who: "KOBI" | "NARR". ms: per-beat
// auto-advance, tuned so each PAGE holds ~5-8s.
const PAGES = [
  { // E1 THE WALK HOME — night street, streetlamps; KOBI rides Bolt
    build: "pageWalkHome", night: true,
    beats: [
      { who: "KOBI", ms: 2500, text: "HELLO, LAMP. You are doing GREAT." },
      { who: "KOBI", ms: 2500, text: "Seventeen stars so far. Eighteen.\nI am counting them ALL." },
      { who: "NARR", ms: 2500, text: "It was a long walk.\nKOBI narrated every step." },
    ],
  },
  { // E2 PLAYGROUND NIGHT — the existing playground + cast, elevated
    build: "pagePlayground", night: true,
    beats: [
      { who: "NARR", ms: 2500, text: "They stopped to play.\nSome things can't wait for morning." },
      { who: "KOBI", ms: 2500, text: "GOOD CATCH. I saw it FIRST.\nI see everything." },
      { who: "KOBI", ms: 2500, text: "This is better than a hallway." },
    ],
  },
  { // E3 DAWN — hilltop, the sun comes up on KOBI for the first time
    build: "pageDawn", night: false,
    beats: [
      { who: "KOBI", ms: 2500, text: "Who turned on the BIG LIGHT." },
      { who: "KOBI", ms: 2500, text: "...Leave it on." },
      { who: "NARR", ms: 2500, text: "It was KOBI's first morning.\nHe gave it five stars." },
    ],
  },
  { // E4 THE ADOPTION — porch, warm door light, the kid kneeling
    build: "pageAdoption", night: false,
    beats: [
      { who: "NARR", ms: 3200, text: "So the family took BOTH robots home.\n(Both. KOBI counted. Twice.)" },
      { who: "KOBI", ms: 3200, text: "I accept this position.\nI have QUESTIONS about the yard." },
    ],
  },
  { // E5 CALLBACK GAG — bedtime; the kid reads KOBI's own manual to him
    build: "pageManual", night: false,
    beats: [
      { who: "KOBI", ms: 2500, text: "Do NOT read my— ...is that CHAPTER ONE?" },
      { who: "NARR", ms: 2500, text: "Chapter One:\nEvery system needs a friend." },
      { who: "KOBI", ms: 2500, text: "I skipped that chapter too.\nRead it again." },
    ],
  },
  { // E6 NIGHT-LIGHT — the existing house/KOBI-night-light beat
    build: "pageNightLight", night: true,
    beats: [
      { who: "NARR", ms: 3200, text: "Bolt got a yard, a ball, and two robots who throw it.\nKOBI got a new job: NIGHT-LIGHT." },
      { who: "KOBI", ms: 3200, text: "NO DARK ALLOWED. It is rule one.\nIt is the only rule I need now." },
    ],
  },
  { // E7 FINAL BUTTON — pull-out to one glowing window
    build: "pageFinal", night: true,
    beats: [
      { who: "KOBI", ms: 3600, text: "Guard duty report: everyone is safe.\nEspecially me." },
      { who: "NARR", ms: 3600, text: "THE END. (KOBI checked. Twice.)" },
    ],
  },
];

// Flattened beat list (the probe's `caption` index walks this).
const BEATS = [];
PAGES.forEach((p, pi) => p.beats.forEach((b) => BEATS.push({ page: pi, ...b })));

// POST-CREDITS sting (END-19) — plays after the roll, before the end card.
const STING = {
  who: "KOBI", ms: 6500,
  text: "You are still here? The game is OVER.\nGo to bed. ...I will leave this on for you.",
};

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
    this.pageIdx = -1;
    this.stingOn = false;
    this.leaving = false;
    this.capTimer = null;
    this.cameras.main.fadeIn(600, 4, 6, 20);

    this.buildNight(W, H); // the shared night sky (E1/E2/E6/E7 live under it)

    // one container per storybook page — built once, toggled per page
    this.pages = PAGES.map((p) => {
      const cont = this.add.container(0, 0).setVisible(false).setDepth(3);
      this[p.build](W, H, cont);
      return cont;
    });
    this.buildSting(W, H);

    // caption plate (bottom third, blip-bar styling; repainted per speaker)
    const cy = H - 96;
    this.plateGeom = { x: W / 2 - 430, y: cy - 44, w: 860, h: 88 };
    this.capPlate = this.add.graphics().setDepth(20);
    this.speakerTag = this.add.text(W / 2 - 416, cy - 50, "", {
      fontFamily: FONT, fontSize: FS.tiny, fontStyle: "bold italic", color: "#ffcf9a",
    }).setOrigin(0, 1).setDepth(21);
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

    this.showBeat(0);

    this.input.keyboard.on("keydown", () => { initAudio(); this.advance(false); });

    // probe surface (read-only)
    window.__BB = window.__BB || {};
    window.__BB.epilogue = {
      _scene: this,
      get phase() { return this._scene.phase; },
      get page() { return this._scene.pageIdx; },
      get caption() { return this._scene.capIdx; },
    };
  }

  update(time, delta) {
    // U7: any pad button advances too — pad-only players are never stranded
    pads.poll(time);
    if (pads.anyButtonJust()) { initAudio(); this.advance(false); }
    // fireflies drift (cheap deterministic sines — no alloc; night pages only)
    if (this.flies) {
      for (let i = 0; i < this.flies.length; i++) {
        const f = this.flies[i];
        f.img.setPosition(f.x + Math.sin(time / 900 + i * 2.1) * 26, f.y + Math.sin(time / 700 + i * 1.3) * 14);
        f.img.setAlpha(0.35 + 0.45 * Math.abs(Math.sin(time / 500 + i)));
      }
    }
  }

  // One advance step — from a timer (auto) or any key/button (skip). Every
  // phase progresses monotonically toward Title; nothing can loop or dead-end.
  advance(auto) {
    if (this.leaving) return;
    if (this.phase === "story") {
      if (this.capIdx < BEATS.length - 1) {
        this.showBeat(this.capIdx + 1);
        if (!auto) sfx.menuMove();
      } else {
        this.startCredits();
      }
      return;
    }
    if (this.phase === "credits") {
      // auto arrivals are driven by the scroll's own tween-complete and the
      // sting's timer; a keypress skips forward one stop (scroll -> sting ->
      // end card) so nothing is ever more than two presses deep
      if (auto) return;
      if (!this.stingOn) {
        this.tweens.killTweensOf(this.creditsCont);
        this.creditsCont.y = this.creditsEndY;
        this.startSting();
      } else {
        this.endPhase();
      }
      return;
    }
    // phase "end": any key (auto never fires here) -> Title
    if (!auto) this.exitToTitle();
  }

  // --- the storybook driver ----------------------------------------------------
  showBeat(i) {
    const b = BEATS[i];
    this.capIdx = i;
    if (b.page !== this.pageIdx) this.showPage(b.page);
    this.paintPlate(b.who);
    this.capText.setText(b.text).setColor(b.who === "KOBI" ? "#ffd6f4" : "#ffe9c9").setAlpha(0);
    this.tweens.add({ targets: this.capText, alpha: 1, duration: 420 });
    this.speak(b.text);
    this.armTimer(b.ms);
  }

  showPage(p) {
    this.pageIdx = p;
    for (let i = 0; i < this.pages.length; i++) this.pages[i].setVisible(i === p);
    // the shared sky's fireflies only belong on the night pages
    const night = !!PAGES[p].night;
    if (this.flies) for (const f of this.flies) f.img.setVisible(night);
    // page-entry flourishes (kept here so they run when SEEN, not at build)
    if (p === 2 && this.dawnSun) { // E3: the sun rises across the page
      this.dawnSun.y = this.scale.height * 0.66;
      this.tweens.add({ targets: this.dawnSun, y: this.scale.height * 0.5, duration: 6800, ease: "sine.out" });
    }
    if (p === 6 && this.finalInner) { // E7: the pull-out settle
      this.finalInner.setScale(1.14);
      this.tweens.add({ targets: this.finalInner, scale: 1, duration: 3200, ease: "sine.out" });
    }
  }

  // Two voices: NARRATOR keeps the warm amber plate; KOBI's lines go magenta.
  paintPlate(who) {
    const { x, y, w, h } = this.plateGeom;
    const kobi = who === "KOBI";
    const cg = this.capPlate;
    cg.clear();
    // frosted glass plate — KOBI magenta glass / NARR warm glass (same geometry)
    glassPanel(cg, {
      x, y, w, h, r: 10,
      fill: kobi ? 0x1a0f22 : COLORS.hudBg, fillA: 0.88,
      accent: kobi ? 0xff4dd2 : 0xffb347, borderA: kobi ? 0.65 : 0.55,
      glowA: kobi ? 0.16 : 0.12, sheenA: 0.045,
    });
    this.speakerTag.setText(kobi ? "K.O.B.I." : "NARRATOR").setColor(kobi ? "#ff8fe6" : "#ffcf9a");
  }

  // VO hook: registered clips speak the line; a missing clip is a silent no-op
  // and must never break the storybook (guards both sync throws + rejections).
  speak(text) {
    try {
      const p = playForText(text);
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (e) { /* no voice for this line — the caption carries it */ }
  }

  armTimer(ms) {
    if (this.capTimer) this.capTimer.remove(false);
    this.capTimer = this.time.delayedCall(ms, () => this.advance(true));
  }

  clearTimer() {
    if (this.capTimer) { this.capTimer.remove(false); this.capTimer = null; }
  }

  // --- credits + sting + end ---------------------------------------------------
  startCredits() {
    this.phase = "credits";
    sfx.menuSelect();
    this.clearTimer();
    this.capPlate.setVisible(false);
    this.capText.setVisible(false);
    this.speakerTag.setVisible(false);
    // the skip hint moves to the corner so the roll never scrolls over it
    this.hint.setText("any key: skip").setPosition(110, this.scale.height - 26).setDepth(26);
    this.creditsCont.setVisible(true);
    this.tweens.add({
      targets: this.creditsCont, y: this.creditsEndY, duration: CREDITS_MS, ease: "linear",
      onComplete: () => this.startSting(),
    });
  }

  // POST-CREDITS: END-19 — KOBI gets the last word, on his own timer, so the
  // auto path still walks itself to the end card.
  startSting() {
    if (this.stingOn || this.phase !== "credits") return;
    this.stingOn = true;
    this.clearTimer();
    this.creditsCont.setVisible(false);
    this.stingCont.setVisible(true);
    this.hint.setText("any key: goodnight").setPosition(110, this.scale.height - 26);
    this.capPlate.setVisible(true);
    this.capText.setVisible(true);
    this.speakerTag.setVisible(true);
    this.paintPlate(STING.who);
    this.capText.setText(STING.text).setColor("#ffd6f4").setAlpha(0);
    this.tweens.add({ targets: this.capText, alpha: 1, duration: 420 });
    this.speak(STING.text);
    this.capTimer = this.time.delayedCall(STING.ms, () => this.endPhase());
  }

  endPhase() {
    if (this.phase === "end") return;
    this.phase = "end";
    this.clearTimer();
    this.hint.setText("");
    this.capPlate.setVisible(false);
    this.capText.setVisible(false);
    this.speakerTag.setVisible(false);
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
    // FIN-C: the epilogue is only ever reached from the finale, so the way out
    // leads into the earned COMPLETION REWARD (medal -> album -> share card),
    // which itself exits to the Title on the same strand-proof contract.
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Reward"));
  }

  // --- shared drawn-cast helpers -----------------------------------------------
  // Bolt, the title-vocabulary silhouette (the bolt_pup texture is a GameScene
  // texture that may not exist if the player deep-linked here) — tail wagging.
  makeBolt(parent, x, y, opts = {}) {
    const body = opts.body !== undefined ? opts.body : 0xd9dee8;
    const dark = opts.dark !== undefined ? opts.dark : 0x8b93a8;
    const accent = opts.accent !== undefined ? opts.accent : 0xffb347;
    const bolt = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(dark);
    [-14, -4, 8, 16].forEach((lx) => bg.fillRoundedRect(lx, 4, 6, 8, 2));
    // body / haunch / head — same silhouette, now with soft 4-tone shading
    bg.fillStyle(body).fillRoundedRect(-18, -10, 36, 16, 7);
    bg.fillStyle(body).fillCircle(-15, -4, 8);
    bg.fillStyle(body).fillCircle(20, -12, 9);
    bg.fillStyle(body).fillRoundedRect(26, -12, 11, 8, 3);
    // under-shade hugging the belly + haunch, then a soft top-light sheen
    bg.fillStyle(dark, 0.4).fillEllipse(-2, 3, 32, 8);
    bg.fillStyle(dark, 0.35).fillCircle(-15, -1, 8);
    bg.fillStyle(0xffffff, 0.13).fillEllipse(-4, -10, 22, 5);
    bg.fillStyle(0xffffff, 0.12).fillCircle(18, -15, 4.5);
    bg.fillStyle(dark).fillCircle(37, -8, 2);
    bg.fillStyle(opts.eye !== undefined ? opts.eye : 0x243046).fillCircle(23, -13, 2.4);
    specular(bg, { x: 22, y: -14, w: 1.5, h: 1.5, a: 0.85 }); // eye catchlight
    // the collar-bolt — a warm glowing accent stripe
    bg.fillStyle(accent, 0.22).fillCircle(11.5, -2, 8);
    bg.fillStyle(accent, 0.12).fillCircle(11.5, -2, 12);
    bg.fillStyle(accent).fillRect(10, -10, 3, 16);
    specular(bg, { x: 11.5, y: -7, w: 1, h: 3, a: 0.6 });
    bg.fillStyle(dark).fillTriangle(14, -22, 20, -20, 17, -12);
    const tail = this.add.graphics({ x: -17, y: -6 });
    tail.fillStyle(body).fillRoundedRect(-2.5, -13, 5, 14, 2.5);
    tail.fillStyle(accent, 0.3).fillCircle(0, -13, 5); // glow behind the wagging tip
    tail.fillStyle(accent).fillCircle(0, -13, 3);
    tail.setAngle(28);
    bolt.add([bg, tail]);
    this.tweens.add({
      targets: tail, angle: { from: 16, to: 46 },
      duration: opts.wagMs || 210, yoyo: true, repeat: -1, ease: "sine.inOut",
    });
    if (opts.scale) bolt.setScale(opts.scale);
    parent.add(bolt);
    return bolt;
  }

  // KOBI, the little eye-bot — warm glowing ring (magenta duty -> amber home),
  // glassy sclera, deep-glow iris (the V2 character identity, shrunk to cameo).
  makeKobi(parent, x, y, r, opts = {}) {
    const ring = opts.ring !== undefined ? opts.ring : 0xffb347;
    const iris = opts.iris !== undefined ? opts.iris : 0xff4dd2;
    const k = this.add.graphics({ x, y });
    k.fillStyle(0x1a1024, 1).fillCircle(0, 0, r);                 // armored housing
    ringGlow(k, { x: 0, y: 0, r, color: ring, width: Math.max(2, r * 0.13) }); // lit duty ring
    k.fillStyle(0xf6f0ff, 0.95).fillCircle(0, 0, r * 0.65);       // glassy sclera
    k.fillStyle(0xd8e2ff, 0.45).fillCircle(0, r * 0.14, r * 0.55); // cool glass underglow
    fakeRadial(k, { x: r * 0.1, y: r * 0.05, r: r * 0.5, color: iris, steps: 4, aCenter: 0.5, aEdge: 0 });
    k.fillStyle(iris, 1).fillCircle(r * 0.1, r * 0.05, r * 0.3);  // deep-glow iris
    k.fillStyle(0xffffff, 0.5).fillCircle(r * 0.02, -r * 0.03, r * 0.09); // catchlight
    specular(k, { x: -r * 0.24, y: -r * 0.26, w: r * 0.2, h: r * 0.13, a: 0.85 }); // glass highlight
    if (opts.lid !== false) k.fillStyle(0x1a1024, 1).fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 0.45); // sleepy lid
    parent.add(k);
    return k;
  }

  // --- the shared night sky (E1 / E2 / E6 / E7 sit under it) --------------------
  buildNight(W, H) {
    const g = this.add.graphics().setDepth(0);
    // dusk gradient: a richer 7-band fake gradient (deep night -> warm horizon)
    const top = [0x080a24, 0x0d1030, 0x141a44, 0x1e2150, 0x2b2559, 0x3a2a5e, 0x4a3560];
    top.forEach((c, i) => g.fillStyle(c, 1).fillRect(0, (H * 0.62 * i) / top.length, W, (H * 0.62) / top.length + 2));
    g.fillStyle(0x5a3f62, 1).fillRect(0, H * 0.62, W, H * 0.1);   // horizon haze
    g.fillStyle(0xffcf8f, 0.06).fillRect(0, H * 0.6, W, H * 0.07); // warm ground-light bleed
    // stars (seeded)
    let seed = 43;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 70; i++) {
      g.fillStyle(0xeaf2ff, 0.25 + rnd() * 0.6).fillCircle(rnd() * W, rnd() * H * 0.5, rnd() < 0.15 ? 1.6 : 1);
    }
    // the moon, with a soft baked halo
    fakeRadial(g, { x: W - 180, y: 110, r: 74, color: 0xfff3d0, steps: 5, aCenter: 0.2, aEdge: 0 });
    g.fillStyle(0xfff3d0, 0.95).fillCircle(W - 180, 110, 34);
    g.fillStyle(0xe8d8ac, 0.5).fillCircle(W - 192, 102, 7).fillCircle(W - 168, 122, 5);
    // the yard: grass bands (E2/E6 ground; E1/E7 paint their own over it)
    g.fillStyle(0x14351f, 1).fillRect(0, H * 0.7, W, H * 0.3);
    g.fillStyle(0x0e2917, 1).fillRect(0, H * 0.82, W, H * 0.18);
    // fireflies (drifted in update; visibility gated per page)
    this.flies = [];
    for (let i = 0; i < 6; i++) {
      const img = this.add.graphics({ x: 0, y: 0 }).setDepth(6);
      img.fillStyle(0xffe066, 0.9).fillCircle(0, 0, 2.2);
      img.fillStyle(0xffe066, 0.25).fillCircle(0, 0, 5);
      this.flies.push({ img, x: 120 + i * (W - 240) / 5, y: H * 0.6 + (i % 3) * 40 });
    }
  }

  // --- E1 THE WALK HOME ---------------------------------------------------------
  pageWalkHome(W, H, cont) {
    const g = this.add.graphics();
    // the street home: asphalt over the yard bands, kerb, lane dashes
    g.fillStyle(0x101426, 1).fillRect(0, H * 0.7, W, H * 0.3);
    g.fillStyle(0x1a2036, 1).fillRect(0, H * 0.7, W, 12);
    g.fillStyle(0x232b46, 1).fillRect(0, H * 0.86, W, 6);
    for (let x = 40; x < W; x += 130) g.fillStyle(0x2b3350, 0.9).fillRect(x, H * 0.9, 54, 5);
    // sleeping houses on the skyline
    [[60, 90], [250, 68], [W - 430, 84], [W - 210, 62]].forEach(([hx, hh]) => {
      g.fillStyle(0x0d1226, 1).fillRect(hx, H * 0.7 - hh, 130, hh);
      g.fillStyle(0x0a0e1f, 1).fillTriangle(hx - 12, H * 0.7 - hh, hx + 142, H * 0.7 - hh, hx + 65, H * 0.7 - hh - 32);
    });
    cont.add(g);
    // streetlamps — KOBI's new friends ("HELLO, LAMP.")
    [W * 0.16, W * 0.5, W * 0.84].forEach((lx, i) => {
      const lamp = this.add.graphics({ x: lx, y: H * 0.72 });
      lamp.fillStyle(0x1c2440, 1).fillRect(-4, -175, 8, 175);
      lamp.fillStyle(0x1c2440, 1).fillRoundedRect(-16, -190, 32, 18, 6);
      const cone = this.add.graphics({ x: lx, y: H * 0.72 });
      cone.fillStyle(0xffd9a0, 0.08).fillTriangle(-9, -174, 9, -174, 74, 8).fillTriangle(9, -174, -9, -174, -74, 8);
      cone.fillStyle(0xffd9a0, 0.1).fillEllipse(0, 6, 160, 26);
      fakeRadial(cone, { x: 0, y: -177, r: 22, color: 0xffd9a0, steps: 4, aCenter: 0.32, aEdge: 0 });
      cone.fillStyle(0xffd9a0, 0.95).fillCircle(0, -177, 7);
      cone.fillStyle(0xfff6d8, 0.9).fillCircle(-1.5, -178.5, 2.4); // hot filament
      cont.add(cone);
      cont.add(lamp);
      this.tweens.add({ targets: cone, alpha: { from: 0.72, to: 1 }, duration: 1300 + i * 240, yoyo: true, repeat: -1, ease: "sine.inOut" });
    });
    // the crew, walking home — KOBI rides Bolt ("Onward, steed."), Beep & Boop
    // trailing, everyone bobbing at their own beat
    const crew = this.add.container(W * 0.38, H * 0.8).setScale(1.5);
    const beep = this.add.image(-78, -8, "robot_b").setScale(0.95);
    const boop = this.add.image(-46, -6, "robot_o").setScale(0.95);
    crew.add([beep, boop]);
    this.tweens.add({ targets: beep, y: -13, duration: 760, yoyo: true, repeat: -1, ease: "sine.inOut" });
    this.tweens.add({ targets: boop, y: -11, duration: 700, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 160 });
    const steed = this.add.container(14, 0);
    crew.add(steed);
    this.makeBolt(steed, 0, 0, { wagMs: 240 });
    this.makeKobi(steed, -4, -20, 9);
    this.tweens.add({ targets: steed, y: -5, duration: 420, yoyo: true, repeat: -1, ease: "quad.out" });
    this.tweens.add({ targets: crew, x: "+=70", duration: 6400, yoyo: true, repeat: -1, ease: "sine.inOut" });
    cont.add(crew);
  }

  // --- E2 PLAYGROUND NIGHT (the original scene, kept) ----------------------------
  pagePlayground(W, H, cont) {
    this.buildPlayground(W, H, cont);
    this.buildCast(W, H, cont);
  }

  // --- E3 DAWN -------------------------------------------------------------------
  pageDawn(W, H, cont) {
    const g = this.add.graphics();
    // a fuller dawn ramp: violet night bleeding up into warm sunrise amber
    const sky = [0x241a4a, 0x3a2858, 0x6a4270, 0x9a5570, 0xc87560, 0xe89a5e, 0xf7b46a];
    sky.forEach((c, i) => g.fillStyle(c, 1).fillRect(0, (H * 0.8 * i) / sky.length, W, (H * 0.8) / sky.length + 2));
    g.fillStyle(0xf7b46a, 1).fillRect(0, H * 0.8, W, H * 0.2);
    cont.add(g);
    // the sun, rising (KOBI's BIG LIGHT — the climb tweens in on page-show)
    const sun = this.add.graphics({ x: W * 0.6, y: H * 0.66 });
    fakeRadial(sun, { x: 0, y: 0, r: 82, color: 0xffe9a0, steps: 6, aCenter: 0.55, aEdge: 0 });
    sun.fillStyle(0xfff3c8, 1).fillCircle(0, 0, 30);
    specular(sun, { x: -8, y: -8, w: 8, h: 6, a: 0.7 });
    cont.add(sun);
    this.dawnSun = sun;
    this.tweens.add({ targets: sun, alpha: { from: 0.88, to: 1 }, duration: 1100, yoyo: true, repeat: -1, ease: "sine.inOut" });
    // the hilltop, and everyone on it, watching
    const hill = this.add.graphics();
    hill.fillStyle(0x241b3e, 1).fillEllipse(W / 2, H * 1.08, W * 1.5, H * 0.76);
    cont.add(hill);
    const crest = H * 0.73, ink = 0x160f2a;
    const crew = this.add.graphics();
    crew.fillStyle(ink, 1).fillRoundedRect(W * 0.4 - 14, crest - 36, 28, 36, 8);  // Beep
    crew.fillStyle(ink, 1).fillRoundedRect(W * 0.455 - 14, crest - 31, 28, 31, 8); // Boop
    cont.add(crew);
    this.makeBolt(cont, W * 0.525, crest - 6, { body: ink, dark: ink, accent: 0xd8875f, eye: 0xf7b46a, scale: 1.25, wagMs: 260 });
    const kb = this.makeKobi(cont, W * 0.585, crest - 15, 12, { lid: false });
    this.tweens.add({ targets: kb, y: crest - 20, duration: 1400, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  // --- E4 THE ADOPTION -----------------------------------------------------------
  pageAdoption(W, H, cont) {
    const g = this.add.graphics();
    const sky = [0x120f2c, 0x181436, 0x221a44, 0x2c2052, 0x3c2a5e, 0x4a3358];
    sky.forEach((c, i) => g.fillStyle(c, 1).fillRect(0, (H * 0.66 * i) / sky.length, W, (H * 0.66) / sky.length + 2));
    g.fillStyle(0x191430, 1).fillRect(0, H * 0.66, W, H * 0.34);
    // the house front, close up, with the door open on a warm hallway
    const base = H * 0.8, hx = W / 2 - 190;
    g.fillStyle(0x131a30, 1).fillRect(hx, base - 260, 380, 260);
    g.fillStyle(0x0e1426, 1).fillTriangle(hx - 30, base - 260, hx + 410, base - 260, hx + 190, base - 350);
    g.fillStyle(0x241a10, 1).fillRect(hx + 150, base - 150, 90, 150);
    fakeRadial(g, { x: hx + 195, y: base - 100, r: 96, color: 0xffd9a0, steps: 5, aCenter: 0.18, aEdge: 0 });
    g.fillStyle(0xffd9a0, 0.95).fillRect(hx + 158, base - 142, 74, 142);
    g.fillStyle(0xfff3d8, 0.5).fillRect(hx + 158, base - 142, 74, 26); // warm top-light in the hall
    g.fillStyle(0x0e1426, 1).fillRect(hx + 40, base - 190, 52, 44);  // dark windows —
    g.fillStyle(0x0e1426, 1).fillRect(hx + 290, base - 190, 52, 44); // everyone's at the door
    g.fillStyle(0x1a2338, 1).fillRect(hx - 40, base, 460, 12); // porch
    cont.add(g);
    const spill = this.add.graphics({ x: hx + 195, y: base });
    spill.fillStyle(0xffd9a0, 0.15).fillTriangle(-37, -142, 37, -142, 130, 10).fillTriangle(37, -142, -37, -142, -130, 10);
    spill.fillStyle(0xffd9a0, 0.12).fillEllipse(0, 6, 320, 44);
    cont.add(spill);
    this.tweens.add({ targets: spill, alpha: { from: 0.78, to: 1 }, duration: 1500, yoyo: true, repeat: -1, ease: "sine.inOut" });
    // the kid, kneeling in the doorway light, one arm out to KOBI
    const kid = this.add.graphics({ x: hx + 176, y: base - 6 });
    const ink = 0x0c0a18;
    kid.fillStyle(ink, 1).fillCircle(2, -60, 12);               // head
    kid.fillStyle(ink, 1).fillRoundedRect(-12, -52, 26, 36, 9); // torso
    kid.fillStyle(ink, 1).fillRoundedRect(-12, -18, 32, 10, 5); // kneel
    kid.fillStyle(ink, 1).fillRoundedRect(10, -44, 30, 8, 4);   // the offered arm
    cont.add(kid);
    // KOBI, accepting the position; Bolt, vouching for him
    const kb = this.makeKobi(cont, hx + 244, base - 26, 15);
    this.tweens.add({ targets: kb, y: base - 31, duration: 900, yoyo: true, repeat: -1, ease: "sine.inOut" });
    this.makeBolt(cont, hx + 312, base - 14, { scale: 1.2 });
  }

  // --- E5 CALLBACK GAG (the manual, chapter one) ----------------------------------
  pageManual(W, H, cont) {
    const g = this.add.graphics();
    g.fillStyle(0x1c1428, 1).fillRect(0, 0, W, H);               // the bedroom, lights low
    g.fillStyle(0x140e1e, 1).fillRect(0, H * 0.78, W, H * 0.22); // floor
    // the window + moon
    g.fillStyle(0x0b1030, 1).fillRoundedRect(W * 0.66, 90, 180, 136, 8);
    g.lineStyle(4, 0x2a2140, 1).strokeRoundedRect(W * 0.66, 90, 180, 136, 8);
    g.lineBetween(W * 0.66 + 90, 92, W * 0.66 + 90, 224);
    fakeRadial(g, { x: W * 0.66 + 126, y: 130, r: 40, color: 0xdfe8ff, steps: 4, aCenter: 0.22, aEdge: 0 });
    g.fillStyle(0xfff3d0, 0.95).fillCircle(W * 0.66 + 126, 130, 18);
    specular(g, { x: W * 0.66 + 120, y: 124, w: 4, h: 3, a: 0.6 });
    // the bed
    const bx = W * 0.36, by = H * 0.72;
    g.fillStyle(0x2a1d38, 1).fillRoundedRect(bx - 170, by - 92, 24, 104, 6);
    g.fillStyle(0x3a2a4e, 1).fillRoundedRect(bx - 158, by - 34, 340, 46, 10);
    g.fillStyle(0xd9c8a8, 0.9).fillRoundedRect(bx - 148, by - 46, 66, 22, 8);
    g.fillStyle(0x5a3a6e, 1).fillRoundedRect(bx - 92, by - 30, 274, 38, 10);
    // the nightstand
    g.fillStyle(0x2a1d38, 1).fillRect(bx + 210, by - 26, 74, 34);
    cont.add(g);
    // the kid, sat up against the pillow, reading KOBI's manual to him
    const ink = 0x0f0a1c;
    const kid = this.add.graphics({ x: bx - 100, y: by - 40 });
    kid.fillStyle(ink, 1).fillCircle(0, -28, 11);
    kid.fillStyle(ink, 1).fillRoundedRect(-13, -22, 26, 30, 8);
    kid.fillStyle(ink, 1).fillRoundedRect(6, -14, 26, 7, 3); // arms toward the book
    cont.add(kid);
    // the manual — open pages, glowing warm ("...is that CHAPTER ONE?")
    const book = this.add.container(bx - 56, by - 40).setAngle(-8);
    const bp = this.add.graphics();
    bp.fillStyle(0xfff6e2, 0.96).fillRoundedRect(-30, -18, 30, 38, 3);
    bp.fillStyle(0xffe9c9, 0.96).fillRoundedRect(0, -18, 30, 38, 3);
    bp.lineStyle(1.5, 0xc9a86a, 0.7);
    for (let ly = -10; ly <= 12; ly += 7) { bp.lineBetween(-24, ly, -7, ly); bp.lineBetween(7, ly, 24, ly); }
    book.add(bp);
    cont.add(book);
    const bookGlow = this.add.graphics({ x: bx - 56, y: by - 40 });
    bookGlow.fillStyle(0xffe9c9, 0.09).fillCircle(0, 0, 66);
    cont.add(bookGlow);
    this.tweens.add({ targets: bookGlow, alpha: { from: 0.7, to: 1 }, duration: 1200, yoyo: true, repeat: -1, ease: "sine.inOut" });
    // KOBI on the nightstand, listening hard (a slow, happy blink)
    const kb = this.makeKobi(cont, bx + 247, by - 44, 16, { lid: false });
    const lid = this.add.graphics({ x: bx + 247, y: by - 44 });
    lid.fillStyle(0x1a1024, 1).fillRect(-12, -12, 24, 12);
    lid.setAlpha(0);
    cont.add(lid);
    this.tweens.add({ targets: lid, alpha: 1, duration: 140, yoyo: true, repeat: -1, repeatDelay: 2300, ease: "quad.inOut" });
    this.tweens.add({ targets: kb, y: by - 47, duration: 1300, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  // --- E6 NIGHT-LIGHT (the original house beat, kept) ------------------------------
  pageNightLight(W, H, cont) {
    this.buildHouse(W, H, cont);
    this.buildCast(W, H, cont);
  }

  // --- E7 FINAL BUTTON — pull-out to one glowing window ----------------------------
  pageFinal(W, H, cont) {
    // inner container centred so the page-show pull-out scales about the middle
    const inner = this.add.container(W / 2, H / 2);
    cont.add(inner);
    this.finalInner = inner;
    const ox = -W / 2, oy = -H / 2;
    const g = this.add.graphics();
    // far hills over the shared night sky (covering the yard bands)
    g.fillStyle(0x0c1226, 1).fillEllipse(ox + W * 0.28, oy + H * 1.04, W * 1.15, H * 0.56);
    g.fillStyle(0x080d1e, 1).fillEllipse(ox + W * 0.76, oy + H * 1.1, W * 1.25, H * 0.66);
    // the one small house, far away, holding everyone
    const hx = ox + W * 0.5, hy = oy + H * 0.68;
    g.fillStyle(0x10162c, 1).fillRect(hx - 46, hy - 42, 92, 42);
    g.fillStyle(0x0b1022, 1).fillTriangle(hx - 56, hy - 42, hx + 56, hy - 42, hx, hy - 70);
    g.fillStyle(0x0b1022, 1).fillRect(hx + 22, hy - 64, 9, 18); // chimney
    inner.add(g);
    // the one glowing window — Bolt curled around KOBI inside, lights on forever
    const win = this.add.graphics({ x: hx - 4, y: hy - 22 });
    fakeRadial(win, { x: 0, y: 0, r: 44, color: 0xffd9a0, steps: 5, aCenter: 0.24, aEdge: 0 });
    win.fillStyle(0xffd9a0, 0.95).fillRoundedRect(-16, -13, 32, 26, 4);
    win.lineStyle(2, 0x8a5c34, 1).strokeCircle(0, 3, 7.5); // Bolt's curl
    win.fillStyle(0x8a5c34, 1).fillCircle(-6, 5, 2.6);     // his nose, tucked in
    win.fillStyle(0xff4dd2, 1).fillCircle(1, 3, 2.4);      // KOBI, in the middle of it
    inner.add(win);
    this.tweens.add({ targets: win, alpha: { from: 0.82, to: 1 }, duration: 1700, yoyo: true, repeat: -1, ease: "sine.inOut" });
    // chimney smoke, drifting off
    const smoke = this.add.graphics({ x: hx + 26, y: hy - 68 });
    smoke.fillStyle(0x9aa6c0, 0.25).fillCircle(0, 0, 4).fillCircle(4, -9, 5.5).fillCircle(10, -20, 7);
    inner.add(smoke);
    this.tweens.add({ targets: smoke, y: hy - 76, alpha: { from: 0.9, to: 0.3 }, duration: 2600, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  // --- POST-CREDITS sting art (END-19: KOBI, alone with the player) ---------------
  buildSting(W, H) {
    const cont = this.add.container(0, 0).setVisible(false).setDepth(18);
    cont.add(this.add.rectangle(W / 2, H / 2, W, H, 0x02040a, 0.94));
    const pool = this.add.graphics({ x: W / 2, y: H * 0.4 });
    fakeRadial(pool, { x: 0, y: 0, r: 150, color: 0xffd9a0, steps: 6, aCenter: 0.1, aEdge: 0 });
    pool.fillStyle(0xffd9a0, 0.05).fillEllipse(0, H * 0.34, 460, 80);
    cont.add(pool);
    this.tweens.add({ targets: pool, alpha: { from: 0.7, to: 1 }, duration: 1600, yoyo: true, repeat: -1, ease: "sine.inOut" });
    const kb = this.makeKobi(cont, W / 2, H * 0.4, 44, { lid: false });
    this.tweens.add({ targets: kb, y: H * 0.4 - 6, duration: 1700, yoyo: true, repeat: -1, ease: "sine.inOut" });
    const lid = this.add.graphics({ x: W / 2, y: H * 0.4 });
    lid.fillStyle(0x1a1024, 1).fillRect(-32, -32, 64, 32);
    lid.setAlpha(0);
    cont.add(lid);
    this.tweens.add({ targets: lid, alpha: 1, duration: 150, yoyo: true, repeat: -1, repeatDelay: 2600, ease: "quad.inOut" });
    this.stingCont = cont;
  }

  // --- the playground night (all drawn, deterministic) ------------------------
  buildPlayground(W, H, cont) {
    const g = this.add.graphics();
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
    cont.add(g);
  }

  buildHouse(W, H, cont) {
    const g = this.add.graphics();
    const base = H * 0.76;
    const hx = W - 340;
    // the house silhouette + warm windows
    g.fillStyle(0x131a30, 1).fillRect(hx, base - 170, 250, 170);
    g.fillStyle(0x0e1426, 1).fillTriangle(hx - 22, base - 170, hx + 272, base - 170, hx + 125, base - 240);
    fakeRadial(g, { x: hx + 54, y: base - 113, r: 46, color: 0xffd9a0, steps: 4, aCenter: 0.16, aEdge: 0 });
    fakeRadial(g, { x: hx + 196, y: base - 113, r: 46, color: 0xffc880, steps: 4, aCenter: 0.16, aEdge: 0 });
    g.fillStyle(0xffd9a0, 0.95).fillRect(hx + 34, base - 130, 40, 34);
    g.fillStyle(0xffc880, 0.9).fillRect(hx + 176, base - 130, 40, 34);
    g.lineStyle(2, 0x131a30).lineBetween(hx + 54, base - 130, hx + 54, base - 96);
    // the door + porch
    g.fillStyle(0x241a10, 1).fillRect(hx + 105, base - 74, 44, 74);
    g.fillStyle(0x1a2338, 1).fillRect(hx - 30, base, 310, 10);
    cont.add(g);
    // KOBI, adopted: the little eye-bot on the porch — the NIGHT-LIGHT. His
    // side light glows warm now (magenta duty -> amber home).
    const kx = hx + 190, ky = base - 18;
    // the night-light pool he casts over the porch (under him)
    const pool = this.add.graphics({ x: kx, y: ky + 8 });
    pool.fillStyle(0xffd9a0, 0.13).fillEllipse(0, 16, 150, 40);
    pool.fillStyle(0xffd9a0, 0.1).fillCircle(0, 0, 34);
    cont.add(pool);
    this.tweens.add({ targets: pool, alpha: { from: 0.7, to: 1 }, duration: 1600, yoyo: true, repeat: -1, ease: "sine.inOut" });
    const k = this.makeKobi(cont, kx, ky, 20);
    const kbase = this.add.graphics({ x: kx, y: ky });
    kbase.fillStyle(0x2a3350, 1).fillRect(-10, 18, 20, 6); // his little base
    cont.add(kbase);
    cont.add(this.add.text(kx, ky - 44, "NIGHT-LIGHT\nON DUTY", {
      fontFamily: FONT, fontSize: FS.tiny, fontStyle: "italic", color: "#c98fd9", align: "center",
    }).setOrigin(0.5));
    return k;
  }

  buildCast(W, H, cont) {
    const base = H * 0.76;
    // floor shadows
    const sh = this.add.graphics();
    [[W * 0.28, 0], [W * 0.40, 0], [W * 0.345, 26]].forEach(([x, dy]) => {
      sh.fillStyle(0x000000, 0.35).fillEllipse(x, base + 6 + dy * 0, 64, 12);
    });
    cont.add(sh);
    // Beep & Boop (the boot sprites), playing fetch
    const beep = this.add.image(W * 0.28, base - 24, "robot_b").setScale(1.4);
    const boop = this.add.image(W * 0.40, base - 24, "robot_o").setScale(1.4).setFlipX(true);
    cont.add(beep);
    cont.add(boop);
    this.tweens.add({ targets: beep, y: base - 32, duration: 850, yoyo: true, repeat: -1, ease: "sine.inOut" });
    this.tweens.add({ targets: boop, y: base - 30, duration: 780, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 200 });
    // the ball, lobbed between them forever
    const ball = this.add.graphics({ x: W * 0.3, y: base - 60 });
    ball.fillStyle(0xffb347, 1).fillCircle(0, 0, 6);
    ball.fillStyle(0xfff6d8, 0.9).fillCircle(-2, -2, 2);
    cont.add(ball);
    const b0 = W * 0.295, b1 = W * 0.385;
    const arc = { t: 0 };
    this.tweens.add({
      targets: arc, t: 1, duration: 1300, yoyo: true, repeat: -1, ease: "linear",
      onUpdate: () => {
        ball.x = b0 + (b1 - b0) * arc.t;
        ball.y = base - 52 - Math.sin(arc.t * Math.PI) * 70;
      },
    });
    // Bolt, mid-chase under the ball, tail wagging
    const bolt = this.makeBolt(cont, W * 0.345, base - 8, {});
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
