import Phaser from "phaser";
import BootScene from "./scenes/BootScene.js";
import TitleScene from "./scenes/TitleScene.js";
import HubScene from "./scenes/HubScene.js";
import GameScene from "./scenes/GameScene.js";
import UIScene from "./scenes/UIScene.js";
import PauseScene from "./scenes/PauseScene.js";
import SettingsScene from "./scenes/SettingsScene.js";
import OnboardScene from "./scenes/OnboardScene.js";
import WalkthroughScene from "./scenes/WalkthroughScene.js";
import EpilogueScene from "./scenes/EpilogueScene.js";
import RewardScene from "./scenes/RewardScene.js";
import MuteScene from "./scenes/MuteScene.js";
import { engineState } from "./audio/engine.js";
import { musicState } from "./audio/music.js";
import { sfx, sfxCounts, resetSfxCounts, kobi, panForX, setListener } from "./audio/sfx.js";
import { playVO, playForText, voIdForText, voState } from "./audio/vo.js";
import { sfxSampleState } from "./audio/sfxsamples.js";
import { initAudio } from "./audio.js";

// GFX4 F1: warm the display font before the first scene paints so the Title
// renders in Fredoka on a normal load — but NEVER block the game on it. Race
// document.fonts.load against a ~1500ms timeout; on timeout, rejection, or a
// browser without the Font Loading API, we boot anyway and the mono fallback
// stack renders instead (font-display:swap swaps it in later if it arrives).
// This whole block is best-effort — it can neither throw nor hang the boot.
// GFX4 F2 (2a): loading-splash lifecycle. The #bb-splash (index.html, CSS-only)
// covers the dark pre-boot frame and warms the Fredoka font. removeSplash() is
// idempotent and reached UNCONDITIONALLY: on the Title CREATE event (the success
// path), from boot()'s catch (a boot throw), from window error/rejection
// listeners, and from a hard backstop timeout — a stranded splash over a black
// game is the worst outcome, so every failure mode still clears it. Fade is
// 250ms after a 300ms MINIMUM display so a fast load never flashes. The game
// boot NEVER waits on the splash (removal only ever runs AFTER Title renders).
const SPLASH_T0 = performance.now();
function removeSplash() {
  const el = typeof document !== "undefined" && document.getElementById("bb-splash");
  if (!el || el.dataset.bbGoing) return;
  el.dataset.bbGoing = "1";
  const wait = Math.max(0, 300 - (performance.now() - SPLASH_T0));
  setTimeout(() => {
    el.classList.add("bb-hide");
    setTimeout(() => el.remove(), 260); // after the 250ms opacity fade completes
  }, wait);
}
if (typeof window !== "undefined") {
  // Safety nets so a boot failure never strands the splash over a black screen.
  window.addEventListener("error", removeSplash);
  window.addEventListener("unhandledrejection", removeSplash);
  setTimeout(removeSplash, 6000); // last-resort backstop (Title should long precede this)
}

async function warmDisplayFont() {
  try {
    if (!document.fonts || !document.fonts.load) return;
    await Promise.race([
      document.fonts.load("700 32px Fredoka"),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    // swallow — a font failure must never stop the game booting
  }
}

async function boot() {

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
  // W3W4 L43: EpilogueScene appended (the 4-3 clear-overlay continue routes
  // there). FIN-C: RewardScene follows it (Epilogue's exit routes there on the
  // finale path; the reward exits to Title). Every other sequence is unchanged.
  scene: [BootScene, TitleScene, HubScene, GameScene, UIScene, PauseScene, SettingsScene, OnboardScene, WalkthroughScene, EpilogueScene, RewardScene, MuteScene],
});

// GFX4 F2 (2a): remove the loading splash the instant the Title scene renders
// (its CREATE event). If Title is already active (hot reload / very fast boot)
// remove immediately; otherwise wait for the scene instance and hook its create.
{
  const attachTitleSplashHook = () => {
    const t = game.scene.getScene("Title");
    if (!t) return false;
    if (game.scene.isActive("Title")) removeSplash();
    else t.sys.events.once("create", removeSplash);
    return true;
  };
  if (!attachTitleSplashHook()) game.events.once("ready", attachTitleSplashHook);
}

// Global mute dropdown: launch the always-on-top overlay once the game is booted
// and keep it above every scene. MuteScene draws only its own glyph/dropdown and
// re-tops itself each frame, so it rides over gameplay, menus and the Pause
// overlay without touching any other scene's input.
game.events.once("ready", () => {
  game.scene.start("Mute");
  game.scene.bringToTop("Mute");
});

// Audio unlock on ANY first user gesture — not just keydown. Browsers keep the
// AudioContext suspended until a gesture; the scenes already resume it on keydown
// / pad button, but a mouse- or touch-only player (clicking menu items, tapping
// to start) never fired one, so the game stayed silent. A capture-phase listener
// for pointer/touch/mouse gestures resumes the ctx (and starts any pending track)
// the instant they interact by any means. initAudio() is idempotent + cheap.
["pointerdown", "touchstart", "mousedown"].forEach((ev) =>
  window.addEventListener(ev, () => initAudio(), { passive: true, capture: true }));

// W3W4 M3/M4: dev-only sandbox loader — `?devlevel=w3` / `?devlevel=w4` swaps
// straight into that world's mechanics sandbox once boot lands on the Title
// screen. Guarded by the query string (and again in GameScene.init), so normal
// play, the registry and the hub are untouched without it.
{
  const devLevel = new URLSearchParams(location.search).get("devlevel");
  if (devLevel === "w3" || devLevel === "w4") {
    const iv = setInterval(() => {
      const m = game.scene;
      if (m.isActive && m.isActive("Title")) {
        clearInterval(iv);
        ["Title", "Onboard"].forEach((k) => m.stop(k));
        m.start("Game", { devLevel });
      }
    }, 120);
  }
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
window.__BB.audio.sfx = { voices: sfx, kobi, counts: sfxCounts, reset: resetSfxCounts, panForX, setListener, samples: sfxSampleState };
// VO test surface (tools/playtest_vo.mjs): trigger a clip by id or caption text,
// resolve a caption -> clip id, and read the live player state ({ playing, id }).
window.__BB.audio.vo = { play: playVO, playForText, idForText: voIdForText, state: voState };

} // end boot()

// Warm the display font (bounded), then boot regardless of the outcome. Using
// .finally guarantees boot() runs whether the font resolves, rejects, or the
// timeout wins — the game is never gated on the font.
warmDisplayFont().finally(() => {
  // Explicit belt-and-suspenders around boot() (Phaser.Game construction is the
  // throw-prone step): clear the splash on a synchronous boot failure so it can
  // never sit stranded over a black screen, then rethrow so the error still
  // surfaces. The window error/rejection listeners + backstop cover async paths.
  try {
    boot();
  } catch (e) {
    removeSplash();
    throw e;
  }
});
