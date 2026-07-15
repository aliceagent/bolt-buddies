// Produced-music (MP3) layer — the "real music" upgrade over the procedural synth.
//
// The game's default music is generated in code (src/audio/music.js — that's the
// chiptune/retro sound). This module lets a produced MP3 track transparently REPLACE
// the synth for any track id: drop public/music/<id>.mp3, run
// `node tools/gen_music_manifest.mjs`, and that track plays the file instead. No
// file present -> the synth keeps playing, so the game is unchanged until you add
// music. Everything routes through the SAME musicBus, so volume / mute / ducking /
// the VO music-duck all apply exactly as before.
//
// Track ids come from music.js (title, hub, w1l1..w1l3, w2l1..w2l3, w3, w4). A file
// can be per-track (w1l2.mp3) OR per-world (w1.mp3) — a level id falls back to its
// world group, so as few as ~7 files (title, hub, w1..w4, finale) can score the
// whole game, or you can go per-level for more variety.

import { getCtx, getMusicBus } from "./engine.js";
import { MUSIC_FILES } from "./music_manifest.js";

const AVAIL = new Set(MUSIC_FILES);
const MUSIC_BASE = `${import.meta.env && import.meta.env.BASE_URL ? import.meta.env.BASE_URL : "/"}music/`;

const bufCache = new Map(); // file -> AudioBuffer
let cur = null;             // { id, src, gain }
let curId = null;
let playToken = 0;

// Resolve a track id to an available file: exact id first, else its world group
// (w1l2 -> w1). Returns null when nothing is available (caller keeps the synth).
export function resolveFile(id) {
  if (AVAIL.has(id)) return id;
  const m = /^w(\d)l\d$/.exec(id);
  if (m && AVAIL.has(`w${m[1]}`)) return `w${m[1]}`;
  // finale levels (4-x) may share a "finale" file if provided
  if (/^w4/.test(id) && AVAIL.has("finale")) return "finale";
  return null;
}
export function mp3HasTrack(id) {
  return resolveFile(id) !== null;
}
export function mp3State() {
  return { id: curId, playing: !!cur, files: AVAIL.size };
}

async function loadBuf(file) {
  if (bufCache.has(file)) return bufCache.get(file);
  const ctx = getCtx();
  if (!ctx) return null;
  try {
    const res = await fetch(`${MUSIC_BASE}${file}.mp3`);
    if (!res.ok) return null;
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    bufCache.set(file, buf);
    return buf;
  } catch (e) {
    return null; // network/decode failure -> caller falls back to synth
  }
}

// Fade out + stop the current produced track (used on track change / stopMusic).
export function mp3StopTrack(fade = 0.6) {
  if (!cur) return;
  const ctx = getCtx();
  const c = cur;
  cur = null;
  curId = null;
  if (ctx && c.gain) {
    const t = ctx.currentTime;
    try {
      c.gain.gain.cancelScheduledValues(t);
      c.gain.gain.setValueAtTime(Math.max(0.0001, c.gain.gain.value), t);
      c.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
    } catch (e) { /* node detached */ }
    try { c.src.stop(t + fade + 0.05); } catch (e) { /* already stopped */ }
  } else {
    try { c.src.stop(); } catch (e) { /* already stopped */ }
  }
}

// Start (looping) the produced track for `id`, crossfading from any current one.
// Returns true if playback began. Async: the buffer is fetched+decoded once, then
// cached. Guarded by a token so a rapid track change can't leave a stale loop.
export async function mp3PlayTrack(id) {
  const file = resolveFile(id);
  if (!file) return false;
  const ctx = getCtx();
  const bus = getMusicBus();
  if (!ctx || !bus) return false;
  const token = ++playToken;
  const buf = await loadBuf(file);
  if (token !== playToken || !buf) return false; // superseded or missing
  mp3StopTrack(0.6); // crossfade out the outgoing produced track
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const gain = ctx.createGain();
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(1, t + 0.8); // 0.8s fade-in
  src.connect(gain);
  gain.connect(bus);
  try { src.start(); } catch (e) { return false; }
  cur = { id, src, gain };
  curId = id;
  return true;
}
