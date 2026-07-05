import Phaser from "phaser";
import BootScene from "./scenes/BootScene.js";
import TitleScene from "./scenes/TitleScene.js";
import HubScene from "./scenes/HubScene.js";
import GameScene from "./scenes/GameScene.js";
import UIScene from "./scenes/UIScene.js";
import { engineState } from "./audio/engine.js";
import { musicState } from "./audio/music.js";

const game = new Phaser.Game({
  // ?canvas=1 forces the canvas renderer (the automated playtest uses it —
  // headless SwiftShader WebGL runs in slow motion for its first seconds)
  type: new URLSearchParams(location.search).has("canvas") ? Phaser.CANVAS : Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 720,
  backgroundColor: "#070b14",
  physics: {
    default: "arcade",
    // generous overlapBias so the scaled-up Heavyweight body never embeds in
    // floors on respawn/teleport and tunnels through
    arcade: { gravity: { y: 1400 }, debug: false, overlapBias: 16 },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, HubScene, GameScene, UIScene],
});

// handle used by the automated playtest harness (tools/playtest.mjs)
window.__BB = { game };
// audio test surface (tools/playtest_audio.mjs): engine settings/state getter +
// live music state ({ current, playing, bar, section }).
window.__BB.audio = { engine: engineState, music: musicState };
