import Phaser from "phaser";
import { COLORS, WORLD_THEMES, FONT, FONT_DISPLAY, FS, TEXT } from "../constants.js";
import { LEVELS, WORLD_INFO, KOBI_HUB_LINES } from "../levels/registry.js";
import { loadSave, totalCores, campaignComplete } from "../save.js";
import { getRecord, fmtClock } from "../ux.js";
import { addGradient, addMotes } from "../backdrop.js";
import { initAudio, sfx, installMute, playTrack, playJingle } from "../audio.js";
import { pads, showPadToast } from "../pad.js";
import { drawWorldIcon } from "../worldIcons.js";
import { irisMaxR, runIris } from "../ui/kit.js";
import { MOTION } from "../anim/motion.js";
import { ringGlow, glassPanel, fakeRadial, specular } from "../ui/paint.js";


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
    // GFX4 F4b: a KOBI iris OPENS on the destination node on EVERY hub arrival
    // (both tiers — the Canvas iris cost was measured to hold >=40fps). Replaces
    // the plain fade-in; the iris is triggered at the end of create() once node
    // positions exist (it covers the screen from the first render, so no flash).
    this.add.text(W / 2, 46, "DYNACORE LABS — SECTOR MAP", {
      fontFamily: FONT_DISPLAY, fontSize: FS.h3, fontStyle: "bold", color: TEXT.neon,
    }).setOrigin(0.5);
    // cores counter — chip with a mini core icon + a pooled count-up on entry
    this.buildCoresChip(W / 2, 82, totalCores(this.save), 36);
    // W3W4 L43: campaign complete (all 12 chambers, read from `unlocked`) —
    // a small "RESCUED!" flourish beside the cores chip: Bolt's silhouette dot
    // + amber tail-light, home. All-nodes-cleared checkmarks already show.
    if (campaignComplete(this.save)) this.buildRescuedChip(W / 2 + 236, 82);

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
      // GFX4 F4a: world PREVIEW poster behind the panel, UNDER the glass so the
      // frosted glass treatment reads over it. Lit variant (≈0.35) for online
      // wings; the baked DIM variant for sealed wings (darker+muted baked in — no
      // runtime tint, Canvas-safe). Inset by the panel radius (12) so the strip's
      // square corners stay under the rounded glass fill (no corner poke-out).
      const pvIn = 12;
      const pvKey = worldUnlocked ? `worldPreview${wi + 1}` : `worldPreviewDim${wi + 1}`;
      if (this.textures.exists(pvKey)) {
        this.add.image(px + pvIn, py + pvIn, pvKey)
          .setOrigin(0, 0)
          .setDisplaySize(panelW - pvIn * 2, panelH - pvIn * 2)
          .setAlpha(worldUnlocked ? 0.42 : 0.42);
      }
      const g = this.add.graphics();
      if (worldUnlocked) {
        // GFX2 "Lumen Lab" (V7): online wing = frosted glass panel (fill+sheen+
        // top-lip+accent glow ring), then an accent header bar + faint body wash.
        // GFX4 F4a: fill dialled 0.85->0.66 so the world PREVIEW poster behind it
        // reads THROUGH the (now genuinely frosted) glass; the glass treatment
        // (sheen/lip/border/glow/header) still reads over the poster.
        glassPanel(g, {
          x: px, y: py, w: panelW, h: panelH, r: 12, fill: COLORS.panel, fillA: 0.66,
          accent, borderW: 2, borderA: 0.9, glow: true, glowA: 0.14,
        });
        g.fillStyle(accent, 0.9).fillRoundedRect(px, py, panelW, 34, { tl: 12, tr: 12, bl: 0, br: 0 });
        g.fillStyle(accent, 0.1).fillRect(px, py + 34, panelW, panelH - 34);
      } else {
        // sealed wing = dim glass base under the blueprint grid + padlock hero.
        glassPanel(g, {
          x: px, y: py, w: panelW, h: panelH, r: 12, fill: COLORS.panel, fillA: 0.55,
          accent, borderW: 2, borderA: 0.3, glow: false, sheenA: 0.03,
        });
        this.drawLockedPanel(g, px, py, panelW, panelH, accent);
      }
      // world emblem: dark lens disc + drawn per-accent world icon (no emoji)
      const badge = this.add.graphics();
      badge.fillStyle(COLORS.dark, worldUnlocked ? 0.85 : 0.55).fillCircle(px + 30, py + 17, 15);
      drawWorldIcon(badge, wi + 1, px + 30, py + 17, 24, accent);
      this.add.text(px + 52, py + 17, `WORLD ${wi + 1} — ${info.name.toUpperCase()}`, {
        fontFamily: FONT_DISPLAY, fontSize: FS.large, fontStyle: "bold",
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
          // GFX2 "Lumen Lab" (V7): corridors read as light-tubes. Lit = soft accent
          // halo → accent tube → bright white core; otherwise a dim dark conduit.
          if (segLit) {
            corridor.lineStyle(12, accent, 0.1).lineBetween(ax, ny, bx, ny);
            corridor.lineStyle(8, accent, 0.28).lineBetween(ax, ny, bx, ny);
            corridor.lineStyle(6, accent, 0.8).lineBetween(ax, ny, bx, ny);
            corridor.lineStyle(2, 0xeaf2ff, 0.55).lineBetween(ax, ny, bx, ny);
          } else {
            corridor.lineStyle(6, 0x1c2440, 1).lineBetween(ax, ny, bx, ny);
            corridor.lineStyle(2, 0x2a3350, 0.6).lineBetween(ax, ny, bx, ny);
          }
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
      fontFamily: FONT_DISPLAY, fontSize: FS.head, fontStyle: "bold", color: TEXT.good,
    }).setOrigin(0.5).setDepth(5);
    this.toastText = this.add.text(W / 2, H - 64, "", {
      fontFamily: FONT, fontSize: FS.body, color: TEXT.warn,
    }).setOrigin(0.5).setDepth(5);

    // KOBI marquee → scrolling ticker with a small eye prefix
    this.buildTicker(W, H);

    this.add.text(W / 2, 108, "move: A/D or ←/→ (worlds: W/S or ↑/↓) · enter: SPACE or L · O sound · ESC — main menu", {
      fontFamily: FONT, fontSize: FS.mini, color: TEXT.faint,
    }).setOrigin(0.5);

    // GFX3 G5: hub life — the marching route line (retargeted by updateSelection)
    // and the rare completed-node glints. Pools built once; no per-frame alloc.
    this.buildHubLife();

    this.updateSelection();

    installMute(this);

    this.irisOpenFromNode();

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

    // Mouse/touch: hover a chamber to select it, click to enter (keyboard + pad
    // still work identically). A locked chamber click gives the same KOBI toast
    // as pressing enter on it. initAudio() rides the pointer gesture (sound
    // unlock for mouse-only players).
    this.nodes.forEach((node, k) => {
      const hit = this.add.zone(node.x, node.y, 58, 58)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerover", () => {
        if (this.entering || this.sel === k) return;
        this.sel = k; sfx.menuMove(); this.updateSelection();
      });
      hit.on("pointerup", () => {
        initAudio();
        if (this.entering) return;
        if (this.sel !== k) { this.sel = k; this.updateSelection(); }
        this.enter();
      });
    });
  }

  // U7: pad1 navigates the sector map 1:1 with the keyboard handler — d-pad/stick
  // left/right = adjacent chamber, up/down = wing, A = enter, B = back to Title.
  update(time, delta) {
    pads.poll(time);
    const p = pads.p(0);
    if (pads.anyButtonJust()) initAudio();
    const conn = pads.consumeConnected();
    if (conn) conn.forEach((idx) => showPadToast(this, idx));
    this.updateHubEye(delta || 16); // A11: ticker eye follows the selected node
    if (this.entering) return;
    if (p.leftJust) this.move(-1);
    else if (p.rightJust) this.move(1);
    if (p.upJust) this.move(-3);
    else if (p.downJust) this.move(3);
    if (p.confirmJust) this.enter();
    else if (p.backJust) this.scene.start("Title");
  }

  // A11: the KOBI ticker eye's pupil follows the currently selected node as the
  // player moves across the sector map. Frame-rate-independent lerp toward the
  // node's screen direction (FL-013 form), clamped to a small offset inside the
  // sclera. Cosmetic; never touches selection/navigation.
  updateHubEye(delta) {
    if (!this.hubPupil || !this.nodes || !this.nodes.length) return;
    const E = MOTION.HUB_EYE;
    const n = this.nodes[this.sel];
    let tx = 0, ty = 0;
    if (n) {
      const dx = n.x - this.hubEye.cx, dy = n.y - this.hubEye.cy;
      const d = Math.hypot(dx, dy) || 1;
      tx = (dx / d) * E.range;
      ty = (dy / d) * E.range;
    }
    const lerp = 1 - Math.pow(1 - E.ease / 60, (delta / 1000) * 60);
    this.hubPupilOff.x += (tx - this.hubPupilOff.x) * lerp;
    this.hubPupilOff.y += (ty - this.hubPupilOff.y) * lerp;
    this.hubPupil.setPosition(this.hubEye.cx + this.hubPupilOff.x, this.hubEye.cy + this.hubPupilOff.y);
  }

  buildTicker(W, H) {
    // low silhouette skyline sits behind the whole bottom band
    this.buildSkyline(W, H);
    const y = H - 24;
    // fixed KOBI eye prefix at the left
    const eye = this.add.graphics().setDepth(6);
    // GFX2 "Lumen Lab": glassier sclera + a soft magenta glow seam on the housing.
    eye.fillStyle(COLORS.dark, 1).fillRect(0, y - 12, 40, 24);
    ringGlow(eye, { x: 18, y, r: 9.5, color: COLORS.magenta, width: 1.5 });
    eye.fillStyle(0xf6f0ff, 0.95).fillCircle(18, y, 9); // glassy sclera
    eye.fillStyle(0xffffff, 0.5).fillEllipse(15, y - 3, 6, 3); // sheen
    // A11: the magenta iris/pupil is its OWN object so it can FOLLOW the selected
    // node as the player moves across the sector map (pupil-follow lerp in update()).
    // Drawn at local origin, positioned at the sclera centre + a followed offset.
    const pupil = this.add.graphics().setDepth(6);
    pupil.fillStyle(COLORS.magenta, 0.28).fillCircle(0, 0, 7); // deep iris glow
    pupil.fillStyle(COLORS.magenta, 1).fillCircle(0, 0, 5);
    pupil.fillStyle(0x2a0a1e, 1).fillCircle(0.8, 0, 2.5);
    this.hubPupil = pupil;
    this.hubEye = { cx: 18, cy: y };
    this.hubPupilOff = { x: 0, y: 0 }; // smoothed follow offset (px)
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

  // GFX4 F4b: a KOBI iris opens on the destination node (mirrors the game-side
  // close). 250ms — matched to the fade-in it replaces so hub arrival timing is
  // unchanged. runIris owns the per-transition create/destroy + shutdown cleanup.
  irisOpenFromNode() {
    const n = this.nodes[this.sel] || { x: this.scale.width / 2, y: this.scale.height / 2 };
    runIris(this, { cx: n.x, cy: n.y, from: 0, to: irisMaxR(this, n.x, n.y), duration: 250, ease: "sine.out" });
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
    // GFX4 F4c: hub records row (best-time chips) — setResolution(2) for a crisp
    // small record time; its x is pixel-snapped below (measured negligible cost,
    // hub-only text — F4-D3).
    const t = this.add.text(0, 0, timeStr, { fontFamily: FONT, fontSize: FS.mini, fontStyle: "bold", color: accentHex }).setOrigin(0, 0.5).setResolution(2).setVisible(false);
    const cw = 26 + t.width; // clock glyph zone + label
    const x0 = cx - cw / 2;
    const g = this.add.graphics();
    // GFX2 "Lumen Lab" (V7): glass chip backing (fill+sheen+top-lip+accent border).
    glassPanel(g, { x: x0, y: cy - 10, w: cw, h: 20, r: 7, fill: COLORS.hudBg, fillA: 0.85, accent, borderW: 1.5, borderA: 0.7, glow: false });
    // clock glyph: ring + two hands
    const gx = x0 + 12;
    g.lineStyle(1.5, accent, 0.95).strokeCircle(gx, cy, 5.5);
    g.lineBetween(gx, cy, gx, cy - 3.5);   // minute hand (up)
    g.lineBetween(gx, cy, gx + 3, cy + 1); // hour hand
    t.setPosition(Math.round(x0 + 22), cy).setVisible(true).setDepth(1);
  }

  drawNode(g, lvl, unlocked, selected, completed) {
    g.clear();
    const fill = unlocked ? (selected ? 0x1e4a3a : 0x1c2a52) : 0x121830;
    const hi = unlocked ? (selected ? 0x2c6b52 : 0x27407a) : 0x1b2540;
    const edge = unlocked ? (selected ? 0x59ff9c : 0x44548c) : 0x2a3350;
    // GFX2 "Lumen Lab" (V7): unlocked chambers read as glowing gem discs — a soft
    // fakeRadial bloom under the disc (green when selected, cyan otherwise).
    if (unlocked) {
      const glowCol = selected ? 0x59ff9c : 0x35f0ff;
      fakeRadial(g, { x: 0, y: 0, r: 44, color: glowCol, steps: 4, aCenter: selected ? 0.22 : 0.1, aEdge: 0 });
    }
    g.fillStyle(fill).fillCircle(0, 0, 34);
    // subtle radial shade: an inner top highlight + a lower ambient-occlusion
    // shadow (stacked discs — canvas-safe fake gradient, drawn once per select).
    g.fillStyle(hi, 0.55).fillCircle(0, -7, 22);
    g.fillStyle(0x000000, 0.18).fillCircle(0, 11, 25);
    g.lineStyle(3, edge).strokeCircle(0, 0, 34);
    // glossy specular dab (upper-left) so the disc reads as a polished gem
    if (unlocked) specular(g, { x: -11, y: -14, w: 8, h: 4.5, a: 0.5 });
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
    // subtle cold halo so the capped port still reads on the dim glass
    fakeRadial(g, { x: 0, y: 0, r: 15, color: 0x2a3350, steps: 3, aCenter: 0.18, aEdge: 0 });
    g.fillStyle(0x141c34, 1).fillCircle(0, 0, 11);
    g.lineStyle(1.5, 0x2a3350, 1).strokeCircle(0, 0, 11);
    g.fillStyle(0x0c1226, 1).fillCircle(0, 0, 4);
  }

  // Locked-wing body: dim blueprint grid + a big watermark padlock. Drawn into
  // the panel Graphics (behind the sealed nodes). The SIGNAL LOST caption + its
  // flicker tween are added by the caller.
  drawLockedPanel(g, px, py, panelW, panelH, accent) {
    g.fillStyle(0x1a2340, 0.95).fillRoundedRect(px, py, panelW, 34, { tl: 12, tr: 12, bl: 0, br: 0 });
    // GFX4 F4a: body dark dialled 0.5->0.34 so the baked DIM world preview reads
    // faintly behind the blueprint grid + padlock (sealed wings stay clearly dim).
    g.fillStyle(0x0c1226, 0.34).fillRect(px, py + 34, panelW, panelH - 34);
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
    // GFX2 "Lumen Lab" (V7): glass cores chip.
    glassPanel(g, { x: x0, y: cy - 15, w: cw, h: 30, r: 9, fill: COLORS.hudBg, fillA: 0.85, accent: COLORS.neon, borderW: 1.5, borderA: 0.6, glow: false });
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

  // W3W4 L43: the campaign-complete flourish — a compact "BOLT RESCUED!" chip
  // (hudBg plate + a tiny puppy glyph with his amber tail-light) in the cores
  // chip's established language. Purely presentational.
  buildRescuedChip(cx, cy) {
    const label = this.add.text(0, 0, "BOLT RESCUED!", {
      fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: "#ffd9a0",
    }).setOrigin(0, 0.5).setVisible(false);
    const iconW = 30, padX = 12;
    const cw = iconW + label.width + padX * 2;
    const x0 = cx - cw / 2;
    const g = this.add.graphics();
    // GFX2 "Lumen Lab" (V7): glass rescued chip.
    glassPanel(g, { x: x0, y: cy - 15, w: cw, h: 30, r: 9, fill: COLORS.hudBg, fillA: 0.85, accent: 0xffb347, borderW: 1.5, borderA: 0.7, glow: false });
    // the tiny home-safe puppy glyph (title vocabulary, 20px)
    const gx = x0 + padX + 9;
    g.fillStyle(0xd9dee8, 1).fillRoundedRect(gx - 8, cy - 3, 15, 7, 3); // body
    g.fillStyle(0xd9dee8, 1).fillCircle(gx + 7, cy - 3, 4);             // head
    g.fillStyle(0x8b93a8, 1).fillTriangle(gx + 4, cy - 10, gx + 8, cy - 9, gx + 6, cy - 4); // ear
    g.fillStyle(0xffb347, 1).fillCircle(gx - 9, cy - 7, 2.2);           // tail-light
    label.setPosition(x0 + padX + iconW, cy).setVisible(true);
    label.setAlpha(0);
    this.tweens.add({ targets: label, alpha: 1, duration: 500, delay: 300 });
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
    // T3 (D7): selection change clears the toast (and cancels its auto-clear timer).
    if (this._toastTimer) { this._toastTimer.remove(); this._toastTimer = null; }
    this.toastText.setText("");
    // slight scale pulse on the selected node
    if (this.pulseTween) this.pulseTween.remove();
    const proxy = { s: 1 };
    this.pulseTween = this.tweens.add({
      targets: proxy, s: 1.08, duration: 620, yoyo: true, repeat: -1, ease: "sine.inOut",
      onUpdate: () => { n.circle.setScale(proxy.s); n.label.setScale(proxy.s); },
    });
    // GFX3 G5: re-aim the route line at the new selection (composes with the
    // selection pulse above — separate objects, G2-D2 untouched).
    this.retargetRoute();
  }

  // GFX3 G5 — hub life (both tiers, cheap tweens; no per-frame allocation).
  //   Route line: a fixed pool of soft dots that MARCH from the last completed
  //     node to the current selection. Each dot owns ONE persistent alpha-cycle
  //     tween with a per-index phase delay, so a bright crest sweeps start->end;
  //     retargetRoute() only repositions/toggles the pooled dots (never rebuilds
  //     tweens), so selection changes can't leak.
  //   Glints: one additive star per completed node, a rare (6-12s) scale/fade
  //     twinkle on a staggered delay — the map reads as alive without motion noise.
  buildHubLife() {
    // soft round route dot, baked once (boot-safe: guarded, drawn at most once).
    if (!this.textures.exists("hubdot")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 0.22).fillCircle(6, 6, 6);
      g.fillStyle(0xffffff, 0.55).fillCircle(6, 6, 3.6);
      g.fillStyle(0xffffff, 1).fillCircle(6, 6, 2);
      g.generateTexture("hubdot", 12, 12);
      g.destroy();
    }
    const webgl = this.game.renderer.type === Phaser.WEBGL;
    const CYCLE = 620, PHASE = 52;
    this._routeDots = [];
    for (let i = 0; i < 24; i++) {
      const d = this.add.image(0, 0, "hubdot").setDepth(2).setVisible(false)
        .setScale(0.7).setTint(0x59ff9c).setAlpha(0.1);
      if (webgl) d.setBlendMode(Phaser.BlendModes.ADD);
      // persistent phase-shifted fade: the reset-to-bright crest marches i=0->N.
      this.tweens.add({
        targets: d, alpha: { from: 0.85, to: 0.1 }, duration: CYCLE,
        repeat: -1, delay: (i * PHASE) % CYCLE, ease: "sine.in",
      });
      this._routeDots.push(d);
    }
    // completed-node glints (fixed set; selection-independent).
    this.nodes.forEach((n) => {
      if (n.sealed || !n.completed) return;
      const gl = this.add.image(n.x, n.y, "star").setDepth(2).setAlpha(0).setScale(0.3);
      if (webgl) gl.setBlendMode(Phaser.BlendModes.ADD).setTint(0xbfffe0);
      this.tweens.add({
        targets: gl, alpha: { from: 0, to: 0.85 }, scale: { from: 0.3, to: 0.95 },
        duration: 520, yoyo: true, repeat: -1, ease: "sine.inOut",
        delay: Phaser.Math.Between(0, 8000),
        repeatDelay: Phaser.Math.Between(6000, 12000),
      });
    });
  }

  // Aim the pooled route dots from the last completed node to the current
  // selection. Straight-line path, endpoints inset off the node discs; the dot
  // count scales with distance (capped at the pool). Degenerate cases (no
  // completed node, cursor ON the start, sealed endpoints, near-zero length)
  // hide every dot — the persistent march tweens keep running invisibly.
  retargetRoute() {
    if (!this._routeDots) return;
    const hide = () => this._routeDots.forEach((d) => d.setVisible(false));
    const startIdx = this.save.unlocked - 2; // highest completed idx
    const a = this.nodes[startIdx], b = this.nodes[this.sel];
    if (startIdx < 0 || startIdx === this.sel || !a || !b || a.sealed || b.sealed) { hide(); return; }
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 70) { hide(); return; }
    const ux = dx / len, uy = dy / len, inset = 40;
    const sx = a.x + ux * inset, sy = a.y + uy * inset;
    const span = Math.max(1, len - inset * 2);
    const N = Phaser.Math.Clamp(Math.round(span / 32), 2, this._routeDots.length);
    this._routeDots.forEach((d, i) => {
      if (i >= N) { d.setVisible(false); return; }
      const f = (i + 1) / (N + 1);
      d.setPosition(sx + ux * span * f, sy + uy * span * f).setVisible(true);
    });
  }

  // T3 (D7): a hub toast that auto-clears after 3.5s (timer reset on each re-set).
  // The clear-on-selection-change path in updateSelection() still applies.
  showToast(msg) {
    this.toastText.setText(msg);
    if (this._toastTimer) this._toastTimer.remove();
    this._toastTimer = this.time.delayedCall(3500, () => {
      this.toastText.setText("");
      this._toastTimer = null;
    });
  }

  enter() {
    if (this.entering) return;
    const n = this.nodes[this.sel];
    if (!n.unlocked) {
      sfx.lockedDeny();
      this.showToast("KOBI: That wing is LOCKED. Doors are my whole THING.");
      return;
    }
    if (n.lvl.wip) {
      sfx.menuDeny();
      this.showToast("KOBI: This wing is still under construction. Even I have limits. (coming soon)");
      return;
    }
    this.entering = true;
    sfx.levelEnter();
    // GFX4 F4b: hand off to the level through a KOBI iris CLOSE on the selected
    // node (both tiers). SAME 250ms + SAME scene.start hand-off as the old fade.
    // GFX3 G1 world-tint is PRESERVED on level entry: the iris closes to the
    // TARGET world's `fade` colour (drawIris fill), and the Game scene's own
    // world-tinted fade-in (GameScene create) then opens from that same tint — so
    // the entry stays world-coloured ("iris-in-tinted", F4b judgment). Unknown
    // world falls back to the navy iris. Duration unchanged (R6).
    const tf = WORLD_THEMES[n.lvl.world] && WORLD_THEMES[n.lvl.world].fade;
    runIris(this, {
      cx: n.x, cy: n.y, from: irisMaxR(this, n.x, n.y), to: 0, duration: 250, ease: "sine.in",
      fill: tf != null ? tf : 0x040614,
      onComplete: () => this.scene.start("Game", { levelIndex: n.idx }),
    });
  }
}
