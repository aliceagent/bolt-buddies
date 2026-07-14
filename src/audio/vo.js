// Spoken voice-over (VO) player.
//
// Spoken lines are pre-generated at build time by tools/gen_vo.mjs (xAI TTS) into
// public/vo/<id>.mp3, with a companion manifest (src/audio/vo_manifest.js) that
// maps a normalized *caption* string to a clip id + the speaker. Captions stay on
// screen exactly as before — this layer just speaks a matching line over the top.
//
// Design:
//   * One clip at a time. A new line cancels the one playing (barks/lines never
//     overlap into mush) — the newest intent wins, matching the on-screen blip
//     which is also single-slot.
//   * Plays through the engine's voiceBus (own mute + volume). While a clip
//     sounds, voDuck(true) dips the music bus; when it ends/cancels, voDuck(false).
//   * Lazy + cached: each mp3 is fetched+decoded once, then the AudioBuffer is
//     reused. Missing files fail silently (a caption with no generated clip just
//     stays a caption — the game is fully playable with zero mp3s present).
//   * Zero-cost when idle and inert under mute: if voice is muted we skip fetch +
//     playback entirely (no duck, no decode), so muting VOICE is a true no-op.
//
// This module never throws into gameplay: every await is guarded, and any failure
// (network, decode, unsupported ctx) degrades to "no voice for this line".

import { getCtx, getVoiceBus, voDuck, isVoiceMuted } from "./engine.js";
import { VO_LOOKUP } from "./vo_manifest.js";

// Vite serves /public at the web root; import.meta.env.BASE_URL is "/" in dev and
// the deploy base in prod. Clips live at <base>vo/<id>.mp3.
const VO_BASE = `${import.meta.env && import.meta.env.BASE_URL ? import.meta.env.BASE_URL : "/"}vo/`;

const bufCache = new Map(); // id -> AudioBuffer (decoded once)
const missing = new Set();  // ids we already 404'd on — don't refetch every blip
let curSource = null;       // the currently-playing BufferSourceNode (or null)
let curId = null;
let playToken = 0;          // bumped on every play() so stale async resolves bail

// Normalize a caption/line to a stable lookup key: strip a leading "KOBI:"/"NARR:"
// speaker tag, lowercase, collapse whitespace, drop trailing punctuation. This is
// the SAME normalization gen_vo.mjs applies when it builds VO_LOOKUP, so a blip's
// on-screen text finds its clip even with minor punctuation drift.
export function voKey(s) {
  return String(s == null ? "" : s)
    .replace(/^\s*[A-Z][A-Z0-9 ._-]{0,14}:\s*/, "") // speaker prefix (KOBI:, NARRATOR:)
    .toLowerCase()
    .replace(/[\s]+/g, " ")
    .replace(/[.!?…,"'’—-]+/g, "")
    .trim();
}

// Resolve a caption to a clip id via the manifest (or null if nothing matches).
export function voIdForText(text) {
  const k = voKey(text);
  return (k && VO_LOOKUP[k]) || null;
}

function stopCurrent(restoreDuck) {
  if (curSource) {
    try { curSource.onended = null; curSource.stop(); } catch (e) { /* already stopped */ }
    try { curSource.disconnect(); } catch (e) { /* detached */ }
  }
  curSource = null;
  curId = null;
  if (restoreDuck) voDuck(false);
}

async function loadBuffer(id) {
  if (bufCache.has(id)) return bufCache.get(id);
  if (missing.has(id)) return null;
  const ctx = getCtx();
  if (!ctx) return null;
  try {
    const res = await fetch(`${VO_BASE}${id}.mp3`);
    if (!res.ok) { missing.add(id); return null; }
    const arr = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr);
    bufCache.set(id, buf);
    return buf;
  } catch (e) {
    missing.add(id); // network/decode failure — treat as permanently absent
    return null;
  }
}

// Play the VO clip for a caption/line of text. No-op (returns false) when voice is
// muted, no clip matches, or audio is unavailable. Returns true if playback began.
export async function playForText(text) {
  return playVO(voIdForText(text));
}

// Play a specific clip id through the voice bus. Cancels any current clip first.
export async function playVO(id) {
  if (!id) return false;
  if (isVoiceMuted()) return false;      // VOICE off -> true no-op (no fetch/duck)
  const ctx = getCtx();
  const bus = getVoiceBus();
  if (!ctx || !bus) return false;

  const token = ++playToken;
  const buf = await loadBuffer(id);
  // A newer play() started (or muted) while we were decoding — abandon this one.
  if (token !== playToken || !buf || isVoiceMuted()) return false;

  stopCurrent(false); // replace the outgoing clip; keep the duck asserted across the swap
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(bus);
  curSource = src;
  curId = id;
  voDuck(true);
  src.onended = () => {
    // Only the still-current source clears state (a later clip may have taken over).
    if (curSource === src) {
      curSource = null;
      curId = null;
      voDuck(false);
    } else {
      try { src.disconnect(); } catch (e) { /* detached */ }
    }
  };
  try {
    src.start();
  } catch (e) {
    stopCurrent(true);
    return false;
  }
  return true;
}

// Hard stop — used on scene shutdown so a line never bleeds across a scene swap.
export function stopVO() {
  playToken++; // invalidate any in-flight decode
  stopCurrent(true);
}

// Is a clip currently sounding? (test/debug surface)
export function voState() {
  return { playing: !!curSource, id: curId, cached: bufCache.size, missing: missing.size };
}
