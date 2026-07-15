// Produced sound-effect (sample) layer — the "real SFX" upgrade over the synth.
//
// The game's default sound effects are synthesized in code (src/audio/sfx.js —
// oscillators/noise, the source of the slightly retro character). This module lets
// a produced audio file (WAV/MP3) transparently REPLACE any named sfx voice: drop
// public/sfx/<name>.wav, run `node tools/gen_sfx_manifest.mjs`, and that sound plays
// the file instead. No file present -> the synth voice plays, so the game is
// unchanged until samples are added.
//
// One-shots, routed through the SAME sfxBus (so sfx volume / mute apply). Positional
// voices keep their stereo pan + proximity volume — sfx.js computes pan/vol from
// (x,y) exactly as the synth path does and passes them in here.

import { getCtx, getSfxBus } from "./engine.js";
import { SFX_SAMPLES } from "./sfxsamples_manifest.js";

const SFX_BASE = `${import.meta.env && import.meta.env.BASE_URL ? import.meta.env.BASE_URL : "/"}sfx/`;
const bufCache = new Map(); // name -> AudioBuffer
const missing = new Set();  // names we 404'd/failed on (don't refetch)

// Does a produced sample exist for this voice? (sync — manifest lookup)
export function sfxSampleReady(name) {
  return !!SFX_SAMPLES[name] && !missing.has(name);
}
export function sfxSampleState() {
  return { names: Object.keys(SFX_SAMPLES), cached: bufCache.size, missing: missing.size };
}

async function load(name) {
  if (bufCache.has(name)) return bufCache.get(name);
  if (missing.has(name)) return null;
  const ext = SFX_SAMPLES[name];
  if (!ext) return null;
  const ctx = getCtx();
  if (!ctx) return null;
  try {
    const res = await fetch(`${SFX_BASE}${name}.${ext}`);
    if (!res.ok) { missing.add(name); return null; }
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    bufCache.set(name, buf);
    return buf;
  } catch (e) {
    missing.add(name); // network/decode failure -> permanently fall back to synth
    return null;
  }
}

// Warm the decode cache for every sampled voice, so the first in-game trigger has
// zero latency. Called from audio.js initAudio() once the ctx exists.
export function preloadSfxSamples() {
  if (!getCtx()) return;
  for (const name of Object.keys(SFX_SAMPLES)) load(name);
}

function spawn(ctx, bus, buf, pan, vol) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = Math.max(0, Math.min(1, vol));
  if (pan && ctx.createStereoPanner) {
    const pn = ctx.createStereoPanner();
    pn.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(pn); pn.connect(g);
  } else {
    src.connect(g);
  }
  g.connect(bus);
  try { src.start(); } catch (e) { /* ctx not running */ }
}

// Play the produced sample for `name` as a one-shot. `pan` (-1..1) and `vol` (0..1)
// come from the caller (sfx.js computes them from x,y). Cached buffers play
// instantly; an uncached one decodes then plays (only the very first hit).
export function playSfxSample(name, pan = 0, vol = 1) {
  const ctx = getCtx();
  const bus = getSfxBus();
  if (!ctx || !bus) return;
  const buf = bufCache.get(name);
  if (buf) { spawn(ctx, bus, buf, pan, vol); return; }
  load(name).then((b) => { if (b) spawn(ctx, bus, b, pan, vol); });
}
