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
  setBothMuted,
  setMusicMuted,
  toggleMusicMuted,
  setSfxMuted,
  toggleSfxMuted,
  getMuteState,
  getAudioSettings,
  duckMusic,
  pauseDuck,
  setSadMusic,
  engineState,
  setVoiceVolume,
  setVoiceMuted,
  toggleVoiceMuted,
  isVoiceMuted,
  voDuck,
} from "./audio/engine.js";

export { playVO, playForText, voIdForText, voKey, stopVO, voState } from "./audio/vo.js";

export {
  sfx, tone, noise, slide, rateLimit, kobi,
  setListener, clearListener, proximity, setLoop, stopLoops,
  sfxCounts, resetSfxCounts,
} from "./audio/sfx.js";

export { playTrack, stopMusic, setMusicLayer, playJingle, trackForLevel, musicState } from "./audio/music.js";

export { installMute } from "./audio/mute.js";
