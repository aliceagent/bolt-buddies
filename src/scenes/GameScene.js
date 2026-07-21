import Phaser from "phaser";
import { TILE, COLORS, PHYS, DEPTH, SKILL_INFO, WORLD_THEMES, FADE_NAVY, FONT, FONT_DISPLAY, FS, TEXT, PARTICLES } from "../constants.js";
import { ringGlow, glowShape, iconChip, iconGlow, softBody, sheen, glassPanel, GLASS_HI, desat, isWebGL, farStrip, nearStrip, atmoBand, landmark, LANDMARK_SIZES } from "../ui/paint.js";
import { LEVELS } from "../levels/registry.js";
import { makeGrid } from "../levels/builder.js";
import devW3 from "../levels/dev_w3.js";
import devW4 from "../levels/dev_w4.js";
import { completeLevel, loadSave } from "../save.js";
import { initAudio, sfx, installMute, playTrack, setMusicLayer, playJingle, trackForLevel, setListener, clearListener, proximity, setLoop, stopLoops, pauseDuck, setSadMusic } from "../audio.js";
import { addGradient, addMotes, addPropStrip, addFarStrip, addNearStrip, addAtmo, addFogBand, addDrips, addDustShafts, addVignette, addForegroundStrip, addWeather } from "../backdrop.js";
import Player from "../objects/Player.js";
import { uxHints, uxShakeScale, uxFlashScale, saveRecord, fmtTime, markTutorialDone } from "../ux.js";
import { pads, showPadToast } from "../pad.js";
import { drawWorldIcon } from "../worldIcons.js";
import { AnimSystem } from "../anim/index.js";
import { MOTION } from "../anim/motion.js";
import { ProgressWatchdog } from "../softlock/watchdog.js";
import { SoftlockDetectors } from "../softlock/detectors.js";
import { STREAK_LINES as U9_STREAK_LINES, ALLCORES_LINES as U9_ALLCORES_LINES, BarkDirector } from "../barks.js";

const J = Phaser.Input.Keyboard.JustDown;

// W3W4 L33: SCRAP STORM tuning. Read ONLY by the 3-3 storm paths (scraplane/
// fusecore/fusesocket entities + the magnet catch), which no other level spawns.
// Fixed timers keep the storm rhythmic (catch -> shield window -> cooldown),
// never trivializing: the hold is shorter than the long lane group, so crossings
// are planned, and every value is deterministic (driven routes reproduce runs).
const STORM = {
  holdMs: 8000,   // caught-scrap shield hold before the storm rips it away
  plantMs: 6000,  // planted-step lifetime
  catchCd: 3500,  // re-catch cooldown after the shield is lost/expired
  hitW: 32,       // chunk-vs-robot contact half-width (px)
  hitH: 32,       // chunk-vs-robot contact half-height (px)
  blockW: 46,     // chunk-vs-shield intercept half-width (px)
  blockH: 62,     // chunk-vs-shield intercept half-height (a tall protective column)
  graceMs: 900,   // absorbed/popped chunk dark-time at the emitter (no point-blank re-bite)
};

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
// U9_STREAK_LINES / U9_ALLCORES_LINES now live in src/barks.js (single source of
// truth so the VO build voices them too) — imported at the top of this file.
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
    // W3W4 M3/M4: dev-only sandbox hook. Honored ONLY when the page itself was
    // loaded with ?devlevel=<id> — normal play/registry/hub can never reach it.
    const want = data && data.devLevel;
    const devOk = (id) => typeof location !== "undefined" &&
      new RegExp(`(?:\\?|&)devlevel=${id}(?:&|$)`).test(location.search);
    this.devLevel = (want === "w3" || want === "w4") && devOk(want) ? want : null;
  }

  create() {
    const def = this.devLevel === "w4" ? devW4 : this.devLevel ? devW3 : LEVELS[this.levelIndex];
    this.def = def;
    // W3W4 M3/M4: bake the World-3/4 texture sets lazily, the first time such a
    // level actually loads (shipped W1/W2 boot path bakes nothing new — inert).
    if (def.world === 3) this.ensureW3Textures();
    if (def.world === 4) this.ensureW4Textures();
    // W3W4 L43: the finale's boss set is baked only when 4-3 itself loads —
    // 4-1/4-2 (and every other level) bake nothing new.
    if (def.finale) this.ensureHeartTextures();
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
    this.deviceHalos = []; // GFX3 G3: machinery bloom halos (WebGL only, cap <=40)
    this._flickBuckets = [[], [], []];
    this.coreItems = [];
    this.keyItems = [];
    this.checkpoints = [];
    this.triggers = []; // Sprint 10: one-shot AABB zones (blip and/or key-glyph reveal)
    // T3: permanent world labels that recede when no robot is near (door/EXIT
    // plates, warden badges, tutorial/trigger glyph clusters). Each entry is
    // { obj, x, y }; a 150ms rolling timer lerps obj.alpha toward a proximity
    // target (1.0 within 6 tiles, 0.35 beyond 10). Boss HP text is NEVER added.
    this.proxLabels = [];
    this._proxT = 0;
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

    // GFX3 G1 — impact feel. `camPunch` is the zoom-punch multiplier updateCamera
    // applies to its computed zoom (1 = no punch); `_hitStopUntil` is the live
    // hit-stop deadline (0 = none). See impactPunch(). Reset per entry/restart.
    this.camPunch = 1;
    this._hitStopUntil = 0;

    // GFX3 G5 — cinematic letterbox + camera push. `camCine` is a SECOND rendered-
    // zoom multiplier (like camPunch) eased toward `_camCineTarget` in updateCamera;
    // it NEVER touches camPos.zoom (the world coords the beat kit + audio listener
    // read). `letterboxOn` guards the idempotent slide. Both reset here so a
    // death/restart mid-cinematic rebuilds clean bars (buildLetterbox in create()).
    this.camCine = 1;
    this._camCineTarget = 1;
    this.letterboxOn = false;

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
    // Reactive bark director (V2.5): live KOBI commentary on death / stuck / enemy
    // kill / puzzle solve. Fresh per scene so cooldown + shuffle bags reset on entry.
    this.barks = new BarkDirector();

    // W3W4 M3: World-3 mechanics state. Arrays are reset every create() like the
    // rest of the level state; `_w3` flips true only when a W3 skill/ent/tile is
    // actually present, and every new update path early-returns on it — so all
    // of this is inert in the shipped W1/W2 levels.
    this._w3 = false;
    this.crates = [];    // metal crates: pushable/magnet-draggable physics boxes
    this.updrafts = [];  // rising air columns (lift a BUBBLED robot)
    this.waters = [];    // water volumes (buoyancy / air-timer / current)
    this.jellies = [];   // zap-jelly floaters
    this.sockets = [];   // jelly sockets (lock a knocked jelly in -> power a door)
    this.chompers = [];  // junk-chompers (magnet yanks their teeth out)
    this.w3Gfx = null;   // shared clear+redraw overlay (air rings, magnet link)
    this._w3Rect = new Phaser.Geom.Rectangle(0, 0, 0, 0); // reused scratch (no per-frame alloc)
    // W3W4 L33: the SCRAP STORM device family (3-3 only — nothing below spawns
    // unless a level lists scraplane/fusecore/fusesocket entities, so W1-W2 and
    // 3-1/3-2 never enter these paths).
    this.stormLanes = [];  // wind lanes of pooled flying scrap chunks
    this.fuseCores = [];   // carriable fuse-cores (the three-ferry objective)
    this.fuseSockets = []; // fuse sockets: a socketed core latches its lever id
    this.stormShield = null; // the single magnet-caught scrap shield (crate body family)

    // W3W4 M4: World-4 mechanics state. `_w4` flips true only when a W4
    // skill/ent is actually present, and every new update path early-returns on
    // it — so all of this is inert in the shipped W1-W3 levels. `frozen` is the
    // TIME-FREEZE world gate every device family checks: while true, device
    // state machines are simply NOT STEPPED (timers untouched, kinematic bodies
    // velocity-held at 0) so the resume is byte-identical by construction.
    this._w4 = false;
    this.frozen = false;   // the freeze gate (read by every device update path)
    this.freezeT = 0;      // ms of world-freeze remaining
    this.darkZones = [];   // near-black rects (glow-radius / beam-cone reveal)
    this.ghosts = [];      // invisible platforms (solid always, lit-only visible)
    this.rotBridges = [];  // spinning kinematic platform assemblies
    this.lasers = [];      // sweeping laser hazards (freeze holds their angle)
    this.iceDoors = [];    // beam-melting door-family barriers
    this.gloomies = [];    // shadow blobs (flee the light, jam plates)
    this.tickers = [];     // clockwork patrollers (held + harmless while frozen)
    this.w4Gfx = null;     // shared clear+redraw overlay (cone, bars, melt fill)
    this.laserGfx = null;  // shared clear+redraw laser-beam painter (pooled draw)
    this.darkRT = null;    // half-res screen-space darkness mask (dark zones only)
    this._w4Line = new Phaser.Geom.Line(0, 0, 0, 0);      // reused scratch (no per-frame alloc)
    this._w4Rect2 = new Phaser.Geom.Rectangle(0, 0, 0, 0); // reused scratch
    this._iceOverlays = []; // pooled frost panels stamped on frozen devices
    this._freezeWash = null; // screen-fixed cold wash while frozen

    // W3W4 L43: KOBI'S HEART (4-3 finale) state. `heart`/`turbines` only spawn
    // from the 4-3 level def (`kobiheart`/`turbine` ents), so every path below
    // is inert in all other levels — same additive pattern as the crane.
    this.heart = null;          // the KOBI-eye boss rig (state machine below)
    this.turbines = [];         // defense turbine columns (freeze-held, station-bound)
    this.heartDefeated = false; // all three cooling cores unplugged
    this.heartResolved = false; // Bolt free + home with the buddies -> exit may open
    this.heartGfx = null;       // shared clear+redraw painter (glare column, cables)

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
    this.enterKey = kb.addKey("ENTER"); // T4: acknowledges a visible stuck panel (blip skip wins first)
    this.paused = false;
    this.cpPos = def.spawns.map(([tx, ty]) => ({ x: tx * TILE + 24, y: ty * TILE + 24 }));

    def.entities.forEach((e) => this.spawnEntity(e));
    // P5: trace lever/plate → device wiring now that every entity exists.
    this.buildConduits();

    // GFX3 G3: phase-wall bloom halos, added AFTER entities so the discrete
    // interactive devices (levers/checkpoints/turrets/magnets) claim the <=40
    // cap first; the shimmer curtain takes whatever budget remains. Constant
    // (phase walls are always emissive). WebGL-gated inside addDeviceHalo.
    for (const s of this.shimmerPts) {
      if (!this.addDeviceHalo(s.x, s.y - 2, 0xc39dff, { alpha: 0.24, scale: 0.42, depth: DEPTH.terrain - 1 })) break;
    }

    // GFX3 G4: foreground occlusion silhouettes (BOTH tiers). Skipped ENTIRELY in
    // the tutorial and the 4-3 boss arena (finale) for readability. Keep-out is a
    // 96px world-x band around every spawn, door/exit, skill station (pedestal)
    // and checkpoint — all known now that entities exist; any ceiling prop landing
    // inside one is dropped by addForegroundStrip.
    this.landmarks = []; this._landmarkX = []; // GFX5 S4: default-empty (scene reused across restarts; tutorial/4-3 stay empty)
    if (!def.tutorial && !def.finale) {
      const KEEP = 96;
      const ko = [];
      def.spawns.forEach(([tx]) => ko.push([tx * TILE + 24 - KEEP, tx * TILE + 24 + KEEP]));
      this.pedestals.forEach((p) => ko.push([p.x - KEEP, p.x + KEEP]));
      this.checkpoints.forEach((c) => ko.push([c.x - KEEP, c.x + KEEP]));
      this.doors.forEach((d) => ko.push([d.wireX - KEEP, d.wireX + KEEP]));
      this.foregroundProps = addForegroundStrip(this, WORLD_THEMES[def.world] ? def.world : 1, ko);
      // GFX5 S2: sparse background-family decals on WALL FACES, reusing the SAME
      // G4 keep-out band list (spawns/pedestals/checkpoints/doors) — skipped in the
      // tutorial + 4-3 arena by this guard, exactly like the foreground strip.
      this.scatterWallDecals(ko);
      // GFX5 S4: 1-2 big landmark set-pieces on the background wall space, reusing
      // the SAME G4 keep-out list — skipped in the tutorial + 4-3 arena by this
      // guard, exactly like the foreground strip and the S2 wall decals.
      this.landmarks = this.placeLandmarks(ko);
    }

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

    // W3W4 M3: World-3 physics wiring — only when W3 content is present.
    if (this.crates.length) {
      const crateImgs = this.crates.map((c) => c.img);
      this.physics.add.collider(crateImgs, this.solidObjs);
      this.physics.add.collider(crateImgs, crateImgs); // stackable stairs
      this.physics.add.collider(crateImgs, this.doorGroup);
      this.physics.add.collider(this.players, crateImgs, rideCb); // standable + rideable
    }
    if (this.chompers.length) this.physics.add.collider(this.chompers.map((c) => c.img), this.solidObjs);
    // W3W4 L33: the caught-scrap shield reuses the CRATE collider family (solids
    // + players-with-rideCb) so a PLANTED shield is a proven standable step. Its
    // body is only enabled while planted (held = pure visual follow + manual
    // chunk intercept), so these colliders are inert the rest of the time.
    if (this.stormShield) {
      this.physics.add.collider(this.stormShield.img, this.solidObjs);
      this.physics.add.collider(this.players, this.stormShield.img, rideCb);
    }
    if (this.jellies.length) {
      const jellyImgs = this.jellies.map((j) => j.img);
      this.physics.add.collider(jellyImgs, this.solidObjs);
      this.physics.add.collider(jellyImgs, this.doorGroup); // a knocked jelly can't fly through a closed door
    }
    if (this._w3) {
      // shared clear+redraw overlay (air-timer rings + the magnet drag link)
      this.w3Gfx = this.add.graphics().setDepth(DEPTH.fx);
      // pooled bubble shells, one per robot (additive on WebGL, solid-alpha art
      // on Canvas — the texture bakes its own translucency).
      const webglShell = this.game.renderer.type === Phaser.WEBGL;
      if (this.textures.exists("bubbleshell")) {
        this.players.forEach((p) => {
          p.bubbleShell = this.add.image(p.x, p.y, "bubbleshell")
            .setDepth(DEPTH.player + 2).setVisible(false);
          if (webglShell) p.bubbleShell.setBlendMode(Phaser.BlendModes.ADD);
        });
      }
    }

    // W3W4 M4: World-4 physics + overlay wiring — only when W4 content is present.
    if (this.rotBridges.length) {
      const segs = [];
      this.rotBridges.forEach((rb) => rb.segs.forEach((s) => segs.push(s.img)));
      this.physics.add.collider(this.players, segs, rideCb); // ridable spinning platforms
    }
    if (this.tickers.length) this.physics.add.collider(this.tickers.map((t) => t.img), this.solidObjs);
    if (this.gloomies.length) this.physics.add.collider(this.gloomies.map((gl) => gl.img), this.solidObjs);
    if (this._w4) {
      const webglW4 = this.game.renderer.type === Phaser.WEBGL;
      // shared overlays: cone/battery/cooldown/melt painter + the laser painter
      this.w4Gfx = this.add.graphics().setDepth(DEPTH.fx);
      this.laserGfx = this.add.graphics().setDepth(DEPTH.entity + 3);
      // the visible beam-cone light (baked gradient wedge; ADD on WebGL only —
      // the alpha-baked art carries the read on Canvas)
      this.beamCones = this.players.map(() => {
        const c = this.add.image(0, 0, "conelight").setOrigin(0, 0.5)
          .setDepth(DEPTH.fx - 2).setVisible(false);
        if (webglW4) c.setBlendMode(Phaser.BlendModes.ADD);
        return c;
      });
      // screen-fixed cold wash shown while the world is frozen (Canvas-safe:
      // a plain low-alpha fill; WebGL additionally shimmers additively)
      this._freezeWash = this.add.rectangle(this.scale.width / 2, this.scale.height / 2,
        this.scale.width + 8, this.scale.height + 8, 0x9fd8ff, 0.07)
        .setScrollFactor(0).setDepth(DEPTH.fx + 18).setVisible(false);
      if (webglW4) this._freezeWash.setBlendMode(Phaser.BlendModes.ADD);
      // pooled frost panels: one per freezable device, stamped while frozen
      // (icy tint that no-ops on Canvas is banned — this is drawn art instead)
      const freezables = this.crushers.length + this.lifts.length + this.lasers.length +
        this.tickers.length + this.gloomies.length + this.rotBridges.length +
        this.turbines.length; // W3W4 L43: frozen turbines wear frost too
      for (let i = 0; i < Math.min(freezables, 14); i++) {
        const ov = this.add.image(0, 0, "icepanel").setDepth(DEPTH.entity + 4).setVisible(false);
        if (webglW4) ov.setBlendMode(Phaser.BlendModes.ADD);
        this._iceOverlays.push(ov);
      }
    }
    // DARK ZONES: a half-resolution screen-space darkness mask (one RenderTexture
    // covering the camera, scrollFactor 0). Each frame it is cleared, the zone
    // rects are stamped BLACK, and the robots' glow radii + the lit beam cone are
    // ERASED (gradient stamps -> soft holes). Half-res halves the software-Canvas
    // raster cost; there is NO per-frame texture rebake (clear+stamp only) and
    // the erase stamps are prebuilt `make.image` objects (zero per-frame alloc).
    if (this.darkZones.length) {
      const rw = Math.ceil(this.scale.width / 2), rh = Math.ceil(this.scale.height / 2);
      this.darkRT = this.add.renderTexture(0, 0, rw, rh).setOrigin(0, 0)
        .setScrollFactor(0).setScale(2).setDepth(DEPTH.fx + 15).setAlpha(0.93);
      this._darkStampRect = this.make.image({ key: "darkpx", add: false }).setOrigin(0, 0);
      this._darkStampGlow = this.make.image({ key: "glowmask", add: false });
      this._darkStampCone = this.make.image({ key: "conemask", add: false }).setOrigin(0, 0.5);
      // GFX3 G3: one additive personal glow per buddy in dark-zone levels. WebGL
      // only (R1) — Canvas leaves `_darkGlows` null so the follow/ramp in the
      // dark-mask update below is a no-op (zero new objects, byte-identical). The
      // glow follows its buddy and ramps alpha 0 -> ~0.5 with the local darkness.
      if (isWebGL(this)) {
        this._darkGlows = this.players.map((p) =>
          this.add.image(p.x, p.y - 8, "glowBlob")
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(p.idx === 0 ? COLORS.beep : COLORS.boop)
            .setScale(1.4).setAlpha(0).setDepth(DEPTH.player - 1));
      }
    }

    // camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.worldW, this.worldH);
    // camera background colour is the world's bgBottom, set in buildBackground()
    this.camPos = { x: this.players[0].x, y: this.players[0].y, zoom: 1 };
    // 250ms fade-in on every entry (unifies title/hub/game transitions). Visual
    // only — never blocks input, so the beat runner + suites drive immediately.
    // GFX3 G1: tinted to the CURRENT world's fade (duration unchanged, R6).
    cam.fadeIn(250, ...this.worldFade(this.def.world));

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
      g.fillStyle(0xffffff, 0.06).fillRoundedRect(-hw + 3, -13, hw * 2 - 6, 11, 6); // glass gloss
      g.lineStyle(2, color).strokeRoundedRect(-hw, -15, hw * 2, 30, 8);
      const t = this.add.text(0, 0, p.idx === 0 ? "SPACE = ACTION" : "L = ACTION", {
        fontFamily: FONT, fontSize: FS.body, fontStyle: "bold",
        color: p.idx === 0 ? "#4dc9ff" : "#ffa14d",
      }).setOrigin(0.5);
      const cont = this.add.container(p.x, p.y - this._actionHintYoff(p.idx), [g, t]).setDepth(DEPTH.fx);
      // T2 (D4): give the spawn hint a 9s lifetime. If the action key wasn't
      // pressed by then (handleAction destroys it on first press), fade out over
      // 300ms and destroy — then it stops tracking the robot forever. The coach
      // re-show logic (updateCoach, gated on `actionHints[i] == null`) re-teaches
      // it later when a player idles adjacent to something actionable.
      this.time.delayedCall(9000, () => {
        if (this.actionHints[p.idx] !== cont) return; // already dismissed by a press
        this.tweens.add({
          targets: cont, alpha: 0, duration: 300,
          onComplete: () => {
            if (this.actionHints[p.idx] === cont) { cont.destroy(); this.actionHints[p.idx] = null; }
          },
        });
      });
      return cont;
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

    // GFX3 G5: two screen-fixed cinematic bars, parked off-screen until a beat.
    this.buildLetterbox();

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

    // The dev sandboxes point the HUD at their world's first registry
    // placeholder (3-1 = index 6, 4-1 = index 9) so the top plate/theme read
    // as that world; normal play is untouched.
    this.scene.launch("UI", { levelIndex: this.devLevel === "w4" ? 9 : this.devLevel ? 6 : this.levelIndex });

    // __BB.scene must be available synchronously — the beat runner + suites read
    // it right after scene.start, so nothing below may gate it.
    if (typeof window !== "undefined") {
      window.__BB = window.__BB || {};
      window.__BB.scene = this;
      // T4 probe surface: the VISIBLE stuck-panel tier (reading-grace + ack aware, so
      // it can lag the raw window.__bbStuckTier watchdog signal), its visibility, and
      // ack() == one ENTER press. Getters read live scene state, never mutate it.
      const self = this;
      window.__BB.stuck = {
        get tier() { return self._stuckTierShown | 0; },
        get visible() { return !!(self.stuckUI && self.stuckUI.c.visible); },
        ack() { return self.ackStuckPrompt(self.time.now); },
      };
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
      fontFamily: FONT_DISPLAY, fontSize: FS.title, fontStyle: "bold", color: TEXT.bright,
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
    // GFX2 "Lumen Lab" glass: diagonal sheen + top-edge lip + soft outer glow.
    sheen(g, { x: -bw / 2, y: -bh / 2, w: bw, h: bh, a: 0.05 });
    g.lineStyle(1.5, GLASS_HI, 0.1).lineBetween(-bw / 2 + 14, -bh / 2 + 1.5, bw / 2 - 14, -bh / 2 + 1.5);
    g.lineStyle(7, accent, 0.14).strokeRoundedRect(-bw / 2 - 4, -bh / 2 - 4, bw + 8, bh + 8, 17);
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
    this._introDone = false;
    this._introHold = null;
    // GFX4 F2 (2d): tell the HUD to fade its top-center level pill out while this
    // banner occupies the same strip. UIScene also self-seeds this on create (its
    // create runs after ours, so this emit can be missed) — belt AND suspenders.
    this.game.events.emit("bb:introbanner", true);

    // Single completion path: destroy the banner, drop the keydown listener, and
    // fire KOBI's start blip EXACTLY once — guarded by _introDone so the normal
    // slide-out and an any-key fast-out can never double-emit it (T3 / D10).
    const finish = () => {
      if (this._introDone) return;
      this._introDone = true;
      if (this._introSkipHandler) {
        this.input.keyboard.off("keydown", this._introSkipHandler);
        this._introSkipHandler = null;
      }
      if (this.introBanner) { this.introBanner.destroy(); this.introBanner = null; }
      // GFX4 F2 (2d): banner gone (normal slide-out OR any-key skip both land
      // here) — restore the top-center level pill.
      this.game.events.emit("bb:introbanner", false);
      if (def.blips && def.blips.start) this.game.events.emit("bb:blip", def.blips.start);
    };
    this._finishIntroBanner = finish;

    // T3 (D10): ANY keydown while the banner is up fast-outs it. Pad buttons are
    // polled in update() (skipIntroBanner). The banner is purely visual (no input
    // capture) — a movement key that skips it also moves the robot; that's fine,
    // the banner is only ~2s at level start (plan-accepted).
    this._introSkipHandler = () => this.skipIntroBanner();
    this.input.keyboard.on("keydown", this._introSkipHandler);

    this.tweens.add({
      targets: c, y: restY, duration: 240, ease: "back.out",
      onComplete: () => {
        this._introHold = this.time.delayedCall(1600, () => {
          this.tweens.add({ targets: c, y: offY, duration: 240, ease: "back.in", onComplete: finish });
        });
      },
    });
  }

  // GFX4 F2 (2d): vertical offset of a robot's floating "X = ACTION" hint chip
  // above its head. Lowered from the old base 64 so the (staggered) P2 chip drops
  // clear of the lowest gadget card at spawn — the cards form the top of the
  // stack, the chips sit below with a gap. The 34px per-index stagger is kept so
  // the two chips never overlap each other when a robot carries its buddy.
  _actionHintYoff(idx) { return 54 + idx * 34; }

  // T3 (D10): fast-out the intro banner on any key/pad press (120ms slide), then run
  // the same completion path (which fires the start blip exactly once).
  skipIntroBanner() {
    if (!this.introBanner || this._introDone) return;
    if (this._introHold) { this._introHold.remove(); this._introHold = null; }
    this.tweens.killTweensOf(this.introBanner);
    this.tweens.add({
      targets: this.introBanner, y: -70, duration: 120, ease: "back.in",
      onComplete: () => this._finishIntroBanner(),
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
    const farGrid = this.add
      .tileSprite(-2 * W, -2 * H, this.worldW + 4 * W, this.worldH + 4 * H, "bggrid")
      .setOrigin(0)
      .setScrollFactor(0.4)
      .setTileScale(1.7)
      .setAlpha(0.2)
      .setDepth(DEPTH.bg - 9);
    // GFX3 G3: tinted depth — the far grid takes the per-world accent2 under WebGL
    // (mirrors the near grid's tint below). Tint only, alpha unchanged; skipped on
    // Canvas so the reference tier renders the untinted grid exactly as before.
    if (isWebGL(this)) farGrid.setTint(theme.accent2);

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

    // (5) ambient dust motes — GFX3 G3: accent2-tinted under WebGL, neutral white
    // on Canvas (the emitter tint no-ops there anyway, so behaviour is unchanged).
    addMotes(this, isWebGL(this) ? theme.accent2 : 0xffffff);

    // GFX3 G4: per-world in-playfield weather — WebGL only (R1); Canvas keeps just
    // the screen-fixed motes above. Created ONCE, <=24 alive, no update loop (R3).
    if (isWebGL(this)) this.weather = addWeather(this, world);

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
      this.propStrip = addPropStrip(this, world); // cached silhouette strip = MID band — both tiers
      // GFX5 S3: three-band parallax depth — the FAR + NEAR silhouette bands and
      // the drifting atmosphere layer, ALL WebGL-only (R1; Canvas keeps only the
      // single mid strip above, byte-identical to today). Their textures are
      // WebGL-gated bakes (BootScene W1/W2, ensureW3/W4Textures W3/W4), so they
      // exist only on this tier. Depths are explicit (far bg-9.5 < grids < mid
      // bg-5 < near bg-4.5 < fog), so creation order here doesn't matter.
      if (webgl) {
        this.propFar = addFarStrip(this, world);   // FAR: darkest mega-shapes, scrollFactor 0.18
        this.propNear = addNearStrip(this, world); // NEAR: sparse lit structures, scrollFactor 0.6
        this.atmo = addAtmo(this, world);          // drifting haze, scrollFactor 0.25, one slow tween
      }
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
    // GFX6 L1 tier gates: concave-corner AO + under-ledge shading are static baked
    // Images/tileSprites (both-tier by nature, R1). Measured on 2-2 Canvas (fps
    // A/B in L1 decisions): delta <=2fps → both tiers. `?gfx6gate=1` forces the
    // WebGL-only fallback for the A/B measurement itself.
    const gfx6Gate = typeof location !== "undefined" && /(?:\?|&)gfx6gate=1(?:&|$)/.test(location.search);
    this._aoTier = gfx6Gate ? this._webglTier : true;
    this._ledgeTier = gfx6Gate ? this._webglTier : true;
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
      let railStart = -1; // W3: steel rail runs ('='), magnet-cling ceilings
      // W3: flush a contiguous steel-rail run — solid like '#' but drawn as a
      // powered I-beam whose underside a MAGNET GLOVE robot clings to.
      const flushRail = (endX) => {
        if (railStart < 0) return;
        const w = (endX - railStart) * TILE;
        const cx = railStart * TILE + w / 2;
        const ts = this.add.tileSprite(cx, y * TILE + 24, w, TILE, "railtile").setDepth(DEPTH.terrain);
        this.physics.add.existing(ts, true);
        this.solidObjs.push(ts);
        this._w3 = true;
        // grip strip along the cling face (underside) — the "grab me" affordance
        this.add.rectangle(cx, (y + 1) * TILE - 2, w, 4, 0xffb347, 0.5).setDepth(DEPTH.terrain + 1);
        railStart = -1;
      };
      const flush = (endX) => {
        if (runStart < 0) return;
        const wt = endX - runStart; // run width in tiles
        const w = wt * TILE;
        const cx = runStart * TILE + w / 2;
        // GFX5 S2: floor runs (>=2 tiles) use the 192x48 4-variant STRIP so the
        // tileSprite cycles variants across the run; a lone 1-wide cell that is part
        // of a vertical wall uses the 48x192 WALL strip (cycles DOWN the column);
        // an isolated 1-wide platform tile stays on the base texture (variant 0).
        // Each run/cell is de-repeated by a coord-seeded phase (R4, no Math.random):
        // ((tx*7 + ty*13) % 4) * 48 -> adjacent runs never start on the same
        // variant. Static one-time offset only (no per-frame writes, R3).
        const phase = ((runStart * 7 + y * 13) % 4) * 48;
        let texKey = tileKey, vertical = false;
        const isFloor = wt >= 2;
        if (isFloor) {
          texKey = `tilestrip${world}`;
        } else {
          const solidAbove = y > 0 && g[y - 1][runStart] === "#";
          const solidBelow = y + 1 < this.def.rows && g[y + 1][runStart] === "#";
          if (solidAbove || solidBelow) { texKey = `tilewall${world}`; vertical = true; }
          // else: isolated single tile -> stays on base tileKey (variant 0)
        }
        const ts = this.add.tileSprite(cx, y * TILE + 24, w, TILE, texKey).setDepth(DEPTH.terrain);
        if (vertical) ts.tilePositionY = phase; else ts.tilePositionX = phase;
        this.physics.add.existing(ts, true);
        this.solidObjs.push(ts);
        // walkable-edge highlight: thin accent strip along the run's top edge,
        // dark drop-shadow strip just below its bottom edge.
        this.add.rectangle(cx, y * TILE + 1.5, w, 3, accent, 0.5).setDepth(DEPTH.terrain + 1);
        this.add.rectangle(cx, (y + 1) * TILE + 2, w, 4, COLORS.dark, 0.45).setDepth(DEPTH.terrain);
        // GFX5 S2 floor-top cap: a lit top SURFACE (tilecap<world>, h=6) along the
        // TOP edge of a walkable wide run (>=2 tiles AND open air above). Depth
        // terrain+0.5 — above the plates, BELOW light pools (7) / shadow (8) /
        // entities (10) so nothing overrides the light-pool stacking. Visual only:
        // no body, no collision, zero physics impact.
        if (isFloor) {
          let openAbove = y === 0;
          if (!openAbove) for (let x = runStart; x < endX; x++) { if (g[y - 1][x] !== "#") { openAbove = true; break; } }
          if (openAbove) {
            const cap = this.add.tileSprite(cx, y * TILE + 3, w, 6, `tilecap${world}`).setDepth(DEPTH.terrain + 0.5);
            cap.tilePositionX = phase;
          }
        }
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
          // GFX6 L1: under-ledge shading — one baked gradient strip (`underledge`)
          // tiled along the run's underside, hanging into the open air below its
          // lip. Grounds the architecture. Depth below terrain / above backdrop
          // (R5); both tiers (baked texture = zero runtime, R1). NEUTRAL dark.
          if (this._ledgeTier !== false) {
            this.add.tileSprite(cx, (y + 1) * TILE + 12, w, 24, "underledge")
              .setDepth(DEPTH.terrain - 1).setAlpha(0.18);
          }
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
        if (c !== "=") flushRail(x);
        if (c === "#") {
          if (runStart < 0) runStart = x;
          continue;
        }
        flush(x);
        if (c === "=") {
          if (railStart < 0) railStart = x;
          continue;
        }
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
      flushRail(this.def.cols);
    }

    // GFX6 L1: concave-corner ambient occlusion. Walk the SAME grid `g` for inner
    // corners where a floor tile meets a rising wall — an open ("." ) cell with a
    // solid floor directly below AND a solid wall to one side. Stamp the baked
    // quarter `aocorner` pocket (darkest AT the junction) into the crook, flipped
    // per orientation. Deterministic (grid-derived, R4); static Images below
    // terrain / above backdrop (R5); NEUTRAL dark, both tiers (baked texture, R1).
    // `_aoTier`/`_ledgeTier` (set in buildBackground) allow a measured WebGL gate.
    if (this._aoTier !== false) {
      for (let y = 0; y + 1 < this.def.rows; y++) {
        for (let x = 0; x < this.def.cols; x++) {
          if (g[y][x] !== ".") continue;              // must be open air
          if (g[y + 1][x] !== "#") continue;          // floor directly below
          if (x > 0 && g[y][x - 1] === "#") {          // wall on the LEFT
            this.add.image(x * TILE, (y + 1) * TILE, "aocorner")
              .setOrigin(0, 1).setDepth(DEPTH.terrain - 1).setAlpha(0.2);
          }
          if (x + 1 < this.def.cols && g[y][x + 1] === "#") { // wall on the RIGHT
            this.add.image((x + 1) * TILE, (y + 1) * TILE, "aocorner")
              .setOrigin(1, 1).setFlipX(true).setDepth(DEPTH.terrain - 1).setAlpha(0.2);
          }
        }
      }
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
          if ("^~d<>%=".includes(cc)) special = true;
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

  // GFX5 S2: stamp the sparse background-family decals (vent / hazard plate /
  // stain / sign) on exposed VERTICAL WALL FACES only. Coord/level-seeded (R4),
  // density <=1 per ~500px of wall-face run length, spaced apart, never on a
  // walkable floor top (candidate's cell has a solid cell directly above), never
  // adjacent to an interactive/hazard tile, and never inside a G4 keep-out band.
  // Static Images, depth terrain+0.5 (behind gameplay). `ko` is the SAME band
  // list G4 builds in create() (already skipped in the tutorial + 4-3 arena).
  scatterWallDecals(ko) {
    const g = this.grid;
    const rows = this.def.rows, cols = this.def.cols;
    const world = WORLD_THEMES[this.def.world] ? this.def.world : 1;
    const rnd = mulberry32(hashStr((this.def.id || "lvl") + ":s2decals"));
    const inKO = (wx) => ko.some(([a, b]) => wx >= a && wx <= b);
    const cand = [];
    let wallLen = 0;
    for (let y = 1; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (g[y][x] !== "#") continue;
        if (g[y - 1][x] !== "#") continue; // never a walkable floor top
        const openL = x > 0 && g[y][x - 1] !== "#";
        const openR = x < cols - 1 && g[y][x + 1] !== "#";
        if (!openL && !openR) continue; // must be an exposed vertical face
        let special = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          const cc = (ny < 0 || ny >= rows || nx < 0 || nx >= cols) ? "#" : g[ny][nx];
          if ("^~d<>%=".includes(cc)) { special = true; break; }
        }
        if (special) continue;
        wallLen += TILE;
        cand.push({ x, y, face: openR ? 1 : -1 });
      }
    }
    const want = Math.min(cand.length, Math.floor(wallLen / 500)); // <=1 per ~500px
    if (!want) return;
    for (let i = cand.length - 1; i > 0; i--) { // deterministic Fisher-Yates
      const j = Math.floor(rnd() * (i + 1));
      const t = cand[i]; cand[i] = cand[j]; cand[j] = t;
    }
    const keys = [`s2vent${world}`, `s2haz${world}`, `s2stain${world}`, `s2sign${world}`];
    const chosen = [];
    for (const c of cand) {
      if (chosen.length >= want) break;
      const wx = c.x * TILE + 24;
      if (inKO(wx)) continue;
      if (chosen.some((o) => Math.abs(o.x - c.x) + Math.abs(o.y - c.y) < 4)) continue; // spacing
      this.add.image(wx + c.face * 8, c.y * TILE + 24, keys[Math.floor(rnd() * keys.length)])
        .setDepth(DEPTH.terrain + 0.5)
        .setAlpha(0.42 + rnd() * 0.12);
      chosen.push(c);
    }
  }

  // GFX5 S4: place 1-2 big landmark set-pieces on the level's background wall
  // space so each level is recognisable at a glance. Deterministic: a level-id
  // seeded PRNG (mulberry32+hashStr, matching G4/S2 — never Math.random) picks
  // the count, the variant(s) and the x positions, so the SAME level id always
  // draws the SAME landmarks in the SAME spots. Static Images at depth bg-4.2
  // (above the near band bg-4.5, below fog bg-4 / terrain), scrollFactor 0.7,
  // origin (0.5,1) so the form stands on the level's ground line — its foot
  // sinks a hair below it so terrain occludes the base (reads as furniture
  // behind the back wall). REUSES the SAME G4 keep-out band list `ko` (checked
  // against the landmark's FULL body width, since these are wide) so a landmark
  // never looms over a spawn/pedestal/checkpoint/door — and, like scatterWall-
  // Decals, it sits inside the create() `!tutorial && !finale` guard. Textures
  // are baked both tiers; this placement runs both tiers (fps-measured free on
  // 2-2 Canvas, S4-D3).
  placeLandmarks(ko) {
    const world = WORLD_THEMES[this.def.world] ? this.def.world : 1;
    const specs = LANDMARK_SIZES[world];
    if (!specs) return [];
    const worldW = this.worldW, rows = this.def.rows, cols = this.def.cols;
    const g = this.grid;
    // ground line = world-y of the DOMINANT floor row in the lower band
    let bestRow = rows - 1, bestCount = -1;
    for (let y = Math.floor(rows / 2); y < rows; y++) {
      let c = 0;
      for (let x = 0; x < cols; x++) if (g[y][x] === "#") c++;
      if (c >= bestCount) { bestCount = c; bestRow = y; }
    }
    const groundY = bestRow * TILE + 24; // mid of that floor row (base sinks below terrain)
    const rnd = mulberry32(hashStr((this.def.id || "lvl") + ":s4landmarks"));
    const inKO = (a, b) => ko.some(([lo, hi]) => a <= hi && b >= lo);
    const count = rnd() < (worldW > 3400 ? 0.2 : 0.4) ? 1 : 2; // seeded 1-2
    const first = rnd() < 0.5 ? 0 : 1;
    const order = count === 1 ? [first] : (first === 0 ? [0, 1] : [1, 0]); // 2-landmark levels use BOTH variants
    const placed = [];
    const made = [];
    for (const v of order) {
      const [lw] = specs[v];
      const hw = lw / 2;
      const margin = hw + 40;
      if (worldW - 2 * margin < 40) continue;
      let x = null;
      for (let tries = 0; tries < 48; tries++) {
        const cand = margin + rnd() * (worldW - 2 * margin);
        if (inKO(cand - hw, cand + hw)) continue;                       // keep-out (full body)
        if (placed.some((px) => Math.abs(px - cand) < Math.max(lw, 320))) continue; // spacing
        x = cand; break;
      }
      if (x == null) continue;
      placed.push(x);
      made.push(this.add.image(x, groundY, `lm${world}${v ? "b" : "a"}`)
        .setOrigin(0.5, 1)
        .setScrollFactor(0.7)
        .setDepth(DEPTH.bg - 4.2)
        .setAlpha(0.85));
    }
    this._landmarkX = placed.map((p) => Math.round(p)); // exposed for QA review
    return made;
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
    // '=' is the W3 steel rail — solid terrain (never appears in W1/W2 grids)
    return c === "#" || c === "%" || c === "<" || c === ">" || c === "=";
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

  // GFX3 G3: place ONE additive bloom halo behind an emissive device (lit levers,
  // magnets, checkpoints, beam turrets, phase walls). WebGL tier ONLY (R1) — under
  // ?canvas=1 this early-returns, creating zero objects. Reuses the baked glowBlob
  // (soft radial); tinted + additive so machinery reads as lit. Slow sine alpha
  // breathing via a tween (R3, no per-frame work), duration 1.4-2.2s and delay
  // phase-offset per instance so halos never pulse in unison. Depth is passed by
  // the caller = its device's depth MINUS one (sits immediately below the device).
  // Hard-capped at 40 halos/level; interactive devices claim the cap before decor.
  addDeviceHalo(x, y, tint, opts = {}) {
    if (!isWebGL(this)) return null; // WebGL ambience tier only
    if (this.deviceHalos.length >= 40) return null; // spec cap
    const { scale = 0.5, alpha = 0.3, depth = DEPTH.entity - 1, visible = true } = opts;
    const i = this.deviceHalos.length;
    const img = this.add.image(x, y, "glowBlob")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint).setScale(scale).setAlpha(alpha)
      .setDepth(depth).setVisible(visible);
    // staggered breathing: deterministic per-index duration + delay (no unison)
    this.tweens.add({
      targets: img, alpha: { from: alpha * 0.45, to: alpha },
      duration: 1400 + ((i * 173) % 800), delay: (i * 190) % 1600,
      yoyo: true, repeat: -1, ease: "sine.inOut",
    });
    this.deviceHalos.push(img);
    return img;
  }

  // GFX6 L1 (R10): a soft baked drop shadow on the SURFACE beneath a static
  // device, grounding it. Static Image (both tiers — texture swap, zero runtime
  // cost, R1). The contact strip is found from the grid: scan the device tile +
  // the one directly below for the first solid cell (the "within a tile" grounded
  // test) — a FLOATING device (no floor within reach) is skipped, never shadowed.
  // Offset x along theme.lightDir so the shadow falls AWAY from the world's light
  // (R10: one light per world). NEUTRAL near-black; hazards never call this (R9).
  //   tileX/tileY — the grid cell to ground FROM (for a door, pass its base row).
  castShadow(px, tileX, tileY, w, opts = {}) {
    const g = this.grid;
    let row = -1;
    for (let gy = tileY; gy <= tileY + 1 && gy < this.def.rows; gy++) {
      if (g[gy] && g[gy][tileX] === "#") { row = gy; break; }
    }
    if (row < 0) return null; // floating device — nothing to ground to
    const { alpha = 0.22, h = 15 } = opts;
    const dir = (this.theme && this.theme.lightDir) || { x: 0, y: -1 };
    // Offset the contact shadow AWAY from the light (R10): lightDir points toward
    // the source, so the shadow falls opposite it — `-dir.x`. W1's upper-left light
    // (x=-0.6) → shadow nudged RIGHT; W3's upper-right (x=0.5) → nudged LEFT.
    const img = this.add.image(px - dir.x * 6, row * TILE + 2, "castshadow")
      .setDepth(DEPTH.shadow).setAlpha(alpha);
    img.setDisplaySize(Math.max(28, w), h);
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
        this.castShadow(px, e.x, e.y, 44); // GFX6 L1: grounding drop shadow
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
        // P9 / GFX4 F2 (2d): lift the card base so its lower edge clears the
        // (now-lowered) action-hint chips at spawn with a consistent gap — cards
        // form the top of the stack, chips sit below. Neighbouring pedestals'
        // cards stagger up by 96px so they never overlap each other; the topmost
        // still tucks just under the intro banner's rest position.
        const cardY = py - 162 - this.pedestals.length * 96;
        // A9: `orbit` is exposed so the device-personality overlay can speed up the
        // skill-icon orbit toward an approaching unskilled robot (cosmetic; the equip
        // reads ped.x/ped.y, never the icon/orbit transform).
        const ped = { x: px, y: py, skill: e.skill, taken: false, img, icon, orbit, beam, bands: [band1, band2].filter(Boolean), glyphEmit };
        this.buildItemCard(ped, px, cardY, info);
        this.pedestals.push(ped);
        // W3W4 M3: a W3 skill pedestal arms the (otherwise inert) W3 update path
        if (e.skill === "magnet" || e.skill === "bubble") this._w3 = true;
        // W3W4 M4: same pattern for the World-4 pair
        if (e.skill === "freeze" || e.skill === "beam") this._w4 = true;
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
        this.castShadow(px, e.x, e.y, 34); // GFX6 L1: grounding drop shadow
        // drawn handle, pivots at the base hub — a flip is a rotation tween
        const handle = this.add.image(px, py + 8, "lever_handle")
          .setOrigin(0.5, 1).setDepth(DEPTH.entity + 1).setAngle(-6);
        // GFX3 G3: bloom halo, state-coupled to `on` (hidden until flipped lit).
        const leverHalo = this.addDeviceHalo(px, py, this.theme.accent, { visible: false });
        this.levers.push({ id: e.id, x: px, y: py, on: false, img, handle, halo: leverHalo });
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
        // GFX6 L1: grounding drop shadow at the door's BASE row (bottom of the shaft)
        this.castShadow(cx, e.x, e.y + (e.h || 3), (halfW + 5) * 2);
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
          const accent = (WORLD_THEMES[this.def.world] || WORLD_THEMES[1]).accent;
          // GFX4 F3 (3b): restyle the riveted rail tag as a small lab sign — a
          // glassPanel pill base (mono label — R9: in-world text stays mono), a tiny
          // world-accent icon dot, and a WebGL-only accent edge glow. The tag still
          // sits in the gap BESIDE the leaf (right edge = prx, centre = ply), so it
          // is never clipped. T3 (D11) proximity-recede is byte-identical: the whole
          // sign is ONE container registered at (cx, ply); its alpha lerps 1.0<->0.35
          // exactly as the old plate/text alphas did.
          const t = this.add.text(prx - pad, ply, label, {
            fontFamily: FONT, fontSize: FS.tiny, color: TEXT.dim,
          }).setOrigin(1, 0.5).setResolution(2);
          const dotR = 3, dotGap = 6;
          const dotCx = (prx - pad - t.width) - dotGap - dotR;
          const pillLeft = dotCx - dotR - pad;
          const pw = prx - pillLeft;
          const plate = this.add.graphics();
          glassPanel(plate, { x: pillLeft, y: ply - ph / 2, w: pw, h: ph, r: 3, accent, fillA: 0.9, borderA: 0.7, glow: false });
          // tiny world-accent icon dot (soft halo + hot core + catchlight) — the sign "bulb".
          plate.fillStyle(accent, 0.28).fillCircle(dotCx, ply, dotR + 1.5);
          plate.fillStyle(accent, 1).fillCircle(dotCx, ply, dotR);
          plate.fillStyle(0xffffff, 0.6).fillCircle(dotCx - 0.9, ply - 0.9, dotR * 0.4);
          const sign = this.add.container(0, 0).setDepth(DEPTH.entity + 1);
          // WebGL-only accent edge glow behind the pill (R1: base sign is fully
          // readable on Canvas; nothing WebGL-only is even CREATED on Canvas).
          if (isWebGL(this)) {
            const glow = this.add.graphics();
            glow.lineStyle(4, accent, 0.22).strokeRoundedRect(pillLeft - 2, ply - ph / 2 - 2, pw + 4, ph + 4, 5);
            glow.setBlendMode(Phaser.BlendModes.ADD);
            sign.add(glow);
          }
          sign.add([plate, t]);
          // T3 (D11): the door id plate (e.g. GATE) recedes when no robot is near.
          this.addProxLabel(sign, cx, ply);
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
          const exitT = this.add.text(cx, ly, "EXIT", {
            fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: TEXT.good,
          }).setOrigin(0.5).setDepth(DEPTH.entity + 1);
          // T3 (D11): the EXIT sign panel + label recede when no robot is near
          // (the pulsing glow keeps its own tween — not proximity-managed).
          this.addProxLabel(panel, cx, ly);
          this.addProxLabel(exitT, cx, ly);

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
        // GFX3 G3: slow bloom breathing on the core's existing halo (WebGL only —
        // Canvas keeps the static 0.5 alpha, byte-identical). Tween dies with the
        // container on pickup (same lifecycle as the coreImg/orbit spins below).
        if (isWebGL(this)) this.tweens.add({ targets: glow, alpha: { from: 0.34, to: 0.6 }, duration: 1700, yoyo: true, repeat: -1, ease: "sine.inOut" });
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
        this.castShadow(px, e.x, e.y, 30); // GFX6 L1: grounding drop shadow
        // short light-cone fanning below the lamp, shown only while active
        const cone = this.add.graphics().setDepth(DEPTH.entity - 1)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
        cone.fillStyle(COLORS.green, 0.16).fillTriangle(px, py - 30, px - 20, py + 8, px + 20, py + 8);
        this.tweens.add({ targets: cone, alpha: { from: 0.55, to: 1 }, duration: 900, yoyo: true, repeat: -1, ease: "sine.inOut" });
        // P8: green light pool at the base, revealed only while this checkpoint is
        // the active one (toggled with the lamp texture in the activation handler).
        const pool = this.addLightPool(px, py + 6, COLORS.green, { alpha: 0.26, scale: 1.1, visible: false });
        // GFX3 G3: bloom halo behind the lamp, revealed only while this is the
        // ACTIVE checkpoint (toggled alongside cone/pool in the activation handler).
        const cpHalo = this.addDeviceHalo(px, py - 9, COLORS.green, { visible: false });
        this.checkpoints.push({ x: px, y: py, img, active: false, cone, pool, halo: cpHalo });
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
        this.castShadow(px, e.x, e.y, 40); // GFX6 L1: grounding drop shadow (turret/guard base)
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
        // T3 (D11): warden chest badge recedes when no robot is near.
        this.addProxLabel(badge, px, img.y + 14);
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

      // --- W3W4 M3: World-3 terrain devices & enemies -----------------------
      case "crate": {
        // metal crate: a real dynamic physics box — pushable, magnet-draggable,
        // stackable into stairs, standable (players collide + ride it).
        const img = this.add.image(px, py, "crate3").setDepth(DEPTH.entity);
        this.physics.add.existing(img);
        img.body.setSize(42, 42);
        img.body.setDragX(420);
        img.body.setMass(3);
        img.body.setMaxVelocity(320, PHYS.maxFall);
        this.crates.push({ img, heldBy: null });
        this._w3 = true;
        break;
      }
      case "magswitch": {
        // magnetic switch: flipped ONLY by a magnet ACTION (remotely, like the
        // grapple-lever). Registered as a lever with `mag: true` so the existing
        // needs/latch/conduit plumbing drives its doors unchanged; the mag flag
        // excludes it from hand-pulls and grapple targeting.
        const img = this.add.image(px, py + 4, "magswitch").setDepth(DEPTH.entity);
        this.addLightPool(px, py + 6, 0xff9e3d, { alpha: 0.22, scale: 0.8 });
        // GFX3 G3: bloom halo, state-coupled to the coil (hidden until magnetised).
        const magHalo = this.addDeviceHalo(px, py, 0xff9e3d, { visible: false });
        this.levers.push({ id: e.id, x: px, y: py, on: false, img, handle: null, mag: true, halo: magHalo });
        this._w3 = true;
        break;
      }
      case "updraft": {
        // vent updraft: a rising air column — lifts a BUBBLED robot, a gentle
        // boost for everyone else. Drawn like the 2-2 fan family (W3 amber).
        this.add.image(px, py + 13, "vent3").setDepth(DEPTH.entity);
        let topRow = 0;
        for (let ty = e.y - 1; ty >= 0; ty--) {
          if (this.isSolidChar(this.grid[ty][e.x])) { topRow = ty + 1; break; }
        }
        const zone = new Phaser.Geom.Rectangle(e.x * TILE + 4, topRow * TILE, TILE - 8, (e.y - topRow) * TILE + 48);
        const puffs = this.add.particles(px, py + 16, "px", {
          speedY: { min: -300, max: -180 }, speedX: { min: -18, max: 18 },
          scale: { start: 0.5, end: 0 }, lifespan: { min: 420, max: 900 },
          quantity: 1, frequency: 100, tint: 0xffd9a0, alpha: 0.5,
        }).setDepth(DEPTH.fx);
        const col = this.add.rectangle(zone.centerX, zone.centerY, zone.width, zone.height, 0xffd9a0, 0.08)
          .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx - 3);
        this.updrafts.push({ zone, puffs, col });
        this._w3 = true;
        break;
      }
      case "water": {
        // water volume (rect, tile coords): buoyancy + slow-sink + air timer for
        // normal robots, free swim for a BUBBLED one; optional horizontal current.
        const rect = new Phaser.Geom.Rectangle(e.x * TILE, e.y * TILE, e.w * TILE, e.h * TILE);
        this.add.rectangle(rect.centerX, rect.centerY, rect.width, rect.height, 0x123a5c, 0.6).setDepth(DEPTH.terrain - 1);
        const over = this.add.rectangle(rect.centerX, rect.centerY, rect.width, rect.height, 0x39a7ff, 0.15).setDepth(DEPTH.player + 3);
        const surf = this.add.rectangle(rect.centerX, rect.y + 2, rect.width, 4, 0xbfe8ff, 0.55).setDepth(DEPTH.player + 4);
        this.tweens.add({ targets: surf, alpha: { from: 0.3, to: 0.65 }, duration: 1300, yoyo: true, repeat: -1, ease: "sine.inOut" });
        this.waters.push({ rect, current: e.current || 0, over, surf });
        this._w3 = true;
        break;
      }
      case "jelly": {
        // ZAP-JELLY: slow electric floater on a patrol path. Touch = zap; a
        // BUBBLED robot bounces it away — knock it into a jelly socket.
        const img = this.add.image(px, py, "jelly").setDepth(DEPTH.entity);
        this.physics.add.existing(img);
        img.body.setAllowGravity(false);
        img.body.setSize(34, 28);
        img.body.setBounce(0.7, 0.7);
        img.body.setDrag(90, 90);
        const glow = this.add.image(px, py, "jelly_glow").setDepth(DEPTH.entity - 1).setAlpha(0.5);
        if (this.game.renderer.type === Phaser.WEBGL) glow.setBlendMode(Phaser.BlendModes.ADD);
        this.jellies.push({
          img, glow, state: "patrol", dir: 1, hitCd: 0,
          minX: e.min * TILE, maxX: (e.max + 1) * TILE, baseY: py,
          t: ((e.x * 31 + e.y * 17) % 100) * 10, // deterministic bob phase
        });
        this._w3 = true;
        break;
      }
      case "socket": {
        // jelly socket: a knocked jelly locks in here and POWERS a device via
        // the standard lever-latch plumbing (a hidden `mag` lever with its id).
        const img = this.add.image(px, py, "socket").setDepth(DEPTH.entity);
        this.addLightPool(px, py + 6, 0x7ee0ff, { alpha: 0.2, scale: 0.8 });
        this.sockets.push({ id: e.id, x: px, y: py, img, filled: false });
        this.levers.push({ id: e.id, x: px, y: py, on: false, img: null, handle: null, mag: true });
        this._w3 = true;
        break;
      }
      case "chomper": {
        // JUNK-CHOMPER: grounded magnetic mouth that lunges at nearby robots.
        // Magnet ACTION yanks its metal teeth out — defanged, it's a harmless dozer.
        const img = this.add.image(px, py + 4, "chomper").setDepth(DEPTH.entity);
        this.physics.add.existing(img);
        img.body.setSize(50, 32).setOffset(3, 6);
        const dir = e.facing || 1;
        img.setFlipX(dir === -1);
        this.chompers.push({ img, state: "idle", timer: 0, dir, homeX: px, defanged: false });
        this._w3 = true;
        break;
      }

      // --- W3W4 L33: the SCRAP STORM family (3-3's polarity-storm set piece) --
      case "scraplane": {
        // A wind lane of flying scrap: `count` pooled chunk sprites on a
        // KINEMATIC path (constant vx, wrapping the zone) — predictable rhythm,
        // no physics bodies, bounded pool. Contact rules live in updateWorld3:
        // bare robot = the standard zap death; bubbled = sharp pop + shove
        // (drops a carried fuse-core); the caught-scrap shield absorbs chunks.
        // `offBy` names the lever (a fuse socket id) that DE-ENERGIZES the lane.
        // Determinism: chunk spacing is even and phases/variants come from a
        // seeded PRNG (P4 pattern) — same level, same storm, every run.
        // one shared catchable SHIELD for the level, created with the first lane.
        // Its body is configured EXACTLY like the metal crate (the proven W3 box)
        // and starts disabled: held = visual follow, planted = static step.
        if (!this.stormShield) {
          const simg = this.add.image(-200, -200, "scrapshield").setDepth(DEPTH.entity + 1).setVisible(false);
          this.physics.add.existing(simg);
          simg.body.setSize(42, 42);
          simg.body.setDragX(420);
          simg.body.setMass(3);
          simg.body.setMaxVelocity(320, PHYS.maxFall);
          simg.body.setAllowGravity(false);
          simg.body.enable = false;
          this.stormShield = { img: simg, state: "idle", heldBy: null, holdMs: 0, cd: 0 };
        }
        const x1 = e.x * TILE, x2 = (e.x + e.w) * TILE;
        const laneY = e.y * TILE + 24;
        const seed = ((e.x * 73856093) ^ (e.y * 19349663) ^ (e.w * 83492791)) >>> 0;
        let s = seed;
        const rnd = () => { // mulberry32 (the P4 decal-seeding PRNG)
          s |= 0; s = (s + 0x6d2b79f5) | 0;
          let t = Math.imul(s ^ (s >>> 15), 1 | s);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        // lane band: a faint hazard wash + an emitter bracket at the upwind edge
        // with chevrons pointing downwind (the storm telegraph — readable rhythm)
        const band = this.add.rectangle((x1 + x2) / 2, laneY, x2 - x1, 40, 0xff4dd2, 0.055)
          .setDepth(DEPTH.terrain - 1);
        this.tweens.add({ targets: band, alpha: { from: 0.6, to: 1 }, duration: 900, yoyo: true, repeat: -1, ease: "sine.inOut" });
        const emX = e.dir > 0 ? x1 - 6 : x2 + 6;
        const em = this.add.image(emX, laneY, "stormvent").setDepth(DEPTH.entity);
        em.setFlipX(e.dir < 0);
        const chev = [];
        for (let i = 0; i < 3; i++) {
          const cx = emX + e.dir * (26 + i * 16);
          chev.push(this.add.image(cx, laneY, "stormchev").setDepth(DEPTH.entity - 1)
            .setFlipX(e.dir < 0).setAlpha(0.7 - i * 0.18));
        }
        const chunks = [];
        for (let i = 0; i < e.count; i++) {
          const img = this.add.image(0, 0, `scrap${1 + Math.floor(rnd() * 3)}`).setDepth(DEPTH.entity);
          chunks.push({
            img,
            x: x1 + ((i + 0.5) / e.count) * (x2 - x1), // even spacing = readable rhythm
            wait: 0,                                   // absorbed-chunk grace timer
            phase: rnd() * Math.PI * 2,                // cosmetic bob phase (seeded)
            spin: (rnd() > 0.5 ? 1 : -1) * (80 + rnd() * 100), // deg/s (seeded)
          });
        }
        this.stormLanes.push({
          x1, x2, y: laneY, row: e.y, dir: e.dir, speed: e.speed, chunks,
          offBy: e.offBy || null, active: true, band, em, chev,
        });
        this._w3 = true;
        break;
      }
      case "fusecore": {
        // FUSE-CORE: a carriable objective item (key-family). Touch = pick up
        // (one per robot); a scrap hit or death DROPS it where it fell (it
        // settles onto the floor below — always retrievable); a filled fuse
        // socket consumes it and latches that socket's lever id.
        const cont = this.add.container(px, py).setDepth(DEPTH.pickup);
        const glow = this.add.image(0, 0, "glowBlob").setScale(0.4).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.45).setTint(0xffd24d);
        const img = this.add.image(0, 0, "fusecore_item");
        cont.add([glow, img]);
        this.fuseCores.push({ img: cont, state: "rest", carrier: null, baseY: py, t: 0 });
        this._w3 = true;
        break;
      }
      case "fusesocket": {
        // FUSE SOCKET: the delivery cradle. A carried core within reach snaps
        // in, fills it and latches a hidden `mag` lever with its id (the same
        // lever-latch plumbing the jelly socket uses) — doors/lanes wire off it.
        const img = this.add.image(px, py + 2, "fusesock").setDepth(DEPTH.entity);
        this.addLightPool(px, py + 6, 0xffd24d, { alpha: 0.2, scale: 0.8 });
        this.fuseSockets.push({ id: e.id, x: px, y: py, img, filled: false });
        this.levers.push({ id: e.id, x: px, y: py, on: false, img: null, handle: null, mag: true });
        this._w3 = true;
        break;
      }

      // --- W3W4 M4: World-4 terrain devices & enemies -----------------------
      case "dark": {
        // DARK ZONE (rect, tile coords): inside, ambient render is near-black —
        // the screen-space darkness mask (built in create once any zone exists)
        // covers it; robots' glow radii + the beam cone are erased as reveals.
        // Kid-fair: the glow radius ALWAYS shows immediate surroundings.
        const rect = new Phaser.Geom.Rectangle(e.x * TILE, e.y * TILE, e.w * TILE, e.h * TILE);
        // faint violet edge seam so the zone boundary itself reads on both tiers
        const edge = this.add.graphics().setDepth(DEPTH.terrain + 1);
        edge.lineStyle(2, 0x8f7bff, 0.35).strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
        this.darkZones.push({ rect });
        this._w4 = true;
        break;
      }
      case "ghost": {
        // INVISIBLE PLATFORM: a real static platform body (physics identical to
        // a drawn one — solid ALWAYS) whose art is visible only while the beam
        // cone lights it (+ ~1.5s afterglow). At rest a whisper-faint shimmer
        // hint keeps it kid-fair-discoverable without giving the reveal away.
        const w = (e.w || 2) * TILE;
        const cx = e.x * TILE + w / 2;
        const img = this.add.tileSprite(cx, e.y * TILE + 24, w, TILE, "ghosttile")
          .setDepth(DEPTH.terrain).setAlpha(0.06);
        this.physics.add.existing(img, true);
        this.solidObjs.push(img); // reuses the platform collider family
        this.ghosts.push({ img, lit: 0, baseA: 0.06 });
        this._w4 = true;
        break;
      }
      case "rotbridge": {
        // ROTATING BRIDGE: a spinning platform assembly (lift-family kinematic
        // bodies, moved ONLY by velocity so collisions/riding stay physics-true).
        // Crossable when TIME-FREEZE holds it flat — the design's key beat.
        const lenPx = (e.len || 4) * TILE;      // full bar length
        const half = lenPx / 2;
        const hub = this.add.image(px, py, "rothub").setDepth(DEPTH.entity + 1);
        const segN = Math.max(4, Math.round(lenPx / 26));
        const segs = [];
        for (let i = 0; i < segN; i++) {
          const off = -half + (i + 0.5) * (lenPx / segN);
          const img = this.add.image(px + off, py, "rotseg").setDepth(DEPTH.entity);
          this.physics.add.existing(img);
          img.body.setAllowGravity(false);
          img.body.setImmovable(true);
          img.body.setSize(24, 12);
          segs.push({ img, off });
        }
        this.rotBridges.push({
          x: px, y: py, hub, segs,
          angle: (e.angle || 0) * Math.PI / 180,
          speed: ((e.speed || 40) * Math.PI) / 180, // rad/s
        });
        this._w4 = true;
        break;
      }
      case "laser": {
        // LASER SWEEPER: a rotating/oscillating beam — hazard-class kill on
        // contact, telegraphed by being constantly visible + slow. Pooled draw
        // (ONE shared Graphics repaints every beam), Canvas-safe colors.
        // Freeze holds the angle (the state below is simply not stepped).
        const img = this.add.image(px, py, "laseremit").setDepth(DEPTH.entity + 1);
        this.addLightPool(px, py, 0xff5566, { alpha: 0.2, scale: 0.8 });
        // GFX3 G3: constant bloom halo behind the always-emissive beam turret.
        this.addDeviceHalo(px, py, 0xff5566, { alpha: 0.26, depth: DEPTH.entity });
        this.lasers.push({
          img, x: px, y: py,
          len: (e.len || 5) * TILE,
          mode: e.mode || "spin",              // "spin" = full rotation, "sweep" = min..max ping-pong
          speed: ((e.speed || 45) * Math.PI) / 180, // rad/s
          min: ((e.min ?? 200) * Math.PI) / 180,
          max: ((e.max ?? 340) * Math.PI) / 180,
          angle: ((e.angle ?? e.min ?? 0) * Math.PI) / 180,
          dir: 1,
          endX: px, endY: py, // resolved beam endpoint (walls clip it)
        });
        this._w4 = true;
        break;
      }
      case "icedoor": {
        // ICE DOOR: a door-family barrier with a MELT-PROGRESS fill driven by
        // beam exposure. Melt state only rises; once fully melted it opens
        // permanently (body off, ice fades) — it can never re-freeze.
        const h = (e.h || 3) * TILE;
        const cy = e.y * TILE + h / 2;
        const img = this.add.tileSprite(px, cy, TILE - 6, h, "icetile").setDepth(DEPTH.entity);
        this.physics.add.existing(img, true);
        this.doorGroup.add(img); // reuses the door collider family (players/bugs/jellies/crates)
        this.addLightPool(px, cy, 0x9fd8ff, { alpha: 0.18, scale: 1 });
        this.iceDoors.push({ id: e.id, img, x: px, topY: e.y * TILE, h, melt: 0, open: false, dripCd: 0 });
        this._w4 = true;
        break;
      }
      case "gloomy": {
        // GLOOMY: a shadow blob that drifts toward robots in darkness (slow
        // menace, standard hurt on touch) but FLEES the light cone and each
        // robot's own glow radius. It parks on its home spot — put a plate
        // under that spot and the gloomy JAMS it until the beam herds it off.
        const img = this.add.image(px, py, "gloomy").setDepth(DEPTH.entity);
        this.physics.add.existing(img);
        img.body.setAllowGravity(false);
        img.body.setSize(30, 24);
        img.body.setCollideWorldBounds(true);
        this.gloomies.push({ img, homeX: px, homeY: py, scared: 0, fleeX: 0, tex: "gloomy" });
        this._w4 = true;
        break;
      }
      case "ticker": {
        // TICKER: a clockwork patroller — wind-up telegraph, FAST dash between
        // its patrol ends. The KEY interaction: completely held by TIME-FREEZE
        // (timers paused, velocity 0, harmless while frozen — safe to pass).
        const img = this.add.image(px, py + 2, "ticker").setDepth(DEPTH.entity);
        this.physics.add.existing(img);
        img.body.setSize(30, 36).setOffset(2, 4);
        const dir = e.facing || 1;
        img.setFlipX(dir === -1);
        this.tickers.push({
          img, state: "wind", timer: 700 + ((e.x * 37) % 4) * 120, dir,
          minX: e.min * TILE + 16, maxX: (e.max + 1) * TILE - 16, tex: "ticker",
        });
        this._w4 = true;
        break;
      }

      // --- W3W4 L43: KOBI'S HEART (the 4-3 finale boss family) ---------------
      case "turbine": {
        // DEFENSE TURBINE: a floor-mounted fan column guarding a cooling core.
        // Lethal on contact while spinning; utterly held + SAFE under
        // TIME-FREEZE (the Ticker contract); powers down FOREVER the moment
        // its station's core is unplugged. Stepped in updateHeart (4-3 only).
        const base = this.add.image(px, py + 8, "turbine").setDepth(DEPTH.entity);
        const rotor = this.add.image(px, py - 30, "turbine_rotor").setDepth(DEPTH.entity + 1);
        this.addLightPool(px, py + 6, 0xff5566, { alpha: 0.16, scale: 0.7 });
        this.turbines.push({
          x: px, y: py, base, rotor, station: e.station | 0, dead: false,
          spin: (e.x % 2 ? -1 : 1) * 9, // rad/s, alternating handedness
        });
        this._w4 = true;
        break;
      }
      case "kobiheart": {
        // THE KOBI-EYE BOSS RIG. Non-violent by construction: the eye is never
        // attacked — the beam BLINDS it (a cooling core exposes), a robot
        // TOUCHES the exposed core to unplug it, ×3 -> staged power-down +
        // the Bolt rescue. Structured like the crane fight: a state machine
        // stepped from update() with telegraphed attacks and safe windows.
        const housing = this.add.image(px, py, "kobi_housing").setDepth(DEPTH.entity + 1);
        const iris = this.add.image(px, py, "kobi_iris").setDepth(DEPTH.entity + 2);
        // the eyelid: a housing-toned cap that scales down over the sclera
        // (squint while blinded, shut while reeling/down) — drawn art, no tint
        const lid = this.add.image(px, py - 46, "kobi_lid").setOrigin(0.5, 0)
          .setDepth(DEPTH.entity + 3).setScale(1, 0);
        this.addLightPool(px, py + 10, 0xff4dd2, { alpha: 0.2, scale: 1.4 });
        // Bolt's cage on the floor east of the eye (opens at the rescue)
        const cageX = (e.cage ?? e.x + 3) * TILE + 24;
        const cageY = 13 * TILE + 20;
        const cage = this.add.image(cageX, cageY, "bolt_cage").setDepth(DEPTH.entity);
        this.addLightPool(cageX, cageY + 8, 0xffb347, { alpha: 0.18, scale: 0.8 });
        // the three cooling-core stations: armored vent -> exposed core pod
        const stations = (e.stations || []).map((s, i) => {
          const cx = s.x * TILE + 24, cy = s.y * TILE + 20;
          const core = this.add.image(cx, cy - 2, "heart_core").setDepth(DEPTH.entity);
          const vent = this.add.image(cx, cy, "heart_vent").setDepth(DEPTH.entity + 2);
          return { idx: i, x: cx, y: cy, vent, core, ring: null, exposed: false, taken: false };
        });
        this.heartGfx = this.add.graphics().setDepth(DEPTH.entity - 1);
        this.heart = {
          x: px, y: py, housing, iris, lid, stations, cage,
          state: "fight",            // fight -> reeling (post-expose) -> down
          dazzle: 0, reelT: 0, coresTaken: 0,
          // the glare attack: aim (column follows) -> lock -> strike -> cool
          glare: { state: "cool", t: 2200, x: px, lockX: px },
          minX: (e.minX ?? 0) * TILE + 24, maxX: (e.maxX ?? this.def.cols) * TILE + 24,
          bolt: null, boltFree: false, downT: 0, downStep: 0, _squintCd: 0,
        };
        this._w4 = true;
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
      bdr.lineStyle(1, GLASS_HI, 0.12).lineBetween(cx - 11, -15.5, cx + 11, -15.5); // glass top-edge lip
      bdr.lineStyle(2.5, col, 1).strokeRoundedRect(cx - 17, -17, 34, 34, 8);
      const t = this.add.text(cx, -1, c.k, {
        fontFamily: FONT, fontSize: FS.large, fontStyle: "bold", color: hex,
      }).setOrigin(0.5);
      cont.add([cap, bdr, t]);
      cx += CAP + GAP;
    }
    // gentle vertical bob
    this.tweens.add({ targets: cont, y: y - 6, duration: 1100, yoyo: true, repeat: -1, ease: "sine.inOut" });
    // T3 (D6/D11): teaching glyph clusters are never destroyed, but they stop
    // shouting across the room — proximity-alpha like the door/EXIT/warden labels.
    this.addProxLabel(cont, x, y);
    return cont;
  }

  // Item card: a proper panel — dark rounded body, skill-coloured title bar +
  // border. Stored in pieces so it can shrink to a small tag (minimizeItemCard)
  // and expand back (expandItemCard) — reused by both the T2 auto-minimize and
  // the equip shrink.
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
    // Geometry + colour stashed so min<->full redraws are allocation-free.
    ped.cardFull = { W, H, TB, col, titleY: -H / 2 + 12 };
    ped.cardMin = { W: 132, H: 30, col };
    ped.cardState = "full";
    ped._cardArmed = false;   // T2: armed after 6s → the proximity min<->full picker runs
    ped._cardSwitchAt = 0;    // T2: last min<->full switch (500ms cooldown, no thrash)
    ped._cardNear = false;    // T2: robot-within-120px latch, for far→near approach edges
    this._drawCardFull(ped);
    // P9: 150ms slide-in — the card drops into place from just above with a soft
    // overshoot as it spawns (one-shot tween, no per-frame cost).
    ped.card.setAlpha(0).setY(cardY - 16);
    this.tweens.add({ targets: ped.card, y: cardY, alpha: 1, duration: 150, ease: "back.out" });
    // T2 (D5): auto-minimize an unclaimed card 6s after its slide-in — unconditionally
    // (a robot already parked within 120px at spawn is NOT a fresh approach, so it
    // shrinks anyway). The far→near latch is seeded from the current state so the
    // sitting robot won't immediately re-expand it; only a genuine walk-up will.
    this.time.delayedCall(6150, () => {
      if (!ped.card || ped.taken) return;
      ped._cardArmed = true;
      ped._cardNear = this.players.some((p) => !p.dead && Math.hypot(p.x - ped.x, p.y - ped.y) < 120);
      this.minimizeItemCard(ped, false);
    });
  }

  // Draw the FULL card body onto ped.cardG (skill-coloured title bar + glass body).
  _drawCardFull(ped) {
    const { W, H, TB, col } = ped.cardFull;
    const g = ped.cardG;
    g.clear();
    // GFX2 "Lumen Lab" glass card: frosted body + sheen glaze + soft glow ring,
    // skill-coloured title bar with a top gloss, crisp accent border.
    g.fillStyle(COLORS.hudBg, 0.92).fillRoundedRect(-W / 2, -H / 2, W, H, 10);
    sheen(g, { x: -W / 2, y: -H / 2 + TB, w: W, h: H - TB, a: 0.05 });
    g.lineStyle(6, col, 0.14).strokeRoundedRect(-W / 2 - 3, -H / 2 - 3, W + 6, H + 6, 12);
    g.fillStyle(col, 0.9).fillRoundedRect(-W / 2, -H / 2, W, TB, { tl: 10, tr: 10, bl: 0, br: 0 });
    g.fillStyle(0xffffff, 0.12).fillRoundedRect(-W / 2 + 2, -H / 2 + 2, W - 4, TB * 0.45, { tl: 8, tr: 8, bl: 0, br: 0 });
    g.lineStyle(2, col).strokeRoundedRect(-W / 2, -H / 2, W, H, 10);
  }

  // Draw the compact skill TAG onto ped.cardG (title-only glass pill).
  _drawCardMin(ped) {
    const { W, H, col } = ped.cardMin;
    const g = ped.cardG;
    g.clear();
    g.fillStyle(COLORS.hudBg, 0.92).fillRoundedRect(-W / 2, -H / 2, W, H, 8);
    sheen(g, { x: -W / 2, y: -H / 2, w: W, h: H, a: 0.05 });
    g.lineStyle(1, GLASS_HI, 0.1).lineBetween(-W / 2 + 8, -H / 2 + 1.5, W / 2 - 8, -H / 2 + 1.5);
    g.lineStyle(6, col, 0.14).strokeRoundedRect(-W / 2 - 3, -H / 2 - 3, W + 6, H + 6, 10);
    g.lineStyle(2, col).strokeRoundedRect(-W / 2, -H / 2, W, H, 8);
  }

  // Shrink a card to its compact skill tag (title only). `permanent` = the equip
  // shrink: the tag is destroyed 6s later. Otherwise the tag can expand back.
  minimizeItemCard(ped, permanent) {
    if (!ped.card || ped.cardState === "min") return;
    const col = ped.cardMin.col;
    this._drawCardMin(ped);
    if (ped.cardBody) ped.cardBody.setVisible(false);
    ped.cardTitle.setColor("#" + col.toString(16).padStart(6, "0")).setFontSize(12).setPosition(0, 0);
    ped.cardState = "min";
    this.tweens.killTweensOf(ped.card);
    this.tweens.add({ targets: ped.card, scaleX: { from: 1.12, to: 1 }, scaleY: { from: 1.12, to: 1 }, alpha: 1, duration: 300, ease: "back.out" });
    if (permanent) {
      // D5 fix: after equip, DESTROY the tag 6s later instead of dimming to 0.55
      // and lingering forever.
      this.time.delayedCall(6000, () => {
        if (!ped.card) return;
        this.tweens.add({
          targets: ped.card, alpha: 0, duration: 300,
          onComplete: () => { if (ped.card) { ped.card.destroy(); ped.card = null; } },
        });
      });
    }
  }

  // Expand a minimized (unclaimed) card back to the full panel.
  expandItemCard(ped) {
    if (!ped.card || ped.taken || ped.cardState === "full") return;
    this._drawCardFull(ped);
    ped.cardTitle.setColor("#0a0f1e").setFontSize(parseInt(FS.mini, 10)).setPosition(0, ped.cardFull.titleY);
    if (ped.cardBody) ped.cardBody.setVisible(true);
    ped.cardState = "full";
    this.tweens.killTweensOf(ped.card);
    this.tweens.add({ targets: ped.card, scaleX: { from: 0.9, to: 1 }, scaleY: { from: 0.9, to: 1 }, alpha: 1, duration: 300, ease: "back.out" });
  }

  // Once equipped the card shrinks to a compact skill tag, then self-destructs 6s
  // later (T2 / D5). Reuses the shared minimize shrink.
  equipItemCard(ped) {
    ped.cardMin.col = SKILL_INFO[ped.skill].color;
    ped._cardArmed = false; // the unclaimed proximity picker never touches it again
    ped.cardState = "full"; // force minimizeItemCard to run even if already minimized
    this.minimizeItemCard(ped, true);
  }

  // T2 (D5): unclaimed item cards auto-minimize 6s after spawn (see buildItemCard),
  // then re-expand once per APPROACH — a robot crossing from outside 120px to inside
  // — and retract when it leaves. min<->full state machine, 500ms cooldown so it
  // never thrashes. Called each frame from update(); reads only positions.
  updateItemCards(time) {
    for (const ped of this.pedestals) {
      if (ped.taken || !ped.card || !ped._cardArmed) continue;
      if (time < ped._cardSwitchAt + 500) continue; // anti-thrash cooldown (edges survive it)
      const near = this.players.some((p) => !p.dead &&
        Math.hypot(p.x - ped.x, p.y - ped.y) < 120);
      const approached = near && !ped._cardNear; // fresh far→near edge = one approach
      ped._cardNear = near;
      if (approached && ped.cardState === "min") { this.expandItemCard(ped); ped._cardSwitchAt = time; }
      else if (!near && ped.cardState === "full") { this.minimizeItemCard(ped, false); ped._cardSwitchAt = time; }
    }
  }

  // T3 (D11): register a permanent world label for proximity-alpha treatment.
  addProxLabel(obj, x, y) { if (obj) this.proxLabels.push({ obj, x, y }); }

  // T3 (D11): permanent world text recedes when no robot is near. alpha = 1.0 when
  // the nearest robot is within 6 tiles (288px), easing to 0.35 beyond 10 tiles
  // (480px). Called every ~150ms; lerps the live alpha toward target for smoothness.
  updateProxLabels() {
    if (!this.proxLabels.length) return;
    for (const e of this.proxLabels) {
      const o = e.obj;
      if (!o || !o.scene || o.visible === false) continue; // destroyed/hidden (e.g. defeated warden badge)
      let d = Infinity;
      for (const p of this.players) {
        if (p.dead) continue;
        const dd = Math.hypot(p.x - e.x, p.y - e.y);
        if (dd < d) d = dd;
      }
      const t = Phaser.Math.Clamp((480 - d) / (480 - 288), 0, 1);
      const target = 0.35 + 0.65 * t;
      o.setAlpha(o.alpha + (target - o.alpha) * 0.3);
    }
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
    // adjacent lever (anyone can pull; W3 `mag` switches/sockets are magnet-only)
    const lev = this.levers.find((l) => !l.on && !l.mag && Math.abs(l.x - p.x) < 54 && Math.abs(l.y - p.y) < 64);
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
    } else if (p.skill === "magnet") {
      // W3W4 M3 — MAGNET GLOVE.
      const padDownHeld = p.pad && p.pad.down.isDown;
      if (p.keys.down.isDown || padDownHeld) {
        // DOWN+ACTION = the standard buddy-reel chord. Same guards as the
        // grapple rope (FL-001/FL-005), REUSING startReeled — the shared
        // rope/reel path (drawRope + the reel resolver in update) does the rest.
        const q = p.partner;
        const d = q ? Math.hypot(q.x - p.x, q.y - p.y) : 0;
        if (
          q && !q.dead && !q.carriedBy && !q.zip && !q.reeled &&
          d > 72 && d <= PHYS.grappleRange && (p.grounded || p.magCling) &&
          (this.hasLOS(p.x, p.y, q.x, q.y) || this.hasLOS(p.x, p.y - 44, q.x, q.y - 24))
        ) {
          q.startReeled(p);
          this.sparks.explode(this.fxBudget(6), p.x, p.y - 8); // winch sparks (P11)
        } else {
          sfx.denied();
        }
        return;
      }
      if (this.magnetAction(p)) return;
      // nothing magnetic in reach — fall through to the buddy pickup below
    } else if (p.skill === "bubble") {
      // W3W4 M3 — BUBBLE SHIELD.
      const padDownHeld = p.pad && p.pad.down.isDown;
      if (p.keys.down.isDown || padDownHeld) {
        // DOWN+ACTION = bubble the BUDDY (partner-protect, the co-op use)
        const q = p.partner;
        if (
          q && !q.dead && p.bubbleCd <= 0 && q.bubbleT <= 0 &&
          Math.hypot(q.x - p.x, q.y - p.y) <= PHYS.grappleRange &&
          this.hasLOS(p.x, p.y, q.x, q.y)
        ) {
          this.grantBubble(q, p);
        } else {
          sfx.denied();
        }
        return;
      }
      if (p.bubbleT > 0) { this.popBubble(p, false); return; } // re-press = release early
      if (p.bubbleCd <= 0) { this.grantBubble(p, p); return; }
      sfx.denied();
      return;
    } else if (p.skill === "freeze") {
      // W3W4 M4 — TIME-FREEZE: ACTION = freeze the WORLD for 5s. One cast at a
      // time; the badge cooldown ring re-arms it. Players stay fully free —
      // only device/enemy state machines stop stepping (see the freeze gates).
      if (!this.frozen && p.freezeCd <= 0) { this.castFreeze(p); return; }
      sfx.denied();
      return;
    } else if (p.skill === "beam") {
      // W3W4 M4 — LIGHT-BEAM.
      const padDownHeld = p.pad && p.pad.down.isDown;
      if (p.keys.down.isDown || padDownHeld) {
        // DOWN+ACTION = the standard buddy-reel chord (same guards as the
        // grapple/magnet ropes — FL-001/FL-005 — REUSING startReeled).
        const q = p.partner;
        const d = q ? Math.hypot(q.x - p.x, q.y - p.y) : 0;
        if (
          q && !q.dead && !q.carriedBy && !q.zip && !q.reeled &&
          d > 72 && d <= PHYS.grappleRange && p.grounded &&
          (this.hasLOS(p.x, p.y, q.x, q.y) || this.hasLOS(p.x, p.y - 44, q.x, q.y - 24))
        ) {
          q.startReeled(p);
          this.sparks.explode(this.fxBudget(6), p.x, p.y - 8);
        } else {
          sfx.denied();
        }
        return;
      }
      // plain ACTION: ignite the light cone — the HOLD itself is driven per
      // frame in updateWorld4 (key isDown); this edge is the instant feedback.
      if (p.beamMs > PHYS.beamMinMs) { this.setBeam(p, true); return; }
      sfx.denied();
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
    if (lev.halo) lev.halo.setVisible(true); // GFX3 G3: light the bloom halo (lit state)
    if (lev.handle) {
      this.tweens.add({ targets: lev.handle, angle: 60, duration: 240, ease: "back.out" });
      this.sparks.explode(this.fxBudget(10), lev.handle.x, lev.y - 22); // spark burst at the knob
    }
    // W3: a magnetic switch has no handle — its coil lamp flips lit instead
    if (lev.mag && lev.img) {
      lev.img.setTexture("magswitch_on");
      this.sparks.explode(this.fxBudget(8), lev.x, lev.y);
    }
    this.fireConduits("lever", lev.id); // P5: light the wire to its device (cosmetic)
    sfx.lever();
    this.impactPunch("light"); // GFX3 G1: lever flip
  }

  findGrappleTarget(p) {
    const cands = [];
    for (const a of this.anchors) {
      if (p.zip && p.zip.arrived && Math.abs(p.zip.x - a.x) < 4 && Math.abs(p.zip.y - a.y - 44 + 44) < 50 && p.zip.y === a.y) continue;
      cands.push({ kind: "anchor", x: a.x, y: a.y, obj: a, bias: 60 });
    }
    for (const l of this.levers) {
      if (!l.on && !l.mag && Math.abs(l.x - p.x) >= 54) cands.push({ kind: "lever", x: l.x, y: l.y, obj: l, bias: 40 });
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

  // GFX3 G1 — a world's transition-fade colour as [r, g, b] for cam.fade*().
  // Falls back to FADE_NAVY for an unknown world.
  worldFade(world) {
    const t = WORLD_THEMES[world];
    if (!t || t.fade == null) return FADE_NAVY;
    return [(t.fade >> 16) & 0xff, (t.fade >> 8) & 0xff, t.fade & 0xff];
  }

  // GFX3 G5 — cinematic letterbox. Two screen-fixed black bars (each ~9% of the
  // viewport) parked just off-screen; letterbox(true/false) slides them in/out.
  // Built once per create() so a death/restart mid-cinematic starts bar-free.
  // Depth DEPTH.cine (above fx particles/foreground, below the fx+N pseudo-HUD
  // band; the UIScene blip bar renders in a scene above Game, so it is never
  // covered). Visual-only: no physics, no input, no beat-kit probe touched.
  buildLetterbox() {
    const W = this.scale.width, H = this.scale.height;
    const barH = Math.round(H * 0.09);
    this._lbH = barH;
    const mk = (y) => this.add.rectangle(W / 2, y, W, barH, 0x000000, 1)
      .setScrollFactor(0).setDepth(DEPTH.cine).setVisible(false);
    this._lbTop = mk(-barH / 2);        // hidden just above the top edge
    this._lbBot = mk(H + barH / 2);     // hidden just below the bottom edge
    this.letterboxOn = false;
  }

  // Slide the bars in (300ms) or out (250ms) and set the slow camera-push target.
  // Idempotent (guards the current state) so overlapping beat wiring can't double-
  // slide. The push is `1 -> ~1.06` eased in updateCamera, scaled by uxShakeScale
  // (0 => target 1, i.e. NO push, but the bars still show — R2). Released with the
  // bars. Inert if the bars were never built (no-op) or in any non-cinematic level.
  letterbox(on) {
    if (!this._lbTop || this.letterboxOn === on) return;
    this.letterboxOn = on;
    const H = this.scale.height, barH = this._lbH;
    this.tweens.killTweensOf([this._lbTop, this._lbBot]);
    if (on) {
      this._lbTop.setVisible(true); this._lbBot.setVisible(true);
      this.tweens.add({ targets: this._lbTop, y: barH / 2, duration: 300, ease: "sine.inOut" });
      this.tweens.add({ targets: this._lbBot, y: H - barH / 2, duration: 300, ease: "sine.inOut" });
      this._camCineTarget = 1 + 0.06 * uxShakeScale();
    } else {
      this.tweens.add({ targets: this._lbTop, y: -barH / 2, duration: 250, ease: "sine.inOut",
        onComplete: () => this._lbTop.setVisible(false) });
      this.tweens.add({ targets: this._lbBot, y: H + barH / 2, duration: 250, ease: "sine.inOut",
        onComplete: () => this._lbBot.setVisible(false) });
      this._camCineTarget = 1;
    }
  }

  // GFX3 G1 — hit-stop + zoom punch. `kind` is "light" (40ms stop, 1.5% zoom)
  // or "heavy" (70ms stop, 3% zoom). Skipped whole when SCREEN SHAKE is off (R2).
  // The stop pauses physics and lifts it on a SINGLE re-checking timer: a fresh
  // call while a stop is live EXTENDS `_hitStopUntil` (never stacks a second
  // timer that would unpause early). While TIME-FREEZE (`this.frozen`) owns the
  // world we skip the stop and keep only the zoom punch, so the two never fight
  // over `isPaused`. The zoom punch tweens `camPunch` (applied in updateCamera),
  // so it is inert when a snap tool has stubbed updateCamera to a no-op.
  impactPunch(kind) {
    const s = uxShakeScale();
    if (s === 0) return;
    const heavy = kind === "heavy";
    const k = (heavy ? 0.03 : 0.015) * s;

    if (this._punchTween) this._punchTween.remove();
    this.camPunch = 1;
    this._punchTween = this.tweens.add({
      targets: this, camPunch: 1 + k, duration: 90, yoyo: true, ease: "Quad.easeOut",
      onComplete: () => { this.camPunch = 1; this._punchTween = null; },
    });

    if (this.frozen) return; // freeze holds the world; zoom punch only
    const stopMs = heavy ? 70 : 40;
    const live = this._hitStopUntil > this.time.now;
    this._hitStopUntil = Math.max(this._hitStopUntil, this.time.now + stopMs);
    if (live) return; // extend the open window; the pending timer re-checks
    this.physics.world.isPaused = true;
    const resume = () => {
      const remain = this._hitStopUntil - this.time.now;
      if (remain > 0) { this.time.delayedCall(remain, resume); return; } // extended
      this._hitStopUntil = 0;
      // never clobber a pause owned by the menu / level-clear / freeze
      if (!this.frozen && !this.paused && !this.complete) this.physics.world.isPaused = false;
    };
    this.time.delayedCall(stopMs, resume);
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
    this.impactPunch("heavy"); // GFX3 G1: enemy kill
    this.stampSplat(bug.x, bug.body ? bug.body.bottom - 2 : bug.y + 12);
    if (bug.glow) bug.glow.destroy();
    // A5: hide the rig's pooled feeler parts before the host is destroyed (the rig's
    // per-frame update early-returns once the host is gone, so they'd otherwise linger).
    const rig = this.anim && this.anim.rigFor(bug);
    if (rig && rig.onHostRemoved) rig.onHostRemoved();
    bug.destroy();
    // V2.5: KOBI mourns a minion now and then (rare — 0.22 chance + cooldown, so he
    // isn't eulogizing every squish).
    this.barks.fire(this, "enemyKill", { prob: 0.22 });
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
    this.impactPunch("heavy"); // GFX3 G1: crane boss hit
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
    // W3W4 M4 freeze gate: the whole fight machine holds (timers/positions
    // untouched — nothing here moves by velocity). Unreachable in 1-3 (no W4
    // skill), listed for completeness so a future W4 crane freezes correctly.
    if (this.frozen) return;
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

  // --- W3W4 L43: KOBI'S HEART — the 4-3 finale boss -----------------------------
  // The confrontation set piece (GAME_DESIGN §4-3): beam BLINDS the eye (a
  // cooling core exposes, PERMANENTLY), freeze holds the defense turbines, a
  // robot TOUCHES the core — ×3, then the staged power-down + Bolt rescue.
  // Structured like the crane fight: one state machine stepped from update(),
  // fully freeze-gated per the M4 contract (frozen = simply not stepped), and
  // every bit of progress MONOTONIC so the fight can never become unwinnable.
  // Glare tuning: per-core stage scaling mirrors the crane's escalation.
  static HEART = {
    aimMs: 2300, lockMs: 750, strikeMs: 500, coolMs: 1800,
    stageScale: [1, 0.85, 0.7], // glare cycle speed-up per core taken
    glareHalfW: 52,             // strike column kill half-width (px)
    aimSpeed: 170,              // px/s the aim column tracks a robot
    boltSpeed: 210,             // Bolt's bound speed toward the buddies (px/s)
  };

  updateHeart(time, delta) {
    const H = this.heart;
    if (!H) return;
    // Core touches resolve EVEN MID-FREEZE — the design's key beat: the world
    // (turbines, glare) holds while the live robot reaches the exposed core.
    if (H.state !== "down") this.checkHeartCores();
    // M4 freeze contract: the whole boss machine (glare timers, dazzle,
    // turbines, cinematics) is simply NOT STEPPED while frozen — the painter
    // keeps its last frame (the crane's convention), resume is byte-identical.
    if (this.frozen) return;
    const HEART = GameScene.HEART;
    const dt = delta / 1000;
    const g = this.heartGfx;
    g.clear();

    // --- defense turbines: lethal spin unless dead (frozen = not reached) ----
    for (const tb of this.turbines) {
      if (tb.dead) continue;
      tb.rotor.rotation += tb.spin * dt;
      sfx.turbineWhirr(tb.x, tb.y); // rate-limited low whirr
      for (const p of this.players) {
        if (p.dead || p.invuln > 0 || p.carriedBy) continue;
        if (Math.abs(p.x - tb.x) < 30 && p.y > tb.y - 80) {
          if (p.bubbleT > 0) this.popBubble(p, true);
          else { sfx.laserZap(p.x, p.y); this.killPlayer(p); }
        }
      }
    }

    // GFX3 G5: the FIGHT OPENER (eye-reveal beat) — the first frame a live buddy
    // stands inside the eye's clamp band, a short self-releasing letterbox pulse
    // (bars + slow push) frames the confrontation, then lifts ~2.4s later. Control
    // is never suspended (the fight is live); this is cinematic framing only. Fires
    // exactly once (`H._opened`); the release is guarded so it can't cancel the
    // later power-down bars.
    if (!H._opened) {
      for (const p of this.players) {
        if (!p.dead && p.x >= H.minX - 40 && p.x <= H.maxX + 40) {
          H._opened = true;
          this.letterbox(true);
          this.time.delayedCall(2400, () => { if (!this.heartDefeated) this.letterbox(false); });
          break;
        }
      }
    }

    // --- the power-down + Bolt rescue timeline -------------------------------
    if (H.state === "down") { this.updateHeartDown(time, delta); return; }

    // --- iris tracking (cosmetic — gated per the ?animoff=1 conventions) -----
    if (this.anim && this.anim.enabled) {
      const tx = this.nearestAlivePlayerX(H.x);
      const ty = 13 * TILE;
      const d = Math.hypot(tx - H.x, ty - H.y) || 1;
      const r = H.dazzle > 0 ? 4 : 13; // squints toward centre while dazzled
      const k = Math.min(1, dt * 6);
      H.iris.x += (H.x + ((tx - H.x) / d) * r - H.iris.x) * k;
      H.iris.y += (H.y + ((ty - H.y) / d) * r - H.iris.y) * k;
    }

    // --- REELING: post-expose safe window (no attacks, lid shut) -------------
    if (H.state === "reeling") {
      H.reelT -= delta;
      H.lid.setScale(1, Math.min(1, H.lid.scaleY + dt * 4)); // lid slams shut
      if (H.reelT <= 0) {
        H.state = "fight";
        H.glare.state = "cool";
        H.glare.t = 1400;
        sfx.heartAlarm(H.x, H.y); // "I can SEE again" re-arm telegraph
      }
      return;
    }

    // --- BLIND: a held cone ON the eye fills the dazzle meter ----------------
    // While lit the eye SQUINTS — its glare cycle is HELD (it cannot aim into
    // the light), which is both the kid-fair read and what makes the blind
    // stance safe to hold. Dazzle drains slowly unlit (never resets to zero
    // in one beat; re-attempts are unlimited — the battery recharges).
    let lit = false;
    for (const p of this.players) {
      if (p.dead || !p.beamOn) continue;
      if (this.coneHits(p, H.x, H.y)) { lit = true; break; }
    }
    if (lit) {
      H.dazzle = Math.min(PHYS.heartBlindMs, H.dazzle + delta);
      H.lid.setScale(1, Math.min(0.55, H.lid.scaleY + dt * 2)); // pained squint
      H._squintCd -= delta;
      if (H._squintCd <= 0) { sfx.heartSquint(H.x, H.y); H._squintCd = 420; }
      if (H.dazzle >= PHYS.heartBlindMs) { this.exposeHeartCore(); return; }
    } else {
      if (H.dazzle > 0) H.dazzle = Math.max(0, H.dazzle - delta * PHYS.heartDrain);
      H.lid.setScale(1, Math.max(0, H.lid.scaleY - dt * 2.5));
    }
    // dazzle meter over the eye (meaning-bearing — drawn both tiers, like the
    // ice-door melt fill)
    if (H.dazzle > 0) {
      const frac = H.dazzle / PHYS.heartBlindMs;
      g.fillStyle(COLORS.hudBg, 0.88).fillRect(H.x - 41, H.y - 74, 82, 9);
      g.fillStyle(0xffe08a, 0.95).fillRect(H.x - 40, H.y - 73, Math.max(1, 80 * frac), 7);
    }

    // --- the GLARE attack: aim-follow -> lock -> strike column -> cool -------
    // Crane-telegraph rhythm: the warning stripes are visible for the whole
    // aim (2.3s) + lock (0.75s) before the 0.5s strike — dodge by stepping out
    // of the 104px column. HELD while the eye is lit (see above).
    const G = H.glare;
    const scale = HEART.stageScale[Math.min(2, H.coresTaken)];
    if (!lit) G.t -= delta;
    const floorY = 14 * TILE;
    switch (G.state) {
      case "cool":
        if (G.t <= 0 && !lit) {
          // the eye only ENGAGES while a live robot is actually inside its
          // clamp band — the arena mouth (west of tile 34) is a true safe
          // pocket (kid-fair regroup spot; the column never camps the edge)
          let inBand = false;
          for (const p of this.players) {
            if (!p.dead && p.x >= H.minX - 40 && p.x <= H.maxX + 40) { inBand = true; break; }
          }
          if (inBand) {
            G.state = "aim";
            G.t = HEART.aimMs * scale;
            G.x = Phaser.Math.Clamp(this.nearestAlivePlayerX(H.x), H.minX, H.maxX);
          }
        }
        break;
      case "aim": {
        // the column drifts after the nearest robot (slow enough to outwalk)
        const want = Phaser.Math.Clamp(this.nearestAlivePlayerX(G.x), H.minX, H.maxX);
        G.x += Phaser.Math.Clamp(want - G.x, -HEART.aimSpeed * dt, HEART.aimSpeed * dt);
        this.drawGlareColumn(g, G.x, H.y + 40, floorY, 0.1, time);
        if (G.t <= 0 && !lit) {
          G.state = "lock";
          G.t = HEART.lockMs;
          G.lockX = G.x;
          sfx.heartAlarm(H.x, H.y);
        }
        break;
      }
      case "lock":
        // the gaze tracer: the glare visibly comes FROM the eye
        g.lineStyle(3, COLORS.magenta, 0.35).lineBetween(H.x, H.y + 8, G.lockX, H.y + 44);
        this.drawGlareColumn(g, G.lockX, H.y + 40, floorY, 0.24, time);
        if (G.t <= 0) {
          G.state = "strike";
          G.t = HEART.strikeMs;
          sfx.heartGlare(G.lockX, floorY);
          this.camShake(140, 0.003);
        }
        break;
      case "strike": {
        // the strike beam: a hot gaze tracer from the eye into a violet
        // column (glow sheath + hot core), eye level down to the floor
        g.lineStyle(6, 0x8f7bff, 0.5).lineBetween(H.x, H.y + 8, G.lockX, H.y + 34);
        g.lineStyle(2.5, 0xffd7f4, 0.85).lineBetween(H.x, H.y + 8, G.lockX, H.y + 34);
        g.fillStyle(0x8f7bff, 0.3).fillRect(G.lockX - HEART.glareHalfW, H.y + 30, HEART.glareHalfW * 2, floorY - H.y - 30);
        g.fillStyle(0xffd7f4, 0.85).fillRect(G.lockX - 7, H.y + 30, 14, floorY - H.y - 30);
        g.fillStyle(0xff4dd2, 0.5).fillCircle(G.lockX, floorY - 4, 18);
        for (const p of this.players) {
          if (p.dead || p.invuln > 0 || p.carriedBy) continue;
          if (Math.abs(p.x - G.lockX) < HEART.glareHalfW && p.y > H.y) {
            if (p.bubbleT > 0) this.popBubble(p, true);
            else { sfx.laserZap(p.x, p.y); this.killPlayer(p); }
          }
        }
        if (G.t <= 0) {
          G.state = "cool";
          G.t = HEART.coolMs * scale;
        }
        break;
      }
    }
  }

  // hazard warning stripes for the glare column (the crane's telegraph look)
  drawGlareColumn(g, x, top, bottom, alpha, time) {
    const HEART = GameScene.HEART;
    const w = HEART.glareHalfW * 2;
    const h = bottom - top;
    if (h <= 0) return;
    for (let sx = x - w / 2; sx < x + w / 2; sx += 16) {
      g.fillStyle(COLORS.magenta, alpha).fillRect(sx, top, 8, h);
    }
    const pulse = alpha + 0.12 * Math.sin(time / 90);
    g.lineStyle(2, COLORS.magenta, Math.min(0.8, pulse * 2.4)).strokeRect(x - w / 2, top, w, h);
  }

  // Exposed-core touches (runs every frame, INCLUDING mid-freeze — that IS the
  // design: turbines held while the live robot reaches the core).
  checkHeartCores() {
    const H = this.heart;
    for (const st of H.stations) {
      if (!st.exposed || st.taken) continue;
      for (const p of this.players) {
        if (p.dead || p.carriedBy) continue;
        if (Math.abs(p.x - st.x) < 44 && Math.abs(p.y - st.y) < 64) {
          this.takeHeartCore(st);
          break;
        }
      }
    }
  }

  // The beam finished blinding the eye: the CURRENT station's vent blows off.
  // PERMANENT (monotonic — a missed follow-up run never re-arms the vent).
  exposeHeartCore() {
    const H = this.heart;
    const st = H.stations[H.coresTaken];
    if (!st || st.exposed) return;
    st.exposed = true;
    H.dazzle = 0;
    H.state = "reeling"; // the guaranteed freeze+run head start
    H.reelT = PHYS.heartReelMs;
    sfx.ventBlow(st.x, st.y);
    this.boom.explode(this.fxBudget(12), st.x, st.y - 8);
    this.craneSmoke.explode(this.fxBudget(8), st.x, st.y - 10);
    // the armored hatch flips off and away (the crane plate-yank pattern)
    this.tweens.add({
      targets: st.vent, x: st.x + Phaser.Math.Between(-120, 120), y: st.y - 190,
      angle: 640, alpha: 0, duration: 700, onComplete: () => st.vent.destroy(),
    });
    // warning pulse-rings on the exposed core — escalating tint per stage
    // (REUSES the crane's pod_ring set: the game's one boss vocabulary)
    const ringTex = H.coresTaken >= 2 ? "pod_ring_c2" : H.coresTaken >= 1 ? "pod_ring_c1" : "pod_ring";
    st.ring = this.add.image(st.x, st.y - 4, ringTex).setDepth(DEPTH.entity - 1).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: st.ring, scale: { from: 0.5, to: 1.7 }, alpha: { from: 0.75, to: 0 }, duration: 900, repeat: -1 });
    const lines = [
      { text: "KOBI: MY VENT! A cooling core is SHOWING! Turbines — SPIN! Guard it with your whole SPIN!", mood: "angry" },
      { text: "KOBI: Stop LOOKING at my insides! I am at 67% smug and FALLING!", mood: "angry" },
      { text: "KOBI: NOT THE LAST ONE. I need that one to stay ANGRY. Being angry is all the warm I have!", mood: "angry" },
    ];
    this.game.events.emit("bb:blip", lines[Math.min(2, H.coresTaken)]);
  }

  // A robot reached an exposed core: UNPLUGGED (never re-plugs). That
  // station's turbines power down forever; the third core starts the finale.
  takeHeartCore(st) {
    const H = this.heart;
    st.taken = true;
    H.coresTaken++;
    sfx.heartUnplug(st.x, st.y);
    this.impactPunch("heavy"); // GFX3 G1: heart station core pulled
    this.boom.explode(this.fxBudget(14), st.x, st.y - 6);
    this.starBurst.explode(this.fxBudget(8), st.x, st.y - 10);
    if (st.ring) { this.tweens.killTweensOf(st.ring); st.ring.destroy(); st.ring = null; }
    st.core.setTexture("heart_core_dead");
    for (const tb of this.turbines) {
      if (tb.station === st.idx && !tb.dead) {
        tb.dead = true;
        tb.rotor.setTexture("turbine_rotor_dead");
        this.craneSmoke.explode(this.fxBudget(6), tb.x, tb.y - 30);
        sfx.liftStop(tb.x, tb.y); // the spin-down clunk
      }
    }
    this.camShake(180, 0.003);
    if (H.coresTaken >= 3) { this.heartPowerDown(); return; }
    const lines = [
      { text: "KOBI: UNPLUGGED?! That was my FAVORITE tantrum coil. I feel... 12% calmer. DISGUSTING.", mood: "angry" },
      { text: "KOBI: Two cores down. My rage is BUFFERING. Wait. WAIT. I was SAVING that rage for later!", mood: "angry" },
    ];
    this.game.events.emit("bb:blip", lines[Math.min(1, H.coresTaken - 1)]);
  }

  // Third core out: the FINALE_BIBLE Phase-2 "RUNAWAY TANTRUM" — the twist is
  // that the eye does NOT power down. The 3rd core is unplugged but the tantrum
  // keeps spinning; the wall-clamps pop and the eye drifts loose like a balloon.
  // The scripted ~34s auto-playing cinematic (tantrum -> power-down -> tiny-KOBI
  // scale reveal -> Bolt rescue -> the TURN-BACK -> carry-out) runs on downT in
  // updateHeartDown. Attacks are over; nothing here can hurt anyone.
  heartPowerDown() {
    const H = this.heart;
    H.state = "down";
    H.downT = 0;
    H.downStep = 0;
    this.heartDefeated = true;
    // GFX3 G5: the KOBI power-down -> Bolt rescue cinematic — bars IN here, OUT
    // when control returns at heartResolved (both resolve sites, below).
    this.letterbox(true);
    if (this.heartGfx) this.heartGfx.clear(); // drop any freeze-held glare painting
    // FIN-05 / beat 2.0 THE TURN: the wall-clamps blow, the eye stays AWAKE
    // (no grey iris, no lid, no music change yet — that is the whole twist).
    sfx.heartAlarm(H.x, H.y);
    this.camShake(400, 0.006);
    this.craneSmoke.explode(this.fxBudget(8), H.x, H.y); // wall-clamp pop puff
    // the eye pops wide open and starts a loose runaway wobble/bob (pooled
    // repeat tweens on the three rig images — cosmetic only, stays in-arena)
    this.tweens.killTweensOf([H.housing, H.iris, H.lid]);
    this.tweens.add({ targets: H.lid, scaleY: 0, duration: 250, ease: "sine.out" });
    H._wobbleY = this.tweens.add({
      targets: [H.housing, H.iris, H.lid], y: "-=14",
      duration: 900, yoyo: true, repeat: -1, ease: "sine.inOut",
    });
    H._wobbleX = this.tweens.add({
      targets: [H.housing, H.iris, H.lid], x: "+=26",
      duration: 1500, yoyo: true, repeat: -1, ease: "sine.inOut",
    });
    this.game.events.emit("bb:blip", { text: "KOBI: THAT WAS MY LAST CORE.", mood: "angry" });
  }

  // The CLIMAX CINEMATIC (state "down", FINALE_BIBLE beats 2.0->2.4): the
  // runaway tantrum -> the soft click power-down -> the tiny-KOBI scale
  // reveal -> the cage pops -> Bolt bounds to the buddies -> the TURN-BACK
  // (the dog decides) -> "Carry me anyway" -> resolved (the exit's
  // needs.heart opens). ~34-40s, fully auto-playing — no input required, and
  // a hard 40s fallback forces heartResolved so the level can NEVER strand.
  // Freeze-gated with everything else (downT += delta accumulation); the
  // timeline simply resumes if someone casts mid-cinematic.
  updateHeartDown(time, delta) {
    const H = this.heart;
    const HEART = GameScene.HEART;
    H.downT += delta;
    // A scripted cinematic is a TRANSITION, not a stall: hold the SL2
    // watchdog's stall window at zero while it plays (idle-watching players
    // are exactly what the scene asks for). Bounded by the 40s fallback
    // below, so this can never mask a real strand.
    if (!this.heartResolved && this.watchdog) this.watchdog._stallMs = 0;
    // HARD FALLBACK: whatever happens, the exit opens within ~40s of the 3rd
    // core (the cinematic keeps playing cosmetically past it if mid-beat).
    if (!this.heartResolved && H.downT > 40000) { this.heartResolved = true; this.letterbox(false); }

    // --- the tantrum cue sheet (bible-exact KOBI lines; eye still AWAKE) ----
    if (H.downStep === 0 && H.downT > 2500) {
      H.downStep = 1; // FIN-06
      this.game.events.emit("bb:blip", { text: "KOBI: Wait. Why is it still spinning. WHY IS IT STILL SPINNING.", mood: "scared" });
    }
    if (H.downStep === 1 && H.downT > 5000) {
      H.downStep = 2; // FIN-08 + beat 2.1 RECONFIGURE flavor
      this.ventPuff.explode(this.fxBudget(10), H.x - 60, H.y + 40);
      this.ventPuff.explode(this.fxBudget(10), H.x + 60, H.y + 40);
      this.dust.explode(this.fxBudget(8), H.x, 14 * TILE - 6);
      // the crescent-moon SLEEP button, revealed low behind the eye (drawn)
      if (!H._sleepBtn) {
        const bg = this.add.graphics().setDepth(DEPTH.entity).setPosition(H.x, H.y + 44);
        bg.fillStyle(0x223044, 1).fillCircle(0, 0, 11);
        bg.lineStyle(2, 0xffe08a, 0.9).strokeCircle(0, 0, 11);
        bg.fillStyle(0xffe08a, 0.95).fillCircle(1, 0, 6);   // moon disc...
        bg.fillStyle(0x223044, 1).fillCircle(4, -2, 5.2);    // ...bitten to a crescent
        bg.setAlpha(0);
        this.tweens.add({ targets: bg, alpha: 1, duration: 600 });
        H._btnBob = this.tweens.add({ targets: bg, y: "-=8", duration: 1100, yoyo: true, repeat: -1, ease: "sine.inOut" });
        H._sleepBtn = bg;
      }
      this.game.events.emit("bb:blip", { text: "KOBI: I can't find my OFF switch. I skipped that chapter. It looked BORING.", mood: "scared" });
    }
    if (H.downStep === 2 && H.downT > 8000) {
      H.downStep = 3; // FIN-09
      this.game.events.emit("bb:blip", { text: "KOBI: It is on my BACK. I do not HAVE arms. WHO DESIGNED THIS.", mood: "angry" });
    }
    if (H.downStep === 3 && H.downT > 10500) {
      H.downStep = 4; // FIN-10
      this.game.events.emit("bb:blip", { text: "KOBI: ...I designed this.", mood: "defeated" });
    }
    if (H.downStep === 4 && H.downT > 13000) {
      H.downStep = 5; // FIN-19 — the emotional turn
      this.game.events.emit("bb:blip", { text: "KOBI: NO. WAIT. If I sleep — who watches the door?", mood: "scared" });
    }
    if (H.downStep === 5 && H.downT > 15500) {
      H.downStep = 6; // FIN-20
      this.game.events.emit("bb:blip", { text: "KOBI: Guarding is my whole personality.", mood: "scared" });
    }
    if (H.downStep === 6 && H.downT > 18000) {
      H.downStep = 7; // FIN-24
      this.game.events.emit("bb:blip", { text: "KOBI: I have never been OFF. What if I dream of the dark?", mood: "scared" });
    }
    if (H.downStep === 7 && H.downT > 20500) {
      H.downStep = 8; // FIN-25
      this.game.events.emit("bb:blip", { text: "KOBI: Then press it. Press it before I change my—", mood: "defeated" });
    }

    // --- THE POWER-DOWN (FIN-26, the softest click) — NOW the eye greys -----
    if (H.downStep === 8 && H.downT > 22000) {
      H.downStep = 9;
      sfx.menuSelect(); // the soft "boop" click
      sfx.heartDown(H.x, H.y);
      if (H._wobbleY) { H._wobbleY.stop(); H._wobbleY = null; }
      if (H._wobbleX) { H._wobbleX.stop(); H._wobbleX = null; }
      // the eye settles back home as it dims; the lid droops shut over ~1.2s
      this.tweens.add({ targets: H.housing, x: H.x, y: H.y, duration: 1200, ease: "sine.inOut" });
      this.tweens.add({ targets: H.iris, x: H.x, y: H.y, duration: 1200, ease: "sine.inOut" });
      this.tweens.add({ targets: H.lid, x: H.x, y: H.y - 46, scaleY: 1, duration: 1200, ease: "sine.inOut" });
      H.iris.setTexture("kobi_iris_dead");
      setMusicLayer("tension", false); // tantrum over -> the calm coda
      this.camShake(500, 0.006);
      this.craneSmoke.explode(this.fxBudget(14), H.x, H.y);
      this.sparks.explode(this.fxBudget(12), H.x, H.y + 20);
    }
    if (H.downStep === 9 && H.downT > 23500) {
      H.downStep = 10; // FIN-27
      this.game.events.emit("bb:blip", { text: "KOBI: Powering down. Five... four... three... two... one and a half... one and a quarter...", mood: "defeated" });
    }

    // --- the SCALE REVEAL (FIN-29): the shell was mostly speakers -----------
    if (H.downStep === 10 && H.downT > 26000) {
      H.downStep = 11;
      this.craneSmoke.explode(this.fxBudget(12), H.x, H.y);
      this.tweens.add({
        targets: [H.housing, H.iris, H.lid], scale: 0.15, alpha: 0,
        duration: 900, ease: "sine.in",
      });
      if (H._btnBob) { H._btnBob.stop(); H._btnBob = null; }
      if (H._sleepBtn) this.tweens.add({ targets: H._sleepBtn, alpha: 0, duration: 600 });
      // the teapot-sized REAL KOBI, drawn tiny near the floor (one graphics)
      const tg = this.add.graphics().setDepth(DEPTH.player + 1)
        .setPosition(H.x, 13 * TILE + 6);
      tg.fillStyle(0x223044, 1).fillRoundedRect(-7, 7, 14, 5, 2); // little base
      tg.fillStyle(0x141c2e, 1).fillCircle(0, 0, 9);              // dark shell
      tg.lineStyle(2, 0xffb347, 1).strokeCircle(0, 0, 9);         // amber ring
      tg.fillStyle(0xf2ead8, 1).fillCircle(0, 0, 5.5);            // pale sclera
      tg.fillStyle(COLORS.magenta, 1).fillCircle(0, 0, 2.6);      // magenta iris
      tg.setScale(0);
      this.tweens.add({ targets: tg, scale: 1, duration: 420, ease: "back.out" });
      H.tiny = tg;
      this.game.events.emit("bb:blip", { text: "KOBI: The big me was mostly SPEAKERS.", mood: "defeated" });
    }

    // --- the cage fail-safe pops: Bolt is FREE (FIN-31) ---------------------
    if (H.downStep === 11 && H.downT > 28000) {
      H.downStep = 12;
      H._boltT0 = H.downT;
      H.cage.setTexture("bolt_cage_open");
      sfx.door(H.cage.x, H.cage.y);
      this.boom.explode(this.fxBudget(8), H.cage.x, H.cage.y - 10);
      H.bolt = this.add.image(H.cage.x, H.cage.y + 6, "bolt_pup").setDepth(DEPTH.player + 1);
      H.boltFree = true;
      sfx.boltYip(H.cage.x, H.cage.y);
      this.game.events.emit("bb:blip", { text: "KOBI: Good. The guest is leaving. Guests... leave.", mood: "defeated" });
    }

    // Bolt's bounding (both legs): frame-rate-independent hops — x at
    // boltSpeed, y a |sin| bounce over the floor line.
    const floorY = 14 * TILE - 18;
    if (H.downStep === 12 && H.bolt) {
      // leg 1: OUT — toward the nearest live buddy (the reunion zoomies)
      const dt = delta / 1000;
      const targetX = this.nearestAlivePlayerX(H.bolt.x);
      const dx = targetX - H.bolt.x;
      H._boltPhase = (H._boltPhase || 0) + dt * 7;
      if (Math.abs(dx) > 56 && H.downT < H._boltT0 + 14000) {
        H.bolt.x += Phaser.Math.Clamp(dx, -HEART.boltSpeed * dt, HEART.boltSpeed * dt);
        H.bolt.y = floorY - Math.abs(Math.sin(H._boltPhase)) * 30;
        H.bolt.setFlipX(dx > 0); // the bolt_pup art faces LEFT at rest
      } else {
        // reached the buddies (or the 14s can't-be-outrun fallback). Bolt
        // stops... looks back at the tiny lonely KOBI... and DECIDES.
        H.downStep = 13;
        H.bolt.y = floorY;
        sfx.boltYip(H.bolt.x, H.bolt.y);
      }
    }
    if (H.downStep === 13 && H.bolt && H.tiny) {
      // leg 2: the TURN-BACK — Bolt bounds back to tiny KOBI
      const dt = delta / 1000;
      const dx = H.tiny.x - H.bolt.x;
      H._boltPhase = (H._boltPhase || 0) + dt * 7;
      if (Math.abs(dx) > 26 && H.downT < H._boltT0 + 26000) {
        H.bolt.x += Phaser.Math.Clamp(dx, -HEART.boltSpeed * dt, HEART.boltSpeed * dt);
        H.bolt.y = floorY - Math.abs(Math.sin(H._boltPhase)) * 30;
        H.bolt.setFlipX(dx > 0);
      } else {
        H.downStep = 14; // FIN-34 — the lick
        H.bolt.y = floorY;
        H._talkT = H.downT;
        sfx.boltYip(H.bolt.x, H.bolt.y);
        this.game.events.emit("bb:blip", { text: "KOBI: Your dog is LEAKING on me. ...Do it again.", mood: "angry" });
      }
    }
    if (H.downStep === 14 && H.downT > H._talkT + 1600) {
      H.downStep = 15; // FIN-36 — the smallest voice
      this.game.events.emit("bb:blip", { text: "KOBI: ...Carry me anyway.", mood: "scared" });
    }
    if (H.downStep === 15 && H.downT > H._talkT + 3200) {
      H.downStep = 16; // FIN-37 — the carry: tiny KOBI rides up onto Bolt's back
      if (H.tiny && H.bolt) {
        this.tweens.add({
          targets: H.tiny, x: H.bolt.x, y: H.bolt.y - 16,
          duration: 600, ease: "sine.inOut",
        });
      }
      this.game.events.emit("bb:blip", { text: "KOBI: Onward, steed. This dog is under my PROTECTION now.", mood: "happy" });
    }
    if (H.downStep === 16 && H.downT > H._talkT + 4400) {
      // the carry has settled: RESOLVED (the exit's needs.heart opens NOW),
      // one celebration, a gentle forever-wiggle — and no further lines.
      H.downStep = 17;
      this.heartResolved = true;
      this.letterbox(false); // GFX3 G5: control returns — lift the cinematic bars
      if (H.bolt) {
        this.starBurst.explode(this.fxBudget(12), H.bolt.x, H.bolt.y - 14);
        this.tweens.add({ targets: H.bolt, angle: { from: -6, to: 6 }, duration: 260, yoyo: true, repeat: -1, ease: "sine.inOut" });
      }
    }
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
    let firedStreak = false;
    if (this._segDeaths >= 3 && !this._segStreakFired) {
      this._segStreakFired = true;
      const line = u9Pick(U9_STREAK_LINES);
      if (line) {
        this._u9StreakCount++;
        this._u9LastStreak = line;
        this.game.events.emit("bb:blip", line);
        firedStreak = true;
      }
    }
    // V2.5: an occasional single-death bark (most deaths pass silently — the
    // cooldown + 0.45 chance keep it a garnish). Never on the same respawn as a
    // streak line (that beat already spoke).
    if (!firedStreak) this.barks.fire(this, "death", { prob: 0.45 });
    if (p.carrying) this.detachCarry(p, p.carrying, false);
    if (p.carriedBy) this.detachCarry(p.carriedBy, p, false);
    // W3: a dying magnet drops its crate; a dying bubble pops silently. Both
    // no-ops in shipped levels (magCrate/bubbleT only set by W3 skills).
    if (p.magCrate) this.releaseMagCrate(p, true);
    this.popBubble(p, false, true);
    // W4: a dying beam robot's light goes out (no-op unless the beam skill lit it).
    if (p.beamOn) this.setBeam(p, false);
    p.inWater = null;
    p.airMs = 0;
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
      return { c, bg, texts, active: false, key: null, until: 0, guard: 0, shownAt: 0, follow: null, halfH: 24, halfW: 95 };
    };
    // Faint re-show clones of the floating "SPACE/L = ACTION" hint (U1(d)).
    const reshow = this.players.map((p) => {
      const color = p.idx === 0 ? COLORS.beep : COLORS.boop;
      const hw = p.idx === 0 ? 74 : 56;
      const g = this.add.graphics();
      g.fillStyle(COLORS.hudBg, 0.92).fillRoundedRect(-hw, -15, hw * 2, 30, 8);
      g.fillStyle(0xffffff, 0.06).fillRoundedRect(-hw + 3, -13, hw * 2 - 6, 11, 6); // glass gloss
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
    // GFX2 "Lumen Lab" glass bubble: frosted fill + sheen + top-edge lip + soft glow.
    bg.fillStyle(COLORS.hudBg, 0.92).fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 10);
    sheen(bg, { x: -panelW / 2, y: -panelH / 2, w: panelW, h: panelH, a: 0.05 });
    bg.lineStyle(1, GLASS_HI, 0.1).lineBetween(-panelW / 2 + 10, -panelH / 2 + 1.5, panelW / 2 - 10, -panelH / 2 + 1.5);
    bg.lineStyle(6, col, 0.14).strokeRoundedRect(-panelW / 2 - 3, -panelH / 2 - 3, panelW + 6, panelH + 6, 12);
    bg.lineStyle(2, col, 0.9).strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 10);

    let x = -rowW / 2;
    for (const e of els) {
      const cx = x + e.w / 2;
      if (e.type === "cap") {
        bg.fillStyle(0x1a2338, 0.95).fillRoundedRect(cx - e.w / 2 + 1, rowY - CAPH / 2 + 1, e.w - 2, CAPH - 2, 7);
        bg.fillStyle(0xffffff, 0.08).fillRoundedRect(cx - e.w / 2 + 3, rowY - CAPH / 2 + 3, e.w - 6, CAPH * 0.4, 5); // glass gloss
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
    b.shownAt = this.time.now; // T3: which of the two bubbles is "second-shown"
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
    // Positions are computed into `pos` first so the two-player avoidance pass can
    // see both before anything is committed with setPosition.
    const pos = [null, null];
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
      // T3 (D8): top-clamp FLIP. The old code clamped a too-high bubble straight
      // DOWN onto the robot near the screen top. Instead, when that clamped-down
      // rect would cover the followed robot's body, park the bubble BESIDE the
      // robot — on the side with more viewport room, at the robot's y (the bottom
      // blip-bar clamp below still applies).
      if (f.obj && wy < minWorldY) {
        const rHalfW = (f.obj.displayWidth || 32) / 2;
        const rHalfH = (f.obj.displayHeight || 44) / 2;
        if (Math.abs(wx - f.obj.x) < b.halfW + rHalfW && Math.abs(minWorldY - f.obj.y) < b.halfH + rHalfH) {
          const roomR = (wv.x + wv.width) - f.obj.x, roomL = f.obj.x - wv.x;
          const side = roomR >= roomL ? 1 : -1;
          wx = f.obj.x + side * (b.halfW + 40);
          wy = f.obj.y;
        }
      }
      wy = Phaser.Math.Clamp(wy, minWorldY, maxWorldY);
      // T2 (D5): nudge a bubble off a FULL (non-minimized) item card — mirror it to
      // the robot's OTHER side horizontally. Cards minimize after 6s so this only
      // bites during the spawn window (or while a robot lingers by an unclaimed
      // pedestal), exactly the case D5 called out.
      if (f.obj) {
        for (const ped of this.pedestals) {
          if (ped.taken || !ped.card || ped.cardState !== "full") continue;
          const cw = ped.cardFull.W, ch = ped.cardFull.H;
          if (Math.abs(wx - ped.card.x) < b.halfW + cw / 2 && Math.abs(wy - ped.card.y) < b.halfH + ch / 2) {
            const dir = wx - ped.card.x >= 0 ? 1 : -1; // push to the side away from the card
            wx = f.obj.x + dir * (b.halfW + 40);
            break;
          }
        }
      }
      pos[i] = { wx, wy, minWorldY, maxWorldY };
    }
    // T3 (D8): two-player avoidance. If both bubbles are up and their AABBs overlap,
    // push the SECOND-shown one down by its full height + 8; if that breaks the
    // bottom (blip-bar) clamp, push it up instead. One bubble never buries the other.
    if (pos[0] && pos[1]) {
      const b0 = co.bubbles[0], b1 = co.bubbles[1];
      if (Math.abs(pos[0].wx - pos[1].wx) < b0.halfW + b1.halfW &&
          Math.abs(pos[0].wy - pos[1].wy) < b0.halfH + b1.halfH) {
        const li = (b1.shownAt || 0) >= (b0.shownAt || 0) ? 1 : 0; // later-shown bubble
        const lp = pos[li], lb = co.bubbles[li];
        let ny = lp.wy + lb.halfH * 2 + 8;
        if (ny > lp.maxWorldY) ny = lp.wy - (lb.halfH * 2 + 8); // clamp would break → go up
        lp.wy = Phaser.Math.Clamp(ny, lp.minWorldY, lp.maxWorldY);
      }
    }
    for (let i = 0; i < this.players.length; i++) {
      if (pos[i]) co.bubbles[i].c.setPosition(pos[i].wx, pos[i].wy);
    }

    // Re-show hints: follow their robot, expire at 4s or on an action press.
    for (let i = 0; i < this.players.length; i++) {
      const r = co.reshow[i];
      if (!r.visible) continue;
      if (time > co.reshowUntil[i] || co.actEdge[i]) { r.setVisible(false); continue; }
      const p = this.players[i];
      r.setPosition(p.x, p.y - this._actionHintYoff(i) + Math.sin(time / 300) * 4);
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
          co.reshow[i].setVisible(true).setAlpha(0.3).setPosition(p.x, p.y - this._actionHintYoff(i));
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
    // W3W4 L43: the finale exit before the resolution — point back at the eye
    if (n.heart && !this.heartResolved && this.heart) {
      const ang = Math.atan2(this.heart.y - oy, this.heart.x - ox);
      return { tokens: [{ icon: "arrow", angle: ang }], caption: this.heartDefeated ? "WAIT FOR BOLT" : "UNPLUG K.O.B.I. FIRST" };
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
    // W3W4 L43: the finale exit waits for the WHOLE resolution — cores unplugged
    // AND Bolt home with the buddies (heartResolved latches, never un-sets).
    if (needs.heart && !this.heartResolved) return false;
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
    // GFX3 G1: hub-bound exit stays navy (duration unchanged, R6).
    this.cameras.main.fadeOut(250, ...FADE_NAVY);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.stop("UI");
      this.scene.start("Hub", { sel: this.levelIndex });
    });
  }

  doRestart() {
    this.leaving = true;
    this.clearConfirm();
    // GFX3 G1: level-bound (restart) exit tints to the destination world's fade
    // — the same world we reload into (duration unchanged, R6).
    this.cameras.main.fadeOut(250, ...this.worldFade(this.def.world));
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.stop("UI");
      // devLevel rides along (null in normal play) so an R-restart of the W3
      // sandbox reloads the sandbox, not registry index 0.
      this.scene.restart({ levelIndex: this.levelIndex, devLevel: this.devLevel });
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
    // T4 reading-kindness state (all driver-side; the SL2 watchdog signal is untouched):
    this._stuckPeakShown = 0;   // highest tier shown this stall segment → +10s/tier reading grace
    this._stuckAckUntil = 0;    // scene time until which an ENTER-ack suppresses re-show
    this._stuckAckTier = 0;     // the tier acknowledged (a higher escalation / tier-3 overrides)
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
    // T4: the "↵ ok" chip tells the player ENTER dismisses the panel (reading grace
    // + 30s re-show suppression are wired in the driver / ackStuckPrompt).
    const restartCopy = single ? "Press R to restart  ·  ESC = map  ·  ↵ ok"
                               : "Hold R twice to restart  ·  ESC twice = map  ·  ↵ ok";
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

    // GFX2 "Lumen Lab" glass stuck-panel: frosted fill + sheen + top-edge lip +
    // soft glow ring, keeping the per-mode edge colour/width/alpha and geometry.
    ui.g.fillStyle(COLORS.hudBg, bgAlpha).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, radius);
    sheen(ui.g, { x: -bw / 2, y: -bh / 2, w: bw, h: bh, a: 0.05 });
    ui.g.lineStyle(1.5, GLASS_HI, 0.1).lineBetween(-bw / 2 + radius, -bh / 2 + 1.5, bw / 2 - radius, -bh / 2 + 1.5);
    ui.g.lineStyle(edgeW + 4, edge, 0.12).strokeRoundedRect(-bw / 2 - 3, -bh / 2 - 3, bw + 6, bh + 6, radius + 3);
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
      // T4 reading-grace (D9): the VISIBLE panel's escalation lags the watchdog by
      // +10s per tier already shown, so sitting still to READ a tier never tips the
      // next one. We gate on the raw watchdog tier `st` (so hints-off / segment
      // resets are still honored — its signal is UNCHANGED, the probe still sees
      // 25/50/75s) but delay the higher VISIBLE tiers by comparing the watchdog's
      // own stall clock against its T2/T3 + the accumulated grace. Read-only.
      const st = this.stuckTier | 0;
      const wd = this.watchdog;
      const stall = wd ? wd._stallMs : Infinity;
      // +10s of reading grace per LOWER tier already shown. The offset for a tier
      // depends only on tiers BELOW it (never the tier being tested), so showing a
      // tier can never push its OWN threshold — no feedback: tier-2 lands at T2+10s
      // (tier-1 was read), tier-3 at T3+20s (tiers 1 & 2 were read).
      const shown = this._stuckPeakShown | 0;
      const T2 = (wd ? wd.T2 : 50000) + (shown >= 1 ? 10000 : 0);
      const T3 = (wd ? wd.T3 : 75000) + (shown >= 1 ? 10000 : 0) + (shown >= 2 ? 10000 : 0);
      if (st >= 3 && stall >= T3) { tier = 3; mode = "coldtruth"; }      // SL2 watchdog t3 (SL7)
      else if (st >= 2 && stall >= T2) { tier = 2; mode = "firm"; }      // SL2 watchdog t2
      else if (st >= 1) { tier = 1; mode = "gentle"; }                   // SL2 watchdog t1
    }
    // Tier-1 defers to any active/applicable contextual co-op hint (roadmap §2).
    if (tier === 1 && this._coopHintActive()) { tier = 0; mode = ""; }

    // T4 ENTER-acknowledge: after an ack the panel stays hidden for 30s UNLESS the
    // tier ESCALATES higher than what was acknowledged; a tier-3 escalation ALWAYS
    // overrides the suppression (safety first). The watchdog keeps rising internally.
    if (tier > 0 && time < this._stuckAckUntil && tier <= this._stuckAckTier && tier < 3) {
      tier = 0; mode = "";
    }
    // The stall fully cleared (progress / movement) — drop the grace + ack memory so
    // the next genuine stall teaches from tier-1 again.
    if (!this.softlock && (this.stuckTier | 0) === 0) {
      this._stuckPeakShown = 0; this._stuckAckUntil = 0; this._stuckAckTier = 0;
    }

    if (tier === this._stuckTierShown && mode === this._stuckModeShown) return;
    this._stuckTierShown = tier;
    this._stuckModeShown = mode;
    if (tier === 0) this.hideStuckPrompt();
    else {
      if (tier > (this._stuckPeakShown | 0)) this._stuckPeakShown = tier; // grow the reading-grace baseline
      this.showStuckPrompt(mode);
    }
    // V2.5: on the gentle tier-1 nudge, KOBI adds a warm bark (fires once per
    // 0->1 transition — the guard above gates re-entry). Higher tiers keep the
    // firm SL prompt without chatter.
    if (tier === 1) this.barks.fire(this, "stuck", { prob: 1 });
  }

  // T4: acknowledge a visible stuck panel — hide it and suppress re-show for 30s.
  // Called from update() on ENTER (only when no blip is active, so the blip's own
  // ENTER-skip in UIScene keeps priority) and from the __BB.stuck.ack() probe.
  // Records the acknowledged tier so a HIGHER escalation (or any tier-3) still
  // breaks through — the safety net stays intact, this only quiets the reading.
  ackStuckPrompt(time) {
    if (!this.stuckUI || !this.stuckUI.c.visible) return false;
    this._stuckAckTier = this._stuckTierShown | 0;
    this._stuckAckUntil = time + 30000;
    this._stuckTierShown = 0;
    this._stuckModeShown = "";
    this.hideStuckPrompt();
    sfx.menuSelect();
    return true;
  }

  // --- main loop -----------------------------------------------------------------
  update(time, delta) {
    if (this.complete) return;
    // U7: poll gamepads once at the top of the frame (idempotent within a frame).
    // Any pad button folds into the audio-unlock gesture; a fresh connection pops
    // the per-session detection toast on the (unzoomed) HUD scene.
    pads.poll(time);
    if (pads.anyButtonJust()) initAudio();
    // T3 (D10): a pad button also fast-outs the intro banner (keyboard is handled by
    // a keydown listener installed in showIntroBanner).
    if (this.introBanner && pads.anyButtonJust()) this.skipIntroBanner();
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
    // T1: pad START doubles as the blip bar's "next text" key, so while a blip is
    // showing START advances the line (UIScene) instead of opening pause — the same
    // press must not do both. Keyboard P still pauses unconditionally.
    const padStart = pads.p(0).pauseJust || pads.p(1).pauseJust;
    const uiForBlip = this.scene.get("UI");
    const blipUp = !!(uiForBlip && uiForBlip.blipActive);
    if (J(this.pKey) || (padStart && !blipUp)) this.togglePause();
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
    // T4: ENTER acknowledges a visible stuck panel (hide + suppress re-show 30s).
    // The blip bar's ENTER-skip in UIScene takes priority, so only ack when NO blip
    // is up — the same press must never both dismiss a blip AND ack the panel.
    if (!blipUp && J(this.enterKey) && this.stuckUI && this.stuckUI.c.visible) {
      this.ackStuckPrompt(time);
    }

    // W3W4 M4: `this.frozen` is the TIME-FREEZE world gate. It can only ever be
    // true while a W4 level is running (castFreeze is reachable only from the
    // freeze skill), so every `!this.frozen` guard below is byte-inert in the
    // shipped game. Frozen devices are simply NOT STEPPED: timers untouched,
    // kinematic bodies velocity-held at 0 — resume is exact by construction.
    if (!this.frozen) this.beltSprites.forEach((b) => (b.tilePositionX += b.beltDir * 60 * dt));

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
      if (hint) hint.setPosition(p.x, p.y - this._actionHintYoff(p.idx) + Math.sin(time / 300) * 4);

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

      // conveyor drift (Heavyweight stands his ground; a FROZEN belt is still)
      if (p.skill !== "heavy" && p.grounded && !p.zip && !this.frozen) {
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

      // hazards (a W3-bubbled robot rolls right over hazard floors — bubbleT is
      // only ever set by the BUBBLE SHIELD skill, so this guard is inert here)
      const rect = new Phaser.Geom.Rectangle(p.body.x, p.body.y, p.body.width, p.body.height);
      if (p.invuln <= 0 && p.bubbleT <= 0 && this.hazardZones.some((h) => Phaser.Geom.Rectangle.Overlaps(h, rect))) {
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
          this.impactPunch("light"); // GFX3 G1: core pickup
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
            if (o.halo) o.halo.setVisible(false); // GFX3 G3: extinguish bloom halo
          });
          cp.active = true;
          // U9 (F16): a NEW segment begins — reset the streak counter + one-shot
          // guard so the death-streak line can fire once more on this fresh stretch.
          this._segDeaths = 0;
          this._segStreakFired = false;
          cp.img.setTexture("checkpoint_on").setAlpha(1); // green lamp
          if (cp.cone) cp.cone.setVisible(true); // light-cone below
          if (cp.pool) cp.pool.setVisible(true); // P8: light pool lit while active
          if (cp.halo) cp.halo.setVisible(true); // GFX3 G3: bloom halo lit while active
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
      // W3W4 M4: a GLOOMY sitting on the plate JAMS it (pl._gloomed is written
      // ONLY by updateWorld4 when gloomies exist — always falsy in shipped levels).
      const active = !pl._gloomed && weight >= pl.threshold;
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
            if (l.halo) l.halo.setVisible(false); // GFX3 G3: extinguish bloom halo on re-arm
            if (l.handle) this.tweens.add({ targets: l.handle, angle: -6, duration: 200 });
            // W3W4 L32: a re-armed TIMED magswitch pops visibly back out (its
            // coil lamp was flipped lit by pullLever; without this reset a
            // re-flippable mag lever reads permanently "on" — 3-2's baffle 2).
            if (l.mag && l.img) l.img.setTexture("magswitch");
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
        // V2.5: a mid-level gate opening = the room's lock solved. Skip the exit
        // door (its clear is covered by the scripted per-level `clear` blip).
        if (!d.isExit) this.barks.fire(this, "puzzleSolve", { prob: 0.7 });
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
      // W3W4 M4 freeze gate: a frozen lift holds position mid-travel — a solid
      // stepping stone wherever it stands. holdTimer untouched; glow dark.
      if (this.frozen) {
        lf.img.body.setVelocityY(0);
        if (lf.glow) lf.glow.setAlpha(0);
        continue;
      }
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
      // W3W4 M4 freeze gate: hold the phase — velocity 0, timer NOT decremented,
      // state untouched. Resume picks up the exact ms it left off.
      if (this.frozen) { body.setVelocityY(0); continue; }
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
                // W3: a crusher is a SHARP hit — it pops the bubble early
                // (brief mercy invuln) instead of killing. Inert unless bubbled.
                if (p.bubbleT > 0) this.popBubble(p, true);
                else this.killPlayer(p);
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
      // W3W4 M4 freeze gate: a frozen bug is held in place and harmless
      // (grounded, gravity keeps it seated; contact checks skipped).
      if (this.frozen) { bug.setVelocityX(0); return; }
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
    this.updateHeart(time, delta); // W3W4 L43: inert unless the 4-3 boss exists
    this.updateWorld2(time, delta, dt);
    this.updateWorld3(time, delta, dt); // W3W4 M3: early-returns unless W3 content is present
    this.updateWorld4(time, delta, dt); // W3W4 M4: early-returns unless W4 content is present

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
    this.updateItemCards(time);
    // T3 (D11): permanent world labels recede when idle. Rolling ~150ms timer
    // (not per-frame) lerps each label's alpha toward its proximity target.
    this._proxT -= delta;
    if (this._proxT <= 0) { this._proxT = 150; this.updateProxLabels(); }
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
    } else if (this.updrafts && this.updrafts.length) {
      // W3 updrafts reuse the fan loop KIND (same air texture; no new loop node).
      // Guarded to levels without W2 fans so setLoop("fan") is driven once.
      let prox = 0, px = null;
      for (const u of this.updrafts) {
        const inCol = this.players.some((p) => !p.dead && !p.carriedBy && Phaser.Geom.Rectangle.Contains(u.zone, p.x, p.y));
        if (inCol) { const q = proximity(u.zone.centerX, u.zone.centerY); if (q > prox) { prox = q; px = u.zone.centerX; } }
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
      // W3W4 M4 freeze gate: a frozen roller is held (velocity 0, state/timer
      // untouched, beam dark + harmless while the world is stopped).
      if (this.frozen) { img.body.setVelocityX(0); continue; }
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
          // W3: a laser-class zap POPS a bubble early instead of killing (inert
          // in shipped levels — bubbleT is only set by the BUBBLE SHIELD skill).
          if (seen.bubbleT > 0) this.popBubble(seen, true);
          else this.killPlayer(seen);
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

  // --- W3W4 M3: World-3 mechanics ----------------------------------------------
  // Everything below only runs when `_w3` is armed (a W3 skill/ent/tile in the
  // loaded level), so the shipped W1/W2 game never enters these paths.

  // MAGNET GLOVE plain-ACTION resolver. Priority: release a held state, then
  // chomper teeth-yank, crate drag-latch, steel-rail cling, remote mag-switch.
  // Returns true if the press did something (else handleAction falls through
  // to the buddy pickup / denied buzz).
  magnetAction(p) {
    // 1. clinging -> let go of the rail
    if (p.magCling) {
      p.endMagCling();
      sfx.railDrop();
      return true;
    }
    // 2. dragging -> release the crate
    if (p.magCrate) {
      this.releaseMagCrate(p, false);
      return true;
    }
    // 3. junk-chomper within reach -> yank its metal teeth out (its defeat).
    // W3W4 L31: the yank now OUTRANKS the crate latch — 3-1's crate yard is
    // patrolled by a chomper (the designed "stair build under a patrol"), and
    // with the old order an ACTION aimed at the snapping enemy grabbed a
    // nearby crate instead (danger must win the press). Verified inert for
    // the M3 sandbox (its crate yard and chomper are 60+ tiles apart).
    for (const ch of this.chompers) {
      if (ch.defanged) continue;
      const d = Math.hypot(ch.img.x - p.x, ch.img.y - p.y);
      if (d <= PHYS.magYankRange && this.hasLOS(p.x, p.y - 8, ch.img.x, ch.img.y - 8)) {
        this.defangChomper(ch, p);
        return true;
      }
    }
    // W3W4 L33 — 3b. holding the caught-scrap shield -> PLANT it where it
    // hovers (a temporary standable step / storm cover). AFTER the teeth-yank
    // (danger must win the press — the L31 rule) so a chomper in reach is
    // always defanged even mid-hold.
    if (this.stormShield && this.stormShield.state === "held" && this.stormShield.heldBy === p) {
      this.plantStormShield(p);
      return true;
    }
    // W3W4 L33 — 3c. flying scrap chunk within reach + LOS -> CATCH it: the
    // chunk recycles upwind and the magnet holds a scrap SHIELD (~8s + cooldown).
    if (this.stormShield && this.stormShield.state === "idle" && this.stormShield.cd <= 0) {
      let bc = null, bcd = PHYS.magGrabRange;
      for (const lane of this.stormLanes) {
        if (!lane.active) continue;
        for (const c of lane.chunks) {
          const d = Math.hypot(c.x - p.x, lane.y - p.y);
          if (d < bcd && this.hasLOS(p.x, p.y - 8, c.x, lane.y)) { bc = { lane, c }; bcd = d; }
        }
      }
      if (bc) {
        this.catchStormChunk(p, bc.lane, bc.c);
        return true;
      }
    }
    // 4. metal crate within reach + LOS -> drag-latch
    let best = null;
    let bestD = PHYS.magGrabRange;
    for (const c of this.crates) {
      if (c.heldBy) continue;
      const d = Math.hypot(c.img.x - p.x, c.img.y - p.y);
      if (d < bestD && this.hasLOS(p.x, p.y - 8, c.img.x, c.img.y)) { best = c; bestD = d; }
    }
    if (best) {
      this.latchMagCrate(p, best);
      return true;
    }
    // 5. steel rail overhead -> cling + traverse (hang beneath the run)
    for (let dy = 1; dy <= 3; dy++) {
      if (this.tileAt(p.x, p.y - dy * TILE) === "=") {
        p.startMagCling(Math.floor((p.y - dy * TILE) / TILE));
        this.sparks.explode(this.fxBudget(5), p.x, p.y - 20);
        this.w3ActionPose(p, "magnet");
        return true;
      }
    }
    // 6. magnetic switch within range + LOS -> flip it remotely (grapple-lever style)
    const ms = this.levers.find((l) => l.mag && l.img && !l.on &&
      Math.hypot(l.x - p.x, l.y - p.y) <= PHYS.magSwitchRange && this.hasLOS(p.x, p.y - 8, l.x, l.y));
    if (ms) {
      this.ropeFlashes.push({ x1: p.x, y1: p.y - 8, x2: ms.x, y2: ms.y, t: 200 });
      this.pullLever(ms);
      sfx.magFlip(ms.x, ms.y);
      this.w3ActionPose(p, "magnet");
      return true;
    }
    return false;
  }

  // Cosmetic A-series action overlay dispatch (body-invariant; rig-off = no-op).
  w3ActionPose(p, kind) {
    const rig = this.anim && this.anim.enabled && this.anim.rigFor(p);
    if (rig && rig.startW3Action) rig.startW3Action(kind, p.facing);
  }

  latchMagCrate(p, c) {
    c.heldBy = p;
    p.magCrate = c;
    c.img.body.setAllowGravity(false);
    sfx.magnetOn();
    this.sparks.explode(this.fxBudget(6), c.img.x, c.img.y);
    this.w3ActionPose(p, "magnet");
  }

  releaseMagCrate(p, silent) {
    const c = p.magCrate;
    if (!c) return;
    p.magCrate = null;
    c.heldBy = null;
    c.img.body.setAllowGravity(true);
    if (!silent) sfx.magnetOff();
  }

  // Blow a bubble around `q` (self or buddy); `by` is the caster and owns the cooldown.
  grantBubble(q, by) {
    q.bubbleT = PHYS.bubbleMs;
    by.bubbleCd = PHYS.bubbleCd;
    sfx.bubbleOn();
    if (q.bubbleShell) {
      this.tweens.killTweensOf(q.bubbleShell);
      q.bubbleShell.setVisible(true).setAlpha(0.85).setPosition(q.x, q.y - 2).setScale(0.3);
      this.tweens.add({ targets: q.bubbleShell, scale: q.baseScaleX, duration: 220, ease: "back.out" });
    }
    this.w3ActionPose(by, "bubble");
  }

  // Pop a bubble. `sharp` = a crusher/laser-class hit (brief mercy invuln so the
  // pop itself never chains straight into a kill); `silent` = death teardown.
  popBubble(p, sharp, silent) {
    if (p.bubbleT <= 0) return;
    p.bubbleT = 0;
    if (p.bubbleShell) {
      this.tweens.killTweensOf(p.bubbleShell);
      const sh = p.bubbleShell;
      this.tweens.add({
        targets: sh, scale: p.baseScaleX * 1.3, alpha: 0, duration: 160, ease: "quad.out",
        onComplete: () => sh.setVisible(false),
      });
    }
    this.phaseRipple(p.x, p.y - 2); // pooled ring — the pop wave
    if (!silent) sfx.bubblePop();
    if (sharp) p.invuln = Math.max(p.invuln, 900);
  }

  // A knocked jelly locks into a socket and POWERS its device (lever-latch plumbing).
  socketJelly(j, sk) {
    j.state = "socketed";
    sk.filled = true;
    j.img.body.reset(sk.x, sk.y - 8);
    j.img.body.setAllowGravity(false);
    j.img.body.setVelocity(0, 0);
    j.img.setTexture("jelly_happy");
    sk.img.setTexture("socket_on");
    const lev = this.levers.find((l) => l.id === sk.id);
    if (lev && !lev.on) this.pullLever(lev);
    sfx.jellySocket(sk.x, sk.y);
    this.starBurst.explode(this.fxBudget(8), sk.x, sk.y);
    this.game.events.emit("bb:blip", "KOBI: The jelly is IN the socket. It is... powering my door. I am NOT crying.");
  }

  // Magnet teeth-yank: the chomper's defeat interaction (no stomping needed).
  defangChomper(ch, p) {
    ch.defanged = true;
    ch.state = "dozer";
    ch.img.setTexture("chomper_dozer");
    ch.img.body.setVelocityX(0);
    sfx.teethYank(ch.img.x, ch.img.y);
    this.ropeFlashes.push({ x1: p.x, y1: p.y - 8, x2: ch.img.x, y2: ch.img.y - 6, t: 200 });
    // the yanked teeth fly toward the magnet glove and scatter (one-shot, event-driven)
    for (let i = 0; i < 4; i++) {
      const t = this.add.image(ch.img.x - 9 + i * 6, ch.img.y - 2, "tooth").setDepth(DEPTH.fx);
      this.tweens.add({
        targets: t, x: p.x + (i - 1.5) * 20, y: p.y + 8 - Math.abs(i - 1.5) * 10,
        angle: 320 + i * 80, alpha: 0, duration: 460 + i * 60, ease: "cubic.out",
        onComplete: () => t.destroy(),
      });
    }
    this.sparks.explode(this.fxBudget(10), ch.img.x, ch.img.y);
    this.w3ActionPose(p, "magnet");
    this.game.events.emit("bb:blip", "KOBI: You took its TEETH?! ...It does look happier now. DON'T tell it I said that.");
  }

  // --- W3W4 L33: SCRAP STORM helpers -------------------------------------------
  // All storm state lives on this.stormLanes / this.fuseCores / this.fuseSockets /
  // this.stormShield, which ONLY a 3-3-family level spawns — every path below is
  // unreachable in the shipped levels. No physics change anywhere: chunks are
  // kinematic pooled sprites (manual AABB contact, like jets), and the shield's
  // body is the proven crate box, enabled only while PLANTED.

  // Magnet catch: the chunk recycles upwind and the glove holds a scrap SHIELD.
  catchStormChunk(p, lane, c) {
    const sh = this.stormShield;
    this.recycleStormChunk(lane, c, STORM.graceMs);
    sh.state = "held";
    sh.heldBy = p;
    sh.holdMs = STORM.holdMs;
    this.tweens.killTweensOf(sh.img);
    sh.img.setVisible(true).setAlpha(1).setAngle(0).setPosition(c.img.x, c.img.y);
    sh.img.body.enable = false;
    sfx.magnetOn();
    this.sparks.explode(this.fxBudget(8), c.img.x, c.img.y);
    this.w3ActionPose(p, "magnet");
  }

  // Absorbed/caught chunks re-enter at the lane's upwind edge (pool constant,
  // spacing readable; never destroyed — bounded sprites for the whole level).
  // The ±6px margin keeps the DANGER inside the drawn band (drive-found: a
  // 20px overshoot made the tile beside a lane edge lethal — pixel-unfair).
  // `graceMs` despawns the chunk at the edge for a beat before it re-flies:
  // a shield-absorbed or bubble-popped chunk must NEVER re-bite point-blank
  // (drive-found: a chunk re-absorbed in place at the spawn edge bit the
  // shield-holder from behind the plate the instant he walked past it).
  recycleStormChunk(lane, c, graceMs = 0) {
    c.x = lane.dir > 0 ? lane.x1 - 6 : lane.x2 + 6;
    c.wait = graceMs;
  }

  // ACTION while holding: PLANT the shield where it hovers — a temporary
  // standable step (crate-family static body) that keeps absorbing chunks.
  plantStormShield(p) {
    const sh = this.stormShield;
    const bx = sh.img.x, by = sh.img.y;
    // refuse a plant that would embed terrain or a robot (denied buzz, re-try)
    for (const [dx, dy] of [[0, 0], [-18, -18], [18, -18], [-18, 18], [18, 18]]) {
      if (this.isSolidChar(this.tileAt(bx + dx, by + dy))) { sfx.denied(); return; }
    }
    for (const q of this.players) {
      if (!q.dead && Math.abs(q.x - bx) < 40 && Math.abs(q.y - by) < 46) { sfx.denied(); return; }
    }
    sh.state = "planted";
    sh.heldBy = null;
    sh.holdMs = STORM.plantMs;
    sh.img.setAngle(0).setAlpha(1);
    sh.img.body.enable = true;
    sh.img.body.reset(bx, by);
    sh.img.body.setImmovable(true);
    sh.img.body.setVelocity(0, 0);
    sfx.magnetOff();
    this.sparks.explode(this.fxBudget(6), bx, by);
  }

  // Hold/plant expiry (or a dead/skill-less holder): the storm rips the shield
  // away downwind and the catch cooldown starts — rhythmic, not trivializing.
  loseStormShield() {
    const sh = this.stormShield;
    if (!sh || sh.state === "idle") return;
    sh.state = "idle";
    sh.heldBy = null;
    sh.cd = STORM.catchCd;
    sh.img.body.setImmovable(false);
    sh.img.body.enable = false;
    const dir = this._stormFlingDir || 1;
    this.tweens.killTweensOf(sh.img);
    this.tweens.add({
      targets: sh.img, x: sh.img.x + dir * 220, y: sh.img.y - 60,
      angle: 220 * dir, alpha: 0, duration: 380, ease: "cubic.in",
      onComplete: () => sh.img.setVisible(false).setAlpha(1).setAngle(0),
    });
    sfx.magnetOff();
  }

  // A carrier hit by scrap (or killed) DROPS its fuse-core where it fell; the
  // core settles onto the first floor below — always retrievable (3-3 keeps
  // solid bedrock under every yard; no pit/water can swallow it).
  dropFuseCore(p) {
    if (!p) return;
    for (const fc of this.fuseCores) {
      if (fc.state !== "carried" || fc.carrier !== p) continue;
      fc.state = "rest";
      fc.carrier = null;
      // drop point: where it fell — but nudged INTO the band if it fell in an
      // upwind spawn dead-zone (drive-found: a core resting at the chunk spawn
      // point could only be re-grabbed point-blank into a fresh hit)
      let dx = p.x;
      for (const lane of this.stormLanes) {
        if (!lane.active || Math.abs(lane.y - p.y) > 52) continue;
        const edge = lane.dir > 0 ? lane.x1 - 6 : lane.x2 + 6; // the spawn point
        if (Math.abs(dx - edge) < 72) dx = edge - lane.dir * -80; // 80px downwind, inside the band
      }
      const tx = Phaser.Math.Clamp(Math.floor(dx / TILE), 1, this.def.cols - 2);
      let ty = Math.max(1, Math.floor(p.y / TILE));
      while (ty < this.def.rows - 1 && !this.isSolidChar(this.grid[ty][tx])) ty++;
      fc.baseY = ty * TILE - 16;
      fc.t = 0;
      fc.img.setPosition(tx * TILE + 24, fc.baseY);
      sfx.land(fc.img.x, fc.img.y);
      this.dust.emitParticleAt(fc.img.x, fc.img.y + 8, this.fxBudget(5));
    }
  }

  // Delivery: the core snaps into its cradle and latches the socket's lever id
  // (the jelly-socket plumbing) — doors open off it, lanes de-energize off it.
  socketFuseCore(fc, sk) {
    fc.state = "socketed";
    fc.carrier = null;
    fc.img.setPosition(sk.x, sk.y - 8);
    sk.filled = true;
    sk.img.setTexture("fusesock_on");
    const lev = this.levers.find((l) => l.id === sk.id);
    if (lev && !lev.on) this.pullLever(lev);
    sfx.jellySocket(sk.x, sk.y);
    this.starBurst.explode(this.fxBudget(10), sk.x, sk.y);
    const n = this.fuseSockets.filter((k) => k.filled).length;
    const lines = [
      "KOBI: A fuse-core is IN?! That lane was my FAVORITE weather. Now it is... calm. GROSS.",
      "KOBI: TWO cores socketed. My magnificent storm is becoming a BREEZE. Stop tidying my chaos!",
      "KOBI: All THREE cores?! My storm is CANCELLED. I have never been so insulted by good housekeeping.",
    ];
    this.game.events.emit("bb:blip", lines[Math.min(n, lines.length) - 1]);
  }

  // The lane's fuse latched: visible relief — chunks flutter down, the band
  // fades, the emitter goes dark. One-shot tweens (event-driven, no per-frame).
  calmStormLane(lane) {
    lane.active = false;
    this.tweens.killTweensOf(lane.band);
    this.tweens.add({ targets: lane.band, alpha: 0, duration: 600 });
    lane.em.setTexture("stormvent_off");
    for (const ch of lane.chev) this.tweens.add({ targets: ch, alpha: 0, duration: 600 });
    for (const c of lane.chunks) {
      this.tweens.add({
        targets: c.img, y: c.img.y + 44, alpha: 0, angle: c.img.angle + 160,
        duration: 700, ease: "cubic.in",
      });
    }
    this.starBurst.explode(this.fxBudget(8), (lane.x1 + lane.x2) / 2, lane.y);
    sfx.door((lane.x1 + lane.x2) / 2, lane.y);
  }

  // One frame of the storm: shield timers/steering, lane chunk flight +
  // contacts, fuse-core carry/drop/delivery. Called from updateWorld3 only when
  // storm lanes exist. Zero per-frame allocation (pooled sprites, math-only AABB).
  updateStorm(time, delta, dt) {
    const fsc = uxFlashScale();
    const sh = this.stormShield;
    if (sh) {
      if (sh.cd > 0) sh.cd -= delta;
      if (sh.state === "held") {
        const p = sh.heldBy;
        if (!p || p.dead || p.skill !== "magnet") {
          this.loseStormShield();
        } else {
          sh.holdMs -= delta;
          if (sh.holdMs <= 0) {
            this.loseStormShield();
          } else {
            // hover in FRONT of the glove — a body-less visual follow while held
            // (frame-rate independent ease, FL-013 pattern); the last ~1.5s
            // blinks a "running out" warning (U11-scaled like every flash).
            const tx = p.x + p.facing * 52;
            const ty = p.y - 10;
            const f = 1 - Math.pow(1 - 0.22, dt * 60);
            sh.img.x += (tx - sh.img.x) * f;
            sh.img.y += (ty - sh.img.y) * f;
            sh.img.setAngle(Math.sin(time / 140) * 6);
            sh.img.setAlpha(sh.holdMs < 1500 ? (Math.floor(time / (150 / fsc)) % 2 ? 0.35 : 1) : 1);
            if (this.w3Gfx) {
              this.w3Gfx.lineStyle(2, 0xffb347, 0.5);
              this.w3Gfx.lineBetween(p.x + p.facing * 10, p.y - 8, sh.img.x, sh.img.y);
            }
          }
        }
      } else if (sh.state === "planted") {
        sh.holdMs -= delta;
        sh.img.setAlpha(sh.holdMs < 1500 ? (Math.floor(time / (150 / fsc)) % 2 ? 0.35 : 1) : 1);
        if (sh.holdMs <= 0) this.loseStormShield();
      }
    }

    for (const lane of this.stormLanes) {
      if (lane.active && lane.offBy) {
        const lev = this.levers.find((l) => l.id === lane.offBy);
        if (lev && lev.on) this.calmStormLane(lane);
      }
      if (!lane.active) continue;
      this._stormFlingDir = lane.dir; // the rip-away fling follows the local wind
      for (const c of lane.chunks) {
        // grace: an absorbed/popped/wrapped chunk holds dark at the emitter for
        // a beat, and NEVER materializes on top of a robot or the shield (the
        // "scrap never spawns on you" fairness invariant — drive-found: a
        // chunk re-entering at the emitter while a robot walked past it was an
        // unreadable point-blank hit)
        if (c.wait > 0) {
          c.wait -= delta;
          if (c.wait <= 0) {
            const clear = this.players.every((p) => p.dead || Math.abs(p.x - c.x) > 90) &&
              !(sh && sh.state !== "idle" && Math.abs(sh.img.x - c.x) < 110);
            if (!clear) c.wait = 300; // hold dark until the doorway is clear
          }
          if (c.img.visible) c.img.setVisible(false);
          continue;
        }
        if (!c.img.visible) c.img.setVisible(true);
        c.x += lane.speed * lane.dir * dt;
        if (lane.dir > 0 && c.x > lane.x2 + 6) this.recycleStormChunk(lane, c, 60);
        else if (lane.dir < 0 && c.x < lane.x1 - 6) this.recycleStormChunk(lane, c, 60);
        const cy = lane.y + Math.sin(time / 260 + c.phase) * 5;
        c.img.setPosition(c.x, cy);
        c.img.setAngle(c.img.angle + c.spin * dt);
        // the caught/planted shield absorbs any chunk reaching its column —
        // the safe window both robots huddle behind
        if (sh && sh.state !== "idle" &&
            Math.abs(c.x - sh.img.x) < STORM.blockW && Math.abs(cy - sh.img.y) < STORM.blockH) {
          this.sparks.explode(this.fxBudget(6), c.x, cy);
          sfx.land(c.x, cy);
          this.recycleStormChunk(lane, c, STORM.graceMs);
          continue;
        }
        for (const p of this.players) {
          if (p.dead || p.carriedBy) continue;
          if (Math.abs(p.x - c.x) >= STORM.hitW || Math.abs(p.y - cy) >= STORM.hitH) continue;
          if (p.bubbleT > 0) {
            // scrap is a SHARP hit: pop + shove + the ferry drops its core
            this.popBubble(p, true);
            this.dropFuseCore(p);
            p.setVelocity(lane.dir * 260, -170);
            this.sparks.explode(this.fxBudget(5), c.x, cy);
            this.recycleStormChunk(lane, c, STORM.graceMs);
          } else if (p.invuln <= 0) {
            this.dropFuseCore(p); // dropped where it fell — retrievable
            sfx.jellyZap(p.x, p.y); // the standard electric-hazard sting
            this.killPlayer(p);   // standard death -> checkpoint respawn
          }
        }
      }
    }

    // fuse-cores: rest bob / pickup, carried follow / delivery, carrier-loss drop
    for (const fc of this.fuseCores) {
      if (fc.state === "rest") {
        fc.t += delta;
        fc.img.y = fc.baseY + Math.sin(fc.t / 450) * 5;
        for (const p of this.players) {
          if (p.dead || p.carriedBy) continue;
          if (this.fuseCores.some((o) => o.state === "carried" && o.carrier === p)) continue;
          if (Math.hypot(p.x - fc.img.x, p.y - fc.img.y) < 40) {
            fc.state = "carried";
            fc.carrier = p;
            sfx.key(fc.img.x, fc.img.y);
            this.starBurst.explode(this.fxBudget(6), fc.img.x, fc.img.y);
            break;
          }
        }
      } else if (fc.state === "carried") {
        const p = fc.carrier;
        if (!p || p.dead) { this.dropFuseCore(p); continue; }
        fc.img.setPosition(p.x - p.facing * 20, p.y - 14);
        for (const sk of this.fuseSockets) {
          if (!sk.filled && Math.abs(p.x - sk.x) < 50 && Math.abs(p.y - sk.y) < 60) {
            this.socketFuseCore(fc, sk);
            break;
          }
        }
      }
    }
  }

  // One frame of every World-3 system. Early-returns unless W3 content is present.
  updateWorld3(time, delta, dt) {
    if (!this._w3) return;
    const g = this.w3Gfx;
    if (g) g.clear();
    const fsc = uxFlashScale(); // U11 comfort: blink rates scale like every other flash

    // --- players: bubble timers/shells, water, updrafts ----------------------
    for (const p of this.players) {
      if (p.bubbleCd > 0) p.bubbleCd -= delta;
      if (p.bubbleT > 0) {
        p.bubbleT -= delta;
        if (p.bubbleT <= 0) {
          p.bubbleT = 1; // keep the pop's own guard satisfied while it tears down
          this.popBubble(p, false);
        } else if (p.bubbleShell && !this.tweens.isTweening(p.bubbleShell)) {
          // shell follows the robot; the last ~1.2s blinks a "running out" warning
          const blink = p.bubbleT < 1200 ? (Math.floor(time / (140 / fsc)) % 2 ? 0.3 : 0.8) : 0.8;
          p.bubbleShell.setVisible(p.visible && !p.dead)
            .setPosition(p.x, p.y - 2)
            .setAlpha(blink)
            .setScale(p.baseScaleX * (1 + 0.04 * Math.sin(time / 180)));
        }
      } else if (p.bubbleShell && p.bubbleShell.visible && !this.tweens.isTweening(p.bubbleShell)) {
        p.bubbleShell.setVisible(false);
      }

      if (p.dead || p.carriedBy) {
        p.inWater = null;
        p.airMs = 0;
        continue;
      }

      // water volumes: membership + splash edges + current + the air timer
      const wasIn = p.inWater;
      let inw = null;
      for (const wa of this.waters) {
        if (Phaser.Geom.Rectangle.Contains(wa.rect, p.x, p.y)) { inw = wa; break; }
      }
      p.inWater = inw;
      if (!!inw !== !!wasIn) {
        sfx.splash(p.x, p.y);
        const sy = (inw || wasIn).rect.y + 2;
        this.dust.emitParticleAt(p.x, sy, this.fxBudget(7));
      }
      if (inw) {
        // current field: ease vx toward the current speed (frame-rate independent;
        // active swimming overpowers it — the keyed lerp in preUpdate is stronger)
        if (inw.current && !p.zip && !p.reeled) {
          const fc = 1 - Math.pow(1 - 0.06, dt * 60);
          p.body.velocity.x += (inw.current - p.body.velocity.x) * fc;
        }
        if (p.bubbleT > 0) {
          p.airMs = 0; // a bubbled robot breathes its bubble
        } else {
          const submerged = p.y - 14 > inw.rect.y; // head under the surface line
          if (submerged) {
            p.airMs += delta;
            const remain = PHYS.waterAirMs - p.airMs;
            if (g) {
              const blink = remain < 1500 && Math.floor(time / (180 / fsc)) % 2 === 0;
              this.drawDrainRing(g, p.x, p.y - p.displayHeight / 2 - 22, 12, remain / PHYS.waterAirMs, blink);
            }
            if (remain < 1500) sfx.airWarn();
            if (p.airMs >= PHYS.waterAirMs) {
              p.airMs = 0;
              this.killPlayer(p); // drown = the standard hazard death/respawn
              continue;
            }
          } else {
            p.airMs = Math.max(0, p.airMs - delta * 2); // gulping air at the surface
          }
        }
      } else {
        p.airMs = 0;
      }

      // vent updrafts: strong lift for a BUBBLED robot, a gentle boost otherwise
      for (const u of this.updrafts) {
        if (!Phaser.Geom.Rectangle.Contains(u.zone, p.x, p.y)) continue;
        if (p.bubbleT > 0 && !p.zip && !p.carriedBy) {
          p.body.velocity.y = Math.max(p.body.velocity.y - 2400 * dt, -300);
          // FL-010/FL-013 lesson from the 2-2 fan: gentle KEYLESS centering so
          // riding the one-tile draft never demands pixel-perfect drift control.
          // Steering keys always win; frame-rate independent ease.
          if (!p.grounded && !p.keys.left.isDown && !p.keys.right.isDown &&
              !(p.pad && (p.pad.left.isDown || p.pad.right.isDown))) {
            const pull = Phaser.Math.Clamp((u.zone.centerX - p.x) * 3, -120, 120);
            const t = 1 - Math.pow(1 - 0.12, dt * 60);
            p.body.velocity.x = Phaser.Math.Linear(p.body.velocity.x, pull, t);
          }
        } else {
          p.body.velocity.y -= 300 * dt;
        }
      }
    }

    // --- metal crates: drag-latch follow ("rope-ish range") ------------------
    for (const c of this.crates) {
      const p = c.heldBy;
      if (!p) continue;
      if (p.dead || p.skill !== "magnet") { this.releaseMagCrate(p, true); continue; }
      const b = c.img.body;
      if (Math.hypot(c.img.x - p.x, c.img.y - p.y) > PHYS.magDragMax) {
        this.releaseMagCrate(p, false); // the magnetic tether snaps at range
        continue;
      }
      // hover target beside the glove at HEAD height (a floating magnetic hold —
      // it clears ground clutter and releases cleanly onto a crate below for
      // stair-stacking): proportional velocity steering (frame-rate independent
      // by construction — velocity from position error), collisions still fully
      // apply, so a dragged crate never passes through terrain.
      const tx = p.x + p.facing * 58;
      const ty = p.y - 44;
      b.setVelocity(
        Phaser.Math.Clamp((tx - c.img.x) * 6, -PHYS.magDragSpeed, PHYS.magDragSpeed),
        Phaser.Math.Clamp((ty - c.img.y) * 6, -PHYS.magDragSpeed, PHYS.magDragSpeed)
      );
      // magnetic link: a faint amber tether drawn into the shared overlay
      if (g) {
        g.lineStyle(2, 0xffb347, 0.5);
        g.lineBetween(p.x + p.facing * 10, p.y - 8, c.img.x, c.img.y);
      }
    }

    // --- zap-jellies: patrol / knocked / socketed ----------------------------
    for (const j of this.jellies) {
      const img = j.img;
      const b = img.body;
      // W3W4 M4 freeze gate: held in place, timers untouched, harmless.
      if (this.frozen) { b.setVelocity(0, 0); continue; }
      if (j.hitCd > 0) j.hitCd -= delta;
      if (j.state === "patrol") {
        b.velocity.x = 42 * j.dir;
        if (img.x < j.minX + 16) j.dir = 1;
        else if (img.x > j.maxX - 16) j.dir = -1;
        j.t += delta;
        const targetY = j.baseY + Math.sin(j.t / 520) * 10;
        b.velocity.y = (targetY - img.y) * 4;
      } else if (j.state === "knocked") {
        // drag decays the knock; a socket in the flight path captures it
        for (const sk of this.sockets) {
          // the socket mouth is a tall cradle: generous vertically so a jelly
          // riding a little high off repeated boops still drops in
          if (!sk.filled && Math.abs(img.x - sk.x) < 46 && Math.abs(img.y - sk.y) < 70) {
            this.socketJelly(j, sk);
            break;
          }
        }
        if (j.state === "knocked" && Math.abs(b.velocity.x) < 26 && Math.abs(b.velocity.y) < 26) {
          j.state = "patrol";
          j.baseY = Phaser.Math.Clamp(img.y, 2 * TILE, this.worldH - 3 * TILE);
        }
      } else {
        b.setVelocity(0, 0); // socketed: parked + harmless
      }
      j.glow.setPosition(img.x, img.y);
      j.glow.setAlpha(j.state === "socketed" ? 0.3 : 0.4 + 0.18 * Math.sin(time / 160));
      if (j.state === "socketed") continue;
      // contact: zap — unless the toucher is BUBBLED, which boops the jelly away
      for (const p of this.players) {
        if (p.dead || p.carriedBy) continue;
        if (Math.abs(p.x - img.x) >= 36 || Math.abs(p.y - img.y) >= 34 || j.hitCd > 0) continue;
        if (p.bubbleT > 0) {
          // the boop is HORIZONTAL, in the DIRECTION THE BOOPER IS MOVING (kid
          // intuition: "I bounce it the way I'm going") — a raw contact angle
          // made aiming at the socket too fumbly.
          const dirX = Math.abs(p.body.velocity.x) > 40
            ? Math.sign(p.body.velocity.x)
            : (Math.sign(img.x - p.x) || p.facing);
          b.setVelocity(dirX * 340, -20);
          j.state = "knocked";
          j.hitCd = 350;
          p.body.velocity.x -= dirX * 60; // soft recoil on the bubble
          sfx.jellyBounce(img.x, img.y);
          this.sparks.explode(this.fxBudget(5), img.x, img.y);
        } else if (p.invuln <= 0) {
          sfx.jellyZap(img.x, img.y);
          this.killPlayer(p);
        }
      }
    }

    // --- junk-chompers: idle -> telegraph -> lunge -> rest (or defanged dozer)
    for (const ch of this.chompers) {
      const img = ch.img;
      const b = img.body;
      // W3W4 M4 freeze gate: held in place, state/timer untouched, harmless.
      if (this.frozen) { b.setVelocityX(0); continue; }
      if (ch.defanged) {
        // harmless dozer: contented slow wander around home, nothing else
        b.velocity.x = 26 * ch.dir;
        if (img.x > ch.homeX + 2 * TILE || b.blocked.right) ch.dir = -1;
        else if (img.x < ch.homeX - 2 * TILE || b.blocked.left) ch.dir = 1;
        img.setFlipX(ch.dir === -1);
        continue;
      }
      ch.timer -= delta;
      if (ch.state === "idle") {
        // W3W4 L33: HOME LEASH — an idle chomper displaced by its own lunges
        // treads back toward its post (dozer pace) instead of parking wherever
        // the last chase ended. Drive-found on 3-3: successive lunges migrated
        // the fc2 guard deep into a live scrap lane, where no yank stance
        // exists — an unwinnable camp. Behavior-neutral where it matters: the
        // guard still defends the same spot, aggro/lunge/defang unchanged
        // (3-1/3-2 re-verified green in the full matrix).
        const drift = ch.homeX - img.x;
        if (Math.abs(drift) > 2.5 * TILE) {
          b.velocity.x = 60 * Math.sign(drift);
          ch.dir = Math.sign(drift);
          img.setFlipX(ch.dir === -1);
        } else {
          b.velocity.x = 0;
        }
        const near = this.players.find((p) => !p.dead && !p.carriedBy &&
          Math.abs(p.x - img.x) < 190 && Math.abs(p.y - img.y) < 64);
        if (near) {
          ch.state = "tele";
          ch.timer = 450;
          ch.dir = near.x > img.x ? 1 : -1;
          img.setFlipX(ch.dir === -1);
          img.setTexture("chomper_alert"); // meaning-bearing telegraph (Canvas-safe swap)
          sfx.chompTele(img.x, img.y);
        }
      } else if (ch.state === "tele") {
        b.velocity.x = 0;
        if (ch.timer <= 0) {
          ch.state = "lunge";
          ch.timer = 420;
          sfx.chompLunge(img.x, img.y);
        }
      } else if (ch.state === "lunge") {
        b.velocity.x = 400 * ch.dir;
        for (const p of this.players) {
          if (p.dead || p.carriedBy) continue;
          if (Math.abs(p.x - img.x) >= 40 || Math.abs(p.y - img.y) >= 40) continue;
          if (p.bubbleT > 0) {
            // teeth are a SHARP hit: pop the bubble + shove, never a kill
            this.popBubble(p, true);
            p.setVelocity(ch.dir * 300, -200);
          } else if (p.invuln <= 0) {
            this.killPlayer(p);
          }
        }
        if (ch.timer <= 0 || b.blocked.left || b.blocked.right) {
          ch.state = "rest";
          ch.timer = 900;
          img.setTexture("chomper");
        }
      } else { // rest
        b.velocity.x = 0;
        if (ch.timer <= 0) ch.state = "idle";
      }
    }

    // --- W3W4 L33: the scrap storm (lanes / shield / fuse-cores) -------------
    // (M4: a frozen storm holds — chunks stop mid-air, timers pause.)
    if (this.stormLanes.length && !this.frozen) this.updateStorm(time, delta, dt);
  }

  // --- W3W4 M4: World-4 mechanics ----------------------------------------------
  // Everything below only runs when `_w4` is armed (a W4 skill/ent in the loaded
  // level), so the shipped W1-W3 game never enters these paths.

  // TIME-FREEZE cast: flip the world gate. PHYSICS-SACRED by construction —
  // nothing is saved/restored, because frozen device state machines are simply
  // NOT STEPPED (their `if (this.frozen)` gates hold velocity at 0 and skip the
  // timer decrement), so every position/timer resumes byte-identical. Players,
  // killPlayer/respawn (scene-clock delayedCall), finishLevel and the save are
  // untouched by the gate — they can NEVER freeze.
  castFreeze(p) {
    this.frozen = true;
    this.freezeT = PHYS.freezeMs;
    // the badge ring runs cast->ready: the 5s hold + the ~8s recharge
    p.freezeCd = PHYS.freezeMs + PHYS.freezeCdMs;
    sfx.freezeCast();
    this.starBurst.explode(this.fxBudget(10), p.x, p.y - 10);
    if (this._freezeWash) this._freezeWash.setVisible(true).setAlpha(0.07);
    // stamp pooled frost panels on every held device (drawn art — Canvas-safe;
    // ADD blend shimmer on WebGL). Frozen targets are static, so place once.
    const targets = [];
    this.crushers.forEach((c) => targets.push(c.img));
    this.lifts.forEach((l) => targets.push(l.img));
    this.lasers.forEach((l) => targets.push(l.img));
    this.tickers.forEach((t) => targets.push(t.img));
    this.gloomies.forEach((gl) => targets.push(gl.img));
    this.rotBridges.forEach((rb) => targets.push(rb.hub));
    // W3W4 L43: live turbines frost over while held (dead ones stay bare)
    this.turbines.forEach((tb) => { if (!tb.dead) targets.push(tb.rotor); });
    for (let i = 0; i < this._iceOverlays.length; i++) {
      const ov = this._iceOverlays[i];
      const t = targets[i];
      if (t) {
        ov.setVisible(true).setPosition(t.x, t.y)
          .setDisplaySize(t.displayWidth + 16, t.displayHeight + 16);
      } else ov.setVisible(false);
    }
    this.w4ActionPose(p, "freeze");
  }

  endFreeze() {
    if (!this.frozen) return;
    this.frozen = false;
    this.freezeT = 0;
    sfx.freezeEnd();
    if (this._freezeWash) this._freezeWash.setVisible(false);
    for (const ov of this._iceOverlays) ov.setVisible(false);
  }

  // LIGHT-BEAM ignite/douse (visual + sfx edges; the hold is driven per frame).
  setBeam(p, on) {
    if (p.beamOn === on) return;
    p.beamOn = on;
    const cone = this.beamCones && this.beamCones[p.idx];
    if (cone) cone.setVisible(on);
    if (on) { sfx.beamOn(); this.w4ActionPose(p, "beam"); }
    else sfx.beamOff();
  }

  // Cosmetic A-series action overlay dispatch (body-invariant; rig-off = no-op).
  w4ActionPose(p, kind) {
    const rig = this.anim && this.anim.enabled && this.anim.rigFor(p);
    if (rig && rig.startW4Action) rig.startW4Action(kind, p.facing);
  }

  // Is (x, y) inside `p`'s lit cone (range + half-angle + wall LOS)?
  coneHits(p, x, y) {
    const ox = p.x + p.facing * 8, oy = p.y - 10;
    const dx = x - ox, dy = y - oy;
    const d = Math.hypot(dx, dy);
    if (d < 6) return true; // point-blank always counts
    if (d > PHYS.beamRange) return false;
    const da = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - p.beamAim));
    if (da > PHYS.beamHalf) return false;
    return this.hasLOS(ox, oy, x, y);
  }

  // Point inside any dark zone?
  inDark(x, y) {
    for (const dz of this.darkZones) {
      if (Phaser.Geom.Rectangle.Contains(dz.rect, x, y)) return true;
    }
    return false;
  }

  // An ICE DOOR fully melted: opens PERMANENTLY (state only ever rises).
  openIceDoor(d) {
    d.open = true;
    d.melt = PHYS.iceMeltMs;
    d.img.body.enable = false;
    this.opened.add(d.id);
    sfx.iceCrack(d.x, d.topY + d.h / 2);
    this.boom.explode(this.fxBudget(10), d.x, d.topY + d.h / 2);
    this.jetDrips.emitParticleAt(d.x - 8, d.topY + d.h - 10, this.fxBudget(2));
    this.jetDrips.emitParticleAt(d.x + 8, d.topY + d.h - 10, this.fxBudget(2));
    this.tweens.add({ targets: d.img, alpha: 0.08, duration: 500, ease: "quad.out" });
    if (!this._iceBlipFired) {
      this._iceBlipFired = true;
      this.game.events.emit("bb:blip", "KOBI: You MELTED my beautiful ice door?! That took me AGES to chill. ...It was very pretty. WAS.");
    }
  }

  // One frame of every World-4 system. Early-returns unless W4 content is present.
  updateWorld4(time, delta, dt) {
    if (!this._w4) return;
    const g = this.w4Gfx;
    if (g) g.clear();
    const fsc = uxFlashScale(); // U11 comfort: blink rates scale like every other flash

    // --- the freeze clock (world-gate) — never freezes ITSELF: this timer, the
    // players, killPlayer/respawn and finishLevel all keep running normally.
    if (this.frozen) {
      this.freezeT -= delta;
      if (this._freezeWash) {
        // last ~0.9s: the wash blinks a gentle "about to thaw" warning
        const blink = this.freezeT < 900 ? (Math.floor(time / (170 / fsc)) % 2 ? 0.03 : 0.1) : 0.07;
        this._freezeWash.setAlpha(blink);
      }
      if (this.freezeT <= 0) this.endFreeze();
    }

    // --- players: freeze cooldown, beam hold/battery/aim, badge meters -------
    for (const p of this.players) {
      if (p.freezeCd > 0) p.freezeCd -= delta;
      if (p.skill === "beam") {
        const P = p.pad;
        const actHeld = p.keys.act.isDown || (p.keys.actAlt && p.keys.actAlt.isDown) || (P && P.act.isDown);
        const dnHeld = p.keys.down.isDown || (P && P.down.isDown);
        // hold-to-shine: stays lit while held and charged; a drained battery
        // must recover past beamMinMs before it can re-ignite (no flicker-spam)
        const wantOn = actHeld && !dnHeld && !p.dead && !p.carriedBy &&
          (p.beamOn ? p.beamMs > 0 : p.beamMs > PHYS.beamMinMs);
        this.setBeam(p, wantOn);
        if (p.beamOn) {
          const upHeld = p.keys.jump.isDown || (P && P.jump.isDown);
          p.beamAim = upHeld ? -Math.PI / 2 : (p.facing < 0 ? Math.PI : 0);
          p.beamMs = Math.max(0, p.beamMs - delta); // battery drains while lit
          sfx.beamHum(p.x, p.y); // rate-limited soft hum
          if (p.beamMs <= 0) this.setBeam(p, false);
        } else {
          // recharges ~2x slower than it drains
          p.beamMs = Math.min(PHYS.beamBattMs, p.beamMs + delta * PHYS.beamRegen);
        }
        // position the visible cone (alpha-baked wedge; ADD on WebGL)
        const cone = this.beamCones && this.beamCones[p.idx];
        if (cone && p.beamOn) {
          cone.setPosition(p.x + p.facing * 8, p.y - 10).setRotation(p.beamAim)
            .setAlpha(0.85 + 0.1 * Math.sin(time / 90));
        }
      } else if (p.beamOn) {
        this.setBeam(p, false); // skill lost/changed mid-hold
      }

      // badge meters (drawn into the shared overlay — zero alloc)
      if (g && p.badge && p.badge.visible) {
        const bx = p.badge.x, by = p.badge.y;
        if (p.skill === "freeze" && p.freezeCd > 0) {
          // cooldown ring sweeps clockwise from 12 o'clock as it recharges
          const frac = 1 - p.freezeCd / (PHYS.freezeMs + PHYS.freezeCdMs);
          g.lineStyle(3, 0x9fd8ff, 0.9);
          g.beginPath();
          g.arc(bx, by, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
          g.strokePath();
        } else if (p.skill === "beam") {
          // battery bar under the badge; blinks soft-red when nearly drained
          const frac = p.beamMs / PHYS.beamBattMs;
          const low = frac < 0.25;
          const w = 30;
          g.fillStyle(COLORS.hudBg, 0.85).fillRect(bx - w / 2 - 1, by + 15, w + 2, 7);
          const a = low && Math.floor(time / (180 / fsc)) % 2 === 0 ? 0.35 : 0.95;
          g.fillStyle(low ? 0xff5566 : 0xffe08a, a).fillRect(bx - w / 2, by + 16, Math.max(1, w * frac), 5);
        }
      }
    }

    // --- invisible platforms: solid ALWAYS; visible while coned (+ afterglow) -
    for (const gh of this.ghosts) {
      if (gh.lit > 0) gh.lit -= delta;
      const b = gh.img;
      const hw = b.width / 2;
      for (const p of this.players) {
        if (p.dead || !p.beamOn) continue;
        if (this.coneHits(p, b.x, b.y) || this.coneHits(p, b.x - hw + 8, b.y) || this.coneHits(p, b.x + hw - 8, b.y)) {
          if (gh.lit <= 0) sfx.ghostReveal(b.x, b.y);
          gh.lit = PHYS.ghostGlowMs;
          break;
        }
      }
      const a = gh.lit > 0 ? Math.min(1, gh.lit / (PHYS.ghostGlowMs * 0.55)) : 0;
      b.setAlpha(gh.baseA + (1 - gh.baseA) * a);
    }

    // --- ice doors: beam exposure fills the melt (never drains; opens once) ---
    for (const d of this.iceDoors) {
      if (d.open) continue;
      let lit = false;
      for (const p of this.players) {
        if (p.dead || !p.beamOn) continue;
        const fx = d.x - Math.sign(d.x - p.x || 1) * ((TILE - 6) / 2 + 3); // near face
        for (let k = 0; k < 3; k++) {
          if (this.coneHits(p, fx, d.topY + (k + 0.5) * (d.h / 3))) { lit = true; break; }
        }
        if (lit) break;
      }
      if (lit) {
        d.melt += delta;
        sfx.iceMelt(d.x, d.topY + d.h / 2); // rate-limited sizzle
        d.dripCd -= delta;
        if (d.dripCd <= 0) {
          this.jetDrips.emitParticleAt(d.x + ((time % 7) - 3) * 4, d.topY + d.h - 8, this.fxBudget(1));
          d.dripCd = 150;
        }
        if (d.melt >= PHYS.iceMeltMs) { this.openIceDoor(d); continue; }
      }
      const prog = d.melt / PHYS.iceMeltMs;
      d.img.setAlpha(1 - prog * 0.45); // thins visibly as it melts
      if (g && prog > 0) {
        // melt-progress fill above the door (meaning-bearing, drawn both tiers)
        g.fillStyle(COLORS.hudBg, 0.88).fillRect(d.x - 21, d.topY - 15, 42, 8);
        g.fillStyle(0x9fd8ff, 0.95).fillRect(d.x - 20, d.topY - 14, Math.max(1, 40 * Math.min(1, prog)), 6);
      }
    }

    // --- laser sweepers: rotating/oscillating hazard beams (pooled draw) ------
    if (this.lasers.length) {
      const lg = this.laserGfx;
      lg.clear();
      for (const L of this.lasers) {
        if (!this.frozen) {
          // FREEZE GATE: angle simply not advanced while frozen
          if (L.mode === "sweep") {
            L.angle += L.speed * L.dir * dt;
            if (L.angle >= L.max) { L.angle = L.max; L.dir = -1; }
            else if (L.angle <= L.min) { L.angle = L.min; L.dir = 1; }
          } else {
            L.angle += L.speed * dt;
            if (L.angle > Math.PI * 2) L.angle -= Math.PI * 2;
          }
        }
        const ca = Math.cos(L.angle), sa = Math.sin(L.angle);
        let end = L.len;
        for (let s = 18; s <= L.len; s += 12) {
          if (this.isSolidChar(this.tileAt(L.x + ca * s, L.y + sa * s))) { end = s; break; }
        }
        L.endX = L.x + ca * end;
        L.endY = L.y + sa * end;
        L.img.setRotation(L.angle);
        // constant-visible telegraph: soft glow sheath + hot core + tip spark.
        // Frozen beams repaint pale ice-blue (still lethal — pass the GAPS).
        const glowCol = this.frozen ? 0x9fd8ff : 0xff5566;
        const coreCol = this.frozen ? 0xe8f6ff : 0xffd9de;
        lg.lineStyle(7, glowCol, 0.22);
        lg.lineBetween(L.x + ca * 12, L.y + sa * 12, L.endX, L.endY);
        lg.lineStyle(2.5, coreCol, 0.9);
        lg.lineBetween(L.x + ca * 12, L.y + sa * 12, L.endX, L.endY);
        lg.fillStyle(coreCol, 0.85).fillCircle(L.endX, L.endY, 3);
        // hazard-class contact (bubble = the standard sharp pop)
        this._w4Line.setTo(L.x + ca * 14, L.y + sa * 14, L.endX, L.endY);
        for (const p of this.players) {
          if (p.dead || p.invuln > 0 || p.carriedBy) continue;
          this._w4Rect2.setTo(p.body.x, p.body.y, p.body.width, p.body.height);
          if (Phaser.Geom.Intersects.LineToRectangle(this._w4Line, this._w4Rect2)) {
            if (p.bubbleT > 0) this.popBubble(p, true);
            else { sfx.laserZap(p.x, p.y); this.killPlayer(p); }
          }
        }
      }
    }

    // --- rotating bridges: kinematic segment ring (velocity-steered) ----------
    for (const rb of this.rotBridges) {
      if (!this.frozen) rb.angle += rb.speed * dt; // FREEZE GATE: angle holds
      const ca = Math.cos(rb.angle), sa = Math.sin(rb.angle);
      for (const s of rb.segs) {
        const b = s.img.body;
        if (this.frozen) {
          b.setVelocity(0, 0); // held EXACTLY where it stands — a stepping stone
        } else {
          // exact kinematic steering: velocity = position error / dt, so the
          // segment lands ON its ring slot each step (collisions fully apply)
          const txp = rb.x + ca * s.off, typ = rb.y + sa * s.off;
          b.setVelocity(
            Phaser.Math.Clamp((txp - s.img.x) / dt, -420, 420),
            Phaser.Math.Clamp((typ - s.img.y) / dt, -420, 420)
          );
        }
        s.img.setRotation(rb.angle); // visual; the arcade AABB ignores rotation
      }
      rb.hub.setRotation(rb.angle);
    }

    // --- gloomies: darkness menace / light-fear / plate jammer ----------------
    for (const gl of this.gloomies) {
      const img = gl.img;
      const b = img.body;
      if (this.frozen) { b.setVelocity(0, 0); continue; } // held + harmless
      if (gl.scared > 0) gl.scared -= delta;
      // the beam cone DAZZLES it — it flees the light
      for (const p of this.players) {
        if (p.dead || !p.beamOn) continue;
        if (this.coneHits(p, img.x, img.y)) {
          if (gl.scared <= 0) sfx.gloomFlee(img.x, img.y);
          gl.scared = 550;
          gl.fleeX = p.x;
          gl.fleeY = p.y;
          break;
        }
      }
      const wantTex = gl.scared > 0 ? "gloomy_scared" : "gloomy";
      if (gl.tex !== wantTex) { gl.tex = wantTex; img.setTexture(wantTex); }
      // nearest live robot
      let near = null, nd = Infinity;
      for (const p of this.players) {
        if (p.dead || p.carriedBy) continue;
        const d = Math.hypot(p.x - img.x, p.y - img.y);
        if (d < nd) { nd = d; near = p; }
      }
      const homeD = Math.hypot(gl.homeX - img.x, gl.homeY - img.y);
      const seated = homeD < 44; // ON its post (the switch it guards)
      if (gl.scared > 0) {
        const a = Math.atan2(img.y - gl.fleeY, img.x - gl.fleeX);
        b.setVelocity(Math.cos(a) * 175, Math.sin(a) * 110); // flee the cone FAST
      } else if (seated) {
        // a SEATED guard is stubborn: mere glow doesn't move it — only the
        // beam does (the design's "scare it off the switch" beat). Its touch
        // is still the standard hurt, so it IS the obstacle. It settles the
        // last few px onto its exact post (so it re-JAMS the plate square).
        if (homeD > 8) b.setVelocity(((gl.homeX - img.x) / homeD) * 30, ((gl.homeY - img.y) / homeD) * 30);
        else b.setVelocity(0, 0);
      } else if (near && nd < PHYS.glowRadius) {
        const a = Math.atan2(img.y - near.y, img.x - near.x);
        b.setVelocity(Math.cos(a) * 58, Math.sin(a) * 40); // roaming: shy of the glow
      } else if (near && nd < 300 && this.inDark(img.x, img.y)) {
        const a = Math.atan2(near.y - img.y, near.x - img.x);
        b.setVelocity(Math.cos(a) * 42, Math.sin(a) * 28); // the slow dark menace
        sfx.gloomHiss(img.x, img.y); // rate-limited whisper
      } else {
        // drift home to re-jam its switch — but a robot's glow BLOCKS the
        // return (stand your ground on the plate and it hovers at bay)
        const glowBlocked = this.players.some((p) => !p.dead &&
          Math.hypot(p.x - gl.homeX, p.y - gl.homeY) < PHYS.glowRadius);
        if (!glowBlocked && homeD > 6) {
          b.setVelocity(((gl.homeX - img.x) / homeD) * 55, ((gl.homeY - img.y) / homeD) * 42);
        } else {
          b.setVelocity(0, 0);
        }
      }
      // touch = the standard hurt (bubble = sharp pop)
      for (const p of this.players) {
        if (p.dead || p.carriedBy || p.invuln > 0) continue;
        if (Math.abs(p.x - img.x) < 30 && Math.abs(p.y - img.y) < 28) {
          if (p.bubbleT > 0) this.popBubble(p, true);
          else this.killPlayer(p);
        }
      }
    }
    // plate jam flags — written ONLY here (gloomies present), read by the plates loop
    if (this.gloomies.length) {
      for (const pl of this.plates) {
        let jam = false;
        for (const gl of this.gloomies) {
          if (Math.abs(gl.img.x - pl.rect.centerX) < pl.rect.width / 2 + 10 &&
              Math.abs(gl.img.y - pl.rect.centerY) < 48) { jam = true; break; }
        }
        pl._gloomed = jam;
      }
    }

    // --- tickers: wind-up telegraph -> FAST dash; utterly held by freeze ------
    for (const t of this.tickers) {
      const img = t.img;
      const b = img.body;
      if (this.frozen) { b.setVelocityX(0); continue; } // held + SAFE to pass
      t.timer -= delta;
      if (t.state === "wind") {
        b.setVelocityX(0);
        if (t.tex !== "ticker_wind") { t.tex = "ticker_wind"; img.setTexture("ticker_wind"); }
        sfx.tickTock(img.x, img.y); // rate-limited tick-tock telegraph
        if (t.timer <= 0) {
          t.state = "dash";
          t.timer = 2600;
          t.tex = "ticker";
          img.setTexture("ticker");
          sfx.tickerDash(img.x, img.y);
        }
      } else {
        b.setVelocityX(240 * t.dir); // the fast dash
        img.setFlipX(t.dir === -1);
        const atEnd = (t.dir > 0 && img.x >= t.maxX) || (t.dir < 0 && img.x <= t.minX) ||
          b.blocked.left || b.blocked.right;
        if (atEnd || t.timer <= 0) {
          b.setVelocityX(0);
          t.dir = -t.dir;
          t.state = "wind";
          t.timer = 700;
        }
      }
      // contact = standard hurt — NEVER while frozen (gated above)
      for (const p of this.players) {
        if (p.dead || p.carriedBy || p.invuln > 0) continue;
        if (Math.abs(p.x - img.x) < 34 && Math.abs(p.y - img.y) < 38) {
          if (p.bubbleT > 0) { this.popBubble(p, true); p.setVelocity(t.dir * 260, -180); }
          else this.killPlayer(p);
        }
      }
    }

    // --- dark zones: repaint the screen-space darkness mask -------------------
    // clear + stamp + erase on a HALF-RES RenderTexture (no texture rebake, no
    // alloc). Zone rects stamp black; the robots' glow radii and any lit beam
    // cone are erased through gradient stamps (kid-fair: never pitch-black
    // around a robot). Runs both tiers — dark zones are meaning-bearing.
    if (this.darkRT) {
      const cam = this.cameras.main;
      const z = cam.zoom * 0.5; // world px -> half-res RT px
      const vx = cam.worldView.x, vy = cam.worldView.y;
      const rt = this.darkRT;
      rt.clear();
      const R = this._darkStampRect;
      for (const dz of this.darkZones) {
        const r = dz.rect;
        R.setPosition((r.x - vx) * z, (r.y - vy) * z);
        R.setDisplaySize(Math.max(1, r.width * z), Math.max(1, r.height * z));
        rt.draw(R);
      }
      const G = this._darkStampGlow;
      for (const p of this.players) {
        // GFX3 G3: buddy dark-zone glow rides the SAME player pass (no new loop).
        // Alpha eases 0 -> ~0.5 with the darkness factor (inDark, the value the
        // dark-zone system already computes) and back out; position follows here.
        const gl = this._darkGlows && this._darkGlows[p.idx];
        if (gl) {
          const target = !p.dead && p.visible && this.inDark(p.x, p.y) ? 0.5 : 0;
          gl.setAlpha(gl.alpha + (target - gl.alpha) * 0.15).setPosition(p.x, p.y - 8);
        }
        if (p.dead || !p.visible) continue;
        const dia = (PHYS.glowRadius * 2 + 60) * z; // gradient reaches past the nominal radius
        G.setPosition((p.x - vx) * z, (p.y - 8 - vy) * z);
        G.setDisplaySize(dia, dia);
        rt.erase(G);
      }
      const C = this._darkStampCone;
      for (const p of this.players) {
        if (p.dead || !p.beamOn) continue;
        C.setPosition((p.x + p.facing * 8 - vx) * z, (p.y - 10 - vy) * z);
        C.setRotation(p.beamAim);
        const sc = ((PHYS.beamRange + 50) * z) / 320;
        C.setScale(sc);
        rt.erase(C);
      }
    }
  }

  // Bake the World-3 texture set ONCE, lazily, the first time a W3 level loads.
  // Mirrors BootScene's `make` pattern (all drawn, Canvas-safe, no tint states);
  // the shipped W1/W2 boot path never reaches this.
  ensureW3Textures() {
    // W3W4 L33: the storm set carries its OWN guard — a 3-1 -> 3-3 session has
    // crate3 baked already (the early-return below) but still needs scrap art.
    this.ensureStormTextures();
    if (this.textures.exists("crate3")) return;
    const make = (key, w, h, draw) => {
      const g = this.make.graphics({ add: false });
      draw(g, w, h);
      g.generateTexture(key, w, h);
      g.destroy();
    };
    const shade = (hex, f) => {
      const c = Phaser.Display.Color.IntegerToColor(hex);
      const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
      return Phaser.Display.Color.GetColor(cl(c.red * f), cl(c.green * f), cl(c.blue * f));
    };

    // steel rail tile ('='): a powered I-beam ceiling run — dark web, riveted
    // flanges, amber underside pole strip (the magnet-cling face).
    make("railtile", 48, 48, (g) => {
      g.fillStyle(0x131a2c).fillRect(0, 0, 48, 48);
      g.fillStyle(0x2a3350).fillRect(0, 0, 48, 8);   // top flange
      g.fillStyle(0x2a3350).fillRect(0, 40, 48, 8);  // bottom flange
      g.fillStyle(0x1c2742).fillRect(18, 8, 12, 32); // web
      g.lineStyle(1, 0x39415e, 0.9);
      g.strokeRect(0.5, 0.5, 47, 7);
      g.strokeRect(0.5, 40.5, 47, 7);
      g.fillStyle(0x5a6aa0);
      [8, 24, 40].forEach((x) => { g.fillCircle(x, 4, 1.6); g.fillCircle(x, 44, 1.6); });
      // amber polarity strip on the underside (the "cling here" face). The glow
      // bands span the FULL width (constant along x) so a horizontal run tiles
      // seamlessly; only the bright core + studs sit inside the flange margins.
      g.fillStyle(0xffb347, 0.1).fillRect(0, 41, 48, 7); // soft cling underglow
      g.fillStyle(0xffb347, 0.22).fillRect(0, 44, 48, 4); // inner glow
      g.fillStyle(0xffb347, 0.9).fillRect(0, 45, 48, 2); // hot polarity line
      g.fillStyle(0xffe0a8, 0.95);
      for (let x = 6; x < 48; x += 12) g.fillRect(x, 44.4, 3, 1.2);
    });
    // metal crate: plated box with an X cross-brace + magnet-dot corners.
    make("crate3", 46, 46, (g) => {
      g.fillStyle(0x39415e).fillRoundedRect(1, 1, 44, 44, 5);
      g.lineStyle(2, 0x6b78a8).strokeRoundedRect(1, 1, 44, 44, 5);
      g.fillStyle(0x2a3350).fillRect(5, 5, 36, 36);
      g.lineStyle(3, 0x4a5578);
      g.lineBetween(6, 6, 40, 40);
      g.lineBetween(40, 6, 6, 40);
      // amber magnet-dot corners with a soft cling glow
      [[8, 8], [38, 8], [8, 38], [38, 38]].forEach(([x, y]) => {
        g.fillStyle(0xffb347, 0.16).fillCircle(x, y, 5.5);
        g.fillStyle(0xffb347, 0.95).fillCircle(x, y, 2.4);
        g.fillStyle(0xffe0a8, 0.9).fillCircle(x - 0.7, y - 0.7, 1);
      });
      g.fillStyle(0x8fa3d9, 0.5).fillRect(5, 5, 36, 3); // top sheen
    });
    // magnetic switch: bracket + horseshoe coil + status lamp (off/on states).
    const magswitch = (on) => (g) => {
      g.fillStyle(0x1c2742).fillRoundedRect(4, 28, 28, 12, 4);
      g.lineStyle(1.5, 0x44548c).strokeRoundedRect(4, 28, 28, 12, 4);
      // horseshoe magnet (open end up)
      const body = on ? 0xffb347 : 0x8a6a3a;
      g.lineStyle(7, body);
      g.beginPath();
      g.arc(18, 18, 9, Math.PI, Math.PI * 2, false);
      g.strokePath();
      g.lineBetween(9.5, 18, 9.5, 26);
      g.lineBetween(26.5, 18, 26.5, 26);
      g.fillStyle(0xeaf2ff, 0.95);
      g.fillRect(6.5, 22, 6, 4); g.fillRect(23.5, 22, 6, 4); // pole shoes
      if (on) { // energised: amber field glow around the coil
        g.fillStyle(0xffb347, 0.14).fillCircle(18, 18, 15);
      }
      // status lamp with a haloed glow (green=on / red=off)
      const lampC = on ? 0x59ff9c : 0xff5566;
      g.fillStyle(lampC, on ? 0.3 : 0.18).fillCircle(18, 34, 6.5);
      g.fillStyle(lampC, on ? 1 : 0.9).fillCircle(18, 34, 3.4);
      g.fillStyle(0xffffff, 0.85).fillCircle(17, 33, 1.1);
      if (on) { // energised arcs, each with a soft glow underlay
        g.lineStyle(3.5, 0xffe0a8, 0.22);
        g.lineBetween(12, 12, 8, 6); g.lineBetween(18, 8, 18, 3); g.lineBetween(24, 12, 28, 6);
        g.lineStyle(1.5, 0xfff2cf, 0.95);
        g.lineBetween(12, 12, 8, 6); g.lineBetween(18, 8, 18, 3); g.lineBetween(24, 12, 28, 6);
      }
    };
    make("magswitch", 36, 44, magswitch(false));
    make("magswitch_on", 36, 44, magswitch(true));
    // vent updraft grille — the 2-2 fan family drawn in W3 amber.
    make("vent3", 48, 22, (g) => {
      g.fillStyle(0x2a3350).fillRect(0, 10, 48, 12);
      g.lineStyle(6, 0xffb347, 0.12).strokeRect(1, 11, 46, 10); // grille halo
      g.lineStyle(2, 0xffb347, 0.95).strokeRect(1, 11, 46, 10);
      g.fillStyle(0xffb347, 0.18).fillTriangle(24, -3, 12, 13, 36, 13); // updraft bloom
      g.fillStyle(0xffb347, 0.95).fillTriangle(24, 0, 16, 12, 32, 12);
      g.fillStyle(0xffe9c0, 0.9).fillTriangle(24, 3, 20, 11, 28, 11); // hot core
    });
    // bubble shell: translucency baked in (Canvas-safe); ADD blend on WebGL.
    make("bubbleshell", 76, 76, (g) => {
      for (let r = 34; r > 26; r--) {
        g.fillStyle(0x9fe0ff, 0.05 * (1 - (34 - r) / 8) + 0.03);
        g.fillCircle(38, 38, r);
      }
      g.fillStyle(0xbfeaff, 0.1).fillCircle(38, 38, 30);
      g.lineStyle(4, 0xcdeeff, 0.12).strokeCircle(38, 38, 33); // outer rim glow
      g.lineStyle(2.5, 0xcdeeff, 0.75).strokeCircle(38, 38, 33);
      g.lineStyle(1.5, 0x9fe0ff, 0.5).strokeCircle(38, 38, 30); // inner glass wall
      // twin glint arcs (a fuller glass read) + specular dabs
      g.lineStyle(2, 0xffffff, 0.85);
      g.beginPath(); g.arc(38, 38, 27, Math.PI * 1.12, Math.PI * 1.58); g.strokePath();
      g.lineStyle(1.2, 0xffffff, 0.5);
      g.beginPath(); g.arc(38, 38, 22, Math.PI * 0.15, Math.PI * 0.4); g.strokePath();
      g.fillStyle(0xffffff, 0.9).fillCircle(27, 26, 2.4);
      g.fillStyle(0xffffff, 0.5).fillCircle(50, 30, 1.4);
    });
    // zap-jelly: a friendly electric dome (base / happy socketed face) + glow.
    const jelly = (happy) => (g) => {
      const dome = happy ? 0x59d0a0 : 0x66c9e8;
      const glow = happy ? 0x8fe8c4 : 0x9fe0ff;
      // inner-glow translucent dome: outer bloom -> body -> concentric inner glow
      // steps (fakeRadial trick) so it reads as a lit jelly (skirt anchor at y≈10).
      g.fillStyle(dome, 0.14).fillEllipse(20, 14, 42, 30); // outer bloom
      g.fillStyle(dome, 0.9).fillEllipse(20, 14, 36, 24);  // body
      for (let i = 0; i < 3; i++) {
        g.fillStyle(glow, 0.1 + i * 0.06);
        g.fillEllipse(20, 15 + i, 26 - i * 6, 16 - i * 4); // inner core glow
      }
      g.fillStyle(glow, 0.6).fillEllipse(15, 10, 12, 6);   // top sheen
      g.fillStyle(0xffffff, 0.85).fillEllipse(14, 9, 5, 2.4); // hot glass pip
      g.lineStyle(2, happy ? 0x2f8f5c : 0x3a8fb0).strokeEllipse(20, 14, 36, 24);
      g.fillStyle(0x0c1622);
      if (happy) { // ^ ^ closed happy eyes
        g.lineStyle(2, 0x0c1622);
        g.beginPath(); g.arc(13, 14, 3, Math.PI, Math.PI * 2); g.strokePath();
        g.beginPath(); g.arc(27, 14, 3, Math.PI, Math.PI * 2); g.strokePath();
      } else {
        g.fillCircle(13, 14, 2.6); g.fillCircle(27, 14, 2.6);
        g.fillStyle(0xffffff, 0.9).fillCircle(12.2, 13.2, 0.9).fillCircle(26.2, 13.2, 0.9);
      }
      // electric fringe under the skirt
      g.lineStyle(2, happy ? 0x8fe8c4 : 0xffe066, happy ? 0.5 : 0.9);
      for (let x = 6; x <= 34; x += 7) g.lineBetween(x, 25, x + 3, 30);
    };
    make("jelly", 40, 34, jelly(false));
    make("jelly_happy", 40, 34, jelly(true));
    make("jelly_glow", 48, 40, (g) => {
      for (let r = 20; r > 0; r -= 2) {
        g.fillStyle(0xffe066, 0.05 * (1 - r / 20));
        g.fillEllipse(24, 20, r * 2.2, r * 1.8);
      }
    });
    // jelly tentacle (anim rig part): a soft dangling ribbon.
    make("jelly_tent", 6, 16, (g) => {
      g.fillStyle(0x4aa8c8, 0.9).fillRoundedRect(1.5, 0, 3, 14, 1.5);
      g.fillStyle(0x9fe0ff, 0.9).fillCircle(3, 14, 2);
    });
    // jelly socket: a powered cradle (off/on states).
    const socket = (on) => (g) => {
      g.fillStyle(0x1c2742).fillRect(14, 30, 16, 12); // stem
      g.fillStyle(0x2a3350).fillRoundedRect(4, 34, 36, 8, 3);
      if (on) { // powered cradle glow behind the ring
        g.lineStyle(7, 0x59ff9c, 0.12);
        g.beginPath(); g.arc(22, 20, 15, Math.PI * 0.9, Math.PI * 2.1); g.strokePath();
      }
      g.lineStyle(3, on ? 0x59ff9c : 0x44548c);
      g.beginPath(); g.arc(22, 20, 15, Math.PI * 0.9, Math.PI * 2.1); g.strokePath(); // cradle ring
      g.fillStyle(on ? 0x59ff9c : 0x39415e);
      if (on) { g.fillStyle(0x59ff9c, 0.25).fillCircle(7.5, 22, 6).fillCircle(36.5, 22, 6); g.fillStyle(0x59ff9c); }
      g.fillCircle(7.5, 22, 3); g.fillCircle(36.5, 22, 3); // contact studs
      if (on) {
        g.lineStyle(3, 0xd6ffe6, 0.22);
        g.lineBetween(10, 12, 6, 6); g.lineBetween(34, 12, 38, 6);
        g.lineStyle(1.5, 0xeafff2, 0.95);
        g.lineBetween(10, 12, 6, 6); g.lineBetween(34, 12, 38, 6);
      } else {
        g.fillStyle(0xffe066, 0.5).fillCircle(22, 6, 2); // "feed me" pilot dot
      }
    };
    make("socket", 44, 42, socket(false));
    make("socket_on", 44, 42, socket(true));
    // junk-chomper: a magnetic mouth on treads (base / alert / defanged dozer).
    const chomper = (mode) => (g) => {
      const bodyCol = mode === "alert" ? 0xa8402e : 0x6a4a3a;
      const edgeCol = mode === "alert" ? 0xff6a52 : 0x9a6a4a;
      const loCol = mode === "alert" ? 0x6f2419 : 0x452f24;
      const hiCol = mode === "alert" ? 0xc85643 : 0x8a6449;
      // treads
      g.fillStyle(0x14100c).fillRect(4, 30, 48, 8);
      g.fillStyle(0x2a2018);
      [10, 20, 30, 40, 46].forEach((x) => g.fillCircle(x, 34, 3.2));
      // body / snout — soft 4-tone shading (base + under-shade + top-light + rim)
      g.fillStyle(bodyCol).fillRoundedRect(2, 6, 52, 26, 8);
      g.fillStyle(loCol, 0.5).fillRoundedRect(2, 21, 52, 11, { tl: 0, tr: 0, bl: 8, br: 8 }); // under-shade
      g.fillStyle(hiCol, 0.4).fillRoundedRect(4, 7, 48, 8, { tl: 7, tr: 7, bl: 0, br: 0 }); // top-light
      g.lineStyle(2, edgeCol).strokeRoundedRect(2, 6, 52, 26, 8);
      // single greedy glass eye with a soft glow + catchlight
      g.fillStyle(edgeCol, 0.18).fillCircle(16, 13, 7.5);
      g.fillStyle(0xf2eefc).fillCircle(16, 13, 5.5);
      g.fillStyle(0x0c1622).fillCircle(mode === "dozer" ? 15 : 18, 13, 2.4);
      g.fillStyle(0xffffff, 0.9).fillCircle(14, 11, 1.2);
      if (mode === "dozer") { // relaxed lid
        g.lineStyle(2, edgeCol).lineBetween(10, 10, 22, 10);
      }
      // mouth slot (back-corner anchor -20,+6 -> tex 8,25)
      g.fillStyle(0x120a08).fillRect(8, 20, 44, 10);
      if (mode === "dozer") {
        // toothless happy grin
        g.lineStyle(2, 0xffd9a0, 0.9);
        g.beginPath(); g.arc(30, 22, 12, Math.PI * 0.1, Math.PI * 0.9); g.strokePath();
      } else {
        // metal teeth (the magnet-yank target)
        g.fillStyle(0xdfe8ff);
        for (let x = 12; x < 50; x += 9) g.fillTriangle(x, 20, x + 6, 20, x + 3, 27);
        g.fillStyle(0xaebadf);
        for (let x = 15; x < 50; x += 9) g.fillTriangle(x, 30, x + 6, 30, x + 3, 24);
      }
      if (mode === "alert") { // angry brow
        g.lineStyle(2.5, 0x7c2a20).lineBetween(9, 6, 22, 9);
      }
    };
    make("chomper", 56, 38, chomper("base"));
    make("chomper_alert", 56, 38, chomper("alert"));
    make("chomper_dozer", 56, 38, chomper("dozer"));
    // yanked tooth (defang scatter) + jaw overlay (anim rig part).
    make("tooth", 10, 12, (g) => {
      g.fillStyle(0xdfe8ff).fillTriangle(1, 1, 9, 1, 5, 11);
      g.fillStyle(0xaebadf).fillTriangle(3, 2, 7, 2, 5, 8);
      g.fillStyle(0xffffff, 0.9).fillRect(3.4, 2, 1.4, 4); // steel glint
    });
    make("chomper_jaw", 48, 12, (g) => {
      g.fillStyle(0x5a3e30).fillRoundedRect(0, 2, 48, 9, 3);
      g.lineStyle(1.5, 0x8a5f48).strokeRoundedRect(0, 2, 48, 9, 3);
      g.fillStyle(0xdfe8ff);
      for (let x = 4; x < 44; x += 9) g.fillTriangle(x, 3, x + 6, 3, x + 3, -2 + 3);
    });
    // skill icons (badges + pedestal floaters + item cards).
    make("icon_magnet", 26, 26, (g) => {
      const C = 0xff9e3d;
      iconChip(g, C);
      iconGlow(g, 13, 13, 8, C, 0.2);
      // horseshoe magnet — glow pass then bright U, silver pole tips, arc sparks
      g.lineStyle(7, C, 0.24);
      g.beginPath(); g.arc(13, 12, 6.5, Math.PI, Math.PI * 2, false); g.strokePath();
      g.lineStyle(6, C, 1);
      g.beginPath(); g.arc(13, 12, 6.5, Math.PI, Math.PI * 2, false); g.strokePath();
      g.lineBetween(6.5, 12, 6.5, 18.5);
      g.lineBetween(19.5, 12, 19.5, 18.5);
      g.fillStyle(0xeaf2ff).fillRect(4, 16.5, 5, 4).fillRect(17, 16.5, 5, 4);
      g.lineStyle(1.5, 0xffe0a8, 0.95);
      g.lineBetween(8, 23.5, 10, 21.5); g.lineBetween(13, 24, 13, 21.5); g.lineBetween(18, 23.5, 16, 21.5);
    });
    make("icon_bubble", 26, 26, (g) => {
      const C = 0x7ee0ff;
      iconChip(g, C);
      // shielding bubble — soft outer glow, translucent body, bright rim + catchlight
      g.fillStyle(C, 0.14).fillCircle(13, 13, 11);
      g.fillStyle(C, 0.2).fillCircle(13, 13, 9.5);
      g.lineStyle(2.5, C, 1).strokeCircle(13, 13, 9.5);
      g.lineStyle(1.5, 0xffffff, 0.9);
      g.beginPath(); g.arc(13, 13, 6.5, Math.PI * 1.1, Math.PI * 1.5); g.strokePath();
      g.fillStyle(0xffffff, 0.95).fillCircle(9, 8.5, 1.6);
    });
    // W3 backdrop identity: foundry/scrapyard silhouette strip (crane rails,
    // hanging scrap hooks + chains, coil stacks) in the amber-orange accent.
    // Deterministic (seeded), matching propStrip1/2 conventions (512x864).
    const seeded = (s) => () => {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    make("propStrip3", 512, 864, (g) => {
      // GFX5 S1: amber desaturated ~18% before darkening to silhouette — prop
      // strip fill kept low in the saturation hierarchy (matches W1/W2 in Boot).
      const tone = shade(desat(0xffb347, 0.18), 0.32); // W3 amber-orange -> silhouette
      const edge = shade(desat(0xffb347, 0.18), 0.5);
      const rnd = seeded(303);
      // overhead crane rail spanning the strip + a trolley block
      const railY = 130;
      g.fillStyle(tone, 1).fillRect(0, railY, 512, 12);
      g.fillStyle(edge, 1).fillRect(0, railY, 512, 3);
      g.fillStyle(edge, 1).fillRect(196, railY + 10, 44, 16); // trolley
      // hanging scrap hooks: chain links down to a hook + a scrap chunk.
      // GFX5 S4: per-rig bake-time variance (seeded scale + x-jitter + mirrored
      // hook curl) so the four scrap rigs don't read as photocopies.
      [60, 240, 340, 470].forEach((x0) => {
        const sc = 0.88 + rnd() * 0.28, fl = rnd() < 0.5, x = x0 + (rnd() - 0.5) * 16;
        const len = railY + 90 + Math.floor(rnd() * 130);
        g.lineStyle(4 * sc, tone, 1);
        for (let cy = railY + 12; cy < len; cy += 14) g.strokeCircle(x, cy + 6, 5 * sc); // chain links
        g.lineStyle(6 * sc, edge, 1);
        g.beginPath();
        if (fl) g.arc(x, len + 16, 10 * sc, Math.PI * 0.05, Math.PI * 0.9, true);
        else g.arc(x, len + 16, 10 * sc, Math.PI * 0.1, Math.PI * 0.95, false);
        g.strokePath(); // hook
        if (rnd() < 0.7) { // scrap chunk snagged on the hook (flipped with the rig)
          const m = fl ? -1 : 1;
          g.fillStyle(tone, 1);
          g.fillTriangle(x - 16 * m, len + 34, x + 14 * m, len + 26, x + 4 * m, len + 52);
          g.fillRect(x - 10, len + 30, 20, 12);
        }
      });
      // polarity coil stacks along the floor band
      [40, 150, 420].forEach((x, i) => {
        const w = 54 + i * 8;
        const topY = 600 + i * 14;
        g.fillStyle(tone, 1).fillRect(x, topY, w, 864 - topY);
        g.fillStyle(edge, 1);
        for (let cy = topY + 8; cy < 864 - 8; cy += 18) g.fillRect(x - 4, cy, w + 8, 6); // coil windings
        g.fillStyle(edge, 1).fillRect(x + w / 2 - 3, topY - 26, 6, 26); // core stub
        g.fillStyle(tone, 1).fillCircle(x + w / 2, topY - 30, 8);
      });
      // scrap heap silhouette between the coils
      g.fillStyle(tone, 1);
      g.fillTriangle(230, 864, 300, 700, 385, 864);
      g.fillTriangle(280, 864, 330, 740, 420, 864);
      g.fillStyle(edge, 1).fillRect(296, 712, 10, 4); // a glinting plate edge
      g.fillStyle(edge, 1).fillCircle(340, 764, 5);
      // a big gantry frame on legs mid-strip
      const beamY = 560;
      g.fillStyle(tone, 1).fillRect(120, beamY, 260, 14);
      g.fillStyle(tone, 1).fillRect(130, beamY, 10, 864 - beamY);
      g.fillStyle(tone, 1).fillRect(360, beamY, 10, 864 - beamY);
      g.fillStyle(edge, 1);
      // GFX5 S4: per-tine width + x-jitter so the gantry tines aren't a comb copy.
      for (let x = 145; x < 360; x += 30) g.fillRect(x + (rnd() - 0.5) * 8, beamY + 14, 4 + rnd() * 5, 10 + Math.floor(rnd() * 16));
    });
    // GFX5 S3: W3 FAR + NEAR parallax bands + drifting-atmo wisp band. WebGL-gated
    // bake (R1, lightCone precedent) — Canvas never creates them. Recipes single-
    // sourced in paint.js so W3 stays identical to the W1/W2 Boot bakes.
    if (isWebGL(this)) {
      make("propfar3", 512, 864, (g) => farStrip(g, 3));
      make("propnear3", 512, 864, (g) => nearStrip(g, 3));
      make("atmo3", 256, 140, (g) => atmoBand(g, 3));
    }
    // GFX5 S4: W3 landmark set-pieces (both tiers — textures only). Placement
    // decides the ship tier (GameScene.placeLandmarks).
    LANDMARK_SIZES[3].forEach(([lw, lh], i) => {
      make(`lm3${i ? "b" : "a"}`, lw, lh, (g) => landmark(g, 3, i, lw, lh));
    });
  }

  // W3W4 L33: the SCRAP STORM texture set (3-3 only), baked lazily with its own
  // guard. Same conventions as ensureW3Textures: all DRAWN, Canvas-safe, state
  // changes are texture swaps (never tint).
  ensureStormTextures() {
    if (this.textures.exists("scrap1")) return;
    const make = (key, w, h, draw) => {
      const g = this.make.graphics({ add: false });
      draw(g, w, h);
      g.generateTexture(key, w, h);
      g.destroy();
    };
    // three flying-scrap chunk variants: jagged plate / gear / pipe elbow —
    // all with a hot magenta polarity fringe (the "this bites" read).
    make("scrap1", 34, 26, (g) => {
      g.fillStyle(0x39415e).fillTriangle(2, 6, 30, 2, 24, 22);
      g.fillStyle(0x2a3350).fillTriangle(8, 10, 26, 6, 20, 18);
      g.lineStyle(4, 0xff4dd2, 0.18); // polarity fringe glow
      g.lineBetween(2, 6, 30, 2); g.lineBetween(24, 22, 2, 6);
      g.lineStyle(2, 0xff4dd2, 0.95);
      g.lineBetween(2, 6, 30, 2); g.lineBetween(24, 22, 2, 6);
      g.fillStyle(0x8fa3d9, 0.8).fillRect(12, 8, 6, 3); // glint
    });
    make("scrap2", 30, 30, (g) => {
      g.fillStyle(0x39415e).fillCircle(15, 15, 11);
      g.fillStyle(0x121a30).fillCircle(15, 15, 4.5);
      g.fillStyle(0x39415e);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.fillRect(15 + Math.cos(a) * 12 - 2.5, 15 + Math.sin(a) * 12 - 2.5, 5, 5);
      }
      g.lineStyle(4, 0xff4dd2, 0.18).strokeCircle(15, 15, 11.5); // polarity fringe glow
      g.lineStyle(2, 0xff4dd2, 0.95).strokeCircle(15, 15, 11.5);
    });
    make("scrap3", 32, 24, (g) => {
      g.fillStyle(0x2f4066).fillRoundedRect(2, 8, 22, 10, 4);
      g.fillStyle(0x2f4066).fillRoundedRect(16, 2, 10, 16, 4);
      g.lineStyle(4, 0xff4dd2, 0.18).strokeRoundedRect(2, 8, 22, 10, 4); // fringe glow
      g.lineStyle(2, 0xff4dd2, 0.95).strokeRoundedRect(2, 8, 22, 10, 4);
      g.fillStyle(0x121a30).fillCircle(7, 13, 2.6).fillCircle(21, 6, 2.6);
      g.fillStyle(0x8fa3d9, 0.7).fillRect(5, 9, 10, 2);
    });
    // the caught-scrap SHIELD: a tall riveted plate wrapped in the magnet's
    // amber field — big enough to read as "hide behind me".
    make("scrapshield", 46, 60, (g) => {
      for (let r = 0; r < 4; r++) {
        g.fillStyle(0xffb347, 0.05).fillRoundedRect(r, r + 4, 46 - r * 2, 52 - r * 2, 10);
      }
      g.fillStyle(0x39415e).fillRoundedRect(6, 8, 34, 44, 7);
      g.lineStyle(2.5, 0xffb347, 0.95).strokeRoundedRect(6, 8, 34, 44, 7);
      g.fillStyle(0x2a3350).fillRect(10, 12, 26, 36);
      g.lineStyle(3, 0x4a5578);
      g.lineBetween(11, 13, 35, 47); g.lineBetween(35, 13, 11, 47);
      g.fillStyle(0xffe0a8, 0.95);
      [[10, 12], [36, 12], [10, 48], [36, 48]].forEach(([x, y]) => g.fillCircle(x, y, 2.2));
      g.fillStyle(0x8fa3d9, 0.5).fillRect(10, 12, 26, 3);
    });
    // FUSE-CORE: a chunky amber energy cell with cyan poles (the ferry cargo).
    make("fusecore_item", 24, 30, (g) => {
      g.fillStyle(0x1c2742).fillRoundedRect(4, 2, 16, 26, 4);
      g.lineStyle(4, 0x7ee0ff, 0.14).strokeRoundedRect(4, 2, 16, 26, 4); // cyan pole halo
      g.lineStyle(2, 0x7ee0ff, 0.95).strokeRoundedRect(4, 2, 16, 26, 4);
      g.fillStyle(0xffd24d, 0.22).fillRoundedRect(5, 5, 14, 20, 4); // amber cell glow
      g.fillStyle(0xffd24d).fillRoundedRect(7, 7, 10, 16, 3);
      g.fillStyle(0xfff6c2, 0.95).fillRect(9, 9, 3, 12); // hot filament
      g.fillStyle(0x7ee0ff).fillRect(9, 0, 6, 3).fillRect(9, 27, 6, 3); // poles
      g.fillStyle(0xffffff, 0.9).fillCircle(9, 8, 1.2);
    });
    // fuse socket: an empty cradle with waiting contacts (off) -> seated core
    // glowing between lit contacts (on). Texture-swap states, Canvas-safe.
    const fusesock = (on) => (g) => {
      g.fillStyle(0x1c2742).fillRect(16, 32, 12, 10); // stem
      g.fillStyle(0x2a3350).fillRoundedRect(4, 36, 36, 8, 3);
      if (on) { // seated-core energy bloom behind the cradle
        g.lineStyle(7, 0xffd24d, 0.12);
        g.beginPath(); g.arc(22, 22, 14, Math.PI * 0.85, Math.PI * 2.15); g.strokePath();
      }
      g.lineStyle(3, on ? 0xffd24d : 0x44548c);
      g.beginPath(); g.arc(22, 22, 14, Math.PI * 0.85, Math.PI * 2.15); g.strokePath();
      g.fillStyle(on ? 0xffd24d : 0x39415e);
      g.fillCircle(8.5, 26, 3); g.fillCircle(35.5, 26, 3); // contact studs
      if (on) {
        g.fillStyle(0xffd24d, 0.28).fillRoundedRect(14, 9, 16, 22, 4); // core halo
        g.fillStyle(0xffd24d).fillRoundedRect(17, 12, 10, 16, 3); // the seated core
        g.fillStyle(0xfff6c2, 0.95).fillRect(19, 14, 3, 12);
        g.lineStyle(3, 0xfff6c2, 0.22);
        g.lineBetween(12, 8, 8, 3); g.lineBetween(32, 8, 36, 3);
        g.lineStyle(1.5, 0xfff6c2, 0.95);
        g.lineBetween(12, 8, 8, 3); g.lineBetween(32, 8, 36, 3);
      } else {
        g.fillStyle(0xffd24d, 0.5).fillCircle(22, 6, 2); // "feed me" pilot dot
      }
    };
    make("fusesock", 44, 44, fusesock(false));
    make("fusesock_on", 44, 44, fusesock(true));
    // storm lane emitter (the upwind telegraph): a polarity nozzle, live/dark.
    const stormvent = (on) => (g) => {
      g.fillStyle(0x2a3350).fillRoundedRect(0, 6, 14, 24, 3);
      g.lineStyle(2, on ? 0xff4dd2 : 0x44548c).strokeRoundedRect(0, 6, 14, 24, 3);
      if (on) g.fillStyle(0xff4dd2, 0.16).fillTriangle(14, 4, 30, 18, 14, 32); // muzzle bloom
      g.fillStyle(on ? 0xff4dd2 : 0x39415e);
      g.fillTriangle(14, 8, 26, 18, 14, 28);
      if (on) {
        g.lineStyle(3, 0xffb9ec, 0.22);
        g.lineBetween(16, 12, 22, 8); g.lineBetween(18, 18, 26, 18); g.lineBetween(16, 24, 22, 28);
        g.lineStyle(1.5, 0xffcff0, 0.95);
        g.lineBetween(16, 12, 22, 8); g.lineBetween(18, 18, 26, 18); g.lineBetween(16, 24, 22, 28);
      }
    };
    make("stormvent", 28, 36, stormvent(true));
    make("stormvent_off", 28, 36, stormvent(false));
    // downwind chevron (lane direction cue)
    make("stormchev", 14, 18, (g) => {
      g.lineStyle(6, 0xff4dd2, 0.14); // direction-cue glow (chevron meaning kept)
      g.beginPath(); g.moveTo(2, 2); g.lineTo(11, 9); g.lineTo(2, 16); g.strokePath();
      g.lineStyle(3, 0xff4dd2, 0.95);
      g.beginPath(); g.moveTo(2, 2); g.lineTo(11, 9); g.lineTo(2, 16); g.strokePath();
    });
  }

  // W3W4 M4: bake the World-4 texture set ONCE, lazily, the first time a W4
  // level loads (shipped boot path bakes nothing new). Same conventions as
  // ensureW3Textures: all DRAWN, Canvas-safe, translucency baked into the art,
  // state changes are texture swaps (never tint).
  ensureW4Textures() {
    if (this.textures.exists("gloomy")) return;
    const make = (key, w, h, draw) => {
      const g = this.make.graphics({ add: false });
      draw(g, w, h);
      g.generateTexture(key, w, h);
      g.destroy();
    };
    const shade = (hex, f) => {
      const c = Phaser.Display.Color.IntegerToColor(hex);
      const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
      return Phaser.Display.Color.GetColor(cl(c.red * f), cl(c.green * f), cl(c.blue * f));
    };

    // darkness stamp: a plain black square (the RT scales it over each zone)
    make("darkpx", 4, 4, (g) => g.fillStyle(0x000000, 1).fillRect(0, 0, 4, 4));
    // glow-radius ERASE stamp: radial white->transparent (stacked rings bake the
    // gradient; the RT erase consumes the alpha as hole depth)
    make("glowmask", 256, 256, (g) => {
      for (let r = 126; r > 4; r -= 3) {
        g.fillStyle(0xffffff, 0.07);
        g.fillCircle(128, 128, r);
      }
    });
    // beam-cone ERASE stamp: apex-left wedge fading along its length
    make("conemask", 320, 260, (g) => {
      const cy = 130, N = 16;
      for (let i = 0; i < N; i++) {
        const x0 = 4 + (i / N) * 312, x1 = 4 + ((i + 1) / N) * 312;
        const h0 = Math.min(124, x0 * 0.45) + 5, h1 = Math.min(124, x1 * 0.45) + 5;
        g.fillStyle(0xffffff, 0.9 * (1 - (i / N) * 0.8));
        g.fillPoints([
          { x: x0, y: cy - h0 }, { x: x1, y: cy - h1 },
          { x: x1, y: cy + h1 }, { x: x0, y: cy + h0 },
        ], true);
      }
    });
    // the VISIBLE beam cone: warm light wedge, translucency baked (Canvas-safe;
    // GameScene adds ADD blend on WebGL only)
    make("conelight", 320, 260, (g) => {
      const cy = 130, N = 14;
      for (let i = 0; i < N; i++) {
        const x0 = 2 + (i / N) * 310, x1 = 2 + ((i + 1) / N) * 310;
        const h0 = Math.min(120, x0 * 0.44) + 3, h1 = Math.min(120, x1 * 0.44) + 3;
        g.fillStyle(0xffe8b0, 0.2 * (1 - (i / N) * 0.85) + 0.015);
        g.fillPoints([
          { x: x0, y: cy - h0 }, { x: x1, y: cy - h1 },
          { x: x1, y: cy + h1 }, { x: x0, y: cy + h0 },
        ], true);
      }
      // bright core streak down the middle
      g.fillStyle(0xfff6d8, 0.16).fillRect(2, cy - 4, 250, 8);
    });
    // invisible platform ('ghost' ent): a holographic circuit plate — the art
    // exists at full detail; VISIBILITY is what the beam drives (alpha).
    make("ghosttile", 48, 48, (g) => {
      g.fillStyle(0x2a2058, 0.85).fillRect(0, 0, 48, 48);
      g.lineStyle(2, 0x8f7bff, 0.95).strokeRect(1, 1, 46, 46);
      // holo circuit trace with a cyan glow underlay + node halos
      g.lineStyle(3.5, 0x35f0ff, 0.16);
      g.lineBetween(6, 14, 26, 14); g.lineBetween(26, 14, 26, 34); g.lineBetween(26, 34, 42, 34);
      g.lineStyle(1, 0x35f0ff, 0.85);
      g.lineBetween(6, 14, 26, 14); g.lineBetween(26, 14, 26, 34); g.lineBetween(26, 34, 42, 34);
      g.fillStyle(0x35f0ff, 0.2).fillCircle(6, 14, 4).fillCircle(42, 34, 4); // node halos
      g.fillStyle(0x35f0ff, 0.95).fillCircle(6, 14, 1.8).fillCircle(42, 34, 1.8);
      g.fillStyle(0x8f7bff, 0.6).fillRect(0, 0, 48, 3); // top seam
    });
    // rotating bridge: hub (spoked drum) + plated segment
    make("rothub", 30, 30, (g) => {
      g.fillStyle(0x1c2742).fillCircle(15, 15, 13);
      g.lineStyle(4, 0x8f7bff, 0.14).strokeCircle(15, 15, 13); // violet rim glow
      g.lineStyle(2, 0x8f7bff, 0.95).strokeCircle(15, 15, 13);
      g.lineStyle(2, 0x39415e);
      g.lineBetween(15, 4, 15, 26); g.lineBetween(4, 15, 26, 15);
      g.fillStyle(0x35f0ff, 0.22).fillCircle(15, 15, 6); // hub core glow
      g.fillStyle(0x35f0ff, 0.95).fillCircle(15, 15, 3);
    });
    make("rotseg", 26, 14, (g) => {
      g.fillStyle(0x39415e).fillRoundedRect(0, 1, 26, 12, 3);
      g.lineStyle(1.5, 0x6b78a8).strokeRoundedRect(0, 1, 26, 12, 3);
      g.fillStyle(0x8f7bff, 0.2).fillRect(1, 1, 24, 4); // neon face glow
      g.fillStyle(0x8f7bff, 0.85).fillRect(2, 2, 22, 2); // neon walking face
      g.fillStyle(0x121a30).fillCircle(6, 8, 1.6).fillCircle(20, 8, 1.6);
    });
    // laser emitter: a squat turret with a hot lens
    make("laseremit", 30, 30, (g) => {
      g.fillStyle(0x1c2742).fillCircle(15, 15, 12);
      g.lineStyle(2, 0x39415e).strokeCircle(15, 15, 12);
      g.fillStyle(0x2a3350).fillRect(15, 11, 14, 8); // barrel (points +x; image rotates)
      g.lineStyle(1.5, 0xff5566, 0.9).strokeRect(15, 11, 14, 8);
      // hot lens: red bloom → hot core → white-hot pinpoint
      g.fillStyle(0xff5566, 0.28).fillCircle(15, 15, 9);
      g.fillStyle(0xff5566, 0.5).fillCircle(15, 15, 6.5);
      g.fillStyle(0xff5566).fillCircle(15, 15, 4.5);
      g.fillStyle(0xffd9de, 0.95).fillCircle(15, 15, 2.2);
      g.fillStyle(0xffffff, 0.9).fillCircle(15, 15, 1); // white-hot pinpoint
    });
    // ice door tile: glacial block with cracks + sheen (alpha carries the melt)
    make("icetile", 42, 48, (g) => {
      g.fillStyle(0x9fd8ff, 0.5).fillRect(0, 0, 42, 48);
      // cool inner glow: soft blue-white bloom centred so tile EDGES stay uniform
      // (constant along the borders) — vertical stacks tile with no bright seam.
      g.fillStyle(0xd8f2ff, 0.1).fillEllipse(21, 24, 30, 34);
      g.fillStyle(0xeaf9ff, 0.12).fillEllipse(21, 24, 18, 22);
      g.fillStyle(0xd8f2ff, 0.55).fillRect(2, 2, 38, 10);
      g.lineStyle(2, 0xcdeeff, 0.9).strokeRect(1, 1, 40, 46);
      g.lineStyle(1.5, 0xeaf9ff, 0.7);
      g.lineBetween(8, 6, 16, 20); g.lineBetween(16, 20, 12, 34);
      g.lineBetween(28, 12, 24, 26); g.lineBetween(24, 26, 32, 40);
      g.fillStyle(0xffffff, 0.8).fillCircle(9, 9, 1.8).fillCircle(31, 30, 1.5);
    });
    // frost overlay panel stamped on frozen devices (translucency baked)
    make("icepanel", 48, 48, (g) => {
      g.fillStyle(0x9fd8ff, 0.22).fillRoundedRect(0, 0, 48, 48, 9);
      g.lineStyle(4, 0xcdeeff, 0.1).strokeRoundedRect(1, 1, 46, 46, 9); // cool frost glow rim
      g.lineStyle(2, 0xcdeeff, 0.6).strokeRoundedRect(1, 1, 46, 46, 9);
      // frost ferns in the corners
      g.lineStyle(1.5, 0xe8f6ff, 0.6);
      g.lineBetween(6, 12, 14, 6); g.lineBetween(8, 9, 12, 11);
      g.lineBetween(42, 36, 34, 42); g.lineBetween(40, 39, 36, 37);
      g.fillStyle(0xffffff, 0.18).fillCircle(24, 24, 6); // centre frost bloom
      g.fillStyle(0xffffff, 0.75).fillCircle(24, 24, 1.6);
    });
    // GLOOMY: a shadow blob — near-black violet dome, two moon eyes; the scared
    // face goes wide-eyed with a stretched wail mouth (texture swap, Canvas-safe)
    const gloomy = (scared) => (g) => {
      // soft shadow gradient seep: concentric dark ellipses fading outward (skirt y≈11)
      for (let i = 0; i < 4; i++) g.fillStyle(0x0d0a1e, 0.1 + i * 0.04).fillEllipse(18, 25, 32 - i * 5, 11 - i * 2);
      g.fillStyle(0x191233, 0.96).fillEllipse(18, 15, 32, 24); // body
      g.fillStyle(0x0d0a1e, 0.4).fillEllipse(18, 22, 26, 10);  // lower shadow gradient
      g.fillStyle(0x241a4a, 0.9).fillEllipse(14, 10, 12, 7);   // dim crown sheen
      g.lineStyle(1.5, 0x3a2a6e, 0.9).strokeEllipse(18, 15, 32, 24);
      // wispy skirt tips (wisp mounts x -9/0/9 -> 9,18,27)
      g.fillStyle(0x191233, 0.9);
      for (let x = 6; x <= 30; x += 6) g.fillTriangle(x, 24, x + 4, 24, x + 2, 29);
      if (scared) {
        g.fillStyle(0xcdd8ff, 0.22).fillCircle(12, 13, 5).fillCircle(24, 13, 5); // wide moon glow
        g.fillStyle(0xcdd8ff, 0.95).fillCircle(12, 13, 3.4).fillCircle(24, 13, 3.4);
        g.fillStyle(0x0c0a18).fillCircle(12, 13, 1.4).fillCircle(24, 13, 1.4);
        g.fillStyle(0x0c0a18, 0.9).fillEllipse(18, 20, 5, 7); // wailing mouth
      } else {
        g.fillStyle(0x8fa3d9, 0.2).fillCircle(12, 13, 4).fillCircle(24, 13, 4); // soft moon-eye glow
        g.fillStyle(0x8fa3d9, 0.85).fillCircle(12, 13, 2.2).fillCircle(24, 13, 2.2);
        g.fillStyle(0x0c0a18).fillCircle(12.6, 13.4, 1).fillCircle(24.6, 13.4, 1);
      }
    };
    make("gloomy", 36, 32, gloomy(false));
    make("gloomy_scared", 36, 32, gloomy(true));
    // gloomy wisp (anim rig part): a trailing shadow ribbon
    make("gloom_wisp", 8, 14, (g) => {
      g.fillStyle(0x191233, 0.85).fillRoundedRect(2, 0, 4, 11, 2);
      g.fillStyle(0x3a2a6e, 0.8).fillCircle(4, 12, 2);
    });
    // TICKER: a clockwork patroller — brass body, clock face, wind-up key. The
    // wind pose flushes the face amber (the telegraph; texture swap).
    const ticker = (wind) => (g) => {
      // treads
      g.fillStyle(0x14100c).fillRect(3, 34, 28, 7);
      g.fillStyle(0x2a2018);
      [8, 17, 26].forEach((x) => g.fillCircle(x, 37.5, 2.8));
      // brass body — base + under-shade + top-light + brass shine + crisp rim
      g.fillStyle(0x6e5426).fillRoundedRect(2, 4, 30, 32, 6);
      g.fillStyle(0x4a3818, 0.5).fillRoundedRect(2, 24, 30, 12, { tl: 0, tr: 0, bl: 6, br: 6 }); // under-shade
      g.fillStyle(0xa88a44, 0.45).fillRoundedRect(4, 5, 26, 9, { tl: 5, tr: 5, bl: 0, br: 0 }); // top-light
      g.lineStyle(2, wind ? 0xffb347 : 0x9a7a3a).strokeRoundedRect(2, 4, 30, 32, 6);
      g.fillStyle(0xffe9c0, 0.5).fillRect(6, 7, 10, 2); // brass shine glint
      // clock face (glows amber on wind)
      if (wind) g.fillStyle(0xffb347, 0.2).fillCircle(17, 17, 12);
      g.fillStyle(wind ? 0xffd9a0 : 0xe8e2d0).fillCircle(17, 17, 9);
      g.lineStyle(1.5, 0x3a2c14).strokeCircle(17, 17, 9);
      g.fillStyle(0xffffff, 0.55).fillCircle(14, 14, 1.5); // face glass pip
      g.lineStyle(2, 0x3a2c14);
      g.lineBetween(17, 17, 17, 11);                       // minute hand
      g.lineBetween(17, 17, wind ? 23 : 21, wind ? 15 : 19); // hour hand
      g.fillStyle(0x3a2c14).fillCircle(17, 17, 1.4);
      // little legs of rivets
      g.fillStyle(0xffe0a8, 0.9).fillCircle(6, 8, 1.4).fillCircle(28, 8, 1.4);
      if (wind) { // strained brow + motion ticks
        g.lineStyle(2, 0xff5566, 0.9);
        g.lineBetween(6, 2, 10, 5); g.lineBetween(28, 2, 24, 5);
      }
    };
    make("ticker", 34, 42, ticker(false));
    make("ticker_wind", 34, 42, ticker(true));
    // wind-up key (anim rig part, spins on the back)
    make("ticker_key", 10, 18, (g) => {
      g.fillStyle(0xffd9a0).fillRoundedRect(3.5, 6, 3, 11, 1.5);
      g.lineStyle(2.5, 0xffd9a0);
      g.strokeCircle(3, 3.6, 2.6); g.strokeCircle(7, 3.6, 2.6);
    });
    // skill icons (badges + pedestal floaters + item cards)
    make("icon_freeze", 26, 26, (g) => {
      const C = 0x9fd8ff;
      iconChip(g, C);
      iconGlow(g, 13, 13, 9, C, 0.18);
      // six-armed frost star — a soft glow pass under a crisp lighter star
      const arms = (w, col, a, len) => {
        g.lineStyle(w, col, a);
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          g.lineBetween(13, 13, 13 + Math.cos(ang) * len, 13 + Math.sin(ang) * len);
          g.lineBetween(
            13 + Math.cos(ang) * 6, 13 + Math.sin(ang) * 6,
            13 + Math.cos(ang + 0.5) * 8.6, 13 + Math.sin(ang + 0.5) * 8.6,
          );
        }
      };
      arms(3.5, C, 0.25, 9.5);
      arms(2, 0xd6f0ff, 0.98, 9.5);
      g.fillStyle(0xf0faff, 0.98).fillCircle(13, 13, 2.4);
    });
    make("icon_beam", 26, 26, (g) => {
      const C = 0xffe08a;
      iconChip(g, C);
      // light cone to the upper right (kept inside the chip rim)
      g.fillStyle(C, 0.14).fillTriangle(11, 12, 23, 3, 23, 16);
      g.fillStyle(C, 0.32).fillTriangle(12, 12, 21, 5.5, 21, 14);
      // soft-shaded flashlight body + a hot glowing lens
      softBody(g, { x: 3, y: 11, w: 10, h: 9, r: 2.5, base: 0x4a5578, shadeHi: 0x8892b8 });
      g.fillStyle(C, 1).fillRect(11, 10.5, 3, 11);
      g.fillStyle(0xfff6d8, 1).fillCircle(12.6, 16, 1.8);
    });
    // W4 backdrop identity: near-black datacenter/void — server-rack silhouettes,
    // thin neon seams, a great dark eye-socket arch. Deterministic (seeded),
    // matching propStrip1/2/3 conventions (512x864).
    const seeded = (s) => () => {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    make("propStrip4", 512, 864, (g) => {
      // GFX5 S1: violet + neon-cyan bases desaturated ~18% before darkening — the
      // prop-strip fill (incl. the thin floor seams) sits low in the saturation
      // hierarchy, matching W1/W2/W3. Lit accents on gameplay objects still pop.
      const V = desat(0x8f7bff, 0.18), N = desat(0x35f0ff, 0.18);
      const tone = shade(V, 0.22);  // violet darkened to near-silhouette
      const seam = shade(N, 0.55);  // the thin neon seams
      const rnd = seeded(404);
      // server-rack rows: tall dark cabinets with sparse lit LED dots.
      // GFX5 S4: per-rack seeded width + x-jitter so the cabinets don't read as a
      // photocopied row (kept clear of the x=0/512 wrap edges).
      [30, 120, 330, 430].forEach((x0, i) => {
        const w = 58 + Math.floor(rnd() * 26);
        const x = x0 + (rnd() - 0.5) * 12;
        const topY = 300 + Math.floor(rnd() * 120);
        g.fillStyle(tone, 1).fillRect(x, topY, w, 864 - topY);
        g.fillStyle(shade(V, 0.3), 1).fillRect(x, topY, w, 6); // cap
        // rack unit seams
        g.fillStyle(shade(V, 0.13), 1);
        for (let cy = topY + 18; cy < 850; cy += 26) g.fillRect(x + 4, cy, w - 8, 3);
        // sparse blinking-LED dots (baked lit; sparse = calm)
        for (let cy = topY + 24; cy < 840; cy += 26) {
          if (rnd() < 0.3) {
            g.fillStyle(rnd() < 0.7 ? seam : shade(0xff5566, 0.7), 1);
            g.fillRect(x + 8 + Math.floor(rnd() * (w - 20)), cy, 3, 3);
          }
        }
      });
      // thin neon floor seams running the strip
      g.fillStyle(seam, 1).fillRect(0, 700, 512, 2);
      g.fillStyle(shade(N, 0.3), 1).fillRect(0, 703, 512, 1);
      g.fillStyle(seam, 1).fillRect(0, 820, 512, 2);
      // hanging cable bundles swooping between ceiling points
      g.lineStyle(3, tone, 1);
      const pts = [0, 128, 300, 512];
      for (let i = 0; i < pts.length - 1; i++) {
        const x0 = pts[i], x1 = pts[i + 1];
        const sag = 60 + Math.floor(rnd() * 50);
        let lx = x0, ly = 90;
        for (let k = 1; k <= 8; k++) {
          const t = k / 8;
          const xx = x0 + (x1 - x0) * t;
          const yy = 90 + Math.sin(t * Math.PI) * sag;
          g.lineBetween(lx, ly, xx, yy);
          lx = xx; ly = yy;
        }
      }
      // a vast dark arch mid-strip — the void where the Core waits
      g.lineStyle(6, tone, 1);
      g.beginPath(); g.arc(256, 620, 150, Math.PI, Math.PI * 2); g.strokePath();
      g.lineStyle(2, seam, 0.8);
      g.beginPath(); g.arc(256, 620, 140, Math.PI * 1.15, Math.PI * 1.85); g.strokePath();
      // sparse data-motes drifting in the arch (baked still points)
      for (let i = 0; i < 14; i++) {
        g.fillStyle(seam, 0.5 + rnd() * 0.4);
        g.fillRect(150 + Math.floor(rnd() * 210), 480 + Math.floor(rnd() * 130), 2, 2);
      }
    });
    // GFX5 S3: W4 FAR + NEAR parallax bands + drifting void-wisp atmo band.
    // WebGL-gated bake (R1, lightCone precedent) — Canvas never creates them.
    if (isWebGL(this)) {
      make("propfar4", 512, 864, (g) => farStrip(g, 4));
      make("propnear4", 512, 864, (g) => nearStrip(g, 4));
      make("atmo4", 256, 140, (g) => atmoBand(g, 4));
    }
    // GFX5 S4: W4 landmark set-pieces (both tiers — textures only). Placement
    // decides the ship tier (GameScene.placeLandmarks).
    LANDMARK_SIZES[4].forEach(([lw, lh], i) => {
      make(`lm4${i ? "b" : "a"}`, lw, lh, (g) => landmark(g, 4, i, lw, lh));
    });
  }

  // W3W4 L43: the KOBI-heart finale texture set (4-3 only), baked lazily with
  // its own guard — 4-1/4-2 and the shipped boot path bake nothing new. Same
  // conventions as ensureW3/W4Textures: all DRAWN, Canvas-safe, state changes
  // are texture swaps (never tint).
  ensureHeartTextures() {
    if (this.textures.exists("kobi_housing")) return;
    const make = (key, w, h, draw) => {
      const g = this.make.graphics({ add: false });
      draw(g, w, h);
      g.generateTexture(key, w, h);
      g.destroy();
    };
    // THE EYE HOUSING: armored violet casing around a great white sclera —
    // KOBI's title/hub/crane eye vocabulary at boss scale.
    make("kobi_housing", 150, 128, (g) => {
      // armored glass casing: base + under-shade + top-light + crisp violet rim
      g.fillStyle(0x1c1430, 0.98).fillRoundedRect(2, 2, 146, 124, 26);
      g.fillStyle(0x120c22, 0.5).fillRoundedRect(2, 78, 146, 48, { tl: 0, tr: 0, bl: 26, br: 26 }); // under-shade
      g.fillStyle(0x2c2050, 0.4).fillRoundedRect(6, 6, 138, 34, { tl: 24, tr: 24, bl: 0, br: 0 }); // top-light
      // glow seams: layered violet/cyan haloed edge (glowShape recipe)
      glowShape(g, { color: 0x8f7bff, coreWidth: 3, coreA: 0.9 },
        (gg, inf) => gg.strokeRoundedRect(2 - inf, 2 - inf, 146 + inf * 2, 124 + inf * 2, 26 + inf));
      g.lineStyle(1.5, 0x35f0ff, 0.4).strokeRoundedRect(8, 8, 134, 112, 20); // inner cyan glow seam
      // rivet studs on the casing
      g.fillStyle(0x5a4a9a);
      [[16, 16], [134, 16], [16, 112], [134, 112]].forEach(([x, y]) => g.fillCircle(x, y, 3.4));
      // vents on the casing sides (the "this thing runs HOT" read)
      g.fillStyle(0x0c0818, 0.9);
      for (let i = 0; i < 3; i++) { g.fillRect(10, 48 + i * 12, 14, 5); g.fillRect(126, 48 + i * 12, 14, 5); }
      // the glassy sclera with a soft inner bloom
      g.fillStyle(0x1a1020, 1).fillCircle(75, 64, 50); // socket
      g.fillStyle(0xf6f0ff, 1).fillCircle(75, 64, 44); // sclera
      g.fillStyle(0xffffff, 0.35).fillEllipse(60, 46, 26, 12); // glass top glare
      // mood ring (gloat magenta) with a haloed glow
      ringGlow(g, { x: 75, y: 64, r: 50, color: 0xff4dd2, width: 3 });
      // faint cooling cables running off the casing bottom
      g.lineStyle(3, 0x39415e, 0.9);
      g.lineBetween(50, 126, 44, 118); g.lineBetween(100, 126, 106, 118);
    });
    // the iris (live magenta-red / powered-down grey) — tracked in updateHeart
    const irisTex = (dead) => (g) => {
      // live: a deep-magenta bloom — deep rim -> bright magenta -> hot inner glow ->
      // dark pupil -> catchlight. dead: flat grey, light off.
      g.fillStyle(dead ? 0x7d8fb8 : 0x9c1670, 1).fillCircle(16, 16, 15); // deep magenta / grey
      if (!dead) {
        g.fillStyle(0xff4dd2, 0.9).fillCircle(16, 16, 11); // magenta bloom ring
        g.fillStyle(0xff8fe0, 0.6).fillCircle(16, 16, 8);  // hot inner glow
      }
      g.fillStyle(dead ? 0x2a3350 : 0x120306, 1).fillCircle(16, 16, 7); // pupil
      if (!dead) g.fillStyle(0xffffff, 0.9).fillCircle(11, 10, 3.4); // catchlight
    };
    make("kobi_iris", 32, 32, irisTex(false));
    make("kobi_iris_dead", 32, 32, irisTex(true));
    // the eyelid: a housing-toned cap scaled down over the sclera (squint/shut)
    make("kobi_lid", 104, 92, (g) => {
      g.fillStyle(0x241a3e, 0.98).fillRoundedRect(0, 0, 104, 92, { tl: 48, tr: 48, bl: 8, br: 8 });
      g.fillStyle(0x352a56, 0.5).fillRoundedRect(6, 4, 92, 24, { tl: 44, tr: 44, bl: 0, br: 0 }); // top-light dome
      g.lineStyle(4, 0x8f7bff, 0.16).strokeRoundedRect(1, 1, 102, 90, { tl: 47, tr: 47, bl: 8, br: 8 }); // glow seam
      g.lineStyle(2.5, 0x8f7bff, 0.8).strokeRoundedRect(1, 1, 102, 90, { tl: 47, tr: 47, bl: 8, br: 8 });
      // lashes-as-bolts along the lid edge
      g.fillStyle(0x5a4a9a);
      for (let x = 16; x < 100; x += 18) g.fillRect(x, 84, 5, 6);
    });
    // cooling-core station: armored vent hatch (blown off on expose)
    make("heart_vent", 62, 56, (g) => {
      g.fillStyle(0x2a2058, 0.98).fillRoundedRect(1, 1, 60, 54, 8);
      g.lineStyle(2.5, 0x8f7bff, 0.95).strokeRoundedRect(1, 1, 60, 54, 8);
      g.fillStyle(0x8f7bff, 0.35).fillRect(3, 3, 56, 3); // top-light glow seam
      g.fillStyle(0x0c0818, 0.9);
      for (let i = 0; i < 4; i++) g.fillRect(9, 9 + i * 11, 44, 5); // louver slats
      // KOBI-Labs pilot dot with a magenta halo
      g.fillStyle(0xff4dd2, 0.2).fillCircle(31, 50, 6);
      g.fillStyle(0xff4dd2, 0.95).fillCircle(31, 50, 2.6);
      g.fillStyle(0xffcdf0, 0.9).fillCircle(30.2, 49.2, 0.9);
      g.fillStyle(0x5a4a9a);
      [[7, 7], [55, 7], [7, 49], [55, 49]].forEach(([x, y]) => g.fillCircle(x, y, 2.6));
    });
    // the cooling core itself: a warm heart-plug on a cable (live / unplugged)
    const coreTex = (dead) => (g) => {
      // the socket cradle
      g.fillStyle(0x1c2742).fillRoundedRect(6, 34, 40, 14, 4);
      g.lineStyle(2, dead ? 0x39415e : 0x8f7bff).strokeRoundedRect(6, 34, 40, 14, 4);
      if (dead) {
        // unplugged: the empty cradle + the cord flopped out, light off
        g.lineStyle(3, 0x39415e, 0.95);
        g.lineBetween(26, 36, 40, 22); g.lineBetween(40, 22, 48, 26);
        g.fillStyle(0x39415e).fillCircle(49, 27, 4);
      } else {
        // live: a rounded amber "tantrum coil" heart-plug with a layered amber bloom
        g.fillStyle(0xffd24d, 0.14).fillCircle(26, 20, 22);
        g.fillStyle(0xffd24d, 0.26).fillCircle(26, 20, 18);
        g.fillStyle(0xffb347, 1).fillRoundedRect(14, 8, 24, 28, 10);
        g.fillStyle(0x9a6a1e, 0.4).fillRoundedRect(14, 24, 24, 12, { tl: 0, tr: 0, bl: 10, br: 10 }); // under-shade
        g.lineStyle(2, 0xffe0a8, 0.95).strokeRoundedRect(14, 8, 24, 28, 10);
        g.fillStyle(0xfff6d8, 0.9).fillCircle(22, 16, 3.2); // hot specular
        g.lineStyle(2, 0xff5566, 0.9);
        g.lineBetween(19, 26, 26, 20); g.lineBetween(26, 20, 33, 26); // the "heartbeat" tick
      }
    };
    make("heart_core", 52, 50, coreTex(false));
    make("heart_core_dead", 52, 50, coreTex(true));
    // defense turbine: base column + guard cage
    make("turbine", 34, 76, (g) => {
      g.fillStyle(0x1c2742).fillRoundedRect(4, 62, 26, 12, 3); // foot
      g.fillStyle(0x2a3350).fillRect(13, 6, 8, 60);            // pole
      g.fillStyle(0x44548c, 0.4).fillRect(13, 6, 2.5, 60);    // pole top-light edge
      g.lineStyle(1.5, 0x44548c).strokeRect(13, 6, 8, 60);
      g.fillStyle(0xff5566, 0.25).fillCircle(17, 68, 6);      // pilot lamp halo
      g.fillStyle(0xff5566, 0.95).fillCircle(17, 68, 2.6);    // live pilot lamp
      g.fillStyle(0xffd0d0, 0.9).fillCircle(16.3, 67.3, 0.9);
      g.lineStyle(2, 0x39415e, 0.9);
      g.strokeCircle(17, 8, 6); // rotor hub seat
    });
    // the rotor: three fan blades (live hot-tipped / dead grey)
    const rotorTex = (dead) => (g) => {
      const c = 30;
      g.fillStyle(dead ? 0x2a3350 : 0x39415e, 1);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const bx = c + Math.cos(a) * 22, by = c + Math.sin(a) * 22;
        const px2 = c + Math.cos(a + 0.5) * 10, py2 = c + Math.sin(a + 0.5) * 10;
        const px3 = c + Math.cos(a - 0.5) * 10, py3 = c + Math.sin(a - 0.5) * 10;
        g.fillTriangle(bx, by, px2, py2, px3, py3);
        if (!dead) {
          g.fillStyle(0xff5566, 0.28).fillCircle(bx, by, 6); // hot-tip bloom
          g.fillStyle(0xff5566, 0.95).fillCircle(bx, by, 3.4);
          g.fillStyle(0xffe0d0, 0.9).fillCircle(bx, by, 1.4); // white-hot core
          g.fillStyle(0x39415e, 1);
        }
      }
      if (!dead) g.fillStyle(0xff5566, 0.2).fillCircle(c, c, 10); // hub glow
      g.fillStyle(dead ? 0x39415e : 0x6b78a8).fillCircle(c, c, 7);
      g.fillStyle(dead ? 0x1c2742 : 0xff5566).fillCircle(c, c, 3);
    };
    make("turbine_rotor", 60, 60, rotorTex(false));
    make("turbine_rotor_dead", 60, 60, rotorTex(true));
    // Bolt's cage (shut / popped open) + Bolt himself (the A11/title puppy
    // silhouette vocabulary, side view, facing left toward the buddies)
    const cageTex = (open) => (g) => {
      g.fillStyle(0x1c2742).fillRect(0, 48, 56, 8); // base
      if (!open) {
        g.lineStyle(3, 0x8892b8);
        for (let x = 6; x <= 50; x += 11) g.lineBetween(x, 6, x, 48);
        g.lineStyle(4, 0x6b78a8).strokeRoundedRect(2, 2, 52, 48, 8);
        g.fillStyle(0xffb347, 0.22).fillCircle(28, 10, 6); // tail-light halo
        g.fillStyle(0xffb347, 0.95).fillCircle(28, 10, 2.6); // Bolt's tail-light through the bars
      } else {
        // door flung open: the frame + a swung-aside gate
        g.lineStyle(4, 0x6b78a8).strokeRoundedRect(2, 2, 52, 48, 8);
        g.lineStyle(3, 0x8892b8);
        g.lineBetween(52, 8, 66, 20); g.lineBetween(52, 26, 66, 34); // the open gate leaf
        g.fillStyle(0x59ff9c, 0.24).fillCircle(28, 10, 6); // lock-lamp halo
        g.fillStyle(0x59ff9c, 0.95).fillCircle(28, 10, 2.6); // lock lamp gone green
      }
    };
    make("bolt_cage", 68, 56, cageTex(false));
    make("bolt_cage_open", 68, 56, cageTex(true));
    make("bolt_pup", 50, 36, (g) => {
      const body = 0xd9dee8, dark = 0x8b93a8, collar = 0xffb347, belly = 0xf3ede0;
      // stub legs
      g.fillStyle(dark);
      [8, 16, 30, 38].forEach((lx) => g.fillRoundedRect(lx, 26, 6, 8, 2));
      // body + haunch + head + snout (faces LEFT, toward the buddies)
      g.fillStyle(body).fillRoundedRect(8, 10, 36, 17, 8);
      g.fillStyle(body).fillCircle(40, 18, 9);
      g.fillStyle(body).fillCircle(12, 9, 10);
      g.fillStyle(body).fillRoundedRect(0, 8, 10, 9, 4);
      // smooth shading: cool top-light band + warm cream belly underside
      g.fillStyle(0xffffff, 0.32).fillRoundedRect(10, 11, 32, 5, 4); // top-light
      g.fillStyle(belly, 0.85).fillEllipse(24, 24, 30, 8);           // warm belly
      g.fillStyle(0xc7ccd8, 0.5).fillEllipse(40, 23, 12, 5);         // haunch under-shade
      g.fillStyle(dark).fillCircle(1.6, 12, 2.2); // nose
      // gold collar with a soft glow + tail-tip light + ear + eye
      g.fillStyle(collar, 0.28).fillRect(15, 9, 10, 19); // collar glow
      g.fillStyle(collar).fillRect(18, 10, 4, 17);
      g.fillStyle(0xffe0a8, 0.9).fillRect(18.5, 12, 3, 3); // collar tag glint
      g.fillStyle(dark).fillTriangle(14, 0, 20, 2, 16, 10); // ear
      g.fillStyle(0x243046).fillCircle(9, 8, 2.6);
      g.fillStyle(0xffffff, 0.95).fillCircle(8, 7, 1);
      g.fillStyle(body).fillRoundedRect(44, 6, 5, 14, 2.5); // tail up
      g.fillStyle(collar, 0.3).fillCircle(46.5, 5, 5.5); // tail-light halo
      g.fillStyle(collar).fillCircle(46.5, 5, 3); // amber tail-light
    });
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
    if (this.def.dev) {
      // W3W4 M3: the dev sandbox NEVER touches the save or the ux record —
      // it is not a real chamber (only reachable behind ?devlevel=w3).
    } else if (!this.def.tutorial) {
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
    if (!this.def.tutorial && !this.def.dev) rec = saveRecord(this.def.id, timeMs, deaths);
    const stats = {
      timeMs, timeStr: fmtTime(timeMs), deaths, coresCount,
      grade: this.gradeLine(deaths, rec),
      beatTime: !!(rec && rec.beatTime && rec.prevTime !== null),
      beatDeaths: !!(rec && rec.beatDeaths && rec.prevDeaths !== null),
    };

    playJingle("jingle_clear"); // stops the level track, plays the clear cadence
    this.physics.pause();
    // GFX3 G1: one warm pop the instant the level clears, before the overlay
    // settles (500ms below). Softened by the FLASH option (skipped when 0).
    const fclr = uxFlashScale();
    if (fclr > 0) this.cameras.main.flash(220, 255 * fclr, 244 * fclr, 214 * fclr);
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
        // W3W4 L43: the campaign finale — the clear overlay's continue routes
        // to the Epilogue scene instead of the hub (dev sandboxes never do).
        finale: !!this.def.finale && !this.def.dev,
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
    // GFX3 G1: camPunch (1 = none) is the impactPunch zoom-punch multiplier —
    // it scales the RENDERED zoom only, leaving camPos.zoom (the world coords the
    // beat kit + audio listener read) untouched, exactly like zoomKick above.
    // GFX3 G5: camCine is the cinematic-push multiplier, eased slowly toward its
    // target (1 = none) here — same rendered-zoom-only contract as camPunch.
    this.camCine += (this._camCineTarget - this.camCine) * Math.min(1, dt * 0.6);
    cam.setZoom((this.camPos.zoom + this.zoomKick) * this.camPunch * this.camCine);
    cam.centerOn(this.camPos.x, this.camPos.y);
    // publish the camera midpoint + on-screen half-extents for proximity SFX
    setListener(this.camPos.x, this.camPos.y, this.scale.width / 2 / this.camPos.zoom, this.scale.height / 2 / this.camPos.zoom);
  }
}
