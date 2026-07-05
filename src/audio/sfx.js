// Sound effects — the full SFX pass (Sound Sprint S3).
//
// Everything here is short-lived WebAudio synthesis routed through the sfx bus:
// a one-shot voice creates a couple of oscillator/gain/noise nodes that stop and
// get garbage-collected. The only persistent nodes are the ambience LOOPS
// (motor / hiss / fan / conveyor / lift) — exactly ONE gain-wrapped source per
// emitter *kind*, whose gain is driven by proximity every frame. Nothing is
// created per frame.
//
// Design rules honoured (roadmap "Ground rules"):
//   • every repeatable voice goes through rateLimit()
//   • proximity voices attenuate with distance from the camera midpoint and are
//     SILENT off-screen (see setListener/proximity below)
//   • loops are one persistent source per kind, gain = proximity (never per-frame
//     node creation)
//   • levels stay modest — one-shots peak ≈0.09 (the pre-existing stomp), loops
//     stay ≤0.055, KOBI blips stay the quietest thing in the mix (~0.012)

import { getCtx, getSfxBus } from "./engine.js";

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// --- tone: the classic chiptune blip ---------------------------------------
export function tone(freq, dur = 0.1, type = "square", vol = 0.05, slideBy = 0) {
  const ctx = getCtx();
  const bus = getSfxBus();
  if (!ctx || ctx.state !== "running" || !bus || vol <= 0) return;
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
  if (!ctx || ctx.state !== "running" || !bus || vol <= 0) return;
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
  if (!ctx || ctx.state !== "running" || !bus || vol <= 0) return;
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
// Keeps repeatable SFX (skitters, hisses, flutter, servos) from stacking.
const rlMap = new Map();
export function rateLimit(key, ms) {
  const now = performance.now();
  const last = rlMap.get(key);
  if (last !== undefined && now - last < ms) return false;
  rlMap.set(key, now);
  return true;
}

// --- test surface: per-voice play counter -----------------------------------
// Counts the number of times a voice actually PASSED its gate and attempted to
// play (used by the audio playtest's rate-limiter + mood checks). Not audio.
export const sfxCounts = {};
function bump(name) {
  sfxCounts[name] = (sfxCounts[name] || 0) + 1;
}
export function resetSfxCounts() {
  for (const k in sfxCounts) delete sfxCounts[k];
}

// ---------------------------------------------------------------------------
// Proximity: the camera midpoint + half-extents, pushed each frame by the game.
// Positional voices scale their volume by how near the emitter is to the middle
// of the screen and go fully silent once the emitter is off-screen.
// ---------------------------------------------------------------------------
const listener = { x: 0, y: 0, halfW: 640, halfH: 360, ready: false };
export function setListener(x, y, halfW, halfH) {
  listener.x = x;
  listener.y = y;
  listener.halfW = halfW;
  listener.halfH = halfH;
  listener.ready = true;
}
export function clearListener() {
  listener.ready = false;
}
// 1.0 at the camera midpoint, ~0.2 at the screen edge, 0 once off-screen.
export function proximity(x, y) {
  if (!listener.ready) return 1;
  const dx = Math.abs(x - listener.x);
  const dy = Math.abs(y - listener.y);
  if (dx > listener.halfW * 1.12 || dy > listener.halfH * 1.12) return 0;
  const r = Math.min(1, Math.max(dx / listener.halfW, dy / listener.halfH));
  return clamp01(1 - 0.8 * r);
}
// positional volume: full when no coords given (player-centric / menu sounds).
function pv(x, y) {
  return x == null ? 1 : proximity(x, y);
}

// ---------------------------------------------------------------------------
// Ambience LOOPS — one persistent gain-wrapped source per emitter kind.
// setLoop(key, prox) ramps that kind's gain toward prox*baseVol; the nodes are
// built lazily on first non-zero request and torn down by stopLoops() on scene
// exit. NEVER creates nodes per frame.
// ---------------------------------------------------------------------------
const LOOP_VOL = { motor: 0.05, lift: 0.045, hiss: 0.055, fan: 0.04, conveyor: 0.018 };
const loops = new Map();

function buildLoopNodes(ctx, key, dest) {
  const started = [];
  if (key === "hiss" || key === "fan" || key === "conveyor") {
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    if (key === "hiss") {
      filt.type = "bandpass";
      filt.frequency.value = 2600;
      filt.Q.value = 0.7;
    } else if (key === "fan") {
      filt.type = "bandpass";
      filt.frequency.value = 720;
      filt.Q.value = 0.6;
    } else {
      filt.type = "lowpass";
      filt.frequency.value = 380;
      filt.Q.value = 0.4;
    }
    src.connect(filt).connect(dest);
    src.start();
    started.push(src);
    if (key === "conveyor") {
      // a faint mechanical rumble under the belt noise
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.value = 58;
      og.gain.value = 0.5;
      o.connect(og).connect(dest);
      o.start();
      started.push(o);
    }
  } else {
    // motor / lift: a detuned low-oscillator hum through a lowpass
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = key === "lift" ? 520 : 320;
    filt.Q.value = 0.6;
    filt.connect(dest);
    const base = key === "lift" ? 82 : 52;
    [base, base * 1.01, base * 2].forEach((f, i) => {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = i === 2 ? "square" : "sawtooth";
      o.frequency.value = f;
      og.gain.value = i === 2 ? 0.18 : 0.5;
      o.connect(og).connect(filt);
      o.start();
      started.push(o);
    });
  }
  return started;
}

function ensureLoop(key) {
  const ctx = getCtx();
  const bus = getSfxBus();
  if (!ctx || ctx.state !== "running" || !bus) return null;
  let L = loops.get(key);
  if (L && L.ctx === ctx) return L;
  const g = ctx.createGain();
  g.gain.value = 0.00001;
  g.connect(bus);
  const nodes = buildLoopNodes(ctx, key, g);
  L = { ctx, gain: g, nodes };
  loops.set(key, L);
  return L;
}

export function setLoop(key, prox) {
  const target = clamp01(prox) * (LOOP_VOL[key] || 0.04);
  // don't allocate a loop just to keep it silent
  if (!loops.has(key) && target <= 0.0002) return;
  const L = ensureLoop(key);
  if (!L) return;
  L.gain.gain.setTargetAtTime(Math.max(0.00001, target), L.ctx.currentTime, 0.1);
}

export function stopLoops() {
  for (const [, L] of loops) {
    try {
      L.nodes.forEach((n) => n.stop && n.stop());
      L.gain.disconnect();
    } catch (e) {
      /* already gone */
    }
  }
  loops.clear();
}

// ---------------------------------------------------------------------------
// KOBI typewriter blip — three moods. gloating = default (bright + tiny),
// angry = lower/harsher sawtooth, defeated = a descending sigh. The mix keeps
// these the quietest voices in the game.
// ---------------------------------------------------------------------------
export function kobi(mood = "gloating") {
  bump("kobi_" + mood);
  if (mood === "angry") tone(560, 0.035, "sawtooth", 0.014, -60);
  else if (mood === "defeated") slide(720, 470, 0.06, "triangle", 0.012);
  else tone(940, 0.03, "square", 0.012);
}

// ---------------------------------------------------------------------------
// The sound library. Positional voices take an optional (x, y) world position
// and attenuate via proximity(); omit it for player-centric / menu sounds.
// ---------------------------------------------------------------------------
export const sfx = {
  // --- player actions ------------------------------------------------------
  jump: () => tone(300, 0.12, "square", 0.035, 220),
  land: (x, y) => { const v = 0.04 * pv(x, y); if (v > 0) { tone(120, 0.08, "triangle", v); noise(0.05, { type: "lowpass", freq: 500, vol: v * 0.5 }); } },
  // heavy stomp: a downward wind-up whoosh at launch, a big low impact on land
  stompLaunch: () => slide(520, 150, 0.22, "sawtooth", 0.03),
  stomp: (x, y) => { const v = pv(x, y); if (v > 0) { tone(70, 0.24, "triangle", 0.09 * v, -30); noise(0.16, { type: "lowpass", freq: 220, vol: 0.06 * v }); } },
  // grapple: a taut fire twang plus a short rising travel whoosh
  zip: () => { tone(600, 0.16, "sawtooth", 0.03, 520); noise(0.14, { type: "bandpass", freq: 1400, q: 1.2, vol: 0.02 }); },
  hangLatch: () => { tone(880, 0.03, "square", 0.03); setTimeout(() => tone(1180, 0.04, "square", 0.028), 32); },
  reel: () => tone(400, 0.2, "sawtooth", 0.03, 300),
  grab: () => { tone(300, 0.06, "triangle", 0.04); setTimeout(() => tone(460, 0.08, "triangle", 0.035), 45); },
  throwIt: () => tone(260, 0.12, "sawtooth", 0.04, -120),
  tossHigh: () => tone(520, 0.14, "sawtooth", 0.04, 260),
  hopOff: () => tone(360, 0.09, "square", 0.035, 180),
  die: (x, y) => { const v = pv(x, y); if (v > 0) { tone(200, 0.3, "sawtooth", 0.05 * v, -160); noise(0.18, { type: "highpass", freq: 900, vol: 0.03 * v }); } },
  respawn: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.09, "sine", 0.03), i * 55)); },
  phaseIn: () => slide(520, 900, 0.18, "sine", 0.028),
  phaseOut: () => slide(900, 520, 0.18, "sine", 0.028),
  fanFlutter: (x, y) => { if (!rateLimit("fanFlutter", 140)) return; const v = 0.02 * pv(x, y); if (v > 0) tone(760 + Math.random() * 120, 0.05, "triangle", v, 120); },
  equip: () => { [440, 587, 784, 988].forEach((f, i) => setTimeout(() => tone(f, 0.1, "square", 0.04), i * 60)); },

  // --- devices -------------------------------------------------------------
  lever: () => { tone(220, 0.08, "square", 0.05); setTimeout(() => tone(330, 0.1, "square", 0.045), 60); },
  platePress: (x, y) => { const v = 0.045 * pv(x, y); if (v > 0) { tone(300, 0.05, "square", v, -80); noise(0.05, { type: "lowpass", freq: 700, vol: v * 0.6 }); } },
  plateRelease: (x, y) => { const v = 0.04 * pv(x, y); if (v > 0) tone(240, 0.06, "square", v, 90); },
  door: (x, y) => { const v = pv(x, y); if (v > 0) { tone(90, 0.4, "sawtooth", 0.05 * v, 60); noise(0.3, { type: "lowpass", freq: 260, vol: 0.035 * v }); } },
  doorClose: (x, y) => { const v = pv(x, y); if (v > 0) { tone(140, 0.28, "sawtooth", 0.045 * v, -70); noise(0.12, { type: "lowpass", freq: 200, vol: 0.04 * v }); } },
  exitDoor: (x, y) => { const v = pv(x, y); if (v > 0) { [196, 262, 330, 392].forEach((f, i) => setTimeout(() => tone(f, 0.34, "sawtooth", 0.045 * v, 20), i * 80)); noise(0.5, { type: "lowpass", freq: 300, vol: 0.04 * v }); } },
  bridgeTick: (x, y) => { const v = 0.035 * pv(x, y); if (v > 0) tone(660, 0.05, "square", v, 160); },
  liftStart: (x, y) => { const v = 0.04 * pv(x, y); if (v > 0) tone(150, 0.14, "sawtooth", v, 120); },
  liftStop: (x, y) => { const v = 0.04 * pv(x, y); if (v > 0) tone(220, 0.12, "sawtooth", v, -110); },
  checkpoint: () => { [659, 988, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.12, "sine", 0.04), i * 70)); },
  key: (x, y) => { const v = pv(x, y); if (v > 0) { tone(660, 0.08, "square", 0.05 * v); setTimeout(() => tone(880, 0.12, "square", 0.045 * v), 70); } },
  lockTurn: (x, y) => { const v = 0.045 * pv(x, y); if (v > 0) { tone(300, 0.08, "sawtooth", v, -90); setTimeout(() => tone(200, 0.12, "square", v), 70); } },
  core: () => { tone(523, 0.09, "square", 0.05); setTimeout(() => tone(659, 0.09, "square", 0.05), 70); setTimeout(() => tone(784, 0.14, "square", 0.05), 140); },
  coresFanfare: () => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => setTimeout(() => tone(f, 0.16, "square", 0.05), i * 90)); setTimeout(() => noise(0.2, { type: "highpass", freq: 6000, vol: 0.02 }), 200); },

  // --- enemies -------------------------------------------------------------
  bugSkitter: (x, y) => { if (!rateLimit("bugSkitter", 160)) return; const v = 0.022 * pv(x, y); if (v > 0) tone(1500 + Math.random() * 400, 0.02, "square", v, -200); },
  squish: (x, y) => { if (!rateLimit("squish", 90)) return; bump("squish"); const v = pv(x, y); if (v > 0) { tone(800, 0.06, "square", 0.04 * v, 300); noise(0.05, { type: "lowpass", freq: 900, vol: 0.03 * v }); } },
  bugBounce: (x, y) => { if (!rateLimit("bugBounce", 120)) return; const v = 0.05 * pv(x, y); if (v > 0) tone(340, 0.1, "sine", v, 240); },
  bugBonk: (x, y) => { if (!rateLimit("bugBonk", 200)) return; const v = 0.045 * pv(x, y); if (v > 0) { tone(150, 0.08, "square", v, -50); noise(0.04, { type: "lowpass", freq: 400, vol: v * 0.5 }); } },
  rollerAlert: (x, y) => { const v = pv(x, y); if (v > 0) { tone(520, 0.08, "square", 0.035 * v, 180); setTimeout(() => tone(760, 0.1, "square", 0.035 * v, 220), 90); } },
  rollerZap: (x, y) => { const v = pv(x, y); if (v > 0) { tone(900, 0.14, "sawtooth", 0.045 * v, -600); noise(0.1, { type: "highpass", freq: 2000, vol: 0.03 * v }); } },
  wardenShove: (x, y) => { const v = pv(x, y); if (v > 0) { tone(110, 0.14, "square", 0.05 * v, -30); noise(0.12, { type: "bandpass", freq: 300, q: 3, vol: 0.045 * v }); } },
  wardenTopple: (x, y) => { const v = pv(x, y); if (v > 0) slide(600, 150, 0.5, "sawtooth", 0.045 * v); },
  crush: (x, y) => { const v = pv(x, y); if (v > 0) { tone(100, 0.15, "sawtooth", 0.06 * v, -60); noise(0.12, { type: "lowpass", freq: 500, q: 2, vol: 0.05 * v }); } },
  crusherServo: (x, y) => { const v = 0.03 * pv(x, y); if (v > 0) slide(180, 520, 0.3, "sawtooth", v); },

  // --- crane (1-3 boss) ----------------------------------------------------
  craneServo: (x, y) => { if (!rateLimit("craneServo", 260)) return; const v = 0.022 * pv(x, y); if (v > 0) tone(140 + Math.random() * 30, 0.09, "sawtooth", v, 40); },
  craneAlarm: (x, y) => { const v = pv(x, y); if (v > 0) { tone(700, 0.12, "square", 0.04 * v); setTimeout(() => tone(500, 0.16, "square", 0.04 * v), 130); } },
  craneSlam: (x, y) => { const v = pv(x, y); if (v > 0) { tone(80, 0.24, "sawtooth", 0.07 * v, -40); noise(0.2, { type: "lowpass", freq: 400, q: 2, vol: 0.055 * v }); } },
  craneYank: (x, y) => { const v = pv(x, y); if (v > 0) { slide(1200, 300, 0.28, "sawtooth", 0.045 * v); noise(0.18, { type: "bandpass", freq: 3000, q: 4, vol: 0.03 * v }); } },
  podAlarm: (x, y) => { if (!rateLimit("podAlarm", 900)) return; const v = 0.03 * pv(x, y); if (v > 0) { tone(880, 0.1, "square", v); setTimeout(() => tone(880, 0.1, "square", v), 160); } },
  podCrunch: (x, y) => { const v = pv(x, y); if (v > 0) { tone(300, 0.1, "square", 0.05 * v, -180); noise(0.1, { type: "lowpass", freq: 1200, vol: 0.04 * v }); } },
  craneDefeat: (x, y) => { const v = pv(x, y); if (v > 0) { slide(700, 90, 0.9, "sawtooth", 0.06 * v); [0, 120, 260, 400, 560].forEach((d) => setTimeout(() => noise(0.08, { type: "highpass", freq: 3000, vol: 0.025 * v }), d)); } },

  // --- UI / meta -----------------------------------------------------------
  menuMove: () => tone(660, 0.04, "square", 0.03),
  menuSelect: () => { tone(523, 0.07, "square", 0.04); setTimeout(() => tone(784, 0.1, "square", 0.04), 60); },
  menuDeny: () => tone(160, 0.12, "square", 0.04, -50),
  lockedDeny: () => { tone(180, 0.1, "square", 0.04, -40); setTimeout(() => tone(120, 0.14, "sawtooth", 0.04), 90); },
  settingsTick: () => tone(720, 0.03, "square", 0.028), // stubbed voice for the S4 settings page
  levelEnter: () => { [392, 523, 659].forEach((f, i) => setTimeout(() => tone(f, 0.12, "square", 0.045, 30), i * 70)); },
  saveTick: () => tone(1046, 0.05, "sine", 0.03),
  // mute chirp: a two-note down (muting) / up (unmuting) blip. mute.js schedules
  // it so the down chirp plays while the master is still up.
  muteChirp: (muting) => {
    if (muting) { tone(720, 0.05, "square", 0.035); setTimeout(() => tone(480, 0.07, "square", 0.035), 55); }
    else { tone(480, 0.05, "square", 0.035); setTimeout(() => tone(720, 0.07, "square", 0.035), 55); }
  },

  win: () => [392, 523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, "square", 0.05), i * 110)),

  // --- back-compat aliases (kept so any stray call site still resolves) -----
  kobi, // mood-aware typewriter blip (also exported standalone)
  pickup: () => { tone(500, 0.07); setTimeout(() => tone(750, 0.09), 50); },
  blip: () => kobi("gloating"),
  bounce: (x, y) => sfx.bugBounce(x, y),
  pop: (x, y) => sfx.squish(x, y),
  yank: () => { tone(500, 0.15, "sawtooth", 0.05, -350); },
  denied: () => sfx.menuDeny(),
};
