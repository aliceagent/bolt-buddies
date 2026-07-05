// Sound effects — the original tone() blips, now routed through the sfx bus,
// plus noise()/slide() helpers and a rate limiter for repeatable sounds.
// Everything is short-lived: a call creates a couple of nodes that stop and get
// garbage-collected; nothing is created per frame.

import { getCtx, getSfxBus } from "./engine.js";

// --- tone: the classic chiptune blip ---------------------------------------
export function tone(freq, dur = 0.1, type = "square", vol = 0.05, slideBy = 0) {
  const ctx = getCtx();
  const bus = getSfxBus();
  if (!ctx || ctx.state !== "running" || !bus) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideBy) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slideBy), ctx.currentTime + dur);
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g).connect(bus);
  o.start();
  o.stop(ctx.currentTime + dur);
}

// --- noise: a filtered noise burst (hisses, impacts, snares) ----------------
// A single 1s white-noise buffer is generated once and reused for every burst.
let noiseBuf = null;
function getNoiseBuffer(ctx) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    const len = ctx.sampleRate; // 1 second
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

export function noise(dur = 0.1, { type = "lowpass", freq = 1000, q = 1, vol = 0.05 } = {}) {
  const ctx = getCtx();
  const bus = getSfxBus();
  if (!ctx || ctx.state !== "running" || !bus) return;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.setValueAtTime(freq, ctx.currentTime);
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  src.connect(filt).connect(g).connect(bus);
  src.start();
  src.stop(ctx.currentTime + dur);
}

// --- slide: a pitch glissando between two frequencies -----------------------
export function slide(f1, f2, dur = 0.2, type = "sine", vol = 0.05) {
  const ctx = getCtx();
  const bus = getSfxBus();
  if (!ctx || ctx.state !== "running" || !bus) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f1, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, f2), ctx.currentTime + dur);
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g).connect(bus);
  o.start();
  o.stop(ctx.currentTime + dur);
}

// --- rateLimit: true if this key may fire again, false if it's too soon ------
// Keeps repeatable SFX (skitters, hisses, flutter) from stacking into noise.
const rlMap = new Map();
export function rateLimit(key, ms) {
  const now = performance.now();
  const last = rlMap.get(key);
  if (last !== undefined && now - last < ms) return false;
  rlMap.set(key, now);
  return true;
}

// The game's sound library. Same names/voices as before — nothing at the call
// sites changes — but every blip now flows through the sfx bus.
export const sfx = {
  jump: () => tone(300, 0.12, "square", 0.035, 200),
  land: () => tone(120, 0.08, "triangle", 0.04),
  pickup: () => { tone(500, 0.07); setTimeout(() => tone(750, 0.09), 50); },
  throwIt: () => tone(260, 0.12, "sawtooth", 0.04, -120),
  zip: () => tone(600, 0.18, "sawtooth", 0.03, 500),
  reel: () => tone(400, 0.2, "sawtooth", 0.03, 300),
  lever: () => { tone(220, 0.08, "square"); setTimeout(() => tone(330, 0.1), 60); },
  door: () => tone(90, 0.4, "sawtooth", 0.05, 60),
  key: () => { tone(660, 0.08); setTimeout(() => tone(880, 0.12), 70); },
  core: () => { tone(523, 0.09); setTimeout(() => tone(659, 0.09), 70); setTimeout(() => tone(784, 0.14), 140); },
  die: () => tone(200, 0.3, "sawtooth", 0.05, -160),
  stomp: () => tone(70, 0.22, "triangle", 0.09, -30),
  bounce: () => tone(340, 0.1, "sine", 0.05, 220),
  win: () => [392, 523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, "square", 0.05), i * 110)),
  blip: () => tone(940, 0.03, "square", 0.012),
  denied: () => tone(140, 0.12, "square", 0.04, -40),
  crush: () => tone(100, 0.15, "sawtooth", 0.06, -60),
  yank: () => tone(500, 0.15, "sawtooth", 0.05, -350),
  pop: () => tone(800, 0.06, "square", 0.04, 300),
};
