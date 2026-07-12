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

// --- stereo helper ----------------------------------------------------------
// panForX(x): a positional voice's stereo position from the emitter's world x
// relative to the camera view. Clamped to ±0.3 (S5 spec) so nothing hard-pans
// to one ear; centred (0) when there's no listener or no coords. sink(node,pan)
// routes a voice's tail into the sfx bus, inserting a short-lived StereoPanner
// only when pan != 0 (non-positional voices stay a straight connect — no extra
// node). One-shot panners are per-event and GC'd with the voice; never per-frame.
const PAN_MAX = 0.3;
export function panForX(x) {
  if (x == null || !listener.ready) return 0;
  const p = (x - listener.x) / (listener.halfW || 640);
  return Math.max(-1, Math.min(1, p)) * PAN_MAX;
}
function sink(ctx, node, bus, pan) {
  if (pan) {
    const pn = ctx.createStereoPanner();
    pn.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(pn).connect(bus);
  } else {
    node.connect(bus);
  }
}

// --- tone: the classic chiptune blip ---------------------------------------
export function tone(freq, dur = 0.1, type = "square", vol = 0.05, slideBy = 0, pan = 0) {
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
  o.connect(g);
  sink(ctx, g, bus, pan);
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

export function noise(dur = 0.1, { type = "lowpass", freq = 1000, q = 1, vol = 0.05, pan = 0 } = {}) {
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
  src.connect(filt).connect(g);
  sink(ctx, g, bus, pan);
  src.start();
  src.stop(ctx.currentTime + dur);
}

// --- slide: a pitch glissando between two frequencies -----------------------
export function slide(f1, f2, dur = 0.2, type = "sine", vol = 0.05, pan = 0) {
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
  o.connect(g);
  sink(ctx, g, bus, pan);
  o.start();
  o.stop(ctx.currentTime + dur);
}

// --- rateLimit: true if this key may fire again, false if it's too soon ------
// Keeps repeatable SFX (skitters, hisses, flutter, servos) from stacking.
//
// RATE-LIMIT AUDIT (Sound Sprint S5). Every repeatable one-shot voice is gated
// here; the key is the VOICE name, not the emitter, so N emitters of one kind
// SHARE a single gate — 6 scuttlebugs can never sum into a chittering wall, only
// the whole "bugSkitter" voice fires on its interval. Continuous emitters (belt,
// steam jets, fan, motor, lift) are LOOPS, not one-shots: they ride a single
// smoothed gain per kind (setLoop) and so can't stack at all — no limiter needed.
// S5 tightened the four voices most prone to overlap (flutter/skitter/squish/
// bounce) so rapid re-triggers can't machine-gun:
//   voice        ms    was   why
//   fanFlutter   180   140   many riders in one column; kept airy, not buzzy
//   bugSkitter   200   160   crowds of bugs; one shared chitter, not a swarm
//   squish       110    90   stomping a cluster: pops read as one, not a rattle
//   bugBounce    140   120   bugs ping-ponging off walls near each other
//   bugBonk      200   200   already comfortable
//   craneServo   260   260   telegraph cadence — unchanged
//   podAlarm     900   900   deliberate slow pulse — unchanged
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
  // chain: sources -> filter -> gain -> panner -> bus. The panner is PERSISTENT
  // (one per emitter kind, built once) — its .pan is nudged on the same per-tick
  // update that drives the gain, so a loop follows its emitter across the screen
  // without ever creating a node per frame.
  const g = ctx.createGain();
  g.gain.value = 0.00001;
  const pn = ctx.createStereoPanner();
  pn.pan.value = 0;
  g.connect(pn).connect(bus);
  const nodes = buildLoopNodes(ctx, key, g);
  L = { ctx, gain: g, panner: pn, nodes };
  loops.set(key, L);
  return L;
}

export function setLoop(key, prox, x = null) {
  const target = clamp01(prox) * (LOOP_VOL[key] || 0.04);
  // don't allocate a loop just to keep it silent
  if (!loops.has(key) && target <= 0.0002) return;
  const L = ensureLoop(key);
  if (!L) return;
  L.gain.gain.setTargetAtTime(Math.max(0.00001, target), L.ctx.currentTime, 0.1);
  // pan follows the emitter's on-screen x (same per-tick update, no new nodes)
  L.panner.pan.setTargetAtTime(panForX(x), L.ctx.currentTime, 0.1);
}

export function stopLoops() {
  for (const [, L] of loops) {
    try {
      L.nodes.forEach((n) => n.stop && n.stop());
      L.gain.disconnect();
      if (L.panner) L.panner.disconnect();
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
// MIX TABLE (Sound Sprint S5) — every voice's peak gain vs. the music bed.
//
// Reference points the whole table is balanced against:
//   • music bed          : per-voice ~0.02–0.09, bus ×0.45 (music default) → the
//                          loudest music element (a w1l2 kick) lands ≈0.045 at
//                          the music-bus output. SFX must read ABOVE this.
//   • KOBI blip ceiling  : ~0.012 — the quietest thing in the game; it caps the
//                          MUSIC, never the SFX. SFX are events, they may (should)
//                          poke above the bed. No SFX sits at/under the blip.
//   • buses              : sfxBus ×0.8 (default), masterGain ×0.8 ceiling, then a
//                          −3 dB limiter. Peak SFX 0.09 → ×0.8×0.8 ≈ 0.058 out;
//                          the limiter only engages on rare dense sums.
// Positional voices list their BASE gain (×proximity 0..1 at play time); non-
// positional list their fixed gain. Everything here was left where it sat after
// the S3 pass unless the audit flagged it — the S3 levels already balance well
// against the 0.45 bed, so S5 is mostly documentation + the ceiling/limiter/pan.
//
//   voice          gain    pos  rationale
//   ── player ──────────────────────────────────────────────────────────────
//   jump           0.035    –   light, frequent; must not fatigue
//   land           0.040    y   soft thud; halved noise tail
//   stompLaunch    0.030    –   wind-up whoosh, pitched cue not impact
//   stomp          0.090    y   THE loudest one-shot — a signature heavy hit
//   zip            0.030    –   taut twang; frequent grapple, kept modest
//   hangLatch      0.030    –   tiny click pair
//   reel           0.030    –   motorised pull, mid
//   grab/throw     0.035–.04 –   handling cues, mid-quiet
//   tossHigh       0.040    –   brighter twin of throw
//   hopOff         0.035    –   light dismount
//   die            0.050    y   readable death zap, not startling
//   respawn        0.030    –   gentle 4-note beam-in
//   phaseIn/Out    0.028    –   airy whoosh, sits under action
//   fanFlutter     0.020    y   airy + rate-limited; barely-there texture
//   equip          0.040    –   4-note power-up, celebratory but capped
//   ── devices ─────────────────────────────────────────────────────────────
//   lever          0.050    –   satisfying clunk, player-driven so centred
//   platePress     0.045    y   firm press; short noise body
//   plateRelease   0.040    y   softer release
//   door           0.050    y   big rumble, long — proximity keeps it in place
//   doorClose      0.045    y   twin of door, a touch quieter
//   exitDoor       0.045    y   grander 4-note, spread over 0.24s
//   bridgeTick     0.035    y   per-tile rising tick, light so a row is pleasant
//   liftStart/Stop 0.040    y   motor bumps bracketing the lift loop
//   checkpoint     0.040    –   3-note ding, clear but not shrill
//   key            0.050    y   bright pickup, important collectible
//   lockTurn       0.045    y   mechanical two-part turn
//   core           0.050    –   arpeggio reward, one of the brighter cues
//   coresFanfare   0.050    –   6-note fanfare; spread in time so sum stays safe
//   ── enemies ─────────────────────────────────────────────────────────────
//   bugSkitter     0.022    y   quiet chitter, rate-limited, shared gate
//   squish         0.040    y   crisp pop; rate-limited so a cluster ≈ one
//   bugBounce      0.050    y   playful boing, mid
//   bugBonk        0.045    y   turn thud
//   rollerAlert    0.035    y   rising "?!", noticeable but not piercing
//   rollerZap      0.045    y   zap crack, a danger cue so slightly up
//   wardenShove    0.050    y   heavy comic shove
//   wardenTopple   0.045    y   slide-whistle defeat
//   crush          0.060    y   crusher slam, 2nd-loudest hit (danger)
//   crusherServo   0.030    y   rising servo whine, texture under the slam
//   ── crane (1-3) ─────────────────────────────────────────────────────────
//   craneServo     0.022    y   patrol tick, rate-limited
//   craneAlarm     0.040    y   two-tone telegraph
//   craneSlam      0.070    y   boss slam, big but under stomp
//   craneYank      0.045    y   metal screech
//   podAlarm       0.030    y   slow exposed-pod pulse, rate-limited
//   podCrunch      0.050    y   pod destroyed, a progress beat
//   craneDefeat    0.060    y   descending power-down + sparks, the payoff
//   ── UI / meta ───────────────────────────────────────────────────────────
//   menuMove       0.030    –   frequent, quietest UI
//   menuSelect     0.040    –   confirm
//   menuDeny       0.040    –   buzz
//   lockedDeny     0.040    –   two-part locked buzz
//   settingsTick   0.028    –   live volume-adjust feedback, deliberately tiny
//   levelEnter     0.045    –   sting on entering a level
//   saveTick       0.030    –   toast blip
//   muteChirp      0.035    –   audible on the way in/out of mute
//   win            0.050    –   victory arpeggio
//   kobi           0.012–.014 –  the blip ceiling itself (mood-tinted)
//
// The sound library. Positional voices take an optional (x, y) world position and
// attenuate via proximity(); they also stereo-pan by on-screen x (±0.3). Omit the
// coords for player-centric / menu / jingle sounds — those stay centred.
// ---------------------------------------------------------------------------
export const sfx = {
  // --- player actions ------------------------------------------------------
  jump: () => tone(300, 0.12, "square", 0.035, 220),
  land: (x, y) => { const v = 0.04 * pv(x, y); if (v > 0) { const p = panForX(x); tone(120, 0.08, "triangle", v, 0, p); noise(0.05, { type: "lowpass", freq: 500, vol: v * 0.5, pan: p }); } },
  // heavy stomp: a downward wind-up whoosh at launch, a big low impact on land
  stompLaunch: () => slide(520, 150, 0.22, "sawtooth", 0.03),
  stomp: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(70, 0.24, "triangle", 0.09 * v, -30, p); noise(0.16, { type: "lowpass", freq: 220, vol: 0.06 * v, pan: p }); } },
  // grapple: a taut fire twang plus a short rising travel whoosh
  zip: () => { tone(600, 0.16, "sawtooth", 0.03, 520); noise(0.14, { type: "bandpass", freq: 1400, q: 1.2, vol: 0.02 }); },
  hangLatch: () => { tone(880, 0.03, "square", 0.03); setTimeout(() => tone(1180, 0.04, "square", 0.028), 32); },
  reel: () => tone(400, 0.2, "sawtooth", 0.03, 300),
  grab: () => { tone(300, 0.06, "triangle", 0.04); setTimeout(() => tone(460, 0.08, "triangle", 0.035), 45); },
  throwIt: () => tone(260, 0.12, "sawtooth", 0.04, -120),
  tossHigh: () => tone(520, 0.14, "sawtooth", 0.04, 260),
  hopOff: () => tone(360, 0.09, "square", 0.035, 180),
  // A3 partner social beat: a tiny friendly two-note chirp ("BEEP"→"BOOP") when
  // two idle buddies notice each other. Quiet, non-positional, player-centric.
  buddyBeep: () => { tone(720, 0.05, "square", 0.03); setTimeout(() => tone(960, 0.06, "square", 0.028), 55); },
  die: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(200, 0.3, "sawtooth", 0.05 * v, -160, p); noise(0.18, { type: "highpass", freq: 900, vol: 0.03 * v, pan: p }); } },
  respawn: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.09, "sine", 0.03), i * 55)); },
  phaseIn: () => slide(520, 900, 0.18, "sine", 0.028),
  phaseOut: () => slide(900, 520, 0.18, "sine", 0.028),
  fanFlutter: (x, y) => { if (!rateLimit("fanFlutter", 180)) return; const v = 0.02 * pv(x, y); if (v > 0) tone(760 + Math.random() * 120, 0.05, "triangle", v, 120, panForX(x)); },
  equip: () => { [440, 587, 784, 988].forEach((f, i) => setTimeout(() => tone(f, 0.1, "square", 0.04), i * 60)); },

  // --- devices -------------------------------------------------------------
  lever: () => { tone(220, 0.08, "square", 0.05); setTimeout(() => tone(330, 0.1, "square", 0.045), 60); },
  platePress: (x, y) => { const v = 0.045 * pv(x, y); if (v > 0) { const p = panForX(x); tone(300, 0.05, "square", v, -80, p); noise(0.05, { type: "lowpass", freq: 700, vol: v * 0.6, pan: p }); } },
  plateRelease: (x, y) => { const v = 0.04 * pv(x, y); if (v > 0) tone(240, 0.06, "square", v, 90, panForX(x)); },
  door: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(90, 0.4, "sawtooth", 0.05 * v, 60, p); noise(0.3, { type: "lowpass", freq: 260, vol: 0.035 * v, pan: p }); } },
  doorClose: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(140, 0.28, "sawtooth", 0.045 * v, -70, p); noise(0.12, { type: "lowpass", freq: 200, vol: 0.04 * v, pan: p }); } },
  exitDoor: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); [196, 262, 330, 392].forEach((f, i) => setTimeout(() => tone(f, 0.34, "sawtooth", 0.045 * v, 20, p), i * 80)); noise(0.5, { type: "lowpass", freq: 300, vol: 0.04 * v, pan: p }); } },
  bridgeTick: (x, y) => { const v = 0.035 * pv(x, y); if (v > 0) tone(660, 0.05, "square", v, 160, panForX(x)); },
  liftStart: (x, y) => { const v = 0.04 * pv(x, y); if (v > 0) tone(150, 0.14, "sawtooth", v, 120, panForX(x)); },
  liftStop: (x, y) => { const v = 0.04 * pv(x, y); if (v > 0) tone(220, 0.12, "sawtooth", v, -110, panForX(x)); },
  checkpoint: () => { [659, 988, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.12, "sine", 0.04), i * 70)); },
  key: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(660, 0.08, "square", 0.05 * v, 0, p); setTimeout(() => tone(880, 0.12, "square", 0.045 * v, 0, p), 70); } },
  lockTurn: (x, y) => { const v = 0.045 * pv(x, y); if (v > 0) { const p = panForX(x); tone(300, 0.08, "sawtooth", v, -90, p); setTimeout(() => tone(200, 0.12, "square", v, 0, p), 70); } },
  core: () => { tone(523, 0.09, "square", 0.05); setTimeout(() => tone(659, 0.09, "square", 0.05), 70); setTimeout(() => tone(784, 0.14, "square", 0.05), 140); },
  coresFanfare: () => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => setTimeout(() => tone(f, 0.16, "square", 0.05), i * 90)); setTimeout(() => noise(0.2, { type: "highpass", freq: 6000, vol: 0.02 }), 200); },

  // --- enemies -------------------------------------------------------------
  bugSkitter: (x, y) => { if (!rateLimit("bugSkitter", 200)) return; const v = 0.022 * pv(x, y); if (v > 0) tone(1500 + Math.random() * 400, 0.02, "square", v, -200, panForX(x)); },
  squish: (x, y) => { if (!rateLimit("squish", 110)) return; bump("squish"); const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(800, 0.06, "square", 0.04 * v, 300, p); noise(0.05, { type: "lowpass", freq: 900, vol: 0.03 * v, pan: p }); } },
  bugBounce: (x, y) => { if (!rateLimit("bugBounce", 140)) return; const v = 0.05 * pv(x, y); if (v > 0) tone(340, 0.1, "sine", v, 240, panForX(x)); },
  bugBonk: (x, y) => { if (!rateLimit("bugBonk", 200)) return; const v = 0.045 * pv(x, y); if (v > 0) { const p = panForX(x); tone(150, 0.08, "square", v, -50, p); noise(0.04, { type: "lowpass", freq: 400, vol: v * 0.5, pan: p }); } },
  rollerAlert: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(520, 0.08, "square", 0.035 * v, 180, p); setTimeout(() => tone(760, 0.1, "square", 0.035 * v, 220, p), 90); } },
  rollerZap: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(900, 0.14, "sawtooth", 0.045 * v, -600, p); noise(0.1, { type: "highpass", freq: 2000, vol: 0.03 * v, pan: p }); } },
  wardenShove: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(110, 0.14, "square", 0.05 * v, -30, p); noise(0.12, { type: "bandpass", freq: 300, q: 3, vol: 0.045 * v, pan: p }); } },
  wardenTopple: (x, y) => { const v = pv(x, y); if (v > 0) slide(600, 150, 0.5, "sawtooth", 0.045 * v, panForX(x)); },
  crush: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(100, 0.15, "sawtooth", 0.06 * v, -60, p); noise(0.12, { type: "lowpass", freq: 500, q: 2, vol: 0.05 * v, pan: p }); } },
  crusherServo: (x, y) => { const v = 0.03 * pv(x, y); if (v > 0) slide(180, 520, 0.3, "sawtooth", v, panForX(x)); },

  // --- crane (1-3 boss) ----------------------------------------------------
  craneServo: (x, y) => { if (!rateLimit("craneServo", 260)) return; const v = 0.022 * pv(x, y); if (v > 0) tone(140 + Math.random() * 30, 0.09, "sawtooth", v, 40, panForX(x)); },
  craneAlarm: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(700, 0.12, "square", 0.04 * v, 0, p); setTimeout(() => tone(500, 0.16, "square", 0.04 * v, 0, p), 130); } },
  craneSlam: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(80, 0.24, "sawtooth", 0.07 * v, -40, p); noise(0.2, { type: "lowpass", freq: 400, q: 2, vol: 0.055 * v, pan: p }); } },
  craneYank: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); slide(1200, 300, 0.28, "sawtooth", 0.045 * v, p); noise(0.18, { type: "bandpass", freq: 3000, q: 4, vol: 0.03 * v, pan: p }); } },
  podAlarm: (x, y) => { if (!rateLimit("podAlarm", 900)) return; const v = 0.03 * pv(x, y); if (v > 0) { const p = panForX(x); tone(880, 0.1, "square", v, 0, p); setTimeout(() => tone(880, 0.1, "square", v, 0, p), 160); } },
  podCrunch: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(300, 0.1, "square", 0.05 * v, -180, p); noise(0.1, { type: "lowpass", freq: 1200, vol: 0.04 * v, pan: p }); } },
  craneDefeat: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); slide(700, 90, 0.9, "sawtooth", 0.06 * v, p); [0, 120, 260, 400, 560].forEach((d) => setTimeout(() => noise(0.08, { type: "highpass", freq: 3000, vol: 0.025 * v, pan: p }), d)); } },

  // --- W3W4 M3: World-3 skills, terrain & enemies ---------------------------
  // Mix rationale mirrors the S5 table: player-driven skill cues sit centred at
  // 0.03-0.045; positional world/enemy voices ride proximity; repeatable ones
  // are rate-limited. Nothing here fires unless a W3 skill/ent is in the level.
  //   magnetOn      0.040   –   crate latch: rising hum + metal click
  //   magnetOff     0.035   –   latch release: falling hum
  //   railCling     0.040   –   clunk onto the steel rail
  //   railDrop      0.030   –   drop off the rail
  //   magFlip       0.045   y   remote magnetic switch flip (zappy two-note)
  //   bubbleOn      0.040   –   bubble inflates (airy rising sweep)
  //   bubblePop     0.045   –   pop! (bright blip + noise tick)
  //   bubbleBounce  0.040   y   boingy bubble landing (rate-limited)
  //   splash        0.045   y   water entry/exit plunge
  //   airWarn       0.030   –   air-timer warning tick (last 1.5s, rate-limited)
  //   jellyBounce   0.045   y   bubbled robot boops a zap-jelly away
  //   jellySocket   0.050   y   jelly locks into its socket + powers up
  //   jellyZap      0.045   y   electric touch discharge
  //   chompTele     0.035   y   chomper wind-up snarl (rate-limited)
  //   chompLunge    0.045   y   chomper lunge whoosh + snap
  //   teethYank     0.050   y   magnet yanks the teeth out (screech + rattle)
  magnetOn: () => { slide(180, 460, 0.14, "sawtooth", 0.03); setTimeout(() => tone(820, 0.05, "square", 0.04), 90); },
  magnetOff: () => slide(460, 170, 0.12, "sawtooth", 0.035),
  railCling: () => { tone(240, 0.06, "square", 0.04, -60); setTimeout(() => tone(620, 0.04, "square", 0.032), 55); },
  railDrop: () => tone(300, 0.08, "triangle", 0.03, -140),
  magFlip: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); slide(300, 900, 0.1, "sawtooth", 0.04 * v, p); setTimeout(() => tone(660, 0.09, "square", 0.045 * v, 120, p), 90); } },
  bubbleOn: () => { slide(320, 760, 0.2, "sine", 0.04); noise(0.12, { type: "bandpass", freq: 1800, q: 1.4, vol: 0.018 }); },
  bubblePop: () => { tone(980, 0.05, "square", 0.045, 260); noise(0.05, { type: "highpass", freq: 2400, vol: 0.03 }); },
  bubbleBounce: (x, y) => { if (!rateLimit("bubbleBounce", 150)) return; const v = 0.04 * pv(x, y); if (v > 0) tone(260, 0.12, "sine", v, 300, panForX(x)); },
  splash: (x, y) => { if (!rateLimit("splash", 160)) return; const v = pv(x, y); if (v > 0) { const p = panForX(x); noise(0.18, { type: "lowpass", freq: 900, q: 1.2, vol: 0.045 * v, pan: p }); slide(360, 130, 0.14, "sine", 0.025 * v, p); } },
  airWarn: () => { if (!rateLimit("airWarn", 420)) return; tone(880, 0.05, "square", 0.03, -80); },
  jellyBounce: (x, y) => { if (!rateLimit("jellyBounce", 140)) return; const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(420, 0.1, "sine", 0.045 * v, 320, p); noise(0.05, { type: "highpass", freq: 3000, vol: 0.015 * v, pan: p }); } },
  jellySocket: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.1, "square", 0.05 * v, 0, p), i * 70)); setTimeout(() => noise(0.12, { type: "bandpass", freq: 2200, q: 2, vol: 0.02 * v, pan: p }), 210); } },
  jellyZap: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(760, 0.12, "sawtooth", 0.045 * v, -500, p); noise(0.08, { type: "highpass", freq: 2600, vol: 0.03 * v, pan: p }); } },
  chompTele: (x, y) => { if (!rateLimit("chompTele", 500)) return; const v = 0.035 * pv(x, y); if (v > 0) slide(140, 320, 0.22, "sawtooth", v, panForX(x)); },
  chompLunge: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); noise(0.1, { type: "bandpass", freq: 700, q: 1.5, vol: 0.03 * v, pan: p }); setTimeout(() => tone(180, 0.08, "square", 0.045 * v, -60, p), 90); } },
  teethYank: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); slide(1100, 260, 0.24, "sawtooth", 0.05 * v, p); [90, 180, 270].forEach((d) => setTimeout(() => tone(340 + d, 0.04, "square", 0.03 * v, -120, p), d)); } },

  // --- W3W4 M4: World-4 skills, terrain & enemies ---------------------------
  // Same mix rationale as the M3 block: player-driven skill cues centred at
  // 0.03-0.045; positional world/enemy voices ride proximity; repeatable ones
  // are rate-limited. Nothing here fires unless a W4 skill/ent is in the level.
  //   freezeCast   0.045   –   time-freeze: crystalline descending shimmer
  //   freezeEnd    0.035   –   the thaw: soft rising release
  //   beamOn       0.040   –   light-beam ignites (warm rising sweep)
  //   beamOff      0.030   –   beam douse (falling)
  //   beamHum      0.018   –   soft hum while lit (rate-limited)
  //   iceMelt      0.028   y   melting sizzle under the beam (rate-limited)
  //   iceCrack     0.050   y   the door gives way (crack + slush)
  //   ghostReveal  0.030   y   invisible platform materializes (rate-limited)
  //   gloomHiss    0.020   y   gloomy's dark whisper (rate-limited)
  //   gloomFlee    0.040   y   dazzled gloomy squeals away
  //   tickTock     0.028   y   ticker wind-up telegraph (rate-limited)
  //   tickerDash   0.040   y   clockwork dash whirr
  //   laserZap     0.045   y   laser contact discharge
  freezeCast: () => { [1320, 1050, 830, 660].forEach((f, i) => setTimeout(() => tone(f, 0.14, "sine", 0.038), i * 70)); noise(0.3, { type: "highpass", freq: 5200, vol: 0.016 }); },
  freezeEnd: () => { [660, 880, 1100].forEach((f, i) => setTimeout(() => tone(f, 0.09, "sine", 0.028), i * 60)); },
  beamOn: () => { slide(280, 720, 0.16, "sine", 0.036); tone(1400, 0.08, "triangle", 0.02); },
  beamOff: () => slide(720, 300, 0.14, "sine", 0.026),
  beamHum: (x, y) => { if (!rateLimit("beamHum", 340)) return; const v = 0.018 * pv(x, y); if (v > 0) tone(190 + Math.random() * 14, 0.3, "sine", v, 8, panForX(x)); },
  iceMelt: (x, y) => { if (!rateLimit("iceMelt", 260)) return; const v = pv(x, y); if (v > 0) noise(0.2, { type: "bandpass", freq: 3200, q: 1.6, vol: 0.028 * v, pan: panForX(x) }); },
  iceCrack: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(240, 0.08, "square", 0.05 * v, -120, p); noise(0.26, { type: "lowpass", freq: 1400, vol: 0.04 * v, pan: p }); [70, 150].forEach((d) => setTimeout(() => noise(0.06, { type: "highpass", freq: 3600, vol: 0.024 * v, pan: p }), d)); } },
  ghostReveal: (x, y) => { if (!rateLimit("ghostReveal", 420)) return; const v = pv(x, y); if (v > 0) { const p = panForX(x); slide(520, 1040, 0.12, "sine", 0.03 * v, p); tone(1560, 0.06, "triangle", 0.02 * v, 0, p); } },
  gloomHiss: (x, y) => { if (!rateLimit("gloomHiss", 900)) return; const v = 0.02 * pv(x, y); if (v > 0) noise(0.4, { type: "lowpass", freq: 500, q: 2, vol: v, pan: panForX(x) }); },
  gloomFlee: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); slide(900, 1500, 0.16, "sine", 0.04 * v, p); slide(700, 1180, 0.16, "sine", 0.02 * v, p); } },
  tickTock: (x, y) => { if (!rateLimit("tickTock", 330)) return; const v = 0.028 * pv(x, y); if (v > 0) { const p = panForX(x); tone(1160, 0.03, "square", v, -60, p); setTimeout(() => tone(880, 0.03, "square", v * 0.8, -40, p), 160); } },
  tickerDash: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); slide(300, 760, 0.18, "sawtooth", 0.04 * v, p); noise(0.12, { type: "bandpass", freq: 1900, q: 1.4, vol: 0.02 * v, pan: p }); } },
  laserZap: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(980, 0.12, "sawtooth", 0.045 * v, -640, p); noise(0.09, { type: "highpass", freq: 3000, vol: 0.03 * v, pan: p }); } },

  // --- W3W4 L43: KOBI's Heart (the 4-3 finale boss + rescue) ----------------
  // Same conventions as every boss voice set (crane family): telegraphs are
  // two-tone and rate-limited, hits sit ~0.045-0.06, positional voices ride
  // proximity. Nothing here fires unless 4-3's kobiheart/turbine ents exist.
  //   turbineWhirr 0.02    y   defense-turbine spin bed (rate-limited)
  //   heartAlarm   0.04    y   glare lock / re-arm two-tone telegraph
  //   heartGlare   0.06    y   the glare strike column lands
  //   heartSquint  0.024   y   the eye strains under the beam (rate-limited)
  //   ventBlow     0.05    y   a cooling vent blows off (core exposed)
  //   heartUnplug  0.05    y   a core is unplugged (cord-pull + soft chime)
  //   heartDown    0.06    y   the whole heart powers down mid-tantrum
  //   boltYip      0.045   y   Bolt's happy two-note yip
  turbineWhirr: (x, y) => { if (!rateLimit("turbineWhirr", 420)) return; const v = 0.02 * pv(x, y); if (v > 0) tone(120 + Math.random() * 18, 0.34, "sawtooth", v, 26, panForX(x)); },
  heartAlarm: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(620, 0.12, "square", 0.04 * v, 0, p); setTimeout(() => tone(430, 0.16, "square", 0.04 * v, 0, p), 140); } },
  heartGlare: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); slide(1200, 180, 0.34, "sawtooth", 0.06 * v, p); noise(0.22, { type: "highpass", freq: 2400, vol: 0.035 * v, pan: p }); } },
  heartSquint: (x, y) => { if (!rateLimit("heartSquint", 380)) return; const v = 0.024 * pv(x, y); if (v > 0) slide(880, 1240, 0.16, "sine", v, panForX(x)); },
  ventBlow: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(220, 0.1, "square", 0.05 * v, -140, p); noise(0.3, { type: "bandpass", freq: 1100, q: 1.2, vol: 0.04 * v, pan: p }); setTimeout(() => noise(0.14, { type: "highpass", freq: 3400, vol: 0.024 * v, pan: p }), 90); } },
  heartUnplug: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); slide(700, 190, 0.24, "sawtooth", 0.05 * v, p); setTimeout(() => { tone(523, 0.1, "sine", 0.04 * v, 0, p); tone(659, 0.14, "sine", 0.032 * v, 0, p); }, 200); } },
  heartDown: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); slide(520, 60, 1.4, "sawtooth", 0.06 * v, p); [0, 180, 380, 620, 900].forEach((d, i) => setTimeout(() => tone(360 - i * 50, 0.07, "square", 0.03 * v, -60, p), d)); setTimeout(() => noise(0.5, { type: "lowpass", freq: 320, vol: 0.03 * v, pan: p }), 300); } },
  boltYip: (x, y) => { const v = pv(x, y); if (v > 0) { const p = panForX(x); tone(880, 0.07, "square", 0.045 * v, 260, p); setTimeout(() => tone(1180, 0.09, "square", 0.04 * v, 180, p), 110); } },

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
