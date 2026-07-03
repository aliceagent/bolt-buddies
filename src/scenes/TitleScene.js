import Phaser from "phaser";
import { COLORS, WORLD_THEMES } from "../constants.js";
import { addGradient, addMotes } from "../backdrop.js";
import { initAudio, sfx } from "../audio.js";

const FONT = "'Courier New', monospace";

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

    this.add.text(W / 2, 96, "BOLT BUDDIES", {
      fontFamily: FONT, fontSize: "84px", fontStyle: "bold", color: "#35f0ff",
      stroke: "#0b3a44", strokeThickness: 10,
    }).setOrigin(0.5);
    this.add.text(W / 2, 158, "a 2-player rescue mission", {
      fontFamily: FONT, fontSize: "24px", color: "#8fa3d9",
    }).setOrigin(0.5);

    // the buddies + Bolt
    const beep = this.add.image(W / 2 - 130, 250, "robot_b").setScale(1.6);
    const boop = this.add.image(W / 2 + 130, 250, "robot_o").setScale(1.6);
    this.tweens.add({ targets: [beep, boop], y: "-=10", duration: 900, yoyo: true, repeat: -1, ease: "sine.inOut" });
    const bolt = this.add.graphics({ x: W / 2, y: 258 });
    bolt.fillStyle(0xd9dee8).fillRoundedRect(-22, -8, 44, 24, 10); // body
    bolt.fillStyle(0xd9dee8).fillCircle(20, -12, 13); // head
    bolt.fillStyle(0x333a4c).fillCircle(24, -14, 3); // eye
    bolt.fillStyle(0xd9dee8).fillTriangle(12, -22, 18, -26, 20, -18); // ear
    bolt.lineStyle(4, 0xd9dee8).lineBetween(-20, -4, -32, -16); // tail
    bolt.fillStyle(0xff9944).fillCircle(-32, -16, 4);
    this.tweens.add({ targets: bolt, angle: { from: -4, to: 4 }, duration: 500, yoyo: true, repeat: -1, ease: "sine.inOut" });

    this.add.text(W / 2, 330,
      'K.O.B.I. — Keeper Of Building Integrity — grabbed your robo-puppy BOLT.\n"NO PETS ALLOWED. Commencing... CONFISCATION."\nChase him through the lab. Neither of you can do it alone.',
      { fontFamily: FONT, fontSize: "17px", color: "#c6d2f2", align: "center", lineSpacing: 8 }
    ).setOrigin(0.5);

    // controls panel
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.panel, 0.9).fillRoundedRect(W / 2 - 340, 400, 680, 150, 12);
    panel.lineStyle(2, COLORS.panelEdge).strokeRoundedRect(W / 2 - 340, 400, 680, 150, 12);
    this.add.text(W / 2 - 170, 425, "P1 — BEEP", { fontFamily: FONT, fontSize: "22px", fontStyle: "bold", color: "#4dc9ff" }).setOrigin(0.5);
    this.add.text(W / 2 - 170, 490, "move  A / D\njump  W\naction  E", { fontFamily: FONT, fontSize: "18px", color: "#c6d2f2", align: "center", lineSpacing: 6 }).setOrigin(0.5);
    this.add.text(W / 2 + 170, 425, "P2 — BOOP", { fontFamily: FONT, fontSize: "22px", fontStyle: "bold", color: "#ffa14d" }).setOrigin(0.5);
    this.add.text(W / 2 + 170, 490, "move  ← / →\njump  ↑\naction  L", { fontFamily: FONT, fontSize: "18px", color: "#c6d2f2", align: "center", lineSpacing: 6 }).setOrigin(0.5);
    this.add.line(0, 0, W / 2, 415, W / 2, 535, COLORS.panelEdge).setOrigin(0);

    const prompt = this.add.text(W / 2, 600, "press E or L to start", {
      fontFamily: FONT, fontSize: "26px", fontStyle: "bold", color: "#59ff9c",
    }).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.25, duration: 600, yoyo: true, repeat: -1 });

    this.add.text(W / 2, 690, "grab a buddy — this game needs two players on one keyboard", {
      fontFamily: FONT, fontSize: "15px", color: "#5a6a94",
    }).setOrigin(0.5);

    this.input.keyboard.on("keydown", (ev) => {
      initAudio();
      if (["KeyE", "KeyL", "Enter", "Space"].includes(ev.code)) {
        sfx.pickup();
        this.scene.start("Hub");
      }
    });
  }
}
