import Phaser from "phaser";
import { COLORS, WORLD_THEMES } from "../constants.js";
import { LEVELS, WORLD_INFO, KOBI_HUB_LINES } from "../levels/registry.js";
import { loadSave, totalCores } from "../save.js";
import { addGradient, addMotes } from "../backdrop.js";
import { initAudio, sfx, installMute, playTrack, playJingle } from "../audio.js";

const FONT = "'Courier New', monospace";

// Facility map: 4 wings x 3 chambers. Navigate with either player's keys.
export default class HubScene extends Phaser.Scene {
  constructor() {
    super("Hub");
  }

  init(data) {
    this.sel = data && typeof data.sel === "number" ? data.sel : null;
    this.justUnlocked = !!(data && data.unlock);
    this.entering = false;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.save = loadSave();
    if (this.sel === null) this.sel = Math.min(this.save.unlocked - 1, LEVELS.length - 1);
    this.sel = Phaser.Math.Clamp(this.sel, 0, LEVELS.length - 1);

    addGradient(this, 1);
    this.add.tileSprite(0, 0, W, H, "bggrid").setOrigin(0).setAlpha(0.22).setDepth(-8);
    addMotes(this, WORLD_THEMES[1].accent2);
    this.add.text(W / 2, 46, "DYNACORE LABS — SECTOR MAP", {
      fontFamily: FONT, fontSize: "34px", fontStyle: "bold", color: "#35f0ff",
    }).setOrigin(0.5);
    this.add.text(W / 2, 82, `data-cores recovered: ${totalCores(this.save)} / 36`, {
      fontFamily: FONT, fontSize: "16px", color: "#8fa3d9",
    }).setOrigin(0.5);

    // wing panels in a 2x2 grid
    this.nodes = [];
    const panelW = 560, panelH = 235;
    WORLD_INFO.forEach((info, wi) => {
      const theme = WORLD_THEMES[wi + 1] || WORLD_THEMES[1];
      const accent = theme.accent;
      const px = W / 2 + (wi % 2 === 0 ? -panelW - 12 : 12);
      const py = 120 + Math.floor(wi / 2) * (panelH + 18);
      const g = this.add.graphics();
      g.fillStyle(COLORS.panel, 0.85).fillRoundedRect(px, py, panelW, panelH, 12);
      g.lineStyle(2, COLORS.panelEdge).strokeRoundedRect(px, py, panelW, panelH, 12);
      // accent header bar
      g.fillStyle(accent, 0.9).fillRoundedRect(px, py, panelW, 34, { tl: 12, tr: 12, bl: 0, br: 0 });
      g.fillStyle(accent, 0.12).fillRect(px, py + 34, panelW, panelH - 34);
      // big emoji badge
      this.add.text(px + 30, py + 17, info.emoji, { fontFamily: FONT, fontSize: "26px" }).setOrigin(0.5);
      this.add.text(px + 52, py + 17, `WORLD ${wi + 1} — ${info.name.toUpperCase()}`, {
        fontFamily: FONT, fontSize: "18px", fontStyle: "bold", color: "#0a0e1a",
      }).setOrigin(0, 0.5);
      this.add.text(px + 20, py + 52, info.skills, { fontFamily: FONT, fontSize: "14px", color: "#7f8fc0" });

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
        this.drawNode(circle, lvl, unlocked, false, completed);
        const label = this.add.text(nx, ny - 2, unlocked ? lvl.id : "", {
          fontFamily: FONT, fontSize: "20px", fontStyle: "bold", color: "#eaf2ff",
        }).setOrigin(0.5);
        // core pips
        const cores = this.save.cores[lvl.id] || [false, false, false];
        cores.forEach((got, ci) => {
          this.add.image(nx - 18 + ci * 18, ny + 46, "core").setScale(0.6).setAlpha(got ? 1 : 0.16);
        });
        this.nodes.push({ idx, lvl, unlocked, completed, circle, label, accent, x: nx, y: ny });
      }
    });

    // animated double selection ring + level name readout
    this.ring = this.add.image(0, 0, "reticle").setScale(1.5).setTint(0x59ff9c);
    this.ring2 = this.add.image(0, 0, "reticle").setScale(1.9).setTint(0x59ff9c).setAlpha(0.4);
    this.tweens.add({ targets: this.ring, scale: 1.65, duration: 500, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: this.ring2, scale: 2.1, alpha: 0.15, duration: 900, yoyo: true, repeat: -1, ease: "sine.inOut" });
    this.tweens.add({ targets: this.ring2, angle: 360, duration: 8000, repeat: -1 });

    this.nameText = this.add.text(W / 2, H - 92, "", {
      fontFamily: FONT, fontSize: "22px", fontStyle: "bold", color: "#59ff9c",
    }).setOrigin(0.5);
    this.toastText = this.add.text(W / 2, H - 64, "", {
      fontFamily: FONT, fontSize: "15px", color: "#ff9daa",
    }).setOrigin(0.5);

    // KOBI marquee → scrolling ticker with a small eye prefix
    this.buildTicker(W, H);

    this.add.text(W / 2, 108, "move: A/D or ←/→ (worlds: W/S or ↑/↓) · enter: SPACE or L · O sound · ESC — main menu", {
      fontFamily: FONT, fontSize: "13px", color: "#5a6a94",
    }).setOrigin(0.5);

    this.updateSelection();

    installMute(this);

    // map-room music (crossfades from a level track); if we arrived here having
    // just unlocked a new chamber, ring the unlock fanfare over the hub track.
    playTrack("hub");
    if (this.justUnlocked) {
      sfx.saveTick(); // progress-saved toast tick
      this.time.delayedCall(350, () => playJingle("jingle_unlock"));
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

  buildTicker(W, H) {
    const y = H - 24;
    // fixed KOBI eye prefix at the left
    const eye = this.add.graphics().setDepth(6);
    eye.fillStyle(COLORS.dark, 1).fillRect(0, y - 12, 40, 24);
    eye.fillStyle(0xffffff, 0.9).fillCircle(18, y, 9);
    eye.fillStyle(COLORS.magenta, 1).fillCircle(20, y, 5);
    eye.fillStyle(0x2a0a1e, 1).fillCircle(21, y, 2.5);
    const line = KOBI_HUB_LINES[Math.floor(Math.random() * KOBI_HUB_LINES.length)];
    const t = this.add.text(W, y, line, {
      fontFamily: FONT, fontSize: "14px", fontStyle: "italic", color: "#ff4dd2",
    }).setOrigin(0, 0.5).setAlpha(0.9).setDepth(5);
    const dist = W + t.width + 40;
    this.tweens.add({
      targets: t, x: -t.width - 40, duration: dist * 12, repeat: -1, ease: "linear",
      onRepeat: () => t.setX(W),
    });
  }

  drawNode(g, lvl, unlocked, selected, completed) {
    g.clear();
    const fill = unlocked ? (selected ? 0x1e4a3a : 0x1c2a52) : 0x121830;
    const edge = unlocked ? (selected ? 0x59ff9c : 0x44548c) : 0x2a3350;
    g.fillStyle(fill).fillCircle(0, 0, 34);
    g.lineStyle(3, edge).strokeCircle(0, 0, 34);
    if (completed) {
      // lit ring + small checkmark badge (bottom-right)
      g.lineStyle(2, 0x59ff9c, 0.7).strokeCircle(0, 0, 39);
      g.fillStyle(0x0e2a1c, 1).fillCircle(24, 24, 11);
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

  move(d) {
    const next = Phaser.Math.Clamp(this.sel + d, 0, LEVELS.length - 1);
    if (next !== this.sel) {
      this.sel = next;
      sfx.menuMove();
      this.updateSelection();
    }
  }

  updateSelection() {
    this.nodes.forEach((n) => {
      this.drawNode(n.circle, n.lvl, n.unlocked, n.idx === this.sel, n.completed);
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
