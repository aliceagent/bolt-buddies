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
  // --- GFX2 "Lumen Lab" palette expansion (additive; nothing renamed) --------
  // Richer per-world supporting hues used by the new art recipes. Warm, kid-warm
  // tones — NOT psychedelic. See WORLD_THEMES.accent3/warmth for how they map.
  coral: 0xff7a5c, // W1 warm rim-light / coral accents
  brass: 0xc9a24b, // W2 pipe & fixture brass
  plum: 0x8b4a9c, // W3 deep magnet-works plum
  mint: 0x8affc9, // W2/character cool mint rim-light
  indigo: 0x3a3f8f, // W4 night indigo
  glassHi: 0xdbe6ff, // cool near-white glass top-edge highlight (panels/specular)
};

// Per-world background & mood palette (keyed by `def.world`, 1-4). Used to theme
// the layered background: `bgTop`/`bgBottom` drive the fixed gradient, `glow`
// tints the scattered soft-glow blobs, `accent`/`accent2` colour the near grid
// and dust motes. Worlds 3-4 are picked tastefully now so later sprints inherit.
//
// GFX2 "Lumen Lab": bgTop/bgBottom/glow enriched toward each world's mood (W1
// warm sunrise-amber, W2 teal/steam, W3 plum/violet-gold, W4 indigo-night) — the
// bgGradient<world> textures re-bake from these at boot (BootScene gradient()),
// so recolouring here recolours the backdrops for free. Two ADDITIVE fields feed
// the new art only: `accent3` (a third supporting hue) and `warmth` (a warm key
// light for rim/specular). Existing keys keep their meaning; nothing renamed.
// GFX3 G1: `fade` is each world's scene-transition colour — its `bgBottom`
// pulled ~25% toward `accent` (dark and moody, never bright). GameScene entry/
// level-bound fades and the Hub→level fade tint to it; hub-bound + Title/Onboard
// fades stay FADE_NAVY. Durations at those call sites are unchanged (R6).
export const WORLD_THEMES = {
  1: { accent: 0xffb347, accent2: 0x35f0ff, accent3: 0xff7a5c, warmth: 0xffcf8f, bgTop: 0x7a3f52, bgBottom: 0x0b0710, glow: 0xf08a55, fade: 0x48321e },
  2: { accent: 0xc39dff, accent2: 0x59ffb0, accent3: 0xc9a24b, warmth: 0x8fe8d0, bgTop: 0x0f5a52, bgBottom: 0x03100e, glow: 0x2fc2a8, fade: 0x33334a },
  3: { accent: 0xffd24d, accent2: 0xff4dd2, accent3: 0x8b4a9c, warmth: 0xffcf6b, bgTop: 0x4a1e6e, bgBottom: 0x0c0616, glow: 0xcf5cff, fade: 0x493924 },
  // W3W4 M4: World 4 committed to its designed identity — near-black datacenter/
  // void, DEEP VIOLET-BLACK (the darkest world), thin neon seams (cyan accent2)
  // over a violet accent. Only backdrop/mood consumers read these.
  4: { accent: 0x8f7bff, accent2: 0x35f0ff, accent3: 0x3a3f8f, warmth: 0xffd9a0, bgTop: 0x1a1450, bgBottom: 0x020208, glow: 0x5b3fd8, fade: 0x252046 },
};

// Neutral navy scene-fade [r, g, b] — the pre-GFX3 hardcoded value, now the ONE
// named source for every fade that must NOT take a world tint (hub-bound exit,
// Hub/Title/Onboard entry).
export const FADE_NAVY = [4, 6, 20];

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
  // --- W3W4 M4: World-4 mechanics tuning -----------------------------------
  // All read ONLY by the W4 code paths (freeze/beam skills + W4 ents), which
  // are inert unless a W4 level actually spawns them — shipped levels untouched.
  freezeMs: 5000,      // TIME-FREEZE world-hold duration (GAME_DESIGN: "5 seconds")
  freezeCdMs: 8000,    // freeze re-cast cooldown (badge cooldown ring)
  beamBattMs: 6000,    // LIGHT-BEAM battery: ms of light while held
  beamRegen: 0.5,      // recharge rate factor (drains 1x, recharges ~2x slower)
  beamMinMs: 600,      // minimum charge before the beam can re-ignite (no flicker)
  beamRange: 310,      // light-cone reach (px)
  beamHalf: 0.42,      // light-cone half-angle (rad, ~24 deg)
  ghostGlowMs: 1500,   // invisible-platform afterglow after the beam leaves (ms)
  iceMeltMs: 2200,     // beam exposure needed to melt an ice door (ms)
  glowRadius: 120,     // a robot's own glow radius inside dark zones (px, kid-fair)
  // --- W3W4 L43: KOBI-heart finale tuning -----------------------------------
  // Read ONLY by the 4-3 boss paths (the `kobiheart`/`turbine` ents), which no
  // other level spawns — shipped levels untouched.
  heartBlindMs: 2600,  // sustained beam-on-eye needed to expose a cooling core
  heartDrain: 0.35,    // dazzle decay rate while unlit (fraction of accrual — a
                       //  paused blind loses ground slowly, never resets)
  heartReelMs: 4000,   // eye reel (no attacks) after a core exposes — the
                       //  guaranteed head start for the freeze + run
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
  // GFX3 G4: near-camera foreground occlusion silhouettes. ABOVE player/entity
  // (so they pass in front of the buddies for a depth read) but BELOW the fx
  // particle band and every fx+N screen-fixed pseudo-HUD (coach bubbles, hints,
  // intro banner) and the separate UIScene blip bar — never occlude UI/blips.
  foreground: 26,
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
  // --- W3W4 M4: World-4 skill pair (GAME_DESIGN §4 card copy, kid voice) ----
  freeze: {
    name: "TIME-FREEZE",
    color: 0x9fd8ff,
    card: "Stop the world for 5 seconds.\nPlatforms, lasers, enemies — frozen!",
    hint: "ACTION: FREEZE the world 5s!\nFrozen platforms are stepping stones.\nWatch the badge ring recharge.",
  },
  beam: {
    name: "LIGHT-BEAM",
    color: 0xffe08a,
    card: "A mighty flashlight! Light the dark,\nmelt the ice, dazzle the baddies.",
    hint: "HOLD ACTION: shine the light cone.\nUP+ACTION aims up. Mind the battery!\nDOWN+ACTION: reel your buddy!",
  },
};
