// Audio engine — one AudioContext, a master gain and three buses.
//
//   AudioContext
//   └── masterGain            (mute toggles this to 0 / 1)
//       ├── musicBus          (music volume; ducks to 0.7x while a KOBI blip types,
//       │                      and deeper to VO_DUCK while a spoken line plays)
//       ├── sfxBus            (sfx volume)
//       └── voiceBus          (spoken VO — KOBI + Narrator; own mute + volume)
//
// VOICE (VO) MODEL: voiceBus is a third sibling of sfxBus. Spoken lines (xAI TTS,
// pre-generated to public/vo/<id>.mp3) play through it. It has its own `voice`
// volume and `voiceMuted` flag (default UNMUTED — "voice on by default"). While a
// VO clip plays, the music bus ducks harder than the plain blip duck (VO_DUCK)
// so speech stays intelligible; the duck is a separate flag from the blip/pause/
// sad ducks so they all stack cleanly. Everything here is ADDITIVE — with no VO
// playing and default settings, the music/sfx/master formulas are byte-identical
// to before, so every existing audio-suite assertion stays green.
//
// Autoplay-safe: the context is created lazily and only on the first initAudio()
// call — which the scenes fire from their keydown handlers. Nothing here creates
// or touches an AudioContext before that first user gesture, so the page emits
// zero audio errors/warnings on load.

const STORAGE_KEY = "bolt-buddies-audio-v1";
// NOTE: music default is 0.45 (the binding "Music direction" section — music must
// sit *under* the game), not the 0.7 sketched in the architecture diagram.
//
// MUTE MODEL (global mute dropdown): the source of truth is TWO independent
// per-bus flags — `musicMuted` and `sfxMuted` — plus the saved volumes (muting
// zeroes the *bus gain*, never the saved volume, so unmute restores exactly).
// The master `muted` is DERIVED: muted === (musicMuted && sfxMuted). "MUTE ALL"
// (the Settings row, the 'M' key, and the dropdown's MUTE ALL row) is therefore
// just `setBothMuted(bool)` — it flips BOTH per-bus flags together, which makes
// the derived master `muted` follow. There is no separate stored master flag to
// diverge: individually muting music AND sfx in the dropdown flips the Settings
// "MUTE ALL" row on too, and M toggles both flags at once. masterGain still
// drops to 0 whenever derived-muted is true (keeps the old master-kill behaviour
// and the audio suite's masterGain->0 assertion green).
// `voice` is the spoken-VO bus level (its own slider-able volume, default 1.0 so
// speech sits clearly over the ducked music). `voiceMuted` defaults false — the
// locked decision is "voice ON by default". These are extra keys; the master mute
// model (musicMuted && sfxMuted) is deliberately UNCHANGED — VOICE is a separate
// opt-out, so muting music+sfx does NOT silence speech and vice-versa.
const DEFAULTS = { music: 0.45, sfx: 0.8, voice: 1.0, musicMuted: false, sfxMuted: false, voiceMuted: false, muted: false };

// Master ceiling (Sound Sprint S5): the unmuted masterGain sits at 0.8, not 1.0,
// so the summed output keeps headroom below full scale even when many voices +
// the music bed fire at once (e.g. stomp + squish×4 + music). Mute still drives
// the master to 0; settings semantics (music/sfx/mute) are unchanged — this only
// caps the final bus. A DynamicsCompressor sits after it as a brick-wall-ish
// limiter safeguard so any residual peak can't hard-clip the destination.
const MASTER = 0.8;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

let ctx = null;
let masterGain = null;
let limiter = null;
let musicBus = null;
let sfxBus = null;
let voiceBus = null;
let ducked = false;
// VO duck: while a spoken line plays, the music bus dips harder than the plain
// KOBI-blip duck so the voice stays intelligible. Separate flag from `ducked` /
// `pauseDucked` / `sadMode` so all four ducks multiply independently.
let voDucked = false;
const VO_DUCK = 0.35; // music-bus multiplier while a VO clip is speaking
// Dedicated pause duck (S4): the in-game pause overlay drops the music bus to
// 0.5x while paused WITHOUT touching the saved music volume. Independent of the
// KOBI-blip `ducked` flag so the two can stack cleanly.
let pauseDucked = false;
// SL7 "cold hard truth" sad-music treatment: a fully-reversible, additive melancholy
// pass on the MUSIC BUS ONLY, tied to the tier-3 grey-fade. When on, the bus dips to
// SAD_MUSIC_GAIN and a lowpass muffles the bright leads/arps so the bed reads somber;
// when off it restores byte-for-byte normal playback (factor 1.0 + transparent 20 kHz
// cutoff). It rides through the same applySettings() plumbing as the KOBI/pause ducks,
// so it stacks cleanly and honors mute (musicMuted → 0 regardless). Never touched by
// any suite (they never reach tier-3), which is the no-regression guard.
let sadMode = false;
let musicFilter = null;      // always in the music path; transparent unless sad
const SAD_MUSIC_GAIN = 0.55; // bus multiplier while sad (melancholy recede)
const SAD_LP_HZ = 620;       // lowpass cutoff while sad (muffled/somber)
const OPEN_LP_HZ = 20000;    // transparent cutoff when normal (no audible colour)
let settings = loadSettings();

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      // Back-compat: an old blob only had a master `muted`. Map it onto both
      // per-bus flags so a previously-muted profile stays muted.
      const legacy = !!p.muted;
      const musicMuted = typeof p.musicMuted === "boolean" ? p.musicMuted : legacy;
      const sfxMuted = typeof p.sfxMuted === "boolean" ? p.sfxMuted : legacy;
      return {
        music: typeof p.music === "number" ? clamp01(p.music) : DEFAULTS.music,
        sfx: typeof p.sfx === "number" ? clamp01(p.sfx) : DEFAULTS.sfx,
        // voice channel (narration/KOBI speech) — volume + mute now round-trip
        // too (previously dropped on load, so the voice slider/toggle reset).
        voice: typeof p.voice === "number" ? clamp01(p.voice) : DEFAULTS.voice,
        voiceMuted: typeof p.voiceMuted === "boolean" ? p.voiceMuted : DEFAULTS.voiceMuted,
        musicMuted,
        sfxMuted,
        muted: musicMuted && sfxMuted, // derived master
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
  masterGain.gain.setTargetAtTime(settings.muted ? 0 : MASTER, t, 0.008);
  musicBus.gain.setTargetAtTime(settings.musicMuted ? 0 : settings.music * (ducked ? 0.7 : 1) * (pauseDucked ? 0.5 : 1) * (sadMode ? SAD_MUSIC_GAIN : 1) * (voDucked ? VO_DUCK : 1), t, 0.02);
  sfxBus.gain.setTargetAtTime(settings.sfxMuted ? 0 : settings.sfx, t, 0.02);
  if (voiceBus) voiceBus.gain.setTargetAtTime(settings.voiceMuted ? 0 : settings.voice, t, 0.02);
}

// Keep the derived master flag in sync with the two per-bus flags. Called from
// every mute mutator before save/apply so getAudioSettings().muted, the Settings
// "MUTE ALL" row, and engineState all read one coherent value.
function syncMuted() {
  settings.muted = settings.musicMuted && settings.sfxMuted;
}

export function initAudio() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      musicBus = ctx.createGain();
      sfxBus = ctx.createGain();
      voiceBus = ctx.createGain();
      // Limiter safeguard: a fast-attack compressor with a hard-ish ratio just
      // below 0 dBFS. It never colours normal levels (nothing crosses -3 dB in
      // isolation); it only catches the rare moment when many voices sum past
      // the ceiling, preventing sum-clipping.
      limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.12;
      // SL7: an always-present lowpass on the music path, transparent (20 kHz) in
      // normal play. Only the tier-3 sad-mode drops its cutoff; off = no audible
      // colour, so normal playback is unchanged. music bus → filter → master.
      musicFilter = ctx.createBiquadFilter();
      musicFilter.type = "lowpass";
      musicFilter.frequency.value = OPEN_LP_HZ;
      musicFilter.Q.value = 0.707;
      musicBus.connect(musicFilter);
      musicFilter.connect(masterGain);
      sfxBus.connect(masterGain);
      voiceBus.connect(masterGain);
      masterGain.connect(limiter);
      limiter.connect(ctx.destination);
      // set gains immediately (no ramp) so the very first note is at the right level
      masterGain.gain.value = settings.muted ? 0 : MASTER;
      musicBus.gain.value = settings.musicMuted ? 0 : settings.music * (ducked ? 0.7 : 1) * (pauseDucked ? 0.5 : 1) * (sadMode ? SAD_MUSIC_GAIN : 1) * (voDucked ? VO_DUCK : 1);
      sfxBus.gain.value = settings.sfxMuted ? 0 : settings.sfx;
      voiceBus.gain.value = settings.voiceMuted ? 0 : settings.voice;
      // Dev-only capture tap (tools/capture_walkthrough.mjs): publish references to
      // the live ctx + master output so the walkthrough recorder can add its own
      // MediaStreamAudioDestinationNode alongside the normal destination. This is
      // purely additive — it connects/mutates/disconnects NOTHING and is never read
      // by gameplay or any audio path, so normal play is byte-for-byte unchanged.
      try {
        if (typeof window !== "undefined" && window.__BB && window.__BB.audio) {
          window.__BB.audio._captureTap = { ctx, masterGain };
        }
      } catch (e) { /* window/__BB absent — nothing to publish */ }
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
export function getVoiceBus() {
  return voiceBus;
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
export function setVoiceVolume(v) {
  settings.voice = clamp01(v);
  saveSettings();
  applySettings();
}
// --- VOICE (VO) mute — a SEPARATE opt-out from music/sfx (voice on by default) --
export function setVoiceMuted(b) {
  settings.voiceMuted = !!b;
  saveSettings();
  applySettings();
}
export function toggleVoiceMuted() {
  setVoiceMuted(!settings.voiceMuted);
  return settings.voiceMuted;
}
export function isVoiceMuted() {
  return settings.voiceMuted;
}
// --- MUTE ALL (master) -------------------------------------------------------
// setMuted / toggleMute drive BOTH per-bus flags together (the derived master).
// Kept named `setMuted`/`toggleMute` so mute.js, SettingsScene, and the audio
// suite keep working unchanged.
export function setMuted(b) {
  settings.musicMuted = settings.sfxMuted = !!b;
  syncMuted();
  saveSettings();
  applySettings();
}
export function setBothMuted(b) {
  setMuted(b);
}
export function toggleMute() {
  setMuted(!settings.muted);
  return settings.muted;
}

// --- per-bus mute ------------------------------------------------------------
export function setMusicMuted(b) {
  settings.musicMuted = !!b;
  syncMuted();
  saveSettings();
  applySettings();
}
export function toggleMusicMuted() {
  setMusicMuted(!settings.musicMuted);
  return settings.musicMuted;
}
export function setSfxMuted(b) {
  settings.sfxMuted = !!b;
  syncMuted();
  saveSettings();
  applySettings();
}
export function toggleSfxMuted() {
  setSfxMuted(!settings.sfxMuted);
  return settings.sfxMuted;
}

// Current mute state for the global dropdown glyph + rows.
export function getMuteState() {
  return {
    musicMuted: settings.musicMuted,
    sfxMuted: settings.sfxMuted,
    muted: settings.muted, // derived master (both buses muted)
  };
}

export function getAudioSettings() {
  return { ...settings };
}
export function duckMusic(on) {
  ducked = !!on;
  applySettings();
}
// VO duck: dip the music bus to VO_DUCK while a spoken line is playing so the
// voice stays clear. Independent of the blip/pause/sad ducks (they all stack).
export function voDuck(on) {
  voDucked = !!on;
  applySettings();
}
// SL7: toggle the tier-3 "cold hard truth" sad-music treatment. On → dip the music
// bus + close the lowpass to SAD_LP_HZ (muffled/somber). Off → restore the bus gain
// and re-open the lowpass to transparent, i.e. exactly normal playback. Reversible,
// additive, and inert when audio is muted (applySettings drives musicMuted → 0). No-op
// if the context/filter hasn't been built yet (nothing to treat).
export function setSadMusic(on) {
  const next = !!on;
  if (next === sadMode) return;
  sadMode = next;
  if (musicFilter && ctx) {
    // ramp the cutoff so the muffle/un-muffle glides (no click), matching the
    // grey-fade's ~0.3s feel; setTargetAtTime time-constant ≈ perceived glide.
    musicFilter.frequency.setTargetAtTime(sadMode ? SAD_LP_HZ : OPEN_LP_HZ, ctx.currentTime, 0.12);
  }
  applySettings(); // bus gain dip / restore rides the standard duck plumbing
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
    voiceBus: voiceBus ? voiceBus.gain.value : null,
    voDucked,
    sadMode,
    musicLP: musicFilter ? musicFilter.frequency.value : null,
  };
}
