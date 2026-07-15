// Music — a 16-step-per-bar sequencer built on the standard
// 25ms-interval / 120ms-lookahead WebAudio scheduling pattern.
//
// Voices:  bass  — triangle (per-track timbre knob)
//          lead  — square/triangle/saw, detuned pair, through the soft lowpass
//          arp   — pulse (25% duty) or a plain waveform
//          pad   — two detuned saws through a gentle lowpass
//          drums — sine kick + filtered-noise snare/hat
//          tension — an extra arp + snare-roll pair, gated by setMusicLayer
//                    ("tension", on/off) for the 1-3 boss fight.
//
// Tracks are PURE DATA. To honour the binding "Music direction" (long,
// sectioned, non-repetitive compositions) each track is authored as an ordered
// list of SECTIONS (intro -> A -> B -> A' -> ...), each carrying its own per-voice
// bar patterns — so the scheduler plays real section contrast, never a single
// repeated 4-bar loop. Every full track is >= 32 bars before it loops. Pads and
// leads run through a per-track ~2.4-3.5 kHz lowpass and everything sits quiet
// (music default 0.45) so the track never competes with the game.
//
// Per-track timbre knobs (all optional, defaults preserve the soft house sound):
//   leadType/leadVol/leadLen, arpType/arpVol/arpLen, bassType/bassVol/bassLen,
//   padVol/padCut, kickVol/snareVol/hatVol.

import { getCtx, getMusicBus } from "./engine.js";
import { mp3HasTrack, mp3PlayTrack, mp3StopTrack, mp3State } from "./mp3music.js";

// ---------------------------------------------------------------------------
// small helpers (all run once at module load — they build DATA, not per-note)
// ---------------------------------------------------------------------------
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// build a 16-step row from a sparse { stepIndex: value } map (value may be a
// number, a chord array, or a drum string; unspecified steps are rests)
function row(map) {
  const a = new Array(16).fill(null);
  for (const k in map) a[+k] = map[k];
  return a;
}
// place `notes` starting at `start`, one every `gap` steps (nulls = rests)
function seq(start, gap, notes) {
  const m = {};
  notes.forEach((n, i) => {
    if (n != null) m[start + i * gap] = n;
  });
  return row(m);
}
const q = (a, b, c, d) => row({ 0: a, 4: b, 8: c, 12: d }); // 4 quarter notes
const e8 = (notes) => seq(0, 2, notes); // 8 eighth notes
const s16 = (notes) => seq(0, 1, notes); // 16 sixteenth notes
const pad = (chord) => row({ 0: chord }); // one whole-bar chord
const b2 = (a, b) => row({ 0: a, 8: b == null ? a : b }); // root, then fifth

// chord voicings (mid register, MIDI)
const CH = {
  C: [60, 64, 67], Cm: [60, 63, 67], CmajLo: [48, 52, 55], CmLo: [48, 51, 55],
  G: [55, 59, 62], Gm: [55, 58, 62], GLo: [43, 47, 50],
  Am: [57, 60, 64], A: [57, 61, 64], AmLo: [45, 48, 52],
  F: [53, 57, 60], Fm: [53, 56, 60],
  Dm: [50, 53, 57], D: [50, 54, 57], DmLo: [50, 53, 57],
  Em: [52, 55, 59], E: [52, 56, 59], Eb: [51, 55, 58],
  Bm: [47, 50, 54], Bb: [46, 50, 53], B: [47, 51, 54],
  Ab: [44, 48, 51], FsM: [54, 57, 61], AbLo: [44, 48, 51],
};

// drum presets (rows are never mutated, so sharing constants is safe)
const D = {
  none: row({}),
  hats: row({ 0: "h", 4: "h", 8: "h", 12: "h" }),
  offhat: row({ 2: "h", 6: "h", 10: "h", 14: "h" }),
  hat8: row({ 0: "h", 2: "h", 4: "h", 6: "h", 8: "h", 10: "h", 12: "h", 14: "h" }),
  softKick: row({ 0: "k", 4: "h", 8: "h", 12: "h" }),
  kickHat: row({ 0: "k", 4: "h", 8: "k", 12: "h" }),
  back: row({ 0: "k", 2: "h", 4: "s", 6: "h", 8: "k", 10: "h", 12: "s", 14: "h" }),
  backHeavy: row({ 0: "k", 4: "h", 8: "s", 10: "h", 12: "h" }),
  bounce: row({ 0: "k", 2: "h", 4: "s", 6: "h", 8: "k", 9: "k", 10: "h", 12: "s", 14: "h" }),
  fourfloor: row({ 0: "kh", 4: "kh", 8: "kh", 12: "kh" }),
  drive: row({ 0: "k", 2: "h", 4: "s", 6: "h", 8: "kh", 10: "h", 12: "s", 14: "h" }),
  heist: row({ 0: "k", 3: "h", 6: "k", 8: "s", 11: "h", 14: "k" }),
  sneak: row({ 0: "k", 6: "h", 8: "s", 14: "h" }),
  tick: row({ 0: "k", 8: "s", 12: "h" }),
  snareRoll: row({ 0: "s", 2: "s", 4: "s", 6: "s", 8: "S", 10: "s", 12: "s", 14: "s" }),
  snareRoll2: row({ 1: "s", 3: "s", 5: "s", 7: "s", 9: "s", 11: "s", 13: "s", 15: "S" }),
};

// ---------------------------------------------------------------------------
// TRACKS — the pure-data song library. One human-readable line per track.
// ---------------------------------------------------------------------------
const TRACKS = {
  // title — warm C-major synthwave, 90 BPM: slow pads, gentle triangle arp, a
  // hopeful lead that only sings in the B section. 32 bars (intro/A/B/A'/outro).
  title: {
    bpm: 90, root: 60, scale: [0, 2, 4, 5, 7, 9, 11],
    leadType: "triangle", leadVol: 0.032, arpVol: 0.016, padCut: 2600,
    sections: [
      {
        name: "intro", bars: 4,
        pads: [pad(CH.C), pad(CH.Am), pad(CH.F), pad(CH.G)],
        bass: [b2(36, 43), b2(45, 52), b2(41, 48), b2(43, 50)],
        arp: [q(72, 76, 79, 76), q(69, 72, 76, 72), q(65, 69, 72, 69), q(67, 71, 74, 71)],
        drums: [D.hats, D.hats, D.hats, D.hats],
      },
      {
        name: "A", bars: 8,
        pads: [pad(CH.C), pad(CH.Am), pad(CH.F), pad(CH.G)],
        bass: [b2(36, 43), b2(45, 52), b2(41, 48), b2(43, 50)],
        arp: [q(72, 76, 79, 76), q(69, 72, 76, 72), q(65, 69, 72, 69), q(67, 71, 74, 71)],
        drums: [D.softKick, D.softKick, D.softKick, D.kickHat],
      },
      {
        name: "B", bars: 8,
        pads: [pad(CH.F), pad(CH.G), pad(CH.Am), pad(CH.G)],
        bass: [b2(41, 48), b2(43, 50), b2(45, 52), b2(43, 50)],
        arp: [
          e8([65, 69, 72, 76, 72, 69, 65, 69]),
          e8([67, 71, 74, 79, 74, 71, 67, 71]),
          e8([69, 72, 76, 81, 76, 72, 69, 72]),
          e8([67, 71, 74, 79, 74, 71, 67, 71]),
        ],
        lead: [row({ 0: 72, 8: 76 }), row({ 0: 74, 8: 79 }), row({ 0: 76, 8: 72 }), row({ 0: 74, 8: 67 })],
        drums: [D.back, D.back, D.back, D.back],
      },
      {
        name: "A'", bars: 8,
        pads: [pad(CH.C), pad(CH.Am), pad(CH.F), pad(CH.G)],
        bass: [b2(36, 43), b2(45, 52), b2(41, 48), b2(43, 50)],
        arp: [q(72, 76, 79, 76), q(69, 72, 76, 72), q(65, 69, 72, 69), q(67, 71, 74, 71)],
        lead: [row({ 8: 79 }), row({}), row({ 8: 76 }), row({ 4: 74, 12: 72 })],
        drums: [D.kickHat, D.softKick, D.kickHat, D.back],
      },
      {
        name: "outro", bars: 4,
        pads: [pad(CH.C), pad(CH.Am), pad(CH.F), pad(CH.C)],
        bass: [b2(36, 43), b2(45, 52), b2(41, 48), b2(36, 43)],
        arp: [q(72, 76, 79, 76), q(69, 72, 76, 72), q(65, 69, 72, 69), q(72, 76, 79, 84)],
        drums: [D.hats, D.hats, D.hats, D.hats],
      },
    ],
  },

  // hub — quiet A-minor "map room", 100 BPM: ticking off-beat hats, long pads and
  // sparse plucks, a faint plink lead in B. 32 bars (intro/A/B/A'/bridge).
  hub: {
    bpm: 100, root: 57, scale: [0, 2, 3, 5, 7, 8, 10],
    leadType: "triangle", leadVol: 0.026, arpVol: 0.015, arpType: "triangle", padCut: 2400,
    sections: [
      {
        name: "intro", bars: 4,
        pads: [pad(CH.Am), pad(CH.F), pad(CH.C), pad(CH.G)],
        bass: [b2(45, 52), b2(41, 48), b2(48, 55), b2(43, 50)],
        arp: [row({ 0: 69, 8: 72 }), row({ 0: 65, 8: 72 }), row({ 0: 67, 8: 72 }), row({ 0: 67, 8: 74 })],
        drums: [D.offhat, D.offhat, D.offhat, D.offhat],
      },
      {
        name: "A", bars: 8,
        pads: [pad(CH.Am), pad(CH.F), pad(CH.C), pad(CH.G)],
        bass: [b2(45, 52), b2(41, 48), b2(48, 55), b2(43, 50)],
        arp: [row({ 0: 69, 8: 72 }), row({ 0: 65, 8: 72 }), row({ 0: 67, 8: 74 }), row({ 0: 67, 8: 71 })],
        drums: [D.softKick, D.offhat, D.softKick, D.hats],
      },
      {
        name: "B", bars: 8,
        pads: [pad(CH.Dm), pad(CH.Am), pad(CH.F), pad(CH.E)],
        bass: [b2(50, 57), b2(45, 52), b2(41, 48), b2(40, 47)],
        arp: [
          row({ 0: 69, 6: 74, 10: 77 }),
          row({ 0: 69, 6: 72, 10: 76 }),
          row({ 0: 65, 6: 69, 10: 72 }),
          row({ 0: 68, 6: 71, 10: 76 }),
        ],
        lead: [row({ 4: 81 }), row({ 12: 76 }), row({ 4: 77 }), row({ 8: 80 })],
        drums: [D.kickHat, D.offhat, D.kickHat, D.offhat],
      },
      {
        name: "A'", bars: 8,
        pads: [pad(CH.Am), pad(CH.F), pad(CH.C), pad(CH.G)],
        bass: [b2(45, 52), b2(41, 48), b2(48, 55), b2(43, 50)],
        arp: [
          e8([69, 72, 76, 72, 69, 72, 76, 72]),
          e8([65, 69, 72, 69, 65, 69, 72, 69]),
          e8([67, 72, 76, 72, 67, 72, 76, 72]),
          e8([67, 71, 74, 71, 67, 71, 74, 71]),
        ],
        drums: [D.softKick, D.hats, D.kickHat, D.hats],
      },
      {
        name: "bridge", bars: 4,
        pads: [pad(CH.Am), pad(CH.Am), pad(CH.Dm), pad(CH.E)],
        bass: [b2(45, 52), b2(45, 57), b2(50, 57), b2(40, 47)],
        arp: [row({ 0: 69, 8: 72 }), row({ 0: 69, 8: 76 }), row({ 0: 69, 8: 74 }), row({ 0: 68, 8: 71 })],
        drums: [D.offhat, D.offhat, D.softKick, D.offhat],
      },
    ],
  },

  // w1l1 — bright bouncy C major-pentatonic chiptune, 112 BPM: a walking eighth
  // bass, sparkling pulse arp and a hopping lead. 32 bars (intro/A/A'/B/outro).
  w1l1: {
    bpm: 112, root: 60, scale: [0, 2, 4, 7, 9],
    leadType: "triangle", leadVol: 0.03, arpVol: 0.018, bassVol: 0.07,
    sections: [
      {
        name: "intro", bars: 4,
        pads: [pad(CH.C), pad(CH.G), pad(CH.Am), pad(CH.F)],
        bass: [e8([36, 43, 48, 52, 55, 52, 48, 43]), e8([43, 50, 55, 59, 62, 59, 55, 50]),
          e8([45, 52, 57, 60, 64, 60, 57, 52]), e8([41, 48, 53, 57, 60, 57, 53, 48])],
        arp: [q(72, 76, 79, 84), q(74, 79, 83, 86), q(76, 81, 84, 88), q(72, 77, 81, 84)],
        drums: [D.kickHat, D.kickHat, D.kickHat, D.kickHat],
      },
      {
        name: "A", bars: 8,
        pads: [pad(CH.C), pad(CH.G), pad(CH.Am), pad(CH.F)],
        bass: [e8([36, 43, 48, 52, 55, 52, 48, 43]), e8([43, 50, 55, 59, 62, 59, 55, 50]),
          e8([45, 52, 57, 60, 64, 60, 57, 52]), e8([41, 48, 53, 57, 60, 57, 53, 48])],
        arp: [q(72, 76, 79, 76), q(74, 79, 83, 79), q(76, 81, 84, 81), q(72, 77, 81, 77)],
        lead: [row({ 0: 84, 8: 79 }), row({ 0: 86, 8: 83 }), row({ 0: 88, 8: 84 }), row({ 4: 81, 12: 77 })],
        drums: [D.bounce, D.bounce, D.bounce, D.back],
      },
      {
        name: "A'", bars: 8,
        pads: [pad(CH.C), pad(CH.G), pad(CH.Am), pad(CH.F)],
        bass: [e8([36, 43, 48, 52, 55, 52, 48, 43]), e8([43, 50, 55, 59, 62, 59, 55, 50]),
          e8([45, 52, 57, 60, 64, 60, 57, 52]), e8([41, 48, 53, 57, 60, 57, 53, 48])],
        arp: [
          s16([72, 76, 79, 84, 79, 76, 72, 76, 72, 76, 79, 84, 79, 76, 72, 76]),
          s16([74, 79, 83, 86, 83, 79, 74, 79, 74, 79, 83, 86, 83, 79, 74, 79]),
          s16([76, 81, 84, 88, 84, 81, 76, 81, 76, 81, 84, 88, 84, 81, 76, 81]),
          s16([72, 77, 81, 84, 81, 77, 72, 77, 72, 77, 81, 84, 81, 77, 72, 77]),
        ],
        lead: [row({ 0: 88, 4: 84, 8: 88, 12: 91 }), row({ 0: 86, 4: 83, 8: 86 }),
          row({ 0: 84, 4: 81, 8: 84, 12: 88 }), row({ 0: 81, 8: 77 })],
        drums: [D.bounce, D.bounce, D.bounce, D.bounce],
      },
      {
        name: "B", bars: 8,
        pads: [pad(CH.F), pad(CH.C), pad(CH.G), pad(CH.Am)],
        bass: [e8([41, 48, 53, 57, 60, 57, 53, 48]), e8([36, 43, 48, 52, 55, 52, 48, 43]),
          e8([43, 50, 55, 59, 62, 59, 55, 50]), e8([45, 52, 57, 60, 64, 60, 57, 52])],
        arp: [q(77, 81, 84, 81), q(72, 76, 79, 76), q(74, 79, 83, 79), q(76, 81, 84, 81)],
        lead: [row({ 0: 81, 6: 84, 10: 88 }), row({ 0: 79, 6: 76, 10: 72 }),
          row({ 0: 83, 6: 86, 10: 91 }), row({ 0: 84, 8: 81 })],
        drums: [D.back, D.bounce, D.back, D.bounce],
      },
      {
        name: "outro", bars: 4,
        pads: [pad(CH.C), pad(CH.G), pad(CH.F), pad(CH.C)],
        bass: [e8([36, 43, 48, 52, 55, 52, 48, 43]), e8([43, 50, 55, 59, 62, 59, 55, 50]),
          e8([41, 48, 53, 57, 60, 57, 53, 48]), b2(36, 48)],
        arp: [q(72, 76, 79, 76), q(74, 79, 83, 79), q(72, 77, 81, 77), q(72, 76, 79, 84)],
        drums: [D.kickHat, D.kickHat, D.back, D.kickHat],
      },
    ],
  },

  // w1l2 — industrial E-minor, 120 BPM: a heavy kick on the 1, a clanking sawtooth
  // lead stabbing the off-beats, cold pads. 32 bars (intro/A/B/A'/drop).
  w1l2: {
    bpm: 120, root: 52, scale: [0, 2, 3, 5, 7, 8, 10],
    leadType: "sawtooth", leadVol: 0.026, leadLen: 1.1, arpVol: 0.015,
    bassVol: 0.085, kickVol: 0.1, padCut: 2200,
    sections: [
      {
        name: "intro", bars: 4,
        pads: [pad(CH.Em), pad(CH.CmajLo), pad(CH.G), pad(CH.D)],
        bass: [b2(40, 47), b2(48, 55), b2(43, 50), b2(50, 57)],
        drums: [D.backHeavy, D.backHeavy, D.backHeavy, D.back],
      },
      {
        name: "A", bars: 8,
        pads: [pad(CH.Em), pad(CH.CmajLo), pad(CH.G), pad(CH.D)],
        bass: [b2(40, 47), b2(48, 55), b2(43, 50), b2(50, 57)],
        lead: [row({ 2: 64, 6: 67, 10: 64, 14: 71 }), row({ 2: 64, 6: 67, 10: 72, 14: 67 }),
          row({ 2: 62, 6: 67, 10: 71, 14: 74 }), row({ 2: 66, 6: 69, 10: 74, 14: 69 })],
        drums: [D.backHeavy, D.back, D.backHeavy, D.drive],
      },
      {
        name: "B", bars: 8,
        pads: [pad(CH.AmLo), pad(CH.Em), pad(CH.CmajLo), pad(CH.B)],
        bass: [b2(45, 52), b2(40, 47), b2(48, 55), b2(47, 54)],
        arp: [e8([64, 67, 72, 67, 64, 67, 72, 76]), e8([64, 67, 71, 67, 64, 67, 71, 74]),
          e8([64, 67, 72, 67, 64, 67, 72, 76]), e8([66, 71, 74, 71, 66, 71, 74, 78])],
        lead: [row({ 2: 69, 10: 72 }), row({ 2: 67, 10: 71 }), row({ 2: 72, 10: 76 }), row({ 2: 71, 6: 74, 10: 78, 14: 71 })],
        drums: [D.drive, D.back, D.drive, D.drive],
      },
      {
        name: "A'", bars: 8,
        pads: [pad(CH.Em), pad(CH.CmajLo), pad(CH.G), pad(CH.D)],
        bass: [e8([40, 40, 47, 40, 40, 47, 43, 47]), b2(48, 55), e8([43, 43, 50, 43, 43, 50, 47, 50]), b2(50, 57)],
        lead: [row({ 2: 76, 6: 72, 10: 67, 14: 71 }), row({ 2: 72, 6: 67, 10: 64, 14: 67 }),
          row({ 2: 74, 6: 71, 10: 67, 14: 62 }), row({ 2: 66, 6: 69, 10: 74, 14: 78 })],
        drums: [D.drive, D.drive, D.drive, D.drive],
      },
      {
        name: "drop", bars: 4,
        pads: [pad(CH.Em), pad(CH.Em), pad(CH.CmajLo), pad(CH.B)],
        bass: [b2(40, 47), b2(40, 52), b2(48, 55), b2(47, 54)],
        lead: [row({ 2: 64, 10: 64 }), row({}), row({ 2: 60, 10: 64 }), row({ 2: 66, 8: 71, 14: 76 })],
        drums: [D.backHeavy, D.softKick, D.backHeavy, D.drive],
      },
    ],
  },

  // w1l3 — driving D-minor boss groove, 132 BPM, with a `tension` layer (fast
  // 16th arp + snare rolls) ON while the crane lives and OFF after defeat, leaving
  // a calmer coda. 32 bars (intro/A/B/A'/coda).
  w1l3: {
    bpm: 132, root: 50, scale: [0, 2, 3, 5, 7, 8, 10],
    leadType: "square", leadVol: 0.028, arpVol: 0.016,
    bassVol: 0.085, kickVol: 0.092, tensionArpVol: 0.02, snareVol: 0.05,
    sections: [
      {
        name: "intro", bars: 4,
        pads: [pad(CH.Dm), pad(CH.Bb), pad(CH.F), pad(CH.A)],
        bass: [b2(38, 45), b2(46, 53), b2(41, 48), b2(45, 52)],
        drums: [D.kickHat, D.kickHat, D.kickHat, D.drive],
        tensionArp: [s16([74, 77, 81, 77, 74, 77, 81, 84, 74, 77, 81, 77, 74, 77, 81, 84])],
        tensionDrums: [D.snareRoll],
      },
      {
        name: "A", bars: 8,
        pads: [pad(CH.Dm), pad(CH.Bb), pad(CH.F), pad(CH.A)],
        bass: [b2(38, 45), b2(46, 53), b2(41, 48), b2(45, 52)],
        lead: [row({ 0: 74, 8: 77 }), row({ 0: 77, 8: 81 }), row({ 0: 81, 8: 77 }), row({ 0: 76, 8: 74 })],
        drums: [D.drive, D.drive, D.drive, D.back],
        tensionArp: [
          s16([74, 77, 81, 86, 81, 77, 74, 77, 74, 77, 81, 86, 81, 77, 74, 77]),
          s16([70, 74, 77, 82, 77, 74, 70, 74, 70, 74, 77, 82, 77, 74, 70, 74]),
          s16([72, 77, 81, 84, 81, 77, 72, 77, 72, 77, 81, 84, 81, 77, 72, 77]),
          s16([69, 74, 77, 81, 77, 74, 69, 74, 69, 74, 77, 81, 77, 74, 69, 74]),
        ],
        tensionDrums: [D.snareRoll, D.snareRoll2, D.snareRoll, D.snareRoll2],
      },
      {
        name: "B", bars: 8,
        pads: [pad(CH.Gm), pad(CH.Dm), pad(CH.Bb), pad(CH.A)],
        bass: [b2(43, 50), b2(38, 45), b2(46, 53), b2(45, 52)],
        lead: [row({ 0: 79, 6: 77, 10: 74, 14: 77 }), row({ 0: 74, 6: 77, 10: 81, 14: 77 }),
          row({ 0: 82, 6: 81, 10: 77, 14: 74 }), row({ 0: 76, 8: 73 })],
        drums: [D.drive, D.drive, D.drive, D.drive],
        tensionArp: [
          s16([79, 82, 86, 82, 79, 82, 86, 91, 79, 82, 86, 82, 79, 82, 86, 91]),
          s16([74, 77, 81, 77, 74, 77, 81, 86, 74, 77, 81, 77, 74, 77, 81, 86]),
          s16([70, 74, 77, 74, 70, 74, 77, 82, 70, 74, 77, 74, 70, 74, 77, 82]),
          s16([69, 73, 76, 73, 69, 73, 76, 81, 69, 73, 76, 73, 69, 73, 76, 81]),
        ],
        tensionDrums: [D.snareRoll2, D.snareRoll, D.snareRoll2, D.snareRoll],
      },
      {
        name: "A'", bars: 8,
        pads: [pad(CH.Dm), pad(CH.Bb), pad(CH.F), pad(CH.A)],
        bass: [e8([38, 38, 45, 38, 38, 45, 41, 45]), b2(46, 53), e8([41, 41, 48, 41, 41, 48, 45, 48]), b2(45, 52)],
        lead: [row({ 0: 86, 4: 81, 8: 86, 12: 89 }), row({ 0: 82, 4: 77, 8: 82 }),
          row({ 0: 84, 4: 81, 8: 84, 12: 88 }), row({ 0: 81, 8: 76 })],
        drums: [D.drive, D.drive, D.drive, D.drive],
        tensionArp: [
          s16([74, 77, 81, 86, 89, 86, 81, 77, 74, 77, 81, 86, 89, 86, 81, 77]),
          s16([70, 74, 77, 82, 86, 82, 77, 74, 70, 74, 77, 82, 86, 82, 77, 74]),
          s16([72, 77, 81, 84, 88, 84, 81, 77, 72, 77, 81, 84, 88, 84, 81, 77]),
          s16([69, 74, 77, 81, 84, 81, 77, 74, 69, 74, 77, 81, 84, 81, 77, 74]),
        ],
        tensionDrums: [D.snareRoll, D.snareRoll2, D.snareRoll, D.snareRoll2],
      },
      {
        name: "coda", bars: 4,
        pads: [pad(CH.Dm), pad(CH.Bb), pad(CH.F), pad(CH.Dm)],
        bass: [b2(38, 45), b2(46, 53), b2(41, 48), b2(38, 50)],
        lead: [row({ 0: 74, 8: 77 }), row({ 0: 77, 8: 74 }), row({ 0: 72, 8: 69 }), row({ 0: 74 })],
        drums: [D.kickHat, D.softKick, D.kickHat, D.softKick],
        tensionArp: [q(74, 77, 81, 77), q(72, 77, 81, 77), q(70, 74, 77, 74), q(69, 74, 77, 74)],
        tensionDrums: [D.hats, D.offhat, D.hats, D.offhat],
      },
    ],
  },

  // w2l1 — sneaky D-dorian, 104 BPM: muted staccato pulse stabs on the off-beats,
  // a walking chromatic bass, sparse tip-toe drums. 32 bars (intro/A/B/A'/tag).
  w2l1: {
    bpm: 104, root: 50, scale: [0, 2, 3, 5, 7, 9, 10],
    leadType: "triangle", leadVol: 0.026, arpType: "pulse", arpVol: 0.016, arpLen: 0.9,
    bassVol: 0.07, kickVol: 0.07, snareVol: 0.03, hatVol: 0.016, padCut: 2300,
    sections: [
      {
        name: "intro", bars: 4,
        pads: [pad(CH.Dm), pad(CH.G), pad(CH.Dm), pad(CH.CmajLo)],
        bass: [e8([38, 39, 40, 41, 40, 39, 38, 37]), e8([43, 44, 45, 43, 45, 44, 43, 41]),
          e8([38, 39, 40, 41, 40, 39, 38, 37]), e8([48, 47, 45, 43, 45, 47, 48, 47])],
        drums: [D.sneak, D.sneak, D.sneak, D.sneak],
      },
      {
        name: "A", bars: 8,
        pads: [pad(CH.Dm), pad(CH.G), pad(CH.Dm), pad(CH.CmajLo)],
        bass: [e8([38, 39, 40, 41, 40, 39, 38, 37]), e8([43, 44, 45, 43, 45, 44, 43, 41]),
          e8([38, 39, 40, 41, 40, 39, 38, 37]), e8([48, 47, 45, 43, 45, 47, 48, 47])],
        arp: [row({ 2: 74, 6: 77, 10: 74, 14: 81 }), row({ 2: 74, 6: 79, 10: 74, 14: 77 }),
          row({ 2: 74, 6: 77, 10: 81, 14: 77 }), row({ 2: 72, 6: 76, 10: 79, 14: 76 })],
        drums: [D.sneak, D.tick, D.sneak, D.back],
      },
      {
        name: "B", bars: 8,
        pads: [pad(CH.F), pad(CH.G), pad(CH.Am), pad(CH.Dm)],
        bass: [e8([41, 42, 43, 41, 43, 42, 41, 40]), e8([43, 44, 45, 43, 45, 44, 43, 41]),
          e8([45, 46, 47, 45, 47, 46, 45, 43]), e8([38, 39, 40, 41, 40, 39, 38, 37])],
        arp: [row({ 2: 77, 6: 81, 10: 84, 14: 81 }), row({ 2: 74, 6: 79, 10: 83, 14: 79 }),
          row({ 2: 76, 6: 79, 10: 84, 14: 79 }), row({ 2: 74, 6: 77, 10: 81, 14: 84 })],
        lead: [row({ 0: 81 }), row({ 8: 83 }), row({ 0: 84 }), row({ 8: 81, 12: 77 })],
        drums: [D.tick, D.sneak, D.tick, D.sneak],
      },
      {
        name: "A'", bars: 8,
        pads: [pad(CH.Dm), pad(CH.G), pad(CH.Dm), pad(CH.CmajLo)],
        bass: [e8([38, 39, 40, 41, 42, 41, 40, 39]), e8([43, 44, 45, 46, 45, 44, 43, 41]),
          e8([38, 39, 40, 41, 42, 41, 40, 39]), e8([48, 47, 45, 43, 42, 43, 45, 47])],
        arp: [s16([74, 74, 77, 77, 74, 74, 81, 81, 74, 74, 77, 77, 74, 74, 79, 79]),
          s16([74, 74, 79, 79, 74, 74, 77, 77, 74, 74, 79, 79, 74, 74, 81, 81]),
          s16([74, 74, 77, 77, 81, 81, 77, 77, 74, 74, 77, 77, 74, 74, 72, 72]),
          s16([72, 72, 76, 76, 79, 79, 76, 76, 72, 72, 76, 76, 79, 79, 83, 83])],
        drums: [D.back, D.sneak, D.back, D.tick],
      },
      {
        name: "tag", bars: 4,
        pads: [pad(CH.Dm), pad(CH.Dm), pad(CH.G), pad(CH.Am)],
        bass: [e8([38, 39, 40, 41, 40, 39, 38, 37]), b2(38, 45), e8([43, 44, 45, 43, 45, 44, 43, 41]), b2(45, 52)],
        arp: [row({ 2: 74, 10: 77 }), row({ 6: 81 }), row({ 2: 74, 10: 79 }), row({ 6: 84, 14: 77 })],
        drums: [D.sneak, D.tick, D.sneak, D.back],
      },
    ],
  },

  // w2l2 — humid, mysterious F#-minor, 92 BPM: very long pads, a drip-like sine
  // plink lead, almost no drums. 32 bars (intro/A/B/A'/haze).
  w2l2: {
    bpm: 92, root: 54, scale: [0, 2, 3, 5, 7, 8, 10],
    leadType: "sine", leadVol: 0.03, leadLen: 0.8, arpType: "sine", arpVol: 0.013,
    bassVol: 0.06, kickVol: 0.06, hatVol: 0.014, padVol: 0.024, padCut: 2000,
    sections: [
      {
        name: "intro", bars: 4,
        pads: [pad(CH.FsM), pad(CH.D), pad(CH.A), pad(CH.E)],
        bass: [b2(42, 49), b2(50, 57), b2(45, 52), b2(40, 47)],
        drums: [D.none, D.none, D.softKick, D.none],
      },
      {
        name: "A", bars: 8,
        pads: [pad(CH.FsM), pad(CH.D), pad(CH.A), pad(CH.E)],
        bass: [b2(42, 49), b2(50, 57), b2(45, 52), b2(40, 47)],
        lead: [row({ 4: 78 }), row({ 8: 74 }), row({ 4: 81 }), row({ 12: 76 })],
        drums: [D.softKick, D.none, D.softKick, D.offhat],
      },
      {
        name: "B", bars: 8,
        pads: [pad(CH.Bm), pad(CH.FsM), pad(CH.D), pad(CH.E)],
        bass: [b2(47, 54), b2(42, 49), b2(50, 57), b2(40, 47)],
        lead: [row({ 2: 83, 10: 78 }), row({ 6: 81 }), row({ 2: 86, 10: 81 }), row({ 6: 80, 14: 76 })],
        arp: [row({ 0: 66, 8: 71 }), row({ 0: 66, 8: 69 }), row({ 0: 62, 8: 66 }), row({ 0: 64, 8: 68 })],
        drums: [D.softKick, D.offhat, D.softKick, D.offhat],
      },
      {
        name: "A'", bars: 8,
        pads: [pad(CH.FsM), pad(CH.D), pad(CH.A), pad(CH.E)],
        bass: [b2(42, 49), b2(50, 57), b2(45, 52), b2(40, 47)],
        lead: [row({ 2: 78, 6: 81, 10: 85 }), row({ 4: 74, 12: 78 }),
          row({ 2: 81, 6: 85, 10: 88 }), row({ 4: 83, 12: 76 })],
        arp: [row({ 0: 66, 6: 69, 12: 73 }), row({ 0: 62, 6: 66, 12: 69 }),
          row({ 0: 64, 6: 69, 12: 73 }), row({ 0: 64, 6: 68, 12: 71 })],
        drums: [D.kickHat, D.offhat, D.softKick, D.offhat],
      },
      {
        name: "haze", bars: 4,
        pads: [pad(CH.FsM), pad(CH.Bm), pad(CH.D), pad(CH.FsM)],
        bass: [b2(42, 49), b2(47, 54), b2(50, 57), b2(42, 54)],
        lead: [row({ 8: 73 }), row({ 4: 78 }), row({ 8: 76 }), row({ 0: 78 })],
        drums: [D.none, D.softKick, D.none, D.offhat],
      },
    ],
  },

  // w2l3 — syncopated G-minor heist groove, 116 BPM, with a steady "tick-tock"
  // two-note arp motif (the timed doors) running under a nervy lead. 32 bars
  // (intro/A/B/A'/turn).
  w2l3: {
    bpm: 116, root: 55, scale: [0, 2, 3, 5, 7, 8, 10],
    leadType: "square", leadVol: 0.026, arpType: "pulse", arpVol: 0.017, arpLen: 1.0,
    bassVol: 0.08, kickVol: 0.085, padCut: 2500,
    sections: [
      {
        name: "intro", bars: 4,
        pads: [pad(CH.Gm), pad(CH.Eb), pad(CH.CmLo), pad(CH.D)],
        bass: [b2(43, 50), b2(51, 58), b2(48, 55), b2(50, 57)],
        arp: [q(74, 70, 74, 70), q(74, 70, 74, 70), q(74, 70, 74, 70), q(74, 70, 74, 70)],
        drums: [D.heist, D.heist, D.heist, D.heist],
      },
      {
        name: "A", bars: 8,
        pads: [pad(CH.Gm), pad(CH.Eb), pad(CH.CmLo), pad(CH.D)],
        bass: [b2(43, 50), b2(51, 58), b2(48, 55), b2(50, 57)],
        arp: [q(74, 70, 74, 70), q(75, 70, 75, 70), q(72, 67, 72, 67), q(74, 69, 74, 69)],
        lead: [row({ 2: 79, 8: 77, 12: 74 }), row({ 2: 82, 8: 79, 12: 75 }),
          row({ 2: 79, 8: 75, 12: 72 }), row({ 2: 78, 8: 74, 12: 77 })],
        drums: [D.heist, D.back, D.heist, D.drive],
      },
      {
        name: "B", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.Gm), pad(CH.Eb), pad(CH.D)],
        bass: [b2(48, 55), b2(43, 50), b2(51, 58), b2(50, 57)],
        arp: [q(72, 67, 72, 67), q(74, 70, 74, 70), q(75, 70, 75, 70), q(74, 69, 74, 69)],
        lead: [row({ 0: 84, 6: 82, 10: 79, 14: 75 }), row({ 0: 79, 6: 82, 10: 86, 14: 82 }),
          row({ 0: 82, 6: 79, 10: 75, 14: 72 }), row({ 0: 78, 8: 74 })],
        drums: [D.drive, D.heist, D.drive, D.drive],
      },
      {
        name: "A'", bars: 8,
        pads: [pad(CH.Gm), pad(CH.Eb), pad(CH.CmLo), pad(CH.D)],
        bass: [e8([43, 43, 50, 43, 43, 50, 46, 50]), b2(51, 58), e8([48, 48, 55, 48, 48, 55, 51, 55]), b2(50, 57)],
        arp: [
          s16([74, 70, 74, 70, 74, 70, 77, 70, 74, 70, 74, 70, 74, 70, 79, 70]),
          s16([75, 70, 75, 70, 75, 70, 79, 70, 75, 70, 75, 70, 75, 70, 82, 70]),
          s16([72, 67, 72, 67, 72, 67, 75, 67, 72, 67, 72, 67, 72, 67, 79, 67]),
          s16([74, 69, 74, 69, 74, 69, 78, 69, 74, 69, 74, 69, 74, 69, 81, 69]),
        ],
        lead: [row({ 2: 86, 6: 82, 10: 79, 14: 82 }), row({ 2: 87, 6: 82, 10: 79, 14: 75 }),
          row({ 2: 84, 6: 79, 10: 75, 14: 72 }), row({ 2: 78, 8: 74, 12: 69 })],
        drums: [D.drive, D.drive, D.drive, D.drive],
      },
      {
        name: "turn", bars: 4,
        pads: [pad(CH.Gm), pad(CH.CmLo), pad(CH.Eb), pad(CH.D)],
        bass: [b2(43, 50), b2(48, 55), b2(51, 58), b2(50, 57)],
        arp: [q(74, 70, 74, 70), q(72, 67, 72, 67), q(75, 70, 75, 70), q(74, 69, 74, 69)],
        lead: [row({ 2: 79 }), row({ 8: 75 }), row({ 2: 82, 10: 79 }), row({ 0: 74, 8: 71 })],
        drums: [D.heist, D.back, D.heist, D.drive],
      },
    ],
  },

  // w3 — reserve (World 3, electro-funk): syncopated C-minor-pentatonic groove,
  // 110 BPM, punchy funk bass + clav-like pulse. Simple but real. 32 bars.
  w3: {
    bpm: 110, root: 48, scale: [0, 3, 5, 6, 7, 10],
    leadType: "square", leadVol: 0.026, arpType: "pulse", arpVol: 0.017,
    bassVol: 0.088, kickVol: 0.09,
    sections: [
      {
        name: "A", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.Bb), pad(CH.AbLo), pad(CH.GLo)],
        bass: [e8([36, 36, 43, 36, 39, 36, 43, 46]), e8([34, 34, 41, 34, 37, 34, 41, 44]),
          e8([32, 32, 39, 32, 35, 32, 39, 43]), e8([31, 31, 38, 31, 34, 31, 38, 43])],
        arp: [q(72, 75, 79, 75), q(70, 74, 77, 74), q(68, 72, 75, 72), q(67, 70, 74, 70)],
        drums: [D.drive, D.back, D.drive, D.drive],
      },
      {
        name: "B", bars: 8,
        pads: [pad(CH.Fm), pad(CH.CmLo), pad(CH.AbLo), pad(CH.GLo)],
        bass: [e8([41, 41, 48, 41, 44, 41, 48, 51]), e8([36, 36, 43, 36, 39, 36, 43, 46]),
          e8([32, 32, 39, 32, 35, 32, 39, 43]), e8([31, 31, 38, 31, 34, 31, 38, 43])],
        arp: [q(77, 80, 84, 80), q(72, 75, 79, 75), q(68, 72, 75, 72), q(67, 70, 74, 70)],
        lead: [row({ 0: 84, 6: 82, 10: 79 }), row({ 0: 79, 6: 75, 10: 72 }),
          row({ 0: 80, 6: 75, 10: 72 }), row({ 0: 74, 8: 70 })],
        drums: [D.drive, D.drive, D.drive, D.back],
      },
      {
        name: "A'", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.Bb), pad(CH.AbLo), pad(CH.GLo)],
        bass: [e8([36, 36, 43, 36, 39, 36, 43, 46]), e8([34, 34, 41, 34, 37, 34, 41, 44]),
          e8([32, 32, 39, 32, 35, 32, 39, 43]), e8([31, 31, 38, 31, 34, 31, 38, 43])],
        arp: [s16([72, 75, 79, 82, 79, 75, 72, 75, 72, 75, 79, 82, 79, 75, 72, 75]),
          s16([70, 74, 77, 82, 77, 74, 70, 74, 70, 74, 77, 82, 77, 74, 70, 74]),
          s16([68, 72, 75, 80, 75, 72, 68, 72, 68, 72, 75, 80, 75, 72, 68, 72]),
          s16([67, 70, 74, 79, 74, 70, 67, 70, 67, 70, 74, 79, 74, 70, 67, 70])],
        lead: [row({ 2: 87, 8: 84, 12: 79 }), row({ 2: 82, 8: 79, 12: 75 }),
          row({ 2: 80, 8: 75, 12: 72 }), row({ 2: 74, 10: 70 })],
        drums: [D.drive, D.drive, D.drive, D.drive],
      },
      {
        name: "tag", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.AbLo), pad(CH.Bb), pad(CH.GLo)],
        bass: [e8([36, 36, 43, 36, 39, 36, 43, 46]), e8([32, 32, 39, 32, 35, 32, 39, 43]),
          e8([34, 34, 41, 34, 37, 34, 41, 44]), e8([31, 31, 38, 31, 34, 31, 38, 43])],
        arp: [q(72, 75, 79, 75), q(68, 72, 75, 72), q(70, 74, 77, 74), q(67, 70, 74, 70)],
        drums: [D.back, D.drive, D.back, D.drive],
      },
    ],
  },

  // w4 — reserve (World 4, THE DARK CORE): the somber-mysterious base the W4
  // level tracks will extend. 82 BPM C-minor, long low pads under a sparse
  // music-box sine lead, a slow two-note heartbeat bass, off-beat hats like
  // dripping servers. Dark but never scary — a lonely machine humming to
  // itself. 32 bars (A/B/hollow/tail), sectioned so it never loops one cell.
  w4: {
    bpm: 82, root: 48, scale: [0, 2, 3, 5, 7, 8, 10],
    leadType: "sine", leadVol: 0.03, leadLen: 0.9,
    arpType: "triangle", arpVol: 0.014, bassType: "triangle", bassVol: 0.08,
    kickVol: 0.07, hatVol: 0.014, padVol: 0.032,
    sections: [
      {
        name: "A", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.AbLo), pad(CH.Eb), pad(CH.GLo)],
        bass: [b2(36, 43), b2(32, 39), b2(39, 46), b2(31, 38)],
        lead: [row({ 4: 75 }), row({ 8: 72 }), row({ 4: 79, 12: 75 }), row({ 8: 74 })],
        drums: [D.softKick, D.none, D.softKick, D.offhat],
      },
      {
        name: "B", bars: 8,
        pads: [pad(CH.Fm), pad(CH.CmLo), pad(CH.AbLo), pad(CH.Bb)],
        bass: [b2(41, 48), b2(36, 43), b2(32, 39), b2(34, 41)],
        lead: [row({ 2: 80, 10: 77 }), row({ 6: 75 }), row({ 2: 78, 10: 75 }), row({ 6: 74, 14: 70 })],
        arp: [row({ 0: 60, 8: 63 }), row({ 0: 60, 8: 67 }), row({ 0: 56, 8: 60 }), row({ 0: 58, 8: 62 })],
        drums: [D.softKick, D.offhat, D.softKick, D.tick],
      },
      {
        name: "hollow", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.CmLo), pad(CH.AbLo), pad(CH.GLo)],
        bass: [b2(36, 43), b2(36, 43), b2(32, 39), b2(31, 38)],
        arp: [row({ 0: 60, 6: 63, 12: 67 }), row({ 0: 60, 6: 63, 12: 67 }),
          row({ 0: 56, 6: 60, 12: 63 }), row({ 0: 55, 6: 58, 12: 62 })],
        lead: [row({ 8: 84 }), row({}), row({ 8: 80 }), row({ 4: 79 })],
        drums: [D.none, D.softKick, D.none, D.softKick],
      },
      {
        name: "tail", bars: 8,
        pads: [pad(CH.AbLo), pad(CH.Bb), pad(CH.CmLo), pad(CH.CmLo)],
        bass: [b2(32, 39), b2(34, 41), b2(36, 43), b2(36, 48)],
        lead: [row({ 4: 72 }), row({ 8: 74 }), row({ 4: 75, 12: 72 }), row({ 0: 72 })],
        drums: [D.offhat, D.softKick, D.tick, D.none],
      },
    ],
  },

  // w4l1 — 4-1 "Lights Out" (W3W4 L41): the Dark Core's first chamber. Extends
  // the w4 somber-mysterious identity (same 82-BPM-family C-minor root/scale)
  // but a distinct mix per the S2 per-level conventions: a searching music-box
  // sine lead that sweeps like the flashlight cone, a ticking off-hat pulse
  // (server drips in the dark), a slow heartbeat bass, and a B section that
  // warms two octaves up — "the beam finds something". Near-black quiet, never
  // scary. 40 bars (intro/A/B/dim/A'/tail) so it never loops one cell.
  w4l1: {
    bpm: 80, root: 48, scale: [0, 2, 3, 5, 7, 8, 10],
    leadType: "sine", leadVol: 0.032, leadLen: 1.0,
    arpType: "triangle", arpVol: 0.013, arpLen: 1.2,
    bassType: "triangle", bassVol: 0.075, bassLen: 3.2,
    kickVol: 0.065, snareVol: 0.018, hatVol: 0.013, padVol: 0.03, padCut: 1900,
    sections: [
      {
        name: "intro", bars: 4,
        pads: [pad(CH.CmLo), pad(CH.CmLo), pad(CH.AbLo), pad(CH.GLo)],
        bass: [b2(36, 43), b2(36, 43), b2(32, 39), b2(31, 38)],
        lead: [row({ 8: 72 }), row({}), row({ 8: 68 }), row({ 4: 67 })],
        drums: [D.none, D.offhat, D.none, D.offhat],
      },
      {
        name: "A", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.AbLo), pad(CH.Eb), pad(CH.GLo)],
        bass: [b2(36, 43), b2(32, 39), b2(39, 46), b2(31, 38)],
        lead: [row({ 4: 75, 12: 72 }), row({ 8: 68 }), row({ 4: 79, 12: 75 }), row({ 8: 74 })],
        arp: [row({ 0: 60, 8: 63 }), row({ 0: 56, 8: 60 }), row({ 0: 63, 8: 67 }), row({ 0: 55, 8: 62 })],
        drums: [D.softKick, D.offhat, D.softKick, D.tick],
      },
      {
        name: "B", bars: 8,
        pads: [pad(CH.Fm), pad(CH.CmLo), pad(CH.AbLo), pad(CH.Bb)],
        bass: [b2(41, 48), b2(36, 43), b2(32, 39), b2(34, 41)],
        lead: [row({ 0: 80, 6: 84, 12: 80 }), row({ 4: 75, 10: 79 }),
          row({ 0: 80, 6: 77, 12: 75 }), row({ 4: 74, 10: 70 })],
        arp: [row({ 2: 65, 10: 68 }), row({ 2: 63, 10: 67 }), row({ 2: 60, 10: 63 }), row({ 2: 62, 10: 65 })],
        drums: [D.softKick, D.tick, D.softKick, D.offhat],
      },
      {
        name: "dim", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.CmLo), pad(CH.AbLo), pad(CH.GLo)],
        bass: [b2(36, 43), b2(36, 43), b2(32, 39), b2(31, 38)],
        arp: [row({ 0: 60, 6: 63, 12: 67 }), row({ 0: 60, 6: 63, 12: 67 }),
          row({ 0: 56, 6: 60, 12: 63 }), row({ 0: 55, 6: 58, 12: 62 })],
        lead: [row({ 8: 87 }), row({}), row({ 8: 84 }), row({ 4: 82 })],
        drums: [D.none, D.softKick, D.none, D.tick],
      },
      {
        name: "A'", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.AbLo), pad(CH.Eb), pad(CH.Bb)],
        bass: [b2(36, 43), b2(32, 39), b2(39, 46), b2(34, 41)],
        lead: [row({ 4: 75, 12: 79 }), row({ 8: 80 }), row({ 4: 79, 12: 75 }), row({ 8: 74, 14: 72 })],
        arp: [row({ 0: 60, 8: 63 }), row({ 0: 56, 8: 60 }), row({ 0: 63, 8: 67 }), row({ 0: 58, 8: 62 })],
        drums: [D.softKick, D.offhat, D.softKick, D.sneak],
      },
      {
        name: "tail", bars: 4,
        pads: [pad(CH.AbLo), pad(CH.Bb), pad(CH.CmLo), pad(CH.CmLo)],
        bass: [b2(32, 39), b2(34, 41), b2(36, 43), b2(36, 48)],
        lead: [row({ 4: 72 }), row({ 8: 74 }), row({ 4: 75 }), row({ 0: 72 })],
        drums: [D.offhat, D.none, D.tick, D.none],
      },
    ],
  },

  // w4l2 — 4-2 "The Laser Garden" (W3W4 L42): the Dark Core's laser conservatory.
  // Extends the w4 somber-mysterious identity (same 82-BPM-family C-minor
  // root/scale, sine music-box lead, heartbeat bass) but a distinct mix per the
  // S2 per-level conventions: a touch quicker at 84 BPM, a PULSE arp that sweeps
  // up-and-over-and-back in 16ths like the laser fans, tick/off-hat servo drums,
  // and a "bloom" section where the sweep-arp blossoms two octaves up before the
  // hush returns. Dark but tidy — a lonely machine pruning light. 40 bars
  // (intro/A/B/bloom/A'/tail), sectioned so it never loops one cell.
  w4l2: {
    bpm: 84, root: 48, scale: [0, 2, 3, 5, 7, 8, 10],
    leadType: "sine", leadVol: 0.03, leadLen: 0.95,
    arpType: "pulse", arpVol: 0.012, arpLen: 0.55,
    bassType: "triangle", bassVol: 0.078, bassLen: 3.0,
    kickVol: 0.065, snareVol: 0.016, hatVol: 0.014, padVol: 0.03, padCut: 2000,
    sections: [
      {
        name: "intro", bars: 4,
        pads: [pad(CH.CmLo), pad(CH.CmLo), pad(CH.AbLo), pad(CH.GLo)],
        bass: [b2(36, 43), b2(36, 43), b2(32, 39), b2(31, 38)],
        // the first sweep wakes: a slow half-arc, out and back
        arp: [row({ 0: 60, 4: 63, 8: 67, 12: 63 }), row({ 0: 60, 4: 63, 8: 67, 12: 63 }),
          row({ 0: 56, 4: 60, 8: 63, 12: 60 }), row({ 0: 55, 4: 58, 8: 62, 12: 58 })],
        drums: [D.none, D.tick, D.none, D.offhat],
      },
      {
        name: "A", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.AbLo), pad(CH.Eb), pad(CH.GLo)],
        bass: [b2(36, 43), b2(32, 39), b2(39, 46), b2(31, 38)],
        // the sweep-arp: up-over-and-back 16ths, one fan pass per bar
        arp: [s16([60, 63, 67, 70, 72, 70, 67, 63, 60, 63, 67, 70, 72, 70, 67, 63]),
          s16([56, 60, 63, 67, 68, 67, 63, 60, 56, 60, 63, 67, 68, 67, 63, 60]),
          s16([63, 67, 70, 74, 75, 74, 70, 67, 63, 67, 70, 74, 75, 74, 70, 67]),
          s16([55, 58, 62, 67, 67, 67, 62, 58, 55, 58, 62, 67, 67, 67, 62, 58])],
        lead: [row({ 4: 75 }), row({ 8: 72 }), row({ 4: 79, 12: 75 }), row({ 8: 74 })],
        drums: [D.softKick, D.tick, D.softKick, D.offhat],
      },
      {
        name: "B", bars: 8,
        pads: [pad(CH.Fm), pad(CH.CmLo), pad(CH.AbLo), pad(CH.Bb)],
        bass: [b2(41, 48), b2(36, 43), b2(32, 39), b2(34, 41)],
        lead: [row({ 2: 80, 10: 77 }), row({ 6: 75, 14: 72 }), row({ 2: 78, 10: 75 }), row({ 6: 74, 14: 70 })],
        // the twin blooms: two mirrored half-sweeps per bar
        arp: [row({ 0: 65, 2: 68, 4: 72, 6: 68, 8: 65, 10: 68, 12: 72, 14: 68 }),
          row({ 0: 60, 2: 63, 4: 67, 6: 63, 8: 60, 10: 63, 12: 67, 14: 63 }),
          row({ 0: 56, 2: 60, 4: 63, 6: 60, 8: 56, 10: 60, 12: 63, 14: 60 }),
          row({ 0: 58, 2: 62, 4: 65, 6: 62, 8: 58, 10: 62, 12: 65, 14: 62 })],
        drums: [D.softKick, D.offhat, D.softKick, D.tick],
      },
      {
        name: "bloom", bars: 8,
        pads: [pad(CH.AbLo), pad(CH.Bb), pad(CH.CmLo), pad(CH.GLo)],
        bass: [b2(32, 39), b2(34, 41), b2(36, 43), b2(31, 38)],
        // the garden opens: the sweep blossoms two octaves up
        arp: [s16([72, 75, 79, 82, 84, 82, 79, 75, 72, 75, 79, 82, 84, 82, 79, 75]),
          s16([70, 74, 77, 82, 82, 82, 77, 74, 70, 74, 77, 82, 82, 82, 77, 74]),
          s16([72, 75, 79, 84, 87, 84, 79, 75, 72, 75, 79, 84, 87, 84, 79, 75]),
          s16([67, 70, 74, 79, 79, 79, 74, 70, 67, 70, 74, 79, 79, 79, 74, 70])],
        lead: [row({ 8: 84 }), row({ 4: 82 }), row({ 8: 87 }), row({ 4: 79, 12: 75 })],
        drums: [D.softKick, D.tick, D.sneak, D.offhat],
      },
      {
        name: "A'", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.AbLo), pad(CH.Eb), pad(CH.Bb)],
        bass: [b2(36, 43), b2(32, 39), b2(39, 46), b2(34, 41)],
        arp: [s16([60, 63, 67, 70, 72, 70, 67, 63, 60, 63, 67, 70, 72, 70, 67, 63]),
          s16([56, 60, 63, 67, 68, 67, 63, 60, 56, 60, 63, 67, 68, 67, 63, 60]),
          s16([63, 67, 70, 74, 75, 74, 70, 67, 63, 67, 70, 74, 75, 74, 70, 67]),
          s16([58, 62, 65, 70, 70, 70, 65, 62, 58, 62, 65, 70, 70, 70, 62, 58])],
        lead: [row({ 4: 75, 12: 79 }), row({ 8: 80 }), row({ 4: 79, 12: 75 }), row({ 8: 74, 14: 72 })],
        drums: [D.softKick, D.offhat, D.softKick, D.sneak],
      },
      {
        name: "tail", bars: 4,
        pads: [pad(CH.AbLo), pad(CH.Bb), pad(CH.CmLo), pad(CH.CmLo)],
        bass: [b2(32, 39), b2(34, 41), b2(36, 43), b2(36, 48)],
        // the sweeps power down, one by one
        arp: [row({ 0: 60, 4: 63, 8: 67 }), row({ 0: 58, 4: 62 }), row({ 0: 60 }), row({})],
        lead: [row({ 4: 72 }), row({ 8: 74 }), row({ 4: 75 }), row({ 0: 72 })],
        drums: [D.offhat, D.none, D.tick, D.none],
      },
    ],
  },

  // w4l3 — 4-3 "KOBI's Heart" (W3W4 L43): the FINALE. Extends the w4 family
  // (C-minor root/scale) but pushed to a 96-BPM confrontation with the w1l3
  // boss grammar: a `tension` layer (urgent 16th arp + snare rolls) ON while
  // KOBI's heart still runs and OFF at the power-down — leaving a slow, kind
  // coda under the Bolt rescue. The lead is KOBI's own music-box sine, singing
  // his lonely w4 motif over war drums: the fight IS him, the calm after is
  // him too. 36 bars (intro/A/B/A'/coda), sectioned so it never loops a cell.
  w4l3: {
    bpm: 96, root: 48, scale: [0, 2, 3, 5, 7, 8, 10],
    leadType: "sine", leadVol: 0.034, leadLen: 1.1,
    arpType: "triangle", arpVol: 0.015, arpLen: 1.0,
    bassType: "triangle", bassVol: 0.088, bassLen: 3.0,
    kickVol: 0.095, snareVol: 0.045, hatVol: 0.016, padVol: 0.032, padCut: 2100,
    tensionArpVol: 0.019,
    sections: [
      {
        name: "intro", bars: 4,
        pads: [pad(CH.CmLo), pad(CH.AbLo), pad(CH.CmLo), pad(CH.GLo)],
        bass: [b2(36, 43), b2(32, 39), b2(36, 43), b2(31, 38)],
        lead: [row({ 8: 72 }), row({ 8: 68 }), row({ 8: 75 }), row({ 4: 74 })],
        drums: [D.tick, D.kickHat, D.tick, D.drive],
        tensionArp: [s16([72, 75, 79, 75, 72, 75, 79, 84, 72, 75, 79, 75, 72, 75, 79, 84])],
        tensionDrums: [D.snareRoll],
      },
      {
        name: "A", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.AbLo), pad(CH.Eb), pad(CH.GLo)],
        bass: [e8([36, 36, 43, 36, 36, 43, 39, 43]), e8([32, 32, 39, 32, 32, 39, 36, 39]),
          e8([39, 39, 46, 39, 39, 46, 43, 46]), e8([31, 31, 38, 31, 31, 38, 34, 38])],
        lead: [row({ 0: 75, 8: 72 }), row({ 0: 72, 8: 68 }), row({ 0: 79, 8: 75 }), row({ 0: 74, 8: 70 })],
        drums: [D.drive, D.back, D.drive, D.drive],
        tensionArp: [
          s16([72, 75, 79, 84, 79, 75, 72, 75, 72, 75, 79, 84, 79, 75, 72, 75]),
          s16([68, 72, 75, 80, 75, 72, 68, 72, 68, 72, 75, 80, 75, 72, 68, 72]),
          s16([75, 79, 82, 87, 82, 79, 75, 79, 75, 79, 82, 87, 82, 79, 75, 79]),
          s16([67, 70, 74, 79, 74, 70, 67, 70, 67, 70, 74, 79, 74, 70, 67, 70]),
        ],
        tensionDrums: [D.snareRoll, D.snareRoll2, D.snareRoll, D.snareRoll2],
      },
      {
        name: "B", bars: 8,
        pads: [pad(CH.Fm), pad(CH.CmLo), pad(CH.AbLo), pad(CH.Bb)],
        bass: [e8([41, 41, 48, 41, 41, 48, 44, 48]), e8([36, 36, 43, 36, 36, 43, 39, 43]),
          e8([32, 32, 39, 32, 32, 39, 36, 39]), e8([34, 34, 41, 34, 34, 41, 38, 41])],
        lead: [row({ 0: 80, 6: 77, 12: 75 }), row({ 0: 75, 6: 72, 12: 68 }),
          row({ 0: 80, 6: 84, 12: 80 }), row({ 0: 77, 8: 74 })],
        drums: [D.drive, D.drive, D.drive, D.back],
        tensionArp: [
          s16([77, 80, 84, 80, 77, 80, 84, 89, 77, 80, 84, 80, 77, 80, 84, 89]),
          s16([72, 75, 79, 75, 72, 75, 79, 84, 72, 75, 79, 75, 72, 75, 79, 84]),
          s16([68, 72, 75, 72, 68, 72, 75, 80, 68, 72, 75, 72, 68, 72, 75, 80]),
          s16([70, 74, 77, 74, 70, 74, 77, 82, 70, 74, 77, 74, 70, 74, 77, 82]),
        ],
        tensionDrums: [D.snareRoll2, D.snareRoll, D.snareRoll2, D.snareRoll],
      },
      {
        name: "A'", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.AbLo), pad(CH.Eb), pad(CH.Bb)],
        bass: [e8([36, 48, 36, 43, 36, 46, 43, 36]), e8([32, 44, 32, 39, 32, 43, 39, 32]),
          e8([39, 51, 39, 46, 39, 43, 46, 39]), e8([34, 46, 34, 41, 34, 44, 41, 34])],
        lead: [row({ 0: 84, 4: 79, 8: 84, 12: 87 }), row({ 0: 80, 4: 75, 8: 80 }),
          row({ 0: 82, 4: 79, 8: 82, 12: 87 }), row({ 0: 79, 8: 74 })],
        drums: [D.drive, D.drive, D.drive, D.drive],
        tensionArp: [
          s16([72, 75, 79, 84, 87, 84, 79, 75, 72, 75, 79, 84, 87, 84, 79, 75]),
          s16([68, 72, 75, 80, 84, 80, 75, 72, 68, 72, 75, 80, 84, 80, 75, 72]),
          s16([75, 79, 82, 87, 91, 87, 82, 79, 75, 79, 82, 87, 91, 87, 82, 79]),
          s16([70, 74, 77, 82, 86, 82, 77, 74, 70, 74, 77, 82, 86, 82, 77, 74]),
        ],
        tensionDrums: [D.snareRoll, D.snareRoll2, D.snareRoll, D.snareRoll2],
      },
      {
        // the coda under the power-down + rescue: tension OFF leaves just this
        name: "coda", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.AbLo), pad(CH.Eb), pad(CH.CmLo)],
        bass: [b2(36, 43), b2(32, 39), b2(39, 46), b2(36, 48)],
        lead: [row({ 4: 75 }), row({ 8: 72 }), row({ 4: 79, 12: 75 }), row({ 0: 72 })],
        drums: [D.softKick, D.none, D.offhat, D.none],
        tensionArp: [q(72, 75, 79, 75), q(68, 72, 75, 72), q(70, 74, 77, 74), q(72, 75, 79, 84)],
        tensionDrums: [D.hats, D.offhat, D.hats, D.offhat],
      },
    ],
  },

  // epilogue — the playground night + credits (W3W4 L43). The emotional payoff:
  // everything resolves HOME to C MAJOR (the title's key — the game ends where
  // it began, warm), 72 BPM, a music-box sine lullaby over soft pads and barely-
  // there brushes. KOBI's music-box timbre carries the melody — he writes the
  // credits music now. 28 bars (A/B/tail), gentle enough to loop under credits.
  epilogue: {
    bpm: 72, root: 60, scale: [0, 2, 4, 5, 7, 9, 11],
    leadType: "sine", leadVol: 0.036, leadLen: 1.4,
    arpType: "triangle", arpVol: 0.014, arpLen: 1.6,
    bassType: "triangle", bassVol: 0.06, bassLen: 3.6,
    kickVol: 0.045, snareVol: 0.012, hatVol: 0.011, padVol: 0.03, padCut: 1800,
    sections: [
      {
        name: "A", bars: 8,
        pads: [pad(CH.C), pad(CH.Am), pad(CH.F), pad(CH.G)],
        bass: [b2(36, 43), b2(45, 52), b2(41, 48), b2(43, 50)],
        lead: [row({ 0: 76, 8: 79 }), row({ 0: 72, 8: 76 }), row({ 0: 77, 8: 81 }), row({ 0: 74, 8: 71 })],
        arp: [row({ 4: 60, 12: 64 }), row({ 4: 57, 12: 60 }), row({ 4: 53, 12: 57 }), row({ 4: 55, 12: 59 })],
        drums: [D.none, D.softKick, D.none, D.offhat],
      },
      {
        name: "B", bars: 8,
        pads: [pad(CH.F), pad(CH.C), pad(CH.Dm), pad(CH.G)],
        bass: [b2(41, 48), b2(36, 43), b2(38, 45), b2(43, 50)],
        lead: [row({ 0: 81, 6: 79, 12: 77 }), row({ 0: 76, 8: 72 }),
          row({ 0: 74, 6: 77, 12: 81 }), row({ 0: 79, 8: 76, 14: 74 })],
        arp: [row({ 2: 65, 10: 69 }), row({ 2: 64, 10: 67 }), row({ 2: 62, 10: 65 }), row({ 2: 59, 10: 62 })],
        drums: [D.softKick, D.none, D.softKick, D.offhat],
      },
      {
        name: "tail", bars: 12,
        pads: [pad(CH.Am), pad(CH.F), pad(CH.C), pad(CH.G)],
        bass: [b2(45, 52), b2(41, 48), b2(36, 43), b2(43, 50)],
        lead: [row({ 4: 76 }), row({ 8: 77 }), row({ 4: 79, 12: 76 }), row({ 8: 74 })],
        arp: [row({ 0: 57, 8: 60 }), row({ 0: 53, 8: 57 }), row({ 0: 60, 8: 64 }), row({ 0: 55, 8: 62 })],
        drums: [D.none, D.offhat, D.none, D.softKick],
      },
    ],
  },

  // w3l1 — 3-1 "Attract Mode" (W3W4 L31): the Magnet Works floor track. Extends
  // the w3 electro-funk identity (same C-minor-pentatonic root/scale family) but
  // a distinct mix per the S2 per-level conventions: brighter 116 BPM, a snappy
  // triangle "polarity" bass, clav pulse offbeats, and a workshop-whistle square
  // lead that only sings in B/A' — reads as "the same wing, its first chamber".
  // 36 bars (intro/A/B/A'/tag), sectioned so it never loops a single 4-bar cell.
  w3l1: {
    bpm: 116, root: 48, scale: [0, 3, 5, 6, 7, 10],
    leadType: "square", leadVol: 0.024, leadLen: 0.5,
    arpType: "pulse", arpVol: 0.019, bassType: "triangle", bassVol: 0.095,
    kickVol: 0.095, hatVol: 0.02, padVol: 0.03, padCut: 2600,
    sections: [
      {
        name: "intro", bars: 4,
        pads: [pad(CH.CmLo), pad(CH.CmLo), pad(CH.AbLo), pad(CH.GLo)],
        bass: [b2(36, 43), b2(36, 43), b2(32, 39), b2(31, 38)],
        arp: [row({ 2: 72, 6: 75, 10: 79 }), row({ 2: 72, 6: 75, 10: 79 }),
          row({ 2: 68, 6: 72, 10: 75 }), row({ 2: 67, 6: 70, 10: 74 })],
        drums: [D.offhat, D.kickHat, D.offhat, D.kickHat],
      },
      {
        name: "A", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.Eb), pad(CH.AbLo), pad(CH.Bb)],
        bass: [e8([36, 48, 36, 43, 36, 46, 43, 36]), e8([39, 51, 39, 46, 39, 43, 46, 39]),
          e8([32, 44, 32, 39, 32, 43, 39, 32]), e8([34, 46, 34, 41, 34, 44, 41, 34])],
        arp: [row({ 2: 75, 6: 79, 10: 72, 14: 75 }), row({ 2: 79, 6: 82, 10: 75, 14: 79 }),
          row({ 2: 72, 6: 75, 10: 68, 14: 72 }), row({ 2: 74, 6: 77, 10: 70, 14: 74 })],
        drums: [D.bounce, D.back, D.bounce, D.drive],
      },
      {
        name: "B", bars: 8,
        pads: [pad(CH.Fm), pad(CH.AbLo), pad(CH.CmLo), pad(CH.GLo)],
        bass: [e8([41, 53, 41, 48, 41, 46, 48, 41]), e8([32, 44, 32, 39, 32, 43, 39, 32]),
          e8([36, 48, 36, 43, 36, 46, 43, 36]), e8([31, 43, 31, 38, 31, 41, 38, 31])],
        arp: [q(77, 80, 84, 80), q(72, 75, 80, 75), q(72, 75, 79, 75), q(70, 74, 79, 74)],
        lead: [row({ 0: 84, 4: 87, 10: 82 }), row({ 2: 80, 8: 75 }),
          row({ 0: 79, 4: 84, 10: 75 }), row({ 2: 74, 8: 70, 12: 67 })],
        drums: [D.drive, D.back, D.drive, D.back],
      },
      {
        name: "A'", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.Eb), pad(CH.AbLo), pad(CH.Bb)],
        bass: [e8([36, 48, 36, 43, 36, 46, 43, 36]), e8([39, 51, 39, 46, 39, 43, 46, 39]),
          e8([32, 44, 32, 39, 32, 43, 39, 32]), e8([34, 46, 34, 41, 34, 44, 41, 34])],
        arp: [s16([72, 75, 79, 75, 72, 75, 79, 75, 72, 75, 79, 82, 79, 75, 72, 75]),
          s16([75, 79, 82, 79, 75, 79, 82, 79, 75, 79, 82, 87, 82, 79, 75, 79]),
          s16([68, 72, 75, 72, 68, 72, 75, 72, 68, 72, 75, 80, 75, 72, 68, 72]),
          s16([70, 74, 77, 74, 70, 74, 77, 74, 70, 74, 77, 82, 77, 74, 70, 74])],
        lead: [row({ 8: 84 }), row({ 4: 87, 12: 82 }), row({ 8: 80 }), row({ 4: 77, 12: 74 })],
        drums: [D.drive, D.drive, D.back, D.drive],
      },
      {
        name: "tag", bars: 8,
        pads: [pad(CH.AbLo), pad(CH.Bb), pad(CH.CmLo), pad(CH.CmLo)],
        bass: [b2(32, 44), b2(34, 46), e8([36, 48, 36, 43, 36, 46, 43, 36]), b2(36, 48)],
        arp: [row({ 2: 68, 8: 72 }), row({ 2: 70, 8: 74 }), q(72, 75, 79, 75), row({ 0: 72, 8: 84 })],
        drums: [D.kickHat, D.offhat, D.bounce, D.tick],
      },
    ],
  },

  // w3l2 — 3-2 "The Flooded Tank" (W3W4 L32): the submerged tank track. Stays
  // in the W3 C-minor family but sinks it: 88 BPM, everything through a LOW
  // 1400 Hz cut (the same lowpass TECHNIQUE as the SL7 sad treatment — a fresh
  // composition, not the sad hook), long detuned pads like pressure, a slow
  // two-note "pump" bass, a sine sonar lead that only pings in B/A', and a
  // sparse triangle arp that reads as rising bubbles. Drums are soft kicks and
  // off-beat hats — machinery heard through water. 36 bars (intro/A/B/A'/deep).
  w3l2: {
    bpm: 88, root: 48, scale: [0, 3, 5, 7, 10],
    leadType: "sine", leadVol: 0.032, leadLen: 1.1,
    arpType: "triangle", arpVol: 0.014, arpLen: 1.8,
    bassType: "sine", bassVol: 0.1, bassLen: 5.5,
    kickVol: 0.06, snareVol: 0.02, hatVol: 0.011, padVol: 0.032, padCut: 1400,
    sections: [
      {
        name: "intro", bars: 4,
        pads: [pad(CH.CmLo), pad(CH.CmLo), pad(CH.AbLo), pad(CH.GLo)],
        bass: [b2(36, 43), b2(36, 43), b2(32, 39), b2(31, 38)],
        arp: [row({ 4: 60 }), row({ 4: 60, 12: 63 }), row({ 4: 56 }), row({ 4: 58, 12: 62 })],
        drums: [D.none, D.offhat, D.none, D.offhat],
      },
      {
        name: "A", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.Eb), pad(CH.AbLo), pad(CH.GLo)],
        bass: [b2(36, 43), b2(39, 46), b2(32, 39), b2(31, 38)],
        arp: [row({ 0: 60, 6: 63, 12: 67 }), row({ 0: 63, 6: 67, 12: 70 }),
          row({ 0: 56, 6: 60, 12: 63 }), row({ 0: 55, 6: 58, 12: 62 })],
        drums: [D.softKick, D.none, D.softKick, D.offhat],
      },
      {
        name: "B", bars: 8,
        pads: [pad(CH.Fm), pad(CH.AbLo), pad(CH.CmLo), pad(CH.Bb)],
        bass: [b2(41, 48), b2(32, 39), b2(36, 43), b2(34, 41)],
        lead: [row({ 2: 72 }), row({ 8: 68 }), row({ 2: 75, 10: 72 }), row({ 8: 70 })],
        arp: [row({ 0: 60, 8: 65 }), row({ 0: 60, 8: 63 }), row({ 0: 60, 8: 67 }), row({ 0: 58, 8: 65 })],
        drums: [D.softKick, D.offhat, D.softKick, D.tick],
      },
      {
        name: "A'", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.Eb), pad(CH.AbLo), pad(CH.GLo)],
        bass: [b2(36, 48), b2(39, 51), b2(32, 44), b2(31, 43)],
        lead: [row({ 8: 79 }), row({ 4: 75 }), row({ 8: 72 }), row({ 4: 70, 12: 67 })],
        arp: [row({ 0: 60, 5: 63, 10: 67, 14: 72 }), row({ 0: 63, 5: 67, 10: 70 }),
          row({ 0: 56, 5: 60, 10: 63, 14: 68 }), row({ 0: 55, 5: 58, 10: 62 })],
        drums: [D.softKick, D.offhat, D.kickHat, D.offhat],
      },
      {
        name: "deep", bars: 8,
        pads: [pad(CH.AbLo), pad(CH.Fm), pad(CH.CmLo), pad(CH.CmLo)],
        bass: [b2(32, 39), b2(29, 36), b2(36, 43), b2(24, 36)],
        lead: [row({ 6: 68 }), row({ 10: 65 }), row({ 6: 63 }), row({})],
        arp: [row({ 0: 56, 8: 60 }), row({ 0: 53, 8: 56 }), row({ 0: 60, 8: 63 }), row({ 4: 60 })],
        drums: [D.none, D.softKick, D.none, D.offhat],
      },
    ],
  },

  // w3l3 — 3-3 "The Scrap Storm" (W3W4 L33): the polarity-storm track. Stays in
  // the W3 C-minor-pentatonic family but WHIPS it up per the S2 per-level
  // conventions: 128 BPM (the wing's fastest), a driving square "polarity" bass
  // riding relentless eighths, gusting pulse-arp squalls, a siren-call square
  // lead that only cuts through in B/peak, and drums that never sit still —
  // D.drive/bounce with fourfloor gusts at the peak. Reads as "the same wing,
  // gone feral". 40 bars (intro/A/B/A'/peak/tag) so no 4-bar cell ever loops.
  w3l3: {
    bpm: 128, root: 48, scale: [0, 3, 5, 6, 7, 10],
    leadType: "square", leadVol: 0.026, leadLen: 0.45,
    arpType: "pulse", arpVol: 0.02, bassType: "square", bassVol: 0.075,
    kickVol: 0.1, snareVol: 0.045, hatVol: 0.022, padVol: 0.026, padCut: 2400,
    sections: [
      {
        name: "intro", bars: 4,
        pads: [pad(CH.CmLo), pad(CH.AbLo), pad(CH.CmLo), pad(CH.Bb)],
        bass: [e8([36, 36, 48, 36, 36, 46, 36, 43]), e8([32, 32, 44, 32, 32, 43, 32, 39]),
          e8([36, 36, 48, 36, 36, 46, 36, 43]), e8([34, 34, 46, 34, 34, 44, 34, 41])],
        arp: [row({ 2: 72, 10: 75 }), row({ 2: 68, 10: 72 }), row({ 2: 72, 10: 79 }), row({ 2: 70, 10: 74 })],
        drums: [D.kickHat, D.bounce, D.kickHat, D.drive],
      },
      {
        name: "A", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.Eb), pad(CH.AbLo), pad(CH.Bb)],
        bass: [e8([36, 48, 36, 46, 36, 48, 43, 36]), e8([39, 51, 39, 46, 39, 51, 46, 39]),
          e8([32, 44, 32, 43, 32, 44, 39, 32]), e8([34, 46, 34, 44, 34, 46, 41, 34])],
        arp: [s16([72, 75, 79, 75, 72, 75, 79, 82, 72, 75, 79, 75, 72, 75, 78, 79]),
          s16([75, 79, 82, 79, 75, 79, 82, 87, 75, 79, 82, 79, 75, 79, 82, 84]),
          s16([68, 72, 75, 72, 68, 72, 75, 80, 68, 72, 75, 72, 68, 72, 74, 75]),
          s16([70, 74, 77, 74, 70, 74, 77, 82, 70, 74, 77, 74, 70, 74, 77, 79])],
        drums: [D.drive, D.bounce, D.drive, D.back],
      },
      {
        name: "B", bars: 8,
        pads: [pad(CH.Fm), pad(CH.AbLo), pad(CH.CmLo), pad(CH.GLo)],
        bass: [e8([41, 53, 41, 51, 41, 53, 48, 41]), e8([32, 44, 32, 43, 32, 44, 39, 32]),
          e8([36, 48, 36, 46, 36, 48, 43, 36]), e8([31, 43, 31, 41, 31, 43, 38, 31])],
        arp: [q(77, 80, 84, 80), q(72, 75, 80, 75), q(72, 75, 79, 75), q(70, 74, 79, 74)],
        lead: [row({ 0: 84, 4: 87, 8: 84, 12: 82 }), row({ 2: 80, 8: 75, 12: 72 }),
          row({ 0: 84, 4: 90, 10: 87 }), row({ 2: 79, 8: 74, 12: 70 })],
        drums: [D.drive, D.drive, D.bounce, D.drive],
      },
      {
        name: "A'", bars: 8,
        pads: [pad(CH.CmLo), pad(CH.Eb), pad(CH.AbLo), pad(CH.Bb)],
        bass: [e8([36, 48, 36, 46, 36, 48, 43, 36]), e8([39, 51, 39, 46, 39, 51, 46, 39]),
          e8([32, 44, 32, 43, 32, 44, 39, 32]), e8([34, 46, 34, 44, 34, 46, 41, 34])],
        arp: [s16([72, 75, 79, 82, 79, 75, 72, 75, 72, 75, 79, 82, 84, 82, 79, 75]),
          s16([75, 79, 82, 87, 82, 79, 75, 79, 75, 79, 82, 87, 90, 87, 82, 79]),
          s16([68, 72, 75, 80, 75, 72, 68, 72, 68, 72, 75, 80, 82, 80, 75, 72]),
          s16([70, 74, 77, 82, 77, 74, 70, 74, 70, 74, 77, 82, 86, 82, 77, 74])],
        lead: [row({ 8: 87 }), row({ 4: 84, 12: 82 }), row({ 8: 80 }), row({ 4: 79, 12: 75 })],
        drums: [D.drive, D.back, D.drive, D.bounce],
      },
      {
        name: "peak", bars: 8,
        pads: [pad(CH.AbLo), pad(CH.Bb), pad(CH.CmLo), pad(CH.GLo)],
        bass: [e8([32, 44, 32, 44, 32, 43, 32, 39]), e8([34, 46, 34, 46, 34, 44, 34, 41]),
          e8([36, 48, 36, 48, 36, 46, 36, 43]), e8([31, 43, 31, 43, 31, 41, 31, 38])],
        arp: [s16([80, 75, 72, 75, 80, 75, 72, 75, 80, 75, 72, 75, 80, 82, 80, 75]),
          s16([82, 77, 74, 77, 82, 77, 74, 77, 82, 77, 74, 77, 82, 84, 82, 77]),
          s16([84, 79, 75, 79, 84, 79, 75, 79, 84, 79, 75, 79, 84, 87, 84, 79]),
          s16([79, 74, 70, 74, 79, 74, 70, 74, 79, 74, 70, 74, 79, 82, 79, 74])],
        lead: [row({ 0: 87, 6: 84, 12: 87 }), row({ 2: 86, 10: 82 }),
          row({ 0: 91, 6: 87, 12: 84 }), row({ 2: 82, 10: 79 })],
        drums: [D.fourfloor, D.drive, D.fourfloor, D.drive],
      },
      {
        name: "tag", bars: 4,
        pads: [pad(CH.AbLo), pad(CH.Bb), pad(CH.CmLo), pad(CH.CmLo)],
        bass: [b2(32, 44), b2(34, 46), e8([36, 48, 36, 46, 36, 48, 43, 36]), b2(36, 48)],
        arp: [row({ 2: 68, 8: 72 }), row({ 2: 70, 8: 74 }), q(72, 75, 79, 75), row({ 0: 72, 8: 84 })],
        drums: [D.bounce, D.kickHat, D.drive, D.tick],
      },
    ],
  },

  // (W3W4 L41 touch-up, flagged: the PRE-M4 70 BPM A-phrygian `w4` reserve used
  // to sit here. M4 composed its replacement (82 BPM C-minor, above) but left
  // this stale twin in place — and a duplicate object key means the LATER one
  // won, so M4's committed track never actually played. Removed so the M4
  // composition is the one that sounds for 4-2/4-3/dev-w4.)
};

// which composed track backs each level (GameScene picks by def.id). Worlds 3/4
// are reserve — their levels are WIP but the mapping is ready for drop-in.
const LEVEL_TRACK = {
  // Sprint 10: the tutorial reuses the calm hub track (no bespoke composition).
  "tut": "hub",
  "1-1": "w1l1", "1-2": "w1l2", "1-3": "w1l3",
  "2-1": "w2l1", "2-2": "w2l2", "2-3": "w2l3",
  // W3W4 L31/L32/L33: all three Magnet Works chambers have composed tracks.
  "3-1": "w3l1", "3-2": "w3l2", "3-3": "w3l3",
  // W3W4 L41/L42/L43: all three Dark Core chambers have composed tracks — 4-3
  // is the finale boss track (tension layer ON while the heart runs, OFF at
  // the power-down, w1l3-style); the Epilogue scene plays "epilogue" itself.
  "4-1": "w4l1", "4-2": "w4l2", "4-3": "w4l3",
  // W3W4 M3: the dev-only World-3 mechanics sandbox reuses the w3 track (the
  // "wire the LEVEL music registry for world 3" entry — 3-1..3-3 above were
  // already mapped; this makes the sandbox exercise the same reuse path).
  "dev-w3": "w3",
  // W3W4 M4: the dev-only World-4 mechanics sandbox rides the new w4 base track
  // (the 4-1..4-3 rows above already pointed at "w4"; it now actually exists).
  "dev-w4": "w4",
};
export function trackForLevel(id) {
  return LEVEL_TRACK[id] || "w1l1";
}

// flatten a track's sections into an ordered list of bars, tagging each with its
// source section (so state can report section/bar for tests + wiring).
function flatten(def) {
  const bars = [];
  const pick = (sec, k, b) => (sec[k] ? sec[k][b % sec[k].length] : null);
  def.sections.forEach((sec, si) => {
    for (let b = 0; b < sec.bars; b++) {
      bars.push({
        section: si,
        sectionName: sec.name,
        pads: pick(sec, "pads", b),
        bass: pick(sec, "bass", b),
        arp: pick(sec, "arp", b),
        lead: pick(sec, "lead", b),
        drums: pick(sec, "drums", b),
        tensionArp: pick(sec, "tensionArp", b),
        tensionDrums: pick(sec, "tensionDrums", b),
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

function playDrum(ctx, dest, h, when, def) {
  if (h.includes("k")) schedKick(ctx, dest, when, def.kickVol ?? 0.085);
  if (h.includes("S")) schedNoiseHit(ctx, dest, when, 0.16, 1200, (def.snareVol ?? 0.045) * 1.3);
  else if (h.includes("s")) schedNoiseHit(ctx, dest, when, 0.13, 1400, def.snareVol ?? 0.045);
  if (h.includes("h")) schedNoiseHit(ctx, dest, when, 0.03, 8000, def.hatVol ?? 0.022);
}

// per-track output chain: pad + lead flow through a gentle lowpass; bass, arp
// and drums go straight to the track's fader.
function buildChain(ctx, out, def) {
  const trackGain = ctx.createGain();
  trackGain.connect(out);
  const soft = ctx.createBiquadFilter();
  soft.type = "lowpass";
  soft.frequency.value = def.padCut ?? 3000;
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
let jingleId = null; // active one-shot jingle id (overrides `current` for tests)

const stepDur = (rt) => 60 / rt.def.bpm / 4;
const layerOn = (rt, name) => rt.layers[name] !== false;

function scheduleStep(rt, gStep, when) {
  const ctx = getCtx();
  const def = rt.def;
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
    for (const m of bar.pads[s]) schedPad(ctx, soft, m, when, dur, def.padVol ?? 0.02);
  }
  if (bar.bass && bar.bass[s] != null) {
    schedOsc(ctx, trackGain, bar.bass[s], when, sec * (def.bassLen ?? 3.6), def.bassType ?? "triangle", def.bassVol ?? 0.075);
  }
  if (bar.lead && bar.lead[s] != null && layerOn(rt, "lead")) {
    const lt = def.leadType ?? "square";
    const lv = def.leadVol ?? 0.03;
    const ll = sec * (def.leadLen ?? 3.4);
    schedOsc(ctx, soft, bar.lead[s], when, ll, lt, lv, 0);
    schedOsc(ctx, soft, bar.lead[s], when, ll, lt, lv * 0.73, 6);
  }
  if (bar.arp && bar.arp[s] != null && layerOn(rt, "arp")) {
    const at = def.arpType;
    const usePulse = !at || at === "pulse";
    schedOsc(ctx, trackGain, bar.arp[s], when, sec * (def.arpLen ?? 1.4),
      usePulse ? "square" : at, def.arpVol ?? 0.018, 0, usePulse ? getPulse(ctx) : null);
  }
  if (bar.drums && bar.drums[s] && layerOn(rt, "drums")) {
    playDrum(ctx, trackGain, bar.drums[s], when, def);
  }
  // tension layer — fast arp + snare rolls, gated by setMusicLayer("tension", …)
  if (bar.tensionArp && bar.tensionArp[s] != null && layerOn(rt, "tension")) {
    schedOsc(ctx, trackGain, bar.tensionArp[s], when, sec * 1.1, "square", def.tensionArpVol ?? 0.02, 0, getPulse(ctx));
  }
  if (bar.tensionDrums && bar.tensionDrums[s] && layerOn(rt, "tension")) {
    playDrum(ctx, trackGain, bar.tensionDrums[s], when, def);
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
  // --- produced-MP3 upgrade -------------------------------------------------
  // If a real track exists for this id (or its world group), play it through the
  // music bus INSTEAD of the procedural synth. Silent fallback to synth otherwise,
  // so the game keeps its current music until MP3s are dropped into public/music/.
  if (mp3HasTrack(id)) {
    if (mp3State().id === id && mp3State().playing) return; // already on this track
    for (const rt of tracks) if (!rt.removeAt) fadeOut(rt, 0.6); // fade any synth out
    mp3PlayTrack(id); // async load + crossfade; routes through musicBus
    current = id;
    playing = true;
    pendingId = null;
    jingleId = null;
    return;
  }
  // leaving a produced track for a synth-only one — stop the MP3 so it doesn't
  // linger under the synth
  if (mp3State().playing) mp3StopTrack(0.6);
  // --- procedural synth path (unchanged) ------------------------------------
  const active = tracks.find((rt) => !rt.removeAt);
  if (active && active.id === id) return; // already playing — no-op
  for (const rt of tracks) if (!rt.removeAt) fadeOut(rt, 0.6); // crossfade out the old
  const chain = buildChain(ctx, musicBus, TRACKS[id]);
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
  jingleId = null; // a real track taking over ends any lingering jingle-state
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
  mp3StopTrack(0.4); // also stop any produced track
  current = null;
  playing = false;
  pendingId = null;
}

export function setMusicLayer(name, on) {
  for (const rt of tracks) if (!rt.removeAt) rt.layers[name] = !!on;
}

// One-shot jingles — bounded note sequences scheduled once on the music bus (no
// looping, no per-frame nodes). `jingle_clear` stops the level track first and
// reports as `current` for ~3s; `jingle_unlock` layers over the hub track.
export function playJingle(id) {
  const ctx = getCtx();
  const bus = getMusicBus();
  if (!ctx || !bus) return;
  const t0 = ctx.currentTime + 0.04;
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(bus);
  const soft = ctx.createBiquadFilter();
  soft.type = "lowpass";
  soft.frequency.value = 3600;
  soft.Q.value = 0.5;
  soft.connect(out);
  const note = (m, at, dur, type, vol) => schedOsc(ctx, soft, m, at, dur, type, vol, 0, null);
  const chord = (arr, at, dur, vol) => arr.forEach((m) => schedPad(ctx, soft, m, at, dur, vol));

  if (id === "jingle_clear") {
    stopMusic();
    jingleId = "jingle_clear";
    // ~3s triumphant IV -> V -> I cadence in C major, then silence
    chord([53, 57, 60, 65], t0, 0.5, 0.03); // F
    chord([55, 59, 62, 67], t0 + 0.5, 0.5, 0.03); // G
    chord([60, 64, 67, 72], t0 + 1.0, 1.7, 0.035); // C (held)
    [67, 72, 76, 79, 84].forEach((m, i) => note(m, t0 + 0.3 + i * 0.14, 0.24, "triangle", 0.05));
    schedKick(ctx, out, t0, 0.08);
    schedKick(ctx, out, t0 + 0.5, 0.08);
    schedKick(ctx, out, t0 + 1.0, 0.1);
    setTimeout(() => {
      if (jingleId === "jingle_clear") jingleId = null;
      try {
        out.disconnect();
        soft.disconnect();
      } catch (e) {
        /* already gone */
      }
    }, 3400);
  } else if (id === "jingle_unlock") {
    // ~1.5s rising fanfare, layered OVER whatever is playing (hub) — no stop
    [57, 60, 64, 69].forEach((m, i) => note(m, t0 + i * 0.16, 0.32, "triangle", 0.045));
    chord([60, 64, 69], t0 + 0.7, 0.8, 0.03);
    note(72, t0 + 0.72, 0.9, "triangle", 0.05);
    schedNoiseHit(ctx, out, t0 + 0.7, 0.12, 6000, 0.02);
    setTimeout(() => {
      try {
        out.disconnect();
        soft.disconnect();
      } catch (e) {
        /* already gone */
      }
    }, 2200);
  }
}

// Test/state surface -> window.__BB.audio.music
export const musicState = {
  get current() {
    return jingleId || current;
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
  // true while the active track's `tension` layer is on (default), false once
  // setMusicLayer("tension", false) has fired (1-3 crane defeat).
  get tension() {
    const rt = tracks.find((r) => !r.removeAt);
    return rt ? rt.layers.tension !== false : null;
  },
  // "mp3" while a produced track is playing, else "synth" (the default engine).
  get source() {
    return mp3State().playing ? "mp3" : "synth";
  },
};
