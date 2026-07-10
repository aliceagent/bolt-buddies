import Phaser from "phaser";
import BootScene from "./scenes/BootScene.js";
import TitleScene from "./scenes/TitleScene.js";
import HubScene from "./scenes/HubScene.js";
import GameScene from "./scenes/GameScene.js";
import UIScene from "./scenes/UIScene.js";
import PauseScene from "./scenes/PauseScene.js";
import SettingsScene from "./scenes/SettingsScene.js";
import OnboardScene from "./scenes/OnboardScene.js";
import MuteScene from "./scenes/MuteScene.js";
import { engineState } from "./audio/engine.js";
import { musicState } from "./audio/music.js";
import { sfx, sfxCounts, resetSfxCounts, kobi, panForX, setListener } from "./audio/sfx.js";

const game = new Phaser.Game({
  // ?canvas=1 forces the canvas renderer (the automated playtest uses it —
  // headless SwiftShader WebGL runs in slow motion for its first seconds)
  type: new URLSearchParams(location.search).has("canvas") ? Phaser.CANVAS : Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 720,
  backgroundColor: "#070b14",
  // U7 (F13): enable Phaser's gamepad plugin so a real browser fires
  // connect/disconnect events. All actual pad reads live in src/pad.js (it polls
  // navigator.getGamepads directly for headless-mock determinism); this flag is
  // additive and never touches the keyboard path.
  input: { gamepad: true },
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
  scene: [BootScene, TitleScene, HubScene, GameScene, UIScene, PauseScene, SettingsScene, OnboardScene, MuteScene],
});

// Global mute dropdown: launch the always-on-top overlay once the game is booted
// and keep it above every scene. MuteScene draws only its own glyph/dropdown and
// re-tops itself each frame, so it rides over gameplay, menus and the Pause
// overlay without touching any other scene's input.
game.events.once("ready", () => {
  game.scene.start("Mute");
  game.scene.bringToTop("Mute");
});

// W3W4 M3: dev-only sandbox loader — `?devlevel=w3` swaps straight into the
// World-3 mechanics sandbox once boot lands on the Title screen. Guarded by the
// query string (and again in GameScene.init), so normal play, the registry and
// the hub are untouched without it.
if (new URLSearchParams(location.search).get("devlevel") === "w3") {
  const iv = setInterval(() => {
    const m = game.scene;
    if (m.isActive && m.isActive("Title")) {
      clearInterval(iv);
      ["Title", "Onboard"].forEach((k) => m.stop(k));
      m.start("Game", { devLevel: "w3" });
    }
  }, 120);
}

// handle used by the automated playtest harness (tools/playtest.mjs)
window.__BB = { game };
// audio test surface (tools/playtest_audio.mjs): engine settings/state getter +
// live music state ({ current, playing, bar, section }).
window.__BB.audio = { engine: engineState, music: musicState };
// sfx test surface (tools/playtest_audio.mjs): the voice library, the per-voice
// play counter (rate-limiter check), a reset, and the mood router.
// panForX + setListener let the S5 audio test verify positional stereo panning
// (±0.3 clamp) deterministically without needing a live camera.
window.__BB.audio.sfx = { voices: sfx, kobi, counts: sfxCounts, reset: resetSfxCounts, panForX, setListener };
