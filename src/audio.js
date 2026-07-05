// Re-export shim. The audio system moved into src/audio/* (engine, sfx, music,
// mute) during Sound Sprint S1; this file keeps every existing
// `import { ... } from "../audio.js"` working unchanged.
//
// initAudio() here wraps the engine's initAudio() and then kicks off any music
// track that was requested before the AudioContext existed (autoplay policy):
// a scene calls playTrack() in create(), and the first keydown — which every
// scene routes through this initAudio() — both resumes the context and starts
// the pending track.

import { initAudio as engineInit } from "./audio/engine.js";
import { startPendingMusic } from "./audio/music.js";

export function initAudio() {
  engineInit();
  startPendingMusic();
}

export {
  setMusicVolume,
  setSfxVolume,
  setMuted,
  toggleMute,
  getAudioSettings,
  duckMusic,
  engineState,
} from "./audio/engine.js";

export { sfx, tone, noise, slide, rateLimit } from "./audio/sfx.js";

export { playTrack, stopMusic, setMusicLayer, musicState } from "./audio/music.js";

export { installMute } from "./audio/mute.js";
