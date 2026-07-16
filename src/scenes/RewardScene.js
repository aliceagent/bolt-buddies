// Bolt Buddies — COMPLETION REWARD (FIN-C, FINALE_BIBLE "Reward suite").
//
// The payoff the players EARNED: after the epilogue's credits, a warm
// three-act victory lap — MEDAL CEREMONY -> FAMILY ALBUM -> SHARE CARD ->
// Title. Reached ONLY from EpilogueScene.exitToTitle() on the finale path, so
// no gameplay routing changes: the reward simply slots between THE END and
// the main menu.
//
// A self-contained scene in the EpilogueScene mold: all art is DRAWN
// (Canvas-safe, no new boot textures beyond the robot_b/robot_o sprites that
// already exist; Bolt/KOBI are the same primitive-built cast as the epilogue).
// All data is DERIVED: loadSave() + the FIN-C save helpers (worldCoreCount /
// worldPhotos / hundredPercent) and a defensive read of the UX records blob
// (best times/deaths) — every field has a sensible default so a missing or
// corrupt blob can never break the ceremony.
//
// STRAND-PROOF BY CONSTRUCTION (softlock scenario 4-3-epilogue-cant-strand
// now walks THROUGH this scene): three acts — "medal" (~8s), "album" (7
// auto-flipping spreads, ~2.4s each), "share" (held ~10s) — and EVERY act
// both AUTO-ADVANCES on its own timer and advances on ANY key / any pad
// button; the share card exits to the Title on either driver. From any point
// <= ~9 presses (or ~35s hands-off) reaches scene.start("Title"). Nothing is
// ever gated. Probe surface: __BB.reward ({act, page}).
import Phaser from "phaser";
import { COLORS, FONT, FS, TEXT, WORLD_THEMES } from "../constants.js";
import { initAudio, sfx, playTrack, installMute } from "../audio.js";
import { pads } from "../pad.js";
import { loadSave, totalCores, worldCoreCount, worldPhotos, hundredPercent } from "../save.js";
import { fmtClock } from "../ux.js";
import { WORLD_INFO } from "../levels/registry.js";

const ACT1_MS = 8000;   // the medal ceremony holds ~8s
const PAGE_MS = 2400;   // each album spread auto-flips (~14-17s for the book)
const ACT3_MS = 10000;  // the share card holds ~10s, then heads home itself

// FINALE_BIBLE "Reward suite (RWD-)" — the two medals, verbatim.
const MEDAL_ANY = {
  title: "THE BOLT MEDAL: HOME SAFE",
  engraving: "“They came back for everyone.”",
};
const MEDAL_GOLD = {
  title: "THE GOLDEN GLARE: EVERY LIGHT ON",
  engraving: "“Every light on.”",
};

// The RWD- script lines (FINALE_BIBLE, verbatim).
const RWD01 = "A MEDAL. I am 60% of why you earned this. Congratulations.";
const RWD02 = "It has my EYE on it. This is the greatest object ever made.";
const RWD03 = "Every adventure ends the same way, if you're lucky:\nin an album, on a table, in a home.";

// Taglines (the footer takes #1; the share card's motto takes #2).
const TAGLINE = "We didn't beat the boss. We brought him home.";
const FOOTER = "No robots were harmed. One was adopted.";

export default class RewardScene extends Phaser.Scene {
  constructor() {
    super("Reward");
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.act = "medal";
    this.pageIdx = -1;
    this.leaving = false;
    this.capTimer = null;
    this.cameras.main.fadeIn(600, 4, 6, 20);

    this.computeData();
    this.buildBackdrop(W, H);

    // act containers — built once, toggled per act
    this.medalCont = this.add.container(0, 0).setDepth(3);
    this.buildMedal(W, H, this.medalCont);
    this.albumCont = this.add.container(0, 0).setVisible(false).setDepth(3);
    this.buildAlbum(W, H, this.albumCont);
    this.shareCont = this.add.container(0, 0).setVisible(false).setDepth(3);
    this.buildShare(W, H, this.shareCont);

    // caption plate (the epilogue's blip-bar styling — KOBI magenta / NARR amber)
    const cy = H - 66;
    this.plateGeom = { x: W / 2 - 430, y: cy - 40, w: 860, h: 80 };
    this.capPlate = this.add.graphics().setDepth(20);
    this.speakerTag = this.add.text(W / 2 - 416, cy - 46, "", {
      fontFamily: FONT, fontSize: FS.tiny, fontStyle: "bold italic", color: "#ffcf9a",
    }).setOrigin(0, 1).setDepth(21);
    this.capText = this.add.text(W / 2, cy, "", {
      fontFamily: FONT, fontSize: FS.lead, color: "#ffe9c9", align: "center", lineSpacing: 5,
    }).setOrigin(0.5).setDepth(21);
    this.hint = this.add.text(W / 2, H - 12, "any key: next  ·  you earned every bit of this", {
      fontFamily: FONT, fontSize: FS.mini, color: TEXT.faint,
    }).setOrigin(0.5, 1).setDepth(21);

    // the epilogue lullaby carries straight through the reward (guarded)
    try { playTrack("epilogue"); } catch (e) { /* audio unavailable — silent lap */ }
    try { installMute(this); } catch (e) { /* mute UI optional */ }

    this.showCaption("KOBI", this.gold ? RWD02 : RWD01);
    this.armTimer(ACT1_MS);

    this.input.keyboard.on("keydown", () => { initAudio(); this.advance(false); });

    // probe surface (read-only) — the strand tests walk this
    window.__BB = window.__BB || {};
    window.__BB.reward = {
      _scene: this,
      get act() { return this._scene.act; },
      get page() { return this._scene.pageIdx; },
    };
  }

  update(time) {
    // any pad button advances too — pad-only players are never stranded
    pads.poll(time);
    if (pads.anyButtonJust()) { initAudio(); this.advance(false); }
  }

  // --- data (all derived, all defensive) ---------------------------------------
  computeData() {
    const s = loadSave();
    this.coreCount = totalCores(s);
    this.perWorld = [1, 2, 3, 4].map((w) => worldCoreCount(s, w));
    this.photos = worldPhotos(s);
    this.gold = hundredPercent(s);
    this.medal = this.gold ? MEDAL_GOLD : MEDAL_ANY;
    // best-times/records blob — may be absent/corrupt; every miss has a default
    let timeMs = 0, deaths = 0, haveTime = false, haveDeaths = false;
    try {
      const ux = JSON.parse(localStorage.getItem("bolt-buddies-ux-v1"));
      const recs = ux && ux.records;
      if (recs && typeof recs === "object") {
        for (const id of Object.keys(recs)) {
          const r = recs[id];
          if (r && typeof r.bestTime === "number") { timeMs += r.bestTime; haveTime = true; }
          if (r && typeof r.bestDeaths === "number") { deaths += r.bestDeaths; haveDeaths = true; }
        }
      }
    } catch (e) { /* no records — the album says it in words instead */ }
    this.playtime = haveTime ? fmtClock(timeMs) : "one whole adventure";
    this.tumbleLine = haveDeaths
      ? `${deaths} tumbles. ${deaths} get-ups.`
      : "Every tumble had a get-up. All of them.";
    let date = "";
    try {
      date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    } catch (e) {
      date = new Date().toDateString();
    }
    this.dateStr = date;
  }

  // --- one advance step (timer = auto, any key/button = skip forward) -----------
  // Monotonic: medal -> album pages -> share -> Title. Nothing loops back.
  advance(auto) {
    if (this.leaving) return;
    if (this.act === "medal") {
      if (!auto) this.blip("menuSelect");
      this.startAlbum();
      return;
    }
    if (this.act === "album") {
      if (this.pageIdx < this.albumPages.length - 1) {
        this.showAlbumPage(this.pageIdx + 1);
        if (!auto) this.blip("menuMove");
      } else {
        if (!auto) this.blip("menuSelect");
        this.startShare();
      }
      return;
    }
    // act "share": the timer AND any key both head home
    this.exitToTitle();
  }

  startAlbum() {
    this.act = "album";
    this.clearTimer();
    this.medalCont.setVisible(false);
    this.albumCont.setVisible(true);
    this.hideCaption();
    this.showAlbumPage(0);
  }

  startShare() {
    this.act = "share";
    this.clearTimer();
    this.albumCont.setVisible(false);
    this.shareCont.setVisible(true);
    this.hideCaption();
    this.hint.setText("press ACTION to head home");
    this.tweens.add({ targets: this.hint, alpha: { from: 1, to: 0.35 }, duration: 650, yoyo: true, repeat: -1 });
    this.armTimer(ACT3_MS);
  }

  showAlbumPage(i) {
    this.pageIdx = i;
    for (let p = 0; p < this.albumPages.length; p++) this.albumPages[p].setVisible(p === i);
    // the last spread ("the day we got KOBI") carries RWD-03
    if (i === this.albumPages.length - 1) this.showCaption("NARR", RWD03);
    else this.hideCaption();
    this.armTimer(PAGE_MS);
  }

  exitToTitle() {
    if (this.leaving) return;
    this.leaving = true;
    this.clearTimer();
    this.blip("menuSelect");
    this.cameras.main.fadeOut(500, 4, 6, 20);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Title"));
  }

  armTimer(ms) {
    if (this.capTimer) this.capTimer.remove(false);
    this.capTimer = this.time.delayedCall(ms, () => this.advance(true));
  }

  clearTimer() {
    if (this.capTimer) { this.capTimer.remove(false); this.capTimer = null; }
  }

  blip(name) {
    try { sfx[name](); } catch (e) { /* audio unavailable — the reward is silent-safe */ }
  }

  // --- caption plate (two voices, epilogue styling) ------------------------------
  showCaption(who, text) {
    const { x, y, w, h } = this.plateGeom;
    const kobi = who === "KOBI";
    const cg = this.capPlate;
    cg.clear().setVisible(true);
    cg.fillStyle(kobi ? 0x1a0f22 : COLORS.hudBg, 0.88).fillRoundedRect(x, y, w, h, 10);
    cg.lineStyle(2, kobi ? 0xff4dd2 : 0xffb347, kobi ? 0.65 : 0.55).strokeRoundedRect(x, y, w, h, 10);
    this.speakerTag.setText(kobi ? "K.O.B.I." : "NARRATOR").setColor(kobi ? "#ff8fe6" : "#ffcf9a").setVisible(true);
    this.capText.setText(text).setColor(kobi ? "#ffd6f4" : "#ffe9c9").setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.capText, alpha: 1, duration: 420 });
  }

  hideCaption() {
    this.capPlate.setVisible(false);
    this.capText.setVisible(false);
    this.speakerTag.setVisible(false);
  }

  // --- shared drawn-cast helpers (the epilogue's primitive vocabulary) -----------
  makeBolt(parent, x, y, opts = {}) {
    const body = opts.body !== undefined ? opts.body : 0xd9dee8;
    const dark = opts.dark !== undefined ? opts.dark : 0x8b93a8;
    const accent = opts.accent !== undefined ? opts.accent : 0xffb347;
    const bolt = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(dark);
    [-14, -4, 8, 16].forEach((lx) => bg.fillRoundedRect(lx, 4, 6, 8, 2));
    bg.fillStyle(body).fillRoundedRect(-18, -10, 36, 16, 7);
    bg.fillStyle(body).fillCircle(-15, -4, 8);
    bg.fillStyle(body).fillCircle(20, -12, 9);
    bg.fillStyle(body).fillRoundedRect(26, -12, 11, 8, 3);
    bg.fillStyle(dark).fillCircle(37, -8, 2);
    bg.fillStyle(opts.eye !== undefined ? opts.eye : 0x243046).fillCircle(23, -13, 2.4);
    bg.fillStyle(accent).fillRect(10, -10, 3, 16);
    bg.fillStyle(dark).fillTriangle(14, -22, 20, -20, 17, -12);
    const tail = this.add.graphics({ x: -17, y: -6 });
    tail.fillStyle(body).fillRoundedRect(-2.5, -13, 5, 14, 2.5);
    tail.fillStyle(accent).fillCircle(0, -13, 3);
    tail.setAngle(28);
    bolt.add([bg, tail]);
    if (opts.wag !== false) {
      this.tweens.add({
        targets: tail, angle: { from: 16, to: 46 },
        duration: opts.wagMs || 210, yoyo: true, repeat: -1, ease: "sine.inOut",
      });
    }
    if (opts.scale) bolt.setScale(opts.scale);
    parent.add(bolt);
    return bolt;
  }

  makeKobi(parent, x, y, r, opts = {}) {
    const k = this.add.graphics({ x, y });
    k.fillStyle(0x1a1024, 1).fillCircle(0, 0, r);
    k.lineStyle(Math.max(2, r * 0.13), opts.ring !== undefined ? opts.ring : 0xffb347, 0.95).strokeCircle(0, 0, r);
    k.fillStyle(0xf6f0ff, 0.95).fillCircle(0, 0, r * 0.65);
    k.fillStyle(opts.iris !== undefined ? opts.iris : 0xff4dd2, 1).fillCircle(r * 0.1, r * 0.05, r * 0.3);
    if (opts.lid !== false) k.fillStyle(0x1a1024, 1).fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 0.45);
    parent.add(k);
    return k;
  }

  // 5-point star (data-core stickers, confetti accents). fill=false strokes.
  star(g, x, y, r, color, alpha = 1, fill = true) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
    }
    if (fill) g.fillStyle(color, alpha).fillPoints(pts, true);
    else g.lineStyle(1.5, color, alpha).strokePoints(pts, true, true);
  }

  dashedRect(g, x, y, w, h, dash = 9, gap = 7) {
    const seg = (x1, y1, x2, y2) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      for (let s = 0; s < len; s += dash + gap) {
        const e = Math.min(s + dash, len);
        g.lineBetween(x1 + ux * s, y1 + uy * s, x1 + ux * e, y1 + uy * e);
      }
    };
    seg(x, y, x + w, y); seg(x + w, y, x + w, y + h);
    seg(x + w, y + h, x, y + h); seg(x, y + h, x, y);
  }

  // --- the shared backyard dusk (the ceremony sits right in it) ------------------
  buildBackdrop(W, H) {
    const g = this.add.graphics().setDepth(0);
    const sky = [0x1a1440, 0x2c1e52, 0x4a2a5e, 0x6e3a5a];
    sky.forEach((c, i) => g.fillStyle(c, 1).fillRect(0, (H * 0.66 * i) / 4, W, (H * 0.66) / 4 + 2));
    // stars (seeded, deterministic)
    let seed = 77;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 46; i++) {
      g.fillStyle(0xffe9c9, 0.2 + rnd() * 0.55).fillCircle(rnd() * W, rnd() * H * 0.45, rnd() < 0.2 ? 1.6 : 1);
    }
    // the backyard: warm grass, a fence line
    g.fillStyle(0x1d4426, 1).fillRect(0, H * 0.66, W, H * 0.34);
    g.fillStyle(0x143119, 1).fillRect(0, H * 0.84, W, H * 0.16);
    g.fillStyle(0x241a30, 1).fillRect(0, H * 0.6, W, 8);
    for (let x = 14; x < W; x += 42) g.fillStyle(0x241a30, 1).fillRect(x, H * 0.52, 10, H * 0.14);
    // string lights across the yard — it's a party
    this.bulbs = [];
    for (let i = 0; i < 9; i++) {
      const bx = 80 + (i * (W - 160)) / 8;
      const by = 86 + Math.sin((i / 8) * Math.PI) * 46;
      g.lineStyle(2, 0x241a30, 0.8);
      if (i > 0) {
        const px = 80 + ((i - 1) * (W - 160)) / 8;
        const py = 86 + Math.sin(((i - 1) / 8) * Math.PI) * 46;
        g.lineBetween(px, py, bx, by);
      }
      const bulb = this.add.graphics({ x: bx, y: by }).setDepth(1);
      const warm = i % 2 === 0 ? 0xffd9a0 : 0xff8fe6;
      bulb.fillStyle(warm, 0.25).fillCircle(0, 3, 9);
      bulb.fillStyle(warm, 0.95).fillCircle(0, 3, 4);
      this.tweens.add({ targets: bulb, alpha: { from: 0.6, to: 1 }, duration: 900 + i * 130, yoyo: true, repeat: -1, ease: "sine.inOut" });
      this.bulbs.push(bulb);
    }
  }

  // --- ACT 1: THE MEDAL CEREMONY --------------------------------------------------
  buildMedal(W, H, cont) {
    const base = H * 0.78;
    const gold = this.gold;
    // the podium: a proud backyard crate
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillEllipse(W / 2, base + 34, 300, 26);
    g.fillStyle(0x6a4a2c, 1).fillRoundedRect(W / 2 - 120, base - 26, 240, 58, 6);
    g.fillStyle(0x543a20, 1).fillRect(W / 2 - 120, base - 8, 240, 5);
    g.fillStyle(0x7d5936, 1).fillRect(W / 2 - 120, base - 26, 240, 6);
    cont.add(g);
    cont.add(this.add.text(W / 2, base + 4, "GOOD DOG. GREAT ROBOTS.", {
      fontFamily: FONT, fontSize: FS.tiny, fontStyle: "italic", color: "#ffe9c9",
    }).setOrigin(0.5).setAlpha(0.85));
    // the buddies flank the podium, bouncing with pride
    const beep = this.add.image(W / 2 - 220, base + 6, "robot_b").setScale(1.5);
    const boop = this.add.image(W / 2 + 220, base + 6, "robot_o").setScale(1.5).setFlipX(true);
    cont.add(beep); cont.add(boop);
    this.tweens.add({ targets: beep, y: base - 4, duration: 700, yoyo: true, repeat: -1, ease: "sine.inOut" });
    this.tweens.add({ targets: boop, y: base - 2, duration: 640, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 160 });
    // Bolt ON the podium — he delivers the medal (it hangs from his mouth-side)
    const bolt = this.makeBolt(cont, W / 2 - 6, base - 34, { scale: 1.7, wagMs: 180 });
    this.tweens.add({ targets: bolt, y: base - 40, duration: 460, yoyo: true, repeat: -1, ease: "quad.out" });
    // KOBI hovers ringside, supervising his own award show
    const kb = this.makeKobi(cont, W / 2 + 130, base - 92, 13, { lid: false });
    this.tweens.add({ targets: kb, y: base - 100, duration: 1200, yoyo: true, repeat: -1, ease: "sine.inOut" });

    // the MEDAL — hero display above the podium
    const mx = W / 2, my = 258;
    const burst = this.add.graphics({ x: mx, y: my });
    const rayC = gold ? 0xffd94d : 0xd9a860;
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      burst.fillStyle(rayC, 0.1).fillTriangle(
        Math.cos(a - 0.09) * 70, Math.sin(a - 0.09) * 70,
        Math.cos(a + 0.09) * 70, Math.sin(a + 0.09) * 70,
        Math.cos(a) * 190, Math.sin(a) * 190,
      );
    }
    cont.add(burst);
    this.tweens.add({ targets: burst, angle: 360, duration: 40000, repeat: -1, ease: "linear" });
    const medal = this.add.container(mx, my);
    const md = this.add.graphics();
    // ribbon
    md.fillStyle(0xb03a4e, 1).fillTriangle(-30, -96, -6, -96, 8, -46);
    md.fillStyle(0x8e2c3e, 1).fillTriangle(30, -96, 6, -96, -8, -46);
    md.fillStyle(0xffe9c9, 0.9).fillRect(-7, -52, 14, 10);
    if (gold) {
      // THE GOLDEN GLARE: gold disc with KOBI's tiny eye at its heart
      md.fillStyle(0x8a6a10, 1).fillCircle(0, 12, 62);
      md.fillStyle(0xffd94d, 1).fillCircle(0, 8, 58);
      md.lineStyle(3, 0xfff3c8, 0.9).strokeCircle(0, 8, 48);
      md.fillStyle(0xf6f0ff, 0.95).fillCircle(0, 8, 24);
      md.fillStyle(0xff4dd2, 1).fillCircle(2, 9, 11);
      md.fillStyle(0xfff3c8, 0.9).fillCircle(-3, 4, 3.4);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 + 0.4;
        this.star(md, Math.cos(a) * 38, 8 + Math.sin(a) * 38, 4.5, 0xfff3c8, 0.9);
      }
    } else {
      // THE BOLT MEDAL: brass disc with the bone embossed
      md.fillStyle(0x6e5424, 1).fillCircle(0, 12, 62);
      md.fillStyle(0xb98a3e, 1).fillCircle(0, 8, 58);
      md.lineStyle(3, 0xe0c184, 0.9).strokeCircle(0, 8, 48);
      md.fillStyle(0xe8d9a8, 1).fillRoundedRect(-30, 1, 60, 14, 7);
      [[-30, 2], [-30, 14], [30, 2], [30, 14]].forEach(([cx, cy2]) => md.fillStyle(0xe8d9a8, 1).fillCircle(cx, cy2, 8));
      this.star(md, 0, -26, 6, 0xe8d9a8, 0.95);
    }
    medal.add(md);
    if (gold) {
      // the tiny KOBI-eye BLINKS once (FINALE_BIBLE: "tiny KOBI-eye blinks")
      const lid = this.add.graphics();
      lid.fillStyle(0xffd94d, 1).fillRect(-24, -16, 48, 24);
      lid.setAlpha(0);
      medal.add(lid);
      this.tweens.add({ targets: lid, alpha: 1, duration: 130, yoyo: true, repeat: 0, delay: 2400, ease: "quad.inOut" });
    }
    cont.add(medal);
    medal.setScale(0.2).setAlpha(0);
    this.tweens.add({ targets: medal, scale: 1, alpha: 1, duration: 900, ease: "back.out" });
    this.tweens.add({ targets: medal, y: my - 8, duration: 1600, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 900 });

    // title + engraving (the bible's exact medal cards)
    cont.add(this.add.text(W / 2, 74, "MEDAL CEREMONY", {
      fontFamily: FONT, fontSize: FS.mini, fontStyle: "bold", color: TEXT.dim, letterSpacing: 2,
    }).setOrigin(0.5));
    cont.add(this.add.text(W / 2, 110, this.medal.title, {
      fontFamily: FONT, fontSize: FS.title, fontStyle: "bold", color: gold ? "#ffd94d" : "#e0c184",
    }).setOrigin(0.5));
    cont.add(this.add.text(W / 2, 142, this.medal.engraving, {
      fontFamily: FONT, fontSize: FS.body, fontStyle: "italic", color: "#ffe9c9",
    }).setOrigin(0.5).setAlpha(0.9));

    // confetti! (drawn + tweened, deterministic, one burst then done)
    this.spawnConfetti(cont, W, H);
  }

  spawnConfetti(cont, W, H) {
    let seed = 9;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const palette = [0xffd94d, 0xff4dd2, 0x35f0ff, 0x59ff9c, 0xffb347];
    for (let i = 0; i < 26; i++) {
      const p = this.add.graphics({ x: W * 0.2 + rnd() * W * 0.6, y: 40 + rnd() * 120 });
      const c = palette[i % palette.length];
      if (i % 4 === 0) this.star(p, 0, 0, 5, c, 0.95);
      else p.fillStyle(c, 0.95).fillRect(-4, -2, 8, 4);
      p.setAngle(rnd() * 360);
      cont.add(p);
      this.tweens.add({
        targets: p,
        y: p.y + 320 + rnd() * 260,
        x: p.x + (rnd() - 0.5) * 140,
        angle: p.angle + 240 + rnd() * 360,
        alpha: 0,
        duration: 2600 + rnd() * 2200,
        delay: rnd() * 700,
        ease: "sine.in",
      });
    }
  }

  // --- ACT 2: THE FAMILY ALBUM ------------------------------------------------------
  buildAlbum(W, H, cont) {
    // dim the yard behind the book
    cont.add(this.add.rectangle(W / 2, H / 2, W, H, 0x02040a, 0.62));
    // the table + the album itself
    const g = this.add.graphics();
    const ax = W / 2 - 500, ay = H / 2 - 288, aw = 1000, ah = 552;
    g.fillStyle(0x000000, 0.4).fillRoundedRect(ax + 10, ay + 14, aw, ah, 14);
    g.fillStyle(0x6e4326, 1).fillRoundedRect(ax, ay, aw, ah, 14);       // cover
    g.lineStyle(3, 0x4c2c16, 1).strokeRoundedRect(ax + 8, ay + 8, aw - 16, ah - 16, 10);
    g.fillStyle(0xf4e8cd, 1).fillRoundedRect(ax + 22, ay + 22, aw - 44, ah - 44, 6); // pages
    g.lineStyle(2, 0xd9c8a8, 1).lineBetween(W / 2, ay + 26, W / 2, ay + ah - 26);    // spine
    cont.add(g);
    this.albumGeom = { ax, ay, aw, ah };

    // pages: [title card, wing 1..4, stats, crayon spread]
    this.albumPages = [];
    const addPage = (builder) => {
      const page = this.add.container(0, 0).setVisible(false);
      builder(page);
      cont.add(page);
      this.albumPages.push(page);
    };
    addPage((p) => this.pageAlbumTitle(W, H, p));
    for (let w = 0; w < 4; w++) addPage((p) => this.pageWingSpread(W, H, p, w));
    addPage((p) => this.pageStats(W, H, p));
    addPage((p) => this.pageCrayon(W, H, p));
  }

  // spread 0 — the reward title card (FINALE_BIBLE "Titles": exact lines)
  pageAlbumTitle(W, H, p) {
    p.add(this.add.text(W / 2, H / 2 - 74, "THE FAMILY ALBUM", {
      fontFamily: FONT, fontSize: FS.h2, fontStyle: "bold", color: "#5a3a22",
    }).setOrigin(0.5));
    p.add(this.add.text(W / 2, H / 2 - 18, "You made it home. All of you.", {
      fontFamily: FONT, fontSize: FS.head, fontStyle: "italic", color: "#7a5638",
    }).setOrigin(0.5));
    // a pawprint trail + the tiny household under the words
    const g = this.add.graphics();
    for (let i = 0; i < 5; i++) {
      const px = W / 2 - 150 + i * 74, py = H / 2 + 52 + (i % 2 ? -7 : 7);
      g.fillStyle(0xb08a5c, 0.7).fillCircle(px, py, 5);
      g.fillStyle(0xb08a5c, 0.7).fillCircle(px - 6, py - 7, 2.4).fillCircle(px, py - 9, 2.4).fillCircle(px + 6, py - 7, 2.4);
    }
    p.add(g);
    this.makeBolt(p, W / 2 + 250, H / 2 + 58, { scale: 1.1 });
    this.makeKobi(p, W / 2 + 292, H / 2 + 40, 8, { lid: false });
  }

  // spreads 1-4 — one per wing: the Bolt photo (or the missed-it sticky note)
  pageWingSpread(W, H, p, w) {
    const theme = WORLD_THEMES[w + 1];
    const count = this.perWorld[w];
    const havePhoto = this.photos[w];
    const { ay } = this.albumGeom;
    // left leaf: the polaroid, slightly crooked
    const pol = this.add.container(W / 2 - 235, H / 2 - 12).setAngle(w % 2 ? 4 : -5);
    if (havePhoto) {
      const fr = this.add.graphics();
      fr.fillStyle(0x000000, 0.25).fillRect(-124, -144, 254, 296);
      fr.fillStyle(0xfdfdf6, 1).fillRect(-128, -150, 254, 296);
      // the photo: that wing's palette, with Bolt PHOTOBOMBING in full color
      fr.fillStyle(theme.bgTop, 1).fillRect(-114, -136, 226, 158);
      fr.fillStyle(theme.bgBottom, 1).fillRect(-114, -30, 226, 116);
      fr.fillStyle(theme.glow, 0.5).fillCircle(-40, -80, 34);
      fr.fillStyle(theme.accent2, 0.7).fillCircle(52, -104, 5);
      this.star(fr, 66, -60, 7, theme.accent, 0.9);
      pol.add(fr);
      this.makeBolt(pol, 26, 48, { scale: 1.5, wag: false });
      pol.add(this.add.text(-2, 118, `BOLT! (photobombing, Wing ${w + 1})`, {
        fontFamily: FONT, fontSize: FS.tiny, fontStyle: "italic", color: "#5a4a34",
      }).setOrigin(0.5));
    } else {
      // the missing photo: a dotted outline, and KOBI's sticky note
      const fr = this.add.graphics();
      fr.lineStyle(2.5, 0x9a8668, 0.9);
      this.dashedRect(fr, -128, -150, 254, 296);
      pol.add(fr);
      pol.add(this.add.text(-2, -40, "( no photo )", {
        fontFamily: FONT, fontSize: FS.small, fontStyle: "italic", color: "#9a8668",
      }).setOrigin(0.5));
      const note = this.add.container(30, 66).setAngle(7);
      const ng = this.add.graphics();
      ng.fillStyle(0x000000, 0.18).fillRect(-76, -52, 158, 112);
      ng.fillStyle(0xffe38a, 1).fillRect(-80, -56, 158, 112);
      ng.fillStyle(0xe8c96a, 1).fillRect(-80, -56, 158, 12);
      note.add(ng);
      note.add(this.add.text(-1, 4, `You missed ${9 - count}.\nI counted.\n— K.O.B.I.`, {
        fontFamily: FONT, fontSize: FS.small, fontStyle: "bold italic", color: "#5a3a22", align: "center", lineSpacing: 4,
      }).setOrigin(0.5));
      this.makeKobi(note, 58, -38, 7, { lid: false });
      pol.add(note);
    }
    p.add(pol);
    // right leaf: heading + the data-core star stickers
    const rx = W / 2 + 240;
    p.add(this.add.text(rx, ay + 88, `WING ${w + 1}`, {
      fontFamily: FONT, fontSize: FS.title, fontStyle: "bold", color: "#5a3a22",
    }).setOrigin(0.5));
    p.add(this.add.text(rx, ay + 122, WORLD_INFO[w] ? WORLD_INFO[w].name : "", {
      fontFamily: FONT, fontSize: FS.small, fontStyle: "italic", color: "#7a5638",
    }).setOrigin(0.5));
    const sg = this.add.graphics();
    for (let i = 0; i < 9; i++) {
      const sx = rx - 96 + (i % 3) * 96;
      const sy = ay + 196 + Math.floor(i / 3) * 82;
      if (i < count) {
        this.star(sg, sx, sy, 22, 0xe8a93e, 1);
        this.star(sg, sx - 5, sy - 6, 6, 0xfff3c8, 0.9);
      } else {
        this.star(sg, sx, sy, 22, 0xb8a888, 0.8, false);
      }
    }
    p.add(sg);
    p.add(this.add.text(rx, ay + 448, `${count} / 9 data-cores`, {
      fontFamily: FONT, fontSize: FS.head, fontStyle: "bold", color: "#5a3a22",
    }).setOrigin(0.5));
    if (havePhoto) {
      p.add(this.add.text(rx, ay + 480, "ALL NINE! Bonus Bolt photo earned!", {
        fontFamily: FONT, fontSize: FS.mini, fontStyle: "italic", color: "#a06a1e",
      }).setOrigin(0.5));
    }
  }

  // spread 5 — the numbers page
  pageStats(W, H, p) {
    const { ay } = this.albumGeom;
    p.add(this.add.text(W / 2, ay + 92, "THE NUMBERS", {
      fontFamily: FONT, fontSize: FS.title, fontStyle: "bold", color: "#5a3a22",
    }).setOrigin(0.5));
    p.add(this.add.text(W / 2, ay + 126, "(KOBI counted. Twice.)", {
      fontFamily: FONT, fontSize: FS.small, fontStyle: "italic", color: "#7a5638",
    }).setOrigin(0.5));
    const photoCount = this.photos.filter(Boolean).length;
    const lines = [
      `${this.coreCount} / 36 data-cores`,
      `playtime: ${this.playtime}`,
      this.tumbleLine,
      `bonus Bolt photos: ${photoCount} / 4`,
      "puppies rescued: 1 / 1   ·   robots adopted: 1 / 1",
    ];
    lines.forEach((t, i) => {
      p.add(this.add.text(W / 2, ay + 190 + i * 54, t, {
        fontFamily: FONT, fontSize: FS.head, color: "#4c3a26",
      }).setOrigin(0.5));
    });
    const sg = this.add.graphics();
    this.star(sg, W / 2 - 320, ay + 108, 14, 0xe8a93e, 0.9);
    this.star(sg, W / 2 + 320, ay + 108, 14, 0xe8a93e, 0.9);
    p.add(sg);
  }

  // spread 6 — the crayon drawing: "the day we got KOBI" (carries RWD-03)
  pageCrayon(W, H, p) {
    const { ax, ay, aw, ah } = this.albumGeom;
    const g = this.add.graphics();
    // crayon-on-dark-paper page taped over the cream sheet
    g.fillStyle(0x221e38, 1).fillRoundedRect(ax + 34, ay + 34, aw - 68, ah - 110, 4);
    g.fillStyle(0xd9c8a8, 0.85).fillRect(ax + aw / 2 - 40, ay + 24, 80, 22); // tape
    // the GIANT scary eye (wobbly crayon rings — how the kids remember it)
    const ex = ax + 260, ey = ay + 240;
    for (let i = 0; i < 3; i++) {
      g.lineStyle(5 - i, 0xf6f0ff, 0.8).strokeCircle(ex + (i % 2 ? 3 : -2), ey + (i % 2 ? -2 : 3), 118 - i * 9);
    }
    g.fillStyle(0xff4dd2, 0.9).fillCircle(ex, ey, 44);
    g.fillStyle(0x221e38, 1).fillRect(ex - 7, ey - 40, 14, 80); // the slit pupil
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + 0.3;
      g.lineStyle(3, 0xffd94d, 0.6).lineBetween(
        ex + Math.cos(a) * 128, ey + Math.sin(a) * 128,
        ex + Math.cos(a) * 152, ey + Math.sin(a) * 152,
      );
    }
    p.add(g);
    // ...and tiny KOBI, asleep on Bolt's back, right beside it
    const nest = this.add.container(ax + aw - 300, ay + 300);
    this.makeBolt(nest, 0, 0, { scale: 1.9, body: 0xc9b8e8, dark: 0x8a7ab0, wag: false });
    this.makeKobi(nest, -10, -44, 12); // lid on = asleep
    const zg = this.add.graphics();
    zg.lineStyle(2.5, 0xf6f0ff, 0.8);
    [[14, -66, 8], [30, -84, 6], [44, -100, 4]].forEach(([zx, zy, zr]) => {
      zg.lineBetween(zx - zr, zy - zr, zx + zr, zy - zr);
      zg.lineBetween(zx + zr, zy - zr, zx - zr, zy + zr);
      zg.lineBetween(zx - zr, zy + zr, zx + zr, zy + zr);
    });
    nest.add(zg);
    p.add(nest);
    p.add(this.add.text(ax + aw / 2, ay + ah - 52, "“the day we got KOBI”", {
      fontFamily: FONT, fontSize: FS.head, fontStyle: "bold italic", color: "#5a3a22",
    }).setOrigin(0.5));
  }

  // --- ACT 3: THE SHARE CARD ---------------------------------------------------------
  buildShare(W, H, cont) {
    cont.add(this.add.rectangle(W / 2, H / 2, W, H, 0x02040a, 0.8));
    const card = this.add.container(W / 2, H / 2 - 16).setAngle(-1.5);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.45).fillRoundedRect(-392, -272, 796, 560, 12);
    g.fillStyle(0xfbf3df, 1).fillRoundedRect(-400, -282, 796, 560, 12);
    g.lineStyle(3, 0xd9c8a8, 1).strokeRoundedRect(-388, -270, 772, 536, 8);
    card.add(g);
    // headline — big crayon letters
    card.add(this.add.text(-2, -216, "WE BEAT", {
      fontFamily: FONT, fontSize: FS.h3, fontStyle: "bold", color: "#d84848",
    }).setOrigin(0.5).setAngle(-2));
    card.add(this.add.text(-2, -166, "BOLT BUDDIES!", {
      fontFamily: FONT, fontSize: FS.h2, fontStyle: "bold", color: "#d84848",
    }).setOrigin(0.5).setAngle(1.5));
    // left: the glowing-window art (the epilogue's final shot, postcard-sized)
    const art = this.add.container(-212, 6);
    const ag = this.add.graphics();
    ag.fillStyle(0x0b1030, 1).fillRoundedRect(-140, -96, 280, 192, 8);
    ag.fillStyle(0xeaf2ff, 0.8).fillCircle(-96, -62, 1.4).fillCircle(-30, -76, 1.2).fillCircle(60, -58, 1.4).fillCircle(104, -74, 1.2);
    ag.fillStyle(0xfff3d0, 0.95).fillCircle(96, -56, 13);
    ag.fillStyle(0x0c1226, 1).fillEllipse(0, 68, 250, 52).fillRect(-134, 68, 268, 26);
    ag.fillStyle(0x10162c, 1).fillRect(-42, 6, 84, 40);
    ag.fillStyle(0x0b1022, 1).fillTriangle(-52, 6, 52, 6, 0, -22);
    ag.fillStyle(0xffd9a0, 0.16).fillCircle(-2, 24, 30);
    ag.fillStyle(0xffd9a0, 0.95).fillRoundedRect(-16, 12, 30, 24, 4);
    ag.lineStyle(2, 0x8a5c34, 1).strokeCircle(-1, 27, 7);   // Bolt's curl in the window
    ag.fillStyle(0xff4dd2, 1).fillCircle(0, 26, 2.4);        // KOBI in the middle of it
    art.add(ag);
    card.add(art);
    // right: the buddies (P1 + P2), plus the whole family underneath
    const crew = this.add.container(198, -24);
    const beep = this.add.image(-64, 0, "robot_b").setScale(1.7);
    const boop = this.add.image(64, 0, "robot_o").setScale(1.7).setFlipX(true);
    crew.add([beep, boop]);
    crew.add(this.add.text(-64, 44, "P1", { fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: "#3a6ab0" }).setOrigin(0.5));
    crew.add(this.add.text(64, 44, "P2", { fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: "#b06a2a" }).setOrigin(0.5));
    this.makeBolt(crew, -8, 84, { scale: 1.15 });
    this.makeKobi(crew, 34, 68, 8, { lid: false });
    card.add(crew);
    // the facts (date + cores + medal + playtime)
    const facts = [
      this.dateStr,
      `${this.coreCount}/36 cores  ·  playtime: ${this.playtime}`,
      this.medal.title,
    ];
    facts.forEach((t, i) => {
      card.add(this.add.text(-2, 128 + i * 30, t, {
        fontFamily: FONT, fontSize: i === 2 ? FS.body : FS.small, fontStyle: i === 2 ? "bold" : "normal", color: "#4c3a26",
      }).setOrigin(0.5));
    });
    card.add(this.add.text(-2, 222, `“${TAGLINE}”`, {
      fontFamily: FONT, fontSize: FS.small, fontStyle: "italic", color: "#7a5638",
    }).setOrigin(0.5));
    card.add(this.add.text(-2, 254, FOOTER, {
      fontFamily: FONT, fontSize: FS.mini, color: "#9a8668",
    }).setOrigin(0.5));
    // KOBI's stamp of approval, top-right, properly crooked
    const stamp = this.add.container(288, -212).setAngle(12);
    const sg = this.add.graphics();
    sg.lineStyle(3, 0xd84fb8, 0.85).strokeRoundedRect(-84, -40, 168, 80, 8);
    sg.lineStyle(1.5, 0xd84fb8, 0.6).strokeRoundedRect(-77, -33, 154, 66, 6);
    stamp.add(sg);
    stamp.add(this.add.text(0, -8, "VERIFIED.\nI COUNTED.", {
      fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: "#d84fb8", align: "center",
    }).setOrigin(0.5));
    this.makeKobi(stamp, 0, 26, 6, { lid: false, ring: 0xd84fb8 });
    card.add(stamp);
    cont.add(card);
    this.tweens.add({ targets: card, y: H / 2 - 22, duration: 2400, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }
}
