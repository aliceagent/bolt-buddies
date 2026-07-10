import Phaser from "phaser";
import { COLORS, WORLD_THEMES, FONT, FS, TEXT } from "../constants.js";
import { initAudio, sfx, playTrack, installMute } from "../audio.js";
import { pads, showPadToast } from "../pad.js";
import { menuBackdrop, chipRow, hexStr, mulColor } from "../ui/kit.js";
import { drawWorldIcon } from "../worldIcons.js";
import { openWalkthroughPlayer } from "../walkthrough/player.js";

const ACCENT = WORLD_THEMES[1].accent; // amber — the title-menu standard

// WALKTHROUGHS — a manifest-driven grid of per-level video cards.
//
// The grid renders EXACTLY what public/walkthroughs/manifest.json lists (the
// single source of truth): 6 entries today, more later, ZERO code changes —
// layout re-flows in rows of 3 and shrinks card height for up to ~12 entries.
// The manifest is fetched on first open and cached for the session; a fetch
// failure renders a "NO SIGNAL" card (never crashes).
//
// Input: arrows/WASD navigate, SPACE/ENTER/E/L opens, ESC returns to Title —
// plus full pointer/touch support (hover selects, click/tap opens; phone
// visitors get an on-screen ◀ TITLE button). Pad: d-pad + A/B, like Title.
//
// Selecting a card opens the DOM video player (src/walkthrough/player.js) and
// PAUSES this scene behind it — pausing disables this scene's keyboard AND
// pointer plumbing in one move, so the player owns input until it closes.
// MuteScene (always-on-top, its own scene) stays live throughout.
export default class WalkthroughScene extends Phaser.Scene {
  constructor() {
    super("Walkthroughs");
  }

  create() {
    const W = this.scale.width;
    menuBackdrop(this, 1);
    this.cameras.main.fadeIn(250, 4, 6, 20);

    this.add.text(W / 2, 64, "WALKTHROUGHS", {
      fontFamily: FONT, fontSize: FS.h1, fontStyle: "bold", color: TEXT.neon,
      stroke: "#0b3a44", strokeThickness: 8,
    }).setOrigin(0.5);
    this.add.text(W / 2, 112, "stuck in a chamber? watch the robot pros beat it!", {
      fontFamily: FONT, fontSize: FS.body, color: TEXT.dim,
    }).setOrigin(0.5);

    // key hints (shared chip row, title standard)
    chipRow(this, W / 2, 692, [
      { k: "←" }, { k: "→" }, { k: "↑" }, { k: "↓" }, { t: "choose" },
      { k: "SPACE" }, { k: "E" }, { k: "L" }, { k: "↵" }, { t: "watch" },
      { k: "ESC" }, { t: "back" },
    ], ACCENT, hexStr(ACCENT));

    // on-screen back affordance for pointer/touch visitors
    this.buildBackButton();

    this.entries = [];
    this.cards = [];
    this.sel = 0;
    this.cols = 3;
    this.player = null;
    this.dead = false;
    this._muteGraceUntil = 0;

    this.loadingTxt = this.add.text(W / 2, 380, "TUNING IN…", {
      fontFamily: FONT, fontSize: FS.title, fontStyle: "bold", color: TEXT.dim,
    }).setOrigin(0.5);

    playTrack("title"); // same track as Title — no-op when arriving from it
    installMute(this);

    this.input.keyboard.addCapture("SPACE");
    this.input.keyboard.on("keydown", (ev) => {
      initAudio();
      const c = ev.code;
      if (c === "ArrowLeft" || c === "KeyA") this.moveSel(-1, 0);
      else if (c === "ArrowRight" || c === "KeyD") this.moveSel(1, 0);
      else if (c === "ArrowUp" || c === "KeyW") this.moveSel(0, -1);
      else if (c === "ArrowDown" || c === "KeyS") this.moveSel(0, 1);
      else if (["Space", "KeyE", "KeyL", "Enter"].includes(c)) this.openSel();
      else if (c === "Escape") this.back();
    });

    this.events.once("shutdown", () => {
      this.dead = true;
      if (this.player) this.player.close(); // cleanup is sacred
    });

    // manifest = the single source of truth (fetched once, cached in-scene for
    // the session; a redeploy with more entries just renders more cards)
    if (this.manifestCache()) {
      this.buildGrid(this.manifestCache());
    } else {
      fetch("walkthroughs/manifest.json")
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then((m) => {
          const list = m && Array.isArray(m.videos) ? m.videos : [];
          this.registry.set("wtManifest", list);
          if (!this.dead) this.buildGrid(list);
        })
        .catch(() => { if (!this.dead) this.buildNoSignal(); });
    }

    // probe surface (tools/snap_walkthrough.mjs)
    window.__BB = window.__BB || {};
    window.__BB.wt = {
      _scene: this,
      get count() { return this._scene.cards.length; },
      get sel() { return this._scene.sel; },
      get playerOpen() { return !!this._scene.player; },
      get noSignal() { return !!this._scene.noSignalShown; },
      open: (i) => this.open(i),
    };
  }

  // session cache: survives scene restarts without refetching (game registry —
  // no new localStorage keys)
  manifestCache() {
    return this.registry.get("wtManifest") || null;
  }

  // U7-style pad drive, 1:1 with the keyboard handler. Paused while the player
  // is open (scene pause), so pads can't fight the video. Zero per-frame alloc.
  update(time) {
    const mute = this.scene.get("Mute");
    if (mute && mute.open) this._muteGraceUntil = time + 350;
    pads.poll(time);
    const p = pads.p(0);
    if (pads.anyButtonJust()) initAudio();
    const conn = pads.consumeConnected();
    if (conn) conn.forEach((idx) => showPadToast(this, idx));
    if (p.upJust) this.moveSel(0, -1);
    else if (p.downJust) this.moveSel(0, 1);
    if (p.leftJust) this.moveSel(-1, 0);
    else if (p.rightJust) this.moveSel(1, 0);
    if (p.confirmJust) this.openSel();
    else if (p.backJust) this.back();
  }

  buildBackButton() {
    const cont = this.add.container(76, 40);
    const g = this.add.graphics();
    g.fillStyle(COLORS.hudBg, 0.82).fillRoundedRect(-58, -18, 116, 36, 9);
    g.lineStyle(2, ACCENT, 0.7).strokeRoundedRect(-58, -18, 116, 36, 9);
    const t = this.add.text(0, 0, "◀ TITLE", {
      fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: hexStr(ACCENT),
    }).setOrigin(0.5);
    cont.add([g, t]);
    const hit = this.add.rectangle(76, 40, 120, 40, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerup", () => { if (!this.pointerBlocked()) this.back(); });
  }

  // Phaser input is per-scene, so a click that closes the always-on-top mute
  // dropdown ALSO reaches this scene's hit zones. The dropdown closes on
  // pointerDOWN while cards activate on pointerUP of the SAME click, so a
  // live read races — instead update() keeps a short grace window alive while
  // the dropdown is open, and pointer activations inside it are swallowed.
  pointerBlocked() {
    const mute = this.scene.get("Mute");
    return !!(mute && mute.open) || this.time.now < this._muteGraceUntil;
  }

  // --- the level-card grid ----------------------------------------------------
  buildGrid(entries) {
    if (this.dead) return;
    if (this.loadingTxt) { this.loadingTxt.destroy(); this.loadingTxt = null; }
    if (!entries.length) { this.buildNoSignal(); return; }
    this.entries = entries;

    const W = this.scale.width;
    const n = entries.length;
    const rows = Math.ceil(n / this.cols);
    // grid band between the header and the hint row; card height shrinks as
    // rows grow (6 → 2 rows of tall cards, 12 → 4 rows of compact ones)
    const top = 152, bottom = 660, gapY = 16;
    const cardW = 340, gapX = 26;
    const cardH = Math.min(150, Math.floor((bottom - top - (rows - 1) * gapY) / rows));
    const gridH = rows * cardH + (rows - 1) * gapY;
    const y0 = top + (bottom - top - gridH) / 2 + cardH / 2;

    this.cards = entries.map((e, i) => {
      const row = Math.floor(i / this.cols);
      const rowCount = Math.min(this.cols, n - row * this.cols); // centre a short last row
      const col = i % this.cols;
      const rowW = rowCount * cardW + (rowCount - 1) * gapX;
      const x = W / 2 - rowW / 2 + cardW / 2 + col * (cardW + gapX);
      const y = y0 + row * (cardH + gapY);
      return this.buildCard(e, i, x, y, cardW, cardH);
    });
    this.refreshCards();
  }

  buildCard(e, i, x, y, w, h) {
    const theme = WORLD_THEMES[e.world] || WORLD_THEMES[1];
    const accent = theme.accent;
    const cont = this.add.container(x, y);
    const g = this.add.graphics(); // selection border/fill — redrawn on select
    cont.add(g);

    // world icon disc (left)
    const ig = this.add.graphics();
    const ix = -w / 2 + 42;
    ig.fillStyle(COLORS.panel, 0.9).fillCircle(ix, 0, Math.min(30, h / 2 - 12));
    ig.lineStyle(2, accent, 0.8).strokeCircle(ix, 0, Math.min(30, h / 2 - 12));
    drawWorldIcon(ig, e.world || 1, ix, 0, Math.min(34, h * 0.32), accent);
    cont.add(ig);

    // level id + name (left-aligned next to the icon)
    const tx = -w / 2 + 84;
    const id = this.add.text(tx, -h * 0.16, "CHAMBER " + e.id, {
      fontFamily: FONT, fontSize: FS.lead, fontStyle: "bold", color: hexStr(accent),
    }).setOrigin(0, 0.5);
    const name = this.add.text(tx, h * 0.16, e.name, {
      fontFamily: FONT, fontSize: FS.small, color: TEXT.body,
    }).setOrigin(0, 0.5);
    cont.add([id, name]);

    // play glyph (right): accent ring + triangle
    const pg = this.add.graphics();
    const px = w / 2 - 38;
    pg.fillStyle(COLORS.dark, 0.85).fillCircle(px, 0, 17);
    pg.lineStyle(2, accent, 0.95).strokeCircle(px, 0, 17);
    pg.fillStyle(accent, 1).fillTriangle(px - 5, -8, px - 5, 8, px + 9, 0);
    cont.add(pg);

    // pointer: hover selects, click/tap opens (phones welcome)
    const hit = this.add.rectangle(x, y, w, h, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => this.selectIndex(i));
    hit.on("pointerup", () => {
      if (this.pointerBlocked()) return;
      this.selectIndex(i);
      this.openSel();
    });

    return { e, cont, g, w, h, accent };
  }

  drawCard(card, on) {
    const g = card.g;
    const hw = card.w / 2, hh = card.h / 2;
    g.clear();
    if (on) {
      g.fillStyle(mulColor(card.accent, 0.16), 0.92).fillRoundedRect(-hw, -hh, card.w, card.h, 12);
      g.lineStyle(3, card.accent, 1).strokeRoundedRect(-hw, -hh, card.w, card.h, 12);
      g.lineStyle(6, card.accent, 0.18).strokeRoundedRect(-hw - 4, -hh - 4, card.w + 8, card.h + 8, 14);
    } else {
      g.fillStyle(COLORS.hudBg, 0.78).fillRoundedRect(-hw, -hh, card.w, card.h, 12);
      g.lineStyle(2, card.accent, 0.4).strokeRoundedRect(-hw, -hh, card.w, card.h, 12);
    }
  }

  refreshCards() {
    this.cards.forEach((c, i) => {
      const on = i === this.sel;
      this.drawCard(c, on);
      c.cont.setScale(on ? 1.04 : 1);
    });
  }

  moveSel(dx, dy) {
    const n = this.cards.length;
    if (!n) return;
    let s = this.sel;
    if (dx) {
      s = (s + dx + n) % n; // horizontal wraps through the whole list
    } else if (dy) {
      s += dy * this.cols;
      if (s < 0) return;
      if (s >= n) {
        // stepping below a full row onto a short last row lands on its last card
        if (Math.floor(this.sel / this.cols) < Math.floor((n - 1) / this.cols)) s = n - 1;
        else return;
      }
    }
    if (s === this.sel) return;
    this.sel = s;
    sfx.menuMove();
    this.refreshCards();
  }

  selectIndex(i) {
    if (i < 0 || i >= this.cards.length || i === this.sel) return;
    this.sel = i;
    sfx.menuMove();
    this.refreshCards();
  }

  openSel() {
    this.open(this.sel);
  }

  open(i) {
    const e = this.entries[i];
    if (!e || this.player || this.dead) return;
    sfx.menuSelect();
    initAudio(); // the selection gesture — unlock audio before the video starts
    this.player = openWalkthroughPlayer(e, {
      canvas: this.game.canvas,
      accent: (WORLD_THEMES[e.world] || WORLD_THEMES[1]).accent,
      onClose: () => {
        this.player = null;
        if (!this.dead) this.scene.resume();
      },
    });
    // freeze the grid behind the overlay: pausing disables this scene's
    // keyboard, pointer and pad handling in one move (MuteScene stays live)
    this.scene.pause();
  }

  // fetch failed — a broken-TV "NO SIGNAL" card instead of a crash
  buildNoSignal() {
    if (this.loadingTxt) { this.loadingTxt.destroy(); this.loadingTxt = null; }
    this.noSignalShown = true;
    const W = this.scale.width;
    const cx = W / 2, cy = 400, w = 460, h = 220;
    const g = this.add.graphics();
    g.fillStyle(COLORS.hudBg, 0.9).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    g.lineStyle(3, COLORS.hazard, 0.9).strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    g.lineStyle(6, COLORS.hazard, 0.16).strokeRoundedRect(cx - w / 2 - 4, cy - h / 2 - 4, w + 8, h + 8, 16);
    // static-y scanlines
    g.fillStyle(COLORS.panelEdge, 0.35);
    for (let y = cy - h / 2 + 14; y < cy + h / 2 - 14; y += 10) g.fillRect(cx - w / 2 + 12, y, w - 24, 2);
    this.add.text(cx, cy - 30, "NO SIGNAL", {
      fontFamily: FONT, fontSize: FS.h2, fontStyle: "bold", color: TEXT.warn,
    }).setOrigin(0.5);
    this.add.text(cx, cy + 34, "couldn't tune in the walkthrough channel.\ncheck your connection and come back!", {
      fontFamily: FONT, fontSize: FS.body, color: TEXT.body, align: "center", lineSpacing: 6,
    }).setOrigin(0.5);
  }

  back() {
    if (this.leaving) return;
    this.leaving = true;
    sfx.menuSelect();
    this.cameras.main.fadeOut(250, 4, 6, 20);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Title"));
  }
}
