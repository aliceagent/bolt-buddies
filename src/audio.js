// Tiny WebAudio chiptune-ish blips. No assets, no TTS — KOBI "speaks" in text.
let ctx = null;

export function initAudio() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      /* audio unsupported — game stays silent */
    }
  }
  if (ctx && ctx.state === "suspended") ctx.resume();
}

function tone(freq, dur = 0.1, type = "square", vol = 0.05, slide = 0) {
  if (!ctx || ctx.state !== "running") return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + dur);
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + dur);
}

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
