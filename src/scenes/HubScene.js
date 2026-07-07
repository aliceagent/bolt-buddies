import Phaser from "phaser";
import { COLORS, WORLD_THEMES, FONT, FS, TEXT } from "../constants.js";
import { LEVELS, WORLD_INFO, KOBI_HUB_LINES } from "../levels/registry.js";
import { loadSave, totalCores } from "../save.js";
import { getRecord, fmtClock } from "../ux.js";
import { addGradient, addMotes } from "../backdrop.js";
import { initAudio, sfx, installMute, playTrack, playJingle } from "../audio.js";
import { pads, showPadToast } from "../pad.js";
import { drawWorldIcon } from "../worldIcons.js";
import { drawIris, irisMaxR } from "../ui/kit.js";


// Facility map: 4 wings x 3 chambers. Navigate with either player's keys.
export default class HubScene extends Phaser.Scene {
  constructor() {
    super("Hub");
  }

  init(data) {
    this.sel = data && typeof data.sel === "number" ? data.sel : null;
    this.justUnlocked = !!(data && data.unlock);
    this.fromClear = !!(data && data.iris); // arrived via the game->hub clear iris
    this.entering = false;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.save = loadSave();
    // Sprint 10: hidden defs (the tutorial) are appended to LEVELS but never laid
    // out as hub nodes — the sector map keeps exactly the 12 real chambers, so the
    // cursor must clamp to the node count, not LEVELS.length.
    this.hubCount = LEVELS.filter((l) => !l.hidden).length;
    if (this.sel === null) this.sel = Math.min(this.save.unlocked - 1, this.hubCount - 1);
    this.sel = Phaser.Math.Clamp(this.sel, 0, this.hubCount - 1);

    addGradient(this, 1);
    this.add.tileSprite(0, 0, W, H, "bggrid").setOrigin(0).setAlpha(0.22).setDepth(-8);
    addMotes(this, WORLD_THEMES[1].accent2);
    // P10: a KOBI iris OPENS on the destination node when we arrive from a level
    // clear (WebGL only; the suites run Canvas and take the plain fade-in so their
    // transition timing is unchanged). The iris-open is triggered at the end of
    // create() once node positions exist.
    this._webglIris = this.fromClear && this.game.renderer.type === Phaser.WEBGL;
    if (!this._webglIris) this.cameras.main.fadeIn(250, 4, 6, 20); // 250ms fade-in on entry
    this.add.text(W / 2, 46, "DYNACORE LABS — SECTOR MAP", {
      fontFamily: FONT, fontSize: FS.h3, fontStyle: "bold", color: TEXT.neon,
    }).setOrigin(0.5);
    // cores counter — chip with a mini core icon + a pooled count-up on entry
    this.buildCoresChip(W / 2, 82, totalCores(this.save), 36);

    // wing panels in a 2x2 grid
    this.nodes = [];
    this._u8ChipCount = 0; // probe introspection: # of U8 clock chips drawn
    const panelW = 560, panelH = 235;
    WORLD_INFO.forEach((info, wi) => {
      const theme = WORLD_THEMES[wi + 1] || WORLD_THEMES[1];
      const accent = theme.accent;
      const px = W / 2 + (wi % 2 === 0 ? -panelW - 12 : 12);
      const py = 120 + Math.floor(wi / 2) * (panelH + 18);
      // a wing reads "online" once any of its chambers is unlocked; otherwise it
      // gets the deliberate static / no-signal treatment.
      const worldUnlocked = (wi * 3) < this.save.unlocked;
      const g = this.add.graphics();
      g.fillStyle(COLORS.panel, 0.85).fillRoundedRect(px, py, panelW, panelH, 12);
      g.lineStyle(2, COLORS.panelEdge).strokeRoundedRect(px, py, panelW, panelH, 12);
      if (worldUnlocked) {
        // accent header bar + faint accent wash
        g.fillStyle(accent, 0.9).fillRoundedRect(px, py, panelW, 34, { tl: 12, tr: 12, bl: 0, br: 0 });
        g.fillStyle(accent, 0.12).fillRect(px, py + 34, panelW, panelH - 34);
      } else {
        this.drawLockedPanel(g, px, py, panelW, panelH, accent);
      }
      // world emblem: dark lens disc + drawn per-accent world icon (no emoji)
      const badge = this.add.graphics();
      badge.fillStyle(COLORS.dark, worldUnlocked ? 0.85 : 0.55).fillCircle(px + 30, py + 17, 15);
      drawWorldIcon(badge, wi + 1, px + 30, py + 17, 24, accent);
      this.add.text(px + 52, py + 17, `WORLD ${wi + 1} — ${info.name.toUpperCase()}`, {
        fontFamily: FONT, fontSize: FS.large, fontStyle: "bold",
        color: worldUnlocked ? "#0a0e1a" : "#6b7aa8",
      }).setOrigin(0, 0.5);
      this.add.text(px + 20, py + 52, info.skills, { fontFamily: FONT, fontSize: FS.small, color: "#7f8fc0" });

      // corridor connection lines between consecutive chambers in this wing
      const corridor = this.add.graphics();
      for (let li = 0; li < 3; li++) {
        const idx = wi * 3 + li;
        const lvl = LEVELS[idx];
        const nx = px + 105 + li * 180;
        const ny = py + 135;
        const unlocked = idx < this.save.unlocked;
        const completed = idx < this.save.unlocked - 1;
        if (li < 2) {
          const segLit = (idx + 1) < this.save.unlocked;
          const ax = nx + 34, bx = nx + 180 - 34;
          corridor.lineStyle(6, segLit ? accent : 0x1c2440, segLit ? 0.75 : 1);
          corridor.lineBetween(ax, ny, bx, ny);
          if (segLit) { corridor.lineStyle(2, 0xeaf2ff, 0.4).lineBetween(ax, ny, bx, ny); }
        }
        const circle = this.add.graphics({ x: nx, y: ny });
        if (worldUnlocked) this.drawNode(circle, lvl, unlocked, false, completed);
        else this.drawSealedNode(circle); // small sealed port over the static art
        const label = this.add.text(nx, ny - 2, unlocked ? lvl.id : "", {
          fontFamily: FONT, fontSize: FS.lead, fontStyle: "bold", color: TEXT.bright,
        }).setOrigin(0.5);
        // core pips (unlocked wings only — a static wing shows no data)
        if (worldUnlocked) {
          const cores = this.save.cores[lvl.id] || [false, false, false];
          cores.forEach((got, ci) => {
            this.add.image(nx - 18 + ci * 18, ny + 46, "core").setScale(0.6).setAlpha(got ? 1 : 0.16);
          });
        }
        // U8 (F15): tiny best-time clock chip above unlocked nodes that have a
        // stored record. Token-based (hudBg fill + world-accent border), with a
        // small drawn clock glyph. PRESERVED as-is (data source: getRecord).
        const rec = unlocked ? getRecord(lvl.id) : null;
        if (rec && typeof rec.bestTime === "number") {
          this.drawClockChip(nx, ny - 52, fmtClock(rec.bestTime), accent);
        }
        this.nodes.push({ idx, lvl, unlocked, completed, sealed: !worldUnlocked, circle, label, accent, x: nx, y: ny });
      }

      // SIGNAL LOST flicker line — deliberate "static" caption on a locked wing
      if (!worldUnlocked) {
        const sig = this.add.text(px + panelW / 2, py + panelH - 24, "· · SIGNAL LOST · ·", {
          fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: "#5f6f9e",
        }).setOrigin(0.5).setAlpha(0.7);
        this.tweens.add({
          targets: sig, alpha: 0.16, duration: 130, yoyo: true,
          repeat: -1, repeatDelay: 950, ease: "steps(2)",
        });
      }
    });

    // animated double selection ring + level name readout
    this.ring = this.add.image(0, 0, "reticle").setScale(1.5).setTint(0x59ff9c);
    this.ring2 = this.add.image(0, 0, "reticle").setScale(1.9).setTint(0x59ff9c).setAlpha(0.4);
    this.tweens.add({ targets: this.ring, scale: 1.65, duration: 500, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: this.ring2, scale: 2.1, alpha: 0.15, duration: 900, yoyo: true, repeat: -1, ease: "sine.inOut" });
    this.tweens.add({ targets: this.ring2, angle: 360, duration: 8000, repeat: -1 });

    this.nameText = this.add.text(W / 2, H - 92, "", {
      fontFamily: FONT, fontSize: FS.head, fontStyle: "bold", color: TEXT.good,
    }).setOrigin(0.5).setDepth(5);
    this.toastText = this.add.text(W / 2, H - 64, "", {
      fontFamily: FONT, fontSize: FS.body, color: TEXT.warn,
    }).setOrigin(0.5).setDepth(5);

    // KOBI marquee → scrolling ticker with a small eye prefix
    this.buildTicker(W, H);

    this.add.text(W / 2, 108, "move: A/D or ←/→ (worlds: W/S or ↑/↓) · enter: SPACE or L · O sound · ESC — main menu", {
      fontFamily: FONT, fontSize: FS.mini, color: TEXT.faint,
    }).setOrigin(0.5);

    this.updateSelection();

    installMute(this);

    if (this._webglIris) this.irisOpenFromNode();

    // map-room music (crossfades from a level track); if we arrived here having
    // just unlocked a new chamber, ring the unlock fanfare over the hub track.
    playTrack("hub");
    if (this.justUnlocked) {
      sfx.saveTick(); // progress-saved toast tick
      this.time.delayedCall(350, () => playJingle("jingle_unlock"));
      // ring burst + lock fade on the freshly unlocked node (selected on arrival)
      const node = this.nodes[this.sel];
      if (node) this.time.delayedCall(300, () => this.playUnlockAnim(node));
    }

    this.input.keyboard.addCapture("SPACE"); // keep Space from scrolling the page
    this.input.keyboard.on("keydown", (ev) => {
      initAudio();
      const c = ev.code;
      if (c === "KeyA" || c === "ArrowLeft") this.move(-1);
      else if (c === "KeyD" || c === "ArrowRight") this.move(1);
      else if (c === "KeyW" || c === "ArrowUp") this.move(-3);
      else if (c === "KeyS" || c === "ArrowDown") this.move(3);
      else if (c === "Space" || c === "KeyE" || c === "KeyL" || c === "Enter") this.enter();
      // S is world-row navigation on the hub, so sound settings open with O.
      else if (c === "KeyO") { sfx.menuSelect(); this.scene.start("Settings", { returnTo: "Hub" }); }
      else if (c === "Escape") this.scene.start("Title");
    });
  }

  // U7: pad1 navigates the sector map 1:1 with the keyboard handler — d-pad/stick
  // left/right = adjacent chamber, up/down = wing, A = enter, B = back to Title.
  update(time) {
    pads.poll(time);
    const p = pads.p(0);
    if (pads.anyButtonJust()) initAudio();
    const conn = pads.consumeConnected();
    if (conn) conn.forEach((idx) => showPadToast(this, idx));
    if (this.entering) return;
    if (p.leftJust) this.move(-1);
    else if (p.rightJust) this.move(1);
    if (p.upJust) this.move(-3);
    else if (p.downJust) this.move(3);
    if (p.confirmJust) this.enter();
    else if (p.backJust) this.scene.start("Title");
  }

  buildTicker(W, H) {
    // low silhouette skyline sits behind the whole bottom band
    this.buildSkyline(W, H);
    const y = H - 24;
    // fixed KOBI eye prefix at the left
    const eye = this.add.graphics().setDepth(6);
    eye.fillStyle(COLORS.dark, 1).fillRect(0, y - 12, 40, 24);
    eye.fillStyle(0xffffff, 0.9).fillCircle(18, y, 9);
    eye.fillStyle(COLORS.magenta, 1).fillCircle(20, y, 5);
    eye.fillStyle(0x2a0a1e, 1).fillCircle(21, y, 2.5);
    // occasional pooled blink — an eyelid (matches the dark backing) drops over
    // the eye and lifts. Single repeating tween, no per-frame allocation.
    const lid = this.add.graphics({ x: 18, y: y - 12 }).setDepth(6);
    lid.fillStyle(COLORS.dark, 1).fillRect(-11, 0, 22, 24);
    lid.scaleY = 0;
    this.tweens.add({
      targets: lid, scaleY: 1, duration: 85, yoyo: true, hold: 45,
      repeat: -1, repeatDelay: 2600, ease: "sine.inOut",
    });
    const line = KOBI_HUB_LINES[Math.floor(Math.random() * KOBI_HUB_LINES.length)];
    const t = this.add.text(W, y, line, {
      fontFamily: FONT, fontSize: FS.small, fontStyle: "italic", color: "#ff4dd2",
    }).setOrigin(0, 0.5).setAlpha(0.9).setDepth(5);
    const dist = W + t.width + 40;
    this.tweens.add({
      targets: t, x: -t.width - 40, duration: dist * 12, repeat: -1, ease: "linear",
      onRepeat: () => t.setX(W),
    });
  }

  // P10: a KOBI iris opens on the destination node (mirrors the game-side close).
  irisOpenFromNode() {
    const n = this.nodes[this.sel] || { x: this.scale.width / 2, y: this.scale.height / 2 };
    const g = this.add.graphics().setDepth(999).setScrollFactor(0);
    const st = { r: 0 };
    drawIris(g, n.x, n.y, 0);
    this.tweens.add({
      targets: st, r: irisMaxR(this, n.x, n.y), duration: 300, ease: "sine.out",
      onUpdate: () => drawIris(g, n.x, n.y, st.r),
      onComplete: () => g.destroy(),
    });
  }

  // Freshly unlocked node: a padlock fades up-and-out while two accent rings
  // burst outward, plus a P8 light-pool flash. Purely cosmetic — the node was
  // already drawn unlocked.
  playUnlockAnim(n) {
    // a temporary padlock (matches the locked-node glyph) that pops off
    const lock = this.add.graphics({ x: n.x, y: n.y }).setDepth(7);
    lock.fillStyle(0x48547a).fillRect(-8, -6, 16, 12);
    lock.lineStyle(3, 0x48547a).strokeCircle(0, -10, 6);
    this.tweens.add({
      targets: lock, alpha: 0, y: n.y - 22, duration: 460, delay: 240, ease: "cubic.in",
      onComplete: () => lock.destroy(),
    });
    // P10: light-pool flash (reuse P8's pooled radial). Additive glow WebGL-only.
    const flash = this.add.image(n.x, n.y, "lightpool").setDepth(6).setAlpha(0).setScale(0.4);
    if (this.game.renderer.type === Phaser.WEBGL) flash.setTint(n.accent).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: flash, alpha: { from: 0.55, to: 0 }, scale: 1.9, duration: 580, ease: "cubic.out",
      onComplete: () => flash.destroy(),
    });
    sfx.menuSelect();
    [0, 130].forEach((delay, i) => {
      const ring = this.add.image(n.x, n.y, "reticle").setTint(n.accent)
        .setScale(0.5).setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: ring, scale: 3.4 - i * 0.6, alpha: { from: 0.9, to: 0 },
        duration: 640, delay, ease: "cubic.out",
        onComplete: () => ring.destroy(),
      });
    });
  }

  // U8: a compact best-time chip — rounded hudBg plate, accent border, a small
  // drawn clock glyph, and the "m:ss" time. Purely presentational (no body, no
  // interaction); laid out in the established HUD chip language.
  drawClockChip(cx, cy, timeStr, accent) {
    this._u8ChipCount = (this._u8ChipCount || 0) + 1; // probe introspection only
    const accentHex = "#" + accent.toString(16).padStart(6, "0");
    const t = this.add.text(0, 0, timeStr, { fontFamily: FONT, fontSize: FS.mini, fontStyle: "bold", color: accentHex }).setOrigin(0, 0.5).setVisible(false);
    const cw = 26 + t.width; // clock glyph zone + label
    const x0 = cx - cw / 2;
    const g = this.add.graphics();
    g.fillStyle(COLORS.hudBg, 0.85).fillRoundedRect(x0, cy - 10, cw, 20, 7);
    g.lineStyle(1.5, accent, 0.7).strokeRoundedRect(x0, cy - 10, cw, 20, 7);
    // clock glyph: ring + two hands
    const gx = x0 + 12;
    g.lineStyle(1.5, accent, 0.95).strokeCircle(gx, cy, 5.5);
    g.lineBetween(gx, cy, gx, cy - 3.5);   // minute hand (up)
    g.lineBetween(gx, cy, gx + 3, cy + 1); // hour hand
    t.setPosition(x0 + 22, cy).setVisible(true).setDepth(1);
  }

  drawNode(g, lvl, unlocked, selected, completed) {
    g.clear();
    const fill = unlocked ? (selected ? 0x1e4a3a : 0x1c2a52) : 0x121830;
    const hi = unlocked ? (selected ? 0x2c6b52 : 0x27407a) : 0x1b2540;
    const edge = unlocked ? (selected ? 0x59ff9c : 0x44548c) : 0x2a3350;
    g.fillStyle(fill).fillCircle(0, 0, 34);
    // subtle radial shade: an inner top highlight + a lower ambient-occlusion
    // shadow (stacked discs — canvas-safe fake gradient, drawn once per select).
    g.fillStyle(hi, 0.55).fillCircle(0, -7, 22);
    g.fillStyle(0x000000, 0.18).fillCircle(0, 11, 25);
    g.lineStyle(3, edge).strokeCircle(0, 0, 34);
    if (completed) {
      // lit ring + tiny GREEN CHIP badge (bottom-right) with a checkmark
      g.lineStyle(2, 0x59ff9c, 0.7).strokeCircle(0, 0, 39);
      g.fillStyle(0x123a26, 1).fillCircle(24, 24, 11);
      g.lineStyle(2, 0x59ff9c, 0.9).strokeCircle(24, 24, 11);
      g.lineStyle(3, 0x59ff9c, 1);
      g.beginPath();
      g.moveTo(19, 24); g.lineTo(23, 28); g.lineTo(30, 20);
      g.strokePath();
    }
    if (!unlocked) {
      g.fillStyle(0x48547a).fillRect(-8, -6, 16, 12);
      g.lineStyle(3, 0x48547a).strokeCircle(0, -10, 6);
    }
  }

  // A small sealed port used in place of a full node on a static (locked) wing —
  // reads as a capped chamber and gives the selection ring a target to sit on.
  drawSealedNode(g) {
    g.clear();
    g.fillStyle(0x141c34, 1).fillCircle(0, 0, 11);
    g.lineStyle(1.5, 0x2a3350, 1).strokeCircle(0, 0, 11);
    g.fillStyle(0x0c1226, 1).fillCircle(0, 0, 4);
  }

  // Locked-wing body: dim blueprint grid + a big watermark padlock. Drawn into
  // the panel Graphics (behind the sealed nodes). The SIGNAL LOST caption + its
  // flicker tween are added by the caller.
  drawLockedPanel(g, px, py, panelW, panelH, accent) {
    g.fillStyle(0x1a2340, 0.95).fillRoundedRect(px, py, panelW, 34, { tl: 12, tr: 12, bl: 0, br: 0 });
    g.fillStyle(0x0c1226, 0.5).fillRect(px, py + 34, panelW, panelH - 34);
    // blueprint grid
    g.lineStyle(1, 0x22305a, 0.5);
    for (let gx = px + 24; gx < px + panelW - 4; gx += 32) g.lineBetween(gx, py + 36, gx, py + panelH - 4);
    for (let gy = py + 60; gy < py + panelH - 4; gy += 30) g.lineBetween(px + 3, gy, px + panelW - 3, gy);
    // big drawn padlock motif behind the sealed nodes (the "sealed wing" hero)
    const cx = px + panelW / 2, cy = py + 116;
    // shackle
    g.lineStyle(9, accent, 0.42);
    g.beginPath();
    g.arc(cx, cy - 14, 22, Math.PI, Math.PI * 2, false);
    g.strokePath();
    // body
    g.fillStyle(accent, 0.24).fillRoundedRect(cx - 32, cy - 2, 64, 50, 8);
    g.lineStyle(3, accent, 0.5).strokeRoundedRect(cx - 32, cy - 2, 64, 50, 8);
    // keyhole
    g.fillStyle(0x0a0e1a, 0.55).fillCircle(cx, cy + 30, 6);
    g.fillRect(cx - 2.5, cy + 30, 5, 12);
  }

  // Cores counter chip: hudBg plate + mini core icon + a pooled 0→total count-up
  // on scene entry. The tween runs once (not a per-frame update path).
  buildCoresChip(cx, cy, total, max) {
    const prefix = "DATA-CORES ";
    const finalStr = `${prefix}${total} / ${max}`;
    const measure = this.add.text(0, 0, finalStr, {
      fontFamily: FONT, fontSize: FS.small, fontStyle: "bold",
    }).setVisible(false);
    const iconW = 22, padX = 12;
    const cw = iconW + measure.width + padX * 2;
    measure.destroy();
    const x0 = cx - cw / 2;
    const g = this.add.graphics();
    g.fillStyle(COLORS.hudBg, 0.85).fillRoundedRect(x0, cy - 15, cw, 30, 9);
    g.lineStyle(1.5, COLORS.neon, 0.6).strokeRoundedRect(x0, cy - 15, cw, 30, 9);
    this.add.image(x0 + padX + 8, cy, "core").setScale(0.55);
    const label = this.add.text(x0 + padX + iconW, cy, `${prefix}0 / ${max}`, {
      fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: TEXT.neon,
    }).setOrigin(0, 0.5);
    if (total > 0) {
      const proxy = { n: 0 };
      this.tweens.add({
        targets: proxy, n: total, duration: 600, ease: "cubic.out",
        onUpdate: () => label.setText(`${prefix}${Math.round(proxy.n)} / ${max}`),
        onComplete: () => label.setText(finalStr),
      });
    }
  }

  // Low silhouette skyline behind the bottom ticker band — a fixed, built-once
  // row of dark buildings (deterministic pseudo-random, no per-frame alloc).
  buildSkyline(W, H) {
    const g = this.add.graphics().setDepth(3);
    const baseY = H - 38;
    let seed = 1337;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let x = 0;
    while (x < W) {
      const bw = 30 + Math.floor(rnd() * 46);
      const bh = 18 + Math.floor(rnd() * 46);
      g.fillStyle(0x0a1024, 0.9).fillRect(x, baseY - bh, bw, bh);
      if (rnd() > 0.5) g.fillStyle(0x35f0ff, 0.22).fillRect(x + 6, baseY - bh + 6, 3, 4);
      if (rnd() > 0.7) g.fillStyle(0xff4dd2, 0.22).fillRect(x + bw - 9, baseY - bh + 10, 3, 4);
      x += bw + 4 + Math.floor(rnd() * 10);
    }
    g.fillStyle(0x05070f, 1).fillRect(0, baseY, W, H - baseY);
    g.lineStyle(1, WORLD_THEMES[1].accent2, 0.15).lineBetween(0, baseY, W, baseY);
  }

  move(d) {
    const next = Phaser.Math.Clamp(this.sel + d, 0, this.hubCount - 1);
    if (next !== this.sel) {
      this.sel = next;
      sfx.menuMove();
      this.updateSelection();
    }
  }

  updateSelection() {
    this.nodes.forEach((n) => {
      if (n.sealed) this.drawSealedNode(n.circle);
      else this.drawNode(n.circle, n.lvl, n.unlocked, n.idx === this.sel, n.completed);
      n.circle.setScale(1); n.label.setScale(1);
    });
    const n = this.nodes[this.sel];
    this.ring.setPosition(n.x, n.y);
    this.ring2.setPosition(n.x, n.y);
    this.nameText.setText(n.unlocked ? `${n.lvl.id}  "${n.lvl.name}"` : `${n.lvl.id}  — locked`);
    this.toastText.setText("");
    // slight scale pulse on the selected node
    if (this.pulseTween) this.pulseTween.remove();
    const proxy = { s: 1 };
    this.pulseTween = this.tweens.add({
      targets: proxy, s: 1.08, duration: 620, yoyo: true, repeat: -1, ease: "sine.inOut",
      onUpdate: () => { n.circle.setScale(proxy.s); n.label.setScale(proxy.s); },
    });
  }

  enter() {
    if (this.entering) return;
    const n = this.nodes[this.sel];
    if (!n.unlocked) {
      sfx.lockedDeny();
      this.toastText.setText("KOBI: That wing is LOCKED. Doors are my whole THING.");
      return;
    }
    if (n.lvl.wip) {
      sfx.menuDeny();
      this.toastText.setText("KOBI: This wing is still under construction. Even I have limits. (coming soon)");
      return;
    }
    this.entering = true;
    sfx.levelEnter();
    // quick fade transition, then hand off to the level
    this.cameras.main.fadeOut(250, 4, 6, 20);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("Game", { levelIndex: n.idx });
    });
  }
}
