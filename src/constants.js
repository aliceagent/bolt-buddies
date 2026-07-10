export const TILE = 48;

// --- Typography -------------------------------------------------------------
// Single source of truth for the game's font. Every scene imports this instead
// of redeclaring a local `const FONT`.
export const FONT = "'Courier New', monospace";

// Size tokens (px strings, ready to drop straight into a Phaser text style).
// One coherent scale swept across every `add.text` call so sibling UI shares a
// rhythm. Roadmap named h1/h2/body/small; the extra rungs cover the real spread
// (title screen hero down to fine-print captions) without near-duplicate sizes.
export const FS = {
  hero: "84px",   // TitleScene wordmark
  h1: "52px",     // full-screen scene title (Settings)
  h2: "44px",     // overlay headline (Pause, level-clear)
  h3: "34px",     // hub header
  title: "26px",  // section / menu / intro-banner titles
  head: "22px",   // sub-heads, settings rows
  lead: "20px",   // node labels, continue prompts
  large: "18px",  // emphasised body (KOBI blip, panel qmark)
  body: "15px",   // default body — the workhorse
  small: "14px",  // secondary body
  mini: "13px",   // captions, hint rows
  tiny: "11px",   // fine print
};

// Recurring text colours (css strings for Phaser text `color`). Only hues used
// in three or more places live here; genuine one-offs stay inline at the call.
export const TEXT = {
  bright: "#eaf2ff", // brightest headings
  body: "#c6d2f2",   // light body copy
  dim: "#8fa3d9",     // muted subtext
  faint: "#5a6a94",   // faint hint rows
  good: "#59ff9c",    // green confirm accent
  neon: "#35f0ff",    // cyan accent
  warn: "#ff9daa",    // soft-red warning
};

export const COLORS = {
  bg: 0x070b14,
  panel: 0x18213a,
  panelEdge: 0x2b3a63,
  neon: 0x35f0ff,
  magenta: 0xff4dd2,
  amber: 0xffb347,
  hazard: 0xff5566,
  beep: 0x4dc9ff,
  boop: 0xffa14d,
  green: 0x59ff9c,
  steel: 0x1c2742,
  steelEdge: 0x2f4066,
  steelHi: 0x30436e, // lighter top-left bevel on tiles
  steelLo: 0x121a30, // darker bottom-right bevel on tiles
  dark: 0x0b101f,
  hudBg: 0x0a0f1e, // shared translucent backing for HUD plates, cards & intro banners
};

// Per-world background & mood palette (keyed by `def.world`, 1-4). Used to theme
// the layered background: `bgTop`/`bgBottom` drive the fixed gradient, `glow`
// tints the scattered soft-glow blobs, `accent`/`accent2` colour the near grid
// and dust motes. Worlds 3-4 are picked tastefully now so later sprints inherit.
export const WORLD_THEMES = {
  1: { accent: 0xffb347, accent2: 0x35f0ff, bgTop: 0x1e4380, bgBottom: 0x060a14, glow: 0x3f7fe8 },
  2: { accent: 0xc39dff, accent2: 0x59ffb0, bgTop: 0x0f5242, bgBottom: 0x04100c, glow: 0x2fc29a },
  3: { accent: 0xffd24d, accent2: 0xff4dd2, bgTop: 0x431e5e, bgBottom: 0x0c0614, glow: 0xc45cff },
  4: { accent: 0x35f0ff, accent2: 0xff5566, bgTop: 0x1a2560, bgBottom: 0x03050e, glow: 0x3558e8 },
};

// --- P11: FX particle palette ----------------------------------------------
// One coherent colour system for EVERY emitter, grouped by physical family so
// the game's particles read as a single visual vocabulary instead of the old
// arbitrary white/blue/purple/green mix:
//   impact      — physical hits (stomp, boom, debris): world accent + white core
//   electric    — hazards / energy arcs: hot red-pink ember with a pale core
//   steam       — steam & moving air (vents, drips, fans, run-dust, smoke, respawn): cyan-white
//   celebration — rewards (core collect, checkpoint, pedestal, lever, clear): gold
// `budget` is the shared alive-particle cap the GameScene budget guard enforces
// so a chaotic burst can never flood the software-Canvas renderer.
export const PARTICLES = {
  budget: 120,
  impact: { core: 0xffffff, accent: 0xffd9a0, debris: 0xc7d0e6 },
  electric: { core: 0xffe0e6, glow: 0xff5566 },
  steam: { core: 0xeef4ff, body: 0xcdd8ff, dust: 0xc2ccdf, smoke: 0x9aa6c0 },
  celebration: { core: 0xfff6c2, body: 0xffe066, spark: 0xffd94d },
};

export const PHYS = {
  grav: 1400,
  speed: 250,
  heavySpeed: 205,
  jump: 620,
  heavyJump: 565,
  maxFall: 900,
  beltPush: 110,
  throwX: 470,
  heavyThrowX: 560,
  throwY: 400,
  heavyThrowY: 460,
  tossY: 820,
  grappleRange: 380, // FL-007: 360 left range margins thinner than a robot body at 1-2's far reel
  zipSpeed: 760,
  reelSpeed: 640,
  // --- W3W4 M3: World-3 mechanics tuning ----------------------------------
  // All read ONLY by the W3 code paths (magnet/bubble skills + W3 ents), which
  // are inert unless a W3 level actually spawns them — shipped levels untouched.
  magGrabRange: 150,   // magnet ACTION latch reach to a metal crate (px)
  magYankRange: 210,   // magnet ACTION teeth-yank reach to a junk-chomper (px)
  magSwitchRange: 320, // magnet ACTION remote flip reach to a magnetic switch (px)
  magDragMax: 300,     // drag-latch auto-release distance ("rope-ish range", px)
  magDragSpeed: 260,   // crate follow speed cap while latched (px/s)
  clingSpeed: 150,     // rail-cling traverse speed (px/s)
  bubbleMs: 6000,      // self/buddy bubble duration (ms)
  bubbleCd: 2200,      // re-bubble cooldown after a pop (ms)
  waterAirMs: 6000,    // un-bubbled underwater air supply before drowning (ms)
  waterSink: 55,       // slow-sink terminal velocity for a normal robot (px/s)
  swimSpeed: 170,      // bubbled free-swim speed underwater (px/s)
};

export const DEPTH = {
  bg: 0,
  terrain: 5,
  light: 7, // P8: ambient light pools — over terrain/decals, under shadow/entities
  shadow: 8, // P6: robot shadow blob — over terrain, under entities/players
  entity: 10,
  pickup: 12,
  player: 20,
  badge: 21,
  reticle: 24,
  rope: 25,
  fx: 30,
};

export const SKILL_INFO = {
  grapple: {
    name: "GRAPPLING HOOK",
    color: 0x35f0ff,
    card: "Zip across gaps and yank far-away\nthings — including your buddy!",
    hint: "ACTION: zip to rings & pull levers.\nUP+ACTION: zip straight up!\nDOWN+ACTION: rope your buddy!",
  },
  heavy: {
    name: "HEAVYWEIGHT",
    color: 0xffb347,
    card: "Big, strong, and VERY heavy.\nSmash, stomp, and stand your ground.",
    hint: "Jump + ACTION to STOMP. Cracks\nfloors, squishes bugs, holds plates.",
  },
  phase: {
    name: "PHASE-WALK",
    color: 0xc39dff,
    card: "Walk straight through shimmering\nwalls like a ghost!",
    hint: "Walk into shimmer-walls to pass.\nStand close to escort your buddy through!",
  },
  tiny: {
    name: "TINY",
    color: 0x9dffc4,
    card: "Small, quick, and squeezable — fit\nwhere no robot has fit before!",
    hint: "Crawl through vents and under enemy\neyes. You fly FAR when thrown!",
  },
  // --- W3W4 M3: World-3 skill pair (GAME_DESIGN §4 card copy, kid voice) ----
  magnet: {
    name: "MAGNET GLOVE",
    color: 0xff9e3d,
    card: "Pull metal things to you — or pull\nyourself to metal things!",
    hint: "ACTION: grab crates, cling to steel\nrails, flip magnet switches.\nDOWN+ACTION: reel your buddy!",
  },
  bubble: {
    name: "BUBBLE SHIELD",
    color: 0x7ee0ff,
    card: "Blow a big safe bubble around you —\nor around your buddy!",
    hint: "ACTION: bubble up! Float on vents,\nroll over sparks, swim free.\nDOWN+ACTION: bubble your BUDDY!",
  },
};
