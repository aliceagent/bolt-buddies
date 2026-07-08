import Phaser from "phaser";
import { TILE, COLORS, PHYS, DEPTH, SKILL_INFO, WORLD_THEMES, FONT, FS, TEXT, PARTICLES } from "../constants.js";
import { LEVELS } from "../levels/registry.js";
import { makeGrid } from "../levels/builder.js";
import { completeLevel, loadSave } from "../save.js";
import { initAudio, sfx, installMute, playTrack, setMusicLayer, playJingle, trackForLevel, setListener, clearListener, proximity, setLoop, stopLoops, pauseDuck, setSadMusic } from "../audio.js";
import { addGradient, addMotes, addPropStrip, addFogBand, addDrips, addDustShafts, addVignette } from "../backdrop.js";
import Player from "../objects/Player.js";
import { uxHints, uxShakeScale, uxFlashScale, saveRecord, fmtTime, markTutorialDone } from "../ux.js";
import { pads, showPadToast } from "../pad.js";
import { drawWorldIcon } from "../worldIcons.js";
import { AnimSystem } from "../anim/index.js";
import { MOTION } from "../anim/motion.js";
import { ProgressWatchdog } from "../softlock/watchdog.js";
import { SoftlockDetectors } from "../softlock/detectors.js";

const J = Phaser.Input.Keyboard.JustDown;

// U1 coach: the throw hint fires only on the FIRST buddy pickup of a play
// session. Module-scoped so it survives level changes but resets on reload —
// a play session, never persisted to storage (per U1 spec).
let throwHintShownSession = false;

// U9 (F16/F17): KOBI reactive DIALOGUE. Small pools of kid-friendly, kind-funny
// KOBI lines (bureaucratic, huffy, secretly rooting for the robots) fired on
// gameplay moments — a death streak on a checkpoint segment, or finishing with
// all cores. They are DISPLAY-ONLY: each flows through the SAME bb:blip queue as
// every other blip, so a reactive line arriving mid-blip simply QUEUES behind the
// active one (never interrupts, never touches physics/timing/finishLevel). No new
// UI. Every line is NO-REPEAT within a browser session via the module-level Set
// below (in-memory only; resets on page reload — no persistence, by spec).
const U9_STREAK_LINES = [
  "KOBI: I have seen TOASTERS do better. The toasters also exploded. You're FINE.",
  "KOBI: That is a LOT of respawns. Statistically you should be scrap. And yet — keep GOING.",
  "KOBI: Three tries. I am NOT counting. I am DEFINITELY not counting. ...Try the jump SOONER.",
  "KOBI: The scrap pile is getting HOPEFUL about you. Prove it WRONG. Please.",
];
const U9_ALLCORES_LINES = [
  "KOBI: ALL three cores?! Those were MY cores. ...Fine. You EARNED the paperwork.",
  "KOBI: Every core, gone. I should be FURIOUS. I am, regrettably, a little IMPRESSED.",
  "KOBI: A CLEAN sweep, you greedy little machines. ...I respect it. OFFICIALLY off the record.",
];
const u9SessionUsed = new Set(); // no-repeat within this browser session (memory only)

// Pick a still-unused line from a pool and mark it used. Returns null once the
// pool is exhausted this session — the caller then DROPS the line (garnish rule:
// dialogue is never allowed to repeat, and never blocks). Fires on rare user
// events, not per frame, so the small filter allocation is fine.
function u9Pick(pool) {
  const avail = pool.filter((l) => !u9SessionUsed.has(l));
  if (!avail.length) return null;
  const line = avail[(Math.random() * avail.length) | 0];
  u9SessionUsed.add(line);
  return line;
}

// P4: deterministic wear placement. A seeded PRNG (mulberry32) keyed off the
// level-id STRING via an FNV-1a hash — so every load lays out grime decals and
// drip stains identically, and NO Math.random is called at module/boot load.
// (Runtime-only ambient FX — shimmer sparkles, hazard arcs — may use Math.random;
// they carry no gameplay meaning and never affect layout.)
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("Game");
  }

  init(data) {
    this.levelIndex = data.levelIndex ?? 0;
    // U10 (F6): the first-run interstitial launches the tutorial with this flag
    // so its clear overlay returns to the HUB (not Title). Menu-launched
    // tutorials leave it false and keep returning to Title.
    this.returnToHub = !!(data && data.returnToHub);
  }

  create() {
    const def = LEVELS[this.levelIndex];
    this.def = def;
    const gb = makeGrid(def.cols, def.rows);
    def.build(gb);
    this.grid = gb.g;
    this.worldW = def.cols * TILE;
    this.worldH = def.rows * TILE;
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);

    this.buildBackground();

    // level state
    this.solidObjs = [];
    this.beltSprites = [];
    this.hazardZones = [];
    this.anchors = [];
    this.levers = [];
    this.plates = [];
    this.doors = [];
    this.bridges = [];
    this.conduits = []; // P5: lever/plate → device wiring overlays
    this.lifts = [];
    this.crushers = [];
    this.pedestals = [];
    // P8: ambient light pools (static images, ≤40/level). Flicker via 2-3 SHARED
    // tweens (hazard buckets), never per-pool timers. NOTE: buildBackground() runs
    // EARLIER in create() and sets `_webglTier`/`_poolDim`/`_poolScale`/`_noLights`
    // before any pool is built — so those are NOT (re)initialised here (doing so
    // would clobber the per-world dim). These two collections are reset every
    // create() and consumed later by buildTerrain()/spawnEntity().
    this.lightPools = [];
    this._flickBuckets = [[], [], []];
    this.coreItems = [];
    this.keyItems = [];
    this.checkpoints = [];
    this.triggers = []; // Sprint 10: one-shot AABB zones (blip and/or key-glyph reveal)
    this.pods = [];
    this.ropeFlashes = [];
    this.crane = null;
    this.craneDefeated = false;
    this.opened = new Set();
    this.keysHeld = 0;
    this.coresGot = [false, false, false];
    this.coreIdx = 0;
    this.complete = false;
    this.leaving = false; // guards ESC/R fades so input during a fade can't double-trigger

    // U8 (F15): per-run counters — DISPLAY-ONLY, passive observers of play. They
    // never touch physics or logic. `_elapsedMs` accumulates active (un-paused,
    // pre-complete) frame time from create() — control begins immediately (the
    // intro banner never blocks input). `_deaths` counts respawns (bumped in
    // killPlayer). Reset here so R/restart and every fresh entry start at zero.
    this._elapsedMs = 0;
    this._deaths = 0;

    // U9 (F16): per-checkpoint-SEGMENT death tracking for KOBI's reactive
    // death-streak line. `_segDeaths` counts respawns (EITHER player) since the
    // last checkpoint change / level entry; `_segStreakFired` rate-limits the
    // streak line to at most ONCE per segment. Both reset on every new checkpoint
    // activation (and here, on fresh entry / restart). The `_u9*` fields are
    // passive observability for the acceptance probe — display-only, never read
    // by gameplay.
    this._segDeaths = 0;
    this._segStreakFired = false;
    this._u9StreakCount = 0;   // total streak lines fired this scene
    this._u9LastStreak = null; // last streak line fired (cross-segment variety)
    this._u9AllCores = null;   // all-cores respect line fired at finishLevel

    this.crackies = this.physics.add.staticGroup();
    this.bridgeGroup = this.physics.add.staticGroup();
    this.doorGroup = this.physics.add.staticGroup();
    this.phaseWalls = this.physics.add.staticGroup();
    this.ducts = this.physics.add.staticGroup();
    this.bugs = this.physics.add.group();
    this.rollers = [];
    this.wardens = [];
    this.jets = [];
    this.fans = [];
    this.ventLamps = []; // U5 (F11): passive all-clear lamps — NEVER joined to this.jets
    this._allClearFired = false; // one-shot guard for the 2-2 all-clear puff + blip
    this.phaseFlows = []; // drifting inner-pattern overlays for phase-walls
    this.phaseFlow = 0; // single shared scroll counter (no per-frame alloc)
    // P4: shimmer-curtain sparkle + hazard arc-spark sources (filled in
    // buildTerrain). Their pooled emitters are WebGL-only (additive full-viewport
    // work is disproportionately costly on the software Canvas renderer the beat
    // harness runs; the drawn curtain/hazard textures carry the meaning on Canvas).
    this.shimmerPts = []; // world-centres of every phase-wall tile
    this.hazardStrips = []; // {x1,x2,y} top edge of each contiguous hazard run
    // NULL every restart: Phaser reuses the scene instance, so a stale emitter ref
    // from a prior level would keep the update hook firing against empty sources.
    this.shimmerSparks = null;
    this.hazardSparks = null;
    this._shimCd = 0;
    this._hazCd = 0;

    this.buildTerrain();
    this.scatterDecals();

    // players + input
    this.players = def.spawns.map(([tx, ty], i) => {
      const p = new Player(this, tx * TILE + 24, ty * TILE + 24, i);
      p.setCollideWorldBounds(true);
      return p;
    });
    const kb = this.input.keyboard;
    this.players[0].keys = kb.addKeys({ left: "A", right: "D", jump: "W", act: "SPACE", down: "S" });
    this.players[0].keys.actAlt = kb.addKey("E"); // silent fallback: E still works, SPACE is what we teach
    this.players[1].keys = kb.addKeys({ left: "LEFT", right: "RIGHT", jump: "UP", act: "L", down: "DOWN" });
    // U7 (F13): hand each player its synthesized gamepad virtual keys (pad1->P1,
    // pad2->P2). A stable object ref that src/pad.js mutates in place each poll —
    // Player.js + the read sites below OR `.isDown`/edge flags into the keyboard
    // reads, so with no pad connected everything is byte-identical.
    this.players[0].pad = pads.p(0);
    this.players[1].pad = pads.p(1);
    this.escKey = kb.addKey("ESC");
    this.rKey = kb.addKey("R");
    this.pKey = kb.addKey("P"); // S4: in-game pause overlay
    this.paused = false;
    this.cpPos = def.spawns.map(([tx, ty]) => ({ x: tx * TILE + 24, y: ty * TILE + 24 }));

    def.entities.forEach((e) => this.spawnEntity(e));
    // P5: trace lever/plate → device wiring now that every entity exists.
    this.buildConduits();

    // Sprint 10: static key-glyph clusters declared in the level def (tutorial).
    (def.glyphs || []).forEach((gz) => this.addGlyphs(gz.x * TILE + 24, gz.y * TILE + 24, gz.caps));

    // ANIM A1: the character animation micro-rig. Binds every player + enemy to a
    // pose machine + shared fidget scheduler now that the whole cast exists. A1 is
    // INVISIBLE — it registers ZERO visible parts and plays no fidget, so this
    // adds no on-screen change and (when idle) ~0 fps; A2+ hang the real art here.
    this.anim = new AnimSystem(this);
    this.anim.registerLevel();

    // SL2: the PASSIVE progress watchdog (general stall safety net). A pure
    // read-only observer — it computes a cheap progress metric from state that
    // GameScene already resolves each frame and raises `this.stuckTier` (0/1/2)
    // after escalating windows with no progress while both robots are idle/alive.
    // It renders nothing (SL4) and changes NO physics/logic/timing/input. Driven
    // LAST in update(), after anim. Reset here (fresh entry / R-restart re-runs
    // create()) and on every new checkpoint segment.
    this.stuckTier = 0;
    this.watchdog = new ProgressWatchdog(this);
    this.watchdog.reset();

    // SL3: the PASSIVE explicit-softlock detectors — precise per-softlock
    // predicates that recognize a confirmed HARD SOFTLOCK the instant it forms and
    // raise the firm signal immediately (no 25-50s wait), reusing SL2's stuckTier
    // path + a structured `this.softlock` descriptor SL4 consumes. Read-only,
    // zero per-frame alloc, changes NO physics/logic/timing/input. Driven right
    // AFTER the watchdog in update() so a confirmed lock supersedes the live tier.
    // Only ONE detector is active (1-2 core0 severed-tunnel trap — SL1's sole hard
    // softlock); every RECOVERABLE situation is left to the watchdog's general net.
    this.softlock = null;
    this.detectors = new SoftlockDetectors(this);
    this.detectors.reset();

    // physics wiring
    const rideCb = (pl, mv) => {
      if (pl.body.touching.down && mv.body.touching.up) pl.standingOn = mv;
    };
    this.physics.add.collider(this.players, this.solidObjs);
    this.physics.add.collider(this.players, this.crackies);
    this.physics.add.collider(this.players, this.bridgeGroup);
    this.physics.add.collider(this.players, this.doorGroup);
    this.physics.add.collider(this.players, this.ducts);
    // phase-walls: the phase-walker ghosts through; a buddy within hand-holding
    // range gets escorted through too
    this.physics.add.collider(this.players, this.phaseWalls, null, (pl, wall) => {
      if (pl.skill === "phase") return false;
      const q = pl.partner;
      if (q && !q.dead && q.skill === "phase" && Math.hypot(q.x - pl.x, q.y - pl.y) < 78) return false;
      return true;
    });
    if (this.lifts.length) this.physics.add.collider(this.players, this.lifts.map((l) => l.img), rideCb);
    this.physics.add.collider(this.bugs, this.solidObjs);
    this.physics.add.collider(this.bugs, this.crackies);
    this.physics.add.collider(this.bugs, this.doorGroup);
    if (this.crushers.length) this.physics.add.collider(this.crushers.map((c) => c.img), this.solidObjs);

    // camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.worldW, this.worldH);
    // camera background colour is the world's bgBottom, set in buildBackground()
    this.camPos = { x: this.players[0].x, y: this.players[0].y, zoom: 1 };
    // 250ms fade-in on every entry (unifies title/hub/game transitions). Visual
    // only — never blocks input, so the beat runner + suites drive immediately.
    cam.fadeIn(250, 4, 6, 20);

    this.rope = this.add.graphics().setDepth(DEPTH.rope);
    // U6 — throw-arc + rope-tether preview overlay. One shared Graphics on the
    // rope's clear+redraw discipline; purely a read-only visual over physics.
    this.hintGfx = this.add.graphics().setDepth(DEPTH.rope - 1);
    this._arcPts = []; // reused sample buffer for the ballistic preview (no per-frame alloc)
    this.beamGfx = this.add.graphics().setDepth(DEPTH.fx - 1);
    this.wardens.forEach((w) => this.physics.add.collider(this.players, w.img));
    this.reticles = this.players.map(() => this.add.image(0, 0, "reticle").setDepth(DEPTH.reticle).setVisible(false));

    // floating "SPACE = ACTION" / "L = ACTION" key hints above each robot until
    // that player first presses their action key — the button was unclear
    this.actionHints = this.players.map((p) => {
      const color = p.idx === 0 ? COLORS.beep : COLORS.boop;
      const hw = p.idx === 0 ? 74 : 56; // half-width: P1's label is longer
      const g = this.add.graphics();
      g.fillStyle(COLORS.hudBg, 0.92).fillRoundedRect(-hw, -15, hw * 2, 30, 8);
      g.lineStyle(2, color).strokeRoundedRect(-hw, -15, hw * 2, 30, 8);
      const t = this.add.text(0, 0, p.idx === 0 ? "SPACE = ACTION" : "L = ACTION", {
        fontFamily: FONT, fontSize: FS.body, fontStyle: "bold",
        color: p.idx === 0 ? "#4dc9ff" : "#ffa14d",
      }).setOrigin(0.5);
      return this.add.container(p.x, p.y - 64 - p.idx * 34, [g, t]).setDepth(DEPTH.fx);
    });

    // U1 — contextual "coach" bubbles (pooled). The tutorial teaches every
    // chord explicitly, so it opts out of the U1 *triggers* — but the pool is
    // built regardless because U2's lock/timer feedback (bump bubbles) reuses it,
    // and the tutorial's plate/door stations benefit from that feedback.
    this.coach = null;
    this.buildCoach();
    this.coachU1 = !def.tutorial; // gate the U1 rope/up-zip/throw/re-show triggers
    // U2 — lock & timer feedback set-up (rings for timed doors, plate pips).
    this.buildLockFeedback();
    // U3 — press-again-to-confirm toast for the destructive R/ESC keys (pooled,
    // screen-fixed, canvas-safe). Built for every level; only armed on real
    // chambers (the tutorial keeps single-press — see update()).
    this.buildConfirm();
    // SL4 — the pooled "Stuck?" escalating recovery prompt (tier-1 gentle nudge /
    // tier-2 firm R×2 restart offer). Built once here; update() only toggles it on
    // a TIER CHANGE. It consumes SL2's this.stuckTier + SL3's this.softlock and
    // ONLY offers the existing R×2 restart / ESC×2 map — never blocks input.
    this.buildStuckPrompt();

    // P11: impact family — white core (world accent is carried by the paired
    // dust/ring tints). Swept onto the PARTICLES palette map.
    this.boom = this.add.particles(0, 0, "px", {
      speed: { min: 60, max: 260 }, scale: { start: 1, end: 0 }, lifespan: 450,
      gravityY: 600, tint: PARTICLES.impact.core, emitting: false,
    }).setDepth(DEPTH.fx);

    // pooled spark burst: lever flips, checkpoint activations & reel-pull flicks
    // (P11 celebration/mechanical family — gold friction sparks)
    this.sparks = this.add.particles(0, 0, "px", {
      speed: { min: 120, max: 320 }, scale: { start: 0.7, end: 0 },
      lifespan: 360, gravityY: 420, tint: PARTICLES.celebration.spark,
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(DEPTH.fx);

    // pooled run-dust: soft low puffs kicked up at the feet while running
    // (P11 steam/air family — desaturated cyan-white)
    this.dust = this.add.particles(0, 0, "px", {
      speed: { min: 20, max: 70 }, angle: { min: 200, max: 340 },
      scale: { start: 0.5, end: 0 }, alpha: { start: 0.5, end: 0 },
      lifespan: 380, gravityY: -30, tint: PARTICLES.steam.dust, emitting: false,
    }).setDepth(DEPTH.fx - 2);

    // pooled purple shell-shards flung when a scuttlebug is squished (pre-coloured
    // "shard" texture — particle tint is unreliable under the Canvas renderer)
    this.shards = this.add.particles(0, 0, "shard", {
      speed: { min: 90, max: 260 }, angle: { min: 200, max: 340 },
      scale: { start: 1, end: 0.2 }, rotate: { start: 0, end: 360 },
      lifespan: 520, gravityY: 620, emitting: false,
    }).setDepth(DEPTH.fx);

    // P7: pooled squish-splat decals — a recycled ring of ground decals stamped
    // where a scuttlebug is squished, fading out over ~2s via a per-decal alpha
    // tween (event-driven, no per-frame allocation). Sits just over the terrain.
    this._splatHead = 0;
    this.splatPool = [];
    for (let i = 0; i < 6; i++) {
      this.splatPool.push(this.add.image(0, 0, "bug_splat")
        .setDepth(DEPTH.entity - 1).setVisible(false));
    }

    // pooled crane smoke puffs on defeat (grey, drifts up)
    this.craneSmoke = this.add.particles(0, 0, "px", {
      speed: { min: 30, max: 90 }, angle: { min: 250, max: 290 },
      scale: { start: 2.4, end: 0 }, alpha: { start: 0.5, end: 0 },
      lifespan: { min: 700, max: 1300 }, gravityY: -40, tint: PARTICLES.steam.smoke,
      emitting: false,
    }).setDepth(DEPTH.fx);

    // pooled star sprites, recycled for warden shove-impacts and the ring of
    // dizzy-stars circling a toppled warden (no per-event image allocation)
    this._starHead = 0;
    this.starPool = [];
    for (let i = 0; i < 10; i++) {
      this.starPool.push(this.add.image(0, 0, "star").setDepth(DEPTH.fx).setVisible(false));
    }
    // single reusable shockwave ring for the crane slam impact
    this.slamRing = this.add.image(0, 0, "shockring").setDepth(DEPTH.fx - 1)
      .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);

    // P6: phase-walk afterimages are now 3 position-lagged ghost copies per phase
    // robot, driven from a per-Player pose ring buffer (see Player ctor + the
    // phase block in update). No shared pool needed here.

    // --- Sprint 8 game-feel FX pools (all created here, never per frame) ------
    // additive zoom offset consumed + decayed inside updateCamera; NEVER alters
    // camPos.zoom (world coords the beat kit + audio listener read stay exact).
    this.zoomKick = 0;
    // U11 probe observability: the amplitude the LAST camShake request resolved
    // to after the SCREEN SHAKE option scaled it (null = no shake requested yet;
    // 0 = a shake fired while the option was "off"). Passive — never read here.
    this._lastShakeAmp = null;

    // speed-line streaks flicked backward while a grappler zips
    this.zipLines = this.add.particles(0, 0, "streak", {
      speed: { min: 140, max: 300 }, scale: { start: 1, end: 0 },
      lifespan: 240, alpha: { start: 0.8, end: 0 },
      blendMode: Phaser.BlendModes.ADD, emitting: false, rotate: { min: 0, max: 360 },
    }).setDepth(DEPTH.rope - 1);

    // small hook head parked at the far end of each player's rope
    this.hooks = this.players.map(() =>
      this.add.image(0, 0, "hookhead").setDepth(DEPTH.rope + 1).setVisible(false));

    // radial star burst when a data-core is collected (pre-coloured star texture)
    this.starBurst = this.add.particles(0, 0, "star", {
      speed: { min: 90, max: 240 }, scale: { start: 1, end: 0 },
      lifespan: 480, rotate: { start: 0, end: 200 },
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(DEPTH.fx);

    // bolt/gear debris flung on death
    this.bolts = this.add.particles(0, 0, "bolt", {
      speed: { min: 80, max: 240 }, angle: { min: 200, max: 340 },
      scale: { start: 1, end: 0.4 }, rotate: { start: 0, end: 360 },
      lifespan: 620, gravityY: 700, emitting: false,
    }).setDepth(DEPTH.fx);

    // steam-jet drip droplets seeping from active nozzles
    this.jetDrips = this.add.particles(0, 0, "drip", {
      speedX: { min: -14, max: 14 }, speedY: { min: 20, max: 60 },
      scale: { start: 1, end: 0.3 }, lifespan: 520, gravityY: 500,
      alpha: { start: 0.85, end: 0 }, emitting: false,
    }).setDepth(DEPTH.fx - 1);

    // U5 (F11): pooled "all-clear" vent puff — one soft steam burst per corridor
    // jet when its valve latches them off (never emits per frame).
    this.ventPuff = this.add.particles(0, 0, "px", {
      speed: { min: 40, max: 140 }, angle: { min: 200, max: 340 },
      scale: { start: 2.4, end: 0 }, alpha: { start: 0.55, end: 0 },
      lifespan: { min: 500, max: 950 }, gravityY: -70, tint: PARTICLES.steam.body,
      emitting: false,
    }).setDepth(DEPTH.fx);

    // single reusable stomp shockwave ring (separate from the crane slamRing)
    this.stompRing = this.add.image(0, 0, "shockring").setDepth(DEPTH.fx - 1)
      .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);

    // pooled respawn beam columns + phase-cross ripple rings (2 each is plenty)
    this.respawnBeams = [];
    for (let i = 0; i < 2; i++) {
      this.respawnBeams.push(this.add.image(0, 0, "beamcol").setOrigin(0.5, 1)
        .setDepth(DEPTH.player - 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    }
    this._beamHead = 0;
    this.phaseRipples = [];
    for (let i = 0; i < 2; i++) {
      this.phaseRipples.push(this.add.image(0, 0, "ring").setDepth(DEPTH.fx)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    }
    this._rippleHead = 0;

    // --- P11 particle & motion-coherence pools (all built here, never per frame) ---
    // Shared alive-particle budget guard. Every bursty emit routes its count
    // through fxBudget(): when the summed alive count nears PARTICLES.budget the
    // request is clamped (down to 0), so a chaotic moment can't flood the
    // software-Canvas renderer and tank fps. The list is the set of pooled
    // emitters that dominate the alive count.
    this.fxPalette = PARTICLES; // probe hook: assert emitters reference the palette
    this._budgetEmitters = [
      this.boom, this.sparks, this.dust, this.shards, this.craneSmoke,
      this.zipLines, this.starBurst, this.bolts, this.jetDrips, this.ventPuff,
    ];
    // A9: the device-personality controller (built in registerLevel, before this) owns a
    // pooled crusher steam SIGH — count it against the shared ~120 alive-particle budget.
    if (this.anim && this.anim.device && this.anim.device.sigh) this._budgetEmitters.push(this.anim.device.sigh);
    // A10: the social controller owns a pooled escort HAND-HOLD spark — count it
    // against the shared ~120 alive-particle budget the same additive way.
    if (this.anim && this.anim.social && this.anim.social.escortSpark) this._budgetEmitters.push(this.anim.social.escortSpark);

    // Thrown-buddy dotted TRAIL (fades 400ms). Distinct from U6's carrying
    // preview arc: this stamps fading dots along a buddy AFTER it is thrown.
    // Ring-buffer of pre-coloured dot images (per-player texture swapped on grab).
    this._trailDots = [];
    for (let i = 0; i < 14; i++) {
      this._trailDots.push(this.add.image(0, 0, "fxdot0")
        .setDepth(DEPTH.fx - 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    }
    this._trailHead = 0;
    this._trailCd = 0; // ms until the next dot may be stamped (spacing)

    // Zip-line AFTERGLOW: the rope fades over 250ms after release instead of
    // vanishing instantly. Two fixed slots (one per player), mutated in place.
    this._zipGlow = this.players.map(() => ({ t: 0, x1: 0, y1: 0, x2: 0, y2: 0, col: 0 }));
    this._wasZipping = [false, false];

    // Respawn beam GROUND RING — pooled cyan-white floor halos (2 is plenty).
    this._groundRings = [];
    for (let i = 0; i < 2; i++) {
      this._groundRings.push(this.add.image(0, 0, "fxring").setDepth(DEPTH.shadow)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    }
    this._groundRingHead = 0;

    // Checkpoint activation VERTICAL light-sweep — pooled gold bars (2 is plenty).
    this._cpSweeps = [];
    for (let i = 0; i < 2; i++) {
      this._cpSweeps.push(this.add.image(0, 0, "cpsweep").setOrigin(0.5, 1)
        .setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    }
    this._cpSweepHead = 0;

    // reusable point buffer for the catenary rope (mutated in place, no alloc)
    this._ropePts = [];
    for (let i = 0; i <= 10; i++) this._ropePts.push(new Phaser.Geom.Point(0, 0));
    // P7: separate reusable buffer for the crane's static catenary cable
    this._cranePts = [];
    for (let i = 0; i <= 10; i++) this._cranePts.push(new Phaser.Geom.Point(0, 0));

    // M mutes from in-game too; the visible corner icon is drawn by the UI
    // overlay (unzoomed), so this scene only wires the key.
    installMute(this, { icon: false });
    // tear down ambience loops + the proximity listener when the level unloads
    this.events.once("shutdown", () => { stopLoops(); clearListener(); pauseDuck(false); setSadMusic(false); });

    // per-level music: requested in create (crossfades from the hub track). A
    // no-op if this track is already playing, so death/respawn never restart it.
    // 1-3 starts with the `tension` layer ON by default (crane alive).
    playTrack(trackForLevel(def.id));

    this.scene.launch("UI", { levelIndex: this.levelIndex });

    // __BB.scene must be available synchronously — the beat runner + suites read
    // it right after scene.start, so nothing below may gate it.
    if (typeof window !== "undefined") {
      window.__BB = window.__BB || {};
      window.__BB.scene = this;
    }

    // Level intro card slides over the top third, holds ~1.6s, slides out. KOBI's
    // start blip fires AFTER the banner leaves (was a flat 400ms delay). The banner
    // is purely visual (setScrollFactor(0), no input capture) so players can move
    // under it and the test suites never wait on it.
    this.showIntroBanner();
  }

  showIntroBanner() {
    const def = this.def;
    const W = this.scale.width;
    const theme = this.theme || WORLD_THEMES[1];
    const accent = theme.accent;
    const accentHex = "#" + accent.toString(16).padStart(6, "0");
    const bh = 88;
    const restY = 132, offY = -70;

    const c = this.add.container(W / 2, offY).setScrollFactor(0).setDepth(DEPTH.fx + 50);

    // the tutorial has no chamber number ("tut"), so show just its name; real
    // levels keep the "CHAMBER <id> — <NAME>" plate. Build the text FIRST, measure
    // it, THEN size the plate — SL7 bubble-fit: the longest name ("CHAMBER 2-1 —
    // MAINTENANCE TUNNELS" ≈ 515px) collided with the left world-emblem inside the
    // old fixed bw=560, so widen the plate to hold the head + the icon on its left
    // with clear margins (container array below keeps the plate behind the text).
    const headStr = def.tutorial ? def.name.toUpperCase() : `CHAMBER ${def.id} — ${def.name.toUpperCase()}`;
    const head = this.add.text(0, -15, headStr, {
      fontFamily: FONT, fontSize: FS.title, fontStyle: "bold", color: TEXT.bright,
    }).setOrigin(0.5);
    const pair = (def.skills || []).map((k) => (SKILL_INFO[k] ? SKILL_INFO[k].name : k.toUpperCase())).join("   +   ");
    const sub = this.add.text(0, 18, pair, {
      fontFamily: FONT, fontSize: FS.body, fontStyle: "bold", color: accentHex,
    }).setOrigin(0.5);
    // reserve ~40px of icon+gap on the LEFT of the centered head; keeping the head
    // centered means the plate half-width must clear head/2 + that reserve on BOTH
    // sides, so the emblem never sits under the first letters.
    const ICONRES = 40;
    const bw = Math.max(560, Math.ceil(head.width + ICONRES * 2 + 24), Math.ceil(sub.width + 56));

    const g = this.add.graphics();
    g.fillStyle(COLORS.hudBg, 0.94).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 14);
    g.lineStyle(3, accent, 1).strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 14);
    // accent end caps
    g.fillStyle(accent, 0.9).fillRoundedRect(-bw / 2, -bh / 2, 7, bh, { tl: 14, bl: 14, tr: 0, br: 0 });
    g.fillStyle(accent, 0.9).fillRoundedRect(bw / 2 - 7, -bh / 2, 7, bh, { tr: 14, br: 14, tl: 0, bl: 0 });
    // P9: brushed-metal sheen — faint horizontal micro-grooves + two accent bands.
    g.lineStyle(1, 0xffffff, 0.05);
    for (let by = -bh / 2 + 10; by < bh / 2 - 6; by += 5) g.lineBetween(-bw / 2 + 12, by, bw / 2 - 12, by);
    g.lineStyle(1.5, accent, 0.1);
    g.lineBetween(-bw / 2 + 12, -bh / 2 + 15, bw / 2 - 12, -bh / 2 + 15);
    g.lineBetween(-bw / 2 + 12, bh / 2 - 13, bw / 2 - 12, bh / 2 - 13);
    // P8: soft top-light gradient washing down from the banner's top edge.
    const topLight = this.add.image(0, -bh / 2 + 3, "toplight")
      .setOrigin(0.5, 0).setDisplaySize(bw - 22, bh * 0.72).setAlpha(0.14);

    // P9: the per-world emblem (shared P2 drawWorldIcon) sits just left of the
    // chamber name, clamped inside the plate so a long name can't push it out.
    const iconG = this.add.graphics();
    const ix = Math.max(-bw / 2 + 28, -head.width / 2 - 26);
    drawWorldIcon(iconG, def.world || 1, ix, -14, 34, accent);
    c.add([g, topLight, iconG, head, sub]);
    this.introBanner = c;

    this.tweens.add({
      targets: c, y: restY, duration: 240, ease: "back.out",
      onComplete: () => {
        this.time.delayedCall(1600, () => {
          this.tweens.add({
            targets: c, y: offY, duration: 240, ease: "back.in",
            onComplete: () => {
              c.destroy();
              this.introBanner = null;
              if (def.blips && def.blips.start) this.game.events.emit("bb:blip", def.blips.start);
            },
          });
        });
      },
    });
  }

  // --- background ----------------------------------------------------------
  // Layered, world-themed backdrop (all below DEPTH.terrain): fixed gradient,
  // two parallax grid layers, scattered additive glow blobs, and drifting motes.
  buildBackground() {
    const world = WORLD_THEMES[this.def.world] ? this.def.world : 1;
    const theme = WORLD_THEMES[world];
    this.theme = theme;
    const W = this.scale.width;
    const H = this.scale.height;

    // (1) fixed vertical gradient, sized 2x viewport (see backdrop.js)
    addGradient(this, world);

    // (2) far parallax grid — dim, larger tile scale to avoid moire with the near layer
    this.add
      .tileSprite(-2 * W, -2 * H, this.worldW + 4 * W, this.worldH + 4 * H, "bggrid")
      .setOrigin(0)
      .setScrollFactor(0.4)
      .setTileScale(1.7)
      .setAlpha(0.2)
      .setDepth(DEPTH.bg - 9);

    // (3) near parallax grid — brighter (accent tint shows under WebGL only)
    this.add
      .tileSprite(-2 * W, -2 * H, this.worldW + 4 * W, this.worldH + 4 * H, "bggrid")
      .setOrigin(0)
      .setScrollFactor(0.75)
      .setAlpha(0.36)
      .setTint(theme.accent2)
      .setDepth(DEPTH.bg - 8);

    // (4) scattered soft-glow blobs, additive, world glow colour baked in
    const n = 5;
    for (let i = 0; i < n; i++) {
      const bx = ((i + 0.5) / n) * this.worldW + (i % 2 ? -90 : 90);
      const by = this.worldH * (0.24 + 0.46 * ((i * 0.37) % 1));
      this.add
        .image(bx, by, `glowBlob${world}`)
        .setScrollFactor(0.85)
        .setDepth(DEPTH.bg - 7)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.32)
        .setScale(2.6 + (i % 3) * 0.7);
    }

    // (5) ambient dust motes
    addMotes(this, theme.accent2);

    // (6) P3 world-backdrop identity. All layers sit at DEPTH.bg-5..bg-1, strictly
    // below DEPTH.terrain — behind gameplay, never occluding sprites/HUD/bubbles.
    // `?noprops=1` skips the whole identity set — used for the fps A/B baseline
    // capture and to isolate the layers during headless perf debugging.
    const propsOff = typeof location !== "undefined" && /(?:\?|&)noprops=1(?:&|$)/.test(location.search);
    if (!propsOff) {
      // Renderer-adaptive quality tier. The deploy path is WebGL (~all players),
      // where these layers are GPU-cheap and inside the fps budget. The Canvas
      // renderer (headless review/beat harness + the rare no-WebGL browser) is
      // software-rasterised, where each full-viewport composite is disproportionately
      // costly and starves the fps-sensitive 2-2 fan / 1-3 & 2-2 reel routes.
      // Measured on this box: props-off runs the matrix 12/12; adding the vignette
      // (four edge bands ~= a full-screen composite) + additive fog/dust tips the
      // reels. So the Canvas tier keeps ONLY the cheap cached prop strip (the core
      // per-world silhouette identity) + the tiny pooled drips; the vignette, the
      // additive fog band and the dust-shaft beams are WebGL-only. Pure graphics-
      // quality scaling — no gameplay/meaning-bearing state is renderer-gated.
      const webgl = this.game.renderer.type === Phaser.WEBGL;
      this.propStrip = addPropStrip(this, world); // cached silhouette strip — both tiers
      if (webgl) addDustShafts(this, world); // additive beams — WebGL tier only
      if (world === 2) {
        if (webgl) this.fogStrips = addFogBand(this); // additive fog — WebGL tier only
        this.drips = addDrips(this); // pooled ceiling-joint drips (<=8 alive) — both tiers
        // fixed world-x drip sources near the ceiling pipe band (deterministic)
        this.dripPoints = [];
        for (let i = 1; i <= 5; i++) this.dripPoints.push({ x: (i / 6) * this.worldW, y: 120 + (i % 2) * 60 });
        this._dripCd = 0;
      }
      if (webgl) {
        // Per-world vignette tuning (P8): W2's maintenance tunnels want darker
        // corners than W1. Tuned by nudging the (already WebGL-gated) P3 edge
        // bands' alpha up — NO new Canvas vignette, backdrop.js untouched.
        const vig = addVignette(this); // full-frame vignette — WebGL tier only
        if (world === 2 && vig) vig.forEach((b) => b.setAlpha(0.31));
      }
    }

    // P8 light-pool tier flags (set BEFORE buildTerrain/spawnEntity create pools):
    // additive+tinted on WebGL, cheap non-additive fallback on Canvas; W2 pools
    // dimmer (`_poolDim`) and, on WebGL, a touch wider (`_poolScale`) so they read
    // as the low fog catching the light (the "fog interacts near pools" beat,
    // approximated locally — see addLightPool — rather than modulating the P3 fog
    // band per-frame, which would cost fps and risk P3's fog. Noted in the report).
    this._webglTier = this.game.renderer.type === Phaser.WEBGL;
    this._poolDim = world === 2 ? 0.62 : 1;
    this._poolScale = this._webglTier && world === 2 ? 1.22 : 1;
    this._noLights = typeof location !== "undefined" && /(?:\?|&)nolights=1(?:&|$)/.test(location.search);
  }

  // --- terrain -------------------------------------------------------------
  buildTerrain() {
    const g = this.grid;
    const accent = (this.theme && this.theme.accent) || WORLD_THEMES[1].accent;
    const world = WORLD_THEMES[this.def.world] ? this.def.world : 1;
    const tileKey = `tile${world}`;
    this.tileKey = tileKey; // exposed for the P4 probe (TileSprite hides its source key)
    // P4 drip-stain layout (W2 undersides) shares the level-seeded PRNG so the
    // rust streaks are deterministic and never realloc at runtime.
    const stainRnd = mulberry32(hashStr((this.def.id || "lvl") + ":stain"));
    for (let y = 0; y < this.def.rows; y++) {
      let runStart = -1;
      let hazStart = -1;
      const flush = (endX) => {
        if (runStart < 0) return;
        const w = (endX - runStart) * TILE;
        const cx = runStart * TILE + w / 2;
        const ts = this.add.tileSprite(cx, y * TILE + 24, w, TILE, tileKey).setDepth(DEPTH.terrain);
        this.physics.add.existing(ts, true);
        this.solidObjs.push(ts);
        // walkable-edge highlight: thin accent strip along the run's top edge,
        // dark drop-shadow strip just below its bottom edge.
        this.add.rectangle(cx, y * TILE + 1.5, w, 3, accent, 0.5).setDepth(DEPTH.terrain + 1);
        this.add.rectangle(cx, (y + 1) * TILE + 2, w, 4, COLORS.dark, 0.45).setDepth(DEPTH.terrain);
        // P4 underside ambient-occlusion: where OPEN space sits directly below the
        // run it reads as a ceiling/platform underside — darken its bottom face
        // (4px) as an orientation cue distinct from a floor top. W2 undersides
        // additionally get a few deterministic rust drip-stains.
        let openBelow = false;
        if (y + 1 < this.def.rows) {
          for (let x = runStart; x < endX; x++) { if (g[y + 1][x] !== "#") { openBelow = true; break; } }
        }
        if (openBelow) {
          this.add.rectangle(cx, (y + 1) * TILE - 2, w, 4, 0x000000, 0.5).setDepth(DEPTH.terrain + 1);
          if (world === 2) {
            const cols = endX - runStart;
            const n = Math.min(3, Math.max(1, Math.round(cols / 4)));
            for (let k = 0; k < n; k++) {
              if (stainRnd() < 0.45) continue; // sparse — not every candidate stains
              const sx = (runStart + Math.floor(stainRnd() * cols) + 0.5) * TILE;
              // only stain over an actually-open cell so it hangs into air
              const cellX = Math.floor(sx / TILE);
              if (cellX < this.def.cols && g[y + 1][cellX] === "#") continue;
              this.add.image(sx, (y + 1) * TILE, "dripstain").setOrigin(0.5, 0)
                .setDepth(DEPTH.terrain + 1).setAlpha(0.5);
            }
          }
        }
        runStart = -1;
      };
      // one soft pulsing glow per contiguous hazard run (not per tile)
      const flushHaz = (endX) => {
        if (hazStart < 0) return;
        const w = (endX - hazStart) * TILE;
        const cx = hazStart * TILE + w / 2;
        const glow = this.add.rectangle(cx, y * TILE + 30, w, 26, COLORS.hazard, 0.3).setDepth(DEPTH.terrain + 1);
        this.tweens.add({ targets: glow, alpha: { from: 0.15, to: 0.45 }, duration: 640, yoyo: true, repeat: -1, ease: "sine.inOut" });
        // P4: record the strip's top edge as an arc-spark source (emitter is
        // WebGL-only; on Canvas the pulse glow above still reads as danger).
        this.hazardStrips.push({ x1: hazStart * TILE + 2, x2: endX * TILE - 2, y: y * TILE + 25 });
        hazStart = -1;
      };
      for (let x = 0; x < this.def.cols; x++) {
        const c = g[y][x];
        if (c !== "^") flushHaz(x);
        if (c === "#") {
          if (runStart < 0) runStart = x;
          continue;
        }
        flush(x);
        if (c === "%") {
          const img = this.crackies.create(x * TILE + 24, y * TILE + 24, "crack");
          img.setDepth(DEPTH.terrain);
          img.gridX = x;
          img.gridY = y;
        } else if (c === "<" || c === ">") {
          const ts = this.add.tileSprite(x * TILE + 24, y * TILE + 24, TILE, TILE, "belt").setDepth(DEPTH.terrain);
          ts.setFlipX(c === "<");
          ts.beltDir = c === "<" ? -1 : 1;
          this.physics.add.existing(ts, true);
          this.solidObjs.push(ts);
          this.beltSprites.push(ts);
        } else if (c === "^") {
          this.add.image(x * TILE + 24, y * TILE + 24, "hazard").setDepth(DEPTH.terrain);
          this.hazardZones.push(new Phaser.Geom.Rectangle(x * TILE + 2, y * TILE + 26, TILE - 4, TILE - 26));
          if (hazStart < 0) hazStart = x;
        } else if (c === "~") {
          const img = this.phaseWalls.create(x * TILE + 24, y * TILE + 24, "phasewall");
          img.setDepth(DEPTH.terrain);
          this.tweens.add({ targets: img, alpha: { from: 0.62, to: 1 }, duration: 900, yoyo: true, repeat: -1 });
          // second drifting inner pattern; tilePositionY scrolled by shared counter
          const flow = this.add
            .tileSprite(x * TILE + 24, y * TILE + 24, TILE, TILE, "phaseflow")
            .setDepth(DEPTH.terrain + 1)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0.45);
          this.phaseFlows.push(flow);
          // P4: sparkle source at the tile's lower edge (curtain reads as rising)
          this.shimmerPts.push({ x: x * TILE + 24, y: y * TILE + 22 });
        } else if (c === "d") {
          // vent lip: blocks the top of the tile, leaving a crawl gap only Tiny fits
          const img = this.ducts.create(x * TILE + 24, y * TILE + 10, "duct");
          img.setDepth(DEPTH.terrain);
          // P4: "squeeze through here" affordance — a bobbing down-chevron + air-
          // lines in the crawl gap (visual reinforcement of U12's ONLY-TINY bubble).
          const hint = this.add.image(x * TILE + 24, y * TILE + 32, "duct_hint")
            .setDepth(DEPTH.terrain + 1).setAlpha(0.75);
          this.tweens.add({
            targets: hint, y: hint.y + 4, alpha: { from: 0.55, to: 0.95 },
            duration: 640, yoyo: true, repeat: -1, ease: "sine.inOut",
          });
        }
      }
      flush(this.def.cols);
      flushHaz(this.def.cols);
    }

    // P4 pooled ambient emitters — WebGL tier ONLY (additive; the Canvas beat
    // harness keeps the drawn curtain + hazard pulse, so fps is untouched there).
    const webgl = this.game.renderer.type === Phaser.WEBGL;
    if (webgl && this.shimmerPts.length) {
      this.shimmerSparks = this.add.particles(0, 0, "shimspark", {
        speedY: { min: -42, max: -16 }, speedX: { min: -7, max: 7 },
        scale: { start: 0.5, end: 0 }, alpha: { start: 0.5, end: 0 },
        lifespan: 1150, quantity: 1, frequency: -1, maxAliveParticles: 14,
        blendMode: Phaser.BlendModes.ADD,
      }).setDepth(DEPTH.terrain + 1);
    }
    if (webgl && this.hazardStrips.length) {
      this.hazardSparks = this.add.particles(0, 0, "hazspark", {
        speedX: { min: -70, max: 70 }, speedY: { min: -165, max: -95 }, gravityY: 540,
        scale: { start: 0.7, end: 0.1 }, alpha: { start: 0.9, end: 0 }, lifespan: 600,
        quantity: 1, frequency: -1, maxAliveParticles: Math.min(2 * this.hazardStrips.length, 12),
        blendMode: Phaser.BlendModes.ADD,
      }).setDepth(DEPTH.terrain + 2);
    }

    // P8: a flickering ambient glow pool over each hazard run. The flicker is
    // driven by 2-3 SHARED tweens (round-robin buckets), NOT per-pool timers, so
    // strips throb slightly out of phase for zero per-frame allocation. The tween
    // sets alpha absolutely, so `hazA` mirrors what addLightPool bakes for this
    // tier/world (WebGL vs the halved Canvas fallback; W2 dimmed via _poolDim).
    if (this.hazardStrips.length && !this._noLights) {
      const hazA = Math.min(0.3, 0.26) * this._poolDim * (this._webglTier ? 1 : 0.5);
      this.hazardStrips.forEach((h, i) => {
        const pool = this.addLightPool((h.x1 + h.x2) / 2, h.y, COLORS.hazard, { alpha: 0.26, scale: 1.05 });
        if (pool) this._flickBuckets[i % 3].push(pool);
      });
      const durs = [520, 700, 880];
      this._flickBuckets.forEach((bucket, i) => {
        if (!bucket.length) return;
        this.tweens.add({
          targets: bucket, alpha: { from: hazA * 0.5, to: hazA },
          duration: durs[i], yoyo: true, repeat: -1, ease: "sine.inOut",
        });
      });
    }
  }

  // P4: scatter the grime/wear decal set on large wall runs, DETERMINISTICALLY
  // seeded by the level id. 6-10 per level, alpha <=0.5, behind gameplay
  // (DEPTH.terrain+0.5 < entities). Candidates are interior/wall cells whose TOP
  // is covered (never a walkable top face) with no special tile adjacent (so a
  // decal never sits on an interactive/hazard/duct/shimmer face), spaced apart.
  scatterDecals() {
    const g = this.grid;
    const rows = this.def.rows, cols = this.def.cols;
    const rnd = mulberry32(hashStr((this.def.id || "lvl") + ":decals"));
    const cand = [];
    for (let y = 1; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (g[y][x] !== "#") continue;
        if (g[y - 1][x] !== "#") continue; // not a walkable top face
        let solid = 0, special = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          const cc = (ny < 0 || ny >= rows || nx < 0 || nx >= cols) ? "#" : g[ny][nx];
          if (cc === "#") solid++;
          if ("^~d<>%".includes(cc)) special = true;
        }
        if (special || solid < 2) continue; // interior of a sizeable run only
        cand.push({ x, y });
      }
    }
    // deterministic Fisher-Yates shuffle
    for (let i = cand.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = cand[i]; cand[i] = cand[j]; cand[j] = t;
    }
    const want = 6 + Math.floor(rnd() * 5); // 6-10
    const kinds = ["decal_oil", "decal_scuff", "decal_chevron", "decal_vent"];
    const chosen = [];
    let posterUsed = false;
    for (const c of cand) {
      if (chosen.length >= want) break;
      if (chosen.some((o) => Math.abs(o.x - c.x) + Math.abs(o.y - c.y) < 3)) continue; // spacing
      chosen.push(c);
      let key;
      if (!posterUsed && rnd() < 0.18) { key = "decal_poster"; posterUsed = true; }
      else key = kinds[Math.floor(rnd() * kinds.length)];
      this.add.image(c.x * TILE + 24, c.y * TILE + 24, key)
        .setDepth(DEPTH.terrain + 0.5)
        .setAlpha(0.28 + rnd() * 0.2) // <= 0.5
        .setAngle((rnd() - 0.5) * 9);
    }
  }

  // Emit from a pooled emitter only while it is still live. A scene restart (R,
  // or the acceptance probe switching levels) tears an emitter down mid-step; a
  // stray emit into the destroyed emitter would throw (its `anims` is nulled).
  // Guarding here keeps ambient FX (drips/shimmer/hazard sparks) crash-safe with
  // zero gameplay effect.
  emitSafe(em, x, y, n) {
    if (em && em.anims) em.emitParticleAt(x, y, n);
  }

  // P5: CAUSALITY WIRING — trace every lever/plate to the device it drives and
  // draw a dim, static L-shaped conduit between them. On trigger the base line
  // lights in the world accent and a brief travel pulse runs source→device.
  // Purely cosmetic: reads the existing wiring (needs.levers / needs.plates /
  // needs.latchLever); it never gates or delays the instant trigger logic.
  buildConduits() {
    const accent = (WORLD_THEMES[this.def.world] || WORLD_THEMES[1]).accent;
    const webgl = this.game.renderer.type === Phaser.WEBGL;
    const devices = [...this.doors, ...this.bridges];
    for (const dev of devices) {
      const n = dev.needs || {};
      const leverIds = [...(n.levers || [])];
      if (n.latchLever) leverIds.push(n.latchLever);
      const sources = [];
      for (const id of leverIds) {
        const l = this.levers.find((v) => v.id === id);
        if (l) sources.push({ type: "lever", id, x: l.x, y: l.y - 18 });
      }
      for (const id of (n.plates || [])) {
        const pl = this.plates.find((p) => p.id === id);
        if (pl) sources.push({ type: "plate", id, x: pl.rect.centerX, y: pl.rect.y + 2 });
      }
      for (const s of sources) {
        // L-shape along tile edges: vertical from the source, then horizontal
        // into the device at the device's mid-height (corner hugs the source).
        const tx = dev.wireX, ty = dev.wireY;
        const pts = [{ x: s.x, y: s.y }, { x: s.x, y: ty }, { x: tx, y: ty }];
        // arc-length table for the pulse
        const segLen = [];
        let total = 0;
        for (let i = 1; i < pts.length; i++) {
          const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
          segLen.push(d); total += d;
        }
        const base = this.add.graphics().setDepth(DEPTH.entity - 3);
        this.drawConduitBase(base, pts, accent, 0.16, s, tx, ty);
        const dot = this.add.image(s.x, s.y, "px").setDepth(DEPTH.entity - 2)
          .setScale(1.7).setVisible(false).setTint(accent);
        if (webgl) dot.setBlendMode(Phaser.BlendModes.ADD);
        this.conduits.push({
          srcType: s.type, srcId: s.id, base, pts, segLen, total: total || 1,
          dot, accent, lit: false, _prox: { t: 0 },
        });
      }
    }
  }

  // Draw a conduit polyline + end caps into a (cleared) Graphics at a given
  // intensity. Called ONCE at spawn (dim) and ONCE more when the wire lights.
  drawConduitBase(g, pts, accent, alpha, s, tx, ty) {
    g.clear();
    g.lineStyle(3, accent, alpha).strokePoints(pts, false, false);
    g.lineStyle(1.5, 0xffffff, alpha * 0.5).strokePoints(pts, false, false);
    // small junction caps at the source and the device
    g.fillStyle(accent, Math.min(0.9, alpha * 3.4)).fillCircle(pts[0].x, pts[0].y, 3);
    g.fillStyle(accent, Math.min(0.9, alpha * 3.4)).fillCircle(tx, ty, 3);
  }

  // Light + pulse every conduit driven by this source (cosmetic overlay).
  fireConduits(type, id) {
    for (const c of this.conduits) {
      if (c.srcType !== type || c.srcId !== id) continue;
      if (!c.lit) {
        c.lit = true;
        this.drawConduitBase(c.base, c.pts, c.accent, 0.5, c.pts[0], c.pts[c.pts.length - 1].x, c.pts[c.pts.length - 1].y);
      }
      // brief travel pulse source→device (~400ms), reusing a per-conduit proxy
      this.tweens.killTweensOf(c._prox);
      c._prox.t = 0;
      c.dot.setVisible(true).setAlpha(1).setPosition(c.pts[0].x, c.pts[0].y);
      this.tweens.add({
        targets: c._prox, t: 1, duration: 400, ease: "sine.in",
        onUpdate: () => {
          let d = c._prox.t * c.total;
          for (let i = 0; i < c.segLen.length; i++) {
            if (d <= c.segLen[i] || i === c.segLen.length - 1) {
              const f = c.segLen[i] > 0 ? d / c.segLen[i] : 1;
              c.dot.setPosition(
                c.pts[i].x + (c.pts[i + 1].x - c.pts[i].x) * f,
                c.pts[i].y + (c.pts[i + 1].y - c.pts[i].y) * f);
              return;
            }
            d -= c.segLen[i];
          }
        },
        onComplete: () => c.dot.setVisible(false),
      });
    }
  }

  tileAt(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (ty < 0 || ty >= this.def.rows || tx < 0 || tx >= this.def.cols) return ".";
    return this.grid[ty][tx];
  }

  isSolidChar(c) {
    return c === "#" || c === "%" || c === "<" || c === ">";
  }

  hasLOS(x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(d / 14);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.isSolidChar(this.tileAt(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t))) return false;
    }
    return true;
  }

  // P8: place ONE static ambient light-pool image under a device. Additive +
  // tinted on WebGL (the deploy path); on the software-Canvas tier (the beat
  // harness) additive compositing is disproportionately costly, so we fall back
  // to a smaller, fainter NON-additive neutral pool — the same renderer-quality
  // scaling P3/P4/P5 used, no meaning-bearing state is gated. Alpha is capped at
  // 0.3 and dimmed further in W2 (`_poolDim`); W2 pools also spread a touch wider
  // on WebGL (`_poolScale`) so they read as the low fog catching the light (the
  // "fog interacts near pools" beat — see buildBackground note). Hard-capped at
  // 40 pools/level. Created once; only ever repositioned/toggled to READ state.
  addLightPool(x, y, tint, opts = {}) {
    if (this._noLights) return null; // temporary fps-A/B flag (?nolights=1)
    if (this.lightPools.length >= 40) return null; // spec cap
    const { alpha = 0.28, scale = 1, visible = true } = opts;
    const img = this.add.image(x, y, "lightpool").setDepth(DEPTH.light).setVisible(visible);
    const a = Math.min(0.3, alpha) * this._poolDim;
    if (this._webglTier) {
      img.setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setAlpha(a).setScale(scale * this._poolScale);
    } else {
      img.setAlpha(a * 0.5).setScale(scale * 0.7); // cheap Canvas fallback
    }
    this.lightPools.push(img);
    return img;
  }

  // --- entities --------------------------------------------------------------
  spawnEntity(e) {
    const px = e.x * TILE + 24;
    const py = e.y * TILE + 24;
    switch (e.t) {
      case "pedestal": {
        const info = SKILL_INFO[e.skill];
        // holo-pillar: soft base glow rising from the base (additive, gentle pulse)
        const beam = this.add.image(px, py - 52, "holobeam").setDepth(DEPTH.entity - 1)
          .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2);
        this.tweens.add({ targets: beam, alpha: { from: 0.12, to: 0.3 }, duration: 1200, yoyo: true, repeat: -1, ease: "sine.inOut" });
        // P5: two counter-scrolling alpha bands drifting up/down the column +
        // rising glyph particles — WebGL tier ONLY. Per the P3/P4 renderer
        // policy, the per-frame tileSprite pattern-fills + additive particles are
        // disproportionately costly on the software Canvas beat harness (they
        // shaved ~1fps off the fps-sensitive 1-1/2-2 pair), so on Canvas the
        // pedestal keeps just the cheap holo-beam pulse above and NONE of this.
        const webglTier = this.game.renderer.type === Phaser.WEBGL;
        const bandH = 116, bandY = py - 54;
        let band1 = null, band2 = null, glyphEmit = null;
        if (webglTier) {
          band1 = this.add.tileSprite(px, bandY, 22, bandH, "beamband")
            .setDepth(DEPTH.entity - 1).setAlpha(0.3);
          band2 = this.add.tileSprite(px, bandY, 22, bandH, "beamband")
            .setDepth(DEPTH.entity - 1).setAlpha(0.22);
          this.tweens.add({ targets: band1, tilePositionY: 48, duration: 1700, repeat: -1, ease: "linear" });
          this.tweens.add({ targets: band2, tilePositionY: -48, duration: 2100, repeat: -1, ease: "linear" });
          glyphEmit = this.add.particles(px, py + 4, "pedglyph", {
            speedY: { min: -30, max: -14 }, speedX: { min: -6, max: 6 },
            x: { min: -8, max: 8 }, scale: { start: 0.9, end: 0 },
            alpha: { start: 0.7, end: 0 }, lifespan: 2200, frequency: 420,
            maxAliveParticles: 6, rotate: { min: -30, max: 30 },
            blendMode: Phaser.BlendModes.ADD,
          }).setDepth(DEPTH.entity - 1);
        }
        const img = this.add.image(px, py + 2, "pedestal").setDepth(DEPTH.entity);
        // P8: ambient light pool washing the floor under the pedestal, skill-tinted.
        this.addLightPool(px, py + 8, info ? info.color : COLORS.neon, { alpha: 0.26, scale: 1.15 });
        // floating skill icon orbited by 2 sparkle particles (icon = container so
        // handleAction's ped.icon.destroy() removes the sparkles too)
        const iconImg = this.add.image(0, 0, `icon_${e.skill}`).setScale(1.2);
        const orbit = this.add.container(0, 0);
        orbit.add(this.add.image(15, 0, "px").setScale(0.6).setBlendMode(Phaser.BlendModes.ADD));
        orbit.add(this.add.image(-15, 0, "px").setScale(0.6).setBlendMode(Phaser.BlendModes.ADD));
        const icon = this.add.container(px, py - 34, [iconImg, orbit]).setDepth(DEPTH.entity);
        this.tweens.add({ targets: icon, y: py - 40, duration: 800, yoyo: true, repeat: -1, ease: "sine.inOut" });
        this.tweens.add({ targets: orbit, angle: 360, duration: 1800, repeat: -1 });
        // P9: lift the card base (was -118) so its lower edge clears the raised
        // P2 action-hint bubble at spawn, and stagger heights so neighbouring
        // pedestals' cards never overlap each other. Verified clear of the intro
        // banner + top HUD band by the spawn overlap-audit sweep.
        const cardY = py - 150 - this.pedestals.length * 96;
        // A9: `orbit` is exposed so the device-personality overlay can speed up the
        // skill-icon orbit toward an approaching unskilled robot (cosmetic; the equip
        // reads ped.x/ped.y, never the icon/orbit transform).
        const ped = { x: px, y: py, skill: e.skill, taken: false, img, icon, orbit, beam, bands: [band1, band2].filter(Boolean), glyphEmit };
        this.buildItemCard(ped, px, cardY, info);
        this.pedestals.push(ped);
        break;
      }
      case "anchor": {
        // faint radius-hint circle, shown only while a grapple reticle targets it
        const hint = this.add.graphics().setDepth(DEPTH.entity - 1).setVisible(false);
        hint.lineStyle(2, COLORS.neon, 0.5).strokeCircle(px, py, 22);
        hint.fillStyle(COLORS.neon, 0.06).fillCircle(px, py, 22);
        const img = this.add.image(px, py, "anchor").setDepth(DEPTH.entity);
        this.tweens.add({ targets: img, angle: 360, duration: 6000, repeat: -1 });
        // inner slow pulse: a soft glow dot breathing at the hub
        const pulse = this.add.image(px, py, "px").setDepth(DEPTH.entity)
          .setScale(1.2).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: pulse, scale: { from: 0.9, to: 2.2 }, alpha: { from: 0.7, to: 0.2 }, duration: 1100, yoyo: true, repeat: -1, ease: "sine.inOut" });
        this.anchors.push({ x: px, y: py, img, hint, pulse });
        break;
      }
      case "lever": {
        const img = this.add.image(px, py + 4, "lever").setDepth(DEPTH.entity);
        // drawn handle, pivots at the base hub — a flip is a rotation tween
        const handle = this.add.image(px, py + 8, "lever_handle")
          .setOrigin(0.5, 1).setDepth(DEPTH.entity + 1).setAngle(-6);
        this.levers.push({ id: e.id, x: px, y: py, on: false, img, handle });
        break;
      }
      case "plate": {
        const w = (e.w || 1) * TILE;
        const img = this.add.image(e.x * TILE + w / 2, py + 17, "plate").setDepth(DEPTH.entity);
        img.setDisplaySize(w - 8, 14);
        // U2 plate-flash pips: N weight pips floating above the plate, hidden
        // until a robot steps on with insufficient weight (mirror the lift's
        // pip_on/pip_off convention from GFX Sprint 4). Container alpha is the
        // blink target so redraws are allocation-free.
        const N = e.threshold || 1;
        const spacing = 18;
        const startX = -((N - 1) * spacing) / 2;
        const pipCont = this.add.container(e.x * TILE + w / 2, py - 30).setDepth(DEPTH.fx).setVisible(false);
        const pips = [];
        for (let i = 0; i < N; i++) {
          const pip = this.add.image(startX + i * spacing, 0, "pip_off");
          pips.push(pip);
          pipCont.add(pip);
        }
        this.plates.push({
          id: e.id, threshold: N, active: false, img, baseScaleY: img.scaleY,
          rect: new Phaser.Geom.Rectangle(e.x * TILE, py + 4, w, 30),
          pipCont, pips, _weight: 0, _flashCd: 0, _flashTween: null,
        });
        break;
      }
      case "door":
      case "exit": {
        const h = (e.h || 3) * TILE;
        const cx = px;
        const cy = e.y * TILE + h / 2;
        const top = e.y * TILE;
        const halfW = (TILE - 6) / 2;
        // frame: side rails + top light-bar housing (static, behind the panel)
        const frame = this.add.graphics().setDepth(DEPTH.entity - 1);
        frame.fillStyle(0x161d30);
        frame.fillRect(cx - halfW - 5, top, 5, h);
        frame.fillRect(cx + halfW, top, 5, h);
        frame.lineStyle(2, 0x2f4066);
        frame.strokeRect(cx - halfW - 5, top, 5, h);
        frame.strokeRect(cx + halfW, top, 5, h);
        frame.fillStyle(0x2a3350).fillRect(cx - halfW - 5, top - 14, (halfW + 5) * 2, 12);
        frame.lineStyle(1, 0x44548c).strokeRect(cx - halfW - 5, top - 14, (halfW + 5) * 2, 12);
        // P5: hinge caps — bolt seats at the top & bottom of each side rail.
        for (const rx of [cx - halfW - 2.5, cx + halfW + 2.5]) {
          for (const ry of [top + 8, top + h - 8]) {
            frame.fillStyle(0x39415e).fillCircle(rx, ry, 3.2);
            frame.lineStyle(1, 0x5a6aa0).strokeCircle(rx, ry, 3.2);
            frame.fillStyle(0x8fa3d9, 0.9).fillCircle(rx - 0.8, ry - 0.8, 1.1);
          }
        }
        const img = this.doorGroup.create(cx, cy, e.t === "exit" ? "door_exit" : "door");
        img.setDisplaySize(TILE - 6, h).refreshBody();
        img.setDepth(DEPTH.entity);
        if (e.t === "exit") img.setTint(0x77ffb0);
        // status lamp on the light bar: red = closed, green = opening
        const lamp = this.add.image(cx, top - 8, "lamp_red").setDepth(DEPTH.entity);
        // P8: small light pool under the status lamp (red closed -> green on open).
        const lampPool = this.addLightPool(cx, top - 8, COLORS.hazard, { alpha: 0.22, scale: 0.62 });
        const door = {
          id: e.id || "exit", img, frame, lamp, lampPool, needs: e.needs || {}, latch: !!e.latch || e.t === "exit",
          timer: e.timer || 0, closeAt: 0,
          open: false, isExit: e.t === "exit",
          zone: new Phaser.Geom.Rectangle(cx - TILE, e.y * TILE, TILE * 2, h),
          baseY: cy, h,
          wireX: cx, wireY: cy, // P5 conduit target (device centre)
        };
        this.doors.push(door);
        // P5: small ID plate riveted on the side rail (drawn detail, not a lamp).
        // P12: right-align the plate against the door's left rail and size it to
        // its text, growing LEFTWARD into the gap BESIDE the leaf. A 4-char id
        // ("GATE") used to sit centred on the rail (DEPTH.entity-1) and slide under
        // the door leaf (DEPTH.entity, drawn over it), clipping to "GA". Now the tag
        // lives fully clear of the leaf; it draws just above the assembly so the
        // rail/leaf can never swallow it, and — being beside, not under, the leaf —
        // an opening leaf still slides up past it with no floating-in-the-doorway.
        if (!door.isExit && e.id) {
          const ph = 12, ply = top + h / 2, pad = 6;
          const label = String(e.id).slice(0, 4).toUpperCase();
          const prx = cx - halfW - 7; // plate right edge, clear of the side rail + leaf
          // Own graphics + text at DEPTH.entity + 1: the plate sits in the gap
          // BESIDE the leaf (not under it), so this reads as a riveted rail tag and
          // is never clipped by the leaf/rail that used to swallow a 4-char id.
          const plate = this.add.graphics().setDepth(DEPTH.entity + 1);
          const t = this.add.text(prx - pad, ply, label, {
            fontFamily: FONT, fontSize: FS.tiny, color: TEXT.dim,
          }).setOrigin(1, 0.5).setDepth(DEPTH.entity + 2).setResolution(2);
          const pw = t.width + pad * 2;
          plate.fillStyle(0x0c1424, 0.95).fillRoundedRect(prx - pw, ply - ph / 2, pw, ph, 2);
          plate.lineStyle(1, 0x44548c).strokeRoundedRect(prx - pw, ply - ph / 2, pw, ph, 2);
        }
        if (door.isExit) {
          this.exitDoor = door;
          // P8: broad green light pool washing the exit marquee frame + threshold.
          this.addLightPool(cx, cy, 0x77ffb0, { alpha: 0.24, scale: 1.55 });
          // EXIT light panel above the door with a soft glow pulse (Sprint 4 sign)
          const ly = top - 20;
          const glow = this.add.image(cx, ly, "glowBlob").setDepth(DEPTH.entity - 1)
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setAlpha(0.3);
          this.tweens.add({ targets: glow, alpha: { from: 0.16, to: 0.42 }, scale: { from: 0.46, to: 0.64 }, duration: 1100, yoyo: true, repeat: -1, ease: "sine.inOut" });
          const panel = this.add.graphics().setDepth(DEPTH.entity);
          panel.fillStyle(0x0a1f16, 0.95).fillRoundedRect(cx - 34, ly - 13, 68, 26, 7);
          panel.lineStyle(2, COLORS.green).strokeRoundedRect(cx - 34, ly - 13, 68, 26, 7);
          this.add.text(cx, ly, "EXIT", {
            fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: TEXT.good,
          }).setOrigin(0.5).setDepth(DEPTH.entity + 1);

          // P5: marquee dot-lights ringing the door frame, chasing while OPEN.
          // Pooled (built once, hidden); a single head index sweeps them in the
          // door update — no per-frame allocation. Additive glow gated to WebGL.
          const webgl = this.game.renderer.type === Phaser.WEBGL;
          const L = cx - halfW - 5, R = cx + halfW + 5, T = top, B = top + h;
          const per = []; const step = 20;
          for (let x = L; x < R; x += step) per.push([x, T]);
          for (let y = T; y < B; y += step) per.push([R, y]);
          for (let x = R; x > L; x -= step) per.push([x, B]);
          for (let y = B; y > T; y -= step) per.push([L, y]);
          const mdots = per.map(([mx, my]) => {
            const d = this.add.image(mx, my, "marqueedot").setDepth(DEPTH.entity + 1)
              .setScale(0.9).setVisible(false).setTint(0x9dffc4);
            if (webgl) d.setBlendMode(Phaser.BlendModes.ADD);
            return d;
          });
          door.marquee = { dots: mdots, phase: 0 };

          // "waiting for buddy" bubble floating above the EXIT sign — shows the
          // missing buddy's icon + a pulsing down-arrow while one player waits.
          // exitLabel is now this container (kept non-null for the update logic).
          const by = top - 60;
          this.exitLabel = this.add.container(cx, by).setDepth(DEPTH.entity + 2).setVisible(false);
          const bbg = this.add.graphics();
          bbg.fillStyle(COLORS.hudBg, 0.92).fillRoundedRect(-34, -28, 68, 40, 9);
          bbg.lineStyle(2, 0xffffff, 0.55).strokeRoundedRect(-34, -28, 68, 40, 9);
          const bIcon = this.add.image(0, -8, "robot_b").setScale(0.5).setVisible(false);
          const oIcon = this.add.image(0, -8, "robot_o").setScale(0.5).setVisible(false);
          const arrow = this.add.graphics();
          arrow.fillStyle(0xffffff, 0.95).fillTriangle(-8, 16, 8, 16, 0, 30);
          this.exitLabel.add([bbg, bIcon, oIcon, arrow]);
          this.exitLabel.buddyIcons = [bIcon, oIcon];
          this.exitLabel.waitIdx = -1;
          this.exitLabel.pulse = this.tweens.add({
            targets: arrow, y: 5, alpha: { from: 1, to: 0.35 },
            duration: 520, yoyo: true, repeat: -1, ease: "sine.inOut", paused: true,
          });
          // P9: the waiting buddy's icon does a tiny beckoning wave (a gentle
          // rock) while it calls the other player over. One shared paused tween.
          this.exitLabel.wave = this.tweens.add({
            targets: [bIcon, oIcon], angle: { from: -11, to: 11 },
            duration: 360, yoyo: true, repeat: -1, ease: "sine.inOut", paused: true,
          });
        }
        break;
      }
      case "bridge": {
        const tiles = [];
        for (let i = 0; i < e.w; i++) {
          const img = this.bridgeGroup.create(e.x * TILE + 24 + i * TILE, e.y * TILE + 24, "bridgetile");
          img.setDepth(DEPTH.terrain).setAlpha(0.13);
          img.body.enable = false;
          // slow shimmer while the bridge is still a ghost
          this.tweens.add({
            targets: img, alpha: { from: 0.09, to: 0.2 },
            duration: 1400, yoyo: true, repeat: -1, ease: "sine.inOut",
            delay: i * 120,
          });
          tiles.push(img);
        }
        this.bridges.push({
          id: e.id, tiles, needs: e.needs || {}, open: false,
          wireX: e.x * TILE + 24 + ((e.w - 1) * TILE) / 2, wireY: e.y * TILE + 24,
        });
        break;
      }
      case "key": {
        const cont = this.add.container(px, py).setDepth(DEPTH.pickup);
        const keyImg = this.add.image(0, 0, "key");
        const glint = this.add.image(-2, 0, "glint").setAngle(28).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
        cont.add([keyImg, glint]);
        this.tweens.add({ targets: cont, y: py - 8, duration: 900, yoyo: true, repeat: -1, ease: "sine.inOut" });
        // white diagonal glint sweeping across the key ~every 2s
        this.tweens.add({
          targets: glint, x: { from: -13, to: 13 }, alpha: { from: 0, to: 0.9 },
          duration: 500, yoyo: true, repeat: -1, repeatDelay: 1200, ease: "sine.inOut",
        });
        this.keyItems.push(cont);
        break;
      }
      case "core": {
        const cont = this.add.container(px, py).setDepth(DEPTH.pickup);
        cont.coreIndex = this.coreIdx++;
        const glow = this.add.image(0, 0, "glowBlob").setScale(0.42).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5);
        const coreImg = this.add.image(0, 0, "core");
        const orbit = this.add.container(0, 0);
        orbit.add(this.add.image(14, 0, "px").setScale(0.7).setBlendMode(Phaser.BlendModes.ADD));
        cont.add([glow, coreImg, orbit]);
        this.tweens.add({ targets: cont, y: py - 8, duration: 1100, yoyo: true, repeat: -1, ease: "sine.inOut" }); // bob
        this.tweens.add({ targets: coreImg, angle: 360, duration: 9000, repeat: -1 }); // slow spin
        this.tweens.add({ targets: orbit, angle: 360, duration: 2200, repeat: -1 }); // orbiting sparkle
        this.coreItems.push(cont);
        break;
      }
      case "checkpoint": {
        const img = this.add.image(px, py - 9, "checkpoint").setDepth(DEPTH.entity).setAlpha(0.85);
        // short light-cone fanning below the lamp, shown only while active
        const cone = this.add.graphics().setDepth(DEPTH.entity - 1)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
        cone.fillStyle(COLORS.green, 0.16).fillTriangle(px, py - 30, px - 20, py + 8, px + 20, py + 8);
        this.tweens.add({ targets: cone, alpha: { from: 0.55, to: 1 }, duration: 900, yoyo: true, repeat: -1, ease: "sine.inOut" });
        // P8: green light pool at the base, revealed only while this checkpoint is
        // the active one (toggled with the lamp texture in the activation handler).
        const pool = this.addLightPool(px, py + 6, COLORS.green, { alpha: 0.26, scale: 1.1, visible: false });
        this.checkpoints.push({ x: px, y: py, img, active: false, cone, pool });
        break;
      }
      case "trigger": {
        // Sprint 10: a one-shot AABB zone (tile coords). When any player enters it
        // fires its KOBI blip and/or reveals a floating key-glyph cluster. Checked
        // cheaply in the per-player update loop and skipped once fired.
        this.triggers.push({
          id: e.id || null, // optional handle (U6 reads the tutorial's station-5 trigger)
          rect: new Phaser.Geom.Rectangle(e.x * TILE, e.y * TILE, (e.w || 1) * TILE, (e.h || 1) * TILE),
          blip: e.blip || null,
          glyphs: e.glyphs || null, // { x, y, caps } in tile coords, revealed on entry
          fired: false,
        });
        break;
      }
      case "bug": {
        // P7: World-2 levels use the darker hex-spot shell variant. Base/step
        // texture keys are stored so the existing leg-wiggle swap stays variant-
        // aware (pure texture selection — no logic/motion change).
        const w2bug = this.def.world === 2;
        const bug = this.bugs.create(px, py + 8, w2bug ? "bug_w2" : "bug");
        bug._texBase = w2bug ? "bug_w2" : "bug";
        bug._texStep = w2bug ? "bug_w2_step" : "bug_step";
        bug._texStep2 = w2bug ? "bug_w2_step2" : "bug_step2"; // A5: third leg frame
        // A5: deterministic 1-in-4 squish variant (legs-up ghost puff). A per-bug
        // hash of the patrol bounds — reproducible (same level => same variant), NOT
        // Math.random. squishBug reads this to add the rare rising ghost-puff.
        bug._squishGhost = ((((e.min + 1) * 73856093) ^ ((e.max + 1) * 19349663)) >>> 0) % 4 === 0;
        bug.setDepth(DEPTH.entity);
        bug.body.setSize(38, 22).setOffset(3, 4);
        bug.setVelocityX(60);
        bug.minX = e.min * TILE;
        bug.maxX = (e.max + 1) * TILE;
        // additive eye-glow overlay: alpha ramps up when a player is within ~200px
        bug.glow = this.add.image(bug.x, bug.y, "bug_glow").setDepth(DEPTH.entity + 1)
          .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
        break;
      }
      case "crusher": {
        const img = this.add.image(px + 18, py + 6, "crusher").setDepth(DEPTH.entity);
        this.physics.add.existing(img);
        img.body.setAllowGravity(false);
        img.body.setImmovable(true);
        this.crushers.push({
          img, restY: py + 6, botY: (e.y + 3) * TILE + 6,
          state: "hold", timer: 1100 + (e.offset || 0),
        });
        break;
      }
      case "lift": {
        const w = e.w * TILE;
        const cx = e.x * TILE + w / 2;
        const img = this.add.tileSprite(cx, e.y * TILE + 10, w, 20, "liftplat").setDepth(DEPTH.entity);
        this.physics.add.existing(img);
        img.body.setAllowGravity(false);
        img.body.setImmovable(true);
        // weight requirement shown as N mini-robot pips that light as weight loads.
        // `label` stays the container the lift loop's setAlpha(0/1) calls drive.
        const N = e.threshold || 2;
        const pips = [];
        const spacing = 18;
        const startX = -((N - 1) * spacing) / 2;
        // P5: tiny framed panel behind the weight pips (drawn once).
        const panelW = N * spacing + 12;
        const pipPanel = this.add.graphics().setDepth(DEPTH.entity - 1);
        pipPanel.fillStyle(0x0c1424, 0.9).fillRoundedRect(cx - panelW / 2, e.y * TILE + 34 - 11, panelW, 22, 5);
        pipPanel.lineStyle(1, 0x44548c).strokeRoundedRect(cx - panelW / 2, e.y * TILE + 34 - 11, panelW, 22, 5);
        const label = this.add.container(cx, e.y * TILE + 34).setDepth(DEPTH.entity);
        for (let i = 0; i < N; i++) {
          const pip = this.add.image(startX + i * spacing, 0, "pip_off");
          pips.push(pip);
          label.add(pip);
        }
        // engine glow strip beneath the platform, lit while the lift is moving
        const glow = this.add.image(cx, e.y * TILE + 22, "px").setDepth(DEPTH.entity - 1)
          .setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(w - 12, 9).setTint(0xffd9a0).setAlpha(0);
        // P5: rail grooves flanking the shaft + a cable drum at the top that a
        // cable descends from to the platform. Rails/drum drawn once (static);
        // the drum rotates and the cable re-lengths in the lift loop (no alloc).
        const topY = e.toY * TILE + 10, botY = e.y * TILE + 10;
        const drumY = topY - 30;
        const rail = this.add.graphics().setDepth(DEPTH.entity - 2);
        for (const rx of [cx - w / 2 + 5, cx + w / 2 - 5]) {
          rail.fillStyle(0x0c1424, 0.9).fillRect(rx - 3, drumY, 6, botY + 12 - drumY);
          rail.lineStyle(1, 0x2f4066).strokeRect(rx - 3, drumY, 6, botY + 12 - drumY);
          rail.fillStyle(0x1c2742).fillRect(rx - 1, drumY, 2, botY + 12 - drumY); // groove channel
        }
        const cable = this.add.image(cx, drumY, "liftcable").setOrigin(0.5, 0)
          .setDepth(DEPTH.entity - 1).setDisplaySize(3, botY - drumY);
        const drum = this.add.image(cx, drumY, "drum").setDepth(DEPTH.entity);
        const lift = {
          img, topY, botY,
          threshold: N, holdTimer: 0, label, pips, glow, drum, cable, drumY,
        };
        this.lifts.push(lift);
        break;
      }
      case "roller": {
        const img = this.add.image(px, py + 7, "roller").setDepth(DEPTH.entity);
        this.physics.add.existing(img);
        img.body.setAllowGravity(true);
        img.body.setSize(38, 30);
        this.physics.add.collider(img, this.solidObjs);
        // sliding pupil overlay, two spinning spoke-dot wheels, and a pooled "!"
        // alert popup (all bounded per-roller — no per-frame allocation).
        const pupil = this.add.image(img.x, img.y, "roller_pupil").setDepth(DEPTH.entity + 1);
        const wheels = [
          this.add.image(0, 0, "roller_wheel").setDepth(DEPTH.entity + 1),
          this.add.image(0, 0, "roller_wheel").setDepth(DEPTH.entity + 1),
        ];
        const excl = this.add.image(img.x, img.y - 34, "excl").setDepth(DEPTH.fx).setVisible(false);
        // P7: cab-roof warning lamp (lit/unlit texture states, swapped by state
        // in updateWorld2 — static, not spinning).
        const lamp = this.add.image(img.x, img.y - 20, "roller_lamp").setDepth(DEPTH.entity + 1);
        // P8: alarm light pool under the cab lamp — shown + repositioned only while
        // the roller is alerted (updated alongside the existing lamp reposition, so
        // it adds no new per-frame allocation).
        const lampPool = this.addLightPool(img.x, img.y - 20, COLORS.hazard, { alpha: 0.28, scale: 0.9, visible: false });
        this.rollers.push({
          img, minX: e.min * TILE, maxX: (e.max + 1) * TILE, dir: 1,
          state: "patrol", timer: 0, beamLen: e.beam || 140,
          pupil, wheels, excl, lamp, lampPool, wheelAngle: 0,
        });
        break;
      }
      case "warden": {
        const img = this.add.image(px, e.y * TILE + 48 - 31, "warden").setDepth(DEPTH.entity);
        const facing = e.facing || 1;
        img.setFlipX(e.facing === -1);
        this.physics.add.existing(img, true);
        // visor glow (additive; static warden so positioned once) with a soft pulse
        const glow = this.add.image(img.x + facing * 9, img.y - 12, "glowBlob").setDepth(DEPTH.entity - 1)
          .setBlendMode(Phaser.BlendModes.ADD).setScale(0.13).setAlpha(0.4);
        this.tweens.add({ targets: glow, alpha: { from: 0.28, to: 0.6 }, duration: 1200, yoyo: true, repeat: -1, ease: "sine.inOut" });
        // A7: the idle ±2° sway is now RETIMED + OWNED by the warden anim rig (host
        // rotation, so `?animoff=1` renders a static warden — the A5/A6 A/B contract).
        // P7: badge-number stencil on the chest (W1/W2 numbering from the id).
        // Drawn once over the chest plate — static, no per-frame cost.
        const badgeNum = (e.id || "w1").replace(/\D/g, "") || "1";
        const badge = this.add.text(px, img.y + 14, badgeNum, {
          fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: "#dff5e6",
        }).setOrigin(0.5).setDepth(DEPTH.entity + 1);
        this.wardens.push({ id: e.id, img, facing, defeated: false, x: px, glow, badge });
        break;
      }
      case "jet": {
        // steam jet firing downward; on/off on a timer until its valve lever latches
        const img = this.add.image(px, e.y * TILE + 8, "nozzle").setDepth(DEPTH.entity);
        const len = (e.len || 3) * TILE;
        this.jets.push({
          img, x: px, topY: e.y * TILE + 16, len,
          period: e.period || 2600, on: e.on || 1200, offset: e.offset || 0,
          disabledBy: e.disabledBy, active: false,
          zone: new Phaser.Geom.Rectangle(px - 10, e.y * TILE + 16, 20, len),
          gfx: this.add.graphics().setDepth(DEPTH.fx),
        });
        break;
      }
      case "ventlamp": {
        // U5 (F11): passive "all-clear" indicator wired to a valve lever. Red while
        // the valve's jets are live, green once thrown. Drawn textures (lamp_red/
        // lamp_green), swapped — NOT tinted. No body, no collision, no needs logic,
        // and it is NEVER pushed onto this.jets (so the W2 suite's jet reads are
        // untouched). A small mount bracket is drawn behind the lamp bulb.
        const bracket = this.add.graphics().setDepth(DEPTH.entity - 1);
        bracket.fillStyle(0x2a3350, 1).fillRoundedRect(px - 13, py - 4, 26, 12, 3);
        bracket.fillStyle(0x1c2742, 1).fillRect(px - 2, py + 6, 4, 8); // stem to the wall
        const lamp = this.add.image(px, py, "lamp_red").setDepth(DEPTH.entity);
        // P8: light pool under the vent lamp (red while live -> green once cleared).
        const pool = this.addLightPool(px, py + 4, COLORS.hazard, { alpha: 0.22, scale: 0.7 });
        this.ventLamps.push({ lamp, pool, wiredTo: e.wiredTo, lit: false });
        break;
      }
      case "fan": {
        this.add.image(px, py + 13, "fan").setDepth(DEPTH.entity);
        // updraft column reaches up to the first solid tile
        let topRow = 0;
        for (let ty = e.y - 1; ty >= 0; ty--) {
          if (this.isSolidChar(this.grid[ty][e.x])) {
            topRow = ty + 1;
            break;
          }
        }
        // FL-008: zone must reach the FLOOR (e.y*TILE+48), not mid-tile (+24) —
        // a standing Tiny's small body sits below +24, so walking into the fan
        // did nothing; only falling through it (or jumping) caught the draft.
        const zone = new Phaser.Geom.Rectangle(e.x * TILE + 4, topRow * TILE, TILE - 8, (e.y - topRow) * TILE + 48);
        // P11: fan updraft swept onto the steam/air family (desaturated cyan-white)
        const puffs = this.add.particles(px, py + 16, "px", {
          speedY: { min: -260, max: -160 }, speedX: { min: -20, max: 20 },
          scale: { start: 0.5, end: 0 }, lifespan: { min: 400, max: 900 },
          quantity: 1, frequency: 90, tint: PARTICLES.steam.body, alpha: 0.5,
        }).setDepth(DEPTH.fx);
        // soft updraft column whose alpha gently wobbles (see updateWorld2)
        const col = this.add.rectangle(zone.centerX, zone.centerY, zone.width, zone.height, PARTICLES.steam.body, 0.09)
          .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx - 3);
        // P11: streaming air-lines — thin cyan-white streaks riding the draft.
        // WebGL-ONLY: the fan lives in the fps-fragile 2-2 route, so the extra
        // additive emitter is gated off the software-Canvas tier to keep its
        // cost flat (the puffs + column above carry the effect on Canvas).
        let airLines = null;
        if (this.game.renderer.type === Phaser.WEBGL) {
          airLines = this.add.particles(zone.centerX, zone.bottom - 6, "fanair", {
            speedY: { min: -300, max: -200 }, speedX: { min: -14, max: 14 },
            x: { min: -zone.width * 0.4, max: zone.width * 0.4 },
            scale: { start: 1, end: 0.4 }, alpha: { start: 0.55, end: 0 },
            lifespan: { min: 420, max: 780 }, quantity: 1, frequency: 150,
            blendMode: Phaser.BlendModes.ADD,
          }).setDepth(DEPTH.fx - 1);
        }
        this.fans.push({ zone, puffs, col, airLines });
        break;
      }
      case "crane": {
        const railY = 2 * TILE + 20;
        for (let x = e.minX - 1; x <= e.maxX + 1; x++) {
          this.add.image(x * TILE + 24, railY, "rail").setDepth(DEPTH.terrain);
        }
        const hoverY = e.y * TILE + 24;
        const body = this.add.image((e.minX + e.maxX) / 2 * TILE, hoverY, "crane").setDepth(DEPTH.entity);
        // magenta pulse-glow behind each plate (rest-state yankable cue), and a
        // trolley clamped to the rail with a shared-Graphics cable down to the body.
        const mkGlow = () => this.add.image(0, 0, "plate_glow").setDepth(DEPTH.entity)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
        const plates = [
          { off: { x: -44, y: 0 }, img: this.add.image(0, 0, "crane_plate").setDepth(DEPTH.entity + 1), glow: mkGlow(), attached: true },
          { off: { x: 0, y: 18 }, img: this.add.image(0, 0, "crane_plate").setDepth(DEPTH.entity + 1), glow: mkGlow(), attached: true },
          { off: { x: 44, y: 0 }, img: this.add.image(0, 0, "crane_plate").setDepth(DEPTH.entity + 1), glow: mkGlow(), attached: true },
        ];
        const trolley = this.add.image(body.x, railY, "trolley").setDepth(DEPTH.terrain + 1);
        this.craneGfx = this.add.graphics().setDepth(DEPTH.entity - 1); // cable + telegraph stripes
        this.crane = {
          body, plates, hoverY, minX: e.minX * TILE + 60, maxX: e.maxX * TILE - 60,
          floorY: 14 * TILE, state: "patrol", timer: 2000, podsStomped: 0,
          trolley, railY, railMin: (e.minX - 1) * TILE + 24, railMax: (e.maxX + 1) * TILE + 24,
          hpText: this.add.text(body.x, hoverY - 60, "", { fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: TEXT.warn }).setOrigin(0.5).setDepth(DEPTH.fx),
        };
        break;
      }
    }
  }

  // Sprint 10: render a floating key-glyph prompt — key-cap images + letter texts
  // in a gently-bobbing container. `caps` is e.g. [{k:'A'},{k:'D'},{gap:8},{k:'←'}].
  // Each cap is coloured by its player: cap.p (0=P1 beep-blue, 1=P2 boop-orange);
  // when omitted, arrow glyphs default to P2, everything else to P1. Colours are
  // DRAWN (border + text), not tinted — setTint no-ops under the Canvas renderer.
  addGlyphs(x, y, caps) {
    const CAP = 34, GAP = 7;
    // measure total width so the cluster is centred on (x, y)
    let total = 0;
    for (const c of caps) total += c.gap ? c.gap : CAP + GAP;
    total -= GAP;
    const cont = this.add.container(x, y).setDepth(DEPTH.fx);
    let cx = -total / 2 + CAP / 2;
    for (const c of caps) {
      if (c.gap) { cx += c.gap; continue; }
      const p = c.p != null ? c.p : (/[←→↑↓]/.test(c.k) ? 1 : 0);
      const col = p === 0 ? COLORS.beep : COLORS.boop;
      const hex = p === 0 ? "#4dc9ff" : "#ffa14d";
      const cap = this.add.image(cx, 0, "keycap");
      const bdr = this.add.graphics();
      bdr.lineStyle(2.5, col, 1).strokeRoundedRect(cx - 17, -17, 34, 34, 8);
      const t = this.add.text(cx, -1, c.k, {
        fontFamily: FONT, fontSize: FS.large, fontStyle: "bold", color: hex,
      }).setOrigin(0.5);
      cont.add([cap, bdr, t]);
      cx += CAP + GAP;
    }
    // gentle vertical bob
    this.tweens.add({ targets: cont, y: y - 6, duration: 1100, yoyo: true, repeat: -1, ease: "sine.inOut" });
    return cont;
  }

  // Item card: a proper panel — dark rounded body, skill-coloured title bar +
  // border. Stored in pieces so `equipItemCard` can shrink it to a small tag.
  buildItemCard(ped, x, cardY, info) {
    const col = info.color;
    const TB = 24;
    // SL7 bubble-fit: size the card to its TEXT. The longest body line ("Smash,
    // stomp, and stand your ground." ≈ 281px) overflowed the old fixed W=236 panel;
    // now we measure the title + multi-line body first and draw the panel from the
    // widest row + padding, so nothing touches the edges. Text objects are created
    // first (measured), then the graphics — the container array below fixes z-order.
    const title = this.add.text(0, 0, info.name, {
      fontFamily: FONT, fontSize: FS.mini, fontStyle: "bold", color: "#0a0f1e",
    }).setOrigin(0.5);
    const body = this.add.text(0, 0, `${info.card}\n[ACTION to equip]`, {
      fontFamily: FONT, fontSize: FS.mini, color: TEXT.body, align: "center",
    }).setOrigin(0.5);
    const PADX = 18, PADY = 14;
    const W = Math.max(236, Math.ceil(body.width + PADX * 2), Math.ceil(title.width + PADX * 2));
    const H = Math.ceil(TB + body.height + PADY * 2);
    const g = this.add.graphics();
    g.fillStyle(COLORS.hudBg, 0.96).fillRoundedRect(-W / 2, -H / 2, W, H, 10);
    g.fillStyle(col, 0.9).fillRoundedRect(-W / 2, -H / 2, W, TB, { tl: 10, tr: 10, bl: 0, br: 0 });
    g.lineStyle(2, col).strokeRoundedRect(-W / 2, -H / 2, W, H, 10);
    title.setY(-H / 2 + 12);
    body.setY(TB / 2); // centered in the area below the coloured title bar
    // sit above the floating "SPACE/L = ACTION" hints (also DEPTH.fx): at spawn a
    // robot stands under its pedestal and its hint would otherwise occlude the
    // card's own "[ACTION to equip]" line. Card wins; the hints separate as the
    // robots walk off. Still below the intro banner (DEPTH.fx + 50).
    ped.card = this.add.container(x, cardY, [g, title, body]).setDepth(DEPTH.fx + 2);
    ped.cardG = g;
    ped.cardTitle = title;
    ped.cardBody = body;
    // P9: 150ms slide-in — the card drops into place from just above with a soft
    // overshoot as it spawns (one-shot tween, no per-frame cost).
    ped.card.setAlpha(0).setY(cardY - 16);
    this.tweens.add({ targets: ped.card, y: cardY, alpha: 1, duration: 150, ease: "back.out" });
  }

  // Once equipped the card shrinks to a compact skill tag (title only).
  equipItemCard(ped) {
    const col = SKILL_INFO[ped.skill].color;
    ped.cardBody.destroy();
    const W = 132, H = 30;
    ped.cardG.clear();
    ped.cardG.fillStyle(COLORS.hudBg, 0.96).fillRoundedRect(-W / 2, -H / 2, W, H, 8);
    ped.cardG.lineStyle(2, col).strokeRoundedRect(-W / 2, -H / 2, W, H, 8);
    ped.cardTitle.setColor("#" + col.toString(16).padStart(6, "0")).setFontSize(12).setPosition(0, 0);
    this.tweens.add({ targets: ped.card, scaleX: { from: 1.12, to: 1 }, scaleY: { from: 1.12, to: 1 }, duration: 260, ease: "back.out" });
    this.time.delayedCall(6000, () => ped.card && ped.card.setAlpha(0.55));
  }

  // --- actions ---------------------------------------------------------------
  handleAction(p) {
    if (this.actionHints && this.actionHints[p.idx]) {
      this.actionHints[p.idx].destroy();
      this.actionHints[p.idx] = null;
    }
    if (p.dead || p.carriedBy) return;
    if (p.carrying) {
      this.throwPartner(p);
      return;
    }
    // pedestal pickup
    const ped = this.pedestals.find((d) => !d.taken && !p.skill && Math.abs(d.x - p.x) < 56 && Math.abs(d.y - p.y) < 70);
    if (ped) {
      ped.taken = true;
      ped.icon.destroy();
      // P5: the holo-beam dims out once its skill is claimed (cosmetic).
      if (ped.beam) this.tweens.add({ targets: ped.beam, alpha: 0, duration: 400 });
      if (ped.bands) ped.bands.forEach((b) => this.tweens.add({ targets: b, alpha: 0, duration: 400 }));
      if (ped.glyphEmit) ped.glyphEmit.stop();
      this.equipItemCard(ped);
      p.setSkill(ped.skill);
      sfx.equip();
      // A4: the robot "tries on" the skill — badge pop + head flash + a one-beat
      // proud pose. Purely cosmetic; the skill was already assigned above.
      const erig = this.anim && this.anim.enabled && this.anim.rigFor(p);
      if (erig && erig.startEquip) erig.startEquip();
      this.game.events.emit("bb:skill", { idx: p.idx, skill: ped.skill, name: SKILL_INFO[ped.skill].name });
      if (this.players.every((q) => q.skill) && this.def.blips.skills) {
        this.game.events.emit("bb:blip", this.def.blips.skills);
      }
      return;
    }
    // adjacent lever (anyone can pull)
    const lev = this.levers.find((l) => !l.on && Math.abs(l.x - p.x) < 54 && Math.abs(l.y - p.y) < 64);
    if (lev) {
      this.pullLever(lev);
      return;
    }
    if (p.skill === "grapple") {
      // FL-004 rev: UP+ACTION zips to the best target almost directly above —
      // completing the modifier language (UP = up, DOWN = buddy, plain =
      // where you're looking). Near-vertical anchors lose plain-ACTION
      // contests by margins too thin to trust.
      const padJumpHeld = p.pad && p.pad.jump.isDown;
      const padDownHeld = p.pad && p.pad.down.isDown;
      if ((p.keys.jump.isDown || padJumpHeld) && !(p.keys.down.isDown || padDownHeld)) {
        let best = null, bestD = Infinity;
        for (const a of this.anchors) {
          const d = Math.hypot(a.x - p.x, a.y - p.y);
          if (Math.abs(a.x - p.x) > 130 || a.y > p.y - 40) continue;
          if (d > PHYS.grappleRange || d < 30) continue;
          if (!this.hasLOS(p.x, p.y, a.x, a.y)) continue;
          if (d < bestD) {
            bestD = d;
            best = a;
          }
        }
        if (best) this.fireGrapple(p, { kind: "anchor", x: best.x, y: best.y });
        else sfx.denied();
        return;
      }
      // FL-001 rev2: DOWN+ACTION is the buddy-rope chord — partner only,
      // no world-target ambiguity. Plain ACTION never targets the buddy.
      if (p.keys.down.isDown || padDownHeld) {
        const q = p.partner;
        if (
          q && !q.dead && !q.carriedBy && !q.zip && !q.reeled &&
          Math.hypot(q.x - p.x, q.y - p.y) > 72 &&
          Math.hypot(q.x - p.x, q.y - p.y) <= PHYS.grappleRange &&
          // FL-005: the rope may arc over a ledge lip — accept the direct line
          // OR a head-to-head line (reeling a buddy below your floor otherwise
          // demands pixel-perfect edge-standing)
          (this.hasLOS(p.x, p.y, q.x, q.y) || this.hasLOS(p.x, p.y - 44, q.x, q.y - 24))
        ) {
          this.fireGrapple(p, { kind: "partner", x: q.x, y: q.y, obj: q });
        } else {
          sfx.denied();
        }
        return;
      }
      const tgt = this.findGrappleTarget(p);
      if (tgt) {
        this.fireGrapple(p, tgt);
        return;
      }
    } else if (p.skill === "heavy" && !p.grounded && !p.zip) {
      sfx.stompLaunch(); // heavy winds up the dive
      p.startStomp();
      return;
    }
    // pick up partner
    const q = p.partner;
    if (
      q && !q.dead && !q.carriedBy && !q.carrying && !q.zip && !q.reeled &&
      p.grounded && p.pickupCd <= 0 && q.pickupCd <= 0 &&
      Math.abs(q.x - p.x) < 58 && Math.abs(q.y - p.y) < 60
    ) {
      this.pickupPartner(p, q);
      return;
    }
    sfx.denied();
  }

  pickupPartner(p, q) {
    q.clearStates();
    p.carrying = q;
    q.carriedBy = p;
    q.body.enable = false;
    sfx.grab();
    this.showThrowHint(p); // U1(c): first-pickup-of-session throw hint
  }

  throwPartner(p) {
    const q = p.carrying;
    if (!q) return;
    p.carrying = null;
    q.carriedBy = null;
    q.body.enable = true;
    q.body.reset(p.x + p.facing * 10, p.y - p.displayHeight / 2 - 20);
    const heavyThrower = p.skill === "heavy";
    const flyBoost = q.skill === "tiny" ? 1.9 : 1; // Tiny is built to be luggage
    let highToss = false;
    if (p.keys.jump.isDown || (p.pad && p.pad.jump.isDown)) {
      highToss = true;
      q.setVelocity(p.facing * 120, -PHYS.tossY * (q.skill === "tiny" ? 1.08 : 1)); // high toss
    } else {
      q.setVelocity(
        p.facing * (heavyThrower ? PHYS.heavyThrowX : PHYS.throwX) * flyBoost,
        -(heavyThrower ? PHYS.heavyThrowY : PHYS.throwY)
      );
    }
    q.pickupCd = 450;
    p.pickupCd = 450;
    this.dust.emitParticleAt(q.x, q.y + 8, this.fxBudget(6)); // small poof at release
    q._landDust = true; // landing dust kicks up when the thrown buddy touches down
    q._throwTrail = 400; // P11: dotted fading trail follows the thrown buddy for 400ms
    if (highToss) sfx.tossHigh();
    else sfx.throwIt();
    // A4: thrower's windup->follow-through overlay (+high-toss squat). Cosmetic —
    // the throw velocity/logic above is untouched (logic first, motion after).
    const rig = this.anim && this.anim.enabled && this.anim.rigFor(p);
    if (rig) rig.startAction("throw", p.facing, { hi: highToss });
  }

  detachCarry(carrier, carried, hop) {
    carrier.carrying = null;
    carried.carriedBy = null;
    carried.body.enable = true;
    carried.body.reset(carrier.x + carrier.facing * 6, carrier.y - 40);
    carried.setVelocity(0, hop ? -330 : 0);
    carried.pickupCd = 400;
    carrier.pickupCd = 400;
  }

  pullLever(lev) {
    lev.on = true;
    if (lev.handle) {
      this.tweens.add({ targets: lev.handle, angle: 60, duration: 240, ease: "back.out" });
      this.sparks.explode(this.fxBudget(10), lev.handle.x, lev.y - 22); // spark burst at the knob
    }
    this.fireConduits("lever", lev.id); // P5: light the wire to its device (cosmetic)
    sfx.lever();
  }

  findGrappleTarget(p) {
    const cands = [];
    for (const a of this.anchors) {
      if (p.zip && p.zip.arrived && Math.abs(p.zip.x - a.x) < 4 && Math.abs(p.zip.y - a.y - 44 + 44) < 50 && p.zip.y === a.y) continue;
      cands.push({ kind: "anchor", x: a.x, y: a.y, obj: a, bias: 60 });
    }
    for (const l of this.levers) {
      if (!l.on && Math.abs(l.x - p.x) >= 54) cands.push({ kind: "lever", x: l.x, y: l.y, obj: l, bias: 40 });
    }
    if (this.crane && this.crane.state === "rest") {
      for (const pl of this.crane.plates) {
        if (pl.attached) cands.push({ kind: "plate", x: pl.img.x, y: pl.img.y, obj: pl, bias: 90 });
      }
    }
    // FL-001 rev2: the partner is never a plain-ACTION candidate — the buddy
    // rope lives on the DOWN+ACTION chord (see handleAction).
    // FL-002: the hook goes where you're looking — when any valid target lies
    // in the facing direction, targets behind are ignored; near-vertical ones
    // count as neutral (reachable only when nothing is ahead).
    let bestAhead = null, bestAheadScore = Infinity;
    let bestAny = null, bestAnyScore = Infinity;
    for (const c of cands) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d > PHYS.grappleRange || d < 30) continue;
      if (!this.hasLOS(p.x, p.y, c.x, c.y)) continue;
      const score = d - (c.y < p.y - 20 ? 50 : 0) - c.bias;
      if (score < bestAnyScore) {
        bestAnyScore = score;
        bestAny = c;
      }
      if (Math.abs(c.x - p.x) > 24 && Math.sign(c.x - p.x) === p.facing && score < bestAheadScore) {
        bestAheadScore = score;
        bestAhead = c;
      }
    }
    return bestAhead || bestAny;
  }

  fireGrapple(p, tgt) {
    if (tgt.kind === "anchor") {
      p.beginZip(tgt.x, tgt.y, true);
    } else if (tgt.kind === "lever") {
      this.ropeFlashes.push({ x1: p.x, y1: p.y, x2: tgt.x, y2: tgt.y, t: 200 });
      this.pullLever(tgt.obj);
      sfx.yank();
    } else if (tgt.kind === "plate") {
      this.ropeFlashes.push({ x1: p.x, y1: p.y, x2: tgt.x, y2: tgt.y, t: 200 });
      this.yankCranePlate(tgt.obj);
    } else if (tgt.kind === "partner") {
      // A grounded robot OR one HANGING from an anchor (p.zip.hang, arrived) is a
      // stable winch point, so DOWN+ACTION REELS THE BUDDY UP to it — this is what
      // "REEL YOUR BUDDY OUT" promises, and it now works after zipping up to a pit
      // anchor without first landing on a rim. Only genuine free-air (jumping/
      // falling, not anchored) falls back to using the buddy as a zip anchor.
      const anchoredHang = !!(p.zip && p.zip.hang && p.zip.arrived);
      if (p.grounded || anchoredHang) {
        tgt.obj.startReeled(p); // pull buddy up to me (grounded or hanging winch)
        this.sparks.explode(this.fxBudget(6), p.x, p.y - 8); // P11: sparks at the winch anchor
      } else {
        p.beginZip(tgt.obj.x, tgt.obj.y - 20, false); // free-air: buddy is my anchor
      }
    }
  }

  // U11 (F14): EVERY camera shake funnels through here so the SCREEN SHAKE
  // option scales the amplitude at the effect site (full = 1, soft = 0.4,
  // off = 0 → the shake call is skipped entirely). Durations are untouched.
  camShake(duration, amp) {
    const a = amp * uxShakeScale();
    this._lastShakeAmp = a;
    if (a > 0) this.cameras.main.shake(duration, a);
  }

  // --- heavy impact ------------------------------------------------------------
  heavyImpact(p, strong) {
    const radius = strong ? 100 : 74;
    const fx = p.x;
    const fy = p.body.bottom;
    sfx.stomp(fx, fy);
    // A4: impact splay + antenna boing overlay on the heavy landing. Cosmetic —
    // the stomp impact mechanics below are unchanged.
    const srig = this.anim && this.anim.enabled && this.anim.rigFor(p);
    if (srig) srig.startAction("stompland", p.facing);
    this.camShake(strong ? 160 : 90, strong ? 0.005 : 0.002);
    this.boom.explode(this.fxBudget(strong ? 20 : 10), fx, fy);
    // expanding shockwave ring + floor dust burst + a brief zoom-punch
    const ring = this.stompRing;
    this.tweens.killTweensOf(ring);
    ring.setVisible(true).setPosition(fx, fy).setAlpha(0.9)
      .setScale(strong ? 0.28 : 0.2);
    this.tweens.add({
      targets: ring, scale: strong ? 2.4 : 1.6, alpha: 0,
      duration: strong ? 420 : 320, ease: "cubic.out",
      onComplete: () => ring.setVisible(false),
    });
    this.dust.emitParticleAt(fx, fy, strong ? 16 : 10);
    this.zoomKick = Math.min(0.03, this.zoomKick + 0.03 * uxShakeScale()); // consumed in updateCamera (U11: option-scaled)
    this.crackies.children.each((tile) => {
      if (!tile.active) return;
      if (Math.hypot(tile.x - fx, tile.y - fy) < radius + 30) {
        this.grid[tile.gridY][tile.gridX] = ".";
        this.boom.explode(this.fxBudget(8), tile.x, tile.y);
        tile.destroy();
      }
    });
    this.bugs.children.each((bug) => {
      if (bug.active && Math.hypot(bug.x - fx, bug.y - fy) < radius + 20) this.squishBug(bug);
    });
    this.pods.forEach((pod) => {
      if (pod.active && Math.hypot(pod.x - fx, pod.y - fy) < radius + 30) this.stompPod(pod);
    });
  }

  squishBug(bug) {
    this.boom.explode(this.fxBudget(12), bug.x, bug.y); // keep the purple pop
    this.shards.explode(this.fxBudget(9), bug.x, bug.y); // + flung shell-shards
    // A5: rare (deterministic 1-in-4, per-bug hash) legs-up GHOST-PUFF variant — a
    // soft grey puff rises off the pop (pooled craneSmoke, routed through fxBudget so
    // it stays within the ~120 particle cap). Keeps the base pop; just adds the puff.
    if (bug._squishGhost) this.craneSmoke.explode(this.fxBudget(6), bug.x, bug.y - 4);
    sfx.squish(bug.x, bug.y);
    this.stampSplat(bug.x, bug.body ? bug.body.bottom - 2 : bug.y + 12);
    if (bug.glow) bug.glow.destroy();
    // A5: hide the rig's pooled feeler parts before the host is destroyed (the rig's
    // per-frame update early-returns once the host is gone, so they'd otherwise linger).
    const rig = this.anim && this.anim.rigFor(bug);
    if (rig && rig.onHostRemoved) rig.onHostRemoved();
    bug.destroy();
  }

  // P7: stamp a pooled splat decal at (x,y) and fade it over ~2s. Recycles a
  // fixed ring of images (no per-event allocation); the fade is an event-driven
  // alpha tween, not a per-frame animation.
  stampSplat(x, y) {
    const s = this.splatPool[this._splatHead];
    this._splatHead = (this._splatHead + 1) % this.splatPool.length;
    this.tweens.killTweensOf(s);
    s.setPosition(x, y).setScale(Phaser.Math.FloatBetween(0.85, 1.15))
      .setAngle(Phaser.Math.Between(-12, 12)).setAlpha(0.8).setVisible(true);
    this.tweens.add({
      targets: s, alpha: 0, duration: 2000, ease: "quad.in",
      onComplete: () => s.setVisible(false),
    });
  }

  // P6 phase afterimage: record the robot's current pose into its ring buffer
  // (overwrite in place — no allocation) and paint the 3 lagged ghost copies +
  // edge shimmer. `phasing` = a phase robot that is in a wall or moving. The
  // ghosts are plain sprite draws (cheap); the edge glow is WebGL-gated in the
  // Player ctor. Called once per live player each frame.
  updatePhaseArt(p, time) {
    const ring = p._poseRing;
    const slot = ring[p._poseHead];
    slot.x = p.x; slot.y = p.y; slot.flipX = p.flipX;
    slot.sx = p.scaleX; slot.sy = p.scaleY; slot.angle = p.angle;
    p._poseHead = (p._poseHead + 1) % ring.length;
    if (p._poseCount < ring.length) p._poseCount++;

    const phasing = p.skill === "phase" &&
      (p.inPhaseWall || Math.abs(p.body.velocity.x) > 20);
    const LAG = [4, 9, 14];
    const A = [0.2, 0.12, 0.06];
    for (let i = 0; i < p.phaseGhosts.length; i++) {
      const gh = p.phaseGhosts[i];
      if (!phasing || p._poseCount <= LAG[i]) { if (gh.visible) gh.setVisible(false); continue; }
      const idx = (p._poseHead - 1 - LAG[i] + ring.length * 2) % ring.length;
      const ps = ring[idx];
      gh.setTexture(p.texture.key).setPosition(ps.x, ps.y).setFlipX(ps.flipX)
        .setScale(ps.sx, ps.sy).setAngle(ps.angle).setAlpha(A[i]).setVisible(true);
    }
    // edge shimmer while actually inside the wall
    const pe = p.phaseEdge;
    if (p.inPhaseWall) {
      pe.setPosition(p.x, p.y).setFlipX(p.flipX).setScale(p.scaleX, p.scaleY)
        .setAngle(p.angle).setAlpha(0.4 + 0.28 * Math.sin(time / 60)).setVisible(true);
    } else if (pe.visible) pe.setVisible(false);
  }

  // Next pooled star sprite (cycles a fixed ring — no per-event allocation).
  takeStar() {
    const s = this.starPool[this._starHead];
    this._starHead = (this._starHead + 1) % this.starPool.length;
    this.tweens.killTweensOf(s);
    return s;
  }

  // A single star popping at a contact point (warden shove impact).
  popStar(x, y) {
    const s = this.takeStar().setPosition(x, y).setAlpha(1).setScale(0.3).setAngle(0).setVisible(true);
    this.tweens.add({
      targets: s, scale: 1.1, angle: 40, alpha: 0, duration: 340,
      ease: "quad.out", onComplete: () => s.setVisible(false),
    });
  }

  // A ring of dizzy-stars orbiting a fallen warden for ~1s (one proxy tween
  // repositions three pooled stars — no per-frame allocation).
  dizzyStars(x, y) {
    const stars = [this.takeStar(), this.takeStar(), this.takeStar()];
    stars.forEach((s) => s.setVisible(true).setAlpha(0.95).setScale(0.7));
    const spin = { a: 0 };
    this.tweens.add({
      targets: spin, a: Math.PI * 4, duration: 1000, ease: "linear",
      onUpdate: () => {
        stars.forEach((s, i) => {
          const ang = spin.a + (i * Math.PI * 2) / 3;
          s.setPosition(x + Math.cos(ang) * 20, y - 20 + Math.sin(ang) * 7);
        });
      },
      onComplete: () => stars.forEach((s) => s.setVisible(false)),
    });
  }

  // --- crane fight ---------------------------------------------------------------
  yankCranePlate(plate) {
    plate.attached = false;
    sfx.craneYank(plate.img.x, plate.img.y);
    this.tweens.add({
      targets: plate.img, x: plate.img.x + Phaser.Math.Between(-160, 160), y: plate.img.y - 200,
      angle: 720, alpha: 0, duration: 700, onComplete: () => plate.img.destroy(),
    });
    const c = this.crane;
    const podX = Phaser.Math.Clamp(c.body.x + Phaser.Math.Between(-80, 80), c.minX, c.maxX);
    const pod = this.add.image(podX, c.floorY - 20, "pod").setDepth(DEPTH.entity);
    this.tweens.add({ targets: pod, scale: { from: 1, to: 1.12 }, duration: 400, yoyo: true, repeat: -1 });
    // concentric warning pulse-rings radiating from the exposed pod. P7: the ring
    // tint escalates with how many cores are already down (static per-state art).
    const ringTex = c.podsStomped >= 2 ? "pod_ring_c2" : c.podsStomped >= 1 ? "pod_ring_c1" : "pod_ring";
    const ring = this.add.image(pod.x, pod.y, ringTex).setDepth(DEPTH.entity - 1).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: ring, scale: { from: 0.5, to: 1.8 }, alpha: { from: 0.75, to: 0 }, duration: 900, repeat: -1 });
    pod.ring = ring;
    this.pods.push(pod);
    this.game.events.emit("bb:blip", "KOBI: A core is EXPOSED! Somebody STAND ON— no wait, STOMP it! No! DON'T!");
  }

  stompPod(pod) {
    this.boom.explode(this.fxBudget(18), pod.x, pod.y);
    sfx.podCrunch(pod.x, pod.y);
    if (pod.ring) pod.ring.destroy();
    pod.destroy();
    const c = this.crane;
    c.podsStomped++;
    if (c.podsStomped >= 3) {
      c.state = "dead";
      c.hpText.setText("");
      this.craneDefeated = true;
      setMusicLayer("tension", false); // crane down -> calm coda
      sfx.craneDefeat(c.body.x, c.body.y);
      this.camShake(400, 0.006);
      this.tweens.add({ targets: c.body, y: c.floorY - 40, angle: 8, duration: 900, ease: "bounce.out" });
      // grey-out via texture swap (setTint no-ops on Canvas) + smoke + sparks
      c.body.setTexture("crane_dead");
      c.plates.forEach((pl) => pl.glow.setVisible(false));
      this.craneSmoke.explode(this.fxBudget(22), c.body.x, c.body.y);
      this.sparks.explode(this.fxBudget(26), c.body.x, c.body.y);
      this.game.events.emit("bb:blip", { text: this.def.blips.craneDown || "KOBI: MY CRANE!", mood: "angry" });
    }
  }

  updateCrane(delta) {
    const c = this.crane;
    if (!c) return;
    const dt = delta / 1000;
    const b = c.body;
    const g = this.craneGfx;
    g.clear();
    // trolley clamped to the rail above the body + a 1-segment cable down to it
    const tx = Phaser.Math.Clamp(b.x, c.railMin + 20, c.railMax - 20);
    c.trolley.setPosition(tx, c.railY);
    // Cable drawn as a catenary-sag curve (endpoints follow the trolley/body) + a hook
    // shackle where it meets the crane. P7 shipped a STATIC droop; A8 (crane_anim.js)
    // writes c._cableSwingX / c._cableSagY — a pendulum offset on the control point so
    // the cable visually LAGS + sways behind the trolley motion. Both default to 0 when
    // the rig is off (?animoff=1), so the P7 static cable renders byte-identically.
    {
      const x1 = tx, y1 = c.railY + 7, x2 = b.x, y2 = b.y - 30;
      const mx = (x1 + x2) / 2 + (c._cableSwingX || 0), my = (y1 + y2) / 2 + 16 + (c._cableSagY || 0); // sag droop + A8 swing-lag
      const pts = this._cranePts, n = pts.length - 1;
      for (let i = 0; i <= n; i++) {
        const t = i / n, u = 1 - t;
        pts[i].x = u * u * x1 + 2 * u * t * mx + t * t * x2;
        pts[i].y = u * u * y1 + 2 * u * t * my + t * t * y2;
      }
      g.lineStyle(4, 0x2a3350).strokePoints(pts, false, false);
      g.lineStyle(1.5, 0x6b78a8, 0.85).strokePoints(pts, false, false);
      // hook shackle at the body attach point
      g.lineStyle(2.5, 0x8892b8).strokeCircle(x2, y2 + 2, 3);
      g.lineBetween(x2, y2 + 5, x2, y2 + 9);
    }
    if (c.state === "dead") { c.plates.forEach((pl) => pl.glow.setVisible(false)); return; }
    // P7: hairline cracks deepen as cores are crunched — reads c.podsStomped
    // (0/1/2) only; the fight state machine + timings are untouched.
    const plateTex = c.podsStomped >= 2 ? "crane_plate_c2" : c.podsStomped >= 1 ? "crane_plate_c1" : "crane_plate";
    c.plates.forEach((pl) => {
      if (pl.attached) {
        pl.img.setPosition(b.x + pl.off.x, b.y + pl.off.y);
        if (pl._tex !== plateTex) { pl._tex = plateTex; pl.img.setTexture(plateTex); }
      }
      // magenta pulse behind yankable plates while the crane rests (canvas-safe)
      if (pl.attached && c.state === "rest") {
        const a = 0.35 + 0.35 * Math.sin(this.time.now / 130);
        pl.glow.setPosition(pl.img.x, pl.img.y).setAlpha(a).setVisible(true);
      } else pl.glow.setVisible(false);
    });
    c.hpText.setPosition(b.x, b.y - 58);
    c.hpText.setText(c.state === "rest" ? "YANK A PLATE!" : "");
    // an exposed core pod pulses a warning alarm until it's crunched
    if (this.pods.some((p) => p.active)) sfx.podAlarm(b.x, c.floorY);
    // telegraph/slam: project a hazard warning-stripe column onto the floor
    if (c.state === "telegraph" || c.state === "slam") {
      const zw = 124, top = b.y + 36, h = c.floorY - top;
      if (h > 0) {
        for (let sx = b.x - zw / 2; sx < b.x + zw / 2; sx += 16) {
          g.fillStyle(COLORS.hazard, 0.16).fillRect(sx, top, 8, h);
        }
        g.lineStyle(2, COLORS.hazard, 0.5).strokeRect(b.x - zw / 2, top, zw, h);
      }
    }
    c.timer -= delta;
    switch (c.state) {
      case "patrol": {
        const target = this.nearestAlivePlayerX(b.x);
        const tx = Phaser.Math.Clamp(target, c.minX, c.maxX);
        const step = Phaser.Math.Clamp(tx - b.x, -150 * dt, 150 * dt);
        b.x += step;
        if (Math.abs(step) > 0.5) sfx.craneServo(b.x, b.y); // rate-limited patrol servo
        if (c.timer <= 0) {
          c.state = "telegraph";
          c.timer = 650;
          b.setTint(0xffb3b3);
          sfx.craneAlarm(b.x, b.y); // two-tone "I'm about to SLAM" telegraph
        }
        break;
      }
      case "telegraph":
        if (c.timer <= 0) {
          c.state = "slam";
          b.clearTint();
        }
        break;
      case "slam": {
        b.y += 720 * dt;
        const bottom = b.y + 36;
        for (const p of this.players) {
          if (p.dead || p.invuln > 0) continue;
          if (Math.abs(p.x - b.x) < 62 && Math.abs(p.y - b.y) < 60) {
            if (p.skill === "heavy") this.boom.explode(4, p.x, p.y - 30);
            else this.killPlayer(p);
          }
        }
        if (bottom >= c.floorY - 6) {
          c.state = "rest";
          c.timer = 2600;
          sfx.craneSlam(b.x, c.floorY);
          this.camShake(120, 0.004);
          // impact shockwave ring + dust burst at the floor
          this.slamRing.setPosition(b.x, c.floorY).setScale(0.2).setAlpha(0.9).setVisible(true);
          this.tweens.killTweensOf(this.slamRing);
          this.tweens.add({
            targets: this.slamRing, scale: 1.7, alpha: 0, duration: 420, ease: "quad.out",
            onComplete: () => this.slamRing.setVisible(false),
          });
          this.boom.explode(this.fxBudget(14), b.x, c.floorY);
          this.dust.explode(this.fxBudget(10), b.x, c.floorY);
        }
        break;
      }
      case "rest":
        if (c.timer <= 0) c.state = "rise";
        break;
      case "rise":
        b.y -= 300 * dt;
        if (b.y <= c.hoverY) {
          b.y = c.hoverY;
          c.state = "patrol";
          c.timer = 2000;
        }
        break;
    }
  }

  nearestAlivePlayerX(x) {
    const alive = this.players.filter((p) => !p.dead);
    if (!alive.length) return x;
    return alive.reduce((a, b) => (Math.abs(a.x - x) < Math.abs(b.x - x) ? a : b)).x;
  }

  // --- death & respawn --------------------------------------------------------
  killPlayer(p) {
    if (p.dead || p.invuln > 0 || this.complete) return;
    this._deaths++; // U8: count respawns (display-only; guarded above against dupes)
    // U9 (F16): death streak on the CURRENT checkpoint segment. 3 respawns (either
    // player) since the last checkpoint change / level entry -> ONE kind-funny KOBI
    // line, at most once per segment. Display-only (queued blip); if the session
    // pool is exhausted, u9Pick returns null and the line is simply dropped.
    this._segDeaths++;
    if (this._segDeaths >= 3 && !this._segStreakFired) {
      this._segStreakFired = true;
      const line = u9Pick(U9_STREAK_LINES);
      if (line) {
        this._u9StreakCount++;
        this._u9LastStreak = line;
        this.game.events.emit("bb:blip", line);
      }
    }
    if (p.carrying) this.detachCarry(p, p.carrying, false);
    if (p.carriedBy) this.detachCarry(p.carriedBy, p, false);
    p.clearStates();
    p.dead = true;
    p.body.enable = false;
    p.setVisible(false);
    sfx.die(p.x, p.y);
    this.boom.explode(this.fxBudget(16), p.x, p.y);
    this.bolts.explode(this.fxBudget(8), p.x, p.y); // + a few bolt/gear shards
    // A4: scatter 5 pooled DRAWN parts with the boom. Pure visual overlay on the
    // SACRED death->respawn timing below — it reads p.x/p.y and never delays or
    // moves the respawn (the beat routes depend on that timing being byte-exact).
    if (this.anim && this.anim.enabled) this.anim.deathScatter.scatter(p);
    this.time.delayedCall(900, () => {
      const cp = this.cpPos[p.idx];
      p.body.reset(cp.x, cp.y - 8); // slight lift so a big body never spawns embedded
      p.setVelocity(0, 0);
      p.dead = false;
      p.body.enable = true;
      p.setVisible(true);
      p.invuln = 1500;
      p.wasGround = false;
      sfx.respawn(); // beam back in
      this.respawnFx(cp.x, cp.y, p); // beam-in column + materialize blink
      // A4: the beam gathers the scattered parts to the checkpoint and snaps them
      // in. Reads the checkpoint the respawn already chose — moves nothing itself.
      if (this.anim && this.anim.enabled) this.anim.deathScatter.reassemble(p, cp.x, cp.y);
    });
  }

  // Beam-in column that scales down onto the checkpoint + a materialize blink on
  // the robot. Uses pooled beam images; the blink rides p.alpha during invuln
  // (update() only forces alpha once invuln clears, so it never fights the tween).
  respawnFx(x, y, p) {
    const beam = this.respawnBeams[this._beamHead];
    this._beamHead = (this._beamHead + 1) % this.respawnBeams.length;
    this.tweens.killTweensOf(beam);
    beam.setVisible(true).setPosition(x, y + 22).setAlpha(0.9)
      .setScale(0.5, 1.4);
    this.tweens.add({
      targets: beam, scaleX: 0.15, scaleY: 0.2, alpha: 0,
      duration: 380, ease: "cubic.in",
      onComplete: () => beam.setVisible(false),
    });
    // P11: ground ring — a cyan-white halo expands on the floor as the beam lands
    const ring = this._groundRings[this._groundRingHead];
    this._groundRingHead = (this._groundRingHead + 1) % this._groundRings.length;
    this.tweens.killTweensOf(ring);
    ring.setVisible(true).setPosition(x, y + 20).setAlpha(0.85).setScale(0.3);
    this.tweens.add({
      targets: ring, scale: 1.5, alpha: 0, duration: 430, ease: "cubic.out",
      onComplete: () => ring.setVisible(false),
    });
    // U11 FLASH soft: the materialize blink keeps all 4 beats (meaning-bearing —
    // it reads as invulnerable) but with less contrast and a slower ramp.
    const fs = uxFlashScale();
    p.setAlpha(fs < 1 ? 0.5 : 0.15);
    this.tweens.add({ targets: p, alpha: 1, duration: 90 / fs, yoyo: true, repeat: 3,
      onComplete: () => p.setAlpha(1) });
  }

  // A brief expanding ripple ring where a robot crosses a phase-wall boundary.
  phaseRipple(x, y) {
    const r = this.phaseRipples[this._rippleHead];
    this._rippleHead = (this._rippleHead + 1) % this.phaseRipples.length;
    this.tweens.killTweensOf(r);
    r.setVisible(true).setPosition(x, y).setAlpha(0.7).setScale(0.25);
    this.tweens.add({
      targets: r, scale: 1.5, alpha: 0, duration: 420, ease: "cubic.out",
      onComplete: () => r.setVisible(false),
    });
  }

  // --- P11 FX helpers ----------------------------------------------------------
  // Shared alive-particle BUDGET GUARD. Returns how many of `want` particles may
  // be emitted right now without blowing the ~120 shared cap (0 = suppress).
  // Called at emit time only (never per-frame idle), so summing alive counts is
  // cheap; the big bursty emitters route their counts through here.
  fxBudget(want) {
    let alive = 0;
    const es = this._budgetEmitters;
    for (let i = 0; i < es.length; i++) alive += es[i].getAliveParticleCount();
    const room = PARTICLES.budget - alive;
    if (room <= 0) return 0;
    return room < want ? room : want;
  }

  // Probe/telemetry hook: current summed alive count across the budgeted emitters.
  fxAlive() {
    let alive = 0;
    const es = this._budgetEmitters;
    for (let i = 0; i < es.length; i++) alive += es[i].getAliveParticleCount();
    return alive;
  }

  // Vertical gold light-sweep fired when a checkpoint activates (celebration).
  checkpointSweep(x, yTop) {
    const s = this._cpSweeps[this._cpSweepHead];
    this._cpSweepHead = (this._cpSweepHead + 1) % this._cpSweeps.length;
    this.tweens.killTweensOf(s);
    // origin bottom: rises from the lamp base upward as it fades
    s.setVisible(true).setPosition(x, yTop + 20).setAlpha(0.9).setScale(1, 0.2);
    this.tweens.add({
      targets: s, scaleY: 1.15, alpha: 0, y: yTop - 6,
      duration: 460, ease: "cubic.out",
      onComplete: () => s.setVisible(false),
    });
  }

  // Advance the thrown-buddy dotted trail: stamp a fading dot behind any buddy
  // still inside its 400ms post-throw window. Pooled ring-buffer, zero alloc.
  updateThrowTrails(delta) {
    this._trailCd -= delta;
    const stamp = this._trailCd <= 0;
    if (stamp) this._trailCd = 34; // ~1 dot every other frame
    for (const p of this.players) {
      if (p._throwTrail > 0) {
        p._throwTrail -= delta;
        if (stamp && !p.carriedBy) {
          const d = this._trailDots[this._trailHead];
          this._trailHead = (this._trailHead + 1) % this._trailDots.length;
          this.tweens.killTweensOf(d);
          d.setTexture(p.idx === 0 ? "fxdot0" : "fxdot1")
            .setPosition(p.x, p.y).setScale(0.9).setAlpha(0.8).setVisible(true);
          this.tweens.add({
            targets: d, alpha: 0, scale: 0.3, duration: 400, ease: "quad.out",
            onComplete: () => d.setVisible(false),
          });
        }
        if (p._throwTrail <= 0) p._throwTrail = 0;
      }
    }
  }

  // --- U1 coach system -----------------------------------------------------------
  // Condition-driven, once-per-level-per-trigger, auto-dismissing glyph bubbles.
  // Everything below is READ-ONLY over gameplay: it samples state, never mutates
  // it, adds no bb:* events, and is skipped in the tutorial. Bubbles + re-show
  // hints are pooled here in create() and reconfigured on trigger (no per-frame
  // object allocation; heavy checks run on a shared ~4Hz timer).
  buildCoach() {
    const mkBubble = () => {
      const bg = this.add.graphics();
      const texts = [];
      for (let i = 0; i < 6; i++) {
        texts.push(this.add.text(0, 0, "", { fontFamily: FONT, fontStyle: "bold" })
          .setOrigin(0.5).setVisible(false));
      }
      const c = this.add.container(0, 0, [bg, ...texts]).setDepth(DEPTH.fx + 3).setVisible(false);
      return { c, bg, texts, active: false, key: null, until: 0, guard: 0, follow: null, halfH: 24, halfW: 95 };
    };
    // Faint re-show clones of the floating "SPACE/L = ACTION" hint (U1(d)).
    const reshow = this.players.map((p) => {
      const color = p.idx === 0 ? COLORS.beep : COLORS.boop;
      const hw = p.idx === 0 ? 74 : 56;
      const g = this.add.graphics();
      g.fillStyle(COLORS.hudBg, 0.92).fillRoundedRect(-hw, -15, hw * 2, 30, 8);
      g.lineStyle(2, color).strokeRoundedRect(-hw, -15, hw * 2, 30, 8);
      const t = this.add.text(0, 0, p.idx === 0 ? "SPACE = ACTION" : "L = ACTION", {
        fontFamily: FONT, fontSize: FS.body, fontStyle: "bold",
        color: p.idx === 0 ? "#4dc9ff" : "#ffa14d",
      }).setOrigin(0.5);
      return this.add.container(0, 0, [g, t]).setDepth(DEPTH.fx + 3).setVisible(false).setAlpha(0.3);
    });
    this.coach = {
      bubbles: this.players.map(mkBubble),
      reshow,
      reshowUntil: [0, 0],
      firedRope: [false, false],
      firedUpzip: [false, false],
      actEdge: [false, false],
      nextCheck: 0,
      lastCheck: 0,
    };
    for (const p of this.players) { p._coachIdle = 0; p._lastActPress = 0; p._shimmerPushT = 0; p._ductPushT = 0; }
    this._handholdCd = 0; // U5 (F2): shared cooldown for the shimmer-wall hand-hold hint
    this._ductHintCd = 0; // U12: shared cooldown for the vent-pinch "only tiny fits" hint
    // U13: co-op deep-pit rescue hint state (in-memory, per level instance).
    // Two sibling cases share the pit zone + the 250ms check timer:
    //   * BOTH-stuck  → teach the in-pit grapple to zip UP to the anchor (_pit*).
    //   * ONE-stuck, partner OUT & grapple-capable → teach that partner the
    //     DOWN+ACTION reel-out (_pitReel*). Each latches + cools independently.
    this._pitNextCheck = 0; this._pitStuckSince = 0; this._pitHintFired = false; this._pitHintCd = 0;
    this._pitReelSince = 0; this._pitReelFired = false; this._pitReelCd = 0;
    this._pitReelMeta = null; // passive probe observability (display-only)
  }

  drawCoachIcon(g, kind, cx, cy, idx, extra) {
    if (kind === "rope") {
      g.lineStyle(3, COLORS.neon, 1);
      g.lineBetween(cx - 7, cy - 7, cx + 3, cy + 3);
      g.strokeCircle(cx + 5, cy + 6, 5);
      g.fillStyle(COLORS.neon, 1).fillCircle(cx - 7, cy - 7, 2.5);
    } else if (kind === "up") {
      const col = idx === 0 ? COLORS.beep : COLORS.boop;
      g.fillStyle(col, 1);
      g.fillTriangle(cx, cy - 9, cx - 8, cy + 1, cx + 8, cy + 1);
      g.fillRect(cx - 3, cy + 1, 6, 8);
    } else if (kind === "lever") {
      // mini lever: base hub + magenta-knobbed handle (mirrors lever_handle glyph)
      g.fillStyle(0x2a3350, 1).fillRoundedRect(cx - 8, cy + 5, 16, 5, 2);
      g.lineStyle(3, 0x8fa3d9, 1).lineBetween(cx - 4, cy + 7, cx + 4, cy - 7);
      g.fillStyle(COLORS.magenta, 0.3).fillCircle(cx + 4, cy - 8, 6);
      g.fillStyle(COLORS.magenta, 1).fillCircle(cx + 4, cy - 8, 4);
    } else if (kind === "key") {
      // gold key: bow ring + shaft + a tooth (mirrors the "key" texture)
      g.lineStyle(3, 0xffd94d, 1).strokeCircle(cx - 5, cy - 4, 4.5);
      g.lineStyle(3, 0xffd94d, 1).lineBetween(cx - 2, cy - 1, cx + 8, cy + 9);
      g.lineStyle(3, 0xffd94d, 1).lineBetween(cx + 6, cy + 7, cx + 9, cy + 4);
    } else if (kind === "plate") {
      // pressure plate slab + lit LED strip (mirrors the "plate_on" texture)
      g.fillStyle(0x2a3350, 1).fillRect(cx - 11, cy + 2, 22, 5);
      g.fillStyle(0x1c2742, 1).fillRoundedRect(cx - 9, cy - 3, 18, 6, 2);
      g.fillStyle(COLORS.green, 1).fillRect(cx - 6, cy - 1, 12, 2);
    } else if (kind === "clock") {
      // amber clock face with hands
      g.lineStyle(2.5, COLORS.amber, 1).strokeCircle(cx, cy, 8.5);
      g.lineStyle(2, COLORS.amber, 1);
      g.lineBetween(cx, cy, cx, cy - 6);
      g.lineBetween(cx, cy, cx + 4, cy + 1);
    } else if (kind === "arrow") {
      // filled triangle pointing along `extra` (radians), toward the driving lever
      const a = extra || 0, L = 11, W = 6;
      const tx = cx + Math.cos(a) * L, ty = cy + Math.sin(a) * L;
      const bx = cx - Math.cos(a) * 5, by = cy - Math.sin(a) * 5;
      const px = -Math.sin(a), py = Math.cos(a);
      g.fillStyle(COLORS.neon, 1);
      g.fillTriangle(tx, ty, bx + px * W, by + py * W, bx - px * W, by - py * W);
      g.lineStyle(3, COLORS.neon, 1).lineBetween(cx - Math.cos(a) * 9, cy - Math.sin(a) * 9, bx, by);
    } else if (kind === "handhold") {
      // U5 (F2): two little robots holding hands — P1 beep-blue + P2 boop-orange,
      // arms meeting at a bright clasp. Drawn, canvas-safe (no tint).
      const drawBot = (bx, col) => {
        g.fillStyle(col, 1);
        g.fillRoundedRect(bx - 4, cy - 3, 8, 9, 2); // body
        g.fillRoundedRect(bx - 3, cy - 9, 6, 5, 1.5); // head
      };
      drawBot(cx - 7, COLORS.beep);
      drawBot(cx + 7, COLORS.boop);
      g.lineStyle(2, 0xc6d2f2, 1).lineBetween(cx - 3, cy + 1, cx + 3, cy + 1); // arms
      g.fillStyle(0xffffff, 1).fillCircle(cx, cy + 1, 2); // clasped hands
    } else if (kind === "pinch") {
      // U12: a vent pinch — steel duct lip above, a mint Tiny-coloured bot
      // squeezing through the crawl gap beneath it. Drawn, canvas-safe (no tint).
      g.fillStyle(0x2a3350, 1).fillRoundedRect(cx - 10, cy - 10, 20, 8, 2); // duct lip
      g.lineStyle(1.5, 0x44548c, 1).strokeRoundedRect(cx - 10, cy - 10, 20, 8, 2);
      g.fillStyle(0x9dffc4, 1); // SKILL_INFO.tiny colour
      g.fillRoundedRect(cx - 2.5, cy - 1, 5, 3, 1); // tiny head ducking under the lip
      g.fillRoundedRect(cx - 3, cy + 2, 6, 6, 1.5); // tiny body in the gap
    }
  }

  // Configure + reveal a pooled bubble. Reuses addGlyphs conventions (keycap
  // face + beep/boop border + bold letter) but sizes each cap to its label so
  // multi-char caps like SPACE fit. All drawing happens here (on trigger), never
  // per frame.
  coachShow(idx, { tokens, caption, follow, key, dur, colorP }) {
    if (!uxHints()) return; // U11 (F7-adjacent): every U1/U2/U5 bubble respects HINTS
    const b = this.coach.bubbles[idx];
    const bg = b.bg;
    bg.clear();
    const beepHex = "#4dc9ff", boopHex = "#ffa14d";
    const GAP = 5, CAPH = 30, PAD = 11;
    const els = [];
    let ti = 0;
    for (const tk of tokens) {
      if (tk.icon) { els.push({ type: "icon", icon: tk.icon, w: 24, angle: tk.angle }); continue; }
      if (tk.pips) {
        // weight pips: `have` lit of `need` (drawn on the bg graphics, no images)
        els.push({ type: "pips", have: tk.have, need: tk.need, w: tk.need * 13 + 2 });
        continue;
      }
      if (tk.plus) {
        const t = b.texts[ti++].setText("+").setFontSize(15).setColor("#8fa3d9").setVisible(true);
        els.push({ type: "text", t, w: t.width + 6 });
        continue;
      }
      if (tk.label) {
        const t = b.texts[ti++].setText(tk.label).setFontSize(14).setColor("#c6d2f2").setVisible(true);
        els.push({ type: "text", t, w: t.width + 6 });
        continue;
      }
      const pp = tk.p != null ? tk.p : (/[←→↑↓]/.test(tk.cap) ? 1 : idx);
      const hex = pp === 0 ? beepHex : boopHex;
      const t = b.texts[ti++].setText(tk.cap).setFontSize(18).setColor(hex).setVisible(true);
      els.push({ type: "cap", t, w: Math.max(30, t.width + 16), col: pp === 0 ? COLORS.beep : COLORS.boop });
    }
    let capT = null;
    if (caption) capT = b.texts[ti++].setText(caption).setFontSize(13).setColor("#8fa3d9").setVisible(true);
    for (let i = ti; i < b.texts.length; i++) b.texts[i].setVisible(false);

    let rowW = 0;
    for (const e of els) rowW += e.w;
    rowW += GAP * (els.length - 1);
    const contentW = Math.max(rowW, capT ? capT.width : 0);
    const panelW = contentW + PAD * 2;
    const panelH = (caption ? CAPH + 4 + 16 : CAPH) + 12;
    b.halfH = panelH / 2;
    b.halfW = panelW / 2; // U12: read by the overlap audit (passive)
    const rowY = caption ? -panelH / 2 + 6 + CAPH / 2 : 0;
    const capY = caption ? panelH / 2 - 6 - 8 : 0;

    const col = colorP === 1 ? COLORS.boop : (colorP === 0 ? COLORS.beep : COLORS.neon);
    bg.fillStyle(COLORS.hudBg, 0.92).fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 10);
    bg.lineStyle(2, col, 0.9).strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 10);

    let x = -rowW / 2;
    for (const e of els) {
      const cx = x + e.w / 2;
      if (e.type === "cap") {
        bg.fillStyle(0x1a2338, 0.95).fillRoundedRect(cx - e.w / 2 + 1, rowY - CAPH / 2 + 1, e.w - 2, CAPH - 2, 7);
        bg.lineStyle(2.5, e.col, 1).strokeRoundedRect(cx - e.w / 2, rowY - CAPH / 2, e.w, CAPH, 7);
        e.t.setPosition(cx, rowY);
      } else if (e.type === "text") {
        e.t.setPosition(cx, rowY);
      } else if (e.type === "icon") {
        this.drawCoachIcon(bg, e.icon, cx, rowY, idx, e.angle);
      } else if (e.type === "pips") {
        // required-vs-current weight: filled amber pip = present, hollow = missing
        const pw = 11, pgap = 2;
        let px = cx - (e.need * (pw + pgap) - pgap) / 2;
        for (let k = 0; k < e.need; k++) {
          if (k < e.have) {
            bg.fillStyle(COLORS.amber, 1).fillRoundedRect(px, rowY - 6, pw, 12, 3);
          } else {
            bg.fillStyle(0x39415e, 1).fillRoundedRect(px, rowY - 6, pw, 12, 3);
            bg.lineStyle(1.5, 0x5a6aa0, 1).strokeRoundedRect(px, rowY - 6, pw, 12, 3);
          }
          px += pw + pgap;
        }
      }
      x += e.w + GAP;
    }
    if (capT) capT.setPosition(0, capY);

    b.active = true;
    b.key = key;
    b.follow = follow;
    b.until = this.time.now + dur;
    b.guard = this.time.now + 160; // ignore the very press that spawned it
    b.c.setVisible(true).setAlpha(0);
    this.tweens.killTweensOf(b.c);
    this.tweens.add({ targets: b.c, alpha: 1, duration: 200 });
  }

  showThrowHint(p) {
    // U11: uxHints() BEFORE the session latch so a hints-off pickup doesn't
    // silently burn the once-per-session throw hint.
    if (!this.coach || !this.coachU1 || !uxHints() || throwHintShownSession) return;
    throwHintShownSession = true;
    const i = p.idx;
    const jumpCap = i === 0 ? "W" : "↑";
    const actCap = i === 0 ? "SPACE" : "L";
    this.coachShow(i, {
      tokens: [{ cap: actCap, p: i }, { label: "THROW" }],
      caption: `hold ${jumpCap} = high toss`,
      follow: { obj: p, dy: -p.displayHeight / 2 - 30 },
      key: "throw", dur: 5000, colorP: i,
    });
  }

  // U1(a) accept-condition mirror of the DOWN-chord buddy reel (read-only).
  coachBuddyReelable(p) {
    const q = p.partner;
    if (!q || q.dead || q.carriedBy || q.zip || q.reeled) return false;
    // The reel only pulls the buddy UP from a stable winch point — grounded OR
    // hanging from an anchor. In genuine free-air the same chord zips to the buddy
    // instead, so don't promise a "reel" the current state can't deliver.
    if (!p.grounded && !(p.zip && p.zip.hang && p.zip.arrived)) return false;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= 72 || d > PHYS.grappleRange) return false;
    return this.hasLOS(p.x, p.y, q.x, q.y) || this.hasLOS(p.x, p.y - 44, q.x, q.y - 24);
  }

  // U1(b) accept-condition mirror of the UP-chord anchor zip (read-only).
  coachAnchorAbove(p) {
    for (const a of this.anchors) {
      if (Math.abs(a.x - p.x) > 130 || a.y > p.y - 40) continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d > PHYS.grappleRange || d < 30) continue;
      if (!this.hasLOS(p.x, p.y, a.x, a.y)) continue;
      return true;
    }
    return false;
  }

  // U1(d): is this player next to something its action key would operate?
  coachAdjacentActionable(p) {
    if (!p.skill && this.pedestals.some((d) => !d.taken && Math.abs(d.x - p.x) < 56 && Math.abs(d.y - p.y) < 70)) return true;
    if (this.levers.some((l) => !l.on && Math.abs(l.x - p.x) < 54 && Math.abs(l.y - p.y) < 64)) return true;
    if (this.doors.some((d) => !d.open && p.x > d.zone.x - 60 && p.x < d.zone.x + d.zone.width + 60 &&
      p.y > d.zone.y - 20 && p.y < d.zone.y + d.zone.height + 30)) return true;
    const q = p.partner;
    if (q && !q.dead && !q.carriedBy && !q.carrying && p.grounded &&
      Math.abs(q.x - p.x) < 58 && Math.abs(q.y - p.y) < 60) return true;
    return false;
  }

  updateCoach(time) {
    const co = this.coach;
    if (!co) return;
    // U13 (tutorial-only): co-op deep-pit rescue hint. Passive reads; gated to a
    // level that DECLARES a pit-hint zone (only the tutorial does — never campaign).
    if (this.def.pitHint) this.updatePitHint(time);
    const cam = this.cameras.main;
    const scH = this.scale.height;
    const zoom = cam.zoom || 1;
    const wv = cam.worldView;

    // Reposition + expire active bubbles every frame (cheap; no allocation).
    for (let i = 0; i < this.players.length; i++) {
      const b = co.bubbles[i];
      if (!b.active) continue;
      const f = b.follow;
      let kill = time > b.until;
      if (!kill && co.actEdge[i] && time > b.guard) kill = true;
      if (!kill && f.obj && (f.obj.dead || (b.key === "rope" && f.obj.carriedBy))) kill = true;
      if (kill) { b.active = false; b.follow = null; b.c.setVisible(false); this.tweens.killTweensOf(b.c); continue; }
      let wx = f.obj ? f.obj.x + (f.dx || 0) : f.x;
      let wy = f.obj ? f.obj.y + (f.dy || 0) : f.y;
      // Keep clear of the KOBI blip bar (bottom of screen) and the top edge.
      const maxWorldY = wv.y + (scH - 104) / zoom - b.halfH;
      const minWorldY = wv.y + 34 / zoom + b.halfH;
      wy = Phaser.Math.Clamp(wy, minWorldY, maxWorldY);
      b.c.setPosition(wx, wy);
    }

    // Re-show hints: follow their robot, expire at 4s or on an action press.
    for (let i = 0; i < this.players.length; i++) {
      const r = co.reshow[i];
      if (!r.visible) continue;
      if (time > co.reshowUntil[i] || co.actEdge[i]) { r.setVisible(false); continue; }
      const p = this.players[i];
      r.setPosition(p.x, p.y - 64 - i * 34 + Math.sin(time / 300) * 4);
    }

    // Heavy trigger evaluation throttled to ~4Hz on a shared timer. Gated off in
    // the tutorial (which teaches every chord explicitly) — U2 bump bubbles still
    // use this pool, but the U1 rope/up-zip/re-show triggers stay disabled there.
    // U11: HINTS off suppresses trigger evaluation entirely (no bubble, no
    // firedRope/firedUpzip latch burned — flipping hints back on re-arms them).
    if (this.coachU1 && uxHints() && time >= co.nextCheck) {
      const elapsed = co.lastCheck ? (time - co.lastCheck) / 1000 : 0.25;
      co.lastCheck = time;
      co.nextCheck = time + 250;
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (p.dead) { p._coachIdle = 0; continue; }
        const pad = p.pad;
        const moveKey = p.keys.left.isDown || p.keys.right.isDown || p.keys.jump.isDown ||
          p.keys.down.isDown || p.keys.act.isDown || (p.keys.actAlt && p.keys.actAlt.isDown) ||
          (pad && (pad.left.isDown || pad.right.isDown || pad.jump.isDown || pad.down.isDown || pad.act.isDown));
        const idle = p.grounded && !p.carriedBy && !p.carrying && !p.zip && !p.reeled &&
          Math.abs(p.body.velocity.x) < 8 && !moveKey;
        p._coachIdle = idle ? p._coachIdle + elapsed : 0;

        const b = co.bubbles[i];
        // (a) rope hint, then (b) up-zip hint — one bubble per player at a time.
        if (p.skill === "grapple" && p._coachIdle > 2 && !b.active) {
          if (!co.firedRope[i] && this.coachBuddyReelable(p)) {
            const q = p.partner;
            co.firedRope[i] = true;
            const tokens = i === 0
              ? [{ icon: "rope" }, { cap: "S" }, { plus: true }, { cap: "SPACE" }]
              : [{ icon: "rope" }, { cap: "↓" }, { plus: true }, { cap: "L", p: 1 }];
            this.coachShow(i, {
              tokens, caption: "REEL YOUR BUDDY",
              follow: { obj: q, dy: -q.displayHeight / 2 - 30 },
              key: "rope", dur: 5000, colorP: i,
            });
          } else if (!co.firedUpzip[i] && this.coachAnchorAbove(p)) {
            co.firedUpzip[i] = true;
            const tokens = i === 0
              ? [{ icon: "up" }, { cap: "W" }, { plus: true }, { cap: "SPACE" }]
              : [{ icon: "up" }, { cap: "↑" }, { plus: true }, { cap: "L", p: 1 }];
            this.coachShow(i, {
              tokens, caption: "ZIP STRAIGHT UP",
              follow: { obj: p, dy: -p.displayHeight / 2 - 30 },
              key: "upzip", dur: 5000, colorP: i,
            });
          }
        }

        // (d) re-show the action hint: only after the original was dismissed
        // (first press), when idle-adjacent to something actionable for >20s.
        if (!co.reshow[i].visible && this.actionHints[i] == null &&
          (time - p._lastActPress) > 20000 && this.coachAdjacentActionable(p)) {
          co.reshow[i].setVisible(true).setAlpha(0.3).setPosition(p.x, p.y - 64 - i * 34);
          co.reshowUntil[i] = time + 4000;
          p._lastActPress = time; // re-arm the 20s window
        }
      }
    }

    co.actEdge[0] = false;
    co.actEdge[1] = false;
  }

  // --- U13: co-op deep-pit rescue hint (tutorial-only) --------------------------
  // The tutorial's Station-4 grapple gap is a 4-tile-deep pit floored by the world
  // bottom: a first-timer can end up standing at the bottom with no jump-height way
  // out (a soft-lock feeling). Two sibling escapes get taught, ONE coherent picker:
  //   CASE A — BOTH robots stuck at the bottom (~2.2s): teach the in-pit GRAPPLE to
  //     zip UP to the anchor above the pit (it can then reel its buddy up).
  //   CASE B — ONE robot stuck while its GRAPPLE partner stands OUT on the edge
  //     holding the hook (the more common report): teach that OUT partner the
  //     DOWN+ACTION reel-out. coachBuddyReelable(out) is EXACTLY "out can reel its
  //     buddy" (buddy within (72,grappleRange], LOS) — so the taught chord always
  //     works. Debounced ~1.6s.
  // A binds the in-pit grapple, B binds the OUT grapple, so they never target the
  // same intent at once; each latches once per episode with its own cooldown and
  // re-arms only after nobody is left in the pit band. ALL reads are passive
  // (positions/velocity/flags/skill); no physics, geometry, or save is touched.
  // Gated on def.pitHint (tutorial-only) + uxHints(); throttled to ~4Hz.
  updatePitHint(time) {
    if (time < this._pitNextCheck) return;
    this._pitNextCheck = time + 250;
    const ph = this.def.pitHint;
    const x0 = ph.x * TILE, x1 = (ph.x2 + 1) * TILE, yLine = ph.yRow * TILE;
    // "in the pit": inside the pit's x-band, below the floor line, grounded, not on
    // a rope/zip/carry, and roughly still.
    const inPit = (p) => !p.dead && p.grounded && !p.zip && !p.reeled && !p.carriedBy &&
      !p.carrying && p.x > x0 && p.x < x1 && p.y > yLine && Math.abs(p.body.velocity.x) < 30;
    const hints = uxHints();
    const two = this.players.length >= 2;
    const stuck = two ? this.players.filter(inPit) : [];

    // CASE A — BOTH stuck: teach the in-pit grapple to zip UP to the anchor.
    if (hints && stuck.length === 2) {
      this._pitReelSince = 0; // the asymmetric case can't co-apply while both sit
      if (!this._pitStuckSince) this._pitStuckSince = time;
      else if (!this._pitHintFired && time - this._pitStuckSince > 2200 && time > this._pitHintCd) {
        this._pitHintFired = true;
        this._pitHintCd = time + 12000; // rate-limit re-fires
        this.showPitHint();
      }
      return;
    }
    this._pitStuckSince = 0;

    // CASE B — exactly ONE stuck, and its partner is OUT of the pit, GRAPPLE-skilled,
    // and can reel the stuck buddy (coachBuddyReelable). Teach that partner the reel.
    let reelOut = null;
    if (hints && stuck.length === 1) {
      const out = stuck[0].partner;
      if (out && !out.dead && out.skill === "grapple" && !inPit(out) &&
        out.y < yLine && this.coachBuddyReelable(out)) reelOut = out;
    }
    if (reelOut) {
      if (!this._pitReelSince) this._pitReelSince = time;
      else if (!this._pitReelFired && time - this._pitReelSince > 1600 && time > this._pitReelCd) {
        this._pitReelFired = true;
        this._pitReelCd = time + 12000; // rate-limit re-fires
        this.showReelHint(reelOut);
      }
      return;
    }
    this._pitReelSince = 0;

    // Neither case applies. Re-arm + clear each fired hint once NOBODY is left in
    // the pit band (the stuck buddy was reeled/climbed out — they escaped).
    const anyInBand = this.players.some((p) => !p.dead && p.x > x0 && p.x < x1 && p.y > yLine);
    if (!anyInBand) {
      if (this._pitHintFired) { this._pitHintFired = false; this.clearPitHint("pithint"); }
      if (this._pitReelFired) { this._pitReelFired = false; this.clearPitHint("pitreel"); }
    }
  }

  showPitHint() {
    const g = this.players.find((p) => p.skill === "grapple");
    if (!g) return; // no grapple = no taught escape; stay silent
    const gi = g.idx;
    const tokens = gi === 0
      ? [{ icon: "up" }, { cap: "W" }, { plus: true }, { cap: "SPACE" }]
      : [{ icon: "up" }, { cap: "↑" }, { plus: true }, { cap: "L", p: 1 }];
    this.coachShow(gi, {
      tokens, caption: "ZIP UP TO THE ANCHOR",
      follow: { obj: g, dy: -g.displayHeight / 2 - 30 },
      key: "pithint", dur: 6000, colorP: gi,
    });
    // KOBI flavor blip carrying the full two-step teamwork plan (display-only).
    this.game.events.emit("bb:blip", "KOBI: Stuck? Work TOGETHER — zip UP, then REEL your buddy out.");
  }

  // CASE B: the OUT grapple partner reels the stuck buddy up. Bubble rides the OUT
  // player (the one who acts); a leading DOWN-arrow + its DOWN key + its ACTION
  // keycap spell the chord. `coachBuddyReelable(out)` already proved it works.
  showReelHint(out) {
    const gi = out.idx;
    const downCap = gi === 0 ? "S" : "↓";
    const actCap = gi === 0 ? "SPACE" : "L";
    const tokens = gi === 0
      ? [{ icon: "arrow", angle: Math.PI / 2 }, { cap: "S" }, { plus: true }, { cap: "SPACE" }]
      : [{ icon: "arrow", angle: Math.PI / 2 }, { cap: "↓" }, { plus: true }, { cap: "L", p: 1 }];
    this.coachShow(gi, {
      tokens, caption: "REEL YOUR BUDDY OUT",
      follow: { obj: out, dy: -out.displayHeight / 2 - 30 },
      key: "pitreel", dur: 6000, colorP: gi,
    });
    // passive probe observability (display-only; never read by gameplay)
    this._pitReelMeta = { idx: gi, caption: "REEL YOUR BUDDY OUT", downCap, actCap };
    // KOBI flavor blip naming the reel-out chord for the grapple partner.
    this.game.events.emit("bb:blip", "KOBI: Grapple partner — hold ↓ + ACTION to REEL them out.");
  }

  clearPitHint(key) {
    for (const b of this.coach.bubbles) {
      if (b.active && (b.key === "pithint" || b.key === "pitreel") && (!key || b.key === key)) {
        b.active = false; b.follow = null; b.c.setVisible(false); this.tweens.killTweensOf(b.c);
      }
    }
  }

  // --- U2: lock & timer feedback ------------------------------------------------
  // All READ-ONLY over door/plate/lever state — samples, never mutates gameplay,
  // adds no bb:* events. Rings are per-timed-door Graphics on the clear+redraw
  // pattern (like rope/beam); bump bubbles reuse the U1 coach pool.
  buildLockFeedback() {
    for (const d of this.doors) {
      d._pushT = 0; d._bumpCd = 0; d.openedEver = false;
      if (d.timer) {
        // one shared Graphics per timed door: draws the lamp ring AND the driving
        // lever ring(s) from the same drain fraction. Hidden while closed.
        d._ring = this.add.graphics().setDepth(DEPTH.fx - 1).setVisible(false);
        d._levers = (d.needs.levers || []).map((id) => this.levers.find((l) => l.id === id)).filter(Boolean);
      }
    }
  }

  // Flash a plate's weight pips 3× to say "needs 2, have 1". Cooldown 4s.
  flashPlatePips(pl, weight, time) {
    pl._flashCd = time + 4000;
    const lit = Math.min(Math.round(weight), pl.threshold);
    for (let i = 0; i < pl.pips.length; i++) {
      const want = i < lit ? "pip_on" : "pip_off";
      if (pl.pips[i].texture.key !== want) pl.pips[i].setTexture(want);
    }
    if (pl._flashTween) pl._flashTween.stop();
    pl.pipCont.setVisible(true).setAlpha(1);
    // blink: 3 on-beats (alpha 1) separated by off-beats, then hide.
    // U11 FLASH soft: same 3 beats (meaning-bearing "needs weight"), lower
    // contrast + longer ramp.
    const fs = uxFlashScale();
    pl._flashTween = this.tweens.add({
      targets: pl.pipCont, alpha: { from: 1, to: fs < 1 ? 0.5 : 0.15 },
      duration: 200 / fs, yoyo: true, repeat: 2, ease: "sine.inOut",
      onComplete: () => { pl.pipCont.setVisible(false); pl._flashTween = null; },
    });
  }

  // The lever/key/plate/crane teaching for an unmet needs-set, with direction
  // arrows measured from (ox, oy) — the bumped door's centre, i.e. where the kid
  // is standing and looking. `door` supplies keysGiven for key-needs.
  needContent(n, ox, oy, door) {
    if (n.levers) {
      const lv = n.levers.map((id) => this.levers.find((l) => l.id === id)).find((l) => l && !l.on);
      if (lv) {
        const ang = Math.atan2(lv.y - oy, lv.x - ox);
        return { tokens: [{ icon: "lever" }, { icon: "arrow", angle: ang }], caption: "PULL THE LEVER" };
      }
    }
    if (n.keys && ((door && door.keysGiven) || 0) < n.keys) {
      return { tokens: [{ icon: "key" }], caption: this.keysHeld > 0 ? "USE YOUR KEY" : "FIND THE KEY" };
    }
    if (n.plates) {
      const pl = n.plates.map((id) => this.plates.find((p) => p.id === id)).find((p) => p && !p.active);
      if (pl) {
        const have = Math.min(Math.round(pl._weight || 0), pl.threshold);
        return { tokens: [{ icon: "plate" }, { pips: true, have, need: pl.threshold }], caption: "NEEDS WEIGHT" };
      }
    }
    // U12: a door held shut by the live crane (1-3 towerDoor) — point back at it
    if (n.crane && !this.craneDefeated && this.crane) {
      const ang = Math.atan2(this.crane.body.y - oy, this.crane.body.x - ox);
      return { tokens: [{ icon: "arrow", angle: ang }], caption: "STOP THE CRANE FIRST" };
    }
    return null;
  }

  // The first-unmet-need content for a bumped closed door, or null if the door's
  // only needs are ones U2 doesn't teach on bump (wardens).
  bumpContent(d) {
    const n = d.needs || {};
    // re-armed timed door that already opened once → "too slow!" (F10/F4)
    if (d.timer && d.openedEver) {
      return { tokens: [{ icon: "clock" }], caption: "TOO SLOW!" };
    }
    // U12 sweep fix: the skills gate gave ZERO feedback on bump — point back at
    // the nearest waiting pedestal. `low` anchors the bubble at the pusher's
    // height so it can never sit on top of the spawn item cards it points to.
    if (n.skills && !this.players.every((p) => p.skill)) {
      const ped = this.pedestals.find((pd) => !pd.taken);
      if (ped) {
        const ang = Math.atan2(ped.y - d.zone.centerY, ped.x - d.zone.centerX);
        return { tokens: [{ icon: "arrow", angle: ang }], caption: "GRAB YOUR GADGETS", low: true };
      }
    }
    const own = this.needContent(n, d.zone.centerX, d.zone.centerY, d);
    if (own) return own;
    // U12 sweep fix: needs.opened (exits behind an unopened door/bridge) taught
    // NOTHING — resolve the referenced door/bridge and teach ITS first unmet
    // need instead (2-3's exit before br1's lever, 1-3's exit while the crane
    // still holds the tower door, ...). Depth 1 only — no cycles possible.
    if (n.opened) {
      const missing = n.opened.find((id) => !this.opened.has(id));
      if (missing) {
        const tgt = this.doors.find((x) => x.id === missing) || this.bridges.find((x) => x.id === missing);
        if (tgt && tgt.needs) return this.needContent(tgt.needs, d.zone.centerX, d.zone.centerY, tgt.zone ? tgt : null);
      }
    }
    return null;
  }

  showBumpBubble(idx, d, content) {
    // `low` (skills gate): follow the pusher's height at the door's x — the
    // door-top spot would collide with the item cards the arrow points back to.
    const p = this.players[idx];
    const follow = content.low
      ? { x: d.zone.centerX, y: p.y - p.displayHeight / 2 - 34 }
      : { x: d.zone.centerX, y: d.zone.y - 30 };
    this.coachShow(idx, {
      tokens: content.tokens, caption: content.caption,
      follow,
      key: "bump", dur: 3000, colorP: 2,
    });
  }

  // Draw a draining ring at (x, y): faint full track + bright arc for `frac`
  // remaining, sweeping clockwise from 12 o'clock. Blinks red in the last 1.5s.
  drawDrainRing(g, x, y, r, frac, blink) {
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * Phaser.Math.Clamp(frac, 0, 1);
    g.lineStyle(3, 0x2f4066, 0.7);
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.strokePath();
    const col = blink ? COLORS.hazard : COLORS.amber;
    g.lineStyle(4, col, 1);
    g.beginPath(); g.arc(x, y, r, start, end, false); g.strokePath();
  }

  updateLockFeedback(time, delta) {
    // (1) BUMP: a player sustained-pushing a CLOSED door for >400ms pops a bubble.
    for (const d of this.doors) {
      if (d.open) { d._pushT = 0; continue; }
      let pushing = -1;
      const cx = d.zone.centerX;
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (p.dead || p.carriedBy) continue;
        if (p.y < d.zone.y - 12 || p.y > d.zone.y + d.zone.height + 26) continue;
        const dx = p.x - cx;
        if (Math.abs(dx) > TILE) continue;
        const pushRight = p.keys.right.isDown || (p.pad && p.pad.right.isDown);
        const pushLeft = p.keys.left.isDown || (p.pad && p.pad.left.isDown);
        if ((dx < 0 && pushRight) || (dx > 0 && pushLeft)) { pushing = i; break; }
      }
      if (pushing >= 0) {
        d._pushT += delta;
        if (d._pushT > 400 && time > d._bumpCd && this.coach && uxHints()) { // U11: U2 icon bubbles respect HINTS
          const content = this.bumpContent(d);
          if (content) {
            this.showBumpBubble(pushing, d, content);
            d._bumpCd = time + 3000;
          }
          d._pushT = 0;
        }
      } else {
        d._pushT = Math.max(0, d._pushT - delta * 2);
      }
    }

    // (2) TIMED-DOOR COUNTDOWN: draining ring around the lamp + each driving lever
    // while the door is open; the final 1.5s blinks. Clear+redraw, no allocation.
    for (const d of this.doors) {
      if (!d._ring) continue;
      if (!d.open) { if (d._ring.visible) d._ring.setVisible(false).clear(); continue; }
      const remain = d.closeAt - time;
      const frac = Phaser.Math.Clamp(remain / d.timer, 0, 1);
      // U11 FLASH soft: the last-1.5s warning still blinks (meaning-bearing)
      // but at half rate — 360ms beats instead of 180ms.
      const blink = remain < 1500 && Math.floor(time / (180 / uxFlashScale())) % 2 === 0;
      const g = d._ring.setVisible(true);
      g.clear();
      this.drawDrainRing(g, d.lamp.x, d.lamp.y, 13, frac, blink);
      for (const lv of d._levers) {
        this.drawDrainRing(g, lv.x, lv.y - 8, 19, frac, blink);
      }
    }
  }

  // U5 (F2): when a solo NON-phase robot pushes against a shimmer wall (`~`) for
  // >400ms while its phase buddy is NOT in escort range (78px), pop a hand-hold
  // icon bubble at the pillar. Reuses the U2 icon-bubble variant. Generalizes to
  // ALL shimmer walls in both worlds; cooldown 3s; suppressed while escorted.
  // U12 sweep fix: the same sustained-push detector now also covers vent-pinch
  // duct lips (`d`) — a NON-tiny robot silently walled by one gets "ONLY TINY
  // FITS" (2-1's tunnel and 2-3's top lane both hid this).
  // Read-only over gameplay (samples input/body state, never mutates it).
  updateHandholdHint(time, delta) {
    if (!this.coach || !uxHints()) return; // U11: U5/U12 push bubbles respect HINTS
    for (const p of this.players) {
      if (p.dead || p.carriedBy) { p._shimmerPushT = 0; p._ductPushT = 0; continue; }
      let dir = 0;
      if ((p.keys.right.isDown || (p.pad && p.pad.right.isDown)) && p.body.blocked.right) dir = 1;
      else if ((p.keys.left.isDown || (p.pad && p.pad.left.isDown)) && p.body.blocked.left) dir = -1;
      const decayShim = () => { p._shimmerPushT = Math.max(0, p._shimmerPushT - delta * 2); };
      const decayDuct = () => { p._ductPushT = Math.max(0, p._ductPushT - delta * 2); };
      if (dir === 0) { decayShim(); decayDuct(); continue; }
      const wx = p.x + dir * (p.body.halfWidth + 6);
      const c = this.tileAt(wx, p.y);
      // (a) shimmer wall — unchanged U5 behavior (phase never blocks on these)
      if (c === "~" && p.skill !== "phase") {
        // suppressed while the phase buddy is close enough to escort (the hand-hold rule)
        const q = p.partner;
        if (q && !q.dead && q.skill === "phase" && Math.hypot(q.x - p.x, q.y - p.y) < 78) {
          p._shimmerPushT = 0;
        } else {
          p._shimmerPushT += delta;
          if (p._shimmerPushT > 400 && time > this._handholdCd) {
            const tx = Math.floor(wx / TILE) * TILE + 24;
            this.coachShow(p.idx, {
              tokens: [{ icon: "handhold" }], caption: "HOLD HANDS",
              follow: { x: tx, y: p.y - p.displayHeight / 2 - 30 },
              key: "handhold", dur: 3000, colorP: 2,
            });
            this._handholdCd = time + 3000;
            p._shimmerPushT = 0;
          }
        }
      } else decayShim();
      // (b) vent-pinch duct lip — tiny fits underneath, everyone else is walled
      if (c === "d" && p.skill !== "tiny") {
        p._ductPushT += delta;
        if (p._ductPushT > 400 && time > this._ductHintCd) {
          const tx = Math.floor(wx / TILE) * TILE + 24;
          this.coachShow(p.idx, {
            tokens: [{ icon: "pinch" }], caption: "ONLY TINY FITS",
            follow: { x: tx, y: p.y - p.displayHeight / 2 - 30 },
            key: "duct", dur: 3000, colorP: 2,
          });
          this._ductHintCd = time + 3000;
          p._ductPushT = 0;
        }
      } else decayDuct();
    }
  }

  // --- conditions ---------------------------------------------------------------
  evalNeeds(needs, door) {
    if (!needs) return true;
    if (needs.skills && !this.players.every((p) => p.skill)) return false;
    if (needs.levers && !needs.levers.every((id) => this.levers.find((l) => l.id === id)?.on)) return false;
    if (needs.plates && !needs.plates.every((id) => this.plates.find((pl) => pl.id === id)?.active)) return false;
    if (needs.keys && ((door && door.keysGiven) || 0) < needs.keys) return false;
    if (needs.opened && !needs.opened.every((id) => this.opened.has(id))) return false;
    if (needs.crane && !this.craneDefeated) return false;
    if (needs.wardens && !needs.wardens.every((id) => this.wardens.find((w) => w.id === id)?.defeated)) return false;
    return true;
  }

  // --- pause (S4) ----------------------------------------------------------------
  // P toggles the pause overlay. `physics.pause()` freezes bodies; the update
  // guard below freezes all game logic (handleAction/lifts/enemies/crane). The M
  // mute key keeps working (it lives on a keydown listener, not in update). NOTE:
  // time.delayedCall timers (e.g. the respawn beam-in) keep running while paused —
  // acceptable, a respawn landing during a pause is harmless. Pause is impossible
  // during the clear overlay because update() early-returns on this.complete
  // before it ever reads the P key.
  togglePause() {
    if (this.paused) this.resumeGame();
    else this.pauseGame();
  }

  pauseGame() {
    if (this.paused || this.complete) return;
    this.clearConfirm(); // PauseScene owns input while paused — drop any pending confirm
    this.paused = true;
    this.physics.pause();
    pauseDuck(true); // music continues at 0.5x; saved volume untouched
    sfx.menuSelect();
    this.scene.launch("Pause", { levelIndex: this.levelIndex });
    this.scene.bringToTop("Pause");
  }

  resumeGame() {
    if (!this.paused) return;
    this.paused = false;
    this.physics.resume();
    pauseDuck(false);
    this.scene.stop("Pause");
  }

  // --- U3 destructive-input confirm ----------------------------------------------
  // A single pooled, screen-fixed toast (scrollFactor 0) reused for both the R
  // (restart) and ESC (map) confirms. Only one confirm is ever pending; starting
  // one cancels the other. All drawing happens on arm/expiry + a cheap bar redraw
  // while pending — never a per-frame allocation.
  buildConfirm() {
    const W = this.scale.width, H = this.scale.height;
    const label = this.add.text(0, -7, "", {
      fontFamily: FONT, fontSize: FS.head, fontStyle: "bold", color: TEXT.warn,
    }).setOrigin(0.5);
    // SL7 bubble-fit: size the toast to the WIDER of its two messages ("press ESC
    // again for the map" ≈ 357px was only ~11px inside the old fixed bw=380) so the
    // label never touches the edges. Measure both, then draw the panel + progress bar.
    label.setText("press ESC again for the map"); const wEsc = label.width;
    label.setText("press R again to restart"); const wR = label.width;
    label.setText("");
    const bw = Math.max(380, Math.ceil(Math.max(wEsc, wR) + 48)), bh = 64;
    const g = this.add.graphics();
    g.fillStyle(COLORS.hudBg, 0.95).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);
    g.lineStyle(3, COLORS.amber, 1).strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);
    const barX = -bw / 2 + 22, barY = bh / 2 - 15, barFull = bw - 44;
    const track = this.add.graphics();
    track.fillStyle(0x000000, 0.4).fillRoundedRect(barX, barY, barFull, 6, 3);
    const bar = this.add.graphics(); // redrawn while a confirm is pending
    // centered horizontally; clamped so the toast clears the KOBI blip bar
    // (UIScene bar occupies y = H-92 .. H-26). H*0.4 sits well above it.
    const y = Math.min(H * 0.4, H - 92 - bh / 2 - 16);
    const c = this.add.container(W / 2, y, [g, label, track, bar])
      .setScrollFactor(0).setDepth(DEPTH.fx + 60).setVisible(false);
    this.confirmUI = { c, label, bar, barX, barY, barFull };
    this.confirm = null; // { kind: "r"|"esc", until } while pending
  }

  startConfirm(kind, time) {
    // starting one confirm cancels the other (mutually exclusive pending state)
    this.confirm = { kind, until: time + 2500 };
    const ui = this.confirmUI;
    ui.label.setText(kind === "r" ? "press R again to restart" : "press ESC again for the map");
    ui.c.setVisible(true).setScale(0.8).setAlpha(0);
    this.tweens.killTweensOf(ui.c);
    this.tweens.add({ targets: ui.c, scale: 1, alpha: 1, duration: 160, ease: "back.out" });
    this.drawConfirmBar(1);
    sfx.menuSelect();
  }

  updateConfirm(time) {
    if (!this.confirm) return;
    const remain = this.confirm.until - time;
    if (remain <= 0) { this.clearConfirm(); return; }
    this.drawConfirmBar(remain / 2500);
  }

  drawConfirmBar(frac) {
    const ui = this.confirmUI;
    const f = Math.max(0, Math.min(1, frac));
    ui.bar.clear();
    ui.bar.fillStyle(COLORS.amber, 1).fillRoundedRect(ui.barX, ui.barY, ui.barFull * f, 6, 3);
  }

  clearConfirm() {
    this.confirm = null;
    if (this.confirmUI) {
      this.tweens.killTweensOf(this.confirmUI.c);
      this.confirmUI.c.setVisible(false).setAlpha(1).setScale(1);
    }
  }

  doExit() {
    this.leaving = true; // fade out, then hand off — guard blocks a double trigger
    this.clearConfirm();
    this.cameras.main.fadeOut(250, 4, 6, 20);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.stop("UI");
      this.scene.start("Hub", { sel: this.levelIndex });
    });
  }

  doRestart() {
    this.leaving = true;
    this.clearConfirm();
    this.cameras.main.fadeOut(250, 4, 6, 20);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.stop("UI");
      this.scene.restart({ levelIndex: this.levelIndex });
    });
  }

  // --- SL4: "Stuck?" escalating recovery prompt ----------------------------------
  // A single pooled, screen-fixed prompt reused for the tier-1 gentle nudge and the
  // tier-2 firm restart offer. Mirrors the U3 confirm toast (buildConfirm): built
  // ONCE here; updateStuckPrompt() only swaps text + toggles visibility on a TIER
  // CHANGE — never a per-frame allocation, never a redraw while idle. It only READS
  // this.stuckTier (SL2 watchdog) / this.softlock (SL3 detectors) and OFFERS the
  // EXISTING R×2 restart / ESC×2 map — it never blocks/eats/delays input, never
  // auto-restarts, never seizes control. Positioned at H*0.62 so it clears BOTH the
  // U3 confirm toast (H*0.4) and the KOBI blip bar (UIScene y = H-92 .. H-26).
  buildStuckPrompt() {
    const W = this.scale.width, H = this.scale.height;

    // SL7 — the tier-3 "cold hard truth" grey overlay. A single screen-fixed, full-
    // screen desaturating rectangle: built ONCE here, toggled only on the tier-3
    // edge. It is NON-INTERACTIVE (never setInteractive → pointer passes straight
    // through), sits ABOVE gameplay (DEPTH.fx+40) but BELOW the stuck prompt
    // (DEPTH.fx+58), the U3 confirm toast (DEPTH.fx+60) and the whole HUD/blip bar
    // (the UIScene renders on top of GameScene). It makes the stuck state
    // unmistakable WITHOUT trapping the player — movement, action and the R×2
    // restart all still work through it, and it CLEARS INSTANTLY on progress/restart.
    const grey = this.add.rectangle(W / 2, H / 2, W, H, 0x080b12)
      .setScrollFactor(0).setDepth(DEPTH.fx + 40).setVisible(false).setAlpha(0);
    this.greyOverlay = grey;

    const g = this.add.graphics();                    // panel bg+border (drawn on tier change)
    const caps = this.add.graphics().setVisible(false); // R keycap boxes
    // keycap glyphs — two "R" letters, repositioned on show (1 in the tutorial's
    // single-press mode, 2 for the real R×2). Built once, toggled/moved on change.
    const capA = this.add.text(0, 2, "R", { fontFamily: FONT, fontSize: FS.head, fontStyle: "bold", color: "#ffd94d" }).setOrigin(0.5).setVisible(false);
    const capB = this.add.text(0, 2, "R", { fontFamily: FONT, fontSize: FS.head, fontStyle: "bold", color: "#ffd94d" }).setOrigin(0.5).setVisible(false);
    const head = this.add.text(0, 0, "", { fontFamily: FONT, fontSize: FS.head, fontStyle: "bold", color: TEXT.warn }).setOrigin(0.5);
    const sub = this.add.text(0, 34, "", { fontFamily: FONT, fontSize: FS.small, color: TEXT.dim }).setOrigin(0.5).setVisible(false);
    // clamp the y so the tallest panel always clears the blip bar top.
    const y = Math.min(H * 0.62, H - 92 - 70);
    const c = this.add.container(W / 2, y, [g, caps, capA, capB, head, sub])
      .setScrollFactor(0).setDepth(DEPTH.fx + 58).setVisible(false);
    this.stuckUI = { c, g, caps, capA, capB, head, sub };
    this._stuckTierShown = 0;   // the tier currently rendered (0 = hidden)
    this._stuckModeShown = "";  // "gentle" | "firm" | "softlock" | "coldtruth"
    this._softlockSince = 0;    // scene time a hard-lock signal first appeared (t3 escalation)
  }

  // Render the prompt for a tier (called ONLY on a tier/mode change, never idle).
  // SL7: EVERY tier now tells the player exactly what to press — tier-1 gains the
  // R keycaps + explicit restart line (still calm cyan, so it reads softer than the
  // firm amber tier-2), and tier-3 adds the blunt KOBI "cold hard truth" copy + the
  // grey-fade overlay. The panel is SIZED TO ITS TEXT: we setText first, measure the
  // rendered head/sub widths, then draw the panel from the widest row + padding, so
  // no string can overflow. All measure/draw happens ONLY here (a tier change), never
  // per-frame. Single-press (tutorial) shows one R keycap; real levels show R×2.
  showStuckPrompt(mode) {
    const ui = this.stuckUI;
    const single = !!(this.def && this.def.tutorial);
    this.tweens.killTweensOf(ui.c);
    ui.g.clear();
    ui.caps.clear();

    // per-mode styling: head copy/colour + panel edge. Gentle stays calm-cyan and
    // softer; firm/softlock are firm amber; cold-truth is the blunt red escalation.
    let headText, headColor, edge, edgeAlpha, edgeW, bgAlpha, subText;
    const restartCopy = single ? "Press R to restart  ·  ESC = map"
                               : "Hold R twice to restart  ·  ESC twice = map";
    if (mode === "gentle") {
      headText = "Stuck? No shame in a fresh start.";
      headColor = TEXT.body; edge = COLORS.neon; edgeAlpha = 0.85; edgeW = 2.5; bgAlpha = 0.9;
      subText = restartCopy;
    } else if (mode === "coldtruth") {
      headText = "You're STUCK. This won't fix itself.";
      headColor = TEXT.warn; edge = COLORS.hazard; edgeAlpha = 1; edgeW = 3.5; bgAlpha = 0.97;
      subText = restartCopy;
    } else {
      // tier-2: a confirmed hard lock ("softlock") gets confident copy; a watchdog
      // t2 stall ("firm") gets the encouraging variant.
      headText = mode === "softlock" ? "DEAD END — no way through" : "STUCK? Time for a fresh start";
      headColor = TEXT.warn; edge = COLORS.amber; edgeAlpha = 1; edgeW = 3; bgAlpha = 0.95;
      subText = restartCopy;
    }

    // --- lay out the R keycap row (1 or 2 boxes) ---
    const capW = 34, capH = 34, capGap = 14;
    const capsRowW = single ? capW : capW * 2 + capGap;

    // --- measure the text so the panel fits it ---
    ui.head.setColor(headColor).setText(headText);
    ui.sub.setText(subText);
    const PADX = 26, PADY = 15, ROWGAP = 9;
    const headH = ui.head.height, subH = ui.sub.height;
    const contentW = Math.max(ui.head.width, ui.sub.width, capsRowW);
    const contentH = headH + ROWGAP + capH + ROWGAP + subH;
    const bw = Math.ceil(contentW + PADX * 2);
    const bh = Math.ceil(contentH + PADY * 2);
    const radius = mode === "gentle" ? 12 : 14;

    // row centres, top-anchored inside the panel
    const top = -contentH / 2;
    const headY = top + headH / 2;
    const capY = top + headH + ROWGAP + capH / 2;
    const subY = top + headH + ROWGAP + capH + ROWGAP + subH / 2;

    ui.g.fillStyle(COLORS.hudBg, bgAlpha).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, radius);
    ui.g.lineStyle(edgeW, edge, edgeAlpha).strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, radius);

    ui.head.setY(headY);

    // keycap boxes share the panel's edge colour so the tier reads as one piece.
    const drawCap = (cx) => {
      ui.caps.fillStyle(0x000000, 0.55).fillRoundedRect(cx - capW / 2, capY - capH / 2, capW, capH, 7);
      ui.caps.lineStyle(2.5, edge, edgeAlpha).strokeRoundedRect(cx - capW / 2, capY - capH / 2, capW, capH, 7);
    };
    if (single) {
      drawCap(0); ui.capA.setPosition(0, capY).setVisible(true); ui.capB.setVisible(false);
    } else {
      const cA = -(capW + capGap) / 2, cB = (capW + capGap) / 2;
      drawCap(cA); drawCap(cB);
      ui.capA.setPosition(cA, capY).setVisible(true); ui.capB.setPosition(cB, capY).setVisible(true);
    }
    ui.caps.setVisible(true);
    ui.sub.setY(subY).setVisible(true);

    // SL7 — the tier-3 grey-fade: show/fade-in the desaturating overlay ONLY at the
    // cold-truth tier; any other tier hides it instantly. Non-interactive, so input
    // (incl. the R×2 restart) passes straight through.
    if (mode === "coldtruth") {
      const gr = this.greyOverlay;
      if (gr) {
        this.tweens.killTweensOf(gr);
        gr.setVisible(true);
        this.tweens.add({ targets: gr, alpha: 0.55, duration: 320, ease: "quad.out" });
      }
      // SL7 — the somber "cold hard truth": the grey screen + sad music together.
      // Reversible bus treatment; silent if music is muted. Cleared the instant the
      // tier drops (below) or on restart/exit.
      setSadMusic(true);
    } else {
      this._hideGrey();
      setSadMusic(false);
    }

    ui.c.setVisible(true).setScale(0.85).setAlpha(0);
    this.tweens.add({ targets: ui.c, scale: 1, alpha: 1, duration: 180, ease: "back.out" });
  }

  // Instant grey-overlay clear (per roadmap #1: the stuck state must vanish the
  // MOMENT progress resumes / on restart — no lingering fade-out that trails play).
  _hideGrey() {
    const gr = this.greyOverlay;
    if (!gr) return;
    this.tweens.killTweensOf(gr);
    gr.setVisible(false).setAlpha(0);
  }

  hideStuckPrompt() {
    if (!this.stuckUI) return;
    this.tweens.killTweensOf(this.stuckUI.c);
    this.stuckUI.c.setVisible(false).setAlpha(1).setScale(1);
    this._hideGrey();
    setSadMusic(false); // stuck cleared ⇒ restore normal music completely
  }

  // True while any contextual co-op hint is showing OR applies — tier-1 DEFERS to
  // it (never stacks a second prompt on the co-op hint). Every contextual hint (U1
  // coach, U5 escort, throw / re-pull, U13/U13b pit reel) renders through a coach
  // bubble, so an active bubble covers "is showing"; the U13 pit-fired flags cover
  // "still applies" across the bubble's post-fire cooldown while the team sits in
  // the pit band. Pure scalar reads — zero allocation.
  _coopHintActive() {
    const co = this.coach;
    if (co && co.bubbles) {
      for (let i = 0; i < co.bubbles.length; i++) if (co.bubbles[i].active) return true;
    }
    if (this._pitHintFired || this._pitReelFired) return true;
    return false;
  }

  // Driven at the tail of update(), AFTER the watchdog + detectors have settled the
  // frame's signal. Resolves the desired tier/mode from the READ-ONLY signals and,
  // on a CHANGE only, shows/hides the pooled prompt. Clears INSTANTLY the moment
  // progress resumes (stuckTier→0 / softlock cleared) — no per-frame work when the
  // tier is unchanged. U11 is already honored upstream (the watchdog/detectors
  // never raise a tier while hints/comfort are off), so this never shows then.
  updateStuckPrompt(time) {
    let tier = 0, mode = "";
    if (this.softlock) {
      // SL3 confirmed hard lock — firm tier-2, ESCALATING to the tier-3 grey-fade
      // "cold truth" if the persistent player stays trapped past the t3 window
      // (~25s after the firm offer). The detector pins stuckTier=2, so we time the
      // escalation here off when the signal first appeared. Passive read only.
      if (!this._softlockSince) this._softlockSince = time;
      const persisted = time - this._softlockSince;
      const t3gap = (this.watchdog ? this.watchdog.T3 - this.watchdog.T2 : 25000);
      if (persisted >= t3gap) { tier = 3; mode = "coldtruth"; }
      else { tier = 2; mode = "softlock"; }
    } else {
      this._softlockSince = 0;
      const st = this.stuckTier | 0;
      if (st >= 3) { tier = 3; mode = "coldtruth"; }            // SL2 watchdog t3 (SL7)
      else if (st >= 2) { tier = 2; mode = "firm"; }            // SL2 watchdog t2
      else if (st === 1) { tier = 1; mode = "gentle"; }         // SL2 watchdog t1
    }
    // Tier-1 defers to any active/applicable contextual co-op hint (roadmap §2).
    if (tier === 1 && this._coopHintActive()) { tier = 0; mode = ""; }
    if (tier === this._stuckTierShown && mode === this._stuckModeShown) return;
    this._stuckTierShown = tier;
    this._stuckModeShown = mode;
    if (tier === 0) this.hideStuckPrompt();
    else this.showStuckPrompt(mode);
  }

  // --- main loop -----------------------------------------------------------------
  update(time, delta) {
    if (this.complete) return;
    // U7: poll gamepads once at the top of the frame (idempotent within a frame).
    // Any pad button folds into the audio-unlock gesture; a fresh connection pops
    // the per-session detection toast on the (unzoomed) HUD scene.
    pads.poll(time);
    if (pads.anyButtonJust()) initAudio();
    const padConn = pads.consumeConnected();
    if (padConn) {
      const uiS = this.scene.get("UI") || this;
      padConn.forEach((idx) => showPadToast(uiS, idx));
      // P9: in-game, drop the controller toast BELOW the intro-banner AND the
      // spawn item-card cluster so it can never overlap the CHAMBER cards
      // (u7-pad-toast.png fix). The default y=96 stays for Title/Hub/Settings,
      // which have no banner or cards.
      if (uiS._padToast) uiS._padToast.setY(300);
    }
    // P (or either pad's Start) pauses/resumes. Handled before the pause guard so
    // a paused game can still catch it to resume (physics.pause() freezes bodies,
    // not the scene's update()).
    if (J(this.pKey) || pads.p(0).pauseJust || pads.p(1).pauseJust) this.togglePause();
    if (this.paused) return;
    const dt = delta / 1000;

    // U8: accumulate the run clock. Only reached while un-paused and not complete
    // (both guarded above), so it measures active play and stops at finishLevel.
    this._elapsedMs += delta;

    // U3 — kid-proof destructive inputs. Real levels require a second press of
    // the SAME key within a 2.5s window before ESC (map) or R (restart) act; a
    // centered toast + shrinking bar shows the pending confirm. The two confirms
    // are independent — starting one cancels the other — and any expiry restores
    // normal state. The tutorial (short, teaches everything) stays one-press.
    this.updateConfirm(time);
    if (J(this.escKey) && !this.leaving) {
      if (this.def.tutorial || (this.confirm && this.confirm.kind === "esc")) { this.doExit(); return; }
      this.startConfirm("esc", time);
      return;
    }
    if (J(this.rKey) && !this.leaving) {
      if (this.def.tutorial || (this.confirm && this.confirm.kind === "r")) { this.doRestart(); return; }
      this.startConfirm("r", time);
      return;
    }

    this.beltSprites.forEach((b) => (b.tilePositionX += b.beltDir * 60 * dt));

    // drifting phase-wall shimmer: one shared counter, applied to every overlay
    if (this.phaseFlows.length) {
      this.phaseFlow += dt * 22;
      for (const pf of this.phaseFlows) pf.tilePositionY = this.phaseFlow;
    }
    // P4 rising shimmer sparkles (WebGL-only pooled emitter): sparse emission from
    // a random phase-wall's lower edge — the curtain reads as flowing energy.
    if (this.shimmerSparks) {
      this._shimCd -= delta;
      if (this._shimCd <= 0) {
        const p = this.shimmerPts[(Math.random() * this.shimmerPts.length) | 0];
        if (p) this.emitSafe(this.shimmerSparks, p.x + (Math.random() - 0.5) * 30, p.y, 1);
        this._shimCd = 130;
      }
    }
    // P4 hazard arc-sparks (WebGL-only pooled emitter): 1-2 concurrent per strip.
    // Ballistic (gravity) so each ember jumps and arcs off the strip surface.
    if (this.hazardSparks) {
      this._hazCd -= delta;
      if (this._hazCd <= 0) {
        const s = this.hazardStrips[(Math.random() * this.hazardStrips.length) | 0];
        if (s) this.emitSafe(this.hazardSparks, s.x1 + Math.random() * (s.x2 - s.x1), s.y, 1);
        this._hazCd = 300 + Math.random() * 260;
      }
    }

    for (const p of this.players) {
      if (p.dead) continue;
      const actEdge = J(p.keys.act) || (p.keys.actAlt && J(p.keys.actAlt)) || (p.pad && p.pad.actJust);
      if (actEdge) this.handleAction(p);
      // U1 coach: record this player's action-press edge (dismisses bubbles +
      // re-arms the re-show idle timer). Read-only — never gates input.
      if (this.coach) {
        this.coach.actEdge[p.idx] = actEdge;
        if (actEdge) p._lastActPress = time;
      }
      if (p.dead || p.carriedBy) continue;

      // action-key hint follows its robot
      const hint = this.actionHints[p.idx];
      if (hint) hint.setPosition(p.x, p.y - 64 - p.idx * 34 + Math.sin(time / 300) * 4);

      // ghost shimmer while inside a phase-wall
      const wasInWall = p.inPhaseWall;
      p.inPhaseWall = this.tileAt(p.x, p.y) === "~";
      if (p.inPhaseWall !== wasInWall) {
        this.phaseRipple(p.x, p.y); // brief ripple ring at the crossing point
        if (p.inPhaseWall) sfx.phaseIn();
        else sfx.phaseOut();
      }

      // landing dust for a freshly-thrown buddy the moment it touches down
      if (p._landDust && p.grounded) {
        this.dust.emitParticleAt(p.x, p.body.bottom, 8);
        p._landDust = false;
      }
      // phase ghost: body alpha shimmer while phasing; the 3 lagged ghost copies
      // + edge shimmer are painted from the pose ring buffer (P6).
      if (p.invuln <= 0) p.setAlpha(p.inPhaseWall ? 0.42 + 0.16 * Math.sin(time / 55) : 1);
      this.updatePhaseArt(p, time);

      // run dust: small puffs at the feet while grounded and moving fast
      p.dustCd -= delta;
      if (p.grounded && Math.abs(p.body.velocity.x) > 100 && p.dustCd <= 0) {
        this.dust.emitParticleAt(p.x - p.facing * 8, p.body.bottom - 2, 1);
        p.dustCd = 130;
      }

      // conveyor drift (Heavyweight stands his ground)
      if (p.skill !== "heavy" && p.grounded && !p.zip) {
        const c = this.tileAt(p.x, p.body.bottom + 6);
        if (c === "<") p.x -= PHYS.beltPush * dt;
        else if (c === ">") p.x += PHYS.beltPush * dt;
      }
      // ride moving platforms (standingOn is cleared at the end of update,
      // after the lift weight checks have read it)
      if (p.standingOn && p.standingOn.body) {
        p.y += p.standingOn.body.deltaY();
        p.x += p.standingOn.body.deltaX();
      }

      // hazards
      const rect = new Phaser.Geom.Rectangle(p.body.x, p.body.y, p.body.width, p.body.height);
      if (p.invuln <= 0 && this.hazardZones.some((h) => Phaser.Geom.Rectangle.Overlaps(h, rect))) {
        this.killPlayer(p);
        continue;
      }
      if (p.y > this.worldH + 60) {
        this.killPlayer(p);
        continue;
      }

      // pickups & checkpoints
      this.coreItems.forEach((c) => {
        if (c.active && Math.hypot(c.x - p.x, c.y - p.y) < 42) {
          this.coresGot[c.coreIndex] = true;
          this.boom.explode(this.fxBudget(10), c.x, c.y);
          this.starBurst.explode(this.fxBudget(9), c.x, c.y); // radial star burst
          sfx.core();
          // bonus fanfare the moment the third core of the level is collected
          if (this.coresGot.every(Boolean)) this.time.delayedCall(220, () => sfx.coresFanfare());
          this.game.events.emit("bb:cores", this.coresGot); // state authority (pip)
          // a star flies to the HUD pip: hand UIScene the world->screen coords
          const cam = this.cameras.main;
          this.game.events.emit("bb:coreFly", {
            x: (c.x - cam.worldView.x) * cam.zoom,
            y: (c.y - cam.worldView.y) * cam.zoom,
            index: c.coreIndex,
          });
          c.destroy();
        }
      });
      this.keyItems.forEach((k) => {
        if (k.active && Math.hypot(k.x - p.x, k.y - p.y) < 42) {
          this.keysHeld++;
          sfx.key(k.x, k.y);
          k.destroy();
          this.game.events.emit("bb:keys", this.keysHeld);
        }
      });
      this.checkpoints.forEach((cp) => {
        if (!cp.active && Math.abs(cp.x - p.x) < 44 && Math.abs(cp.y - p.y) < 60) {
          this.checkpoints.forEach((o) => {
            o.active = false;
            o.img.setTexture("checkpoint").setAlpha(0.85); // dim grey lamp
            if (o.cone) o.cone.setVisible(false);
            if (o.pool) o.pool.setVisible(false); // P8: extinguish its light pool
          });
          cp.active = true;
          // U9 (F16): a NEW segment begins — reset the streak counter + one-shot
          // guard so the death-streak line can fire once more on this fresh stretch.
          this._segDeaths = 0;
          this._segStreakFired = false;
          cp.img.setTexture("checkpoint_on").setAlpha(1); // green lamp
          if (cp.cone) cp.cone.setVisible(true); // light-cone below
          if (cp.pool) cp.pool.setVisible(true); // P8: light pool lit while active
          // expanding ring burst on activation
          const ring = this.add.image(cp.x, cp.y - 31, "ring").setDepth(DEPTH.fx)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: ring, scale: { from: 0.3, to: 2.6 }, alpha: { from: 0.85, to: 0 },
            duration: 520, ease: "cubic.out", onComplete: () => ring.destroy(),
          });
          this.sparks.explode(this.fxBudget(8), cp.x, cp.y - 31);
          this.checkpointSweep(cp.x, cp.y - 31); // P11: vertical gold light-sweep
          sfx.checkpoint();
          this.cpPos = this.players.map((_, i) => ({ x: cp.x - 14 + i * 28, y: cp.y - 10 }));
        }
      });
      // one-shot triggers (Sprint 10): cheap AABB, skipped once fired
      for (const tr of this.triggers) {
        if (tr.fired) continue;
        if (!Phaser.Geom.Rectangle.Contains(tr.rect, p.x, p.y)) continue;
        tr.fired = true;
        if (tr.blip) this.game.events.emit("bb:blip", tr.blip);
        if (tr.glyphs) {
          const cont = this.addGlyphs(tr.glyphs.x * TILE + 24, tr.glyphs.y * TILE + 24, tr.glyphs.caps);
          cont.setAlpha(0);
          this.tweens.add({ targets: cont, alpha: 1, duration: 260 });
        }
      }
    }

    // reeling
    for (const p of this.players) {
      if (!p.reeled) continue;
      const r = p.reeled;
      if (r.dead || p.dead) {
        p.endReeled();
        continue;
      }
      const dx = r.x - p.x;
      const dy = r.y - 24 - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 46 || p.body.blocked.left || p.body.blocked.right || p.body.blocked.up) {
        p.endReeled();
        // FL-003 — "the rope always gets your buddy to you": arriving against
        // the reeler's ledge wall used to cancel dead and drop the buddy, and a
        // fixed-size hop only worked near the lip. Pop the buddy level with the
        // reeler (LOS-checked at that height so the rope can't pull through
        // walls), then arc them onto the ledge.
        if (d < 150 && this.hasLOS(p.x, r.y - 6, r.x, r.y - 6)) {
          p.body.reset(p.x, r.y - 6);
          p.setVelocity(Math.sign(dx) * 180, -170);
        } else {
          p.setVelocity(0, -180);
        }
      } else {
        p.setVelocity((dx / d) * PHYS.reelSpeed, (dy / d) * PHYS.reelSpeed);
      }
    }

    // grapple reticles
    // hide every anchor radius-hint; re-show only the one currently targeted
    for (const a of this.anchors) if (a.hint) a.hint.setVisible(false);
    this.players.forEach((p, i) => {
      const ret = this.reticles[i];
      if (p.skill === "grapple" && !p.dead && !p.carrying && !p.carriedBy) {
        const tgt = this.findGrappleTarget(p);
        if (tgt) {
          ret.setVisible(true).setPosition(tgt.x, tgt.y);
          ret.setTint(p.idx === 0 ? COLORS.beep : COLORS.boop);
          ret.setAlpha(0.55 + 0.35 * Math.sin(time / 150));
          if (tgt.kind === "anchor" && tgt.obj && tgt.obj.hint) tgt.obj.hint.setVisible(true);
          return;
        }
      }
      ret.setVisible(false);
    });

    // plates
    for (const pl of this.plates) {
      let weight = 0;
      for (const p of this.players) {
        if (p.dead || p.carriedBy) continue;
        const rect = new Phaser.Geom.Rectangle(p.body.x, p.body.y, p.body.width, p.body.height + 6);
        if (p.grounded && Phaser.Geom.Rectangle.Overlaps(pl.rect, rect)) weight += p.weight;
      }
      const active = weight >= pl.threshold;
      // U2 plate-flash: a robot stepped on but the accumulated weight is short of
      // the threshold (the "needs 2, have 1" moment) → flash the pips 3× (cd 4s).
      if (pl.pipCont && !active && weight > 0 && pl._weight <= 0 && time > pl._flashCd) {
        this.flashPlatePips(pl, weight, time);
      }
      pl._weight = weight;
      if (active !== pl.active) {
        pl.active = active;
        // LED strip lights (accent) via texture swap — setTint no-ops on Canvas
        pl.img.setTexture(active ? "plate_on" : "plate");
        pl.img.scaleY = pl.baseScaleY * (active ? 0.45 : 1);
        if (active) { sfx.platePress(pl.rect.centerX, pl.rect.centerY); this.fireConduits("plate", pl.id); }
        else sfx.plateRelease(pl.rect.centerX, pl.rect.centerY);
      }
    }

    // doors
    for (const d of this.doors) {
      // timed doors re-arm: expire the window and pop their levers back out
      if (d.open && d.timer && time > d.closeAt) {
        (d.needs.levers || []).forEach((id) => {
          const l = this.levers.find((v) => v.id === id);
          if (l && l.on) {
            l.on = false;
            if (l.handle) this.tweens.add({ targets: l.handle, angle: -6, duration: 200 });
          }
        });
      }
      let shouldOpen = this.evalNeeds(d.needs, d);
      // key doors consume carried keys on approach
      if (!shouldOpen && d.needs.keys && this.keysHeld > 0) {
        const near = this.players.some((p) => !p.dead && Phaser.Geom.Rectangle.Contains(
          new Phaser.Geom.Rectangle(d.zone.x - 80, d.zone.y, d.zone.width + 160, d.zone.height), p.x, p.y));
        if (near) {
          const need = d.needs.keys - (d.keysGiven || 0);
          const give = Math.min(need, this.keysHeld);
          if (give > 0) {
            d.keysGiven = (d.keysGiven || 0) + give;
            this.keysHeld -= give;
            this.game.events.emit("bb:keys", this.keysHeld);
            sfx.lockTurn(d.zone.centerX, d.baseY);
          }
          if ((d.keysGiven || 0) >= d.needs.keys) shouldOpen = this.evalNeeds(d.needs, d);
        }
      }
      if (d.latch && d.openedOnce) shouldOpen = true;
      // Sprint 10: a door may be LATCHED permanently open by a named lever even
      // after its momentary condition (e.g. a held pressure plate) lapses — the
      // tutorial's "you first, then me" gate: heavy holds the plate so the buddy
      // slips through, the buddy pulls the far lever, and heavy is freed.
      if (d.needs.latchLever && this.levers.find((l) => l.id === d.needs.latchLever)?.on) {
        d.openedOnce = true;
        shouldOpen = true;
      }
      if (shouldOpen && !d.open) {
        d.open = true;
        d.openedEver = true; // U2: a re-armed timed door bumped later reads "too slow!"
        if (d.timer) d.closeAt = time + d.timer;
        else d.openedOnce = true;
        this.opened.add(d.id);
        d.img.body.enable = false;
        if (d.lamp) d.lamp.setTexture("lamp_green"); // lamp flips green on open
        if (d.lampPool) d.lampPool.setTint(0x59ff9c); // P8: pool follows lamp to green
        // dust jets venting from both sides of the frame at the floor
        const fy = d.baseY + d.h / 2 - 4;
        this.dust.emitParticleAt(d.zone.centerX - TILE * 0.4, fy, 6);
        this.dust.emitParticleAt(d.zone.centerX + TILE * 0.4, fy, 6);
        if (d.isExit) sfx.exitDoor(d.zone.centerX, d.baseY);
        else sfx.door(d.zone.centerX, d.baseY);
        this.tweens.add({ targets: d.img, y: d.baseY - d.h + 10, duration: 600, ease: "sine.inOut" });
      } else if (!shouldOpen && d.open) {
        // momentary doors close again — but never on top of someone
        const blocked = this.players.some((p) => !p.dead && Phaser.Geom.Rectangle.Contains(d.zone, p.x, p.y));
        if (!blocked) {
          d.open = false;
          if (d.lamp) d.lamp.setTexture("lamp_red"); // lamp back to red on close
          if (d.lampPool) d.lampPool.setTint(0xff5566); // P8: pool back to red
          sfx.doorClose(d.zone.centerX, d.baseY);
          this.tweens.add({
            targets: d.img, y: d.baseY, duration: 400, ease: "sine.inOut",
            onComplete: () => {
              if (!d.open) d.img.body.enable = true;
            },
          });
        }
      }
      // P5: exit marquee dot-lights chase around the frame while the door is
      // open. Pooled dots, one head index — a handful of setAlpha calls/frame.
      if (d.marquee && d.open) {
        const dots = d.marquee.dots, N = dots.length;
        d.marquee.phase = (d.marquee.phase + delta * 0.012) % N;
        const head = d.marquee.phase;
        for (let i = 0; i < N; i++) {
          let dd = ((i - head) % N + N) % N;
          const a = dd < 3 ? 1 - dd * 0.28 : 0.22;
          if (!dots[i].visible) dots[i].setVisible(true);
          dots[i].setAlpha(a);
        }
      }
    }

    // bridges (latch once conditions met)
    for (const br of this.bridges) {
      if (!br.open && this.evalNeeds(br.needs)) {
        br.open = true;
        this.opened.add(br.id);
        br.tiles.forEach((t, i) => {
          this.tweens.killTweensOf(t); // stop the ghost shimmer before solidifying
          this.tweens.add({ targets: t, alpha: 1, duration: 300, delay: i * 70 });
          this.time.delayedCall(i * 70, () => {
            t.body.enable = true;
            this.boom.explode(4, t.x, t.y - 10);
            sfx.bridgeTick(t.x, t.y); // one materialise tick per tile, rising left-to-right
          });
        });
        // P5: a bright light sweeps tile-by-tile as the bridge solidifies —
        // one pooled image tweened across the span, then faded (cosmetic).
        const accent = (WORLD_THEMES[this.def.world] || WORLD_THEMES[1]).accent;
        const t0 = br.tiles[0], tN = br.tiles[br.tiles.length - 1];
        const sweep = this.add.image(t0.x, t0.y, "glowBlob").setDepth(DEPTH.terrain + 1)
          .setScale(0.28).setAlpha(0.7).setTint(accent);
        if (this.game.renderer.type === Phaser.WEBGL) sweep.setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: sweep, x: tN.x, duration: (br.tiles.length - 1) * 70 + 200, ease: "sine.inOut",
          onComplete: () => this.tweens.add({ targets: sweep, alpha: 0, duration: 250, onComplete: () => sweep.destroy() }),
        });
      }
    }

    // lifts
    for (const lf of this.lifts) {
      let weight = 0;
      for (const p of this.players) {
        if (p.dead || p.carriedBy) continue;
        if (p.standingOn === lf.img || (p.grounded && Math.abs(p.body.bottom - lf.img.body.top) < 8 &&
          p.x > lf.img.x - lf.img.width / 2 - 10 && p.x < lf.img.x + lf.img.width / 2 + 10)) weight += p.weight;
      }
      const body = lf.img.body;
      // pips light up as weight accumulates toward the threshold
      if (lf.pips) {
        const lit = Math.min(Math.round(weight), lf.pips.length);
        for (let i = 0; i < lf.pips.length; i++) {
          const want = i < lit ? "pip_on" : "pip_off";
          if (lf.pips[i].texture.key !== want) lf.pips[i].setTexture(want);
        }
      }
      const goingUp = lf.topY < lf.botY;
      const atTarget = goingUp ? lf.img.y <= lf.topY + 2 : lf.img.y >= lf.topY - 2;
      if (weight >= lf.threshold) {
        lf.holdTimer = 4000;
        lf.label.setAlpha(0);
      }
      if (lf.holdTimer > 0) {
        lf.holdTimer -= delta;
        if (!atTarget) body.setVelocityY(goingUp ? -80 : 80);
        else body.setVelocityY(0);
      } else {
        const home = goingUp ? lf.img.y >= lf.botY - 2 : lf.img.y <= lf.botY + 2;
        if (!home) body.setVelocityY(goingUp ? 80 : -80);
        else {
          body.setVelocityY(0);
          lf.label.setAlpha(1);
        }
      }
      // start/stop chirps at the edges of travel (the soft motor loop while it
      // moves is driven in updateLoops)
      const moving = Math.abs(body.velocity.y) > 1;
      // engine glow strip under the platform while it travels
      if (lf.glow) {
        lf.glow.setPosition(lf.img.x, body.bottom + 4);
        lf.glow.setAlpha(moving ? 0.55 : 0);
      }
      // P5: cable drum spins proportional to lift velocity; cable re-lengths.
      if (lf.drum) {
        lf.drum.rotation += body.velocity.y * dt * 0.05;
        lf.cable.setDisplaySize(3, Math.max(1, lf.img.y - 10 - lf.drumY));
      }
      if (moving && !lf.movingWas) sfx.liftStart(lf.img.x, lf.img.y);
      else if (!moving && lf.movingWas) sfx.liftStop(lf.img.x, lf.img.y);
      lf.movingWas = moving;
    }

    // crushers
    for (const cr of this.crushers) {
      const img = cr.img;
      const body = img.body;
      cr.timerLast = cr.timer;
      switch (cr.state) {
        case "hold":
          body.setVelocityY(0);
          cr.timer -= delta;
          if (cr.timer <= 0) cr.state = "slam";
          break;
        case "slam": {
          body.setVelocityY(560);
          let stopped = false;
          for (const p of this.players) {
            if (p.dead) continue;
            const overlapX = Math.abs(p.x - img.x) < 60;
            const touching = p.body.top < img.y + 30 && p.body.bottom > img.y - 10;
            if (overlapX && touching) {
              if (p.skill === "heavy") {
                stopped = true; // Heavy stands his ground
                this.boom.explode(3, img.x, img.y + 26);
              } else if (p.invuln <= 0) {
                this.killPlayer(p);
              }
            }
          }
          if (stopped || body.blocked.down || img.y >= cr.botY) {
            body.setVelocityY(0);
            cr.state = "rest";
            cr.timer = 1300;
            sfx.crush(img.x, img.y);
            this.camShake(70, 0.0015);
          }
          break;
        }
        case "rest":
          body.setVelocityY(0);
          cr.timer -= delta;
          if (cr.timer <= 0) {
            cr.state = "rise";
            sfx.crusherServo(img.x, img.y); // servo whine as it hauls back up
          }
          break;
        case "rise":
          body.setVelocityY(-140);
          if (img.y <= cr.restY) {
            img.y = cr.restY;
            body.setVelocityY(0);
            cr.state = "hold";
            cr.timer = 1400;
          }
          break;
      }
    }

    // bugs: patrol, turn at walls/edges, resolve player contact
    this.bugs.children.each((bug) => {
      if (!bug.active) return;
      const dir = Math.sign(bug.body.velocity.x) || 1;
      const aheadX = bug.x + dir * 26;
      const floorAhead = this.isSolidChar(this.tileAt(aheadX, bug.body.bottom + 10));
      if (bug.body.blocked.left || bug.x < bug.minX) bug.setVelocityX(60);
      else if (bug.body.blocked.right || bug.x > bug.maxX) bug.setVelocityX(-60);
      else if (!floorAhead && bug.body.blocked.down) bug.setVelocityX(-dir * 60);
      bug.setFlipX(bug.body.velocity.x < 0);
      // A5: the leg scuttle cycle (3-frame, |vx|-synced) now lives in the anim rig
      // (src/anim/bug_anim.js) so it's a pure visual overlay — under ?animoff=1 the
      // bug renders static. Facing (flipX above) stays here as plain patrol state.
      // eyes glow brighter as the nearest player closes to ~200px
      const near = this.players.reduce((m, p) => p.dead ? m : Math.min(m, Math.hypot(p.x - bug.x, p.y - bug.y)), Infinity);
      const glowA = near < 200 ? Phaser.Math.Clamp((200 - near) / 150, 0, 1) : 0;
      bug.glow.setPosition(bug.x, bug.y).setAlpha(glowA);
      // idle skitter chitter when a player is nearby (rate-limited + proximity)
      if (this.players.some((p) => !p.dead && Math.abs(p.x - bug.x) < 160 && Math.abs(p.y - bug.y) < 120)) {
        sfx.bugSkitter(bug.x, bug.y);
      }
      for (const p of this.players) {
        if (p.dead || p.invuln > 0 || p.carriedBy) continue;
        if (Math.abs(p.x - bug.x) < 38 && Math.abs(p.y - bug.y) < 36) {
          const fromAbove = p.body.velocity.y > 120 && p.body.bottom < bug.y + 6;
          if (fromAbove) {
            if (p.skill === "heavy") this.squishBug(bug);
            else {
              p.setVelocityY(-380);
              sfx.bugBounce(bug.x, bug.y);
            }
          } else if (p.skill === "heavy") {
            bug.setVelocityX(p.x > bug.x ? -60 : 60); // bonk, turn away
            sfx.bugBonk(bug.x, bug.y);
          } else {
            this.killPlayer(p);
          }
        }
      }
    });

    this.updateCrane(delta);
    this.updateWorld2(time, delta, dt);

    // ropes: slight catenary sag, a hook head at the far end, and speed-lines
    // while the grappler is zipping. Reeling gets the same rope + pull dust.
    this.rope.clear();
    this.hooks.forEach((h) => h.setVisible(false));
    for (const p of this.players) {
      const glow = this._zipGlow[p.idx];
      if (p.zip) {
        const col = p.idx === 0 ? COLORS.beep : COLORS.boop;
        this.drawRope(p.x, p.y - 8, p.zip.x, p.zip.y, col, 0.9, p.zip.arrived ? 1 : 0.35);
        this.placeHook(p.idx, p.zip.x, p.zip.y, p.x, p.y - 8);
        if (!p.zip.arrived && (this._zipTick = (this._zipTick || 0) + 1) % 2 === 0) {
          this.zipLines.emitParticleAt(p.x, p.y - 6, this.fxBudget(1));
        }
        // P11: keep the live rope endpoints so the afterglow can fade from them
        glow.x1 = p.x; glow.y1 = p.y - 8; glow.x2 = p.zip.x; glow.y2 = p.zip.y; glow.col = col;
        this._wasZipping[p.idx] = true;
      } else if (this._wasZipping[p.idx]) {
        // zip just released → start the 250ms rope afterglow from the last pose
        this._wasZipping[p.idx] = false;
        glow.t = 250;
      }
      if (p.reeled) {
        const col = p.reeled.idx === 0 ? COLORS.beep : COLORS.boop;
        this.drawRope(p.reeled.x, p.reeled.y - 8, p.x, p.y, col, 0.9, 1);
        this.placeHook(p.idx, p.x, p.y, p.reeled.x, p.reeled.y - 8);
        if ((this._reelTick = (this._reelTick || 0) + 1) % 6 === 0) {
          this.dust.emitParticleAt(p.x, p.body ? p.body.bottom : p.y + 20, this.fxBudget(2));
          // P11: friction sparks flick at the winch anchor (the reeler's hand)
          this.sparks.emitParticleAt(p.x, p.y - 8, this.fxBudget(1));
        }
      }
    }
    // P11: zip-line afterglow — the rope fades over 250ms after release instead
    // of vanishing instantly (two fixed slots, mutated in place, zero alloc).
    for (const glow of this._zipGlow) {
      if (glow.t > 0) {
        glow.t -= delta;
        const a = Math.max(glow.t, 0) / 250;
        this.drawRope(glow.x1, glow.y1, glow.x2, glow.y2, glow.col, a * 0.7, 1);
      }
    }
    this.ropeFlashes = this.ropeFlashes.filter((f) => {
      f.t -= delta;
      if (f.t > 0) {
        this.drawRope(f.x1, f.y1, f.x2, f.y2, 0xffffff, f.t / 200, 0.5);
        return true;
      }
      return false;
    });

    this.updateHintPreview(delta); // U6 — throw arc + rope tether preview
    this.updateThrowTrails(delta); // P11 — thrown-buddy dotted fading trail

    // exit: both buddies through the open door
    if (this.exitDoor && this.exitDoor.open) {
      const inState = this.players.map(
        (p) => !p.dead && Phaser.Geom.Rectangle.Contains(this.exitDoor.zone, p.x, p.y)
      );
      const inZone = inState.filter(Boolean).length;
      const bothIn = this.players.every(
        (p, i) => !p.dead && (inState[i] || (p.carriedBy && Phaser.Geom.Rectangle.Contains(this.exitDoor.zone, p.carriedBy.x, p.carriedBy.y)))
      );
      if (inZone === 1) this.showExitWaiting(inState.findIndex((v) => !v));
      else this.hideExitWaiting();
      if (bothIn) this.finishLevel();
    }

    this.players.forEach((p) => (p.standingOn = null));
    this.updateCoach(time);
    this.updateLockFeedback(time, delta);
    this.updateHandholdHint(time, delta);
    this.updateLoops();
    // ANIM A1: drive the character rig LAST — after all game logic — so it is a
    // pure visual overlay (logic first, motion after; input is never eaten). A1
    // is invisible: this places no parts and plays no fidget yet.
    this.anim.update(time, delta);
    // SL2: drive the passive progress watchdog LAST of all — after every game
    // system AND the anim overlay — so it observes the fully-settled frame and
    // only READS it (no physics/logic/input touched; zero per-frame allocation).
    this.watchdog.update(time, delta);
    // SL3: drive the explicit-softlock detectors immediately AFTER the watchdog —
    // same settled frame, read-only. On a confirmed hard softlock this raises the
    // firm tier-2 + structured `this.softlock` signal, overriding the watchdog's
    // live tier for the frame. Silent (no signal) in every recoverable situation.
    this.detectors.update(time, delta);
    // SL4: render the pooled "Stuck?" prompt from the now-settled SL2/SL3 signals.
    // Pure read of this.stuckTier / this.softlock; toggles the prompt only on a
    // tier change (zero per-frame alloc). Offers R×2/ESC×2 — never touches input.
    this.updateStuckPrompt(time);
    this.updateCamera(dt);
  }

  // Ambience loops: one persistent gain-wrapped source per emitter KIND, whose
  // gain is set each frame from the nearest emitter's proximity (silent when
  // off-screen). No per-frame node creation — setLoop just ramps a live gain.
  updateLoops() {
    // track the x of the emitter that yields the loudest proximity so the loop's
    // stereo pan can follow it (setLoop updates pan on its existing per-tick gain
    // ramp — no per-frame nodes).
    if (this.beltSprites.length) {
      let prox = 0, px = null;
      for (const p of this.players) {
        if (p.dead) continue;
        const c = this.tileAt(p.x, p.body.bottom + 6);
        if ((c === "<" || c === ">") && p.grounded) { const q = proximity(p.x, p.y); if (q > prox) { prox = q; px = p.x; } }
      }
      setLoop("conveyor", prox, px);
    }
    if (this.rollers.length) {
      let prox = 0, px = null;
      for (const r of this.rollers) { const q = proximity(r.img.x, r.img.y); if (q > prox) { prox = q; px = r.img.x; } }
      setLoop("motor", prox, px);
    }
    if (this.jets.length) {
      let prox = 0, px = null;
      for (const j of this.jets) if (j.active) { const q = proximity(j.x, j.topY + j.len / 2); if (q > prox) { prox = q; px = j.x; } }
      setLoop("hiss", prox, px);
    }
    if (this.fans.length) {
      let prox = 0, px = null;
      for (const f of this.fans) {
        const inCol = this.players.some((p) => !p.dead && !p.carriedBy && Phaser.Geom.Rectangle.Contains(f.zone, p.x, p.y));
        if (inCol) { const q = proximity(f.zone.centerX, f.zone.centerY); if (q > prox) { prox = q; px = f.zone.centerX; } }
      }
      setLoop("fan", prox, px);
    }
    if (this.lifts.length) {
      let prox = 0, px = null;
      for (const lf of this.lifts) if (Math.abs(lf.img.body.velocity.y) > 1) { const q = proximity(lf.img.x, lf.img.y); if (q > prox) { prox = q; px = lf.img.x; } }
      setLoop("lift", prox, px);
    }
  }

  // --- world 2: rollers, wardens, steam jets, fans -----------------------------
  updateWorld2(time, delta, dt) {
    const bodyRect = (p) => new Phaser.Geom.Rectangle(p.body.x, p.body.y, p.body.width, p.body.height);

    // P3 ambient (W2 only). Fog (WebGL tier only) drifts by translating x, wrapped
    // by the tile width — never tilePositionX, which would re-rasterise the fill
    // each frame. Drips (both tiers) are pooled, <=8 alive. Gated independently so
    // drips still fall on the Canvas tier, where fog is not created.
    if (this.fogStrips) {
      for (const f of this.fogStrips) {
        f._fogOff += f._fogSpeed * dt;
        let o = f._fogOff % f._fogWrap;
        if (o < 0) o += f._fogWrap;
        f.x = -o;
      }
    }
    if (this.drips) {
      this._dripCd -= delta;
      if (this._dripCd <= 0) {
        const p = this.dripPoints[(Math.floor(time / 620) % this.dripPoints.length)];
        this.emitSafe(this.drips, p.x, p.y, 1);
        this._dripCd = 620;
      }
    }

    this.beamGfx.clear();
    for (const r of this.rollers) {
      const img = r.img;
      if (r.state === "patrol") {
        img.body.setVelocityX(58 * r.dir);
        if (img.body.blocked.left || img.x < r.minX + 20) r.dir = 1;
        else if (img.body.blocked.right || img.x > r.maxX - 20) r.dir = -1;
        img.setFlipX(r.dir === -1);
      } else {
        img.body.setVelocityX(0);
      }
      // vision beam: eye-level only, blocked by walls (and shimmer-walls)
      const eyeY = img.y - 5;
      let len = r.beamLen;
      for (let s = 12; s <= r.beamLen; s += 12) {
        const c = this.tileAt(img.x + r.dir * (22 + s), eyeY);
        if (this.isSolidChar(c) || c === "~") {
          len = s;
          break;
        }
      }
      const bx = img.x + r.dir * 22;
      r.beamRect = new Phaser.Geom.Rectangle(r.dir === 1 ? bx : bx - len, eyeY - 13, len, 26);
      const seen = this.players.find(
        (p) => !p.dead && p.invuln <= 0 && !p.carriedBy && p.skill !== "tiny" &&
          Phaser.Geom.Rectangle.Overlaps(r.beamRect, bodyRect(p))
      );
      r._seen = seen || null; // A6: cache the resolved beam target for the rig's pupil snap (read-only)
      if (r.state === "patrol" && seen) {
        r.state = "alert";
        r.timer = 500;
        sfx.rollerAlert(img.x, img.y); // rising "?!" chirp
      } else if (r.state === "alert") {
        r.timer -= delta;
        if (!seen) r.state = "patrol";
        else if (r.timer <= 0) {
          sfx.rollerZap(img.x, img.y); // discharge crack
          this.killPlayer(seen);
          r.state = "cool";
          r.timer = 900;
        }
      } else if (r.state === "cool") {
        r.timer -= delta;
        if (r.timer <= 0) r.state = "patrol";
      }
      // beam as a gradient wedge: bright/wide at the eye, fading + narrowing out
      // (3 stacked alpha rects). Red when alert, warning-yellow otherwise.
      const bright = r.state === "alert" ? 0xff5566 : 0xffe066;
      const baseA = r.state === "alert" ? 0.5 : 0.26;
      const seg = len / 3;
      for (let i = 0; i < 3; i++) {
        const h = 26 - i * 5;
        this.beamGfx.fillStyle(bright, baseA * (1 - i * 0.34));
        const sx = r.dir === 1 ? bx + i * seg : bx - (i + 1) * seg;
        this.beamGfx.fillRect(sx, eyeY - h / 2, seg, h);
      }
      // A6: base ATTACHMENT only — the pupil sits at the eye centre and the wheels
      // ride their hubs; the ANIM RIG (roller_anim.js) drives the pupil track/snap/
      // dilate slide and the velocity-matched wheel spin as a pure overlay, so a
      // rig-off (`?animoff=1`) roller renders static. Position stays here (so the
      // P7 art follows the body even with the rig disabled); rotation/scale is the rig's.
      r.pupil.setPosition(img.x, img.y - 5);
      r.wheels[0].setPosition(img.x - 9, img.y + 11);
      r.wheels[1].setPosition(img.x + 9, img.y + 11);
      // P7: warning lamp lit while alerted (static texture-state swap; no spin)
      const lampTex = r.state === "alert" ? "roller_lamp_lit" : "roller_lamp";
      if (r._lampTex !== lampTex) { r._lampTex = lampTex; r.lamp.setTexture(lampTex); }
      r.lamp.setPosition(img.x, img.y - 20);
      // P8: alarm light pool tracks the cab lamp, lit only while alerted.
      if (r.lampPool) {
        const alerted = r.state === "alert";
        if (r.lampPool.visible !== alerted) r.lampPool.setVisible(alerted);
        if (alerted) r.lampPool.setPosition(img.x, img.y - 20);
      }
      // alert = red flash (texture swap; setTint no-ops on Canvas) + "!" popup
      // U11 FLASH soft: the alert strobe stays red (meaning-bearing) but slows
      // from a 200ms to a 400ms period.
      const strobePer = 200 / uxFlashScale();
      const wantTex = r.state === "alert" ? ((time % strobePer) < strobePer / 2 ? "roller_alert" : "roller") : "roller";
      if (r._tex !== wantTex) { r._tex = wantTex; img.setTexture(wantTex); }
      if (r.state === "alert") {
        if (!r.excl.visible) {
          r.excl.setVisible(true).setScale(0.4).setAlpha(1);
          this.tweens.add({ targets: r.excl, scale: 1, duration: 160, ease: "back.out" });
        }
        r.excl.setPosition(img.x, img.y - 34);
      } else if (r.excl.visible) {
        r.excl.setVisible(false);
      }
    }

    for (const w of this.wardens) {
      if (w.defeated) continue;
      if (w.shoveCd > 0) w.shoveCd -= delta;
      for (const p of this.players) {
        if (p.dead || p.carriedBy) continue;
        const dx = p.x - w.img.x;
        if (Math.abs(dx) > 48 || Math.abs(p.y - w.img.y) > 62) continue;
        if (Math.sign(dx) === w.facing || dx === 0) {
          if (w.shoveCd > 0 || Math.abs(dx) > 44) continue;
          p.setVelocity(w.facing * 430, -230); // firm but polite shove
          w.shoveCd = 500;
          sfx.wardenShove(w.img.x, w.img.y); // thud + comic HMPH buzz
          this.popStar(w.img.x + w.facing * 22, p.y); // impact star at contact
          this.tweens.add({ targets: w.img, x: w.x + w.facing * 4, duration: 70, yoyo: true });
        } else {
          w.defeated = true;
          w.img.setTexture("warden_defeat"); // P7: swap to the cross-eye defeat pose
          if (w.badge) w.badge.setVisible(false);
          this.boom.explode(this.fxBudget(16), w.img.x, w.img.y);
          sfx.wardenTopple(w.img.x, w.img.y); // descending slide-whistle topple
          w.img.body.enable = false;
          if (w.glow) { this.tweens.killTweensOf(w.glow); w.glow.setVisible(false); }
          // A7: the topple gains a BOUNCE (bounce.out settles the fall with a rebound);
          // ~2s after it settles the body TWITCHES once (a comedy beat). Both are cosmetic
          // overlays on the existing topple — the anim rig has handed the host rotation
          // back to this tween (it returns early once w.defeated flips). Body already
          // disabled above, so this motion never touches gameplay geometry.
          this.tweens.add({
            targets: w.img, angle: -w.facing * 84, alpha: 0.25, y: w.img.y + 18,
            duration: MOTION.WARDEN_TOPPLE.dur, ease: MOTION.WARDEN_TOPPLE.ease,
            onComplete: () => {
              if (!w.img || !w.img.scene) return;
              this.time.delayedCall(2000, () => {
                if (!w.img || !w.img.scene) return;
                this.tweens.add({
                  targets: w.img, angle: w.img.angle + w.facing * 7,
                  duration: MOTION.WARDEN_TWITCH.dur, yoyo: true, ease: MOTION.WARDEN_TWITCH.ease,
                });
              });
            },
          });
          this.dizzyStars(w.img.x, w.img.y); // stars circle the fallen body ~1s
          this.game.events.emit("bb:blip", "KOBI: WARDEN DOWN?! You went THROUGH the WALL?! That is CHEATING and also very clever.");
        }
        break;
      }
    }

    for (const j of this.jets) {
      if (j.disabledBy && this.levers.find((l) => l.id === j.disabledBy)?.on) {
        if (j.active) {
          j.active = false;
          j.gfx.clear();
        }
        continue;
      }
      j.active = (time + j.offset) % j.period < j.on;
      j.gfx.clear();
      if (j.active) {
        // soft-edge gradient plume: a wide faint halo + a bright core, both
        // fading toward the tip, with a gentle alpha wobble.
        const baseA = 0.34 + 0.1 * Math.sin(time / 45);
        const segs = 6;
        for (let s = 0; s < segs; s++) {
          const ay = j.topY + (j.len * s) / segs;
          const ah = j.len / segs + 1;
          const fade = 1 - (s / segs) * 0.72;
          j.gfx.fillStyle(0xcdd8ff, baseA * 0.42 * fade);
          j.gfx.fillRect(j.x - 11, ay, 22, ah); // soft halo
          j.gfx.fillStyle(0xeef4ff, baseA * fade);
          j.gfx.fillRect(j.x - 5, ay, 10, ah);  // bright core
        }
        // drip droplets seeping from the nozzle, rate-limited per jet
        j.dripCd = (j.dripCd || 0) - delta;
        if (j.dripCd <= 0) { this.jetDrips.emitParticleAt(j.x, j.topY + 2, 1); j.dripCd = 200; }
        for (const p of this.players) {
          if (!p.dead && p.invuln <= 0 && Phaser.Geom.Rectangle.Overlaps(j.zone, bodyRect(p))) this.killPlayer(p);
        }
      }
    }

    // U5 (F11): all-clear moment. When a valve wired to a vent-lamp is first
    // thrown, flip the lamp green and (once per level) puff every jet that valve
    // silenced + emit KOBI's "steam's off" blip.
    for (const vl of this.ventLamps) {
      if (vl.lit) continue;
      if (!this.levers.find((l) => l.id === vl.wiredTo)?.on) continue;
      vl.lit = true;
      vl.lamp.setTexture("lamp_green");
      if (vl.pool) vl.pool.setTint(0x59ff9c); // P8: pool follows lamp to green
      if (!this._allClearFired) {
        this._allClearFired = true;
        for (const j of this.jets) {
          if (j.disabledBy === vl.wiredTo) this.ventPuff.explode(this.fxBudget(12), j.x, j.topY + 6);
        }
        this.game.events.emit("bb:blip", "KOBI: Steam's off. Probably. It's PROBABLY off.");
      }
    }

    for (const f of this.fans) {
      if (f.col) f.col.setAlpha(0.06 + 0.05 * Math.sin(time / 130 + f.zone.x)); // column alpha wobble
      for (const p of this.players) {
        if (p.dead || p.carriedBy || p.zip) continue;
        if (Phaser.Geom.Rectangle.Overlaps(f.zone, bodyRect(p))) {
          if (p.skill === "tiny") {
            if (!p.grounded) sfx.fanFlutter(p.x, p.y); // rate-limited updraft flutter
            p.body.velocity.y = Math.max(p.body.velocity.y - 2100 * dt, -275);
            // FL-010: gentle keyless centering — airborne momentum never decays,
            // so without this, riding the one-tile draft demands frame-perfect
            // zigzagging (the roadmap's intent is "floats up"). Steering keys
            // always win: only applied while neither direction is held.
            if (!p.grounded && !p.keys.left.isDown && !p.keys.right.isDown &&
                !(p.pad && (p.pad.left.isDown || p.pad.right.isDown))) {
              const pull = Phaser.Math.Clamp((f.zone.centerX - p.x) * 3, -120, 120);
              // Frame-rate-INDEPENDENT centering (FL-013 root-cause fix). The old
              // fixed 0.12/frame lerp centered weaker-per-second at low fps, so
              // under render load (Canvas review box, heavy backdrops) Tiny drifted
              // out of the one-tile draft and the ride failed — the recurring 2-2
              // flake. Convert to a real-time exponential: at the 60 fps reference
              // dt*60 = 1 and t = 0.12 EXACTLY (behavior byte-identical there), and
              // at lower fps t grows to hold the same per-second centering.
              const t = 1 - Math.pow(1 - 0.12, dt * 60);
              p.body.velocity.x = Phaser.Math.Linear(p.body.velocity.x, pull, t);
            }
          } else {
            p.body.velocity.y -= 320 * dt; // too heavy to lift, just a breeze
          }
        }
      }
    }
  }

  showExitWaiting(idx) {
    const c = this.exitLabel;
    if (idx < 0 || c.waitIdx === idx) return;
    c.waitIdx = idx;
    c.setVisible(true);
    c.buddyIcons.forEach((ic, i) => ic.setVisible(i === idx).setAngle(0));
    c.pulse.restart();
    if (c.wave) c.wave.restart();
  }

  hideExitWaiting() {
    const c = this.exitLabel;
    if (!c || c.waitIdx === -1) return;
    c.waitIdx = -1;
    c.setVisible(false);
    c.pulse.pause();
    if (c.wave) c.wave.pause();
  }

  // U8: a playful KOBI grade for the run, picked by simple rules — deaths first,
  // then time vs. the previous best. Every line is kid copy <=60 chars, KOBI's
  // grudging voice. `rec` is saveRecord()'s summary (null for the tutorial).
  gradeLine(deaths, rec) {
    if (deaths === 0) return "SUSPICIOUSLY competent.";
    if (deaths >= 5) return "The floor kept winning. I respect the effort.";
    if (deaths >= 3) return "Many respawns. The toasters are proud of you.";
    // 1-2 deaths: reward a genuine time record with a grudging compliment.
    const fasterThanBest = !!(rec && rec.beatTime && rec.prevTime !== null);
    if (fasterThanBest) return "Fast. I'm not impressed. (I'm a little impressed.)";
    return "Cleared. Adequate. Don't let it go to your head.";
  }

  finishLevel() {
    if (this.complete) return;
    this.complete = true;
    if (this.hintGfx) this.hintGfx.clear(); // drop any U6 preview before the clear overlay
    stopLoops(); // silence all ambience the instant the level is cleared
    sfx.win();
    // Sprint 10: the tutorial NEVER touches the save (no unlock/core writes) — its
    // clear overlay reads "ORIENTATION COMPLETE!" and continue returns to Title.
    let newlyUnlocked = false;
    if (!this.def.tutorial) {
      const before = loadSave().unlocked;
      completeLevel(this.levelIndex, this.def.id, this.coresGot);
      newlyUnlocked = loadSave().unlocked > before;
    } else {
      // U10 (F6): the tutorial's ONLY persistence — a ux-v1 flag that clears the
      // title's "new!" pip. Set from ANY flow (menu or interstitial). Still
      // writes NOTHING to the save key (standing rule).
      markTutorialDone();
    }

    // U8 (F15): freeze the run counters and build the clear-overlay stats ONCE.
    // The time string is built here (not per frame). Records persist to the UX
    // key only for real chambers — the tutorial writes NOTHING (standing rule).
    const timeMs = this._elapsedMs;
    const deaths = this._deaths;
    const coresCount = this.coresGot.filter(Boolean).length;
    let rec = null;
    if (!this.def.tutorial) rec = saveRecord(this.def.id, timeMs, deaths);
    const stats = {
      timeMs, timeStr: fmtTime(timeMs), deaths, coresCount,
      grade: this.gradeLine(deaths, rec),
      beatTime: !!(rec && rec.beatTime && rec.prevTime !== null),
      beatDeaths: !!(rec && rec.beatDeaths && rec.prevDeaths !== null),
    };

    playJingle("jingle_clear"); // stops the level track, plays the clear cadence
    this.physics.pause();
    if (this.def.blips && this.def.blips.clear) this.game.events.emit("bb:blip", this.def.blips.clear);
    // U9 (F17): finishing with ALL three cores -> a greedy-respect KOBI line,
    // layered into the clear flow via the SAME blip queue (it queues AFTER the
    // clear blip). This does NOT delay finishLevel or the overlay — the overlay
    // still fires on its own 500ms delayedCall below, independent of the blip bar.
    if (!this.def.tutorial && this.coresGot.every(Boolean)) {
      const line = u9Pick(U9_ALLCORES_LINES);
      if (line) { this._u9AllCores = line; this.game.events.emit("bb:blip", line); }
    }
    this.time.delayedCall(500, () => {
      this.game.events.emit("bb:complete", {
        index: this.levelIndex, id: this.def.id, name: this.def.name, cores: this.coresGot,
        newlyUnlocked, tutorial: !!this.def.tutorial, returnToHub: this.returnToHub, stats,
      });
    });
  }

  // Draw a rope as a slightly sagging catenary (quadratic Bezier) into the shared
  // rope Graphics, sampling the reusable point buffer (no per-frame allocation).
  // sagScale scales the droop: ~1 slack, ~0.35 taut mid-zip.
  drawRope(x1, y1, x2, y2, color, alpha, sagScale = 1) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const sag = Phaser.Math.Clamp(dist * 0.13, 5, 42) * sagScale;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 + sag; // control point pulled down by "gravity"
    const pts = this._ropePts;
    const n = pts.length - 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts[i].x = u * u * x1 + 2 * u * t * mx + t * t * x2;
      pts[i].y = u * u * y1 + 2 * u * t * my + t * t * y2;
    }
    this.rope.lineStyle(3, color, alpha);
    this.rope.strokePoints(pts, false, false);
  }

  // U6 — read-only preview overlays drawn into the shared hintGfx (clear+redraw
  // like the rope). Two affordances, both gated behind the global uxHints()
  // kill-switch (U11 wires the real HINTS setting):
  //   1. THROW ARC: while carrying, a faint dotted ballistic arc showing exactly
  //      where the buddy would land, using the SAME throw constants + facing the
  //      throw applies (heavy/tiny variants; high-toss while jump is held).
  //   2. ROPE TETHER: a barely-there dashed line between a grounded, idle,
  //      grapple-skilled player and a buddy that satisfies the DOWN-chord reel
  //      acceptance — the "you could rope me" hint.
  // Never reads or writes physics state beyond sampling; no bb:* events.
  updateHintPreview(delta) {
    const g = this.hintGfx;
    g.clear();
    // U11 probe observability: true iff THIS frame drew an arc/tether into
    // hintGfx. Passive boolean — never read by game code.
    this._hintDrawn = false;
    if (!uxHints() || this.complete || this.leaving) return;

    // Tutorial gate: the throw arc stays hidden until the station-5 trigger has
    // fired, so the tutorial's own glyphs teach carry/throw first (F5-adjacent).
    let arcAllowed = true;
    if (this.def.tutorial) {
      const s5 = this.triggers.find((t) => t.id === "s5");
      arcAllowed = !!(s5 && s5.fired);
    }

    for (const p of this.players) {
      // --- 1. throw arc (carrying) --------------------------------------------
      if (arcAllowed && p.carrying && !p.dead) {
        const q = p.carrying;
        const heavyThrower = p.skill === "heavy";
        const highToss = p.keys.jump.isDown || (p.pad && p.pad.jump.isDown);
        // Release origin + launch velocity: an EXACT mirror of throwPartner().
        const ox = p.x + p.facing * 10;
        const oy = p.y - p.displayHeight / 2 - 20;
        let vx, vy;
        if (highToss) {
          vx = p.facing * 120;
          vy = -PHYS.tossY * (q.skill === "tiny" ? 1.08 : 1);
        } else {
          const flyBoost = q.skill === "tiny" ? 1.9 : 1;
          vx = p.facing * (heavyThrower ? PHYS.heavyThrowX : PHYS.throwX) * flyBoost;
          vy = -(heavyThrower ? PHYS.heavyThrowY : PHYS.throwY);
        }
        this.drawThrowArc(g, ox, oy, vx, vy, q.idx === 0 ? COLORS.beep : COLORS.boop);
        this._hintDrawn = true;
      }

      // --- 2. rope tether (grapple, grounded, idle, buddy reelable) -----------
      const moving = p.keys.left.isDown || p.keys.right.isDown || p.keys.jump.isDown ||
        p.keys.down.isDown || p.keys.act.isDown || (p.keys.actAlt && p.keys.actAlt.isDown) ||
        (p.pad && (p.pad.left.isDown || p.pad.right.isDown || p.pad.jump.isDown || p.pad.down.isDown || p.pad.act.isDown));
      const still = p.skill === "grapple" && !p.dead && p.grounded &&
        !p.carrying && !p.carriedBy && !p.zip && !p.reeled &&
        Math.abs(p.body.velocity.x) < 8 && !moving;
      p._tetherIdle = still ? (p._tetherIdle || 0) + delta : 0;
      if (still && p._tetherIdle > 1000 && this.coachBuddyReelable(p)) {
        const accent = (this.theme && this.theme.accent) || WORLD_THEMES[1].accent;
        this.drawDashedTether(g, p.x, p.y - 8, p.partner.x, p.partner.y - 8, accent);
        this._hintDrawn = true;
      }
    }
  }

  // Sample the throw trajectory into a dotted arc. This is NOT a naive parabola:
  // once released, the buddy runs its OWN Player.update every frame, so the path
  // is shaped by two forces the throw velocity alone hides —
  //   * variable jump-cut: a released buddy isn't holding its jump key, so the
  //     frame after launch `if (!jump && vy < -260) vy = -260` caps upward speed
  //     (this is why even a -820 high-toss only rises a little without an assist);
  //   * air-drag: with no directional key held, airborne vx eases toward 0 at
  //     k = 0.4 (Player.js line 292-293), so horizontal reach bleeds off.
  // Replicating both here (plus Arcade's post-update gravity + maxVelocity clamps)
  // is what lands the final dot within a tile of the real throw. ~11 dots over
  // ~1s, alpha fading along the arc; the last dot slightly larger.
  drawThrowArc(g, x0, y0, vx0, vy0, color) {
    const pts = this._arcPts;
    pts.length = 0;
    const sub = 1 / 120;              // integration substep
    const stepMs = 90;               // ~90ms between dots -> ~11 dots across ~1s
    const totalMs = 1000;
    const JUMP_CUT = 260, DRAG_K = 0.4; // mirror Player.update airborne handling
    let vx = Phaser.Math.Clamp(vx0, -1000, 1000); // body maxVelocity.x
    let vy = vy0;
    let x = x0, y = y0, tMs = 0, nextDot = stepMs;
    while (tMs <= totalMs) {
      vx += (0 - vx) * (sub * DRAG_K);            // air-drag toward 0 (no key held)
      if (vy < -JUMP_CUT) vy = -JUMP_CUT;         // released buddy isn't holding jump
      vy = Phaser.Math.Clamp(vy + PHYS.grav * sub, -PHYS.maxFall, PHYS.maxFall);
      x += vx * sub;
      y += vy * sub;
      tMs += sub * 1000;
      if (tMs >= nextDot) {
        pts.push(x, y);
        nextDot += stepMs;
      }
    }
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      const a = 0.5 * (1 - i / (n + 1)); // fade along the arc, start faint
      g.fillStyle(color, last ? Math.max(a, 0.4) : a);
      g.fillCircle(pts[i * 2], pts[i * 2 + 1], last ? 4 : 2.5);
    }
  }

  // A barely-there dashed line (2px dashes, alpha 0.25) between two points.
  drawDashedTether(g, x1, y1, x2, y2, color) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    if (dist < 1) return;
    const ux = (x2 - x1) / dist, uy = (y2 - y1) / dist;
    const dash = 8, gap = 7;
    g.lineStyle(2, color, 0.25);
    for (let d = 0; d < dist; d += dash + gap) {
      const e = Math.min(d + dash, dist);
      g.lineBetween(x1 + ux * d, y1 + uy * d, x1 + ux * e, y1 + uy * e);
    }
  }

  // Park a player's pooled hook head at the far rope end, angled along the rope.
  placeHook(idx, hx, hy, fromX, fromY) {
    this.hooks[idx].setVisible(true).setPosition(hx, hy)
      .setRotation(Math.atan2(hy - fromY, hx - fromX) + Math.PI / 2);
  }

  updateCamera(dt) {
    const cam = this.cameras.main;
    const alive = this.players.filter((p) => !p.dead);
    if (!alive.length) return;
    const xs = alive.map((p) => p.x);
    const ys = alive.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const dx = Math.max(...xs) - Math.min(...xs);
    const dy = Math.max(...ys) - Math.min(...ys);
    const zx = this.scale.width / (dx + 520);
    const zy = this.scale.height / (dy + 380);
    const targetZoom = Phaser.Math.Clamp(Math.min(zx, zy), 0.62, 1.06);
    const k = Math.min(1, dt * 5);
    this.camPos.x += (cx - this.camPos.x) * k;
    this.camPos.y += (cy - this.camPos.y) * k;
    this.camPos.zoom += (targetZoom - this.camPos.zoom) * k;
    // zoom-punch: a stomp adds a brief additive kick that decays to zero here.
    // It only touches the RENDERED zoom — camPos.zoom (world coords the beat kit
    // and the audio listener read) is never changed, so gameplay stays frozen.
    if (this.zoomKick > 0.0005) this.zoomKick = Phaser.Math.Linear(this.zoomKick, 0, Math.min(1, dt * 16));
    else this.zoomKick = 0;
    cam.setZoom(this.camPos.zoom + this.zoomKick);
    cam.centerOn(this.camPos.x, this.camPos.y);
    // publish the camera midpoint + on-screen half-extents for proximity SFX
    setListener(this.camPos.x, this.camPos.y, this.scale.width / 2 / this.camPos.zoom, this.scale.height / 2 / this.camPos.zoom);
  }
}
