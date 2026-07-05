// Audio engine — one AudioContext, a master gain and two buses.
//
//   AudioContext
//   └── masterGain            (mute toggles this to 0 / 1)
//       ├── musicBus          (music volume; ducks to 0.7x while a KOBI blip types)
//       └── sfxBus            (sfx volume)
//
// Autoplay-safe: the context is created lazily and only on the first initAudio()
// call — which the scenes fire from their keydown handlers. Nothing here creates
// or touches an AudioContext before that first user gesture, so the page emits
// zero audio errors/warnings on load.

const STORAGE_KEY = "bolt-buddies-audio-v1";
// NOTE: music default is 0.45 (the binding "Music direction" section — music must
// sit *under* the game), not the 0.7 sketched in the architecture diagram.
const DEFAULTS = { music: 0.45, sfx: 0.8, muted: false };

const clamp01 = (v) => Math.max(0, Math.min(1, v));

let ctx = null;
let masterGain = null;
let musicBus = null;
let sfxBus = null;
let ducked = false;
// Dedicated pause duck (S4): the in-game pause overlay drops the music bus to
// 0.5x while paused WITHOUT touching the saved music volume. Independent of the
// KOBI-blip `ducked` flag so the two can stack cleanly.
let pauseDucked = false;
let settings = loadSettings();

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        music: typeof p.music === "number" ? clamp01(p.music) : DEFAULTS.music,
        sfx: typeof p.sfx === "number" ? clamp01(p.sfx) : DEFAULTS.sfx,
        muted: !!p.muted,
      };
    }
  } catch (e) {
    /* corrupt / unavailable storage — fall back to defaults */
  }
  return { ...DEFAULTS };
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    /* storage unavailable — settings live for the session only */
  }
}

// Push the current settings onto the live gain nodes. Uses short setTargetAtTime
// ramps so volume/mute changes never click.
function applySettings() {
  if (!ctx) return;
  const t = ctx.currentTime;
  masterGain.gain.setTargetAtTime(settings.muted ? 0 : 1, t, 0.008);
  musicBus.gain.setTargetAtTime(settings.music * (ducked ? 0.7 : 1) * (pauseDucked ? 0.5 : 1), t, 0.02);
  sfxBus.gain.setTargetAtTime(settings.sfx, t, 0.02);
}

export function initAudio() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      musicBus = ctx.createGain();
      sfxBus = ctx.createGain();
      musicBus.connect(masterGain);
      sfxBus.connect(masterGain);
      masterGain.connect(ctx.destination);
      // set gains immediately (no ramp) so the very first note is at the right level
      masterGain.gain.value = settings.muted ? 0 : 1;
      musicBus.gain.value = settings.music * (ducked ? 0.7 : 1) * (pauseDucked ? 0.5 : 1);
      sfxBus.gain.value = settings.sfx;
    } catch (e) {
      ctx = null; // audio unsupported — game stays silent
    }
  }
  if (ctx && ctx.state === "suspended") ctx.resume();
}

// --- bus accessors (used by sfx.js and music.js) ---------------------------
export function getCtx() {
  return ctx;
}
export function getMusicBus() {
  return musicBus;
}
export function getSfxBus() {
  return sfxBus;
}

// --- public settings API ---------------------------------------------------
export function setMusicVolume(v) {
  settings.music = clamp01(v);
  saveSettings();
  applySettings();
}
export function setSfxVolume(v) {
  settings.sfx = clamp01(v);
  saveSettings();
  applySettings();
}
export function setMuted(b) {
  settings.muted = !!b;
  saveSettings();
  applySettings();
}
export function toggleMute() {
  setMuted(!settings.muted);
  return settings.muted;
}
export function getAudioSettings() {
  return { ...settings };
}
export function duckMusic(on) {
  ducked = !!on;
  applySettings();
}
// Pause duck (S4): halve the music bus while the in-game pause overlay is up.
// Leaves the saved `settings.music` untouched, so resuming restores exactly the
// player's chosen level.
export function pauseDuck(on) {
  pauseDucked = !!on;
  applySettings();
}

// Test surface: engine STATE (not sound). Wired onto window.__BB.audio.engine.
export function engineState() {
  return {
    ...settings,
    state: ctx ? ctx.state : "none",
    masterGain: masterGain ? masterGain.gain.value : null,
    musicBus: musicBus ? musicBus.gain.value : null,
    sfxBus: sfxBus ? sfxBus.gain.value : null,
  };
}
