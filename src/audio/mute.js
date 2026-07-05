// Global mute UX — the M key and the corner "muted" icon, shared by every scene.
//
// M works everywhere. Because Game + UI run at the same time, a single M press
// reaches both scenes' handlers; a tiny window-scoped debounce makes that count
// as ONE toggle. When mute flips, a `bb:mute` game event refreshes every scene's
// icon. The in-game icon lives in the UI overlay (never zoomed), so pass
// `{ icon: false }` from GameScene and let UI draw it.

import { toggleMute, getAudioSettings } from "./engine.js";
import { sfx } from "./sfx.js";

function drawMuteIcon(scene) {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const g = scene.add.graphics().setScrollFactor(0).setDepth(100000);
  g.setPosition(W - 40, H - 40);
  // rounded backdrop
  g.fillStyle(0x0a0f1e, 0.72).fillRoundedRect(-20, -16, 40, 32, 7);
  g.lineStyle(2, 0xff5566, 0.9).strokeRoundedRect(-20, -16, 40, 32, 7);
  // little speaker
  g.fillStyle(0xff8a99);
  g.fillRect(-13, -5, 5, 10); // back
  g.fillTriangle(-8, -9, -8, 9, 0, 0); // cone
  // mute slash
  g.lineStyle(3, 0xff5566, 1).lineBetween(4, -9, 14, 9);
  g.lineStyle(3, 0xff5566, 1).lineBetween(14, -9, 4, 9);
  return g;
}

export function installMute(scene, { icon = true } = {}) {
  let iconGfx = null;
  const refresh = () => {
    if (iconGfx) iconGfx.setVisible(getAudioSettings().muted);
  };
  if (icon) {
    iconGfx = drawMuteIcon(scene);
    refresh();
  }

  scene.input.keyboard.on("keydown-M", () => {
    const now = performance.now();
    // debounce across the simultaneously-active Game + UI scenes
    if (now - (window.__bbMuteAt || 0) < 150) return;
    window.__bbMuteAt = now;
    // Mute chirp must be AUDIBLE: when muting, play it while the master gain is
    // still up (before toggle); when unmuting, toggle first (gain restored) then
    // play. masterGain ramps over ~8ms, so the onset lands either way.
    const wasMuted = getAudioSettings().muted;
    if (wasMuted) {
      toggleMute();
      sfx.muteChirp(false);
    } else {
      sfx.muteChirp(true);
      toggleMute();
    }
    scene.game.events.emit("bb:mute");
  });

  scene.game.events.on("bb:mute", refresh);
  scene.events.once("shutdown", () => {
    scene.game.events.off("bb:mute", refresh);
  });

  return { refresh, icon: iconGfx };
}
