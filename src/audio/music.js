// Music — a 16-step-per-bar sequencer built on the standard
// 25ms-interval / 120ms-lookahead WebAudio scheduling pattern.
//
// Voices:  bass  — triangle
//          lead  — square, slight detune
//          arp   — pulse (25% duty, via a PeriodicWave)
//          pad   — two detuned saws through a gentle lowpass
//          drums — sine kick + filtered-noise snare/hat
//
// Tracks are PURE DATA. To honour the binding "Music direction" (long,
// sectioned, non-repetitive compositions) each track is authored as an ordered
// list of SECTIONS, each carrying its own per-voice bar patterns — so S2 can
// bolt on more sections/tracks without touching this engine. Pads/leads run
// through a ~3kHz lowpass and everything sits quiet (music default 0.45) so the
// track never competes with the game.

import { getCtx, getMusicBus } from "./engine.js";

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// build a 16-step row from a sparse { stepIndex: value } map (value may be a
// number, a chord array, or a drum string; unspecified steps are rests)
function row(map) {
  const a = new Array(16).fill(null);
  for (const k in map) a[+k] = map[k];
  return a;
}

// ---------------------------------------------------------------------------
// TRACKS — the pure-data song library. S1 ships one proof track: `title`.
// ---------------------------------------------------------------------------
//
// title — warm C-major synthwave, 90 BPM. Two distinct sections:
//   A  intro/verse: slow pad (I-vi-IV-V), gentle quarter-note arp, no lead,
//      one soft kick + airy hats. Hopeful and roomy.
//   B  lift: chord move (IV-V-vi-V), a square lead sings the melody, the arp
//      doubles to 8th-notes and a soft backbeat snare comes in.
// The scheduler loops A -> B -> A -> B..., so the listener always hears the
// section contrast rather than one 4-bar loop.
const TRACKS = {
  title: {
    bpm: 90,
    root: 60, // C4
    scale: [0, 2, 4, 5, 7, 9, 11], // major
    sections: [
      {
        name: "A",
        bars: 4,
        pads: [
          row({ 0: [60, 64, 67] }), // C
          row({ 0: [57, 60, 64] }), // Am
          row({ 0: [53, 57, 60] }), // F
          row({ 0: [55, 59, 62] }), // G
        ],
        bass: [
          row({ 0: 36, 8: 43 }), // C2 -> G2
          row({ 0: 45, 8: 52 }), // A2 -> E3
          row({ 0: 41, 8: 48 }), // F2 -> C3
          row({ 0: 43, 8: 50 }), // G2 -> D3
        ],
        arp: [
          row({ 0: 72, 4: 76, 8: 79, 12: 76 }), // C E G E
          row({ 0: 69, 4: 72, 8: 76, 12: 72 }), // A C E C
          row({ 0: 65, 4: 69, 8: 72, 12: 69 }), // F A C A
          row({ 0: 67, 4: 71, 8: 74, 12: 71 }), // G B D B
        ],
        lead: [row({}), row({}), row({}), row({})], // section A: no lead
        drums: [
          row({ 0: "k", 4: "h", 8: "h", 12: "h" }),
          row({ 0: "k", 4: "h", 8: "h", 12: "h" }),
          row({ 0: "k", 4: "h", 8: "h", 12: "h" }),
          row({ 0: "k", 4: "h", 8: "h", 12: "h" }),
        ],
      },
      {
        name: "B",
        bars: 4,
        pads: [
          row({ 0: [53, 57, 60] }), // F
          row({ 0: [55, 59, 62] }), // G
          row({ 0: [57, 60, 64] }), // Am
          row({ 0: [55, 59, 62] }), // G
        ],
        bass: [
          row({ 0: 41, 8: 48 }),
          row({ 0: 43, 8: 50 }),
          row({ 0: 45, 8: 52 }),
          row({ 0: 43, 8: 50 }),
        ],
        arp: [
          row({ 0: 65, 2: 69, 4: 72, 6: 69, 8: 65, 10: 69, 12: 72, 14: 69 }),
          row({ 0: 67, 2: 71, 4: 74, 6: 71, 8: 67, 10: 71, 12: 74, 14: 71 }),
          row({ 0: 69, 2: 72, 4: 76, 6: 72, 8: 69, 10: 72, 12: 76, 14: 72 }),
          row({ 0: 67, 2: 71, 4: 74, 6: 71, 8: 67, 10: 71, 12: 74, 14: 71 }),
        ],
        lead: [
          row({ 0: 69, 8: 72 }), // A4 -> C5
          row({ 0: 71, 8: 74 }), // B4 -> D5
          row({ 0: 72, 8: 76 }), // C5 -> E5
          row({ 0: 74, 8: 71 }), // D5 -> B4
        ],
        drums: [
          row({ 0: "k", 2: "h", 4: "s", 6: "h", 8: "k", 10: "h", 12: "s", 14: "h" }),
          row({ 0: "k", 2: "h", 4: "s", 6: "h", 8: "k", 10: "h", 12: "s", 14: "h" }),
          row({ 0: "k", 2: "h", 4: "s", 6: "h", 8: "k", 10: "h", 12: "s", 14: "h" }),
          row({ 0: "k", 2: "h", 4: "s", 6: "h", 8: "k", 10: "h", 12: "s", 14: "h" }),
        ],
      },
    ],
  },
};

// flatten a track's sections into an ordered list of bars, tagging each with its
// source section (so state can report section/bar for tests + S2).
function flatten(def) {
  const bars = [];
  def.sections.forEach((sec, si) => {
    for (let b = 0; b < sec.bars; b++) {
      bars.push({
        section: si,
        sectionName: sec.name,
        pads: sec.pads ? sec.pads[b % sec.pads.length] : null,
        bass: sec.bass ? sec.bass[b % sec.bass.length] : null,
        arp: sec.arp ? sec.arp[b % sec.arp.length] : null,
        lead: sec.lead ? sec.lead[b % sec.lead.length] : null,
        drums: sec.drums ? sec.drums[b % sec.drums.length] : null,
      });
    }
  });
  return bars;
}

// ---------------------------------------------------------------------------
// synthesis primitives (all short-lived; created per scheduled note, stopped
// and GC'd — no per-frame or persistent-per-voice node churn)
// ---------------------------------------------------------------------------
let pulseWave = null;
let pulseCtx = null;
function getPulse(ctx) {
  if (pulseWave && pulseCtx === ctx) return pulseWave;
  const n = 20;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  const duty = 0.25;
  for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  pulseWave = ctx.createPeriodicWave(real, imag);
  pulseCtx = ctx;
  return pulseWave;
}

let mNoise = null;
function musicNoise(ctx) {
  if (!mNoise || mNoise.sampleRate !== ctx.sampleRate) {
    const len = ctx.sampleRate;
    mNoise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = mNoise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return mNoise;
}

function schedOsc(ctx, dest, midi, when, dur, type, vol, detune = 0, wave = null) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  if (wave) o.setPeriodicWave(wave);
  else o.type = type;
  o.frequency.setValueAtTime(mtof(midi), when);
  if (detune) o.detune.setValueAtTime(detune, when);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(vol, when + Math.min(0.02, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g).connect(dest);
  o.start(when);
  o.stop(when + dur + 0.03);
}

function schedPad(ctx, dest, midi, when, dur, vol) {
  schedOsc(ctx, dest, midi, when, dur, "sawtooth", vol, -7);
  schedOsc(ctx, dest, midi, when, dur, "sawtooth", vol, +7);
}

function schedKick(ctx, dest, when, vol) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(120, when);
  o.frequency.exponentialRampToValueAtTime(45, when + 0.12);
  g.gain.setValueAtTime(vol, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
  o.connect(g).connect(dest);
  o.start(when);
  o.stop(when + 0.16);
}

function schedNoiseHit(ctx, dest, when, dur, freq, vol) {
  const src = ctx.createBufferSource();
  src.buffer = musicNoise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(when);
  src.stop(when + dur + 0.02);
}

// per-track output chain: pad + lead flow through a gentle lowpass; bass, arp
// and drums go straight to the track's fader.
function buildChain(ctx, out) {
  const trackGain = ctx.createGain();
  trackGain.connect(out);
  const soft = ctx.createBiquadFilter();
  soft.type = "lowpass";
  soft.frequency.value = 3000;
  soft.Q.value = 0.5;
  soft.connect(trackGain);
  return { trackGain, soft };
}

// ---------------------------------------------------------------------------
// scheduler
// ---------------------------------------------------------------------------
const LOOKAHEAD = 0.12; // seconds scheduled ahead
const INTERVAL = 25; // ms between scheduler ticks

let tracks = []; // active runtimes (a crossfade briefly has two)
let timerId = null;
let current = null; // intended track id (set even before the ctx exists)
let playing = false;
let pendingId = null; // requested before the ctx was ready; started on first init

const stepDur = (rt) => 60 / rt.def.bpm / 4;
const layerOn = (rt, name) => rt.layers[name] !== false;

function scheduleStep(rt, gStep, when) {
  const ctx = getCtx();
  const bars = rt.bars;
  const barIdx = Math.floor(gStep / 16) % bars.length;
  const s = gStep % 16;
  const bar = bars[barIdx];
  rt.curBar = barIdx;
  rt.curSection = bar.section;
  rt.curSectionName = bar.sectionName;
  const sec = stepDur(rt);
  const { soft, trackGain } = rt.chain;

  if (bar.pads && bar.pads[s]) {
    const dur = sec * 16 * 0.98;
    for (const m of bar.pads[s]) schedPad(ctx, soft, m, when, dur, 0.02);
  }
  if (bar.bass && bar.bass[s] != null) {
    schedOsc(ctx, trackGain, bar.bass[s], when, sec * 3.6, "triangle", 0.075);
  }
  if (bar.lead && bar.lead[s] != null && layerOn(rt, "lead")) {
    schedOsc(ctx, soft, bar.lead[s], when, sec * 3.4, "square", 0.03, 0);
    schedOsc(ctx, soft, bar.lead[s], when, sec * 3.4, "square", 0.022, 6);
  }
  if (bar.arp && bar.arp[s] != null && layerOn(rt, "arp")) {
    schedOsc(ctx, trackGain, bar.arp[s], when, sec * 1.4, "square", 0.018, 0, getPulse(ctx));
  }
  if (bar.drums && bar.drums[s] && layerOn(rt, "drums")) {
    const h = bar.drums[s];
    if (h.includes("k")) schedKick(ctx, trackGain, when, 0.085);
    if (h.includes("s")) schedNoiseHit(ctx, trackGain, when, 0.13, 1400, 0.045);
    if (h.includes("h")) schedNoiseHit(ctx, trackGain, when, 0.03, 8000, 0.022);
  }
}

function scheduler() {
  const ctx = getCtx();
  if (!ctx) {
    timerId = null;
    return;
  }
  const now = ctx.currentTime;
  for (const rt of tracks) {
    // resync after a long stall (tab backgrounded, context frozen) so we don't
    // burst-schedule a big backlog of notes at once
    if (rt.nextTime < now - 0.25) rt.nextTime = now + 0.02;
    let guard = 0;
    while (rt.nextTime < now + LOOKAHEAD && guard < 64) {
      scheduleStep(rt, rt.step, rt.nextTime);
      rt.step++;
      rt.nextTime += stepDur(rt);
      guard++;
    }
  }
  if (tracks.some((rt) => rt.removeAt && now >= rt.removeAt)) {
    tracks = tracks.filter((rt) => {
      if (rt.removeAt && now >= rt.removeAt) {
        try {
          rt.chain.trackGain.disconnect();
          rt.chain.soft.disconnect();
        } catch (e) {
          /* already gone */
        }
        return false;
      }
      return true;
    });
  }
  if (tracks.length) {
    timerId = setTimeout(scheduler, INTERVAL);
  } else {
    timerId = null;
    playing = false;
  }
}

function fadeOut(rt, dur) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  const g = rt.chain.trackGain.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(Math.max(0.0001, g.value), t);
  g.exponentialRampToValueAtTime(0.0001, t + dur);
  rt.removeAt = t + dur + 0.05;
}

function startTrack(id) {
  const ctx = getCtx();
  const musicBus = getMusicBus();
  if (!ctx || !musicBus || !TRACKS[id]) return;
  const active = tracks.find((rt) => !rt.removeAt);
  if (active && active.id === id) return; // already playing — no-op
  for (const rt of tracks) if (!rt.removeAt) fadeOut(rt, 0.6); // crossfade out the old
  const chain = buildChain(ctx, musicBus);
  const t = ctx.currentTime;
  chain.trackGain.gain.setValueAtTime(0.0001, t);
  chain.trackGain.gain.exponentialRampToValueAtTime(1, t + 0.6); // 0.6s crossfade in
  tracks.push({
    id,
    def: TRACKS[id],
    bars: flatten(TRACKS[id]),
    chain,
    step: 0,
    nextTime: t + 0.08,
    curBar: 0,
    curSection: 0,
    curSectionName: "",
    layers: {},
  });
  current = id;
  playing = true;
  pendingId = null;
  if (!timerId) scheduler();
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------
export function playTrack(id) {
  if (!TRACKS[id]) return;
  current = id;
  const ctx = getCtx();
  if (!ctx || !getMusicBus()) {
    // context not built yet (autoplay policy) — remember it; the first initAudio
    // (fired from a scene's keydown) will start it via startPendingMusic().
    pendingId = id;
    return;
  }
  startTrack(id);
}

// called from the audio shim's initAudio(), right after the ctx is created +
// resumed on the first user gesture.
export function startPendingMusic() {
  if (pendingId && getCtx()) startTrack(pendingId);
}

export function stopMusic() {
  const ctx = getCtx();
  if (ctx) for (const rt of tracks) if (!rt.removeAt) fadeOut(rt, 0.4);
  current = null;
  playing = false;
  pendingId = null;
}

export function setMusicLayer(name, on) {
  for (const rt of tracks) if (!rt.removeAt) rt.layers[name] = !!on;
}

// Test/state surface -> window.__BB.audio.music
export const musicState = {
  get current() {
    return current;
  },
  get playing() {
    return playing;
  },
  get bar() {
    const rt = tracks.find((r) => !r.removeAt);
    return rt ? rt.curBar : -1;
  },
  get section() {
    const rt = tracks.find((r) => !r.removeAt);
    return rt ? rt.curSection : -1;
  },
};
