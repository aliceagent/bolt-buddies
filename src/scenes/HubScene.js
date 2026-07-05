import Phaser from "phaser";
import { COLORS, WORLD_THEMES } from "../constants.js";
import { LEVELS, WORLD_INFO, KOBI_HUB_LINES } from "../levels/registry.js";
import { loadSave, totalCores } from "../save.js";
import { addGradient, addMotes } from "../backdrop.js";
import { initAudio, sfx, installMute } from "../audio.js";

const FONT = "'Courier New', monospace";

// Facility map: 4 wings x 3 chambers. Navigate with either player's keys.
export default class HubScene extends Phaser.Scene {
  constructor() {
    super("Hub");
  }

  init(data) {
    this.sel = data && typeof data.sel === "number" ? data.sel : null;
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
      const px = W / 2 + (wi % 2 === 0 ? -panelW - 12 : 12);
      const py = 120 + Math.floor(wi / 2) * (panelH + 18);
      const g = this.add.graphics();
      g.fillStyle(COLORS.panel, 0.85).fillRoundedRect(px, py, panelW, panelH, 12);
      g.lineStyle(2, COLORS.panelEdge).strokeRoundedRect(px, py, panelW, panelH, 12);
      this.add.text(px + 20, py + 16, `${info.emoji} WORLD ${wi + 1} — ${info.name.toUpperCase()}`, {
        fontFamily: FONT, fontSize: "19px", fontStyle: "bold", color: "#c6d2f2",
      });
      this.add.text(px + 20, py + 42, info.skills, { fontFamily: FONT, fontSize: "14px", color: "#5a6a94" });

      for (let li = 0; li < 3; li++) {
        const idx = wi * 3 + li;
        const lvl = LEVELS[idx];
        const nx = px + 105 + li * 180;
        const ny = py + 130;
        const unlocked = idx < this.save.unlocked;
        const circle = this.add.graphics({ x: nx, y: ny });
        this.drawNode(circle, lvl, unlocked, false);
        // locked chambers show just the padlock; the id would collide with it
        const label = this.add.text(nx, ny - 2, unlocked ? lvl.id : "", {
          fontFamily: FONT, fontSize: "20px", fontStyle: "bold", color: "#eaf2ff",
        }).setOrigin(0.5);
        // core pips
        const cores = this.save.cores[lvl.id] || [false, false, false];
        cores.forEach((got, ci) => {
          this.add.image(nx - 18 + ci * 18, ny + 44, "core").setScale(0.55).setAlpha(got ? 1 : 0.18);
        });
        this.nodes.push({ idx, lvl, unlocked, circle, label, x: nx, y: ny });
      }
    });

    // selection ring + level name readout
    this.ring = this.add.image(0, 0, "reticle").setScale(1.5).setTint(0x59ff9c);
    this.tweens.add({ targets: this.ring, scale: 1.65, duration: 500, yoyo: true, repeat: -1 });
    this.nameText = this.add.text(W / 2, H - 84, "", {
      fontFamily: FONT, fontSize: "22px", fontStyle: "bold", color: "#59ff9c",
    }).setOrigin(0.5);
    this.toastText = this.add.text(W / 2, H - 56, "", {
      fontFamily: FONT, fontSize: "15px", color: "#ff9daa",
    }).setOrigin(0.5);

    // KOBI marquee
    const line = KOBI_HUB_LINES[Math.floor(Math.random() * KOBI_HUB_LINES.length)];
    this.add.text(W / 2, H - 24, line, {
      fontFamily: FONT, fontSize: "14px", fontStyle: "italic", color: "#ff4dd2",
    }).setOrigin(0.5).setAlpha(0.85);

    this.add.text(W / 2, 108, "move: A/D or ←/→ (worlds: W/S or ↑/↓) · enter: SPACE or L · title: ESC", {
      fontFamily: FONT, fontSize: "13px", color: "#5a6a94",
    }).setOrigin(0.5);

    this.updateSelection();

    installMute(this);

    this.input.keyboard.addCapture("SPACE"); // keep Space from scrolling the page
    this.input.keyboard.on("keydown", (ev) => {
      initAudio();
      const c = ev.code;
      if (c === "KeyA" || c === "ArrowLeft") this.move(-1);
      else if (c === "KeyD" || c === "ArrowRight") this.move(1);
      else if (c === "KeyW" || c === "ArrowUp") this.move(-3);
      else if (c === "KeyS" || c === "ArrowDown") this.move(3);
      else if (c === "Space" || c === "KeyE" || c === "KeyL" || c === "Enter") this.enter();
      else if (c === "Escape") this.scene.start("Title");
    });
  }

  drawNode(g, lvl, unlocked, selected) {
    g.clear();
    const fill = unlocked ? (selected ? 0x1e4a3a : 0x1c2a52) : 0x121830;
    const edge = unlocked ? (selected ? 0x59ff9c : 0x44548c) : 0x2a3350;
    g.fillStyle(fill).fillCircle(0, 0, 34);
    g.lineStyle(3, edge).strokeCircle(0, 0, 34);
    if (!unlocked) {
      g.fillStyle(0x48547a).fillRect(-8, -6, 16, 12);
      g.lineStyle(3, 0x48547a).strokeCircle(0, -10, 6);
    }
  }

  move(d) {
    const next = Phaser.Math.Clamp(this.sel + d, 0, LEVELS.length - 1);
    if (next !== this.sel) {
      this.sel = next;
      sfx.blip();
      this.updateSelection();
    }
  }

  updateSelection() {
    this.nodes.forEach((n) => this.drawNode(n.circle, n.lvl, n.unlocked, n.idx === this.sel));
    const n = this.nodes[this.sel];
    this.ring.setPosition(n.x, n.y);
    this.nameText.setText(n.unlocked ? `${n.lvl.id}  "${n.lvl.name}"` : `${n.lvl.id}  — locked`);
    this.toastText.setText("");
  }

  enter() {
    const n = this.nodes[this.sel];
    if (!n.unlocked) {
      sfx.denied();
      this.toastText.setText("KOBI: That wing is LOCKED. Doors are my whole THING.");
      return;
    }
    if (n.lvl.wip) {
      sfx.denied();
      this.toastText.setText("KOBI: This wing is still under construction. Even I have limits. (coming soon)");
      return;
    }
    sfx.door();
    this.scene.start("Game", { levelIndex: n.idx });
  }
}
